(function (window) {
  'use strict';
  if (window.AdminLocalRepository) return;

  const CONFIRMATION_KEY = 'admin:local-confirmation:v1';
  // Shared revocation state is not an authentication proof. The proof stays tab-scoped;
  // without it a browser session cannot unlock private data offline.
  const CONTROL_KEY = 'admin:local-access:v1';
  let generation = 0;
  let current = null;
  let confirmationEpoch = null;
  let expiryTimer = null;
  let releaseReady;
  let readyPromise = new Promise(resolve => { releaseReady = resolve; });

  function token() { return window.localStorage.getItem('admin:logout-pending:v1') ? null : window.localStorage.getItem('authToken'); }
  function epoch() {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function control() {
    const raw = window.localStorage.getItem(CONTROL_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return { status: 'invalid' }; }
  }
  if (!control()) window.localStorage.setItem(CONTROL_KEY, JSON.stringify({ epoch: epoch(), status: 'empty', version: 1 }));
  function claims(value) {
    try {
      const part = String(value || '').split('.')[1];
      return JSON.parse(window.atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_) { return null; }
  }
  function matches(context, value) {
    const identity = claims(value);
    if (!identity || !context || context.formatVersion !== 1 || context.tenantId !== Number(identity.tenantId)
      || context.authVersion !== Number(identity.authVersion || 0) || context.expiresAt !== Number(identity.exp) * 1000
      || !Number.isFinite(context.offlineExpiresAt ?? context.expiresAt)
      || (context.offlineExpiresAt ?? context.expiresAt) > context.expiresAt
      || (context.offlineExpiresAt ?? context.expiresAt) <= Date.now()
      || context.expiresAt <= Date.now() || !/^[a-f0-9]{64}$/.test(context.accessViewId || '')
      || (identity.authStage && identity.authStage !== 'active')) return false;
    if (identity.userId) {
      return context.principal?.type === 'user' && context.principal.id === String(identity.userId)
        && Number(context.activeRoleId) > 0
        && (!identity.activeRoleId || Number(identity.activeRoleId) === context.activeRoleId);
    }
    return (identity.loginType === 'tenant' || identity.role === 'owner')
      && context.principal?.type === 'tenant' && context.principal.id === String(identity.tenantId)
      && context.activeRoleId === null;
  }
  async function binding(value) {
    if (!window.crypto?.subtle) throw new Error('LOCAL_CONTEXT_CRYPTO_UNAVAILABLE');
    const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function notify(state, reason) {
    window.dispatchEvent(new CustomEvent('admin:local-context-changed', { detail: { state, reason } }));
  }
  function settle() { if (releaseReady) { releaseReady(); releaseReady = null; } }
  function reset({ forget = false, broadcast = true, reason = 'reset' } = {}) {
    generation += 1;
    current = null;
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    expiryTimer = null;
    settle();
    try {
      if (forget) {
        if (broadcast) window.localStorage.setItem(CONTROL_KEY, JSON.stringify({ epoch: epoch(), status: 'revoked', version: 1 }));
        try { window.sessionStorage.removeItem(CONFIRMATION_KEY); }
        catch (error) { console.error('LOCAL_CONTEXT_FORGET_FAILED:', error); }
      }
    } finally { notify(forget ? 'revoked' : 'pending', reason); }
  }
  function beginConfirmation() {
    reset();
    confirmationEpoch = control()?.epoch;
    readyPromise = new Promise(resolve => { releaseReady = resolve; });
    return generation;
  }
  function valid(ticket, value) {
    return ticket === generation && value === token() && confirmationEpoch === control()?.epoch;
  }
  function scheduleExpiry() {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    const remaining = (current.context.local_context.offlineExpiresAt ?? current.context.local_context.expiresAt) - Date.now();
    expiryTimer = window.setTimeout(() => {
      if (current && (current.context.local_context.offlineExpiresAt ?? current.context.local_context.expiresAt) > Date.now()) scheduleExpiry();
      else reset({ forget: true, reason: 'expired' });
    }, Math.min(Math.max(0, remaining), 2147483647));
  }
  function accessContext(data) {
    // The identity adapter supplies only minimal authorization/presentation metadata.
    // The core does not know domain resources, profile fields, tokens or documents.
    return {
      ok: true, local_context: data.local_context, metadata: data.metadata ?? null,
    };
  }
  async function confirm(data, value, ticket = generation) {
    if (!valid(ticket, value)) throw new Error('LOCAL_SCOPE_CHANGED');
    if (!data?.local_context) { reset({ forget: true }); return false; }
    if (data.ok !== true || !matches(data.local_context, value)) throw new Error('LOCAL_CONTEXT_INVALID');
    const record = { binding: await binding(value), context: JSON.parse(JSON.stringify(accessContext(data))) };
    if (!valid(ticket, value)) throw new Error('LOCAL_SCOPE_CHANGED');
    if (data.token_binding && data.token_binding !== record.binding) throw new Error('LOCAL_SESSION_MISMATCH');
    const head = control();
    const view = data.local_context.accessViewId;
    const shared = head?.status === 'confirmed' && head.version === 1 && head.binding === record.binding && head.accessViewId === view
      ? head : { epoch: head?.status !== 'confirmed' && head?.epoch ? head.epoch : epoch(),
        status: 'confirmed', version: 1, binding: record.binding, accessViewId: view };
    record.control = JSON.stringify(shared);
    window.localStorage.setItem(CONTROL_KEY, record.control);
    confirmationEpoch = shared.epoch;
    // Token binding prevents restoring another session. accessViewId comes from /auth/me,
    // not from this digest. The snapshot never authorizes a server operation.
    window.sessionStorage.setItem(CONFIRMATION_KEY, JSON.stringify(record));
    current = { context: record.context, token: value, offline: false, control: record.control };
    scheduleExpiry();
    settle();
    notify('active', 'confirmed');
    return true;
  }
  async function restore(value, ticket = generation) {
    if (!valid(ticket, value)) return null;
    const raw = window.sessionStorage.getItem(CONFIRMATION_KEY);
    if (!raw) { settle(); return null; }
    let record;
    try { record = JSON.parse(raw); } catch (_) { throw new Error('LOCAL_CONFIRMATION_CORRUPT'); }
    const matchingIdentity = matches(record.context?.local_context, value);
    const tokenBinding = matchingIdentity ? await binding(value) : null;
    if (!valid(ticket, value)) return null;
    if (!matchingIdentity || record.binding !== tokenBinding || record.control !== window.localStorage.getItem(CONTROL_KEY)
      || control()?.status !== 'confirmed' || control()?.version !== 1) {
      reset({ forget: true, broadcast: false, reason: 'confirmation-invalid' });
      return null;
    }
    current = { context: record.context, token: value, offline: true, control: record.control };
    scheduleExpiry();
    settle();
    notify('active', 'restored');
    return { ...JSON.parse(JSON.stringify(record.context)), offline: true };
  }
  function active() {
    return Boolean(current && current.token === token() && current.control === window.localStorage.getItem(CONTROL_KEY)
      && current.context.local_context.expiresAt > Date.now()
      && (current.context.local_context.offlineExpiresAt ?? current.context.local_context.expiresAt) > Date.now());
  }
  async function ready() {
    let pending;
    do { pending = readyPromise; await pending; } while (pending !== readyPromise);
    return active();
  }
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    throw new Error('INVALID_LOCAL_SCOPE_DIMENSIONS');
  }
  function create(options = {}) {
    if (!active()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const domain = options.domain;
    const version = options.version ?? 1;
    if (typeof domain !== 'string' || !domain.trim() || !Number.isInteger(version) || version < 1) {
      throw new Error('INVALID_LOCAL_REPOSITORY');
    }
    const context = current.context.local_context;
    const ticket = generation;
    const dimensions = canonical(options.dimensions || {});
    // A revoked session never reuses old records merely because permissions hash to the same view.
    const namespace = 'local:v2:' + encodeURIComponent(JSON.stringify([
      context.tenantId, context.principal.type, context.principal.id, context.activeRoleId,
      context.accessViewId, control().epoch, domain, version, dimensions,
    ]));
    const isCurrent = () => ticket === generation && active() && (!options.guard || options.guard());
    const assertCurrent = () => { if (!isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED'); };
    const cache = window.AdminPersistentCache.createScope({ storageNamespace: namespace, domain, version,
      retainStale: true, guard: isCurrent });
    if (!cache.complete || cache.namespace !== namespace) throw new Error('LOCAL_STORAGE_API_INCOMPATIBLE');
    function unwrap(entry) {
      if (!entry) return null;
      if (!entry.data || entry.data.repositoryVersion !== 1) throw new Error('LOCAL_ENTRY_INVALID');
      return { ...entry, data: entry.data.value, lastSyncedAt: entry.data.lastSyncedAt };
    }
    const staleOptions = opts => ({ ...opts, allowStale: opts.allowStale ?? (current?.offline || window.navigator.onLine === false) });
    const wrap = (value, opts) => ({ repositoryVersion: 1, value, lastSyncedAt: opts.lastSyncedAt ?? null });
    return Object.freeze({
      complete: true, namespace, domain, version, dimensions, isCurrent,
      async getEntry(key, opts = {}) {
        assertCurrent();
        const entry = await cache.getEntry(key, staleOptions(opts));
        assertCurrent();
        return unwrap(entry);
      },
      async get(key, opts = {}) { const entry = await this.getEntry(key, opts); return entry ? entry.data : null; },
      async scanEntries(opts = {}) {
        assertCurrent();
        const result = await cache.scanEntries({ ...opts, guard: () => isCurrent() && (!opts.guard || opts.guard()) });
        assertCurrent();
        return { cursor: result.cursor, entries: result.entries.map(({ key, entry }) => ({ key, ...unwrap({ data: entry.data,
          createdAt: entry.createdAt, updatedAt: entry.updatedAt, expiresAt: entry.staleAt ?? entry.expiresAt }) })) };
      },
      async getMany(keys, opts = {}) {
        assertCurrent();
        const entries = await cache.getMany(keys, { ...staleOptions(opts), entries: true });
        assertCurrent();
        return new Map([...entries].map(([key, value]) => [key, opts.entries ? unwrap(value) : unwrap(value)?.data ?? null]));
      },
      async set(key, value, opts = {}) {
        assertCurrent();
        const saved = await cache.set(key, wrap(value, opts), opts);
        assertCurrent();
        if (!saved) throw new Error('LOCAL_WRITE_NOT_SAVED');
        return true;
      },
      async setMany(values, opts = {}) {
        assertCurrent();
        const entries = values instanceof Map ? [...values] : values;
        if (!Array.isArray(entries)) throw new Error('INVALID_LOCAL_BATCH');
        if (!entries.length) return true;
        const saved = await cache.setMany(entries.map(([key, value]) => [key, wrap(value, opts)]), opts);
        assertCurrent();
        if (!saved) throw new Error('LOCAL_WRITE_NOT_SAVED');
        return true;
      },
      async bufferWrite(key) {
        // A browser-local request sequence, NOT a server revision or proof of completeness.
        // Allocate before starting HTTP; commit only if no newer request reserved the key.
        assertCurrent();
        const locks = window.navigator?.locks;
        if (!locks?.request) return null;
        const metadataKey = 'meta:buffer:' + key;
        const lockKey = 'admin:buffer:' + namespace + ':' + key;
        const repository = this;
        const sequence = await locks.request(lockKey, async () => {
          assertCurrent();
          const metadata = await repository.get(metadataKey, { allowStale: true });
          const next = Number(metadata?.requestSequence || 0) + 1;
          if (!Number.isSafeInteger(next)) throw new Error('LOCAL_SEQUENCE_EXHAUSTED');
          await repository.set(metadataKey, { ...metadata, requestSequence: next }, { noQuotaCleanup: true });
          return next;
        });
        return Object.freeze({
          async commit(value) {
            return locks.request(lockKey, async () => {
              assertCurrent();
              const metadata = await repository.get(metadataKey, { allowStale: true });
              if (metadata?.requestSequence !== sequence) return false;
              const lastSyncedAt = Date.now();
              await repository.setMany([[key, value], [metadataKey, { requestSequence: sequence,
                confirmedSequence: sequence, lastSyncedAt, serverVersion: null, complete: false }]],
              { noQuotaCleanup: true, lastSyncedAt });
              return true;
            });
          },
        });
      },
      async compareTokens(keys) {
        assertCurrent(); const result = await cache.compareTokens(keys); assertCurrent(); return result;
      },
      async compareAndSetMany(expected, values, opts = {}) {
        assertCurrent();
        const result = await cache.compareAndSetMany(expected, values.map(([key, value]) => [key, wrap(value, opts)]), opts);
        assertCurrent(); return result;
      },
      async remove(key) { assertCurrent(); await cache.remove(key); assertCurrent(); },
      async removeMany(keys) { assertCurrent(); await cache.removeMany(keys); assertCurrent(); },
      async invalidate() { assertCurrent(); await cache.clear(); assertCurrent(); },
      async prune(maxEntries) { assertCurrent(); await cache.prune(maxEntries); assertCurrent(); },
    });
  }

  function capture({ requireActive = true } = {}) {
    const ticket = generation;
    const value = token();
    const shared = window.localStorage.getItem(CONTROL_KEY);
    return Object.freeze({ isCurrent: () => ticket === generation && (requireActive ? active()
      : value === token() && shared === window.localStorage.getItem(CONTROL_KEY)) });
  }
  window.AdminLocalRepository = Object.freeze({ create, ready, confirm, restore, reset, beginConfirmation, capture, isActive: active });
  window.addEventListener('storage', event => {
    if (event.key === CONTROL_KEY) {
      if (current?.control === window.localStorage.getItem(CONTROL_KEY)) return;
      reset({ forget: true, broadcast: false, reason: 'remote-context' });
    } else if (event.key === null || event.key === 'admin:logout-pending:v1' || (event.key === 'authToken' && event.oldValue !== event.newValue)) {
      reset({ forget: true, broadcast: false, reason: 'remote-identity' });
    } else if (event.key === 'user' || event.key === 'tenant') {
      const identity = value => {
        const data = JSON.parse(value || 'null');
        return JSON.stringify([data?.id ?? null, data?.tenant_id ?? null]);
      };
      try {
        if (identity(event.oldValue) !== identity(event.newValue)) reset({ forget: true, broadcast: false, reason: 'remote-identity' });
      } catch (_) { reset({ forget: true, broadcast: false, reason: 'remote-identity' }); }
    }
  });
})(window);
