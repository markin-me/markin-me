'use strict';

// Unit tests only: no application server, database connection or browser launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../static/js/admin-local-repository.js'), 'utf8');
const referenceSource = fs.readFileSync(path.join(__dirname, '../static/js/admin-reference-cache.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '../static/js/auth.js'), 'utf8');
const layoutSource = fs.readFileSync(path.join(__dirname, '../views/layouts/app.ejs'), 'utf8');
const layoutGateSource = layoutSource.match(/\(function \(\) \{\s*var visibleScope = null;[\s\S]*?\}\)\(\);/)[0];
const layoutLoadSource = layoutSource.slice(layoutSource.indexOf('        var accessContextLoad = null;'),
  layoutSource.indexOf('        // Загрузить список точек продаж'));
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key) };
}
function session({ tenantId = 1, userId = 10, roleId = 100, view = 'a', legacy = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = { tenantId, userId: legacy ? null : userId, activeRoleId: legacy ? null : roleId,
    loginType: legacy ? 'tenant' : 'user', authStage: 'active', authVersion: 0, exp };
  return { token: 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature',
    data: { ok: true, roles: [], active_role: legacy ? null : { id: roleId }, permissions: [], stores: [],
      local_context: { formatVersion: 1, tenantId, principal: { type: legacy ? 'tenant' : 'user', id: String(legacy ? tenantId : userId) },
        activeRoleId: legacy ? null : roleId, authVersion: 0, accessViewId: view.repeat(64),
        confirmedAt: Date.now(), expiresAt: exp * 1000 } } };
}
function environment({ entries = new Map(), localStorage = storage(), sessionStorage = storage() } = {}) {
  const listeners = new Map();
  const env = { entries, failRead: false, failWrite: false, writeGate: null, readGate: null, timeOffset: 0 };
  const window = { localStorage, sessionStorage, crypto: webcrypto, navigator: { onLine: true },
    location: { pathname: '/dashboard/orders', href: '/dashboard/orders' },
    setTimeout: () => 0, clearTimeout: () => {},
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
    AdminPersistentCache: { resetRuntimeScope() {}, createScope(options) {
      const prefix = options.storageNamespace + ':';
      const guard = () => { if (options.guard && !options.guard()) throw new Error('LOCAL_SCOPE_CHANGED'); };
      const backend = { complete: true, namespace: options.storageNamespace,
        async getEntry(key, opts = {}) {
          if (env.readGate) await env.readGate;
          if (env.failRead) throw new Error('INDEXEDDB_READ_FAILED');
          const entry = copy(entries.get(prefix + key));
          if (!entry) return null;
          entry.stale = entry.expiresAt !== null && entry.expiresAt <= Date.now();
          return entry.stale && !opts.allowStale ? null : entry;
        },
        async getMany(keys, opts) { return new Map(await Promise.all(keys.map(async key => [key, await backend.getEntry(key, opts)]))); },
        async set(key, data, opts = {}) {
          if (env.writeGate) await env.writeGate;
          guard();
          if (opts.guard && !opts.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
          if (env.failWrite) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
          entries.set(prefix + key, { data: copy(data), updatedAt: Date.now(),
            expiresAt: opts.ttlMs > 0 ? Date.now() + opts.ttlMs : null, retainStale: options.retainStale });
          return true;
        },
        async setMany(values, opts) { guard(); if (env.failWrite) throw new Error('INDEXEDDB_WRITE_FAILED'); for (const [key, value] of values) await backend.set(key, value, opts); return true; },
        async remove(key) { guard(); entries.delete(prefix + key); },
        async removeMany(keys) { for (const key of keys) await backend.remove(key); },
        async clear() { guard(); for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key); },
        async prune() { guard(); },
      };
      return backend;
    } },
  };
  const sandbox = vm.createContext({ window, localStorage, sessionStorage,
    Date: class extends Date { static now() { return Date.now() + env.timeOffset; } },
    document: { addEventListener: window.addEventListener, body: { dataset: {} } }, Map, TextEncoder, Uint8Array, TypeError, URL, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
  vm.runInContext(source, sandbox);
  Object.assign(env, { window, core: window.AdminLocalRepository,
    references() { vm.runInContext(referenceSource, sandbox); return window.AdminReferenceCache; },
    auth(fetcher) { sandbox.fetch = fetcher; vm.runInContext(authSource, sandbox); return sandbox.authFetch; },
    serverBootstrap(context) { return sandbox.confirmServerAccessContext(context); },
    logout() { return sandbox.logout(); },
    finishLogout() { return sandbox.finishBrowserLogout(); },
    setFetcher(fetcher) { sandbox.fetch = fetcher; },
    layout(fetcher) {
      const attributes = new Map([['data-local-access', 'pending']]);
      const message = { textContent: '' };
      env.runtimeResets = 0; env.reloads = 0;
      env.states = ['pending']; env.timers = new Map();
      let timerId = 0;
      window.setTimeout = (callback, delay) => { env.timers.set(++timerId, { callback, delay }); return timerId; };
      window.clearTimeout = id => env.timers.delete(id);
      window.AdminPersistentCache.resetRuntimeScope = () => { env.runtimeResets++; };
      window.location.reload = () => { env.reloads++; };
      sandbox.document.documentElement = { getAttribute: key => attributes.get(key), setAttribute(key, value) {
        attributes.set(key, value);
        if (key === 'data-local-access') env.states.push(value);
      } };
      sandbox.document.getElementById = id => id === 'adminLocalAccessMessage' ? message : null;
      Object.assign(sandbox, { stores: [], allowedStoreIds: null, currentStoreId: null,
        applyStores() {}, updateUserInfo() {}, renderProfilePhoto() {}, applyNavigationPermissions() {}, renderRoleOptions() {} });
      vm.runInContext(layoutGateSource, sandbox);
      env.auth(fetcher);
      vm.runInContext(layoutLoadSource, sandbox);
      window.reloadAdminAccessContext = sandbox.loadAccessContext;
      return { load: sandbox.loadAccessContext, state: () => attributes.get('data-local-access'), message };
    },
    async confirm(value) { window.localStorage.setItem('authToken', value.token); await window.AdminLocalRepository.confirm(value.data, value.token, window.AdminLocalRepository.beginConfirmation()); },
    repository(options = {}) { return window.AdminLocalRepository.create({ domain: 'directory', ...options }); } });
  return env;
}

test('unconfirmed context cannot open a repository', () => {
  assert.throws(() => environment().repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
});
test('tenant-wide domain needs no store and reuses one record', async () => {
  const env = environment(); await env.confirm(session());
  await env.repository().set('item', { name: 'first' }, { lastSyncedAt: 123 });
  await env.repository().set('item', { name: 'second' }, { lastSyncedAt: 456 });
  assert.equal(env.entries.size, 1);
  const value = await env.repository().getEntry('item');
  assert.equal(value.data.name, 'second'); assert.equal(value.lastSyncedAt, 456);
});
for (const [name, change] of [['tenant', { tenantId: 2 }], ['user', { userId: 20 }], ['role', { roleId: 200 }], ['access view', { view: 'b' }]]) {
  test('isolation by ' + name, async () => {
    const env = environment(); await env.confirm(session());
    const old = env.repository(); await old.set('item', 'protected');
    await env.confirm(session(change));
    assert.equal(await env.repository().get('item'), null);
    await assert.rejects(old.get('item'), /LOCAL_SCOPE_CHANGED/);
    assert.equal(env.entries.size, 1);
  });
}
test('dimensions are canonical and organizational units are independent', async () => {
  const env = environment(); await env.confirm(session());
  const a = env.repository({ dimensions: { project: 'p1', unit: 'u1' } });
  const b = env.repository({ dimensions: { unit: 'u1', project: 'p1' } });
  assert.equal(a.namespace, b.namespace);
  await a.set('item', 'project data');
  assert.equal(await env.repository({ dimensions: { project: 'p2', unit: 'u1' } }).get('item'), null);
});
test('domain and data format version have independent namespaces', async () => {
  const env = environment(); await env.confirm(session()); await env.repository().set('item', 'v1');
  assert.equal(await env.repository({ domain: 'other' }).get('item'), null);
  assert.equal(await env.repository({ version: 2 }).get('item'), null);
});
test('offline reload restores only this confirmed browser session', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  await env.repository().set('item', 'saved', { lastSyncedAt: 100 });
  const reopened = environment({ entries: env.entries, localStorage: env.window.localStorage, sessionStorage: env.window.sessionStorage });
  reopened.window.navigator.onLine = false;
  const restored = await reopened.core.restore(login.token, reopened.core.beginConfirmation());
  assert.equal(restored.offline, true); assert.equal(await reopened.repository().get('item'), 'saved');
});
test('confirmation does not follow a different token with identical claims', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const other = login.token.replace('.signature', '.different-signature');
  env.window.localStorage.setItem('authToken', other);
  assert.equal(await env.core.restore(other, env.core.beginConfirmation()), null);
  assert.throws(() => env.repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
});
test('soft-expired data remains readable offline and exposes staleness', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  await repository.set('item', 'saved', { ttlMs: 1000 });
  env.entries.get(repository.namespace + ':item').expiresAt = Date.now() - 1;
  assert.equal(await repository.get('item'), null);
  env.window.navigator.onLine = false;
  assert.equal((await repository.getEntry('item')).stale, true);
  assert.equal(env.entries.size, 1);
});
test('legacy tenant principal is not impersonated by a user', async () => {
  const env = environment(); await env.confirm(session({ legacy: true })); await env.repository().set('item', 'tenant');
  await env.confirm(session({ userId: 1 })); assert.equal(await env.repository().get('item'), null);
});
test('logout invalidates handles without deleting pending data', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  await repository.set('item', 'saved'); env.entries.set('legacy:unconfirmed', { data: 'pending' });
  env.core.reset({ forget: true }); env.window.localStorage.removeItem('authToken');
  await assert.rejects(repository.get('item'), /LOCAL_SCOPE_CHANGED/);
  assert.equal(env.entries.get('legacy:unconfirmed').data, 'pending'); assert.equal(env.entries.size, 2);
});
test('a delayed write from an old context is rejected', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  let release; env.writeGate = new Promise(resolve => { release = resolve; });
  const write = repository.set('item', 'old'); const rejected = assert.rejects(write, /LOCAL_SCOPE_CHANGED/);
  await env.confirm(session({ roleId: 200 })); release(); await rejected;
  assert.equal(env.entries.size, 0);
});
test('IndexedDB errors are not presented as saved or missing data', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  await repository.set('item', 'saved'); env.failWrite = true;
  await assert.rejects(repository.set('item', 'lost'), /QuotaExceededError/);
  env.failWrite = false; assert.equal(await repository.get('item'), 'saved');
  env.failRead = true; await assert.rejects(repository.get('item'), /INDEXEDDB_READ_FAILED/);
});
test('batch read, write, removal and invalidation stay in one scope', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  await repository.setMany(new Map([['a', 1], ['b', 2]]));
  assert.equal((await repository.getMany(['a', 'b'])).get('b'), 2);
  await repository.removeMany(['a']); assert.equal(await repository.get('a'), null);
  await repository.invalidate(); assert.equal(await repository.get('b'), null);
});
test('two tabs share records without losing independent keys', async () => {
  const first = environment(); const second = environment({ entries: first.entries, localStorage: first.window.localStorage });
  const login = session(); await first.confirm(login); await second.confirm(login);
  await Promise.all([first.repository().set('a', 1), second.repository().set('b', 2)]);
  assert.equal(await first.repository().get('b'), 2); assert.equal(first.entries.size, 2);
});
test('reference adapter preserves single-flight and tenant-wide scope', async () => {
  const env = environment(); await env.confirm(session()); const references = env.references(); let calls = 0;
  const options = { load: async () => { calls++; return ['public reference']; } };
  await Promise.all([references.getOrLoadReference('stores', options), references.getOrLoadReference('stores', options)]);
  assert.equal(calls, 1); assert.equal(env.entries.size, 1);
  env.window.localStorage.setItem('activeStoreId', 'another-unit');
  assert.equal((await references.getOrLoadReference('stores', options))[0], 'public reference');
  assert.equal(calls, 1);
});
test('reference adapter never imports an unscoped legacy record', async () => {
  const env = environment(); await env.confirm(session()); env.entries.set('legacy:stores:value', { data: ['private'] });
  const value = await env.references().getOrLoadReference('stores', { load: async () => ['authorized'] });
  assert.equal(value[0], 'authorized'); assert.equal(env.entries.has('legacy:stores:value'), true);
});
test('reference write failure propagates and does not populate RAM', async () => {
  const env = environment(); await env.confirm(session()); const references = env.references(); env.failWrite = true;
  await assert.rejects(references.getOrLoadReference('stores', { load: async () => ['saved'] }), /QuotaExceededError/);
  env.failWrite = false;
  assert.equal((await references.getOrLoadReference('stores', { load: async () => ['retry'] }))[0], 'retry');
});

test('invalidating a reference prevents its in-flight write from restoring it', async () => {
  const env = environment(); await env.confirm(session()); const references = env.references();
  let releaseWrite; env.writeGate = new Promise(resolve => { releaseWrite = resolve; });
  let writeStarted; const started = new Promise(resolve => { writeStarted = resolve; });
  const originalScope = env.window.AdminPersistentCache.createScope;
  env.window.AdminPersistentCache.createScope = options => {
    const scope = originalScope(options); const set = scope.set;
    scope.set = (...args) => { writeStarted(); return set(...args); };
    return scope;
  };
  const request = references.getOrLoadReference('stores', { load: async () => ['old'] });
  const rejected = assert.rejects(request, /LOCAL_SCOPE_CHANGED/);
  await started;
  await references.invalidateReference('stores'); releaseWrite(); await rejected;
  assert.equal(env.entries.size, 0);
});

test('cross-tab identity changes revoke handles but profile-only changes do not', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository();
  await repository.set('item', 'saved');
  env.window.dispatchEvent({ type: 'storage', key: 'user', oldValue: '{"id":10,"tenant_id":1,"name":"old"}',
    newValue: '{"id":10,"tenant_id":1,"name":"new"}' });
  assert.equal(await repository.get('item'), 'saved');
  env.window.localStorage.removeItem('authToken');
  env.window.dispatchEvent({ type: 'storage', key: 'authToken', oldValue: 'token', newValue: null });
  await assert.rejects(repository.get('item'), /LOCAL_SCOPE_CHANGED/);
});

test('a rejected or expired server context never grants local access', async () => {
  const env = environment(); const login = session();
  env.window.localStorage.setItem('authToken', login.token);
  login.data.ok = false;
  await assert.rejects(env.core.confirm(login.data, login.token, env.core.beginConfirmation()), /LOCAL_CONTEXT_INVALID/);
  assert.throws(() => env.repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
  login.data.ok = true; login.data.local_context.expiresAt = Date.now() - 1;
  await assert.rejects(env.core.confirm(login.data, login.token, env.core.beginConfirmation()), /LOCAL_CONTEXT_INVALID/);
});

test('confirmation metadata is opaque and requires no domain-specific fields', async () => {
  const env = environment(); const login = session();
  login.data.metadata = { authorizationLabel: 'Example role', resources: [{ type: 'project', id: 'p1' }] };
  await env.confirm(login);
  const reopened = environment({ entries: env.entries, localStorage: env.window.localStorage, sessionStorage: env.window.sessionStorage });
  const restored = await reopened.core.restore(login.token, reopened.core.beginConfirmation());
  assert.equal(restored.metadata.resources[0].type, 'project');
  assert.equal(Object.hasOwn(restored, 'stores'), false);
});

test('logout in another tab rejects a delayed IndexedDB read before the storage event', async () => {
  const first = environment(); const login = session(); await first.confirm(login);
  const second = environment({ entries: first.entries, localStorage: first.window.localStorage }); await second.confirm(login);
  const repository = first.repository(); await repository.set('item', 'private');
  let release; first.readGate = new Promise(resolve => { release = resolve; });
  const reading = repository.get('item'); const rejected = assert.rejects(reading, /LOCAL_SCOPE_CHANGED/);
  second.core.reset({ forget: true }); release(); await rejected;
  assert.equal(first.core.isActive(), false);
});

test('a delayed reference response is rejected after remote context revocation', async () => {
  const first = environment(); const login = session(); await first.confirm(login);
  const second = environment({ entries: first.entries, localStorage: first.window.localStorage }); await second.confirm(login);
  let release, started; const loaded = new Promise(resolve => { started = resolve; });
  const reading = first.references().getOrLoadReference('stores', { load: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const rejected = assert.rejects(reading, /LOCAL_SCOPE_CHANGED/); await loaded;
  second.core.reset({ forget: true }); release(['private']); await rejected;
  assert.equal(first.entries.size, 0);
});

test('remote access view changes invalidate old scopes and offline confirmations', async () => {
  const first = environment(); const login = session(); await first.confirm(login);
  const old = first.repository(); await old.set('item', 'owner data');
  const second = environment({ entries: first.entries, localStorage: first.window.localStorage });
  await second.confirm(session({ view: 'b' }));
  await assert.rejects(old.get('item'), /LOCAL_SCOPE_CHANGED/);
  assert.equal(await first.core.restore(login.token, first.core.beginConfirmation()), null);
  assert.equal(await second.repository().get('item'), null);
});

test('an explicit logout cannot be undone by copying back an old confirmation and JWT', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const proof = env.window.sessionStorage.getItem('admin:local-confirmation:v1');
  env.core.reset({ forget: true });
  env.window.sessionStorage.setItem('admin:local-confirmation:v1', proof);
  assert.equal(await env.core.restore(login.token, env.core.beginConfirmation()), null);
});

test('an in-flight confirmation cannot revive a remotely revoked epoch', async () => {
  const first = environment(); const login = session(); await first.confirm(login);
  const second = environment({ localStorage: first.window.localStorage }); await second.confirm(login);
  const confirming = first.core.confirm(login.data, login.token, first.core.beginConfirmation());
  const rejected = assert.rejects(confirming, /LOCAL_SCOPE_CHANGED/);
  second.core.reset({ forget: true }); await rejected;
  assert.equal(first.core.isActive(), false);
});

test('a new browser session without its tab confirmation stays neutral offline', async () => {
  const first = environment(); const login = session(); await first.confirm(login); await first.repository().set('item', 'saved');
  const reopened = environment({ entries: first.entries, localStorage: first.window.localStorage });
  assert.equal(await reopened.core.restore(login.token, reopened.core.beginConfirmation()), null);
  assert.throws(() => reopened.repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
  assert.equal(first.entries.size, 1);
});

test('local access expiration is independent of a fresh record TTL', async () => {
  const env = environment(); const login = session(); login.data.local_context.offlineExpiresAt = Date.now() + 60000;
  await env.confirm(login); const repository = env.repository(); await repository.set('item', 'fresh', { ttlMs: 3600000 });
  env.timeOffset = 61000;
  await assert.rejects(repository.get('item'), /LOCAL_SCOPE_CHANGED/);
  assert.equal(env.entries.size, 1);
});

test('JWT expiration closes local access without deleting records', async () => {
  const env = environment(); await env.confirm(session()); const repository = env.repository(); await repository.set('item', 'saved');
  env.timeOffset = 7200000; assert.equal(env.core.isActive(), false);
  await assert.rejects(repository.get('item'), /LOCAL_SCOPE_CHANGED/);
  assert.equal(env.entries.size, 1);
});

for (const status of [401, 403]) {
  test('HTTP ' + status + ' revokes the local confirmation instead of using offline data', async () => {
    const env = environment(); const login = session(); await env.confirm(login);
    const authFetch = env.auth(async () => new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status }));
    if (status === 401) await assert.rejects(authFetch('/api/auth/me'), /UNAUTHORIZED/);
    else assert.equal((await authFetch('/api/auth/me')).status, 403);
    assert.equal(env.core.isActive(), false);
    assert.equal(env.window.sessionStorage.getItem('admin:local-confirmation:v1'), null);
  });
}

test('fresh online confirmation after revocation restores only the new authorized scope', async () => {
  const env = environment(); await env.confirm(session()); await env.repository().set('item', 'old');
  env.core.reset({ forget: true }); await env.confirm(session({ view: 'b' }));
  assert.equal(env.core.isActive(), true); assert.equal(await env.repository().get('item'), null);
});

test('a delayed authorization refusal cannot log out a newly confirmed identity', async () => {
  const env = environment(); await env.confirm(session()); let release;
  const authFetch = env.auth(() => new Promise(resolve => { release = resolve; }));
  const response = authFetch('/api/auth/me'); const rejected = assert.rejects(response, /LOCAL_SCOPE_CHANGED/);
  await env.confirm(session({ userId: 20, roleId: 200 }));
  release(new Response('{}', { status: 401 })); await rejected;
  assert.equal(env.core.isActive(), true);
  assert.notEqual(env.window.location.href, '/login');
});

test('reference adapter does not read or load data without an admissible context', async () => {
  const env = environment(); env.core.reset(); let calls = 0;
  await assert.rejects(env.references().getOrLoadReference('stores', { load: async () => { calls++; return []; } }), /LOCAL_CONTEXT_UNAVAILABLE/);
  assert.equal(calls, 0);
});

test('a changed shared context format rejects old handles and confirmations', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const repository = env.repository(); await repository.set('item', 'saved');
  const head = JSON.parse(env.window.localStorage.getItem('admin:local-access:v1')); head.version = 2;
  env.window.localStorage.setItem('admin:local-access:v1', JSON.stringify(head));
  await assert.rejects(repository.get('item'), /LOCAL_SCOPE_CHANGED/);
  assert.equal(await env.core.restore(login.token, env.core.beginConfirmation()), null);
  assert.equal(env.entries.size, 1);
});

test('sidebar navigation and reload keep the same shared session without flashing a denial', async () => {
  const login = session(); let previous = environment();
  await previous.confirm(login);
  const shared = previous.window.localStorage.getItem('admin:local-access:v1');
  const namespace = previous.repository().namespace;
  for (const pathname of ['/dashboard/team', '/dashboard/orders', '/dashboard/orders']) {
    const env = environment({ localStorage: previous.window.localStorage, sessionStorage: previous.window.sessionStorage });
    env.window.location.pathname = pathname;
    let requests = 0;
    const ui = env.layout(async (url, options) => {
      requests++; assert.equal(url, '/api/auth/me'); assert.equal(options.cache, 'no-store');
      return new Response(JSON.stringify(login.data));
    });
    const loading = ui.load();
    assert.equal(ui.load(), loading); assert.equal(ui.state(), 'pending'); assert.equal(ui.message.textContent, '');
    assert.equal(env.core.isActive(), false);
    await loading;
    assert.equal(ui.state(), 'active'); assert.equal(requests, 1);
    assert.equal(env.runtimeResets, 0); assert.equal(env.reloads, 0);
    assert.equal(env.window.localStorage.getItem('admin:local-access:v1'), shared);
    assert.equal(env.repository().namespace, namespace);
    previous = env;
  }
});

test('a slow auth/me keeps a neutral checking view and cannot expose private data early', async () => {
  const env = environment(); const login = session(); env.window.localStorage.setItem('authToken', login.token);
  let release;
  const ui = env.layout(() => new Promise(resolve => { release = resolve; }));
  const loading = ui.load();
  assert.equal(ui.state(), 'pending'); assert.equal(ui.message.textContent, '');
  assert.throws(() => env.repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
  release(new Response(JSON.stringify(login.data))); await loading;
  assert.equal(ui.state(), 'active');
});

test('temporary network loss opens only an admissible previously confirmed offline context', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const namespace = env.repository().namespace;
  const ui = env.layout(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal((await ui.load()).offline, true); assert.equal(ui.state(), 'active');
  assert.equal(env.repository().namespace, namespace); assert.equal(env.runtimeResets, 0);
});

test('network loss without a local confirmation is unavailable, not an authorization denial', async () => {
  const env = environment(); env.window.localStorage.setItem('authToken', session().token);
  const ui = env.layout(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await ui.load(), null); assert.equal(ui.state(), 'unavailable');
  assert.equal(env.core.isActive(), false);
});

for (const status of [401, 403]) {
  test('layout HTTP ' + status + ' stays denied and never restores the offline context', async () => {
    const env = environment(); await env.confirm(session());
    const ui = env.layout(async () => new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status }));
    assert.equal(await ui.load(), null); assert.equal(ui.state(), 'denied');
    assert.equal(env.core.isActive(), false);
    assert.equal(env.window.sessionStorage.getItem('admin:local-confirmation:v1'), null);
  });
}

test('a server failure is unavailable and does not masquerade as network/offline success', async () => {
  const env = environment(); await env.confirm(session());
  const ui = env.layout(async () => new Response(JSON.stringify({ ok: false, error: 'DB_ERROR' }), { status: 500 }));
  assert.equal(await ui.load(), null); assert.equal(ui.state(), 'unavailable');
  assert.equal(env.core.isActive(), false);
});

test('remote logout while auth/me JSON is delayed cannot repopulate identity or reveal the page', async () => {
  const env = environment(); const login = session(); login.data.user = { id: 10, name: 'PRIVATE' };
  await env.confirm(login);
  const other = environment({ localStorage: env.window.localStorage }); await other.confirm(login);
  let release, started;
  const reading = new Promise(resolve => { started = resolve; });
  const ui = env.layout(async () => ({ status: 200, ok: true,
    json: () => { started(); return new Promise(resolve => { release = resolve; }); } }));
  const loading = ui.load(); await reading;
  other.core.reset({ forget: true, reason: 'logout' });
  env.window.dispatchEvent({ type: 'storage', key: 'admin:local-access:v1' });
  assert.equal(ui.state(), 'denied');
  release(login.data); assert.equal(await loading, null);
  assert.equal(ui.state(), 'denied'); assert.equal(env.window.AdminAccessContext, null);
  assert.equal(env.window.localStorage.getItem('user'), null); assert.equal(env.core.isActive(), false);
});

for (const change of [{ roleId: 200 }, { view: 'b' }]) {
  test('an actual ' + (change.roleId ? 'role' : 'accessViewId') + ' change still locks the old interface', async () => {
    const env = environment(); const login = session(); let next = login;
    env.window.localStorage.setItem('authToken', login.token);
    const ui = env.layout(async () => new Response(JSON.stringify(next.data)));
    await ui.load(); assert.equal(ui.state(), 'active');
    const old = env.repository();
    next = session(change); if (!change.roleId) next.token = login.token;
    env.window.localStorage.setItem('authToken', next.token);
    await ui.load();
    assert.equal(ui.state(), 'pending'); assert.equal(old.isCurrent(), false); assert.equal(env.reloads, 1);
  });
}

function serverContext(login) {
  return { ...copy(login.data), token_binding: createHash('sha256').update(login.token).digest('hex') };
}

test('HTML bootstrap without an exact server token binding cannot authorize local reading', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const ui = env.layout(async () => { throw new Error('Unexpected auth/me fallback'); });
  env.window.AdminServerContextPromise = env.serverBootstrap(login.data);
  assert.equal(await ui.load(true), null); assert.equal(env.core.isActive(), false);
});

test('server-authorized navigation initializes locally without auth/me or a second generation', async () => {
  const login = session(); let previous = environment(); await previous.confirm(login);
  const shared = previous.window.localStorage.getItem('admin:local-access:v1');
  for (const path of ['/dashboard/orders', '/dashboard/team', '/dashboard/team']) {
    const env = environment({ entries: previous.entries, localStorage: previous.window.localStorage, sessionStorage: previous.window.sessionStorage });
    env.window.location.pathname = path; let requests = 0;
    const ui = env.layout(async () => { requests++; throw new Error('Unexpected network request'); });
    env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(login));
    assert.ok(await ui.load(true));
    assert.equal(ui.state(), 'active'); assert.equal(requests, 0); assert.equal(env.reloads, 0);
    assert.equal(env.runtimeResets, 0);
    assert.equal(env.window.localStorage.getItem('admin:local-access:v1'), shared);
    const scope = env.repository(); await scope.set('item', 'allowed');
    await ui.load(true); assert.equal(scope.isCurrent(), true);
    previous = env;
  }
});

test('server context requires the exact current JWT, not only matching tenant/user/role claims', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const other = { ...login, token: login.token.replace('.signature', '.another-session') };
  env.window.localStorage.setItem('authToken', other.token);
  const ui = env.layout(async () => { throw new Error('No network authorization fallback permitted'); });
  env.window.location.replace = value => { env.window.location.href = value; };
  env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(login));
  assert.equal(await ui.load(true), null); assert.equal(env.core.isActive(), false);
  assert.match(env.window.location.href, /^\/login\?connect-browser=1/);
  assert.notEqual(ui.state(), 'active');
});

test('logout during bootstrap hashing cannot revive the old server-authorized page', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const ui = env.layout(async () => { throw new TypeError('offline'); });
  const loading = env.serverBootstrap(serverContext(login));
  env.logout(); assert.equal(ui.state(), 'denied');
  assert.equal(await loading, null); assert.equal(env.core.isActive(), false);
  assert.equal(env.window.localStorage.getItem('authToken'), null);
  assert.equal(JSON.parse(env.window.localStorage.getItem('admin:logout-pending:v1')).token, login.token);
});

test('pending offline logout blocks a stale cookie bootstrap and all local reads after reopening', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  env.layout(async () => { throw new TypeError('offline'); }); env.logout();
  const reopened = environment({ localStorage: env.window.localStorage, sessionStorage: env.window.sessionStorage, entries: env.entries });
  const ui = reopened.layout(async () => { throw new TypeError('offline'); });
  reopened.window.AdminServerContextPromise = reopened.serverBootstrap(serverContext(login));
  assert.equal(await ui.load(true), null); assert.equal(reopened.core.isActive(), false);
  assert.throws(() => reopened.repository(), /LOCAL_CONTEXT_UNAVAILABLE/);
});

test('pending logout retries its original Bearer, never a newer identity token', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  env.layout(async () => { throw new TypeError('offline'); }); env.logout();
  await Promise.resolve(); await Promise.resolve();
  // Wait for the failed attempt before changing the mock network.
  await env.finishLogout().catch(() => {});
  const newer = session({ userId: 20 }); env.window.localStorage.setItem('authToken', newer.token);
  let bearer;
  env.setFetcher(async (url, options) => {
    assert.equal(url, '/api/auth/logout'); bearer = options.headers.Authorization;
    return new Response(JSON.stringify({ok:true,revocation:'all-user-sessions'}));
  });
  assert.equal(await env.finishLogout(), true);
  assert.equal(bearer, 'Bearer ' + login.token);
  assert.equal(env.window.localStorage.getItem('authToken'), newer.token);
  assert.equal(env.window.localStorage.getItem('admin:logout-pending:v1'), null);
});

for (const change of [{tenantId:2}, {userId:20}, {roleId:200}, {view:'b'}]) {
  test('server bootstrap isolates changed ' + Object.keys(change)[0] + ' without importing old data', async () => {
    const env = environment(); await env.confirm(session()); const old = env.repository(); await old.set('item', 'private old data');
    const next = session(change); env.window.localStorage.setItem('authToken', next.token);
    const ui = env.layout(async () => { throw new Error('Unexpected auth/me'); });
    env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(next));
    await ui.load(true);
    assert.equal(ui.state(), 'active'); assert.equal(old.isCurrent(), false);
    assert.equal(await env.repository().get('item'), null);
  });
}

test('an expired server descriptor cannot unlock a private page', async () => {
  const env = environment(); const login = session(); env.window.localStorage.setItem('authToken', login.token);
  const ui = env.layout(async () => { throw new Error('Unexpected auth/me'); });
  env.timeOffset = 7200000;
  env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(login));
  assert.equal(await ui.load(true), null); assert.equal(env.core.isActive(), false);
  assert.notEqual(ui.state(), 'active');
});

test('explicit refresh still calls auth/me after a successful HTML bootstrap', async () => {
  const env = environment(); const login = session(); env.window.localStorage.setItem('authToken', login.token); let requests = 0;
  const ui = env.layout(async () => { requests++; return new Response(JSON.stringify(login.data)); });
  env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(login));
  await ui.load(true); assert.equal(requests, 0);
  await ui.load(); assert.equal(requests, 1); assert.equal(ui.state(), 'active');
});

test('an old tab checks shared revocation on focus even before queued storage events arrive', async () => {
  const env = environment(); const login = session(); await env.confirm(login);
  const ui = env.layout(async () => { throw new Error('Unexpected auth/me'); });
  env.window.AdminServerContextPromise = env.serverBootstrap(serverContext(login)); await ui.load(true);
  const other = environment({localStorage:env.window.localStorage}); await other.confirm(login);
  other.core.reset({forget:true,reason:'logout'});
  env.window.dispatchEvent({type:'focus'});
  assert.equal(ui.state(),'denied'); assert.equal(env.core.isActive(),false);
});
