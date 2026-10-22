(function (window) {
  'use strict';
  if (window.AdminOrdersCache) return;
  const core = window.AdminLocalRepository;
  const scheduler = window.AdminIdleHydration;
  const checkpointKey = 'meta:refresh:recent-orders';
  const workspaceKey = 'last-workspace';
  const bufferKey = 'meta:buffer:' + workspaceKey;
  const ttlMs = 15 * 60 * 1000;
  const maxPages = 4;
  const orderFields = new Set(['id', 'store_id', 'status_id', 'total_price', 'customer_name', 'customer_phone',
    'address', 'created_at', 'scheduled_at', 'status_code', 'status_title', 'status_color', 'method_code', 'method_title', 'offline_summary']);
  const textLimits = { customer_name: 128, customer_phone: 64, address: 256, created_at: 32, scheduled_at: 32,
    status_code: 64, status_title: 128, status_color: 32, method_code: 64, method_title: 128 };
  let generation = 0, pending = null;

  function scope() {
    if (!core?.isActive()) return null;
    const store = window.localStorage.getItem('activeStoreId');
    if (!Number.isSafeInteger(Number(store)) || Number(store) <= 0) return null;
    return core.create({ domain: 'orders:list:orders', version: 1,
      dimensions: { organizationalUnit: { type: 'store', id: String(store) }, accessContext: 'orders' },
      guard: () => window.localStorage.getItem('activeStoreId') === store });
  }
  const pageKey = index => 'offline:recent:' + index;
  const writeLock = repository => 'admin:buffer:' + repository.namespace + ':' + workspaceKey;
  async function hash(rows) {
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function validCheckpoint(value) {
    return value?.formatVersion === 1 && value.dataset === 'orders.recent-summaries'
      && value.complete === false && value.moduleComplete === false
      && Number.isInteger(value.pages) && value.pages >= 1 && value.pages <= maxPages
      && typeof value.run === 'string' && value.run.length <= 64 && Number.isFinite(value.confirmedAt)
      && Number.isSafeInteger(value.windowEnd) && typeof value.timezone === 'string'
      && typeof value.finished === 'boolean'
      && (value.cursor === null || (Number.isSafeInteger(value.cursor?.beforeId) && value.cursor.beforeId > 0
        && value.cursor.windowEnd === value.windowEnd))
      && (value.finished || (value.cursor !== null && value.pages < maxPages));
  }
  async function pagesFor(repository, checkpoint) {
    if (!validCheckpoint(checkpoint)) return null;
    const entries = await repository.getMany(Array.from({ length: checkpoint.pages }, (_, i) => pageKey(i)), { allowStale: true });
    const pages = [];
    for (const value of entries.values()) {
      if (value?.run !== checkpoint.run || !Array.isArray(value.orders) || value.orders.length > 25
          || value.version !== await hash(value.orders)) return null;
      pages.push(value);
    }
    return pages;
  }

  // Foreground persistence never takes the idle lock and never waits for HTTP.
  // Reuse the existing buffer lock/sequence, preserving the caller's TTL.
  async function writeWorkspace(repository, key, data, options) {
    // No hydration runs without Web Locks; keep legacy working persistence usable.
    if (!window.navigator.locks?.request) return repository.set(key, data, options);
    return window.navigator.locks.request(writeLock(repository), async () => {
      const previous = await repository.get(bufferKey, { allowStale: true });
      const sequence = Number(previous?.requestSequence || 0) + 1;
      if (!Number.isSafeInteger(sequence)) throw new Error('LOCAL_SEQUENCE_EXHAUSTED');
      return repository.setMany([[key, data], [bufferKey, { requestSequence: sequence,
        confirmedSequence: sequence, lastSyncedAt: options.lastSyncedAt ?? Date.now(), complete: false }]],
      { ...options, noQuotaCleanup: true });
    });
  }

  async function readPrepared() {
    const repository = scope();
    if (!repository) return null;
    const saved = await repository.getMany([checkpointKey, workspaceKey], { allowStale: true });
    const checkpoint = saved.get(checkpointKey), pages = await pagesFor(repository, checkpoint);
    if (!pages || !repository.isCurrent()) return null;
    const rows = new Map();
    pages.forEach(page => page.orders.forEach(order => rows.set(Number(order.id), order)));
    // A working snapshot wins even when it was saved for a different date filter.
    (saved.get(workspaceKey)?.orders || []).forEach(order => { if (rows.has(Number(order.id))) rows.set(Number(order.id), order); });
    return { orders: [...rows.values()].sort((a, b) => Number(b.id) - Number(a.id)),
      storeTimezone: checkpoint.timezone, prepared: true, partial: true, syncCursor: 0,
      pagination: { hasMore: false, nextOffset: 0 }, confirmedAt: checkpoint.confirmedAt };
  }

  async function prepare() {
    const access = window.AdminAccessContext, repository = scope();
    if (!repository || !scheduler?.supported || !access?.ok || access.offline) return;
    if (!(access.permissions || []).some(grant => grant === '*'
      || (grant?.key === 'orders.list.read' && ['all', 'stores', 'assigned', 'own'].includes(grant.access_rule)))) return;
    if (pending?.namespace === repository.namespace && pending.generation === generation) return pending.promise;
    const capturedGeneration = generation;
    const isCurrent = () => capturedGeneration === generation && repository.isCurrent();
    const task = (async () => {
      for (let turn = 0; turn < maxPages; turn++) {
        const result = await scheduler.enqueue('orders:recent-summaries:' + capturedGeneration, async idle => {
          const saved = await repository.getMany([checkpointKey, bufferKey], { allowStale: true });
          let checkpoint = saved.get(checkpointKey);
          const pages = await pagesFor(repository, checkpoint);
          idle.assertCurrent();
          if (!pages || checkpoint.confirmedAt <= Date.now() - ttlMs) checkpoint = null;
          if (checkpoint?.finished) return { done: true };
          const index = checkpoint?.pages || 0;
          const query = new URLSearchParams({ limit: String(Math.min(25, idle.config.maxRecords)) });
          if (checkpoint?.cursor) {
            query.set('before_id', String(checkpoint.cursor.beforeId));
            query.set('window_end', String(checkpoint.cursor.windowEnd));
          }
          const sequence = saved.get(bufferKey)?.requestSequence || 0;
          const response = await idle.requestJSON('/api/admin/orders/offline-page?' + query, {
            headers: { 'x-rbac-context': 'orders' }, recordCount: value => value.data?.length,
          });
          if (!Array.isArray(response.data)) throw new Error('INVALID_ORDER_OFFLINE_PAGE');
          const version = await hash(response.data);
          idle.assertCurrent();
          const storeId = Number(window.localStorage.getItem('activeStoreId'));
          if (response.formatVersion !== 1 || response.dataset !== 'orders.recent-summaries'
              || response.tenantId !== access.local_context?.tenantId || response.storeId !== storeId
              || response.complete !== false || response.moduleComplete !== false || response.version !== version
              || typeof response.timezone !== 'string' || !Number.isSafeInteger(response.windowEnd)
              || response.timezone.length > 64
              || (checkpoint && response.windowEnd !== checkpoint.windowEnd)
              || response.data.some((row, i, rows) => !Number.isSafeInteger(row.id) || row.id <= 0
                || row.store_id !== storeId || row.offline_summary !== true
                || !Number.isFinite(row.total_price) || Object.keys(row).some(key => !orderFields.has(key))
                || !Number.isSafeInteger(row.status_id) || row.status_id < 0
                || Object.entries(textLimits).some(([key, limit]) => row[key] !== null
                  && (typeof row[key] !== 'string' || row[key].length > limit * 2))
                || (i > 0 && rows[i - 1].id <= row.id)
                || (checkpoint?.cursor && row.id >= checkpoint.cursor.beforeId))) throw new Error('INVALID_ORDER_OFFLINE_PAGE');
          const cursor = response.cursor;
          if (cursor !== null && (!response.data.length || cursor?.windowEnd !== response.windowEnd
              || cursor?.beforeId !== response.data[response.data.length - 1].id)) throw new Error('INVALID_ORDER_OFFLINE_CURSOR');
          return window.navigator.locks.request(writeLock(repository), { signal: idle.signal }, async () => {
            idle.assertCurrent();
            const latest = await repository.get(bufferKey, { allowStale: true });
            idle.assertCurrent();
            if ((latest?.requestSequence || 0) !== sequence) return { done: false, skipped: 'working-response-changed' };
            const run = checkpoint?.run || window.crypto.randomUUID();
            const next = { formatVersion: 1, dataset: 'orders.recent-summaries', run, pages: index + 1,
              windowEnd: response.windowEnd, timezone: response.timezone, cursor,
              confirmedAt: Date.now(), confirmedPortion: response.data.length,
              finished: cursor === null || index + 1 === maxPages, complete: false, moduleComplete: false };
            await idle.commit(repository, [[pageKey(index), { run, orders: response.data, version }], [checkpointKey, next]],
              { recordCount: response.data.length, ttlMs: 72 * 60 * 60 * 1000, guard: isCurrent });
            return { done: next.finished };
          });
        }, { priority: 5, guard: isCurrent });
        if (!result.ok) {
          if (result.reason === 'http-403' && isCurrent()) core.reset({ forget: true, reason: 'server-refusal' });
          if (!['context-changed', 'store-changed', 'pagehide', 'scope-changed'].includes(result.reason)) {
            console.warn('ORDERS_OFFLINE_PREPARATION_FAILED:', result.reason);
          }
          return result;
        }
        if (result.value.done || !isCurrent()) return result;
      }
    })();
    const preparation = { namespace: repository.namespace, generation, promise: task };
    pending = preparation;
    try { await task; } finally { if (pending === preparation) pending = null; }
  }
  function queue() { void prepare().catch(error => console.warn('ORDERS_OFFLINE_PREPARATION_FAILED:', error.name)); }
  function changed() { generation += 1; queue(); }
  window.AdminOrdersCache = Object.freeze({ readPrepared, writeWorkspace });
  window.addEventListener('admin:local-context-changed', changed);
  window.addEventListener('admin:access-context', queue);
  document.addEventListener('tenantStoreChanged', changed);
  window.addEventListener('storage', event => { if (event.key === 'activeStoreId') changed(); });
  window.addEventListener('online', queue);
  queue();
})(window);
