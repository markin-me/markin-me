const crypto = require('crypto');
const { connectStoreChat } = require('./telegramBot');
const { requestTelegramApi } = require('./telegramApi');
const { keepCurrentOperationPending, markCurrentOperation, recordCurrentServiceMessage } = require('./messengerCleanup');

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

async function sendTelegramMessage(token, chatId, text, extra = null, onTelegramApiTiming = null) {
  const body = { chat_id: chatId, text: String(text || '') };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  const data = await requestTelegramApi(`${TELEGRAM_API}${token}`, 'sendMessage', body, { onTiming: onTelegramApiTiming });
  await recordCurrentServiceMessage({
    provider: 'tg', chatId: data.result?.chat?.id || chatId, messageId: data.result?.message_id,
  });
  return data.result;
}

async function sendContactRequest(token, chatId, onTelegramApiTiming = null) {
  keepCurrentOperationPending();
  await sendTelegramMessage(token, chatId,
    'Начните вход кнопкой «Войти через Telegram» в исходной вкладке. Передайте свой контакт системной кнопкой Telegram. Обычный Start сам по себе не предоставляет доступ.',
    { reply_markup: {
      keyboard: [[{ text: 'Отправить номер телефона', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    } }, onTelegramApiTiming);
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
    console.error('AUTH_DUAL_WRITE_TG_LINK_FAILED:', err.code || err.name);
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
    console.error('AUTH_DUAL_WRITE_TG_PENDING_ORIGIN_FAILED:', err.code || err.name);
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
  await db.query(
    `INSERT INTO cust_customer_auth_tokens
     (tenant_id, customer_id, provider, purpose, token, expires_at)
     VALUES (?, ?, 'tg', 'login', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [Number(tenantId), Number(customerId), token]
  );
  return token;
}


async function getTenantLoginLinks(db, tenantId, loginToken, originBaseUrl = '') {
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
  const tokenParamName = 'token';
  const siteUrl = siteBase
    ? `${siteBase}/api/public/tg/finish-login?${tokenParamName}=${encodeURIComponent(loginToken)}&target=site`
    : '';
  const miniAppEnabled = Number(t.tg_mini_app_enabled ?? 1) === 1;
  const miniAppUrl = miniAppEnabled && siteBase
    ? `${siteBase}/api/public/tg/finish-login?${tokenParamName}=${encodeURIComponent(loginToken)}&target=miniapp`
    : '';

  return { siteUrl, miniAppUrl };
}

async function sendAuthLinksMessage(db, tenantBot, tgUserId, customerId, originBaseUrl = '', onTelegramApiTiming = null) {
  const loginToken = await issueOneTimeTgLoginToken(db, tenantBot.tenantId, customerId);
  const links = await getTenantLoginLinks(db, tenantBot.tenantId, loginToken, originBaseUrl);

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

  const text = 'Ваша учетная запись уже привязана.';
  if (inlineKeyboard.length) {
    await sendTelegramMessage(tenantBot.token, tgUserId, text, { reply_markup: { inline_keyboard: inlineKeyboard } }, onTelegramApiTiming);
    return;
  }
  await sendTelegramMessage(tenantBot.token, tgUserId, text, null, onTelegramApiTiming);
}

async function handleTenantTelegramUpdate(db, helpers, tenantBot, upd, options = {}) {
  const send = (chatId, text, extra = null) => sendTelegramMessage(
    tenantBot.token, chatId, text, extra, options.onTelegramApiTiming
  );
  const callback=upd?.callback_query;
  if(callback && /^auth:(?:b_[A-Za-z0-9_-]{40}|r_[A-Za-z0-9_-]{43})$/.test(String(callback.data)) && options.onBrowserAuth){
    if(callback.message?.chat?.type!=='private' || String(callback.message.chat.id)!==String(callback.from?.id) || callback.from?.is_bot)return;
    const result=await options.onBrowserAuth({providerUserId:String(callback.from.id),token:callback.data.slice(5),confirm:true});
    await requestTelegramApi(`${TELEGRAM_API}${tenantBot.token}`, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: result.ok ? 'Вход подтверждён' : 'Запрос истёк или доступ не разрешён',
    }, { onTiming: options.onTelegramApiTiming });
    await send(callback.from.id,result.ok
      ? result.purpose==='password_reset'?'✅ Подтверждение смены пароля принято. Вернитесь в исходную вкладку CRM.':'Подтверждение принято. Вернитесь в исходную вкладку — CRM завершит вход там.'
      :result.error==='EMPLOYEE_MESSENGER_NOT_LINKED'?'Привязка не подтверждена. Начните вход заново в исходной карточке.'
      :result.error==='CUSTOMER_OWNERSHIP_PROOF_REQUIRED'?'По этому номеру уже есть карточка. Контакт не даёт доступа к её данным. Нужно подтверждение через ранее привязанный мессенджер или помощь администратора; дата рождения для новой привязки не подходит.'
      :'Вход не подтверждён. Запрос истёк, привязка конфликтует или требуется обновление CRM. Вернитесь в исходную карточку входа.');
    return;
  }
  const msg = upd?.message;
  if (!msg) return;
  const text = String(msg.text || '').trim();
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id;
  const payload = normalizePayloadFromStartText(text);
  const contactPhone = String(msg?.contact?.phone_number || msg?.contact?.phone || '').trim();

  if (!chatId || !fromId) return;
  // Store connection tokens are tenant-scoped and may be used in group chats.
  if (payload && !/^[alb]_/.test(payload) && await connectStoreChat(
    db, `${TELEGRAM_API}${tenantBot.token}`, chatId, payload, tenantBot.tenantId, options.onTelegramApiTiming
  )) return;
  if (msg.chat?.type !== 'private' || String(chatId) !== String(fromId)) return;
  if (options.loginEnabled === false) {
    if (payload || isPlainStart(text)) {
      await markCurrentOperation('error');
      const origin = await inferTenantOrigin(db, tenantBot.tenantId);
      const link = origin && options.miniAppEnabled !== false ? `${origin}/tg-app?tenant_id=${tenantBot.tenantId}` : '';
      await send(chatId, 'Вход через бота отключён в настройках магазина.',
        link && isAllowedPublicUrl(link) ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть мини-приложение', web_app: { url: link } }]] } } : null);
    }
    return;
  }

  if(payload.startsWith('b_') && options.onBrowserAuth){
    const result=await options.onBrowserAuth({providerUserId:String(fromId),token:payload,confirm:false});
    if(result.ok&&result.contactRequired){
      await send(chatId,'Чтобы авторизоваться в системе, нажмите «Авторизоваться».',
        {reply_markup:{keyboard:[[{text:'Авторизоваться',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
      return;
    }
    await send(chatId,result.ok?'Подтвердите вход в исходном браузере. Если вы не начинали вход, не нажимайте кнопку.':'Запрос истёк. Начните вход заново в магазине.',
      result.ok&&!result.confirmed?{reply_markup:{inline_keyboard:[[{text:result.purpose==='password_reset'?'✅ Подтвердить смену пароля':'✅ Авторизоваться',callback_data:`auth:${payload}`}]]}}:{reply_markup:{remove_keyboard:true}});
    return;
  }

  if (payload.startsWith('l_') && typeof options.onAuthLogin === 'function') {
    const result = await options.onAuthLogin({ providerUserId: String(fromId), token: payload });
    if (!result.ok || result.alreadySent) await send(chatId,
      result.alreadySent ? 'Код уже отправлен. Он действует 3 минуты. Для нового кода вернитесь на карточку входа.'
        : result.error === 'CODE_DELIVERY_FAILED' ? 'Не удалось доставить код. Создайте новый запрос на карточке входа.'
        : 'Запрос входа истёк или привязка не подтверждена. Вернитесь на карточку входа. Сотруднику нужно сначала войти с паролем и привязать мессенджер в профиле.');
    return;
  }
  if (payload.startsWith('a_') && typeof options.onAuthLink === 'function') {
    const result = await options.onAuthLink({ provider: 'tg', providerUserId: String(fromId), token: payload });
    if (result?.contactRequired) {
      await send(chatId, 'Чтобы привязать мессенджер к учётной записи, нажмите кнопку «Привязать».', {
        reply_markup: { keyboard: [[{ text: 'Привязать', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      });
      return;
    }
    await send(chatId, result?.ok
      ? result.context==='PROFILE_LINK'
        ? 'Telegram успешно привязан к вашему профилю! Теперь вы можете получать коды для входа в магазин через этот бот'
        : 'Telegram успешно привязан. Вернитесь в CRM. Теперь вы можете получать коды для входа через этот бот.'
      : 'Ссылка недействительна, истекла или привязка конфликтует. Получите новую в профиле.',
      { reply_markup: { remove_keyboard: true } });
    return;
  }

  if (contactPhone) {
    if(options.onBrowserContact){
      if(msg.from?.is_bot || msg.forward_origin || msg.forward_date || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name
        || String(msg.contact?.user_id)!==String(fromId)){
        await markCurrentOperation('error');
        await send(chatId,'Отправьте только собственный контакт системной кнопкой Telegram. Пересланные контакты не принимаются.');return;
      }
      const browser=await options.onBrowserContact({providerUserId:String(fromId),phone:contactPhone,name:[msg.from.first_name,msg.from.last_name].filter(Boolean).join(' ')});
      if(browser.context==='PROFILE_LINK'){
        await send(chatId,browser.ok
          ?browser.guestConfirmed?'Номер телефона подтверждён! Telegram подключён к вашему профилю. Теперь вам доступны бонусы и вход по коду.':'Telegram успешно привязан к вашему профилю! Теперь вы можете получать коды для входа в магазин через этот бот'
          :browser.error==='CONTACT_PHONE_MISMATCH'?'Не удалось привязать мессенджер, так как номер телефона не совпадает с учётной записью':'Не удалось привязать Telegram. Начните привязку заново в профиле.',{reply_markup:{remove_keyboard:true}});
        return;
      }
      if(browser.autoConfirmed){
        await send(chatId,'Номер телефона подтверждён. Вход будет завершён автоматически',{reply_markup:{remove_keyboard:true}});
        await send(chatId,'При последующих авторизациях вы будете получать код в этом боте');
        return;
      }
      if(browser.ok){
        await send(chatId,'Контакт подтверждён. Нажмите «Авторизоваться».',
          {reply_markup:{remove_keyboard:true}});
        await send(chatId,'Подтвердите именно начатый вами вход.',{reply_markup:{inline_keyboard:[[{text:'Авторизоваться',callback_data:`auth:${browser.reference}`}]]}});return;
      }
      if(browser.matched!==false){
        if(browser.error==='CUSTOMER_RELINK_PROOF_REQUIRED'){
          await send(chatId,'Для повторного подключения используйте тот Telegram-аккаунт, который был привязан раньше. Если он недоступен, восстановите доступ через магазин.');return;
        }
        console.warn('TELEGRAM_BROWSER_CONTACT_REJECTED',{tenantId:tenantBot.tenantId,reason:browser.error||'BROWSER_CONTACT_REJECTED'});
        const reason={CONTACT_PHONE_MISMATCH:'Номер собственного контакта отличается от введённого в магазине. Отмените вход и начните заново со своим номером.',ACCOUNT_PERSON_CONFLICT:'Обнаружена другая подтверждённая привязка. Доступ не выдан; требуется безопасное разрешение конфликта администратором.',CUSTOMER_PHONE_CONFLICT:'Номер и мессенджер относятся к разным карточкам. Автоматическое объединение запрещено; обратитесь к администратору.',REQUEST_EXPIRED:'Запрос истёк. Отмените вход в исходной вкладке, начните заново и передайте контакт в течение трёх минут.'}[browser.error];
        if(reason){await send(chatId,reason);return;}
        await send(chatId,browser.error==='CONTACT_REQUEST_AMBIGUOUS'?'Одновременно открыто несколько запросов входа. Отмените лишние запросы в исходных вкладках, затем отправьте свой контакт снова.':'Контакт не принят для входа. Создайте новый запрос в исходной карточке.');return;
      }
    }
    const result = typeof options.onAuthContact === 'function'
      ? await options.onAuthContact({ providerUserId: String(fromId), message: msg }) : { ok: false };
    await send(chatId, result?.ok
      ? result.phoneConflict
        ? 'Telegram привязан, но номер конфликтует с клиентскими данными. Обратитесь к администратору; вход по этому номеру пока недоступен.'
        : 'Номер подтверждён, Telegram привязан. Начните вход в исходной карточке и подтвердите новый запрос в боте.'
      : result?.error==='CONTACT_PHONE_MISMATCH'
        ? 'Не удалось привязать мессенджер, так как номер телефона не совпадает с учётной записью'
        : 'Контакт не подтверждён, запрос истёк или обнаружен конфликт. Отправьте только свой контакт по кнопке либо создайте новую ссылку в профиле.',
      result?.ok ? { reply_markup: { remove_keyboard: true } } : null);
    return;
  }

  if (payload) {
    if (isLoginPayload(payload)) {
      const pendingOrigin = await readPendingOrigin(db, tenantBot.tenantId, fromId);
      const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
      if (knownId) {
        await sendAuthLinksMessage(db, tenantBot, chatId, knownId, pendingOrigin, options.onTelegramApiTiming);
      } else {
        await sendContactRequest(tenantBot.token, chatId, options.onTelegramApiTiming);
      }
      return;
    }

    const loginOrigin = await readLoginOriginToken(db, tenantBot.tenantId, payload);
    if (loginOrigin) {
      await rememberPendingOrigin(db, tenantBot.tenantId, fromId, loginOrigin);
      const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
      if (knownId) {
        await sendAuthLinksMessage(db, tenantBot, chatId, knownId, loginOrigin, options.onTelegramApiTiming);
      } else {
        await sendContactRequest(tenantBot.token, chatId, options.onTelegramApiTiming);
      }
      return;
    }

    const result = await bindByLinkToken(db, tenantBot.tenantId, fromId, payload);
    if (result.ok) {
      await sendAuthLinksMessage(db, tenantBot, chatId, result.customerId, '', options.onTelegramApiTiming);
    } else {
      await markCurrentOperation('error');
      await send(chatId, '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430 \u0438\u043b\u0438 \u0438\u0441\u0442\u0435\u043a\u043b\u0430.');
    }
    return;
  }

  if (isPlainStart(text)) {
    const pendingOrigin = await readPendingOrigin(db, tenantBot.tenantId, fromId);
    const knownId = await findKnownCustomerByTelegram(db, tenantBot.tenantId, fromId);
    if (knownId) {
      await sendAuthLinksMessage(db, tenantBot, chatId, knownId, pendingOrigin, options.onTelegramApiTiming);
    } else {
      await sendContactRequest(tenantBot.token, chatId, options.onTelegramApiTiming);
    }
  }
}

module.exports = { handleTenantTelegramUpdate };
