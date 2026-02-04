const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');

// ------------------------------
// Basic helpers
// ------------------------------
function getTenantId(req) {
  // Приоритет: авторизованный пользователь > заголовок > query > body > дефолт
  if (req.user && req.user.tenantId) {
    return Number(req.user.tenantId);
  }
  const fromHeader = req.headers['x-tenant-id'];
  const fromQuery = req.query.tenant_id;
  const fromBody = req.body && req.body.tenant_id;
  const v = fromHeader ?? fromQuery ?? fromBody ?? 1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function getStoreId(req) {
  const fromUser = req.user?.store_id ?? req.user?.storeId ?? req.session?.store_id ?? req.session?.storeId;
  const fromHeader = req.headers['x-store-id'];
  const fromQuery = req.query?.store_id;
  const v = fromUser ?? fromHeader ?? fromQuery ?? 1;
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

function parseTimezoneOffsetToMinutes(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(v * 60);
  }

  let s = String(v).trim();
  if (!s) return 0;
  if (/^utc/i.test(s)) s = s.slice(3).trim();
  if (!s) return 0;
  if (s === 'Z') return 0;

  const direct = Number(s);
  if (Number.isFinite(direct)) {
    return Math.round(direct * 60);
  }

  const m = s.match(/^([+-]?)(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return 0;

  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  if (hh > 14 || mm > 59) return 0;

  return sign * (hh * 60 + mm);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseUtcDateTimeInput(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isFinite(ms)) return null;
    return ms;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const s = String(value).trim();
  if (!s) return null;

  const sqlMatch = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T])(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
  );
  if (sqlMatch) {
    const yyyy = Number(sqlMatch[1]);
    const mm = Number(sqlMatch[2]);
    const dd = Number(sqlMatch[3]);
    const hh = Number(sqlMatch[4]);
    const mi = Number(sqlMatch[5]);
    const ss = Number(sqlMatch[6]);
    return Date.UTC(yyyy, mm - 1, dd, hh, mi, ss);
  }

  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function formatUtcDateTime(value = Date.now()) {
  const ms = parseUtcDateTimeInput(value);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return (
    d.getUTCFullYear() +
    '-' +
    pad2(d.getUTCMonth() + 1) +
    '-' +
    pad2(d.getUTCDate()) +
    ' ' +
    pad2(d.getUTCHours()) +
    ':' +
    pad2(d.getUTCMinutes()) +
    ':' +
    pad2(d.getUTCSeconds())
  );
}

function utcToStoreDateTime(utcValue, timezone) {
  const utcMs = parseUtcDateTimeInput(utcValue);
  if (!Number.isFinite(utcMs)) {
    if (utcValue === undefined || utcValue === null) return null;
    return String(utcValue);
  }
  const offsetMinutes = parseTimezoneOffsetToMinutes(timezone);
  const shifted = utcMs + offsetMinutes * 60 * 1000;
  return formatUtcDateTime(shifted);
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

// ------------------------------
// Image helpers (WebP variants)
// ------------------------------

/**
 * Гарантирует наличие WebP-варианта для исходного изображения.
 * Оригинал остаётся нетронутым (используется как fallback).
 *
 * @param {string} originalPath - абсолютный путь к исходному файлу (jpg/png/webp/gif)
 * @param {object} opts
 * @param {number} [opts.quality=82]
 * @returns {Promise<string|null>} абсолютный путь к .webp файлу или null при ошибке
 */
async function ensureWebpVariant(originalPath, opts = {}) {
  const quality = Number.isFinite(opts.quality) ? opts.quality : 82;
  try {
    const ext = (path.extname(originalPath) || '').toLowerCase();

    // Уже WebP — ничего делать не нужно
    if (ext === '.webp') {
      return originalPath;
    }

    const dir = path.dirname(originalPath);
    const base = path.basename(originalPath, ext);
    const webpPath = path.join(dir, `${base}.webp`);

    // Если WebP уже есть и не старше оригинала — оставляем как есть
    try {
      const [srcStat, webpStat] = [fs.statSync(originalPath), fs.statSync(webpPath)];
      if (webpStat.mtimeMs >= srcStat.mtimeMs) {
        return webpPath;
      }
    } catch {
      // Одного из файлов может не быть — просто продолжаем
    }

    await sharp(originalPath)
      .webp({ quality })
      .toFile(webpPath);

    return webpPath;
  } catch (err) {
    console.error('ensureWebpVariant error for', originalPath, err);
    return null;
  }
}

module.exports = {
  getTenantId,
  getStoreId,
  toBool,
  numOrNull,
  strOrNull,
  safeJsonArray,
  makeCodeFromTitle,
  normalizePhone,
  makePublicId,
  ensureDir,
  parseTimezoneOffsetToMinutes,
  formatUtcDateTime,
  utcToStoreDateTime,

  getIdByCode,
  nextSortOrderForCategory,
  nextSortOrderForCategories,
  ensureDefaultCategories,
  getAllCategoryId,
  setProductCategories,
  resolveCategoryIdFromQuery,

  ensureWebpVariant,
};
