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
  if (chain.some(item => item.name === 'TimeoutError')) return 'TELEGRAM_API_TIMEOUT';
  const code = String(error?.code || error?.name || 'UNKNOWN');
  return /^[A-Z][A-Z0-9_]{0,79}$/i.test(code) ? code : 'UNKNOWN';
}

function networkFailure(error, signal, stage, httpStatus) {
  const chain = errorChain(error);
  const causeCode = chain.map(item => item.code).find(code => CAUSE_CODES.has(code)) || null;
  const connecting = stage === 'await_headers' && CONNECT_PHASES[causeCode];
  const timedOut = chain.some(item => item.name === 'TimeoutError')
    || (signal.aborted && signal.reason?.name === 'TimeoutError') || TIMEOUT_CODES.has(causeCode);
  return {
    classification: connecting ? 'TELEGRAM_CONNECT_FAILED' : timedOut ? 'TELEGRAM_API_TIMEOUT' : 'TELEGRAM_DELIVERY_UNKNOWN',
    // Awaiting fetch() alone cannot distinguish DNS, TCP, TLS and a lost response.
    phase: connecting || (stage === 'read_body' ? 'read_body' : causeCode === 'UND_ERR_HEADERS_TIMEOUT' ? 'await_headers' : 'unknown'),
    deliveryOutcome: connecting ? 'not_sent' : [400, 401, 403, 429].includes(httpStatus) ? 'rejected' : 'unknown',
    stage, causeCode, httpStatus, retryAfter: 0,
  };
}

function apiFailure(httpStatus, data) {
  const apiCode = Number.isInteger(data?.error_code) ? data.error_code : httpStatus;
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
  let stage = 'await_headers';
  let httpStatus = null;
  let diagnostic;
  try {
    const response = await fetch(`${apiBase}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    httpStatus = response.status;
    stage = 'read_body';
    let data;
    try {
      data = await response.json();
    } catch (error) {
      // A non-JSON HTTP rejection is still an HTTP error, not a successful send.
      if (!response.ok && error.name === 'SyntaxError' && !signal.aborted) data = null;
      else throw error;
    }
    if (!response.ok || data?.ok === false) {
      diagnostic = apiFailure(httpStatus, data);
      throw deliveryError(diagnostic);
    }
    if (data?.ok !== true || (method === 'sendMessage' && !Number.isInteger(data.result?.message_id))) {
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
