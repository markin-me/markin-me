const { confirmMaxLink, sendMaxMessage, getTenantMaxBotId } = require('./maxIntegration');
const crypto = require('crypto');
const authReadsNew = String(process.env.AUTH_READS_NEW || '1').trim() === '1';

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

async function fetchTenantsWithMaxToken(db) {
  const [rows] = await db.query(
    `SELECT id, max_bot_token
     FROM ten_tenants
     WHERE is_active=1 AND max_bot_token IS NOT NULL AND max_bot_token <> ''`
  );
  return (rows || [])
    .map((r) => ({
      tenantId: Number(r.id),
      token: String(r.max_bot_token || '').trim(),
    }))
    .filter((r) => Number.isFinite(r.tenantId) && r.tenantId > 0 && r.token);
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

async function getTenantReturnLinks(db, tenantId) {
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

  const overrideSiteUrl = String(process.env.MAX_RETURN_SITE_URL || '').trim();
  if (overrideSiteUrl) {
    const normalized = overrideSiteUrl.replace(/\/+$/, '');
    const botIdOverride = maxMiniAppEnabled ? await getTenantMaxBotId(db, tId) : null;
    const miniAppUrlOverride = botIdOverride
      ? `https://max.ru/${encodeURIComponent(botIdOverride)}?startapp=shop`
      : null;
    return { siteUrl: normalized, miniAppUrl: miniAppUrlOverride };
  }

  const baseDomain = String(process.env.TENANT_BASE_DOMAIN || 'markin-me.ru').trim();
  const host = row.custom_domain
    ? String(row.custom_domain).trim()
    : (row.subdomain ? `${String(row.subdomain).trim()}.${baseDomain}` : baseDomain);
  const siteUrl = host ? `https://${host}/shop` : null;

  const botId = maxMiniAppEnabled ? await getTenantMaxBotId(db, tId) : null;
  const miniAppUrl = botId ? `https://max.ru/${encodeURIComponent(botId)}?startapp=shop` : null;
  return { siteUrl, miniAppUrl };
}

function makeOneTimeLoginToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '') + crypto.randomBytes(8).toString('hex');
  return crypto.randomBytes(24).toString('hex');
}

function isHttpsUrl(url) {
  const u = String(url || '').trim().toLowerCase();
  return u.startsWith('https://');
}

function buildFinishLoginUrl(siteUrl, loginToken, target) {
  const raw = String(siteUrl || '').trim();
  if (!raw || !loginToken) return null;
  try {
    const u = new URL(raw);
    u.pathname = '/api/public/max/finish-login';
    u.search = '';
    u.searchParams.set('token', String(loginToken));
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

async function buildLoginMessage(db, tenantId, customerId, okText) {
  let text = String(okText || 'MAX успешно подключен к вашему аккаунту.');
  let extraPayload = null;
  const links = await getTenantReturnLinks(db, tenantId);
  const loginToken = await issueOneTimeLoginToken(db, tenantId, Number(customerId));
  const finishSiteUrl = buildFinishLoginUrl(links.siteUrl, loginToken, 'site');
  const finishMiniAppUrl = links.miniAppUrl || null;
  const buttons = [];
  if (finishSiteUrl && isHttpsUrl(finishSiteUrl)) {
    buttons.push([{ type: 'link', text: 'Открыть сайт', url: finishSiteUrl }]);
  } else if (finishSiteUrl) {
    text += `\nСайт: ${finishSiteUrl}`;
  }
  if (finishMiniAppUrl && isHttpsUrl(finishMiniAppUrl)) {
    buttons.push([{ type: 'link', text: 'Открыть мини-приложение', url: finishMiniAppUrl }]);
  } else if (finishMiniAppUrl) {
    text += `\nМини-приложение: ${finishMiniAppUrl}`;
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
      [tId, normalizedName || 'Клиент', normalizedPhone, uId]
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

  const markersByTenant = new Map();
  let pollBusy = false;

  async function pollTenant({ tenantId, token }) {
    let marker = markersByTenant.get(tenantId) || null;
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
        const parsed = parseUpdate(u);

        const startToken = parsed.payload || extractStartAppToken(parsed.text);
        if (startToken && parsed.userId) {
          if (!isGenericLinkPayload(startToken)) {
            await rememberPendingToken(db, tenantId, parsed.userId, startToken);
          }
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
              'Мы узнали ваш аккаунт. Выберите, куда перейти:'
            );
            await sendMaxMessage({
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
            await sendMaxMessage({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: 'Нажмите кнопку и отправьте номер телефона для завершения привязки.',
              extraPayload: contactButtonAttachment,
            });
          } catch {
            await sendMaxMessage({
              db,
              tenantId,
              botToken: token,
              maxUserId: parsed.userId,
              text: 'Отправьте номер телефона сообщением для завершения привязки.',
            });
          }
          continue;
        }

        if (isPlainStartCommand(parsed.text) && parsed.userId) {
          await sendMaxMessage({
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
            // По link token можем завершить привязку даже если MAX не отдал номер в явном виде.
            result = await confirmMaxLink({
              db,
              helpers,
              token: pendingToken,
              maxUserId: parsed.userId,
              phone: parsed.phone,
            });
            // Для сценария "Войти через MAX" payload может быть служебным (например "link"),
            // тогда confirmMaxLink вернет TOKEN_INVALID_OR_EXPIRED. В таком случае пробуем
            // fallback-привязку по номеру, если номер пришел.
            if (!result?.ok && parsed.phone && String(result?.error || '') === 'TOKEN_INVALID_OR_EXPIRED') {
              result = await bindByPhoneDirect(db, helpers, tenantId, parsed.userId, parsed.phone, parsed.senderName);
            }
          } else if (parsed.phone) {
            result = await bindByPhoneDirect(db, helpers, tenantId, parsed.userId, parsed.phone, parsed.senderName);
          } else {
            result = { ok: false, error: 'PHONE_NOT_PROVIDED' };
          }

          let text = result.ok
            ? 'MAX успешно подключен к вашему аккаунту.'
            : (result.error === 'PHONE_NOT_PROVIDED'
              ? 'Не удалось получить номер. Нажмите "Привязать MAX" на сайте и повторите.'
              : 'Не удалось завершить привязку. Сгенерируйте новую ссылку на сайте.');

          if (!result.ok && String(result.error || '') === 'PHONE_NOT_PROVIDED') {
            try {
              const dump = JSON.stringify(parsed.raw || {}).slice(0, 2000);
              console.warn(`MAX contact without phone (tenant ${tenantId}, user ${parsed.userId}): ${dump}`);
            } catch {}
          }

          let extraPayload = null;
          if (result.ok) {
            const links = await getTenantReturnLinks(db, tenantId);
            const loginToken = await issueOneTimeLoginToken(db, tenantId, Number(result.customerId));
            const finishSiteUrl = buildFinishLoginUrl(links.siteUrl, loginToken, 'site');
            const finishMiniAppUrl = links.miniAppUrl || null;
            const buttons = [];
            if (finishSiteUrl && isHttpsUrl(finishSiteUrl)) {
              buttons.push([{ type: 'link', text: 'Открыть сайт', url: finishSiteUrl }]);
            } else if (finishSiteUrl) {
              text += `\nСайт: ${finishSiteUrl}`;
            }
            if (finishMiniAppUrl && isHttpsUrl(finishMiniAppUrl)) {
              buttons.push([{ type: 'link', text: 'Открыть мини-приложение', url: finishMiniAppUrl }]);
            } else if (finishMiniAppUrl) {
              text += `\nМини-приложение: ${finishMiniAppUrl}`;
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
          }

          await sendMaxMessage({
            db,
            tenantId,
            botToken: token,
            maxUserId: parsed.userId,
            text,
            extraPayload: extraPayload || undefined,
          });
        }
      }

      if (marker) markersByTenant.set(tenantId, marker);
    } catch (err) {
      console.error(`MAX polling error (tenant ${tenantId}):`, err.message || err);
    }
  }

  async function poll() {
    if (pollBusy) {
      setTimeout(poll, 1000);
      return;
    }
    pollBusy = true;
    try {
      const tenants = await fetchTenantsWithMaxToken(db);
      for (const tenant of tenants) {
        await pollTenant(tenant);
      }
      await cleanupPending(db);
    } catch (err) {
      console.error('MAX polling loop error:', err.message || err);
    } finally {
      pollBusy = false;
    }

    setTimeout(poll, 500);
  }

  console.log('MAX bot polling started (tenant tokens from DB)');
  poll();
}

module.exports = { startMaxPolling };
