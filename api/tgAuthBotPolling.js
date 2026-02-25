const crypto = require('crypto');

const TELEGRAM_API = 'https://api.telegram.org/bot';

function makeOneTimeToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '') + crypto.randomBytes(8).toString('hex');
  return crypto.randomBytes(24).toString('hex');
}

function normalizePayloadFromStartText(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!m) return '';
  return String(m[1] || '').trim().split(/\s+/)[0] || '';
}

function isLoginPayload(payload) {
  const p = String(payload || '').trim().toLowerCase();
  return p === 'login' || p === 'auth' || p === 'link' || p === 'shop';
}

function isPlainStart(text) {
  return /^\/start(?:@\w+)?\s*$/i.test(String(text || '').trim());
}

function isAllowedPublicUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname.endsWith('.localhost'))) return true;
    return false;
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
    process.env.APP_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.SITE_BASE_URL
    || process.env.MAX_RETURN_SITE_URL
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

async function inferTenantOrigin(db, tenantId) {
  try {
    const [rows] = await db.query(
      `SELECT subdomain, custom_domain
       FROM ten_tenants
       WHERE id=?
       LIMIT 1`,
      [Number(tenantId)]
    );
    const tenant = rows[0] || {};
    const baseInfo = resolveRuntimeBaseInfo();
    const baseDomain = deriveBaseDomainFromHost(baseInfo.host);
    const host = tenant.custom_domain
      ? String(tenant.custom_domain).trim()
      : (tenant.subdomain ? `${String(tenant.subdomain).trim()}.${baseDomain}` : baseDomain);
    if (!host) return '';
    const protocol = (host.includes('localhost') || host.startsWith('127.0.0.1')) ? 'http' : baseInfo.protocol;
    return `${protocol}://${host}`;
  } catch {
    return '';
  }
}

async function fetchTenantBots(db) {
  const [rows] = await db.query(
    `SELECT id, telegram_bot_username, telegram_bot_token, tg_login_enabled
     FROM ten_tenants
     WHERE is_active=1
       AND tg_login_enabled=1
       AND telegram_bot_username IS NOT NULL AND telegram_bot_username <> ''
       AND telegram_bot_token IS NOT NULL AND telegram_bot_token <> ''`
  );

  const uniqueByToken = new Map();
  for (const r of rows || []) {
    const token = String(r.telegram_bot_token || '').trim();
    if (!token) continue;
    if (uniqueByToken.has(token)) continue;
    uniqueByToken.set(token, {
      tenantId: Number(r.id),
      username: String(r.telegram_bot_username || '').trim().replace(/^@/, ''),
      token,
    });
  }
  return Array.from(uniqueByToken.values()).filter((x) => x.tenantId > 0 && x.username && x.token);
}

async function sendTelegramMessage(token, chatId, text, extra = null) {
  const body = { chat_id: chatId, text: String(text || '') };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(`TG_SEND_FAILED:${res.status}:${data?.description || 'unknown'}`);
  }
}

async function sendContactRequest(token, chatId) {
  await sendTelegramMessage(
    token,
    chatId,
    '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u043d\u0438\u0436\u0435 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430:',
    {
      reply_markup: {
        keyboard: [[{ text: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function bindByLinkToken(db, tenantId, tgUserId, token) {
  const [rows] = await db.query(
    `SELECT id, customer_id
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND token=? AND provider='tg' AND purpose='link' AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tenantId, String(token || '').trim()]
  );
  if (!rows.length) return { ok: false, error: 'TOKEN_INVALID' };

  const row = rows[0];
  await db.query(
    `UPDATE cust_customers
     SET telegram_user_id=?, updated_at=NOW()
     WHERE tenant_id=? AND id=?`,
    [String(tgUserId), Number(tenantId), Number(row.customer_id)]
  );
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_identities
       (tenant_id, customer_id, provider, provider_user_id, linked_at)
       VALUES (?, ?, 'tg', ?, NOW())
       ON DUPLICATE KEY UPDATE
         customer_id=VALUES(customer_id),
         linked_at=NOW()`,
      [Number(tenantId), Number(row.customer_id), String(tgUserId)]
    );
    await db.query(
      `UPDATE cust_customer_auth_tokens
       SET used_at=NOW(), provider_user_id=?
       WHERE tenant_id=? AND provider='tg' AND purpose='link' AND token=? AND used_at IS NULL
       LIMIT 1`,
      [String(tgUserId), Number(tenantId), String(token || '').trim()]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_TG_LINK_FAILED:', err.message || err);
  }
  return { ok: true, customerId: Number(row.customer_id) };
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

async function readLoginOriginToken(db, tenantId, token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return '';
  const [rows] = await db.query(
    `SELECT id, provider_user_id, phone
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='tg' AND purpose IN ('pending', '')
       AND token=?
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY id DESC
     LIMIT 1`,
    [Number(tenantId), rawToken]
  );
  if (!rows.length) return '';
  const row = rows[0];
  if (String(row.phone || '').trim() === 'login_origin') {
    return normalizeOrigin(row.provider_user_id);
  }
  if (String(row.provider_user_id || '').trim() === 'login_origin') {
    const legacyOrigin = normalizeOrigin(row.phone);
    if (legacyOrigin) return legacyOrigin;
    return inferTenantOrigin(db, tenantId);
  }
  const directPhoneOrigin = normalizeOrigin(row.phone);
  if (directPhoneOrigin) return directPhoneOrigin;
  const directProviderOrigin = normalizeOrigin(row.provider_user_id);
  if (directProviderOrigin) return directProviderOrigin;
  return inferTenantOrigin(db, tenantId);
}

async function rememberPendingOrigin(db, tenantId, tgUserId, origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return;
  const tokenKey = `tg-origin-${Number(tenantId)}-${String(tgUserId || '').trim()}`;
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at, provider_user_id, phone)
       VALUES (?, NULL, 'tg', 'pending', ?, DATE_ADD(NOW(), INTERVAL 10 YEAR), ?, 'tg_origin')
       ON DUPLICATE KEY UPDATE
         expires_at=VALUES(expires_at),
         provider_user_id=VALUES(provider_user_id),
         phone=VALUES(phone)`,
      [Number(tenantId), tokenKey, normalized]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_TG_PENDING_ORIGIN_FAILED:', err.message || err);
  }
}

async function readPendingOrigin(db, tenantId, tgUserId) {
  const tokenKey = `tg-origin-${Number(tenantId)}-${String(tgUserId || '').trim()}`;
  const [rows] = await db.query(
    `SELECT provider_user_id, phone
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='tg' AND purpose='pending'
       AND token=? AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [Number(tenantId), tokenKey]
  );
  const row = rows[0];
  if (row) {
    if (String(row.phone || '').trim() === 'tg_origin') {
      return normalizeOrigin(row.provider_user_id);
    }
    return normalizeOrigin(row.phone);
  }

  // Backward compatibility for rows created by previous builds.
  const [legacyRows] = await db.query(
    `SELECT phone
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND provider='tg' AND purpose='pending'
       AND token LIKE 'tg-origin-%'
       AND provider_user_id=? AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [Number(tenantId), String(tgUserId || '').trim()]
  );
  return normalizeOrigin(legacyRows[0]?.phone);
}

async function bindByPhone(db, helpers, tenantId, tgUserId, rawPhone, senderName) {
  const normalizePhone = helpers && typeof helpers.normalizePhone === 'function'
    ? helpers.normalizePhone.bind(helpers)
    : (x) => String(x || '').trim();
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: 'PHONE_REQUIRED' };

  const [rows] = await db.query(
    `SELECT id, is_active
     FROM cust_customers
     WHERE tenant_id=? AND phone=?
     LIMIT 1`,
    [tenantId, phone]
  );

  if (!rows.length) {
    const [ins] = await db.query(
      `INSERT INTO cust_customers
       (tenant_id, store_id, name, phone, is_active, registration_date, phone_verified_at, telegram_user_id)
       VALUES (?, 1, ?, ?, 1, CURDATE(), NOW(), ?)`,
      [tenantId, String(senderName || '\u041a\u043b\u0438\u0435\u043d\u0442').trim() || '\u041a\u043b\u0438\u0435\u043d\u0442', phone, String(tgUserId)]
    );
    try {
      await db.query(
        `INSERT INTO cust_customer_auth_identities
         (tenant_id, customer_id, provider, provider_user_id, phone, linked_at)
         VALUES (?, ?, 'tg', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           customer_id=VALUES(customer_id),
           phone=VALUES(phone),
           linked_at=NOW()`,
        [Number(tenantId), Number(ins.insertId), String(tgUserId), phone]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_TG_IDENTITY_FAILED:', err.message || err);
    }
    return { ok: true, customerId: Number(ins.insertId) };
  }

  if (Number(rows[0].is_active || 0) !== 1) return { ok: false, error: 'CUSTOMER_BLOCKED' };

  await db.query(
    `UPDATE cust_customers
     SET telegram_user_id=?, phone_verified_at=COALESCE(phone_verified_at, NOW()), updated_at=NOW()
     WHERE tenant_id=? AND id=?`,
    [String(tgUserId), Number(tenantId), Number(rows[0].id)]
  );
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_identities
       (tenant_id, customer_id, provider, provider_user_id, phone, linked_at)
       VALUES (?, ?, 'tg', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         customer_id=VALUES(customer_id),
         phone=VALUES(phone),
         linked_at=NOW()`,
      [Number(tenantId), Number(rows[0].id), String(tgUserId), phone]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_TG_IDENTITY_FAILED:', err.message || err);
  }
  return { ok: true, customerId: Number(rows[0].id) };
}

async function findKnownCustomerByTelegram(db, tenantId, tgUserId) {
  const [rows] = await db.query(
    `SELECT id
     FROM cust_customers
     WHERE tenant_id=? AND is_active=1 AND telegram_user_id=?
     LIMIT 1`,
    [Number(tenantId), String(tgUserId)]
  );
  return rows.length ? Number(rows[0].id) : null;
}

async function issueOneTimeTgLoginToken(db, tenantId, customerId) {
  const token = makeOneTimeToken();
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at)
       VALUES (?, ?, 'tg', 'login', ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [Number(tenantId), Number(customerId), token]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_TG_LOGIN_TOKEN_FAILED:', err.message || err);
  }
  return token;
}

async function issuePersistentTgLoginToken(db, tenantId, customerId, tgUserId) {
  const tId = Number(tenantId);
  const cId = Number(customerId);
  const providerUserId = String(tgUserId || '').trim();
  if (!tId || !cId || !providerUserId) return '';

  const [existing] = await db.query(
    `SELECT token
     FROM cust_customer_auth_tokens
     WHERE tenant_id=? AND customer_id=? AND provider='tg' AND purpose='login'
       AND provider_user_id=?
     ORDER BY id DESC
     LIMIT 1`,
    [tId, cId, providerUserId]
  );
  if (existing.length && existing[0]?.token) return String(existing[0].token);

  const token = makeOneTimeToken();
  try {
    await db.query(
      `INSERT INTO cust_customer_auth_tokens
       (tenant_id, customer_id, provider, purpose, token, expires_at, provider_user_id)
       VALUES (?, ?, 'tg', 'login', ?, DATE_ADD(NOW(), INTERVAL 100 YEAR), ?)`,
      [tId, cId, token, providerUserId]
    );
  } catch (err) {
    console.error('AUTH_DUAL_WRITE_TG_PERSISTENT_LOGIN_TOKEN_FAILED:', err.message || err);
  }
  return token;
}

async function getTenantLoginLinks(db, tenantId, loginToken, usePersistentToken, originBaseUrl = '') {
  const [rows] = await db.query(
    `SELECT subdomain, custom_domain, tg_mini_app_enabled
     FROM ten_tenants
     WHERE id=?
     LIMIT 1`,
    [Number(tenantId)]
  );
  const t = rows[0] || {};
  const requestedOrigin = normalizeOrigin(originBaseUrl);
  let siteBase = requestedOrigin;
  if (!siteBase) {
    const baseInfo = resolveRuntimeBaseInfo();
    const baseDomain = deriveBaseDomainFromHost(baseInfo.host);
    const host = t.custom_domain
      ? String(t.custom_domain).trim()
      : (t.subdomain ? `${String(t.subdomain).trim()}.${baseDomain}` : baseDomain);
    const protocol = (host.includes('localhost') || host.startsWith('127.0.0.1')) ? 'http' : baseInfo.protocol;
    siteBase = host ? `${protocol}://${host}` : '';
  }
  const tokenParamName = usePersistentToken ? 'ptoken' : 'token';
  const siteUrl = siteBase
    ? `${siteBase}/api/public/tg/finish-login?${tokenParamName}=${encodeURIComponent(loginToken)}&target=site`
    : '';
  const miniAppEnabled = Number(t.tg_mini_app_enabled ?? 1) === 1;
  const miniAppUrl = miniAppEnabled && siteBase
    ? `${siteBase}/api/public/tg/finish-login?${tokenParamName}=${encodeURIComponent(loginToken)}&target=miniapp`
    : '';

  return { siteUrl, miniAppUrl };
}

async function sendAuthLinksMessage(db, tenantBot, tgUserId, customerId, originBaseUrl = '') {
  const persistentToken = await issuePersistentTgLoginToken(db, tenantBot.tenantId, customerId, tgUserId);
  const links = await getTenantLoginLinks(db, tenantBot.tenantId, persistentToken, true, originBaseUrl);

  const inlineKeyboard = [];
  if (links.siteUrl && isAllowedPublicUrl(links.siteUrl)) {
    inlineKeyboard.push([{ text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u0430\u0439\u0442', url: links.siteUrl }]);
  }
  if (links.miniAppUrl && isAllowedPublicUrl(links.miniAppUrl)) {
    let useWebApp = false;
    try {
      const parsed = new URL(links.miniAppUrl);
      useWebApp = parsed.protocol === 'https:';
    } catch {
      useWebApp = false;
    }
    if (useWebApp) {
      inlineKeyboard.push([{ text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0438\u043d\u0438-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435', web_app: { url: links.miniAppUrl } }]);
    } else {
      // Telegram rejects web_app buttons for non-HTTPS URLs (e.g. local dev).
      inlineKeyboard.push([{ text: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0438\u043d\u0438-\u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435', url: links.miniAppUrl }]);
    }
  }

  const text = '\u041c\u044b \u0443\u0437\u043d\u0430\u043b\u0438 \u0432\u0430\u0448 \u0430\u043a\u043a\u0430\u0443\u043d\u0442. \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435, \u043a\u0443\u0434\u0430 \u043f\u0435\u0440\u0435\u0439\u0442\u0438:';
  if (inlineKeyboard.length) {
    await sendTelegramMessage(tenantBot.token, tgUserId, text, { reply_markup: { inline_keyboard: inlineKeyboard } });
    return;
  }
  await sendTelegramMessage(tenantBot.token, tgUserId, text);
}

async function pollTenantBot(db, helpers, state, tenantBot) {
  const marker = state.get(tenantBot.token) || 0;
  const url = `${TELEGRAM_API}${tenantBot.token}/getUpdates?offset=${Number(marker)}&timeout=1`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(`TG_UPDATES_FAILED:${res.status}:${data?.description || 'unknown'}`);
  }

  const updates = Array.isArray(data.result) ? data.result : [];
  for (const upd of updates) {
    const nextOffset = Number(upd?.update_id || 0) + 1;
    if (nextOffset > 0) state.set(tenantBot.token, nextOffset);

    const msg = upd?.message;
    if (!msg) continue;
    const text = String(msg.text || '').trim();
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    const fromName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ').trim();
    const payload = normalizePayloadFromStartText(text);
    const contactPhone = String(msg?.contact?.phone_number || msg?.contact?.phone || '').trim();

    if (!chatId || !fromId) continue;

    if (contactPhone) {
      const result = await bindByPhone(db, helpers, tenantBot.tenantId, fromId, contactPhone, fromName);
      const pendingOrigin = await readPendingOrigin(db, tenantBot.tenantId, fromId);
      if (result.ok) {
        await sendAuthLinksMessage(db, tenantBot, chatId, result.customerId, pendingOrigin);
      } else {
        await sendTelegramMessage(tenantBot.token, chatId, '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0443. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.');
      }
      continue;
    }

    if (payload) {
      if (isLoginPayload(payload)) {
        const pendingOrigin = await readPendingOrigin(db, tenantBot.tenantId, fromId);
        const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
        if (knownId) {
          await sendAuthLinksMessage(db, tenantBot, chatId, knownId, pendingOrigin);
        } else {
          await sendContactRequest(tenantBot.token, chatId);
        }
        continue;
      }

      const loginOrigin = await readLoginOriginToken(db, tenantBot.tenantId, payload);
      if (loginOrigin) {
        await rememberPendingOrigin(db, tenantBot.tenantId, fromId, loginOrigin);
        const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
        if (knownId) {
          await sendAuthLinksMessage(db, tenantBot, chatId, knownId, loginOrigin);
        } else {
          await sendContactRequest(tenantBot.token, chatId);
        }
        continue;
      }

      const result = await bindByLinkToken(db, tenantBot.tenantId, fromId, payload);
      if (result.ok) {
        await sendAuthLinksMessage(db, tenantBot, chatId, result.customerId);
      } else {
        await sendTelegramMessage(tenantBot.token, chatId, '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430 \u0438\u043b\u0438 \u0438\u0441\u0442\u0435\u043a\u043b\u0430.');
      }
      continue;
    }

    if (isPlainStart(text)) {
      const pendingOrigin = await readPendingOrigin(db, tenantBot.tenantId, fromId);
      const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
      if (knownId) {
        await sendAuthLinksMessage(db, tenantBot, chatId, knownId, pendingOrigin);
      } else {
        await sendContactRequest(tenantBot.token, chatId);
      }
    }
  }
}

function startTenantTelegramAuthPolling(db, helpers) {
  const offsetsByToken = new Map();
  let busy = false;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    if (busy) {
      timer = setTimeout(tick, 1000);
      return;
    }
    busy = true;
    try {
      const bots = await fetchTenantBots(db);
      for (const bot of bots) {
        try {
          await pollTenantBot(db, helpers, offsetsByToken, bot);
        } catch (err) {
          console.error(`TG auth polling error (tenant ${bot.tenantId}):`, err.message || err);
        }
      }
    } catch (err) {
      console.error('TG auth polling loop error:', err.message || err);
    } finally {
      busy = false;
    }
    if (!stopped) {
      timer = setTimeout(tick, 800);
    }
  }

  console.log('TG auth polling started (tenant tokens from DB)');
  tick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

module.exports = { startTenantTelegramAuthPolling };
