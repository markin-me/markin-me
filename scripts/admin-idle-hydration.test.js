'use strict';

// In-memory tests only. Do not run automatically: AGENTS.md reserves execution for the user.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/admin-idle-hydration.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function browser() {
  let now = 0, timerId = 0, tabId = 0;
  const timers = new Map(), values = new Map(), tabs = [], held = new Map();
  const locks = {
    async query() { return { held: [...held.keys()].map(name => ({ name })) }; },
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = {}; }
      if (held.has(name)) {
        if (options.ifAvailable) return Promise.resolve(callback(null));
        throw new Error('Unexpected contended lifetime lock');
      }
      held.set(name, true);
      return Promise.resolve().then(() => callback({ name })).finally(() => held.delete(name));
    },
  };
  function tab({ supported = true, maxBytes = 1024 } = {}) {
    const listeners = new Map(), requests = [], writes = [];
    const on = (type, listener) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); };
    const emit = (type, event = {}) => { for (const listener of listeners.get(type) || []) listener(event); };
    const env = { emit, requests, writes, fetcher: async () => new Response('{"ok":true}') };
    const storage = {
      get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
      getItem: key => values.get(key) ?? null,
      removeItem: key => values.delete(key),
      setItem(key, value) {
        values.set(key, String(value));
        for (const other of tabs) if (other !== env && !other.delayStorageEvents) other.emit('w:storage', { key, newValue: String(value) });
      },
    };
    let generation = 0, authorized = true;
    const core = {
      isActive: () => authorized,
      create: () => ({ namespace: 'tenant-user-role-view-epoch-store' }),
      capture() { const captured = generation; return { isCurrent: () => authorized && captured === generation }; },
      reset() { authorized = false; generation++; emit('w:admin:local-context-changed', { detail: { state: 'revoked' } }); },
    };
    const document = { hidden: false, addEventListener: (type, listener) => on('d:' + type, listener) };
    class MessageChannel {
      constructor() {
        this.port1 = { close() {}, postMessage: data => Promise.resolve().then(() => this.port2.onmessage?.({ data })) };
        this.port2 = { close() {}, postMessage: data => Promise.resolve().then(() => this.port1.onmessage?.({ data })) };
      }
    }
    const window = { AdminLocalRepository: core, AdminAccessContext: { ok: true }, MessageChannel,
      AdminIdleHydrationConfig: { maxBytes }, localStorage: storage,
      navigator: { onLine: true, locks: supported ? locks : undefined },
      crypto: { randomUUID: () => 'tab-' + (++tabId) }, location: { origin: 'https://app.test' },
      addEventListener: (type, listener) => on('w:' + type, listener),
      setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
      clearTimeout: id => timers.delete(id),
      fetch: async (url, options) => { requests.push({ url, options }); return env.fetcher(url, options); },
    };
    tabs.push(env);
    vm.runInNewContext(source, { window, document, URL, DOMException, AbortController, TextDecoder,
      Date: class extends Date { static now() { return now; } },
      Math: { ...Math, random: () => 0, max: Math.max, min: Math.min, floor: Math.floor },
      getAuthHeaders: () => ({ Authorization: 'Bearer test' }) });
    Object.assign(env, { window, document, core, scheduler: window.AdminIdleHydration,
      activity() { emit('d:pointerdown', { isTrusted: true }); emit('d:pointerup', { isTrusted: true }); },
      repository: { async setMany(entries, options) {
        if (!options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
        if (env.quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
        writes.push(entries);
      } },
    });
    return env;
  }
  return { tab, async tick(ms) {
    now += ms;
    for (let turn = 0; turn < 100; turn++) {
      await flush();
      const due = [...timers].filter(([, item]) => item.at <= now);
      if (!due.length) return;
      for (const [id, item] of due) { timers.delete(id); item.callback(); }
    }
    throw new Error('Timer loop: idle scheduler must not poll while busy');
  } };
}

test('no background HTTP before 60 seconds', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const portion = tab.scheduler.enqueue('one', context => context.requestJSON('/api/admin/example'));
  await b.tick(59999); assert.equal(tab.requests.length, 0);
  await b.tick(1); assert.equal((await portion).ok, true); assert.equal(tab.requests.length, 1);
});

test('one browser lock serializes two tabs; activity in either tab aborts hydration', async () => {
  const b = browser(), first = b.tab(), second = b.tab(); await flush();
  first.fetcher = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Interrupted', 'AbortError')), { once: true });
  });
  first.scheduler.enqueue('a', context => context.requestJSON('/api/admin/a'));
  second.scheduler.enqueue('b', context => context.requestJSON('/api/admin/b'));
  await b.tick(60000);
  assert.equal(first.requests.length + second.requests.length, 1);
  second.activity(); await flush();
  assert.equal(first.requests[0].options.signal.aborted, true);
  await b.tick(60000);
  assert.equal(first.requests.length + second.requests.length, 1);
  first.scheduler.cancel(); second.scheduler.cancel();
});

test('long foreground operation vetoes hydration without a polling loop', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const end = tab.scheduler.beginOperation();
  tab.scheduler.enqueue('one', context => context.requestJSON('/api/admin/a'));
  await b.tick(120000); assert.equal(tab.requests.length, 0);
  end(); await b.tick(60000); assert.equal(tab.requests.length, 0);
  await b.tick(1000); assert.equal(tab.requests.length, 1);
});

test('a new tab vetoes a late response before its storage event is delivered', async () => {
  const b = browser(), tab = b.tab(); await flush();
  tab.delayStorageEvents = true;
  let respond;
  tab.fetcher = () => new Promise(resolve => { respond = resolve; });
  tab.scheduler.enqueue('late', async context => {
    const payload = await context.requestJSON('/api/admin/example');
    await context.commit(tab.repository, [['row', payload], ['checkpoint', { complete: false }]]);
  });
  await b.tick(60000);
  const other = b.tab(); await flush();
  respond(new Response('{"ok":true}')); await flush();
  assert.equal(tab.requests[0].options.signal.aborted, true);
  assert.equal(tab.writes.length, 0);
  tab.scheduler.cancel(); other.scheduler.cancel();
});

test('activity cancels a pending repository transaction through the commit signal', async () => {
  const b = browser(), tab = b.tab(), other = b.tab(); await flush();
  let signal;
  const repository = { setMany(entries, options) {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      reject(new DOMException('Transaction aborted', 'AbortError'));
    }, { once: true }));
  } };
  tab.scheduler.enqueue('write', context => context.commit(repository,
    [['row', 1], ['checkpoint', { complete: false }]]));
  await b.tick(60000);
  assert.ok(signal);
  other.activity(); await flush();
  assert.equal(signal.aborted, true);
  assert.equal(tab.writes.length, 0);
  tab.scheduler.cancel(); other.scheduler.cancel();
});

test('oversized body is rejected without a write or a successful checkpoint', async () => {
  const b = browser(), tab = b.tab(); await flush();
  tab.fetcher = async () => new Response(JSON.stringify({ data: 'x'.repeat(2048) }));
  const done = tab.scheduler.enqueue('large', async context => {
    const data = await context.requestJSON('/api/admin/a');
    await context.commit(tab.repository, [['row', data], ['checkpoint', { complete: false }]]);
  });
  await b.tick(60000); assert.equal((await done).ok, false); assert.equal(tab.writes.length, 0);
});

test('activity between response and persistence prevents the entire data/checkpoint batch', async () => {
  const b = browser(), tab = b.tab(); await flush();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  tab.scheduler.enqueue('paused', async context => {
    await context.requestJSON('/api/admin/a'); await gate;
    await context.commit(tab.repository, [['row', 1], ['checkpoint', { complete: false }]]);
  });
  await b.tick(60000); tab.activity(); release(); await flush();
  assert.equal(tab.writes.length, 0); tab.scheduler.cancel();
});

test('revoked scope rejects delayed data, and storage exhaustion pauses later tasks', async () => {
  const b = browser(), tab = b.tab(); await flush(); tab.quota = true;
  const done = tab.scheduler.enqueue('quota', context => context.commit(tab.repository, [['row', 1]]));
  await b.tick(60000); assert.equal((await done).ok, false);
  const skipped = await tab.scheduler.enqueue('later', context => context.requestJSON('/api/admin/a'));
  assert.equal(skipped.ok, false); assert.equal(tab.requests.length, 0);
  tab.core.reset(); assert.equal(tab.writes.length, 0);
});

test('without Web Locks background hydration fails closed', async () => {
  const b = browser(), tab = b.tab({ supported: false });
  assert.equal(tab.scheduler.supported, false);
  assert.equal((await tab.scheduler.enqueue('x', () => { throw new Error('Must not run'); })).ok, false);
  await b.tick(120000); assert.equal(tab.requests.length, 0);
});

test('data and checkpoint are one batch; a task cannot issue a second HTTP request', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const committed = tab.scheduler.enqueue('batch', context => context.commit(tab.repository,
    [['row', { id: 1 }], ['checkpoint', { complete: false, cursor: 1 }]]));
  await b.tick(60000); assert.equal((await committed).ok, true);
  assert.equal(tab.writes.length, 1); assert.equal(tab.writes[0].length, 2);
  const rejected = tab.scheduler.enqueue('two', async context => {
    await context.requestJSON('/api/admin/a'); await context.requestJSON('/api/admin/b');
  });
  await b.tick(3000); assert.equal((await rejected).ok, false); assert.equal(tab.requests.length, 1);
});

test('temporary server errors have bounded retries', async () => {
  const b = browser(), tab = b.tab(); await flush();
  tab.fetcher = async () => new Response('unavailable', { status: 503 });
  const result = tab.scheduler.enqueue('retry', context => context.requestJSON('/api/admin/a'));
  await b.tick(60000); await b.tick(6000); await b.tick(12000);
  assert.equal((await result).ok, false); assert.equal(tab.requests.length, 3);
});

test('a domain guard is retained by atomic commit instead of being overwritten', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const result = tab.scheduler.enqueue('domain-fence', context => context.commit(tab.repository,
    [['passport', { id: 1 }], ['checkpoint', { complete: false }]], { recordCount: 1, guard: () => false }));
  await b.tick(60000);
  assert.equal((await result).ok, false);
  assert.equal(tab.writes.length, 0);
});

function resourceWorker(tab, beforeCommit = () => {}) {
  const events = [];
  const worker = { postMessage(data, ports) {
    events.push(data.type);
    const port = ports[0], reply = message => port.postMessage({ ...message, operationId: data.operationId, version: data.version });
    port.onmessage = event => {
      events.push(event.data.type);
      if (event.data.type === 'FETCH') { beforeCommit(); reply({ type: 'COMMIT_REQUIRED' }); }
      if (event.data.type === 'COMMIT') reply({ ok: true, dependencies: [] });
      if (event.data.type === 'CANCEL') reply({ ok: false, name: 'AbortError' });
    };
    reply({ type: 'REQUEST' });
  } };
  tab.window.navigator.serviceWorker = { controller: worker };
  return { worker, events };
}

test('SW preparation waits for global idle and shares the one-request budget with JSON hydration', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const transport = resourceWorker(tab);
  const result = tab.scheduler.enqueue('resource', async context => {
    await context.prepareResource(transport.worker, '/static/app.js', 'v1');
    await context.requestJSON('/api/admin/must-not-run');
  });
  await b.tick(59999); assert.equal(transport.events.length, 0);
  await b.tick(1);
  assert.deepEqual(transport.events, ['PREPARE_OFFLINE_RESOURCE', 'FETCH', 'COMMIT']);
  assert.equal((await result).ok, false); assert.equal(tab.requests.length, 0);
});

test('activity in another tab vetoes the SW commit even before its storage event arrives', async () => {
  const b = browser(), first = b.tab(), other = b.tab(); await flush();
  first.delayStorageEvents = true;
  const transport = resourceWorker(first, () => other.activity());
  const result = first.scheduler.enqueue('resource', context => context.prepareResource(transport.worker, '/static/app.js', 'v1'));
  await b.tick(60000); await flush();
  assert.ok(transport.events.includes('FETCH')); assert.ok(transport.events.includes('CANCEL'));
  assert.equal(transport.events.includes('COMMIT'), false);
  first.scheduler.cancel(); assert.equal((await result).ok, false);
});

test('revocation after SW fetch cancels the operation and cannot confirm its cache checkpoint', async () => {
  const b = browser(), tab = b.tab(); await flush();
  const transport = resourceWorker(tab, () => tab.core.reset());
  const result = tab.scheduler.enqueue('resource', context => context.prepareResource(transport.worker, '/static/app.js', 'v1'));
  await b.tick(60000); await flush();
  assert.equal((await result).ok, false);
  assert.ok(transport.events.includes('CANCEL')); assert.equal(transport.events.includes('COMMIT'), false);
});

test('an orphan worker I/O lock also prevents overlapping JSON hydration in another tab', async () => {
  const b = browser(), tab = b.tab(); await flush();
  let release;
  const worker = tab.window.navigator.locks.request('admin:idle-resource:v1', async () => {
    await new Promise(resolve => { release = resolve; });
  });
  await flush();
  const result = tab.scheduler.enqueue('data', context => context.requestJSON('/api/admin/example'));
  await b.tick(60000); assert.equal(tab.requests.length, 0);
  release(); await worker; await b.tick(3000);
  assert.equal((await result).ok, true); assert.equal(tab.requests.length, 1);
});
