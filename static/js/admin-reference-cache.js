(function (window) {
  "use strict";

  if (window.AdminReferenceCache) return;

  const memory = new Map();
  const pending = new Map();
  const consumers = new Map();
  const networkVerified = new Set();
  const generations = new Map();
  let runtimeGeneration = 0;
  const definitions = {
    "delivery-settings": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "checkout-address-mode": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "print-options": { version: 2, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "store-time": { version: 1, ttlMs: 24 * 60 * 60 * 1000 },
    "payment-methods": { version: 1, ttlMs: 12 * 60 * 60 * 1000 },
    "order-delivery-types": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "order-time-options": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "order-statuses": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    "production-zones": { version: 1, ttlMs: 7 * 24 * 60 * 60 * 1000 },
    stores: { version: 1, ttlMs: 2 * 60 * 60 * 1000 },
  };

  function getScope(name) {
    const definition = definitions[name];
    const cache = window.AdminPersistentCache;
    if (!definition || !cache || typeof cache.scope !== "function") return null;
    const scope = cache.scope({ domain: `admin:ref:${name}`, version: definition.version });
    return scope && scope.complete ? scope : null;
  }

  function runtimeKey(name, scope) {
    return scope ? `${scope.namespace}:value` : null;
  }

  function sameValue(left, right) {
    try { return JSON.stringify(left) === JSON.stringify(right); }
    catch (_) { return false; }
  }

  async function loadNetwork(name, options, scope, cachedData) {
    const key = runtimeKey(name, scope);
    const generation = key ? (generations.get(key) || 0) : 0;
    const startedRuntimeGeneration = runtimeGeneration;
    if (key && pending.has(key)) {
      return pending.get(key).then((data) => {
        if (cachedData !== null && !sameValue(cachedData, data) && typeof options.onUpdate === "function") {
          options.onUpdate(data);
        }
        return data;
      });
    }
    const task = Promise.resolve().then(options.load).then(async (raw) => {
      const data = typeof options.normalize === "function" ? options.normalize(raw) : raw;
      if (typeof options.validate === "function" && !options.validate(data)) {
        throw new Error(`INVALID_ADMIN_REFERENCE:${name}`);
      }
      const currentScope = getScope(name);
      if (scope && currentScope && currentScope.namespace === scope.namespace
        && generation === (generations.get(key) || 0) && startedRuntimeGeneration === runtimeGeneration) {
        await scope.set("value", data, { ttlMs: definitions[name].ttlMs }).catch(() => false);
        networkVerified.add(name);
        memory.set(key, { data, stale: false, expiresAt: Date.now() + (definitions[name].refreshAfterMs || definitions[name].ttlMs) });
        if (cachedData !== null && !sameValue(cachedData, data) && typeof options.onUpdate === "function") {
          options.onUpdate(data);
        }
      }
      return data;
    }).finally(() => {
      if (key && pending.get(key) === task) pending.delete(key);
    });
    if (key) pending.set(key, task);
    return task;
  }

  async function getOrLoadReference(name, options) {
    const definition = definitions[name];
    if (!definition || !options || typeof options.load !== "function") {
      throw new Error(`UNKNOWN_ADMIN_REFERENCE:${name}`);
    }
    consumers.set(name, options);
    const scope = getScope(name);
    if (!scope) return loadNetwork(name, options, null, null);
    const key = runtimeKey(name, scope);
    let entry = memory.get(key) || null;
    if (entry && Number(entry.expiresAt || 0) > 0) {
      entry.stale = Number(entry.expiresAt) <= Date.now();
    }
    if (!entry) {
      entry = await scope.getEntry("value", { allowStale: true }).catch(() => null);
      if (entry && definition.refreshAfterMs) {
        // Keep the persisted snapshot longer than its network revalidation age.
        entry.expiresAt = Number(entry.updatedAt || entry.createdAt || 0) + definition.refreshAfterMs;
        entry.stale = entry.expiresAt <= Date.now();
      }
      if (entry) memory.set(key, entry);
    }
    if (entry) {
      if (entry.stale && window.navigator.onLine !== false) {
        loadNetwork(name, options, scope, entry.data).catch(error => console.error('Reference refresh failed:', name, error));
      }
      return entry.data;
    }
    return loadNetwork(name, options, scope, null);
  }

  function invalidateReference(name) {
    const scope = getScope(name);
    const key = runtimeKey(name, scope);
    if (key) {
      memory.delete(key);
      pending.delete(key);
      generations.set(key, (generations.get(key) || 0) + 1);
    }
    return scope ? scope.remove("value") : Promise.resolve(false);
  }

  async function setReference(name, data) {
    const definition = definitions[name];
    if (!definition) throw new Error(`UNKNOWN_ADMIN_REFERENCE:${name}`);
    const scope = getScope(name);
    if (!scope) return false;
    const key = runtimeKey(name, scope);
    generations.set(key, (generations.get(key) || 0) + 1);
    pending.delete(key);
    memory.set(key, { data, stale: false, expiresAt: Date.now() + (definition.refreshAfterMs || definition.ttlMs) });
    return scope.set("value", data, { ttlMs: definition.ttlMs });
  }

  function resetRuntime() {
    runtimeGeneration += 1;
    memory.clear();
    pending.clear(); networkVerified.clear();
  }

  let referenceCursor = 0, referenceEpoch = null, referenceUnsubscribe = null;
  let referenceSerial = Promise.resolve();
  async function startReferenceEvents() {
    referenceUnsubscribe?.(); referenceUnsubscribe = null;
    const cache = window.AdminPersistentCache?.scope({ domain: 'admin:reference-events', version: 1 });
    if (!cache?.complete || !window.localStorage.getItem('authToken')) return;
    const stored = await cache.get('cursor');
    if (cache.namespace !== window.AdminPersistentCache.scope({ domain: 'admin:reference-events', version: 1 }).namespace) return;
    referenceCursor = Number(stored?.cursor || 0); referenceEpoch = stored?.epoch || null;
    referenceUnsubscribe = window.AdminPersistentCache.realtime.subscribe('references', () => ({ since: referenceCursor, epoch: referenceEpoch, context: document.body?.dataset?.adminActivePage === 'cash' ? 'cash' : 'orders' }), message => {
      if (message.type === 'connection.closed') return;
      if (message.type === 'references.error') { console.error('Reference subscription failed:', message.error); return; }
      referenceSerial = referenceSerial.then(async () => {
        if (cache.namespace !== window.AdminPersistentCache.scope({ domain: 'admin:reference-events', version: 1 }).namespace) return;
        const names = new Set();
        const notifications = [];
        const reset = message.reset_required || message.type === 'references.invalidate' || (message.type === 'references.ready' && !referenceEpoch);
        if (reset) referenceCursor = 0;
        if (reset) Object.keys(definitions).forEach(name => {
          if (referenceEpoch || !networkVerified.has(name)) names.add(name);
        });
        const changes = message.type === 'references.event' ? [message.event] : message.changes || [];
        for (const event of changes) {
          const storeId = Number(event.data?.store_id || 0);
          if (!storeId || storeId === Number(window.AdminPersistentCache.currentIdentity().storeId)) {
            (event.data?.names || []).forEach(name => names.add(name));
            notifications.push(event.data || {});
          }
          referenceCursor = Math.max(referenceCursor, Number(event.id || 0));
        }
        for (const name of names) {
          if (!definitions[name]) continue;
          const previous = memory.get(runtimeKey(name, getScope(name)))?.data || null;
          await invalidateReference(name);
          const options = consumers.get(name);
          if (options && typeof options.onUpdate === 'function' && options.isActive?.() !== false) {
            void loadNetwork(name, options, getScope(name), previous).catch(error => console.error('Reference event refresh failed:', name, error));
          }
        }
        notifications.forEach(detail => document.dispatchEvent(new CustomEvent('admin:reference-changed', { detail })));
        if (reset) document.dispatchEvent(new CustomEvent('admin:reference-changed', { detail: { names: ['client-benefits', 'order-references', 'expense-documents'], resync: true } }));
        if (message.type === 'references.ready') {
          referenceEpoch = message.epoch; referenceCursor = Math.max(referenceCursor, Number(message.cursor || 0));
        }
        await cache.set('cursor', { epoch: referenceEpoch, cursor: referenceCursor });
      }).catch(error => console.error('Reference event apply failed:', error));
      return referenceSerial;
    });
  }
  function resetReferenceEvents() { resetRuntime(); consumers.clear(); void startReferenceEvents().catch(console.error); }
  document.addEventListener('tenantStoreChanged', resetReferenceEvents);
  window.addEventListener('storage', event => {
    if (['authToken', 'activeStoreId', 'user', 'tenant'].includes(event.key)) resetReferenceEvents();
  });
  void startReferenceEvents().catch(console.error);

  window.AdminReferenceCache = {
    getOrLoadReference,
    setReference,
    invalidateReference,
    resetRuntime,
    definitions: Object.freeze(Object.assign({}, definitions)),
  };
})(window);
