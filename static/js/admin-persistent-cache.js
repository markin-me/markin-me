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
    try { return JSON.parse((key === 'user' && window.getAuthLocalValue ? window.getAuthLocalValue(key) : window.localStorage.getItem(key)) || "null"); }
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
    // Explicit namespaces support principal/role/domain scopes without imposing a store.
    // Authorization and scope lifecycle belong to the caller, not this storage primitive.
    if (options.storageNamespace !== undefined) {
      if (typeof options.storageNamespace !== 'string' || !options.storageNamespace) throw new Error('INVALID_STORAGE_NAMESPACE');
      return { complete: true, namespace: options.storageNamespace, domain: options.domain, version: options.version || 1 };
    }
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
    const deadline = entry?.retainStale ? (entry.staleAt ?? entry.expiresAt) : entry?.expiresAt;
    const expiresAt = typeof deadline === "number" ? deadline : null;
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

  async function decodeEntry(entry) {
    if (!entry || !window.CourierOfflineVault) return entry;
    return { ...entry, data: await window.CourierOfflineVault.decode(entry.key, entry.namespace, entry.data) };
  }
  async function encodeEntry(entry) {
    if (window.CourierOfflineVault) entry.data = await window.CourierOfflineVault.encode(entry.key, entry.namespace, entry.data);
    return entry;
  }
  async function casToken(data) {
    const json = JSON.stringify(data ?? null);
    if (data?.courierEncrypted !== 1) return json;
    const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return 'courier-sha256:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const readEntry = async (key) => decodeEntry(await requestOperation("readonly", (store) => store.get(key)));
  const deleteEntry = (key, options = {}) => requestOperation("readwrite", (store) => {
    if (options.guard && !options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
    return store.delete(key);
  });

  function requestMany(mode, operations, options = {}) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      let settled = false;
      const assertCurrent = () => {
        if (options.signal?.aborted) throw new DOMException('Local write interrupted', 'AbortError');
        if (options.guard && !options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
      };
      const onAbort = () => { try { transaction?.abort(); } catch (_) {} };
      const detach = () => options.signal?.removeEventListener('abort', onAbort);
      const results = new Array(operations.length);
      const fail = (error) => {
        if (settled) return;
        settled = true;
        detach();
        reject(error);
      };
      try {
        assertCurrent();
        transaction = db.transaction(STORE_NAME, mode);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        const store = transaction.objectStore(STORE_NAME);
        operations.forEach((operation, index) => {
          assertCurrent();
          const request = operation(store);
          request.onsuccess = () => {
            try { assertCurrent(); results[index] = request.result; }
            catch (error) { onAbort(); fail(error); }
          };
          request.onerror = () => fail(request.error || new Error("INDEXEDDB_OPERATION_FAILED"));
        });
      } catch (error) {
        if (transaction) transaction.abort();
        fail(error);
        return;
      }
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        detach();
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

  async function putEntry(key, namespace, data, version, ttlMs, options = {}) {
    const now = Date.now();
    const ttl = Number(ttlMs);
    const deadline = Number.isFinite(ttl) && ttl > 0 ? now + ttl : null;
    const encoded = await encodeEntry({ key, namespace, data });
    return requestOperation("readwrite", (store) => {
      if (options.guard && !options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
      return store.put({
        key, namespace, schemaVersion: SCHEMA_VERSION, version,
        createdAt: now, updatedAt: now,
        expiresAt: options.retainStale ? null : deadline,
        data: encoded.data,
        ...(options.retainStale ? { retainStale: true, staleAt: deadline } : {}),
      });
    });
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

  async function writeEntry(key, namespace, data, version, ttlMs, options = {}) {
    try {
      return await putEntry(key, namespace, data, version, ttlMs, options);
    } catch (error) {
      if (options.noQuotaCleanup || !isQuotaError(error)) throw error;
      console.warn("Persistent cache quota exceeded; running bounded safe cleanup");
      await cleanup({ reason: "quota", force: true }).catch((cleanupError) => {
        console.warn("Persistent cache quota cleanup failed", cleanupError);
      });
      return putEntry(key, namespace, data, version, ttlMs, options);
    }
  }

  function namespaceCursor(namespace, indexName, direction, handler, options = {}) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let transaction;
      try {
        if (options.guard && !options.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
        transaction = db.transaction(STORE_NAME, "readwrite");
        const index = transaction.objectStore(STORE_NAME).index(indexName);
        const range = indexName === "namespace_updatedAt"
          ? window.IDBKeyRange.bound([namespace, 0], [namespace, Number.MAX_SAFE_INTEGER])
          : window.IDBKeyRange.only(namespace);
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
          if (options.guard && !options.guard()) { transaction.abort(); return; }
          handler(request.result);
        };
        request.onerror = () => reject(request.error || new Error("INDEXEDDB_CURSOR_FAILED"));
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_CLEANUP_ABORTED"));
    }));
  }

  function clearNamespace(namespace, options = {}) {
    return namespaceCursor(namespace, "namespace", "next", (cursor) => {
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    }, options);
  }

  function pruneNamespace(namespace, maxEntries, keyPrefix = null, options = {}) {
    const keepLatest = Math.max(0, Math.trunc(Number(maxEntries) || 0));
    const now = Date.now();
    let kept = 0;
    return namespaceCursor(namespace, "namespace_updatedAt", "prev", (cursor) => {
      if (!cursor) return;
      if (!keyPrefix || String(cursor.value.key).startsWith(keyPrefix)) {
        if ((!cursor.value.retainStale && entryIsStale(cursor.value, now)) || kept >= keepLatest) cursor.delete();
        else kept += 1;
      }
      cursor.continue();
    }, options);
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
      const domain = domainFromNamespace(entry?.namespace);
      const legacyOrders = domain?.startsWith('orders:') || (domain === 'legacy' && String(entry?.key).includes('orders:'));
      return !entry?.retainStale && !legacyOrders && domain !== NON_EVICTABLE_DOMAIN;
    });
  }

  function cleanupOldProducts(now, limit) {
    return cursorCleanup("namespace_updatedAt", null, "next", limit, (entry) => {
      return domainFromNamespace(entry?.namespace) === "products"
        && Number(entry?.updatedAt || 0) <= now - PRODUCT_RETENTION_MS;
    });
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
      // Unscoped detail records are kept, never promoted/deleted on the basis of a new access view.
      const legacy = { visited: 0, deleted: 0 };
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
    const writeOptions = { guard: options.guard, retainStale: options.retainStale === true };
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
          expiresAt: entry.staleAt ?? entry.expiresAt, schemaVersion: entry.schemaVersion, stale };
      },
      async get(key) { const entry = await this.getEntry(key); return entry ? entry.data : null; },
      async scanEntries(options = {}) {
        if (!resolved.complete) return { entries: [], cursor: null };
        const prefix = resolved.namespace + ':';
        const after = options.cursor;
        if (after != null && (typeof after !== 'string' || !after.startsWith(prefix))) throw new Error('INVALID_LOCAL_CURSOR');
        const limit = Math.min(25, Math.max(1, Math.floor(Number(options.limit) || 25)));
        const assertCurrent = () => {
          if (options.signal?.aborted) throw new DOMException('Local read interrupted', 'AbortError');
          if ((writeOptions.guard && !writeOptions.guard()) || (options.guard && !options.guard())) throw new Error('LOCAL_SCOPE_CHANGED');
        };
        assertCurrent();
        const db = await openDb();
        return new Promise((resolve, reject) => {
          const entries = []; let transaction, next = null, failure = null;
          const abort = () => { try { transaction?.abort(); } catch (_) {} };
          try {
            assertCurrent();
            transaction = db.transaction(STORE_NAME, 'readonly');
            options.signal?.addEventListener('abort', abort, { once: true });
            const range = window.IDBKeyRange.bound(after || prefix, prefix + '\uffff', Boolean(after), false);
            const request = transaction.objectStore(STORE_NAME).openCursor(range);
            request.onsuccess = () => {
              try {
                assertCurrent();
                const cursor = request.result;
                if (!cursor) return;
                if (cursor.value.namespace !== resolved.namespace) throw new Error('LOCAL_SCOPE_CHANGED');
                entries.push({ key: decodeURIComponent(cursor.key.slice(prefix.length)), entry: cursor.value });
                if (entries.length === limit) { next = cursor.key; return; }
                cursor.continue();
              } catch (error) { failure = error; abort(); }
            };
            request.onerror = () => { failure = request.error; abort(); };
          } catch (error) { options.signal?.removeEventListener('abort', abort); reject(error); return; }
          const cleanup = () => options.signal?.removeEventListener('abort', abort);
            transaction.oncomplete = () => {
              cleanup();
              Promise.all(entries.map(async row => ({ ...row, entry: await decodeEntry(row.entry) })))
                .then(decoded => { assertCurrent(); resolve({ entries: decoded, cursor: next }); }).catch(reject);
            };
          transaction.onabort = transaction.onerror = () => { cleanup(); reject(failure || transaction.error || new DOMException('Local read interrupted', 'AbortError')); };
        });
      },
      async getMany(keys, options = {}) {
        const requested = Array.isArray(keys) ? keys : [];
        const storageKeys = requested.map(scopedKey);
        const result = new Map(requested.map((key) => [key, null]));
        if (!resolved.complete || !requested.length) return result;
        const raw = await requestMany("readonly", storageKeys.map((key) => (store) => store.get(key)));
        const entries = await Promise.all(raw.map(decodeEntry));
        const now = Date.now();
        entries.forEach((entry, index) => {
          if (!entry || entry.schemaVersion !== SCHEMA_VERSION) return;
          if (entryIsStale(entry, now) && !options.allowStale) return;
          result.set(requested[index], options.entries === true ? {
            data: entry.data, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
            expiresAt: entry.staleAt ?? entry.expiresAt, schemaVersion: entry.schemaVersion,
            stale: entryIsStale(entry, now),
          } : entry.data);
        });
        return result;
      },
      set(key, data, options = {}) {
        const storageKey = scopedKey(key);
        if (!storageKey) return Promise.resolve(false);
        const guardedWrite = { ...writeOptions, guard: () => (!writeOptions.guard || writeOptions.guard())
          && (!options.guard || options.guard()), noQuotaCleanup: options.noQuotaCleanup === true };
        return writeEntry(storageKey, resolved.namespace, data, resolved.version, options.ttlMs, guardedWrite).then(() => true);
      },
      async compareTokens(keys) {
        // CAS compares durable ciphertext, not freshly encrypted/plaintext values.
        const entries = await requestMany('readonly', keys.map(key => store => store.get(scopedKey(key))));
        return Promise.all(keys.map(async (key, i) => [key, await casToken(entries[i]?.data ?? null)]));
      },
      async compareAndSetMany(expected, entries, options = {}) {
        if (!resolved.complete || !Array.isArray(expected) || !expected.length || expected.length > 12
            || !Array.isArray(entries) || !entries.length || entries.length > 12
            || expected.some(([key, token]) => !scopedKey(key) || typeof token !== 'string')
            || expected.reduce((sum, [, token]) => sum + token.length, 0) > 512 * 1024) throw new Error('INVALID_LOCAL_CAS');
        // Hash tokens avoid reducing the existing plaintext budget by base64 overhead.
        // Hash outside IDB; compare the EXACT preflight ciphertext again INSIDE the
        // write transaction. There is no async crypto/transaction inactivity gap.
        const hashed = expected.filter(([, token]) => /^courier-sha256:[a-f0-9]{64}$/.test(token));
        const preflight = new Map();
        if (hashed.length) {
          const snapshots = await requestMany('readonly', hashed.map(([key]) => store => store.get(scopedKey(key))));
          let plainUnits = expected.filter(([, token]) => !token.startsWith('courier-sha256:')).reduce((n, [, token]) => n + token.length, 0);
          await Promise.all(snapshots.map(async (entry, index) => {
            const data = entry?.schemaVersion === SCHEMA_VERSION ? entry.data : null;
            if (await casToken(data) !== hashed[index][1]) throw new Error('LOCAL_CAS_MISMATCH');
            plainUnits += JSON.stringify((await decodeEntry(entry))?.data ?? null).length;
            preflight.set(hashed[index][0], JSON.stringify(data));
          }));
          if (plainUnits > 512 * 1024) throw new Error('INVALID_LOCAL_CAS');
        }
        const now = Date.now();
        const records = await Promise.all(entries.map(([key, data]) => encodeEntry(makeEntry(scopedKey(key), resolved.namespace, data, resolved.version, options.ttlMs, now))));
        if (writeOptions.retainStale) records.forEach(entry => {
          entry.retainStale = true; entry.staleAt = entry.expiresAt; entry.expiresAt = null;
        });
        const assertCurrent = () => {
          if (options.signal?.aborted) throw new DOMException('CAS interrupted', 'AbortError');
          if ((writeOptions.guard && !writeOptions.guard()) || (options.guard && !options.guard())) throw new Error('LOCAL_SCOPE_CHANGED');
        };
        assertCurrent();
        const db = await openDb();
        return new Promise((resolve, reject) => {
          let tx, failure = null, remaining = expected.length;
          const abort = () => { try { tx?.abort(); } catch (_) {} };
          const fail = error => { failure = error; abort(); };
          try {
            assertCurrent(); tx = db.transaction(STORE_NAME, 'readwrite');
            options.signal?.addEventListener('abort', abort, { once: true });
            const store = tx.objectStore(STORE_NAME);
            expected.forEach(([key, token]) => {
              const request = store.get(scopedKey(key));
              request.onsuccess = () => {
                try {
                  assertCurrent();
                  const entry = request.result;
                  const actual = entry?.schemaVersion === SCHEMA_VERSION ? entry.data : null;
                  if (JSON.stringify(actual) !== (preflight.has(key) ? preflight.get(key) : token)) throw new Error('LOCAL_CAS_MISMATCH');
                  if (--remaining === 0) records.forEach(record => {
                    assertCurrent();
                    const write = store.put(record);
                    write.onsuccess = () => { try { assertCurrent(); } catch (error) { fail(error); } };
                    write.onerror = () => fail(write.error);
                  });
                } catch (error) { fail(error); }
              };
              request.onerror = () => fail(request.error);
            });
          } catch (error) { if (!tx) { reject(error); return; } fail(error); }
          const detach = () => options.signal?.removeEventListener('abort', abort);
          tx.oncomplete = () => { detach(); resolve(true); };
          tx.onabort = tx.onerror = () => { detach(); reject(failure || tx.error || new Error('LOCAL_CAS_ABORTED')); };
        }); // No quota cleanup/retry: keep the old passport and all user actions.
      },
      async setMany(entries, options = {}) {
        const requested = entries instanceof Map ? [...entries.entries()] : (Array.isArray(entries) ? entries : []);
        if (!resolved.complete || !requested.length) return false;
        const now = Date.now();
        const records = await Promise.all(requested.map(([key, data]) => encodeEntry(makeEntry(
          scopedKey(key), resolved.namespace, data, resolved.version, options.ttlMs, now
        ))));
        if (writeOptions.retainStale) records.forEach(entry => {
          entry.retainStale = true;
          entry.staleAt = entry.expiresAt;
          entry.expiresAt = null;
        });
        const write = () => requestMany("readwrite", records.map((entry, index) => (store) => {
          if (index === 0 && ((writeOptions.guard && !writeOptions.guard()) || (options.guard && !options.guard()))) {
            throw new Error('LOCAL_SCOPE_CHANGED');
          }
          return store.put(entry);
        }), { signal: options.signal, guard: () => (!writeOptions.guard || writeOptions.guard())
          && (!options.guard || options.guard()) });
        try { await write(); }
        catch (error) {
          if (options.noQuotaCleanup) throw error;
          if (!isQuotaError(error)) throw error;
          console.warn("Persistent cache quota exceeded; running bounded safe cleanup");
          await cleanup({ reason: "quota", force: true }).catch((cleanupError) => {
            console.warn("Persistent cache quota cleanup failed", cleanupError);
          });
          await write();
        }
        return true;
      },
      remove(key) { const storageKey = scopedKey(key); return storageKey ? deleteEntry(storageKey, writeOptions) : Promise.resolve(false); },
      async removeMany(keys) {
        const storageKeys = (Array.isArray(keys) ? keys : []).map(scopedKey).filter(Boolean);
        if (!resolved.complete || !storageKeys.length) return false;
        await requestMany("readwrite", storageKeys.map((key, index) => (store) => {
          if (index === 0 && writeOptions.guard && !writeOptions.guard()) throw new Error('LOCAL_SCOPE_CHANGED');
          return store.delete(key);
        }));
        return true;
      },
      clear() { return resolved.complete ? clearNamespace(resolved.namespace, writeOptions) : Promise.resolve(false); },
      prune(maxEntries) { return resolved.complete ? pruneNamespace(resolved.namespace, maxEntries, null, writeOptions) : Promise.resolve(false); },
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
    const repository = window.AdminLocalRepository;
    if (!repository?.isActive()) return null;
    const storeId = String(options.storeId || currentIdentity().storeId || '');
    return repository.create({ domain: 'products', version: 2,
      dimensions: storeId ? { organizationalUnit: { type: 'store', id: storeId } } : {},
      guard: () => String(currentIdentity().storeId || '') === storeId });
  }

  async function readProductCatalog(options) {
    const cache = productScope(options);
    if (!cache?.isCurrent()) return null;
    if (productRam.has(cache.namespace)) return productRam.get(cache.namespace);
    const data = await cache.get("catalog", { allowStale: true });
    if (!cache.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    if (data && typeof data === "object") productRam.set(cache.namespace, data);
    return data && typeof data === "object" ? data : null;
  }

  async function writeProductCatalog(options, data) {
    const cache = productScope(options);
    if (!cache?.isCurrent()) return false;
    const previous = productRam.get(cache.namespace) || await cache.get("catalog").catch(() => null) || {};
    if (!cache.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    const next = { ...previous, ...(data && typeof data === "object" ? data : {}) };
    try {
      await cache.set("catalog", next, { ttlMs: PRODUCT_RETENTION_MS });
      if (!cache.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
      productRam.set(cache.namespace, next);
      return true;
    }
    catch (error) { console.warn("Product cache write failed", error); return false; }
  }

  function loadProductCatalog(options, loader, loadOptions = {}) {
    const cache = productScope(options);
    if (!cache?.isCurrent()) return Promise.reject(new Error('LOCAL_CONTEXT_UNAVAILABLE'));
    const pendingKey = `${cache.namespace}:${String(loadOptions.segment || "catalog")}`;
    if (productPending.has(pendingKey)) return productPending.get(pendingKey);
    const generation = productGenerations.get(cache.namespace) || 0;
    const promise = Promise.resolve().then(loader).then(async (data) => {
      if (!cache.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
      if ((productGenerations.get(cache.namespace) || 0) === generation) await writeProductCatalog(options, data);
      if (!cache.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
      return data;
    }).finally(() => {
      if (productPending.get(pendingKey) === promise) productPending.delete(pendingKey);
    });
    productPending.set(pendingKey, promise);
    return promise;
  }

  function invalidateProductCatalog(options) {
    const cache = productScope(options);
    if (!cache?.isCurrent()) return Promise.resolve(false);
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
    const repository = window.AdminLocalRepository;
    if (!repository?.isActive()) return null;
    const storeId = String(options.storeId ?? window.localStorage.getItem('activeStoreId') ?? '1');
    return repository.create({ domain: ORDER_PASSPORT_DOMAIN, version: ORDER_PASSPORT_VERSION,
      dimensions: { organizationalUnit: { type: 'store', id: storeId }, accessContext: options.accessContext || 'orders' },
      guard: () => storeId === String(window.localStorage.getItem('activeStoreId') || '1') });
  }

  async function readOrderPassport(orderId, options = {}) {
    const id = Number(orderId || 0);
    const cache = options.cache || orderPassportScope(options);
    if (!(id > 0) || !cache?.complete) return null;
    const entry = await cache.getEntry(String(id), { allowStale: options.allowStale !== false });
    if (!entry || entry.data?.detailCompleteness !== "full" || !isFullOrderPassport(entry.data.order)) return null;
    return { order: entry.data.order, stale: entry.stale === true, updatedAt: entry.updatedAt };
  }

  async function writeOrderPassport(order, options = {}) {
    const cache = options.cache || orderPassportScope(options);
    if (!options.authoritative || !cache?.complete || !isFullOrderPassport(order)) return false;
    await cache.set(String(order.id), {
      cachedAt: Date.now(),
      detailCompleteness: "full",
      order: { ...order },
    }, { ttlMs: ORDER_PASSPORT_TTL_MS, lastSyncedAt: Date.now() });
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
    if (!(id > 0) || !cache?.complete) return false;
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

  async function encryptCourierEntries() {
    const vault = window.CourierOfflineVault;
    if (!vault?.isUnlocked()) throw new Error('OFFLINE_UNLOCK_REQUIRED');
    const db = await openDb();
    // Read-only inventory, encryption outside IDB transactions, bounded CAS commits.
    const records = await requestOperation('readonly', store => store.getAll());
    const pending = records.filter(entry => vault.privateEntry(entry.key, entry.namespace) && entry.data?.courierEncrypted !== 1);
    for (let offset = 0; offset < pending.length; offset += 25) {
      const batch = await Promise.all(pending.slice(offset, offset + 25).map(async original => ({
        original, encoded: await encodeEntry({ ...original })
      })));
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME);
        let failure;
        for (const { original, encoded } of batch) {
          const request = store.get(original.key);
          request.onsuccess = () => {
            if (!vault.isUnlocked() || JSON.stringify(request.result) !== JSON.stringify(original)) {
              failure = new Error('PRIVATE_MIGRATION_CONCURRENT_WRITE'); tx.abort(); return;
            }
            store.put(encoded);
          };
        }
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('PRIVATE_MIGRATION_ABORTED'));
      });
    }
    const final = await requestOperation('readonly', store => store.getAll());
    if (final.some(entry => vault.privateEntry(entry.key, entry.namespace) && entry.data?.courierEncrypted !== 1)) {
      throw new Error('PRIVATE_MIGRATION_INCOMPLETE');
    }
    return pending.length;
  }

  window.AdminPersistentCache = { read, write, remove, prunePrefix, scope, createScope, cleanup, encryptCourierEntries,
    scheduleMaintenance, isQuotaError,
    currentIdentity, resetRuntimeScope, readProductCatalog, writeProductCatalog,
    loadProductCatalog, invalidateProductCatalog, orderPassport };
  if (window.__ADMIN_PERSISTENT_CACHE_TEST__) {
    window.AdminPersistentCache.__test = { resolveScope, entryIsStale };
  }
})(window);
