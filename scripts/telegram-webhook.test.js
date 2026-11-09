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

function isolatedModule(relative, overrides) {
  const filename = path.resolve(__dirname, '..', relative);
  const originalRequire = createRequire(filename);
  const loaded = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: loaded, exports: loaded.exports, console, Buffer, process,
    AbortController, DOMException, setTimeout, clearTimeout,
    fetch: (...args) => global.fetch(...args),
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!['crypto', 'util', './telegramApi'].includes(name)) throw new Error(`TEST_IMPORT_FORBIDDEN: ${name}`);
      return originalRequire(name);
    },
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

function success() {
  return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 71, chat: { id: 42 } } }) };
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
    assert.equal(db.queries.length, 3);
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
    assert.equal(db.queries.length, 3);
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
    t.mock.method(global, 'fetch', async () => ({ ok: false, status, json: async () => ({
      ok: false, error_code: status, description: fixtureText, parameters: { retry_after: 17 },
    }) }));
    await assert.rejects(delivery.sendTelegramText('TEST_ONLY_NOT_A_TOKEN', '42', fixtureText), error => {
      assert.equal(error.classification, status === 429 ? 'TELEGRAM_RATE_LIMITED' : 'TELEGRAM_API_REJECTED');
      assert.equal(error.deliveryOutcome, status >= 500 ? 'unknown' : 'rejected');
      assert.equal(error.code, ({ 400: 'TELEGRAM_CHAT_UNAVAILABLE', 401: 'TELEGRAM_TOKEN_REJECTED',
        403: 'TELEGRAM_BOT_BLOCKED', 429: 'TELEGRAM_RATE_LIMITED' })[status] || 'TELEGRAM_DELIVERY_FAILED');
      assert.equal(error.httpStatus, status);
      assert.equal(error.retryAfter, 17);
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

test('a caller cancellation is unknown, not an invented API timeout', async t => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(global, 'fetch', async (_, { signal }) => { throw signal.reason; });
  await assert.rejects(requestTelegramApi(API, 'sendMessage', {}, { signal: controller.signal }), {
    classification: 'TELEGRAM_DELIVERY_UNKNOWN', phase: 'unknown', deliveryOutcome: 'unknown',
  });
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
  assert.equal(telegramErrorReason(new DOMException('fixture', 'TimeoutError')), 'TELEGRAM_API_TIMEOUT');
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
      ? { ok: true, status: 200, json: async () => ({ ok: true, result: true }) } : success();
  });
  await handleTenantTelegramUpdate({}, {}, bot, { callback_query: {
    id: 'test-callback', data: `auth:b_${'a'.repeat(40)}`, from: { id: 42 }, message: { chat: { id: 42, type: 'private' } },
  } }, { onBrowserAuth: async () => { confirmed = true; return { ok: true }; },
    onTelegramApiTiming: (_, details) => timings.push(details.method) });
  assert.deepEqual(calls, ['answerCallbackQuery', 'sendMessage']);
  assert.deepEqual(timings, calls);
});

// Models the CURRENT advisory-lock SQL contract; this is not an inbox/outbox implementation.
function eventDatabase() {
  const rows = new Map();
  const locks = new Map();
  const state = { rows, commits: 0, releases: 0, handlerCalls: 0 };
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
          if (sql.startsWith('SELECT GET_LOCK')) {
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

test('CURRENT LIMITATION: failure after a handler commit allows re-entry on retry', async () => {
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

test('request timing correlates safe event hash and tenant with time before/after API', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
  const start = source.indexOf('function telegramUpdateType(');
  const end = source.indexOf('async function measureWebhookStage(', start);
  assert.ok(start > 0 && end > start);
  const logs = [];
  const context = { crypto, db: {}, nowMs: () => 1000,
    console: { info: (...args) => logs.push(args) } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const req = { _telegramWebhookIngressMonoMs: 100, _telegramWebhookIngressWallMs: 1700000000000 };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = true;
  const timing = context.beginTelegramWebhookTiming(req, res, startUpdate(`/start ${fixtureText}`), 1);
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
