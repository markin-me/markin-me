(function (window) {
  "use strict";

  const DOMAIN = "admin-catalog";
  const VERSION = 4;
  const MIGRATION_VERSION = 4;
  const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const PRELOAD_BATCH_SIZE = 25;
  const PRELOAD_PROCESSING_CHUNK_SIZE = 5;
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
  let previousReadScope = null;
  let scopeGeneration = 0;
  let initPromise = null;
  let persistTimer = null;
  let persistPromise = null;
  let metadataDirty = false;
  let configuredLoader = null;
  let configuredRequest = null;
  let configuredMetadataLoader = null;
  let syncSource = null;
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
    return window.AdminPersistentCache?.createScope({ domain: DOMAIN, version: VERSION }) || null;
  }

  function scopeIsCurrent(candidate, generation) {
    const active = currentScope();
    return Boolean(candidate?.complete && active?.namespace === candidate.namespace && generation === scopeGeneration);
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
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(afterPaint);
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
    if (foregroundTokens.size || reconcilePromise || document.hidden || !downloadPageActive) return;
    const generation = ++downloadScheduleGeneration;
    const run = () => {
      if (generation !== downloadScheduleGeneration) return;
      downloadScheduleTimer = null;
      downloadIdleCallback = null;
      if (!downloadTurnDeferred) return;
      if (foregroundTokens.size || reconcilePromise || document.hidden || !downloadPageActive || Date.now() < foregroundQuietUntil) {
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
    cancelDownloadSchedule();
    return token;
  }

  function endForegroundWork(token) {
    if (!foregroundTokens.delete(token)) return false;
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
      if (previousReadScope?.complete && previousReadScope.namespace !== targetScope.namespace
        && scopeIsCurrent(targetScope, generation)) {
        const missing = requested.filter((key) => rows.get(key) == null);
        if (missing.length) {
          const previousRows = await previousReadScope.getMany(missing);
          missing.forEach((key) => {
            if (previousRows.get(key) != null) rows.set(key, previousRows.get(key));
          });
        }
      }
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
        if (previousReadScope?.complete && previousReadScope.namespace !== targetScope.namespace
          && scopeIsCurrent(targetScope, generation)) {
          const missing = fresh.map((item) => item.key).filter((key) => rows.get(key) == null);
          if (missing.length) {
            const previousRows = await previousReadScope.getMany(missing);
            missing.forEach((key) => {
              if (previousRows.get(key) != null) rows.set(key, previousRows.get(key));
            });
          }
        }
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
    const event = { type, ids: uniqueIds(ids), syncState: getSyncState() };
    listeners.forEach((listener) => { try { listener(event); } catch (_) {} });
  }

  function schedulePersist() {
    if (!scope?.complete || persistTimer) return;
    persistTimer = window.setTimeout(() => { persistTimer = null; void flushPersistence(); }, 180);
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
    if (persistPromise) {
      await persistPromise;
      const hasPersistableProducts = [...dirtyProducts].some((id) => !(pendingMutationFields.get(id)?.size));
      const hasPersistablePassports = [...dirtyPassports].some((id) => !(pendingMutationFields.get(id)?.size));
      if (hasPersistableProducts || dirtyCategories.size || hasPersistablePassports || removedProductIds.size || dirtyCombos.size || dirtyComboBlocks.size || dirtyComboRelations.size || metadataDirty || editorReferencesDirty) {
        return flushPersistence();
      }
      return true;
    }
    const currentPersistPromise = persistQueuedRecords().finally(() => {
      if (persistPromise === currentPersistPromise) persistPromise = null;
    });
    persistPromise = currentPersistPromise;
    return currentPersistPromise;
  }

  function upsertProduct(raw, options = {}) {
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
    return ids.map((id) => productsById.get(id));
  }

  function patchProductRuntime(productId, fields = {}) {
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
          if (key !== "stock" && key !== "stock_qty" && patch[key] !== undefined) passport.product[key] = patch[key];
        });
      }
      if (Object.prototype.hasOwnProperty.call(patch, "stock") || Object.prototype.hasOwnProperty.call(patch, "stock_qty")) {
        const value = patch.stock_qty !== undefined ? patch.stock_qty : patch.stock;
        passport.stock = { ...(passport.stock || {}), stock_qty: value, qty: value, is_unlimited: value == null };
        passport.availability = { ...(passport.availability || {}), stock_qty: value, is_available: value == null || Number(value) > 0 };
      }
    }
    notify("products", [id]);
    return true;
  }

  function patchProductOptimistic(productId, fields) {
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
      foregroundToken: beginForegroundWork(),
    };
    patchProductRuntime(id, fields);
    return token;
  }

  function commitProductPatch(token, authoritativeFields = null) {
    if (token?.foregroundToken != null) endForegroundWork(token.foregroundToken);
    const id = normalizeId(token?.id);
    if (!id) return false;
    const fieldVersions = mutationFieldVersions.get(id) || new Map();
    const pendingFields = pendingMutationFields.get(id) || new Map();
    const currentFields = Object.fromEntries(Object.entries(authoritativeFields || {}).filter(([key]) => (
      fieldVersions.get(key === "stock" ? "stock_qty" : key) === token.version
    )));
    if (Object.keys(currentFields).length) patchProductRuntime(id, currentFields);
    if (!(token.fields || []).some((key) => fieldVersions.get(key) === token.version)) return false;
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

  function patchProductAuthoritative(productId, fields) {
    const id = normalizeId(productId);
    if (!id || !patchProductRuntime(id, fields)) return false;
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

  function normalizeEditorReferences(passport) {
    if (!passport?.editor || typeof passport.editor !== "object") return passport;
    if (passport.units && typeof passport.units === "object") editorReferences.units = { ...passport.units };
    if (Array.isArray(passport.unitConversions)) {
      editorReferences.unitConversions = passport.unitConversions.slice();
    }
    editorReferences.relatedProductUnitLinks = {
      ...editorReferences.relatedProductUnitLinks,
      ...(passport.editor.relatedProductUnitLinks || {}),
    };
    editorReferencesDirty = true;
    editorReferencesLoaded = true;
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
    const source = payload instanceof Map
      ? [...payload.values()]
      : (Array.isArray(payload) ? payload : Object.values(payload && typeof payload === "object" ? payload : {}));
    const ids = [];
    source.forEach((rawPassport) => {
      let passport = stableValue(rawPassport);
      if (!isOrderReadyPassport(passport)) return;
      const id = normalizeId(passport.product.id ?? passport.product.product_id);
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
      await scope.removeMany(removed.map((id) => `category:${id}`)).catch(() => null);
    }
    schedulePersist();
    notify("categories", [...incoming.keys()]);
    return [...incoming.values()];
  }

  function getProduct(id) { return productsById.get(normalizeId(id)) || null; }
  function getProducts(ids) { return uniqueIds(ids).map((id) => productsById.get(id)).filter(Boolean); }
  function getProductsForCategory(categoryId) {
    const ids = productIdsByCategoryId.get(normalizeId(categoryId));
    return ids ? [...ids].map((id) => productsById.get(id)).filter(Boolean) : [];
  }
  function getCategory(id) { return categoriesById.get(normalizeId(id)) || null; }
  function getAllProducts() { return [...productsById.values()]; }
  function getAllCategories() { return [...categoriesById.values()]; }
  function isProductPersistedOrderReady(id) {
    return durableOrderReadyProductIds.has(normalizeId(id));
  }
  function isProductPersistedEditorReady(id) {
    return durableEditorReadyProductIds.has(normalizeId(id));
  }
  function getProductPassport(id) { return materializePassport(passportsByProductId.get(normalizeId(id)) || null); }
  function getEditorReferences() {
    return { units: editorReferences.units, unitConversions: editorReferences.unitConversions };
  }

  function getDescendantCategoryIds(categoryId) {
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
      total: Number.isFinite(Number(total)) ? Number(total) : null,
      targetSource: coverageTargetMetadata[coverageKey]?.source || null,
      targetCachedAt: Number(coverageTargetMetadata[coverageKey]?.cachedAt || 0) || null,
    };
  }

  function removeProduct(id) {
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
    await cancelDownloadJob();
    await init();
    const targetScope = scope;
    const generation = scopeGeneration;
    if (!targetScope?.complete) return false;
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
    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem("authToken");
    if (token) headers.Authorization = `Bearer ${token}`;
    const storeId = Number(localStorage.getItem("activeStoreId") || localStorage.getItem("store_id") || 0);
    if (storeId > 0) headers["x-store-id"] = String(storeId);
    if (options.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => null);
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
    if (!downloadJob) return null;
    const targetIds = uniqueIds(downloadJob.targetIds);
    const completed = targetIds.filter((id) => durableEditorReadyProductIds.has(id)).length;
    return { ...downloadJob, targetIds: targetIds.slice(), completed, total: targetIds.length };
  }

  async function persistDownloadJob() {
    if (!scope?.complete) return false;
    if (!downloadJob) {
      await scope.remove("meta:download-job");
      return true;
    }
    downloadJob.updatedAt = Date.now();
    await scope.set("meta:download-job", downloadJob, { ttlMs: RECORD_TTL_MS });
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
      downloadJob.state = "error";
      downloadJob.error = "storage";
      notifyDownloadJob();
      return false;
    }
    notifyDownloadJob();
    downloadJobPromise = (async () => {
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
      if (downloadJob.comboMode === "all") await ensureAllCombos({ requiredCompleteness: "editor-ready", awaitPersistence: true, background: true });
      else if (Array.isArray(downloadJob.comboCategoryCodes) && downloadJob.comboCategoryCodes.length) {
        await ensureCombosForCategoryCodes(downloadJob.comboCategoryCodes, { requiredCompleteness: "editor-ready", awaitPersistence: true, background: true });
      }
      downloadJob.state = "complete";
      downloadJob.error = null;
      await persistDownloadJob();
      notifyDownloadJob();
      return true;
    })().catch(async (error) => {
      if (downloadJob && jobRunGeneration === downloadJobGeneration) {
        downloadJob.state = navigator.onLine ? "error" : "paused";
        downloadJob.error = error?.storage === true ? "storage" : String(error?.message || "CATALOG_PRELOAD_FAILED");
        await persistDownloadJob().catch(() => false);
        notifyDownloadJob();
      }
      return false;
    }).finally(() => { downloadJobPromise = null; });
    return downloadJobPromise;
  }

  async function startDownloadJob(options = {}) {
    await init();
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
      downloadJob.state = "error";
      downloadJob.error = "storage";
      notifyDownloadJob();
      return false;
    }
    notifyDownloadJob();
    return runDownloadJob();
  }

  async function resumeDownloadJob() {
    await init();
    if (!downloadJob || downloadJob.state === "complete") return false;
    return runDownloadJob();
  }

  async function cancelDownloadJob() {
    const activePromise = downloadJobPromise;
    downloadJobGeneration += 1;
    downloadJob = null;
    cancelDownloadSchedule(false);
    notifyDownloadJob();
    if (activePromise) await activePromise.catch(() => false);
    if (scope?.complete) await persistDownloadJob().catch(() => false);
    return true;
  }

  function getDownloadJob() { return publicDownloadJob(); }

  function setCoverageTotal(total, options = {}) {
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
    return Object.keys(coverageTargets)
      .map((key) => key.match(/^category:(\d+)$/)?.[1])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  function getCoverageTargetIds(options = {}) {
    const categoryId = normalizeId(options.categoryId);
    const key = categoryId ? `category:${categoryId}` : "global";
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
    await init();
    const requested = uniqueIds(ids);
    await readPersistentProducts(requested.filter((id) => !productsById.has(id)), scope, scopeGeneration);
    return new Map(requested.map((id) => [id, productsById.get(id) || null]));
  }

  async function loadPassports(ids = manifest.passportIds) {
    await init();
    const requested = uniqueIds(ids);
    if (uniqueIds(manifest.editorPassportIds).some((id) => requested.includes(id))) await loadEditorReferences({ priority: true });
    await readPersistentPassports(
      requested.filter((id) => !passportsByProductId.has(id)),
      scope,
      scopeGeneration,
      { priority: true }
    );
    return new Map(requested.map((id) => [id, getProductPassport(id)]));
  }

  async function loadEditorReferences(options = {}) {
    await init();
    if (editorReferencesLoaded || !scope?.complete) return getEditorReferences();
    const targetScope = scope;
    const generation = scopeGeneration;
    const records = await loadPersistentRecords(["reference:editor"], targetScope, generation, options);
    const saved = records.get("reference:editor");
    if (saved && typeof saved === "object" && scopeIsCurrent(targetScope, generation)) {
      editorReferences = { ...editorReferences, ...saved };
      editorReferencesPersisted = true;
      await targetScope.set("reference-index:editor", { schemaVersion: "product-editor-v1" }, { ttlMs: RECORD_TTL_MS }).catch(() => false);
    }
    if (scopeIsCurrent(targetScope, generation)) editorReferencesLoaded = true;
    return getEditorReferences();
  }

  async function loadCategories(ids = manifest.categoryIds) {
    await init();
    const requested = uniqueIds(ids);
    const missing = requested.filter((id) => !categoriesById.has(id));
    if (missing.length && scope?.complete) {
      const targetScope = scope;
      const generation = scopeGeneration;
      const records = await loadPersistentRecords(missing.map((id) => `category:${id}`), targetScope, generation);
      if (scopeIsCurrent(targetScope, generation)) missing.forEach((id) => {
        const row = records.get(`category:${id}`);
        if (normalizeId(row?.id) === id) categoriesById.set(id, row);
      });
    }
    return requested.map((id) => categoriesById.get(id)).filter(Boolean);
  }

  function loaderRows(payload, ids) {
    if (Array.isArray(payload)) return payload;
    if (payload instanceof Map) return ids.map((id) => payload.get(id)).filter(Boolean);
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    if (!data || typeof data !== "object") return [];
    return ids.map((id) => data[id] ?? data[String(id)]).filter(Boolean);
  }

  async function ensureProducts(ids, options = {}) {
    await init();
    const requested = uniqueIds(ids);
    const targetScope = scope;
    const generation = scopeGeneration;
    const requiredEditorReady = options.requiredCompleteness === "editor-ready";
    const requiredOrderReady = requiredEditorReady || options.requiredCompleteness === "order-ready";
    const priority = options.priority === true
      || (options.priority !== false && options.background !== true && foregroundTokens.size > 0);
    const missingRuntime = requested.filter((id) => !productsById.has(id));
    if (missingRuntime.length && targetScope?.complete) await readPersistentProducts(missingRuntime, targetScope, generation);
    if (requiredOrderReady && targetScope?.complete) {
      const missingPassports = requested.filter((id) => !passportsByProductId.has(id)
        && (manifest.passportIds || []).some((value) => Number(value) === id));
      if (missingPassports.length) await readPersistentPassports(missingPassports, targetScope, generation);
      if (requiredEditorReady && !editorReferencesLoaded
        && uniqueIds(manifest.editorPassportIds).some((id) => requested.includes(id))) {
        await loadEditorReferences();
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
    const pendingIds = missing.filter((id) => pendingByProductId.has(id) && !priority);
    const waits = pendingIds.map((id) => pendingByProductId.get(id).promise);
    const upgradeAfterWait = requiredOrderReady
      ? pendingIds.filter((id) => pendingByProductId.get(id).requiredCompleteness !== (requiredEditorReady ? "editor-ready" : "order-ready"))
      : [];
    const fresh = missing.filter((id) => priority || !pendingByProductId.has(id));
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
            const passportRows = Object.values(protectedPayload);
            if (options.background === true && passportRows.length > PRELOAD_PROCESSING_CHUNK_SIZE) {
              const changedIds = [];
              await yieldMainThread();
              for (let offset = 0; offset < passportRows.length; offset += PRELOAD_PROCESSING_CHUNK_SIZE) {
                changedIds.push(...upsertPassports(passportRows.slice(offset, offset + PRELOAD_PROCESSING_CHUNK_SIZE), { notify: false }).map((row) => row.id));
                if (offset + PRELOAD_PROCESSING_CHUNK_SIZE < passportRows.length) await yieldMainThread();
              }
              if (changedIds.length) notify("products", changedIds);
            } else {
              upsertPassports(protectedPayload);
            }
            if (options.awaitPersistence === true) await flushPersistence();
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
        requiredCompleteness: requiredEditorReady ? "editor-ready" : (requiredOrderReady ? "order-ready" : "summary"),
      }));
      waits.push(request);
    }
    if (waits.length) await Promise.all([...new Set(waits)]);
    if (upgradeAfterWait.length) {
      await ensureProducts(upgradeAfterWait, { ...options, requiredCompleteness: requiredEditorReady ? "editor-ready" : "order-ready" });
    }
    const result = new Map();
    requested.forEach((id) => result.set(id, productsById.get(id) || null));
    return result;
  }

  function getComboBlock(id) { return comboBlocksById.get(normalizeId(id)) || null; }
  function getAllComboBlocks() { return [...comboBlocksById.values()]; }
  function getAllCombos() { return [...combosById.values()]; }
  function getAffectedComboIds(productIds) {
    const affected = new Set();
    uniqueIds(productIds).forEach((productId) => {
      (comboIdsByProductId.get(productId) || []).forEach((comboId) => affected.add(comboId));
    });
    return [...affected];
  }

  function getAffectedComboIdsForBlocks(blockIds) {
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
    await scope.removeMany([`combo:${id}`, `combo-relations:${id}`]);
    metadataDirty = true;
    schedulePersist();
    return true;
  }

  async function removeComboBlock(blockId) {
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
    if (scope?.complete) await scope.remove(`combo-block:${id}`).catch(() => null);
    metadataDirty = true;
    schedulePersist();
    return true;
  }

  async function ensureCombos(ids, options = {}) {
    await init();
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
    const componentIds = uniqueIds(requested.flatMap(comboComponentIds));
    if (options.requiredCompleteness !== "definition" && componentIds.length) {
      await ensureProducts(componentIds, {
        requiredCompleteness,
        awaitPersistence: options.awaitPersistence === true,
        background: options.background === true,
      });
    }
    if (options.awaitPersistence === true) await flushPersistence();
    return new Map(requested.map((id) => [id, getCombo(id)]));
  }

  async function ensureComboBlocks(ids, options = {}) {
    await init();
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
    const missing = requested.filter((id) => options.force === true || !comboBlocksById.has(id));
    if (!missing.length || typeof configuredRequest !== "function") {
      return new Map(requested.map((id) => [id, getComboBlock(id)]));
    }
    const response = await configuredRequest(`/api/admin/catalog/combos?block_ids=${missing.join(",")}`);
    (Array.isArray(response?.blocks) ? response.blocks : []).forEach((block) => upsertComboBlock(block, { notify: false }));
    upsertComboBundles(Array.isArray(response?.data) ? response.data : []);
    if (options.awaitPersistence === true) await flushPersistence();
    notify("combo-blocks", requested);
    return new Map(requested.map((id) => [id, getComboBlock(id)]));
  }

  async function ensureAllCombos(options = {}) {
    await init();
    if (!getAllCombos().length && options.force !== true && uniqueIds(manifest.comboIds).length) {
      await ensureCombos(manifest.comboIds, options);
    }
    if (getAllCombos().length && options.force !== true) {
      await ensureCombos(getAllCombos().map((row) => row.id), options);
      return getAllCombos();
    }
    if (typeof configuredRequest !== "function") return [];
    const response = await configuredRequest("/api/admin/catalog/combos");
    const bundles = Array.isArray(response?.data) ? response.data : [];
    if (options.force === true) {
      const nextComboIds = new Set(uniqueIds(bundles.map((row) => row?.combo?.id ?? row?.id)));
      const nextBlockIds = new Set(uniqueIds((response?.blocks || []).map((row) => row?.id)));
      for (const id of [...combosById.keys()]) if (!nextComboIds.has(id)) await removeCombo(id);
      for (const id of [...comboBlocksById.keys()]) if (!nextBlockIds.has(id)) await removeComboBlock(id);
    }
    (Array.isArray(response?.blocks) ? response.blocks : []).forEach((block) => upsertComboBlock(block, { notify: false }));
    upsertComboBundles(bundles);
    await ensureCombos(bundles.map((row) => row?.combo?.id ?? row?.id), options);
    return getAllCombos();
  }

  async function ensureCombosForCategoryCodes(values, options = {}) {
    await init();
    const codes = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
    if (!codes.length || typeof configuredRequest !== "function") return [];
    const localIds = getAllCombos().filter((combo) => codes.includes(String(combo.category_code || "").trim())).map((combo) => combo.id);
    if (localIds.length && options.force !== true) {
      await ensureCombos(localIds, options);
      return localIds.map((id) => getCombo(id)).filter(Boolean);
    }
    const response = await configuredRequest(`/api/admin/catalog/combos?category_codes=${encodeURIComponent(codes.join(","))}`);
    const bundles = Array.isArray(response?.data) ? response.data : [];
    upsertComboBundles(bundles);
    const ids = bundles.map((row) => row?.combo?.id ?? row?.id);
    await ensureCombos(ids, options);
    return ids.map((id) => getCombo(id)).filter(Boolean);
  }

  function revision(value) { return /^\d+$/.test(String(value || "")) ? String(value) : "0"; }
  function revisionGreater(left, right) {
    try { return BigInt(revision(left)) > BigInt(revision(right)); } catch (_) { return false; }
  }
  function getSyncState() {
    return {
      state: syncState,
      runtimeRevision: revision(manifest.serverRevision),
      durableRevision: revision(manifest.durableRevision),
      lastReconciledAt: Number(manifest.lastReconciledAt || 0),
    };
  }
  function setSyncState(value) { syncState = value; notify("sync", []); }
  async function saveCheckpoint(value) {
    const targetScope = scope; const generation = scopeGeneration; const next = revision(value);
    const nextManifest = { ...manifest, serverRevision: next, durableRevision: next, lastReconciledAt: Date.now(), updatedAt: Date.now() };
    await targetScope.set("meta:manifest", nextManifest, { ttlMs: RECORD_TTL_MS });
    if (!scopeIsCurrent(targetScope, generation)) return false;
    manifest = nextManifest; return true;
  }
  async function reconcilePass(targetScope, generation) {
      if (!targetScope?.complete || typeof configuredRequest !== "function" || !navigator.onLine) {
        setSyncState("offline"); return false;
      }
      setSyncState("syncing");
      const storeId = Number(targetScope.storeId);
      const remote = await configuredRequest(`/api/admin/catalog/manifest?store_id=${storeId}`);
      const serverRevision = revision(remote?.data?.revision);
      manifest.serverRevision = serverRevision;
      let cursor = revision(manifest.durableRevision);
      if (!revisionGreater(serverRevision, cursor)) {
        await saveCheckpoint(cursor); setSyncState("online"); return true;
      }
      const changes = new Map(); let hasMore = true; let fullRecovery = false;
      while (hasMore) {
        const response = await configuredRequest(`/api/admin/catalog/changes?store_id=${storeId}&since=${cursor}&limit=500`);
        const data = response?.data || {};
        if (data.reset_required === true) { fullRecovery = true; hasMore = false; break; }
        (Array.isArray(data.changes) ? data.changes : []).forEach((change) => {
          changes.set(`${change.entity_type}:${change.entity_id ?? "all"}`, change);
        });
        const next = revision(data.next_revision);
        if (next === cursor && data.has_more) throw new Error("CATALOG_RECOVERY_CURSOR_STALLED");
        cursor = next; hasMore = data.has_more === true;
      }
      if (!scopeIsCurrent(targetScope, generation)) return false;
      const deletes = []; const refresh = fullRecovery ? [...durableOrderReadyProductIds] : [];
      const refreshCombos = [];
      const refreshComboBlocks = [];
      const deleteCombos = [];
      const deleteComboBlocks = [];
      const inventoryChanges = [];
      let refreshAllCombos = fullRecovery;
      let metadataChanged = fullRecovery; let targetChanged = fullRecovery; let referenceChanged = fullRecovery;
      changes.forEach((change) => {
        if (change.entity_type === "category") metadataChanged = true;
        if (change.entity_type === "reference") referenceChanged = true;
        if (change.entity_type === "product" && change.operation !== "stock") targetChanged = true;
        if (change.entity_type === "combo") {
          const comboId = Number(change.entity_id || 0);
          if (change.operation === "delete" && comboId > 0) deleteCombos.push(comboId);
          else if (comboId > 0) refreshCombos.push(comboId);
          else refreshAllCombos = true;
          return;
        }
        if (change.entity_type === "combo-block") {
          const blockId = Number(change.entity_id || 0);
          if (change.operation === "delete" && blockId > 0) deleteComboBlocks.push(blockId);
          else if (blockId > 0) refreshComboBlocks.push(blockId);
          else refreshAllCombos = true;
          return;
        }
        if (change.entity_type === "inventory") {
          if (Number(change.entity_id) > 0) inventoryChanges.push(Number(change.entity_id));
          return;
        }
        if (change.entity_type !== "product" || !(Number(change.entity_id) > 0)) return;
        if (change.operation === "stock") inventoryChanges.push(Number(change.entity_id));
        if (change.operation === "delete") deletes.push(Number(change.entity_id));
        else if (durableOrderReadyProductIds.has(Number(change.entity_id))) refresh.push(Number(change.entity_id));
      });
      if (referenceChanged) {
        editorReferences = { units: {}, unitConversions: [], relatedProductUnitLinks: {} };
        editorReferencesLoaded = false;
        editorReferencesDirty = true;
        const referenceSourceId = [...durableEditorReadyProductIds][0];
        if (referenceSourceId) refresh.push(referenceSourceId);
      }
      for (const productId of uniqueIds(deletes)) await removeProduct(productId);
      for (const comboId of uniqueIds(deleteCombos)) await removeCombo(comboId);
      for (const blockId of uniqueIds(deleteComboBlocks)) await removeComboBlock(blockId);
      if (refreshComboBlocks.length) await ensureComboBlocks(refreshComboBlocks, { awaitPersistence: true });
      const refreshIds = uniqueIds(refresh).filter((id) => !deletes.includes(id));
      const refreshEditorIds = refreshIds.filter((id) => durableEditorReadyProductIds.has(id));
      const refreshOrderOnlyIds = refreshIds.filter((id) => !refreshEditorIds.includes(id));
      for (const [ids, requiredCompleteness] of [[refreshEditorIds, "editor-ready"], [refreshOrderOnlyIds, "order-ready"]]) {
        for (let offset = 0; offset < ids.length; offset += 80) {
          const batch = ids.slice(offset, offset + 80);
          await ensureProducts(batch, { requiredCompleteness, force: true, awaitPersistence: true });
          const incomplete = requiredCompleteness === "editor-ready"
            ? batch.some((id) => !durableEditorReadyProductIds.has(id))
            : batch.some((id) => !durableOrderReadyProductIds.has(id));
          if (incomplete) throw new Error("CATALOG_RECOVERY_PERSIST_FAILED");
        }
      }
      if (refreshAllCombos) await ensureAllCombos({ requiredCompleteness: "editor-ready", force: true, awaitPersistence: true });
      else if (refreshCombos.length) await ensureCombos(refreshCombos, { requiredCompleteness: "editor-ready", force: true, awaitPersistence: true });
      if ((metadataChanged || targetChanged) && typeof configuredMetadataLoader === "function") {
        await configuredMetadataLoader({ categories: metadataChanged, targets: targetChanged });
      }
      if (!scopeIsCurrent(targetScope, generation)) return false;
      await flushPersistence();
      if (!(await saveCheckpoint(serverRevision))) return false;
      if (inventoryChanges.length || fullRecovery) notify("inventory", uniqueIds(inventoryChanges));
      setSyncState("online"); return true;
  }
  async function reconcile(options = {}) {
    await init();
    const target = revision(options.targetRevision);
    if (revisionGreater(target, reconcileTargetRevision)) reconcileTargetRevision = target;
    if (reconcilePromise) {
      if (revisionGreater(reconcileTargetRevision, manifest.durableRevision)) reconcileAgain = true;
      return reconcilePromise;
    }
    const targetScope = scope; const generation = scopeGeneration;
    reconcilePromise = (async () => {
      let result = false;
      let continuations = 0;
      do {
        reconcileAgain = false;
        result = await reconcilePass(targetScope, generation);
        if (!result || !scopeIsCurrent(targetScope, generation)) return result;
        continuations += 1;
      } while ((reconcileAgain || revisionGreater(reconcileTargetRevision, manifest.durableRevision)) && continuations < 3);
      if (!revisionGreater(reconcileTargetRevision, manifest.durableRevision)) {
        reconcileTargetRevision = revision(manifest.durableRevision);
      }
      return result;
    })().catch(() => { setSyncState(navigator.onLine ? "stale" : "offline"); return false; })
      .finally(() => {
        reconcilePromise = null;
        reconcileAgain = false;
        scheduleDownloadTurn();
      });
    return reconcilePromise;
  }
  function requestReconcile(options = {}) {
    const target = revision(options.targetRevision);
    if (revisionGreater(target, reconcileTargetRevision)) reconcileTargetRevision = target;
    const hasKnownChange = revisionGreater(reconcileTargetRevision, manifest.durableRevision);
    const force = options.force === true;
    if (!force && !hasKnownChange && Date.now() - Number(manifest.lastReconciledAt || 0) < RECONCILE_FRESHNESS_MS) {
      return reconcilePromise || Promise.resolve(true);
    }
    if (reconcilePromise) {
      if (hasKnownChange) reconcileAgain = true;
      return reconcilePromise;
    }
    syncTimerForce = syncTimerForce || force;
    if (!syncTimer) {
      syncTimer = window.setTimeout(() => {
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
      syncReconnectTimer = null;
      if (generation === scopeGeneration) void startSync();
    }, delay);
  }
  function stopSync() {
    if (syncSource) syncSource.abort();
    syncSource = null;
    if (syncReconnectTimer) window.clearTimeout(syncReconnectTimer);
    syncReconnectTimer = null;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = null;
    syncTimerForce = false;
  }
  async function startSync() {
    await init();
    if (!scope?.complete || typeof configuredRequest !== "function") return false;
    if (!navigator.onLine || typeof window.fetch !== "function" || typeof window.AbortController !== "function") { setSyncState(navigator.onLine ? "stale" : "offline"); return false; }
    if (syncSource) return true;
    if (syncReconnectTimer) window.clearTimeout(syncReconnectTimer);
    syncReconnectTimer = null;
    setSyncState("syncing");
    const generation = scopeGeneration;
    const source = new AbortController();
    syncSource = source;
    const onRevision = (data, eventName) => {
      if (source !== syncSource || generation !== scopeGeneration) return;
      try {
        const payload = JSON.parse(data || "{}");
        const eventRevision = revision(payload.revision);
        syncReconnectAttempts = 0;
        if (revisionGreater(eventRevision, manifest.durableRevision)) {
          void requestReconcile({ reason: "sse", targetRevision: eventRevision });
        } else if (eventName === "snapshot") {
          void saveCheckpoint(manifest.durableRevision).then((saved) => { if (saved) setSyncState("online"); });
        } else {
          setSyncState("online");
        }
      } catch (_) { void requestReconcile({ reason: "sse-invalid", force: true }); }
    };
    void (async () => {
      let shouldReconnect = true;
      try {
        const token = String(window.localStorage?.getItem("authToken") || "").trim();
        const response = await fetch(`/api/admin/catalog/stream?store_id=${Number(scope.storeId)}`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "same-origin",
          cache: "no-store",
          signal: source.signal,
        });
        if (!response.ok || !response.body) {
          shouldReconnect = response.status !== 401 && response.status !== 403;
          throw new Error(`CATALOG_STREAM_HTTP_${response.status}`);
        }
        if (source !== syncSource || generation !== scopeGeneration) return;
        syncReconnectAttempts = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (source === syncSource && generation === scopeGeneration) {
          const chunk = await reader.read();
          buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const eventName = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
            if ((eventName === "snapshot" || eventName === "change") && data) onRevision(data, eventName);
            boundary = buffer.indexOf("\n\n");
          }
          if (chunk.done) break;
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
      if (source !== syncSource || generation !== scopeGeneration) return;
      syncSource = null;
      setSyncState(navigator.onLine ? "stale" : "offline");
      if (shouldReconnect) scheduleReconnect(generation);
    })();
    if (!syncLifecycleBound) {
      syncLifecycleBound = true;
      window.addEventListener("online", () => {
        void startSync();
        void requestReconcile({ reason: "online", force: true });
      });
      window.addEventListener("offline", () => setSyncState("offline"));
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

  function collectLegacySeed(legacy) {
    const seed = { summaries: [], orderReady: [], categories: [] };
    if (!legacy || typeof legacy !== "object") return seed;
    if (Array.isArray(legacy.categories)) seed.categories.push(...legacy.categories);
    if (legacy.byCategory && typeof legacy.byCategory === "object") {
      Object.keys(legacy.byCategory).forEach((key) => {
        const categoryId = normalizeId(String(key).split("::")[0]);
        const rows = Array.isArray(legacy.byCategory[key]?.products) ? legacy.byCategory[key].products : [];
        rows.forEach((product) => seed.summaries.push({ product, categoryId }));
      });
    }
    const bootstrap = legacy.newOrderBootstrap;
    if (bootstrap && typeof bootstrap === "object") {
      if (Array.isArray(bootstrap.categories)) seed.categories.push(...bootstrap.categories);
      if (Array.isArray(bootstrap.productCategories)) seed.categories.push(...bootstrap.productCategories);
      const byCategory = bootstrap.categoryProductsById;
      if (byCategory && typeof byCategory === "object") {
        Object.keys(byCategory).forEach((key) => {
          const categoryId = normalizeId(key);
          const rows = Array.isArray(byCategory[key]?.source) ? byCategory[key].source : [];
          rows.forEach((product) => seed.orderReady.push({ product, categoryId }));
        });
      }
    }
    return seed;
  }

  async function seedLegacy(targetScope, generation) {
    const legacy = await window.AdminPersistentCache.readProductCatalog({}).catch(() => null);
    if (!scopeIsCurrent(targetScope, generation)) return false;
    const seed = collectLegacySeed(legacy);
    upsertCategories(seed.categories, { notify: false });
    seed.summaries.forEach(({ product, categoryId }) => upsertProduct(product, {
      categoryId, completeness: "summary", notify: false,
    }));
    seed.orderReady.forEach(({ product, categoryId }) => upsertProduct(product, {
      categoryId, completeness: "summary", notify: false,
    }));
    await flushPersistence();
    if (!scopeIsCurrent(targetScope, generation)) return false;
    manifest.migrationVersion = MIGRATION_VERSION;
    manifest.updatedAt = Date.now();
    try {
      await targetScope.set("meta:manifest", manifest, { ttlMs: RECORD_TTL_MS });
      return scopeIsCurrent(targetScope, generation);
    } catch (_) { return false; }
  }

  async function migratePreviousRepository(targetScope, generation) {
    const previousScope = window.AdminPersistentCache?.createScope({ domain: DOMAIN, version: 3 });
    if (!previousScope?.complete || previousScope.namespace === targetScope.namespace) return false;
    const previousManifest = await previousScope.get("meta:manifest").catch(() => null);
    if (!scopeIsCurrent(targetScope, generation) || !previousManifest) return false;
    const productIds = uniqueIds(previousManifest.productIds);
    const categoryIds = uniqueIds(previousManifest.categoryIds);
    const passportIds = uniqueIds(previousManifest.passportIds);
    const keys = [
      ...productIds.map((id) => `product:${id}`),
      ...categoryIds.map((id) => `category:${id}`),
      ...passportIds.map((id) => `passport:${id}`),
      "reference:editor",
    ];
    const records = await previousScope.getMany(keys).catch(() => new Map());
    const products = productIds.map((id) => records.get(`product:${id}`));
    const categories = categoryIds.map((id) => records.get(`category:${id}`));
    const passports = passportIds.map((id) => records.get(`passport:${id}`));
    const previousEditorReferences = records.get("reference:editor");
    if (!scopeIsCurrent(targetScope, generation)) return false;
    upsertCategories(categories.filter(Boolean), { notify: false });
    upsertProducts(products.filter(Boolean), { notify: false });
    upsertPassports(passports.filter(Boolean), { notify: false });
    if (previousEditorReferences && typeof previousEditorReferences === "object") {
      editorReferences = { ...editorReferences, ...previousEditorReferences };
      editorReferencesLoaded = true;
      editorReferencesDirty = true;
    }
    coverageTotals = { ...(previousManifest.coverageTotals || {}) };
    coverageTargets = { ...(previousManifest.coverageTargets || {}) };
    coverageTargetMetadata = { ...(previousManifest.coverageTargetMetadata || {}) };
    metadataDirty = true;
    await flushPersistence();
    return scopeIsCurrent(targetScope, generation);
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
    const metadata = await targetScope.getMany(["meta:manifest", "meta:download-job"]).catch(() => new Map());
    if (!scopeIsCurrent(targetScope, generation)) return;
    let saved = metadata.get("meta:manifest");
    previousReadScope = null;
    if (!saved || typeof saved !== "object") {
      const previousScope = window.AdminPersistentCache?.createScope({ domain: DOMAIN, version: 3 });
      const previousManifest = previousScope?.complete
        ? await previousScope.get("meta:manifest").catch(() => null)
        : null;
      if (!scopeIsCurrent(targetScope, generation)) return;
      if (previousManifest && typeof previousManifest === "object") {
        previousReadScope = previousScope;
        saved = previousManifest;
      }
    }
    manifest = saved && typeof saved === "object" ? { ...emptyManifest(), ...saved } : emptyManifest();
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

  function init(options = {}) {
    if (typeof options.loader === "function") configuredLoader = options.loader;
    if (typeof options.request === "function") configuredRequest = options.request;
    if (typeof options.metadataLoader === "function") configuredMetadataLoader = options.metadataLoader;
    if (typeof configuredRequest !== "function") configuredRequest = catalogRequest;
    const nextScope = currentScope();
    if (!nextScope?.complete) return Promise.resolve(false);
    if (scope?.namespace === nextScope.namespace && initPromise) return initPromise;
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
    previousReadScope = null;
    initPromise = null;
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = null;
    persistPromise = null;
    reconcilePromise = null;
    reconcileTargetRevision = "0";
    reconcileAgain = false;
    syncReconnectAttempts = 0;
    downloadJob = null;
    downloadJobPromise = null;
    foregroundTokens.clear();
    foregroundQuietUntil = 0;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  function getScope() {
    const active = scope || currentScope();
    return active ? {
      complete: active.complete, userId: active.userId, tenantId: active.tenantId,
      storeId: active.storeId, domain: active.domain, version: active.version, namespace: active.namespace,
    } : null;
  }

  window.CatalogRepository = {
    init, getProduct, getProducts, getProductsForCategory, getAllProducts, getCategory, getAllCategories, loadProducts, loadPassports, loadCategories, loadEditorReferences,
    upsertProduct, upsertProducts, markProductSummary, patchProductOptimistic, commitProductPatch, rollbackProductPatch, patchProductAuthoritative, removeProduct, clearSavedProducts, isProductPersistedOrderReady, isProductPersistedEditorReady,
    getProductPassport, getEditorReferences, upsertPassports, isOrderReadyPassport,
    upsertCategory, upsertCategories, replaceCategories, ensureProducts, getCoverage, setCoverageTotal, setCoverageTarget,
    getTrackedCoverageCategoryIds, getCoverageTargetIds, startDownloadJob, resumeDownloadJob, getDownloadJob, cancelDownloadJob,
    beginForegroundWork, endForegroundWork, withForegroundWork,
    getRootCategoryId, getDescendantCategoryIds, subscribe, getScope, clearRuntime,
    getCombo, getComboForOrder, getAllCombos, getAffectedComboIds, getAffectedComboIdsForBlocks, getComboBlock, getAllComboBlocks, upsertComboBlock, upsertComboBundle, upsertComboBundles, removeCombo, removeComboBlock, ensureComboBlocks,
    ensureCombos, ensureAllCombos, ensureCombosForCategoryCodes, isComboReady,
    startSync, stopSync, reconcile, getSyncState,
    normalizeProduct, normalizeCategory, normalizeCombo, normalizeComboBlock,
  };

  window.addEventListener("online", () => { void resumeDownloadJob(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelDownloadSchedule();
    else scheduleDownloadTurn();
  });
  window.addEventListener("pagehide", () => { downloadPageActive = false; cancelDownloadSchedule(false); });
  window.addEventListener("pageshow", () => { downloadPageActive = true; scheduleDownloadTurn(); void resumeDownloadJob(); });
  document.addEventListener("tenantStoreChanged", () => { clearRuntime(); void init(); });
  void init();
})(window);
