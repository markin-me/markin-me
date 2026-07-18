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

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    tenant_id: Number(row.tenant_id || 0),
    store_id: Number(row.store_id || 0),
    type: normalizeMessageType(row.type),
    title: String(row.title || ''),
    body: String(row.body || ''),
    image_url: String(row.image_url || ''),
    link_url: String(row.link_url || ''),
    promo_code: String(row.promo_code || ''),
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
        promo_code VARCHAR(80) NOT NULL DEFAULT '',
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
        tableReady = true;
        return true;
      })
      .catch((err) => {
        tablePromise = null;
        throw err;
      });
    return tablePromise;
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
        `SELECT *
           FROM mkt_important_messages
          WHERE tenant_id = ? AND store_id = ?
          ORDER BY is_pinned DESC, COALESCE(published_at, updated_at) DESC, id DESC
          LIMIT 200`,
        [tenantId, storeId]
      );
      return res.json({ ok: true, data: (Array.isArray(rows) ? rows : []).map(normalizeRow) });
    } catch (err) {
      console.error('GET /api/admin/important-messages error:', err);
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
      const promoCode = normalizeText(req.body?.promo_code ?? req.body?.promoCode, 80).toUpperCase();
      const isPublished = normalizeBool(req.body?.is_published ?? req.body?.isPublished, true);
      const isHidden = isPublished ? normalizeBool(req.body?.is_hidden ?? req.body?.isHidden, false) : false;
      const isPinned = normalizeBool(req.body?.is_pinned ?? req.body?.isPinned, false);
      const sendPush = normalizeBool(req.body?.send_push ?? req.body?.sendPush, isPublished);
      const publishedAtSql = isPublished ? 'CURRENT_TIMESTAMP(3)' : 'NULL';

      const [result] = await db.query(
        `INSERT INTO mkt_important_messages
          (tenant_id, store_id, type, title, body, image_url, link_url, promo_code, is_published, is_hidden, is_pinned, published_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${publishedAtSql}, ?)`,
        [tenantId, storeId, type, title, body, imageUrl, linkUrl, promoCode, isPublished ? 1 : 0, isHidden ? 1 : 0, isPinned ? 1 : 0, Number(req.user?.userId || 0) || null]
      );
      const id = Number(result?.insertId || 0);
      const [rows] = await db.query(
        'SELECT * FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      const message = normalizeRow(rows?.[0]);
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
      const [rows] = await db.query(
        'SELECT * FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      return res.json({ ok: true, data: normalizeRow(rows?.[0]) });
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
      await db.query(
        `UPDATE mkt_important_messages
            SET type = ?, title = ?, body = ?, image_url = ?, link_url = ?, promo_code = ?, is_published = ?, is_hidden = ?, is_pinned = ?,
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
          normalizeText(req.body?.promo_code ?? req.body?.promoCode, 80).toUpperCase(),
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
      const [rows] = await db.query(
        'SELECT * FROM mkt_important_messages WHERE tenant_id = ? AND store_id = ? AND id = ? LIMIT 1',
        [tenantId, storeId, id]
      );
      const message = normalizeRow(rows?.[0]);
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
      return res.json({ ok: true, data: { deleted: Number(result?.affectedRows || 0) > 0 } });
    } catch (err) {
      console.error('DELETE /api/admin/important-messages/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  return router;
};
