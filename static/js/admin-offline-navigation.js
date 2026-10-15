(function () {
  'use strict';
  const button = document.getElementById('adminOfflinePrepare');
  const status = document.getElementById('adminOfflineStatus');
  const core = window.AdminLocalRepository;
  if (!button || !status || !core) return;
  let pending = null;
  let attempt = 0;

  async function prepare() {
    if (pending || !core.isActive()) return;
    const access = core.capture();
    const ticket = ++attempt;
    const isCurrent = () => ticket === attempt && access.isCurrent();
    button.disabled = true;
    status.textContent = 'Проверяем офлайн-ресурсы…';
    const task = (async () => {
      if (!navigator.serviceWorker?.controller || typeof MessageChannel !== 'function') {
        throw new Error('OFFLINE_WORKER_NOT_CONTROLLING');
      }
      await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = window.setTimeout(() => finish(new Error('OFFLINE_PREPARATION_TIMEOUT')), 20000);
        function finish(error) {
          window.clearTimeout(timeout);
          channel.port1.close();
          if (error) reject(error); else resolve();
        }
        channel.port1.onmessage = event => {
          if (!isCurrent()) return finish(new Error('LOCAL_SCOPE_CHANGED'));
          if (event.data?.ok !== true || event.data.version !== window.__APP_SERVICE_WORKER_VERSION__) {
            return finish(new Error(event.data?.error || 'OFFLINE_WORKER_VERSION_CHANGED'));
          }
          finish();
        };
        try {
          navigator.serviceWorker.controller.postMessage({ type: 'PREPARE_OFFLINE_NAVIGATION' }, [channel.port2]);
        } catch (error) { finish(error); }
      });
    })();
    pending = task;
    try {
      await task;
      if (isCurrent()) status.textContent = 'Офлайн-навигация готова. Доступность данных и действий зависит от раздела.';
    } catch (error) {
      if (isCurrent()) {
        status.textContent = 'Готовность не подтверждена. Подключитесь к сети и повторите подготовку.';
        console.warn('OFFLINE_NAVIGATION_PREPARATION_FAILED:', error.message);
      }
    } finally {
      if (pending === task) pending = null;
      if (isCurrent()) button.disabled = false;
    }
  }

  function updateContext() {
    attempt += 1;
    pending = null;
    button.disabled = !core.isActive();
    status.textContent = 'Офлайн-навигация не проверена.';
    if (core.isActive()) void prepare();
  }
  button.addEventListener('click', () => { void prepare(); });
  window.addEventListener('admin:local-context-changed', updateContext);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', updateContext);
  window.addEventListener('online', () => { if (core.isActive()) void prepare(); });
  window.addEventListener('offline', () => { if (core.isActive()) void prepare(); });
  updateContext();
})();
