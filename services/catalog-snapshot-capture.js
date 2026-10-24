'use strict';

// One bounded MVCC view. No pool query is exposed to a capture reader.
const LIMITS = Object.freeze({ ms: 3000, acquireMs: 500, bytes: 2 * 1024 * 1024, rows: 4096, queries: 180 });
const TABLES = new Set(['prod_products', 'ten_stores', 'prod_catalog_snapshot_revisions']);
const rawGraph = require('./catalog-passport-raw');
function failure(code) { return Object.assign(new Error(code), { code }); }
async function acquire(db, signal) {
  if (signal?.aborted) throw failure('CAPTURE_ABORTED');
  let expired = false, released = false, timer;
  const release = conn => { if (!released) { released = true; conn.release(); } };
  const pending = db.getConnection();
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(failure('CAPTURE_POOL_BUSY')); }, LIMITS.acquireMs); });
  pending.then(conn => { if (expired || signal?.aborted) release(conn); }, () => {});
  try {
    const conn = await Promise.race([pending, timeout]);
    if (signal?.aborted) { release(conn); throw failure('CAPTURE_ABORTED'); }
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
function writerClocks({ tenantId, storeId = null, catalog = false, storeIds = [] }) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || tenantId > 2147483647
      || (storeId !== null && (!Number.isSafeInteger(storeId) || storeId <= 0 || storeId > 2147483647))
      || typeof catalog !== 'boolean' || !Array.isArray(storeIds) || storeIds.length > 32
      || storeIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
      || (!catalog && storeId === null && !storeIds.length)) throw failure('INVALID_WRITER_SCOPE');
  return [...new Set([...(catalog ? [0] : []), ...(storeId === null ? [] : [storeId]), ...storeIds])].sort((a, b) => a - b);
}
async function bumpClocks(conn, tenantId, clocks) {
  const [changed] = await conn.query({ sql: `UPDATE prod_catalog_snapshot_revisions
    SET revision=revision+1 WHERE tenant_id=? AND scope_store_id IN (?) ORDER BY scope_store_id`, timeout: 1500 }, [tenantId, clocks]);
  if (Number(changed.affectedRows) !== clocks.length) throw failure('WRITER_REVISIONS_NOT_INITIALIZED');
}
async function assertWriterTransaction(conn) {
  if (!conn || typeof conn.beginTransaction !== 'function' || typeof conn.release !== 'function'
      || typeof conn.getConnection === 'function') throw failure('WRITER_TRANSACTION_REQUIRED');
  // mysql2 exposes the protocol SERVER_STATUS_IN_TRANS bit on OK packets.
  // A no-op verifies an actual transaction BEFORE any revision DML; accepting
  // an arbitrary queryable/pool here would silently commit clocks separately.
  const [status] = await conn.query({ sql: 'DO 0', timeout: 1000 });
  if (!Number.isInteger(status.serverStatus) || !(status.serverStatus & 1)) throw failure('WRITER_TRANSACTION_REQUIRED');
}
// For existing conn-owned writers: invoke ONCE immediately after BEGIN, inside
// their existing try/rollback boundary. Never starts/commits a nested Tx.
async function revisionHook(conn, scope) {
  const clocks = writerClocks(scope);
  await assertWriterTransaction(conn);
  await bumpClocks(conn, scope.tenantId, clocks);
}
// Deployment gate only: no clock reads on ordinary read/write paths. The DB
// coverage flag is NOT promoted here (and transfers still require it separately).
function writerEnabled(tenantId) {
  const configured = process.env.CATALOG_EXPORT_CRM_TENANT_ID || '';
  return process.env.CATALOG_EXPORT_WRITER_HOOKS === '1'
    && process.env.CATALOG_EXPORT_WRITERS_READY === '1'
    && process.env.CATALOG_EXPORT_CRM_LIGHT === '1'
    && process.env.CATALOG_EXPORT_LIGHT !== '1'
    && process.env.CATALOG_EXPORT_STRATEGY !== 'mysql'
    && /^[1-9]\d*$/.test(configured) && Number(configured) === Number(tenantId)
    && Number.isSafeInteger(Number(tenantId)) && Number(tenantId) <= 2147483647;
}
// Call only inside an EXISTING BEGIN/try/rollback boundary. Unlike the operator
// revisionHook above, known business Tx sites need neither DO 0 nor a SELECT.
async function businessRevisionHook(conn, scope) {
  if (!writerEnabled(scope.tenantId)) return;
  if (!conn || typeof conn.release !== 'function' || typeof conn.beginTransaction !== 'function'
      || typeof conn.getConnection === 'function') throw failure('WRITER_TRANSACTION_REQUIRED');
  await bumpClocks(conn, Number(scope.tenantId), writerClocks({ ...scope, tenantId: Number(scope.tenantId) }));
}
// For formerly autocommit DML groups, use their original SQL/helpers on ONE
// connection. With rollout OFF the original executor and commit behavior remain.
async function businessMutation(db, scope, work) {
  if (!writerEnabled(scope.tenantId)) return work(db);
  const normalized = { ...scope, tenantId: Number(scope.tenantId) };
  if (typeof db.getConnection === 'function') return versionedMutation(db, { ...normalized, businessWriter: true }, work);
  await businessRevisionHook(db, normalized);
  return work(db);
}
async function initializeBusinessRevisions(conn, scope) {
  if (!writerEnabled(scope.tenantId)) return;
  if (!conn || typeof conn.release !== 'function' || typeof conn.getConnection === 'function') {
    throw failure('WRITER_TRANSACTION_REQUIRED');
  }
  const normalized = { ...scope, tenantId: Number(scope.tenantId), catalog: true };
  await initializeClockRows(conn, normalized.tenantId, writerClocks(normalized));
}
async function initializeClockRows(conn, tenantId, ids) {
  await conn.query({ sql: `INSERT INTO prod_catalog_snapshot_revisions
    (tenant_id,scope_store_id,revision,writer_coverage_version) VALUES ${ids.map(() => '(?,?,0,0)').join(',')}
    ON DUPLICATE KEY UPDATE revision=revision`, timeout: 1500 }, ids.flatMap(id => [tenantId, id]));
}
// Opt-in hook for tenant/store creation, AFTER the tenant INSERT on the same
// connection. FK and clock creation commit/rollback with that creation Tx.
async function initializeRevisionsInTransaction(conn, { tenantId, storeIds = [] }) {
  const ids = writerClocks({ tenantId, catalog: true, storeIds });
  await assertWriterTransaction(conn);
  await initializeClockRows(conn, tenantId, ids); // New coverage stays 0.
}
async function versionedMutation(db, scope, work) {
  const clocks = writerClocks(scope), { tenantId, commitIf = null, afterCommit = null } = scope;
  if (typeof work !== 'function' || (commitIf !== null && typeof commitIf !== 'function')
      || (afterCommit !== null && typeof afterCommit !== 'function')) throw failure('INVALID_WRITER_SCOPE');
  // Business writers retain the existing pool's acquisition policy, not the
  // background capture's 500-ms acquisition cutoff.
  const conn = scope.businessWriter ? await db.getConnection() : await acquire(db);
  let transaction = false, reusable = true, result;
  try {
    await conn.beginTransaction(); transaction = true;
    // UPDATE itself locks the indexed clock rows. No SELECT+UPDATE per clock,
    // no fan-out over products/dependents and no new clocks/coverage claims.
    // Existing writers must move ALL their work into this callback, using ONLY
    // this connection; this is not an adapter for an already-owned transaction.
    await bumpClocks(conn, tenantId, clocks);
    result = await work(conn);
    if (commitIf && !commitIf()) { await conn.rollback(); transaction = false; return result; }
    await conn.commit(); transaction = false;
  } catch (error) {
    if (transaction) {
      try { await conn.rollback(); } catch (_) { reusable = false; }
    }
    throw error;
  } finally { if (reusable) conn.release(); else conn.destroy(); }
  // For image cleanup / deferred hints: never run before commit or while holding
  // a DB connection. A failure here is NOT a rolled-back business transaction.
  if (afterCommit) {
    try { await afterCommit(result); }
    catch (error) {
      const committedError = failure('WRITER_AFTER_COMMIT_FAILED');
      committedError.committed = true; committedError.cause = error;
      throw committedError;
    }
  }
  return result;
}

// Prepared opt-in executors, not registered with any router or live writer.
// Existing multi-step DML can run as one plan without a second implementation
// of its formulas. No import/startup SQL and no coverage promotion here.
const WRITER_TABLES = Object.freeze({
  catalog: Object.freeze([...rawGraph.TABLES.filter(table => !['prod_product_stocks', 'mkt_discounts',
    'mkt_discount_products', 'ten_tenants'].includes(table)), 'ten_tenants',
    'prod_checkout_constructor_block_categories', 'prod_option_overrides', 'prod_option_exclusions']),
  store: Object.freeze(['prod_product_stocks', 'mkt_discounts', 'mkt_discount_products',
    'mkt_discount_usage', 'mkt_discount_promo_codes', 'mkt_discount_customers',
    'prod_stock_documents', 'prod_stock_document_items', 'ten_stores']),
  auxiliary: Object.freeze(['catalog_changes', 'prod_product_passport_snapshots']),
});
function mutationTable(sql) {
  const text = typeof sql === 'string' ? sql : sql?.sql;
  if (typeof text !== 'string' || /;/.test(text)) throw failure('WRITER_SQL_REJECTED');
  const match = text.trim().match(/^(?:INSERT\s+(?:IGNORE\s+)?INTO|UPDATE|DELETE\s+FROM)\s+`?([a-z_][a-z0-9_]*)`?\b/i);
  return { text, table: match?.[1]?.toLowerCase() || null };
}
function createRevisionWriters(db) {
  // Scope/SQL come from an already authorized internal writer, never req.body
  // SQL. This prepares transaction boundaries, not a replacement for RBAC.
  async function transaction(scope, catalog, store, work, afterCommit = null) {
    if (!scope || typeof work !== 'function' || (!catalog && !store)
        || (store && (!Number.isSafeInteger(scope.storeId) || scope.storeId <= 0))) throw failure('INVALID_WRITER_SCOPE');
    let wrote = false;
    return versionedMutation(db, { tenantId: scope.tenantId, catalog,
      storeId: store ? scope.storeId : null, commitIf: () => wrote, afterCommit }, async conn => {
      const invoke = method => async (sql, ...args) => {
        const { text, table } = mutationTable(sql);
        if (table) {
          if (!(catalog && WRITER_TABLES.catalog.includes(table)) && !(store && WRITER_TABLES.store.includes(table))
              && !WRITER_TABLES.auxiliary.includes(table)) {
            throw failure('WRITER_DEPENDENCY_NOT_DECLARED');
          }
          if (table === 'ten_tenants') {
            // The existing broad settings writer also carries credentials. This
            // inactive variant only accepts the DTO's known settings columns.
            const set = text.match(/\bSET\s+(.+?)\s+WHERE\s+id\s*=\s*\?\s*$/is)?.[1];
            if (!set || set.split(',').some(field => !/^\s*(?:timezone|price_rounding_mode|price_rounding_precision)\s*=\s*\?\s*$/i.test(field))) {
              throw failure('WRITER_SETTINGS_PROJECTION_REQUIRED');
            }
          }
        } else if (!/^\s*SELECT\b/i.test(text) || /\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(text)) throw failure('WRITER_SQL_REJECTED');
        const result = await conn[method](sql, ...args);
        if (table && !WRITER_TABLES.auxiliary.includes(table) && Number(result[0]?.affectedRows) > 0) wrote = true;
        return result;
      };
      // No begin/commit/release/getConnection methods: nested helpers must use
      // this transaction, not accidentally end it or escape through the pool.
      return work(Object.freeze({ query: invoke('query'), execute: invoke('execute') }));
    });
  }
  const catalog = (scope, work, afterCommit = null) => transaction(scope, true, false, work, afterCommit);
  const store = (scope, work, afterCommit = null) => transaction(scope, false, true, work, afterCommit);
  return Object.freeze({
    catalog, store,
    catalogAndStore: (scope, work, afterCommit = null) => transaction(scope, true, true, work, afterCommit),
    async plan(scope, steps, afterCommit = null) {
      if (!Array.isArray(steps) || !steps.length || steps.length > 64) throw failure('INVALID_WRITER_PLAN');
      let catalogChange = false, storeChange = false;
      for (const step of steps) {
        const { table } = mutationTable(step?.sql);
        if (!Array.isArray(step?.values) || step.values.length > 2048 || !table) throw failure('INVALID_WRITER_PLAN');
        if (WRITER_TABLES.catalog.includes(table)) catalogChange = true;
        else if (WRITER_TABLES.store.includes(table)) storeChange = true;
        else if (!WRITER_TABLES.auxiliary.includes(table)) throw failure('WRITER_DEPENDENCY_NOT_DECLARED');
      }
      return transaction(scope, catalogChange, storeChange, async conn => {
        const results = [];
        for (const step of steps) results.push(await conn.query(step.sql, step.values));
        return results;
      }, afterCommit);
    },
    // Reuse the actual business helpers, without duplicating their DML/formulas.
    ensureDefaultCategories(scope) {
      return require('../api/helpers').ensureDefaultCategories(db, scope.tenantId, {
        transaction: work => catalog(scope, work),
      });
    },
    setProductCategories(scope, productId, ids) {
      return catalog(scope, conn => require('../api/helpers').setProductCategories(conn, scope.tenantId, productId, ids, true));
    },
    recordDiscountUsage(scope, discountId, orderId, customerId, amount, promoCodeId = null) {
      return store(scope, async conn => {
        const [rows] = await conn.query('SELECT store_id FROM mkt_discounts WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE', [scope.tenantId, discountId]);
        if (rows.length !== 1 || Number(rows[0].store_id) !== scope.storeId) throw failure('INVALID_WRITER_SCOPE');
        return require('../api/helpers/discounts').recordDiscountUsage(conn,
          scope.tenantId, discountId, orderId, customerId, amount, promoCodeId, { storeId: scope.storeId, revisionCovered: true });
      });
    },
    deductStock(scope, options) {
      return store(scope, conn => require('../api/helpers/orderStock').applyStockDeductionForOrderItems({
        ...options, db: conn, tenantId: scope.tenantId, storeId: scope.storeId, revisionCovered: true,
      }));
    },
  });
}
// Explicit operator bootstrap only, one bounded existing-tenant page per call.
// Duplicate rows preserve every existing revision/coverage value. Never invoked
// at startup or from a normal CRM read; migration/permission remain prerequisites.
async function bootstrapRevisions(db, { tenantId, after = 0 }) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || tenantId > 2147483647
      || !Number.isSafeInteger(after) || after < 0 || after > 2147483647) throw failure('INVALID_WRITER_SCOPE');
  const conn = await acquire(db);
  let transaction = false, reusable = true;
  try {
    await conn.beginTransaction(); transaction = true;
    const [stores] = await conn.query({ sql: 'SELECT id FROM ten_stores WHERE tenant_id=? AND id>? ORDER BY id LIMIT 25', timeout: 1500 }, [tenantId, after]);
    const ids = [0, ...stores.map(row => Number(row.id))];
    if (ids.some(id => !Number.isSafeInteger(id) || id < 0 || id > 2147483647)) throw failure('INVALID_WRITER_SCOPE');
    await initializeClockRows(conn, tenantId, ids);
    await conn.commit(); transaction = false;
    return { after: ids.at(-1) || after, hasMore: stores.length === 25, initializedCoverage: 0, coveragePromoted: false };
  } catch (error) {
    if (transaction) { try { await conn.rollback(); } catch (_) { reusable = false; } }
    throw error;
  } finally { if (reusable) conn.release(); else conn.destroy(); }
}
async function productRaw(db, scope, productId, signal) {
  return capture(db, { ...scope, signal, mode: 'passport' }, view => rawGraph.load(view, scope, productId));
}
module.exports = { capture, membership, productRaw, revisionHook, initializeRevisionsInTransaction,
  writerEnabled, businessRevisionHook, businessMutation, initializeBusinessRevisions,
  versionedMutation, createRevisionWriters, bootstrapRevisions, WRITER_TABLES, acquire, LIMITS, failure };
