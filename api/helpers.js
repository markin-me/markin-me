const fs = require('fs');
const crypto = require('crypto');

// ------------------------------
// Basic helpers
// ------------------------------
function getTenantId(req) {
  const fromHeader = req.headers['x-tenant-id'];
  const fromQuery = req.query.tenant_id;
  const fromBody = req.body && req.body.tenant_id;
  const v = fromHeader ?? fromQuery ?? fromBody ?? 1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function toBool(v, fallback = true) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function safeJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function makeCodeFromTitle(title) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Date.now().toString(36);
  return (base && base.length >= 2 ? base : 'cat') + '-' + suffix;
}

// --- checkout helpers ---
function normalizePhone(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d]/g, '');
  // РФ к 11 цифрам, если возможно
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return '7' + digits.slice(1);
  }
  return digits;
}

function makePublicId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// ------------------------------
// DB helpers (need db)
// ------------------------------
async function getIdByCode(db, tenantId, table, code) {
  const [rows] = await db.query(
    `SELECT id FROM ${table} WHERE tenant_id=? AND code=? AND is_active=1 LIMIT 1`,
    [tenantId, code]
  );
  return rows.length ? Number(rows[0].id) : null;
}

async function nextSortOrderForCategory(db, tenantId, categoryId, step = 10) {
  const [rows] = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM prod_product_categories WHERE tenant_id=? AND category_id=?',
    [tenantId, categoryId]
  );
  return Number(rows?.[0]?.m || 0) + step;
}

async function nextSortOrderForCategories(db, tenantId, step = 10) {
  const [rows] = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM prod_categories WHERE tenant_id=?',
    [tenantId]
  );
  return Number(rows?.[0]?.m || 0) + step;
}

async function getEffectiveOptionGroupsForProduct(db, tenantId, productId) {
  const [cats] = await db.query(
    `SELECT category_id FROM prod_product_categories WHERE tenant_id=? AND product_id=?`,
    [tenantId, productId]
  );
  const categoryIds = cats.map(r => Number(r.category_id)).filter(n => Number.isFinite(n));

  const params = [tenantId, productId];
  let sql = `
    SELECT id, assign_type, assign_id, group_id, priority, sort_order, is_active
    FROM prod_option_assignments
    WHERE tenant_id=? AND is_active=1 AND (
      (assign_type='product' AND assign_id=?)
    `;
  if (categoryIds.length) {
    sql += ` OR (assign_type='category' AND assign_id IN (${categoryIds.map(() => '?').join(',')}))`;
    params.push(...categoryIds);
  }
  sql += ')';

  const [assignments] = await db.query(sql, params);
  if (!assignments.length) return [];

  assignments.sort((a, b) => {
    const aProd = a.assign_type === 'product' ? 1 : 0;
    const bProd = b.assign_type === 'product' ? 1 : 0;
    if (aProd !== bProd) return bProd - aProd;
    const pr = (Number(b.priority || 0) - Number(a.priority || 0));
    if (pr !== 0) return pr;
    const so = (Number(a.sort_order || 0) - Number(b.sort_order || 0));
    if (so !== 0) return so;
    return Number(a.id) - Number(b.id);
  });

  const byGroup = new Map();
  for (const a of assignments) {
    const gid = Number(a.group_id);
    if (!byGroup.has(gid)) byGroup.set(gid, a);
  }

  const groupIds = Array.from(byGroup.keys());
  if (!groupIds.length) return [];

  const [excl] = await db.query(
    `SELECT group_id FROM prod_option_exclusions WHERE tenant_id=? AND product_id=?`,
    [tenantId, productId]
  );
  const excluded = new Set(excl.map(r => Number(r.group_id)));
  const effectiveGroupIds = groupIds.filter(id => !excluded.has(id));
  if (!effectiveGroupIds.length) return [];

  const [groups] = await db.query(
    `SELECT id, title, selection_type, min_select, max_select, sort_order, is_active
     FROM prod_option_groups
     WHERE tenant_id=? AND is_active=1 AND id IN (${effectiveGroupIds.map(() => '?').join(',')})`,
    [tenantId, ...effectiveGroupIds]
  );

  if (!groups.length) return [];

  const [overrides] = await db.query(
    `SELECT id, group_id, selection_type, min_select, max_select, sort_order
     FROM prod_option_overrides
     WHERE tenant_id=? AND product_id=? AND group_id IN (${effectiveGroupIds.map(() => '?').join(',')})`,
    [tenantId, productId, ...effectiveGroupIds]
  );
  const overrideByGroup = new Map(overrides.map(o => [Number(o.group_id), o]));

  const [items] = await db.query(
    `SELECT id, group_id, title, target_type, target_id, price_mode, unit_price, sort_order, is_active
     FROM prod_option_items
     WHERE tenant_id=? AND is_active=1 AND group_id IN (${effectiveGroupIds.map(() => '?').join(',')})
     ORDER BY sort_order ASC, id ASC`,
    [tenantId, ...effectiveGroupIds]
  );
  const itemsByGroup = new Map();
  for (const item of items) {
    const gid = Number(item.group_id);
    if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
    itemsByGroup.get(gid).push(item);
  }

  const normalized = groups.map((g) => {
    const gid = Number(g.id);
    const override = overrideByGroup.get(gid);
    return {
      id: gid,
      title: g.title,
      selection_type: override?.selection_type ?? g.selection_type,
      min_select: override?.min_select ?? g.min_select ?? 0,
      max_select: override?.max_select ?? g.max_select ?? null,
      sort_order: override?.sort_order ?? g.sort_order ?? 0,
      items: itemsByGroup.get(gid) || [],
    };
  });

  normalized.sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || a.id - b.id);
  return normalized;
}

/**
 * Seed категорий по умолчанию для tenant:
 * - all (Все товары)
 * - burgers (Бургеры)
 * - drinks (Напитки)
 */
async function ensureDefaultCategories(db, tenantId) {
  const [rows] = await db.query(
    'SELECT * FROM prod_categories WHERE tenant_id=? ORDER BY sort_order, id',
    [tenantId]
  );

  const byCode = new Map(rows.map(r => [r.code, r]));
  const missing = [];

  if (!byCode.has('all')) missing.push(['all', 'Все товары', null, 1, 1, 0]);
  if (!byCode.has('burgers')) missing.push(['burgers', 'Бургеры', null, 1, 1, 10]);
  if (!byCode.has('drinks')) missing.push(['drinks', 'Напитки', null, 1, 1, 20]);

  if (missing.length) {
    for (const [code, title, icon, site_visibility, is_active, sort_order] of missing) {
      await db.query(
        'INSERT INTO prod_categories (tenant_id, code, title, icon, site_visibility, is_active, sort_order) VALUES (?,?,?,?,?,?,?)',
        [tenantId, code, title, icon, site_visibility, is_active, sort_order]
      );
    }
  }

  const [rows2] = await db.query(
    'SELECT * FROM prod_categories WHERE tenant_id=? ORDER BY sort_order, id',
    [tenantId]
  );
  return rows2;
}

async function getAllCategoryId(db, tenantId) {
  const [rows] = await db.query(
    'SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1',
    [tenantId, 'all']
  );
  if (rows.length) return rows[0].id;

  await ensureDefaultCategories(db, tenantId);

  const [rows2] = await db.query(
    'SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1',
    [tenantId, 'all']
  );
  return rows2.length ? rows2[0].id : null;
}

/**
 * Проставляет категории товару. "all" держим всегда.
 */
async function setProductCategories(db, tenantId, productId, categoryIds) {
  const allCategoryId = await getAllCategoryId(db, tenantId);

  const normalized = Array.from(
    new Set(
      (Array.isArray(categoryIds) ? categoryIds : [])
        .map(x => Number(x))
        .filter(x => Number.isFinite(x))
    )
  );

  const finalIds = allCategoryId
    ? Array.from(new Set([allCategoryId, ...normalized]))
    : normalized;

  const [existing] = await db.query(
    'SELECT category_id FROM prod_product_categories WHERE tenant_id=? AND product_id=?',
    [tenantId, productId]
  );
  const existingIds = new Set(existing.map(r => Number(r.category_id)));

  const toDelete = Array.from(existingIds).filter(id => !finalIds.includes(id));
  const toInsert = finalIds.filter(id => !existingIds.has(id));

  if (toDelete.length) {
    await db.query(
      `DELETE FROM prod_product_categories
       WHERE tenant_id=? AND product_id=? AND category_id IN (${toDelete.map(() => '?').join(',')})`,
      [tenantId, productId, ...toDelete]
    );
  }

  for (const cid of toInsert) {
    const sort = await nextSortOrderForCategory(db, tenantId, cid, 10);
    await db.query(
      `INSERT INTO prod_product_categories (tenant_id, product_id, category_id, sort_order)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE sort_order=sort_order`,
      [tenantId, productId, cid, sort]
    );
  }

  return finalIds;
}

async function resolveCategoryIdFromQuery(db, tenantId, req) {
  const code = strOrNull(req.query.category_code);
  if (code) {
    const [r] = await db.query(
      'SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1',
      [tenantId, code]
    );
    if (r.length) return Number(r[0].id);
  }

  const byId = Number(req.query.category_id);
  if (Number.isFinite(byId) && byId > 0) return byId;

  return await getAllCategoryId(db, tenantId);
}

module.exports = {
  getTenantId,
  toBool,
  numOrNull,
  strOrNull,
  safeJsonArray,
  makeCodeFromTitle,
  normalizePhone,
  makePublicId,
  ensureDir,

  getIdByCode,
  nextSortOrderForCategory,
  nextSortOrderForCategories,
  getEffectiveOptionGroupsForProduct,
  ensureDefaultCategories,
  getAllCategoryId,
  setProductCategories,
  resolveCategoryIdFromQuery,
};
