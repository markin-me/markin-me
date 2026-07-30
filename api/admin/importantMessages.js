const express = require('express');
const crypto = require('crypto');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

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
    product_is_active: row.product_is_active == null ? null : Number(row.product_is_active || 0) === 1,
    promo_code: String(row.promo_code || ''),
    promo_code_mode: promoCodeMode,
    promo_discount_id: normalizePositiveInt(row.promo_discount_id),
    promo_code_id: normalizePositiveInt(row.promo_code_id),
    is_published: Number(row.is_published || 0) === 1,
    is_hidden: Number(row.is_hidden || 0) === 1,
    is_pinned: Number(row.is_pinned || 0) === 1,
    published_at: row.published_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function hashPushEndpoint(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || '')).digest('hex');
}

module.exports = function makeAdminImportantMessagesRouter({ db, helpers }) {
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
        is_published TINYINT(1) NOT NULL DEFAULT 0,
        is_hidden TINYINT(1) NOT NULL DEFAULT 0,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        published_at DATETIME NULL,
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
        tableReady = true;
        return true;
      })
      .catch((err) => {
        tablePromise = null;
        throw err;
      });
    return tablePromise;
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

  async function getMessageById(tenantId, storeId, id) {
    const [rows] = await db.query(
      `SELECT m.*,
              p.name AS product_title,
              p.sku AS product_sku,
              p.price AS product_price,
              p.is_active AS product_is_active
         FROM mkt_important_messages m
         LEFT JOIN prod_products p
           ON p.tenant_id = m.tenant_id AND p.id = m.product_id
        WHERE m.tenant_id = ? AND m.store_id = ? AND m.id = ?
        LIMIT 1`,
      [tenantId, storeId, id]
    );
    const row = rows?.[0];
    if (!row) return null;
    const productsByMessageId = await getMessageProductsByIds(tenantId, storeId, [id]);
    return normalizeRow({ ...row, products: productsByMessageId.get(Number(row.id || 0)) || [] });
  }

  async function sendImportantPush(tenantId, storeId, message) {
    const title = normalizeText(message.title, 180) || 'PROMO сообщение';
    const body = normalizeText(message.body, 180) || title;
    let rows = [];
    try {
      const [subscriptionRows] = await db.query(
        `SELECT id, endpoint
           FROM chat_push_subscriptions
          WHERE tenant_id = ? AND actor = 'in'`,
        [Number(tenantId)]
      );
      rows = Array.isArray(subscriptionRows) ? subscriptionRows : [];
    } catch (err) {
      console.error('important messages push subscriptions error:', err && err.message ? err.message : err);
      return;
    }

    const seen = new Set();
    const expoMessages = [];
    rows.forEach((row) => {
      const endpoint = String(row?.endpoint || '').trim();
      if (!/^ExponentPushToken\[.+\]$/i.test(endpoint) && !/^ExpoPushToken\[.+\]$/i.test(endpoint)) return;
      const endpointHash = hashPushEndpoint(endpoint);
      if (seen.has(endpointHash)) return;
      seen.add(endpointHash);
      expoMessages.push({
        to: endpoint,
        title,
        body,
        data: {
          type: 'important_message',
          important_message_id: Number(message.id || 0),
          tenant_id: Number(tenantId),
          store_id: Number(storeId),
          open_important_messages: true,
        },
        channelId: 'chat',
        priority: 'high',
        sound: 'default',
      });
    });

    for (let index = 0; index < expoMessages.length; index += 100) {
      const chunk = expoMessages.slice(index, index + 100);
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
        });
        // eslint-disable-next-line no-await-in-loop
        const text = await response.text().catch(() => '');
        if (!response.ok) {
          console.error('important messages expo push failed:', response.status, text);
        }
      } catch (err) {
        console.error('important messages expo push failed:', err && err.message ? err.message : err);
      }
    }
  }

  router.get('/', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT m.*,
                p.name AS product_title,
                p.sku AS product_sku,
                p.price AS product_price,
                p.is_active AS product_is_active
           FROM mkt_important_messages m
           LEFT JOIN prod_products p
             ON p.tenant_id = m.tenant_id AND p.id = m.product_id
          WHERE m.tenant_id = ? AND m.store_id = ?
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
      return res.json({
        ok: true,
        data: sourceRows.map((row) => normalizeRow({
          ...row,
          products: productsByMessageId.get(Number(row?.id || 0)) || [],
        })),
      });
    } catch (err) {
      console.error('GET /api/admin/important-messages error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/audience-count', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT COUNT(*) AS count
           FROM cust_customers
          WHERE tenant_id = ?
            AND store_id = ?
            AND COALESCE(is_active, 1) = 1`,
        [tenantId, storeId]
      );
      return res.json({
        ok: true,
        data: {
          count: Math.max(0, Number(rows?.[0]?.count || 0)),
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
      const isPublished = normalizeBool(req.body?.is_published ?? req.body?.isPublished, true);
      const isHidden = isPublished ? normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, false) : false;
      const isPinned = normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, false);
      const sendPush = normalizeBool(req.body?.send_push ?? req.body?.sendPush, isPublished);
      const publishedAtSql = isPublished ? 'CURRENT_TIMESTAMP(3)' : 'NULL';

      const [result] = await db.query(
        `INSERT INTO mkt_important_messages
          (tenant_id, store_id, type, title, body, image_url, link_url, action_type, product_id, promo_code, promo_code_mode, promo_discount_id, promo_code_id, is_published, is_hidden, is_pinned, published_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${publishedAtSql}, ?)`,
        [tenantId, storeId, type, title, body, imageUrl, linkUrl, actionFields.actionType, actionFields.productId, actionFields.promoCode, actionFields.promoCodeMode, actionFields.promoDiscountId, actionFields.promoCodeId, isPublished ? 1 : 0, isHidden ? 1 : 0, isPinned ? 1 : 0, Number(req.user?.userId || 0) || null]
      );
      const id = Number(result?.insertId || 0);
      if (actionFields.actionType === 'product_collection') {
        await replaceMessageProducts(tenantId, storeId, id, actionFields.productIds);
      }
      const message = await getMessageById(tenantId, storeId, id);
      if (message?.is_published && sendPush) {
        sendImportantPush(tenantId, storeId, message).catch((err) => {
          console.error('important messages push error:', err && err.message ? err.message : err);
        });
      }
      return res.json({ ok: true, data: message });
    } catch (err) {
      console.error('POST /api/admin/important-messages error:', err);
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
        'SELECT is_hidden, is_pinned FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      if (!existingRows?.[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const nextHidden = req.body?.is_hidden === undefined && req.body?.isHidden === undefined
        ? Number(existingRows[0].is_hidden || 0) === 1
        : normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, false);
      const nextPinned = req.body?.is_pinned === undefined && req.body?.isPinned === undefined
        ? Number(existingRows[0].is_pinned || 0) === 1
        : normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, false);
      await db.query(
        `UPDATE mkt_important_messages
            SET is_hidden = ?, is_pinned = ?
          WHERE tenant_id = ? AND store_id = ? AND id = ?`,
        [nextHidden ? 1 : 0, nextPinned ? 1 : 0, tenantId, storeId, id]
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
        'SELECT is_published, is_hidden, is_pinned FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
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
      const actionFields = normalizeActionFields(req.body);
      const actionError = await validateActionFields(tenantId, actionFields);
      if (actionError) return res.status(400).json({ ok: false, error: actionError });
      await db.query(
        `UPDATE mkt_important_messages
            SET type = ?, title = ?, body = ?, image_url = ?, link_url = ?, action_type = ?, product_id = ?, promo_code = ?, promo_code_mode = ?, promo_discount_id = ?, promo_code_id = ?, is_published = ?, is_hidden = ?, is_pinned = ?,
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
      await replaceMessageProducts(
        tenantId,
        storeId,
        id,
        actionFields.actionType === 'product_collection' ? actionFields.productIds : []
      );
      const message = await getMessageById(tenantId, storeId, id);
      const sendPush = normalizeBool(req.body?.send_push ?? req.body?.sendPush, false);
      if (message?.is_published && !message?.is_hidden && sendPush) {
        sendImportantPush(tenantId, storeId, message).catch((err) => {
          console.error('important messages push error:', err && err.message ? err.message : err);
        });
      }
      return res.json({ ok: true, data: message });
    } catch (err) {
      console.error('PUT /api/admin/important-messages/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await ensureTable();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      const [result] = await db.query(
        'DELETE FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ?',
        [tenantId, storeId, id]
      );
      await db.query(
        'DELETE FROM mkt_important_message_products WHERE tenant_id = ? AND store_id = ? AND message_id = ?',
        [tenantId, storeId, id]
      );
      return res.json({ ok: true, data: { deleted: Number(result?.affectedRows || 0) > 0 } });
    } catch (err) {
      console.error('DELETE /api/admin/important-messages/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  return router;
};
