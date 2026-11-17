const crypto = require('crypto');
const https = require('https');
const tls = require('tls');
let maxApiAgent;

// Additional trust is scoped to the official MAX API; TLS verification stays enabled.
async function fetchMaxApi(input, options = {}) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password) throw Object.assign(new Error('MAX_HTTPS_REQUIRED'), { code: 'MAX_HTTPS_REQUIRED' });
  if (url.hostname !== 'platform-api2.max.ru') return fetch(url, options);
  if (!maxApiAgent) {
    const pem = require('fs').readFileSync(require('path').join(__dirname, 'max-root-ca.pem'));
    const certificate = new crypto.X509Certificate(pem);
    if (!certificate.ca || !certificate.verify(certificate.publicKey)
        || certificate.fingerprint256.replaceAll(':', '') !== 'D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31') {
      throw Object.assign(new Error('MAX_CA_CERTIFICATE_INVALID'), { code: 'MAX_CA_CERTIFICATE_INVALID' });
    }
    const roots = typeof tls.getCACertificates === 'function' ? tls.getCACertificates('default') : tls.rootCertificates;
    maxApiAgent = new https.Agent({ keepAlive: true, maxSockets: 8, ca: [...roots, pem] });
  }
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method || 'GET', headers: options.headers, agent: maxApiAgent,
      signal: options.signal || AbortSignal.timeout(10000),
    }, response => {
      response.once('error', reject);
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        return reject(Object.assign(new Error('MAX_API_REDIRECT_REJECTED'), { code: 'MAX_API_REDIRECT_REJECTED' }));
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          response.destroy(Object.assign(new Error('MAX_RESPONSE_TOO_LARGE'), { code: 'MAX_RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        const body = [204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status: response.statusCode, headers: response.headers }));
      });
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

// Subscription management uses the same provider module as outgoing messages.
async function requestMaxBotApi(token, method, route, body, options = {}) {
  const base = new URL(options.baseUrl || process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru');
  if (base.protocol !== 'https:' || base.username || base.password) throw Object.assign(new Error('MAX_HTTPS_REQUIRED'), { code: 'MAX_HTTPS_REQUIRED' });
  const url = new URL(route, base);
  if (url.origin !== base.origin || !['/me', '/subscriptions'].includes(url.pathname)) throw new Error('MAX_API_ROUTE_INVALID');
  let response;
  try {
    response = await (options.fetch || fetchMaxApi)(url, {
      method, redirect: 'error', signal: options.signal || AbortSignal.timeout(10000),
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    const reason = cause.code || cause.cause?.code || '';
    const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(reason) ? reason : 'MAX_API_UNAVAILABLE';
    throw Object.assign(new Error(code), { code });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success === false) {
    const code = ({ 401: 'MAX_TOKEN_REJECTED', 403: 'MAX_ACCESS_DENIED', 429: 'MAX_RATE_LIMITED' })[response.status]
      || (response.ok ? 'MAX_API_REJECTED' : 'MAX_API_UNAVAILABLE');
    const retry = response.headers.get('retry-after');
    const seconds = /^\d+$/.test(retry || '') ? Number(retry) : Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
    throw Object.assign(new Error(code), { code, retryAfter: Number.isFinite(seconds) ? seconds : 0 });
  }
  if (method !== 'GET' && data.success !== true) throw Object.assign(new Error('MAX_INVALID_API_RESPONSE'), { code: 'MAX_INVALID_API_RESPONSE' });
  return data;
}

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

async function sendMaxMessage({ db, tenantId, maxUserId, text, botToken, extraPayload, signal, requireMessageConfirmation = false }) {
  const token = String(botToken || '').trim() || (db ? await getTenantMaxBotToken(db, tenantId) : null);
  const apiBase = String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').trim().replace(/\/+$/, '');
  if (!token || !apiBase || !maxUserId || !text) return { ok: false, skipped: true };
  if (requireMessageConfirmation && new URL(apiBase).protocol !== 'https:') {
    throw Object.assign(new Error('MAX_HTTPS_REQUIRED'), { code: 'MAX_HTTPS_REQUIRED' });
  }

  const userQuery = encodeURIComponent(String(maxUserId).trim());
  const makePayload = (withExtra) => {
    const payload = { text: String(text) };
    if (withExtra && extraPayload && typeof extraPayload === 'object') {
      Object.assign(payload, extraPayload);
    }
    return payload;
  };

  const sendOnce = async (payload) => {
    const res = await fetchMaxApi(`${apiBase}/messages?user_id=${userQuery}`, {
      method: 'POST',
      ...(signal?{signal}:{}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text().catch(() => '');
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, raw };
  };

  const first = await sendOnce(makePayload(true));
  if (requireMessageConfirmation && (!first.ok || !first.data?.message)) {
    const attachmentNotReady = String(first.data?.code || '') === 'attachment.not.ready';
    const code = attachmentNotReady
      ? 'MAX_ATTACHMENT_NOT_READY'
      : !first.ok
      ? ({ 401: 'MAX_TOKEN_REJECTED', 403: 'MAX_BOT_BLOCKED', 429: 'MAX_RATE_LIMITED' })[first.status] || 'MAX_DELIVERY_FAILED'
      : 'MAX_INVALID_DELIVERY_RESPONSE';
    throw Object.assign(new Error(code), { code, ...(attachmentNotReady ? {} : { httpStatus: first.status }) });
  }
  if (first.ok) return { ok: true, data: first.data };

  const hasExtraPayload = Boolean(extraPayload && typeof extraPayload === 'object');
  if (hasExtraPayload) {
    const retry = await sendOnce(makePayload(false));
    if (retry.ok) return { ok: true, data: retry.data, fallbackWithoutPayload: true };
    const retryMsg = (retry.data && (retry.data.error || retry.data.message))
      ? String(retry.data.error || retry.data.message)
      : String(retry.raw || '').slice(0, 300);
    throw new Error(`MAX_SEND_FAILED:HTTP_${retry.status}${retryMsg ? `:${retryMsg}` : ''}`);
  }

  const firstMsg = (first.data && (first.data.error || first.data.message))
    ? String(first.data.error || first.data.message)
    : String(first.raw || '').slice(0, 300);
  throw new Error(`MAX_SEND_FAILED:HTTP_${first.status}${firstMsg ? `:${firstMsg}` : ''}`);
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
       FROM cust_customer_auth_tokens
       WHERE token=? AND provider='max' AND purpose='link' AND used_at IS NULL AND expires_at > NOW()
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
      `INSERT INTO cust_customer_auth_identities
       (tenant_id, customer_id, provider, provider_user_id, phone, linked_at)
       VALUES (?, ?, 'max', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         customer_id=VALUES(customer_id),
         phone=VALUES(phone),
         linked_at=NOW()`,
      [tenantId, customerId, userId, normalizedPhone || null]
    );

    await conn.query(
      `UPDATE cust_customer_auth_tokens
       SET used_at=NOW(), provider_user_id=?, phone=?
       WHERE tenant_id=? AND provider='max' AND purpose='link' AND token=? AND used_at IS NULL
       LIMIT 1`,
      [userId, normalizedPhone || null, tenantId, linkToken]
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
  fetchMaxApi,
  requestMaxBotApi,
  makeLinkToken,
  buildMaxDeepLink,
  getTenantMaxBotId,
  getTenantMaxBotToken,
  sendMaxMessage,
  confirmMaxLink,
  notifyCustomerLogin,
};
