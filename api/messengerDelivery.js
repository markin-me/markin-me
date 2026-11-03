const crypto = require('crypto');
const { getEffectiveTelegramBotConfig, getEffectiveMaxBotConfig } = require('../data/system-settings');
const { buildMaxDeepLink, sendMaxMessage } = require('./maxIntegration');
const { MessengerAuthError } = require('./messengerAuth');
const { recordServiceMessage } = require('./messengerCleanup');

const TELEGRAM_API = 'https://api.telegram.org/bot';
const DELIVERY_TIMEOUT_MS = 10000;

async function loadMessengerProfilePhoto(config, providerUserId, avatarUrl) {
  try {
    if(config.provider==='max'){
      if(!avatarUrl||String(avatarUrl).length>255)return null;
      const url=new URL(avatarUrl);
      if(url.protocol!=='https:'||url.username||url.password||!/(^|\.)(max\.ru|max-cdn\.ru)$/.test(url.hostname))return null;
      return url.href;
    }
    const signal=AbortSignal.timeout(DELIVERY_TIMEOUT_MS);
    const request=async(method,body)=>{
      const r=await fetch(`${TELEGRAM_API}${config.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      const data=await r.json();if(!r.ok||!data.ok)throw new Error('PROFILE_PHOTO_API_FAILED');return data.result;
    };
    const photos=await request('getUserProfilePhotos',{user_id:providerUserId,limit:1});
    const sizes=photos.photos?.[0];if(!sizes?.length)return null;
    const file=await request('getFile',{file_id:sizes[sizes.length-1].file_id});
    if(!/^[A-Za-z0-9_./-]+$/.test(file.file_path||'')||file.file_path.includes('..'))throw new Error('PROFILE_PHOTO_PATH_INVALID');
    const r=await fetch(`https://api.telegram.org/file/bot${config.token}/${file.file_path}`,{signal,redirect:'error'});
    if(!r.ok)throw new Error('PROFILE_PHOTO_DOWNLOAD_FAILED');
    const chunks=[];let size=0;
    for await(const chunk of r.body){size+=chunk.length;if(size>2*1024*1024)throw new Error('PROFILE_PHOTO_TOO_LARGE');chunks.push(chunk);}
    const image=await require('sharp')(Buffer.concat(chunks),{limitInputPixels:16*1024*1024}).rotate().resize(512,512,{fit:'cover',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    const path=require('path'),fs=require('fs').promises;
    const relative=`uploads/tenants/${config.tenantId}/customers/${crypto.randomBytes(16).toString('hex')}.webp`;
    const target=path.resolve(__dirname,'../static',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,image,{flag:'wx'});
    return `/static/${relative}`;
  }catch(error){console.warn('MESSENGER_PROFILE_PHOTO_UNAVAILABLE',{tenantId:config.tenantId,provider:config.provider,reason:error.name==='TimeoutError'?'TIMEOUT':'PHOTO_FETCH_FAILED'});return null;}
}

function telegramBotKey(token) {
  // Telegram token prefix is the bot ID: rotation does not transfer consent to another bot.
  const identity = /^\d+:/.test(token) ? token.split(':', 1)[0] : token;
  return crypto.createHash('sha256').update(`telegram:${identity}`).digest();
}

async function recordTenantTelegramContact(db, config, update) {
  const message = update?.message;
  const membership = update?.my_chat_member;
  const chat = message?.chat || membership?.chat;
  if (chat?.type !== 'private') return;
  const userId = String(message?.from?.id || membership?.chat?.id || '');
  if (!userId || String(chat.id) !== userId || message?.from?.is_bot) return;
  const reachable = membership
    ? ['member', 'administrator', 'creator'].includes(membership.new_chat_member?.status)
    : true;
  await db.query(
    `INSERT INTO auth_telegram_bot_contacts (tenant_id, bot_key, provider_user_id, reachable, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE reachable=VALUES(reachable), updated_at=NOW()`,
    [config.tenantId, telegramBotKey(config.token), userId, reachable ? 1 : 0]
  );
}

async function assertTenantTelegramContact(db, config, providerUserId) {
  const [rows] = await db.query(
    `SELECT reachable FROM auth_telegram_bot_contacts
     WHERE tenant_id=? AND bot_key=? AND provider_user_id=? LIMIT 1`,
    [config.tenantId, telegramBotKey(config.token), String(providerUserId)]
  );
  if (Number(rows[0]?.reachable) !== 1) throw new MessengerAuthError('TELEGRAM_BOT_START_REQUIRED', 409);
}

async function getTenantBotConfig(db, tenantId, provider, options = {}) {
  if (!['max', 'tg'].includes(provider) || !Number.isSafeInteger(Number(tenantId)) || Number(tenantId) <= 0) {
    throw new MessengerAuthError('INVALID_BOT_SCOPE', 400);
  }
  const [rows] = await db.query(
    `SELECT id, is_active, name, site_name, telegram_bot_username, telegram_bot_token, tg_login_enabled,
            tg_mini_app_enabled, max_bot_id, max_bot_token, max_login_enabled, max_mini_app_enabled
     FROM ten_tenants WHERE id=? LIMIT 1`, [Number(tenantId)]
  );
  const row = rows[0];
  const token = String((provider === 'max' ? row?.max_bot_token : row?.telegram_bot_token) || '').trim();
  const identifier = String((provider === 'max' ? row?.max_bot_id : row?.telegram_bot_username) || '').trim().replace(/^@/, '');
  const enabled = options.customer
    ? Boolean((await require('./helpers/customerAuth').settings(db,tenantId))[provider])
    : Number(provider === 'max' ? row?.max_login_enabled : row?.tg_login_enabled) === 1;
  const miniAppEnabled = Number(provider === 'max' ? row?.max_mini_app_enabled : row?.tg_mini_app_enabled) === 1;
  if (!row || Number(row.is_active) !== 1 || !token || !identifier || (!options.allowDisabled && !enabled)) {
    throw new MessengerAuthError('TENANT_BOT_UNAVAILABLE', 409);
  }
  // Shared bots are routed by a server-side one-time request, not by a browser tenant ID.
  return { tenantId: Number(tenantId), provider, token, identifier, enabled, miniAppEnabled, brand: String(row.site_name || row.name || '').trim() };
}

async function getTenantChannelAvailability(db, tenantId) {
  const channels = {};
  for (const provider of ['max', 'tg']) {
    try {
      await getTenantBotConfig(db, tenantId, provider);
      channels[provider] = { available: true };
    } catch (error) {
      if (!['TENANT_BOT_UNAVAILABLE', 'BOT_TENANT_CONFLICT'].includes(error.code)) throw error;
      channels[provider] = { available: false, reason: error.code };
    }
  }
  return channels;
}

function getTenantWebhookSecret(config) {
  if (!['tg', 'max'].includes(config.provider) || !Number.isSafeInteger(Number(config.tenantId)) || Number(config.tenantId) <= 0) {
    throw new MessengerAuthError('INVALID_BOT_SCOPE', 400);
  }
  const key = String(process.env.AUTH_WEBHOOK_SECRET || process.env.AUTH_CODE_PEPPER || process.env.JWT_SECRET || '').trim();
  if (key.length < 32 || key === 'your-secret-key-change-in-production') {
    throw new MessengerAuthError('AUTH_WEBHOOK_SECRET_REQUIRED', 503);
  }
  return crypto.createHmac('sha256', key)
    // Route scope is available before DB access. Bot identifiers must not be needed to authenticate a request.
    .update(config.provider === 'tg'
      ? `markin-me:tenant:${Number(config.tenantId)}:tg`
      : `markin-me:tenant:${Number(config.tenantId)}:max:${config.identifier.toLowerCase()}`, 'utf8').digest('base64url');
}

function verifyTenantWebhookSecret(config, received) {
  return timingSafeTextEqual(getTenantWebhookSecret(config), received);
}

function getConfig(provider) {
  return provider === 'max' ? getEffectiveMaxBotConfig() : getEffectiveTelegramBotConfig();
}

function getBotToken(provider) {
  const config = getConfig(provider);
  return String((provider === 'max' ? config.max_bot_token : config.telegram_bot_token) || '').trim();
}

function getWebhookSecret(provider, botToken = getBotToken(provider)) {
  const envName = provider === 'max' ? 'MAX_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET';
  const configured = String(process.env[envName] || '').trim();
  if (configured) return configured;
  const token = String(botToken || '').trim();
  if (!token) return '';
  return crypto.createHash('sha256').update(`markin-me:${provider}:${token}`, 'utf8').digest('base64url');
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhookSecret(provider, receivedValue) {
  const expected = getWebhookSecret(provider);
  return Boolean(expected) && timingSafeTextEqual(expected, receivedValue);
}

async function buildProviderLink(db, tenantId, provider, token, options={}) {
  const config = await getTenantBotConfig(db, tenantId, provider,options);
  if (provider === 'max') {
    return buildMaxDeepLink(token, config.identifier);
  }
  return `https://t.me/${encodeURIComponent(config.identifier)}?start=${encodeURIComponent(token)}`;
}

async function assertBrowserProviderReady(config) {
  if(config.provider!=='max')return;
  const base=String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').replace(/\/$/,'');
  let url;
  try { url=new URL(base); } catch { throw new MessengerAuthError('MAX_HTTPS_REQUIRED',503); }
  if(url.protocol!=='https:' || url.username || url.password)throw new MessengerAuthError('MAX_HTTPS_REQUIRED',503);
  // Subscription discovery is an operational diagnostic, not an identity check.
  // Only an authenticated tenant webhook can confirm the browser-bound request.
  getTenantWebhookSecret(config);
}

function codeMessage(purpose, code, expiresInMinutes) {
  const labels = {
    login: 'Код входа',
    password_reset: 'Код восстановления доступа',
    phone_verify: 'Код подтверждения',
  };
  const label = labels[purpose] || 'Код подтверждения';
  return `${label}: ${code}. Он действует ${expiresInMinutes} мин. Никому не сообщайте этот код.`;
}

async function sendTelegramText(token, providerUserId, text, signal, extra = {}) {
  const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...extra, chat_id: providerUserId, text }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    const error = new Error('TELEGRAM_DELIVERY_FAILED');
    error.code = ({ 401: 'TELEGRAM_TOKEN_REJECTED', 403: 'TELEGRAM_BOT_BLOCKED',
      400: 'TELEGRAM_CHAT_UNAVAILABLE', 429: 'TELEGRAM_RATE_LIMITED' })[response.status] || 'TELEGRAM_DELIVERY_FAILED';
    error.httpStatus = response.status;
    error.retryAfter = Number(data?.parameters?.retry_after) || 0;
    throw error;
  }
  return data.result;
}

async function deliverCode(db, { tenantId, provider, providerUserId, code, purpose, expiresInMinutes, operationId }, options={}) {
  const config = await getTenantBotConfig(db, tenantId, provider,options);
  const { token } = config;
  if (provider === 'tg') await assertTenantTelegramContact(db, config, providerUserId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const text = options.customer && purpose === 'login'
      ? `${config.brand}: ${code} - Ваш код подтверждения.`
      : codeMessage(purpose, code, expiresInMinutes);
    if (provider === 'max') {
      const result = await sendMaxMessage({ botToken: token, maxUserId: providerUserId, text, signal: controller.signal, requireMessageConfirmation: true });
      if (result?.ok !== true) {
        const error = new Error('MAX_DELIVERY_FAILED');
        error.code = result?.skipped ? 'MAX_DELIVERY_NOT_CONFIGURED' : 'MAX_DELIVERY_FAILED';
        throw error;
      }
      await recordServiceMessage(db, {
        operationId,
        provider: 'max',
        chatId: result.data?.message?.recipient?.chat_id || result.data?.message?.recipient?.user_id || providerUserId,
        messageId: result.data?.message?.body?.mid,
      });
      return;
    }
    const message = await sendTelegramText(token, providerUserId, text, controller.signal);
    await recordServiceMessage(db, {
      operationId,
      provider: 'tg',
      chatId: message?.chat?.id || providerUserId,
      messageId: message?.message_id,
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  loadMessengerProfilePhoto,
  assertTenantTelegramContact, sendTelegramText, telegramBotKey,
  assertBrowserProviderReady,
  recordTenantTelegramContact,
  buildProviderLink,
  deliverCode,
  getBotToken,
  getTenantBotConfig,
  getTenantChannelAvailability,
  getTenantWebhookSecret,
  verifyTenantWebhookSecret,
  getWebhookSecret,
  verifyWebhookSecret,
};
