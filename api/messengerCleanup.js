'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const operationStorage = new AsyncLocalStorage();
const MAX_DELETE_ATTEMPTS = 5;
const WORKER_POLL_MS = 600;
const DELETE_TIMEOUT_MS = 10000;
const TERMINAL_DELAYS_SECONDS = Object.freeze({ success: 15, cancelled: 15, error: 30, expired: 30 });
let lastTrackingErrorAt = 0;

function operationId(sourceType, publicId) {
  if (!['challenge', 'browser', 'interaction'].includes(sourceType) || !/^[A-Za-z0-9_-]{43}$/.test(String(publicId || ''))) return null;
  return `${sourceType}:${publicId}`;
}

function safeErrorCode(error, fallback = 'MESSENGER_CLEANUP_FAILED') {
  const code = String(error?.code || error?.name || '').trim();
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : fallback;
}

function logTrackingError(stage, error) {
  const now = Date.now();
  if (now - lastTrackingErrorAt < 60000) return;
  lastTrackingErrorAt = now;
  console.error('AUTH_SERVICE_CLEANUP_TRACKING_FAILED', { stage, reason: safeErrorCode(error) });
}

async function ensureOperation(db, details) {
  const id = operationId(details.sourceType, details.publicId);
  if (!id) return null;
  const kind = details.kind || (details.sourceType === 'challenge' && details.purpose !== 'link' ? 'otp' : 'link');
  const expiresInSeconds = Math.max(0, Math.floor(Number(details.expiresInSeconds) || 0));
  try {
    await db.query(
      `INSERT INTO auth_service_operations
       (operation_id,tenant_id,provider,source_type,source_public_id,operation_kind,status,expires_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id),provider=VALUES(provider),
         operation_kind=VALUES(operation_kind),expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP(6)`,
      [id, Number(details.tenantId), details.provider, details.sourceType, details.publicId, kind, expiresInSeconds]
    );
    if (expiresInSeconds === 0) await markOperation(db, id, 'expired');
    return id;
  } catch (error) {
    logTrackingError('ensure_operation', error);
    return null;
  }
}

function ensureChallengeOperation(db, details) {
  return ensureOperation(db, { ...details, sourceType: 'challenge' });
}

function ensureBrowserOperation(db, details) {
  return ensureOperation(db, { ...details, sourceType: 'browser', kind: details.purpose === 'profile_link' ? 'link' : 'browser' });
}

function createServiceInteractionContext(db, details) {
  const tenantId = Number(details.tenantId);
  const provider = String(details.provider || '');
  const eventKey = String(details.eventKey || '');
  if (!tenantId || !['tg', 'max'].includes(provider) || !eventKey) return null;
  const publicId = crypto.createHash('sha256')
    .update(`${tenantId}:${provider}:${eventKey}`, 'utf8').digest('base64url');
  return { db, tenantId, provider, sourceType: 'interaction', publicId, interaction: true, keepPending: false };
}

async function markOperation(db, id, outcome) {
  if (!id || !Object.prototype.hasOwnProperty.call(TERMINAL_DELAYS_SECONDS, outcome)) return false;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[operation]] = await conn.query(
      'SELECT status FROM auth_service_operations WHERE operation_id=? FOR UPDATE', [id]
    );
    if (!operation) {
      await conn.rollback();
      return false;
    }
    if (operation.status !== 'pending') {
      await conn.commit();
      return operation.status === outcome;
    }
    await conn.query(outcome === 'expired'
      ? `UPDATE auth_service_operations SET status=?,completed_at=expires_at,updated_at=UTC_TIMESTAMP(6)
         WHERE operation_id=? AND status='pending'`
      : `UPDATE auth_service_operations SET status=?,completed_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6)
         WHERE operation_id=? AND status='pending'`,
    [outcome, id]);
    if (outcome !== 'expired') {
      const delay = TERMINAL_DELAYS_SECONDS[outcome];
      await conn.query(
        `UPDATE auth_service_messages
         SET delete_after=GREATEST(DATE_ADD(sent_at,INTERVAL ? SECOND),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)),
             available_at=GREATEST(DATE_ADD(sent_at,INTERVAL ? SECOND),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)),
             updated_at=UTC_TIMESTAMP(6)
         WHERE operation_id=? AND status='pending'`,
        [delay, delay, delay, delay, id]
      );
    }
    await conn.commit();
    return true;
  } catch (error) {
    if (conn) try { await conn.rollback(); } catch (_) {}
    logTrackingError('mark_operation', error);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

function currentOperation() {
  return operationStorage.getStore() || null;
}

function runWithOperation(context, handler) {
  if (!context?.operationId && !context?.interaction) return handler();
  return operationStorage.run(context, async () => {
    try {
      const result = await handler();
      if (context.interaction && context.operationId && !context.keepPending) {
        await markOperation(context.db, context.operationId, 'success');
      }
      return result;
    } catch (error) {
      if (context.interaction && context.operationId) {
        await markOperation(context.db, context.operationId, 'error');
      }
      throw error;
    }
  });
}

function markCurrentOperation(outcome) {
  const context = currentOperation();
  if (!context) return Promise.resolve(false);
  if (context.interaction && !context.operationId) {
    context.outcome = outcome;
    context.keepPending = false;
    return Promise.resolve(true);
  }
  return markOperation(context.db, context.operationId, outcome);
}

function keepCurrentOperationPending() {
  const context = currentOperation();
  if (context?.interaction) context.keepPending = true;
}

async function recordServiceMessage(db, details) {
  if (!details.operationId || !details.messageId || !details.chatId) return false;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[operation]] = await conn.query(
      `SELECT tenant_id,provider,status,(expires_at<=UTC_TIMESTAMP(6)) expired
       FROM auth_service_operations WHERE operation_id=? FOR UPDATE`,
      [details.operationId]
    );
    if (!operation || operation.provider !== details.provider) {
      await conn.rollback();
      return false;
    }
    let status = operation.status;
    if (status === 'pending' && Number(operation.expired) === 1) {
      status = 'expired';
      await conn.query(
        `UPDATE auth_service_operations SET status='expired',completed_at=expires_at,updated_at=UTC_TIMESTAMP(6)
         WHERE operation_id=? AND status='pending'`, [details.operationId]
      );
    }
    const identity = [String(details.chatId), String(details.messageId), details.operationId];
    if (status === 'pending') {
      await conn.query(
        `INSERT INTO auth_service_messages
         (operation_id,tenant_id,provider,chat_id,message_id,message_type,sent_at,delete_after,available_at,status,created_at,updated_at)
         SELECT operation_id,tenant_id,provider,?,?,'service',UTC_TIMESTAMP(6),expires_at,expires_at,'pending',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)
         FROM auth_service_operations WHERE operation_id=?
         ON DUPLICATE KEY UPDATE operation_id=VALUES(operation_id),message_type='service',
           delete_after=VALUES(delete_after),available_at=VALUES(available_at),updated_at=UTC_TIMESTAMP(6)`, identity
      );
    } else {
      const delay = TERMINAL_DELAYS_SECONDS[status] || 30;
      await conn.query(
        `INSERT INTO auth_service_messages
         (operation_id,tenant_id,provider,chat_id,message_id,message_type,sent_at,delete_after,available_at,status,created_at,updated_at)
         SELECT operation_id,tenant_id,provider,?,?,'service',UTC_TIMESTAMP(6),
           GREATEST(DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),DATE_ADD(COALESCE(completed_at,UTC_TIMESTAMP(6)),INTERVAL ? SECOND)),
           GREATEST(DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),DATE_ADD(COALESCE(completed_at,UTC_TIMESTAMP(6)),INTERVAL ? SECOND)),'pending',
           UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)
         FROM auth_service_operations WHERE operation_id=?
         ON DUPLICATE KEY UPDATE operation_id=VALUES(operation_id),message_type='service',
           delete_after=VALUES(delete_after),available_at=VALUES(available_at),updated_at=UTC_TIMESTAMP(6)`,
        [String(details.chatId), String(details.messageId), delay, delay, delay, delay, details.operationId]
      );
    }
    await conn.commit();
    return true;
  } catch (error) {
    if (conn) try { await conn.rollback(); } catch (_) {}
    logTrackingError('record_message', error);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

async function recordCurrentServiceMessage(details) {
  const context = currentOperation();
  if (!context) return false;
  if (!context.operationId && context.interaction) {
    context.operationId = await ensureOperation(context.db, {
      sourceType: 'interaction', publicId: context.publicId, tenantId: context.tenantId,
      provider: context.provider, purpose: 'interaction', kind: 'interaction', expiresInSeconds: 10 * 60,
    });
    if (context.operationId && context.outcome) {
      await markOperation(context.db, context.operationId, context.outcome);
    }
  }
  if (!context.operationId) return false;
  return recordServiceMessage(context.db, { ...details, operationId: context.operationId });
}

async function recordCurrentTelegramUserServiceMessage(message, serviceMessageType) {
  const context = currentOperation();
  if (!context?.operationId || context.provider !== 'tg'
      || !['challenge', 'browser'].includes(context.sourceType)
      || !/^[A-Za-z0-9_-]{43}$/.test(String(context.publicId || ''))) return false;
  const chatId = String(message?.chat?.id || '');
  const providerUserId = String(message?.from?.id || '');
  const messageId = Number(message?.message_id);
  if (message?.chat?.type !== 'private' || message?.from?.is_bot
      || !/^[1-9][0-9]{0,19}$/.test(chatId) || providerUserId !== chatId
      || !Number.isSafeInteger(messageId) || messageId <= 0) return false;

  const sourceTable = context.sourceType === 'challenge'
    ? 'auth_verification_challenges' : 'auth_browser_requests';
  const providerUserColumn = context.sourceType === 'challenge'
    ? 'completed_provider_user_id' : 'provider_user_id';
  const params = [context.publicId, context.tenantId, providerUserId];
  let sourceCondition = '';
  if (serviceMessageType === 'start') {
    const token = String(message?.text || '').match(/^\/start(?:@\w+)?\s+([abl]_[A-Za-z0-9_-]{40})$/)?.[1];
    if (!token || (token.startsWith('b_') ? 'browser' : 'challenge') !== context.sourceType) return false;
    sourceCondition = ' AND token_hash=?';
    params.push(crypto.createHash('sha256').update(token).digest());
  } else if (serviceMessageType === 'contact') {
    if (!message?.contact?.user_id || String(message.contact.user_id) !== providerUserId
        || message.forward_origin || message.forward_date || message.forward_from
        || message.forward_from_chat || message.forward_sender_name) return false;
  } else {
    return false;
  }

  const [sources] = await context.db.query(
    `SELECT public_id FROM ${sourceTable}
     WHERE public_id=? AND tenant_id=? AND provider='tg' AND ${providerUserColumn}=?${sourceCondition}
     LIMIT 1`, params
  );
  if (sources.length !== 1) return false;
  return recordServiceMessage(context.db, {
    operationId: context.operationId, provider: 'tg', chatId, messageId: String(messageId),
  });
}

async function resolveServiceOperation(db, { tenantId, provider, token, providerUserId }) {
  // Source auth tables use the connection's SQL clock; only their remaining duration
  // crosses into the cleanup queue, whose DATETIME(6) values are UTC throughout.
  const normalizedToken = String(token || '');
  let sourceType = null;
  let row = null;
  try {
    if (/^[al]_[A-Za-z0-9_-]{40}$/.test(normalizedToken)) {
      const [rows] = await db.query(
        `SELECT public_id,tenant_id,provider,purpose,expires_at,created_at,
                GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(6),expires_at)) remaining_seconds
         FROM auth_verification_challenges WHERE token_hash=? AND tenant_id=? AND provider=? LIMIT 1`,
        [crypto.createHash('sha256').update(normalizedToken).digest(), Number(tenantId), provider]
      );
      row = rows[0] || null;
      sourceType = 'challenge';
    } else if (/^b_[A-Za-z0-9_-]{40}$/.test(normalizedToken)) {
      const [rows] = await db.query(
        `SELECT public_id,tenant_id,provider,purpose,expires_at,created_at,
                GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(6),expires_at)) remaining_seconds
         FROM auth_browser_requests WHERE token_hash=? AND tenant_id=? AND provider=? LIMIT 1`,
        [crypto.createHash('sha256').update(normalizedToken).digest(), Number(tenantId), provider]
      );
      row = rows[0] || null;
      sourceType = 'browser';
    } else if (/^r_[A-Za-z0-9_-]{43}$/.test(normalizedToken)) {
      const [rows] = await db.query(
        `SELECT public_id,tenant_id,provider,purpose,expires_at,created_at,
                GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(6),expires_at)) remaining_seconds
         FROM auth_browser_requests WHERE public_id=? AND tenant_id=? AND provider=? LIMIT 1`,
        [normalizedToken.slice(2), Number(tenantId), provider]
      );
      row = rows[0] || null;
      sourceType = 'browser';
    } else if (/^[1-9][0-9]{0,19}$/.test(String(providerUserId || ''))) {
      const [browserRows] = await db.query(
        `SELECT public_id,tenant_id,provider,purpose,expires_at,created_at,UNIX_TIMESTAMP(created_at) created_sort,'browser' source_type,
                (expires_at>NOW() AND state='started') active,
                GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(6),expires_at)) remaining_seconds
         FROM auth_browser_requests
         WHERE tenant_id=? AND provider=? AND provider_user_id=? AND state='started'
           AND expires_at>DATE_SUB(NOW(),INTERVAL 10 MINUTE)
         ORDER BY created_at DESC LIMIT 2`, [Number(tenantId), provider, String(providerUserId)]
      );
      const [challengeRows] = await db.query(
        `SELECT public_id,tenant_id,provider,purpose,expires_at,created_at,UNIX_TIMESTAMP(created_at) created_sort,'challenge' source_type,
                (expires_at>NOW() AND consumed_at IS NULL AND delivery_status='pending') active,
                GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(6),expires_at)) remaining_seconds
         FROM auth_verification_challenges
         WHERE tenant_id=? AND provider=? AND completed_provider_user_id=? AND purpose='link'
           AND expires_at>DATE_SUB(NOW(),INTERVAL 10 MINUTE)
         ORDER BY created_at DESC LIMIT 2`, [Number(tenantId), provider, String(providerUserId)]
      );
      const candidates = [...browserRows, ...challengeRows].sort((a, b) => Number(b.created_sort) - Number(a.created_sort));
      const active = candidates.filter(candidate => Number(candidate.active) === 1);
      if (active.length === 1 || (!active.length && candidates.length === 1)) {
        row = active[0] || candidates[0];
        sourceType = row.source_type;
      }
      if (!row) {
        const [interactions] = await db.query(
          `SELECT o.operation_id
           FROM auth_service_operations o
           JOIN auth_service_messages m ON m.operation_id=o.operation_id
           WHERE o.tenant_id=? AND o.provider=? AND o.source_type='interaction'
             AND o.status='pending' AND o.expires_at>UTC_TIMESTAMP(6) AND m.chat_id=?
           ORDER BY o.created_at DESC LIMIT 1`,
          [Number(tenantId), provider, String(providerUserId)]
        );
        if (interactions[0]) {
          return { db, operationId: interactions[0].operation_id, tenantId: Number(tenantId), provider,
            sourceType: 'interaction', interaction: true, keepPending: false };
        }
      }
    }
    if (!row || !sourceType) return null;
    const id = sourceType === 'challenge'
      ? await ensureChallengeOperation(db, { ...row, publicId: row.public_id, tenantId: row.tenant_id, expiresInSeconds: row.remaining_seconds })
      : await ensureBrowserOperation(db, { ...row, publicId: row.public_id, tenantId: row.tenant_id, expiresInSeconds: row.remaining_seconds });
    return id ? { db, operationId: id, tenantId: Number(row.tenant_id), provider,
      sourceType, publicId: row.public_id } : null;
  } catch (error) {
    logTrackingError('resolve_operation', error);
    return null;
  }
}

function deletionError(code, permanent = false, retryAfter = 0) {
  return Object.assign(new Error(code), { code, permanent, retryAfter });
}

async function deleteTelegramMessage(token, row) {
  const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
    body: JSON.stringify({ chat_id: row.chat_id, message_id: Number(row.message_id) }),
  });
  const data = await response.json().catch(() => null);
  if (response.ok && data?.ok === true && data.result === true) return { alreadyMissing: false };
  const description = String(data?.description || '').toLowerCase();
  if (response.status === 400 && description.includes('message to delete not found')) return { alreadyMissing: true };
  if (response.status === 429) throw deletionError('TELEGRAM_DELETE_RATE_LIMITED', false, Number(data?.parameters?.retry_after) || 1);
  if ([400, 401, 403].includes(response.status)) throw deletionError(
    response.status === 400 ? 'TELEGRAM_DELETE_REJECTED' : response.status === 401 ? 'TELEGRAM_TOKEN_REJECTED' : 'TELEGRAM_DELETE_FORBIDDEN', true
  );
  throw deletionError('TELEGRAM_DELETE_FAILED');
}

async function deleteMaxMessage(token, row) {
  const base = String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(base); } catch { throw deletionError('MAX_HTTPS_REQUIRED', true); }
  if (url.protocol !== 'https:' || url.username || url.password) throw deletionError('MAX_HTTPS_REQUIRED', true);
  const response = await fetch(`${base}/messages?message_id=${encodeURIComponent(row.message_id)}`, {
    method: 'DELETE', headers: { Authorization: token }, signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  if (response.ok && data?.success === true) return { alreadyMissing: false };
  const message = String(data?.message || '').toLowerCase();
  if (response.status === 404 || message.includes('not found') || message.includes('не найден')) return { alreadyMissing: true };
  if (response.status === 429) throw deletionError('MAX_DELETE_RATE_LIMITED', false, Number(response.headers.get('retry-after')) || 1);
  if ([400, 401, 403].includes(response.status) || response.ok) throw deletionError(
    response.status === 401 ? 'MAX_TOKEN_REJECTED' : response.status === 403 ? 'MAX_DELETE_FORBIDDEN' : 'MAX_DELETE_REJECTED', true
  );
  throw deletionError('MAX_DELETE_FAILED');
}

function createMessengerCleanupWorker(db) {
  let stopped = true;
  let timer = null;
  let active = Promise.resolve();
  let lastWorkerErrorAt = 0;

  async function tick() {
    await db.query(
      `UPDATE auth_service_operations SET status='expired',completed_at=expires_at,updated_at=UTC_TIMESTAMP(6)
       WHERE status='pending' AND expires_at<=UTC_TIMESTAMP(6) LIMIT 100`
    );
    const [rows] = await db.query(
      `SELECT * FROM auth_service_messages
       WHERE (status='pending' AND available_at<=UTC_TIMESTAMP(6))
          OR (status='processing' AND lease_until<UTC_TIMESTAMP(6))
       ORDER BY available_at,id LIMIT 1`
    );
    const candidate = rows[0];
    if (!candidate || stopped) return false;
    const leaseToken = crypto.randomUUID();
    const [claim] = await db.query(
      `UPDATE auth_service_messages SET status='processing',lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),
         attempts=attempts+1,updated_at=UTC_TIMESTAMP(6)
       WHERE id=? AND ((status='pending' AND available_at<=UTC_TIMESTAMP(6)) OR (status='processing' AND lease_until<UTC_TIMESTAMP(6)))`,
      [leaseToken, candidate.id]
    );
    if (!claim.affectedRows) return true;
    const attempts = Number(candidate.attempts || 0) + 1;
    try {
      if (attempts > MAX_DELETE_ATTEMPTS) throw deletionError('MESSENGER_DELETE_RETRY_EXHAUSTED', true);
      const [[tenant]] = await db.query('SELECT telegram_bot_token,max_bot_token FROM ten_tenants WHERE id=? LIMIT 1', [candidate.tenant_id]);
      const token = String(candidate.provider === 'tg' ? tenant?.telegram_bot_token || '' : tenant?.max_bot_token || '').trim();
      if (!token) throw deletionError('MESSENGER_BOT_TOKEN_UNAVAILABLE', true);
      const result = candidate.provider === 'tg'
        ? await deleteTelegramMessage(token, candidate)
        : await deleteMaxMessage(token, candidate);
      await db.query(
        `UPDATE auth_service_messages SET status='deleted',deleted_at=UTC_TIMESTAMP(6),last_error_code=NULL,
           lease_token=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND lease_token=?`,
        [candidate.id, leaseToken]
      );
      console.info(JSON.stringify({ operation: 'messenger.service_cleanup', messageJobId: String(candidate.id),
        tenantId: candidate.tenant_id, provider: candidate.provider, result: result.alreadyMissing ? 'already_missing' : 'deleted', attempts }));
    } catch (error) {
      const code = safeErrorCode(error, 'MESSENGER_DELETE_FAILED');
      const dead = Boolean(error.permanent) || attempts >= MAX_DELETE_ATTEMPTS;
      const retryAfter = Math.max(Number(error.retryAfter) || 0, Math.min(300, 2 ** attempts));
      await db.query(
        `UPDATE auth_service_messages SET status=?,last_error_code=?,available_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),
           lease_token=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND lease_token=?`,
        [dead ? 'failed' : 'pending', code, retryAfter, candidate.id, leaseToken]
      );
      console.warn(JSON.stringify({ operation: 'messenger.service_cleanup', messageJobId: String(candidate.id),
        tenantId: candidate.tenant_id, provider: candidate.provider, result: dead ? 'failed' : 'retry', causeCode: code, attempts }));
    }
    return true;
  }

  function schedule(delay = WORKER_POLL_MS) {
    if (stopped) return;
    timer = setTimeout(() => {
      active = tick().then(found => schedule(found ? WORKER_POLL_MS : 1000)).catch(error => {
        const now = Date.now();
        if (now - lastWorkerErrorAt >= 60000) {
          lastWorkerErrorAt = now;
          console.error('AUTH_SERVICE_CLEANUP_WORKER_FAILED', { reason: safeErrorCode(error) });
        }
        schedule(1000);
      });
    }, delay);
    timer.unref();
  }

  return {
    start() { if (stopped) { stopped = false; schedule(0); } },
    async stop() { stopped = true; clearTimeout(timer); await active; },
  };
}

module.exports = {
  createServiceInteractionContext,
  createMessengerCleanupWorker,
  ensureBrowserOperation,
  ensureChallengeOperation,
  markCurrentOperation,
  markOperation,
  keepCurrentOperationPending,
  operationId,
  recordCurrentServiceMessage,
  recordCurrentTelegramUserServiceMessage,
  recordServiceMessage,
  resolveServiceOperation,
  runWithOperation,
};
