'use strict';

// Explicitly scoped mock checks: no .env, DB, bot, server or listening port.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const realFetch = global.fetch;
global.fetch = async () => { throw new Error('TEST_NETWORK_FORBIDDEN'); };
after(() => { global.fetch = realFetch; });

const { requestTelegramApi, telegramErrorReason } = require('../api/telegramApi');
const { processUpdate, sendMessage } = require('../api/telegramBot');
const { handleTenantTelegramUpdate } = require('../api/tenantTelegramBot');
const API = 'https://api.telegram.org/botTEST_ONLY_NOT_A_TOKEN';
const fixtureText = 'TEST_ONLY_MESSAGE_CONTENT';

function isolatedModule(relative, overrides, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const originalRequire = createRequire(filename);
  const loaded = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: loaded, exports: loaded.exports, console, Buffer, process,
    AbortController, AbortSignal, DOMException, setTimeout, clearTimeout,
    fetch: (...args) => global.fetch(...args),
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!['crypto', 'util', './telegramApi'].includes(name)) throw new Error(`TEST_IMPORT_FORBIDDEN: ${name}`);
      return originalRequire(name);
    },
    ...globals,
  }, { filename });
  return loaded.exports;
}

const cleanupCalls = [];
const auth = isolatedModule('api/messengerAuth.js', {
  './helpers/employeeCustomer': { ensureEmployeeCustomer() { throw new Error('TEST_DOMAIN_NOT_MOCKED'); } },
  './messengerCleanup': {
    operationId: () => 'test-operation',
    markOperation: async (...args) => { cleanupCalls.push(args); },
  },
});
const delivery = isolatedModule('api/messengerDelivery.js', {
  '../data/system-settings': {}, './maxIntegration': {}, './messengerAuth': auth, './messengerCleanup': {},
});

function telegramResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function success() {
  // Message's required fields and Boolean callback results follow core.telegram.org/bots/api.
  return telegramResponse({ ok: true, result: { message_id: 71, date: 1700000000, chat: { id: 42, type: 'private' } } });
}

function emptyTenantDb(tenantId = 1) {
  const queries = [];
  return {
    queries,
    async query(sql, values) {
      assert.ok(sql.includes('WHERE tenant_id=?'));
      assert.equal(values[0], tenantId);
      assert.ok(sql.includes('cust_customer_auth_tokens') || sql.includes('cust_customers'));
      queries.push(sql);
      return [[]];
    },
  };
}

const startUpdate = (text = '/start') => ({ update_id: 99,
  message: { text, chat: { id: 42, type: 'private' }, from: { id: 42 } } });
const bot = { tenantId: 1, token: 'TEST_ONLY_NOT_A_TOKEN' };

test('tenant /start sends exactly one contact keyboard after scoped reads', async t => {
  const db = emptyTenantDb();
  const timings = [];
  let calls = 0;
  t.mock.method(global, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, `${API}/sendMessage`);
    const body = JSON.parse(options.body);
    assert.equal(body.reply_markup.keyboard[0][0].request_contact, true);
    assert.equal(body.reply_markup.one_time_keyboard, true);
    assert.ok(db.queries.some(sql => sql.includes('FROM cust_customers')));
    return success();
  });
  await handleTenantTelegramUpdate(db, {}, bot, startUpdate(), { onTelegramApiTiming: (...args) => timings.push(args) });
  assert.equal(calls, 1);
  assert.equal(timings.length, 1);
  assert.equal(timings[0][1].method, 'sendMessage');
  assert.equal(timings[0][1].deliveryOutcome, 'confirmed');
});

test('system /start no longer treats the final t as a payload', async t => {
  const queries = [];
  const db = { query: async sql => { queries.push(sql); return [[]]; } };
  let calls = 0;
  t.mock.method(global, 'fetch', async (_, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).reply_markup.keyboard[0][0].request_contact, true);
    return success();
  });
  await processUpdate(db, API, startUpdate(), { onAuthLink: async () => ({ ok: false }) });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^INSERT INTO ten_telegram_pending/);
  assert.equal(calls, 1);
});

test('tenant /start lookup scope stays isolated for equal Telegram users and updates', async t => {
  t.mock.method(global, 'fetch', async () => success());
  for (const tenantId of [1, 2]) {
    const db = emptyTenantDb(tenantId);
    await handleTenantTelegramUpdate(db, {}, { ...bot, tenantId }, startUpdate());
    assert.ok(db.queries.some(sql => sql.includes('FROM cust_customers')));
  }
});

test('system /start@bot login takes the contact path, not a DB token lookup', async t => {
  const db = { query: async () => { throw new Error('UNEXPECTED_TOKEN_LOOKUP'); } };
  let calls = 0;
  t.mock.method(global, 'fetch', async () => { calls++; return success(); });
  await processUpdate(db, API, startUpdate('/start@test_bot login'), { onAuthLink: async () => ({ ok: false }) });
  await processUpdate(db, API, startUpdate('/starting'), { onAuthLink: async () => ({ ok: false }) });
  assert.equal(calls, 1);
});

test('default 10-second deadline is enforced and leaves delivery unknown', { timeout: 15000 }, async t => {
  let timings;
  t.mock.method(global, 'fetch', async (_, { signal }) => {
    await delay(15000, null, { signal });
    throw new Error('DEADLINE_WAS_NOT_ENFORCED');
  });
  const started = Date.now();
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}, {
    onTiming: (duration, details) => { timings = { duration, ...details }; },
  }), error => error.code === 'TELEGRAM_API_TIMEOUT' && error.phase === 'unknown' && error.deliveryOutcome === 'unknown');
  assert.ok(Date.now() - started >= 9900);
  assert.ok(timings.duration >= 9900 && timings.duration < 14000);
  assert.equal(timings.classification, 'TELEGRAM_API_TIMEOUT');
});

for (const [causeCode, phase] of [['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'],
  ['ECONNREFUSED', 'tcp_connect'], ['UND_ERR_CONNECT_TIMEOUT', 'connect'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls']]) {
  test(`explicit ${causeCode} is classified using transport evidence`, async t => {
    t.mock.method(global, 'fetch', async () => { throw new TypeError('sensitive URL must be discarded', { cause: { code: causeCode } }); });
    await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), error =>
      error.classification === 'TELEGRAM_CONNECT_FAILED' && error.phase === phase
      && error.causeCode === causeCode && error.deliveryOutcome === 'not_sent');
  });
}

for (const status of [400, 401, 403, 429, 500, 502, 503]) {
  test(`HTTP ${status} keeps legacy semantics and explicit delivery outcome`, async t => {
    t.mock.method(global, 'fetch', async () => telegramResponse({
      ok: false, error_code: status, description: fixtureText,
      ...(status === 429 ? { parameters: { retry_after: 17 } } : {}),
    }, status));
    await assert.rejects(delivery.sendTelegramText('TEST_ONLY_NOT_A_TOKEN', '42', fixtureText), error => {
      assert.equal(error.classification, status === 429 ? 'TELEGRAM_RATE_LIMITED' : 'TELEGRAM_API_REJECTED');
      assert.equal(error.deliveryOutcome, status >= 500 ? 'unknown' : 'rejected');
      assert.equal(error.code, ({ 400: 'TELEGRAM_CHAT_UNAVAILABLE', 401: 'TELEGRAM_TOKEN_REJECTED',
        403: 'TELEGRAM_BOT_BLOCKED', 429: 'TELEGRAM_RATE_LIMITED' })[status] || 'TELEGRAM_DELIVERY_FAILED');
      assert.equal(error.httpStatus, status);
      assert.equal(error.retryAfter, status === 429 ? 17 : 0);
      assert.ok(!error.message.includes(fixtureText));
      return true;
    });
  });
}

test('body timeout is not swallowed as TELEGRAM_DELIVERY_FAILED', async t => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200,
    json: async () => { throw new DOMException('fixture body timeout', 'TimeoutError'); } }));
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), error =>
    error.classification === 'TELEGRAM_API_TIMEOUT' && error.phase === 'read_body' && error.deliveryOutcome === 'unknown');
});

test('lost response and invalid success body are not proof of failed delivery', async t => {
  t.mock.method(global, 'fetch', async () => { throw Object.assign(new Error(fixtureText), { code: 'ECONNRESET' }); });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), { classification: 'TELEGRAM_DELIVERY_UNKNOWN', deliveryOutcome: 'unknown' });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), { classification: 'TELEGRAM_DELIVERY_UNKNOWN' });
});

test('non-JSON HTTP errors preserve rejection; body deadlines preserve known HTTP status', async t => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 401,
    json: async () => { throw new SyntaxError('fixture non-JSON error'); } }));
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), {
    classification: 'TELEGRAM_API_REJECTED', code: 'TELEGRAM_TOKEN_REJECTED', deliveryOutcome: 'rejected',
  });
  for (const [status, code] of [[400, 'TELEGRAM_CHAT_UNAVAILABLE'], [401, 'TELEGRAM_TOKEN_REJECTED'],
    [403, 'TELEGRAM_BOT_BLOCKED'], [429, 'TELEGRAM_RATE_LIMITED']]) {
    global.fetch = async () => ({ ok: false, status,
      json: async () => { throw new DOMException('fixture timeout', 'TimeoutError'); } });
    await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), {
      classification: 'TELEGRAM_API_TIMEOUT', code, phase: 'read_body', httpStatus: status, deliveryOutcome: 'rejected',
    });
  }
});

test('pre-aborted callers do not invoke fetch and have a known not-sent outcome', async t => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = t.mock.method(global, 'fetch', async (_, { signal }) => { throw signal.reason; });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}, { signal: controller.signal }), {
    classification: 'TELEGRAM_DELIVERY_UNKNOWN', phase: 'prepare_request', deliveryOutcome: 'not_sent',
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('raw fetch errors, cause codes and descriptions cannot expose fixtures in diagnostics', async t => {
  let details;
  t.mock.method(global, 'fetch', async () => { throw new Error(`${API}/${fixtureText}`, { cause: { code: fixtureText } }); });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', { text: fixtureText }, {
    onTiming: (_, value) => { details = value; },
  }), error => {
    const serialized = JSON.stringify(error) + error.stack;
    assert.ok(!serialized.includes('TEST_ONLY'));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.ok(!JSON.stringify(details).includes('TEST_ONLY'));
  assert.equal(details.causeCode, null);
  assert.equal(telegramErrorReason(new DOMException('fixture', 'TimeoutError')), 'TimeoutError');
  assert.equal(telegramErrorReason({ code: 'CODE_DELIVERY_FAILED', cause: { classification: 'TELEGRAM_API_TIMEOUT' } }), 'TELEGRAM_API_TIMEOUT');
});

test('legacy full response and messenger result shapes are preserved; timing cannot break a send', async t => {
  t.mock.method(global, 'fetch', async () => success());
  const data = await sendMessage(API, '42', fixtureText, null, () => { throw new Error('TEST_METRIC_FAILURE'); });
  assert.equal(data.ok, true);
  assert.equal(data.result.message_id, 71);
  const message = await delivery.sendTelegramText('TEST_ONLY_NOT_A_TOKEN', '42', fixtureText);
  assert.equal(message.message_id, 71);
});

test('browser callback still authenticates before answering and uses both measured API calls', async t => {
  const calls = [];
  const timings = [];
  let confirmed = false;
  t.mock.method(global, 'fetch', async url => {
    assert.equal(confirmed, true);
    calls.push(url.split('/').pop());
    return url.endsWith('/answerCallbackQuery')
      ? telegramResponse({ ok: true, result: true }) : success();
  });
  await handleTenantTelegramUpdate({}, {}, bot, { callback_query: {
    id: 'test-callback', data: `auth:b_${'a'.repeat(40)}`, from: { id: 42 }, message: { chat: { id: 42, type: 'private' } },
  } }, { onBrowserAuth: async () => { confirmed = true; return { ok: true }; },
    onTelegramApiTiming: (_, details) => timings.push(details.method) });
  assert.deepEqual(calls, ['answerCallbackQuery', 'sendMessage']);
  assert.deepEqual(timings, calls);
});

// Models the CURRENT advisory-lock SQL contract; this is not an inbox/outbox implementation.
function eventDatabase({ lockAcquired = true } = {}) {
  const rows = new Map();
  const locks = new Map();
  const state = { rows, commits: 0, releases: 0, queries: [] };
  return {
    state,
    async getConnection() {
      let unlock;
      return {
        async beginTransaction() {},
        async commit() { state.commits++; },
        async rollback() {},
        release() { state.releases++; },
        async query(raw, values = []) {
          const sql = raw.replace(/\s+/g, ' ').trim();
          state.queries.push(sql);
          if (sql.startsWith('SELECT GET_LOCK')) {
            if (!lockAcquired) return [[{ acquired: 0 }]];
            const previous = locks.get(values[0]) || Promise.resolve();
            const held = new Promise(resolve => { unlock = resolve; });
            locks.set(values[0], previous.then(() => held));
            await previous;
            return [[{ acquired: 1 }]];
          }
          if (sql.startsWith('SELECT RELEASE_LOCK')) { unlock(); return [[]]; }
          const key = values.join(':');
          if (sql.startsWith('SELECT status FROM auth_webhook_events')) return [rows.has(key) ? [{ status: rows.get(key) }] : []];
          if (sql.startsWith('INSERT INTO auth_webhook_events')) { assert.ok(!rows.has(key)); rows.set(key, 'processing'); return [{}]; }
          if (sql.startsWith('UPDATE auth_webhook_events')) { rows.set(key, 'done'); return [{}]; }
          if (sql.startsWith('DELETE FROM auth_webhook_events')) { if (rows.get(key) === 'processing') rows.delete(key); return [{}]; }
          throw new Error('TEST_UNEXPECTED_QUERY');
        },
      };
    },
  };
}

test('six successful duplicate updates dispatch once under the existing done contract', async () => {
  const db = eventDatabase();
  let calls = 0;
  for (let i = 0; i < 6; i++) {
    const result = await auth.processWebhookEvent(db, 'tg', { update_id: 99 }, async () => { calls++; }, 'tenant-1');
    assert.equal(result.duplicate, i > 0);
  }
  assert.equal(calls, 1);
  assert.equal(db.state.releases, 6);
});

test('concurrent duplicates are serialized by the existing advisory-lock contract', async () => {
  const db = eventDatabase();
  let calls = 0;
  const handler = async () => { calls++; await delay(10); };
  const results = await Promise.all([1, 2].map(() => auth.processWebhookEvent(db, 'tg', { update_id: 99 }, handler, 'tenant-1')));
  assert.equal(calls, 1);
  assert.equal(results.filter(item => item.duplicate).length, 1);
});

test('CURRENT LIMITATION: five API failures allow six handler executions for one update', async t => {
  const db = eventDatabase();
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    if (++calls <= 5) throw new DOMException('fixture timeout', 'TimeoutError');
    return success();
  });
  const run = () => auth.processWebhookEvent(db, 'tg', { update_id: 99 },
    () => requestTelegramApi(API, 'sendMessage', {}), 'tenant-1');
  for (let i = 0; i < 5; i++) {
    await assert.rejects(run(), { classification: 'TELEGRAM_API_TIMEOUT' });
    assert.equal(db.state.rows.size, 0);
  }
  assert.equal((await run()).duplicate, false);
  assert.equal(calls, 6);
  assert.equal((await run()).duplicate, true);
});

test('CURRENT LIMITATION: generic handler commit permits re-entry, not proof of a repeated auth grant', async () => {
  const db = eventDatabase();
  const handler = async eventDb => {
    const conn = await eventDb.getConnection();
    await conn.beginTransaction();
    await conn.commit();
    throw Object.assign(new Error('fixture delivery failure'), { code: 'TELEGRAM_API_TIMEOUT' });
  };
  for (let i = 0; i < 2; i++) await assert.rejects(auth.processWebhookEvent(db, 'tg', { update_id: 99 }, handler));
  assert.equal(db.state.commits, 2);
  assert.equal(db.state.rows.size, 0);
});

test('CURRENT LIMITATION: interrupted processing marker is re-entered, not a durable inbox', async () => {
  const db = eventDatabase();
  const key = crypto.createHash('sha256').update('tenant-1::99').digest('hex');
  db.state.rows.set(`tg:${key}`, 'processing');
  let calls = 0;
  const result = await auth.processWebhookEvent(db, 'tg', { update_id: 99 }, async () => { calls++; }, 'tenant-1');
  assert.equal(result.duplicate, false);
  assert.equal(calls, 1);
  assert.equal(db.state.rows.get(`tg:${key}`), 'done');
});

test('database unavailable never dispatches domain code or a Telegram send', async () => {
  let called = false;
  const db = { getConnection: async () => { throw Object.assign(new Error('fixture DB down'), { code: 'ECONNREFUSED' }); } };
  await assert.rejects(auth.processWebhookEvent(db, 'tg', { update_id: 99 }, async () => { called = true; }), { code: 'ECONNREFUSED' });
  assert.equal(called, false);
});

test('equal update IDs in distinct namespaces do not suppress each other', async () => {
  const db = eventDatabase();
  let calls = 0;
  for (const namespace of ['tenant-1', 'tenant-2', 'tenant-1', 'tenant-2']) {
    await auth.processWebhookEvent(db, 'tg', { update_id: 99 }, async () => { calls++; }, namespace);
  }
  assert.equal(calls, 2);
  assert.equal(db.state.rows.size, 2);
});

test('expired OTP is rejected before verification, consumption or auth callback', async () => {
  let rolledBack = false;
  let released = false;
  let verified = false;
  const conn = { beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release: () => { released = true; },
    query: async (sql, values) => {
      assert.match(sql, /WHERE public_id=\? AND tenant_id=\? AND account_type=\? AND account_id=\? AND purpose=\?/);
      assert.deepEqual(Array.from(values), ['fixture-request', 1, 'customer', 7, 'login']);
      return [[{ delivery_status: 'sent', expires_valid: 0 }]];
    } };
  await assert.rejects(auth.verifyCodeChallenge({ getConnection: async () => conn }, {
    tenantId: 1, accountType: 'customer', accountId: 7, purpose: 'login', requestId: 'fixture-request', code: '0000',
    onVerified: async () => { verified = true; },
  }), { code: 'CODE_EXPIRED' });
  assert.equal(verified, false);
  assert.equal(rolledBack, true);
  assert.equal(released, true);
  assert.equal(cleanupCalls.at(-1)[2], 'expired');
});

function webhookTimingFixture(update, { ingressMonoMs = 100, now = () => 1000 } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const start = source.indexOf('function telegramUpdateType(');
  const end = source.indexOf('async function measureWebhookStage(', start);
  assert.ok(start > 0 && end > start);
  const logs = [];
  const context = { crypto, db: {}, nowMs: now,
    console: { info: (...args) => logs.push(args) } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const req = { _telegramWebhookIngressMonoMs: ingressMonoMs, _telegramWebhookIngressWallMs: 1700000000000 };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = true;
  const timing = context.beginTelegramWebhookTiming(req, res, update, 1);
  return { timing, res, logs };
}

test('request timing correlates safe event hash and tenant with time before/after API', () => {
  const { timing, res, logs } = webhookTimingFixture(startUpdate(`/start ${fixtureText}`));
  timing.addTelegramApi(20, { startedAtMonoMs: 170, method: 'sendMessage', stage: 'response', phase: 'complete',
    classification: null, deliveryOutcome: 'confirmed', httpStatus: 200, causeCode: null, retryAfter: 0 });
  res.emit('finish');
  res.emit('close');
  assert.equal(logs.length, 2);
  const apiLog = JSON.parse(logs[0][1]);
  const summary = logs[1][1];
  assert.equal(apiLog.startMs, 70);
  assert.equal(apiLog.endMs, 90);
  assert.equal(apiLog.eventId, crypto.createHash('sha256').update('tg:1:99').digest('hex').slice(0, 16));
  assert.equal(summary.telegramApiFirstStartMs, 70);
  assert.equal(summary.telegramApiLastEndMs, 90);
  assert.equal(summary.eventId, apiLog.eventId);
  assert.equal(apiLog.tenantId, 1);
  assert.ok(!JSON.stringify(logs).includes('TEST_ONLY'));
});

// Regression checks use native Response/JSON parsing, not a mock of response.json().
for (const messageId of [0, 71, 2147483647]) {
  test(`sendMessage preserves valid message_id ${messageId}`, async t => {
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: true,
      result: { message_id: messageId, date: 1700000000, chat: { id: -42, type: 'group' } } }));
    const data = await requestTelegramApi(API, 'sendMessage', { chat_id: -42, text: fixtureText });
    assert.equal(data.result.message_id, messageId);
    assert.equal(data.result.chat.id, -42);
  });
}

for (const [label, messageId] of [['negative', -1], ['unsafe integer', 2 ** 53], ['fractional', 1.5], ['string', '71'], ['missing', undefined]]) {
  test(`sendMessage does not confirm a ${label} message_id`, async t => {
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: true, result: { message_id: messageId } }));
    await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), { classification: 'TELEGRAM_DELIVERY_UNKNOWN' });
  });
}

test('answerCallbackQuery accepts its documented Boolean true result', async t => {
  t.mock.method(global, 'fetch', async () => telegramResponse({ ok: true, result: true }));
  const data = await requestTelegramApi(API, 'answerCallbackQuery', { callback_query_id: 'fixture-callback' });
  assert.equal(data.result, true);
});

for (const [label, result] of [['missing', undefined], ['false', false], ['null', null], ['Message', { message_id: 71 }], ['string', 'true']]) {
  test(`answerCallbackQuery does not confirm a ${label} result`, async t => {
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: true, result }));
    await assert.rejects(requestTelegramApi(API, 'answerCallbackQuery', {}), { classification: 'TELEGRAM_DELIVERY_UNKNOWN' });
  });
}

test('5xx cannot be downgraded to a definite rejection by a conflicting JSON error_code', async t => {
  t.mock.method(global, 'fetch', async () => telegramResponse({ ok: false, error_code: 429,
    parameters: { retry_after: 17 } }, 500));
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), {
    classification: 'TELEGRAM_API_REJECTED', httpStatus: 500, deliveryOutcome: 'unknown', code: 'TELEGRAM_DELIVERY_FAILED',
  });
});

test('native JSON parse failures never confirm an API operation', async t => {
  for (const method of ['sendMessage', 'answerCallbackQuery']) {
    t.mock.method(global, 'fetch', async () => new Response('{"ok":true,"result":', { status: 200 }));
    await assert.rejects(requestTelegramApi(API, method, {}), {
      classification: 'TELEGRAM_DELIVERY_UNKNOWN', phase: 'read_body', deliveryOutcome: 'unknown', httpStatus: 200,
    });
  }
});

test('request encoding failure is definitely not sent and never includes raw error contents', async t => {
  const fetchMock = t.mock.method(global, 'fetch', async () => success());
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {
    toJSON() { throw new Error(fixtureText); },
  }), error => error.deliveryOutcome === 'not_sent' && error.phase === 'prepare_request' && !error.message.includes(fixtureText));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('non-Telegram errors cannot inject secrets through code/name or be mislabeled as transport timeouts', () => {
  assert.equal(telegramErrorReason({ code: fixtureText, name: 'Error' }), 'Error');
  assert.equal(telegramErrorReason({ code: fixtureText, name: fixtureText }), 'UNKNOWN');
  assert.equal(telegramErrorReason({ code: 'ER_NO_SUCH_TABLE', name: 'Error' }), 'ER_NO_SUCH_TABLE');
  assert.equal(telegramErrorReason({ code: 'AUTH_WEBHOOK_SECRET_REQUIRED', name: 'Error' }), 'AUTH_WEBHOOK_SECRET_REQUIRED');
  assert.equal(telegramErrorReason({ name: 'TimeoutError', code: 23 }), 'TimeoutError');
});

function botConfigRow() {
  return { id: 1, is_active: 1, name: 'TEST BRAND', telegram_bot_username: 'test_bot',
    telegram_bot_token: 'TEST_ONLY_NOT_A_TOKEN', tg_login_enabled: 1, tg_mini_app_enabled: 1 };
}

function notificationFixture() {
  const state = { reachable: 1, attempts: 0, notification: 'sending', delays: [] };
  const db = { async query(raw, values) {
    const sql = raw.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('SELECT DISTINCT ch.provider_user_id')) {
      assert.deepEqual(Array.from(values), [1, 2, 10, 20, 7]);
      return [[{ provider_user_id: '42', title: 'TEST STATUS' }]];
    }
    if (sql.startsWith('SELECT id, is_active, name')) { assert.equal(values[0], 1); return [[botConfigRow()]]; }
    if (sql.startsWith('SELECT reachable')) { assert.equal(values[0], 1); return [[{ reachable: state.reachable }]]; }
    if (sql.startsWith('INSERT IGNORE INTO telegram_customer_notifications')) return [{ affectedRows: 1 }];
    if (sql.includes('SET attempts=attempts+1')) { state.attempts++; return [{ affectedRows: state.attempts <= 3 ? 1 : 0 }]; }
    if (sql.startsWith('UPDATE auth_telegram_bot_contacts SET reachable=0')) {
      assert.equal(values[0], 1);
      assert.equal(values[2], '42');
      assert.ok(Buffer.from(values[1]).equals(delivery.telegramBotKey(bot.token)));
      state.reachable = 0;
      return [{}];
    }
    const status = sql.match(/SET state='(sent|failed|blocked)'/);
    if (status) { assert.deepEqual(Array.from(values), [1, 10, 20]); state.notification = status[1]; return [{}]; }
    throw new Error('TEST_UNEXPECTED_NOTIFICATION_SQL');
  } };
  const module = isolatedModule('api/telegramNotifications.js', { './messengerDelivery': delivery }, {
    setTimeout(callback, ms) { state.delays.push(ms); queueMicrotask(callback); },
  });
  return { state, run: () => module.sendCustomerOrderStatus(1, 2, { id: 10, status_id: 20, customer_id: 7 }, { db }) };
}

for (const status of [400, 401, 403, 429, 500]) {
  test(`real notification consumer preserves contact/retry policy for HTTP ${status}`, async t => {
    const fixture = notificationFixture();
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: false, error_code: status,
      ...(status === 429 ? { parameters: { retry_after: 17 } } : {}) }, status));
    await assert.rejects(fixture.run());
    const blocked = [400, 403].includes(status);
    assert.equal(fixture.state.reachable, blocked ? 0 : 1);
    assert.equal(fixture.state.notification, blocked ? 'blocked' : 'failed');
    assert.equal(fixture.state.attempts, blocked ? 1 : 3);
    assert.deepEqual(fixture.state.delays, blocked ? [] : status === 429 ? [17000, 17000] : [1000, 2000]);
  });
}

test('notification consumer honors retry_after cutoff and can recover without blocking contact', async t => {
  let fixture = notificationFixture();
  t.mock.method(global, 'fetch', async () => telegramResponse({ ok: false, error_code: 429,
    parameters: { retry_after: 61 } }, 429));
  await assert.rejects(fixture.run());
  assert.equal(fixture.state.attempts, 1);
  assert.equal(fixture.state.reachable, 1);
  assert.deepEqual(fixture.state.delays, []);
  fixture = notificationFixture();
  let calls = 0;
  global.fetch = async () => ++calls < 3 ? telegramResponse({ ok: false, error_code: 500 }, 500) : success();
  await fixture.run();
  assert.equal(fixture.state.notification, 'sent');
  assert.equal(fixture.state.reachable, 1);
  assert.equal(calls, 3);
});

for (const failure of ['timeout', 'lost-response', 'damaged-json']) {
  test(`notification consumer never revokes contact on ${failure}`, async t => {
    const fixture = notificationFixture();
    t.mock.method(global, 'fetch', async () => {
      if (failure === 'timeout') throw new DOMException(fixtureText, 'TimeoutError');
      if (failure === 'lost-response') throw Object.assign(new Error(fixtureText), { code: 'ECONNRESET' });
      return new Response('{"ok":true,', { status: 200 });
    });
    await assert.rejects(fixture.run());
    assert.equal(fixture.state.reachable, 1);
    assert.equal(fixture.state.notification, 'failed');
    assert.equal(fixture.state.attempts, 3);
  });
}

function otpFixture(reachable = 1) {
  const state = { records: [], deadlineMs: null, cleared: false, expire: null };
  const module = isolatedModule('api/messengerDelivery.js', {
    '../data/system-settings': {}, './maxIntegration': {}, './messengerAuth': auth,
    './messengerCleanup': { recordServiceMessage: async (_, details) => { state.records.push(details); } },
  }, {
    setTimeout(callback, ms) { state.expire = callback; state.deadlineMs = ms; return 123; },
    clearTimeout(id) { assert.equal(id, 123); state.cleared = true; },
  });
  const db = { async query(sql, values) {
    assert.equal(values[0], 1);
    if (sql.includes('FROM ten_tenants')) return [[botConfigRow()]];
    if (sql.includes('FROM auth_telegram_bot_contacts')) return [[{ reachable }]];
    throw new Error('TEST_UNEXPECTED_OTP_SQL');
  } };
  return { state, run: onTiming => module.deliverCode(db, {
    tenantId: 1, provider: 'tg', providerUserId: '42', code: '0197', purpose: 'login',
    expiresInMinutes: 3, operationId: 'test-operation',
  }, { onTelegramApiTiming: onTiming }) };
}

test('real deliverCode preserves OTP body, scoped contact, message identity and deadline cleanup', async t => {
  const fixture = otpFixture();
  const timings = [];
  t.mock.method(global, 'fetch', async (_, options) => {
    assert.equal(JSON.parse(options.body).chat_id, '42');
    assert.match(JSON.parse(options.body).text, /0197/);
    assert.equal(options.signal.aborted, false);
    return success();
  });
  await fixture.run((_, details) => timings.push(details));
  assert.equal(fixture.state.deadlineMs, 10000);
  assert.equal(fixture.state.cleared, true);
  assert.equal(fixture.state.records.length, 1);
  assert.equal(fixture.state.records[0].chatId, 42);
  assert.equal(fixture.state.records[0].messageId, 71);
  assert.equal(timings[0].deliveryOutcome, 'confirmed');
  assert.ok(!JSON.stringify(timings).includes('0197'));
});

test('real OTP controller deadline is TimeoutError, not an unexplained AbortError', async t => {
  const fixture = otpFixture();
  t.mock.method(global, 'fetch', async (_, { signal }) => {
    fixture.state.expire();
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, 'TimeoutError');
    throw signal.reason;
  });
  await assert.rejects(fixture.run(), { classification: 'TELEGRAM_API_TIMEOUT', deliveryOutcome: 'unknown' });
  assert.equal(fixture.state.records.length, 0);
  assert.equal(fixture.state.cleared, true);
});

for (const status of [400, 401, 403, 429, 500]) {
  test(`real OTP HTTP ${status} failure never records an invented message ID`, async t => {
    const fixture = otpFixture();
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: false, error_code: status }, status));
    await assert.rejects(fixture.run());
    assert.equal(fixture.state.records.length, 0);
    assert.equal(fixture.state.cleared, true);
  });
}

test('real OTP rejects unavailable contacts before fetch', async t => {
  const fixture = otpFixture(0);
  const fetchMock = t.mock.method(global, 'fetch', async () => success());
  await assert.rejects(fixture.run(), { code: 'TELEGRAM_BOT_START_REQUIRED' });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(fixture.state.records.length, 0);
  assert.equal(fixture.state.deadlineMs, null);
});

// Stateful SQL adapter for the real browserBotAction/consumeBrowserRequest functions.
// Existing employee/customer provisioning is a collaborator fixture; no session or DB is real.
function browserFixture({ valid = 1, active = true, failConfirmation = false } = {}) {
  const binding = 'TEST_ONLY_BROWSER_BINDING';
  const token = `b_${'b'.repeat(40)}`;
  const state = { request: { public_id: 'r'.repeat(43), tenant_id: 1, provider: 'tg', provider_user_id: '42',
    state: 'started', valid, account_type: 'employee', account_id: 7, purpose: 'login',
    contact_phone: '10000000000', contact_verified_at: true,
    browser_hash: crypto.createHash('sha256').update(binding).digest() },
    confirmations: 0, mappingWrites: 0, sessions: 0, results: [] };
  const module = isolatedModule('api/messengerAuth.js', {
    './helpers': { normalizePhone: value => value }, // Fixture input is already normalized.
    './helpers/employeeCustomer': { ensureEmployeeCustomer: async (_, tenantId, id, proof) => {
      assert.equal(tenantId, 1); assert.equal(id, 7); assert.equal(proof.providerUserId, '42');
      state.mappingWrites++; return { customerId: 77 };
    } },
    './messengerCleanup': { operationId: () => 'test-operation', markOperation: async () => {} },
  });
  const db = {
    async query(sql) {
      assert.equal(sql, 'SHOW COLUMNS FROM auth_browser_requests');
      return [[{ Field: 'contact_phone' }, { Field: 'contact_name' }, { Field: 'contact_verified_at' }]];
    },
    async getConnection() {
      let snapshot;
      return {
        beginTransaction: async () => { snapshot = { request: { ...state.request }, mappingWrites: state.mappingWrites, sessions: state.sessions }; },
        commit: async () => {},
        rollback: async () => { state.request = snapshot.request; state.mappingWrites = snapshot.mappingWrites; state.sessions = snapshot.sessions; },
        release() {},
        async query(raw, values) {
          const sql = raw.replace(/\s+/g, ' ').trim();
          if (sql.startsWith('SELECT *') && sql.includes('FROM auth_browser_requests')) {
            const key = sql.includes('token_hash=?') ? crypto.createHash('sha256').update(token).digest() : state.request.public_id;
            assert.deepEqual(values[0], key);
            if (values[1] !== 1) return [[]];
            return [[{ ...state.request }]];
          }
          if (sql.startsWith('SELECT id FROM ten_tenants')) { assert.equal(values[0], 1); return [[{ id: 1 }]]; }
          if (sql.startsWith('SELECT id,person_id,revoked_at')) {
            assert.deepEqual(Array.from(values), ['tg', '42']);
            return [[{ id: 3, person_id: 4, revoked_at: null }]];
          }
          if (sql.startsWith('SELECT DISTINCT u.id,u.phone')) {
            assert.deepEqual(Array.from(values), [1, 'tg', '42']);
            return [[{ id: 7, phone: state.request.contact_phone }]];
          }
          if (sql.startsWith("UPDATE auth_browser_requests SET state='confirmed'")) {
            assert.deepEqual(Array.from(values), [7, state.request.public_id]);
            if (failConfirmation) throw Object.assign(new Error('TEST_DB_WRITE_FAILURE'), { code: 'ER_LOCK_DEADLOCK' });
            state.request.state = 'confirmed'; state.confirmations++; return [{}];
          }
          if (sql.startsWith('SELECT u.id')) { assert.deepEqual(Array.from(values), [1, 7]); return [active ? [{ id: 7 }] : []]; }
          if (sql.startsWith('SELECT c.id FROM auth_account_links')) {
            assert.deepEqual(Array.from(values), [1, 'employee', 7, 'tg', '42']); return [[{ id: 3 }]];
          }
          if (sql.startsWith("UPDATE auth_browser_requests SET state='consumed'")) {
            assert.equal(values[0], state.request.public_id); state.request.state = 'consumed'; return [{}];
          }
          throw new Error('TEST_UNEXPECTED_BROWSER_SQL');
        },
      };
    },
  };
  const onBrowserAuth = async ({ providerUserId, token: requestToken, confirm }) => {
    const result = await module.browserBotAction(db, { tenantId: 1, provider: 'tg', token: requestToken, providerUserId, confirm });
    state.results.push(result); return result;
  };
  const consume = () => module.consumeBrowserRequest(db, { tenantId: 1, accountType: 'employee',
    requestId: state.request.public_id, binding, onVerified: async () => { state.sessions++; return {}; } });
  const update = { callback_query: { id: 'fixture-callback', data: `auth:${token}`,
    from: { id: 42 }, message: { chat: { id: 42, type: 'private' } } } };
  return { state, module, db, token, update, consume, onBrowserAuth,
    run: () => handleTenantTelegramUpdate({}, {}, bot, update, { onBrowserAuth }) };
}

for (const failingMethod of ['answerCallbackQuery', 'sendMessage']) {
  for (const failure of ['400', '500', 'timeout', 'lost-response', 'damaged-json', 'invalid-result']) {
    test(`real auth guards survive six retries after ${failingMethod} ${failure}`, async t => {
      t.mock.method(console, 'warn', () => {});
      const fixture = browserFixture();
      t.mock.method(global, 'fetch', async url => {
        if (!url.endsWith(`/${failingMethod}`)) return telegramResponse({ ok: true, result: true });
        if (failure === 'timeout') throw new DOMException(fixtureText, 'TimeoutError');
        if (failure === 'lost-response') throw Object.assign(new Error(fixtureText), { code: 'ECONNRESET' });
        if (failure === 'damaged-json') return new Response('{"ok":true,');
        if (failure === 'invalid-result') return telegramResponse({ ok: true, result: false });
        return telegramResponse({ ok: false, error_code: Number(failure) }, Number(failure));
      });
      // Actual webhook re-entry is tested separately; here the domain adapter is re-entered six times.
      for (let attempt = 0; attempt < 6; attempt++) await assert.rejects(fixture.run());
      assert.equal(fixture.state.request.state, 'confirmed');
      assert.equal(fixture.state.confirmations, 1);
      assert.equal(fixture.state.mappingWrites, 1);
      assert.equal(fixture.state.sessions, 0);
      assert.ok(fixture.state.results.every(result => result.ok && result.confirmed));
      await fixture.consume();
      await assert.rejects(fixture.consume(), { code: 'REQUEST_EXPIRED' });
      await assert.rejects(fixture.run()); // Replay after browser consumption must not confirm again.
      assert.equal(fixture.state.request.state, 'consumed');
      assert.equal(fixture.state.results.at(-1).ok, false);
      assert.equal(fixture.state.sessions, 1);
      assert.equal(fixture.state.confirmations, 1);
      assert.equal(fixture.state.mappingWrites, 1);
    });
  }
}

test('browser DB commit-path failure cannot be hidden by Telegram success', async t => {
  const fixture = browserFixture({ failConfirmation: true });
  const fetchMock = t.mock.method(global, 'fetch', async () => success());
  await assert.rejects(fixture.run(), { code: 'ER_LOCK_DEADLOCK' });
  assert.equal(fixture.state.request.state, 'started');
  assert.equal(fixture.state.mappingWrites, 0);
  assert.equal(fixture.state.sessions, 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('expired or foreign-user browser requests stay rejected despite successful Telegram notifications', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(global, 'fetch', async url => url.endsWith('/answerCallbackQuery')
    ? telegramResponse({ ok: true, result: true }) : success());
  for (const invalid of ['expired', 'foreign-user']) {
    const fixture = browserFixture({ valid: invalid === 'expired' ? 0 : 1 });
    if (invalid === 'foreign-user') {
      fixture.update.callback_query.from.id = 43;
      fixture.update.callback_query.message.chat.id = 43;
    }
    await fixture.run();
    assert.equal(fixture.state.results[0].ok, false);
    assert.equal(fixture.state.request.state, 'started');
    assert.equal(fixture.state.confirmations, 0);
    assert.equal(fixture.state.sessions, 0);
  }
});

test('browser consumption rechecks account availability after confirmation', async t => {
  const fixture = browserFixture({ active: false });
  t.mock.method(global, 'fetch', async url => url.endsWith('/answerCallbackQuery')
    ? telegramResponse({ ok: true, result: true }) : success());
  await fixture.run();
  await assert.rejects(fixture.consume(), { code: 'ACCOUNT_NOT_AVAILABLE' });
  assert.equal(fixture.state.sessions, 0);
  assert.equal(fixture.state.request.state, 'confirmed');
});

for (const text of ['/start', ' /START@test_bot ', '/start\n', '/start@test_bot']) {
  test(`both bots preserve plain command contract (${JSON.stringify(text)})`, async t => {
    const payloads = [];
    t.mock.method(global, 'fetch', async (_, { body }) => { payloads.push(JSON.parse(body)); return success(); });
    await handleTenantTelegramUpdate(emptyTenantDb(), {}, bot, startUpdate(text));
    const systemDb = { query: async sql => { assert.match(sql, /^INSERT INTO ten_telegram_pending/); return [{}]; } };
    await processUpdate(systemDb, API, startUpdate(text), { onAuthLink: async () => ({ ok: false }) });
    assert.equal(payloads.length, 2);
    assert.ok(payloads.every(body => body.reply_markup.keyboard[0][0].request_contact === true));
  });
}

test('tenant reserved login payload and b_/a_/l_ arguments keep their distinct callbacks', async t => {
  const payloads = [];
  t.mock.method(global, 'fetch', async (_, { body }) => { payloads.push(JSON.parse(body)); return success(); });
  const ordinaryDb = emptyTenantDb();
  const db = { query: async (sql, values) => {
    if (sql.includes('FROM ten_store_telegram')) {
      assert.deepEqual(Array.from(values), ['login', 1, 1]); return [[]];
    }
    return ordinaryDb.query(sql, values);
  } };
  await handleTenantTelegramUpdate(db, {}, bot, startUpdate('/start@test_bot login'));
  const calls = [];
  const noDb = { query: async () => { throw new Error('UNEXPECTED_LEGACY_LOOKUP'); } };
  const options = {
    onBrowserAuth: async input => { calls.push(input); return { ok: true }; },
    onAuthLink: async input => { calls.push(input); return { ok: true }; },
    onAuthLogin: async input => { calls.push(input); return { ok: true, alreadySent: true }; },
  };
  for (const prefix of ['b_', 'a_', 'l_']) {
    await handleTenantTelegramUpdate(noDb, {}, bot, startUpdate(`/start@test_bot ${prefix}${'c'.repeat(40)}`), options);
  }
  assert.deepEqual(calls.map(item => item.token), ['b_', 'a_', 'l_'].map(prefix => prefix + 'c'.repeat(40)));
  assert.equal(calls[0].confirm, false);
  assert.ok(calls.every(item => item.providerUserId === '42'));
  assert.equal(payloads[0].reply_markup.keyboard[0][0].request_contact, true);
  assert.equal(payloads[1].reply_markup.inline_keyboard[0][0].callback_data, `auth:b_${'c'.repeat(40)}`);
});

test('system a_ payload is passed intact only from the owning private chat', async t => {
  const token = `a_${'d'.repeat(40)}`;
  const calls = [];
  const db = { query: async () => { throw new Error('UNEXPECTED_LEGACY_LOOKUP'); } };
  t.mock.method(global, 'fetch', async () => success());
  const options = { onAuthLink: async input => { calls.push(input); return { ok: true }; } };
  await processUpdate(db, API, startUpdate(`/start@test_bot ${token}`), options);
  const group = startUpdate(`/start ${token}`);
  group.message.chat.type = 'group';
  await processUpdate(db, API, group, options);
  const foreign = startUpdate(`/start ${token}`);
  foreign.message.from.id = 43;
  await processUpdate(db, API, foreign, options);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, token);
  assert.equal(calls[0].providerUserId, '42');
});

test('known tenant customer keeps both one-time site and Mini App links', async t => {
  let loginToken;
  const db = { query: async (sql, values) => {
    assert.equal(values[0], 1);
    if (sql.includes('SELECT provider_user_id, phone')) return [[{ phone: 'tg_origin', provider_user_id: 'https://shop.example.test' }]];
    if (sql.includes('FROM cust_customers')) return [[{ id: 7 }]];
    if (sql.includes('INSERT INTO cust_customer_auth_tokens')) { assert.equal(values[1], 7); loginToken = values[2]; return [{}]; }
    if (sql.includes('FROM ten_tenants')) return [[{ tg_mini_app_enabled: 1 }]];
    throw new Error('TEST_UNEXPECTED_LOGIN_LINK_SQL');
  } };
  t.mock.method(global, 'fetch', async (_, { body }) => {
    const buttons = JSON.parse(body).reply_markup.inline_keyboard;
    const site = new URL(buttons[0][0].url);
    const mini = new URL(buttons[1][0].web_app.url);
    assert.equal(site.origin, 'https://shop.example.test');
    assert.equal(site.searchParams.get('token'), loginToken);
    assert.equal(site.searchParams.get('target'), 'site');
    assert.equal(mini.searchParams.get('target'), 'miniapp');
    assert.equal(mini.searchParams.get('token'), loginToken);
    return success();
  });
  await handleTenantTelegramUpdate(db, {}, bot, startUpdate());
  assert.ok(loginToken);
});

test('store token consumption is scoped and a repeated update cannot reconnect or resend secrets', async t => {
  for (const mode of ['tenant', 'system']) {
    let consumed = false;
    let sends = 0;
    const scope = mode === 'tenant' ? 1 : null;
    const db = { query: async (sql, values) => {
      if (sql.includes('FROM cust_customer_auth_tokens')) return [[]]; // System legacy lookup before store tokens.
      if (sql.includes('FROM ten_store_telegram')) {
        assert.deepEqual(Array.from(values), ['store_fixture', scope, scope]);
        return [[{ id: 8, tenant_id: 1, store_id: 2, secret_key: 'TEST_ONLY_STORE_SECRET' }]];
      }
      if (sql.includes('UPDATE ten_store_telegram')) {
        assert.deepEqual(Array.from(values), [42, 8, 1, 'store_fixture']);
        const affectedRows = consumed ? 0 : 1; consumed = true; return [{ affectedRows }];
      }
      if (sql.includes('FROM ten_stores')) { assert.deepEqual(Array.from(values), [1, 2]); return [[{ name: 'TEST STORE' }]]; }
      throw new Error('TEST_UNEXPECTED_STORE_SQL');
    } };
    t.mock.method(global, 'fetch', async () => { sends++; return success(); });
    for (let i = 0; i < 2; i++) {
      if (mode === 'tenant') await handleTenantTelegramUpdate(db, {}, bot, startUpdate('/start store_fixture'));
      else await processUpdate(db, API, startUpdate('/start store_fixture'), { onAuthLink: async () => ({ ok: false }) });
    }
    assert.equal(consumed, true);
    assert.equal(sends, 2); // One acknowledgement and one secret message, only on the winning claim.
  }
});

test('legacy SQL errors cannot expose token/phone/message contents in bot diagnostics', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const db = { query: async sql => {
    if (sql.includes('SELECT id, tenant_id, customer_id')) return [[{ id: 1, tenant_id: 1, customer_id: 7 }]];
    if (sql.includes('UPDATE cust_customers')) return [{}];
    throw Object.assign(new Error(`${API} phone=10000000000 otp=0197 ${fixtureText}`), { code: 'ER_DUP_ENTRY' });
  } };
  t.mock.method(global, 'fetch', async () => success());
  await processUpdate(db, API, startUpdate('/start legacy_fixture'), { onAuthLink: async () => ({ ok: false }) });
  assert.equal(logs[0][1], 'ER_DUP_ENTRY');
  assert.ok(!JSON.stringify(logs).includes('TEST_ONLY'));
  assert.ok(!JSON.stringify(logs).includes('10000000000'));
  assert.ok(!JSON.stringify(logs).includes('0197'));
});

test('message_id zero is accepted by delivery but never becomes a cleanup delete job', async () => {
  const cleanup = require('../api/messengerCleanup');
  const db = { getConnection: async () => { throw new Error('UNEXPECTED_CLEANUP_JOB'); } };
  assert.equal(await cleanup.recordServiceMessage(db, { operationId: 'test-operation', provider: 'tg', chatId: 42, messageId: 0 }), false);
});

test('failed advisory lock yields 503 without deleting or processing another event', async () => {
  const db = eventDatabase({ lockAcquired: false });
  let called = false;
  await assert.rejects(auth.processWebhookEvent(db, 'tg', { update_id: 99 }, async () => { called = true; }), {
    code: 'WEBHOOK_IN_PROGRESS', status: 503,
  });
  assert.equal(called, false);
  assert.equal(db.state.releases, 1);
  assert.equal(db.state.queries.filter(sql => sql.includes('auth_webhook_events')).length, 0);
});

function linkFixture() {
  const token = `a_${'e'.repeat(40)}`;
  const state = { challenge: { id: 8, tenant_id: 1, account_type: 'customer', account_id: 7,
    expires_valid: 1, consumed_at: null }, links: 0, sessionExtensions: 0, results: [] };
  const db = { async getConnection() {
    let snapshot;
    return {
      beginTransaction: async () => { snapshot = { ...state.challenge }; }, commit: async () => {},
      rollback: async () => { state.challenge = snapshot; }, release() {},
      async query(raw, values) {
        const sql = raw.replace(/\s+/g, ' ').trim();
        if (sql.startsWith('SELECT id, tenant_id, account_type')) {
          assert.equal(values[0], 'tg');
          assert.ok(Buffer.from(values[1]).equals(crypto.createHash('sha256').update(token).digest()));
          return [[{ ...state.challenge }]];
        }
        if (sql.startsWith('SELECT id FROM cust_customers')) { assert.deepEqual(Array.from(values), [1, 7]); return [[{ id: 7 }]]; }
        if (sql.startsWith('SELECT id, person_id, linked_at')) { assert.deepEqual(Array.from(values), [1, 'customer', 7]); return [[{ id: 2, person_id: 4 }]]; }
        if (sql.startsWith('SELECT c.id FROM auth_account_links')) { assert.deepEqual(Array.from(values), ['tg', 1, 'customer', 7, '42']); return [[{ id: 3 }]]; }
        if (sql.startsWith('SELECT id, person_id FROM auth_messenger_channels')) { assert.deepEqual(Array.from(values), ['tg', '42']); return [[{ id: 3, person_id: 4 }]]; }
        if (sql.startsWith('UPDATE auth_messenger_channels')) return [{}];
        if (sql.startsWith('INSERT INTO auth_account_messenger_links')) { state.links++; return [{}]; }
        if (sql.startsWith('UPDATE auth_verification_challenges SET consumed_at=NOW(),')) { state.challenge.consumed_at = 'fixture-consumed'; return [{}]; }
        if (sql.startsWith('UPDATE auth_verification_challenges SET consumed_at=NOW()')) return [{}];
        if (sql.startsWith('UPDATE cust_customers SET telegram_user_id')) return [{}];
        if (sql.startsWith('INSERT INTO cust_customer_auth_identities')) return [{}];
        if (sql.startsWith('UPDATE cust_customer_sessions SET expires_at=NULL')) { state.sessionExtensions++; return [{}]; }
        throw new Error('TEST_UNEXPECTED_LINK_SQL');
      },
    };
  } };
  const onAuthLink = async input => {
    const result = await auth.completeLinkChallenge(db, 'tg', input.providerUserId, input.token, 1);
    state.results.push(result); return result;
  };
  return { token, state, onAuthLink };
}

test('both bots preserve real link consumption after a post-commit send failure', async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => { throw new DOMException(fixtureText, 'TimeoutError'); });
  for (const mode of ['tenant', 'system']) {
    const fixture = linkFixture();
    const noLegacyDb = { query: async () => { throw new Error('UNEXPECTED_LEGACY_LINK'); } };
    for (let attempt = 0; attempt < 6; attempt++) {
      const update = startUpdate(`/start@test_bot ${fixture.token}`);
      await assert.rejects(mode === 'tenant'
        ? handleTenantTelegramUpdate(noLegacyDb, {}, bot, update, { onAuthLink: fixture.onAuthLink })
        : processUpdate(noLegacyDb, API, update, { onAuthLink: fixture.onAuthLink }));
    }
    assert.equal(fixture.state.results[0].ok, true);
    assert.ok(fixture.state.results.slice(1).every(result => result.ok === false));
    assert.equal(fixture.state.challenge.consumed_at, 'fixture-consumed');
    assert.equal(fixture.state.links, 1);
    assert.equal(fixture.state.sessionExtensions, 1);
  }
});

test('a coincident expired deadline cannot relabel a native JSON syntax failure', async t => {
  for (const status of [200, 400, 429, 500]) {
    const controller = new AbortController();
    t.mock.method(global, 'fetch', async () => {
      controller.abort(new DOMException('fixture deadline', 'TimeoutError'));
      return new Response('{"ok":', { status });
    });
    await assert.rejects(requestTelegramApi(API, 'sendMessage', {}, { signal: controller.signal }), {
      classification: status === 200 ? 'TELEGRAM_DELIVERY_UNKNOWN' : status === 429 ? 'TELEGRAM_RATE_LIMITED' : 'TELEGRAM_API_REJECTED',
      deliveryOutcome: [400, 429].includes(status) ? 'rejected' : 'unknown', httpStatus: status,
    });
  }
});

test('native body-reader AbortError caused by our deadline is still an API timeout', async t => {
  const controller = new AbortController();
  t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200,
    json: async () => {
      controller.abort(new DOMException('fixture deadline', 'TimeoutError'));
      throw new DOMException('fixture body abort', 'AbortError');
    },
  }));
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}, { signal: controller.signal }), {
    classification: 'TELEGRAM_API_TIMEOUT', phase: 'read_body', deliveryOutcome: 'unknown',
  });
});

test('retry_after is exposed only as a positive safe integer and never coerces arbitrary data', async t => {
  for (const value of [0, -1, '17', Number.MAX_SAFE_INTEGER + 1, 17]) {
    t.mock.method(global, 'fetch', async () => telegramResponse({ ok: false, error_code: 429,
      parameters: { retry_after: value } }, 429));
    await assert.rejects(requestTelegramApi(API, 'sendMessage', {}), {
      code: 'TELEGRAM_RATE_LIMITED', retryAfter: value === 17 ? 17 : 0,
    });
  }
});

test('the delivery helper refuses registration/polling methods before fetch', async t => {
  const fetchMock = t.mock.method(global, 'fetch', async () => success());
  for (const method of ['setWebhook', 'deleteWebhook', 'getUpdates']) {
    await assert.rejects(requestTelegramApi(API, method, {}), { message: 'TELEGRAM_METHOD_NOT_SUPPORTED' });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('actual helper-to-server timing wiring stays redacted even after an early connection close', async t => {
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const update = startUpdate(fixtureText);
  update.message.contact = { phone_number: '10000000000', user_id: 42 };
  const { timing, res, logs } = webhookTimingFixture(update, { ingressMonoMs: now(), now });
  res.writableEnded = false;
  res.statusCode = 500;
  res.emit('close');
  t.mock.method(global, 'fetch', async () => {
    throw Object.assign(new Error(`${API} otp=0197 phone=10000000000 ${fixtureText}`), { code: fixtureText });
  });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', { text: fixtureText }, { onTiming: timing.addTelegramApi }));
  global.fetch = async () => new Response(`damaged-json ${API} otp=0197 phone=10000000000 ${fixtureText}`);
  await assert.rejects(requestTelegramApi(API, 'answerCallbackQuery', { callback_query_id: 'TEST_ONLY_CALLBACK' }, { onTiming: timing.addTelegramApi }));
  res.emit('finish');
  assert.equal(logs.filter(item => item[0] === 'TELEGRAM_WEBHOOK_TIMING').length, 1);
  assert.equal(logs[0][1].result, 'connection_closed');
  const apiLogs = logs.filter(item => item[0] === 'TELEGRAM_API_TIMING').map(item => JSON.parse(item[1]));
  assert.equal(apiLogs.length, 2);
  assert.ok(apiLogs.every(item => item.eventId === timing.eventId && item.tenantId === 1));
  assert.ok(apiLogs.every(item => item.classification === 'TELEGRAM_DELIVERY_UNKNOWN'));
  const serialized = JSON.stringify(logs);
  for (const secret of ['TEST_ONLY', '0197', '10000000000']) assert.ok(!serialized.includes(secret));
});
