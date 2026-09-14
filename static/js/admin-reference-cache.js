(function (window) {
  "use strict";

  if (window.AdminReferenceCache) return;

  const memory = new Map();
  const pending = new Map();
  const generations = new Map();
  let runtimeGeneration = 0;
  const definitions = {
    "store-time": { version: 1, ttlMs: 24 * 60 * 60 * 1000 },
    "payment-methods": { version: 1, ttlMs: 12 * 60 * 60 * 1000 },
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
        memory.set(key, { data, stale: false, expiresAt: Date.now() + definitions[name].ttlMs });
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
    const scope = getScope(name);
    if (!scope) return loadNetwork(name, options, null, null);
    const key = runtimeKey(name, scope);
    let entry = memory.get(key) || null;
    if (entry && Number(entry.expiresAt || 0) > 0) {
      entry.stale = Number(entry.expiresAt) <= Date.now();
    }
    if (!entry) {
      entry = await scope.getEntry("value", { allowStale: true }).catch(() => null);
      if (entry) memory.set(key, entry);
    }
    if (entry) {
      if (entry.stale && window.navigator.onLine !== false) {
        loadNetwork(name, options, scope, entry.data).catch(() => {});
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

  function resetRuntime() {
    runtimeGeneration += 1;
    memory.clear();
    pending.clear();
  }

  window.AdminReferenceCache = {
    getOrLoadReference,
    invalidateReference,
    resetRuntime,
    definitions: Object.freeze(Object.assign({}, definitions)),
  };
})(window);
