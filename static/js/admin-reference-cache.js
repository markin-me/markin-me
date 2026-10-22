(function (window) {
  "use strict";

  if (window.AdminReferenceCache) return;

  const memory = new Map();
  const pending = new Map();
  const generations = new Map();
  const referenceStates = new Map();
  let runtimeGeneration = 0;
  const settingsProfileTtlMs = 15 * 60 * 1000;
  const settingsCheckpointKey = 'meta:refresh:safe-profile';
  let settingsPreparation = null;
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
      options.idleContext?.assertCurrent();
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
        if (options.idleContext) {
          await options.idleContext.commit(scope, [['value', data], ['meta:refresh', {
            lastSyncedAt, complete: false, kind: 'observed-reference', cursor: null,
          }]], { ttlMs: definitions[name].ttlMs });
        } else await scope.set("value", data, { ttlMs: definitions[name].ttlMs, lastSyncedAt,
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
      if (entry.stale && name === 'store-time' && window.AdminIdleHydration?.supported) {
        void window.AdminIdleHydration.enqueue('reference:' + name, context => {
          if (pending.has(key)) return null;
          return loadNetwork(name, {
          ...options, idleContext: context,
          load: async () => {
            const response = await context.requestJSON('/api/admin/tenant/current-time');
            if (!response?.ok || !response.data) throw new Error('INVALID_STORE_TIME');
            return { storeTimezone: String(response.data.storeTimezone || '+0'),
              storeTimestamp: Number(response.data.storeTimestamp || 0), fetchedAt: Date.now() };
          },
        }, scope, entry.data);
        }, { priority: 1, guard: () => scope.isCurrent() });
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

  async function settingsProfileVersion(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    const keys = Object.keys(profile).sort();
    if (!keys.includes('name') || !keys.includes('timezone')
        || keys.some(key => !['name', 'site_name', 'timezone'].includes(key)
          || (profile[key] !== null && (typeof profile[key] !== 'string' || profile[key].length > 256)))) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(keys.map(key => [key, profile[key]]))));
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  }

  async function getSettingsProfileState() {
    const core = window.AdminLocalRepository;
    if (!core?.isActive()) return { state: 'unavailable', moduleComplete: false };
    const scope = core.create({ domain: 'settings:profile', version: 1 });
    const entries = await scope.getMany(['safe-profile', settingsCheckpointKey], { allowStale: true });
    const version = await settingsProfileVersion(entries.get('safe-profile'));
    if (!scope.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    const checkpoint = entries.get(settingsCheckpointKey);
    const ready = Boolean(version && checkpoint?.formatVersion === 1 && checkpoint.version === version
      && checkpoint.complete === true && checkpoint.confirmedAt > Date.now() - settingsProfileTtlMs);
    return { state: settingsPreparation?.namespace === scope.namespace ? 'loading' : ready ? 'ready' : version ? 'partial' : 'unavailable',
      dataset: 'settings.safe-profile', moduleComplete: false, lastSyncedAt: checkpoint?.confirmedAt || null };
  }

  async function prepareSettingsProfile() {
    const core = window.AdminLocalRepository, scheduler = window.AdminIdleHydration;
    const context = window.AdminAccessContext;
    if (!core?.isActive() || !scheduler?.supported || !context?.ok || context.offline) return;
    // Scheduling hint only. The endpoint rechecks current server permissions.
    if (!(context.permissions || []).some(grant => grant === '*'
      || (grant?.key === 'settings.company.read' && ['all', 'stores'].includes(grant.access_rule)))) return;
    const scope = core.create({ domain: 'settings:profile', version: 1 });
    const generation = runtimeGeneration;
    if (settingsPreparation?.namespace === scope.namespace && settingsPreparation.generation === generation) return settingsPreparation.promise;
    const isCurrent = () => scope.isCurrent() && generation === runtimeGeneration;
    const bufferKey = 'meta:buffer:safe-profile';
    const task = scheduler.enqueue('settings:safe-profile', async idle => {
      // Read INSIDE the global scheduler turn: another tab may have prepared it.
      const saved = await scope.getMany(['safe-profile', settingsCheckpointKey, bufferKey], { allowStale: true });
      const version = await settingsProfileVersion(saved.get('safe-profile'));
      idle.assertCurrent();
      const checkpoint = saved.get(settingsCheckpointKey);
      if (version && checkpoint?.formatVersion === 1 && checkpoint.version === version && checkpoint.complete === true
          && checkpoint.confirmedAt > Date.now() - settingsProfileTtlMs) return { saved: false, reason: 'already-current' };
      const requestSequence = saved.get(bufferKey)?.requestSequence || 0;
      const response = await idle.requestJSON('/api/admin/tenant/offline-profile', {
        headers: { 'x-rbac-node': 'settings.company' }, recordCount: () => 1,
      });
      const responseVersion = await settingsProfileVersion(response.data);
      idle.assertCurrent();
      if (response.formatVersion !== 1 || response.tenantId !== context.local_context?.tenantId
          || !responseVersion || response.version !== responseVersion || response.complete !== true
          || response.moduleComplete !== false || response.cursor !== null) throw new Error('INVALID_SETTINGS_OFFLINE_PROFILE');
      // Same lock/fence as the existing foreground bufferWrite('safe-profile').
      // Never overwrite a newer working response or reserve a foreground sequence.
      return window.navigator.locks.request('admin:buffer:' + scope.namespace + ':safe-profile', { signal: idle.signal }, async () => {
        idle.assertCurrent();
        const latest = await scope.get(bufferKey, { allowStale: true });
        idle.assertCurrent();
        if ((latest?.requestSequence || 0) !== requestSequence) return { saved: false, reason: 'working-response-changed' };
        await idle.commit(scope, [['safe-profile', response.data], [settingsCheckpointKey, {
          formatVersion: 1, dataset: 'settings.safe-profile', version: response.version, cursor: null,
          confirmedAt: Date.now(), confirmedPortion: 1, complete: true, moduleComplete: false,
        }]], { recordCount: 1, ttlMs: settingsProfileTtlMs, guard: isCurrent });
        return { saved: true };
      });
    }, { priority: 1, guard: isCurrent });
    const preparation = { namespace: scope.namespace, generation, promise: task };
    settingsPreparation = preparation;
    try {
      const result = await task;
      if (!result.ok && isCurrent() && !['context-changed', 'store-changed', 'pagehide', 'scope-changed'].includes(result.reason)) {
        console.warn('SETTINGS_OFFLINE_PREPARATION_FAILED:', result.reason);
      }
    } finally {
      if (settingsPreparation === preparation) settingsPreparation = null;
    }
  }

  function queueSettingsProfile() {
    // This only queues work; all HTTP and writes stay inside AdminIdleHydration.
    void prepareSettingsProfile().catch(error => console.warn('SETTINGS_OFFLINE_PREPARATION_FAILED:', error.name));
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
  window.addEventListener('admin:access-context', queueSettingsProfile);
  window.addEventListener('online', queueSettingsProfile);
  document.addEventListener('tenantStoreChanged', queueSettingsProfile);
  window.addEventListener('storage', event => { if (event.key === 'activeStoreId') queueSettingsProfile(); });

  window.AdminReferenceCache = {
    getOrLoadReference,
    invalidateReference,
    resetRuntime,
    getSettingsProfileState,
    getReferenceState(name) {
      const state = referenceStates.get(name);
      return state?.scope.isCurrent() ? { lastSyncedAt: state.lastSyncedAt, stale: state.stale, source: state.source } : null;
    },
    definitions: Object.freeze(Object.assign({}, definitions)),
  };
  queueSettingsProfile();
})(window);
