const express = require('express');

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strOrNull(value) {
  const text = toText(value);
  return text || null;
}

function themeColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#ff6b00';
}

const STOREFRONT_SETTINGS_DEFAULTS = Object.freeze({
  is_active: false,
  aspect_ratio: '11:5',
  background_color: '#f1e8ff',
  title: 'Получайте больше выгоды',
  title_font_size: 18,
  title_color: '#7651c9',
  description: 'Бесплатная доставка\nДополнительные бонусы\nЭксклюзивные акции',
  description_font_size: 12,
  description_color: '#7651c9',
  image_url: null,
  button_text: 'Смотреть подписки',
  button_color: '#ffffff',
  button_icon_url: null,
  faq_title: 'Часто задаваемые вопросы',
  faq_items: [],
  info_slides: [],
});

function storefrontColor(value, fallback) {
  const color = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  const err = new Error('INVALID_COLOR');
  err.statusCode = 400;
  if (value === undefined || value === null || value === '') return fallback;
  throw err;
}

function normalizeStorefrontSettingsPayload(body = {}) {
  const title = toText(body.title).slice(0, 150);
  const description = String(body.description || '').replace(/\r\n?/g, '\n').trim();
  if (description.split('\n').length > 3) {
    const err = new Error('DESCRIPTION_MAX_THREE_LINES');
    err.statusCode = 400;
    throw err;
  }
  const titleFontSize = Math.floor(Number(body.title_font_size));
  if (!Number.isFinite(titleFontSize) || titleFontSize < 12 || titleFontSize > 48) {
    const err = new Error('INVALID_TITLE_FONT_SIZE');
    err.statusCode = 400;
    throw err;
  }
  const descriptionFontSize = Math.floor(Number(body.description_font_size));
  if (!Number.isFinite(descriptionFontSize) || descriptionFontSize < 10 || descriptionFontSize > 24) {
    const err = new Error('INVALID_DESCRIPTION_FONT_SIZE');
    err.statusCode = 400;
    throw err;
  }
  const faqItems = Array.isArray(body.faq_items) ? body.faq_items.slice(0, 100).map((item) => ({
    id: toText(item?.id).slice(0, 80),
    question: toText(item?.question).slice(0, 300),
    answer: toText(item?.answer).slice(0, 2000),
  })).filter((item) => item.question || item.answer) : [];
  const infoSlides = Array.isArray(body.info_slides) ? body.info_slides.slice(0, 100).map((item) => ({
    id: toText(item?.id).slice(0, 80),
    image_url: strOrNull(item?.image_url)?.slice(0, 500) || null,
    description: toText(item?.description).slice(0, 1000),
    button_text: toText(item?.button_text).slice(0, 120),
    button_color: storefrontColor(item?.button_color, '#ff6b00'),
    button_text_color: storefrontColor(item?.button_text_color, '#ffffff'),
    show_description: item?.show_description !== false,
    show_button: item?.show_button !== false,
    show_shadow: item?.show_shadow !== false,
    event_enabled: item?.event_enabled === true,
    event_type: ['none', 'notification', 'link'].includes(String(item?.event_type || '')) ? String(item.event_type) : 'none',
    event_url: strOrNull(item?.event_url)?.slice(0, 1000) || null,
    duration_seconds: Math.min(60, Math.max(1, Math.floor(Number(item?.duration_seconds || 5)))),
  })) : [];
  return {
    is_active: boolFlag(body.is_active, false) ? 1 : 0,
    aspect_ratio: '11:5',
    background_color: storefrontColor(body.background_color, STOREFRONT_SETTINGS_DEFAULTS.background_color),
    title,
    title_font_size: titleFontSize,
    title_color: storefrontColor(body.title_color, STOREFRONT_SETTINGS_DEFAULTS.title_color),
    description: description.slice(0, 500) || null,
    description_font_size: descriptionFontSize,
    description_color: storefrontColor(body.description_color, STOREFRONT_SETTINGS_DEFAULTS.description_color),
    image_url: strOrNull(body.image_url)?.slice(0, 500) || null,
    button_text: toText(body.button_text).slice(0, 80),
    button_color: storefrontColor(body.button_color, STOREFRONT_SETTINGS_DEFAULTS.button_color),
    button_icon_url: strOrNull(body.button_icon_url)?.slice(0, 500) || null,
    faq_title: toText(body.faq_title).slice(0, 150) || STOREFRONT_SETTINGS_DEFAULTS.faq_title,
    faq_items_json: JSON.stringify(faqItems),
    info_slides_json: JSON.stringify(infoSlides),
  };
}

function mapStorefrontSettings(row) {
  if (!row) return { ...STOREFRONT_SETTINGS_DEFAULTS };
  let faqItems = [];
  let infoSlides = [];
  try { faqItems = row.faq_items_json ? JSON.parse(row.faq_items_json) : []; } catch (error) { faqItems = []; }
  try { infoSlides = row.info_slides_json ? JSON.parse(row.info_slides_json) : []; } catch (error) { infoSlides = []; }
  return {
    ...row,
    id: Number(row.id || 0),
    is_active: Number(row.is_active || 0) === 1,
    title_font_size: Number(row.title_font_size || STOREFRONT_SETTINGS_DEFAULTS.title_font_size),
    description_font_size: Number(row.description_font_size || STOREFRONT_SETTINGS_DEFAULTS.description_font_size),
    faq_title: String(row.faq_title || STOREFRONT_SETTINGS_DEFAULTS.faq_title),
    faq_items: Array.isArray(faqItems) ? faqItems : [],
    info_slides: Array.isArray(infoSlides) ? infoSlides : [],
  };
}

function boolFlag(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err = new Error('INVALID_NUMBER');
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

function positiveInt(value, fallback = 1) {
  const parsed = nonNegativeNumber(value, fallback);
  return Math.max(1, Math.floor(parsed));
}

function boundedInt(value, min, max, fallback) {
  const parsed = positiveInt(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function enumValue(value, allowed, fallback) {
  const text = String(value ?? '').trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeJsonArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeJsonObject(value) {
  const parsed = parseJson(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function mapPlan(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id || 0),
    delivery_count: Number(row.delivery_count || 0),
    items_per_order: Number(row.items_per_order || 0),
    delivery_interval_days: Number(row.delivery_interval_days || 0),
    price_total: Number(row.price_total || 0),
    bonus_reward_value: Number(row.bonus_reward_value || 0),
    sort_order: Number(row.sort_order || 0),
    is_active: Number(row.is_active || 0) === 1,
    items: normalizeJsonArray(row.items_json),
    settings: normalizeJsonObject(row.settings_json),
  };
}

function mapHistory(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id || 0),
    customer_id: Number(row.customer_id || 0),
    plan_id: Number(row.plan_id || 0),
    delivery_completed: Number(row.delivery_completed || 0),
    delivery_total: Number(row.delivery_total || 0),
    paid_amount: Number(row.paid_amount || 0),
    refunded_amount: Number(row.refunded_amount || 0),
    payment_order_id: row.payment_order_id ? Number(row.payment_order_id) : null,
    plan_items: normalizeJsonArray(row.items_json || row.plan_items_json),
    plan_settings: normalizeJsonObject(row.plan_settings_json),
  };
}

function normalizePlanPayload(body = {}) {
  const title = toText(body.title);
  if (!title) {
    const err = new Error('TITLE_REQUIRED');
    err.statusCode = 400;
    throw err;
  }
  const itemsSource = Object.prototype.hasOwnProperty.call(body, 'items_json') ? body.items_json : body.items;
  const settingsSource = Object.prototype.hasOwnProperty.call(body, 'settings_json') ? body.settings_json : body.settings;
  const settings = normalizeJsonObject(settingsSource);
  settings.subscription_mode = enumValue(settings.subscription_mode, ['ready', 'custom'], 'custom');
  settings.day_count_mode = enumValue(settings.day_count_mode, ['fixed', 'customer_select'], 'fixed');
  settings.discount_reward_type = enumValue(settings.discount_reward_type, ['none', 'percent', 'fixed'], 'none');
  settings.discount_reward_value = nonNegativeNumber(settings.discount_reward_value, 0);
  settings.old_price_total = nonNegativeNumber(settings.old_price_total, 0);
  return {
    title: title.slice(0, 150),
    description: strOrNull(body.description),
    icon_url: strOrNull(body.icon_url),
    theme_color: themeColor(body.theme_color),
    delivery_count: positiveInt(body.delivery_count, 1),
    items_per_order: boundedInt(body.items_per_order, 1, 9, 4),
    item_selection_mode: enumValue(body.item_selection_mode, ['exact', 'up_to'], 'up_to'),
    delivery_interval_days: positiveInt(body.delivery_interval_days, 1),
    price_total: nonNegativeNumber(body.price_total, 0),
    bonus_reward_type: enumValue(body.bonus_reward_type, ['none', 'percent', 'fixed'], 'none'),
    bonus_reward_value: nonNegativeNumber(body.bonus_reward_value, 0),
    items_json: JSON.stringify(normalizeJsonArray(itemsSource)),
    settings_json: JSON.stringify(settings),
    sort_order: Math.floor(nonNegativeNumber(body.sort_order, 0)),
    is_active: boolFlag(body.is_active, true) ? 1 : 0,
  };
}

module.exports = function makeAdminSubscriptionsRouter({ db, helpers }) {
  const router = express.Router();

  async function fetchStorefrontSettings(tenantId, storeId) {
    const [[row]] = await db.query(
      `SELECT id, tenant_id, store_id, is_active, aspect_ratio, background_color,
              title, title_font_size, title_color, description, description_font_size,
              description_color, image_url,
              button_text, button_color, button_icon_url, faq_title, faq_items_json, info_slides_json, created_at, updated_at
         FROM mkt_subscription_storefront_settings
        WHERE tenant_id = ? AND store_id = ?
        LIMIT 1`,
      [tenantId, storeId]
    );
    return mapStorefrontSettings(row);
  }

  router.get('/storefront-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      res.json({ ok: true, data: await fetchStorefrontSettings(tenantId, storeId) });
    } catch (err) {
      console.error('GET /api/admin/subscriptions/storefront-settings failed:', err);
      res.status(500).json({ ok: false, error: 'SUBSCRIPTION_STOREFRONT_SETTINGS_ERROR' });
    }
  });

  router.put('/storefront-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const payload = normalizeStorefrontSettingsPayload(req.body);
      await db.query(
        `INSERT INTO mkt_subscription_storefront_settings
          (tenant_id, store_id, is_active, aspect_ratio, background_color, title,
           title_font_size, title_color, description, description_font_size,
           description_color, image_url, button_text, button_color, button_icon_url, faq_title, faq_items_json, info_slides_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_active = VALUES(is_active), aspect_ratio = VALUES(aspect_ratio),
           background_color = VALUES(background_color), title = VALUES(title),
           title_font_size = VALUES(title_font_size), title_color = VALUES(title_color),
           description = VALUES(description), description_font_size = VALUES(description_font_size),
           description_color = VALUES(description_color), image_url = VALUES(image_url),
           button_text = VALUES(button_text), button_color = VALUES(button_color),
           button_icon_url = VALUES(button_icon_url), faq_title = VALUES(faq_title),
           faq_items_json = VALUES(faq_items_json), info_slides_json = VALUES(info_slides_json), updated_at = NOW()`,
        [
          tenantId, storeId, payload.is_active, payload.aspect_ratio,
          payload.background_color, payload.title, payload.title_font_size,
          payload.title_color, payload.description, payload.description_font_size,
          payload.description_color, payload.image_url,
          payload.button_text, payload.button_color, payload.button_icon_url,
          payload.faq_title, payload.faq_items_json, payload.info_slides_json,
        ]
      );
      res.json({ ok: true, data: await fetchStorefrontSettings(tenantId, storeId) });
    } catch (err) {
      console.error('PUT /api/admin/subscriptions/storefront-settings failed:', err);
      res.status(err.statusCode || 500).json({ ok: false, error: err.message || 'SUBSCRIPTION_STOREFRONT_SETTINGS_SAVE_ERROR' });
    }
  });

  async function fetchPlan(tenantId, storeId, id) {
    const [[row]] = await db.query(
      `SELECT id, tenant_id, store_id, title, description, icon_url, theme_color, delivery_count,
              items_per_order, item_selection_mode, delivery_interval_days,
              price_total, bonus_reward_type, bonus_reward_value,
              items_json, settings_json, is_active, sort_order, created_at, updated_at
         FROM mkt_subscription_plans
        WHERE tenant_id = ? AND store_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, storeId, id]
    );
    return mapPlan(row);
  }

  router.get('/plans', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, title, description, icon_url, theme_color, delivery_count,
                items_per_order, item_selection_mode, delivery_interval_days,
                price_total, bonus_reward_type, bonus_reward_value,
                items_json, settings_json, is_active, sort_order, created_at, updated_at
           FROM mkt_subscription_plans
          WHERE tenant_id = ? AND store_id = ?
          ORDER BY sort_order ASC, id ASC`,
        [tenantId, storeId]
      );
      res.json({ ok: true, data: rows.map(mapPlan) });
    } catch (err) {
      console.error('GET /api/admin/subscriptions/plans failed:', err);
      res.status(err.statusCode || 500).json({ ok: false, error: err.message || 'SUBSCRIPTION_PLANS_ERROR' });
    }
  });

  router.post('/plans', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const payload = normalizePlanPayload(req.body);
      const [result] = await db.query(
        `INSERT INTO mkt_subscription_plans
          (tenant_id, store_id, title, description, icon_url, theme_color, delivery_count, items_per_order, item_selection_mode,
           delivery_interval_days, price_total, bonus_reward_type, bonus_reward_value, items_json, settings_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          storeId,
          payload.title,
          payload.description,
          payload.icon_url,
          payload.theme_color,
          payload.delivery_count,
          payload.items_per_order,
          payload.item_selection_mode,
          payload.delivery_interval_days,
          payload.price_total,
          payload.bonus_reward_type,
          payload.bonus_reward_value,
          payload.items_json,
          payload.settings_json,
          payload.is_active,
          payload.sort_order,
        ]
      );
      const plan = await fetchPlan(tenantId, storeId, result.insertId);
      res.status(201).json({ ok: true, data: plan });
    } catch (err) {
      console.error('POST /api/admin/subscriptions/plans failed:', err);
      res.status(err.statusCode || 500).json({ ok: false, error: err.message || 'SUBSCRIPTION_PLAN_CREATE_ERROR' });
    }
  });

  router.put('/plans/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_PLAN_ID' });
      const payload = normalizePlanPayload(req.body);
      const [result] = await db.query(
        `UPDATE mkt_subscription_plans
             SET title = ?, description = ?, icon_url = ?, theme_color = ?, delivery_count = ?, items_per_order = ?,
                item_selection_mode = ?, delivery_interval_days = ?, price_total = ?,
                bonus_reward_type = ?, bonus_reward_value = ?, items_json = ?,
                settings_json = ?, is_active = ?, sort_order = ?, updated_at = NOW()
          WHERE tenant_id = ? AND store_id = ? AND id = ?`,
        [
          payload.title,
          payload.description,
          payload.icon_url,
          payload.theme_color,
          payload.delivery_count,
          payload.items_per_order,
          payload.item_selection_mode,
          payload.delivery_interval_days,
          payload.price_total,
          payload.bonus_reward_type,
          payload.bonus_reward_value,
          payload.items_json,
          payload.settings_json,
          payload.is_active,
          payload.sort_order,
          tenantId,
          storeId,
          id,
        ]
      );
      if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'PLAN_NOT_FOUND' });
      const plan = await fetchPlan(tenantId, storeId, id);
      res.json({ ok: true, data: plan });
    } catch (err) {
      console.error('PUT /api/admin/subscriptions/plans/:id failed:', err);
      res.status(err.statusCode || 500).json({ ok: false, error: err.message || 'SUBSCRIPTION_PLAN_UPDATE_ERROR' });
    }
  });

  router.patch('/plans/:id/status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_PLAN_ID' });
      const isActive = boolFlag(req.body?.is_active, false) ? 1 : 0;
      const [result] = await db.query(
        `UPDATE mkt_subscription_plans
            SET is_active = ?, updated_at = NOW()
          WHERE tenant_id = ? AND store_id = ? AND id = ?`,
        [isActive, tenantId, storeId, id]
      );
      if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'PLAN_NOT_FOUND' });
      res.json({ ok: true, data: await fetchPlan(tenantId, storeId, id) });
    } catch (err) {
      console.error('PATCH /api/admin/subscriptions/plans/:id/status failed:', err);
      res.status(err.statusCode || 500).json({ ok: false, error: err.message || 'SUBSCRIPTION_PLAN_STATUS_ERROR' });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT s.id, s.tenant_id, s.store_id, s.customer_id, s.plan_id, s.status,
                s.delivery_completed, s.delivery_total, s.starts_at, s.ends_at,
                s.payment_status, s.paid_amount, s.refunded_amount, s.payment_order_id,
                s.price_total, s.items_json, s.created_at, s.updated_at,
                COALESCE(c.name, s.customer_name_snapshot) AS customer_name,
                COALESCE(c.phone, s.customer_phone_snapshot) AS customer_phone,
                COALESCE(p.title, s.plan_title_snapshot) AS plan_title,
                p.description AS plan_description, p.items_json AS plan_items_json,
                p.settings_json AS plan_settings_json,
                nd.next_delivery_at,
                po.total_price AS payment_order_total, po.is_paid AS payment_order_is_paid
           FROM mkt_customer_subscriptions s
           LEFT JOIN cust_customers c
             ON c.tenant_id = s.tenant_id AND c.store_id = s.store_id AND c.id = s.customer_id
           LEFT JOIN mkt_subscription_plans p
             ON p.tenant_id = s.tenant_id AND p.store_id = s.store_id AND p.id = s.plan_id
           LEFT JOIN order_orders po
             ON po.tenant_id = s.tenant_id AND po.store_id = s.store_id AND po.id = s.payment_order_id
           LEFT JOIN (
             SELECT subscription_id, MIN(scheduled_at) AS next_delivery_at
               FROM mkt_subscription_deliveries
              WHERE status IN ('planned', 'order_created') AND scheduled_at IS NOT NULL
              GROUP BY subscription_id
           ) nd ON nd.subscription_id = s.id
          WHERE s.tenant_id = ? AND s.store_id = ?
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 500`,
        [tenantId, storeId]
      );
      res.json({ ok: true, data: rows.map(mapHistory) });
    } catch (err) {
      console.error('GET /api/admin/subscriptions/history failed:', err);
      res.status(500).json({ ok: false, error: 'SUBSCRIPTION_HISTORY_ERROR' });
    }
  });

  router.get('/history/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_SUBSCRIPTION_ID' });
      const [[row]] = await db.query(
        `SELECT s.id, s.tenant_id, s.store_id, s.customer_id, s.plan_id, s.status,
                s.delivery_completed, s.delivery_total, s.starts_at, s.ends_at,
                s.payment_status, s.paid_amount, s.refunded_amount, s.payment_order_id,
                s.price_total, s.items_json, s.created_at, s.updated_at,
                COALESCE(c.name, s.customer_name_snapshot) AS customer_name,
                COALESCE(c.phone, s.customer_phone_snapshot) AS customer_phone,
                COALESCE(p.title, s.plan_title_snapshot) AS plan_title,
                p.description AS plan_description, p.items_json AS plan_items_json,
                p.settings_json AS plan_settings_json,
                nd.next_delivery_at,
                po.total_price AS payment_order_total, po.is_paid AS payment_order_is_paid
           FROM mkt_customer_subscriptions s
           LEFT JOIN cust_customers c
             ON c.tenant_id = s.tenant_id AND c.store_id = s.store_id AND c.id = s.customer_id
           LEFT JOIN mkt_subscription_plans p
             ON p.tenant_id = s.tenant_id AND p.store_id = s.store_id AND p.id = s.plan_id
           LEFT JOIN order_orders po
             ON po.tenant_id = s.tenant_id AND po.store_id = s.store_id AND po.id = s.payment_order_id
           LEFT JOIN (
             SELECT subscription_id, MIN(scheduled_at) AS next_delivery_at
               FROM mkt_subscription_deliveries
              WHERE status IN ('planned', 'order_created') AND scheduled_at IS NOT NULL
              GROUP BY subscription_id
           ) nd ON nd.subscription_id = s.id
          WHERE s.tenant_id = ? AND s.store_id = ? AND s.id = ?
          LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!row) return res.status(404).json({ ok: false, error: 'SUBSCRIPTION_NOT_FOUND' });
      const [deliveries] = await db.query(
        `SELECT d.id, d.subscription_id, d.sequence_no, d.status, d.scheduled_at, d.completed_at,
                d.order_id, d.created_at, d.updated_at,
                o.total_price AS order_total, o.is_paid AS order_is_paid, o.created_at AS order_created_at,
                os.title AS order_status_title, os.code AS order_status_code
           FROM mkt_subscription_deliveries d
           LEFT JOIN order_orders o
             ON o.tenant_id = ? AND o.store_id = ? AND o.id = d.order_id
           LEFT JOIN order_statuses os
             ON os.tenant_id = o.tenant_id AND os.store_id = o.store_id AND os.id = o.status_id
          WHERE d.subscription_id = ?
          ORDER BY d.sequence_no ASC, d.id ASC`,
        [tenantId, storeId, id]
      );
      res.json({
        ok: true,
        data: {
          subscription: mapHistory(row),
          deliveries: deliveries.map((item) => ({
            ...item,
            id: Number(item.id || 0),
            subscription_id: Number(item.subscription_id || 0),
            sequence_no: Number(item.sequence_no || 0),
            order_id: item.order_id ? Number(item.order_id) : null,
            order_total: Number(item.order_total || 0),
          })),
        },
      });
    } catch (err) {
      console.error('GET /api/admin/subscriptions/history/:id failed:', err);
      res.status(500).json({ ok: false, error: 'SUBSCRIPTION_HISTORY_DETAIL_ERROR' });
    }
  });

  return router;
};
