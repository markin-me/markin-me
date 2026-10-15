(function (window) {
  "use strict";

  if (window.AdminReferenceCache) return;

  const memory = new Map();
  const pending = new Map();
  const generations = new Map();
  const referenceStates = new Map();
  let runtimeGeneration = 0;
  const definitions = {
    "store-time": { version: 1, ttlMs: 24 * 60 * 60 * 1000 },
    "payment-methods": { version: 1, ttlMs: 12 * 60 * 60 * 1000 },
    stores: { version: 1, ttlMs: 2 * 60 * 60 * 1000 },
  };

  async function getScope(name) {
    const definition = definitions[name];
    const repository = window.AdminLocalRepository;
    if (!repository) throw new Error('LOCAL_REPOSITORY_NOT_INITIALIZED');
    if (!definition || !await repository.ready()) return null;
    const storeId = name === 'stores' ? null : String(window.localStorage.getItem('activeStoreId') || '1');
    return repository.create({ domain: `admin:ref:${name}`, version: definition.version,
      dimensions: storeId === null ? {} : { organizationalUnit: { type: 'store', id: storeId } },
      guard: () => storeId === null || String(window.localStorage.getItem('activeStoreId') || '1') === storeId });
  }

  function recordState(name, scope, entry, source) {
    referenceStates.set(name, { scope, lastSyncedAt: entry.lastSyncedAt, stale: entry.stale === true, source });
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
    const startedToken = window.localStorage.getItem('authToken');
    if (key && pending.has(key)) {
      return pending.get(key).then((data) => {
        if (!scope.isCurrent() || startedRuntimeGeneration !== runtimeGeneration) throw new Error('LOCAL_SCOPE_CHANGED');
        if (cachedData !== null && !sameValue(cachedData, data) && typeof options.onUpdate === "function") {
          options.onUpdate(data);
        }
        return data;
      });
    }
    const task = Promise.resolve().then(options.load).then(async (raw) => {
      if (startedRuntimeGeneration !== runtimeGeneration || startedToken !== window.localStorage.getItem('authToken')) {
        throw new Error('LOCAL_SCOPE_CHANGED');
      }
      const data = typeof options.normalize === "function" ? options.normalize(raw) : raw;
      if (typeof options.validate === "function" && !options.validate(data)) {
        throw new Error(`INVALID_ADMIN_REFERENCE:${name}`);
      }
      const currentScope = await getScope(name);
      if (startedRuntimeGeneration !== runtimeGeneration || startedToken !== window.localStorage.getItem('authToken')) {
        throw new Error('LOCAL_SCOPE_CHANGED');
      }
      if (scope && currentScope && currentScope.namespace === scope.namespace
        && generation === (generations.get(key) || 0) && startedRuntimeGeneration === runtimeGeneration) {
        const lastSyncedAt = Date.now();
        await scope.set("value", data, { ttlMs: definitions[name].ttlMs, lastSyncedAt,
          guard: () => generation === (generations.get(key) || 0) && startedRuntimeGeneration === runtimeGeneration });
        if (!scope.isCurrent() || generation !== (generations.get(key) || 0) || startedRuntimeGeneration !== runtimeGeneration) {
          throw new Error('LOCAL_SCOPE_CHANGED');
        }
        const entry = { data, stale: false, lastSyncedAt, expiresAt: lastSyncedAt + definitions[name].ttlMs };
        memory.set(key, entry);
        recordState(name, scope, entry, 'network');
        if (cachedData !== null && !sameValue(cachedData, data) && typeof options.onUpdate === "function") {
          options.onUpdate(data);
        }
      } else if (scope) throw new Error('LOCAL_SCOPE_CHANGED');
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
    const scope = await getScope(name);
    if (!scope) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const key = runtimeKey(name, scope);
    let entry = memory.get(key) || null;
    if (entry && Number(entry.expiresAt || 0) > 0) {
      entry.stale = Number(entry.expiresAt) <= Date.now();
    }
    if (!entry) {
      entry = await scope.getEntry("value", { allowStale: true });
      if (entry) memory.set(key, entry);
    }
    if (entry) {
      recordState(name, scope, entry, 'local');
      if (entry.stale && window.navigator.onLine !== false) {
        loadNetwork(name, options, scope, entry.data).catch(error => {
          console.error('ADMIN_REFERENCE_REFRESH_FAILED:', name, error);
        });
      }
      return entry.data;
    }
    return loadNetwork(name, options, scope, null);
  }

  async function invalidateReference(name) {
    const scope = await getScope(name);
    const key = runtimeKey(name, scope);
    if (key) {
      memory.delete(key);
      pending.delete(key);
      generations.set(key, (generations.get(key) || 0) + 1);
      referenceStates.delete(name);
    }
    return scope ? scope.remove("value") : Promise.resolve(false);
  }

  function resetRuntime() {
    runtimeGeneration += 1;
    memory.clear();
    pending.clear();
    generations.clear();
    referenceStates.clear();
  }

  window.addEventListener('admin:local-context-changed', resetRuntime);
  document.addEventListener('tenantStoreChanged', resetRuntime);
  window.addEventListener('storage', event => { if (event.key === 'activeStoreId') resetRuntime(); });

  window.AdminReferenceCache = {
    getOrLoadReference,
    invalidateReference,
    resetRuntime,
    getReferenceState(name) {
      const state = referenceStates.get(name);
      return state?.scope.isCurrent() ? { lastSyncedAt: state.lastSyncedAt, stale: state.stale, source: state.source } : null;
    },
    definitions: Object.freeze(Object.assign({}, definitions)),
  };
})(window);
