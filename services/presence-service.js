'use strict';

const MemoryPresenceStore = require('./memory-presence-store');
const OFFLINE = 'offline';
const SITE_ACTIVE = 'site';
const CHAT_ACTIVE = 'chat';

class PresenceService {
  constructor({ store = new MemoryPresenceStore(), ttlMs = 75_000, cleanupIntervalMs = 30_000 } = {}) {
    this.store = store;
    this.ttlMs = ttlMs;
    this.listeners = new Set();
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === 'function') this.cleanupTimer.unref();
  }

  normalizeScope(scope) {
    const tenantId = Number(scope && scope.tenantId);
    const storeId = Number(scope && scope.storeId);
    if (!(tenantId > 0) || !(storeId > 0)) throw new TypeError('INVALID_PRESENCE_SCOPE');
    return { tenantId, storeId };
  }

  scopeKey(scope) { return `${scope.tenantId}:${scope.storeId}`; }

  visitorState(visitor) {
    if (!visitor) return OFFLINE;
    let hasSite = false;
    for (const tab of visitor.tabs.values()) {
      if (!tab.visible) continue;
      if (tab.mode === CHAT_ACTIVE) return CHAT_ACTIVE;
      hasSite = true;
    }
    return hasSite ? SITE_ACTIVE : OFFLINE;
  }

  adjustCounts(record, visitor, from, to) {
    if (from !== OFFLINE) {
      record.counts.siteVisitors -= 1;
      if (visitor.clientId) record.counts.identifiedClients -= 1;
      if (visitor.clientId && from === CHAT_ACTIVE) record.counts.chatClients -= 1;
    }
    if (to !== OFFLINE) {
      record.counts.siteVisitors += 1;
      if (visitor.clientId) record.counts.identifiedClients += 1;
      if (visitor.clientId && to === CHAT_ACTIVE) record.counts.chatClients += 1;
    }
  }

  emit(record, clientId, previousState, state) {
    if (previousState === state) return;
    const event = { scope: { ...record.scope }, clientId: clientId || null, previousState, state, counts: { ...record.counts } };
    this.listeners.forEach((listener) => {
      try { listener(event); } catch (error) { console.error('PRESENCE_SUBSCRIBER_FAILED:', error); }
    });
  }

  touch({ scope, presenceSessionId, tabId, clientId = null, mode = SITE_ACTIVE, visible = true, now = Date.now() }) {
    const normalizedScope = this.normalizeScope(scope);
    const key = this.scopeKey(normalizedScope);
    const record = this.store.ensureScope(key, normalizedScope);
    const normalizedClientId = Number(clientId) > 0 ? Number(clientId) : null;
    const visitorKey = normalizedClientId ? `client:${normalizedClientId}` : `session:${presenceSessionId}`;
    const priorKey = record.sessionVisitors.get(presenceSessionId);
    const previous = new Map();
    [priorKey, visitorKey].forEach((candidateKey) => {
      const visitor = candidateKey ? record.visitors.get(candidateKey) : null;
      if (visitor && !previous.has(candidateKey)) {
        previous.set(candidateKey, { visitor: { clientId: visitor.clientId }, state: this.visitorState(visitor) });
      }
    });

    let visitor = record.visitors.get(visitorKey);
    if (!visitor) {
      visitor = { clientId: normalizedClientId, sessions: new Set(), tabs: new Map() };
      record.visitors.set(visitorKey, visitor);
      previous.set(visitorKey, { visitor: { clientId: visitor.clientId }, state: OFFLINE });
    }
    if (priorKey && priorKey !== visitorKey) {
      const prior = record.visitors.get(priorKey);
      if (prior) {
        prior.tabs.forEach((tab, priorTabId) => {
          if (tab.presenceSessionId === presenceSessionId) {
            visitor.tabs.set(priorTabId, tab);
            prior.tabs.delete(priorTabId);
          }
        });
        prior.sessions.delete(presenceSessionId);
        if (prior.tabs.size === 0) this.removeVisitor(record, priorKey, prior);
      }
    }
    visitor.clientId = normalizedClientId;
    visitor.sessions.add(presenceSessionId);
    record.sessionVisitors.set(presenceSessionId, visitorKey);
    visitor.tabs.set(tabId, { presenceSessionId, mode, visible: visible === true, lastSeenAt: Number(now) });

    const transitions = [];
    previous.forEach(({ visitor: oldVisitor, state: from }, affectedKey) => {
      const current = record.visitors.get(affectedKey);
      const to = this.visitorState(current);
      this.adjustCounts(record, oldVisitor, from, OFFLINE);
      if (current) this.adjustCounts(record, current, OFFLINE, to);
      transitions.push({ clientId: current ? current.clientId : oldVisitor.clientId, from, to });
    });
    transitions.forEach((transition) => this.emit(record, transition.clientId, transition.from, transition.to));
  }

  leave({ scope, presenceSessionId, tabId }) {
    const normalizedScope = this.normalizeScope(scope);
    const key = this.scopeKey(normalizedScope);
    const record = this.store.getScope(key);
    if (!record) return;
    const visitorKey = record.sessionVisitors.get(presenceSessionId);
    const visitor = visitorKey ? record.visitors.get(visitorKey) : null;
    if (!visitor || visitor.tabs.get(tabId)?.presenceSessionId !== presenceSessionId) return;
    const from = this.visitorState(visitor);
    visitor.tabs.delete(tabId);
    this.pruneVisitorSessions(record, visitorKey, visitor);
    const to = this.visitorState(visitor);
    this.adjustCounts(record, visitor, from, to);
    if (visitor.tabs.size === 0) this.removeVisitor(record, visitorKey, visitor);
    this.emit(record, visitor.clientId, from, to);
    this.store.deleteScopeIfEmpty(key);
  }

  removeVisitor(record, visitorKey, visitor) {
    visitor.sessions.forEach((sessionId) => {
      if (record.sessionVisitors.get(sessionId) === visitorKey) record.sessionVisitors.delete(sessionId);
    });
    record.visitors.delete(visitorKey);
  }

  pruneVisitorSessions(record, visitorKey, visitor) {
    const activeSessions = new Set(Array.from(visitor.tabs.values()).map((tab) => tab.presenceSessionId));
    visitor.sessions.forEach((sessionId) => {
      if (activeSessions.has(sessionId)) return;
      visitor.sessions.delete(sessionId);
      if (record.sessionVisitors.get(sessionId) === visitorKey) record.sessionVisitors.delete(sessionId);
    });
  }

  cleanupExpired(now = Date.now()) {
    this.store.forEachScope((record, key) => {
      record.visitors.forEach((visitor, visitorKey) => {
        const from = this.visitorState(visitor);
        visitor.tabs.forEach((tab, tabId) => {
          if (Number(now) - tab.lastSeenAt > this.ttlMs) visitor.tabs.delete(tabId);
        });
        this.pruneVisitorSessions(record, visitorKey, visitor);
        const to = this.visitorState(visitor);
        this.adjustCounts(record, visitor, from, to);
        if (visitor.tabs.size === 0) this.removeVisitor(record, visitorKey, visitor);
        this.emit(record, visitor.clientId, from, to);
      });
      this.store.deleteScopeIfEmpty(key);
    });
  }

  getCounts(scope) {
    const normalized = this.normalizeScope(scope);
    const record = this.store.getScope(this.scopeKey(normalized));
    return record ? { ...record.counts } : { siteVisitors: 0, identifiedClients: 0, chatClients: 0 };
  }

  getClientState(scope, clientId) {
    const normalized = this.normalizeScope(scope);
    const record = this.store.getScope(this.scopeKey(normalized));
    return record ? this.visitorState(record.visitors.get(`client:${Number(clientId)}`)) : OFFLINE;
  }

  getOnlineClientIds(scope) {
    const normalized = this.normalizeScope(scope);
    const record = this.store.getScope(this.scopeKey(normalized));
    if (!record) return [];
    const ids = [];
    record.visitors.forEach((visitor) => {
      if (visitor.clientId && this.visitorState(visitor) !== OFFLINE) ids.push(visitor.clientId);
    });
    return ids;
  }

  getSnapshot(scope) {
    const normalized = this.normalizeScope(scope);
    return {
      counts: this.getCounts(normalized),
      clients: this.getOnlineClientIds(normalized).map((clientId) => ({ clientId, state: this.getClientState(normalized, clientId) })),
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('PRESENCE_LISTENER_REQUIRED');
    this.listeners.add(listener);
    return () => this.unsubscribe(listener);
  }
  unsubscribe(listener) { this.listeners.delete(listener); }
  close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.listeners.clear();
  }
}

module.exports = { PresenceService, OFFLINE, SITE_ACTIVE, CHAT_ACTIVE };
