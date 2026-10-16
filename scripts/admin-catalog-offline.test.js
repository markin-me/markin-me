'use strict';

// Do not run automatically: AGENTS.md reserves test execution for the user.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../static/js/admin-catalog.js'), 'utf8').replace(/\r\n/g, '\n');
const copy = value => value == null ? value : structuredClone(value);

function passport(id, name = 'saved') {
  return { product: { id, name, price: 10 }, stock: {}, availability: {}, units: {}, unitConversions: [],
    productUnitLinks: [], ingredients: [], nestedIngredients: {}, variants: [], options: [], optionAssignments: [],
    comboRefs: [], defaultConfig: null, revision: { data_version: 'full-product-passport-v1' },
    editor: { schema_version: 'product-editor-v1', categories: [], discounts: [], relatedProductUnitLinks: {} } };
}

async function fixture() {
  const rows = new Map(), storage = new Map(), timers = new Map();
  let authorized = true, timer = 0;
  const cache = { complete: true, namespace: 'tenant-user-role-view-epoch-store', isCurrent: () => authorized,
    async get(key) { return copy(rows.get(key) ?? null); },
    async getMany(keys) { return new Map(keys.map(key => [key, copy(rows.get(key) ?? null)])); },
    async set(key, value) { rows.set(key, copy(value)); },
    async setMany(entries) { entries.forEach(([key, value]) => rows.set(key, copy(value))); },
    async removeMany(keys) { keys.forEach(key => rows.delete(key)); }, async remove(key) { rows.delete(key); },
  };
  const window = { crypto: webcrypto, navigator: { onLine: true, locks: { request: async (key, work) => work() } },
    localStorage: { getItem: key => storage.get(key) ?? (key === 'activeStoreId' ? '1' : null),
      setItem: (key, value) => storage.set(key, String(value)) },
    AdminAccessContext: { ok: true, local_context: { tenantId: 1 } },
    AdminLocalRepository: { isActive: () => authorized, ready: async () => authorized,
      capture: () => ({ isCurrent: () => authorized }), create: () => cache },
    setTimeout: callback => { timers.set(++timer, callback); return timer; }, clearTimeout: id => timers.delete(id),
    addEventListener() {},
  };
  const instrumented = source.replace('  void init();\n})(window);',
    '  window.catalogTest = { offlinePortion, stageOfflinePassports, scope: () => scope, generation: () => scopeGeneration };\n})(window);');
  if (instrumented === source) throw new Error('Catalog fixture boundary changed');
  vm.runInNewContext(instrumented, { window, document: { hidden: false, addEventListener() {} },
    navigator: window.navigator, localStorage: window.localStorage, console, DOMException, URLSearchParams });
  await window.CatalogRepository.init();
  const control = { allowed: true, quota: false, beforeCommit: null, afterCommit: null, commits: [] };
  const context = { assertCurrent() {
    if (!control.allowed || !authorized) throw new DOMException('Interrupted', 'AbortError');
  }, async commit(repository, entries, options) {
    context.assertCurrent();
    await control.beforeCommit?.();
    context.assertCurrent();
    if (!options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
    if (control.quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    // The fixture models an atomic transaction, not a real browser IndexedDB.
    entries.forEach(([key, value]) => rows.set(key, copy(value)));
    control.commits.push(copy(entries));
    await control.afterCommit?.();
  } };
  const api = window.CatalogRepository, internals = window.catalogTest;
  return { rows, control, context, api, revoke: () => { authorized = false; },
    externalWorkingWrite: () => storage.set('admin:catalog-write:v1:' + cache.namespace, webcrypto.randomUUID()),
    portion: fetch => internals.offlinePortion(context, internals.scope(), internals.generation(), fetch,
      (payload, references) => internals.stageOfflinePassports(payload, [1], references), { key: 'passports:1' }) };
}

test('offline data is unpublished until the atomic data/checkpoint commit', async () => {
  const f = await fixture();
  f.control.beforeCommit = async () => {
    assert.equal(f.api.getProduct(1), null);
    assert.equal(f.rows.has('passport:1'), false);
    assert.equal(f.rows.has('meta:offline:state'), false);
  };
  await f.portion(async () => ({ data: { 1: passport(1) } }));
  assert.equal(f.control.commits.length, 1);
  assert.ok(f.control.commits[0].some(([key]) => key === 'passport:1'));
  assert.ok(f.control.commits[0].some(([key]) => key === 'meta:offline:state'));
  assert.equal(f.api.getProduct(1).name, 'saved');
  assert.equal(f.rows.get('meta:offline:state').complete, false);
});

test('a cancelled response cannot escape later through ordinary flushPersistence', async () => {
  const f = await fixture();
  await assert.rejects(f.portion(async () => {
    f.control.allowed = false;
    return { data: { 1: passport(1, 'cancelled') } };
  }), { name: 'AbortError' });
  f.control.allowed = true;
  // Foreground ensureProducts(awaitPersistence) exercises the real dirty flush path.
  await f.api.ensureProducts([2], { requiredCompleteness: 'editor-ready', awaitPersistence: true,
    loader: async () => ({ data: { 2: passport(2, 'working') } }) });
  assert.equal(f.api.getProduct(1), null);
  assert.equal(f.rows.has('passport:1'), false);
  assert.equal(f.rows.has('meta:offline:state'), false);
  assert.equal(f.rows.get('passport:2').product.name, 'working');
});

test('quota failure publishes neither a passport nor a checkpoint', async () => {
  const f = await fixture(); f.control.quota = true;
  await assert.rejects(f.portion(async () => ({ data: { 1: passport(1) } })), { name: 'QuotaExceededError' });
  assert.equal(f.api.getProduct(1), null);
  assert.equal(f.rows.has('passport:1'), false);
  assert.equal(f.rows.has('meta:offline:state'), false);
});

test('a working update between response and transaction wins over the offline snapshot', async () => {
  const f = await fixture();
  f.control.beforeCommit = async () => { f.api.upsertProduct({ id: 1, name: 'working-newer', price: 20 }); };
  await assert.rejects(f.portion(async () => ({ data: { 1: passport(1, 'offline-older') } })), { name: 'AbortError' });
  assert.equal(f.api.getProduct(1).name, 'working-newer');
  assert.equal(f.rows.has('passport:1'), false);
  assert.equal(f.rows.has('meta:offline:state'), false);
});

test('scope revocation before commit leaves private runtime and checkpoint unpublished', async () => {
  const f = await fixture(); f.control.beforeCommit = async () => f.revoke();
  await assert.rejects(f.portion(async () => ({ data: { 1: passport(1) } })), { name: 'AbortError' });
  assert.equal(f.api.getProduct(1), null);
  assert.equal(f.rows.has('meta:offline:state'), false);
});

test('activity after staging cannot leak that portion through a later working flush', async () => {
  const f = await fixture();
  f.control.beforeCommit = async () => { f.control.allowed = false; };
  await assert.rejects(f.portion(async () => ({ data: { 1: passport(1) } })), { name: 'AbortError' });
  f.control.allowed = true; f.control.beforeCommit = null;
  await f.api.ensureProducts([2], { requiredCompleteness: 'editor-ready', awaitPersistence: true,
    loader: async () => ({ data: { 2: passport(2, 'working') } }) });
  assert.equal(f.api.getProduct(1), null);
  assert.equal(f.rows.has('passport:1'), false);
  assert.equal(f.rows.has('meta:offline:state'), false);
});

test('a working fence from another tab rejects a response without waiting for storage events', async () => {
  const f = await fixture();
  await assert.rejects(f.portion(async () => {
    f.externalWorkingWrite();
    return { data: { 1: passport(1) } };
  }), { name: 'AbortError' });
  assert.equal(f.rows.has('passport:1'), false);
  assert.equal(f.rows.has('meta:offline:state'), false);
});

test('revocation after commit keeps committed scoped records but does not publish them', async () => {
  const f = await fixture(); f.control.afterCommit = async () => f.revoke();
  await assert.rejects(f.portion(async () => ({ data: { 1: passport(1) } })), { name: 'AbortError' });
  assert.equal(f.rows.has('passport:1'), true);
  assert.equal(f.rows.has('meta:offline:state'), true);
  assert.equal(f.api.getProduct(1), null);
});

function serverHelpers() {
  const text = fs.readFileSync(path.join(__dirname, '../api/admin/products.js'), 'utf8');
  const helpers = text.slice(text.indexOf('  function catalogPage(input)'),
    text.indexOf("  router.post('/admin/catalog/product-targets'"));
  return vm.runInNewContext(helpers + '; ({catalogPage, sendCatalogPortion});', { Buffer });
}

test('paginated server mode rejects oversized limits and invalid keyset cursors', () => {
  const { catalogPage } = serverHelpers();
  assert.equal(catalogPage({}), null); // Legacy foreground mode is unchanged.
  assert.equal(catalogPage({ page: '1', after_id: '10', limit: '25' }).after, 10);
  for (const input of [{ page: true, limit: 26 }, { page: true, after_id: -1 }, { page: true, after_id: 1.5 }]) {
    assert.throws(() => catalogPage(input), error => error.status === 400);
  }
});

test('oversized server portions fail rather than being truncated and checkpointed', () => {
  const { sendCatalogPortion } = serverHelpers();
  const res = { code: 200, status(value) { this.code = value; return this; }, type() { return this; },
    json(value) { this.payload = value; return this; }, send(value) { this.payload = JSON.parse(value); return this; } };
  sendCatalogPortion(res, { ok: true, data: 'x'.repeat(256 * 1024) });
  assert.equal(res.code, 413);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.error, 'CATALOG_PORTION_TOO_LARGE');
});
