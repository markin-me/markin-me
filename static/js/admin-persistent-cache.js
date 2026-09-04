(function (window) {
  "use strict";

  const DB_NAME = "admin_persistent_cache";
  const DB_VERSION = 1;
  const STORE_NAME = "entries";
  const SCHEMA_VERSION = 1;
  const productRam = new Map();
  const productPending = new Map();
  const productGenerations = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("INDEXEDDB_UNAVAILABLE"));
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
    });
  }

  async function read(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result && request.result.schemaVersion === SCHEMA_VERSION
        ? request.result.data : null);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
    }).finally(() => db.close());
  }

  async function write(key, data) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put({
        key, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), data,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_WRITE_FAILED"));
    }).finally(() => db.close());
  }

  async function remove(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_DELETE_FAILED"));
    }).finally(() => db.close());
  }

  async function prunePrefix(prefix, maxEntries) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result
          .filter((entry) => String(entry.key).startsWith(prefix))
          .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
        entries.slice(Math.max(0, Number(maxEntries) || 0)).forEach((entry) => store.delete(entry.key));
        resolve();
      };
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_LIST_FAILED"));
    }).finally(() => db.close());
  }

  function productScopeKey(scope) {
    const tenantId = Number(scope?.tenantId || 0);
    const storeId = Number(scope?.storeId || 0);
    return `products:v1:t${Number.isFinite(tenantId) ? tenantId : 0}:s${Number.isFinite(storeId) ? storeId : 0}`;
  }

  async function readProductCatalog(scope) {
    const key = productScopeKey(scope);
    if (productRam.has(key)) return productRam.get(key);
    const data = await read(key);
    if (data && typeof data === "object") productRam.set(key, data);
    return data && typeof data === "object" ? data : null;
  }

  async function writeProductCatalog(scope, data) {
    const key = productScopeKey(scope);
    const previous = productRam.get(key) || await read(key).catch(() => null) || {};
    data = { ...previous, ...(data && typeof data === "object" ? data : {}) };
    productRam.set(key, data);
    try { await write(key, data); } catch (error) { console.warn("Product cache write failed", error); }
  }

  function loadProductCatalog(scope, loader, options = {}) {
    const key = productScopeKey(scope);
    const pendingKey = `${key}:${String(options.segment || "catalog")}`;
    if (productPending.has(pendingKey)) return productPending.get(pendingKey);
    const generation = productGenerations.get(key) || 0;
    const promise = Promise.resolve().then(loader).then(async (data) => {
      if ((productGenerations.get(key) || 0) === generation) await writeProductCatalog(scope, data);
      return data;
    }).finally(() => {
      if (productPending.get(pendingKey) === promise) productPending.delete(pendingKey);
    });
    productPending.set(pendingKey, promise);
    return promise;
  }

  function invalidateProductCatalog(scope) {
    const key = productScopeKey(scope);
    productGenerations.set(key, (productGenerations.get(key) || 0) + 1);
    productRam.delete(key);
    Array.from(productPending.keys()).filter((pendingKey) => pendingKey.startsWith(`${key}:`))
      .forEach((pendingKey) => productPending.delete(pendingKey));
    return remove(key).catch(() => {});
  }

  window.AdminPersistentCache = {
    read, write, remove, prunePrefix,
    readProductCatalog, writeProductCatalog, loadProductCatalog, invalidateProductCatalog,
  };
})(window);
