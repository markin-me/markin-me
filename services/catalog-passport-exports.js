'use strict';

const crypto = require('crypto');
const capture = require('./catalog-snapshot-capture');
const queue = require('./catalog-export-queue');
const { failure } = capture;
const CHUNK_BYTES = 24 * 1024, MAX_BYTES = 4 * 1024 * 1024, MAX_CHUNKS = 256;
const TTL = 2 * 60 * 60 * 1000, LEASE = 5 * 60 * 1000;
const MAX_PRODUCT_GENERATIONS = 3;
const TABLE = 'prod_product_passport_exports', CHUNKS = 'prod_product_passport_export_chunks';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
const idBytes = id => {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw failure('INVALID_SNAPSHOT_ID');
  return Buffer.from(id, 'hex');
};
function policy() {
  const on = name => process.env['CATALOG_EXPORT_' + name] === '1';
  const mysql = process.env.CATALOG_EXPORT_STRATEGY === 'mysql';
  const rawTenant = process.env.CATALOG_EXPORT_CRM_TENANT_ID || '';
  const tenantId = /^[1-9][0-9]*$/.test(rawTenant) && Number.isSafeInteger(Number(rawTenant))
    && Number(rawTenant) <= 2147483647 ? Number(rawTenant) : null;
  // The legacy LIGHT flag also changes PUBLIC snapshot startup behaviour.
  // A CRM canary must not arm that flag or spill over to other tenants.
  const crm = !mysql && !on('LIGHT') && on('CRM_LIGHT') && tenantId !== null
    && capture.writerEnabled(tenantId);
  return Object.freeze({ strategy: mysql ? 'mysql' : 'hybrid-transfer-v1',
    capture: mysql && on('CAPTURE'), publishing: mysql && on('PUBLISHING'),
    clientDownload: mysql && on('CLIENT_DOWNLOAD'), activation: false,
    light: { enabled: crm, tenantId: crm ? tenantId : null,
      clientDownload: crm && on('LIGHT_DOWNLOAD'),
      activation: crm && on('LIGHT_DOWNLOAD') && on('LIGHT_ACTIVATION') },
    requestedActivation: on('ACTIVATION'), passportReady: false,
    blocked: ['RAW_GRAPH_PARITY_UNVERIFIED', 'PURE_PASSPORT_DERIVATION_REQUIRED',
      'WRITER_COVERAGE_INCOMPLETE', 'ATOMIC_PASSPORT_ACTIVATION_REQUIRED'],
    schemaVersion: 1, chunkBytes: CHUNK_BYTES, maxBytes: MAX_BYTES, maxChunks: MAX_CHUNKS });
}

// Bounded, process-local transfer leases. No MySQL raw/output cache, startup jobs
// or per-tenant workers. Losing a process loses only this resumable optimisation.
const transfers = new Map();
const LIGHT = Object.freeze({ sessions: 2, ttlMs: 180000, sourceBytes: 512 * 1024,
  dtoBytes: 256 * 1024, chunkBytes: 24576, stages: 5 });
const DTO_FIELDS = Object.freeze(['product', 'units', 'unitConversions', 'productUnitLinks', 'stock',
  'availability', 'ingredients', 'nestedIngredients', 'variants', 'options', 'optionAssignments',
  'defaultConfig', 'comboRefs', 'editor', 'benefits', 'texts', 'visibility', 'nutrition', 'revision']);
function fullDto(value, productId, tenantId) {
  return value && Object.keys(value).length === DTO_FIELDS.length
    && DTO_FIELDS.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && value.product?.id === productId && Number(value.product.tenant_id) === tenantId && value.editor?.schema_version === 'product-editor-v1'
    && value.revision?.data_version === 'full-product-passport-v1';
}
function assertTransferDto(value) {
  let nodes = 0;
  function visit(item, depth = 0) {
    if (++nodes > 16384 || depth > 32) throw failure('EXPORT_DTO_BUDGET');
    if (!item || typeof item !== 'object' || item instanceof Date) return;
    for (const key in item) if (Object.prototype.hasOwnProperty.call(item, key)) {
      // Fail closed if future schema changes introduce credentials into a
      // legacy SELECT *. Never strip a field and call the modified DTO equal.
      if (/password|secret|token|credential|api_key/i.test(key)) throw failure('EXPORT_PRIVATE_FIELD');
      visit(item[key], depth + 1);
    }
  }
  visit(value);
}
async function revision(db, scope, signal) {
  check(signal);
  if (!queue.allowsPreparation()) throw failure('EXPORT_QUEUE_BUSY');
  const [rows] = await db.query({ sql: `SELECT scope_store_id,CAST(revision AS CHAR) AS revision,writer_coverage_version
    FROM prod_catalog_snapshot_revisions WHERE tenant_id=? AND scope_store_id IN (0,?) ORDER BY scope_store_id LIMIT 2`, timeout: 1000 },
  [scope.tenantId, scope.storeId]);
  check(signal);
  if (!queue.allowsPreparation()) throw failure('EXPORT_QUEUE_BUSY');
  if (rows.length !== 2 || rows.some(row => !Number.isSafeInteger(Number(row.writer_coverage_version))
      || Number(row.writer_coverage_version) < 1)) throw failure('WRITER_COVERAGE_INCOMPLETE');
  return { catalog: rows[0].revision, store: rows[1].revision, coverage: Math.min(...rows.map(row => Number(row.writer_coverage_version))) };
}
function forgetTransfer(id) {
  const value = transfers.get(id);
  transfers.delete(id);
  // No interrupt of an executing generator; its guarded caller owns cleanup.
  if (value && !value.busy) void value.iterator?.return().catch(() => {});
}
function createTransfers({ db, prepareAdminProductPassport }) {
  const admit = (scope, resource, signal, work) => queue.run({ tenantId: scope.tenantId, storeId: scope.storeId,
    scopeHash: scope.hash, resource: 'light:' + resource, signal }, work);
  function access(scope, id) {
    const rollout = policy().light;
    if (!rollout.enabled || scope.tenantId !== rollout.tenantId) throw failure('EXPORT_LIGHT_DISABLED');
    if (!scope.canCaptureCost) throw failure('EXPORT_RAW_COST_PERMISSION_REQUIRED');
    idBytes(id);
    const transfer = transfers.get(id);
    if (!transfer || transfer.scope.hash !== scope.hash || transfer.scope.tenantId !== scope.tenantId
        || transfer.scope.storeId !== scope.storeId) throw failure('EXPORT_NOT_FOUND');
    if (transfer.expiresAt <= Date.now()) { forgetTransfer(id); throw failure('EXPORT_EXPIRED'); }
    return transfer;
  }
  const progress = transfer => ({ snapshotId: transfer.id, productId: transfer.productId, state: transfer.manifest ? 'sealed' : 'building',
    step: transfer.step, expiresAt: transfer.expiresAt, manifest: transfer.manifest || null,
    manifestHash: transfer.manifestHash || null, recordCount: 1 });
  function delivery(transfer, result, after = 0) {
    if (!transfer.manifest || !policy().light.clientDownload) return result;
    // Reuse already sealed bytes, never another source read/build. Reserve room
    // below the route's 64 KiB ceiling for metrics and the response envelope.
    const batch = [];
    let size = encode({ ok: true, ...result, chunks: [], nextChunk: transfer.chunks.length }).length;
    for (const piece of transfer.chunks.slice(after)) {
      const row = { snapshotId: transfer.id, chunk: piece.chunk, bytes: piece.bytes,
        sha256: piece.sha256, payload: '', recordCount: 1 };
      const bytes = encode(row).length + 4 * Math.ceil(piece.bytes / 3) + (batch.length ? 1 : 0);
      if (size + bytes > 60 * 1024) break;
      row.payload = piece.payload.toString('base64');
      batch.push(row); size += bytes;
    }
    return { ...result, chunks: batch, nextChunk: after + batch.length };
  }
  async function targets(scope, after, signal) {
    const rollout = policy().light;
    if (!rollout.enabled || scope.tenantId !== rollout.tenantId) throw failure('EXPORT_LIGHT_DISABLED');
    if (!scope.canCaptureCost) throw failure('EXPORT_RAW_COST_PERMISSION_REQUIRED');
    if (!Number.isSafeInteger(after) || after < 0) throw failure('INVALID_EXPORT_CURSOR');
    const before = await revision(db, scope, signal);
    const [rows] = await db.query({ sql: 'SELECT id FROM prod_products WHERE tenant_id=? AND id>? ORDER BY id LIMIT 25', timeout: 1500 }, [scope.tenantId, after]);
    const current = await revision(db, scope, signal);
    if (JSON.stringify(before) !== JSON.stringify(current)) throw failure('EXPORT_REVISION_CHANGED');
    const ids = rows.map(row => Number(row.id));
    if (ids.some((id, index) => !Number.isSafeInteger(id) || id <= (index ? ids[index - 1] : after))) throw failure('INVALID_EXPORT_CURSOR');
    return { ids, after: ids.at(-1) ?? after, hasMore: ids.length === 25,
      recordCount: ids.length, catalogComplete: false, snapshotConsistent: false };
  }
  async function start(scope, productId, signal, firstStage = false) {
    const rollout = policy().light;
    if (!rollout.enabled || scope.tenantId !== rollout.tenantId) throw failure('EXPORT_LIGHT_DISABLED');
    if (!scope.canCaptureCost) throw failure('EXPORT_RAW_COST_PERMISSION_REQUIRED');
    if (!Number.isSafeInteger(productId) || productId <= 0 || typeof prepareAdminProductPassport !== 'function'
        || typeof db.withPreparationBudget !== 'function') throw failure('INVALID_EXPORT_PRODUCT');
    return admit(scope, 'start', signal, async () => {
      for (const [id, transfer] of transfers) if (transfer.expiresAt <= Date.now() && !transfer.busy) forgetTransfer(id);
      const epochs = await revision(db, scope, signal);
      const existing = [...transfers.values()].find(value => value.scope.hash === scope.hash && value.productId === productId
        && JSON.stringify(value.epochs) === JSON.stringify(epochs));
      if (existing) return delivery(existing, progress(existing));
      if (transfers.size >= LIGHT.sessions) throw failure('EXPORT_QUEUE_BUSY');
      const id = crypto.randomBytes(16).toString('hex'), valuationAt = Date.now();
      const preparationBudget = { canContinue: queue.allowsPreparation };
      const transfer = { id, scope: { ...scope }, productId, epochs, valuationAt, step: 0, busy: false,
        sourceBytes: 0, expiresAt: valuationAt + LIGHT.ttlMs, preparationBudget,
        iterator: prepareAdminProductPassport({ tenantId: scope.tenantId, storeId: scope.storeId, productId, valuationAt, preparationBudget }) };
      check(signal); transfers.set(id, transfer);
      // One bounded stage, not a whole passport. Reuse the revision just read
      // rather than doing start + a second HTTP/auth + another pre-stage read.
      return firstStage ? advanceTransfer(scope, id, 0, signal, epochs) : progress(transfer);
    });
  }
  async function advance(scope, id, expectedStep, signal) {
    access(scope, id);
    return admit(scope, 'advance:' + id, signal, () => advanceTransfer(scope, id, expectedStep, signal));
  }
  async function advanceTransfer(scope, id, expectedStep, signal, knownRevision = null) {
      const transfer = access(scope, id);
      check(signal);
      if (!Number.isSafeInteger(expectedStep) || expectedStep < 0 || expectedStep > transfer.step) throw failure('INVALID_EXPORT_CURSOR');
      if (transfer.manifest || expectedStep < transfer.step) return delivery(transfer, progress(transfer)); // Lost acknowledgement, no replay SQL.
      if (transfer.busy) throw failure('EXPORT_QUEUE_BUSY');
      transfer.busy = true;
      const started = performance.now();
      try {
        const before = knownRevision || await revision(db, scope, signal);
        if (JSON.stringify(before) !== JSON.stringify(transfer.epochs)) throw failure('EXPORT_REVISION_CHANGED');
        const { value: step, metrics } = await db.withPreparationBudget(signal, async () => {
          // Group only the cheap neighbouring legacy stages; details and support
          // remain independent. No repeated reads/formulas across HTTP stages.
          let next;
          do { next = await transfer.iterator.next(); }
          while (!next.done && !['nutrition', 'categories', 'details', 'support'].includes(next.value));
          return next;
        }, transfer.preparationBudget);
        transfer.sourceBytes += metrics.bytes;
        if (transfer.sourceBytes > LIGHT.sourceBytes || transfer.step >= LIGHT.stages) throw failure('EXPORT_BYTE_BUDGET');
        const after = await revision(db, scope, signal);
        if (JSON.stringify(after) !== JSON.stringify(before)) throw failure('EXPORT_REVISION_CHANGED');
        check(signal);
        if (step.done) {
          const dto = step.value?.payload?.data?.[String(transfer.productId)];
          if (!fullDto(dto, transfer.productId, scope.tenantId) || dto.availability?.error) throw failure('EXPORT_INCOMPLETE_DTO');
          assertTransferDto(dto);
          const bytes = encode(dto);
          if (bytes.length > LIGHT.dtoBytes) throw failure('NEEDS_PARTITIONING');
          const pieces = chunks('output', 'passport', bytes, 1);
          const root = { formatVersion: 1, builderVersion: 'legacy-shared-v1', codec: 'legacy-dto-json-v1', snapshotId: id, projection: 'full-product-passport-v1',
            tenantId: scope.tenantId, storeId: scope.storeId, scopeHash: scope.hash, productId: transfer.productId,
            sealed: true, snapshotConsistent: true, passportComplete: true, epochs: before,
            valuationAt: transfer.valuationAt, valuationTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            expiresAt: transfer.expiresAt, requiredFields: DTO_FIELDS,
            bytes: bytes.length, sha256: hash(bytes), chunks: pieces.map(descriptor) };
          transfer.chunks = pieces; transfer.manifest = root; transfer.manifestHash = hash(encode(root));
          transfer.iterator = null;
        }
        transfer.step++;
        return delivery(transfer, { ...progress(transfer), stage: step.done ? 'sealed' : step.value,
          metrics: { ...metrics, ms: performance.now() - started } });
      } catch (error) { transfers.delete(id); throw error; }
      finally { transfer.busy = false; if (!transfers.has(id)) void transfer.iterator?.return().catch(() => {}); }
  }
  async function read(scope, id, chunk, signal) {
    const transfer = access(scope, id); check(signal);
    if (!policy().light.clientDownload || !transfer.manifest) throw failure('EXPORT_NOT_SEALED');
    if (!Number.isSafeInteger(chunk) || chunk < 0 || chunk >= transfer.chunks.length) throw failure('INVALID_CHUNK');
    const piece = transfer.chunks[chunk];
    return { snapshotId: id, chunk, bytes: piece.bytes, sha256: piece.sha256, payload: piece.payload.toString('base64'), recordCount: 1 };
  }
  async function readBatch(scope, id, after, signal) {
    const transfer = access(scope, id); check(signal);
    if (!policy().light.clientDownload || !transfer.manifest) throw failure('EXPORT_NOT_SEALED');
    if (!Number.isSafeInteger(after) || after < 0 || after >= transfer.chunks.length) throw failure('INVALID_CHUNK');
    return delivery(transfer, { snapshotId: id, recordCount: 1 }, after);
  }
  async function validateTransfer(scope, id, signal) {
    const transfer = access(scope, id), epochs = await revision(db, scope, signal);
    return { snapshotId: id, manifestHash: transfer.manifestHash || null, sealed: Boolean(transfer.manifest),
      fresh: JSON.stringify(epochs) === JSON.stringify(transfer.epochs), activationAllowed: policy().light.activation,
      recordCount: 1 };
  }
  return { targets, start, advance, read, readBatch, validate: validateTransfer };
}
function check(signal) { if (signal?.aborted) throw failure('EXPORT_ABORTED'); }
function chunks(kind, part, bytes, recordCount = 0) {
  const result = [];
  for (let offset = 0; offset < bytes.length || !result.length; offset += CHUNK_BYTES) {
    const payload = bytes.subarray(offset, offset + CHUNK_BYTES);
    result.push({ kind, part, chunk: result.length, payload, bytes: payload.length,
      sha256: hash(payload), recordCount });
  }
  return result;
}
function descriptor(row) { return { part: row.part, chunk: row.chunk, bytes: row.bytes, sha256: row.sha256, recordCount: row.recordCount }; }
function verifiedBytes(rows) {
  let total = 0;
  const payloads = rows.map((row, index) => {
    const payload = Buffer.from(row.payload);
    total += payload.length;
    if (Number(row.chunk_no) !== index || total > MAX_BYTES || payload.length > CHUNK_BYTES
        || payload.length !== Number(row.byte_length) || hash(payload) !== Buffer.from(row.content_sha256).toString('hex')) throw failure('EXPORT_HASH_MISMATCH');
    return payload;
  });
  return Buffer.concat(payloads, total);
}
async function transaction(db, signal, work) {
  const conn = await capture.acquire(db, signal);
  const started = performance.now();
  const executor = Object.freeze({ async query(sql, params) {
    check(signal);
    const remaining = 6000 - (performance.now() - started);
    if (remaining <= 0) throw failure('EXPORT_DEADLINE');
    const options = typeof sql === 'string' ? { sql } : sql;
    const value = await conn.query({ ...options, timeout: Math.max(1, Math.min(options.timeout || 1500, 1500, Math.floor(remaining))) }, params);
    check(signal); return value;
  } });
  try {
    check(signal); await conn.query({ sql: 'START TRANSACTION', timeout: 1000 });
    const result = await work(executor);
    check(signal);
    if (performance.now() - started >= 6000) throw failure('EXPORT_DEADLINE');
    // A lost COMMIT acknowledgement is ambiguous: callers rediscover the same
    // durable generation; neither client nor server promises to undo a commit.
    await conn.query({ sql: 'COMMIT', timeout: 500 }); return result;
  } catch (error) { await conn.query({ sql: 'ROLLBACK', timeout: 500 }).catch(() => conn.destroy()); throw error; }
  finally { conn.release(); }
}
async function insertChunks(conn, scope, id, rows, signal) {
  for (let offset = 0; offset < rows.length; offset += 4) {
    check(signal);
    const portion = rows.slice(offset, offset + 4);
    await conn.query({ sql: `INSERT INTO ${CHUNKS}
      (snapshot_id,tenant_id,store_id,kind,part,chunk_no,payload,content_sha256,byte_length,record_count)
      VALUES ${portion.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')}`, timeout: 1500 },
    portion.flatMap(row => [idBytes(id), scope.tenantId, scope.storeId,
      row.kind, row.part, row.chunk, row.payload, Buffer.from(row.sha256, 'hex'), row.bytes, row.recordCount]));
  }
}
function create({ db }) {
  const admitted = (scope, resource, signal, work) => queue.run({ tenantId: scope.tenantId,
    storeId: scope.storeId, scopeHash: scope.hash, resource, signal }, work);
  async function lockBudget(conn, scope) {
    // Export-only mutex row: never lock ten_tenants/business configuration to
    // reserve cache space. Created only by an explicitly enabled export request.
    await conn.query(`INSERT INTO prod_catalog_export_budgets (tenant_id,store_id) VALUES (?,?)
      ON DUPLICATE KEY UPDATE store_id=VALUES(store_id)`, [scope.tenantId, scope.storeId]);
  }
  async function header(scope, id, conn = db, lock = false, signal) {
    check(signal);
    const [rows] = await conn.query({ sql: `SELECT e.*,CAST(catalog_revision AS CHAR) AS catalog_revision,
      CAST(store_revision AS CHAR) AS store_revision FROM ${TABLE} e WHERE snapshot_id=? AND tenant_id=? AND store_id=?
      AND authorization_scope_hash=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, timeout: 1500 },
    [idBytes(id), scope.tenantId, scope.storeId, Buffer.from(scope.hash, 'hex')]);
    check(signal);
    const row = rows[0];
    if (!row) throw failure('EXPORT_NOT_FOUND');
    if (row.state === 'invalid' || Number(row.expires_at_ms) <= Date.now()) throw failure('EXPORT_EXPIRED');
    return row;
  }
  async function persistCaptured(scope, captured, productId, signal) {
    check(signal);
    const id = crypto.randomBytes(16).toString('hex'), now = Date.now();
    const projection = productId === null ? 'catalog-membership-v1' : 'passport-raw-v1';
    if (captured.value.projection !== projection) throw failure('EXPORT_RAW_INVALID');
    const raw = encode({ ...captured.value, formatVersion: 1, tenantId: scope.tenantId,
      storeId: scope.storeId, scopeHash: scope.hash, epochs: captured.epochs, valuationAt: captured.valuationAt });
    const rawChunks = chunks('raw', productId === null ? 'membership' : 'dependency-graph', raw);
    if (raw.length > capture.LIMITS.bytes || rawChunks.length > MAX_CHUNKS) throw failure('NEEDS_PARTITIONING');
    await transaction(db, signal, async conn => {
      await lockBudget(conn, scope);
      const [[budget]] = await conn.query(`SELECT COUNT(*) AS count,COALESCE(SUM(bytes_total),0) AS bytes
        FROM ${TABLE} WHERE tenant_id=? AND store_id=?`, [scope.tenantId, scope.storeId]);
      if (Number(budget.count) >= 128 || Number(budget.bytes) + raw.length > 32 * 1024 * 1024) throw failure('EXPORT_STORAGE_BUDGET');
      if (productId !== null) {
        const [[generations]] = await conn.query(`SELECT COUNT(*) AS n FROM ${TABLE}
          WHERE tenant_id=? AND store_id=? AND product_id=? AND projection=?`,
        [scope.tenantId, scope.storeId, productId, projection]);
        // Includes old auth scopes and invalid generations awaiting bounded GC.
        // Do not evict leased/active generations to make a new request succeed.
        if (Number(generations.n) >= MAX_PRODUCT_GENERATIONS) throw failure('EXPORT_GENERATION_BUDGET');
      }
      await conn.query(`INSERT INTO ${TABLE} (snapshot_id,tenant_id,store_id,product_id,projection,schema_version,
        builder_version,authorization_scope_hash,catalog_revision,store_revision,writer_coverage_version,
        valuation_at_ms,state,created_at_ms,expires_at_ms,lease_until_ms)
        VALUES (?,?,?,?,?,1,?,?,?,?,?,?,'capturing',?,?,?)`,
      [idBytes(id), scope.tenantId, scope.storeId, productId, projection,
        productId === null ? 'membership-v1' : 'raw-graph-v1', Buffer.from(scope.hash, 'hex'), captured.epochs.catalog,
        captured.epochs.stock, captured.epochs.coverage, captured.valuationAt, now, now + TTL, now + LEASE]);
      await insertChunks(conn, scope, id, rawChunks, signal);
      await conn.query(`UPDATE ${TABLE} SET state='captured',raw_root_hash=?,bytes_total=?,chunk_count=? WHERE snapshot_id=?`,
        [Buffer.from(hash(raw), 'hex'), raw.length, rawChunks.length, idBytes(id)]);
    });
    return { snapshotId: id, state: 'captured', expiresAt: now + TTL, projection, metrics: captured.metrics,
      passportComplete: false, ...(productId === null ? {} : { publishingBlocked: 'PURE_DERIVATION_REQUIRED',
        rawGraph: captured.value.graph, fullDtoParityVerified: false }) };
  }
  async function createMembership(scope, signal) {
    if (!policy().capture) throw failure('EXPORT_CAPTURE_DISABLED');
    const existing = await latest(scope, signal);
    if (existing) return existing; // Lost HTTP/IDB acknowledgement must not duplicate capture.
    return persistCaptured(scope, await capture.membership(db, scope, signal), null, signal);
  }
  async function createProductRaw(scope, productId, signal) {
    if (!policy().capture) throw failure('EXPORT_CAPTURE_DISABLED');
    if (!Number.isSafeInteger(productId) || productId <= 0) throw failure('INVALID_EXPORT_PRODUCT');
    const [products] = await db.query({ sql: 'SELECT id FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1', timeout: 1500 },
      [scope.tenantId, productId]);
    check(signal);
    if (!products.length) throw failure('PRODUCT_NOT_FOUND');
    const [rows] = await db.query({ sql: `SELECT HEX(e.snapshot_id) AS id,e.expires_at_ms FROM ${TABLE} e
      JOIN prod_catalog_snapshot_revisions c ON c.tenant_id=e.tenant_id AND c.scope_store_id=0
      JOIN prod_catalog_snapshot_revisions s ON s.tenant_id=e.tenant_id AND s.scope_store_id=e.store_id
      WHERE e.tenant_id=? AND e.store_id=? AND e.authorization_scope_hash=? AND e.product_id=?
      AND e.projection='passport-raw-v1' AND e.state='captured' AND e.expires_at_ms>?
      AND e.catalog_revision=c.revision AND e.store_revision=s.revision
      AND e.writer_coverage_version=LEAST(c.writer_coverage_version,s.writer_coverage_version)
      ORDER BY e.created_at_ms DESC,e.snapshot_id DESC LIMIT 1`, timeout: 1500 },
    [scope.tenantId, scope.storeId, Buffer.from(scope.hash, 'hex'), productId, Date.now()]);
    check(signal);
    if (rows.length) return { snapshotId: rows[0].id.toLowerCase(), state: 'captured', projection: 'passport-raw-v1',
      expiresAt: Number(rows[0].expires_at_ms), passportComplete: false, publishingBlocked: 'PURE_DERIVATION_REQUIRED' };
    return persistCaptured(scope, await capture.productRaw(db, scope, productId, signal), productId, signal);
  }
  async function publishMembership(scope, id, signal) {
    if (!policy().publishing) throw failure('EXPORT_PUBLISHING_DISABLED');
    return transaction(db, signal, async conn => {
      await lockBudget(conn, scope);
      const row = await header(scope, id, conn, true, signal);
      if (row.state === 'sealed') return { state: 'sealed', ...(await manifest(scope, id, conn, signal)) };
      if (!['captured', 'building'].includes(row.state) || row.projection !== 'catalog-membership-v1') throw failure('EXPORT_NOT_BUILDABLE');
      const [rawRows] = await conn.query(`SELECT * FROM ${CHUNKS}
        WHERE snapshot_id=? AND kind='raw' AND part='membership' ORDER BY chunk_no LIMIT 256`, [idBytes(id)]);
      const raw = verifiedBytes(rawRows);
      if (!rawRows.length || hash(raw) !== Buffer.from(row.raw_root_hash).toString('hex')) throw failure('EXPORT_HASH_MISMATCH');
      const input = JSON.parse(raw.toString('utf8'));
      if (input.scopeHash !== scope.hash || input.tenantId !== scope.tenantId || input.storeId !== scope.storeId
          || input.projection !== row.projection || !Array.isArray(input.ids) || input.ids.length > capture.LIMITS.rows
          || input.ids.some((id, i) => !Number.isSafeInteger(id) || id <= 0 || (i && id <= input.ids[i - 1]))) throw failure('EXPORT_RAW_INVALID');
      // This is an actual pure derivation from durable raw, for MEMBERSHIP only.
      // No substitution of this result for full-product-passport-v1 is permitted.
      const output = [];
      for (let offset = 0; offset < input.ids.length || !output.length; offset += 25) {
        const ids = input.ids.slice(offset, offset + 25), payload = encode(ids);
        output.push({ kind: 'output', part: 'membership', chunk: output.length, payload,
          bytes: payload.length, sha256: hash(payload), recordCount: ids.length });
      }
      const estimatedBytes = raw.length + output.reduce((n, c) => n + c.bytes, 0)
        + encode(output.map(descriptor)).length + 1024;
      const [[budget]] = await conn.query(`SELECT COALESCE(SUM(bytes_total),0) AS bytes FROM ${TABLE}
        WHERE tenant_id=? AND store_id=?`, [scope.tenantId, scope.storeId]);
      if (Number(budget.bytes) - Number(row.bytes_total) + estimatedBytes > 32 * 1024 * 1024) throw failure('EXPORT_STORAGE_BUDGET');
      const [stored] = await conn.query(`SELECT chunk_no,byte_length,content_sha256 FROM ${CHUNKS}
        WHERE snapshot_id=? AND kind='output' AND part='membership' ORDER BY chunk_no LIMIT 256`, [idBytes(id)]);
      if (stored.length > output.length || stored.some((c, i) => Number(c.chunk_no) !== i
          || Number(c.byte_length) !== output[i].bytes || Buffer.from(c.content_sha256).toString('hex') !== output[i].sha256)) throw failure('EXPORT_HASH_MISMATCH');
      if (row.state === 'captured') await conn.query(`UPDATE ${TABLE} SET state='building' WHERE snapshot_id=?`, [idBytes(id)]);
      const portion = output.slice(stored.length, stored.length + 4);
      await insertChunks(conn, scope, id, portion, signal);
      const confirmed = stored.length + portion.length;
      if (confirmed < output.length) {
        const bytes = raw.length + output.slice(0, confirmed).reduce((n, c) => n + c.bytes, 0);
        await conn.query(`UPDATE ${TABLE} SET bytes_total=?,chunk_count=? WHERE snapshot_id=?`, [bytes, rawRows.length + confirmed, idBytes(id)]);
        return { state: 'building', snapshotId: id, confirmedChunks: confirmed, requiredChunks: output.length };
      }
      const pages = [];
      for (let i = 0; i < output.length; i += 25) {
        const payload = encode(output.slice(i, i + 25).map(descriptor));
        if (payload.length > CHUNK_BYTES) throw failure('NEEDS_PARTITIONING');
        pages.push({ kind: 'descriptor', part: 'manifest', chunk: pages.length, payload,
          bytes: payload.length, sha256: hash(payload), recordCount: 1 });
      }
      const bytes = raw.length + output.reduce((n, c) => n + c.bytes, 0) + pages.reduce((n, c) => n + c.bytes, 0);
      const count = rawRows.length + output.length + pages.length;
      if (bytes > MAX_BYTES || count > MAX_CHUNKS) throw failure('NEEDS_PARTITIONING');
      const root = { formatVersion: 1, snapshotId: id, projection: row.projection, schemaVersion: 1,
        scopeHash: scope.hash, tenantId: scope.tenantId, storeId: scope.storeId, sealed: true,
        snapshotConsistent: true, passportComplete: false, writerCoverage: input.epochs.coverage,
        rawRootHash: Buffer.from(row.raw_root_hash).toString('hex'),
        epochs: input.epochs, valuationAt: Number(row.valuation_at_ms), expiresAt: Number(row.expires_at_ms),
        requiredParts: ['membership'], records: input.ids.length,
        parts: [{ part: 'membership', codec: 'json-array-pages-v1', bytes: encode(input.ids).length, chunks: output.length, sha256: hash(encode(input.ids)) }],
        descriptorPages: pages.map(c => ({ page: c.chunk, bytes: c.bytes, sha256: c.sha256 })) };
      const body = encode(root), rootHash = hash(body);
      if (body.length > 64 * 1024) throw failure('EXPORT_MANIFEST_LIMIT');
      await insertChunks(conn, scope, id, pages, signal);
      check(signal);
      await conn.query(`UPDATE ${TABLE} SET state='sealed',manifest_json=?,manifest_root_hash=?,bytes_total=?,chunk_count=?
        WHERE snapshot_id=? AND state='building'`, [body.toString('utf8'), Buffer.from(rootHash, 'hex'), bytes, count, idBytes(id)]);
      return { state: 'sealed', manifest: root, manifestHash: rootHash };
    });
  }
  async function manifest(scope, id, conn = db, signal) {
    const row = await header(scope, id, conn, false, signal);
    if (row.state !== 'sealed') throw failure('EXPORT_NOT_SEALED');
    const body = Buffer.from(row.manifest_json);
    if (hash(body) !== Buffer.from(row.manifest_root_hash).toString('hex')) throw failure('EXPORT_HASH_MISMATCH');
    return { manifest: JSON.parse(body.toString('utf8')), manifestHash: hash(body) };
  }
  async function readChunk(scope, id, kind, part, number, signal) {
    if (!['output', 'descriptor'].includes(kind) || !/^[a-z0-9-]{1,48}$/.test(part)
        || !Number.isSafeInteger(number) || number < 0 || number >= MAX_CHUNKS) throw failure('INVALID_CHUNK');
    const parent = await header(scope, id, db, false, signal);
    if (parent.state !== 'sealed') throw failure('EXPORT_NOT_SEALED');
    const [rows] = await db.query({ sql: `SELECT payload,byte_length,content_sha256,record_count FROM ${CHUNKS}
      WHERE snapshot_id=? AND tenant_id=? AND store_id=? AND kind=? AND part=? AND chunk_no=? LIMIT 1`, timeout: 1500 },
    [idBytes(id), scope.tenantId, scope.storeId, kind, part, number]);
    check(signal);
    if (!rows.length) throw failure('CHUNK_NOT_FOUND');
    const row = rows[0], data = Buffer.from(row.payload);
    if (data.length > CHUNK_BYTES || data.length !== Number(row.byte_length)
        || hash(data) !== Buffer.from(row.content_sha256).toString('hex')) throw failure('EXPORT_HASH_MISMATCH');
    await db.query(`UPDATE ${TABLE} SET lease_until_ms=LEAST(expires_at_ms,?) WHERE snapshot_id=? AND state='sealed'`, [Date.now() + LEASE, idBytes(id)]);
    return { snapshotId: id, kind, part, chunk: number, bytes: data.length, sha256: hash(data), recordCount: Number(row.record_count), payload: data.toString('base64') };
  }
  async function latest(scope, signal) {
    check(signal);
    const [rows] = await db.query({ sql: `SELECT HEX(snapshot_id) AS id,state,expires_at_ms FROM ${TABLE}
      WHERE tenant_id=? AND store_id=? AND authorization_scope_hash=? AND projection='catalog-membership-v1'
      AND state IN ('captured','building','sealed') AND expires_at_ms>? ORDER BY created_at_ms DESC,snapshot_id DESC LIMIT 1`, timeout: 1500 },
    [scope.tenantId, scope.storeId, Buffer.from(scope.hash, 'hex'), Date.now()]);
    check(signal);
    return rows.length ? { snapshotId: rows[0].id.toLowerCase(), state: rows[0].state, expiresAt: Number(rows[0].expires_at_ms) } : null;
  }
  async function validate(scope, id, signal) {
    const row = await header(scope, id, db, false, signal);
    const [epochs] = await db.query(`SELECT scope_store_id,CAST(revision AS CHAR) AS revision,writer_coverage_version
      FROM prod_catalog_snapshot_revisions WHERE tenant_id=? AND scope_store_id IN (0,?) ORDER BY scope_store_id LIMIT 2`, [scope.tenantId, scope.storeId]);
    check(signal);
    const covered = epochs.length === 2 && epochs.every(x => Number(x.writer_coverage_version) >= 1)
      && Number(row.writer_coverage_version) >= 1;
    const fresh = covered && String(epochs[0].revision) === String(row.catalog_revision)
      && String(epochs[1].revision) === String(row.store_revision);
    return { snapshotId: id, sealed: row.state === 'sealed', writerCoverage: covered,
      fresh, deletionReconciliationAllowed: fresh && row.state === 'sealed' && row.projection === 'catalog-membership-v1', passportActivationAllowed: false };
  }
  async function gc(scope, signal) {
    // Exactly one generation and at most 25 chunk deletes per explicit idle turn.
    return transaction(db, signal, async conn => {
      await lockBudget(conn, scope);
      const [rows] = await conn.query(`SELECT e.snapshot_id FROM ${TABLE} e WHERE e.tenant_id=? AND e.store_id=?
        AND e.expires_at_ms<=? AND e.lease_until_ms<=?
        AND NOT EXISTS (SELECT 1 FROM ${TABLE} dependent WHERE dependent.base_snapshot_id=e.snapshot_id)
        AND (e.state<>'sealed' OR e.authorization_scope_hash<>? OR EXISTS (SELECT 1 FROM ${TABLE} newer
          WHERE newer.tenant_id=e.tenant_id AND newer.store_id=e.store_id
          AND newer.authorization_scope_hash=e.authorization_scope_hash AND newer.projection=e.projection
          AND (newer.product_id <=> e.product_id) AND newer.state='sealed'
          AND (newer.created_at_ms>e.created_at_ms OR (newer.created_at_ms=e.created_at_ms AND newer.snapshot_id>e.snapshot_id))))
        ORDER BY e.expires_at_ms LIMIT 1 FOR UPDATE`, [scope.tenantId, scope.storeId, Date.now(), Date.now(), Buffer.from(scope.hash, 'hex')]);
      if (!rows.length) return { deleted: 0 };
      const id = rows[0].snapshot_id;
      await conn.query(`UPDATE ${TABLE} SET state='invalid',invalid_reason='EXPIRED' WHERE snapshot_id=?`, [id]);
      const [result] = await conn.query(`DELETE FROM ${CHUNKS} WHERE snapshot_id=? LIMIT 25`, [id]);
      const [[remaining]] = await conn.query(`SELECT COUNT(*) AS n FROM ${CHUNKS} WHERE snapshot_id=?`, [id]);
      if (!Number(remaining.n)) await conn.query(`DELETE FROM ${TABLE} WHERE snapshot_id=? AND state='invalid'`, [id]);
      return { deleted: result.affectedRows, generationRemoved: !Number(remaining.n) };
    });
  }
  return {
    createMembership: (scope, signal) => !policy().capture ? Promise.reject(failure('EXPORT_CAPTURE_DISABLED'))
      : admitted(scope, 'membership', signal, () => createMembership(scope, signal)),
    createProductRaw: (scope, productId, signal) => !policy().capture ? Promise.reject(failure('EXPORT_CAPTURE_DISABLED'))
      : admitted(scope, 'raw:' + productId, signal, () => createProductRaw(scope, productId, signal)),
    publishMembership: (scope, id, signal) => !policy().publishing ? Promise.reject(failure('EXPORT_PUBLISHING_DISABLED'))
      : admitted(scope, 'publish:' + id, signal, () => publishMembership(scope, id, signal)),
    manifest, readChunk, latest, validate, gc,
  };
}
module.exports = { create, createTransfers, policy, hash, encode, idBytes, DTO_FIELDS, LIGHT };
