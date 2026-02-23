const crypto = require('crypto');

function makeLinkToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '') + crypto.randomBytes(8).toString('hex');
  return crypto.randomBytes(24).toString('hex');
}

function getMaxBotName() {
  return String(process.env.MAX_BOT_NAME || '').trim();
}

function normalizeMaxBotId(botId) {
  const raw = String(botId || '').trim();
  if (!raw) return '';
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

function buildMaxDeepLink(token, botId) {
  const botName = normalizeMaxBotId(botId) || getMaxBotName();
  if (!botName || !token) return null;
  return `https://max.ru/${encodeURIComponent(botName)}?start=${encodeURIComponent(token)}`;
}

async function getTenantMaxBotId(db, tenantId) {
  const resolvedTenantId = Number(tenantId);
  if (!Number.isFinite(resolvedTenantId) || resolvedTenantId <= 0) return null;
  const [rows] = await db.query(
    'SELECT max_bot_id FROM ten_tenants WHERE id=? LIMIT 1',
    [resolvedTenantId]
  );
  const id = normalizeMaxBotId(rows[0]?.max_bot_id || '');
  return id || null;
}

async function getTenantMaxBotToken(db, tenantId) {
  const resolvedTenantId = Number(tenantId);
  if (!Number.isFinite(resolvedTenantId) || resolvedTenantId <= 0) return null;
  const [rows] = await db.query(
    'SELECT max_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
    [resolvedTenantId]
  );
  const token = String(rows[0]?.max_bot_token || '').trim();
  return token || null;
}

async function sendMaxMessage({ db, tenantId, maxUserId, text, botToken, extraPayload }) {
  const token = String(botToken || '').trim() || (db ? await getTenantMaxBotToken(db, tenantId) : null);
  const apiBase = String(process.env.MAX_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!token || !apiBase || !maxUserId || !text) return { ok: false, skipped: true };

  const payload = { text: String(text) };
  if (extraPayload && typeof extraPayload === 'object') {
    Object.assign(payload, extraPayload);
  }

  const userId = Number(maxUserId);
  const userQuery = Number.isFinite(userId) ? String(userId) : encodeURIComponent(String(maxUserId));
  const res = await fetch(`${apiBase}/messages?user_id=${userQuery}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data && data.error ? data.error : `HTTP_${res.status}`;
    throw new Error(`MAX_SEND_FAILED:${msg}`);
  }

  return { ok: true, data };
}

async function confirmMaxLink({ db, helpers, token, maxUserId, phone }) {
  const linkToken = String(token || '').trim();
  const userId = String(maxUserId || '').trim();
  const normalizedPhone = helpers && typeof helpers.normalizePhone === 'function'
    ? helpers.normalizePhone(phone)
    : String(phone || '').trim();

  if (!linkToken || !userId) {
    return { ok: false, error: 'TOKEN_AND_MAX_USER_REQUIRED', status: 400 };
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, tenant_id, customer_id
       FROM cust_customer_max_link_tokens
       WHERE link_token=? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [linkToken]
    );

    if (!rows.length) {
      await conn.rollback();
      return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED', status: 400 };
    }

    const row = rows[0];
    const tenantId = Number(row.tenant_id);
    let customerId = Number(row.customer_id);

    if (normalizedPhone) {
      const [byPhoneRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1
         FOR UPDATE`,
        [tenantId, normalizedPhone]
      );
      if (!byPhoneRows.length || Number(byPhoneRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return { ok: false, error: 'CUSTOMER_BY_PHONE_NOT_FOUND', status: 404 };
      }
      customerId = Number(byPhoneRows[0].id);
    } else {
      const [customerRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1
         FOR UPDATE`,
        [tenantId, customerId]
      );
      if (!customerRows.length || Number(customerRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return { ok: false, error: 'CUSTOMER_NOT_FOUND', status: 404 };
      }
    }

    await conn.query(
      `UPDATE cust_customers
       SET max_user_id=?, updated_at=NOW()
       WHERE tenant_id=? AND id=?`,
      [userId, tenantId, customerId]
    );

    await conn.query(
      `INSERT INTO cust_customer_max_links
       (tenant_id, customer_id, max_user_id, phone, linked_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         customer_id=VALUES(customer_id),
         phone=VALUES(phone),
         linked_at=NOW()`,
      [tenantId, customerId, userId, normalizedPhone || null]
    );

    await conn.query(
      `UPDATE cust_customer_max_link_tokens
       SET used_at=NOW(), used_max_user_id=?, used_phone=?
       WHERE id=?`,
      [userId, normalizedPhone || null, Number(row.id)]
    );

    await conn.commit();
    return { ok: true, tenantId, customerId, maxUserId: userId, phone: normalizedPhone || null };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function notifyCustomerLogin({ db, tenantId, customerId }) {
  const resolvedTenantId = Number(tenantId);
  const resolvedCustomerId = Number(customerId);
  if (!Number.isFinite(resolvedTenantId) || !Number.isFinite(resolvedCustomerId)) return;

  const [rows] = await db.query(
    `SELECT max_user_id
     FROM cust_customers
     WHERE tenant_id=? AND id=?
     LIMIT 1`,
    [resolvedTenantId, resolvedCustomerId]
  );
  if (!rows.length || !rows[0].max_user_id) return;

  const text = String(
    process.env.MAX_LOGIN_MESSAGE ||
      'Вход на сайт выполнен успешно.'
  );
  await sendMaxMessage({ db, tenantId: resolvedTenantId, maxUserId: rows[0].max_user_id, text });
}

module.exports = {
  makeLinkToken,
  buildMaxDeepLink,
  getTenantMaxBotId,
  getTenantMaxBotToken,
  sendMaxMessage,
  confirmMaxLink,
  notifyCustomerLogin,
};
