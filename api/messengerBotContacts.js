'use strict';

const crypto = require('crypto');

const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const identityCache = new Map();

function telegramLegacyBotKey(botId) {
  return crypto.createHash('sha256').update(`telegram:${String(botId)}`).digest();
}

async function fetchBotIdentity(config) {
  const provider = String(config?.provider || '');
  const token = String(config?.token || '').trim();
  if (!['tg', 'max'].includes(provider) || !token) throw new Error('BOT_IDENTITY_CONFIG_INVALID');
  const cacheKey = `${provider}:${crypto.createHash('sha256').update(token).digest('hex')}`;
  const cached = identityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = provider === 'tg'
    ? await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) })
    : await fetch(`${String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').replace(/\/+$/, '')}/me`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(10000),
    });
  const payload = await response.json().catch(() => null);
  const source = provider === 'tg' ? payload?.result : payload;
  const id = String(provider === 'tg' ? source?.id : source?.user_id || '').trim();
  if (!response.ok || (provider === 'tg' && payload?.ok !== true) || source?.is_bot !== true || !/^\d+$/.test(id)) {
    const error = new Error('BOT_IDENTITY_UNAVAILABLE');
    error.code = 'BOT_IDENTITY_UNAVAILABLE';
    throw error;
  }
  const value = { provider, id, username: String(source?.username || '').replace(/^@/, '') };
  identityCache.set(cacheKey, { value, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
  return value;
}

function extractContactEvent(provider, update) {
  if (provider === 'tg') {
    const message = update?.message;
    const membership = update?.my_chat_member;
    const chat = message?.chat || membership?.chat;
    const userId = String(message?.from?.id || membership?.chat?.id || '').trim();
    if (chat?.type !== 'private' || !userId || String(chat.id) !== userId || message?.from?.is_bot) return null;
    const status = String(membership?.new_chat_member?.status || 'member');
    return { userId, reachable: !['kicked', 'left'].includes(status), reason: ['kicked', 'left'].includes(status) ? 'blocked' : null };
  }
  const updateType = String(update?.update_type || '').trim();
  const userId = String(
    update?.user?.user_id
    || update?.message?.sender?.user_id
    || update?.callback?.user?.user_id
    || update?.callback?.user_id
    || ''
  ).trim();
  if (!userId || !/^\d+$/.test(userId)) return null;
  const stopped = updateType === 'bot_stopped';
  return { userId, reachable: !stopped, reason: stopped ? 'blocked' : null };
}

async function recordMessengerBotContact(db, config, update) {
  const event = extractContactEvent(config?.provider, update);
  if (!event) return false;
  let identity;
  try {
    identity = await fetchBotIdentity(config);
  } catch (error) {
    console.warn('MESSENGER_BOT_IDENTITY_NOT_RECORDED', {
      tenantId: Number(config?.tenantId || 0),
      provider: String(config?.provider || ''),
      reason: String(error?.code || error?.cause?.code || error?.name || 'UNKNOWN'),
    });
    return false;
  }
  await db.query(
    `INSERT INTO auth_messenger_bot_contacts
       (tenant_id,provider,bot_id,provider_user_id,reachable,unavailable_reason,confirmed_at,updated_at)
     VALUES (?,?,?,?,?,?,NOW(),NOW())
     ON DUPLICATE KEY UPDATE
       reachable=VALUES(reachable),
       unavailable_reason=VALUES(unavailable_reason),
       confirmed_at=IF(VALUES(reachable)=1,NOW(),confirmed_at),
       updated_at=NOW()`,
    [Number(config.tenantId), config.provider, identity.id, event.userId, event.reachable ? 1 : 0, event.reason]
  );
  return true;
}

module.exports = { fetchBotIdentity, recordMessengerBotContact, telegramLegacyBotKey };
