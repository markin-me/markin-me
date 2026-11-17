'use strict';

const crypto = require('crypto');
const { requestMaxBotApi } = require('./maxIntegration');
const UPDATE_TYPES = ['bot_started', 'message_created', 'message_callback', 'bot_stopped'];
const CHECK_SECONDS = 300;
const botKey = token => crypto.createHash('sha256').update(String(token).trim()).digest();
const fail = code => Object.assign(new Error(code), { code });
function validateToken(token) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw fail('MAX_TOKEN_FORMAT_INVALID');
  return token;
}
function configuration(env = process.env) {
  const base = new URL(env.MAX_WEBHOOK_BASE_URL || 'https://invalid.local');
  const allowed = String(env.MAX_WEBHOOK_ALLOWED_HOSTS || '').split(',').map(x => x.trim().toLowerCase());
  if (!env.MAX_WEBHOOK_BASE_URL || base.protocol !== 'https:' || base.port || base.username || base.password
      || base.pathname !== '/' || base.search || base.hash || !allowed.includes(base.hostname)) throw fail('MAX_WEBHOOK_ENDPOINT_NOT_CONFIGURED');
  const key = String(env.AUTH_WEBHOOK_SECRET || env.AUTH_CODE_PEPPER || '');
  if (key.length < 32) throw fail('AUTH_WEBHOOK_SECRET_REQUIRED');
  return { origin: base.origin, key, instance: crypto.createHmac('sha256', key).update(`max-health:${base.origin}:${env.DB_NAME}`).digest('hex') };
}
function webhookSecret(key, env = process.env) {
  return crypto.createHmac('sha256', configuration(env).key).update('max-bot:' + Buffer.from(key).toString('hex')).digest('base64url');
}
function verifyWebhook(key, received, env = process.env) {
  if (!/^[a-f0-9]{64}$/.test(key) || typeof received !== 'string') return false;
  const expected = Buffer.from(webhookSecret(Buffer.from(key, 'hex'), env));
  const actual = Buffer.from(received);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function publicStatus(row) {
  return row ? { state: row.status, bot_name: row.username || null, error: row.last_error_code || null,
    token_checked_at: row.token_checked_at || null, registered_at: row.registered_at || null,
    verified_at: row.verified_at || null, checked_at: row.checked_at || null }
    : { state: 'not_configured', bot_name: null, error: null };
}
function createMaxWebhookWorker(db, options = {}) {
  const env = options.env || process.env;
  const api = options.api || requestMaxBotApi;
  const probe = options.probe || (async config => {
    const response = await fetch(config.origin + '/api/max/webhook-health', { redirect: 'error', signal: AbortSignal.timeout(8000) });
    const value = await response.json();
    if (!response.ok || value.instance !== config.instance) throw fail('MAX_WEBHOOK_ENDPOINT_UNAVAILABLE');
  });
  let stopped = true, timer = null, active = Promise.resolve();
  const enabled = () => env.MAX_AUTO_WEBHOOK_ENABLED === '1';
  const state = async key => (await db.query('SELECT * FROM auth_max_webhook_bots WHERE bot_key=?', [key]))[0][0];
  async function queueTenant(tenantId) {
    const [[tenant]] = await db.query('SELECT max_bot_token FROM ten_tenants WHERE id=? AND is_active=1', [tenantId]);
    const token = String(tenant?.max_bot_token || '').trim();
    if (!token) return publicStatus(null);
    validateToken(token);
    const key = botKey(token);
    await db.query('INSERT IGNORE INTO auth_max_webhook_bots (bot_key) VALUES (?)', [key]);
    return publicStatus(await state(key));
  }
  async function statusForTenant(tenantId) {
    const [[tenant]] = await db.query('SELECT max_bot_token FROM ten_tenants WHERE id=? AND is_active=1', [tenantId]);
    if (!tenant?.max_bot_token) return publicStatus(null);
    if (!enabled()) return { ...publicStatus(null), state: 'not_configured', error: 'MAX_WEBHOOK_DISABLED' };
    return publicStatus(await state(botKey(tenant.max_bot_token)));
  }
  async function reconcileBot(token, { force = false } = {}) {
    validateToken(token);
    const key = botKey(token);
    const conn = await (db.getDedicatedConnection ? db.getDedicatedConnection() : db.getConnection());
    const lock = 'max-hook:' + key.toString('hex').slice(0, 48);
    let locked = false;
    try {
      const [[lease]] = await conn.query('SELECT GET_LOCK(?,0) acquired', [lock]);
      if (!Number(lease.acquired)) return;
      locked = true;
      const [owners] = await conn.query('SELECT id FROM ten_tenants WHERE is_active=1 AND TRIM(max_bot_token)=? ORDER BY id', [token]);
      if (!owners.length) return;
      await conn.query('INSERT IGNORE INTO auth_max_webhook_bots (bot_key) VALUES (?)', [key]);
      const [[row]] = await conn.query('SELECT *, (next_attempt_at>UTC_TIMESTAMP(6)) waiting FROM auth_max_webhook_bots WHERE bot_key=?', [key]);
      if (!force && (row.status === 'invalid_token' || Number(row.waiting))) return;
      try {
        if (!enabled()) throw fail('MAX_WEBHOOK_DISABLED');
        const config = configuration(env);
        const identity = await api(token, 'GET', '/me');
        if (identity.is_bot !== true || !/^\d+$/.test(String(identity.user_id)) || !/^[A-Za-z0-9_]+$/.test(identity.username || '')) throw fail('MAX_BOT_IDENTITY_INVALID');
        await conn.query('UPDATE auth_max_webhook_bots SET bot_id=?,username=?,token_checked_at=UTC_TIMESTAMP(6) WHERE bot_key=?', [String(identity.user_id), identity.username, key]);
        // A test deployment must never register an unapproved/production bot.
        const allowed = String(env.MAX_WEBHOOK_TEST_BOT_IDS || '').split(',').map(x => x.trim());
        if (env.DB_NAME === 'a1186497_test' && !allowed.includes(String(identity.user_id))) throw fail('MAX_TEST_BOT_NOT_APPROVED');
        await probe(config);
        const url = config.origin + '/api/max/bots/' + key.toString('hex') + '/webhook';
        const secret = webhookSecret(key, env);
        const fingerprint = crypto.createHash('sha256').update(secret).digest();
        const existing = await api(token, 'GET', '/subscriptions');
        if (!Array.isArray(existing.subscriptions)) throw fail('MAX_INVALID_API_RESPONSE');
        const matching = existing.subscriptions.find(s => s.url === url);
        const typesOk = matching && (!matching.update_types || UPDATE_TYPES.every(type => matching.update_types.includes(type)));
        // GET /subscriptions does not expose secrets: trust only our persisted registration receipt.
        if (!typesOk || row.webhook_url !== url || !Buffer.isBuffer(row.secret_fingerprint) || !row.secret_fingerprint.equals(fingerprint)) {
          await api(token, 'POST', '/subscriptions', { url, update_types: UPDATE_TYPES, secret });
          await conn.query('UPDATE auth_max_webhook_bots SET webhook_url=?,secret_fingerprint=?,registered_at=UTC_TIMESTAMP(6) WHERE bot_key=?', [url, fingerprint, key]);
        }
        const confirmed = await api(token, 'GET', '/subscriptions');
        if (!Array.isArray(confirmed.subscriptions) || !confirmed.subscriptions.some(s => s.url === url
          && (!s.update_types || UPDATE_TYPES.every(type => s.update_types.includes(type))))) throw fail('MAX_SUBSCRIPTION_NOT_CONFIRMED');
        await conn.query(`UPDATE auth_max_webhook_bots SET status='connected',verified_at=UTC_TIMESTAMP(6),checked_at=UTC_TIMESTAMP(6),
          attempts=0,last_error_code=NULL,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND) WHERE bot_key=?`, [CHECK_SECONDS, key]);
        // Update only owners of this exact token; a concurrent token replacement is never overwritten.
        await conn.query('UPDATE ten_tenants SET max_bot_id=? WHERE is_active=1 AND TRIM(max_bot_token)=?', [identity.username, token]);
      } catch (error) {
        const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '') ? error.code : 'MAX_WEBHOOK_CHECK_FAILED';
        const status = ['MAX_TOKEN_REJECTED', 'MAX_BOT_IDENTITY_INVALID'].includes(code) ? 'invalid_token'
          : ['MAX_TEST_BOT_NOT_APPROVED', 'MAX_WEBHOOK_DISABLED', 'MAX_WEBHOOK_ENDPOINT_NOT_CONFIGURED', 'AUTH_WEBHOOK_SECRET_REQUIRED'].includes(code) ? 'blocked' : 'retry';
        const attempts = Number(row.attempts || 0) + 1;
        const seconds = Math.min(86400, Math.max(30 * 2 ** Math.min(attempts - 1, 10), Number(error.retryAfter) || 0));
        await conn.query(`UPDATE auth_max_webhook_bots SET status=?,attempts=?,last_error_code=?,checked_at=UTC_TIMESTAMP(6),
          next_attempt_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND) WHERE bot_key=?`, [status, attempts, code, seconds, key]);
      }
    } finally {
      try { if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lock]); }
      finally { if (db.getDedicatedConnection) await conn.end(); else conn.release(); }
    }
  }
  async function retireToken(token) {
    if (!enabled() || !token) return;
    const key = botKey(token);
    const conn = await (db.getDedicatedConnection ? db.getDedicatedConnection() : db.getConnection());
    let locked = false;
    try {
      const [[lease]] = await conn.query('SELECT GET_LOCK(?,0) acquired', ['max-hook:' + key.toString('hex').slice(0, 48)]);
      locked = Boolean(Number(lease.acquired));
      if (!locked) return;
      const [owners] = await conn.query('SELECT id FROM ten_tenants WHERE TRIM(max_bot_token)=? LIMIT 1', [token]);
      if (owners.length) return;
      const row = await state(key);
      if (!row?.registered_at || row.webhook_url !== configuration(env).origin + '/api/max/bots/' + key.toString('hex') + '/webhook') return;
      const identity = await api(token, 'GET', '/me');
      if (env.DB_NAME === 'a1186497_test' && !String(env.MAX_WEBHOOK_TEST_BOT_IDS || '').split(',').includes(String(identity.user_id))) return;
      await api(token, 'DELETE', '/subscriptions?url=' + encodeURIComponent(row.webhook_url));
      await conn.query("UPDATE auth_max_webhook_bots SET status='retired',next_attempt_at=NULL WHERE bot_key=?", [key]);
    } finally {
      try { if (locked) await conn.query('SELECT RELEASE_LOCK(?)', ['max-hook:' + key.toString('hex').slice(0, 48)]); }
      finally { if (db.getDedicatedConnection) await conn.end(); else conn.release(); }
    }
  }
  async function tick() {
    const [rows] = await db.query("SELECT max_bot_token FROM ten_tenants WHERE is_active=1 AND TRIM(COALESCE(max_bot_token,''))<>''");
    for (const token of new Set(rows.map(row => String(row.max_bot_token).trim()))) {
      if (stopped) break;
      await reconcileBot(token);
    }
  }
  function schedule(delay) {
    timer = setTimeout(() => {
      active = tick().catch(error => console.error('MAX_WEBHOOK_WORKER_FAILED', { reason: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'MAX_WEBHOOK_CHECK_FAILED' }))
        .finally(() => { if (!stopped) schedule(15000); });
    }, delay);
    timer.unref?.();
  }
  return { queueTenant, statusForTenant, reconcileBot, retireToken,
    start() { if (!stopped || !enabled()) return; stopped = false; schedule(0); },
    async stop() { stopped = true; clearTimeout(timer); await active; },
  };
}
module.exports = { createMaxWebhookWorker, botKey, validateToken, configuration, webhookSecret, verifyWebhook, publicStatus, UPDATE_TYPES };
