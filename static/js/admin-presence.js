(function () {
  'use strict';

  const listeners = new Set();
  const clients = new Map();
  let counts = { siteVisitors: 0, identifiedOnlineClients: 0, chatActiveClients: 0 };
  let source = null;
  let scopeKey = '';
  let generation = 0;
  let hasSnapshot = false;

  function normalizeState(value) {
    const state = String(value || '').trim().toLowerCase();
    return state === 'site' || state === 'chat' ? state : 'offline';
  }

  function normalizeCounts(value) {
    return {
      siteVisitors: Math.max(0, Number(value?.siteVisitors || 0) || 0),
      identifiedOnlineClients: Math.max(0, Number(value?.identifiedOnlineClients || 0) || 0),
      chatActiveClients: Math.max(0, Number(value?.chatActiveClients || 0) || 0),
    };
  }

  function getScope() {
    let tenantId = 0;
    try { tenantId = Number(JSON.parse(localStorage.getItem('tenant') || '{}').id || 0); } catch (_) {}
    const storeId = Number(localStorage.getItem('activeStoreId') || 1);
    const token = String(localStorage.getItem('authToken') || '').trim();
    return { tenantId, storeId: storeId > 0 ? storeId : 1, token };
  }

  function notify(change) {
    listeners.forEach(function (listener) {
      try { listener(change); } catch (error) { console.error('ADMIN_PRESENCE_LISTENER_FAILED:', error); }
    });
  }

  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'snapshot') {
      clients.clear();
      (Array.isArray(payload.clients) ? payload.clients : []).forEach(function (client) {
        const clientId = Number(client?.clientId || 0);
        const state = normalizeState(client?.state);
        if (clientId > 0 && state !== 'offline') clients.set(clientId, state);
      });
      counts = normalizeCounts(payload.counts);
      hasSnapshot = true;
      notify({ type: 'snapshot', clientId: null, state: null, counts: { ...counts } });
      return;
    }
    if (payload.type !== 'delta') return;
    const clientId = Number(payload.clientId || 0);
    const previousState = normalizeState(payload.previousState);
    const state = normalizeState(payload.state);
    if (clientId > 0) {
      if (state === 'offline') clients.delete(clientId);
      else clients.set(clientId, state);
    }
    counts = normalizeCounts(payload.counts);
    notify({ type: 'delta', clientId: clientId > 0 ? clientId : null, previousState, state, counts: { ...counts } });
  }

  function disconnect() {
    generation += 1;
    if (source) source.close();
    source = null;
  }

  function connect() {
    const scope = getScope();
    const nextScopeKey = `${scope.tenantId}:${scope.storeId}:${scope.token}`;
    if (!scope.tenantId || !scope.storeId || !scope.token) {
      if (source || scopeKey || hasSnapshot || clients.size) {
        disconnect();
        scopeKey = '';
        clients.clear();
        counts = normalizeCounts(null);
        hasSnapshot = false;
        notify({ type: 'reset', clientId: null, state: null, counts: { ...counts } });
      }
      return;
    }
    if (source && scopeKey === nextScopeKey) return;
    disconnect();
    scopeKey = nextScopeKey;
    clients.clear();
    counts = normalizeCounts(null);
    hasSnapshot = false;
    notify({ type: 'reset', clientId: null, state: null, counts: { ...counts } });
    const currentGeneration = generation;
    const url = `/api/admin/presence/stream?store_id=${encodeURIComponent(scope.storeId)}&token=${encodeURIComponent(scope.token)}`;
    const nextSource = new EventSource(url);
    source = nextSource;
    nextSource.addEventListener('presence', function (event) {
      if (source !== nextSource || generation !== currentGeneration) return;
      try { applyPayload(JSON.parse(event.data || '{}')); } catch (_) {}
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.add(listener);
    listener({ type: hasSnapshot ? 'snapshot' : 'pending', clientId: null, state: null, counts: { ...counts } });
    return function () { listeners.delete(listener); };
  }

  window.AdminPresence = Object.freeze({
    getSnapshot: function () {
      return { ready: hasSnapshot, counts: { ...counts }, clients: Array.from(clients, ([clientId, state]) => ({ clientId, state })) };
    },
    getCounts: function () { return { ...counts }; },
    getClientState: function (clientId) { return clients.get(Number(clientId)) || 'offline'; },
    isOnSite: function (clientId) { return clients.has(Number(clientId)); },
    isInChat: function (clientId) { return clients.get(Number(clientId)) === 'chat'; },
    subscribe,
  });

  document.addEventListener('tenantStoreChanged', connect);
  window.addEventListener('storage', function (event) {
    if (event.key === 'activeStoreId' || event.key === 'tenant' || event.key === 'authToken') connect();
  });
  window.addEventListener('pagehide', disconnect);
  connect();
}());
