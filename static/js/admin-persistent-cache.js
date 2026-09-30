(function (window) {
  "use strict";

  const DB_NAME = "admin_persistent_cache";
  const DB_VERSION = 3;
  const STORE_NAME = "entries";
  const SCHEMA_VERSION = 2;
  const productRam = new Map();
  const productPending = new Map();
  const productGenerations = new Map();
  const ORDER_PASSPORT_DOMAIN = "orders:detail:shared";
  const ORDER_PASSPORT_VERSION = 1;
  const ORDER_PASSPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const ORDER_PASSPORT_MAX = 200;
  const MAINTENANCE_BATCH_SIZE = 50;
  const LEGACY_DETAIL_BATCH_SIZE = 25;
  const MAINTENANCE_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const EXPIRED_RETENTION_GRACE_MS = 24 * 60 * 60 * 1000;
  const PRODUCT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const MAINTENANCE_STORAGE_KEY = "admin:persistent-cache:last-maintenance:v1";
  const NON_EVICTABLE_DOMAIN = "orders:outbox:courier";
  let dbPromise = null;
  let maintenancePromise = null;

  function normalizePart(value) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized ? encodeURIComponent(normalized) : null;
  }

  function readJsonStorage(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null"); }
    catch (_) { return null; }
  }

  function readId(value, keys) {
    if (value == null) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    for (const key of keys) if (value[key] != null) return value[key];
    return null;
  }

  function currentIdentity() {
    let storeId = null;
    try { storeId = window.localStorage.getItem("activeStoreId") || null; } catch (_) {}
    const user = readJsonStorage("user");
    const tenant = readJsonStorage("tenant");
    return {
      userId: readId(user, ["id", "user_id"]),
      tenantId: readId(tenant, ["id", "tenant_id"]) ?? readId(user, ["tenant_id"]),
      storeId,
    };
  }

  function resolveScope(options = {}) {
    const identity = currentIdentity();
    const userId = options.userId ?? identity.userId;
    const tenantId = options.tenantId ?? identity.tenantId;
    const storeId = options.storeId ?? identity.storeId;
    const userPart = normalizePart(userId);
    const tenantPart = normalizePart(tenantId);
    const storePart = normalizePart(storeId);
    const domainPart = normalizePart(options.domain || "default");
    const requestedVersion = Number(options.version ?? 1);
    const version = Number.isFinite(requestedVersion) && requestedVersion > 0 ? requestedVersion : 1;
    const complete = Boolean(userPart && tenantPart && storePart);
    return {
      complete, userId, tenantId, storeId,
      domain: decodeURIComponent(domainPart), version,
      namespace: complete ? `u${userPart}:t${tenantPart}:s${storePart}:${domainPart}:v${version}` : null,
    };
  }

  function entryIsStale(entry, now = Date.now()) {
    const expiresAt = entry && typeof entry.expiresAt === "number" ? entry.expiresAt : null;
    return Number.isFinite(expiresAt) && expiresAt <= now;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        dbPromise = null;
        reject(new Error("INDEXEDDB_UNAVAILABLE"));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      request.onupgradeneeded = () => {
        const store = request.result.objectStoreNames.contains(STORE_NAME)
          ? request.transaction.objectStore(STORE_NAME)
          : request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        if (!store.indexNames.contains("namespace")) store.createIndex("namespace", "namespace");
        if (!store.indexNames.contains("namespace_updatedAt")) {
          store.createIndex("namespace_updatedAt", ["namespace", "updatedAt"]);
        }
        if (!store.indexNames.contains("expiresAt")) store.createIndex("expiresAt", "expiresAt");
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        dbPromise = null;
        reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
      };
      request.onblocked = () => {
        console.warn("Persistent cache database upgrade is blocked");
        if (settled) return;
        settled = true;
        dbPromise = null;
        reject(new Error("INDEXEDDB_OPEN_BLOCKED"));
      };
    });
    return dbPromise;
  }

  function requestOperation(mode, operation) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      let request;
      let result;
      try {
        transaction = db.transaction(STORE_NAME, mode);
        request = operation(transaction.objectStore(STORE_NAME));
      } catch (error) { reject(error); return; }
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPERATION_FAILED"));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
    }));
  }

  const readEntry = (key) => requestOperation("readonly", (store) => store.get(key));
  const deleteEntry = (key) => requestOperation("readwrite", (store) => store.delete(key));

  function requestMany(mode, operations) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      let settled = false;
      const results = new Array(operations.length);
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      try {
        transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        operations.forEach((operation, index) => {
          const request = operation(store);
          request.onsuccess = () => { results[index] = request.result; };
          request.onerror = () => fail(request.error || new Error("INDEXEDDB_OPERATION_FAILED"));
        });
      } catch (error) { fail(error); return; }
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(results);
      };
      transaction.onerror = () => fail(transaction.error || new Error("INDEXEDDB_TRANSACTION_FAILED"));
      transaction.onabort = () => fail(transaction.error || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
    }));
  }

  function isQuotaError(error) {
    if (!error) return false;
    const name = String(error.name || "").toLowerCase();
    const message = String(error.message || "").toLowerCase();
    return name === "quotaexceedederror" || name === "ns_error_dom_quota_reached"
      || message.includes("quota") || Number(error.code) === 22 || Number(error.code) === 1014;
  }

  function putEntry(key, namespace, data, version, ttlMs) {
    const now = Date.now();
    const ttl = Number(ttlMs);
    return requestOperation("readwrite", (store) => store.put({
      key, namespace, schemaVersion: SCHEMA_VERSION, version,
      createdAt: now, updatedAt: now,
      expiresAt: Number.isFinite(ttl) && ttl > 0 ? now + ttl : null,
      data,
    }));
  }

  function makeEntry(key, namespace, data, version, ttlMs, now = Date.now()) {
    const ttl = Number(ttlMs);
    return {
      key, namespace, schemaVersion: SCHEMA_VERSION, version,
      createdAt: now, updatedAt: now,
      expiresAt: Number.isFinite(ttl) && ttl > 0 ? now + ttl : null,
      data,
    };
  }

  async function writeEntry(key, namespace, data, version, ttlMs) {
    try {
      return await putEntry(key, namespace, data, version, ttlMs);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      console.warn("Persistent cache quota exceeded; running bounded safe cleanup");
      await cleanup({ reason: "quota", force: true }).catch((cleanupError) => {
        console.warn("Persistent cache quota cleanup failed", cleanupError);
      });
      return putEntry(key, namespace, data, version, ttlMs);
    }
  }

  function namespaceCursor(namespace, indexName, direction, handler) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(STORE_NAME, "readwrite");
        const index = transaction.objectStore(STORE_NAME).index(indexName);
        const range = indexName === "namespace_updatedAt"
          ? window.IDBKeyRange.bound([namespace, 0], [namespace, Number.MAX_SAFE_INTEGER])
          : window.IDBKeyRange.only(namespace);
        const request = index.openCursor(range, direction);
        request.onsuccess = () => handler(request.result);
        request.onerror = () => reject(request.error || new Error("INDEXEDDB_CURSOR_FAILED"));
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_ABORTED"));
    }));
  }

  function clearNamespace(namespace) {
    return namespaceCursor(namespace, "namespace", "next", (cursor) => {
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    });
  }

  function pruneNamespace(namespace, maxEntries, keyPrefix = null) {
    const keepLatest = Math.max(0, Math.trunc(Number(maxEntries) || 0));
    const now = Date.now();
    let kept = 0;
    return namespaceCursor(namespace, "namespace_updatedAt", "prev", (cursor) => {
      if (!cursor) return;
      if (!keyPrefix || String(cursor.value.key).startsWith(keyPrefix)) {
        if (entryIsStale(cursor.value, now) || kept >= keepLatest) cursor.delete();
        else kept += 1;
      }
      cursor.continue();
    });
  }

  function domainFromNamespace(namespace) {
    const match = String(namespace || "").match(/^u[^:]+:t[^:]+:s[^:]+:([^:]+):v\d+$/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch (_) { return null; }
  }

  function cursorCleanup(indexName, range, direction, limit, shouldDelete) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      let deleted = 0;
      let visited = 0;
      try {
        transaction = db.transaction(STORE_NAME, "readwrite");
        const index = transaction.objectStore(STORE_NAME).index(indexName);
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || visited >= limit) return;
          visited += 1;
          if (shouldDelete(cursor.value)) {
            cursor.delete();
            deleted += 1;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error("INDEXEDDB_CLEANUP_CURSOR_FAILED"));
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve({ visited, deleted });
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_ABORTED"));
    }));
  }

  function cleanupExpired(now, limit) {
    const cutoff = now - EXPIRED_RETENTION_GRACE_MS;
    return cursorCleanup("expiresAt", window.IDBKeyRange.upperBound(cutoff), "next", limit, (entry) => {
      return domainFromNamespace(entry?.namespace) !== NON_EVICTABLE_DOMAIN;
    });
  }

  function cleanupOldProducts(now, limit) {
    return cursorCleanup("namespace_updatedAt", null, "next", limit, (entry) => {
      return domainFromNamespace(entry?.namespace) === "products"
        && Number(entry?.updatedAt || 0) <= now - PRODUCT_RETENTION_MS;
    });
  }

  function collectNamespaceEntries(namespace, limit) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const entries = [];
      let transaction;
      try {
        transaction = db.transaction(STORE_NAME, "readonly");
        const index = transaction.objectStore(STORE_NAME).index("namespace");
        const request = index.openCursor(window.IDBKeyRange.only(namespace), "next");
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || entries.length >= limit) return;
          entries.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error("INDEXEDDB_LEGACY_CURSOR_FAILED"));
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(entries);
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_LEGACY_SCAN_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_LEGACY_SCAN_ABORTED"));
    }));
  }

  async function cleanupLegacyDetails(limit) {
    const shared = orderPassportScope();
    if (!shared.complete) return { visited: 0, deleted: 0 };
    let visited = 0;
    let deleted = 0;
    for (const domain of ["orders:detail:courier", "orders:detail:orders"]) {
      if (visited >= limit) break;
      const legacy = createScope({ domain, version: 1 });
      const entries = await collectNamespaceEntries(legacy.namespace, limit - visited);
      for (const entry of entries) {
        visited += 1;
        const orderId = String(entry.key || "").slice(`${legacy.namespace}:`.length);
        const canonical = await shared.getEntry(orderId, { allowStale: true });
        if (canonical?.data?.detailCompleteness === "full" && isFullOrderPassport(canonical.data.order)) {
          await deleteEntry(entry.key);
          deleted += 1;
        }
      }
    }
    return { visited, deleted };
  }

  function cleanup(options = {}) {
    if (maintenancePromise) return maintenancePromise;
    const now = Date.now();
    let lastRun = 0;
    try { lastRun = Number(window.localStorage.getItem(MAINTENANCE_STORAGE_KEY) || 0); } catch (_) {}
    if (!options.force && lastRun > 0 && now - lastRun < MAINTENANCE_INTERVAL_MS) {
      return Promise.resolve({ skipped: true, reason: "interval" });
    }
    maintenancePromise = (async () => {
      const expired = await cleanupExpired(now, MAINTENANCE_BATCH_SIZE);
      const remaining = Math.max(0, MAINTENANCE_BATCH_SIZE - expired.visited);
      const products = remaining > 0
        ? await cleanupOldProducts(now, remaining)
        : { visited: 0, deleted: 0 };
      const legacy = await cleanupLegacyDetails(LEGACY_DETAIL_BATCH_SIZE);
      try { window.localStorage.setItem(MAINTENANCE_STORAGE_KEY, String(Date.now())); } catch (_) {}
      return { skipped: false, expired, products, legacy };
    })().finally(() => { maintenancePromise = null; });
    return maintenancePromise;
  }

  function scheduleMaintenance() {
    const run = () => cleanup().catch((error) => console.warn("Persistent cache maintenance failed", error));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 5000 });
    else window.setTimeout(run, 0);
  }

  function createScope(options = {}) {
    const resolved = resolveScope(options);
    const scopedKey = (key) => resolved.complete
      ? `${resolved.namespace}:${normalizePart(key) || "_"}`
      : null;
    return {
      ...resolved,
      async getEntry(key, options = {}) {
        const storageKey = scopedKey(key);
        if (!storageKey) return null;
        const entry = await readEntry(storageKey);
        if (!entry || entry.schemaVersion !== SCHEMA_VERSION) return null;
        const stale = entryIsStale(entry);
        if (stale && !options.allowStale) return null;
        return { data: entry.data, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
          expiresAt: entry.expiresAt, schemaVersion: entry.schemaVersion, stale };
      },
      async get(key) { const entry = await this.getEntry(key); return entry ? entry.data : null; },
      async getMany(keys, options = {}) {
        const requested = Array.isArray(keys) ? keys : [];
        const storageKeys = requested.map(scopedKey);
        const result = new Map(requested.map((key) => [key, null]));
        if (!resolved.complete || !requested.length) return result;
        const entries = await requestMany("readonly", storageKeys.map((key) => (store) => store.get(key)));
        const now = Date.now();
        entries.forEach((entry, index) => {
          if (!entry || entry.schemaVersion !== SCHEMA_VERSION) return;
          if (entryIsStale(entry, now) && !options.allowStale) return;
          result.set(requested[index], options.entries === true ? {
            data: entry.data, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
            expiresAt: entry.expiresAt, schemaVersion: entry.schemaVersion,
            stale: entryIsStale(entry, now),
          } : entry.data);
        });
        return result;
      },
      set(key, data, options = {}) {
        const storageKey = scopedKey(key);
        if (!storageKey) return Promise.resolve(false);
        return writeEntry(storageKey, resolved.namespace, data, resolved.version, options.ttlMs).then(() => true);
      },
      async setMany(entries, options = {}) {
        const requested = entries instanceof Map ? [...entries.entries()] : (Array.isArray(entries) ? entries : []);
        if (!resolved.complete || !requested.length) return false;
        const now = Date.now();
        const records = requested.map(([key, data]) => makeEntry(
          scopedKey(key), resolved.namespace, data, resolved.version, options.ttlMs, now
        ));
        const write = () => requestMany("readwrite", records.map((entry) => (store) => store.put(entry)));
        try { await write(); }
        catch (error) {
          if (!isQuotaError(error)) throw error;
          console.warn("Persistent cache quota exceeded; running bounded safe cleanup");
          await cleanup({ reason: "quota", force: true }).catch((cleanupError) => {
            console.warn("Persistent cache quota cleanup failed", cleanupError);
          });
          await write();
        }
        return true;
      },
      remove(key) { const storageKey = scopedKey(key); return storageKey ? deleteEntry(storageKey) : Promise.resolve(false); },
      async removeMany(keys) {
        const storageKeys = (Array.isArray(keys) ? keys : []).map(scopedKey).filter(Boolean);
        if (!resolved.complete || !storageKeys.length) return false;
        await requestMany("readwrite", storageKeys.map((key) => (store) => store.delete(key)));
        return true;
      },
      clear() { return resolved.complete ? clearNamespace(resolved.namespace) : Promise.resolve(false); },
      prune(maxEntries) { return resolved.complete ? pruneNamespace(resolved.namespace, maxEntries) : Promise.resolve(false); },
    };
  }

  const scope = (options) => createScope(options);
  function legacyScope() { return resolveScope({ domain: "legacy", version: 1 }); }
  function legacyStorageKey(resolved, key) { return `${resolved.namespace}:${String(key)}`; }

  async function read(key) {
    const resolved = legacyScope();
    if (!resolved.complete) return null;
    const entry = await readEntry(legacyStorageKey(resolved, key));
    return entry && entry.schemaVersion === SCHEMA_VERSION ? entry.data : null;
  }

  async function write(key, data) {
    const resolved = legacyScope();
    if (!resolved.complete) return;
    await writeEntry(legacyStorageKey(resolved, key), resolved.namespace, data, 1);
  }

  async function remove(key) {
    const resolved = legacyScope();
    if (!resolved.complete) return;
    await deleteEntry(legacyStorageKey(resolved, key));
  }

  function prunePrefix(prefix, maxEntries) {
    const resolved = legacyScope();
    if (!resolved.complete) return Promise.resolve();
    return pruneNamespace(resolved.namespace, maxEntries, legacyStorageKey(resolved, prefix));
  }

  function productScope(options = {}) {
    return createScope({ domain: "products", version: 1,
      userId: options.userId, tenantId: options.tenantId, storeId: options.storeId });
  }

  async function readProductCatalog(options) {
    const cache = productScope(options);
    if (!cache.complete) return null;
    if (productRam.has(cache.namespace)) return productRam.get(cache.namespace);
    const data = await cache.get("catalog");
    if (data && typeof data === "object") productRam.set(cache.namespace, data);
    return data && typeof data === "object" ? data : null;
  }

  async function writeProductCatalog(options, data) {
    const cache = productScope(options);
    if (!cache.complete) return false;
    const previous = productRam.get(cache.namespace) || await cache.get("catalog").catch(() => null) || {};
    const next = { ...previous, ...(data && typeof data === "object" ? data : {}) };
    productRam.set(cache.namespace, next);
    try { await cache.set("catalog", next, { ttlMs: PRODUCT_RETENTION_MS }); return true; }
    catch (error) { console.warn("Product cache write failed", error); return false; }
  }

  function loadProductCatalog(options, loader, loadOptions = {}) {
    const cache = productScope(options);
    if (!cache.complete) return Promise.resolve().then(loader);
    const pendingKey = `${cache.namespace}:${String(loadOptions.segment || "catalog")}`;
    if (productPending.has(pendingKey)) return productPending.get(pendingKey);
    const generation = productGenerations.get(cache.namespace) || 0;
    const promise = Promise.resolve().then(loader).then(async (data) => {
      if ((productGenerations.get(cache.namespace) || 0) === generation) await writeProductCatalog(options, data);
      return data;
    }).finally(() => {
      if (productPending.get(pendingKey) === promise) productPending.delete(pendingKey);
    });
    productPending.set(pendingKey, promise);
    return promise;
  }

  function invalidateProductCatalog(options) {
    const cache = productScope(options);
    if (!cache.complete) return Promise.resolve(false);
    productGenerations.set(cache.namespace, (productGenerations.get(cache.namespace) || 0) + 1);
    productRam.delete(cache.namespace);
    Array.from(productPending.keys()).filter((key) => key.startsWith(`${cache.namespace}:`))
      .forEach((key) => productPending.delete(key));
    return cache.remove("catalog");
  }

  function resetRuntimeScope() {
    productRam.clear();
    productPending.clear();
    productGenerations.clear();
  }

  function isFullOrderPassport(order) {
    return Boolean(order && Array.isArray(order.items)
      && Number(order.store_id || order.storeId || 0) > 0);
  }

  function orderPassportScope(options = {}) {
    return createScope({
      domain: ORDER_PASSPORT_DOMAIN,
      version: ORDER_PASSPORT_VERSION,
      userId: options.userId,
      tenantId: options.tenantId,
      storeId: options.storeId,
    });
  }

  async function readOrderPassport(orderId, options = {}) {
    const id = Number(orderId || 0);
    const cache = options.cache || orderPassportScope(options);
    if (!(id > 0) || !cache.complete) return null;
    const entry = await cache.getEntry(String(id), { allowStale: options.allowStale !== false });
    if (!entry || entry.data?.detailCompleteness !== "full" || !isFullOrderPassport(entry.data.order)) return null;
    return { order: entry.data.order, stale: entry.stale === true, updatedAt: entry.updatedAt };
  }

  async function writeOrderPassport(order, options = {}) {
    const cache = options.cache || orderPassportScope(options);
    if (!options.authoritative || !cache.complete || !isFullOrderPassport(order)) return false;
    await cache.set(String(order.id), {
      cachedAt: Date.now(),
      detailCompleteness: "full",
      order: { ...order },
    }, { ttlMs: ORDER_PASSPORT_TTL_MS });
    await cache.prune(ORDER_PASSPORT_MAX);
    return true;
  }

  function mergeOrderPassportPatch(cachedOrder, patch) {
    const next = { ...(cachedOrder || {}) };
    const protectedNullableFields = new Set([
      "customer_name", "customer_phone", "address", "comment", "address_comment",
      "scheduled_at", "payment_code", "payment_title", "payment_icon",
      "method_code", "method_title", "time_option_code", "time_option_title", "time_option_icon",
      "discounts_json", "benefits_meta", "delivery_address_city", "delivery_address_street",
      "delivery_address_house", "delivery_address_entrance", "delivery_address_floor",
      "delivery_address_apartment", "delivery_address_ref", "delivery_address_context_locality",
      "delivery_address_normalized_display",
    ]);
    Object.keys(patch || {}).forEach((key) => {
      const value = patch[key];
      if (Array.isArray(value) && !isFullOrderPassport(patch)) return;
      if (protectedNullableFields.has(key) && value == null) return;
      if (["customer", "delivery", "payment"].includes(key)
        && value && typeof value === "object" && !Array.isArray(value)
        && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
        next[key] = { ...next[key], ...Object.fromEntries(
          Object.entries(value).filter(([, nestedValue]) => nestedValue != null)
        ) };
      } else if (value !== undefined) {
        next[key] = value;
      }
    });
    return next;
  }

  async function mergeOrderPassport(orderPatch, options = {}) {
    const id = Number(orderPatch?.id || 0);
    const cache = options.cache || orderPassportScope(options);
    if (!(id > 0) || !cache.complete) return false;
    const cached = await readOrderPassport(id, { cache, allowStale: true });
    if (!cached?.order) return false;
    return writeOrderPassport(mergeOrderPassportPatch(cached.order, orderPatch), {
      cache,
      authoritative: true,
    });
  }

  const orderPassport = {
    domain: ORDER_PASSPORT_DOMAIN,
    version: ORDER_PASSPORT_VERSION,
    ttlMs: ORDER_PASSPORT_TTL_MS,
    maxEntries: ORDER_PASSPORT_MAX,
    scope: orderPassportScope,
    isFull: isFullOrderPassport,
    read: readOrderPassport,
    write: writeOrderPassport,
    merge: mergeOrderPassport,
    mergePatch: mergeOrderPassportPatch,
  };

  window.AdminPersistentCache = { read, write, remove, prunePrefix, scope, createScope, cleanup,
    scheduleMaintenance, isQuotaError,
    currentIdentity, resetRuntimeScope, readProductCatalog, writeProductCatalog,
    loadProductCatalog, invalidateProductCatalog, orderPassport };
  if (window.__ADMIN_PERSISTENT_CACHE_TEST__) {
    window.AdminPersistentCache.__test = { resolveScope, entryIsStale };
  }
})(window);
