'use strict';

// One bounded MVCC view. No pool query is exposed to a capture reader.
const LIMITS = Object.freeze({ ms: 3000, acquireMs: 500, bytes: 2 * 1024 * 1024, rows: 4096, queries: 180 });
const TABLES = new Set(['prod_products', 'ten_stores', 'prod_catalog_snapshot_revisions']);
const rawGraph = require('./catalog-passport-raw');
function failure(code) { return Object.assign(new Error(code), { code }); }
async function acquire(db, signal) {
  if (signal?.aborted) throw failure('CAPTURE_ABORTED');
  let expired = false, timer;
  const pending = db.getConnection();
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(failure('CAPTURE_POOL_BUSY')); }, LIMITS.acquireMs); });
  pending.then(conn => { if (expired || signal?.aborted) conn.release(); }, () => {});
  try {
    const conn = await Promise.race([pending, timeout]);
    if (signal?.aborted) throw failure('CAPTURE_ABORTED');
    return conn;
  } finally { clearTimeout(timer); }
}
async function capture(db, { tenantId, storeId, signal, mode = 'membership' }, read) {
  const tables = mode === 'passport' ? new Set([...TABLES, ...rawGraph.TABLES]) : TABLES;
  const conn = await acquire(db, signal);
  const started = performance.now();
  let transaction = false, destroyed = false, locked = false, bytes = 0, rows = 0, queries = 0;
  const destroy = () => { if (!destroyed) { destroyed = true; conn.destroy(); } };
  const check = () => {
    if (signal?.aborted || destroyed) throw failure('CAPTURE_ABORTED');
    if (performance.now() - started >= LIMITS.ms) throw failure('NEEDS_PARTITIONING');
  };
  const query = async (sql, params = []) => {
    check();
    if (++queries > LIMITS.queries || !/^SELECT\b/i.test(sql) || /;|FOR\s+(UPDATE|SHARE)|INTO\s+(OUTFILE|DUMPFILE)/i.test(sql)
        || !/\bLIMIT\s+[0-9]+\s*$/i.test(sql)) throw failure('CAPTURE_QUERY_REJECTED');
    const referenced = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map(match => match[1]);
    if (!referenced.length || referenced.some(table => !tables.has(table))) throw failure('CAPTURE_QUERY_REJECTED');
    const [result] = await conn.query({ sql, timeout: Math.max(1, Math.floor(LIMITS.ms - (performance.now() - started))) }, params);
    check();
    rows += result.length;
    bytes += Buffer.byteLength(JSON.stringify(result));
    if (rows > LIMITS.rows || bytes > LIMITS.bytes) throw failure('NEEDS_PARTITIONING');
    return result;
  };
  signal?.addEventListener('abort', destroy, { once: true });
  const deadline = setTimeout(destroy, LIMITS.ms);
  try {
    // A DB advisory lock also excludes capture in another Node worker/process.
    const [[lock]] = await conn.query({ sql: "SELECT GET_LOCK('catalog-snapshot-capture:v1',0) AS acquired", timeout: 500 });
    if (Number(lock.acquired) !== 1) throw failure('CAPTURE_BUSY');
    locked = true; check();
    const [engines] = await conn.query({ sql: `SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?) LIMIT 64`, timeout: 500 }, [[...tables]]);
    if (engines.length !== tables.size || engines.some(row => row.ENGINE !== 'InnoDB')) throw failure('CAPTURE_ENGINE_UNSUPPORTED');
    const columns = new Map();
    if (mode === 'passport') {
      const [metadata] = await conn.query({ sql: `SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,DATA_TYPE,COLUMN_KEY
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)
        ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 2048`, timeout: 500 }, [rawGraph.TABLES]);
      if (metadata.length >= 2048) throw failure('CAPTURE_SCHEMA_UNSUPPORTED');
      for (const column of metadata) { const list = columns.get(column.TABLE_NAME) || []; list.push(column); columns.set(column.TABLE_NAME, list); }
    }
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const valuationAt = Date.now();
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'); transaction = true;
    const store = await query('SELECT id FROM ten_stores WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1', [tenantId, storeId]);
    if (!store.length) throw failure('STORE_NOT_FOUND');
    const revisions = await query(`SELECT scope_store_id,CAST(revision AS CHAR) AS revision,writer_coverage_version
      FROM prod_catalog_snapshot_revisions WHERE tenant_id=? AND scope_store_id IN (0,?) ORDER BY scope_store_id LIMIT 2`, [tenantId, storeId]);
    if (revisions.length !== 2) throw failure('WRITER_REVISIONS_NOT_INITIALIZED');
    const epochs = { catalog: revisions[0].revision, stock: revisions[1].revision,
      coverage: Math.min(...revisions.map(row => Number(row.writer_coverage_version))) };
    const value = await read(Object.freeze({ query, check, epochs, columns }));
    check(); await conn.commit(); transaction = false;
    return { value, epochs, valuationAt, metrics: { ms: performance.now() - started, rows, bytes, queries } };
  } catch (error) {
    const budgetExpired = performance.now() - started >= LIMITS.ms
      || ['ER_QUERY_TIMEOUT', 'PROTOCOL_SEQUENCE_TIMEOUT'].includes(error.code);
    if (transaction && !destroyed) await conn.rollback().catch(destroy);
    if (signal?.aborted) throw failure('CAPTURE_ABORTED');
    if (budgetExpired) throw failure('NEEDS_PARTITIONING');
    throw error;
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', destroy);
    if (!destroyed && locked) {
      try { await conn.query({ sql: "SELECT RELEASE_LOCK('catalog-snapshot-capture:v1')", timeout: 500 }); }
      catch (_) { destroy(); }
    }
    if (!destroyed) conn.release();
  }
}

async function membership(db, scope, signal) {
  return capture(db, { ...scope, signal }, async view => {
    const ids = []; let after = 0;
    while (true) {
      const page = await view.query(`SELECT /*+ MAX_EXECUTION_TIME(2000) */ id FROM prod_products
        WHERE tenant_id=? AND id>? ORDER BY id LIMIT 25`, [scope.tenantId, after]);
      if (!page.length) break;
      for (const row of page) {
        const id = Number(row.id);
        if (!Number.isSafeInteger(id) || id <= after) throw failure('CAPTURE_ID_RANGE');
        after = id; ids.push(id);
      }
      view.check();
    }
    return { projection: 'catalog-membership-v1', ids };
  });
}

// Prepared writer boundary, deliberately NOT wired to any live business route.
// Locks are acquired BEFORE work; revision and business changes commit together.
async function versionedMutation(db, { tenantId, storeId = null, catalog = false, storeIds = [] }, work) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0
      || (storeId !== null && (!Number.isSafeInteger(storeId) || storeId <= 0))
      || typeof catalog !== 'boolean' || !Array.isArray(storeIds) || storeIds.length > 32
      || storeIds.some(id => !Number.isSafeInteger(id) || id <= 0)
      || (!catalog && storeId === null && !storeIds.length)
      || typeof work !== 'function') throw failure('INVALID_WRITER_SCOPE');
  const clocks = [...new Set([...(catalog ? [0] : []), ...(storeId === null ? [] : [storeId]), ...storeIds])].sort((a, b) => a - b);
  const conn = await acquire(db);
  let transaction = false, reusable = true;
  try {
    await conn.beginTransaction(); transaction = true;
    // UPDATE itself locks the indexed clock rows. No SELECT+UPDATE per clock,
    // no fan-out over products/dependents and no new clocks/coverage claims.
    // Existing writers must move ALL their work into this callback, using ONLY
    // this connection; this is not an adapter for an already-owned transaction.
    const [changed] = await conn.query({ sql: `UPDATE prod_catalog_snapshot_revisions
      SET revision=revision+1 WHERE tenant_id=? AND scope_store_id IN (?) ORDER BY scope_store_id`, timeout: 1500 }, [tenantId, clocks]);
    if (Number(changed.affectedRows) !== clocks.length) throw failure('WRITER_REVISIONS_NOT_INITIALIZED');
    const result = await work(conn);
    await conn.commit(); transaction = false; return result;
  } catch (error) {
    if (transaction) {
      try { await conn.rollback(); } catch (_) { reusable = false; }
    }
    throw error;
  } finally { if (reusable) conn.release(); else conn.destroy(); }
}
async function productRaw(db, scope, productId, signal) {
  return capture(db, { ...scope, signal, mode: 'passport' }, view => rawGraph.load(view, scope, productId));
}
module.exports = { capture, membership, productRaw, versionedMutation, acquire, LIMITS, failure };
