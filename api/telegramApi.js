'use strict';

// Shared HTTP boundary for message delivery, not webhook registration or polling.
const CLASSIFICATIONS = new Set([
  'TELEGRAM_API_TIMEOUT', 'TELEGRAM_CONNECT_FAILED', 'TELEGRAM_RATE_LIMITED',
  'TELEGRAM_API_REJECTED', 'TELEGRAM_DELIVERY_UNKNOWN',
]);
const CONNECT_PHASES = Object.freeze({
  ENOTFOUND: 'dns', EAI_AGAIN: 'dns',
  ECONNREFUSED: 'tcp_connect', ENETUNREACH: 'tcp_connect', EHOSTUNREACH: 'tcp_connect',
  // Undici's connection deadline can include TLS; it does not prove a TCP failure.
  UND_ERR_CONNECT_TIMEOUT: 'connect',
  CERT_HAS_EXPIRED: 'tls', DEPTH_ZERO_SELF_SIGNED_CERT: 'tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls', ERR_TLS_CERT_ALTNAME_INVALID: 'tls',
});
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const CAUSE_CODES = new Set([...Object.keys(CONNECT_PHASES), ...TIMEOUT_CODES, 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']);
const SAFE_REASONS = new Set([...CLASSIFICATIONS, ...CAUSE_CODES,
  'TELEGRAM_CHAT_UNAVAILABLE', 'TELEGRAM_TOKEN_REJECTED', 'TELEGRAM_BOT_BLOCKED', 'TELEGRAM_DELIVERY_FAILED',
  'TELEGRAM_BOT_START_REQUIRED', 'CODE_DELIVERY_FAILED', 'WEBHOOK_IN_PROGRESS', 'BOT_SCOPE_MISMATCH',
  'INVALID_BOT_SCOPE', 'TENANT_BOT_UNAVAILABLE', 'BOT_TENANT_CONFLICT', 'AUTH_WEBHOOK_SECRET_REQUIRED',
  'AUTH_CODE_PEPPER_REQUIRED', 'BROWSER_CONTACT_MIGRATION_REQUIRED', 'INVALID_ACCOUNT_SCOPE',
  'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT',
  'ER_ACCESS_DENIED_ERROR', 'ER_CON_COUNT_ERROR', 'PROTOCOL_CONNECTION_LOST',
]);
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError', 'TimeoutError']);

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function errorChain(error) {
  const chain = [];
  for (let current = error; current && chain.length < 5 && !chain.includes(current); current = current.cause) chain.push(current);
  return chain;
}

function telegramErrorReason(error) {
  const chain = errorChain(error);
  const classified = chain.find(item => CLASSIFICATIONS.has(item.classification));
  if (classified) return classified.classification;
  // Only the HTTP boundary can attribute a timeout to Telegram (a DB can time out too).
  if (SAFE_REASONS.has(error?.code)) return error.code;
  return SAFE_ERROR_NAMES.has(error?.name) ? error.name : 'UNKNOWN';
}

function networkFailure(error, signal, stage, httpStatus) {
  const chain = errorChain(error);
  const causeCode = chain.map(item => item.code).find(code => CAUSE_CODES.has(code)) || null;
  const connecting = stage === 'await_headers' && CONNECT_PHASES[causeCode];
  const deadlineAbort = signal.aborted && signal.reason?.name === 'TimeoutError'
    && chain.some(item => item.name === 'AbortError' || item.code === 'ABORT_ERR');
  const timedOut = chain.some(item => item.name === 'TimeoutError')
    || deadlineAbort || TIMEOUT_CODES.has(causeCode);
  return {
    classification: connecting ? 'TELEGRAM_CONNECT_FAILED' : timedOut ? 'TELEGRAM_API_TIMEOUT' : 'TELEGRAM_DELIVERY_UNKNOWN',
    // Awaiting fetch() alone cannot distinguish DNS, TCP, TLS and a lost response.
    phase: connecting || (stage === 'prepare_request' || stage === 'read_body' ? stage : causeCode === 'UND_ERR_HEADERS_TIMEOUT' ? 'await_headers' : 'unknown'),
    deliveryOutcome: connecting || stage === 'prepare_request' ? 'not_sent' : [400, 401, 403, 429].includes(httpStatus) ? 'rejected' : 'unknown',
    stage, causeCode, httpStatus, retryAfter: 0,
  };
}

function apiFailure(httpStatus, data) {
  // A conflicting body must not turn an HTTP 5xx into a definitive rejection/429.
  const apiCode = httpStatus >= 400 ? httpStatus : Number.isInteger(data?.error_code) ? data.error_code : httpStatus;
  const rateLimited = apiCode === 429 || httpStatus === 429;
  const rejected = [400, 401, 403, 429].includes(apiCode) || [400, 401, 403, 429].includes(httpStatus);
  return {
    classification: rateLimited ? 'TELEGRAM_RATE_LIMITED' : 'TELEGRAM_API_REJECTED',
    phase: 'http', stage: 'response', httpStatus, telegramErrorCode: apiCode,
    deliveryOutcome: rejected ? 'rejected' : 'unknown',
    causeCode: null,
    retryAfter: Number.isSafeInteger(data?.parameters?.retry_after) && data.parameters.retry_after > 0
      ? data.parameters.retry_after : 0,
  };
}

function deliveryError(diagnostic) {
  // Existing notification callers use these semantic codes to revoke unreachable contacts.
  const rejectionCode = ({ 400: 'TELEGRAM_CHAT_UNAVAILABLE', 401: 'TELEGRAM_TOKEN_REJECTED',
    403: 'TELEGRAM_BOT_BLOCKED', 429: 'TELEGRAM_RATE_LIMITED' })[
    diagnostic.httpStatus >= 400 ? diagnostic.httpStatus : diagnostic.telegramErrorCode];
  const code = rejectionCode || (diagnostic.classification === 'TELEGRAM_API_REJECTED'
    ? 'TELEGRAM_DELIVERY_FAILED' : diagnostic.classification);
  // Never retain raw fetch errors, response descriptions, URLs or request bodies.
  return Object.assign(new Error(code), { code, ...diagnostic });
}

async function requestTelegramApi(apiBase, method, body, options = {}) {
  if (!['sendMessage', 'answerCallbackQuery'].includes(method)) throw new Error('TELEGRAM_METHOD_NOT_SUPPORTED');
  const signal = options.signal || AbortSignal.timeout(10000);
  const startedAtMonoMs = nowMs();
  let stage = 'prepare_request';
  let httpStatus = null;
  let diagnostic;
  try {
    signal.throwIfAborted();
    const encodedBody = JSON.stringify(body);
    stage = 'await_headers';
    const response = await fetch(`${apiBase}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: encodedBody, signal,
    });
    httpStatus = response.status;
    stage = 'read_body';
    let data;
    try {
      data = await response.json();
    } catch (error) {
      // A non-JSON HTTP rejection is still an HTTP error, not a successful send.
      if (!response.ok && error.name === 'SyntaxError') data = null;
      else throw error;
    }
    if (!response.ok || data?.ok === false) {
      diagnostic = apiFailure(httpStatus, data);
      throw deliveryError(diagnostic);
    }
    const validResult = method === 'answerCallbackQuery' ? data?.result === true
      : Number.isSafeInteger(data?.result?.message_id) && data.result.message_id >= 0;
    if (data?.ok !== true || !validResult) {
      diagnostic = { classification: 'TELEGRAM_DELIVERY_UNKNOWN', phase: 'read_body', stage,
        deliveryOutcome: 'unknown', httpStatus, causeCode: null, retryAfter: 0 };
      throw deliveryError(diagnostic);
    }
    diagnostic = { classification: null, phase: 'complete', stage: 'response',
      deliveryOutcome: 'confirmed', httpStatus, causeCode: null, retryAfter: 0 };
    return data;
  } catch (error) {
    if (!diagnostic) diagnostic = networkFailure(error, signal, stage, httpStatus);
    throw deliveryError(diagnostic);
  } finally {
    if (typeof options.onTiming === 'function') {
      try {
        options.onTiming(nowMs() - startedAtMonoMs, { method, startedAtMonoMs, ...diagnostic });
      } catch (_) { /* Diagnostics must not alter delivery semantics. */ }
    }
  }
}

module.exports = { requestTelegramApi, telegramErrorReason };
