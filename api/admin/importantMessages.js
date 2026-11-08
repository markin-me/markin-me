const express = require('express');
const crypto = require('crypto');
const {
  createRun: createCampaignRun,
  ensureCampaignScheduleSchema,
  refreshCampaignLifecycle,
} = require('../campaignDelivery');
const { getTenantBotConfig } = require('../messengerDelivery');
const { fetchBotIdentity } = require('../messengerBotContacts');
const { sendImportantMessagePush } = require('../importantMessagePush');

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeMessageType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'discount' || normalized === 'post' || normalized === 'news') return normalized;
  return 'news';
}

function normalizePromoCodeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'shared' || normalized === 'unique') return normalized;
  return 'none';
}

function normalizeActionType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'promo_code' || normalized === 'product' || normalized === 'product_collection') return normalized;
  return 'none';
}

function normalizePositiveInt(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizePublicationChannels(value, fallback = ['storefront']) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const aliases = { site: 'storefront', storefront: 'storefront', telegram: 'telegram', tg: 'telegram', max: 'max' };
  const channels = Array.from(new Set(source
    .map((item) => aliases[String(item || '').trim().toLowerCase()])
    .filter(Boolean)));
  return channels.length ? channels : fallback.slice();
}

function normalizeRecipientIds(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(normalizePositiveInt)
    .filter(Boolean)));
}

function getZonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedLocalToUtc(value, timezone) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let result = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = getZonedParts(new Date(result), timezone).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    const rendered = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4]), Number(parts[5]));
    result += target - rendered;
  }
  const date = new Date(result);
  return getZonedParts(date, timezone) === String(value).trim() ? date : null;
}

async function resolveConnectedBotIdentities(db, tenantId) {
  const result = {};
  for (const provider of ['tg', 'max']) {
    try {
      const config = await getTenantBotConfig(db, tenantId, provider, { allowDisabled: true, customer: true });
      result[provider] = { connected: true, id: (await fetchBotIdentity(config)).id };
    } catch (error) {
      result[provider] = { connected: false, id: '', reason: String(error?.code || error?.cause?.code || error?.name || 'UNAVAILABLE') };
    }
  }
  return result;
}

async function assertPublicationChannelsConnected(db, tenantId, channels) {
  const selected = normalizePublicationChannels(channels).filter((channel) => channel !== 'storefront');
  if (!selected.length) return;
  const identities = await resolveConnectedBotIdentities(db, tenantId);
  const unavailable = selected.find((channel) => !identities[channel === 'telegram' ? 'tg' : 'max']?.connected);
  if (unavailable) throw Object.assign(new Error('BOT_CHANNEL_UNAVAILABLE'), { status: 409, code: 'BOT_CHANNEL_UNAVAILABLE' });
}

function normalizeRow(row) {
  if (!row) return null;
  const promoCodeMode = normalizePromoCodeMode(row.promo_code_mode);
  const productId = normalizePositiveInt(row.product_id);
  const products = Array.isArray(row.products) ? row.products : [];
  let actionType = normalizeActionType(row.action_type);
  if (actionType === 'none' && productId) actionType = 'product';
  if (actionType === 'none' && products.length) actionType = 'product_collection';
  if (actionType === 'none' && (promoCodeMode !== 'none' || String(row.promo_code || '').trim())) {
    actionType = 'promo_code';
  }
  return {
    id: Number(row.id || 0),
    tenant_id: Number(row.tenant_id || 0),
    store_id: Number(row.store_id || 0),
    type: normalizeMessageType(row.type),
    title: String(row.title || ''),
    body: String(row.body || ''),
    image_url: String(row.image_url || ''),
    link_url: String(row.link_url || ''),
    action_type: actionType,
    product_id: productId,
    product_ids: products.map((item) => Number(item?.id || 0)).filter((id) => id > 0),
    products,
    product_title: String(row.product_title || ''),
    product_sku: String(row.product_sku || ''),
    product_price: row.product_price == null ? null : Number(row.product_price),
    product_photo: String(parseJsonArray(row.product_photos_json)[0] || ''),
    product_is_active: row.product_is_active == null ? null : Number(row.product_is_active || 0) === 1,
    promo_code: String(row.promo_code || ''),
    promo_code_mode: promoCodeMode,
    promo_discount_id: normalizePositiveInt(row.promo_discount_id),
    promo_code_id: normalizePositiveInt(row.promo_code_id),
    publication_channels: normalizePublicationChannels(row.publication_channels),
    recipient_mode: row.recipient_mode === 'selected' ? 'selected' : 'all',
    recipient_ids: normalizeRecipientIds(row.recipient_ids),
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    web_push_enabled: Number(row.web_push_enabled || 0) === 1,
    is_published: Number(row.is_published || 0) === 1,
    is_hidden: Number(row.is_hidden || 0) === 1,
    is_pinned: Number(row.is_pinned || 0) === 1,
    manual_hidden: Number(row.manual_hidden || 0) === 1,
    lifecycle_status: ['draft', 'scheduled', 'active', 'paused', 'completed'].includes(row.lifecycle_status) ? row.lifecycle_status : 'draft',
    paused_at: row.paused_at || null,
    completed_at: row.completed_at || null,
    storefront_sort_order: Number(row.storefront_sort_order || 0),
    channel_schedules: Array.isArray(row.channel_schedules) ? row.channel_schedules : [],
    published_at: row.published_at || null,
    launch_count: Number(row.launch_count || 0),
    latest_run_status: String(row.latest_run_status || ''),
    telegram_status: String(row.telegram_status || ''),
    max_status: String(row.max_status || ''),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

module.exports = function makeAdminImportantMessagesRouter({
  db,
  helpers,
  ensurePushSubscriptionsTable,
  sendPushToSubscriptions,
}) {
  const router = express.Router();
  let tableReady = false;
  let tablePromise = null;

  async function ensureTable() {
    if (tableReady) return true;
    if (tablePromise) return tablePromise;
    tablePromise = db.query(`
      CREATE TABLE IF NOT EXISTS mkt_important_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        store_id BIGINT UNSIGNED NOT NULL DEFAULT 1,
        type ENUM('news','discount','post') NOT NULL DEFAULT 'news',
        title VARCHAR(180) NOT NULL,
        body TEXT NOT NULL,
        image_url VARCHAR(1024) NOT NULL DEFAULT '',
        link_url VARCHAR(1024) NOT NULL DEFAULT '',
        action_type ENUM('none','promo_code','product','product_collection') NOT NULL DEFAULT 'none',
        product_id BIGINT UNSIGNED NULL,
        promo_code VARCHAR(80) NOT NULL DEFAULT '',
        promo_code_mode ENUM('none','shared','unique') NOT NULL DEFAULT 'none',
        promo_discount_id BIGINT UNSIGNED NULL,
        promo_code_id BIGINT UNSIGNED NULL,
        publication_channels SET('storefront','telegram','max') NOT NULL DEFAULT 'storefront',
        recipient_mode ENUM('all','selected') NOT NULL DEFAULT 'all',
        web_push_enabled TINYINT(1) NOT NULL DEFAULT 0,
        is_published TINYINT(1) NOT NULL DEFAULT 0,
        is_hidden TINYINT(1) NOT NULL DEFAULT 0,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        published_at DATETIME NULL,
        archived_at DATETIME(3) NULL,
        archived_by BIGINT UNSIGNED NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_mkt_important_messages_public (tenant_id, store_id, is_published, is_pinned, published_at, id),
        KEY idx_mkt_important_messages_admin (tenant_id, store_id, updated_at, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
      .then(async () => {
        try {
          await db.query("ALTER TABLE mkt_important_messages ADD COLUMN publication_channels SET('storefront','telegram','max') NOT NULL DEFAULT 'storefront' AFTER promo_code_id");
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query("ALTER TABLE mkt_important_messages ADD COLUMN recipient_mode ENUM('all','selected') NOT NULL DEFAULT 'all' AFTER publication_channels");
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) throw err;
        }
        for (const statement of [
          "ALTER TABLE mkt_important_messages ADD COLUMN web_push_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER recipient_mode",
          "ALTER TABLE mkt_important_messages ADD COLUMN archived_at DATETIME(3) NULL AFTER published_at",
          "ALTER TABLE mkt_important_messages ADD COLUMN archived_by BIGINT UNSIGNED NULL AFTER archived_at",
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN provider_message_ids_json JSON NULL AFTER provider_message_id',
          "ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_state ENUM('not_requested','pending','processing','retry','deleted','failed','unavailable') NOT NULL DEFAULT 'not_requested' AFTER sent_at",
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER deletion_state',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_available_at DATETIME(6) NULL AFTER deletion_attempts',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_available_at',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_until DATETIME(6) NULL AFTER deletion_lease_token',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_lease_until',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_requested_at DATETIME(6) NULL AFTER deletion_error_code',
          'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deleted_at DATETIME(6) NULL AFTER deletion_requested_at',
        ]) {
          try { await db.query(statement); } catch (err) {
            if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) throw err;
          }
        }
        try {
          await db.query('ALTER TABLE mkt_important_messages ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER is_published');
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query('ALTER TABLE mkt_important_messages ADD COLUMN promo_code VARCHAR(80) NOT NULL DEFAULT "" AFTER link_url');
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query("ALTER TABLE mkt_important_messages ADD COLUMN promo_code_mode ENUM('none','shared','unique') NOT NULL DEFAULT 'none' AFTER promo_code");
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query('ALTER TABLE mkt_important_messages ADD COLUMN promo_discount_id BIGINT UNSIGNED NULL AFTER promo_code_mode');
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query('ALTER TABLE mkt_important_messages ADD COLUMN promo_code_id BIGINT UNSIGNED NULL AFTER promo_discount_id');
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        try {
          await db.query("ALTER TABLE mkt_important_messages ADD COLUMN action_type ENUM('none','promo_code','product','product_collection') NOT NULL DEFAULT 'none' AFTER link_url");
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        await db.query("ALTER TABLE mkt_important_messages MODIFY COLUMN action_type ENUM('none','promo_code','product','product_collection') NOT NULL DEFAULT 'none'");
        try {
          await db.query('ALTER TABLE mkt_important_messages ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER action_type');
        } catch (err) {
          if (err?.code !== 'ER_DUP_FIELDNAME' && !String(err?.message || '').includes('Duplicate column name')) {
            throw err;
          }
        }
        await db.query(`
          CREATE TABLE IF NOT EXISTS mkt_important_message_promo_claims (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id BIGINT UNSIGNED NOT NULL,
            store_id BIGINT UNSIGNED NOT NULL DEFAULT 1,
            message_id BIGINT UNSIGNED NOT NULL,
            customer_id BIGINT UNSIGNED NOT NULL,
            discount_id BIGINT UNSIGNED NULL,
            promo_code_id BIGINT UNSIGNED NULL,
            promo_code VARCHAR(80) NOT NULL DEFAULT '',
            claimed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uq_important_message_promo_claim_customer (tenant_id, store_id, message_id, customer_id),
            KEY idx_important_message_promo_claim_message (tenant_id, store_id, message_id),
            KEY idx_important_message_promo_claim_promo (tenant_id, promo_code_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS mkt_important_message_products (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id BIGINT UNSIGNED NOT NULL,
            store_id BIGINT UNSIGNED NOT NULL DEFAULT 1,
            message_id BIGINT UNSIGNED NOT NULL,
            product_id BIGINT UNSIGNED NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uq_important_message_product (tenant_id, store_id, message_id, product_id),
            KEY idx_important_message_products_message (tenant_id, store_id, message_id, sort_order, id),
            KEY idx_important_message_products_product (tenant_id, product_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        await db.query(`CREATE TABLE IF NOT EXISTS mkt_important_message_recipients (
          tenant_id BIGINT UNSIGNED NOT NULL,
          store_id BIGINT UNSIGNED NOT NULL,
          message_id BIGINT UNSIGNED NOT NULL,
          customer_id BIGINT UNSIGNED NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (tenant_id,store_id,message_id,customer_id),
          KEY idx_important_recipient_customer (tenant_id,store_id,customer_id,message_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await ensureCampaignScheduleSchema(db);
        tableReady = true;
        return true;
      })
      .catch((err) => {
        tablePromise = null;
        throw err;
      });
    return tablePromise;
  }

  async function getStoreTimezone(tenantId, storeId) {
    const [[row]] = await db.query(
      `SELECT COALESCE(NULLIF(s.timezone,''),NULLIF(t.timezone,''),'UTC') timezone
         FROM ten_tenants t LEFT JOIN ten_stores s ON s.tenant_id=t.id AND s.id=?
        WHERE t.id=? LIMIT 1`,
      [storeId, tenantId]
    );
    const timezone = String(row?.timezone || 'UTC');
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date()); } catch {
      throw Object.assign(new Error('STORE_TIMEZONE_INVALID'), { status: 409, code: 'STORE_TIMEZONE_INVALID' });
    }
    return timezone;
  }

  async function writeLifecycleAudit({ tenantId, storeId, messageId, channel = null, action, fromStatus = null, toStatus = null, details = null, userId = null }) {
    await db.query(
      `INSERT INTO mkt_campaign_lifecycle_audit
        (tenant_id,store_id,message_id,channel,action,from_status,to_status,details_json,actor_user_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [tenantId, storeId, messageId, channel, action, fromStatus, toStatus, details ? JSON.stringify(details) : null, userId]
    );
  }

  function normalizeActionFields(body) {
    let promoCode = normalizeText(body?.promo_code ?? body?.promoCode, 80).toUpperCase();
    let promoCodeMode = normalizePromoCodeMode(body?.promo_code_mode ?? body?.promoCodeMode);
    let promoDiscountId = normalizePositiveInt(body?.promo_discount_id ?? body?.promoDiscountId);
    let promoCodeId = normalizePositiveInt(body?.promo_code_id ?? body?.promoCodeId);
    let productId = normalizePositiveInt(body?.product_id ?? body?.productId);
    const productIds = Array.from(new Set((
      Array.isArray(body?.product_ids) ? body.product_ids
        : Array.isArray(body?.productIds) ? body.productIds
          : []
    ).map(normalizePositiveInt).filter(Boolean)));
    const hasActionType = Object.prototype.hasOwnProperty.call(body || {}, 'action_type')
      || Object.prototype.hasOwnProperty.call(body || {}, 'actionType');
    let actionType = hasActionType
      ? normalizeActionType(body?.action_type ?? body?.actionType)
      : productId
        ? 'product'
        : productIds.length
          ? 'product_collection'
        : (promoCodeMode !== 'none' || promoCode)
          ? 'promo_code'
          : 'none';

    if (actionType === 'product' || actionType === 'product_collection') {
      promoCode = '';
      promoCodeMode = 'none';
      promoDiscountId = null;
      promoCodeId = null;
      if (actionType === 'product_collection') productId = null;
    } else if (actionType === 'promo_code') {
      productId = null;
    } else {
      actionType = 'none';
      productId = null;
      promoCode = '';
      promoCodeMode = 'none';
      promoDiscountId = null;
      promoCodeId = null;
    }

    return {
      actionType,
      productId,
      productIds: actionType === 'product_collection' ? productIds : [],
      promoCode,
      promoCodeMode,
      promoDiscountId,
      promoCodeId,
    };
  }

  async function validateActionFields(tenantId, fields) {
    if (fields.actionType === 'product') {
      if (!fields.productId) return 'PRODUCT_REQUIRED';
      const [rows] = await db.query(
        'SELECT id FROM prod_products WHERE tenant_id = ? AND id = ? LIMIT 1',
        [tenantId, fields.productId]
      );
      if (!rows?.[0]) return 'PRODUCT_NOT_FOUND';
    }
    if (fields.actionType === 'product_collection') {
      if (!Array.isArray(fields.productIds) || !fields.productIds.length) return 'PRODUCT_REQUIRED';
      const [rows] = await db.query(
        `SELECT id FROM prod_products WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, fields.productIds]
      );
      if ((Array.isArray(rows) ? rows : []).length !== fields.productIds.length) return 'PRODUCT_NOT_FOUND';
    }
    if (fields.actionType === 'promo_code') {
      if (fields.promoCodeMode === 'shared' && !fields.promoCode) return 'PROMO_SOURCE_REQUIRED';
      if (fields.promoCodeMode === 'unique' && !fields.promoDiscountId) return 'PROMO_SOURCE_REQUIRED';
      if (fields.promoCodeMode === 'none') return 'PROMO_SOURCE_REQUIRED';
    }
    return '';
  }

  async function getMessageProductsByIds(tenantId, storeId, messageIds) {
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map(normalizePositiveInt)
      .filter(Boolean);
    if (!ids.length) return new Map();
    const [rows] = await db.query(
      `SELECT mp.message_id,
              p.id,
              p.name AS title,
              p.sku,
              p.price,
              p.old_price,
              p.description_short,
              p.photos_json,
              p.blocks_config_json,
              p.is_active
         FROM mkt_important_message_products mp
         JOIN prod_products p
           ON p.tenant_id = mp.tenant_id AND p.id = mp.product_id
        WHERE mp.tenant_id = ? AND mp.store_id = ? AND mp.message_id IN (?)
        ORDER BY mp.message_id ASC, mp.sort_order ASC, mp.id ASC`,
      [tenantId, storeId, ids]
    );
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const messageId = Number(row?.message_id || 0);
      if (!(messageId > 0)) return;
      const list = map.get(messageId) || [];
      list.push({
        id: Number(row.id || 0),
        title: String(row.title || ''),
        sku: String(row.sku || ''),
        price: row.price == null ? null : Number(row.price),
        old_price: row.old_price == null ? null : Number(row.old_price),
        description_short: String(row.description_short || ''),
        photo: String(parseJsonArray(row.photos_json)[0] || ''),
        photos: parseJsonArray(row.photos_json),
        blocks_config: row.blocks_config_json ? (() => {
          try {
            const parsed = JSON.parse(String(row.blocks_config_json || ''));
            return parsed && typeof parsed === 'object' ? parsed : null;
          } catch {
            return null;
          }
        })() : null,
        is_active: Number(row.is_active || 0) === 1,
      });
      map.set(messageId, list);
    });
    return map;
  }

  async function replaceMessageProducts(tenantId, storeId, messageId, productIds) {
    await db.query(
      'DELETE FROM mkt_important_message_products WHERE tenant_id = ? AND store_id = ? AND message_id = ?',
      [tenantId, storeId, messageId]
    );
    const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
      .map(normalizePositiveInt)
      .filter(Boolean)));
    if (!ids.length) return;
    const values = ids.map((productId, index) => [tenantId, storeId, messageId, productId, index]);
    await db.query(
      'INSERT INTO mkt_important_message_products (tenant_id, store_id, message_id, product_id, sort_order) VALUES ?',
      [values]
    );
  }

  async function getMessageRecipientsByIds(tenantId, storeId, messageIds) {
    const ids = normalizeRecipientIds(messageIds);
    if (!ids.length) return new Map();
    const [rows] = await db.query(
      `SELECT target.message_id,c.id,c.name,c.phone
         FROM mkt_important_message_recipients target
         JOIN cust_customers c
           ON c.tenant_id=target.tenant_id AND c.store_id=target.store_id AND c.id=target.customer_id
        WHERE target.tenant_id=? AND target.store_id=? AND target.message_id IN (?)
        ORDER BY c.name,c.id`,
      [tenantId, storeId, ids]
    );
    const map = new Map();
    for (const row of rows || []) {
      const messageId = Number(row.message_id);
      const list = map.get(messageId) || [];
      list.push({ id: Number(row.id), name: String(row.name || ''), phone: String(row.phone || '') });
      map.set(messageId, list);
    }
    return map;
  }

  async function replaceMessageRecipients(tenantId, storeId, messageId, mode, customerIds) {
    await db.query(
      'DELETE FROM mkt_important_message_recipients WHERE tenant_id=? AND store_id=? AND message_id=?',
      [tenantId, storeId, messageId]
    );
    if (mode !== 'selected') return;
    const ids = normalizeRecipientIds(customerIds);
    if (!ids.length) throw Object.assign(new Error('RECIPIENTS_REQUIRED'), { status: 400, code: 'RECIPIENTS_REQUIRED' });
    const [customers] = await db.query(
      `SELECT id FROM cust_customers
        WHERE tenant_id=? AND store_id=? AND COALESCE(is_active,1)=1 AND id IN (?)`,
      [tenantId, storeId, ids]
    );
    if ((customers || []).length !== ids.length) throw Object.assign(new Error('RECIPIENT_NOT_FOUND'), { status: 400, code: 'RECIPIENT_NOT_FOUND' });
    await db.query(
      `INSERT INTO mkt_important_message_recipients (tenant_id,store_id,message_id,customer_id)
       VALUES ?`,
      [ids.map((customerId) => [tenantId, storeId, messageId, customerId])]
    );
  }

  async function validateRecipientSelection(tenantId, storeId, mode, customerIds) {
    if (mode !== 'selected') return [];
    const ids = normalizeRecipientIds(customerIds);
    if (!ids.length) throw Object.assign(new Error('RECIPIENTS_REQUIRED'), { status: 400, code: 'RECIPIENTS_REQUIRED' });
    const [rows] = await db.query(
      `SELECT id FROM cust_customers
        WHERE tenant_id=? AND store_id=? AND COALESCE(is_active,1)=1 AND id IN (?)`,
      [tenantId, storeId, ids]
    );
    if ((rows || []).length !== ids.length) throw Object.assign(new Error('RECIPIENT_NOT_FOUND'), { status: 400, code: 'RECIPIENT_NOT_FOUND' });
    return ids;
  }

  async function getMessageById(tenantId, storeId, id) {
    const [rows] = await db.query(
      `SELECT m.*,
              p.name AS product_title,
              p.sku AS product_sku,
              p.price AS product_price,
              p.photos_json AS product_photos_json,
              p.is_active AS product_is_active
         FROM mkt_important_messages m
         LEFT JOIN prod_products p
           ON p.tenant_id = m.tenant_id AND p.id = m.product_id
        WHERE m.tenant_id = ? AND m.store_id = ? AND m.id = ? AND m.archived_at IS NULL
        LIMIT 1`,
      [tenantId, storeId, id]
    );
    const row = rows?.[0];
    if (!row) return null;
    const productsByMessageId = await getMessageProductsByIds(tenantId, storeId, [id]);
    const recipientsByMessageId = await getMessageRecipientsByIds(tenantId, storeId, [id]);
    const recipients = recipientsByMessageId.get(Number(row.id || 0)) || [];
    return normalizeRow({ ...row, products: productsByMessageId.get(Number(row.id || 0)) || [], recipients, recipient_ids: recipients.map((item) => item.id) });
  }

  async function sendImportantPush(tenantId, storeId, message) {
    return sendImportantMessagePush({ db, ensurePushSubscriptionsTable, sendPushToSubscriptions, tenantId, storeId, message });
  }

  router.get('/', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT m.*,
                (SELECT COUNT(*) FROM mkt_campaign_runs cr WHERE cr.tenant_id=m.tenant_id AND cr.store_id=m.store_id AND cr.message_id=m.id) launch_count,
                (SELECT cr.status FROM mkt_campaign_runs cr WHERE cr.tenant_id=m.tenant_id AND cr.store_id=m.store_id AND cr.message_id=m.id ORDER BY cr.id DESC LIMIT 1) latest_run_status,
                (SELECT cr.status FROM mkt_campaign_runs cr WHERE cr.tenant_id=m.tenant_id AND cr.store_id=m.store_id AND cr.message_id=m.id AND FIND_IN_SET('telegram',cr.channels) ORDER BY cr.id DESC LIMIT 1) telegram_status,
                (SELECT cr.status FROM mkt_campaign_runs cr WHERE cr.tenant_id=m.tenant_id AND cr.store_id=m.store_id AND cr.message_id=m.id AND FIND_IN_SET('max',cr.channels) ORDER BY cr.id DESC LIMIT 1) max_status,
                p.name AS product_title,
                p.sku AS product_sku,
                p.price AS product_price,
                p.photos_json AS product_photos_json,
                p.is_active AS product_is_active
           FROM mkt_important_messages m
           LEFT JOIN prod_products p
             ON p.tenant_id = m.tenant_id AND p.id = m.product_id
          WHERE m.tenant_id = ? AND m.store_id = ? AND m.archived_at IS NULL
          ORDER BY m.is_pinned DESC, COALESCE(m.published_at, m.updated_at) DESC, m.id DESC
          LIMIT 200`,
        [tenantId, storeId]
      );
      const sourceRows = Array.isArray(rows) ? rows : [];
      const productsByMessageId = await getMessageProductsByIds(
        tenantId,
        storeId,
        sourceRows.map((row) => Number(row?.id || 0))
      );
      const recipientsByMessageId = await getMessageRecipientsByIds(
        tenantId,
        storeId,
        sourceRows.map((row) => Number(row?.id || 0))
      );
      const messageIds = sourceRows.map((row) => Number(row?.id || 0)).filter(Boolean);
      const schedulesByMessageId = new Map();
      if (messageIds.length) {
        const [scheduleRows] = await db.query(
          `SELECT s.*,
                  SUM(d.state='sent') successful_count,
                  SUM(d.state IN ('pending','processing','retry','paused')) pending_count,
                  SUM(d.state IN ('failed','unknown')) failed_count,
                  SUM(d.deletion_state='deleted') deleted_count,
                  SUM(d.deletion_state IN ('pending','processing','retry')) deletion_pending_count
             FROM mkt_campaign_channel_schedules s
             LEFT JOIN mkt_campaign_deliveries d ON d.run_id=s.run_id
            WHERE s.tenant_id=? AND s.store_id=? AND s.message_id IN (?)
            GROUP BY s.id ORDER BY s.message_id,s.id`,
          [tenantId, storeId, messageIds]
        );
        for (const schedule of scheduleRows || []) {
          const messageId = Number(schedule.message_id);
          if (!schedulesByMessageId.has(messageId)) schedulesByMessageId.set(messageId, []);
          schedulesByMessageId.get(messageId).push({
            ...schedule,
            successful_count: Number(schedule.successful_count || 0),
            pending_count: Number(schedule.pending_count || 0),
            failed_count: Number(schedule.failed_count || 0),
            deleted_count: Number(schedule.deleted_count || 0),
            deletion_pending_count: Number(schedule.deletion_pending_count || 0),
          });
        }
      }
      const [[timezoneRow]] = await db.query(
        `SELECT COALESCE(NULLIF(s.timezone,''),NULLIF(t.timezone,''),'UTC') timezone
           FROM ten_tenants t LEFT JOIN ten_stores s ON s.tenant_id=t.id AND s.id=?
          WHERE t.id=? LIMIT 1`,
        [storeId, tenantId]
      );
      return res.json({
        ok: true,
        timezone: String(timezoneRow?.timezone || 'UTC'),
        data: sourceRows.map((row) => normalizeRow({
          ...row,
          products: productsByMessageId.get(Number(row?.id || 0)) || [],
          recipients: recipientsByMessageId.get(Number(row?.id || 0)) || [],
          recipient_ids: (recipientsByMessageId.get(Number(row?.id || 0)) || []).map((item) => item.id),
          channel_schedules: schedulesByMessageId.get(Number(row?.id || 0)) || [],
        })),
      });
    } catch (err) {
      console.error('GET /api/admin/important-messages error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/recipient-options', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const query = normalizeText(req.query?.q, 80);
      const bots = await resolveConnectedBotIdentities(db, tenantId);
      const like = `%${query}%`;
      const [rows] = await db.query(
        `SELECT c.id,c.name,c.phone,
                MAX(tg.bot_id IS NOT NULL AND tg.reachable=1 AND tg_consent.consented=1) telegram_available,
                MAX(mx.bot_id IS NOT NULL AND mx.reachable=1 AND max_consent.consented=1) max_available
           FROM cust_customers c
           LEFT JOIN auth_account_links al
             ON al.tenant_id=c.tenant_id AND al.account_type='customer' AND al.account_id=c.id
           LEFT JOIN auth_account_messenger_links tg_link ON tg_link.account_link_id=al.id AND tg_link.provider='tg'
           LEFT JOIN auth_messenger_channels tg_channel ON tg_channel.id=tg_link.channel_id AND tg_channel.revoked_at IS NULL
           LEFT JOIN auth_messenger_bot_contacts tg
             ON tg.tenant_id=c.tenant_id AND tg.provider='tg' AND tg.bot_id=? AND tg.provider_user_id=tg_channel.provider_user_id
           LEFT JOIN mkt_messenger_marketing_consents tg_consent
             ON tg_consent.tenant_id=c.tenant_id AND tg_consent.store_id=c.store_id AND tg_consent.customer_id=c.id AND tg_consent.provider='tg'
           LEFT JOIN auth_account_messenger_links max_link ON max_link.account_link_id=al.id AND max_link.provider='max'
           LEFT JOIN auth_messenger_channels max_channel ON max_channel.id=max_link.channel_id AND max_channel.revoked_at IS NULL
           LEFT JOIN auth_messenger_bot_contacts mx
             ON mx.tenant_id=c.tenant_id AND mx.provider='max' AND mx.bot_id=? AND mx.provider_user_id=max_channel.provider_user_id
           LEFT JOIN mkt_messenger_marketing_consents max_consent
             ON max_consent.tenant_id=c.tenant_id AND max_consent.store_id=c.store_id AND max_consent.customer_id=c.id AND max_consent.provider='max'
          WHERE c.tenant_id=? AND c.store_id=? AND COALESCE(c.is_active,1)=1
            AND (?='' OR c.name LIKE ? OR c.phone LIKE ?)
          GROUP BY c.id,c.name,c.phone
          ORDER BY c.name,c.id LIMIT 200`,
        [bots.tg.id, bots.max.id, tenantId, storeId, query, like, like]
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (error) {
      console.error('GET campaign recipient options error:', error);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/audience-count', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const botIdentities = await resolveConnectedBotIdentities(db, tenantId);
      const identities = { tg: botIdentities.tg.id, max: botIdentities.max.id };
      const messageId = normalizePositiveInt(req.query?.message_id);
      let selectedCustomerIds = [];
      let selectedMode = false;
      if (messageId) {
        const message = await getMessageById(tenantId, storeId, messageId);
        if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        selectedMode = message.recipient_mode === 'selected';
        if (selectedMode) selectedCustomerIds = message.recipient_ids;
      }
      const selectionSql = selectedCustomerIds.length ? ' AND c.id IN (?)' : (selectedMode ? ' AND 1=0' : '');
      const [rows] = await db.query(
        `SELECT DISTINCT c.id AS customer_id,
                mc.provider,
                mc.provider_user_id,
                consent.id AS consent_id,
                consent.consented,
                contact.bot_id AS contact_bot_id,
                contact.reachable,
                EXISTS(
                  SELECT 1 FROM auth_messenger_bot_contacts other_contact
                   WHERE other_contact.tenant_id=c.tenant_id
                     AND other_contact.provider=mc.provider
                     AND other_contact.provider_user_id=mc.provider_user_id
                     AND other_contact.bot_id<>CASE mc.provider WHEN 'tg' THEN ? WHEN 'max' THEN ? END
                ) AS has_other_bot_contact
           FROM cust_customers c
           JOIN auth_account_links al
             ON al.tenant_id=c.tenant_id AND al.account_type='customer' AND al.account_id=c.id
           JOIN auth_account_messenger_links aml ON aml.account_link_id=al.id
           JOIN auth_messenger_channels mc
             ON mc.id=aml.channel_id AND mc.provider=aml.provider AND mc.revoked_at IS NULL
           LEFT JOIN auth_messenger_bot_contacts contact
             ON contact.tenant_id=c.tenant_id AND contact.provider=mc.provider
            AND contact.provider_user_id=mc.provider_user_id
            AND contact.bot_id=CASE mc.provider WHEN 'tg' THEN ? WHEN 'max' THEN ? END
           LEFT JOIN mkt_messenger_marketing_consents consent
             ON consent.tenant_id=c.tenant_id AND consent.store_id=c.store_id
            AND consent.customer_id=c.id AND consent.provider=mc.provider
          WHERE c.tenant_id=? AND c.store_id=? AND COALESCE(c.is_active,1)=1${selectionSql}`,
        [identities.tg, identities.max, identities.tg, identities.max, tenantId, storeId, ...(selectedCustomerIds.length ? [selectedCustomerIds] : [])]
      );
      const source = Array.isArray(rows) ? rows : [];
      const summarize = (provider) => {
        const providerRows = source.filter((row) => row.provider === provider);
        const diagnostics = {
          available: providerRows.filter((row) => row.consent_id != null && Number(row.consented) === 1 && row.contact_bot_id != null && Number(row.reachable) === 1).length,
          no_consent: providerRows.filter((row) => row.consent_id == null || Number(row.consented) !== 1).length,
          different_bot: providerRows.filter((row) => row.contact_bot_id == null && Number(row.has_other_bot_contact) === 1).length,
          no_confirmed_contact: providerRows.filter((row) => row.contact_bot_id == null && Number(row.has_other_bot_contact) !== 1).length,
          bot_blocked: providerRows.filter((row) => row.contact_bot_id != null && Number(row.reachable) !== 1).length,
        };
        if (process.env.NODE_ENV !== 'production' && Object.values(diagnostics).some(Number)) {
          console.debug('CAMPAIGN_AUDIENCE_DIAGNOSTICS', { tenantId, storeId, provider, ...diagnostics });
        }
        return { connected: botIdentities[provider].connected, recipients: diagnostics.available, available: diagnostics.available };
      };
      const availableCustomers = new Set(source
        .filter((row) => row.consent_id != null && Number(row.consented) === 1 && row.contact_bot_id != null && Number(row.reachable) === 1)
        .map((row) => Number(row.customer_id)));
      const [[siteAudienceRow]] = await db.query(
        `SELECT COUNT(*) AS recipients
           FROM cust_customers c
          WHERE c.tenant_id=? AND c.store_id=? AND COALESCE(c.is_active,1)=1${selectionSql}`,
        [tenantId, storeId, ...(selectedCustomerIds.length ? [selectedCustomerIds] : [])]
      );
      return res.json({
        ok: true,
        data: {
          count: availableCustomers.size,
          unique_customers: availableCustomers.size,
          site: { recipients: Math.max(0, Number(siteAudienceRow?.recipients || 0)) },
          telegram: summarize('tg'),
          max: summarize('max'),
        },
      });
    } catch (err) {
      console.error('GET /api/admin/important-messages/audience-count error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const title = normalizeText(req.body?.title, 180);
      const body = normalizeText(req.body?.body, 10000);
      if (!title || !body) return res.status(400).json({ ok: false, error: 'TITLE_AND_BODY_REQUIRED' });
      const type = normalizeMessageType(req.body?.type);
      const imageUrl = normalizeText(req.body?.image_url ?? req.body?.imageUrl, 1024);
      const linkUrl = normalizeText(req.body?.link_url ?? req.body?.linkUrl, 1024);
      const actionFields = normalizeActionFields(req.body);
      const actionError = await validateActionFields(tenantId, actionFields);
      if (actionError) return res.status(400).json({ ok: false, error: actionError });
      const isPublished = normalizeBool(req.body?.is_published ?? req.body?.isPublished, false);
      const isHidden = isPublished ? normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, false) : false;
      const isPinned = normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, false);
      const webPushEnabled = normalizeBool(req.body?.web_push_enabled ?? req.body?.webPushEnabled, false);
      const publicationChannels = normalizePublicationChannels(req.body?.publication_channels ?? req.body?.publicationChannels);
      await assertPublicationChannelsConnected(db, tenantId, publicationChannels);
      const recipientMode = req.body?.recipient_mode === 'selected' ? 'selected' : 'all';
      const recipientIds = await validateRecipientSelection(tenantId, storeId, recipientMode, req.body?.recipient_ids);
      const publishedAtSql = isPublished ? 'CURRENT_TIMESTAMP(3)' : 'NULL';

      const [result] = await db.query(
        `INSERT INTO mkt_important_messages
          (tenant_id, store_id, type, title, body, image_url, link_url, action_type, product_id, promo_code, promo_code_mode, promo_discount_id, promo_code_id, publication_channels, recipient_mode, web_push_enabled, is_published, is_hidden, is_pinned, published_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${publishedAtSql}, ?)`,
        [tenantId, storeId, type, title, body, imageUrl, linkUrl, actionFields.actionType, actionFields.productId, actionFields.promoCode, actionFields.promoCodeMode, actionFields.promoDiscountId, actionFields.promoCodeId, publicationChannels.join(','), recipientMode, webPushEnabled ? 1 : 0, isPublished ? 1 : 0, isHidden ? 1 : 0, isPinned ? 1 : 0, Number(req.user?.userId || 0) || null]
      );
      const id = Number(result?.insertId || 0);
      await replaceMessageRecipients(tenantId, storeId, id, recipientMode, recipientIds);
      if (actionFields.actionType === 'product_collection') {
        await replaceMessageProducts(tenantId, storeId, id, actionFields.productIds);
      }
      return res.json({ ok: true, data: await getMessageById(tenantId, storeId, id) });
    } catch (err) {
      console.error('POST /api/admin/important-messages error:', err);
      return res.status(err?.status || 500).json({ ok: false, error: err?.code || 'SERVER_ERROR' });
    }
  });

  router.get('/runs/:runId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const runId = normalizePositiveInt(req.params.runId);
      if (!runId) return res.status(400).json({ ok: false, error: 'RUN_ID_REQUIRED' });
      const [runs] = await db.query(
        `SELECT id,message_id,channels,status,started_at,completed_at,cancelled_at,created_at
           FROM mkt_campaign_runs WHERE id=? AND tenant_id=? AND store_id=? LIMIT 1`,
        [runId, tenantId, storeId]
      );
      if (!runs?.[0]) return res.status(404).json({ ok: false, error: 'RUN_NOT_FOUND' });
      const [states] = await db.query(
        `SELECT provider,state,COUNT(*) count
           FROM mkt_campaign_deliveries
          WHERE run_id=? AND tenant_id=? AND store_id=?
          GROUP BY provider,state`,
        [runId, tenantId, storeId]
      );
      return res.json({ ok: true, data: { ...runs[0], results: states || [] } });
    } catch (err) {
      console.error('GET campaign run error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/runs/:runId/cancel', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const runId = normalizePositiveInt(req.params.runId);
      if (!runId) return res.status(400).json({ ok: false, error: 'RUN_ID_REQUIRED' });
      const [result] = await db.query(
        `UPDATE mkt_campaign_runs SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP(3)
          WHERE id=? AND tenant_id=? AND store_id=? AND status IN ('queued','sending')`,
        [runId, tenantId, storeId]
      );
      if (!result.affectedRows) return res.status(409).json({ ok: false, error: 'RUN_NOT_CANCELLABLE' });
      await db.query(
        `UPDATE mkt_campaign_deliveries SET state='cancelled',lease_token=NULL,lease_until=NULL
          WHERE run_id=? AND tenant_id=? AND store_id=? AND state IN ('pending','retry')`,
        [runId, tenantId, storeId]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('POST campaign run cancel error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/:id/runs', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const [rows] = await db.query(
        `SELECT id,channels,status,started_at,completed_at,cancelled_at,created_at
           FROM mkt_campaign_runs
          WHERE tenant_id=? AND store_id=? AND message_id=?
          ORDER BY id DESC LIMIT 50`,
        [tenantId, storeId, id]
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error('GET campaign runs error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/launch', async (req, res) => {
    try {
      if (req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: 'CONFIRMATION_REQUIRED' });
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const message = await getMessageById(tenantId, storeId, id);
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (message.lifecycle_status === 'completed') return res.status(409).json({ ok: false, error: 'CAMPAIGN_COMPLETED' });
      const channels = normalizePublicationChannels(req.body?.channels, []);
      if (!channels.length) return res.status(400).json({ ok: false, error: 'CHANNEL_REQUIRED' });
      if (channels.some((channel) => !message.publication_channels.includes(channel))) {
        return res.status(409).json({ ok: false, error: 'CAMPAIGN_CHANNEL_NOT_SELECTED' });
      }
      const messengerChannels = channels.filter((channel) => channel === 'telegram' || channel === 'max');
      let run = null;
      if (messengerChannels.length) {
        run = await createCampaignRun(db, {
          tenantId,
          storeId,
          message,
          channels: messengerChannels,
          idempotencyKey: req.body?.idempotency_key,
          userId: Number(req.user?.userId || req.user?.id || 0) || null,
        });
      }
      let storefrontPublished = false;
      let webPushQueued = false;
      if (channels.includes('storefront')) {
        await db.query(
          `UPDATE mkt_important_messages SET is_published=1,is_hidden=IF(manual_hidden=1,1,0),published_at=COALESCE(published_at,CURRENT_TIMESTAMP(3)),lifecycle_status='active'
            WHERE tenant_id=? AND store_id=? AND id=? AND archived_at IS NULL`,
          [tenantId, storeId, id]
        );
        storefrontPublished = true;
        if (message.web_push_enabled) {
          await sendImportantPush(tenantId, storeId, { ...message, is_published: true, is_hidden: false });
          webPushQueued = true;
        }
      }
      return res.status(run?.duplicate ? 200 : 201).json({
        ok: true,
        data: { ...(run || { runId: null, recipients: 0 }), storefront_published: storefrontPublished, web_push_queued: webPushQueued },
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ ok: false, error: err.code });
      console.error('POST campaign launch error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/:id/management', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      if (!id || !await getMessageById(tenantId, storeId, id)) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const [runs] = await db.query(
        `SELECT id,channels,status,started_at,completed_at,cancelled_at,created_at
           FROM mkt_campaign_runs WHERE tenant_id=? AND store_id=? AND message_id=? ORDER BY id DESC LIMIT 50`,
        [tenantId, storeId, id]
      );
      const [stats] = await db.query(
        `SELECT d.provider,d.state,d.deletion_state,COUNT(*) count
           FROM mkt_campaign_deliveries d JOIN mkt_campaign_runs r ON r.id=d.run_id
          WHERE d.tenant_id=? AND d.store_id=? AND r.message_id=?
          GROUP BY d.provider,d.state,d.deletion_state`,
        [tenantId, storeId, id]
      );
      return res.json({ ok: true, data: { runs: runs || [], stats: stats || [] } });
    } catch (err) {
      console.error('GET campaign management error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/cancel', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      const [runs] = await db.query(
        `SELECT id FROM mkt_campaign_runs WHERE tenant_id=? AND store_id=? AND message_id=? AND status IN ('queued','sending')`,
        [tenantId, storeId, id]
      );
      const runIds = (runs || []).map((row) => Number(row.id)).filter(Boolean);
      if (!runIds.length) return res.status(409).json({ ok: false, error: 'RUN_NOT_CANCELLABLE' });
      await db.query(`UPDATE mkt_campaign_runs SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=? AND store_id=? AND id IN (?)`, [tenantId, storeId, runIds]);
      await db.query(`UPDATE mkt_campaign_deliveries SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND store_id=? AND run_id IN (?) AND state IN ('pending','retry')`, [tenantId, storeId, runIds]);
      return res.json({ ok: true, data: { runs: runIds.length } });
    } catch (err) {
      console.error('POST campaign cancel error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/delete-deliveries', async (req, res) => {
    try {
      if (req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: 'CONFIRMATION_REQUIRED' });
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      const providers = Array.from(new Set((Array.isArray(req.body?.channels) ? req.body.channels : [])
        .map((channel) => channel === 'telegram' ? 'tg' : channel)
        .filter((provider) => provider === 'tg' || provider === 'max')));
      if (!providers.length) return res.status(400).json({ ok: false, error: 'CHANNEL_REQUIRED' });
      const [result] = await db.query(
        `UPDATE mkt_campaign_deliveries d JOIN mkt_campaign_runs r ON r.id=d.run_id AND r.tenant_id=d.tenant_id AND r.store_id=d.store_id
            SET d.deletion_state=IF(d.provider_message_ids_json IS NULL AND (COALESCE(d.provider_message_id,'')='' OR d.provider_message_id LIKE 'tgcol:%'),'unavailable','pending'),
                d.deletion_available_at=NOW(6),d.deletion_requested_at=NOW(6),d.deletion_error_code=IF(d.provider_message_ids_json IS NULL AND (COALESCE(d.provider_message_id,'')='' OR d.provider_message_id LIKE 'tgcol:%'),'MESSAGE_IDS_UNAVAILABLE',NULL)
          WHERE d.tenant_id=? AND d.store_id=? AND r.message_id=? AND d.provider IN (?) AND d.state='sent'
            AND d.deletion_state IN ('not_requested','failed','unavailable')`,
        [tenantId, storeId, id, providers]
      );
      return res.status(202).json({ ok: true, data: { requested: Number(result.affectedRows || 0) } });
    } catch (err) {
      console.error('POST campaign delivery deletion error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/resend-channel', async (req, res) => {
    try {
      if (req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: 'CONFIRMATION_REQUIRED' });
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = normalizePositiveInt(req.params.id);
      const channel = req.body?.channel === 'telegram' ? 'telegram' : req.body?.channel === 'max' ? 'max' : '';
      if (!id || !channel) return res.status(400).json({ ok: false, error: 'CHANNEL_REQUIRED' });
      const message = await getMessageById(tenantId, storeId, id);
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (message.lifecycle_status === 'completed') return res.status(409).json({ ok: false, error: 'CAMPAIGN_COMPLETED' });
      if (!message.publication_channels.includes(channel)) return res.status(409).json({ ok: false, error: 'CAMPAIGN_CHANNEL_NOT_SELECTED' });
      const [[deliveryState]] = await db.query(
        `SELECT COUNT(d.id) sent_count,
                SUM(d.deletion_state='deleted') deleted_count,
                SUM(d.deletion_state IN ('pending','processing','retry')) deletion_pending_count
           FROM mkt_campaign_channel_schedules s
           LEFT JOIN mkt_campaign_deliveries d ON d.run_id=s.run_id AND d.state='sent'
          WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND s.channel=?`,
        [tenantId, storeId, id, channel]
      );
      const sentCount = Number(deliveryState?.sent_count || 0);
      const deletedCount = Number(deliveryState?.deleted_count || 0);
      const deletionPendingCount = Number(deliveryState?.deletion_pending_count || 0);
      if (deletionPendingCount > 0) return res.status(409).json({ ok: false, error: 'CHANNEL_DELETION_PENDING' });
      if (sentCount === 0) return res.status(409).json({ ok: false, error: 'CHANNEL_NOT_SENT' });
      if (sentCount > deletedCount) return res.status(409).json({ ok: false, error: 'CHANNEL_MESSAGES_STILL_VISIBLE' });
      const run = await createCampaignRun(db, {
        tenantId,
        storeId,
        message,
        channels: [channel],
        idempotencyKey: req.body?.idempotency_key,
        userId: Number(req.user?.userId || req.user?.id || 0) || null,
      });
      await db.query(
        `UPDATE mkt_campaign_channel_schedules
            SET run_id=?,state='active',actual_started_at=NOW(3),actual_ended_at=NULL,last_error_code=NULL
          WHERE tenant_id=? AND store_id=? AND message_id=? AND channel=?`,
        [run.runId, tenantId, storeId, id, channel]
      );
      await db.query(
        `INSERT INTO mkt_campaign_lifecycle_audit
          (tenant_id,store_id,message_id,channel,action,from_status,to_status,details_json,actor_user_id)
         VALUES (?,?,?,?,?,'active','active',?,?)`,
        [tenantId, storeId, id, channel, 'channel_resent', JSON.stringify({ run_id: run.runId, recipients: Number(run.recipients || 0) }), Number(req.user?.userId || req.user?.id || 0) || null]
      );
      return res.status(run.duplicate ? 200 : 201).json({ ok: true, data: run });
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ ok: false, error: err.code });
      console.error('POST campaign channel resend error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/schedule', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const messageId = normalizePositiveInt(req.params.id);
      const userId = Number(req.user?.userId || req.user?.id || 0) || null;
      const message = messageId ? await getMessageById(tenantId, storeId, messageId) : null;
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (message.lifecycle_status === 'completed') return res.status(409).json({ ok: false, error: 'CAMPAIGN_COMPLETED' });
      const timezone = await getStoreTimezone(tenantId, storeId);
      const requested = Array.isArray(req.body?.channels) ? req.body.channels : [];
      const selectedChannels = normalizePublicationChannels(message.publication_channels, []);
      const schedules = [];
      for (const input of requested) {
        const channel = String(input?.channel || '').trim().toLowerCase();
        if (!['storefront', 'telegram', 'max'].includes(channel) || !selectedChannels.includes(channel)) continue;
        const startMode = input.start_mode === 'scheduled' ? 'scheduled' : 'immediate';
        const startAt = startMode === 'immediate' ? new Date() : zonedLocalToUtc(input.start_local, timezone);
        if (!startAt) return res.status(400).json({ ok: false, error: 'START_DATE_INVALID', channel });
        const endMode = input.end_mode === 'scheduled' ? 'scheduled' : 'none';
        const endAt = endMode === 'scheduled' ? zonedLocalToUtc(input.end_local, timezone) : null;
        if (endMode === 'scheduled' && !endAt) return res.status(400).json({ ok: false, error: 'END_DATE_INVALID', channel });
        if (endAt && endAt.getTime() <= startAt.getTime()) return res.status(400).json({ ok: false, error: 'END_BEFORE_START', channel });
        schedules.push({ channel, startMode, startAt, endMode, endAt, endAction: channel === 'storefront' ? 'keep' : input.end_action === 'delete' ? 'delete' : 'keep' });
      }
      if (!schedules.length) return res.status(400).json({ ok: false, error: 'CHANNEL_REQUIRED' });
      await assertPublicationChannelsConnected(db, tenantId, schedules.map((item) => item.channel));
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [existingRows] = await conn.query('SELECT * FROM mkt_campaign_channel_schedules WHERE tenant_id=? AND store_id=? AND message_id=? FOR UPDATE', [tenantId, storeId, messageId]);
        const existingByChannel = new Map(existingRows.map((row) => [row.channel, row]));
        for (const schedule of schedules) {
          const existing = existingByChannel.get(schedule.channel);
          if (existing?.actual_started_at && new Date(existing.start_at).getTime() !== schedule.startAt.getTime()) {
            throw Object.assign(new Error('STARTED_CHANNEL_START_LOCKED'), { status: 409, code: 'STARTED_CHANNEL_START_LOCKED', channel: schedule.channel });
          }
          if (existing) {
            await conn.query(
              `UPDATE mkt_campaign_channel_schedules
                  SET start_mode=?,start_at=?,end_mode=?,end_at=?,end_action=?,updated_by=?,
                      state=IF(actual_started_at IS NULL,'pending',state),last_error_code=NULL
                WHERE id=?`,
              [schedule.startMode, schedule.startAt, schedule.endMode, schedule.endAt, schedule.endAction, userId, existing.id]
            );
          } else {
            await conn.query(
              `INSERT INTO mkt_campaign_channel_schedules
                (tenant_id,store_id,message_id,channel,start_mode,start_at,end_mode,end_at,end_action,state,launch_key,created_by,updated_by)
               VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?)`,
              [tenantId, storeId, messageId, schedule.channel, schedule.startMode, schedule.startAt, schedule.endMode, schedule.endAt, schedule.endAction, crypto.randomUUID(), userId, userId]
            );
          }
        }
        const retained = schedules.map((item) => item.channel);
        await conn.query(
          `DELETE FROM mkt_campaign_channel_schedules
            WHERE tenant_id=? AND store_id=? AND message_id=? AND channel NOT IN (?) AND actual_started_at IS NULL`,
          [tenantId, storeId, messageId, retained]
        );
        await conn.query(
          `UPDATE mkt_campaign_channel_schedules
              SET state='completed',actual_ended_at=COALESCE(actual_ended_at,NOW(3))
            WHERE tenant_id=? AND store_id=? AND message_id=? AND channel NOT IN (?) AND actual_started_at IS NOT NULL AND state NOT IN ('completed','skipped')`,
          [tenantId, storeId, messageId, retained]
        );
        await conn.query(
          `UPDATE mkt_campaign_deliveries d
             JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id
              SET d.state='cancelled',d.lease_token=NULL,d.lease_until=NULL
            WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND s.channel NOT IN (?) AND d.state IN ('pending','retry','paused')`,
          [tenantId, storeId, messageId, retained]
        );
        const nextStatus = schedules.some((item) => item.startAt.getTime() <= Date.now()) ? 'active' : 'scheduled';
        await conn.query('UPDATE mkt_important_messages SET lifecycle_status=?,paused_at=NULL,completed_at=NULL WHERE tenant_id=? AND store_id=? AND id=?', [nextStatus, tenantId, storeId, messageId]);
        await conn.query(
          `INSERT INTO mkt_campaign_lifecycle_audit
            (tenant_id,store_id,message_id,action,from_status,to_status,details_json,actor_user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [tenantId, storeId, messageId, 'schedule_approved', message.lifecycle_status, nextStatus, JSON.stringify({ timezone, channels: schedules.map((item) => item.channel) }), userId]
        );
        await conn.commit();
        return res.json({ ok: true, data: { lifecycle_status: nextStatus, timezone } });
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    } catch (error) {
      console.error('POST campaign schedule error:', error);
      return res.status(error?.status || 500).json({ ok: false, error: error?.code || 'SERVER_ERROR', channel: error?.channel });
    }
  });

  router.post('/storefront-order', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const ids = Array.from(new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(normalizePositiveInt).filter(Boolean)));
      if (!ids.length) return res.status(400).json({ ok: false, error: 'IDS_REQUIRED' });
      const [owned] = await db.query('SELECT id FROM mkt_important_messages WHERE tenant_id=? AND store_id=? AND archived_at IS NULL AND id IN (?)', [tenantId, storeId, ids]);
      if (owned.length !== ids.length) return res.status(403).json({ ok: false, error: 'CAMPAIGN_SCOPE_MISMATCH' });
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        for (let index = 0; index < ids.length; index += 1) {
          await conn.query('UPDATE mkt_important_messages SET storefront_sort_order=? WHERE tenant_id=? AND store_id=? AND id=?', [(index + 1) * 10, tenantId, storeId, ids[index]]);
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('POST campaign storefront order error:', error);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/pause', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const messageId = normalizePositiveInt(req.params.id);
      const userId = Number(req.user?.userId || req.user?.id || 0) || null;
      const message = messageId ? await getMessageById(tenantId, storeId, messageId) : null;
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (!['scheduled', 'active'].includes(message.lifecycle_status)) return res.status(409).json({ ok: false, error: 'CAMPAIGN_NOT_PAUSABLE' });
      await db.query("UPDATE mkt_campaign_channel_schedules SET paused_from_state=state,state='paused',lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND store_id=? AND message_id=? AND state IN ('pending','active')", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_campaign_deliveries d JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id SET d.state='paused',d.lease_token=NULL,d.lease_until=NULL WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND d.state IN ('pending','retry')", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_important_messages SET lifecycle_status='paused',paused_at=NOW(3),is_published=0,is_hidden=1 WHERE tenant_id=? AND store_id=? AND id=?", [tenantId, storeId, messageId]);
      await writeLifecycleAudit({ tenantId, storeId, messageId, action: 'paused', fromStatus: message.lifecycle_status, toStatus: 'paused', userId });
      return res.json({ ok: true, data: { lifecycle_status: 'paused' } });
    } catch (error) {
      console.error('POST campaign pause error:', error);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/resume', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const messageId = normalizePositiveInt(req.params.id);
      const userId = Number(req.user?.userId || req.user?.id || 0) || null;
      const message = messageId ? await getMessageById(tenantId, storeId, messageId) : null;
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (message.lifecycle_status !== 'paused') return res.status(409).json({ ok: false, error: 'CAMPAIGN_NOT_PAUSED' });
      await db.query("UPDATE mkt_campaign_channel_schedules SET state=IF(actual_started_at IS NULL,'pending','active'),paused_from_state=NULL WHERE tenant_id=? AND store_id=? AND message_id=? AND state='paused' AND (end_at IS NULL OR end_at>NOW(3))", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_campaign_channel_schedules SET state='completed',actual_ended_at=COALESCE(actual_ended_at,NOW(3)),paused_from_state=NULL WHERE tenant_id=? AND store_id=? AND message_id=? AND state='paused' AND end_at<=NOW(3)", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_campaign_deliveries d JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id SET d.state='pending',d.available_at=NOW(6) WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND s.state='active' AND d.state='paused'", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_important_messages m SET m.lifecycle_status='active',m.paused_at=NULL,m.is_published=IF(m.manual_hidden=0 AND EXISTS(SELECT 1 FROM mkt_campaign_channel_schedules s WHERE s.tenant_id=m.tenant_id AND s.store_id=m.store_id AND s.message_id=m.id AND s.channel='storefront' AND s.state='active'),1,m.is_published),m.is_hidden=IF(m.manual_hidden=0,0,1) WHERE m.tenant_id=? AND m.store_id=? AND m.id=?", [tenantId, storeId, messageId]);
      await refreshCampaignLifecycle(db, tenantId, storeId, messageId);
      const refreshed = await getMessageById(tenantId, storeId, messageId);
      await writeLifecycleAudit({ tenantId, storeId, messageId, action: 'resumed', fromStatus: 'paused', toStatus: refreshed.lifecycle_status, userId });
      return res.json({ ok: true, data: { lifecycle_status: refreshed.lifecycle_status } });
    } catch (error) {
      console.error('POST campaign resume error:', error);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/complete', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const messageId = normalizePositiveInt(req.params.id);
      const userId = Number(req.user?.userId || req.user?.id || 0) || null;
      const message = messageId ? await getMessageById(tenantId, storeId, messageId) : null;
      if (!message) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (message.lifecycle_status === 'completed') return res.status(409).json({ ok: false, error: 'CAMPAIGN_COMPLETED' });
      await db.query("UPDATE mkt_campaign_deliveries d JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id SET d.state='cancelled',d.lease_token=NULL,d.lease_until=NULL WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND d.state IN ('pending','retry','paused')", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_campaign_deliveries d JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id SET d.deletion_state=IF(d.provider_message_ids_json IS NULL AND COALESCE(d.provider_message_id,'')='','unavailable','pending'),d.deletion_available_at=NOW(6),d.deletion_requested_at=NOW(6) WHERE s.tenant_id=? AND s.store_id=? AND s.message_id=? AND s.end_action='delete' AND d.state='sent' AND d.deletion_state='not_requested'", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_campaign_channel_schedules SET state='completed',actual_ended_at=COALESCE(actual_ended_at,NOW(3)),lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND store_id=? AND message_id=? AND state NOT IN ('completed','skipped')", [tenantId, storeId, messageId]);
      await db.query("UPDATE mkt_important_messages SET lifecycle_status='completed',completed_at=NOW(3),is_published=0,is_hidden=1 WHERE tenant_id=? AND store_id=? AND id=?", [tenantId, storeId, messageId]);
      await writeLifecycleAudit({ tenantId, storeId, messageId, action: 'completed', fromStatus: message.lifecycle_status, toStatus: 'completed', userId });
      return res.json({ ok: true, data: { lifecycle_status: 'completed' } });
    } catch (error) {
      console.error('POST campaign complete error:', error);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/state', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const [existingRows] = await db.query(
        'SELECT is_published, is_hidden, is_pinned, manual_hidden, lifecycle_status FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      if (!existingRows?.[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const nextHidden = req.body?.is_hidden === undefined && req.body?.isHidden === undefined
        ? Number(existingRows[0].is_hidden || 0) === 1
        : normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, false);
      const nextPinned = req.body?.is_pinned === undefined && req.body?.isPinned === undefined
        ? Number(existingRows[0].is_pinned || 0) === 1
        : normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, false);
      let storefrontSchedule = null;
      if (!nextHidden && Number(existingRows[0].is_hidden || 0) === 1) {
        if (['paused', 'completed'].includes(existingRows[0].lifecycle_status)) {
          return res.status(409).json({ ok: false, error: 'CAMPAIGN_NOT_VISIBLE' });
        }
        [[storefrontSchedule]] = await db.query(
          "SELECT state,end_at FROM mkt_campaign_channel_schedules WHERE tenant_id=? AND store_id=? AND message_id=? AND channel='storefront' LIMIT 1",
          [tenantId, storeId, id]
        );
        if (storefrontSchedule && (storefrontSchedule.state === 'completed' || (storefrontSchedule.end_at && new Date(storefrontSchedule.end_at).getTime() <= Date.now()))) {
          return res.status(409).json({ ok: false, error: 'STOREFRONT_PERIOD_ENDED' });
        }
        if (Number(existingRows[0].is_published || 0) !== 1 && storefrontSchedule?.state !== 'active') {
          return res.status(409).json({ ok: false, error: 'STOREFRONT_NOT_ACTIVE' });
        }
      }
      const nextPublished = nextHidden
        ? 0
        : (Number(existingRows[0].is_published || 0) === 1 || storefrontSchedule?.state === 'active' ? 1 : 0);
      await db.query(
        `UPDATE mkt_important_messages
            SET is_published = ?, is_hidden = ?, manual_hidden = ?, is_pinned = ?
          WHERE tenant_id = ? AND store_id = ? AND id = ?`,
        [nextPublished, nextHidden ? 1 : 0, nextHidden ? 1 : 0, nextPinned ? 1 : 0, tenantId, storeId, id]
      );
      return res.json({ ok: true, data: await getMessageById(tenantId, storeId, id) });
    } catch (err) {
      console.error('POST /api/admin/important-messages/:id/state error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const title = normalizeText(req.body?.title, 180);
      const body = normalizeText(req.body?.body, 10000);
      if (!title || !body) return res.status(400).json({ ok: false, error: 'TITLE_AND_BODY_REQUIRED' });
      const [existingRows] = await db.query(
        'SELECT is_published, is_hidden, is_pinned, publication_channels, recipient_mode, web_push_enabled FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      if (!existingRows?.[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const wasPublished = Number(existingRows[0].is_published || 0) === 1;
      const wasHidden = Number(existingRows[0].is_hidden || 0) === 1;
      const wasPinned = Number(existingRows[0].is_pinned || 0) === 1;
      const isPublished = normalizeBool(req.body?.is_published ?? req.body?.isPublished, wasPublished);
      const isHidden = normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, wasHidden);
      const isPinned = normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, wasPinned);
      const resetPublishedAt = normalizeBool(req.body?.reset_published_at ?? req.body?.resetPublishedAt, false);
      const publicationChannels = normalizePublicationChannels(
        req.body?.publication_channels ?? req.body?.publicationChannels,
        normalizePublicationChannels(existingRows[0].publication_channels)
      );
      await assertPublicationChannelsConnected(db, tenantId, publicationChannels);
      const recipientMode = req.body?.recipient_mode === undefined
        ? (existingRows[0].recipient_mode === 'selected' ? 'selected' : 'all')
        : req.body.recipient_mode === 'selected' ? 'selected' : 'all';
      const existingMessage = await getMessageById(tenantId, storeId, id);
      const recipientIds = await validateRecipientSelection(
        tenantId,
        storeId,
        recipientMode,
        req.body?.recipient_ids === undefined ? existingMessage?.recipient_ids : req.body.recipient_ids
      );
      const webPushEnabled = normalizeBool(req.body?.web_push_enabled ?? req.body?.webPushEnabled, Number(existingRows[0].web_push_enabled || 0) === 1);
      const actionFields = normalizeActionFields(req.body);
      const actionError = await validateActionFields(tenantId, actionFields);
      if (actionError) return res.status(400).json({ ok: false, error: actionError });
      await db.query(
        `UPDATE mkt_important_messages
            SET type = ?, title = ?, body = ?, image_url = ?, link_url = ?, action_type = ?, product_id = ?, promo_code = ?, promo_code_mode = ?, promo_discount_id = ?, promo_code_id = ?, publication_channels = ?, recipient_mode = ?, web_push_enabled = ?, is_published = ?, is_hidden = ?, is_pinned = ?,
                published_at = CASE
                  WHEN ? = 1 AND (? = 1 OR is_published = 0) THEN CURRENT_TIMESTAMP(3)
                  WHEN ? = 0 AND ? = 1 THEN NULL
                  ELSE published_at
                END
          WHERE tenant_id = ? AND store_id = ? AND id = ?`,
        [
          normalizeMessageType(req.body?.type),
          title,
          body,
          normalizeText(req.body?.image_url ?? req.body?.imageUrl, 1024),
          normalizeText(req.body?.link_url ?? req.body?.linkUrl, 1024),
          actionFields.actionType,
          actionFields.productId,
          actionFields.promoCode,
          actionFields.promoCodeMode,
          actionFields.promoDiscountId,
          actionFields.promoCodeId,
          publicationChannels.join(','),
          recipientMode,
          webPushEnabled ? 1 : 0,
          isPublished ? 1 : 0,
          isHidden ? 1 : 0,
          isPinned ? 1 : 0,
          isPublished ? 1 : 0,
          resetPublishedAt ? 1 : 0,
          isPublished ? 1 : 0,
          resetPublishedAt ? 1 : 0,
          tenantId,
          storeId,
          id,
        ]
      );
      await replaceMessageRecipients(tenantId, storeId, id, recipientMode, recipientIds);
      await replaceMessageProducts(
        tenantId,
        storeId,
        id,
        actionFields.actionType === 'product_collection' ? actionFields.productIds : []
      );
      return res.json({ ok: true, data: await getMessageById(tenantId, storeId, id) });
    } catch (err) {
      console.error('PUT /api/admin/important-messages/:id error:', err);
      return res.status(err?.status || 500).json({ ok: false, error: err?.code || 'SERVER_ERROR' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const [[activity]] = await db.query(
        `SELECT
           EXISTS(SELECT 1 FROM mkt_campaign_runs WHERE tenant_id=? AND store_id=? AND message_id=? AND status IN ('queued','sending')) active_runs,
           EXISTS(SELECT 1 FROM mkt_campaign_runs r JOIN mkt_campaign_deliveries d ON d.run_id=r.id WHERE r.tenant_id=? AND r.store_id=? AND r.message_id=? AND d.state='sent') sent_messages`,
        [tenantId, storeId, id, tenantId, storeId, id]
      );
      if ((Number(activity?.active_runs) || Number(activity?.sent_messages)) && req.query?.confirmed !== '1') {
        return res.status(409).json({ ok: false, error: 'CAMPAIGN_HAS_DELIVERY_HISTORY', data: activity });
      }
      if (Number(activity?.active_runs)) return res.status(409).json({ ok: false, error: 'CAMPAIGN_HAS_ACTIVE_RUNS' });
      const [result] = await db.query(
        'UPDATE mkt_important_messages SET archived_at=CURRENT_TIMESTAMP(3),archived_by=?,is_published=0,is_hidden=1,is_pinned=0 WHERE tenant_id=? AND store_id=? AND id=? AND archived_at IS NULL',
        [Number(req.user?.userId || req.user?.id || 0) || null, tenantId, storeId, id]
      );
      return res.json({ ok: true, data: { deleted: Number(result?.affectedRows || 0) > 0, archived: true } });
    } catch (err) {
      console.error('DELETE /api/admin/important-messages/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  return router;
};
