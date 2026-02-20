const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');

module.exports = function makeAdminTenantRouter({ db, helpers }) {
  const router = express.Router();
  const subdomainRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  function normalizeSubdomain(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim().toLowerCase();
    return s === '' ? null : s;
  }

  function makePrintApiToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async function ensureStoreExists(tenantId, storeId) {
    const [rows] = await db.query(
      'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
      [tenantId, storeId]
    );
    return rows.length ? Number(rows[0].id) : null;
  }

  const listConfigs = {
    'order-statuses': {
      table: 'order_statuses',
      hasFinal: true
    },
    'order-payments': {
      table: 'order_payments',
      hasFinal: false
    },
    'order-delivery': {
      table: 'order_delivery_types',
      hasFinal: false,
      defaultField: 'is_default'
    },
    'order-time-options': {
      table: 'order_time_options',
      hasFinal: false,
      hasTimeWindowSettings: true,
      detailFields: ['description', 'has_time_window', 'starts_at', 'ends_at', 'step_minutes', 'lead_minutes'],
      patchFields: {
        description: (value) => helpers.strOrNull(value),
        has_time_window: (value) => (helpers.toBool(value, false) ? 1 : 0),
        starts_at: (value) => helpers.strOrNull(value),
        ends_at: (value) => helpers.strOrNull(value),
        step_minutes: (value) => {
          const n = helpers.numOrNull(value);
          return Number.isFinite(n) ? n : 30;
        },
        lead_minutes: (value) => {
          const n = helpers.numOrNull(value);
          return Number.isFinite(n) ? n : 0;
        }
      }
    }
  };

  function getListConfig(type) {
    return listConfigs[type] || null;
  }

  function normalizeStoreTime(value) {
    if (value === undefined || value === null) return null;
    const asStr = String(value);
    return asStr.length > 8 ? asStr.slice(0, 8) : asStr;
  }

  function organizeStoreHours(rows) {
    const map = new Map();
    if (!Array.isArray(rows)) return map;
    rows.forEach((row) => {
      const storeId = Number(row.store_id);
      if (!Number.isFinite(storeId)) return;
      if (!map.has(storeId)) map.set(storeId, []);
      map.get(storeId).push({
        day_of_week: Number(row.day_of_week),
        opens_at: normalizeStoreTime(row.opens_at),
        closes_at: normalizeStoreTime(row.closes_at),
        is_closed: Number(row.is_closed) === 1 ? 1 : 0
      });
    });
    for (const list of map.values()) {
      list.sort((a, b) => a.day_of_week - b.day_of_week);
    }
    return map;
  }

  async function loadStoreHoursForStores(tenantId, storeIds) {
    if (!Array.isArray(storeIds)) return [];
    const ids = Array.from(new Set(storeIds.map((id) => Number(id)).filter((v) => Number.isFinite(v) && v > 0)));
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed
       FROM ten_store_hours
       WHERE tenant_id=? AND store_id IN (${placeholders})
       ORDER BY store_id ASC, day_of_week ASC`,
      [tenantId, ...ids]
    );
    return rows;
  }

async function saveStoreHours(tenantId, storeId, hours) {
  if (!Number.isFinite(Number(storeId))) return;
  const entries = Array.isArray(hours) ? hours : [];
  const normalized = [];
  for (const entry of entries) {
    const day = helpers.numOrNull(entry.day_of_week);
    if (day === null || day < 0 || day > 6) continue;
    normalized.push([
      tenantId,
      storeId,
      day,
      helpers.strOrNull(entry.opens_at),
      helpers.strOrNull(entry.closes_at),
      helpers.toBool(entry.is_closed, false) ? 1 : 0
    ]);
  }
  await db.query('DELETE FROM ten_store_hours WHERE tenant_id=? AND store_id=?', [tenantId, storeId]);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => '(?,?,?,?,?,?)').join(',');
  await db.query(
    `INSERT INTO ten_store_hours (tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed)
     VALUES ${placeholders}`,
    normalized.flat()
  );
}

async function loadStoreDeliveryHoursForStores(tenantId, storeIds) {
  if (!Array.isArray(storeIds)) return [];
  const ids = Array.from(new Set(storeIds.map((id) => Number(id)).filter((v) => Number.isFinite(v) && v > 0)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed
     FROM ten_store_delivery_hours
     WHERE tenant_id=? AND store_id IN (${placeholders})
     ORDER BY store_id ASC, day_of_week ASC`,
    [tenantId, ...ids]
  );
  return rows;
}

async function saveStoreDeliveryHours(tenantId, storeId, hours) {
  if (!Number.isFinite(Number(storeId))) return;
  const entries = Array.isArray(hours) ? hours : [];
  const normalized = [];
  for (const entry of entries) {
    const day = helpers.numOrNull(entry.day_of_week);
    if (day === null || day < 0 || day > 6) continue;
    normalized.push([
      tenantId,
      storeId,
      day,
      helpers.strOrNull(entry.opens_at),
      helpers.strOrNull(entry.closes_at),
      helpers.toBool(entry.is_closed, false) ? 1 : 0
    ]);
  }
  await db.query('DELETE FROM ten_store_delivery_hours WHERE tenant_id=? AND store_id=?', [tenantId, storeId]);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => '(?,?,?,?,?,?)').join(',');
  await db.query(
    `INSERT INTO ten_store_delivery_hours (tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed)
     VALUES ${placeholders}`,
    normalized.flat()
  );
}

  async function fetchStoreWithHours(tenantId, storeId) {
    const [rows] = await db.query(
    `SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active, use_global_hours, use_delivery_hours, created_at, updated_at
       FROM ten_stores
       WHERE tenant_id=? AND id=? LIMIT 1`,
    [tenantId, storeId]
  );
    if (!rows.length) return null;
    const store = rows[0];
    const hoursRows = await loadStoreHoursForStores(tenantId, [storeId]);
    const hoursMap = organizeStoreHours(hoursRows);
    store.hours = hoursMap.get(storeId) || [];
    const deliveryRows = await loadStoreDeliveryHoursForStores(tenantId, [storeId]);
    const deliveryMap = organizeStoreHours(deliveryRows);
    store.delivery_hours = deliveryMap.get(storeId) || [];
    store.use_global_hours = Number(store.use_global_hours) === 1 ? 1 : 0;
    store.use_delivery_hours = Number(store.use_delivery_hours) === 1 ? 1 : 0;
    return store;
  }

  // ------------------------------
  // Upload: tenant assets (logo/favicon)
  // POST /api/admin/tenant/upload
  // form-data: { file, field }
  // ------------------------------
  const tenantAssetStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId));
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const tenantAssetUpload = multer({
    storage: tenantAssetStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload', tenantAssetUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const field = helpers.strOrNull(req.body.field);
      const file = req.file;

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });

      const allowed = new Set([
        'logo_light_url',
        'logo_dark_url',
        'favicon_light_url',
        'favicon_dark_url',
        'apple_touch_icon_url',
        'android_icon_url'
      ]);
      if (!field || !allowed.has(field)) {
        return res.status(400).json({ ok: false, error: 'FIELD_INVALID' });
      }

      // Создаём WebP-вариант логотипа / иконки (оригинал оставляем как fallback)
      await helpers.ensureWebpVariant(
        file.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), file.filename)
      );

      const url = `/static/uploads/tenants/${tenantId}/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;

      await db.query(
        `UPDATE ten_tenants SET ${field}=? WHERE id=?`,
        [url, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, url, tenant: rows[0] || null });
    } catch (err) {
      console.error('Ошибка загрузки tenant ассета:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Upload: звуки уведомлений (минимальные ограничения по формату)
  // POST /api/admin/tenant/upload-sound
  // form-data: { file, field }  field: sound_new_order_url | sound_order_cancelled_url
  // ------------------------------
  const tenantSoundStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'sounds');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = (path.extname(file.originalname || '') || '.mp3').toLowerCase();
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const tenantSoundUpload = multer({
    storage: tenantSoundStorage,
    limits: { files: 1, fileSize: 15 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const type = (file.mimetype || '').toLowerCase();
      const isAudio = type.startsWith('audio/');
      const ext = (path.extname(file.originalname || '') || '').toLowerCase();
      const audioExt = new Set(['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac']);
      cb(isAudio || audioExt.has(ext) ? null : new Error('ONLY_AUDIO'), isAudio || audioExt.has(ext));
    }
  });

  router.post('/upload-sound', tenantSoundUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const field = helpers.strOrNull(req.body.field);
      const file = req.file;

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });

      const allowed = new Set(['sound_new_order_url', 'sound_order_cancelled_url', 'sound_new_message_url']);
      if (!field || !allowed.has(field)) {
        return res.status(400).json({ ok: false, error: 'FIELD_INVALID' });
      }

      const url = `/static/uploads/tenants/${tenantId}/sounds/${file.filename}`;

      await db.query(
        `UPDATE ten_tenants SET ${field}=? WHERE id=?`,
        [url, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, url, tenant: rows[0] || null });
    } catch (err) {
      console.error('Ошибка загрузки звука:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant
   * Возвращает Компания (tenant) для текущего пользователя
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const tenant = rows[0];

      // Вычисляем ссылку для Telegram mini app без хранения в БД.
      // Подстраиваемся под текущий домен и протокол (localhost, markin-me.ru и т.п.).
      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];

      function firstHeaderValue(raw, fallback = '') {
        if (!raw) return fallback;
        if (Array.isArray(raw)) return String(raw[0]).trim();
        return String(raw).split(',')[0].trim();
      }

      const protocol = firstHeaderValue(forwardedProto, req.protocol || 'https');
      const hostHeader = firstHeaderValue(forwardedHost, req.get('host') || 'localhost:3000');
      const baseUrl = `${protocol}://${hostHeader}`;
      const telegramMiniAppUrl = `${baseUrl}/tg-app?tenant_id=${tenant.id}`;

      res.json({
        ok: true,
        tenant: {
          ...tenant,
          telegram_mini_app_url: telegramMiniAppUrl
        }
      });
    } catch (err) {
      console.error('Ошибка получения tenant профиля:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/tenant
   * Обновление отдельных полей профиля (пока только timezone)
   * body: { timezone }
   */
  router.put('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const timezone = helpers.strOrNull(req.body.timezone);
      const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
      const email = req.body.email !== undefined ? helpers.strOrNull(req.body.email) : undefined;
      const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
      const logoLight = req.body.logo_light_url !== undefined ? helpers.strOrNull(req.body.logo_light_url) : undefined;
      const logoDark = req.body.logo_dark_url !== undefined ? helpers.strOrNull(req.body.logo_dark_url) : undefined;
      const faviconLight = req.body.favicon_light_url !== undefined ? helpers.strOrNull(req.body.favicon_light_url) : undefined;
      const faviconDark = req.body.favicon_dark_url !== undefined ? helpers.strOrNull(req.body.favicon_dark_url) : undefined;
      const appleTouchIcon = req.body.apple_touch_icon_url !== undefined ? helpers.strOrNull(req.body.apple_touch_icon_url) : undefined;
      const androidIcon = req.body.android_icon_url !== undefined ? helpers.strOrNull(req.body.android_icon_url) : undefined;
      const roundingModeRaw = req.body.price_rounding_mode !== undefined ? helpers.strOrNull(req.body.price_rounding_mode) : undefined;
      const roundingPrecisionRaw = req.body.price_rounding_precision !== undefined ? helpers.numOrNull(req.body.price_rounding_precision) : undefined;
      const stockDeductModeRaw = req.body.order_stock_deduct_mode !== undefined ? helpers.strOrNull(req.body.order_stock_deduct_mode) : undefined;
      const stockDeductStatusIdRaw = req.body.order_stock_deduct_status_id !== undefined ? helpers.numOrNull(req.body.order_stock_deduct_status_id) : undefined;
      const siteName = req.body.site_name !== undefined ? helpers.strOrNull(req.body.site_name) : undefined;
      const siteDescription = req.body.site_description !== undefined ? helpers.strOrNull(req.body.site_description) : undefined;
      const subdomain = req.body.subdomain !== undefined ? normalizeSubdomain(req.body.subdomain) : undefined;
      const customDomain = req.body.custom_domain !== undefined ? helpers.strOrNull(req.body.custom_domain) : undefined;
      const soundNewOrder = req.body.sound_new_order_url !== undefined ? helpers.strOrNull(req.body.sound_new_order_url) : undefined;
      const soundCancelled = req.body.sound_order_cancelled_url !== undefined ? helpers.strOrNull(req.body.sound_order_cancelled_url) : undefined;
      const soundNewMessage = req.body.sound_new_message_url !== undefined ? helpers.strOrNull(req.body.sound_new_message_url) : undefined;

      const imgWebpQuality = req.body.img_webp_quality !== undefined ? helpers.numOrNull(req.body.img_webp_quality) : undefined;
      const imgThumbQuality = req.body.img_thumb_quality !== undefined ? helpers.numOrNull(req.body.img_thumb_quality) : undefined;
      const imgThumbWidth = req.body.img_thumb_width !== undefined ? helpers.numOrNull(req.body.img_thumb_width) : undefined;
      const imgDeleteOriginal = req.body.img_delete_original !== undefined ? (helpers.toBool(req.body.img_delete_original, true) ? 1 : 0) : undefined;

      const telegramBotUsername = req.body.telegram_bot_username !== undefined ? helpers.strOrNull(req.body.telegram_bot_username) : undefined;
      const telegramBotToken = req.body.telegram_bot_token !== undefined ? helpers.strOrNull(req.body.telegram_bot_token) : undefined;

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [currentRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (!currentRows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const current = currentRows[0];
      const nextTimezone = timezone !== undefined ? timezone : current.timezone;
      const nextLogoLight = logoLight !== undefined ? logoLight : current.logo_light_url;
      const nextLogoDark = logoDark !== undefined ? logoDark : current.logo_dark_url;
      const nextFaviconLight = faviconLight !== undefined ? faviconLight : current.favicon_light_url;
      const nextFaviconDark = faviconDark !== undefined ? faviconDark : current.favicon_dark_url;
      const nextAppleTouchIcon = appleTouchIcon !== undefined ? appleTouchIcon : current.apple_touch_icon_url;
      const nextAndroidIcon = androidIcon !== undefined ? androidIcon : current.android_icon_url;
      const allowedRoundingModes = new Set(['none', 'down', 'up', 'nearest']);
      const sanitizedRoundingMode =
        roundingModeRaw !== undefined
          ? (allowedRoundingModes.has(roundingModeRaw) ? roundingModeRaw : 'none')
          : undefined;
      const sanitizedRoundingPrecision =
        roundingPrecisionRaw !== undefined
          ? (Number(roundingPrecisionRaw) === 0 ? 0 : 2)
          : undefined;
      const nextRoundingMode = sanitizedRoundingMode !== undefined ? sanitizedRoundingMode : current.price_rounding_mode;
      const nextRoundingPrecision =
        sanitizedRoundingPrecision !== undefined ? sanitizedRoundingPrecision : (current.price_rounding_precision ?? 2);
      const allowedStockDeductModes = new Set(['on_create', 'on_status']);
      const sanitizedStockDeductMode =
        stockDeductModeRaw !== undefined
          ? (allowedStockDeductModes.has(stockDeductModeRaw) ? stockDeductModeRaw : 'on_create')
          : undefined;
      const nextStockDeductMode = sanitizedStockDeductMode !== undefined
        ? sanitizedStockDeductMode
        : (current.order_stock_deduct_mode || 'on_create');
      let nextStockDeductStatusId = stockDeductStatusIdRaw !== undefined
        ? (Number.isFinite(Number(stockDeductStatusIdRaw)) && Number(stockDeductStatusIdRaw) > 0 ? Number(stockDeductStatusIdRaw) : null)
        : (current.order_stock_deduct_status_id != null ? Number(current.order_stock_deduct_status_id) : null);

      async function resolveFallbackDeductStatusId() {
        const [byDelivered] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1 AND code='delivered'
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        if (byDelivered.length) return Number(byDelivered[0].id);

        const [byFinal] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1 AND is_final=1 AND code<>'canceled'
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        if (byFinal.length) return Number(byFinal[0].id);

        const [firstActive] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        return firstActive.length ? Number(firstActive[0].id) : null;
      }

      if (nextStockDeductStatusId != null) {
        const [statusRows] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND id=?
           LIMIT 1`,
          [tenantId, nextStockDeductStatusId]
        );
        if (!statusRows.length) {
          return res.status(400).json({ ok: false, error: 'BAD_STOCK_DEDUCT_STATUS' });
        }
      }
      if (nextStockDeductMode === 'on_status' && !nextStockDeductStatusId) {
        nextStockDeductStatusId = await resolveFallbackDeductStatusId();
      }
      const nextSiteName = siteName !== undefined ? siteName : current.site_name;
      const nextSiteDescription = siteDescription !== undefined ? siteDescription : current.site_description;
      let nextSubdomain = subdomain !== undefined ? subdomain : current.subdomain;

      if (subdomain !== undefined) {
        if (!subdomain) {
          nextSubdomain = `shop-${tenantId}`;
        } else {
          if (!subdomainRe.test(subdomain)) {
            return res.status(400).json({ ok: false, error: 'INVALID_SUBDOMAIN' });
          }
          const [exists] = await db.query(
            'SELECT id FROM ten_tenants WHERE subdomain=? AND id<>? LIMIT 1',
            [subdomain, tenantId]
          );
          if (exists.length > 0) {
            return res.status(409).json({ ok: false, error: 'SUBDOMAIN_TAKEN' });
          }
        }
      }
      const nextCustomDomain = customDomain !== undefined ? customDomain : current.custom_domain;
      const nextSoundNewOrder = soundNewOrder !== undefined ? soundNewOrder : (current.sound_new_order_url ?? null);
      const nextSoundCancelled = soundCancelled !== undefined ? soundCancelled : (current.sound_order_cancelled_url ?? null);
      const nextSoundNewMessage = soundNewMessage !== undefined ? soundNewMessage : (current.sound_new_message_url ?? null);
      const nextName = name !== undefined ? name : current.name;
      const nextEmail = email !== undefined ? email : current.email;
      const nextPhone = phone !== undefined ? phone : current.phone;

      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const nextImgWebpQuality = imgWebpQuality !== undefined ? clamp(imgWebpQuality ?? 82, 1, 100) : (current.img_webp_quality ?? 82);
      const nextImgThumbQuality = imgThumbQuality !== undefined ? clamp(imgThumbQuality ?? 72, 1, 100) : (current.img_thumb_quality ?? 72);
      const nextImgThumbWidth = imgThumbWidth !== undefined ? clamp(imgThumbWidth ?? 480, 100, 2000) : (current.img_thumb_width ?? 480);
      const nextImgDeleteOriginal = imgDeleteOriginal !== undefined ? imgDeleteOriginal : (current.img_delete_original ?? 1);

      const nextTelegramBotUsername = telegramBotUsername !== undefined ? telegramBotUsername : (current.telegram_bot_username ?? null);
      const nextTelegramBotToken = telegramBotToken !== undefined ? telegramBotToken : (current.telegram_bot_token ?? null);

      if (email !== undefined && email && email !== current.email) {
        const [existsEmail] = await db.query(
          'SELECT id FROM ten_tenants WHERE email=? AND id<>? LIMIT 1',
          [email, tenantId]
        );
        if (existsEmail.length > 0) {
          return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN' });
        }
      }

      await db.query(
        'UPDATE ten_tenants SET name=?, email=?, phone=?, timezone=?, logo_light_url=?, logo_dark_url=?, favicon_light_url=?, favicon_dark_url=?, apple_touch_icon_url=?, android_icon_url=?, price_rounding_mode=?, price_rounding_precision=?, order_stock_deduct_mode=?, order_stock_deduct_status_id=?, site_name=?, site_description=?, subdomain=?, custom_domain=?, sound_new_order_url=?, sound_order_cancelled_url=?, sound_new_message_url=?, img_webp_quality=?, img_thumb_quality=?, img_thumb_width=?, img_delete_original=?, telegram_bot_username=?, telegram_bot_token=? WHERE id=?',
        [nextName, nextEmail, nextPhone, nextTimezone, nextLogoLight, nextLogoDark, nextFaviconLight, nextFaviconDark, nextAppleTouchIcon, nextAndroidIcon, nextRoundingMode, nextRoundingPrecision, nextStockDeductMode, nextStockDeductStatusId, nextSiteName, nextSiteDescription, nextSubdomain, nextCustomDomain, nextSoundNewOrder, nextSoundCancelled, nextSoundNewMessage, nextImgWebpQuality, nextImgThumbQuality, nextImgThumbWidth, nextImgDeleteOriginal, nextTelegramBotUsername, nextTelegramBotToken, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, tenant: rows[0] || null });
    } catch (err) {
      console.error('Ошибка обновления tenant профиля:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/current-time
   * Returns current server time converted to the timezone of the active store
   */
  router.get('/current-time', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = req.headers['x-store-id'];

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      // Получаем timezone филиала
      let storeTimezone = '+0';
      if (storeId) {
        const [storeRows] = await db.query(
          'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, storeId]
        );
        if (storeRows[0]?.timezone) {
          storeTimezone = storeRows[0].timezone;
        }
      }

      // Если нет timezone у филиала, берем у тенанта
      if (!storeTimezone || storeTimezone === '+0') {
        const [tenantRows] = await db.query(
          'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        if (tenantRows[0]?.timezone) {
          storeTimezone = tenantRows[0].timezone;
        }
      }

      // Получаем РЕАЛЬНОЕ UTC время (не от MySQL, а от Node.js)
      const realUtcNow = Date.now();

      // Вычисляем время филиала
      const offsetHours = Number.isNaN(Number(storeTimezone)) ? 0 : Number(storeTimezone);
      const offsetMs = offsetHours * 60 * 60 * 1000;
      const storeTime = realUtcNow + offsetMs;
      const storeDate = new Date(storeTime);

      res.json({
        ok: true,
        data: {
          storeTimezone: storeTimezone,
          utcTimestamp: realUtcNow,
          storeTimestamp: storeTime,
          localTime: {
            hours: storeDate.getUTCHours(),
            minutes: storeDate.getUTCMinutes(),
            seconds: storeDate.getUTCSeconds(),
            day: storeDate.getUTCDay(),
            date: storeDate.getUTCDate(),
            month: storeDate.getUTCMonth(),
            year: storeDate.getUTCFullYear()
          }
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  async function getNextStoreId(tenantId) {
    const [rows] = await db.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ten_stores WHERE tenant_id=?',
      [tenantId]
    );
    return Number(rows?.[0]?.next_id || 1);
  }

  router.get('/stores', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active, use_global_hours, use_delivery_hours, created_at, updated_at
         FROM ten_stores
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );
      const stores = Array.isArray(rows) ? rows : [];
      const storeIds = stores.map((item) => item.id);
      const hoursRows = await loadStoreHoursForStores(tenantId, storeIds);
      const deliveryRows = await loadStoreDeliveryHoursForStores(tenantId, storeIds);
      const hoursMap = organizeStoreHours(hoursRows);
      const deliveryMap = organizeStoreHours(deliveryRows);
      const enriched = stores.map((store) => ({
        ...store,
        use_global_hours: Number(store.use_global_hours) === 1 ? 1 : 0,
        use_delivery_hours: Number(store.use_delivery_hours) === 1 ? 1 : 0,
        hours: hoursMap.get(Number(store.id)) || []
        ,
        delivery_hours: deliveryMap.get(Number(store.id)) || []
      }));
      res.json({ ok: true, stores: enriched });
    } catch (err) {
      console.error('Ошибка получения списка точек продаж:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

    router.post('/stores', async (req, res) => {
      try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const codeInput = helpers.strOrNull(req.body.code);
      const address = helpers.strOrNull(req.body.address);
      const city = helpers.strOrNull(req.body.city);
      const phone = helpers.strOrNull(req.body.phone);
      let timezone = helpers.strOrNull(req.body.timezone);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const useGlobalHours = helpers.toBool(req.body.use_global_hours, false) ? 1 : 0;
      const useDeliveryHours = helpers.toBool(req.body.use_delivery_hours, false) ? 1 : 0;
      const hoursPayload = Array.isArray(req.body.hours) ? req.body.hours : null;
      const deliveryHoursPayload = Array.isArray(req.body.delivery_hours) ? req.body.delivery_hours : null;

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!name) {
        return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      }

      if (!timezone) {
        const [tenantRows] = await db.query(
          'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        timezone = tenantRows?.[0]?.timezone || null;
      }

      const nextId = await getNextStoreId(tenantId);
      const code = codeInput || `store-${nextId}`;
      const [exists] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? LIMIT 1',
        [tenantId, code]
      );
      if (exists.length) {
        return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
      }

      await db.query(
        'INSERT INTO ten_stores (tenant_id, id, code, name, address, city, phone, timezone, is_active, use_global_hours, use_delivery_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [tenantId, nextId, code, name, address, city, phone, timezone, isActive, useGlobalHours, useDeliveryHours]
      );

      if (hoursPayload !== null) {
        await saveStoreHours(tenantId, nextId, hoursPayload);
      }
      if (deliveryHoursPayload !== null) {
        await saveStoreDeliveryHours(tenantId, nextId, deliveryHoursPayload);
      }

      const store = await fetchStoreWithHours(tenantId, nextId);
      res.json({ ok: true, store });
      } catch (err) {
        console.error('Ошибка создания Филиалы:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });

    router.patch('/stores/:id', async (req, res) => {
      try {
        const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
        const id = helpers.numOrNull(req.params.id);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
        if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

        const [existingRows] = await db.query(
          'SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        if (!existingRows.length) {
          return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
        }
        const existing = existingRows[0];

        const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
        const code = req.body.code !== undefined ? helpers.strOrNull(req.body.code) : undefined;
        const address = req.body.address !== undefined ? helpers.strOrNull(req.body.address) : undefined;
        const city = req.body.city !== undefined ? helpers.strOrNull(req.body.city) : undefined;
        const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
        const timezone = req.body.timezone !== undefined ? helpers.strOrNull(req.body.timezone) : undefined;
        const useGlobalHours = req.body.use_global_hours !== undefined ? (helpers.toBool(req.body.use_global_hours, false) ? 1 : 0) : undefined;
        const useDeliveryHours = req.body.use_delivery_hours !== undefined ? (helpers.toBool(req.body.use_delivery_hours, false) ? 1 : 0) : undefined;
        const hoursPayload = Array.isArray(req.body.hours) ? req.body.hours : null;
        const deliveryHoursPayload = Array.isArray(req.body.delivery_hours) ? req.body.delivery_hours : null;
        const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;

        if (name !== undefined && !name) {
          return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
        }

        if (code !== undefined && code !== existing.code) {
          if (code) {
            const [exists] = await db.query(
              'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? AND id<>? LIMIT 1',
              [tenantId, code, id]
            );
            if (exists.length) {
              return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
            }
          }
        }

        const updates = [];
        const params = [];
        if (name !== undefined) {
          updates.push('name=?');
          params.push(name);
        }
        if (code !== undefined) {
          updates.push('code=?');
          params.push(code);
        }
        if (address !== undefined) {
          updates.push('address=?');
          params.push(address);
        }
        if (city !== undefined) {
          updates.push('city=?');
          params.push(city);
        }
        if (phone !== undefined) {
          updates.push('phone=?');
          params.push(phone);
        }
        if (timezone !== undefined) {
          updates.push('timezone=?');
          params.push(timezone);
        }
        if (isActive !== undefined) {
          updates.push('is_active=?');
          params.push(isActive);
        }
        if (useGlobalHours !== undefined) {
          updates.push('use_global_hours=?');
          params.push(useGlobalHours);
        }
        if (useDeliveryHours !== undefined) {
          updates.push('use_delivery_hours=?');
          params.push(useDeliveryHours);
        }

        if (updates.length) {
          params.push(tenantId, id);
          await db.query(
            `UPDATE ten_stores SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
            params
          );
        }

        if (hoursPayload !== null) {
          await saveStoreHours(tenantId, id, hoursPayload);
        }
        if (deliveryHoursPayload !== null) {
          await saveStoreDeliveryHours(tenantId, id, deliveryHoursPayload);
        }

        const store = await fetchStoreWithHours(tenantId, id);
        res.json({ ok: true, store });
      } catch (err) {
        console.error('Ошибка обновления Филиалы:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });


    // ------------------------------
  // Order settings lists (tenant-level)
  // ------------------------------
  router.get('/order-statuses', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_final
         FROM order_statuses
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения списка статусов:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-payments', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active
         FROM order_payments
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения способов оплаты:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-delivery-types', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_default
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения способов получения:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-time-options', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, description, sort, is_active,
                has_time_window, starts_at, ends_at, step_minutes, lead_minutes
         FROM order_time_options
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения интервалов времени:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function patchListItem(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });

      const title = req.body.title !== undefined ? helpers.strOrNull(req.body.title) : undefined;
      const icon = cfg.hasIcon !== false && req.body.icon !== undefined ? helpers.strOrNull(req.body.icon) : undefined;
      const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;
      const isFinal = cfg.hasFinal && req.body.is_final !== undefined ? (helpers.toBool(req.body.is_final, false) ? 1 : 0) : undefined;
      const defaultField = cfg.defaultField;
      const isDefault = defaultField && req.body[defaultField] !== undefined
        ? (helpers.toBool(req.body[defaultField], false) ? 1 : 0)
        : undefined;
      const patchFields = cfg.patchFields || {};

      const updates = [];
      const params = [];
      if (title !== undefined) {
        updates.push('title=?');
        params.push(title);
      }
      if (icon !== undefined) {
        updates.push('icon=?');
        params.push(icon);
      }
      if (isActive !== undefined) {
        updates.push('is_active=?');
        params.push(isActive);
      }
      if (isFinal !== undefined) {
        updates.push('is_final=?');
        params.push(isFinal);
      }
      if (isDefault !== undefined) {
        updates.push(`${defaultField}=?`);
        params.push(isDefault);
      }

      for (const [field, parser] of Object.entries(patchFields)) {
        if (req.body[field] !== undefined) {
          updates.push(`${field}=?`);
          params.push(parser(req.body[field]));
        }
      }

      if (!updates.length) {
        return res.json({ ok: true });
      }

      if (isDefault === 1) {
        await db.query(
          `UPDATE ${cfg.table} SET ${defaultField}=0
           WHERE tenant_id=? AND store_id=1 AND id!=?`,
          [tenantId, id]
        );
      }

      params.push(tenantId, id);
      await db.query(
        `UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE tenant_id=? AND store_id=1 AND id=?`,
        params
      );

      const baseFields = ['id', 'code', 'title'];
      if (cfg.hasIcon !== false) baseFields.push('icon');
      baseFields.push('sort', 'is_active');
      if (cfg.hasFinal) baseFields.push('is_final');
      if (cfg.defaultField) baseFields.push(cfg.defaultField);
      if (cfg.detailFields) baseFields.push(...cfg.detailFields);
      const fields = baseFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, item: rows[0] || null });
    } catch (err) {
      console.error('Ошибка обновления списка:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.patch('/order-statuses/:id', (req, res) => patchListItem(req, res, 'order-statuses'));
  router.patch('/order-payments/:id', (req, res) => patchListItem(req, res, 'order-payments'));
  router.patch('/order-delivery-types/:id', (req, res) => patchListItem(req, res, 'order-delivery'));
  router.patch('/order-time-options/:id', (req, res) => patchListItem(req, res, 'order-time-options'));

  async function reorderList(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });

      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((v) => Number.isFinite(v) && v > 0) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: 'IDS_REQUIRED' });

      const caseParts = [];
      const params = [];
      ids.forEach((id, idx) => {
        caseParts.push('WHEN ? THEN ?');
        params.push(id, (idx + 1) * 10);
      });
      const inSql = ids.map(() => '?').join(',');
      params.push(tenantId, ...ids);

      await db.query(
        `UPDATE ${cfg.table} SET sort = CASE id ${caseParts.join(' ')} ELSE sort END
         WHERE tenant_id=? AND store_id=1 AND id IN (${inSql})`,
        params
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Ошибка сохранения сортировки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.post('/order-statuses/reorder', (req, res) => reorderList(req, res, 'order-statuses'));
  router.post('/order-payments/reorder', (req, res) => reorderList(req, res, 'order-payments'));
  router.post('/order-delivery-types/reorder', (req, res) => reorderList(req, res, 'order-delivery'));
  router.post('/order-time-options/reorder', (req, res) => reorderList(req, res, 'order-time-options'));

  const listIconStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'lists');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const listIconUpload = multer({
    storage: listIconStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/list-icon', listIconUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const type = helpers.strOrNull(req.body.type);
      const id = helpers.numOrNull(req.body.id);
      const file = req.file;
      const cfg = getListConfig(type);

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
      if (cfg.hasIcon === false) return res.status(400).json({ ok: false, error: 'ICON_NOT_SUPPORTED' });

      // Создаём WebP-вариант иконки списка (оригинал остаётся как fallback)
      await helpers.ensureWebpVariant(
        file.path ||
          path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'lists', file.filename)
      );

      const url = `/static/uploads/tenants/${tenantId}/lists/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;
      await db.query(
        `UPDATE ${cfg.table} SET icon=? WHERE tenant_id=? AND store_id=1 AND id=?`,
        [url, tenantId, id]
      );

      const baseIconFields = ['id', 'code', 'title', 'icon', 'sort', 'is_active'];
      if (cfg.hasFinal) baseIconFields.push('is_final');
      if (cfg.defaultField) baseIconFields.push(cfg.defaultField);
      const fields = baseIconFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, url, item: rows[0] || null });
    } catch (err) {
      console.error('Ошибка загрузки иконки:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Delivery Settings CRUD
  // ------------------------------

  /**
   * GET /api/admin/tenant/delivery-settings
   * Возвращает список настроек доставки с привязанными филиалами
   */
  router.get('/delivery-settings', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [settings] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );

      // Получаем связи с филиалами
      const settingIds = settings.map(s => s.id);
      let storeLinks = [];
      if (settingIds.length) {
        const placeholders = settingIds.map(() => '?').join(',');
        const [links] = await db.query(
          `SELECT delivery_setting_id, store_id
           FROM ten_delivery_settings_stores
           WHERE tenant_id=? AND delivery_setting_id IN (${placeholders})`,
          [tenantId, ...settingIds]
        );
        storeLinks = links;
      }

      // Группируем store_id по delivery_setting_id
      const storeMap = new Map();
      storeLinks.forEach(link => {
        if (!storeMap.has(link.delivery_setting_id)) {
          storeMap.set(link.delivery_setting_id, []);
        }
        storeMap.get(link.delivery_setting_id).push(link.store_id);
      });

      const enriched = settings.map(s => ({
        ...s,
        store_ids: storeMap.get(s.id) || [],
        default_store_id: s.default_store_id != null ? Number(s.default_store_id) : null
      }));

      res.json({ ok: true, items: enriched });
    } catch (err) {
      console.error('Ошибка получения настроек доставки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/delivery-settings
   * Создаёт новую настройку доставки
   * body: { name, delivery_cost, min_order_amount, free_delivery_from, is_active, store_ids }
   */
  router.post('/delivery-settings', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const deliveryCost = helpers.numOrNull(req.body.delivery_cost) ?? 0;
      const minOrderAmount = helpers.numOrNull(req.body.min_order_amount) ?? 0;
      const freeDeliveryFrom = helpers.numOrNull(req.body.free_delivery_from);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const storeIds = Array.isArray(req.body.store_ids)
        ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0)
        : [];
      let defaultStoreId = helpers.numOrNull(req.body.default_store_id);
      if (defaultStoreId != null && !storeIds.includes(defaultStoreId)) defaultStoreId = null;

      const [result] = await db.query(
        `INSERT INTO ten_delivery_settings (tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, name, deliveryCost, minOrderAmount, freeDeliveryFrom, defaultStoreId, isActive]
      );

      const newId = result.insertId;

      // Сохраняем связи с филиалами
      if (storeIds.length) {
        const linkValues = storeIds.map(storeId => [newId, storeId, tenantId]);
        const linkPlaceholders = linkValues.map(() => '(?, ?, ?)').join(',');
        await db.query(
          `INSERT INTO ten_delivery_settings_stores (delivery_setting_id, store_id, tenant_id) VALUES ${linkPlaceholders}`,
          linkValues.flat()
        );
      }

      const [rows] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, newId]
      );

      res.json({ ok: true, item: { ...rows[0], store_ids: storeIds, default_store_id: defaultStoreId } });
    } catch (err) {
      console.error('Ошибка создания настройки доставки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/tenant/delivery-settings/:id
   * Обновляет настройку доставки
   */
  router.put('/delivery-settings/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      // Проверяем существование
      const [existing] = await db.query(
        'SELECT id FROM ten_delivery_settings WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!existing.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const updates = [];
      const params = [];

      if (req.body.name !== undefined) {
        const name = helpers.strOrNull(req.body.name);
        if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
        updates.push('name=?');
        params.push(name);
      }
      if (req.body.delivery_cost !== undefined) {
        updates.push('delivery_cost=?');
        params.push(helpers.numOrNull(req.body.delivery_cost) ?? 0);
      }
      if (req.body.min_order_amount !== undefined) {
        updates.push('min_order_amount=?');
        params.push(helpers.numOrNull(req.body.min_order_amount) ?? 0);
      }
      if (req.body.free_delivery_from !== undefined) {
        updates.push('free_delivery_from=?');
        params.push(helpers.numOrNull(req.body.free_delivery_from));
      }
      if (req.body.is_active !== undefined) {
        updates.push('is_active=?');
        params.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }
      if (req.body.default_store_id !== undefined) {
        let storeIds = req.body.store_ids !== undefined
          ? (Array.isArray(req.body.store_ids) ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0) : [])
          : null;
        if (storeIds === null) {
          const [links] = await db.query(
            'SELECT store_id FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
            [tenantId, id]
          );
          storeIds = links.map(l => l.store_id);
        }
        let defaultStoreId = helpers.numOrNull(req.body.default_store_id);
        if (defaultStoreId != null && storeIds.length && !storeIds.includes(defaultStoreId)) defaultStoreId = null;
        updates.push('default_store_id=?');
        params.push(defaultStoreId);
      }

      if (updates.length) {
        params.push(tenantId, id);
        await db.query(
          `UPDATE ten_delivery_settings SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
          params
        );
      }

      // Обновляем связи с филиалами
      if (req.body.store_ids !== undefined) {
        const storeIds = Array.isArray(req.body.store_ids)
          ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0)
          : [];

        await db.query(
          'DELETE FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
          [tenantId, id]
        );

        if (storeIds.length) {
          const linkValues = storeIds.map(storeId => [id, storeId, tenantId]);
          const linkPlaceholders = linkValues.map(() => '(?, ?, ?)').join(',');
          await db.query(
            `INSERT INTO ten_delivery_settings_stores (delivery_setting_id, store_id, tenant_id) VALUES ${linkPlaceholders}`,
            linkValues.flat()
          );
        }
      }

      // Возвращаем обновлённую запись
      const [rows] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, id]
      );

      const [links] = await db.query(
        'SELECT store_id FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
        [tenantId, id]
      );

      const storeIds = links.map(l => l.store_id);
      const item = rows[0];
      res.json({ ok: true, item: { ...item, store_ids: storeIds, default_store_id: item.default_store_id != null ? Number(item.default_store_id) : null } });
    } catch (err) {
      console.error('Ошибка обновления настройки доставки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/delivery-settings/:id
   * Удаляет настройку доставки
   */
  router.delete('/delivery-settings/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      // Удаляем связи
      await db.query(
        'DELETE FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
        [tenantId, id]
      );

      // Удаляем настройку
      await db.query(
        'DELETE FROM ten_delivery_settings WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Ошибка удаления настройки доставки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/print-api?store_id=1
   * Возвращает токен для печати по филиалу
   */
  router.get('/print-api', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = Number(req.query.store_id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      }
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, token, is_active, created_at, updated_at, last_used_at,
                printer_name, agent_name, agent_version, last_heartbeat_at, agent_running,
                IF(
                  agent_running=1
                  AND last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS printer_online
         FROM print_api_tokens
         WHERE tenant_id=? AND store_id=? LIMIT 1`,
        [tenantId, storeId]
      );
      res.json({ ok: true, data: rows[0] || null });
    } catch (err) {
      console.error('Ошибка получения print API:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/print-api
   * body: { store_id }
   * Создаёт или пересоздаёт токен для печати
   */
  router.post('/print-api', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = Number(req.body?.store_id || req.query?.store_id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      }
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const token = makePrintApiToken();
      await db.query(
        `INSERT INTO print_api_tokens (tenant_id, store_id, token, is_active)
         VALUES (?,?,?,1)
         ON DUPLICATE KEY UPDATE
           token=VALUES(token),
           is_active=1,
           updated_at=NOW(),
           printer_name=NULL,
           agent_name=NULL,
           agent_version=NULL,
           last_heartbeat_at=NULL,
           agent_running=0`,
        [tenantId, storeId, token]
      );

      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, token, is_active, created_at, updated_at, last_used_at,
                printer_name, agent_name, agent_version, last_heartbeat_at, agent_running,
                IF(
                  agent_running=1
                  AND last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS printer_online
         FROM print_api_tokens
         WHERE tenant_id=? AND store_id=? LIMIT 1`,
        [tenantId, storeId]
      );
      res.json({ ok: true, data: rows[0] || null });
    } catch (err) {
      console.error('Ошибка генерации print API:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/password
   * body: { password, password_confirm }
   */
  router.post('/password', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const password = helpers.strOrNull(req.body.password);
      const confirm = helpers.strOrNull(req.body.password_confirm);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }
      if (password !== confirm) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_MISMATCH' });
      }

      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE ten_tenants SET password_hash=? WHERE id=?',
        [hash, tenantId]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Ошибка смены пароля tenant:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Telegram: привязка чатов к филиалам
  // ------------------------------

  /**
   * POST /api/admin/tenant/stores/:id/telegram/connect
   * Генерирует одноразовую ссылку для привязки чата к филиалу.
   */
  router.post('/stores/:id/telegram/connect', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });

      const [storeRows] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (!storeRows.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const token = crypto.randomBytes(24).toString('hex');
      const secretKey = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.query(
        `INSERT INTO ten_store_telegram (tenant_id, store_id, connect_token, connect_token_expires_at, secret_key) VALUES (?, ?, ?, ?, ?)`,
        [tenantId, storeId, token, expiresAt, secretKey]
      );

      const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '').trim();
      const link = botUsername ? `https://t.me/${botUsername}?start=${token}` : null;

      res.json({ ok: true, token, link, expires_at: expiresAt.toISOString() });
    } catch (err) {
      console.error('Telegram connect:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/stores/:id/telegram/add-by-keys
   * Подключить чат по API key (chat_id) и Secret key из бота (как у Тильды).
   */
  router.post('/stores/:id/telegram/add-by-keys', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      const apiKey = req.body.api_key != null ? String(req.body.api_key).trim() : '';
      const secretKey = req.body.secret_key != null ? String(req.body.secret_key).trim() : '';
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });
      if (!apiKey || !secretKey) return res.status(400).json({ ok: false, error: 'API_KEY_AND_SECRET_REQUIRED' });

      const chatId = Number(apiKey);
      if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'INVALID_API_KEY' });

      const [storeRows] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (!storeRows.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const [pending] = await db.query(
        'SELECT id, telegram_chat_id FROM ten_telegram_pending WHERE secret_key=? AND expires_at > NOW() LIMIT 1',
        [secretKey]
      );
      if (!pending.length) return res.status(400).json({ ok: false, error: 'SECRET_INVALID_OR_EXPIRED' });
      const row = pending[0];
      if (Number(row.telegram_chat_id) !== chatId) return res.status(400).json({ ok: false, error: 'API_KEY_MISMATCH' });

      const [existing] = await db.query(
        'SELECT id FROM ten_store_telegram WHERE tenant_id=? AND store_id=? AND telegram_chat_id=? LIMIT 1',
        [tenantId, storeId, chatId]
      );
      await db.query('DELETE FROM ten_telegram_pending WHERE id=?', [row.id]);
      if (existing.length) {
        return res.json({ ok: true });
      }

      await db.query(
        'INSERT INTO ten_store_telegram (tenant_id, store_id, telegram_chat_id, secret_key) VALUES (?, ?, ?, ?)',
        [tenantId, storeId, chatId, secretKey]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Telegram add-by-keys:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/stores/:id/telegram
   * Список привязок Telegram для филиала.
   */
  router.get('/stores/:id/telegram', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });

      const [rows] = await db.query(
        `SELECT t.id, t.telegram_chat_id, t.secret_key, t.label, t.created_at
         FROM ten_store_telegram t
         INNER JOIN (
           SELECT telegram_chat_id, MAX(id) AS max_id
           FROM ten_store_telegram
           WHERE tenant_id=? AND store_id=? AND telegram_chat_id IS NOT NULL
           GROUP BY tenant_id, store_id, telegram_chat_id
         ) g ON t.telegram_chat_id = g.telegram_chat_id AND t.id = g.max_id
         WHERE t.tenant_id=? AND t.store_id=?
         ORDER BY t.id DESC`,
        [tenantId, storeId, tenantId, storeId]
      );
      const bindings = rows.map((r) => ({
        id: r.id,
        telegram_chat_id: r.telegram_chat_id,
        secret_key: r.secret_key || null,
        label: r.label,
        created_at: r.created_at
      }));

      res.json({ ok: true, bindings });
    } catch (err) {
      console.error('Telegram list:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/stores/:storeId/telegram/:bindingId
   * Удалить привязку.
   */
  router.delete('/stores/:storeId/telegram/:bindingId', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.storeId);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      if (!tenantId || !storeId || !bindingId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      const [result] = await db.query(
        'DELETE FROM ten_store_telegram WHERE id=? AND tenant_id=? AND store_id=? AND telegram_chat_id IS NOT NULL',
        [bindingId, tenantId, storeId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      res.json({ ok: true });
    } catch (err) {
      console.error('Telegram delete:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/notifications
   * Сводка по всем филиалам: есть ли привязка Telegram.
   */
  router.get('/notifications', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [stores] = await db.query(
        'SELECT tenant_id, id, name, code FROM ten_stores WHERE tenant_id=? ORDER BY id ASC',
        [tenantId]
      );
      const [bindings] = await db.query(
        `SELECT store_id, COUNT(*) AS cnt FROM ten_store_telegram
         WHERE tenant_id=? AND telegram_chat_id IS NOT NULL GROUP BY store_id`,
        [tenantId]
      );
      const countByStore = new Map(bindings.map((b) => [Number(b.store_id), Number(b.cnt)]));

      const storesWithTelegram = stores.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        telegram_count: countByStore.get(s.id) || 0
      }));

      res.json({ ok: true, stores: storesWithTelegram });
    } catch (err) {
      console.error('Notifications overview:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Глобальные Telegram-уведомления на уровне компании
  // ------------------------------

  /**
   * GET /api/admin/tenant/telegram
   * Список глобальных Telegram привязок компании + филиалы со статусами.
   */
  router.get('/telegram', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [bindings] = await db.query(
        `SELECT id, telegram_chat_id, secret_key, label, created_at
         FROM ten_tenant_telegram
         WHERE tenant_id=? AND telegram_chat_id IS NOT NULL
         ORDER BY id DESC`,
        [tenantId]
      );

      const [stores] = await db.query(
        'SELECT id, name, code FROM ten_stores WHERE tenant_id=? ORDER BY id ASC',
        [tenantId]
      );

      // Для каждой привязки получаем включённые филиалы
      for (const b of bindings) {
        const [enabledStores] = await db.query(
          `SELECT store_id, is_enabled FROM ten_tenant_telegram_stores
           WHERE tenant_telegram_id=?`,
          [b.id]
        );
        b.store_settings = enabledStores.map(s => ({
          store_id: s.store_id,
          is_enabled: Number(s.is_enabled) === 1
        }));
      }

      res.json({
        ok: true,
        bindings: bindings.map(b => ({
          id: b.id,
          telegram_chat_id: b.telegram_chat_id,
          secret_key: b.secret_key || null,
          label: b.label,
          created_at: b.created_at,
          store_settings: b.store_settings || []
        })),
        stores: stores.map(s => ({ id: s.id, name: s.name, code: s.code }))
      });
    } catch (err) {
      console.error('Tenant telegram list:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/telegram/add-by-keys
   * Подключить глобальный Telegram по API key и Secret key.
   */
  router.post('/telegram/add-by-keys', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const apiKey = req.body.api_key != null ? String(req.body.api_key).trim() : '';
      const secretKey = req.body.secret_key != null ? String(req.body.secret_key).trim() : '';
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!apiKey || !secretKey) return res.status(400).json({ ok: false, error: 'API_KEY_AND_SECRET_REQUIRED' });

      const chatId = Number(apiKey);
      if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'API_KEY_INVALID' });

      // Проверяем secret_key в pending
      const [pending] = await db.query(
        'SELECT id, telegram_chat_id FROM ten_telegram_pending WHERE secret_key=? AND expires_at > NOW() LIMIT 1',
        [secretKey]
      );
      if (!pending.length) return res.status(400).json({ ok: false, error: 'SECRET_INVALID_OR_EXPIRED' });
      const row = pending[0];
      if (Number(row.telegram_chat_id) !== chatId) return res.status(400).json({ ok: false, error: 'API_KEY_MISMATCH' });

      // Проверяем, не привязан ли уже этот чат
      const [existing] = await db.query(
        'SELECT id FROM ten_tenant_telegram WHERE tenant_id=? AND telegram_chat_id=? LIMIT 1',
        [tenantId, chatId]
      );
      await db.query('DELETE FROM ten_telegram_pending WHERE id=?', [row.id]);
      if (existing.length) {
        return res.json({ ok: true, id: existing[0].id });
      }

      const [result] = await db.query(
        'INSERT INTO ten_tenant_telegram (tenant_id, telegram_chat_id, secret_key) VALUES (?, ?, ?)',
        [tenantId, chatId, secretKey]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (err) {
      console.error('Tenant telegram add-by-keys:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/telegram/:bindingId
   * Удалить глобальную привязку.
   */
  router.delete('/telegram/:bindingId', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      if (!tenantId || !bindingId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      const [result] = await db.query(
        'DELETE FROM ten_tenant_telegram WHERE id=? AND tenant_id=?',
        [bindingId, tenantId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      res.json({ ok: true });
    } catch (err) {
      console.error('Tenant telegram delete:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/telegram/:bindingId/stores
   * Обновить настройки филиалов для глобальной привязки.
   * Body: { store_id: number, is_enabled: boolean }
   */
  router.post('/telegram/:bindingId/stores', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      const storeId = helpers.numOrNull(req.body.store_id);
      const isEnabled = req.body.is_enabled === true || req.body.is_enabled === 1;
      if (!tenantId || !bindingId || !storeId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      // Проверяем, что привязка принадлежит tenant
      const [binding] = await db.query(
        'SELECT id FROM ten_tenant_telegram WHERE id=? AND tenant_id=? LIMIT 1',
        [bindingId, tenantId]
      );
      if (!binding.length) return res.status(404).json({ ok: false, error: 'BINDING_NOT_FOUND' });

      // Проверяем, что филиал принадлежит tenant
      const [store] = await db.query(
        'SELECT id FROM ten_stores WHERE id=? AND tenant_id=? LIMIT 1',
        [storeId, tenantId]
      );
      if (!store.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      if (isEnabled) {
        // Upsert: добавляем или обновляем
        await db.query(
          `INSERT INTO ten_tenant_telegram_stores (tenant_telegram_id, store_id, is_enabled)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_enabled=1`,
          [bindingId, storeId]
        );
      } else {
        // Удаляем запись (или можно обновить is_enabled=0)
        await db.query(
          'DELETE FROM ten_tenant_telegram_stores WHERE tenant_telegram_id=? AND store_id=?',
          [bindingId, storeId]
        );
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Tenant telegram stores update:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ───────── Проверка подключения домена ─────────
  router.post('/check-domain', async (req, res) => {
    try {
      const domain = req.body.domain ? String(req.body.domain).trim().toLowerCase() : '';
      if (!domain) return res.json({ ok: false, error: 'NO_DOMAIN' });

      const dns = require('dns').promises;
      const http = require('http');
      const https = require('https');

      const result = { dns: false, http: false, ssl: false, dns_detail: '', http_detail: '', ssl_detail: '' };

      // 1. DNS check — resolve domain
      try {
        const addresses = await dns.resolve4(domain);
        if (addresses && addresses.length) {
          result.dns = true;
          result.dns_detail = addresses.join(', ');
        }
      } catch (e) {
        result.dns_detail = e.code === 'ENOTFOUND' ? 'Домен не найден' : (e.message || 'Ошибка DNS');
      }

      // 2. HTTP check — try to reach the domain
      if (result.dns) {
        try {
          await new Promise((resolve, reject) => {
            const req2 = http.get({ hostname: domain, port: 80, path: '/', timeout: 5000 }, (resp) => {
              resolve(resp.statusCode);
            });
            req2.on('error', reject);
            req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
          });
          result.http = true;
          result.http_detail = 'Сайт доступен';
        } catch (e) {
          result.http_detail = 'Сайт недоступен';
        }
      } else {
        result.http_detail = 'DNS не настроен';
      }

      // 3. SSL check — try HTTPS connection
      if (result.dns) {
        try {
          await new Promise((resolve, reject) => {
            const req2 = https.get({ hostname: domain, port: 443, path: '/', timeout: 5000, rejectUnauthorized: true }, (resp) => {
              resolve(resp.statusCode);
            });
            req2.on('error', reject);
            req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
          });
          result.ssl = true;
          result.ssl_detail = 'Сертификат действителен';
        } catch (e) {
          if (e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'CERT_HAS_EXPIRED' || e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            result.ssl_detail = 'Сертификат недействителен';
          } else if (e.message === 'timeout') {
            result.ssl_detail = 'Таймаут соединения';
          } else {
            result.ssl_detail = 'SSL не настроен';
          }
        }
      } else {
        result.ssl_detail = 'DNS не настроен';
      }

      res.json({ ok: true, result });
    } catch (err) {
      console.error('check-domain error:', err);
      res.status(500).json({ ok: false, error: 'CHECK_FAILED' });
    }
  });

  return router;
};
