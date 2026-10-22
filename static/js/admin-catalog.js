(function (window) {
  "use strict";

  const DOMAIN = "admin-catalog";
  const VERSION = 4;
  const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const PRELOAD_BATCH_SIZE = 25;
  const PRELOAD_QUIET_WINDOW_MS = 180;
  const PRELOAD_IDLE_TIMEOUT_MS = 500;
  const RECONCILE_FRESHNESS_MS = 25000;
  const SSE_RECONNECT_BASE_MS = 1500;
  const SSE_RECONNECT_MAX_MS = 30000;
  const COMPLETENESS_RANK = Object.freeze({ summary: 1, "order-ready": 2, "editor-ready": 3 });
  const productsById = new Map();
  const productIdsByCategoryId = new Map();
  const categoriesById = new Map();
  const passportsByProductId = new Map();
  const combosById = new Map();
  const comboBlocksById = new Map();
  const comboRelationsById = new Map();
  const comboIdsByProductId = new Map();
  const comboIdsByBlockId = new Map();
  const listeners = new Set();
  const pendingByProductId = new Map();
  const pendingPersistentReads = new Map();
  const dirtyProducts = new Set();
  const dirtyCategories = new Set();
  const dirtyPassports = new Set();
  const dirtyCombos = new Set();
  const dirtyComboBlocks = new Set();
  const dirtyComboRelations = new Set();
  const removedProductIds = new Set();
  const pendingByComboId = new Map();
  const mutationVersions = new Map();
  const mutationFieldVersions = new Map();
  const pendingMutationFields = new Map();
  const durableOrderReadyProductIds = new Set();
  const durableEditorReadyProductIds = new Set();
  let editorReferences = { units: {}, unitConversions: [], relatedProductUnitLinks: {} };
  let editorReferencesLoaded = false;
  let editorReferencesPersisted = false;
  let editorReferencesDirty = false;
  let manifest = emptyManifest();
  let coverageTotals = {};
  let coverageTargets = {};
  let coverageTargetMetadata = {};
  let scope = null;
  let scopeGeneration = 0;
  let initPromise = null;
  let persistTimer = null;
  let persistPromise = null;
  let metadataDirty = false;
  let configuredLoader = null;
  let configuredRequest = null;
  let configuredMetadataLoader = null;
  let configuredWorkingSet = null;
  let workingCursor = '0';
  let workingReconciledAt = 0;
  let workingWriteSequence = 0;
  let offlineWritesAllowed = true;
  let offlineGeneration = 0;
  let configuredRbacContext = 'products';
  let configuredGuard = null;
  let syncSource = null;
  let syncSubscription = null;
  let syncReconnectTimer = null;
  let syncState = "idle";
  let reconcilePromise = null;
  let reconcileTargetRevision = "0";
  let reconcileAgain = false;
  let syncTimer = null;
  let syncTimerForce = false;
  let syncReconnectAttempts = 0;
  let syncLifecycleBound = false;
  let downloadJob = null;
  let downloadJobPromise = null;
  let downloadJobGeneration = 0;
  let downloadScheduleGeneration = 0;
  let downloadScheduleTimer = null;
  let downloadIdleCallback = null;
  let downloadTurnDeferred = null;
  let foregroundSequence = 0;
  let foregroundQuietUntil = 0;
  let downloadPageActive = true;
  const foregroundTokens = new Set();
  const foregroundIdleOperations = new Map();

  function emptyManifest() {
    return {
      migrationVersion: 0,
      productIds: [],
      categoryIds: [],
      passportIds: [],
      editorPassportIds: [],
      comboIds: [],
      comboBlockIds: [],
      comboRelationIds: [],
      coverageTotals: {},
      coverageTargets: {},
      coverageTargetMetadata: {},
      serverRevision: "0",
      durableRevision: "0",
      lastReconciledAt: 0,
      updatedAt: 0,
    };
  }

  function normalizeId(value) {
    const id = Number(value || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))];
  }

  function completeness(value) {
    return value === "editor-ready" ? "editor-ready" : (value === "order-ready" ? "order-ready" : "summary");
  }

  function stableValue(value) {
    if (value == null) return value;
    if (typeof value === "string" && /^(?:data:image|blob:)/i.test(value.trim())) return undefined;
    if (typeof value === "function" || typeof value === "symbol") return undefined;
    if (typeof window.Blob === "function" && value instanceof window.Blob) return undefined;
    if (typeof window.File === "function" && value instanceof window.File) return undefined;
    if (typeof window.Node === "function" && value instanceof window.Node) return undefined;
    if (typeof window.AbortController === "function" && value instanceof window.AbortController) return undefined;
    if (typeof value?.then === "function") return undefined;
    if (Array.isArray(value)) return value.map(stableValue).filter((item) => item !== undefined);
    if (typeof value !== "object") return value;
    const out = {};
    Object.keys(value).forEach((key) => {
      const next = stableValue(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }

  function passportIndexRecord(id, passport) {
    const productId = normalizeId(id);
    const orderReady = isOrderReadyPassport(passport);
    const editorReady = orderReady && isEditorReadyPassport(passport)
      && (!passport?.editor?.references_normalized || editorReferencesPersisted || editorReferencesDirty);
    return {
      productId,
      orderReady,
      editorReady,
      dataVersion: passport?.revision?.data_version || null,
      editorSchemaVersion: passport?.editor?.schema_version || null,
      revision: passport?.revision?.revision || passport?.revision?.updated_at || null,
    };
  }

  function isValidPassportIndex(row, id) {
    return Boolean(
      row && typeof row === "object"
      && normalizeId(row.productId) === normalizeId(id)
      && row.orderReady === true
      && row.dataVersion === "full-product-passport-v1"
    );
  }

  function firstDefined(source, keys) {
    for (const key of keys) if (source[key] !== undefined) return source[key];
    return undefined;
  }

  function normalizeProduct(raw, options = {}) {
    if (!raw || typeof raw !== "object") return null;
    const id = normalizeId(raw.id ?? raw.product_id);
    if (!id) return null;
    const normalized = stableValue(raw) || {};
    ["photos_json", "photo", "image_url", "photo_url"].forEach((key) => {
      if (typeof normalized[key] === "string" && /(?:data:image|blob:)/i.test(normalized[key])) delete normalized[key];
    });
    const categoryIds = uniqueIds([
      ...(Array.isArray(raw.categoryIds) ? raw.categoryIds : []),
      ...(Array.isArray(raw.category_ids) ? raw.category_ids : []),
      ...(Array.isArray(options.categoryIds) ? options.categoryIds : []),
      raw.category_id, options.categoryId,
    ]);
    const photos = Array.isArray(raw.photos) ? stableValue(raw.photos) : undefined;
    const photo = firstDefined(raw, ["photo", "image_url", "photo_url"])
      ?? (Array.isArray(photos) && photos.length ? photos[0] : undefined);
    const level = completeness(options.completeness || raw.completeness);
    Object.assign(normalized, {
      id,
      categoryId: categoryIds[0] || normalizeId(raw.categoryId) || null,
      categoryIds,
      name: firstDefined(raw, ["name", "product_name"]),
      photo,
      price: firstDefined(raw, ["price", "product_price"]),
      active: firstDefined(raw, ["active", "is_active"]),
      visible: firstDefined(raw, ["visible", "site_visibility"]),
      fulfillmentMode: firstDefined(raw, ["fulfillmentMode", "fulfillment_mode"]),
      unitId: firstDefined(raw, ["unitId", "unit_id"]),
      baseUnitId: firstDefined(raw, ["baseUnitId", "base_unit_id"]),
      baseQty: firstDefined(raw, ["baseQty", "base_qty"]),
      stockQty: firstDefined(raw, ["stockQty", "stock_qty", "stock"]),
      sourceUpdatedAt: firstDefined(raw, ["sourceUpdatedAt", "updated_at"]) ?? null,
      revision: firstDefined(raw, ["revision", "version"]) ?? null,
      cachedAt: Date.now(),
      completeness: level,
      orderReady: level === "order-ready" || level === "editor-ready",
      editorReady: level === "editor-ready",
    });
    Object.keys(normalized).forEach((key) => {
      if (normalized[key] === undefined) delete normalized[key];
    });
    Object.defineProperty(normalized, "categoryMembershipReplaces", {
      value: Array.isArray(raw.category_ids)
        || Array.isArray(raw.categoryIds)
        || raw.category_id !== undefined
        || raw.categoryId !== undefined
        || Array.isArray(options.categoryIds),
      enumerable: false,
    });
    return normalized;
  }

  function updateProductCategoryIndex(productId, previousCategoryIds, nextCategoryIds) {
    const id = normalizeId(productId);
    if (!id) return;
    const previous = new Set(uniqueIds(previousCategoryIds));
    const next = new Set(uniqueIds(nextCategoryIds));
    previous.forEach((categoryId) => {
      if (next.has(categoryId)) return;
      const productIds = productIdsByCategoryId.get(categoryId);
      if (!productIds) return;
      productIds.delete(id);
      if (!productIds.size) productIdsByCategoryId.delete(categoryId);
    });
    next.forEach((categoryId) => {
      if (!productIdsByCategoryId.has(categoryId)) productIdsByCategoryId.set(categoryId, new Set());
      productIdsByCategoryId.get(categoryId).add(id);
    });
  }

  function normalizeCategory(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = normalizeId(raw.id ?? raw.category_id);
    if (!id) return null;
    const normalized = stableValue(raw) || {};
    normalized.id = id;
    normalized.parentId = normalizeId(raw.parentId ?? raw.parent_id);
    normalized.name = firstDefined(raw, ["name", "title"]);
    normalized.sortOrder = firstDefined(raw, ["sortOrder", "sort_order", "sort"]);
    normalized.active = firstDefined(raw, ["active", "is_active"]);
    normalized.cachedAt = Date.now();
    Object.keys(normalized).forEach((key) => {
      if (normalized[key] === undefined) delete normalized[key];
    });
    return normalized;
  }

  function normalizeCombo(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = normalizeId(raw.id ?? raw.combo_id);
    if (!id) return null;
    return { ...stableValue(raw), id, cachedAt: Date.now() };
  }

  function normalizeComboBlock(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = normalizeId(raw.id ?? raw.block_id);
    if (!id) return null;
    const products = (Array.isArray(raw.products) ? raw.products : []).map((row, index) => ({
      relationId: normalizeId(row.id),
      productId: normalizeId(row.product_id ?? row.id),
      sortOrder: Number(row.sort_order ?? index) || 0,
      isDefault: Number(row.is_default || 0) === 1,
    })).filter((row) => row.productId);
    return {
      id,
      title: raw.title ?? raw.block_title ?? "",
      sortOrder: Number(raw.sort_order || 0),
      minSelect: Math.max(0, Number(raw.min_select ?? 1) || 0),
      maxSelect: Math.max(1, Number(raw.max_select ?? 1) || 1),
      products,
      createdAt: raw.created_at ?? null,
      updatedAt: raw.updated_at ?? null,
      cachedAt: Date.now(),
    };
  }

  function rebuildComboIndexes() {
    comboIdsByProductId.clear();
    comboIdsByBlockId.clear();
    comboRelationsById.forEach((relations, comboId) => {
      relations.forEach((relation) => {
        if (!comboIdsByBlockId.has(relation.blockId)) comboIdsByBlockId.set(relation.blockId, new Set());
        comboIdsByBlockId.get(relation.blockId).add(comboId);
        const block = comboBlocksById.get(relation.blockId);
        (block?.products || []).forEach((product) => {
          if (!comboIdsByProductId.has(product.productId)) comboIdsByProductId.set(product.productId, new Set());
          comboIdsByProductId.get(product.productId).add(comboId);
        });
      });
    });
  }

  function upsertComboBundle(raw, options = {}) {
    assertScope();
    noteWorkingChange();
    const combo = normalizeCombo(raw?.combo || raw);
    if (!combo) return null;
    const blocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
    blocks.forEach((rawBlock) => {
      const block = normalizeComboBlock(rawBlock);
      if (!block) return;
      comboBlocksById.set(block.id, block);
      dirtyComboBlocks.add(block.id);
    });
    const relationsSource = Array.isArray(raw?.relations) ? raw.relations : blocks;
    const relations = relationsSource.map((row, index) => ({
      id: normalizeId(row.id),
      comboId: combo.id,
      blockId: normalizeId(row.block_id ?? row.id),
      sortOrder: Number(row.sort_order ?? index) || 0,
    })).filter((row) => row.blockId);
    combosById.set(combo.id, { ...(combosById.get(combo.id) || {}), ...combo });
    comboRelationsById.set(combo.id, relations);
    dirtyCombos.add(combo.id);
    dirtyComboRelations.add(combo.id);
    rebuildComboIndexes();
    schedulePersist();
    if (options.notify !== false) notify("combos", [combo.id]);
    return combo;
  }

  function upsertComboBlock(raw, options = {}) {
    assertScope();
    noteWorkingChange();
    const block = normalizeComboBlock(raw);
    if (!block) return null;
    comboBlocksById.set(block.id, block);
    dirtyComboBlocks.add(block.id);
    rebuildComboIndexes();
    schedulePersist();
    if (options.notify !== false) notify("combo-blocks", [block.id]);
    return block;
  }

  function upsertComboBundles(rows, options = {}) {
    const result = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const combo = upsertComboBundle(row, { ...options, notify: false });
      if (combo) result.push(combo);
    });
    if (result.length && options.notify !== false) notify("combos", result.map((row) => row.id));
    return result;
  }

  function mergeRecord(existing, incoming, options = {}) {
    if (!existing) return incoming;
    const existingRank = COMPLETENESS_RANK[completeness(existing.completeness)] || 0;
    const incomingRank = COMPLETENESS_RANK[completeness(incoming.completeness)] || 0;
    const authoritative = new Set(Array.isArray(options.authoritativeFields) ? options.authoritativeFields : []);
    const merged = { ...existing };
    Object.keys(incoming).forEach((key) => {
      const value = incoming[key];
      if (value === undefined) return;
      if (value === null && existing[key] != null && incomingRank < existingRank && !authoritative.has(key)) return;
      if (incomingRank < existingRank && value && typeof value === "object"
        && existing[key] != null && !authoritative.has(key)) return;
      merged[key] = value;
    });
    const level = incomingRank >= existingRank ? completeness(incoming.completeness) : completeness(existing.completeness);
    merged.completeness = level;
    merged.orderReady = level === "order-ready" || level === "editor-ready";
    merged.editorReady = level === "editor-ready";
    merged.categoryIds = incoming.categoryMembershipReplaces
      ? uniqueIds(incoming.categoryIds)
      : uniqueIds([...(existing.categoryIds || []), ...(incoming.categoryIds || [])]);
    merged.categoryId = merged.categoryIds[0] || normalizeId(merged.categoryId);
    merged.cachedAt = Date.now();
    return merged;
  }

  function currentScope() {
    const repository = window.AdminLocalRepository;
    if (!repository?.isActive()) return null;
    const storeId = String(window.localStorage.getItem('activeStoreId') || '');
    if (!(Number(storeId) > 0)) return null;
    return Object.freeze({ ...repository.create({ domain: DOMAIN, version: VERSION,
      dimensions: { organizationalUnit: { type: 'store', id: storeId } },
      guard: () => String(window.localStorage.getItem('activeStoreId') || '') === storeId }), storeId });
  }

  function scopeIsCurrent(candidate, generation) {
    return Boolean(candidate && candidate === scope && candidate.isCurrent() && generation === scopeGeneration
      && (!configuredGuard || configuredGuard()));
  }

  function assertScope(targetScope = scope, generation = scopeGeneration) {
    if (!scopeIsCurrent(targetScope, generation)) throw new Error('LOCAL_SCOPE_CHANGED');
  }

  function writeFenceKey(targetScope = scope) { return 'admin:catalog-write:v1:' + targetScope.namespace; }
  function noteWorkingChange() {
    if (!scope) return;
    try { window.localStorage.setItem(writeFenceKey(), window.crypto.randomUUID()); }
    catch (error) { offlineWritesAllowed = false; console.error('CATALOG_WRITE_FENCE_UNAVAILABLE:', error.message); }
    workingWriteSequence += 1;
  }
  function catalogWrite(targetScope, work, requireLock = false) {
    const locks = window.navigator?.locks;
    if (!locks?.request) {
      if (requireLock) throw new Error('CATALOG_OFFLINE_COORDINATION_UNAVAILABLE');
      return work();
    }
    let entered = false;
    const failed = error => {
      if (entered) throw error;
      offlineWritesAllowed = false;
      if (requireLock) throw error;
      return work(); // A lock API failure disables extras, not working persistence.
    };
    try {
      return Promise.resolve(locks.request('admin:catalog-write:' + targetScope.namespace, () => {
        entered = true; return work();
      })).catch(failed);
    } catch (error) { return failed(error); }
  }
  function workingSet() {
    const value = typeof configuredWorkingSet === 'function' ? configuredWorkingSet() : {};
    const comboIds = uniqueIds(value?.comboIds);
    const blockIds = uniqueIds([...(value?.blockIds || []), ...comboIds.flatMap(id =>
      (comboRelationsById.get(id) || []).map(row => row.blockId))]);
    return { productIds: uniqueIds([...(value?.productIds || []), ...comboIds.flatMap(comboComponentIds),
      ...blockIds.flatMap(id => (comboBlocksById.get(id)?.products || []).map(row => row.productId))]), comboIds, blockIds };
  }

  function checkAccessResponse(status, payload) {
    // A resource/permission denial does not revoke the identity or unrelated domains.
    // Only authentication failures and explicit session-wide refusals invalidate the proof.
    const revoked = ['USER_BLOCKED', 'USER_ARCHIVED', 'TENANT_BLOCKED', 'ACTIVE_ROLE_INVALID', 'ROLE_NOT_ASSIGNED', 'ROLE_SELECTION_REQUIRED'];
    if (status === 401 || (status === 403 && revoked.includes(payload?.error))) {
      window.AdminLocalRepository.reset({ forget: true, reason: 'server-refusal' });
    }
  }

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    return { promise, resolve, reject };
  }

  function yieldMainThread() {
    return new Promise((resolve) => {
      const afterPaint = () => window.setTimeout(resolve, 0);
      if (!document.hidden && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(afterPaint);
      else afterPaint();
    });
  }

  function cancelDownloadSchedule(resolveValue = null) {
    downloadScheduleGeneration += 1;
    if (downloadScheduleTimer) window.clearTimeout(downloadScheduleTimer);
    if (downloadIdleCallback != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(downloadIdleCallback);
    downloadScheduleTimer = null;
    downloadIdleCallback = null;
    if (resolveValue !== null && downloadTurnDeferred) {
      const pending = downloadTurnDeferred;
      downloadTurnDeferred = null;
      pending.resolve(resolveValue);
    }
  }

  function scheduleDownloadTurn() {
    if (!downloadTurnDeferred || downloadScheduleTimer || downloadIdleCallback != null) return;
    if (foregroundTokens.size || reconcilePromise || !downloadPageActive) return;
    const generation = ++downloadScheduleGeneration;
    const run = () => {
      if (generation !== downloadScheduleGeneration) return;
      downloadScheduleTimer = null;
      downloadIdleCallback = null;
      if (!downloadTurnDeferred) return;
      if (foregroundTokens.size || reconcilePromise || !downloadPageActive || Date.now() < foregroundQuietUntil) {
        scheduleDownloadTurn();
        return;
      }
      const pending = downloadTurnDeferred;
      downloadTurnDeferred = null;
      pending.resolve(true);
    };
    const delay = Math.max(0, foregroundQuietUntil - Date.now());
    if (delay > 0) downloadScheduleTimer = window.setTimeout(run, delay);
    else if (typeof window.requestIdleCallback === "function") downloadIdleCallback = window.requestIdleCallback(run, { timeout: PRELOAD_IDLE_TIMEOUT_MS });
    else downloadScheduleTimer = window.setTimeout(run, PRELOAD_QUIET_WINDOW_MS);
  }

  function waitForDownloadTurn() {
    if (!downloadTurnDeferred) downloadTurnDeferred = deferred();
    scheduleDownloadTurn();
    return downloadTurnDeferred.promise;
  }

  function beginForegroundWork() {
    const token = ++foregroundSequence;
    foregroundTokens.add(token);
    const endIdleOperation = window.AdminIdleHydration?.beginOperation();
    if (endIdleOperation) foregroundIdleOperations.set(token, endIdleOperation);
    cancelDownloadSchedule();
    return token;
  }

  function endForegroundWork(token) {
    if (!foregroundTokens.delete(token)) return false;
    foregroundIdleOperations.get(token)?.();
    foregroundIdleOperations.delete(token);
    foregroundQuietUntil = Math.max(foregroundQuietUntil, Date.now() + PRELOAD_QUIET_WINDOW_MS);
    scheduleDownloadTurn();
    return true;
  }

  async function withForegroundWork(work) {
    const token = beginForegroundWork();
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      endForegroundWork(token);
    }
  }

  async function loadPersistentRecords(keys, targetScope = scope, generation = scopeGeneration, options = {}) {
    const requested = [...new Set((Array.isArray(keys) ? keys : []).filter(Boolean))];
    if (!targetScope?.complete || !requested.length) return new Map();
    if (options.priority === true) {
      const rows = await targetScope.getMany(requested);
      return scopeIsCurrent(targetScope, generation) ? rows : new Map();
    }
    const waits = [];
    const fresh = [];
    requested.forEach((key) => {
      const pendingKey = `${targetScope.namespace}:${key}`;
      const existing = pendingPersistentReads.get(pendingKey);
      if (existing) {
        waits.push(existing.promise.then((value) => [key, value]));
        return;
      }
      const next = deferred();
      pendingPersistentReads.set(pendingKey, next);
      fresh.push({ key, pendingKey, deferred: next });
      waits.push(next.promise.then((value) => [key, value]));
    });
    if (fresh.length) {
      (async () => {
        const rows = await targetScope.getMany(fresh.map((item) => item.key));
        fresh.forEach((item) => item.deferred.resolve(
          scopeIsCurrent(targetScope, generation) ? (rows.get(item.key) ?? null) : null
        ));
      })().catch((error) => fresh.forEach((item) => item.deferred.reject(error))).finally(() => {
        fresh.forEach((item) => {
          if (pendingPersistentReads.get(item.pendingKey) === item.deferred) pendingPersistentReads.delete(item.pendingKey);
        });
      });
    }
    return new Map(await Promise.all(waits));
  }

  function notify(type, ids) {
    if (type !== 'context-reset' && !scopeIsCurrent(scope, scopeGeneration)) return;
    const targetScope = scope; const generation = scopeGeneration;
    const event = { type, ids: uniqueIds(ids), syncState: getSyncState(),
      isCurrent: () => scopeIsCurrent(targetScope, generation) };
    listeners.forEach((listener) => { try { listener(event); } catch (_) {} });
  }

  function schedulePersist() {
    if (!scopeIsCurrent(scope, scopeGeneration) || persistTimer) return;
    const targetScope = scope; const generation = scopeGeneration;
    persistTimer = window.setTimeout(() => {
      if (!scopeIsCurrent(targetScope, generation)) return;
      persistTimer = null;
      void flushPersistence();
    }, 180);
  }

  async function persistQueuedRecords() {
    const targetScope = scope;
    const generation = scopeGeneration;
    if (!targetScope?.complete) return false;
    const productIds = [...dirtyProducts].filter((id) => !(pendingMutationFields.get(id)?.size));
    const categoryIds = [...dirtyCategories];
    const passportIds = [...dirtyPassports].filter((id) => !(pendingMutationFields.get(id)?.size));
    const productIdsToRemove = [...removedProductIds];
    const comboIds = [...dirtyCombos];
    const comboBlockIds = [...dirtyComboBlocks];
    const comboRelationIds = [...dirtyComboRelations];
    const hadMetadataChanges = metadataDirty;
    const hadEditorReferencesChanges = editorReferencesDirty;
    productIds.forEach((id) => dirtyProducts.delete(id));
    categoryIds.forEach((id) => dirtyCategories.delete(id));
    passportIds.forEach((id) => dirtyPassports.delete(id));
    productIdsToRemove.forEach((id) => removedProductIds.delete(id));
    comboIds.forEach((id) => dirtyCombos.delete(id));
    comboBlockIds.forEach((id) => dirtyComboBlocks.delete(id));
    comboRelationIds.forEach((id) => dirtyComboRelations.delete(id));
    metadataDirty = false;
    editorReferencesDirty = false;
    try {
      const groupedEntries = [
        ...categoryIds.map((id) => [`category:${id}`, categoriesById.get(id)]),
        ...comboIds.map((id) => [`combo:${id}`, combosById.get(id)]),
        ...comboBlockIds.map((id) => [`combo-block:${id}`, comboBlocksById.get(id)]),
        ...comboRelationIds.map((id) => [`combo-relations:${id}`, comboRelationsById.get(id) || []]),
      ];
      const nextManifest = {
        ...manifest,
        productIds: uniqueIds([...(manifest.productIds || []), ...productIds]),
        categoryIds: uniqueIds([...(manifest.categoryIds || []), ...categoryIds]),
        passportIds: uniqueIds([...(manifest.passportIds || []), ...passportIds]),
        editorPassportIds: uniqueIds([
          ...(manifest.editorPassportIds || []).filter((id) => !passportIds.includes(Number(id))),
          ...passportIds.filter((id) => isEditorReadyPassport(passportsByProductId.get(id))),
        ]),
        comboIds: uniqueIds([...(manifest.comboIds || []), ...comboIds]),
        comboBlockIds: uniqueIds([...(manifest.comboBlockIds || []), ...comboBlockIds]),
        comboRelationIds: uniqueIds([...(manifest.comboRelationIds || []), ...comboRelationIds]),
        coverageTotals: { ...coverageTotals },
        coverageTargets: { ...coverageTargets },
        coverageTargetMetadata: { ...coverageTargetMetadata },
        updatedAt: Date.now(),
      };
      const entries = [
        ...productIds.map((id) => [`product:${id}`, stableValue(productsById.get(id))]),
        ...passportIds.map((id) => [`passport:${id}`, stableValue(passportsByProductId.get(id))]),
        ...passportIds.map((id) => [`passport-index:${id}`, passportIndexRecord(id, passportsByProductId.get(id))]),
        ...groupedEntries,
      ];
      if (hadEditorReferencesChanges) entries.push(
        ["reference:editor", editorReferences],
        ["reference-index:editor", { schemaVersion: "product-editor-v1" }]
      );
      if (entries.length || hadMetadataChanges) entries.push(["meta:manifest", nextManifest]);
      if (entries.length || productIdsToRemove.length) {
        // Called under the catalog's shared write lock. Advance even for an
        // identical working value (ABA), in the SAME transaction as its data.
        const previous = await targetScope.get('meta:working-sequence', { allowStale: true });
        const sequence = (previous?.sequence ?? 0) + 1;
        if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('CATALOG_WORKING_SEQUENCE_INVALID');
        entries.push(['meta:working-sequence', { sequence }]);
      }
      if (entries.length) await targetScope.setMany(entries, { ttlMs: RECORD_TTL_MS });
      if (productIdsToRemove.length) {
        await targetScope.removeMany(productIdsToRemove.flatMap((id) => [`product:${id}`, `passport:${id}`, `passport-index:${id}`]));
      }
      if (!scopeIsCurrent(targetScope, generation)) return false;
      manifest = nextManifest;
      if (hadEditorReferencesChanges) editorReferencesPersisted = true;
      const persistedProductIds = [];
      passportIds.forEach((id) => {
        if (productsById.get(id)?.orderReady === true && passportsByProductId.has(id)) durableOrderReadyProductIds.add(id);
        else durableOrderReadyProductIds.delete(id);
        if (productsById.get(id)?.editorReady === true
          && isEditorReadyPassport(passportsByProductId.get(id))
          && (!passportsByProductId.get(id)?.editor?.references_normalized || editorReferencesPersisted)) durableEditorReadyProductIds.add(id);
        else durableEditorReadyProductIds.delete(id);
        if (durableOrderReadyProductIds.has(id) || durableEditorReadyProductIds.has(id)) persistedProductIds.push(id);
      });
      if (persistedProductIds.length) notify("persisted", persistedProductIds);
      return true;
    } catch (_) {
      if (scopeIsCurrent(targetScope, generation)) {
        productIds.forEach((id) => dirtyProducts.add(id));
        categoryIds.forEach((id) => dirtyCategories.add(id));
        passportIds.forEach((id) => dirtyPassports.add(id));
        productIdsToRemove.forEach((id) => removedProductIds.add(id));
        comboIds.forEach((id) => dirtyCombos.add(id));
        comboBlockIds.forEach((id) => dirtyComboBlocks.add(id));
        comboRelationIds.forEach((id) => dirtyComboRelations.add(id));
        if (hadMetadataChanges) metadataDirty = true;
        if (hadEditorReferencesChanges) editorReferencesDirty = true;
        setSyncState(navigator.onLine ? "stale" : "offline");
      }
      return false;
    }
  }

  async function flushPersistence() {
    const targetScope = scope; const generation = scopeGeneration;
    if (!scopeIsCurrent(targetScope, generation)) return false;
    if (persistPromise) {
      await persistPromise;
      if (!scopeIsCurrent(targetScope, generation)) return false;
      const hasPersistableProducts = [...dirtyProducts].some((id) => !(pendingMutationFields.get(id)?.size));
      const hasPersistablePassports = [...dirtyPassports].some((id) => !(pendingMutationFields.get(id)?.size));
      if (hasPersistableProducts || dirtyCategories.size || hasPersistablePassports || removedProductIds.size || dirtyCombos.size || dirtyComboBlocks.size || dirtyComboRelations.size || metadataDirty || editorReferencesDirty) {
        return flushPersistence();
      }
      return true;
    }
    const currentPersistPromise = catalogWrite(targetScope, () => {
      assertScope(targetScope, generation);
      return persistQueuedRecords();
    }).finally(() => {
      if (persistPromise === currentPersistPromise) persistPromise = null;
    });
    persistPromise = currentPersistPromise;
    return currentPersistPromise;
  }

  function upsertProduct(raw, options = {}) {
    assertScope();
    noteWorkingChange();
    const incoming = normalizeProduct(raw, options);
    if (!incoming) return null;
    const previous = productsById.get(incoming.id);
    const merged = mergeRecord(previous, incoming, options);
    productsById.set(incoming.id, merged);
    removedProductIds.delete(incoming.id);
    updateProductCategoryIndex(incoming.id, previous?.categoryIds, merged.categoryIds);
    dirtyProducts.add(incoming.id);
    schedulePersist();
    if (options.notify !== false) notify("products", [incoming.id]);
    return merged;
  }

  function upsertProducts(rows, options = {}) {
    const ids = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const record = upsertProduct(row, { ...options, notify: false });
      if (record) ids.push(record.id);
    });
    if (ids.length && options.notify !== false) notify("products", ids);
    if (ids.length && window.AdminIdleHydration?.supported) {
      const missingCards = ids.filter(id => !isEditorReadyPassport(passportsByProductId.get(id)));
      if (missingCards.length) void ensureProducts(missingCards, { background: true,
        requiredCompleteness: 'editor-ready', awaitPersistence: true }).catch(error => {
        console.warn('CATALOG_IDLE_BUFFER_PAUSED:', error.message);
      });
    }
    return ids.map((id) => productsById.get(id));
  }

  function patchProductRuntime(productId, fields = {}, options = {}) {
    assertScope();
    noteWorkingChange();
    const id = normalizeId(productId);
    const product = id ? productsById.get(id) : null;
    if (!id || !product) return false;
    const patch = stableValue(fields) || {};
    Object.keys(patch).forEach((key) => {
      if (patch[key] !== undefined) product[key === "stock" ? "stock_qty" : key] = patch[key];
    });
    const passport = passportsByProductId.get(id);
    if (passport) {
      if (passport.product && typeof passport.product === "object") {
        Object.keys(patch).forEach((key) => {
          if (patch[key] === undefined) return;
          passport.product[key === "stock" ? "stock_qty" : key] = patch[key];
        });
      }
      if (Object.prototype.hasOwnProperty.call(patch, "stock") || Object.prototype.hasOwnProperty.call(patch, "stock_qty")) {
        const value = patch.stock_qty !== undefined ? patch.stock_qty : patch.stock;
        passport.stock = { ...(passport.stock || {}), stock_qty: value, qty: value, is_unlimited: value == null };
        passport.availability = { ...(passport.availability || {}), stock_qty: value, is_available: value == null || Number(value) > 0 };
      }
    }
    if (options.notify !== false) notify("products", [id]);
    return true;
  }

  function patchProductOptimistic(productId, fields) {
    assertScope();
    const id = normalizeId(productId);
    if (!id || !productsById.has(id)) return null;
    const version = (mutationVersions.get(id) || 0) + 1;
    mutationVersions.set(id, version);
    const fieldVersions = mutationFieldVersions.get(id) || new Map();
    const pendingFields = pendingMutationFields.get(id) || new Map();
    Object.keys(fields || {}).forEach((key) => {
      const normalizedKey = key === "stock" ? "stock_qty" : key;
      fieldVersions.set(normalizedKey, version);
      pendingFields.set(normalizedKey, version);
    });
    mutationFieldVersions.set(id, fieldVersions);
    pendingMutationFields.set(id, pendingFields);
    const previous = {};
    Object.keys(fields || {}).forEach((key) => {
      const normalizedKey = key === "stock" ? "stock_qty" : key;
      previous[normalizedKey] = {
        exists: Object.prototype.hasOwnProperty.call(productsById.get(id), normalizedKey),
        value: stableValue(productsById.get(id)[normalizedKey]),
      };
    });
    const token = {
      id,
      version,
      fields: Object.keys(previous),
      previous,
      scope, scopeGeneration,
      foregroundToken: beginForegroundWork(),
    };
    patchProductRuntime(id, fields);
    return token;
  }

  function commitProductPatch(token, authoritativeFields = null) {
    if (!scopeIsCurrent(token?.scope, token?.scopeGeneration)) return false;
    if (token?.foregroundToken != null) endForegroundWork(token.foregroundToken);
    const id = normalizeId(token?.id);
    if (!id) return false;
    const fieldVersions = mutationFieldVersions.get(id) || new Map();
    const pendingFields = pendingMutationFields.get(id) || new Map();
    const currentFields = Object.fromEntries(Object.entries(authoritativeFields || {}).filter(([key]) => (
      fieldVersions.get(key === "stock" ? "stock_qty" : key) === token.version
    )));
    if (Object.keys(currentFields).length) patchProductRuntime(id, currentFields);
    if (!(token.fields || []).some((key) => fieldVersions.get(key) === token.version)) {
      (token.fields || []).forEach((key) => {
        if (pendingFields.get(key) === token.version) pendingFields.delete(key);
      });
      if (pendingFields.size) pendingMutationFields.set(id, pendingFields);
      else pendingMutationFields.delete(id);
      return false;
    }
    (token.fields || []).forEach((key) => {
      if (pendingFields.get(key) === token.version) pendingFields.delete(key);
    });
    if (pendingFields.size) pendingMutationFields.set(id, pendingFields);
    else pendingMutationFields.delete(id);
    dirtyProducts.add(id);
    if (passportsByProductId.has(id)) dirtyPassports.add(id);
    schedulePersist();
    return true;
  }

  function patchProductAuthoritative(productId, fields, options = {}) {
    const id = normalizeId(productId);
    if (!id || !patchProductRuntime(id, fields, options)) return false;
    const version = (mutationVersions.get(id) || 0) + 1;
    mutationVersions.set(id, version);
    const fieldVersions = mutationFieldVersions.get(id) || new Map();
    Object.keys(fields || {}).forEach((key) => fieldVersions.set(key === "stock" ? "stock_qty" : key, version));
    mutationFieldVersions.set(id, fieldVersions);
    dirtyProducts.add(id);
    if (passportsByProductId.has(id)) dirtyPassports.add(id);
    schedulePersist();
    return true;
  }

  function rollbackProductPatch(token) {
    if (!scopeIsCurrent(token?.scope, token?.scopeGeneration)) return false;
    if (token?.foregroundToken != null) endForegroundWork(token.foregroundToken);
    const id = normalizeId(token?.id);
    if (!id || !productsById.has(id)) return false;
    const fieldVersions = mutationFieldVersions.get(id) || new Map();
    const pendingFields = pendingMutationFields.get(id) || new Map();
    const rollback = {};
    const absentFields = [];
    (token.fields || []).forEach((key) => {
      if (fieldVersions.get(key) !== token.version) return;
      const saved = token.previous?.[key];
      if (!saved) return;
      if (saved.exists) rollback[key] = saved.value;
      else absentFields.push(key);
      if (pendingFields.get(key) === token.version) pendingFields.delete(key);
      fieldVersions.set(key, token.version + 1);
    });
    if (!Object.keys(rollback).length && !absentFields.length) return false;
    mutationVersions.set(id, Math.max(mutationVersions.get(id) || 0, token.version + 1));
    mutationFieldVersions.set(id, fieldVersions);
    if (pendingFields.size) pendingMutationFields.set(id, pendingFields);
    else pendingMutationFields.delete(id);
    if (Object.keys(rollback).length) patchProductRuntime(id, rollback);
    if (absentFields.length) {
      const product = productsById.get(id);
      const passportProduct = passportsByProductId.get(id)?.product;
      absentFields.forEach((key) => {
        delete product[key];
        if (passportProduct && key !== "stock_qty") delete passportProduct[key];
      });
      notify("products", [id]);
    }
    dirtyProducts.add(id);
    if (passportsByProductId.has(id)) dirtyPassports.add(id);
    schedulePersist();
    return true;
  }

  function isOrderReadyPassport(passport) {
    if (!passport || typeof passport !== "object" || !passport.product || typeof passport.product !== "object") return false;
    const productId = normalizeId(passport.product.id ?? passport.product.product_id);
    return Boolean(
      productId
      && passport.stock && typeof passport.stock === "object"
      && passport.availability && typeof passport.availability === "object"
      && ((passport.units && typeof passport.units === "object" && Array.isArray(passport.unitConversions))
        || passport.editor?.references_normalized === true)
      && Array.isArray(passport.productUnitLinks)
      && Array.isArray(passport.ingredients)
      && passport.nestedIngredients && typeof passport.nestedIngredients === "object"
      && Array.isArray(passport.variants)
      && Array.isArray(passport.options)
      && Array.isArray(passport.optionAssignments)
      && Array.isArray(passport.comboRefs)
      && Object.prototype.hasOwnProperty.call(passport, "defaultConfig")
      && passport.revision?.data_version === "full-product-passport-v1"
    );
  }

  function isEditorReadyPassport(passport) {
    return Boolean(
      isOrderReadyPassport(passport)
      && passport.editor && typeof passport.editor === "object"
      && passport.editor.schema_version === "product-editor-v1"
      && Array.isArray(passport.editor.categories)
      && Array.isArray(passport.editor.discounts)
      && ((passport.editor.relatedProductUnitLinks && typeof passport.editor.relatedProductUnitLinks === "object")
        || passport.editor.references_normalized === true)
    );
  }

  function normalizeEditorReferences(passport, references = editorReferences, publish = true) {
    if (!passport?.editor || typeof passport.editor !== "object") return passport;
    if (passport.units && typeof passport.units === "object") references.units = { ...passport.units };
    if (Array.isArray(passport.unitConversions)) {
      references.unitConversions = passport.unitConversions.slice();
    }
    references.relatedProductUnitLinks = {
      ...references.relatedProductUnitLinks,
      ...(passport.editor.relatedProductUnitLinks || {}),
    };
    if (publish) { editorReferencesDirty = true; editorReferencesLoaded = true; }
    const normalized = { ...passport, editor: { ...passport.editor, references_normalized: true } };
    delete normalized.units;
    delete normalized.unitConversions;
    delete normalized.editor.relatedProductUnitLinks;
    return normalized;
  }

  function materializePassport(passport) {
    if (!passport?.editor?.references_normalized) return passport;
    const relatedProductIds = uniqueIds((passport.ingredients || []).map((row) => row?.ingredient_id));
    const relatedProductUnitLinks = {};
    relatedProductIds.forEach((productId) => {
      const links = editorReferences.relatedProductUnitLinks[productId]
        || editorReferences.relatedProductUnitLinks[String(productId)];
      if (Array.isArray(links)) relatedProductUnitLinks[productId] = links;
    });
    return {
      ...passport,
      units: editorReferences.units,
      unitConversions: editorReferences.unitConversions,
      editor: { ...passport.editor, relatedProductUnitLinks },
    };
  }

  function upsertPassports(payload, options = {}) {
    assertScope();
    noteWorkingChange();
    const source = payload instanceof Map
      ? [...payload.values()]
      : (Array.isArray(payload) ? payload : Object.values(payload && typeof payload === "object" ? payload : {}));
    const ids = [];
    source.forEach((rawPassport) => {
      let passport = stableValue(rawPassport);
      if (!isOrderReadyPassport(passport)) return;
      const id = normalizeId(passport.product.id ?? passport.product.product_id);
      const currentProduct = productsById.get(id);
      if (currentProduct && Object.prototype.hasOwnProperty.call(currentProduct, "stock_qty")) {
        const stockQty = currentProduct.stock_qty;
        passport.product.stock_qty = stockQty;
        passport.stock = { ...(passport.stock || {}), stock_qty: stockQty, qty: stockQty, is_unlimited: stockQty == null };
        passport.availability = {
          ...(passport.availability || {}),
          stock_qty: stockQty,
          is_available: stockQty == null || Number(stockQty) > 0,
        };
      }
      const editorReady = isEditorReadyPassport(passport);
      if (editorReady) passport = normalizeEditorReferences(passport);
      passportsByProductId.set(id, passport);
      dirtyPassports.add(id);
      const product = upsertProduct(passport.product, {
        ...options,
        completeness: editorReady ? "editor-ready" : "order-ready",
        notify: false,
        authoritativeFields: Object.keys(passport.product),
      });
      if (product) {
        product.passportRevision = passport.revision?.revision || passport.revision?.updated_at || null;
        product.orderReadySnapshotKey = `passport:${id}`;
        product.editorReady = editorReady;
        dirtyProducts.add(id);
        ids.push(id);
      }
    });
    if (ids.length && options.notify !== false) notify("products", ids);
    schedulePersist();
    return ids.map((id) => productsById.get(id));
  }

  function markProductSummary(raw, options = {}) {
    assertScope();
    noteWorkingChange();
    const incoming = normalizeProduct(raw, { ...options, completeness: "summary" });
    if (!incoming) return null;
    const existing = productsById.get(incoming.id) || {};
    const merged = mergeRecord(existing, incoming, {
      ...options,
      authoritativeFields: Object.keys(incoming),
    });
    const existingLevel = completeness(existing.completeness);
    merged.completeness = existingLevel;
    merged.orderReady = existingLevel === "order-ready" || existingLevel === "editor-ready";
    merged.editorReady = existingLevel === "editor-ready";
    productsById.set(incoming.id, merged);
    dirtyProducts.add(incoming.id);
    schedulePersist();
    notify("products", [incoming.id]);
    return merged;
  }

  function upsertCategory(raw, options = {}) {
    assertScope();
    noteWorkingChange();
    const incoming = normalizeCategory(raw);
    if (!incoming) return null;
    const merged = { ...(categoriesById.get(incoming.id) || {}) };
    Object.keys(incoming).forEach((key) => { if (incoming[key] !== undefined) merged[key] = incoming[key]; });
    categoriesById.set(incoming.id, merged);
    dirtyCategories.add(incoming.id);
    schedulePersist();
    if (options.notify !== false) notify("categories", [incoming.id]);
    return merged;
  }

  function upsertCategories(rows, options = {}) {
    const ids = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const record = upsertCategory(row, { ...options, notify: false });
      if (record) ids.push(record.id);
    });
    if (ids.length && options.notify !== false) notify("categories", ids);
    return ids.map((id) => categoriesById.get(id));
  }

  async function replaceCategories(rows) {
    const targetScope = scope; const generation = scopeGeneration;
    assertScope(targetScope, generation);
    noteWorkingChange();
    const incoming = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const normalized = normalizeCategory(row);
      if (normalized) incoming.set(normalized.id, normalized);
    });
    const removed = [...categoriesById.keys()].filter((id) => !incoming.has(id));
    categoriesById.clear();
    incoming.forEach((row, id) => { categoriesById.set(id, row); dirtyCategories.add(id); });
    manifest.categoryIds = [...incoming.keys()];
    if (scope?.complete && removed.length) {
      await targetScope.removeMany(removed.map((id) => `category:${id}`)).catch(() => null);
    }
    assertScope(targetScope, generation);
    schedulePersist();
    notify("categories", [...incoming.keys()]);
    return [...incoming.values()];
  }

  function getProduct(id) { return scopeIsCurrent(scope, scopeGeneration) ? productsById.get(normalizeId(id)) || null : null; }
  function getProducts(ids) { return scopeIsCurrent(scope, scopeGeneration) ? uniqueIds(ids).map((id) => productsById.get(id)).filter(Boolean) : []; }
  function getProductsForCategory(categoryId) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    const ids = productIdsByCategoryId.get(normalizeId(categoryId));
    return ids ? [...ids].map((id) => productsById.get(id)).filter(Boolean) : [];
  }
  function getCategory(id) { return scopeIsCurrent(scope, scopeGeneration) ? categoriesById.get(normalizeId(id)) || null : null; }
  function getAllProducts() { return scopeIsCurrent(scope, scopeGeneration) ? [...productsById.values()] : []; }
  function getAllCategories() { return scopeIsCurrent(scope, scopeGeneration) ? [...categoriesById.values()] : []; }
  function isProductPersistedOrderReady(id) {
    return scopeIsCurrent(scope, scopeGeneration) && durableOrderReadyProductIds.has(normalizeId(id));
  }
  function isProductPersistedEditorReady(id) {
    return scopeIsCurrent(scope, scopeGeneration) && durableEditorReadyProductIds.has(normalizeId(id));
  }
  function getProductPassport(id) { return scopeIsCurrent(scope, scopeGeneration) ? materializePassport(passportsByProductId.get(normalizeId(id)) || null) : null; }
  function getEditorReferences() {
    if (!scopeIsCurrent(scope, scopeGeneration)) return { units: {}, unitConversions: [] };
    return { units: editorReferences.units, unitConversions: editorReferences.unitConversions };
  }

  function getDescendantCategoryIds(categoryId) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    const rootId = normalizeId(categoryId);
    if (!rootId) return [];
    const result = [];
    const queue = [rootId];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      categoriesById.forEach((category) => {
        if (normalizeId(category.parentId ?? category.parent_id) === id) queue.push(category.id);
      });
    }
    return result;
  }

  function getRootCategoryId(categoryId) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return null;
    let id = normalizeId(categoryId);
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const category = categoriesById.get(id);
      const parentId = normalizeId(category?.parentId ?? category?.parent_id);
      if (!parentId) return id;
      id = parentId;
    }
    return id;
  }

  function getCoverage(options = {}) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return { knownProducts: 0, orderReadyProducts: 0, editorReadyProducts: 0, total: null };
    const categoryId = normalizeId(options.categoryId);
    const coverageKey = categoryId ? `category:${categoryId}` : "global";
    const targetIds = Array.isArray(coverageTargets[coverageKey]) ? uniqueIds(coverageTargets[coverageKey]) : null;
    const targetSet = targetIds ? new Set(targetIds) : null;
    const included = categoryId ? new Set(getDescendantCategoryIds(categoryId)) : null;
    const records = [...productsById.values()].filter((product) => {
      if (targetSet && !targetSet.has(Number(product.id))) return false;
      return !included || uniqueIds([product.categoryId, ...(product.categoryIds || [])]).some((id) => included.has(id));
    });
    const total = targetIds ? targetIds.length : coverageTotals[coverageKey];
    const durableProductIds = new Set(uniqueIds(manifest.productIds));
    const durableIncludedIds = targetIds
      ? targetIds.filter((id) => durableProductIds.has(id))
      : (categoryId ? records.map((product) => Number(product.id)) : [...durableProductIds]);
    return {
      knownProducts: durableIncludedIds.length,
      orderReadyProducts: durableIncludedIds.filter((id) => durableOrderReadyProductIds.has(id)).length,
      editorReadyProducts: durableIncludedIds.filter((id) => durableEditorReadyProductIds.has(id)).length,
      total: coverageTargetMetadata[coverageKey]?.source === 'keyset-observed' ? null
        : total != null && Number.isFinite(Number(total)) ? Number(total) : null,
      targetSource: coverageTargetMetadata[coverageKey]?.source || null,
      targetCachedAt: Number(coverageTargetMetadata[coverageKey]?.cachedAt || 0) || null,
    };
  }

  function removeProduct(id) {
    assertScope();
    noteWorkingChange();
    const productId = normalizeId(id);
    if (!productId) return false;
    const previous = productsById.get(productId);
    productsById.delete(productId);
    updateProductCategoryIndex(productId, previous?.categoryIds, []);
    passportsByProductId.delete(productId);
    durableOrderReadyProductIds.delete(productId);
    durableEditorReadyProductIds.delete(productId);
    dirtyProducts.delete(productId);
    dirtyPassports.delete(productId);
    removedProductIds.add(productId);
    Object.keys(coverageTargets).forEach((key) => {
      coverageTargets[key] = uniqueIds(coverageTargets[key]).filter((item) => item !== productId);
      coverageTotals[key] = coverageTargets[key].length;
    });
    manifest = {
      ...manifest,
      productIds: uniqueIds((Array.isArray(manifest.productIds) ? manifest.productIds : [])
        .filter((item) => Number(item) !== productId)),
      passportIds: uniqueIds((Array.isArray(manifest.passportIds) ? manifest.passportIds : [])
        .filter((item) => Number(item) !== productId)),
      editorPassportIds: uniqueIds((Array.isArray(manifest.editorPassportIds) ? manifest.editorPassportIds : [])
        .filter((item) => Number(item) !== productId)),
      coverageTargets: { ...coverageTargets },
      coverageTargetMetadata: { ...coverageTargetMetadata },
      coverageTotals: { ...coverageTotals },
      updatedAt: Date.now(),
    };
    notify("removed", [productId]);
    metadataDirty = true;
    schedulePersist();
    return true;
  }

  async function clearSavedProducts() {
    const access = window.AdminLocalRepository.capture();
    await cancelDownloadJob();
    if (!access.isCurrent()) return false;
    await init();
    if (!access.isCurrent()) return false;
    const targetScope = scope;
    const generation = scopeGeneration;
    if (!targetScope?.complete) return false;
    offlineGeneration += 1;
    noteWorkingChange();
    stopSync();
    if (reconcilePromise) await reconcilePromise;
    await flushPersistence();
    if (!scopeIsCurrent(targetScope, generation)) return false;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = null;
    dirtyProducts.clear();
    dirtyPassports.clear();
    removedProductIds.clear();
    const productIds = uniqueIds([
      ...(Array.isArray(manifest.productIds) ? manifest.productIds : []),
      ...(Array.isArray(manifest.passportIds) ? manifest.passportIds : []),
      ...(Array.isArray(manifest.editorPassportIds) ? manifest.editorPassportIds : []),
    ]);
    const comboIds = uniqueIds(manifest.comboIds);
    const comboBlockIds = uniqueIds(manifest.comboBlockIds);
    const comboRelationIds = uniqueIds(manifest.comboRelationIds);
    const keysToRemove = [
      ...productIds.flatMap((id) => [`product:${id}`, `passport:${id}`, `passport-index:${id}`]),
      "reference:editor",
      "reference-index:editor",
      "meta:offline:state",
      ...comboIds.map((id) => `combo:${id}`),
      ...comboBlockIds.map((id) => `combo-block:${id}`),
      ...comboRelationIds.map((id) => `combo-relations:${id}`),
    ];
    await targetScope.removeMany(keysToRemove);
    if (!scopeIsCurrent(targetScope, generation)) return false;
    passportsByProductId.clear();
    durableOrderReadyProductIds.clear();
    durableEditorReadyProductIds.clear();
    editorReferences = { units: {}, unitConversions: [], relatedProductUnitLinks: {} };
    editorReferencesLoaded = false;
    editorReferencesPersisted = false;
    editorReferencesDirty = false;
    combosById.clear();
    comboBlocksById.clear();
    comboRelationsById.clear();
    rebuildComboIndexes();
    productsById.forEach((product, id) => {
      productsById.set(id, { ...product, completeness: "summary", orderReady: false, editorReady: false });
    });
    const nextManifest = {
      ...manifest,
      productIds: [],
      passportIds: [],
      editorPassportIds: [],
      comboIds: [],
      comboBlockIds: [],
      comboRelationIds: [],
      coverageTotals: { ...coverageTotals },
      coverageTargets: { ...coverageTargets },
      coverageTargetMetadata: { ...coverageTargetMetadata },
      updatedAt: Date.now(),
    };
    await targetScope.set("meta:manifest", nextManifest, { ttlMs: RECORD_TTL_MS });
    if (!scopeIsCurrent(targetScope, generation)) return false;
    manifest = nextManifest;
    notify("cleared", productIds);
    return true;
  }

  async function catalogRequest(url, options = {}) {
    const targetScope = scope; const generation = scopeGeneration;
    assertScope(targetScope, generation);
    const headers = { 'x-rbac-context': configuredRbacContext, ...(options.headers || {}) };
    const token = localStorage.getItem("authToken");
    if (token) headers.Authorization = `Bearer ${token}`;
    const storeId = Number(localStorage.getItem("activeStoreId") || localStorage.getItem("store_id") || 0);
    if (storeId > 0) headers["x-store-id"] = String(storeId);
    if (options.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => null);
    assertScope(targetScope, generation);
    checkAccessResponse(response.status, payload);
    if (!response.ok || !payload || payload.ok === false) throw new Error(payload?.error || `HTTP_${response.status}`);
    return payload;
  }

  async function loadEditorPassports(ids) {
    return catalogRequest("/api/admin/catalog/product-passports", {
      method: "POST",
      body: JSON.stringify({ ids: uniqueIds(ids) }),
    });
  }

  function publicDownloadJob() {
    if (!scopeIsCurrent(scope, scopeGeneration) || !downloadJob) return null;
    const targetIds = uniqueIds(downloadJob.targetIds);
    const completed = targetIds.filter((id) => durableEditorReadyProductIds.has(id)).length;
    return { ...downloadJob, targetIds: targetIds.slice(), completed, total: targetIds.length };
  }

  async function persistDownloadJob() {
    const targetScope = scope; const generation = scopeGeneration;
    if (!scopeIsCurrent(targetScope, generation)) return false;
    if (!downloadJob) {
      await targetScope.remove("meta:download-job");
      assertScope(targetScope, generation);
      return true;
    }
    downloadJob.updatedAt = Date.now();
    await targetScope.set("meta:download-job", downloadJob, { ttlMs: RECORD_TTL_MS });
    assertScope(targetScope, generation);
    return true;
  }

  function notifyDownloadJob() {
    notify("download-job", []);
  }

  async function runDownloadJob() {
    if (downloadJobPromise) return downloadJobPromise;
    if (!downloadJob || !scope?.complete || !navigator.onLine || !localStorage.getItem("authToken")) return false;
    const targetScope = scope;
    const scopeRunGeneration = scopeGeneration;
    const jobRunGeneration = ++downloadJobGeneration;
    downloadJob.state = "running";
    downloadJob.error = null;
    try {
      await persistDownloadJob();
    } catch (_) {
      if (!scopeIsCurrent(targetScope, scopeRunGeneration) || !downloadJob || jobRunGeneration !== downloadJobGeneration) return false;
      downloadJob.state = "error";
      downloadJob.error = "storage";
      notifyDownloadJob();
      return false;
    }
    if (!downloadJob || jobRunGeneration !== downloadJobGeneration || !scopeIsCurrent(targetScope, scopeRunGeneration)) return false;
    notifyDownloadJob();
    const task = (async () => {
      while (downloadJob && jobRunGeneration === downloadJobGeneration && scopeIsCurrent(targetScope, scopeRunGeneration)) {
        if (!(await waitForDownloadTurn())) return false;
        if (!downloadJob || jobRunGeneration !== downloadJobGeneration || !scopeIsCurrent(targetScope, scopeRunGeneration)) return false;
        const missing = uniqueIds(downloadJob.targetIds).filter((id) => !durableEditorReadyProductIds.has(id));
        if (!missing.length) break;
        if (!navigator.onLine) throw new Error("CATALOG_PRELOAD_OFFLINE");
        const batch = missing.slice(0, PRELOAD_BATCH_SIZE);
        await ensureProducts(batch, {
          requiredCompleteness: "editor-ready",
          loader: loadEditorPassports,
          awaitPersistence: true,
          background: true,
          taskKey: 'download:' + jobRunGeneration,
          guard: () => jobRunGeneration === downloadJobGeneration,
        });
        if (!scopeIsCurrent(targetScope, scopeRunGeneration) || jobRunGeneration !== downloadJobGeneration) return false;
        if (batch.some((id) => !durableEditorReadyProductIds.has(id))) {
          const error = new Error("CATALOG_PRELOAD_PERSIST_FAILED");
          error.storage = true;
          throw error;
        }
        await persistDownloadJob();
        notifyDownloadJob();
      }
      if (!downloadJob || jobRunGeneration !== downloadJobGeneration) return false;
      if (!(await waitForDownloadTurn())) return false;
      if (!downloadJob || jobRunGeneration !== downloadJobGeneration || !scopeIsCurrent(targetScope, scopeRunGeneration)) return false;
      const comboOptions = { requiredCompleteness: 'editor-ready', awaitPersistence: true, background: true,
        taskKey: 'download:' + jobRunGeneration, guard: () => jobRunGeneration === downloadJobGeneration };
      if (downloadJob.comboMode === "all") await ensureAllCombos(comboOptions);
      else if (Array.isArray(downloadJob.comboCategoryCodes) && downloadJob.comboCategoryCodes.length) {
        await ensureCombosForCategoryCodes(downloadJob.comboCategoryCodes, comboOptions);
      }
      if (!scopeIsCurrent(targetScope, scopeRunGeneration) || jobRunGeneration !== downloadJobGeneration) return false;
      downloadJob.state = "complete";
      downloadJob.error = null;
      await persistDownloadJob();
      notifyDownloadJob();
      return true;
    })().catch(async (error) => {
      if (scopeIsCurrent(targetScope, scopeRunGeneration) && downloadJob && jobRunGeneration === downloadJobGeneration) {
        downloadJob.state = navigator.onLine ? "error" : "paused";
        downloadJob.error = error?.storage === true ? "storage" : String(error?.message || "CATALOG_PRELOAD_FAILED");
        await persistDownloadJob().catch(() => false);
        notifyDownloadJob();
      }
      return false;
    }).finally(() => { if (downloadJobPromise === task) downloadJobPromise = null; });
    downloadJobPromise = task;
    return downloadJobPromise;
  }

  async function startDownloadJob(options = {}) {
    if (!await init()) return false;
    const targetScope = scope; const generation = scopeGeneration;
    const targetIds = uniqueIds(options.targetIds);
    if (!targetIds.length) return false;
    downloadJobGeneration += 1;
    downloadJob = {
      type: options.type === "category" ? "category" : "all",
      rootCategoryId: normalizeId(options.rootCategoryId),
      targetIds,
      comboMode: options.comboMode === "all" ? "all" : "category",
      comboCategoryCodes: [...new Set((options.comboCategoryCodes || []).map(String).filter(Boolean))],
      state: navigator.onLine ? "running" : "paused",
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await persistDownloadJob();
    } catch (_) {
      if (!scopeIsCurrent(targetScope, generation)) return false;
      downloadJob.state = "error";
      downloadJob.error = "storage";
      notifyDownloadJob();
      return false;
    }
    if (!scopeIsCurrent(targetScope, generation)) return false;
    notifyDownloadJob();
    return runDownloadJob();
  }

  async function resumeDownloadJob() {
    if (!await init()) return false;
    if (!downloadJob || downloadJob.state === "complete") return false;
    return runDownloadJob();
  }

  async function cancelDownloadJob() {
    const targetScope = scope; const generation = scopeGeneration;
    if (!scopeIsCurrent(targetScope, generation)) return false;
    const activePromise = downloadJobPromise;
    downloadJobGeneration += 1;
    downloadJob = null;
    downloadJobPromise = null;
    cancelDownloadSchedule(false);
    notifyDownloadJob();
    if (activePromise) void activePromise.catch(error => console.error('CATALOG_CANCELLED_JOB_FAILED:', error));
    if (!scopeIsCurrent(targetScope, generation)) return false;
    if (scope?.complete) await persistDownloadJob().catch(() => false);
    return true;
  }

  function getDownloadJob() { return publicDownloadJob(); }

  function setCoverageTotal(total, options = {}) {
    assertScope();
    const value = Number(total);
    if (!Number.isFinite(value) || value < 0) return false;
    const categoryId = normalizeId(options.categoryId);
    coverageTotals[categoryId ? `category:${categoryId}` : "global"] = value;
    metadataDirty = true;
    schedulePersist();
    notify("coverage", []);
    return true;
  }

  function setCoverageTarget(ids, options = {}) {
    assertScope();
    const targetIds = uniqueIds(ids);
    const categoryId = normalizeId(options.categoryId);
    const key = categoryId ? `category:${categoryId}` : "global";
    coverageTargets[key] = targetIds;
    coverageTotals[key] = targetIds.length;
    coverageTargetMetadata[key] = {
      source: String(options.source || "server-target-discovery"),
      cachedAt: Number(options.cachedAt || Date.now()),
    };
    metadataDirty = true;
    schedulePersist();
    notify("coverage", targetIds);
    return targetIds;
  }

  function getTrackedCoverageCategoryIds() {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    return Object.keys(coverageTargets)
      .map((key) => key.match(/^category:(\d+)$/)?.[1])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  function getCoverageTargetIds(options = {}) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    const categoryId = normalizeId(options.categoryId);
    const key = categoryId ? `category:${categoryId}` : "global";
    if (coverageTargetMetadata[key]?.source === 'keyset-observed') return null;
    return Array.isArray(coverageTargets[key]) ? uniqueIds(coverageTargets[key]) : null;
  }

  async function readPersistentProducts(ids, targetScope, generation) {
    const requested = uniqueIds(ids);
    const records = await loadPersistentRecords(requested.map((id) => `product:${id}`), targetScope, generation);
    if (!scopeIsCurrent(targetScope, generation)) return;
    requested.forEach((id) => {
      const row = records.get(`product:${id}`);
      if (normalizeId(row?.id) !== id) return;
      const previous = productsById.get(id);
      productsById.set(id, row);
      updateProductCategoryIndex(
        id,
        [previous?.categoryId, previous?.category_id, ...(previous?.categoryIds || []), ...(previous?.category_ids || [])],
        [row?.categoryId, row?.category_id, ...(row?.categoryIds || []), ...(row?.category_ids || [])]
      );
    });
  }

  async function readPersistentPassports(ids, targetScope, generation, options = {}) {
    const requested = uniqueIds(ids);
    const records = await loadPersistentRecords(
      requested.map((id) => `passport:${id}`),
      targetScope,
      generation,
      options
    );
    if (!scopeIsCurrent(targetScope, generation)) return;
    const persistedIds = [];
    const indexEntries = [];
    requested.forEach((id) => {
      const row = records.get(`passport:${id}`);
      if (!isOrderReadyPassport(row)) {
        durableOrderReadyProductIds.delete(id);
        durableEditorReadyProductIds.delete(id);
        return;
      }
      const rowId = normalizeId(row?.product?.id ?? row?.product?.product_id);
      if (rowId !== id) {
        durableOrderReadyProductIds.delete(id);
        durableEditorReadyProductIds.delete(id);
        return;
      }
      passportsByProductId.set(id, row);
      durableOrderReadyProductIds.add(id);
      if (isEditorReadyPassport(row)
        && (!row.editor?.references_normalized || editorReferencesPersisted)) {
        durableEditorReadyProductIds.add(id);
      } else {
        durableEditorReadyProductIds.delete(id);
      }
      persistedIds.push(id);
      indexEntries.push([`passport-index:${id}`, passportIndexRecord(id, row)]);
    });
    if (indexEntries.length && scopeIsCurrent(targetScope, generation)) {
      await targetScope.setMany(indexEntries, { ttlMs: RECORD_TTL_MS }).catch(() => false);
    }
    if (!scopeIsCurrent(targetScope, generation)) return;
    if (persistedIds.length) notify("persisted", persistedIds);
  }

  async function loadProducts(ids = manifest.productIds) {
    if (!await init()) return new Map();
    const targetScope = scope; const generation = scopeGeneration;
    const requested = uniqueIds(ids);
    await readPersistentProducts(requested.filter((id) => !productsById.has(id)), scope, scopeGeneration);
    assertScope(targetScope, generation);
    return new Map(requested.map((id) => [id, productsById.get(id) || null]));
  }

  async function loadPassports(ids = manifest.passportIds) {
    if (!await init()) return new Map();
    const targetScope = scope; const generation = scopeGeneration;
    const requested = uniqueIds(ids);
    if (uniqueIds(manifest.editorPassportIds).some((id) => requested.includes(id))) await loadEditorReferences({ priority: true });
    assertScope(targetScope, generation);
    await readPersistentPassports(
      requested.filter((id) => !passportsByProductId.has(id)),
      targetScope,
      generation,
      { priority: true }
    );
    assertScope(targetScope, generation);
    return new Map(requested.map((id) => [id, getProductPassport(id)]));
  }

  async function loadEditorReferences(options = {}) {
    if (!await init()) return getEditorReferences();
    if (editorReferencesLoaded || !scope?.complete) return getEditorReferences();
    const targetScope = scope;
    const generation = scopeGeneration;
    const records = await loadPersistentRecords(["reference:editor"], targetScope, generation, options);
    assertScope(targetScope, generation);
    const saved = records.get("reference:editor");
    if (saved && typeof saved === "object" && scopeIsCurrent(targetScope, generation)) {
      editorReferences = { ...editorReferences, ...saved };
      editorReferencesPersisted = true;
      await targetScope.set("reference-index:editor", { schemaVersion: "product-editor-v1" }, { ttlMs: RECORD_TTL_MS }).catch(() => false);
    }
    if (scopeIsCurrent(targetScope, generation)) editorReferencesLoaded = true;
    assertScope(targetScope, generation);
    return getEditorReferences();
  }

  async function loadCategories(ids = manifest.categoryIds) {
    if (!await init()) return [];
    const targetScope = scope; const generation = scopeGeneration;
    const requested = uniqueIds(ids);
    const missing = requested.filter((id) => !categoriesById.has(id));
    if (missing.length && scope?.complete) {
      const records = await loadPersistentRecords(missing.map((id) => `category:${id}`), targetScope, generation);
      if (scopeIsCurrent(targetScope, generation)) missing.forEach((id) => {
        const row = records.get(`category:${id}`);
        if (normalizeId(row?.id) === id) categoriesById.set(id, row);
      });
    }
    assertScope(targetScope, generation);
    return requested.map((id) => categoriesById.get(id)).filter(Boolean);
  }

  function loaderRows(payload, ids) {
    if (Array.isArray(payload)) return payload;
    if (payload instanceof Map) return ids.map((id) => payload.get(id)).filter(Boolean);
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    if (!data || typeof data !== "object") return [];
    return ids.map((id) => data[id] ?? data[String(id)]).filter(Boolean);
  }

  function offlineState(saved) {
    return { productIds: [], passportIds: [], editorPassportIds: [], comboIds: [], comboBlockIds: [],
      checkpoints: {}, scans: {}, ...(saved || {}), complete: false, snapshotConsistent: false };
  }

  async function offlinePortion(context, targetScope, generation, fetchPortion, stagePortion, checkpoint) {
    context.assertCurrent(); assertScope(targetScope, generation);
    if (!offlineWritesAllowed || !window.navigator?.locks?.request) throw new Error('CATALOG_OFFLINE_COORDINATION_UNAVAILABLE');
    const fence = window.localStorage.getItem(writeFenceKey(targetScope));
    const sequence = workingWriteSequence;
    const rbacContext = configuredRbacContext;
    const assertUnchanged = () => {
      context.assertCurrent(); assertScope(targetScope, generation);
      if (!offlineWritesAllowed || sequence !== workingWriteSequence || rbacContext !== configuredRbacContext
          || fence !== window.localStorage.getItem(writeFenceKey(targetScope))) {
        throw new DOMException('Working catalog changed', 'AbortError');
      }
    };
    const payload = await fetchPortion();
    assertUnchanged();
    // No upsert*, notify, dirty set or persistence timer before this transaction.
    return catalogWrite(targetScope, async () => {
      assertUnchanged();
      const stored = await targetScope.getMany(['meta:offline:state', 'reference:editor'], { allowStale: true });
      const saved = offlineState(stored.get('meta:offline:state'));
      assertUnchanged();
      const stage = stagePortion(payload, stored.get('reference:editor'), saved);
      const next = { ...saved, updatedAt: Date.now(), checkpoints: { ...saved.checkpoints }, scans: { ...saved.scans } };
      for (const key of ['productIds', 'passportIds', 'editorPassportIds', 'comboIds', 'comboBlockIds']) {
        next[key] = uniqueIds([...(saved[key] || []), ...(stage[key] || [])]);
      }
      if (checkpoint.scan) next.scans[checkpoint.key] = stage.cursor;
      else {
        next.checkpoints[checkpoint.key] = { ids: stage.productIds || stage.comboIds || [],
          confirmedAt: Date.now(), version: checkpoint.version || null };
        const keys = Object.keys(next.checkpoints);
        for (const key of keys.slice(0, Math.max(0, keys.length - 128))) delete next.checkpoints[key];
      }
      try {
        await context.commit(targetScope, [...stage.entries, ['meta:offline:state', next]], {
          ttlMs: RECORD_TTL_MS, recordCount: stage.recordCount, guard: () => { assertUnchanged(); return true; },
        });
      } catch (error) { assertUnchanged(); throw error; }
      // A committed transaction cannot be rolled back. If access/activity changed
      // after commit, retain its scoped records but do not publish into this page.
      assertUnchanged();
      stage.publish();
      for (const key of ['productIds', 'passportIds', 'editorPassportIds', 'comboIds', 'comboBlockIds']) {
        manifest[key] = uniqueIds([...(manifest[key] || []), ...(stage[key] || [])]);
      }
      manifest.comboRelationIds = uniqueIds([...(manifest.comboRelationIds || []), ...(stage.comboIds || [])]);
      notify('persisted', stage.productIds || []);
      return stage.cursor || true;
    }, true);
  }

  function stageOfflinePassports(payload, ids, savedReferences) {
    const rows = loaderRows(payload, ids);
    if (rows.length !== ids.length || rows.some((row, index) => !isEditorReadyPassport(row)
        || Number(row.product?.id) !== ids[index] || pendingMutationFields.get(ids[index])?.size)) {
      throw new Error('CATALOG_INCOMPLETE_PORTION');
    }
    const references = stableValue({ ...editorReferences, ...(savedReferences || {}), relatedProductUnitLinks: {
      ...editorReferences.relatedProductUnitLinks, ...(savedReferences?.relatedProductUnitLinks || {}),
    } });
    const staged = rows.map(raw => {
      const passport = stableValue(raw), id = Number(passport.product.id);
      const current = productsById.get(id);
      if (current && Object.prototype.hasOwnProperty.call(current, 'stock_qty')) {
        passport.product.stock_qty = current.stock_qty;
        passport.stock = { ...passport.stock, stock_qty: current.stock_qty, qty: current.stock_qty, is_unlimited: current.stock_qty == null };
        passport.availability = { ...passport.availability, stock_qty: current.stock_qty,
          is_available: current.stock_qty == null || Number(current.stock_qty) > 0 };
      }
      const normalized = normalizeEditorReferences(passport, references, false);
      const product = mergeRecord(current, normalizeProduct(passport.product, { completeness: 'editor-ready' }),
        { authoritativeFields: Object.keys(passport.product) });
      product.passportRevision = passport.revision?.revision || passport.revision?.updated_at || null;
      product.orderReadySnapshotKey = `passport:${id}`;
      return { id, product, passport: normalized };
    });
    return { productIds: ids, passportIds: ids, editorPassportIds: ids, recordCount: ids.length,
      entries: [...staged.flatMap(row => [[`product:${row.id}`, row.product], [`passport:${row.id}`, row.passport],
        [`passport-index:${row.id}`, { ...passportIndexRecord(row.id, row.passport), editorReady: true }]]),
        ['reference:editor', references], ['reference-index:editor', { schemaVersion: 'product-editor-v1' }]],
      publish() {
        editorReferences = references; editorReferencesLoaded = true; editorReferencesPersisted = true;
        staged.forEach(row => {
          const previous = productsById.get(row.id);
          productsById.set(row.id, row.product); passportsByProductId.set(row.id, row.passport);
          updateProductCategoryIndex(row.id, previous?.categoryIds, row.product.categoryIds);
          durableOrderReadyProductIds.add(row.id); durableEditorReadyProductIds.add(row.id);
        });
      } };
  }

  async function beginImmutablePassport(productId, idle) {
    if (!await init() || !Number.isSafeInteger(productId) || productId <= 0) throw new Error('IMMUTABLE_SCOPE_UNAVAILABLE');
    if (!offlineWritesAllowed) throw new Error('IMMUTABLE_WORKING_COORDINATION_UNAVAILABLE');
    const target = scope, generation = scopeGeneration;
    return catalogWrite(target, async () => {
      idle.assertCurrent(); assertScope(target, generation);
      if (dirtyProducts.has(productId) || dirtyPassports.has(productId) || removedProductIds.has(productId)
          || pendingMutationFields.get(productId)?.size) throw immutableWorkingConflict();
      const fence = window.localStorage.getItem(writeFenceKey(target));
      const expected = await target.compareTokens([`product:${productId}`, `passport:${productId}`,
        `passport-index:${productId}`, `meta:immutable-active:${productId}`, 'meta:immutable-budget', 'meta:manifest', 'meta:working-sequence']);
      const marker = await target.get('meta:working-sequence', { allowStale: true });
      const workingSequence = marker?.sequence ?? 0;
      if (!Number.isSafeInteger(workingSequence) || workingSequence < 0) throw new Error('CATALOG_WORKING_SEQUENCE_INVALID');
      idle.assertCurrent(); assertScope(target, generation);
      if (fence !== window.localStorage.getItem(writeFenceKey(target))) throw immutableWorkingConflict();
      if (expected.reduce((n, [, token]) => n + token.length, 0) > 512 * 1024) throw new Error('IMMUTABLE_BASELINE_LIMIT');
      return { productId, namespace: target.namespace, fence, expected, workingSequence };
    }, true);
  }

  function immutableWorkingConflict() {
    // Not a transient user abort: the durable baseline must be captured again.
    return Object.assign(new Error('IMMUTABLE_WORKING_CONFLICT'), { name: 'CatalogWorkingConflict' });
  }

  async function activateImmutablePassport(dto, root, validation, baseline, idle, probeOnly = false) {
    if (window.__ADMIN_CATALOG_EXPORT_POLICY__?.light?.activation !== true || !await init()) throw new Error('IMMUTABLE_ACTIVATION_DISABLED');
    const target = scope, generation = scopeGeneration, id = root?.productId;
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), x => x.toString(16).padStart(2, '0')).join('');
    // Recover an acknowledged-or-not commit without writing again. A changed
    // working passport does not match this receipt and is never overwritten here.
    const alreadyActive = await catalogWrite(target, async () => {
      idle.assertCurrent(); assertScope(target, generation);
      if (baseline?.namespace !== target.namespace || root?.storeId !== Number(target.storeId)
          || root?.tenantId !== window.AdminAccessContext?.local_context?.tenantId) return false;
      const saved = await target.getMany([`meta:immutable-active:${id}`, `passport:${id}`], { allowStale: true });
      const active = saved.get(`meta:immutable-active:${id}`), passport = saved.get(`passport:${id}`);
      if (!active || !passport || active.snapshotId !== root.snapshotId || active.sha256 !== root.sha256) return false;
      const matches = await digest(new TextEncoder().encode(JSON.stringify(passport))) === root.sha256;
      idle.assertCurrent(); assertScope(target, generation); return matches;
    }, true);
    if (alreadyActive) return true;
    if (probeOnly) return false;
    const guard = () => {
      idle.assertCurrent(); assertScope(target, generation);
      if (!offlineWritesAllowed || baseline?.namespace !== target.namespace || baseline.productId !== id
          || baseline.fence !== window.localStorage.getItem(writeFenceKey(target))
          || dirtyProducts.has(id) || dirtyPassports.has(id) || removedProductIds.has(id)
          || pendingMutationFields.get(id)?.size) throw immutableWorkingConflict();
      return true;
    };
    guard();
    // Older staging baselines did not reserve a durable working sequence.
    // Do not promote them using only a volatile/runtime equality check.
    if (!Number.isSafeInteger(baseline.workingSequence) || baseline.workingSequence < 0
        || !Array.isArray(baseline.expected)
        || baseline.expected.filter(([key]) => key === 'meta:working-sequence').length !== 1) throw new Error('IMMUTABLE_BASELINE_SEQUENCE_REQUIRED');
    if (!isEditorReadyPassport(dto) || dto.product.id !== id || Number(dto.product.tenant_id) !== root.tenantId
        || root.tenantId !== window.AdminAccessContext?.local_context?.tenantId
        || root.storeId !== Number(target.storeId) || root.builderVersion !== 'legacy-shared-v1'
        || root.sealed !== true || root.snapshotConsistent !== true
        || root.passportComplete !== true || root.epochs?.coverage < 1 || root.expiresAt <= Date.now()
        || validation?.snapshotId !== root.snapshotId || validation.sealed !== true || validation.fresh !== true
        || validation.activationAllowed !== true) throw new Error('IMMUTABLE_ACTIVATION_INVALID');
    const clock = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value)
      && BigInt(value) <= 18446744073709551615n;
    if (!clock(root.epochs?.catalog) || !clock(root.epochs?.store)
        || !Number.isSafeInteger(root.epochs.coverage) || root.epochs.coverage < 1
        || root.codec !== 'legacy-dto-json-v1' || root.projection !== 'full-product-passport-v1'
        || !Array.isArray(root.requiredFields) || Object.keys(dto).length !== 19 || root.requiredFields.length !== 19
        || new Set(root.requiredFields).size !== 19 || root.requiredFields.some(key => !Object.prototype.hasOwnProperty.call(dto, key))
        || !Array.isArray(root.chunks) || root.chunks.length !== Math.ceil(root.bytes / 24576)
        || root.chunks.some((chunk, i) => chunk.chunk !== i || chunk.part !== 'passport' || chunk.recordCount !== 1
          || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > 24576 || !/^[a-f0-9]{64}$/.test(chunk.sha256 || ''))
        || root.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) !== root.bytes) throw new Error('IMMUTABLE_ACTIVATION_MANIFEST');
    const bytes = new TextEncoder().encode(JSON.stringify(dto));
    if (bytes.length !== root.bytes || bytes.length > 256 * 1024 || await digest(bytes) !== root.sha256
        || await digest(new TextEncoder().encode(JSON.stringify(root))) !== validation.manifestHash) throw new Error('IMMUTABLE_ACTIVATION_HASH');
    return catalogWrite(target, async () => {
      guard();
      // Preserve EVERY JSON value, including data/blob-looking strings. The
      // working-cache sanitizer is not an exact immutable DTO codec.
      const passport = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const product = normalizeProduct(passport.product, { completeness: 'editor-ready' });
      product.orderReadySnapshotKey = `passport:${id}`;
      const saved = await target.getMany(['meta:immutable-budget', `meta:immutable-active:${id}`, 'meta:manifest'], { allowStale: true });
      guard();
      // The runtime manifest may predate a different tab's confirmed write.
      // Merge the durable manifest whose baseline is checked by the CAS below.
      const durableManifest = saved.get('meta:manifest') || emptyManifest();
      const nextManifest = { ...durableManifest, productIds: uniqueIds([...(durableManifest.productIds || []), id]),
        passportIds: uniqueIds([...(durableManifest.passportIds || []), id]),
        editorPassportIds: uniqueIds([...(durableManifest.editorPassportIds || []), id]) };
      const budget = saved.get('meta:immutable-budget') || { bytes: 0, records: 0 };
      const old = saved.get(`meta:immutable-active:${id}`);
      if (old && (!clock(old.epochs?.catalog) || !clock(old.epochs?.store)
          || BigInt(old.epochs.catalog) > BigInt(root.epochs.catalog) || BigInt(old.epochs.store) > BigInt(root.epochs.store)
          || (old.epochs.catalog === root.epochs.catalog && old.epochs.store === root.epochs.store
            && old.valuationAt > root.valuationAt))) throw new Error('IMMUTABLE_ACTIVATION_OLDER');
      const chargedBytes = bytes.length + new TextEncoder().encode(JSON.stringify(product)).length + 2048;
      const nextBudget = { bytes: budget.bytes - (old?.chargedBytes || 0) + chargedBytes,
        records: budget.records + (old ? 0 : 1) };
      if (!Number.isSafeInteger(nextBudget.bytes) || nextBudget.bytes < 0 || nextBudget.bytes > 8 * 1024 * 1024
          || !Number.isSafeInteger(nextBudget.records) || nextBudget.records > 1024) throw new Error('IMMUTABLE_STORAGE_LIMIT');
      try { await target.compareAndSetMany(baseline.expected, [[`product:${id}`, product], [`passport:${id}`, passport],
        [`passport-index:${id}`, passportIndexRecord(id, passport)], ['meta:manifest', nextManifest],
        ['meta:immutable-budget', nextBudget],
        [`meta:immutable-active:${id}`, { snapshotId: root.snapshotId, sha256: root.sha256, epochs: root.epochs,
          state: 'active', checkpoint: 'committed', valuationAt: root.valuationAt, chargedBytes }]],
      { signal: idle.signal, guard, ttlMs: RECORD_TTL_MS, noQuotaCleanup: true }); }
      catch (error) {
        if (error.message === 'LOCAL_CAS_MISMATCH') throw immutableWorkingConflict();
        throw error;
      }
      // A successful commit cannot be undone by a later cancellation.
      guard();
      const previous = productsById.get(id);
      productsById.set(id, product); passportsByProductId.set(id, passport); manifest = nextManifest;
      updateProductCategoryIndex(id, previous?.categoryIds, product.categoryIds);
      durableOrderReadyProductIds.add(id); durableEditorReadyProductIds.add(id);
      notify('persisted', [id]); return true; // Never added to dirty sets.
    }, true);
  }

  async function hydrateOfflineProducts(ids, options) {
    const permissions = window.AdminAccessContext?.permissions || [];
    if (window.__ADMIN_CATALOG_EXPORT_POLICY__?.light?.clientDownload === true && configuredRbacContext === 'products'
        && permissions.some(grant => grant === '*' || (grant?.key === 'products.cost.read' && ['all', 'stores'].includes(grant.access_rule)))) {
      return false; // One preparation pipeline; foreground ensureProducts is unaffected.
    }
    if (!await init() || !window.AdminIdleHydration?.supported) throw new Error('CATALOG_IDLE_UNAVAILABLE');
    const targetScope = scope, generation = scopeGeneration;
    const extraGeneration = offlineGeneration;
    const requestContext = configuredRbacContext;
    const requested = uniqueIds(ids).sort((a, b) => a - b);
    const size = Math.min(7, window.AdminIdleHydration.config.maxRecords);
    for (let offset = 0; offset < requested.length; offset += size) {
      assertScope(targetScope, generation);
      const batch = requested.slice(offset, offset + size);
      const key = 'passports:' + batch.join(',');
      const result = await window.AdminIdleHydration.enqueue('catalog:' + requestContext + ':' + key + ':' + (options.taskKey || options.targetRevision || ''), async context => {
        const missing = batch.filter(id => options.force === true || !durableEditorReadyProductIds.has(id));
        if (!missing.length) return true;
        return offlinePortion(context, targetScope, generation,
          () => context.requestJSON('/api/admin/catalog/product-passports', { method: 'POST',
            headers: { 'x-rbac-context': requestContext }, body: JSON.stringify({ ids: missing, offline_extra: true }),
            recordCount: payload => Object.keys(payload?.data || {}).length }),
          (payload, references) => stageOfflinePassports(payload, missing, references), { key, version: options.targetRevision });
      }, { guard: () => scopeIsCurrent(targetScope, generation) && extraGeneration === offlineGeneration
        && requestContext === configuredRbacContext && (!options.guard || options.guard()) });
      if (!result.ok) throw new Error('CATALOG_IDLE_PORTION_NOT_SAVED:' + result.reason);
    }
    return new Map(requested.map(id => [id, productsById.get(id) || null]));
  }

  function stageOfflineCombos(payload, cursor) {
    if (!Array.isArray(payload?.data) || !payload.page || typeof payload.page.has_more !== 'boolean') {
      throw new Error('CATALOG_INCOMPLETE_PORTION');
    }
    const combos = [], blocks = new Map(), relations = new Map();
    payload.data.forEach(bundle => {
      const combo = normalizeCombo(bundle.combo);
      if (!combo) throw new Error('CATALOG_INCOMPLETE_PORTION');
      combos.push(combo);
      (bundle.blocks || []).forEach(raw => {
        const block = normalizeComboBlock(raw);
        if (!block) throw new Error('CATALOG_INCOMPLETE_PORTION');
        blocks.set(block.id, block);
      });
      relations.set(combo.id, (bundle.relations || []).map((row, index) => ({ id: normalizeId(row.id),
        comboId: combo.id, blockId: normalizeId(row.block_id), sortOrder: Number(row.sort_order ?? index) || 0 })));
      if (relations.get(combo.id).some(row => !blocks.has(row.blockId))) throw new Error('CATALOG_INCOMPLETE_PORTION');
    });
    const next = Number(payload.page.next_cursor);
    if (!Number.isSafeInteger(next) || next < cursor || (payload.page.has_more && next <= cursor)) {
      throw new Error('CATALOG_CURSOR_STALLED');
    }
    return { comboIds: combos.map(row => row.id), comboBlockIds: [...blocks.keys()], recordCount: combos.length,
      cursor: { afterId: next, hasMore: payload.page.has_more, scannedAt: Date.now(), complete: false,
        productIds: uniqueIds([...blocks.values()].flatMap(block => block.products.map(row => row.productId))) },
      entries: [...combos.flatMap(row => [[`combo:${row.id}`, row], [`combo-relations:${row.id}`, relations.get(row.id)]]),
        ...[...blocks].map(([id, row]) => [`combo-block:${id}`, row])],
      publish() {
        combos.forEach(row => { combosById.set(row.id, row); comboRelationsById.set(row.id, relations.get(row.id)); });
        blocks.forEach((row, id) => comboBlocksById.set(id, row)); rebuildComboIndexes();
      } };
  }

  async function hydrateOfflineCombos(ids, options = {}, codes = []) {
    if (!await init() || !window.AdminIdleHydration?.supported) throw new Error('CATALOG_IDLE_UNAVAILABLE');
    const targetScope = scope, generation = scopeGeneration;
    const extraGeneration = offlineGeneration;
    const requestContext = configuredRbacContext;
    const requested = ids === null ? null : uniqueIds(ids).sort((a, b) => a - b);
    const jobs = requested === null ? [null] : requested;
    for (const id of jobs) {
      const key = 'combos:' + (id || codes.slice().sort().join(',') || 'all');
      const saved = offlineState(await targetScope.get('meta:offline:state', { allowStale: true }));
      assertScope(targetScope, generation);
      // Resume the last committed definition's dependencies before advancing its
      // scan cursor. Each passport still gets its own idle HTTP turn.
      await hydrateOfflineProducts(saved.scans[key]?.productIds || [], { ...options, force: false });
      let restart = options.force === true, more = true;
      while (more) {
        assertScope(targetScope, generation);
        const result = await window.AdminIdleHydration.enqueue('catalog:' + requestContext + ':' + key + ':' + (options.taskKey || ''), async context => {
          const state = offlineState(await targetScope.get('meta:offline:state', { allowStale: true }));
          context.assertCurrent();
          const prior = state.scans[key];
          if (!restart && prior?.hasMore === false) return prior;
          const after = restart ? 0 : Number(prior?.afterId || 0);
          const query = new URLSearchParams({ page: '1', limit: '1', after_id: String(after) });
          if (id) query.set('ids', String(id));
          if (codes.length) query.set('category_codes', codes.join(','));
          return offlinePortion(context, targetScope, generation,
            () => context.requestJSON('/api/admin/catalog/combos?' + query, { headers: { 'x-rbac-context': requestContext },
              recordCount: payload => payload?.data?.length ?? -1 }),
            payload => {
              if (id && (payload?.data?.length !== 1 || Number(payload.data[0].combo?.id) !== id)) {
                throw new Error('CATALOG_INCOMPLETE_PORTION');
              }
              return stageOfflineCombos(payload, after);
            }, { key, scan: true });
        }, { guard: () => scopeIsCurrent(targetScope, generation) && extraGeneration === offlineGeneration
          && requestContext === configuredRbacContext && (!options.guard || options.guard()) });
        if (!result.ok) throw new Error('CATALOG_IDLE_PORTION_NOT_SAVED:' + result.reason);
        await hydrateOfflineProducts(result.value?.productIds || [], { ...options, force: false });
        restart = false; more = result.value?.hasMore === true;
      }
    }
    return getAllCombos().filter(row => !requested || requested.includes(row.id));
  }

  async function discoverOfflineTarget(categoryIds = []) {
    if (!await init() || !window.AdminIdleHydration?.supported) throw new Error('CATALOG_IDLE_UNAVAILABLE');
    const categories = uniqueIds(categoryIds).sort((a, b) => a - b);
    const targetScope = scope, generation = scopeGeneration, key = 'targets:' + categories.join(',');
    const extraGeneration = offlineGeneration;
    const requestContext = configuredRbacContext;
    let more = true, observed = [];
    while (more) {
      const result = await window.AdminIdleHydration.enqueue('catalog:' + requestContext + ':' + key, async context => {
        const saved = offlineState(await targetScope.get('meta:offline:state', { allowStale: true }));
        context.assertCurrent(); assertScope(targetScope, generation);
        const prior = saved.scans[key];
        const after = prior?.hasMore === true ? Number(prior.afterId) : 0;
        return offlinePortion(context, targetScope, generation,
          () => context.requestJSON('/api/admin/catalog/product-targets', { method: 'POST',
            headers: { 'x-rbac-context': requestContext },
            body: JSON.stringify({ page: true, category_ids: categories, after_id: after, limit: context.config.maxRecords }),
            recordCount: payload => payload?.data?.product_ids?.length ?? -1 }),
          (payload, references, state) => {
            const data = payload?.data, ids = data?.product_ids;
            if (!Array.isArray(ids) || typeof data.has_more !== 'boolean'
                || Number(data.tenant_id) !== Number(window.AdminAccessContext?.local_context?.tenantId)
                || Number(data.store_id) !== Number(targetScope.storeId)
                || ids.some((id, index) => !Number.isSafeInteger(id) || id <= (index ? ids[index - 1] : after))
                || Number(data.next_cursor) !== (ids.at(-1) ?? after) || (data.has_more && !ids.length)) {
              throw new Error('CATALOG_INCOMPLETE_PORTION');
            }
            const base = after ? state.scans[key]?.ids || [] : [];
            return { entries: [], recordCount: ids.length, cursor: { ids: uniqueIds([...base, ...ids]),
              afterId: Number(data.next_cursor), hasMore: data.has_more, complete: false, snapshotConsistent: false }, publish() {} };
          }, { key, scan: true });
      }, { guard: () => scopeIsCurrent(targetScope, generation) && extraGeneration === offlineGeneration
        && requestContext === configuredRbacContext });
      if (!result.ok) throw new Error('CATALOG_IDLE_PORTION_NOT_SAVED:' + result.reason);
      observed = result.value.ids; more = result.value.hasMore;
    }
    return observed;
  }

  async function ensureProducts(ids, options = {}) {
    if (options.background === true) return hydrateOfflineProducts(ids, options);
    if (!await init()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const requested = uniqueIds(ids);
    const targetScope = scope;
    const generation = scopeGeneration;
    const requiredEditorReady = options.requiredCompleteness === "editor-ready";
    noteWorkingChange();
    const requiredOrderReady = requiredEditorReady || options.requiredCompleteness === "order-ready";
    const priority = options.priority === true
      || (options.priority !== false && options.background !== true && foregroundTokens.size > 0);
    const missingRuntime = requested.filter((id) => !productsById.has(id));
    if (missingRuntime.length && targetScope?.complete) await readPersistentProducts(missingRuntime, targetScope, generation);
    assertScope(targetScope, generation);
    if (requiredOrderReady && targetScope?.complete) {
      const missingPassports = requested.filter((id) => !passportsByProductId.has(id)
        && (manifest.passportIds || []).some((value) => Number(value) === id));
      if (missingPassports.length) await readPersistentPassports(missingPassports, targetScope, generation);
      assertScope(targetScope, generation);
      if (requiredEditorReady && !editorReferencesLoaded
        && uniqueIds(manifest.editorPassportIds).some((id) => requested.includes(id))) {
        await loadEditorReferences();
        assertScope(targetScope, generation);
      }
    }
    const missing = requested.filter((id) => {
      if (options.force === true) return true;
      if (!requiredOrderReady) return !productsById.has(id);
      if (options.awaitPersistence === true) {
        return !(requiredEditorReady ? durableEditorReadyProductIds.has(id) : durableOrderReadyProductIds.has(id));
      }
      const passport = passportsByProductId.get(id);
      return !(requiredEditorReady ? isEditorReadyPassport(passport) : isOrderReadyPassport(passport));
    });
    const canJoin = id => pendingByProductId.has(id) && !priority
      && (options.background === true || pendingByProductId.get(id).background !== true);
    const pendingIds = missing.filter(canJoin);
    const waits = pendingIds.map((id) => pendingByProductId.get(id).promise);
    const upgradeAfterWait = requiredOrderReady
      ? pendingIds.filter((id) => pendingByProductId.get(id).requiredCompleteness !== (requiredEditorReady ? "editor-ready" : "order-ready"))
      : [];
    const fresh = missing.filter(id => !canJoin(id));
    const loader = typeof options.loader === "function" ? options.loader : configuredLoader;
    if (fresh.length && typeof loader === "function") {
      const requestMutationVersions = new Map(fresh.map((id) => [id, mutationVersions.get(id) || 0]));
      const request = Promise.resolve().then(() => loader(fresh)).then(async (payload) => {
        if (scopeIsCurrent(targetScope, generation)) {
          if (requiredOrderReady) {
            const passportPayload = payload?.data && typeof payload.data === "object" ? payload.data : payload;
            const protectedPayload = {};
            loaderRows(passportPayload, fresh).forEach((rawPassport) => {
              const id = normalizeId(rawPassport?.product?.id ?? rawPassport?.product?.product_id);
              if (!id) return;
              let passport = rawPassport;
              if ((mutationVersions.get(id) || 0) !== (requestMutationVersions.get(id) || 0)) {
                const currentProduct = productsById.get(id);
                if (currentProduct) {
                  const protectedFields = {};
                  const requestVersion = requestMutationVersions.get(id) || 0;
                  (mutationFieldVersions.get(id) || new Map()).forEach((fieldVersion, key) => {
                    if (fieldVersion > requestVersion && Object.prototype.hasOwnProperty.call(currentProduct, key)) {
                      protectedFields[key] = currentProduct[key];
                    }
                  });
                  passport = { ...rawPassport, product: { ...(rawPassport.product || {}), ...protectedFields } };
                  if (Object.prototype.hasOwnProperty.call(protectedFields, "stock_qty")) {
                    const stockQty = currentProduct.stock_qty;
                    passport.stock = { ...(rawPassport.stock || {}), stock_qty: stockQty, qty: stockQty, is_unlimited: stockQty == null };
                    passport.availability = { ...(rawPassport.availability || {}), stock_qty: stockQty, is_available: stockQty == null || Number(stockQty) > 0 };
                  }
                }
              }
              protectedPayload[id] = passport;
            });
            upsertPassports(protectedPayload);
            if (options.awaitPersistence === true) {
              if (!await flushPersistence()) throw new Error('LOCAL_WRITE_NOT_SAVED');
            }
          } else {
            upsertProducts(loaderRows(payload, fresh), {
              completeness: options.completeness || "summary",
              authoritativeFields: options.authoritativeFields,
            });
          }
        }
      }).finally(() => {
        fresh.forEach((id) => {
          if (pendingByProductId.get(id)?.promise === request) pendingByProductId.delete(id);
        });
      });
      fresh.forEach((id) => pendingByProductId.set(id, {
        promise: request,
        background: options.background === true,
        requiredCompleteness: requiredEditorReady ? "editor-ready" : (requiredOrderReady ? "order-ready" : "summary"),
      }));
      waits.push(request);
    }
    if (waits.length) await Promise.all([...new Set(waits)]);
    assertScope(targetScope, generation);
    if (upgradeAfterWait.length) {
      await ensureProducts(upgradeAfterWait, { ...options, requiredCompleteness: requiredEditorReady ? "editor-ready" : "order-ready" });
      assertScope(targetScope, generation);
    }
    const result = new Map();
    requested.forEach((id) => result.set(id, productsById.get(id) || null));
    return result;
  }

  function getComboBlock(id) { return scopeIsCurrent(scope, scopeGeneration) ? comboBlocksById.get(normalizeId(id)) || null : null; }
  function getAllComboBlocks() { return scopeIsCurrent(scope, scopeGeneration) ? [...comboBlocksById.values()] : []; }
  function getAllCombos() { return scopeIsCurrent(scope, scopeGeneration) ? [...combosById.values()] : []; }
  function getAffectedComboIds(productIds) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    const affected = new Set();
    uniqueIds(productIds).forEach((productId) => {
      (comboIdsByProductId.get(productId) || []).forEach((comboId) => affected.add(comboId));
    });
    return [...affected];
  }

  function getAffectedComboIdsForBlocks(blockIds) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return [];
    const affected = new Set();
    uniqueIds(blockIds).forEach((blockId) => {
      (comboIdsByBlockId.get(blockId) || []).forEach((comboId) => affected.add(comboId));
    });
    return [...affected];
  }

  function comboComponentIds(comboId) {
    return uniqueIds((comboRelationsById.get(normalizeId(comboId)) || []).flatMap((relation) => (
      comboBlocksById.get(relation.blockId)?.products || []
    )).map((row) => row.productId));
  }

  function isComboReady(comboId, options = {}) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return false;
    const id = normalizeId(comboId);
    if (!id || !combosById.has(id) || !comboRelationsById.has(id)) return false;
    const relations = comboRelationsById.get(id) || [];
    if (relations.some((relation) => !comboBlocksById.has(relation.blockId))) return false;
    const requireEditor = options.requiredCompleteness === "editor-ready";
    return comboComponentIds(id).every((productId) => requireEditor
      ? durableEditorReadyProductIds.has(productId)
      : durableOrderReadyProductIds.has(productId));
  }

  function materializeComboProduct(productId) {
    const passport = getProductPassport(productId);
    const product = productsById.get(productId) || passport?.product;
    if (!product || !passport) return null;
    return {
      ...stableValue(product),
      product_id: productId,
      product_name: product.name ?? product.product_name ?? "",
      product_description_short: product.description_short ?? null,
      product_photo: product.photo ?? (Array.isArray(product.photos) ? product.photos[0] : null),
      price: Number(product.price || 0),
      stock_qty: passport.stock?.stock_qty == null ? null : Number(passport.stock.stock_qty),
      is_available: passport.availability?.is_available === true || Number(passport.availability?.is_available || 0) === 1,
      variants: Array.isArray(passport.variants) ? passport.variants : [],
      ingredients: Array.isArray(passport.ingredients) ? passport.ingredients : [],
      option_assignments: Array.isArray(passport.optionAssignments) ? passport.optionAssignments : [],
      options: Array.isArray(passport.options) ? passport.options : [],
    };
  }

  function getCombo(comboId) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return null;
    const id = normalizeId(comboId);
    const combo = combosById.get(id);
    if (!combo) return null;
    const relations = comboRelationsById.get(id) || [];
    const blocks = relations.map((relation) => {
      const block = comboBlocksById.get(relation.blockId);
      if (!block) return null;
      const products = block.products.map((item) => {
        const product = materializeComboProduct(item.productId);
        return product ? {
          ...product,
          sort_order: item.sortOrder,
          is_default: item.isDefault,
        } : null;
      }).filter(Boolean);
      return {
        block_id: block.id,
        block_title: block.title,
        sort_order: relation.sortOrder,
        min_select: block.minSelect,
        max_select: block.maxSelect,
        products,
      };
    }).filter(Boolean);
    return { ...combo, blocks };
  }

  function getComboForOrder(comboId) {
    const combo = getCombo(comboId);
    if (!combo) return null;
    const blocks = combo.blocks.map((block) => ({
      ...block,
      products: block.products.filter((product) => (
        Number(product.is_active ?? product.active ?? 1) === 1
        && Number(product.site_visibility ?? product.visible ?? 1) === 1
        && product.is_available === true
      )),
    }));
    const isAvailable = blocks.every((block) => block.products.length >= Math.max(1, Number(block.min_select || 1)));
    const basePrice = blocks.reduce((sum, block) => {
      const prices = block.products.map((product) => Number(product.price || 0)).filter(Number.isFinite);
      return sum + (prices.length ? Math.min(...prices) : 0);
    }, 0);
    const discountPercent = Math.max(0, Number(combo.discount_percent || 0));
    const minPrice = Math.round((basePrice * (1 - discountPercent / 100) + Number.EPSILON) * 100) / 100;
    const gridPhotos = blocks.slice(0, 4).map((block) => block.products[0]?.product_photo || null).filter(Boolean);
    return { ...combo, blocks, is_available: isAvailable ? 1 : 0, min_price: minPrice, grid_photos: gridPhotos };
  }

  async function removeCombo(comboId) {
    const targetScope = scope; const generation = scopeGeneration;
    assertScope(targetScope, generation);
    noteWorkingChange();
    const id = normalizeId(comboId);
    if (!id) return false;
    combosById.delete(id);
    comboRelationsById.delete(id);
    dirtyCombos.delete(id);
    dirtyComboRelations.delete(id);
    manifest.comboIds = uniqueIds(manifest.comboIds).filter((value) => value !== id);
    manifest.comboRelationIds = uniqueIds(manifest.comboRelationIds).filter((value) => value !== id);
    rebuildComboIndexes();
    notify("combos", [id]);
    if (!scope?.complete) return true;
    await targetScope.removeMany([`combo:${id}`, `combo-relations:${id}`]);
    assertScope(targetScope, generation);
    metadataDirty = true;
    schedulePersist();
    return true;
  }

  async function removeComboBlock(blockId) {
    const targetScope = scope; const generation = scopeGeneration;
    assertScope(targetScope, generation);
    noteWorkingChange();
    const id = normalizeId(blockId);
    if (!id) return false;
    const affectedComboIds = [...(comboIdsByBlockId.get(id) || [])];
    comboBlocksById.delete(id);
    comboRelationsById.forEach((relations, comboId) => {
      const next = relations.filter((relation) => relation.blockId !== id);
      if (next.length !== relations.length) {
        comboRelationsById.set(comboId, next);
        dirtyComboRelations.add(comboId);
      }
    });
    manifest.comboBlockIds = uniqueIds(manifest.comboBlockIds).filter((value) => value !== id);
    rebuildComboIndexes();
    notify("combo-blocks", [id]);
    if (affectedComboIds.length) notify("combos", affectedComboIds);
    if (targetScope?.complete) await targetScope.remove(`combo-block:${id}`).catch(() => null);
    assertScope(targetScope, generation);
    metadataDirty = true;
    schedulePersist();
    return true;
  }

  async function ensureCombos(ids, options = {}) {
    if (options.background === true) return hydrateOfflineCombos(ids, options);
    if (!await init()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const requested = uniqueIds(ids);
    const requiredCompleteness = options.requiredCompleteness === "editor-ready" ? "editor-ready" : "order-ready";
    const targetScope = scope;
    const generation = scopeGeneration;
    if (options.force !== true && targetScope?.complete) {
      const localIds = requested.filter((id) => !combosById.has(id) || !comboRelationsById.has(id));
      if (localIds.length) {
        const records = await loadPersistentRecords(localIds.flatMap((id) => [
          `combo:${id}`, `combo-relations:${id}`,
        ]), targetScope, generation);
        if (scopeIsCurrent(targetScope, generation)) {
          localIds.forEach((id) => {
            const combo = records.get(`combo:${id}`);
            const relations = records.get(`combo-relations:${id}`);
            if (normalizeId(combo?.id) === id) combosById.set(id, combo);
            if (Array.isArray(relations)) comboRelationsById.set(id, relations);
          });
          const blockIds = uniqueIds(localIds.flatMap((id) => (
            comboRelationsById.get(id) || []
          ).map((relation) => relation.blockId)));
          const missingBlockIds = blockIds.filter((id) => !comboBlocksById.has(id));
          if (missingBlockIds.length) {
            const blocks = await loadPersistentRecords(
              missingBlockIds.map((id) => `combo-block:${id}`), targetScope, generation
            );
            if (scopeIsCurrent(targetScope, generation)) missingBlockIds.forEach((id) => {
              const block = blocks.get(`combo-block:${id}`);
              if (normalizeId(block?.id) === id) comboBlocksById.set(id, block);
            });
          }
          rebuildComboIndexes();
        }
      }
    }
    assertScope(targetScope, generation);
    const missing = requested.filter((id) => options.force === true || !combosById.has(id) || !comboRelationsById.has(id));
    const waits = missing.filter((id) => pendingByComboId.has(id)).map((id) => pendingByComboId.get(id));
    const fresh = missing.filter((id) => !pendingByComboId.has(id));
    if (fresh.length && typeof configuredRequest === "function") {
      const targetScope = scope;
      const generation = scopeGeneration;
      const request = configuredRequest(`/api/admin/catalog/combos?ids=${fresh.join(",")}`)
        .then((response) => {
          if (scopeIsCurrent(targetScope, generation)) upsertComboBundles(response?.data || []);
        }).finally(() => fresh.forEach((id) => {
          if (pendingByComboId.get(id) === request) pendingByComboId.delete(id);
        }));
      fresh.forEach((id) => pendingByComboId.set(id, request));
      waits.push(request);
    }
    if (waits.length) await Promise.all([...new Set(waits)]);
    assertScope(targetScope, generation);
    const componentIds = uniqueIds(requested.flatMap(comboComponentIds));
    if (options.requiredCompleteness !== "definition" && componentIds.length) {
      for (let offset = 0; offset < componentIds.length; offset += 25) await ensureProducts(componentIds.slice(offset, offset + 25), {
        requiredCompleteness,
        awaitPersistence: options.awaitPersistence === true,
        background: options.background === true,
      });
      assertScope(targetScope, generation);
    }
    if (options.awaitPersistence === true) await flushPersistence();
    assertScope(targetScope, generation);
    return new Map(requested.map((id) => [id, getCombo(id)]));
  }

  async function loadSavedComboBlocks() {
    if (!await init()) return [];
    const targetScope = scope, generation = scopeGeneration;
    const ids = uniqueIds(manifest.comboBlockIds);
    const rows = await loadPersistentRecords(ids.map(id => `combo-block:${id}`), targetScope, generation);
    assertScope(targetScope, generation);
    ids.forEach(id => { const row = rows.get(`combo-block:${id}`); if (Number(row?.id) === id) comboBlocksById.set(id, row); });
    rebuildComboIndexes();
    return getAllComboBlocks();
  }

  async function ensureComboBlocks(ids, options = {}) {
    if (options.background === true) throw new Error('CATALOG_OFFLINE_BLOCKS_REQUIRE_COMBO_PORTION');
    if (!await init()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const requested = uniqueIds(ids);
    const targetScope = scope;
    const generation = scopeGeneration;
    const localIds = options.force === true ? [] : requested.filter((id) => !comboBlocksById.has(id));
    if (localIds.length && targetScope?.complete) {
      const records = await loadPersistentRecords(localIds.map((id) => `combo-block:${id}`), targetScope, generation);
      if (scopeIsCurrent(targetScope, generation)) localIds.forEach((id) => {
        const block = records.get(`combo-block:${id}`);
        if (normalizeId(block?.id) === id) comboBlocksById.set(id, block);
      });
    }
    assertScope(targetScope, generation);
    const missing = requested.filter((id) => options.force === true || !comboBlocksById.has(id));
    if (!missing.length || typeof configuredRequest !== "function") {
      return new Map(requested.map((id) => [id, getComboBlock(id)]));
    }
    const response = await configuredRequest(`/api/admin/catalog/combos?block_ids=${missing.join(",")}&definitions_only=blocks`);
    assertScope(targetScope, generation);
    (Array.isArray(response?.blocks) ? response.blocks : []).forEach((block) => upsertComboBlock(block, { notify: false }));
    upsertComboBundles(Array.isArray(response?.data) ? response.data : []);
    if (options.awaitPersistence === true) await flushPersistence();
    assertScope(targetScope, generation);
    notify("combo-blocks", requested);
    return new Map(requested.map((id) => [id, getComboBlock(id)]));
  }

  async function ensureAllCombos(options = {}) {
    if (options.background === true) return hydrateOfflineCombos(null, options);
    if (!await init()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const targetScope = scope; const generation = scopeGeneration;
    if (!getAllCombos().length && options.force !== true && uniqueIds(manifest.comboIds).length) {
      await ensureCombos(manifest.comboIds, options);
      assertScope(targetScope, generation);
    }
    if (getAllCombos().length && options.force !== true) {
      await ensureCombos(getAllCombos().map((row) => row.id), options);
      assertScope(targetScope, generation);
      return getAllCombos();
    }
    if (typeof configuredRequest !== "function") return [];
    const response = await configuredRequest("/api/admin/catalog/combos");
    assertScope(targetScope, generation);
    const bundles = Array.isArray(response?.data) ? response.data : [];
    if (options.force === true) {
      const nextComboIds = new Set(uniqueIds(bundles.map((row) => row?.combo?.id ?? row?.id)));
      const nextBlockIds = new Set(uniqueIds((response?.blocks || []).map((row) => row?.id)));
      for (const id of [...combosById.keys()]) if (!nextComboIds.has(id)) { assertScope(targetScope, generation); await removeCombo(id); }
      assertScope(targetScope, generation);
      for (const id of [...comboBlocksById.keys()]) if (!nextBlockIds.has(id)) { assertScope(targetScope, generation); await removeComboBlock(id); }
      assertScope(targetScope, generation);
    }
    (Array.isArray(response?.blocks) ? response.blocks : []).forEach((block) => upsertComboBlock(block, { notify: false }));
    upsertComboBundles(bundles);
    await ensureCombos(bundles.map((row) => row?.combo?.id ?? row?.id), options);
    assertScope(targetScope, generation);
    return getAllCombos();
  }

  async function ensureCombosForCategoryCodes(values, options = {}) {
    if (options.background === true) return hydrateOfflineCombos(null, options,
      [...new Set((values || []).map(String).filter(Boolean))]);
    if (!await init()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
    const targetScope = scope; const generation = scopeGeneration;
    const codes = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
    if (!codes.length || typeof configuredRequest !== "function") return [];
    const localIds = getAllCombos().filter((combo) => codes.includes(String(combo.category_code || "").trim())).map((combo) => combo.id);
    if (localIds.length && options.force !== true) {
      await ensureCombos(localIds, options);
      assertScope(targetScope, generation);
      return localIds.map((id) => getCombo(id)).filter(Boolean);
    }
    const response = await configuredRequest(`/api/admin/catalog/combos?category_codes=${encodeURIComponent(codes.join(","))}`);
    assertScope(targetScope, generation);
    const bundles = Array.isArray(response?.data) ? response.data : [];
    upsertComboBundles(bundles);
    const ids = bundles.map((row) => row?.combo?.id ?? row?.id);
    await ensureCombos(ids, options);
    assertScope(targetScope, generation);
    return ids.map((id) => getCombo(id)).filter(Boolean);
  }

  function revision(value) { return /^\d+$/.test(String(value || "")) ? String(value) : "0"; }
  function revisionGreater(left, right) {
    try { return BigInt(revision(left)) > BigInt(revision(right)); } catch (_) { return false; }
  }
  function getSyncState() {
    if (!scopeIsCurrent(scope, scopeGeneration)) return { state: 'idle', runtimeRevision: '0', durableRevision: '0', lastReconciledAt: 0 };
    return {
      state: syncState,
      runtimeRevision: workingCursor,
      durableRevision: revision(manifest.durableRevision),
      lastReconciledAt: workingReconciledAt,
      workingSetOnly: true, offlineComplete: false,
    };
  }
  function setSyncState(value) { syncState = value; notify("sync", []); }
  async function saveWorkingCursor(value, targetScope = scope, generation = scopeGeneration) {
    assertScope(targetScope, generation);
    workingCursor = revision(value);
    workingReconciledAt = Date.now();
    return true;
  }
  async function reconcilePass(targetScope, generation) {
    if (!targetScope?.complete || typeof configuredRequest !== "function" || !navigator.onLine) {
      setSyncState("offline"); return false;
    }
    setSyncState("syncing");
    const live = workingSet();
    const liveProducts = new Set(live.productIds), liveCombos = new Set(live.comboIds), liveBlocks = new Set(live.blockIds);
    const remote = await configuredRequest(`/api/admin/catalog/manifest?store_id=${Number(targetScope.storeId)}`);
    assertScope(targetScope, generation);
    const serverRevision = revision(remote?.data?.revision);
    if (revisionGreater(serverRevision, reconcileTargetRevision)) reconcileTargetRevision = serverRevision;
    if (!revisionGreater(serverRevision, workingCursor)) {
      await saveWorkingCursor(workingCursor, targetScope, generation);
      setSyncState("online"); return true;
    }
    // A new document refreshes its working set rather than replaying the entire
    // historical log. This is NOT a snapshot proof for the offline catalogue.
    let recovery = workingCursor === '0';
    let cursor = recovery ? serverRevision : workingCursor, hasMore = !recovery;
    const changes = new Map();
    for (let page = 0; hasMore && page < 3; page++) {
      const response = await configuredRequest(`/api/admin/catalog/changes?store_id=${Number(targetScope.storeId)}&since=${cursor}&limit=100`);
      assertScope(targetScope, generation);
      const data = response?.data || {};
      if (data.reset_required === true) { recovery = true; cursor = serverRevision; break; }
      for (const change of data.changes || []) changes.set(`${change.entity_type}:${change.entity_id ?? "all"}`, change);
      const next = revision(data.next_revision);
      if (next === cursor && data.has_more) throw new Error("CATALOG_RECOVERY_CURSOR_STALLED");
      cursor = next; hasMore = data.has_more === true;
    }
    if (!recovery && !changes.size && !hasMore && cursor === workingCursor) {
      throw new Error('CATALOG_WORKING_CURSOR_STALLED');
    }
    let metadata = recovery, references = recovery;
    const refresh = new Set(recovery ? live.productIds : []), extra = new Set();
    const combos = new Set(recovery ? live.comboIds : []), blocks = new Set(recovery ? live.blockIds : []);
    const extraCombos = new Set(), inventory = new Set();
    if (recovery) for (const id of manifest.passportIds || []) if (!liveProducts.has(Number(id))) extra.add(Number(id));
    for (const change of changes.values()) {
      const id = Number(change.entity_id || 0);
      if (change.entity_type === 'category') metadata = true;
      if (change.entity_type === 'reference') references = true;
      if (change.entity_type === 'inventory' || change.operation === 'stock') {
        if (liveProducts.has(id)) inventory.add(id);
      }
      if (change.entity_type === 'product') {
        if (change.operation === 'delete' && id > 0) { await removeProduct(id); continue; }
        if (change.operation !== 'stock') metadata = true;
        if (liveProducts.has(id)) refresh.add(id);
        else if (durableOrderReadyProductIds.has(id)) extra.add(id);
      }
      if (change.entity_type === 'combo') {
        if (change.operation === 'delete' && id > 0) { await removeCombo(id); continue; }
        if (liveCombos.has(id)) combos.add(id);
        else if (combosById.has(id)) extraCombos.add(id);
        if (!(id > 0)) { live.comboIds.forEach(value => combos.add(value)); metadata = true; }
      }
      if (change.entity_type === 'combo-block') {
        if (change.operation === 'delete' && id > 0) { await removeComboBlock(id); continue; }
        if (liveBlocks.has(id)) blocks.add(id);
        for (const comboId of getAffectedComboIdsForBlocks([id])) {
          if (liveCombos.has(comboId)) combos.add(comboId); else extraCombos.add(comboId);
        }
      }
    }
    assertScope(targetScope, generation);
    if (references) live.productIds.forEach(id => refresh.add(id));
    // Only the explicit working set can issue immediate passport/combination reads.
    const currentProducts = new Set(workingSet().productIds);
    const ids = [...refresh].filter(id => currentProducts.has(id) && !removedProductIds.has(id));
    for (let offset = 0; offset < ids.length; offset += 25) {
      await ensureProducts(ids.slice(offset, offset + 25), { requiredCompleteness: configuredRbacContext === 'products'
        ? 'editor-ready' : 'order-ready', force: true, awaitPersistence: true });
      assertScope(targetScope, generation);
    }
    const current = workingSet();
    const blockIds = [...blocks].filter(id => current.blockIds.includes(id));
    const comboIds = [...combos].filter(id => current.comboIds.includes(id));
    for (let offset = 0; offset < blockIds.length; offset += 25) {
      await ensureComboBlocks(blockIds.slice(offset, offset + 25), { force: true, awaitPersistence: true });
    }
    for (let offset = 0; offset < comboIds.length; offset += 25) {
      await ensureCombos(comboIds.slice(offset, offset + 25), { force: true, awaitPersistence: true });
    }
    assertScope(targetScope, generation);
    if ((metadata || references) && typeof configuredMetadataLoader === 'function') {
      await configuredMetadataLoader({ categories: metadata, targets: metadata, workingSet: true });
    }
    assertScope(targetScope, generation);
    await flushPersistence();
    await saveWorkingCursor(cursor, targetScope, generation);
    // These are independent tasks. Realtime never awaits offline hydration.
    if (extra.size) void ensureProducts([...extra], { background: true, force: true, targetRevision: cursor })
      .catch(error => console.warn('CATALOG_IDLE_BUFFER_PAUSED:', error.message));
    if (extraCombos.size) void ensureCombos([...extraCombos], { background: true, force: true })
      .catch(error => console.warn('CATALOG_IDLE_BUFFER_PAUSED:', error.message));
    if (inventory.size || recovery) notify("inventory", [...inventory]);
    setSyncState("online"); return true;
  }
  async function reconcile(options = {}) {
    const access = window.AdminLocalRepository.capture();
    if (!await init() || !access.isCurrent()) return false;
    const target = revision(options.targetRevision);
    if (revisionGreater(target, reconcileTargetRevision)) reconcileTargetRevision = target;
    if (reconcilePromise) {
      if (revisionGreater(reconcileTargetRevision, workingCursor)) reconcileAgain = true;
      return reconcilePromise;
    }
    const targetScope = scope; const generation = scopeGeneration;
    let successfulPass = false;
    const task = (async () => {
      let result = false;
      let continuations = 0;
      do {
        reconcileAgain = false;
        result = await reconcilePass(targetScope, generation);
        successfulPass = result === true;
        if (!result || !scopeIsCurrent(targetScope, generation)) return result;
        continuations += 1;
      } while ((reconcileAgain || revisionGreater(reconcileTargetRevision, workingCursor)) && continuations < 3);
      if (!revisionGreater(reconcileTargetRevision, workingCursor)) {
        reconcileTargetRevision = workingCursor;
      }
      return result;
    })().catch((error) => {
      successfulPass = false;
      if (scopeIsCurrent(targetScope, generation)) {
        console.error('CATALOG_RECONCILE_FAILED:', error);
        setSyncState(navigator.onLine ? "stale" : "offline");
      }
      return false;
    })
      .finally(() => {
        if (reconcilePromise !== task) return;
        reconcilePromise = null;
        reconcileAgain = false;
        scheduleDownloadTurn();
        if (successfulPass && scopeIsCurrent(targetScope, generation) && revisionGreater(reconcileTargetRevision, workingCursor)) {
          void requestReconcile({ reason: 'working-continuation' });
        }
      });
    reconcilePromise = task;
    return reconcilePromise;
  }
  function requestReconcile(options = {}) {
    if (!scopeIsCurrent(scope, scopeGeneration)) return Promise.resolve(false);
    const target = revision(options.targetRevision);
    if (revisionGreater(target, reconcileTargetRevision)) reconcileTargetRevision = target;
    const hasKnownChange = revisionGreater(reconcileTargetRevision, workingCursor);
    const force = options.force === true;
    if (!force && !hasKnownChange && Date.now() - workingReconciledAt < RECONCILE_FRESHNESS_MS) {
      return reconcilePromise || Promise.resolve(true);
    }
    if (reconcilePromise) {
      if (hasKnownChange) reconcileAgain = true;
      return reconcilePromise;
    }
    syncTimerForce = syncTimerForce || force;
    if (!syncTimer) {
      const targetScope = scope; const generation = scopeGeneration;
      syncTimer = window.setTimeout(() => {
        if (!scopeIsCurrent(targetScope, generation)) return;
        syncTimer = null;
        const runForce = syncTimerForce;
        syncTimerForce = false;
        void reconcile({ force: runForce, targetRevision: reconcileTargetRevision });
      }, 80);
    }
    return Promise.resolve(true);
  }
  function scheduleReconnect(generation) {
    if (syncReconnectTimer || generation !== scopeGeneration || !navigator.onLine) return;
    const delay = Math.min(SSE_RECONNECT_MAX_MS, SSE_RECONNECT_BASE_MS * (2 ** syncReconnectAttempts));
    syncReconnectAttempts += 1;
    syncReconnectTimer = window.setTimeout(() => {
      if (generation !== scopeGeneration) return;
      syncReconnectTimer = null;
      void startSync();
    }, delay);
  }
  function stopSync() {
    if (syncSource) syncSource.abort();
    syncSource = null;
    syncSubscription?.close();
    syncSubscription = null;
    if (syncReconnectTimer) window.clearTimeout(syncReconnectTimer);
    syncReconnectTimer = null;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = null;
    syncTimerForce = false;
  }
  async function startSync() {
    const access = window.AdminLocalRepository.capture();
    if (!await init() || !access.isCurrent()) return false;
    if (!scope?.complete || typeof configuredRequest !== "function") return false;
    if (!navigator.onLine || typeof window.fetch !== "function" || typeof window.AbortController !== "function") { setSyncState(navigator.onLine ? "stale" : "offline"); return false; }
    if (syncSource) return true;
    if (syncReconnectTimer) window.clearTimeout(syncReconnectTimer);
    syncReconnectTimer = null;
    setSyncState("syncing");
    const generation = scopeGeneration;
    const targetScope = scope;
    const source = new AbortController();
    syncSource = source;
    const token = String(window.localStorage?.getItem('authToken') || '').trim();
    const rbacContext = configuredRbacContext;
    const isCurrent = () => source === syncSource && !source.signal.aborted
      && scopeIsCurrent(targetScope, generation) && configuredRbacContext === rbacContext
      && String(window.localStorage?.getItem('authToken') || '').trim() === token;
    const onRevision = (value, eventName) => {
      if (!isCurrent()) return;
      try {
        const eventRevision = revision(value);
        syncReconnectAttempts = 0;
        if (revisionGreater(eventRevision, workingCursor)) {
          void requestReconcile({ reason: "sse", targetRevision: eventRevision });
        } else if (eventName === "snapshot") {
          void saveWorkingCursor(workingCursor, targetScope, generation).then((saved) => {
            if (saved && scopeIsCurrent(targetScope, generation)) setSyncState("online");
          }).catch(error => {
            if (scopeIsCurrent(targetScope, generation)) console.error('CATALOG_CHECKPOINT_FAILED:', error);
          });
        } else {
          setSyncState("online");
        }
      } catch (_) { void requestReconcile({ reason: "sse-invalid", force: true }); }
    };
    const connect = async (signal, emit) => {
      let shouldReconnect = true;
      let reader;
      try {
        if (!isCurrent() || signal.aborted) return { reconnect: false };
        const response = await fetch(`/api/admin/catalog/stream?store_id=${Number(targetScope.storeId)}`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            'x-rbac-context': rbacContext,
            'x-store-id': String(targetScope.storeId),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!isCurrent() || signal.aborted) { await response.body?.cancel(); return { reconnect: false }; }
        if (!response.ok || !response.body) {
          shouldReconnect = response.status !== 401 && response.status !== 403;
          // Middleware may return a JSON refusal before the stream starts. An empty
          // or non-JSON 403 is not evidence that the entire local session was revoked.
          const payload = response.status === 403 ? await response.json().catch(() => null) : null;
          if (!isCurrent() || signal.aborted) return { reconnect: false };
          checkAccessResponse(response.status, payload);
          throw new Error(`CATALOG_STREAM_HTTP_${response.status}`);
        }
        if (!isCurrent() || signal.aborted) return { reconnect: false };
        syncReconnectAttempts = 0;
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (isCurrent() && !signal.aborted) {
          const chunk = await reader.read();
          if (!isCurrent() || signal.aborted) { await reader.cancel(); return { reconnect: false }; }
          buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const eventName = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
            if ((eventName === "snapshot" || eventName === "change") && data) {
              try { emit(revision(JSON.parse(data).revision), eventName); }
              catch (_) { void requestReconcile({ reason: 'sse-invalid', force: true }); }
            }
            boundary = buffer.indexOf("\n\n");
          }
          if (chunk.done) break;
        }
      } catch (error) {
        if (error?.name === "AbortError") return { reconnect: false };
      } finally {
        if (signal.aborted || !isCurrent()) await reader?.cancel().catch(() => {});
      }
      return { reconnect: shouldReconnect };
    };
    const ended = result => {
      if (!isCurrent()) return;
      syncSource = null;
      syncSubscription = null;
      setSyncState(navigator.onLine ? "stale" : "offline");
      if (result?.reconnect) scheduleReconnect(generation);
    };
    void (async () => {
      let key = null;
      try {
        // Opaque group key includes every repository access dimension plus the
        // exact JWT context and API permission context. No identity/token goes on BC.
        const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(
          JSON.stringify([targetScope.namespace, rbacContext, token])));
        key = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      } catch (_) { /* Missing crypto/coordination retains the original direct SSE. */ }
      if (!isCurrent()) return;
      if (window.AdminCatalogStream) {
        syncSubscription = window.AdminCatalogStream.open({ key, signal: source.signal, isCurrent,
          connect, onHint: onRevision, onEnd: ended });
      } else {
        void connect(source.signal, onRevision).then(ended);
      }
    })();
    if (!syncLifecycleBound) {
      syncLifecycleBound = true;
      window.addEventListener("online", () => {
        void startSync();
        void requestReconcile({ reason: "online", force: true });
      });
      window.addEventListener("offline", () => { stopSync(); setSyncState("offline"); });
      document.addEventListener('freeze', stopSync);
      document.addEventListener('resume', () => {
        void startSync();
        void requestReconcile({ reason: 'resume' });
      });
      window.addEventListener("focus", () => { void requestReconcile({ reason: "focus" }); });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void requestReconcile({ reason: "visibility" });
      });
      window.addEventListener("pageshow", () => {
        void startSync();
        void requestReconcile({ reason: "pageshow" });
      });
      window.addEventListener("pagehide", () => {
        void flushPersistence();
        stopSync();
      });
    }
    return true;
  }

  async function verifyManifestPassports(targetScope, generation, declaredPassportIds, declaredEditorPassportIds) {
    const editorIds = uniqueIds(declaredEditorPassportIds);
    const orderIds = uniqueIds([...(Array.isArray(declaredPassportIds) ? declaredPassportIds : []), ...editorIds]);
    if (editorIds.length) {
      const records = await loadPersistentRecords(["reference:editor"], targetScope, generation).catch(() => new Map());
      if (!scopeIsCurrent(targetScope, generation)) return;
      const saved = records.get("reference:editor");
      if (saved && typeof saved === "object") {
        editorReferences = { ...editorReferences, ...saved };
        editorReferencesLoaded = true;
        editorReferencesPersisted = true;
        await targetScope.set("reference-index:editor", { schemaVersion: "product-editor-v1" }, { ttlMs: RECORD_TTL_MS }).catch(() => false);
      }
    }
    for (let index = 0; index < orderIds.length; index += PRELOAD_BATCH_SIZE) {
      if (!scopeIsCurrent(targetScope, generation)) return;
      if (!(await waitForDownloadTurn())) return;
      if (!scopeIsCurrent(targetScope, generation)) return;
      await readPersistentPassports(orderIds.slice(index, index + PRELOAD_BATCH_SIZE), targetScope, generation);
      if (index + PRELOAD_BATCH_SIZE < orderIds.length) await yieldMainThread();
    }
    if (!scopeIsCurrent(targetScope, generation)) return;
    const declaredOrderSet = new Set(orderIds);
    const declaredEditorSet = new Set(editorIds);
    const nextPassportIds = uniqueIds(manifest.passportIds).filter((id) => (
      !declaredOrderSet.has(id) || durableOrderReadyProductIds.has(id)
    ));
    const nextEditorPassportIds = uniqueIds(manifest.editorPassportIds).filter((id) => (
      !declaredEditorSet.has(id) || durableEditorReadyProductIds.has(id)
    ));
    if (nextPassportIds.length !== uniqueIds(manifest.passportIds).length
      || nextEditorPassportIds.length !== uniqueIds(manifest.editorPassportIds).length) {
      manifest.passportIds = nextPassportIds;
      manifest.editorPassportIds = nextEditorPassportIds;
      metadataDirty = true;
      schedulePersist();
    }
    notify("coverage", orderIds);
  }

  async function hydrateDurablePassportIndex(targetScope, generation) {
    const declaredOrderIds = uniqueIds(manifest.passportIds);
    const declaredEditorIds = uniqueIds(manifest.editorPassportIds);
    const candidateIds = uniqueIds([...declaredOrderIds, ...declaredEditorIds]);
    if (!candidateIds.length) return;
    const keys = ["reference-index:editor", ...candidateIds.map((id) => `passport-index:${id}`)];
    const records = await loadPersistentRecords(keys, targetScope, generation).catch(() => new Map());
    if (!scopeIsCurrent(targetScope, generation)) return;
    const editorReferencesIndexed = records.get("reference-index:editor")?.schemaVersion === "product-editor-v1";
    const missingIndexIds = [];
    candidateIds.forEach((id) => {
      const row = records.get(`passport-index:${id}`);
      if (!isValidPassportIndex(row, id)) {
        missingIndexIds.push(id);
        return;
      }
      durableOrderReadyProductIds.add(id);
      if (row.editorReady === true && editorReferencesIndexed) durableEditorReadyProductIds.add(id);
    });
    notify("coverage", candidateIds);
    if (missingIndexIds.length) {
      const missingEditorIds = missingIndexIds.filter((id) => declaredEditorIds.includes(id));
      void verifyManifestPassports(targetScope, generation, missingIndexIds, missingEditorIds).catch(() => {
        if (scopeIsCurrent(targetScope, generation)) notify("coverage", missingIndexIds);
      });
    }
  }

  async function hydrate(targetScope, generation) {
    const metadata = await targetScope.getMany(["meta:manifest", "meta:download-job", "meta:offline:state"]).catch(() => new Map());
    if (!scopeIsCurrent(targetScope, generation)) return;
    let saved = metadata.get("meta:manifest");
    manifest = saved && typeof saved === "object" ? { ...emptyManifest(), ...saved } : emptyManifest();
    const extra = offlineState(metadata.get('meta:offline:state'));
    for (const key of ['productIds', 'passportIds', 'editorPassportIds', 'comboIds', 'comboBlockIds']) {
      manifest[key] = uniqueIds([...(manifest[key] || []), ...(extra[key] || [])]);
    }
    manifest.comboRelationIds = uniqueIds([...(manifest.comboRelationIds || []), ...(extra.comboIds || [])]);
    const savedDownloadJob = metadata.get("meta:download-job");
    downloadJob = savedDownloadJob && typeof savedDownloadJob === "object" ? savedDownloadJob : null;
    coverageTotals = manifest.coverageTotals && typeof manifest.coverageTotals === "object"
      ? { ...manifest.coverageTotals } : {};
    coverageTargets = manifest.coverageTargets && typeof manifest.coverageTargets === "object"
      ? { ...manifest.coverageTargets } : {};
    coverageTargetMetadata = manifest.coverageTargetMetadata && typeof manifest.coverageTargetMetadata === "object"
      ? { ...manifest.coverageTargetMetadata } : {};
    if (scopeIsCurrent(targetScope, generation)) notify("hydrated", []);
    void hydrateDurablePassportIndex(targetScope, generation).catch(() => {
      if (scopeIsCurrent(targetScope, generation)) notify("coverage", []);
    });
  }

  async function init(options = {}) {
    const core = window.AdminLocalRepository;
    const access = core?.isActive() ? core.capture() : null;
    if (!core || !await core.ready() || (access && !access.isCurrent())) return false;
    if (typeof options.loader === "function") configuredLoader = options.loader;
    if (typeof options.request === "function") configuredRequest = options.request;
    if (typeof options.metadataLoader === "function") configuredMetadataLoader = options.metadataLoader;
    if (typeof options.workingSet === 'function') configuredWorkingSet = options.workingSet;
    if (typeof options.guard === 'function') configuredGuard = options.guard;
    if (configuredGuard && !configuredGuard()) return false;
    if ((options.rbacContext === 'products' || options.rbacContext === 'new-order')
        && configuredRbacContext !== options.rbacContext) {
      stopSync();
      configuredRbacContext = options.rbacContext;
    }
    if (typeof configuredRequest !== "function") configuredRequest = catalogRequest;
    const nextScope = currentScope();
    if (!nextScope?.complete) return Promise.resolve(false);
    if (scope?.namespace === nextScope.namespace && scope.isCurrent() && initPromise) return initPromise;
    clearRuntime();
    scope = nextScope;
    const generation = scopeGeneration;
    initPromise = hydrate(nextScope, generation).then(() => {
      const current = scopeIsCurrent(nextScope, generation);
      if (current && downloadJob && downloadJob.state !== "complete" && navigator.onLine) {
        void resumeDownloadJob();
      }
      return current;
    });
    return initPromise;
  }

  function clearRuntime() {
    stopSync();
    cancelDownloadSchedule(false);
    downloadJobGeneration += 1;
    scopeGeneration += 1;
    productsById.clear();
    productIdsByCategoryId.clear();
    categoriesById.clear();
    passportsByProductId.clear();
    combosById.clear();
    comboBlocksById.clear();
    comboRelationsById.clear();
    comboIdsByProductId.clear();
    comboIdsByBlockId.clear();
    pendingByProductId.clear();
    pendingPersistentReads.clear();
    pendingByComboId.clear();
    mutationVersions.clear();
    mutationFieldVersions.clear();
    pendingMutationFields.clear();
    dirtyProducts.clear();
    dirtyCategories.clear();
    dirtyPassports.clear();
    removedProductIds.clear();
    dirtyCombos.clear();
    dirtyComboBlocks.clear();
    dirtyComboRelations.clear();
    durableOrderReadyProductIds.clear();
    durableEditorReadyProductIds.clear();
    editorReferences = { units: {}, unitConversions: [], relatedProductUnitLinks: {} };
    editorReferencesLoaded = false;
    editorReferencesPersisted = false;
    editorReferencesDirty = false;
    coverageTotals = {};
    coverageTargets = {};
    coverageTargetMetadata = {};
    metadataDirty = false;
    manifest = emptyManifest();
    scope = null;
    initPromise = null;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = null;
    persistPromise = null;
    reconcilePromise = null;
    reconcileTargetRevision = "0";
    workingCursor = '0'; workingReconciledAt = 0; workingWriteSequence += 1; offlineWritesAllowed = true;
    reconcileAgain = false;
    syncReconnectAttempts = 0;
    downloadJob = null;
    downloadJobPromise = null;
    foregroundTokens.clear();
    foregroundIdleOperations.forEach(end => end());
    foregroundIdleOperations.clear();
    foregroundQuietUntil = 0;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  function getScope() {
    const active = scopeIsCurrent(scope, scopeGeneration) ? scope : null;
    const context = window.AdminAccessContext?.local_context;
    return active ? {
      complete: active.complete, userId: context?.principal?.type === 'user' ? Number(context.principal.id) : null,
      tenantId: context?.tenantId,
      storeId: active.storeId, domain: active.domain, version: active.version, namespace: active.namespace,
    } : null;
  }

  window.CatalogRepository = {
    beginImmutablePassport, activateImmutablePassport,
    init, getProduct, getProducts, getProductsForCategory, getAllProducts, getCategory, getAllCategories, loadProducts, loadPassports, loadCategories, loadEditorReferences,
    upsertProduct, upsertProducts, markProductSummary, patchProductOptimistic, commitProductPatch, rollbackProductPatch, patchProductAuthoritative, removeProduct, clearSavedProducts, isProductPersistedOrderReady, isProductPersistedEditorReady,
    getProductPassport, getEditorReferences, upsertPassports, isOrderReadyPassport,
    upsertCategory, upsertCategories, replaceCategories, ensureProducts, getCoverage, setCoverageTotal, setCoverageTarget, discoverOfflineTarget,
    getTrackedCoverageCategoryIds, getCoverageTargetIds, startDownloadJob, resumeDownloadJob, getDownloadJob, cancelDownloadJob,
    beginForegroundWork, endForegroundWork, withForegroundWork,
    getRootCategoryId, getDescendantCategoryIds, subscribe, getScope, clearRuntime,
    getCombo, getComboForOrder, getAllCombos, getAffectedComboIds, getAffectedComboIdsForBlocks, getComboBlock, getAllComboBlocks, loadSavedComboBlocks, upsertComboBlock, upsertComboBundle, upsertComboBundles, removeCombo, removeComboBlock, ensureComboBlocks,
    ensureCombos, ensureAllCombos, ensureCombosForCategoryCodes, isComboReady,
    startSync, stopSync, reconcile, getSyncState,
    getStreamState: () => syncSubscription?.getState() || { mode: syncSource ? 'independent' : 'stopped' },
    checkAccessResponse,
    normalizeProduct, normalizeCategory, normalizeCombo, normalizeComboBlock,
  };

  window.addEventListener("online", () => { void resumeDownloadJob(); });
  document.addEventListener("visibilitychange", () => scheduleDownloadTurn());
  window.addEventListener("pagehide", () => { downloadPageActive = false; cancelDownloadSchedule(false); });
  window.addEventListener("pageshow", () => { downloadPageActive = true; scheduleDownloadTurn(); void resumeDownloadJob(); });
  document.addEventListener("tenantStoreChanged", () => { clearRuntime(); notify('context-reset', []); void init(); });
  window.addEventListener('storage', (event) => {
    if (event.key === 'activeStoreId') { clearRuntime(); notify('context-reset', []); void init(); }
  });
  window.addEventListener('admin:local-context-changed', (event) => {
    if (event.detail?.state === 'active') { void init(); return; }
    clearRuntime();
    notify('context-reset', []);
  });
  void init();
})(window);
