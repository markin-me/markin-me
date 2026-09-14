'use strict';

class MemoryPresenceStore {
  constructor() { this.scopes = new Map(); }
  getScope(key) { return this.scopes.get(key) || null; }
  ensureScope(key, scope) {
    let record = this.scopes.get(key);
    if (!record) {
      record = { scope, visitors: new Map(), sessionVisitors: new Map(), counts: { siteVisitors: 0, identifiedClients: 0, chatClients: 0 } };
      this.scopes.set(key, record);
    }
    return record;
  }
  deleteScopeIfEmpty(key) {
    const scope = this.scopes.get(key);
    if (scope && scope.visitors.size === 0) this.scopes.delete(key);
  }
  forEachScope(visitor) { this.scopes.forEach(visitor); }
}

module.exports = MemoryPresenceStore;
