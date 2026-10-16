(function (window) {
  'use strict';
  if (window.AdminIdleHydration) return;
  const core = window.AdminLocalRepository;
  const locks = window.navigator?.locks;
  const prefix = 'admin:idle-tab:v1:';
  const lockName = 'admin:idle-hydration:v1';
  const input = window.AdminIdleHydrationConfig || {};
  const setting = (name, fallback) => Number.isFinite(Number(input[name])) ? Number(input[name]) : fallback;
  const config = Object.freeze({
    idleMs: Math.min(86400000, Math.max(60000, setting('idleMs', 60000))),
    pauseMs: Math.max(2000, setting('pauseMs', 3000)),
    timeoutMs: Math.min(15000, Math.max(1000, setting('timeoutMs', 8000))),
    maxBytes: Math.min(512 * 1024, Math.max(1024, setting('maxBytes', 256 * 1024))),
    // Public JS bundles are larger than JSON data portions. Still one request/turn.
    resourceMaxBytes: Math.min(4 * 1024 * 1024, Math.max(1024, setting('resourceMaxBytes', 4 * 1024 * 1024))),
    maxRecords: Math.min(25, Math.max(1, Math.floor(setting('maxRecords', 25)))),
    maxTasks: Math.min(128, Math.max(1, Math.floor(setting('maxTasks', 128)))),
    maxRetries: Math.min(2, Math.max(0, Math.floor(setting('maxRetries', 2)))),
  });
  const tabId = window.crypto?.randomUUID?.();
  const tabKey = prefix + tabId;
  const tabKeys = new Set([tabKey]);
  const tasks = new Map();
  const operations = new Set();
  let enabled = Boolean(core && tabId && locks?.request && locks?.query);
  let live = false, coordinationReady = false, stopped = false, frozen = false, storagePaused = false, authPaused = false;
  let timer = null, active = null, sequence = 0, lastPublished = 0, nextTurn = 0;
  let releaseLifetime;
  let channel;
  let pointerHeld = false, touchHeld = false, lastGestureAt = -Infinity;
  let quietUntil = Date.now() + config.idleMs;

  function abort() { active?.controller.abort(); }
  function publish() {
    if (!enabled) return;
    try {
      window.localStorage.setItem(tabKey, JSON.stringify({ quietUntil, busy: operations.size > 0 || pointerHeld || touchHeld }));
      channel?.postMessage({ type: 'activity', key: tabKey });
    } catch (_) { enabled = false; abort(); }
  }
  function activity() {
    quietUntil = Date.now() + config.idleMs + 1000;
    abort();
    // The extra second covers the throttled tail: another tab cannot start early.
    if (Date.now() - lastPublished >= 1000) { lastPublished = Date.now(); publish(); }
    schedule();
  }
  function beginOperation() {
    const operation = {};
    operations.add(operation);
    activity(); publish();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true; operations.delete(operation); activity(); publish();
    };
  }
  function scopeKey() {
    if (!core?.isActive()) return null;
    return core.create({ domain: 'idle:access', version: 1,
      dimensions: { organizationalUnit: { type: 'store', id: window.localStorage.getItem('activeStoreId') || null } } }).namespace;
  }
  function eligible() {
    return enabled && live && coordinationReady && !stopped && !frozen && !operations.size && !pointerHeld && !touchHeld && !storagePaused && !document.hidden
      && !authPaused && window.navigator.onLine !== false && window.AdminAccessContext?.ok === true
      && !window.AdminAccessContext.offline && core?.isActive();
  }
  function refreshTabs() {
    // Storage events/BroadcastChannel are asynchronous. Inspect shared state at
    // the request/commit boundary as well, including tabs not announced yet.
    for (let i = 0; i < window.localStorage.length; i++) knowTab(window.localStorage.key(i));
    if (!enabled) throw new Error('IDLE_COORDINATION_UNAVAILABLE');
  }
  async function idleUntil() {
    refreshTabs();
    const state = await locks.query();
    const living = new Set(state.held.map(lock => lock.name));
    // A terminated client may have released the scheduler lock while its SW is
    // still aborting I/O. Do not overlap even a JSON portion with that request.
    if (living.has('admin:idle-resource:v1')) return Date.now() + config.pauseMs;
    let until = Math.max(quietUntil, nextTurn);
    for (const key of tabKeys) {
      // A live tab holds its lifetime lock. Frozen busy tabs remain a veto;
      // crashed/closed tabs cannot leave permanent busy markers behind.
      const record = JSON.parse(window.localStorage.getItem(key));
      if (!record) { tabKeys.delete(key); continue; }
      if (!Number.isFinite(record.quietUntil) || typeof record.busy !== 'boolean') throw new Error('IDLE_COORDINATION_INVALID');
      if (key !== tabKey && !living.has(key) && record.quietUntil <= Date.now()) {
        tabKeys.delete(key); window.localStorage.removeItem(key); continue;
      }
      if (record.busy && living.has(key)) return Infinity;
      until = Math.max(until, record.quietUntil);
    }
    return until;
  }
  function schedule(delay) {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (!eligible() || !tasks.size || active) return;
    const wait = delay ?? Math.max(0, quietUntil - Date.now(), nextTurn - Date.now());
    timer = window.setTimeout(() => { timer = null; void turn(); }, wait);
  }
  function cancel(reason = 'cancelled') {
    abort();
    for (const task of tasks.values()) task.resolve({ ok: false, reason });
    tasks.clear();
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }
  async function turn() {
    if (!eligible() || active || !tasks.size) return;
    let retryAt = null;
    try {
      await locks.request(lockName, { ifAvailable: true }, async lock => {
        if (!lock || !eligible()) { retryAt = Date.now() + config.pauseMs; return; }
        const until = await idleUntil();
        if (until > Date.now()) { retryAt = until; return; }
        const candidates = [...tasks.values()].filter(task => task.notBefore <= Date.now());
        candidates.sort((a, b) => (a.priority - (Date.now() - a.createdAt) / 10000)
          - (b.priority - (Date.now() - b.createdAt) / 10000) || a.sequence - b.sequence);
        const task = candidates[0];
        if (!task) { retryAt = Math.min(...[...tasks.values()].map(item => item.notBefore)); return; }
        if (task.scope !== scopeKey() || (task.guard && !task.guard())) {
          tasks.delete(task.key); task.resolve({ ok: false, reason: 'scope-changed' }); return;
        }
        const access = core.capture();
        const controller = new AbortController();
        active = { controller, task };
        const assertCurrent = () => {
          refreshTabs();
          if (controller.signal.aborted || !eligible() || !access.isCurrent() || task.scope !== scopeKey()
              || quietUntil > Date.now() || (task.guard && !task.guard())) {
            controller.abort();
            throw new DOMException('Hydration interrupted', 'AbortError');
          }
          for (const key of tabKeys) {
            const record = JSON.parse(window.localStorage.getItem(key));
            if (record && (!Number.isFinite(record.quietUntil) || typeof record.busy !== 'boolean'
                || record.busy || record.quietUntil > Date.now())) {
              controller.abort();
              throw new DOMException('Activity in another tab', 'AbortError');
            }
          }
        };
        let requests = 0;
        const deadline = window.setTimeout(() => controller.abort('timeout'), config.timeoutMs);
        const context = {
          signal: controller.signal, config, assertCurrent,
          async prepareResource(worker, url, version, options = {}) {
            assertCurrent();
            if (++requests > 1) throw new Error('HYDRATION_ONE_REQUEST_PER_TURN');
            const operationId = window.crypto.randomUUID();
            return new Promise((resolve, reject) => {
              const channel = new window.MessageChannel();
              let settled = false, cancelDeadline;
              const finish = (error, value) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(cancelDeadline);
                controller.signal.removeEventListener('abort', cancelResource);
                options.signal?.removeEventListener('abort', revoke);
                channel.port1.close();
                if (error) reject(error); else resolve(value);
              };
              const cancelResource = () => {
                channel.port1.postMessage({ type: 'CANCEL', operationId });
                // Do not release the origin lock until SW acknowledges cancellation.
                // A lost worker/port disables further background work in this tab.
                cancelDeadline = window.setTimeout(() => {
                  enabled = false;
                  cancel('resource-worker-unresponsive');
                  finish(new Error('RESOURCE_WORKER_UNRESPONSIVE'));
                }, 2000);
              };
              const revoke = () => controller.abort();
              channel.port1.onmessage = event => {
                const message = event.data;
                if (message?.operationId !== operationId || message.version !== version) {
                  controller.abort(); return;
                }
                if (message.type === 'REQUEST' || message.type === 'COMMIT_REQUIRED') {
                  try {
                    assertCurrent();
                    if (window.navigator.serviceWorker.controller !== worker) throw new Error('RESOURCE_WORKER_CHANGED');
                    channel.port1.postMessage({ type: message.type === 'REQUEST' ? 'FETCH' : 'COMMIT', operationId });
                  } catch (_) { controller.abort(); }
                  return;
                }
                if (controller.signal.aborted) return finish(new DOMException('Resource preparation interrupted', 'AbortError'));
                if (!message.ok) {
                  const error = new Error(message.error || 'RESOURCE_PREPARATION_FAILED');
                  error.name = message.name || 'Error'; error.status = message.status;
                  return finish(error);
                }
                try { assertCurrent(); finish(null, message); } catch (error) { finish(error); }
              };
              controller.signal.addEventListener('abort', cancelResource, { once: true });
              options.signal?.addEventListener('abort', revoke, { once: true });
              try {
                if (options.signal?.aborted) controller.abort();
                assertCurrent();
                worker.postMessage({ type: 'PREPARE_OFFLINE_RESOURCE', operationId, version, url,
                  maxBytes: config.resourceMaxBytes, timeoutMs: config.timeoutMs }, [channel.port2]);
              } catch (error) { finish(error); }
            });
          },
          async requestJSON(url, options = {}) {
            assertCurrent();
            if (++requests > 1) throw new Error('HYDRATION_ONE_REQUEST_PER_TURN');
            const target = new URL(url, window.location.origin);
            if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/')) throw new Error('HYDRATION_URL_INVALID');
            const { recordCount, ...fetchOptions } = options;
            const response = await window.fetch(target.href, { ...fetchOptions, redirect: 'error', cache: 'no-store', signal: controller.signal,
              headers: { ...getAuthHeaders(), 'x-store-id': window.localStorage.getItem('activeStoreId') || '', ...(options.headers || {}) } });
            try { assertCurrent(); } catch (error) { await response.body?.cancel(); throw error; }
            if ([401, 403].includes(response.status)) {
              authPaused = true;
              const error = new Error('HYDRATION_ACCESS_DENIED'); error.status = response.status;
              if (response.status === 401) core.reset({ forget: true, reason: 'server-refusal' });
              await response.body?.cancel();
              throw error;
            }
            if (!response.ok) {
              await response.body?.cancel();
              const error = new Error('HYDRATION_HTTP_ERROR'); error.status = response.status; throw error;
            }
            if (Number(response.headers.get('Content-Length') || 0) > config.maxBytes || !response.body?.getReader) {
              await response.body?.cancel(); throw new Error('HYDRATION_RESPONSE_LIMIT');
            }
            const reader = response.body.getReader(), decoder = new TextDecoder();
            let bytes = 0, text = '';
            try {
              while (true) {
                const chunk = await reader.read(); assertCurrent();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > config.maxBytes) throw new Error('HYDRATION_RESPONSE_LIMIT');
                text += decoder.decode(chunk.value, { stream: true });
              }
              text += decoder.decode();
            } catch (error) { await reader.cancel().catch(() => {}); throw error; }
            const data = JSON.parse(text); assertCurrent();
            if (data?.ok === false) throw new Error('HYDRATION_API_ERROR');
            const count = recordCount ? recordCount(data) : Array.isArray(data?.data) ? data.data.length : 1;
            if (!Number.isInteger(count) || count < 0 || count > config.maxRecords) throw new Error('HYDRATION_BATCH_LIMIT');
            return data;
          },
          async commit(repository, entries, options = {}) {
            assertCurrent();
            const { recordCount = entries.length - 1, guard, ...writeOptions } = options;
            if (!Number.isInteger(recordCount) || recordCount < 0 || recordCount > config.maxRecords
                || entries.length > config.maxRecords * 4 + 4) throw new Error('HYDRATION_BATCH_LIMIT');
            await repository.setMany(entries, { ...writeOptions, signal: controller.signal, lastSyncedAt: Date.now(), noQuotaCleanup: true, guard: () => {
              try { assertCurrent(); return !guard || guard(); } catch (_) { return false; }
            } });
            assertCurrent();
          },
        };
        try {
          const result = await task.run(context); assertCurrent();
          tasks.delete(task.key); task.resolve({ ok: true, value: result });
        } catch (error) {
          if (error.name === 'QuotaExceededError' || /QUOTA|STORAGE|LOCAL_WRITE_NOT_SAVED/i.test(error.message)) {
            storagePaused = true;
            for (const queued of tasks.values()) if (queued !== task) {
              tasks.delete(queued.key); queued.resolve({ ok: false, reason: 'storage-paused' });
            }
          }
          const interrupted = (controller.signal.aborted || error.name === 'AbortError') && controller.signal.reason !== 'timeout';
          if (interrupted && access.isCurrent() && task.scope === scopeKey() && !stopped) {
            task.notBefore = Date.now() + config.pauseMs;
          } else if (!storagePaused && [429, 502, 503, 504, undefined].includes(error.status)
              && (error instanceof TypeError || error.status || controller.signal.reason === 'timeout')
              && task.retries++ < config.maxRetries) {
            task.notBefore = Date.now() + config.pauseMs * (2 ** task.retries) + Math.floor(Math.random() * 1000);
          } else { tasks.delete(task.key); task.resolve({ ok: false, reason: error.status ? 'http-' + error.status : error.name }); }
        } finally { window.clearTimeout(deadline); active = null; nextTurn = Date.now() + config.pauseMs; }
      });
    } catch (_) { enabled = false; cancel('coordination-unavailable'); }
    if (retryAt !== Infinity) schedule(retryAt === null ? undefined : Math.max(0, retryAt - Date.now()));
  }
  function enqueue(id, run, options = {}) {
    if (!eligible() && (!enabled || stopped || storagePaused || !core?.isActive())) return Promise.resolve({ ok: false, reason: 'unavailable' });
    const scope = scopeKey(), key = scope + ':' + id;
    if (tasks.has(key)) return tasks.get(key).promise;
    if (tasks.size >= config.maxTasks) return Promise.resolve({ ok: false, reason: 'queue-full' });
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    tasks.set(key, { key, scope, run, resolve, promise, guard: options.guard, priority: options.priority || 10,
      sequence: ++sequence, retries: 0, createdAt: Date.now(), notBefore: 0 });
    schedule(); return promise;
  }
  window.AdminIdleHydration = Object.freeze({ enqueue, beginOperation, config,
    get supported() { return enabled; }, cancel });
  if (!enabled) return;
  function knowTab(key) {
    if (!key?.startsWith(prefix)) return;
    tabKeys.add(key);
    if (tabKeys.size > 256) { enabled = false; cancel('coordination-limit'); }
  }
  function acquireLifetime() {
    void locks.request(tabKey, async () => {
      live = true; schedule();
      await new Promise(resolve => { releaseLifetime = resolve; });
      live = false;
    }).catch(() => { enabled = false; cancel('coordination-unavailable'); });
  }
  try {
    channel = typeof window.BroadcastChannel === 'function' ? new window.BroadcastChannel('admin:idle:v1') : null;
    if (channel) channel.onmessage = event => { knowTab(event.data?.key); abort(); schedule(); };
    publish();
    acquireLifetime();
    void locks.query().then(state => {
      const living = new Set(state.held.map(lock => lock.name));
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const record = JSON.parse(window.localStorage.getItem(key));
        if (key !== tabKey && !living.has(key) && record?.quietUntil <= Date.now()) {
          // Only expired coordination metadata, never repository/outbox records.
          window.localStorage.removeItem(key);
        } else knowTab(key);
      }
      coordinationReady = true; schedule();
    }).catch(() => { enabled = false; cancel('coordination-unavailable'); });
  } catch (_) { enabled = false; return; }
  for (const name of ['keydown', 'click', 'input', 'change', 'submit', 'wheel']) {
    document.addEventListener(name, event => {
      if (event.isTrusted) { lastGestureAt = Date.now(); activity(); }
    }, { capture: true, passive: true });
  }
  for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel']) {
    document.addEventListener(name, event => {
      if (!event.isTrusted) return;
      if (name.startsWith('pointer')) pointerHeld = name === 'pointerdown';
      else touchHeld = name === 'touchstart';
      lastGestureAt = Date.now(); activity(); publish();
    }, { capture: true, passive: true });
  }
  document.addEventListener('scroll', event => {
    // Programmatic scrolling caused by API rendering is not user activity.
    if (event.isTrusted && (pointerHeld || touchHeld || Date.now() - lastGestureAt < 1500)) activity();
  }, { capture: true, passive: true });
  window.addEventListener('blur', () => { pointerHeld = false; touchHeld = false; publish(); });
  window.addEventListener('storage', event => {
    if (event.key?.startsWith(prefix)) {
      if (event.newValue === null) tabKeys.delete(event.key);
      else { knowTab(event.key); abort(); }
      schedule();
    }
    if (event.key === 'activeStoreId') cancel('store-changed');
  });
  window.addEventListener('admin:local-context-changed', event => {
    if (event.detail?.state !== 'active') cancel('context-changed');
    else schedule();
  });
  window.addEventListener('admin:access-context', event => {
    if (event.detail?.ok && !event.detail.offline) { authPaused = false; schedule(); }
  });
  document.addEventListener('tenantStoreChanged', () => cancel('store-changed'));
  window.addEventListener('offline', () => { abort(); schedule(); });
  window.addEventListener('online', () => schedule());
  document.addEventListener('visibilitychange', () => { if (document.hidden) abort(); schedule(); });
  window.addEventListener('popstate', activity);
  window.addEventListener('hashchange', activity);
  document.addEventListener('freeze', () => { frozen = true; abort(); });
  document.addEventListener('resume', () => { frozen = false; schedule(); });
  window.addEventListener('pagehide', () => { stopped = true; cancel('pagehide'); releaseLifetime?.(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && enabled) { stopped = false; activity(); acquireLifetime(); }
  });
})(window);
