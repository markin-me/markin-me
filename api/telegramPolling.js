'use strict';

const crypto = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { requestTelegramApi, telegramErrorReason } = require('./telegramApi');

const { customerTerminalNoticeStateSql } = require('./messengerCleanup');

const LONG_POLL_SECONDS = 25;
const LEASE_SECONDS = 75;

function botIdentity(token) {
  const id = String(token || '').trim().match(/^([1-9][0-9]*):/)?.[1];
  if (!id) throw new Error('TELEGRAM_BOT_ID_INVALID');
  return id;
}

function botKey(token) {
  return crypto.createHash('sha256').update(`telegram:${botIdentity(token)}`).digest();
}

function pollingOwnsToken(token, env = process.env) {
  return env.TELEGRAM_ON_DEMAND_POLLING === '1'
    && String(env.TELEGRAM_POLLING_BOT_IDS || '').split(',').map(s => s.trim()).includes(botIdentity(token));
}

// Source states, rather than message-deletion jobs, determine demand. An issued
// OTP is entered in the browser and must not keep getUpdates alive.
const pendingOperationsSql = `
  SELECT r.tenant_id,r.public_id,'browser' source_type,r.token_hash,r.provider_user_id,
    r.state,UNIX_TIMESTAMP(r.created_at) created_seconds,NULL start_token,r.account_type
  FROM auth_browser_requests r
  LEFT JOIN auth_service_operations o ON o.source_type='browser' AND o.source_public_id=r.public_id
  WHERE r.provider='tg' AND r.state IN ('pending','started') AND r.expires_at>NOW(6)
    AND r.code_challenge_id IS NULL AND (o.operation_id IS NULL OR o.status='pending')
  UNION ALL
  SELECT c.tenant_id,c.public_id,'challenge',c.token_hash,c.completed_provider_user_id,
    c.delivery_status,UNIX_TIMESTAMP(c.created_at),NULL,c.account_type
  FROM auth_verification_challenges c
  LEFT JOIN auth_service_operations o ON o.source_type='challenge' AND o.source_public_id=c.public_id
  WHERE c.provider='tg' AND c.consumed_at IS NULL AND c.expires_at>NOW(6)
    AND (c.purpose='link' AND c.delivery_status IN ('pending','sent')
      OR c.purpose='phone_verify' AND c.delivery_status='pending' AND c.token_hash IS NOT NULL AND c.code_hash IS NULL)
    AND (o.operation_id IS NULL OR o.status='pending')
  UNION ALL
  SELECT s.tenant_id,CAST(s.id AS CHAR),'store',NULL,NULL,'store',UNIX_TIMESTAMP(s.created_at),s.connect_token,NULL
  FROM ten_store_telegram s WHERE s.connect_token IS NOT NULL
    AND (s.connect_token_expires_at IS NULL OR s.connect_token_expires_at>NOW())`;

async function pendingOperations(db, token = null) {
  const [rows] = await db.query(`SELECT p.*,TRIM(t.telegram_bot_token) bot_token
    FROM (${pendingOperationsSql}) p JOIN ten_tenants t ON t.id=p.tenant_id AND t.is_active=1
    WHERE TRIM(COALESCE(t.telegram_bot_token,''))<>'' ${token ? 'AND TRIM(t.telegram_bot_token)=?' : ''}`,
  token ? [token] : []);
  return rows;
}

// A cleanup-only task keeps the transport alive but never routes an incoming update.
async function pollingDemand(db, token = null) {
  const [rows] = await db.query(`SELECT DISTINCT TRIM(t.telegram_bot_token) bot_token
    FROM ten_tenants t JOIN (
      SELECT tenant_id FROM (${pendingOperationsSql}) incoming
      UNION ALL
      SELECT tenant_id FROM auth_browser_requests
      WHERE provider='tg' AND account_type IN ('customer','employee') AND code_challenge_id IS NULL
        AND ((state='confirmed' AND expires_at>NOW()) OR ((notice_attempts<5 OR notice_retry_at>NOW()) AND ${customerTerminalNoticeStateSql}))
      UNION ALL
      SELECT m.tenant_id FROM auth_service_messages m
      JOIN auth_service_operations o ON o.operation_id=m.operation_id AND o.tenant_id=m.tenant_id AND o.provider=m.provider
      LEFT JOIN auth_browser_requests r ON o.source_type='browser' AND r.public_id=o.source_public_id
        AND r.tenant_id=o.tenant_id AND r.provider=o.provider
      LEFT JOIN auth_verification_challenges c ON o.source_type='challenge' AND c.public_id=o.source_public_id
        AND c.tenant_id=o.tenant_id AND c.provider=o.provider
      WHERE m.provider='tg' AND m.message_type='service' AND m.status IN ('pending','processing')
        AND (r.account_type IN ('customer','employee') OR c.account_type IN ('customer','employee'))
    ) demand ON demand.tenant_id=t.id AND t.is_active=1
    WHERE TRIM(COALESCE(t.telegram_bot_token,''))<>'' ${token ? 'AND TRIM(t.telegram_bot_token)=?' : ''}`,
  token ? [token] : []);
  return rows;
}

// Only a live CRM token (or an unambiguous contact bound by that token) may
// choose a tenant. Ordinary /start, old callbacks and unsolicited contacts are ignored.
async function resolveTelegramOperation(db, token, update) {
  const text = String(update?.message?.text || '').trim();
  const start = text.match(/^\/start(?:@\w+)?\s+([abl]_[A-Za-z0-9_-]{40})$/i)?.[1];
  const callback = String(update?.callback_query?.data || '').match(/^auth:([bcr]_[A-Za-z0-9_-]{40,43})(?::(?:yes|no))?$/)?.[1];
  const contact = update?.message?.contact;
  const storeStart = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/i)?.[1];
  if (!start && !callback && !contact && !storeStart) return null;
  const msg = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (!msg || from?.is_bot || !from?.id) return null;
  const rows = await pendingOperations(db, token);
  if (storeStart && !start) {
    const stores = rows.filter(row => row.source_type === 'store' && row.start_token === storeStart);
    return stores.length === 1 ? { tenantId: Number(stores[0].tenant_id), token: storeStart, source: stores[0] } : null;
  }
  if (msg.chat?.type !== 'private' || String(msg.chat.id) !== String(from.id)) return null;
  const raw = start || callback;
  const hash = raw && !['r_','c_'].includes(raw.slice(0,2)) ? crypto.createHash('sha256').update(raw).digest() : null;
  const candidates = rows.filter(row => {
    if (row.source_type === 'store') return false;
    if (row.provider_user_id && String(row.provider_user_id) !== String(from.id)) return false;
    // Queued contacts from an earlier operation cannot verify a newer request.
    if (contact) return row.provider_user_id && row.state !== 'sent'
      && Number(update.message.date) >= Number(row.created_seconds);
    if (callback && raw.startsWith('c_'))return row.source_type==='challenge' && row.account_type==='customer'
      && row.state==='pending' && row.public_id===raw.slice(2);
    if (callback && (row.source_type !== 'browser' || row.state !== 'started')) return false;
    return raw.startsWith('r_') ? row.public_id === raw.slice(2)
      : Buffer.isBuffer(row.token_hash) && row.token_hash.equals(hash);
  });
  if(contact && candidates.length>1 && candidates.some(row=>row.account_type==='customer')
    && candidates.every(row=>row.tenant_id===candidates[0].tenant_id)){
    return {tenantId:Number(candidates[0].tenant_id),token:null,source:null};
  }
  if (candidates.length !== 1) return null;
  return { tenantId: Number(candidates[0].tenant_id), token: raw, source: candidates[0] };
}

function createTelegramPolling(db, handleUpdate, options = {}) {
  const env = options.env || process.env;
  const request = options.request || requestTelegramApi;
  const intervalMs = options.intervalMs || 1000;
  const workers = new Map();
  let stopped = true, timer = null, reconciling = Promise.resolve();
  let lastErrorAt = 0;

  function report(error) {
    if (Date.now() - lastErrorAt < 60000) return;
    lastErrorAt = Date.now();
    const localReason = ['TELEGRAM_WEBHOOK_ACTIVE', 'TELEGRAM_POLLING_LEASE_LOST', 'TELEGRAM_POLLING_SCOPE_REFUSED', 'TELEGRAM_UPDATE_INVALID'];
    console.error('TELEGRAM_ON_DEMAND_POLLING_FAILED', {
      reason: localReason.includes(error?.code || error?.message) ? error.code || error.message : telegramErrorReason(error),
    });
  }

  async function run(worker) {
    const { token, controller, key, owner } = worker;
    const signal = controller.signal;
    let conn, locked = false, claimed = false;
    const lockName = `tg-poll:${key.toString('hex').slice(0, 48)}`;
    try {
      conn = await db.getDedicatedConnection();
      worker.conn = conn;
      const [[lock]] = await conn.query('SELECT GET_LOCK(?,0) acquired', [lockName]);
      locked = Number(lock.acquired) === 1;
      if (!locked || signal.aborted) return;
      await conn.query('INSERT IGNORE INTO auth_telegram_polling (bot_key) VALUES (?)', [key]);
      const [claim] = await conn.query(`UPDATE auth_telegram_polling SET owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
        WHERE bot_key=? AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(6))`, [owner, LEASE_SECONDS, key]);
      if (!claim.affectedRows) return;
      claimed = true;
      worker.claimed = true;
      console.info('TELEGRAM_POLLING_OWNER', {
        pid: process.pid, cwd: process.cwd(), botId: botIdentity(token), owner,
      });
      if (signal.aborted) return;
      const [[state]] = await conn.query('SELECT next_offset FROM auth_telegram_polling WHERE bot_key=?', [key]);
      let offset = Number(state.next_offset), failures = 0;
      const base = `https://api.telegram.org/bot${token}`;
      while (!signal.aborted) {
        if (!(await pollingDemand(db, token)).length) break;
        try {
          if (!worker.ready) {
            const info = await request(base, 'getWebhookInfo', {}, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
            if (info.result.url) throw Object.assign(new Error('TELEGRAM_WEBHOOK_ACTIVE'), { code: 'TELEGRAM_WEBHOOK_ACTIVE' });
            worker.ready = true;
          }
          const [renewed] = await conn.query(`UPDATE auth_telegram_polling SET lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
            WHERE bot_key=? AND owner=? AND lease_until>UTC_TIMESTAMP(6)`, [LEASE_SECONDS, key, owner]);
          if (!renewed.affectedRows) throw new Error('TELEGRAM_POLLING_LEASE_LOST');
          worker.requestStarted = Date.now();
          const data = await request(base, 'getUpdates', {
            offset, timeout: LONG_POLL_SECONDS, limit: 100, allowed_updates: ['message', 'callback_query', 'my_chat_member'],
          }, { signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
          worker.requestStarted = null;
          for (const update of [...data.result].sort((a, b) => a.update_id - b.update_id)) {
            if (signal.aborted) break;
            if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) throw new Error('TELEGRAM_UPDATE_INVALID');
            if (update.update_id < offset) continue;
            // The dispatcher acknowledges only successful handling or intentional ignore.
            worker.handlingUpdate = true;
            try { await handleUpdate(token, update); }
            finally { worker.handlingUpdate = false; }
            const next = update.update_id + 1;
            const [saved] = await conn.query(`UPDATE auth_telegram_polling SET next_offset=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
              WHERE bot_key=? AND owner=? AND lease_until>UTC_TIMESTAMP(6)`, [next, LEASE_SECONDS, key, owner]);
            if (!saved.affectedRows) throw new Error('TELEGRAM_POLLING_LEASE_LOST');
            offset = next;
          }
          failures = 0;
          // Protect against immediate empty responses without defining the lifetime.
          if (!data.result.length) await delay(250, undefined, { signal });
        } catch (error) {
          if (signal.aborted) break;
          if (String(error.code || '').startsWith('ER_') || !worker.conn || error.message === 'TELEGRAM_POLLING_LEASE_LOST') throw error;
          failures += 1;
          report(error);
          const orphanWait = worker.requestStarted && error.deliveryOutcome === 'unknown'
            ? Math.max(0, 35000 - (Date.now() - worker.requestStarted)) : 0;
          const wait = Math.max(orphanWait, Number(error.retryAfter) * 1000 || 0,
            error.code === 'TELEGRAM_WEBHOOK_ACTIVE' || error.httpStatus === 409 ? 60000 : 0,
            Math.min(60000, 1000 * 2 ** Math.min(failures, 6)));
          await delay(wait, undefined, { signal });
        }
      }
    } catch (error) {
      if (!signal.aborted) report(error);
    } finally {
      controller.abort();
      if (conn) {
        try {
          if (claimed) {
            // A canceled HTTP request may remain in flight at Telegram. Fence a
            // replacement until its maximum server timeout has elapsed.
            const remaining = worker.requestStarted ? Math.max(0, 35 - Math.floor((Date.now() - worker.requestStarted) / 1000)) : 0;
            await conn.query(`UPDATE auth_telegram_polling SET owner=NULL,
              lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND) WHERE bot_key=? AND owner=?`, [remaining, key, owner]);
          }
          if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
          await conn.end();
        } catch (error) { conn.destroy(); report(error); }
      }
      workers.delete(worker.id);
    }
  }

  async function reconcile() {
    const pending = await pollingDemand(db);
    const desired = new Map();
    for (const row of pending) {
      if (pollingOwnsToken(row.bot_token, env)) desired.set(botIdentity(row.bot_token), row.bot_token);
    }
    for (const [id, worker] of workers) {
      if ((!desired.has(id) && !worker.handlingUpdate) || (desired.has(id) && desired.get(id) !== worker.token)) worker.controller.abort();
      else if (worker.claimed && !worker.controller.signal.aborted) {
        try {
          const [renewed] = await worker.conn.query(`UPDATE auth_telegram_polling SET lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
            WHERE bot_key=? AND owner=? AND lease_until>UTC_TIMESTAMP(6)`, [LEASE_SECONDS, worker.key, worker.owner]);
          if (!renewed.affectedRows) worker.controller.abort();
        } catch (error) { worker.controller.abort(); throw error; }
      }
    }
    for (const [id, token] of desired) {
      if (stopped || workers.has(id)) continue;
      const worker = { id, token, key: botKey(token), owner: crypto.randomUUID(), controller: new AbortController() };
      workers.set(id, worker);
      worker.done = run(worker);
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      reconciling = reconcile().catch(error => {
        for (const worker of workers.values()) worker.controller.abort();
        report(error);
      }).finally(schedule);
    }, intervalMs);
    timer.unref();
  }

  return {
    async start() {
      if (env.TELEGRAM_ON_DEMAND_POLLING !== '1' || !stopped) return;
      const [[scope]] = await db.query('SELECT DATABASE() name');
      if (scope.name !== 'a1186497_test' || !String(env.TELEGRAM_POLLING_BOT_IDS || '').trim()) throw new Error('TELEGRAM_POLLING_SCOPE_REFUSED');
      stopped = false;
      schedule(); // Reconciliation also recovers operations created before restart.
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await reconciling;
      for (const worker of workers.values()) worker.controller.abort();
      await Promise.all([...workers.values()].map(worker => worker.done));
    },
    activeBotIds() { return [...workers.values()].filter(w => w.ready && !w.controller.signal.aborted).map(w => w.id); },
  };
}

module.exports = { botIdentity, botKey, pollingOwnsToken, pendingOperations, resolveTelegramOperation, createTelegramPolling };
