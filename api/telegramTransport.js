'use strict';

const https = require('https');
const { Readable } = require('stream');

const TELEGRAM_HOSTNAME = 'api.telegram.org';
const DEFAULT_CONNECT_TIMEOUT_MS = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

const FALLBACK_CODES = new Set([
  'ENOTFOUND', 'ENOENT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
]);
const SAFE_CODES = new Set([
  ...FALLBACK_CODES, 'EPIPE', 'UND_ERR_SOCKET', 'ABORT_ERR',
  'TELEGRAM_RESPONSE_TOO_LARGE', 'TELEGRAM_REDIRECT_REJECTED',
  'TELEGRAM_URL_INVALID', 'TELEGRAM_REQUEST_INVALID',
]);

class TelegramTransportError extends Error {
  constructor({ code, classification, phase, deliveryOutcome, family, name = 'Error' }) {
    super(classification);
    this.name = name;
    this.code = code;
    this.classification = classification;
    this.phase = phase;
    this.deliveryOutcome = deliveryOutcome;
    this.family = family;
  }
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function safeError(error, { family, secureConnected, phase, code, externalAbort = false }) {
  const causeCode = code || (SAFE_CODES.has(error?.code) ? error.code : null);
  const timedOut = causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT'
    || error?.name === 'TimeoutError';
  const connecting = !secureConnected && phase === 'connect';
  const classification = connecting
    ? 'TELEGRAM_CONNECT_FAILED'
    : timedOut ? 'TELEGRAM_API_TIMEOUT' : 'TELEGRAM_DELIVERY_UNKNOWN';
  const name = externalAbort
    ? (error?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError')
    : timedOut ? 'TimeoutError' : 'Error';
  return new TelegramTransportError({
    code: causeCode || (externalAbort ? 'ABORT_ERR' : 'UND_ERR_SOCKET'),
    classification,
    phase: connecting ? 'connect' : phase,
    deliveryOutcome: secureConnected ? 'unknown' : 'not_sent',
    family,
    name,
  });
}

function validateUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(String(input));
  } catch (_) {
    throw new TelegramTransportError({
      code: 'TELEGRAM_URL_INVALID', classification: 'TELEGRAM_DELIVERY_UNKNOWN',
      phase: 'prepare_request', deliveryOutcome: 'not_sent', family: 0,
    });
  }
  if (url.protocol !== 'https:' || url.hostname !== TELEGRAM_HOSTNAME || url.username || url.password) {
    throw new TelegramTransportError({
      code: 'TELEGRAM_URL_INVALID', classification: 'TELEGRAM_DELIVERY_UNKNOWN',
      phase: 'prepare_request', deliveryOutcome: 'not_sent', family: 0,
    });
  }
  return url;
}

function bufferedResponse(statusCode, headers, buffer) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers,
    body: Readable.from(buffer.length ? [buffer] : []),
    async json() { return JSON.parse(buffer.toString('utf8')); },
    async text() { return buffer.toString('utf8'); },
  };
}

function streamingResponse(statusCode, headers, stream) {
  let consumed = false;
  async function consume() {
    if (consumed) throw new TypeError('Body is unusable');
    consumed = true;
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers,
    body: stream,
    async json() { return JSON.parse((await consume()).toString('utf8')); },
    async text() { return (await consume()).toString('utf8'); },
  };
}

function createTelegramTransport(dependencies = {}) {
  const request = dependencies.request || https.request;
  const createAgent = dependencies.createAgent || (options => new https.Agent(options));
  const now = dependencies.now || Date.now;
  const schedule = dependencies.setTimeout || setTimeout;
  const cancel = dependencies.clearTimeout || clearTimeout;
  const agentOptions = {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 32,
    maxFreeSockets: 8,
    scheduling: 'lifo',
  };
  const agents = {
    6: createAgent({ ...agentOptions, family: 6 }),
    4: createAgent({ ...agentOptions, family: 4 }),
  };

  function attempt(url, options, family, deadline) {
    return new Promise((resolve, reject) => {
      const connectTimeoutMs = positiveInteger(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);
      const maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
      const remainingMs = Math.max(1, deadline - now());
      let settled = false;
      let secureConnected = false;
      let responseStarted = false;
      let streaming = false;
      let connectTimer;
      let requestTimer;
      let requestObject;
      let responseStream;

      const cleanup = () => {
        cancel(connectTimer);
        cancel(requestTimer);
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
      };
      const fail = (error, phase, details = {}) => {
        const transportError = safeError(error, {
          family, secureConnected, phase,
          code: details.code,
          externalAbort: details.externalAbort,
        });
        if (settled) {
          if (streaming && responseStream && !responseStream.destroyed) {
            cleanup();
            responseStream.destroy(transportError);
          }
          return;
        }
        settled = true;
        cleanup();
        if (responseStream && !responseStream.destroyed) responseStream.destroy();
        if (requestObject && !requestObject.destroyed) requestObject.destroy();
        reject(transportError);
      };
      const onAbort = () => fail(options.signal.reason, secureConnected ? 'request' : 'connect', { externalAbort: true });

      if (options.signal?.aborted) {
        onAbort();
        return;
      }
      if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true });

      requestTimer = schedule(() => fail(
        Object.assign(new Error('request deadline exceeded'), { code: 'ETIMEDOUT', name: 'TimeoutError' }),
        secureConnected ? 'request' : 'connect',
        { code: secureConnected ? 'ETIMEDOUT' : 'UND_ERR_CONNECT_TIMEOUT' }
      ), remainingMs);

      connectTimer = schedule(() => fail(
        Object.assign(new Error('connect deadline exceeded'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
        'connect', { code: 'UND_ERR_CONNECT_TIMEOUT' }
      ), Math.min(connectTimeoutMs, remainingMs));

      try {
        requestObject = request(url, {
          method: options.method || 'GET',
          headers: options.headers,
          agent: agents[family],
        }, (response) => {
          if (settled) {
            response.destroy();
            return;
          }
          responseStarted = true;
          secureConnected = true;
          responseStream = response;
          cancel(connectTimer);
          const statusCode = Number(response.statusCode) || 0;
          if (options.redirect === 'error' && statusCode >= 300 && statusCode < 400) {
            fail(null, 'response', { code: 'TELEGRAM_REDIRECT_REJECTED' });
            return;
          }
          if (options.responseType === 'stream') {
            streaming = true;
            response.once('end', cleanup);
            response.once('close', cleanup);
            settled = true;
            resolve(streamingResponse(statusCode, response.headers, response));
            return;
          }
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            if (settled) return;
            size += chunk.length;
            if (size > maxResponseBytes) {
              fail(null, 'read_body', { code: 'TELEGRAM_RESPONSE_TOO_LARGE' });
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          response.once('end', () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(bufferedResponse(statusCode, response.headers, Buffer.concat(chunks)));
          });
          response.once('error', error => fail(error, 'read_body'));
        });
      } catch (error) {
        fail(error, 'prepare_request');
        return;
      }

      requestObject.once('socket', (socket) => {
        if (socket.encrypted && !socket.connecting) {
          secureConnected = true;
          cancel(connectTimer);
          return;
        }
        socket.once('secureConnect', () => {
          secureConnected = true;
          cancel(connectTimer);
        });
      });
      requestObject.once('error', error => fail(error, responseStarted ? 'response' : secureConnected ? 'request' : 'connect'));
      requestObject.end(options.body);
    });
  }

  async function fetchTelegram(input, options = {}) {
    const url = validateUrl(input);
    const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const deadline = now() + requestTimeoutMs;
    try {
      return await attempt(url, options, 6, deadline);
    } catch (error) {
      const canFallback = !options.signal?.aborted
        && error.deliveryOutcome === 'not_sent'
        && error.phase === 'connect'
        && FALLBACK_CODES.has(error.code)
        && now() < deadline;
      if (!canFallback) throw error;
      return attempt(url, options, 4, deadline);
    }
  }

  function close() {
    agents[6].destroy();
    agents[4].destroy();
  }

  return { fetchTelegram, close, agents };
}

const proxyUrl = String(process.env.TELEGRAM_HTTPS_PROXY || '').trim();
let proxyOptions;
if (proxyUrl) {
  const parsed = new URL(proxyUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('TELEGRAM_PROXY_PROTOCOL_INVALID');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  proxyOptions = { createAgent: options => {
    const { family, ...agentOptions } = options;
    return new HttpsProxyAgent(parsed, agentOptions);
  } };
}
const defaultTransport = createTelegramTransport(proxyOptions);

module.exports = {
  fetchTelegram: defaultTransport.fetchTelegram,
  closeTelegramTransport: defaultTransport.close,
  createTelegramTransport,
  TelegramTransportError,
};
