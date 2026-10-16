(function () {
  'use strict';
  const core = window.AdminLocalRepository;
  const scheduler = window.AdminIdleHydration;
  if (!core || !scheduler || !('serviceWorker' in navigator)) return;
  let pending = null;
  let cancelPreparation = null;
  let attempt = 0;
  // Permanent failures are blocked for this SW version, not retried on each event.
  const blocked = new Set();

  async function prepare() {
    if (pending || !core.isActive()) return;
    const access = core.capture();
    const ticket = ++attempt;
    const isCurrent = () => ticket === attempt && access.isCurrent();
    const worker = navigator.serviceWorker.controller;
    const version = window.__APP_SERVICE_WORKER_VERSION__;
    const preparation = new AbortController();
    cancelPreparation = preparation;
    const task = (async () => {
      if (!worker || !scheduler.supported || typeof MessageChannel !== 'function') {
        throw new Error('OFFLINE_WORKER_NOT_CONTROLLING');
      }
      // This message only inspects Cache Storage. It cannot start a network request.
      const urls = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = window.setTimeout(() => finish(new Error('OFFLINE_PREPARATION_TIMEOUT')), 5000);
        function finish(error, value) {
          window.clearTimeout(timeout);
          channel.port1.close();
          if (error) reject(error); else resolve(value);
        }
        channel.port1.onmessage = event => {
          if (!isCurrent()) return finish(new Error('LOCAL_SCOPE_CHANGED'));
          if (event.data?.ok !== true || event.data.version !== window.__APP_SERVICE_WORKER_VERSION__) {
            return finish(new Error(event.data?.error || 'OFFLINE_WORKER_VERSION_CHANGED'));
          }
          if (event.data.supported !== true) return finish(new Error('OFFLINE_WORKER_LOCK_UNAVAILABLE'));
          if (!Array.isArray(event.data.urls) || event.data.urls.length > 1024) return finish(new Error('OFFLINE_PLAN_INVALID'));
          finish(null, event.data.urls);
        };
        try {
          worker.postMessage({ type: 'OFFLINE_RESOURCE_PLAN', version }, [channel.port2]);
        } catch (error) { finish(error); }
      });
      const seen = new Set();
      for (let index = 0; index < urls.length; index++) {
        if (!isCurrent() || navigator.serviceWorker.controller !== worker) return;
        const url = urls[index], key = version + ':' + url;
        if (typeof url !== 'string' || seen.has(url) || blocked.has(key)) continue;
        seen.add(url);
        const result = await scheduler.enqueue('pwa-resource:' + ticket + ':' + key,
          context => context.prepareResource(worker, url, version, { signal: preparation.signal }),
          { priority: 20, guard: () => isCurrent() && navigator.serviceWorker.controller === worker });
        if (!isCurrent()) return;
        if (!result.ok) {
          if (result.reason === 'scope-changed' || result.reason === 'context-changed' || result.reason === 'store-changed'
              || result.reason === 'pagehide' || result.reason === 'unavailable' || result.reason === 'storage-paused') return;
          if (!['TypeError', 'http-429', 'http-502', 'http-503', 'http-504'].includes(result.reason)) blocked.add(key);
          console.warn('OFFLINE_RESOURCE_PREPARATION_FAILED:', result.reason);
          continue;
        }
        const dependencies = (result.value.dependencies || []).filter(dependency => !seen.has(dependency));
        if (urls.length + dependencies.length <= 1024) urls.splice(index + 1, 0, ...dependencies);
      }
    })();
    pending = task;
    try {
      await task;
    } catch (error) {
      if (isCurrent()) {
        console.warn('OFFLINE_NAVIGATION_PREPARATION_FAILED:', error.message);
      }
    } finally {
      if (pending === task) { pending = null; cancelPreparation = null; }
    }
  }

  function updateContext() {
    attempt += 1;
    cancelPreparation?.abort();
    pending = null;
    if (core.isActive()) void prepare();
  }
  window.addEventListener('admin:local-context-changed', updateContext);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', updateContext);
  document.addEventListener('tenantStoreChanged', updateContext);
  window.addEventListener('storage', event => { if (event.key === 'activeStoreId') updateContext(); });
  window.addEventListener('admin:access-context', event => { if (event.detail?.ok && !event.detail.offline) void prepare(); });
  window.addEventListener('online', () => { if (core.isActive()) void prepare(); });
  updateContext();
})();
