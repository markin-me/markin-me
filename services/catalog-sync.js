"use strict";

const listeners = new Map();
let lastCleanupAt = 0;

function key(tenantId, storeId) { return `${Number(tenantId)}:${Number(storeId)}`; }
function id(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null; }
function revision(value) { return /^\d+$/.test(String(value || "")) ? String(value) : "0"; }
function revisionOffset(value, offset) {
  try { return String(BigInt(revision(value)) + BigInt(Math.max(0, Number(offset) || 0))); } catch (_) { return revision(value); }
}

function emit(change) {
  const set = listeners.get(key(change.tenant_id, change.store_id));
  if (!set) return;
  set.forEach((listener) => { try { listener(change); } catch (_) {} });
}

function scheduleAfterCommit(db, changes) {
  setImmediate(() => {
    (Array.isArray(changes) ? changes : [changes]).filter(Boolean).forEach(emit);
    void maybeCleanup(db);
  });
}

async function maybeCleanup(db) {
  if (Date.now() - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = Date.now();
  await db.query(
    `DELETE FROM catalog_changes
      WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
      ORDER BY id ASC LIMIT 5000`
  ).catch(() => {});
}

async function recordScopeChange({ db, tenantId, storeId, entityType, entityId, operation = "upsert" }) {
  const tenant = id(tenantId); const store = id(storeId);
  if (!tenant || !store) return null;
  const [result] = await db.query(
    `INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation)
     VALUES (?, ?, ?, ?, ?)`,
    [tenant, store, String(entityType || "product").slice(0, 32), id(entityId), String(operation).slice(0, 16)]
  );
  const change = {
    revision: String(result.insertId), tenant_id: tenant, store_id: store,
    entity_type: String(entityType || "product"), entity_id: id(entityId), operation: String(operation),
  };
  scheduleAfterCommit(db, change);
  return change;
}

async function recordScopeChanges(options, entityIds) {
  const ids = [...new Set((entityIds || []).map(id).filter(Boolean))];
  if (!ids.length) return [];
  const changes = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(',');
    const params = [];
    batch.forEach((entityId) => params.push(
      Number(options.tenantId), Number(options.storeId), String(options.entityType || 'product').slice(0, 32),
      entityId, String(options.operation || 'upsert').slice(0, 16)
    ));
    const [result] = await options.db.query(
      `INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation) VALUES ${placeholders}`,
      params
    );
    const inserted = Number(result?.affectedRows || batch.length);
    changes.push({
      revision: revisionOffset(result?.insertId, inserted - 1),
      tenant_id: Number(options.tenantId),
      store_id: Number(options.storeId),
      entity_type: String(options.entityType || 'product'),
      entity_ids: batch,
      operation: String(options.operation || 'upsert'),
    });
  }
  if (options.deferEmit !== true) scheduleAfterCommit(options.db, changes);
  return ids;
}

async function recordTenantChanges(options, entityIds) {
  const ids = [...new Set((entityIds || []).map(id).filter(Boolean))];
  if (!ids.length) return [];
  const [stores] = await options.db.query('SELECT id FROM ten_stores WHERE tenant_id=? ORDER BY id', [options.tenantId]);
  if (!stores?.length) return [];
  const changes = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const rows = [];
    stores.forEach((store) => batch.forEach((entityId) => rows.push([Number(options.tenantId), Number(store.id), entityId])));
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(',');
    const params = [];
    rows.forEach(([tenantId, storeId, entityId]) => params.push(
      tenantId, storeId, String(options.entityType || 'product').slice(0, 32), entityId,
      String(options.operation || 'upsert').slice(0, 16)
    ));
    const [result] = await options.db.query(
      `INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation) VALUES ${placeholders}`,
      params
    );
    if (!Number(result?.affectedRows || 0)) continue;
    changes.push(...stores.map((row, index) => ({
      revision: revisionOffset(result.insertId, ((index + 1) * batch.length) - 1),
      tenant_id: Number(options.tenantId),
      store_id: Number(row.id),
      entity_type: String(options.entityType || 'product'),
      entity_ids: batch,
      operation: String(options.operation || 'upsert'),
    })));
  }
  if (options.deferEmit !== true) scheduleAfterCommit(options.db, changes);
  return ids;
}

async function recordTenantChange(options) {
  const tenant = id(options.tenantId);
  if (!tenant) return [];
  const [stores] = await options.db.query('SELECT id FROM ten_stores WHERE tenant_id=? ORDER BY id', [tenant]);
  if (!stores?.length) return [];
  const placeholders = stores.map(() => '(?, ?, ?, ?, ?)').join(',');
  const params = [];
  stores.forEach((store) => params.push(
    tenant, Number(store.id), String(options.entityType || 'product').slice(0, 32), id(options.entityId),
    String(options.operation || 'upsert').slice(0, 16)
  ));
  const [result] = await options.db.query(
    `INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation) VALUES ${placeholders}`,
    params
  );
  const count = Number(result?.affectedRows || 0);
  if (!count) return [];
  const changes = (stores || []).map((row, index) => ({
    revision: revisionOffset(result.insertId, index), tenant_id: tenant, store_id: Number(row.id),
    entity_type: String(options.entityType || 'product'), entity_id: id(options.entityId), operation: String(options.operation || 'upsert'),
  }));
  scheduleAfterCommit(options.db, changes);
  return changes;
}

async function getManifest({ db, tenantId, storeId }) {
  const [rows] = await db.query(
    'SELECT COALESCE(MAX(id), 0) AS revision FROM catalog_changes WHERE tenant_id=? AND store_id=?',
    [tenantId, storeId]
  );
  return revision(rows?.[0]?.revision);
}

async function getChanges({ db, tenantId, storeId, since, limit = 500 }) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 500));
  const sinceRevision = revision(since);
  if (sinceRevision !== '0') {
    const [checkpointRows] = await db.query(
      'SELECT id FROM catalog_changes WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
      [tenantId, storeId, sinceRevision]
    );
    if (!checkpointRows?.length) {
      return { changes: [], has_more: false, next_revision: sinceRevision, reset_required: true };
    }
  }
  const [rows] = await db.query(
    `SELECT id, entity_type, entity_id, operation, created_at
       FROM catalog_changes
      WHERE tenant_id=? AND store_id=? AND id>?
      ORDER BY id ASC LIMIT ?`,
    [tenantId, storeId, sinceRevision, safeLimit + 1]
  );
  const page = (rows || []).slice(0, safeLimit);
  return {
    changes: page.map((row) => ({
      revision: String(row.id), entity_type: row.entity_type,
      entity_id: row.entity_id == null ? null : Number(row.entity_id), operation: row.operation,
    })),
    has_more: (rows || []).length > safeLimit,
    next_revision: page.length ? String(page[page.length - 1].id) : sinceRevision,
    reset_required: false,
  };
}

function subscribe(tenantId, storeId, listener) {
  const channel = key(tenantId, storeId);
  const set = listeners.get(channel) || new Set();
  set.add(listener); listeners.set(channel, set);
  return () => { set.delete(listener); if (!set.size) listeners.delete(channel); };
}

module.exports = { revision, recordScopeChange, recordScopeChanges, recordTenantChange, recordTenantChanges, getManifest, getChanges, subscribe };
