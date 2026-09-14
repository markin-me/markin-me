(function () {
  'use strict';

  const HEARTBEAT_MS = 30_000;
  const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
  const tenantId = Number(document.querySelector('meta[name="tenant_id"]')?.content || 0);
  if (!(tenantId > 0)) return;

  const sessionKey = `shop_presence_session:t${tenantId}`;
  const tabKey = `shop_presence_tab:t${tenantId}`;
  let mode = 'site';
  let timer = null;
  let inFlight = false;
  let pending = false;

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }

  function readOrCreate(storage, key) {
    let value = '';
    try { value = String(storage.getItem(key) || ''); } catch (_) {}
    if (ID_PATTERN.test(value)) return value;
    value = randomId();
    try { storage.setItem(key, value); } catch (_) {}
    return value;
  }

  const presenceSessionId = readOrCreate(window.localStorage, sessionKey);
  const tabId = readOrCreate(window.sessionStorage, tabKey);

  function getStoreId() {
    const value = Number(window.localStorage.getItem('activeStoreId') || 1);
    return value > 0 ? value : 1;
  }

  function getCustomerToken() {
    return String(window.localStorage.getItem(`shop_customer_token_t${tenantId}`)
      || window.localStorage.getItem('shop_customer_token') || '').trim();
  }

  function buildRequest(visible) {
    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': String(tenantId),
      'x-store-id': String(getStoreId()),
    };
    const token = getCustomerToken();
    if (token) headers['x-customer-token'] = token;
    return {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({ presenceSessionId, tabId, mode, visible }),
    };
  }

  async function heartbeat() {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    try {
      await fetch('/api/public/presence/heartbeat', buildRequest(true));
    } catch (_) {
      // The next scheduled heartbeat or online/visible event retries naturally.
    } finally {
      inFlight = false;
      if (pending) { pending = false; heartbeat(); }
    }
  }

  function sendLeave() {
    const request = buildRequest(false);
    request.keepalive = true;
    fetch('/api/public/presence/heartbeat', request).catch(function () {});
  }

  function startTimer() {
    if (!timer) timer = window.setInterval(heartbeat, HEARTBEAT_MS);
  }

  function stopTimer() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  }

  function setMode(nextMode) {
    if (nextMode !== 'site' && nextMode !== 'chat') return;
    if (mode === nextMode) return;
    mode = nextMode;
    heartbeat();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { startTimer(); heartbeat(); }
    else { stopTimer(); sendLeave(); }
  });
  window.addEventListener('online', heartbeat);
  window.addEventListener('pagehide', function () { stopTimer(); sendLeave(); });

  window.ShopPresence = Object.freeze({ setMode });
  if (document.visibilityState === 'visible') { startTimer(); heartbeat(); }
}());
