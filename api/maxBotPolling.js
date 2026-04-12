const { confirmMaxLink, sendMaxMessage, getTenantMaxBotId } = require('./maxIntegration');
const crypto = require('crypto');

function normalizeUpdatesPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.updates)) return data.updates;
  return [];
}

function getNextMarker(data) {
  const marker = data?.marker;
  return marker === undefined || marker === null ? null : String(marker);
}

function extractUpdateId(update) {
  const candidate = (
    update?.update_id ??
    update?.id ??
    update?.message_id ??
    update?.event_id ??
    update?.message?.update_id ??
    update?.message?.id ??
    update?.event?.update_id ??
    update?.event?.id ??
    update?.data?.update_id ??
    update?.data?.id
  );
  if (candidate === undefined || candidate === null) return '';
  return String(candidate).trim();
}

function buildUpdateFingerprint(update) {
  try {
    const raw = JSON.stringify(update || {});
    return crypto.createHash('sha1').update(raw).digest('hex');
  } catch {
    return '';
  }
}

function makeEventDedupKey(update) {
  const updateId = extractUpdateId(update);
  if (updateId) return `u:${updateId}`;
  return '';
}

function buildPayloadHash(payload) {
  try {
    return crypto.createHash('sha1').update(JSON.stringify(payload || null)).digest('hex');
  } catch {
    return '';
  }
}

function makeOutgoingDedupKey(maxUserId, text, extraPayload) {
  const userId = String(maxUserId || '').trim();
  const msg = String(text || '').trim();
  if (!userId || !msg) return '';
  const payloadHash = buildPayloadHash(extraPayload);
  const body = payloadHash ? `${msg}\n${payloadHash}` : msg;
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  return `to:${userId}:h:${hash}`;
}

function parsePhoneFromText(text) {
  const t = String(text || '');
  const m = t.match(/(\+?\d[\d\s\-()]{8,}\d)/);
  return m && m[1] ? m[1] : '';
}

function parsePhoneFromAttachments(attachments) {
  if (!Array.isArray(attachments)) return '';
  for (const a of attachments) {
    const vcf = String(a?.payload?.vcf_info || '');
    if (vcf) {
      const vcfMatch = vcf.match(/TEL(?:;[^:\r\n]*)?:([+\d][\d\s\-()]*)/i);
      if (vcfMatch && vcfMatch[1]) return String(vcfMatch[1]).trim();
    }
    const p =
      a?.contact?.phone_number ||
      a?.contact?.phone ||
      a?.payload?.phone_number ||
      a?.payload?.phone ||
      '';
    if (p) return String(p).trim();
  }
  return '';
}

function deepFindFirstStringByKeys(input, keysSet, depth = 0) {
  if (!input || depth > 8) return '';
  if (typeof input === 'string') return '';
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = deepFindFirstStringByKeys(item, keysSet, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof input !== 'object') return '';

  for (const [k, v] of Object.entries(input)) {
    const key = String(k || '').toLowerCase();
    if (keysSet.has(key)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
  }
  for (const v of Object.values(input)) {
    const found = deepFindFirstStringByKeys(v, keysSet, depth + 1);
    if (found) return found;
  }
  return '';
}

function parsePhoneFromRawObject(input) {
  try {
    const raw = JSON.stringify(input || {});
    if (!raw) return '';
    const keyedMatch = raw.match(/"(?:phone|phone_number|phonenumber|normalized_phone|msisdn)"\s*:\s*"?(\+?\d[\d\s\-()]{8,}\d)"?/i);
    if (keyedMatch && keyedMatch[1]) return String(keyedMatch[1]).trim();
    const genericMatch = raw.match(/(\+?7[\d\s\-()]{9,}\d)/);
    if (genericMatch && genericMatch[1]) return String(genericMatch[1]).trim();
    return '';
  } catch {
    return '';
  }
}

function parseUpdate(update) {
  const message = update?.message || update?.event || update?.data || update || {};
  const body = message?.body || {};
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const updateType = String(update?.update_type || message?.update_type || '').trim().toLowerCase();
  const payload = String(update?.payload || message?.payload || '').trim();
  const text = String(
    body?.text ??
    message?.text ??
    message?.message?.text ??
    ''
  ).trim();
  const userId = String(
    message?.sender?.user_id ??
    message?.sender?.id ??
    message?.from?.user_id ??
    message?.from?.id ??
    message?.user?.user_id ??
    message?.user?.id ??
    ''
  ).trim();
  const senderName = String(
    message?.sender?.name ??
    [message?.sender?.first_name, message?.sender?.last_name].filter(Boolean).join(' ') ??
    message?.user?.name ??
    [message?.user?.first_name, message?.user?.last_name].filter(Boolean).join(' ') ??
    ''
  ).trim();
  const deepPhoneRaw = deepFindFirstStringByKeys(
    message,
    new Set(['phone', 'phone_number', 'phonenumber', 'normalized_phone', 'msisdn'])
  );
  const rawPhone = parsePhoneFromRawObject(update);
  const phone = String(
    body?.contact?.phone_number ??
    body?.contact?.phone ??
    parsePhoneFromAttachments(attachments) ??
    deepPhoneRaw ??
    rawPhone ??
    parsePhoneFromText(text)
  ).trim();
  const hasContact = Boolean(body?.contact) || attachments.some((a) => {
    const type = String(a?.type || '').toLowerCase();
    return (
      type.includes('contact') ||
      Boolean(a?.contact) ||
      Boolean(a?.payload?.contact) ||
      Boolean(a?.payload?.phone) ||
      Boolean(a?.payload?.phone_number)
    );
  });
  return { text, userId, senderName, phone, hasContact, updateType, payload, raw: update };
}

function normalizeOrigin(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const u = new URL(value);
    const proto = String(u.protocol || '').toLowerCase();
    if (proto !== 'https:' && proto !== 'http:') return '';
    if (proto === 'http:' && !(u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname === '127.0.0.1')) {
      return '';
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

async function fetchTenantsWithMaxToken(db) {
  const [rows] = await db.query(
    `SELECT id, max_bot_token
     FROM ten_tenants
     WHERE is_active=1 AND max_bot_token IS NOT NULL AND max_bot_token <> ''`
  );
  const grouped = new Map();
  for (const r of rows || []) {
    const tenantId = Number(r.id);
    const token = String(r.max_bot_token || '').trim();
    if (!Number.isFinite(tenantId) || tenantId <= 0 || !token) continue;
    if (!grouped.has(token)) grouped.set(token, []);
    grouped.get(token).push(tenantId);
  }

  return Array.from(grouped.entries()).map(([token, tenantIds]) => {
    const sortedTenantIds = tenantIds
      .filter((id) => Number.isFinite(Number(id)) && Number(id) > 0)
      .map((id) => Number(id))
      .sort((a, b) => a - b);
    return {
      token,
      tenantIds: sortedTenantIds,
      tenantId: sortedTenantIds[0] || null,
    };
  }).filter((entry) => entry.token && Number.isFinite(entry.tenantId) && entry.tenantId > 0);
}

async function rememberPendingToken(db, tenantId, userId, token) {
  if (!tenantId || !userId || !token) return;
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at, provider_user_id)
       VALUES (?, NULL, 'max', 'pending', ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)
       ON DUPLICATE KEY UPDATE
         expires_at=VALUES(expires_at),
         provider_user_id=VALUES(provider_user_id)`,
      [tenantId, token, String(userId)]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_PENDING_FAILED:', err.message || err);
  }
}

async function readPendingToken(db, tenantId, userId) {
  if (!tenantId || !userId) return null;
  const [rows] = await db.query(
    `SELECT token
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='max' AND purpose='pending' AND provider_user_id=? AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [tenantId, String(userId)]
  );
  return rows[0]?.token || null;
}

async function readLoginOriginToken(db, tenantId, token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return '';
  const [rows] = await db.query(
    `SELECT provider_user_id, phone
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='max' AND purpose='pending'
       AND token=?
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY id DESC
     LIMIT 1`,
    [Number(tenantId), rawToken]
  );
  const row = rows[0];
  if (!row) return '';
  if (String(row.phone || '').trim() === 'login_origin') {
    return normalizeOrigin(row.provider_user_id);
  }
  return '';
}

async function rememberPendingOrigin(db, tenantId, userId, origin) {
  const normalized = normalizeOrigin(origin);
  const tId = Number(tenantId);
  const uId = String(userId || '').trim();
  if (!tId || !uId || !normalized) return;
  const tokenKey = `max-origin-${tId}-${uId}`;
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at, provider_user_id, phone)
       VALUES (?, NULL, 'max', 'pending', ?, DATE_ADD(NOW(), INTERVAL 10 YEAR), ?, 'max_origin')
       ON DUPLICATE KEY UPDATE
         expires_at=VALUES(expires_at),
         provider_user_id=VALUES(provider_user_id),
         phone=VALUES(phone)`,
      [tId, tokenKey, normalized]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_PENDING_ORIGIN_FAILED:', err.message || err);
  }
}

async function readPendingOrigin(db, tenantId, userId) {
  const tId = Number(tenantId);
  const uId = String(userId || '').trim();
  if (!tId || !uId) return '';
  const tokenKey = `max-origin-${tId}-${uId}`;
  const [rows] = await db.query(
    `SELECT provider_user_id, phone
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='max' AND purpose='pending'
       AND token=?
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [tId, tokenKey]
  );
  const row = rows[0];
  if (!row) return '';
  if (String(row.phone || '').trim() === 'max_origin') {
    return normalizeOrigin(row.provider_user_id);
  }
  return '';
}

async function cleanupPending(db) {
  try {
    await db.query(
      `DELETE FROM cust_customer_auth_tokens
       WHERE provider='max' AND purpose='pending' AND expires_at <= NOW()`
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_PENDING_CLEANUP_FAILED:', err.message || err);
  }
}

async function getTenantReturnLinks(db, tenantId, originBaseUrl = '') {
  const tId = Number(tenantId);
  if (!Number.isFinite(tId) || tId <= 0) return { siteUrl: null, miniAppUrl: null };

  const [tenantRows] = await db.query(
    `SELECT custom_domain, subdomain, max_mini_app_enabled
     FROM ten_tenants
     WHERE id=?
     LIMIT 1`,
    [tId]
  );
  const row = tenantRows[0] || {};
  const maxMiniAppEnabled = Number(row.max_mini_app_enabled ?? 1) === 1;

  const requestedOrigin = normalizeOrigin(originBaseUrl);
  if (requestedOrigin) {
    const siteUrlFromOrigin = `${requestedOrigin}/shop`;
    const botIdFromOrigin = maxMiniAppEnabled ? await getTenantMaxBotId(db, tId) : null;
    const miniAppUrlFromOrigin = botIdFromOrigin
      ? `https://max.ru/${encodeURIComponent(botIdFromOrigin)}?startapp=shop`
      : null;
    return { siteUrl: siteUrlFromOrigin, miniAppUrl: miniAppUrlFromOrigin };
  }

  const overrideSiteUrl = String(process.env.MAX_RETURN_SITE_URL || '').trim();
  if (overrideSiteUrl) {
    const normalized = overrideSiteUrl.replace(/\/+$/, '');
    const botIdOverride = maxMiniAppEnabled ? await getTenantMaxBotId(db, tId) : null;
    const miniAppUrlOverride = botIdOverride
      ? `https://max.ru/${encodeURIComponent(botIdOverride)}?startapp=shop`
      : null;
    return { siteUrl: normalized, miniAppUrl: miniAppUrlOverride };
  }

  const baseInfo = resolveRuntimeBaseInfo();
  const baseDomain = deriveBaseDomainFromHost(baseInfo.host);
  const host = row.custom_domain
    ? String(row.custom_domain).trim()
    : (row.subdomain ? `${String(row.subdomain).trim()}.${baseDomain}` : baseDomain);
  const protocol = (host.includes('localhost') || host.startsWith('127.0.0.1')) ? 'http' : baseInfo.protocol;
  const siteUrl = host ? `${protocol}://${host}/shop` : null;

  const botId = maxMiniAppEnabled ? await getTenantMaxBotId(db, tId) : null;
  const miniAppUrl = botId ? `https://max.ru/${encodeURIComponent(botId)}?startapp=shop` : null;
  return { siteUrl, miniAppUrl };
}

function makeOneTimeLoginToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '') + crypto.randomBytes(8).toString('hex');
  return crypto.randomBytes(24).toString('hex');
}

function toMaxInlineLinkUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = String(u.hostname || '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) {
      // MAX API rejects localhost/.localhost links in inline keyboard buttons.
      // For local env keep port/path/query, but use loopback host to pass validation.
      u.hostname = '127.0.0.1';
    }
    return u.toString();
  } catch {
    return null;
  }
}

function isMaxInlineLinkUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') return true;
    if (u.protocol !== 'http:') return false;
    const host = String(u.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimeBaseInfo() {
  const direct = String(
    process.env.TENANT_BASE_DOMAIN
    || process.env.APP_BASE_DOMAIN
    || process.env.PUBLIC_BASE_DOMAIN
    || ''
  ).trim();
  if (direct) {
    const host = direct.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const protocol = (host.includes('localhost') || host.startsWith('127.0.0.1')) ? 'http' : 'https';
    return { protocol, host };
  }

  const fromUrl = String(
    process.env.MAX_RETURN_SITE_URL
    || process.env.APP_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.SITE_BASE_URL
    || ''
  ).trim();
  if (fromUrl) {
    try {
      const parsed = new URL(fromUrl);
      return { protocol: (parsed.protocol || 'https:').replace(':', ''), host: parsed.host };
    } catch {
      const cleaned = fromUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const protocol = (cleaned.includes('localhost') || cleaned.startsWith('127.0.0.1')) ? 'http' : 'https';
      return { protocol, host: cleaned };
    }
  }

  return { protocol: 'http', host: 'localhost:3000' };
}

function splitHostPort(hostWithPort) {
  const raw = String(hostWithPort || '').trim();
  const idx = raw.lastIndexOf(':');
  if (idx > 0 && raw.indexOf(']') === -1) {
    return { hostname: raw.slice(0, idx), port: raw.slice(idx + 1) };
  }
  return { hostname: raw, port: '' };
}

function deriveBaseDomainFromHost(hostWithPort) {
  const { hostname, port } = splitHostPort(hostWithPort);
  const parts = String(hostname || '').split('.').filter(Boolean);
  let baseHost = String(hostname || '');
  if (parts.length >= 3) {
    baseHost = parts.slice(1).join('.');
  } else if (parts.length === 2 && parts[1] === 'localhost') {
    baseHost = 'localhost';
  }
  return port ? `${baseHost}:${port}` : baseHost;
}

function buildFinishLoginUrl(siteUrl, loginToken, target, usePersistentToken = false) {
  const raw = String(siteUrl || '').trim();
  if (!raw || !loginToken) return null;
  try {
    const u = new URL(raw);
    u.pathname = '/api/public/max/finish-login';
    u.search = '';
    u.searchParams.set(usePersistentToken ? 'ptoken' : 'token', String(loginToken));
    u.searchParams.set('target', String(target || 'site'));
    return u.toString();
  } catch {
    return null;
  }
}

async function issueOneTimeLoginToken(db, tenantId, customerId) {
  const token = makeOneTimeLoginToken();
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at)
       VALUES (?, ?, 'max', 'login', ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [Number(tenantId), Number(customerId), token]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_LOGIN_TOKEN_FAILED:', err.message || err);
  }
  return token;
}

async function issuePersistentMaxLoginToken(db, tenantId, customerId, maxUserId) {
  const tId = Number(tenantId);
  const cId = Number(customerId);
  const providerUserId = String(maxUserId || '').trim();
  if (!tId || !cId || !providerUserId) return '';

  const [existing] = await db.query(
    `SELECT token
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND customer_id=? AND provider='max' AND purpose='login'
       AND provider_user_id=?
     ORDER BY id DESC
     LIMIT 1`,
    [tId, cId, providerUserId]
  );
  if (existing.length && existing[0]?.token) return String(existing[0].token);

  const token = makeOneTimeLoginToken();
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at, provider_user_id)
       VALUES (?, ?, 'max', 'login', ?, DATE_ADD(NOW(), INTERVAL 100 YEAR), ?)`,
      [tId, cId, token, providerUserId]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_PERSISTENT_LOGIN_TOKEN_FAILED:', err.message || err);
  }
  return token;
}

async function findKnownCustomerForAuth(db, helpers, tenantId, maxUserId, phone) {
  const tId = Number(tenantId);
  const uId = String(maxUserId || '').trim();
  const normalizedPhone = helpers && typeof helpers.normalizePhone === 'function'
    ? helpers.normalizePhone(phone)
    : String(phone || '').trim();
  if (!tId || !uId) return null;

  const [byMax] = await db.query(
    `SELECT id
     FROM cust_customers
     WHERE tenant_id=? AND is_active=1 AND max_user_id=?
     LIMIT 1`,
    [tId, uId]
  );
  if (byMax.length) return Number(byMax[0].id);

  if (!normalizedPhone) return null;

  const [byPhone] = await db.query(
    `SELECT id, max_user_id
     FROM cust_customers
     WHERE tenant_id=? AND is_active=1 AND phone=?
     LIMIT 1`,
    [tId, normalizedPhone]
  );
  if (!byPhone.length) return null;

  const row = byPhone[0];
  const currentMaxUserId = String(row.max_user_id || '').trim();
  if (currentMaxUserId && currentMaxUserId !== uId) return null;

  await db.query(
    `UPDATE cust_customers
     SET max_user_id=?,
         phone_verified_at=COALESCE(phone_verified_at, NOW()),
         updated_at=NOW()
     WHERE tenant_id=? AND id=?`,
    [uId, tId, Number(row.id)]
  );
  return Number(row.id);
}

async function buildLoginMessage(db, tenantId, customerId, okText, originBaseUrl = '') {
  let text = String(okText || 'MAX \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d \u043a \u0432\u0430\u0448\u0435\u043c\u0443 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0443.');
  let extraPayload = null;
  const links = await getTenantReturnLinks(db, tenantId, originBaseUrl);
  const [customerRows] = await db.query(
    `SELECT max_user_id
     FROM cust_customers
     WHERE tenant_id=? AND id=?
     LIMIT 1`,
    [Number(tenantId), Number(customerId)]
  );
  const providerUserId = String(customerRows[0]?.max_user_id || '').trim();
  const loginToken = await issuePersistentMaxLoginToken(db, tenantId, Number(customerId), providerUserId);
  const finishSiteUrl = buildFinishLoginUrl(links.siteUrl, loginToken, 'site', true);
  const finishMiniAppUrl = buildFinishLoginUrl(links.siteUrl, loginToken, 'miniapp', true);
  const siteButtonUrl = toMaxInlineLinkUrl(finishSiteUrl);
  const miniAppButtonUrl = toMaxInlineLinkUrl(finishMiniAppUrl);
  const tenantBotId = await getTenantMaxBotId(db, Number(tenantId));
  const buttons = [];
  if (siteButtonUrl && isMaxInlineLinkUrl(siteButtonUrl)) {
    buttons.push([{ type: 'link', text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u0430\u0439\u0442', url: siteButtonUrl }]);
  }
  if (tenantBotId && loginToken) {
    buttons.push([{
      type: 'open_app',
      text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0438\u043d\u0438-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435',
      web_app: tenantBotId,
      payload: loginToken,
    }]);
  } else if (miniAppButtonUrl && isMaxInlineLinkUrl(miniAppButtonUrl)) {
    buttons.push([{ type: 'link', text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0438\u043d\u0438-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435', url: miniAppButtonUrl }]);
  }
  if (buttons.length) {
    extraPayload = {
      attachments: [
        {
          type: 'inline_keyboard',
          payload: { buttons },
        },
      ],
    };
  }
  return { text, extraPayload };
}

async function bindByPhoneDirect(db, helpers, tenantId, maxUserId, phone, senderName) {
  const tId = Number(tenantId);
  const uId = String(maxUserId || '').trim();
  const normalizedPhone = helpers && typeof helpers.normalizePhone === 'function'
    ? helpers.normalizePhone(phone)
    : String(phone || '').trim();
  const normalizedName = String(senderName || '').trim();

  if (!tId || !uId || !normalizedPhone) {
    return { ok: false, error: 'PHONE_REQUIRED' };
  }

  const [rows] = await db.query(
    `SELECT id, name, is_active
     FROM cust_customers
     WHERE tenant_id=? AND phone=?
     LIMIT 1`,
    [tId, normalizedPhone]
  );
  let customerId = null;
  if (!rows.length) {
    const [ins] = await db.query(
      `INSERT INTO cust_customers
       (tenant_id, store_id, name, phone, is_active, registration_date, phone_verified_at, max_user_id)
       VALUES (?, 1, ?, ?, 1, CURDATE(), NOW(), ?)`,
      [tId, normalizedName || '\u041a\u043b\u0438\u0435\u043d\u0442', normalizedPhone, uId]
    );
    customerId = Number(ins.insertId);
    try {
      await db.query(
        `INSERT INTO cust_customer_auth_identities
         (tenant_id, customer_id, provider, provider_user_id, phone, linked_at)
         VALUES (?, ?, 'max', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           customer_id=VALUES(customer_id),
           phone=VALUES(phone),
           linked_at=NOW()`,
        [tId, customerId, uId, normalizedPhone]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_MAX_IDENTITY_FAILED:', err.message || err);
    }
    return { ok: true, customerId, phone: normalizedPhone };
  }

  const row = rows[0];
  if (Number(row.is_active || 0) !== 1) {
    return { ok: false, error: 'CUSTOMER_BLOCKED' };
  }
  customerId = Number(row.id);
  const existingName = String(row.name || '').trim();
  const nextName = existingName || normalizedName || null;

  await db.query(
    `UPDATE cust_customers
     SET max_user_id=?,
         name=COALESCE(?, name),
         phone_verified_at=NOW(),
         phone_verify_code=NULL,
         phone_verify_expires_at=NULL,
         updated_at=NOW()
     WHERE tenant_id=? AND id=?`,
    [uId, nextName, tId, customerId]
  );
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_identities
       (tenant_id, customer_id, provider, provider_user_id, phone, linked_at)
       VALUES (?, ?, 'max', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         customer_id=VALUES(customer_id),
         phone=VALUES(phone),
         linked_at=NOW()`,
      [tId, customerId, uId, normalizedPhone]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_MAX_IDENTITY_FAILED:', err.message || err);
  }

  return { ok: true, customerId, phone: normalizedPhone };
}

function extractStartAppToken(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const start = t.match(/(?:^|[?&])start=([A-Za-z0-9_-]+)/i);
  if (start && start[1]) return start[1];
  const direct = t.match(/startapp=([A-Za-z0-9_-]+)/i);
  if (direct && direct[1]) return direct[1];
  const cmdStart = t.match(/^\/start\s+([A-Za-z0-9_-]+)/i);
  if (cmdStart && cmdStart[1]) return cmdStart[1];
  const cmd = t.match(/^\/startapp\s+([A-Za-z0-9_-]+)/i);
  if (cmd && cmd[1]) return cmd[1];
  return null;
}

function isGenericLinkPayload(token) {
  const t = String(token || '').trim().toLowerCase();
  return t === 'link' || t === 'login' || t === 'auth';
}

function isPlainStartCommand(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return (
    /^\/start(?:\s+)?$/i.test(t) ||
    /^\/startapp(?:\s+)?$/i.test(t) ||
    /^\/link(?:\s+)?$/i.test(t)
  );
}

function startMaxPolling(db, helpers) {
  const apiBase = String(process.env.MAX_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!apiBase) {
    console.warn('MAX polling disabled: MAX_API_BASE_URL is empty');
    return;
  }

  const markersByToken = new Map();
  const seenEventsByToken = new Map();
  const sentMessagesByToken = new Map();
  const dedupTtlMs = Math.max(60 * 1000, Number(process.env.MAX_EVENT_DEDUP_TTL_MS || 0) || (10 * 60 * 1000));
  const dedupMaxKeysPerToken = Math.max(1000, Number(process.env.MAX_EVENT_DEDUP_MAX_KEYS || 0) || 5000);
  const sendDedupTtlMs = Math.max(5 * 1000, Number(process.env.MAX_SEND_DEDUP_TTL_MS || 0) || (30 * 1000));
  const sendDedupMaxKeysPerToken = Math.max(500, Number(process.env.MAX_SEND_DEDUP_MAX_KEYS || 0) || 5000);
  let pollBusy = false;
  let stopped = false;
  let timer = null;

  function schedulePoll(delayMs) {
    if (stopped) return;
    timer = setTimeout(poll, delayMs);
  }

  function rememberIfNewEvent(token, eventKey) {
    if (!token || !eventKey) return true;
    const now = Date.now();
    let seen = seenEventsByToken.get(token);
    if (!seen) {
      seen = new Map();
      seenEventsByToken.set(token, seen);
    }

    // Periodic TTL cleanup.
    if (seen.size > 0 && seen.size % 50 === 0) {
      for (const [key, ts] of seen.entries()) {
        if ((now - ts) > dedupTtlMs) seen.delete(key);
      }
    }

    const prev = seen.get(eventKey);
    if (prev && (now - prev) <= dedupTtlMs) return false;

    seen.set(eventKey, now);
    if (seen.size > dedupMaxKeysPerToken) {
      const dropCount = Math.max(1, Math.floor(dedupMaxKeysPerToken * 0.1));
      let removed = 0;
      for (const key of seen.keys()) {
        seen.delete(key);
        removed += 1;
        if (removed >= dropCount) break;
      }
    }
    return true;
  }

  function rememberIfNewOutgoing(token, outgoingKey) {
    if (!token || !outgoingKey) return true;
    const now = Date.now();
    let seen = sentMessagesByToken.get(token);
    if (!seen) {
      seen = new Map();
      sentMessagesByToken.set(token, seen);
    }

    if (seen.size > 0 && seen.size % 50 === 0) {
      for (const [key, ts] of seen.entries()) {
        if ((now - ts) > sendDedupTtlMs) seen.delete(key);
      }
    }

    const prev = seen.get(outgoingKey);
    if (prev && (now - prev) <= sendDedupTtlMs) return false;

    seen.set(outgoingKey, now);
    if (seen.size > sendDedupMaxKeysPerToken) {
      const dropCount = Math.max(1, Math.floor(sendDedupMaxKeysPerToken * 0.1));
      let removed = 0;
      for (const key of seen.keys()) {
        seen.delete(key);
        removed += 1;
        if (removed >= dropCount) break;
      }
    }
    return true;
  }

  function forgetOutgoing(token, outgoingKey) {
    if (!token || !outgoingKey) return;
    const seen = sentMessagesByToken.get(token);
    if (!seen) return;
    seen.delete(outgoingKey);
  }

  async function sendMaxMessageSafe(payload) {
    const outgoingKey = makeOutgoingDedupKey(
      payload?.maxUserId,
      payload?.text,
      payload?.extraPayload
    );
    const botToken = String(payload?.botToken || '').trim();
    if (!rememberIfNewOutgoing(botToken, outgoingKey)) return;
    try {
      await sendMaxMessage(payload);
    } catch (err) {
      forgetOutgoing(botToken, outgoingKey);
      throw err;
    }
  }

  async function pollTenant({ tenantId, tenantIds, token }) {
    let marker = markersByToken.get(token) || null;
    try {
      const markerParam = marker ? `&marker=${encodeURIComponent(marker)}` : '';
      const url = `${apiBase}/updates?timeout=25${markerParam}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: token,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        throw new Error(`HTTP_${res.status}:${raw.slice(0, 300)}`);
      }
      const data = await res.json();
      const updates = normalizeUpdatesPayload(data);
      const nextMarker = getNextMarker(data);
      if (nextMarker) marker = nextMarker;

      for (const u of updates) {
        const eventKey = makeEventDedupKey(u);
        if (!rememberIfNewEvent(token, eventKey)) continue;
        const parsed = parseUpdate(u);

        const startToken = parsed.payload || extractStartAppToken(parsed.text);
        if (startToken && parsed.userId) {
          let loginOrigin = '';
          if (!isGenericLinkPayload(startToken)) {
            loginOrigin = await readLoginOriginToken(db, tenantId, startToken);
            if (loginOrigin) {
              await rememberPendingOrigin(db, tenantId, parsed.userId, loginOrigin);
            } else {
              await rememberPendingToken(db, tenantId, parsed.userId, startToken);
            }
          }
          const pendingOrigin = loginOrigin || await readPendingOrigin(db, tenantId, parsed.userId);
          const knownCustomerId = await findKnownCustomerForAuth(
            db,
            helpers,
            tenantId,
            parsed.userId,
            parsed.phone
          );
          if (knownCustomerId) {
            const loginMessage = await buildLoginMessage(
              db,
              tenantId,
              knownCustomerId,
              '\u041c\u044b \u0443\u0437\u043d\u0430\u043b\u0438 \u0432\u0430\u0448 \u0430\u043a\u043a\u0430\u0443\u043d\u0442. \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435, \u043a\u0443\u0434\u0430 \u043f\u0435\u0440\u0435\u0439\u0442\u0438:',
              pendingOrigin
            );
            await sendMaxMessageSafe({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: loginMessage.text,
              extraPayload: loginMessage.extraPayload || undefined,
            });
            continue;
          }
          const contactButtonAttachment = {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [{ type: 'request_contact', text: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430' }],
                  ],
                },
              },
            ],
          };
          try {
            await sendMaxMessageSafe({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0434\u043b\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438.',
              extraPayload: contactButtonAttachment,
            });
          } catch {
            await sendMaxMessageSafe({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c \u0434\u043b\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438.',
            });
          }
          continue;
        }

        if (isPlainStartCommand(parsed.text) && parsed.userId) {
          const pendingOrigin = await readPendingOrigin(db, tenantId, parsed.userId);
          const knownCustomerId = await findKnownCustomerForAuth(
            db,
            helpers,
            tenantId,
            parsed.userId,
            parsed.phone
          );
          if (knownCustomerId) {
            const loginMessage = await buildLoginMessage(
              db,
              tenantId,
              knownCustomerId,
              '\u041c\u044b \u0443\u0437\u043d\u0430\u043b\u0438 \u0432\u0430\u0448 \u0430\u043a\u043a\u0430\u0443\u043d\u0442. \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435, \u043a\u0443\u0434\u0430 \u043f\u0435\u0440\u0435\u0439\u0442\u0438:',
              pendingOrigin
            );
            await sendMaxMessageSafe({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: loginMessage.text,
              extraPayload: loginMessage.extraPayload || undefined,
            });
            continue;
          }
          await sendMaxMessageSafe({
            db,
            tenantId,
            botToken: token,
            maxUserId: parsed.userId,
            text: '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u043d\u0438\u0436\u0435 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430. \u0415\u0441\u043b\u0438 \u043d\u0443\u0436\u043d\u043e \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0443, \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u0443 /link.',
            extraPayload: {
              attachments: [
                {
                  type: 'inline_keyboard',
                  payload: {
                    buttons: [
                      [{ type: 'request_contact', text: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430' }],
                    ],
                  },
                },
              ],
            },
          });
          continue;
        }

        if (parsed.userId && (parsed.phone || parsed.hasContact)) {
          const pendingToken = await readPendingToken(db, tenantId, parsed.userId);
          let result = null;

          if (pendingToken && !isGenericLinkPayload(pendingToken)) {
            // Link token can complete binding even if MAX did not provide the phone explicitly.
            result = await confirmMaxLink({
              db,
              helpers,
              token: pendingToken,
              maxUserId: parsed.userId,
              phone: parsed.phone,
            });
            // In "Login via MAX" flow payload can be generic (e.g. "link").
            // In this case confirmMaxLink can return TOKEN_INVALID_OR_EXPIRED.
            // Then fallback to phone-based binding if phone is present.
            if (!result?.ok && parsed.phone && String(result?.error || '') === 'TOKEN_INVALID_OR_EXPIRED') {
              result = await bindByPhoneDirect(db, helpers, tenantId, parsed.userId, parsed.phone, parsed.senderName);
            }
          } else if (parsed.phone) {
            result = await bindByPhoneDirect(db, helpers, tenantId, parsed.userId, parsed.phone, parsed.senderName);
          } else {
            result = { ok: false, error: 'PHONE_NOT_PROVIDED' };
          }

          let text = result.ok
            ? 'MAX \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d \u043a \u0432\u0430\u0448\u0435\u043c\u0443 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0443.'
            : (result.error === 'PHONE_NOT_PROVIDED'
              ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043d\u043e\u043c\u0435\u0440. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c MAX" \u043d\u0430 \u0441\u0430\u0439\u0442\u0435 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435.'
              : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0443. \u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u043d\u043e\u0432\u0443\u044e \u0441\u0441\u044b\u043b\u043a\u0443 \u043d\u0430 \u0441\u0430\u0439\u0442\u0435.');

          if (!result.ok && String(result.error || '') === 'PHONE_NOT_PROVIDED') {
            try {
              const dump = JSON.stringify(parsed.raw || {}).slice(0, 2000);
              console.warn(`MAX contact without phone (tenant ${tenantId}, user ${parsed.userId}): ${dump}`);
            } catch {}
          }

          let extraPayload = null;
          if (result.ok) {
            const pendingOrigin = await readPendingOrigin(db, tenantId, parsed.userId);
            const loginMessage = await buildLoginMessage(
              db,
              tenantId,
              Number(result.customerId),
              text,
              pendingOrigin
            );
            text = loginMessage.text;
            extraPayload = loginMessage.extraPayload || null;
          }

          await sendMaxMessageSafe({
            db,
            tenantId,
            botToken: token,
            maxUserId: parsed.userId,
            text,
            extraPayload: extraPayload || undefined,
          });
        }
      }

      if (marker) markersByToken.set(token, marker);
    } catch (err) {
      console.error(`MAX polling error (tenant ${tenantId}):`, err.message || err);
    }
  }

  async function poll() {
    if (stopped) return;
    if (pollBusy) {
      schedulePoll(1000);
      return;
    }
    pollBusy = true;
    try {
      const tenants = await fetchTenantsWithMaxToken(db);
      for (const tenant of tenants) {
        if (Array.isArray(tenant.tenantIds) && tenant.tenantIds.length > 1) {
          console.warn(
            `MAX polling: shared bot token for tenants ${tenant.tenantIds.join(', ')}. Polling once to avoid duplicate replies.`
          );
        }
      }
      for (const tenant of tenants) {
        await pollTenant(tenant);
      }
      await cleanupPending(db);
    } catch (err) {
      console.error('MAX polling loop error:', err.message || err);
    } finally {
      pollBusy = false;
    }

    schedulePoll(500);
  }

  console.log('MAX bot polling started (tenant tokens from DB)');
  poll();
  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

module.exports = { startMaxPolling };
