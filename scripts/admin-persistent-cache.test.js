"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "admin-persistent-cache.js"), "utf8");
function loadCache(values = {}) {
  const storage = new Map(Object.entries(values));
  const window = { __ADMIN_PERSISTENT_CACHE_TEST__: true, localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  } };
  vm.runInNewContext(source, { window, console, encodeURIComponent, decodeURIComponent });
  return window.AdminPersistentCache;
}

const cache = loadCache({ user: JSON.stringify({ id: 10 }), tenant: JSON.stringify({ id: 20 }), activeStoreId: "30" });
const base = cache.createScope({ domain: "orders:list", version: 1 });
assert.equal(base.complete, true);
assert.equal(base.namespace, "u10:t20:s30:orders%3Alist:v1");
assert.equal(cache.createScope({ domain: "orders:list", version: 1 }).namespace, base.namespace);
assert.notEqual(cache.createScope({ userId: 11, domain: "orders:list" }).namespace, base.namespace);
assert.notEqual(cache.createScope({ tenantId: 21, domain: "orders:list" }).namespace, base.namespace);
assert.notEqual(cache.createScope({ storeId: 31, domain: "orders:list" }).namespace, base.namespace);
assert.notEqual(cache.createScope({ domain: "orders:detail" }).namespace, base.namespace);
assert.notEqual(cache.createScope({ domain: "orders:list", version: 2 }).namespace, base.namespace);
assert.equal(typeof cache.read, "function");
assert.equal(typeof cache.write, "function");
assert.equal(typeof cache.remove, "function");
assert.equal(typeof cache.prunePrefix, "function");

const tenantFromUser = loadCache({ user: JSON.stringify({ id: 10, tenant_id: 20 }), activeStoreId: "30" });
assert.equal(tenantFromUser.currentIdentity().tenantId, 20);

const malformed = loadCache({ user: "{", tenant: "bad", activeStoreId: "30" });
assert.equal(malformed.currentIdentity().userId, null);
assert.equal(malformed.createScope({ domain: "orders:list" }).complete, false);
assert.equal(malformed.createScope({ domain: "orders:list" }).namespace, null);
assert.equal(cache.__test.entryIsStale({ expiresAt: 1001 }, 1000), false);
assert.equal(cache.__test.entryIsStale({ expiresAt: 1000 }, 1000), true);
assert.equal(cache.__test.entryIsStale({ expiresAt: null }, 1000), false);
assert.equal(cache.__test.entryIsStale({ expiresAt: "broken" }, 1000), false);

console.log("admin-persistent-cache focused checks passed");
