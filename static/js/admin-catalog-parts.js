(function (window) {
  'use strict';
  if (window.AdminCatalogParts) return;
  const core = window.AdminLocalRepository, scheduler = window.AdminIdleHydration;
  const part = 'core-texts', checkpointKey = 'meta:core-texts';
  const ttlMs = 15 * 60 * 1000, maxTurns = 100;
  const fields = ['id', 'name', 'sku', 'description_short', 'description', 'is_active', 'site_visibility'];
  const sourceParts = ['units', 'conversions', 'unit-links', 'ingredient-links', 'variant-links',
    'option-groups', 'option-links', 'option-items', 'stock'];
  const maxIssues = 128;
  let generation = 0, pending = null, sourcesPending = null, retryPending = null, immutablePending = null, lightPending = null;

  function accessContext(context) {
    const permits = key => (context?.permissions || []).some(grant => grant === '*'
      || (grant?.key === key && ['all', 'stores'].includes(grant.access_rule)));
    return permits('products.catalog.read') ? 'products' : permits('new_order.create') ? 'new-order' : null;
  }
  function repository(context = window.AdminAccessContext) {
    const storeId = window.localStorage.getItem('activeStoreId'), rbacContext = accessContext(context);
    if (!core?.isActive() || !rbacContext || !/^[1-9][0-9]*$/.test(storeId || '')
        || !Number.isSafeInteger(Number(storeId))) return null;
    return core.create({ domain: 'catalog:passport-staging', version: 1,
      dimensions: { organizationalUnit: { type: 'store', id: storeId }, accessContext: rbacContext },
      guard: () => window.localStorage.getItem('activeStoreId') === storeId });
  }
  async function contentVersion(data, tenantId, storeId) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).length !== fields.length || Object.keys(data).some(key => !fields.includes(key))
        || !Number.isSafeInteger(data.id) || data.id <= 0
        || fields.slice(1, 5).some(key => data[key] !== null && typeof data[key] !== 'string')
        || ![0, 1, null].includes(data.is_active) || ![0, 1, null].includes(data.site_visibility)) return null;
    const ordered = Object.fromEntries(fields.map(key => [key, data[key]]));
    const textBytes = new TextEncoder().encode(fields.slice(1, 5).map(key => data[key] || '').join('')).length;
    if (textBytes > 8192) return null;
    const bytes = new TextEncoder().encode(JSON.stringify([1, part, tenantId, storeId, ordered]));
    const hash = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  }
  function cursorId(cursor, tenantId, storeId) {
    if (cursor === null) return 0;
    if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('INVALID_CORE_CURSOR');
    const value = JSON.parse(window.atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1 || value[1] !== part
        || value[2] !== tenantId || value[3] !== storeId || !Number.isSafeInteger(value[4]) || value[4] <= 0
        || window.btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== cursor) {
      throw new Error('INVALID_CORE_CURSOR');
    }
    return value[4];
  }
  const partKey = id => 'staging:core-texts:' + id;
  const partCheckpointKey = id => 'checkpoint:core-texts:' + id;
  const issuesKey = name => 'meta:issues:' + name;
  const issueKey = (name, id) => 'issue:' + name + ':' + id;
  async function issues(repo, name) {
    const value = await repo.get(issuesKey(name), { allowStale: true }) || [];
    if (!Array.isArray(value) || value.length > maxIssues || new Set(value.map(row => row.id)).size !== value.length
        || value.some(row => !Number.isSafeInteger(row.id) || row.id <= 0 || !Number.isFinite(row.retryAt)
          || !Number.isSafeInteger(row.attempts) || row.attempts < 0)) throw new Error('INVALID_PART_ISSUES');
    return value;
  }
  function issueEntries(queue, name, id, reason, now) {
    const previous = queue.find(row => row.id === id);
    const next = queue.filter(row => row.id !== id);
    if (reason) {
      if (next.length >= maxIssues) throw new Error('CATALOG_ISSUE_QUEUE_LIMIT');
      const attempts = Math.min(100, (previous?.attempts || 0) + 1);
      next.push({ id, attempts, retryAt: now + ttlMs * 2 ** Math.min(attempts - 1, 6) });
    }
    return [[issuesKey(name), next], [issueKey(name, id), { part: name, id,
      state: reason ? 'retry-pending' : 'resolved', reason: reason || null, confirmedAt: now,
      snapshotConsistent: false, passportComplete: false }]];
  }

  const budgetKey = 'meta:preparation-budget';
  const entrySize = (repo, key, value) => new TextEncoder().encode(JSON.stringify([key, value])).length + 256 + repo.namespace.length * 2;
  async function preparationBudget(idle, repo, guard) {
    const budget = await repo.get(budgetKey, { allowStale: true });
    if (budget) {
      if (!Number.isSafeInteger(budget.bytes) || budget.bytes < 0 || !Number.isSafeInteger(budget.records)
          || budget.records < 0) throw new Error('INVALID_PREPARATION_BUDGET');
      return budget;
    }
    // Read bounded pages under the existing exclusive hydration lock. No write
    // until the complete baseline is known, no lost legacy records or eviction.
    let cursor = null, bytes = 0, records = 0;
    do {
      idle.assertCurrent();
      const page = await repo.scanEntries({ cursor, limit: 25, signal: idle.signal, guard });
      for (const entry of page.entries) {
        if (entry.key === budgetKey) continue;
        bytes += entrySize(repo, entry.key, entry.data); records += 1;
      }
      if (bytes > 8 * 1024 * 1024 || records > 4096) throw new Error('CATALOG_STAGING_STORAGE_LIMIT');
      cursor = page.cursor;
    } while (cursor !== null);
    idle.assertCurrent();
    return { bytes, records };
  }
  async function commitPreparation(idle, repo, entries, recordCount, guard) {
    const budget = await preparationBudget(idle, repo, guard);
    const previous = await repo.getMany(entries.map(([key]) => key), { allowStale: true });
    let { bytes, records } = budget;
    for (const [key, value] of entries) {
      const old = previous.get(key);
      bytes += entrySize(repo, key, value) - (old === null ? 0 : entrySize(repo, key, old));
      if (old === null) records += 1;
    }
    if (bytes > 8 * 1024 * 1024 || records > 4096) throw new Error('CATALOG_STAGING_STORAGE_LIMIT');
    idle.assertCurrent();
    await idle.commit(repo, [...entries, [budgetKey, { bytes, records, complete: false }]],
      { recordCount, ttlMs: 30 * 24 * 60 * 60 * 1000, guard });
  }

  // Diagnostic staging reader only. Never supplies CatalogRepository/getProductPassport.
  async function readStagedPart(productId) {
    const repo = repository();
    if (!repo || !Number.isSafeInteger(productId) || productId <= 0) return null;
    const entries = await repo.getMany([partKey(productId), partCheckpointKey(productId)], { allowStale: true });
    const staged = entries.get(partKey(productId)), checkpoint = entries.get(partCheckpointKey(productId));
    if (staged?.formatVersion !== 1 || staged.state !== 'staging' || staged.part !== part || staged.productId !== productId
        || staged.data?.id !== productId || staged.tenantId !== window.AdminAccessContext?.local_context?.tenantId
        || staged.storeId !== Number(window.localStorage.getItem('activeStoreId'))
        || staged.passportComplete !== false || staged.snapshotId !== null || staged.snapshotConsistent !== false
        || checkpoint?.formatVersion !== 1 || checkpoint.part !== part || checkpoint.productId !== productId || checkpoint.partComplete !== true
        || checkpoint.sourceVersion !== staged.sourceVersion || checkpoint.candidateVersion !== staged.candidateVersion
        || checkpoint.passportComplete !== false || checkpoint.snapshotConsistent !== false
        || checkpoint.cursor !== null || checkpoint.chunk !== 0 || !Number.isFinite(checkpoint.confirmedAt)) return null;
    const hash = await contentVersion(staged.data, staged.tenantId, staged.storeId);
    if (!repo.isCurrent() || hash !== staged.sourceVersion || staged.candidateVersion !== part + ':' + hash) return null;
    return { ...staged, confirmedAt: checkpoint.confirmedAt };
  }

  async function prepare() {
    const context = window.AdminAccessContext, repo = repository(context);
    if (!repo || !context?.ok || context.offline || !scheduler?.supported) return;
    const captured = generation, tenantId = context.local_context?.tenantId;
    const storeId = Number(window.localStorage.getItem('activeStoreId')), rbacContext = accessContext(context);
    const isCurrent = () => generation === captured && repo.isCurrent() && window.AdminAccessContext === context;
    if (pending?.namespace === repo.namespace && pending.generation === captured) return pending.promise;
    const task = (async () => {
      // Bounded first pass; future lifecycle triggers resume the durable keyset.
      for (let turn = 0; turn < maxTurns && isCurrent(); turn++) {
        const result = await scheduler.enqueue('catalog:core-texts:' + captured, async idle => {
          // The shared idle lock includes this read, HTTP, and guarded commit.
          const saved = await repo.get(checkpointKey, { allowStale: true });
          idle.assertCurrent();
          if (saved && (saved.formatVersion !== 1 || saved.part !== part || saved.complete !== false
              || saved.tenantId !== tenantId || saved.storeId !== storeId || !Number.isFinite(saved.confirmedAt)
              || typeof saved.scanExhausted !== 'boolean' || !Number.isSafeInteger(saved.afterId) || saved.afterId < 0
              || typeof saved.runId !== 'string' || saved.runId.length > 64)) throw new Error('INVALID_CORE_CHECKPOINT');
          if (saved?.scanExhausted && saved.confirmedAt > Date.now() - ttlMs) return { done: true, fresh: true };
          const previous = saved?.scanExhausted ? null : saved;
          const cursor = previous?.cursor ?? null, afterId = previous?.afterId || 0;
          if (cursorId(cursor, tenantId, storeId) !== afterId) throw new Error('INVALID_CORE_CHECKPOINT_CURSOR');
          const response = await idle.requestJSON('/api/admin/catalog/product-passport-core?defer_large=1'
            + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), {
            headers: { 'x-rbac-context': rbacContext }, recordCount: value => value.data === null ? 0 : 1,
          });
          idle.assertCurrent();
          if (new TextEncoder().encode(JSON.stringify(response)).length > 64 * 1024
              || response.formatVersion !== 1 || response.part !== part || response.tenantId !== tenantId || response.storeId !== storeId
              || response.versionKind !== 'part-content-sha256' || response.snapshotId !== null
              || response.snapshotConsistent !== false || response.passportComplete !== false
              || response.scanExhausted !== (response.data === null && !response.deferred)) throw new Error('INVALID_CORE_RESPONSE');
          const deferredId = response.deferred?.productId;
          if (response.deferred && (response.data !== null || !Number.isSafeInteger(deferredId) || deferredId <= afterId
              || response.deferred.part !== part || response.deferred.reason !== 'CATALOG_CORE_TEXT_TOO_LARGE'
              || !Number.isSafeInteger(response.deferred.textBytes) || response.deferred.textBytes <= 8192)) throw new Error('INVALID_CORE_DEFERRED');
          const hash = response.data === null ? null : await contentVersion(response.data, tenantId, storeId);
          idle.assertCurrent();
          if (hash !== response.sourceVersion || (response.data !== null && (!hash || response.data.id <= afterId))
              || cursorId(response.cursor, tenantId, storeId) !== (response.data?.id || deferredId || 0)) throw new Error('INVALID_CORE_VERSION_OR_CURSOR');
          const now = Date.now(), runId = previous?.runId || window.crypto.randomUUID();
          const queue = await issues(repo, part);
          const next = { formatVersion: 1, part, tenantId, storeId, runId,
            cursor: response.cursor, afterId: response.data?.id || deferredId || afterId,
            confirmedAt: now, confirmedPortion: response.data === null ? 0 : 1,
            scanExhausted: response.scanExhausted, snapshotConsistent: false, complete: false };
          const entries = [[checkpointKey, next]];
          if (response.deferred) entries.push(...issueEntries(queue, part, deferredId, response.deferred.reason, now));
          if (response.data !== null) {
            const productId = response.data.id, candidateVersion = part + ':' + hash;
            if (queue.some(row => row.id === productId)) entries.push(...issueEntries(queue, part, productId, null, now));
            entries.push([partKey(productId), { formatVersion: 1, part, tenantId, storeId, productId,
              candidateVersion, sourceVersion: hash, snapshotId: null, snapshotConsistent: false,
              state: 'staging', passportComplete: false, data: response.data }],
            [partCheckpointKey(productId), { formatVersion: 1, part, productId, candidateVersion,
              sourceVersion: hash, cursor: null, chunk: 0, partComplete: true,
              confirmedAt: now, snapshotConsistent: false, passportComplete: false }]);
          }
          // No runtime publication, dirty flags, working index, or quota cleanup.
          await commitPreparation(idle, repo, entries, response.data === null ? 0 : 1, isCurrent);
          return { done: response.scanExhausted };
        }, { priority: 10, guard: isCurrent });
        if (!result.ok) {
          if (isCurrent() && !['context-changed', 'store-changed', 'pagehide', 'scope-changed'].includes(result.reason)) {
            console.warn('CATALOG_PART_PREPARATION_FAILED:', result.reason);
          }
          return result;
        }
        if (result.value.done) return result;
      }
      return { partial: true, reason: 'turn-budget' };
    })();
    const preparation = { namespace: repo.namespace, generation: captured, promise: task };
    pending = preparation;
    try { await task; } finally { if (pending === preparation) pending = null; }
  }
  function sourceCursor(cursor, name, tenantId, storeId) {
    if (cursor === null) return 0;
    if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('INVALID_SOURCE_CURSOR');
    const value = JSON.parse(window.atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(value) || value.length !== 6 || value[0] !== 1 || value[1] !== 'live-source'
        || value[2] !== name || value[3] !== tenantId || value[4] !== storeId || !Number.isSafeInteger(value[5]) || value[5] <= 0
        || window.btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== cursor) throw new Error('INVALID_SOURCE_CURSOR');
    return value[5];
  }
  async function sourceVersion(name, data, tenantId, storeId) {
    const bytes = new TextEncoder().encode(JSON.stringify([1, 'live-source', name, tenantId, storeId, data]));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  }
  async function prepareSources() {
    const context = window.AdminAccessContext, repo = repository(context), captured = generation;
    if (!repo || !context?.ok || context.offline || !scheduler?.supported || accessContext(context) !== 'products') return;
    if (sourcesPending?.generation === captured) return sourcesPending.promise;
    const tenantId = context.local_context.tenantId, storeId = Number(localStorage.getItem('activeStoreId'));
    const guard = () => captured === generation && repo.isCurrent() && window.AdminAccessContext === context;
    const task = (async () => {
      const done = new Set();
      // Round-robin across source parts. No part can monopolize the whole pass.
      for (let round = 0; round < maxTurns && guard() && done.size < sourceParts.length; round++) {
        for (const name of sourceParts) {
          if (!guard()) return;
          if (done.has(name)) continue;
          const result = await scheduler.enqueue('catalog:source:' + captured + ':' + name, async idle => {
            const key = 'meta:source:' + name, saved = await repo.get(key, { allowStale: true });
            idle.assertCurrent();
            if (saved && (saved.part !== name || saved.projection !== 'live-source' || saved.complete !== false
                || saved.tenantId !== tenantId || saved.storeId !== storeId || saved.snapshotConsistent !== false
                || !Number.isSafeInteger(saved.afterId) || saved.afterId < 0 || !Number.isFinite(saved.confirmedAt)
                || typeof saved.scanExhausted !== 'boolean')) throw new Error('INVALID_SOURCE_CHECKPOINT');
            const queue = await issues(repo, 'source:' + name), retry = queue.find(row => row.retryAt <= Date.now());
            if (!retry && saved?.scanExhausted && saved.confirmedAt > Date.now() - ttlMs) return { done: true };
            const prior = saved?.scanExhausted ? null : saved, afterId = retry ? 0 : prior?.afterId || 0;
            const cursor = retry ? null : prior?.cursor ?? null;
            if (sourceCursor(cursor, name, tenantId, storeId) !== afterId) throw new Error('INVALID_SOURCE_CHECKPOINT_CURSOR');
            const response = await idle.requestJSON('/api/admin/catalog/product-passport-source/' + name
              + (retry ? '?retry_id=' + retry.id : cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), {
              headers: { 'x-rbac-context': accessContext(context) }, recordCount: value => value.records?.length });
            idle.assertCurrent();
            if (new TextEncoder().encode(JSON.stringify(response)).length > 64 * 1024 || response.formatVersion !== 1
                || response.part !== name || response.projection !== 'live-source' || response.tenantId !== tenantId
                || response.storeId !== storeId || response.snapshotId !== null || response.snapshotConsistent !== false
                || response.sealed !== false || response.passportComplete !== false || !Array.isArray(response.records)
                || response.records.length > 4 || response.scanExhausted !== !response.records.length) throw new Error('INVALID_SOURCE_RESPONSE');
            const now = Date.now(), entries = [];
            let previousId = afterId, currentQueue = queue;
            for (const row of response.records) {
              if (!Number.isSafeInteger(row.id) || row.id <= previousId || (retry && row.id !== retry.id)) throw new Error('INVALID_SOURCE_ROW');
              previousId = row.id;
              if (row.issue) {
                if (row.data !== null || row.sourceVersion !== null || row.issue.reason !== 'CATALOG_SOURCE_ROW_TOO_LARGE'
                    || !Number.isSafeInteger(row.issue.textBytes) || row.issue.textBytes < 0) throw new Error('INVALID_SOURCE_ISSUE');
                const changes = issueEntries(currentQueue, 'source:' + name, row.id, row.issue.reason, now);
                currentQueue = changes[0][1]; entries.push(changes[1]);
              } else {
                if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)
                    || Object.values(row.data).some(value => value !== null && !['string', 'number'].includes(typeof value))
                    || Number(row.data[name === 'stock' ? 'product_id' : 'id']) !== row.id
                    || (name === 'stock' && Number(row.data.store_id) !== storeId)
                    || new TextEncoder().encode(JSON.stringify(row.data)).length > 12 * 1024
                    || await sourceVersion(name, row.data, tenantId, storeId) !== row.sourceVersion) throw new Error('INVALID_SOURCE_VERSION');
                entries.push(['source:' + name + ':' + row.id, { projection: 'live-source', part: name, rowId: row.id,
                  tenantId, storeId, data: row.data, sourceVersion: row.sourceVersion, state: 'staging',
                  snapshotId: null, snapshotConsistent: false, passportComplete: false, confirmedAt: now }]);
                if (currentQueue.some(item => item.id === row.id)) {
                  const changes = issueEntries(currentQueue, 'source:' + name, row.id, null, now);
                  currentQueue = changes[0][1]; entries.push(changes[1]);
                }
              }
            }
            if (sourceCursor(response.cursor, name, tenantId, storeId) !== (response.records.length ? previousId : 0)) throw new Error('INVALID_SOURCE_NEXT_CURSOR');
            if (retry && response.records.length > 1) throw new Error('INVALID_SOURCE_RETRY');
            if (retry && !response.records.length) {
              const changes = issueEntries(queue, 'source:' + name, retry.id, 'SOURCE_NOT_AVAILABLE', now);
              currentQueue = changes[0][1]; entries.push(changes[1]);
            }
            entries.push([issuesKey('source:' + name), currentQueue]);
            if (!retry) entries.push([key, { projection: 'live-source', part: name,
              tenantId, storeId, afterId: previousId, cursor: response.cursor, confirmedAt: now,
              scanExhausted: response.scanExhausted, complete: false, snapshotConsistent: false,
              unresolved: currentQueue.length }]);
            await commitPreparation(idle, repo, entries, response.records.length, guard);
            return { done: !retry && response.scanExhausted };
          }, { priority: 12, guard });
          if (!guard()) return;
          if (!result.ok) {
            // Keep other independent parts eligible; failure is not completeness.
            done.add(name);
            if (guard()) console.warn('CATALOG_SOURCE_PREPARATION_FAILED:', name, result.reason);
          } else if (result.value.done) done.add(name);
        }
      }
    })();
    const preparation = { generation: captured, promise: task }; sourcesPending = preparation;
    try { await task; } finally { if (sourcesPending === preparation) sourcesPending = null; }
  }
  async function retryCoreIssues() {
    const context = window.AdminAccessContext, repo = repository(context), captured = generation;
    if (!repo || !context?.ok || context.offline || !scheduler?.supported) return;
    if (retryPending?.generation === captured) return retryPending.promise;
    const guard = () => captured === generation && repo.isCurrent() && window.AdminAccessContext === context;
    const tenantId = context.local_context.tenantId, storeId = Number(localStorage.getItem('activeStoreId'));
    const task = (async () => {
      for (let turn = 0; turn < maxIssues && guard(); turn++) {
        const result = await scheduler.enqueue('catalog:core-retry:' + captured, async idle => {
          const queue = await issues(repo, part), item = queue.find(row => row.retryAt <= Date.now());
          idle.assertCurrent();
          if (!item) return { done: true };
          const response = await idle.requestJSON('/api/admin/catalog/product-passport-core?defer_large=1&retry_id=' + item.id,
            { headers: { 'x-rbac-context': accessContext(context) }, recordCount: value => value.data === null ? 0 : 1 });
          idle.assertCurrent();
          if (new TextEncoder().encode(JSON.stringify(response)).length > 64 * 1024 || response.formatVersion !== 1
              || response.part !== part || response.tenantId !== tenantId || response.storeId !== storeId
              || response.versionKind !== 'part-content-sha256' || response.snapshotId !== null
              || response.snapshotConsistent !== false || response.passportComplete !== false) throw new Error('INVALID_CORE_RETRY');
          const now = Date.now(), entries = [];
          if (response.deferred) {
            if (response.deferred.productId !== item.id || response.deferred.part !== part
                || response.deferred.reason !== 'CATALOG_CORE_TEXT_TOO_LARGE' || response.data !== null
                || response.sourceVersion !== null || response.scanExhausted !== false
                || cursorId(response.cursor, tenantId, storeId) !== item.id) throw new Error('INVALID_CORE_RETRY');
            entries.push(...issueEntries(queue, part, item.id, response.deferred.reason, now));
          } else if (response.data !== null) {
            const hash = await contentVersion(response.data, tenantId, storeId);
            if (response.data.id !== item.id || !hash || hash !== response.sourceVersion || response.scanExhausted !== false
                || cursorId(response.cursor, tenantId, storeId) !== item.id) throw new Error('INVALID_CORE_RETRY_VERSION');
            const candidateVersion = part + ':' + hash;
            entries.push([partKey(item.id), { formatVersion: 1, part, tenantId, storeId, productId: item.id,
              data: response.data, sourceVersion: hash, candidateVersion, state: 'staging', snapshotId: null,
              snapshotConsistent: false, passportComplete: false }], [partCheckpointKey(item.id), {
              formatVersion: 1, part, productId: item.id, sourceVersion: hash, candidateVersion,
              chunk: 0, cursor: null, partComplete: true, confirmedAt: now, snapshotConsistent: false, passportComplete: false }],
            ...issueEntries(queue, part, item.id, null, now));
          } else {
            if (response.cursor !== null || response.sourceVersion !== null || response.scanExhausted !== true) throw new Error('INVALID_CORE_RETRY_EMPTY');
            // Absence is not proof of deletion. Keep an explicit pending issue.
            entries.push(...issueEntries(queue, part, item.id, 'SOURCE_NOT_AVAILABLE', now));
          }
          await commitPreparation(idle, repo, entries, response.data ? 1 : 0, guard);
          return { done: false };
        }, { priority: 25, guard });
        if (!result.ok || result.value.done) return;
      }
    })();
    const preparation = { generation: captured, promise: task }; retryPending = preparation;
    try { await task; } finally { if (retryPending === preparation) retryPending = null; }
  }
  const immutableKey = 'meta:immutable:membership';
  const immutableBase = '/api/admin/catalog/passport-exports';
  const bytesHash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2, '0')).join('');
  const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value));
  function decodeChunk(value) {
    if (typeof value !== 'string' || value.length > 32768 || value.length % 4
        || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('INVALID_IMMUTABLE_CHUNK');
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  async function frozenMembership(repo, checkpoint, idle) {
    const root = checkpoint.manifest, ids = [];
    const expected = root.parts[0];
    for (let chunk = 0; chunk < expected.chunks; chunk++) {
      idle.assertCurrent();
      const value = await repo.get('immutable:' + root.snapshotId + ':output:' + chunk, { allowStale: true });
      if (!value || value.chunk !== chunk || value.snapshotId !== root.snapshotId) throw new Error('IMMUTABLE_CHUNK_MISSING');
      const bytes = decodeChunk(value.payload);
      if (await bytesHash(bytes) !== value.sha256) throw new Error('IMMUTABLE_HASH_MISMATCH');
      const page = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!Array.isArray(page) || page.length > 25 || page.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('INVALID_MEMBERSHIP_PAGE');
      ids.push(...page);
      if (ids.length > 4096) throw new Error('IMMUTABLE_STORAGE_LIMIT');
    }
    const bytes = jsonBytes(ids);
    if (ids.length !== root.records || ids.some((id, i) => i && id <= ids[i - 1])
        || bytes.length !== expected.bytes || await bytesHash(bytes) !== expected.sha256) throw new Error('IMMUTABLE_MEMBERSHIP_MISMATCH');
    idle.assertCurrent(); return ids;
  }
  async function prepareImmutableMembership() {
    // A disabled rollout causes ZERO discovery/capture/download HTTP requests.
    if (window.__ADMIN_CATALOG_EXPORT_POLICY__?.clientDownload !== true) return;
    const context = window.AdminAccessContext, repo = repository(context), captured = generation;
    if (!repo || !context?.ok || context.offline || !scheduler?.supported || accessContext(context) !== 'products') return;
    if (immutablePending?.generation === captured) return immutablePending.promise;
    const guard = () => generation === captured && repo.isCurrent() && window.AdminAccessContext === context;
    const task = (async () => {
      for (let turn = 0; turn < maxTurns && guard(); turn++) {
        const result = await scheduler.enqueue('catalog:immutable:membership:' + captured, async idle => {
          const previous = await repo.get(immutableKey, { allowStale: true });
          idle.assertCurrent();
          if (previous?.state === 'verified' && previous.manifest.expiresAt > Date.now()) return { done: true };
          let checkpoint = previous || { state: 'discover' };
          if ((checkpoint.manifest?.expiresAt ?? checkpoint.expiresAt) <= Date.now()) checkpoint = { state: 'discover' };
          if (checkpoint.snapshotId && !/^[a-f0-9]{32}$/.test(checkpoint.snapshotId)) throw new Error('INVALID_SNAPSHOT_ID');
          const control = JSON.parse(localStorage.getItem('admin:local-access:v1') || 'null');
          if (!/^[a-f0-9]{32}$/.test(control?.epoch || '')) throw new Error('IMMUTABLE_CONTEXT_UNAVAILABLE');
          const headers = { 'x-rbac-context': 'products', 'x-offline-epoch': control.epoch,
            'x-access-view-id': context.local_context.accessViewId };
          const request = (path, options = {}) => idle.requestJSON(immutableBase + path, { headers,
            ...options, recordCount: value => value.recordCount ?? 1 });
          const entries = []; let records = 1;
          if (checkpoint.state === 'discover') {
            const response = await request('/latest');
            checkpoint = response.snapshot ? { snapshotId: response.snapshot.snapshotId, expiresAt: response.snapshot.expiresAt,
              state: response.snapshot.state === 'sealed' ? 'manifest' : 'publish' } : { state: 'gc' };
          } else if (checkpoint.state === 'gc') {
            const value = await request('/gc', { method: 'POST', body: '{}' });
            checkpoint = { state: value.deleted ? 'gc' : 'capture' };
          } else if (checkpoint.state === 'capture') {
            const value = await request('', { method: 'POST', body: JSON.stringify({ projection: 'catalog-membership-v1' }) });
            if (!['captured', 'building', 'sealed'].includes(value.state)) throw new Error('IMMUTABLE_CAPTURE_BLOCKED');
            checkpoint = { snapshotId: value.snapshotId, expiresAt: value.expiresAt, state: value.state === 'sealed' ? 'manifest' : 'publish' };
          } else if (checkpoint.state === 'publish') {
            const value = await request('/' + checkpoint.snapshotId + '/publish', { method: 'POST', body: '{}' });
            if (!['building', 'sealed'].includes(value.state)) throw new Error('INVALID_IMMUTABLE_BUILD');
            checkpoint = { ...checkpoint, state: value.state === 'sealed' ? 'manifest' : 'publish' };
          } else if (checkpoint.state === 'manifest') {
            const value = await request('/' + checkpoint.snapshotId + '/manifest'), root = value.manifest;
            if (!root || root.formatVersion !== 1 || root.snapshotId !== checkpoint.snapshotId || root.projection !== 'catalog-membership-v1'
                || root.tenantId !== context.local_context.tenantId || root.storeId !== Number(localStorage.getItem('activeStoreId'))
                || root.sealed !== true || root.snapshotConsistent !== true || root.passportComplete !== false
                || !/^[a-f0-9]{64}$/.test(root.scopeHash) || !Number.isSafeInteger(root.expiresAt) || root.expiresAt <= Date.now()
                || !Number.isSafeInteger(root.records) || root.records < 0 || root.records > 4096
                || JSON.stringify(root.requiredParts) !== '["membership"]' || root.parts?.length !== 1
                || root.parts[0].part !== 'membership' || root.parts[0].codec !== 'json-array-pages-v1'
                || root.parts[0].chunks !== Math.max(1, Math.ceil(root.records / 25))
                || !Number.isSafeInteger(root.parts[0].bytes) || root.parts[0].bytes < 1 || root.parts[0].bytes > 2 * 1024 * 1024
                || !Array.isArray(root.descriptorPages) || root.descriptorPages.length !== Math.ceil(root.parts[0].chunks / 25)
                || root.descriptorPages.some((v, i) => v.page !== i || !Number.isSafeInteger(v.bytes) || v.bytes < 1 || v.bytes > 24576
                  || !/^[a-f0-9]{64}$/.test(v.sha256))
                || await bytesHash(jsonBytes(root)) !== value.manifestHash) throw new Error('INVALID_SEALED_MEMBERSHIP');
            checkpoint = { ...checkpoint, manifest: root, manifestHash: value.manifestHash, state: 'descriptors', next: 0 };
          } else if (['descriptors', 'output'].includes(checkpoint.state)) {
            const root = checkpoint.manifest, page = checkpoint.next;
            const descriptors = checkpoint.state === 'descriptors';
            if (!Number.isSafeInteger(page) || page < 0 || page >= (descriptors ? root.descriptorPages.length : root.parts[0].chunks)) {
              throw new Error('INVALID_IMMUTABLE_CURSOR');
            }
            let expected;
            if (descriptors) expected = root.descriptorPages[page];
            else {
              const stored = await repo.get('immutable:' + root.snapshotId + ':descriptor:' + Math.floor(page / 25), { allowStale: true });
              if (!stored) throw new Error('IMMUTABLE_DESCRIPTOR_MISSING');
              const bytes = decodeChunk(stored.payload);
              if (await bytesHash(bytes) !== root.descriptorPages[Math.floor(page / 25)].sha256) throw new Error('IMMUTABLE_DESCRIPTOR_HASH');
              expected = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))[page % 25];
            }
            const kind = descriptors ? 'descriptor' : 'output', partName = descriptors ? 'manifest' : 'membership';
            const value = await request('/' + root.snapshotId + '/chunks/' + kind + '/' + partName + '/' + page);
            const bytes = decodeChunk(value.payload);
            if (value.snapshotId !== root.snapshotId || value.kind !== kind || value.part !== partName || value.chunk !== page
                || bytes.length !== expected.bytes || value.bytes !== expected.bytes || value.sha256 !== expected.sha256
                || await bytesHash(bytes) !== expected.sha256) throw new Error('IMMUTABLE_HASH_MISMATCH');
            if (descriptors) {
              const list = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
              if (!Array.isArray(list) || list.length !== Math.min(25, root.parts[0].chunks - page * 25)
                  || list.some((v, i) => v.part !== 'membership' || v.chunk !== page * 25 + i
                    || !Number.isSafeInteger(v.bytes) || v.bytes < 1 || v.bytes > 24576
                    || !Number.isSafeInteger(v.recordCount) || v.recordCount < 0 || v.recordCount > 25
                    || !/^[a-f0-9]{64}$/.test(v.sha256))) throw new Error('INVALID_IMMUTABLE_DESCRIPTORS');
            } else if (value.recordCount !== expected.recordCount) throw new Error('IMMUTABLE_RECORD_COUNT');
            entries.push(['immutable:' + root.snapshotId + ':' + kind + ':' + page, value]);
            records = value.recordCount;
            const count = descriptors ? root.descriptorPages.length : root.parts[0].chunks;
            checkpoint = { ...checkpoint, next: page + 1 };
            if (checkpoint.next === count) checkpoint = { ...checkpoint, next: 0, state: descriptors ? 'output' : 'verify' };
          } else if (checkpoint.state === 'verify') {
            // Verify every durable chunk again, not just the last HTTP response.
            await frozenMembership(repo, checkpoint, idle);
            const validation = await request('/' + checkpoint.snapshotId + '/validate', { method: 'POST', body: '{}' });
            if (validation.snapshotId !== checkpoint.snapshotId || validation.sealed !== true) throw new Error('IMMUTABLE_VALIDATION_FAILED');
            checkpoint = { ...checkpoint, state: 'verified', verifiedAt: Date.now(), validation,
              // No deletion side effects or working-passport activation in this slice.
              passportComplete: false, deletionsApplied: false };
          } else throw new Error('INVALID_IMMUTABLE_CHECKPOINT');
          if (checkpoint.snapshotId && !/^[a-f0-9]{32}$/.test(checkpoint.snapshotId)) throw new Error('INVALID_SNAPSHOT_ID');
          idle.assertCurrent();
          await commitPreparation(idle, repo, [...entries, [immutableKey, checkpoint]], records, guard);
          return { done: checkpoint.state === 'verified' };
        }, { priority: 18, guard });
        if (!result.ok && result.reason === 'http-410' && guard()) {
          const reset = await scheduler.enqueue('catalog:immutable:reset:' + captured, async idle => {
            await commitPreparation(idle, repo, [[immutableKey, { state: 'discover' }]], 0, guard);
          }, { priority: 18, guard });
          if (reset.ok) continue;
        }
        if (!result.ok || result.value.done) return;
      }
    })();
    const operation = { generation: captured, promise: task }; immutablePending = operation;
    try { await task; } finally { if (immutablePending === operation) immutablePending = null; }
  }
  const lightKey = 'meta:light:passport';
  const fullFields = ['product', 'units', 'unitConversions', 'productUnitLinks', 'stock', 'availability', 'ingredients',
    'nestedIngredients', 'variants', 'options', 'optionAssignments', 'defaultConfig', 'comboRefs', 'editor',
    'benefits', 'texts', 'visibility', 'nutrition', 'revision'];
  function lightEnabled(context) {
    return window.__ADMIN_CATALOG_EXPORT_POLICY__?.light?.clientDownload === true
      && accessContext(context) === 'products' && (context?.permissions || []).some(grant => grant === '*'
        || (grant?.key === 'products.cost.read' && ['all', 'stores'].includes(grant.access_rule)));
  }
  async function lightDto(repo, checkpoint, idle) {
    const root = checkpoint.manifest, bytes = new Uint8Array(root.bytes);
    let offset = 0;
    for (const descriptor of root.chunks) {
      idle.assertCurrent();
      const chunk = await repo.get('light:' + root.snapshotId + ':' + descriptor.chunk, { allowStale: true });
      if (!chunk || chunk.snapshotId !== root.snapshotId || chunk.chunk !== descriptor.chunk) throw new Error('LIGHT_CHUNK_MISSING');
      const piece = decodeChunk(chunk.payload);
      if (piece.length !== descriptor.bytes || offset + piece.length > bytes.length
          || await bytesHash(piece) !== descriptor.sha256) throw new Error('LIGHT_CHUNK_HASH');
      bytes.set(piece, offset); offset += piece.length;
    }
    if (offset !== bytes.length || await bytesHash(bytes) !== root.sha256) throw new Error('LIGHT_DTO_HASH');
    const dto = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (Object.keys(dto).length !== fullFields.length || fullFields.some(key => !Object.prototype.hasOwnProperty.call(dto, key))
        || dto.product?.id !== root.productId || Number(dto.product?.tenant_id) !== root.tenantId || dto.editor?.schema_version !== 'product-editor-v1'
        || dto.revision?.data_version !== 'full-product-passport-v1') throw new Error('LIGHT_DTO_INCOMPLETE');
    idle.assertCurrent(); return dto;
  }
  async function stageLightChunks(value, root, after, entries, idle) {
    if (!Array.isArray(value.chunks) || value.chunks.length > root.chunks.length - after
        || value.nextChunk !== after + value.chunks.length) throw new Error('LIGHT_CHUNK_BATCH');
    for (const row of value.chunks) {
      idle.assertCurrent();
      const index = after++, expected = root.chunks[index], bytes = decodeChunk(row.payload);
      if (row.snapshotId !== root.snapshotId || row.chunk !== index || row.sha256 !== expected.sha256
          || row.bytes !== expected.bytes || bytes.length !== expected.bytes || await bytesHash(bytes) !== expected.sha256) throw new Error('LIGHT_CHUNK_INVALID');
      entries.push(['light:' + root.snapshotId + ':' + index, row]);
    }
    idle.assertCurrent(); return after;
  }
  async function prepareLightPassports() {
    const context = window.AdminAccessContext, repo = repository(context), captured = generation;
    if (!lightEnabled(context) || !repo || !context?.ok || context.offline || !scheduler?.supported) return;
    if (lightPending?.generation === captured) return lightPending.promise;
    const guard = () => generation === captured && repo.isCurrent() && window.AdminAccessContext === context;
    const task = (async () => {
      for (let turn = 0; turn < maxTurns && guard(); turn++) {
        const result = await scheduler.enqueue('catalog:light:passport:' + captured, async idle => {
          const previous = await repo.get(lightKey, { allowStale: true });
          let checkpoint = previous || { phase: 'targets', after: 0, ids: [], index: 0, attempts: 0 };
          if (!previous) {
            await commitPreparation(idle, repo, [[lightKey, checkpoint]], 0, guard);
            return { done: false };
          }
          if (checkpoint.phase === 'blocked' || checkpoint.retryAt > Date.now() || checkpoint.phase === 'scan-finished') return { done: true };
          if (!['targets', 'baseline'].includes(checkpoint.phase)
              && !Number.isSafeInteger(checkpoint.baseline?.workingSequence)) {
            // An older checkpoint has no durable working-write fence. Preserve
            // old chunks/passports but obtain a new baseline before more HTTP.
            checkpoint = { ...checkpoint, phase: 'baseline', baseline: null, snapshotId: null, manifest: null };
            await commitPreparation(idle, repo, [[lightKey, checkpoint]], 0, guard);
            return { done: false };
          }
          const control = JSON.parse(localStorage.getItem('admin:local-access:v1') || 'null');
          if (!/^[a-f0-9]{32}$/.test(control?.epoch || '')) throw new Error('LIGHT_CONTEXT_UNAVAILABLE');
          const request = (path, body) => idle.requestJSON(immutableBase + '/light' + path, {
            method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            headers: { 'Content-Type': 'application/json', 'x-rbac-context': 'products', 'x-offline-epoch': control.epoch,
              'x-access-view-id': context.local_context.accessViewId }, recordCount: value => value.recordCount ?? 1 });
          const entries = []; let records = 1;
          const id = checkpoint.ids?.[checkpoint.index];
          if (checkpoint.phase === 'targets') {
            const page = await request('/targets', { after: checkpoint.after });
            if (!Array.isArray(page.ids) || page.ids.length > 25 || page.ids.some((id, i) => !Number.isSafeInteger(id)
                || id <= (i ? page.ids[i - 1] : checkpoint.after)) || page.after !== (page.ids.at(-1) ?? checkpoint.after)) throw new Error('LIGHT_TARGET_PAGE');
            checkpoint = { phase: page.ids.length ? 'baseline' : 'scan-finished', after: page.after, ids: page.ids,
              index: 0, hasMore: page.hasMore === true, catalogComplete: false, attempts: 0 };
            records = page.ids.length;
          } else if (checkpoint.phase === 'baseline') {
            checkpoint = { ...checkpoint, baseline: await window.CatalogRepository.beginImmutablePassport(id, idle), phase: 'start' };
          } else if (['start', 'advance'].includes(checkpoint.phase)) {
            const value = checkpoint.phase === 'start' ? await request('/start', { productId: id, firstStage: true })
              : await request('/' + checkpoint.snapshotId + '/advance', { step: checkpoint.step });
            if (!/^[a-f0-9]{32}$/.test(value.snapshotId || '') || value.productId !== id || !Number.isSafeInteger(value.step)
                || value.step < 0 || value.step > 5 || !['building', 'sealed'].includes(value.state)) throw new Error('LIGHT_PROGRESS');
            checkpoint = { ...checkpoint, snapshotId: value.snapshotId, step: value.step, phase: 'advance' };
            if (value.state === 'sealed') {
              const root = value.manifest;
              if (!root || root.formatVersion !== 1 || root.builderVersion !== 'legacy-shared-v1'
                  || root.codec !== 'legacy-dto-json-v1' || root.productId !== id
                  || root.snapshotId !== value.snapshotId || root.projection !== 'full-product-passport-v1'
                  || root.tenantId !== context.local_context.tenantId || root.storeId !== Number(localStorage.getItem('activeStoreId'))
                  || root.sealed !== true || root.snapshotConsistent !== true || root.passportComplete !== true
                  || !/^[a-f0-9]{64}$/.test(root.scopeHash || '') || !(root.epochs?.coverage >= 1)
                  || !Number.isSafeInteger(root.expiresAt) || root.expiresAt <= Date.now()
                  || !Number.isSafeInteger(root.bytes) || root.bytes < 1 || root.bytes > 256 * 1024
                  || JSON.stringify(root.requiredFields) !== JSON.stringify(fullFields) || !Array.isArray(root.chunks)
                  || root.chunks.length !== Math.ceil(root.bytes / 24576)
                  || root.chunks.some((chunk, i) => chunk.part !== 'passport' || chunk.chunk !== i || chunk.recordCount !== 1
                    || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > 24576 || !/^[a-f0-9]{64}$/.test(chunk.sha256 || ''))
                  || root.chunks.reduce((n, chunk) => n + chunk.bytes, 0) !== root.bytes
                  || await bytesHash(jsonBytes(root)) !== value.manifestHash) throw new Error('LIGHT_MANIFEST_INVALID');
              checkpoint = { ...checkpoint, phase: 'chunks', next: 0, manifest: root, manifestHash: value.manifestHash };
              if (value.chunks) {
                const next = await stageLightChunks(value, root, 0, entries, idle);
                checkpoint = { ...checkpoint, next, phase: next === root.chunks.length ? 'verify' : 'chunks' };
              }
            }
          } else if (checkpoint.phase === 'chunks') {
            const root = checkpoint.manifest, expected = root.chunks[checkpoint.next];
            if (!expected) throw new Error('LIGHT_CURSOR_INVALID');
            const value = await request('/' + root.snapshotId + '/chunks', { after: checkpoint.next });
            const next = await stageLightChunks(value, root, checkpoint.next, entries, idle);
            if (next === checkpoint.next) throw new Error('LIGHT_CHUNK_CURSOR_STALLED');
            checkpoint = { ...checkpoint, next, phase: next === root.chunks.length ? 'verify' : 'chunks' };
          } else if (checkpoint.phase === 'verify') {
            await lightDto(repo, checkpoint, idle);
            checkpoint = { ...checkpoint, phase: 'activate' };
          } else if (checkpoint.phase === 'activate') {
            if (window.__ADMIN_CATALOG_EXPORT_POLICY__.light.activation !== true) return { done: true };
            const dto = await lightDto(repo, checkpoint, idle);
            if (!await window.CatalogRepository.activateImmutablePassport(dto, checkpoint.manifest, null, checkpoint.baseline, idle, true)) {
              // Validation and CAS belong to THIS idle turn. Never reuse a
              // pre-cancellation freshness response after another 60 s idle.
              const validation = await request('/' + checkpoint.snapshotId + '/validate', {});
              if (validation.snapshotId !== checkpoint.snapshotId || validation.manifestHash !== checkpoint.manifestHash
                  || validation.sealed !== true || validation.fresh !== true) throw new Error('LIGHT_VALIDATION_FAILED');
              await window.CatalogRepository.activateImmutablePassport(dto, checkpoint.manifest, validation, checkpoint.baseline, idle);
            }
            const next = checkpoint.index + 1;
            checkpoint = { phase: next < checkpoint.ids.length ? 'baseline' : checkpoint.hasMore ? 'targets' : 'scan-finished',
              after: checkpoint.after, ids: checkpoint.ids, index: next, hasMore: checkpoint.hasMore, attempts: 0, catalogComplete: false };
          } else throw new Error('LIGHT_CHECKPOINT_INVALID');
          idle.assertCurrent();
          await commitPreparation(idle, repo, [...entries, [lightKey, checkpoint]], records, guard);
          return { done: checkpoint.phase === 'scan-finished' };
        }, { priority: 18, guard });
        if (!result.ok && ['http-404', 'http-409', 'http-410', 'CatalogWorkingConflict'].includes(result.reason) && guard()) {
          await scheduler.enqueue('catalog:light:defer:' + captured, async idle => {
            const value = await repo.get(lightKey, { allowStale: true });
            if (!value) return;
            const attempts = (value.attempts || 0) + 1;
            await commitPreparation(idle, repo, [[lightKey, { ...value, phase: attempts > 2 ? 'blocked' : value.ids?.length ? 'baseline' : 'targets',
              attempts, retryAt: Date.now() + 60000 * 2 ** Math.min(attempts, 2), passportComplete: false }]], 0, guard);
          }, { priority: 18, guard });
        }
        if (!result.ok || result.value.done) return;
      }
    })();
    const operation = { generation: captured, promise: task }; lightPending = operation;
    try { await task; } finally { if (lightPending === operation) lightPending = null; }
  }
  function changed() {
    generation += 1;
    if (lightEnabled(window.AdminAccessContext)) {
      void prepareLightPassports().catch(error => console.warn('CATALOG_LIGHT_PREPARATION_FAILED:', error.name));
      return; // No parallel legacy source/membership prefetch for this rollout.
    }
    void prepare().catch(error => console.warn('CATALOG_PART_PREPARATION_FAILED:', error.name));
    void prepareSources().catch(error => console.warn('CATALOG_SOURCE_PREPARATION_FAILED:', error.message));
    void retryCoreIssues().catch(error => console.warn('CATALOG_PART_RETRY_FAILED:', error.message));
    void prepareImmutableMembership().catch(error => console.warn('CATALOG_IMMUTABLE_PREPARATION_FAILED:', error.name));
  }
  async function readSourcePart(name, rowId) {
    const repo = repository();
    if (!repo || !sourceParts.includes(name) || !Number.isSafeInteger(rowId) || rowId <= 0) return null;
    const value = await repo.get('source:' + name + ':' + rowId, { allowStale: true });
    if (value?.projection !== 'live-source' || value.part !== name || value.rowId !== rowId
        || value.tenantId !== window.AdminAccessContext.local_context.tenantId
        || value.storeId !== Number(localStorage.getItem('activeStoreId')) || value.state !== 'staging'
        || value.snapshotId !== null || value.snapshotConsistent !== false || value.passportComplete !== false
        || !value.data || await sourceVersion(name, value.data, value.tenantId, value.storeId) !== value.sourceVersion
        || !repo.isCurrent()) return null;
    return value;
  }
  async function readPreparationState(name = part) {
    const repo = repository();
    if (!repo || (name !== part && !sourceParts.includes(name))) return null;
    const queue = await issues(repo, name === part ? name : 'source:' + name);
    const checkpoint = await repo.get(name === part ? checkpointKey : 'meta:source:' + name, { allowStale: true });
    if (!repo.isCurrent()) return null;
    return { part: name, checkpoint, pendingIssues: queue.length, retryQueue: queue,
      snapshotConsistent: false, passportComplete: false, activationBlocked: 'IMMUTABLE_SOURCE_REQUIRED' };
  }
  // Internal diagnostics only. Neither reader is connected to working UI data.
  window.AdminCatalogParts = Object.freeze({ readStagedPart, readSourcePart, readPreparationState });
  window.addEventListener('admin:local-context-changed', changed);
  window.addEventListener('admin:access-context', changed);
  document.addEventListener('tenantStoreChanged', changed);
  window.addEventListener('storage', event => { if (event.key === 'activeStoreId') changed(); });
  window.addEventListener('online', changed);
  changed();
})(window);
