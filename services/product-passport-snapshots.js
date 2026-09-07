"use strict";

const SNAPSHOT_SCHEMA_VERSION = 1;
const BUILD_BATCH_SIZE = 8;
const memoryCache = new Map();
const pendingBuilds = new Map();
let configuredDb = null;
let configuredBuilder = null;
let buildTimer = null;
let buildRunning = false;

function positiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0))];
}

function cacheKey(tenantId, storeId, productId) {
  return `${Number(tenantId)}:${Number(storeId)}:${Number(productId)}`;
}

function buildGroupKey(tenantId, storeId) {
  return `${Number(tenantId)}:${Number(storeId)}`;
}

function parseSnapshot(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearMemory(tenantId, storeId, productIds) {
  positiveIds(productIds).forEach((productId) => {
    memoryCache.delete(cacheKey(tenantId, storeId, productId));
  });
}

function enqueueBuild(tenantId, storeId, productIds) {
  const ids = positiveIds(productIds);
  if (!ids.length || !configuredBuilder || !configuredDb) return;
  const key = buildGroupKey(tenantId, storeId);
  let group = pendingBuilds.get(key);
  if (!group) {
    group = { tenantId: Number(tenantId), storeId: Number(storeId), ids: new Set() };
    pendingBuilds.set(key, group);
  }
  ids.forEach((id) => group.ids.add(id));
  if (!buildTimer && !buildRunning) {
    buildTimer = setTimeout(() => {
      buildTimer = null;
      processBuildQueue().catch((error) => console.error("product passport snapshot queue error:", error));
    }, 0);
    buildTimer.unref?.();
  }
}

async function persistBuildResult(db, tenantId, storeId, ids, payloads) {
  for (const productId of ids) {
    const passport = payloads?.[String(productId)] || payloads?.[productId] || null;
    if (!passport) {
      await db.query(
        `UPDATE prod_product_passport_snapshots
         SET status='error', last_error='PASSPORT_NOT_BUILT'
         WHERE tenant_id=? AND store_id=? AND product_id=?`,
        [tenantId, storeId, productId]
      );
      continue;
    }
    const serialized = JSON.stringify(passport);
    const revision = String(passport?.updated_at || passport?.product?.updated_at || "").slice(0, 64) || null;
    await db.query(
      `INSERT INTO prod_product_passport_snapshots
        (tenant_id, store_id, product_id, passport_json, status, schema_version, source_revision, generated_at, last_error)
       VALUES (?, ?, ?, ?, 'ready', ?, ?, CURRENT_TIMESTAMP, NULL)
       ON DUPLICATE KEY UPDATE
         passport_json=VALUES(passport_json), status='ready', schema_version=VALUES(schema_version),
         source_revision=VALUES(source_revision), generated_at=CURRENT_TIMESTAMP, last_error=NULL`,
      [tenantId, storeId, productId, serialized, SNAPSHOT_SCHEMA_VERSION, revision]
    );
    memoryCache.set(cacheKey(tenantId, storeId, productId), passport);
  }
}

async function processBuildQueue() {
  if (buildRunning || !configuredBuilder || !configuredDb) return;
  buildRunning = true;
  try {
    while (pendingBuilds.size) {
      const [groupKey, group] = pendingBuilds.entries().next().value;
      const ids = [...group.ids].slice(0, BUILD_BATCH_SIZE);
      ids.forEach((id) => group.ids.delete(id));
      if (!group.ids.size) pendingBuilds.delete(groupKey);
      await configuredDb.query(
        `INSERT INTO prod_product_passport_snapshots (tenant_id, store_id, product_id, status, schema_version)
         SELECT ?, ?, p.id, 'building', ? FROM prod_products p
         WHERE p.tenant_id=? AND p.id IN (?)
         ON DUPLICATE KEY UPDATE status='building', last_error=NULL`,
        [group.tenantId, group.storeId, SNAPSHOT_SCHEMA_VERSION, group.tenantId, ids]
      );
      try {
        const payloads = await configuredBuilder(group.tenantId, group.storeId, ids);
        await persistBuildResult(configuredDb, group.tenantId, group.storeId, ids, payloads);
      } catch (error) {
        await configuredDb.query(
          `UPDATE prod_product_passport_snapshots
           SET status='error', last_error=?
           WHERE tenant_id=? AND store_id=? AND product_id IN (?)`,
          [String(error?.message || error || "BUILD_FAILED").slice(0, 1000), group.tenantId, group.storeId, ids]
        ).catch(() => {});
        console.error("product passport snapshot build failed:", error);
      }
    }
  } finally {
    buildRunning = false;
    if (pendingBuilds.size) enqueueBuild(0, 0, []);
  }
}

async function readPassports({ db, tenantId, storeId, productIds }) {
  const ids = positiveIds(productIds);
  const data = {};
  const missing = [];
  ids.forEach((productId) => {
    const cached = memoryCache.get(cacheKey(tenantId, storeId, productId));
    if (cached) data[String(productId)] = cached;
    else missing.push(productId);
  });
  if (missing.length) {
    const [rows] = await db.query(
      `SELECT product_id, passport_json, status
       FROM prod_product_passport_snapshots
       WHERE tenant_id=? AND store_id=? AND product_id IN (?)`,
      [tenantId, storeId, missing]
    );
    const found = new Set();
    for (const row of rows) {
      const productId = Number(row.product_id || 0);
      const passport = parseSnapshot(row.passport_json);
      if (!(productId > 0) || !passport) continue;
      found.add(productId);
      data[String(productId)] = passport;
      memoryCache.set(cacheKey(tenantId, storeId, productId), passport);
      if (row.status !== "ready") enqueueBuild(tenantId, storeId, [productId]);
    }
    const notFound = missing.filter((id) => !found.has(id));
    if (notFound.length) enqueueBuild(tenantId, storeId, notFound);
  }
  return data;
}

async function markProductsDirty({ db, tenantId, storeId, productIds }) {
  const ids = positiveIds(productIds);
  if (!ids.length) return;
  clearMemory(tenantId, storeId, ids);
  await db.query(
    `INSERT INTO prod_product_passport_snapshots (tenant_id, store_id, product_id, status, schema_version)
     SELECT ?, ?, p.id, 'dirty', ? FROM prod_products p
     WHERE p.tenant_id=? AND p.id IN (?)
     ON DUPLICATE KEY UPDATE status='dirty', last_error=NULL`,
    [tenantId, storeId, SNAPSHOT_SCHEMA_VERSION, tenantId, ids]
  );
  enqueueBuild(tenantId, storeId, ids);
}

async function markRelatedProductsDirty({ db, tenantId, storeId, productIds }) {
  const seeds = positiveIds(productIds);
  if (!seeds.length) return;
  const [rows] = await db.query(
    `SELECT product_id FROM prod_product_ingredients
       WHERE tenant_id=? AND ingredient_id IN (?)
     UNION
     SELECT oa.assign_id AS product_id
       FROM prod_option_items oi
       JOIN prod_option_assignments oa
         ON oa.tenant_id=oi.tenant_id AND oa.group_id=oi.group_id
       WHERE oi.tenant_id=? AND oi.target_type='product' AND oi.target_product_id IN (?)
         AND oa.assign_type='product' AND oa.is_active=1`,
    [tenantId, seeds, tenantId, seeds]
  );
  const related = positiveIds([...seeds, ...rows.map((row) => row.product_id)]);
  await markProductsDirty({ db, tenantId, storeId, productIds: related });
}

async function scheduleInitialBackfill(db) {
  const [rows] = await db.query(
    `SELECT p.tenant_id, s.id AS store_id, p.id AS product_id
     FROM prod_products p
     JOIN ten_stores s ON s.tenant_id=p.tenant_id AND s.is_active=1
     LEFT JOIN prod_product_passport_snapshots ps
       ON ps.tenant_id=p.tenant_id AND ps.store_id=s.id AND ps.product_id=p.id
     WHERE p.is_active=1 AND p.site_visibility=1
       AND (ps.id IS NULL OR ps.status IN ('dirty','building','error') OR ps.schema_version<>?)
     ORDER BY p.tenant_id, s.id, p.id`
    , [SNAPSHOT_SCHEMA_VERSION]
  );
  rows.forEach((row) => enqueueBuild(row.tenant_id, row.store_id, [row.product_id]));
}

function configure({ db, builder }) {
  configuredDb = db;
  configuredBuilder = builder;
  setTimeout(() => {
    scheduleInitialBackfill(db).catch((error) => console.error("product passport initial backfill skipped:", error));
  }, 1000).unref?.();
}

module.exports = {
  configure,
  readPassports,
  markProductsDirty,
  markRelatedProductsDirty,
};
