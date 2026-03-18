  // -----------------------------
  // Product details (modal)
  // -----------------------------
  function setAppModalMode(mode) {
    const saveBtn = $("#appModalSaveBtn");
    const cancelBtn = $("#appModalCancelBtn");
    if (!saveBtn || !cancelBtn) return;

    if (mode === "shop") {
      saveBtn.classList.add("hidden");
      cancelBtn.classList.remove("hidden");
      cancelBtn.textContent = "Закрыть";
    } else {
      saveBtn.classList.remove("hidden");
      cancelBtn.classList.remove("hidden");
      cancelBtn.textContent = "Отмена";
    }
  }

  async function ensureProduct(pid) {
    const id = Number(pid);
    if (state.productCache.has(id)) return state.productCache.get(id);

    const json = await apiJson(`/api/public/products/${id}`);
    const p = json.data;
    if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
    if (typeof cacheStockFromProductPayload === "function") {
      cacheStockFromProductPayload(p, "product_ensure_late");
    }
    p.is_available = isProductAvailable(p);
    state.productCache.set(id, p);
    if (!p.is_available && pruneUnavailableCartItems()) {
      renderCart();
      updateCartBadge();
      if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
        const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          if (tspan) tspan.textContent = money(total);
        }
        appendUpsellToList(openCartSheetCtx.listEl);
      }
    }
    return p;
  }

  async function loadProductOptionAssignments(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return [];
    if (state.productOptionsCache.has(pid)) return state.productOptionsCache.get(pid);
    try {
      const res = await fetch(`/api/public/products/${pid}/option-assignments`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        state.productOptionsCache.set(pid, []);
        return [];
      }
      const list = Array.isArray(data.data) ? data.data : [];
      state.productOptionsCache.set(pid, list);
      return list;
    } catch {
      state.productOptionsCache.set(pid, []);
      return [];
    }
  }

  async function preloadProductOptionAssignmentsBatch(productIds) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    const missingIds = ids.filter((id) => !state.productOptionsCache.has(id));
    if (!missingIds.length) return;

    try {
      const json = await apiJson('/api/public/products/batch/option-assignments', {
        method: 'POST',
        body: { ids: missingIds },
      });
      const data = json?.data && typeof json.data === "object" ? json.data : {};
      missingIds.forEach((id) => {
        const list = Array.isArray(data[id]) ? data[id] : [];
        state.productOptionsCache.set(id, list);
      });
    } catch (e) {
      console.warn("Failed to preload product option assignments batch:", e);
    }
  }

  async function loadOptionGroupDetails(groupId) {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return null;
    if (state.optionGroupCache.has(gid)) return state.optionGroupCache.get(gid);
    try {
      const res = await fetch(`/api/public/options/groups/${gid}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        state.optionGroupCache.set(gid, null);
        return null;
      }
      const details = data.data || null;
      state.optionGroupCache.set(gid, details);
      return details;
    } catch {
      state.optionGroupCache.set(gid, null);
      return null;
    }
  }

  function getOptionItemPrice(item) {
    if (!item) return 0;
    if (item.price_mode === "fixed") return Number(item.price_value || 0);
    return Number(item.product_price || 0);
  }

  function getOptionGroupUiType(group) {
    if (!group) return "single";
    
    // Проверяем selection_type: если "multiple", определяем подтип по лимитам товаров
    const selectionType = group.selection_type || "single";
    if (selectionType !== "multiple") return "single";
    
    const items = Array.isArray(group.items) ? group.items : [];
    // Проверяем, есть ли у товаров возможность выбора количества > 1
    // Если max > 1 у любого товара — это multiple_item (с контролами количества)
    // Иначе — multiple_group (просто чекбоксы, каждый товар = 1 шт)
    const hasQtyControls = items.some((item) => {
      const max = item.qty_max ?? 1;
      return max > 1;
    });
    return hasQtyControls ? "multiple_item" : "multiple_group";
  }

  function collectSelectedOptionItems(optionGroups, selectionState) {
    const selectedItems = [];
    optionGroups.forEach((group) => {
      const state = selectionState.get(group.id);
      if (!state) return;
      const itemsById = new Map((group.items || []).map((item) => [Number(item.id), item]));
      
      // Функция для получения цены с учётом варианта
      const getPriceWithVariant = (item, itemId) => {
        const basePrice = Number(item.price || 0);
        const variantData = state.variantByItemId?.get(itemId);
        if (variantData && Number.isFinite(variantData.variant_price_diff)) {
          return basePrice + variantData.variant_price_diff;
        }
        return basePrice;
      };
      
      // Функция для добавления данных о варианте
      const getVariantData = (itemId) => {
        const variantData = state.variantByItemId?.get(itemId);
        if (variantData) {
          return {
            variant_group_id: variantData.variant_group_id,
            variant_value_index: variantData.variant_value_index,
            variant_label: variantData.variant_label || "",
            variant_price_diff: variantData.variant_price_diff || 0,
          };
        }
        return null;
      };
      
      if (state.type === "single") {
        const itemId = Number(state.selectedId);
        const item = itemsById.get(itemId);
        if (item) {
          const targetProductId = Number(item.target_product_id || item.product_id || 0);
          const entry = {
            id: item.id,
            title: item.title,
            price: getPriceWithVariant(item, itemId),
            qty: 1,
            target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
            product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
          };
          const variant = getVariantData(itemId);
          if (variant) Object.assign(entry, variant);
          selectedItems.push(entry);
        }
        return;
      }
      if (state.type === "multiple_group") {
        state.selectedIds.forEach((id) => {
          const itemId = Number(id);
          const item = itemsById.get(itemId);
          if (item) {
            const targetProductId = Number(item.target_product_id || item.product_id || 0);
            const entry = {
              id: item.id,
              title: item.title,
              price: getPriceWithVariant(item, itemId),
              qty: 1,
              target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
              product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
            };
            const variant = getVariantData(itemId);
            if (variant) Object.assign(entry, variant);
            selectedItems.push(entry);
          }
        });
        return;
      }
      if (state.type === "multiple_item") {
        state.qtyById.forEach((qty, id) => {
          const itemId = Number(id);
          const item = itemsById.get(itemId);
          if (item && qty > 0) {
            const targetProductId = Number(item.target_product_id || item.product_id || 0);
            const entry = {
              id: item.id,
              title: item.title,
              price: getPriceWithVariant(item, itemId),
              qty,
              target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
              product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
            };
            const variant = getVariantData(itemId);
            if (variant) Object.assign(entry, variant);
            selectedItems.push(entry);
          }
        });
      }
    });
    return selectedItems;
  }

const comboProductIngredientsCache = new Map();
const comboProductVariantsCache = new Map();
const productDetailsConfigCache = new Map();
const comboProductBatchWarmupCache = new Map();
const comboDetailsCache = new Map();
const comboProductPreviewSharedCache = new Map();
const comboBlockPreviewWarmCache = new Map();
const comboBlockPreviewResolvedCache = new Map();
let productDetailsPrefetchTimer = null;
let comboDetailsPrefetchTimer = null;
const COMBO_DETAILS_CACHE_TTL_MS = 60000;
const COMBO_PREVIEW_SHARED_TTL_MS = 5 * 60 * 1000;

function collectComboProductIds(comboData) {
  const ids = new Set();
  const blocks = Array.isArray(comboData?.blocks) ? comboData.blocks : [];
  blocks.forEach((block) => {
    const products = Array.isArray(block?.products) ? block.products : [];
    products.forEach((prod) => {
      const pid = Number(prod?.product_id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });
  });
  return Array.from(ids);
}

function getComboBlockPreviewCacheKey(block, discountPercent) {
  const blockId = Number(block?.block_id || block?.id || 0);
  const productIds = (Array.isArray(block?.products) ? block.products : [])
    .map((prod) => Number(prod?.product_id || 0))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);
  return `${blockId}:${Number(discountPercent || 0)}:${productIds.join(",")}`;
}

function getSharedComboProductPreview(cacheKey) {
  const key = String(cacheKey || "");
  if (!key) return null;
  const entry = comboProductPreviewSharedCache.get(key);
  if (!entry) return null;
  if (Number(entry.expiresAt || 0) <= Date.now()) {
    comboProductPreviewSharedCache.delete(key);
    return null;
  }
  return entry.promise || null;
}

function setSharedComboProductPreview(cacheKey, promise) {
  const key = String(cacheKey || "");
  if (!key || !promise) return;
  comboProductPreviewSharedCache.set(key, {
    promise,
    expiresAt: Date.now() + COMBO_PREVIEW_SHARED_TTL_MS,
  });
}

function getSharedComboBlockPreviewWarm(cacheKey) {
  const key = String(cacheKey || "");
  if (!key) return null;
  const entry = comboBlockPreviewWarmCache.get(key);
  if (!entry) return null;
  if (Number(entry.expiresAt || 0) <= Date.now()) {
    comboBlockPreviewWarmCache.delete(key);
    return null;
  }
  return entry.promise || null;
}

function setSharedComboBlockPreviewWarm(cacheKey, promise) {
  const key = String(cacheKey || "");
  if (!key || !promise) return;
  comboBlockPreviewWarmCache.set(key, {
    promise,
    expiresAt: Date.now() + COMBO_PREVIEW_SHARED_TTL_MS,
  });
}

function getSharedComboBlockPreviewResolved(cacheKey) {
  const key = String(cacheKey || "");
  if (!key) return null;
  const entry = comboBlockPreviewResolvedCache.get(key);
  if (!entry) return null;
  if (Number(entry.expiresAt || 0) <= Date.now()) {
    comboBlockPreviewResolvedCache.delete(key);
    return null;
  }
  return entry.map instanceof Map ? entry.map : null;
}

function setSharedComboBlockPreviewResolved(cacheKey, previewMap) {
  const key = String(cacheKey || "");
  if (!key || !(previewMap instanceof Map)) return;
  comboBlockPreviewResolvedCache.set(key, {
    map: previewMap,
    expiresAt: Date.now() + COMBO_PREVIEW_SHARED_TTL_MS,
  });
}

async function resolveComboDetails(comboId) {
  const safeComboId = Number(comboId || 0);
  if (!Number.isFinite(safeComboId) || safeComboId <= 0) return null;

  const now = Date.now();
  const cached = comboDetailsCache.get(safeComboId);
  if (cached && cached.promise && Number(cached.expiresAt || 0) > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const json = await apiJson("/api/public/combos/" + encodeURIComponent(safeComboId));
    return json?.data || null;
  })();

  comboDetailsCache.set(safeComboId, {
    promise,
    expiresAt: now + COMBO_DETAILS_CACHE_TTL_MS,
    ts: now,
  });

  try {
    const data = await promise;
    if (!data) comboDetailsCache.delete(safeComboId);
    return data;
  } catch (e) {
    comboDetailsCache.delete(safeComboId);
    throw e;
  }
}

async function warmComboDetailsData(comboData, opts = {}) {
  const ids = collectComboProductIds(comboData);
  if (!ids.length) return;
  await preloadComboProductsData(ids);
  if (opts.preloadProductConfigs) {
    prefetchProductDetailsConfig(ids, {
      limit: Math.max(1, Math.min(24, ids.length)),
      delayMs: 0,
    });
  }
}

function prefetchComboDetails(comboIds, opts = {}) {
  const ids = Array.isArray(comboIds)
    ? Array.from(new Set(comboIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
    : [];
  if (!ids.length) return;

  const limit = Math.max(1, Number(opts.limit || 6));
  const delayMs = Math.max(0, Number(opts.delayMs ?? 220));
  const eager = opts.eager === true;
  const queue = ids
    .filter((id) => {
      const cached = comboDetailsCache.get(id);
      return !(cached && cached.promise && Number(cached.expiresAt || 0) > Date.now());
    })
    .slice(0, limit);
  if (!queue.length) return;

  const run = async () => {
    for (const id of queue) {
      try {
        const comboData = await resolveComboDetails(id);
        if (comboData) {
          await warmComboDetailsData(comboData, {
            preloadProductConfigs: opts.preloadProductConfigs !== false,
          });
        }
      } catch {}
    }
  };

  if (comboDetailsPrefetchTimer) {
    clearTimeout(comboDetailsPrefetchTimer);
    comboDetailsPrefetchTimer = null;
  }
  comboDetailsPrefetchTimer = setTimeout(() => {
    comboDetailsPrefetchTimer = null;
    if (!eager && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => {
        run().catch(() => {});
      }, { timeout: 1200 });
      return;
    }
    run().catch(() => {});
  }, delayMs);
}

function normalizeComboVariantList(rawList) {
  const variants = Array.isArray(rawList) ? rawList : [];
  return variants.map((v) => ({
    id: Number(v.id),
    title: str(v.title || ""),
    unit_id: v.unit_id ? Number(v.unit_id) : null,
    unit_code: str(v.unit_code || ""),
    unit_title: str(v.unit_title || ""),
    unit_short_title: str(v.unit_short_title || ""),
    values: Array.isArray(v.values) ? v.values : [],
    discount_tiers: Array.isArray(v.discount_tiers) ? v.discount_tiers : [],
    default_value_index: v.default_value_index != null ? Number(v.default_value_index) : null,
  }));
}

async function preloadComboProductsData(productIds) {
  const ids = Array.isArray(productIds)
    ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
    : [];
  if (!ids.length) return;

  const missingIngredients = ids.filter((id) => !comboProductIngredientsCache.has(id));
  const missingVariants = ids.filter((id) => !comboProductVariantsCache.has(id));

  const tasks = [];

  if (missingIngredients.length) {
    tasks.push(
      apiJson('/api/public/products/batch/ingredients', {
        method: 'POST',
        body: { ids: missingIngredients },
      })
        .then((json) => {
          const data = json?.data && typeof json.data === "object" ? json.data : {};
          missingIngredients.forEach((id) => {
            const list = Array.isArray(data[id]) ? data[id] : [];
            comboProductIngredientsCache.set(id, Promise.resolve(list));
          });
        })
        .catch((e) => {
          console.warn("Failed to preload combo ingredients batch:", e);
        })
    );
  }

  if (missingVariants.length) {
    tasks.push(
      apiJson('/api/public/products/batch/variants', {
        method: 'POST',
        body: { ids: missingVariants },
      })
        .then((json) => {
          const data = json?.data && typeof json.data === "object" ? json.data : {};
          missingVariants.forEach((id) => {
            const list = normalizeComboVariantList(Array.isArray(data[id]) ? data[id] : []);
            comboProductVariantsCache.set(id, Promise.resolve(list));
          });
        })
        .catch((e) => {
          console.warn("Failed to preload combo variants batch:", e);
        })
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

async function warmComboProductConfigById(productId) {
  const pid = Number(productId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return;
  const existing = comboProductBatchWarmupCache.get(pid);
  if (existing) return existing;

  const task = preloadComboProductsData([pid])
    .catch(() => {})
    .finally(() => {
      comboProductBatchWarmupCache.delete(pid);
    });
  comboProductBatchWarmupCache.set(pid, task);
  return task;
}

async function resolveProductIngredients(productId) {
  const pid = Number(productId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return [];
  if (comboProductIngredientsCache.has(pid)) {
    return comboProductIngredientsCache.get(pid);
  }

  const request = (async () => {
    await warmComboProductConfigById(pid);
    const fromBatch = comboProductIngredientsCache.get(pid);
    if (fromBatch && fromBatch !== request) return fromBatch;

    // Fallback for old/backward paths when batch endpoint is unavailable.
    const res = await fetch(`/api/public/products/${pid}/ingredients`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) return [];
    return Array.isArray(data.data) ? data.data : [];
  })();
  comboProductIngredientsCache.set(pid, request);

  try {
    return await request;
  } catch (e) {
    comboProductIngredientsCache.delete(pid);
    console.error("Failed to load ingredients", e);
    return [];
  }
}

async function resolveProductOptionGroups(productId) {
  const assignments = await loadProductOptionAssignments(productId);
  const activeAssignments = assignments.filter((a) => Number(a.is_active || 0) === 1);
  const groups = [];

  for (const assignment of activeAssignments) {
    const details = await loadOptionGroupDetails(assignment.group_id);
    const items = Array.isArray(details?.items) ? details.items : [];
    const activeItems = items.filter((item) => Number(item.is_active || 0) === 1);
    if (!activeItems.length) continue;

    // Загружаем товары-опции в кэш для конвертации единиц измерения
    const productIds = activeItems
      .map((item) => Number(item.target_product_id || 0))
      .filter((id) => id > 0 && !state.productCache.has(id));
    if (productIds.length > 0) {
      await Promise.all(productIds.map((pid) => ensureProduct(pid).catch(() => null)));
    }

    // Используем значения из группы опций (assignment может переопределять, но по умолчанию берём из группы)
    // Если в назначении selection_type = 'single' (дефолт), проверяем группу
    const groupSelectionType = details?.group?.selection_type || assignment.selection_type || "single";
    const groupMinSelect = details?.group?.min_select ?? assignment.min_select ?? 0;
    const groupMaxSelect = details?.group?.max_select ?? assignment.max_select ?? null;

    groups.push({
      id: Number(assignment.group_id),
      title: str(assignment.title || details?.group?.title || ""),
      selection_type: groupSelectionType,
      min_select: groupMinSelect,
      max_select: groupMaxSelect,
      allow_variants: Boolean(details?.group?.allow_variants),

      // NEW: is_required (только для single, но храним всегда)
      is_required:
        groupSelectionType === "single"
          ? (Number(details?.group?.is_required ?? 1) === 1)
          : false,

      items: activeItems.map((item) => {
        // photo берём от товара, который привязан к пункту опции
        let photo = "";
        try {
          const arr =
            typeof item.product_photos_json === "string"
              ? JSON.parse(item.product_photos_json)
              : Array.isArray(item.product_photos_json)
                ? item.product_photos_json
                : [];
          if (Array.isArray(arr) && arr[0]) photo = arr[0];
        } catch {}

        // Варианты товара-опции (если есть)
        const variants = Array.isArray(item.variants) ? item.variants : [];

        return {
          id: Number(item.id),
          target_product_id: Number(item.target_product_id || 0),
          title: str(item.product_name || item.name || ""),
          price: getOptionItemPrice(item),
          product_price: Number(item.product_price || 0),
          qty_min: item.qty_min ?? 1,
          qty_max: item.qty_max ?? 1,
          photo,
          // Варианты для этого товара-опции
          variants: variants,
        };
      }),
    });
  }

  return groups;
}

async function resolveProductVariants(productId) {
  const pid = Number(productId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return [];
  if (comboProductVariantsCache.has(pid)) {
    return comboProductVariantsCache.get(pid);
  }

  const request = (async () => {
    await warmComboProductConfigById(pid);
    const fromBatch = comboProductVariantsCache.get(pid);
    if (fromBatch && fromBatch !== request) return fromBatch;

    // Fallback for old/backward paths when batch endpoint is unavailable.
    const res = await apiJson(`/api/public/products/${pid}/variants`);
    return normalizeComboVariantList(Array.isArray(res.data) ? res.data : []);
  })();
  comboProductVariantsCache.set(pid, request);

  try {
    return await request;
  } catch (e) {
    comboProductVariantsCache.delete(pid);
    console.error("Failed to load product variants:", e);
    return [];
  }
}

async function resolveProductDetailsConfig(productId) {
  const pid = Number(productId || 0);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { optionGroups: [], ingredients: [], variants: [] };
  }
  const cached = productDetailsConfigCache.get(pid);
  if (cached && cached.promise) return cached.promise;

  const promise = (async () => {
    const [optionGroups, ingredients, variants] = await Promise.all([
      resolveProductOptionGroups(pid),
      resolveProductIngredients(pid),
      resolveProductVariants(pid),
    ]);
    return {
      optionGroups: Array.isArray(optionGroups) ? optionGroups : [],
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      variants: Array.isArray(variants) ? variants : [],
    };
  })();

  productDetailsConfigCache.set(pid, { promise, ts: Date.now() });
  try {
    return await promise;
  } catch (e) {
    productDetailsConfigCache.delete(pid);
    throw e;
  }
}

function prefetchProductDetailsConfig(productIds, opts = {}) {
  const ids = Array.isArray(productIds)
    ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
    : [];
  if (!ids.length) return;

  const limit = Math.max(1, Number(opts.limit || 6));
  const delayMs = Math.max(0, Number(opts.delayMs ?? 220));
  const queue = ids.filter((id) => !productDetailsConfigCache.has(id)).slice(0, limit);
  if (!queue.length) return;

  const run = async () => {
    await Promise.allSettled([
      preloadProductOptionAssignmentsBatch(queue),
      preloadComboProductsData(queue),
    ]);
    for (const id of queue) {
      try {
        await resolveProductDetailsConfig(id);
      } catch {}
    }
  };

  if (productDetailsPrefetchTimer) {
    clearTimeout(productDetailsPrefetchTimer);
    productDetailsPrefetchTimer = null;
  }
  productDetailsPrefetchTimer = setTimeout(() => {
    productDetailsPrefetchTimer = null;
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => {
        run().catch(() => {});
      }, { timeout: 1200 });
      return;
    }
    run().catch(() => {});
  }, delayMs);
}

async function warmInitialCatalogPayload(opts = {}) {
  const productLimit = Math.max(1, Number(opts.productLimit || 12));
  const comboLimit = Math.max(0, Number(opts.comboLimit || 6));
  const productIds = Array.isArray(opts.productIds)
    ? Array.from(new Set(opts.productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))).slice(0, productLimit)
    : [];
  const comboIds = Array.isArray(opts.comboIds)
    ? Array.from(new Set(opts.comboIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))).slice(0, comboLimit)
    : [];

  if (!productIds.length && !comboIds.length) return;

  const productTask = (async () => {
    if (!productIds.length) return;
    await Promise.allSettled(productIds.map(async (id) => {
      await resolveProductDetailsConfig(id);
    }));
  })();

  const comboTask = (async () => {
    if (!comboIds.length) return;
    for (const comboId of comboIds) {
      try {
        const comboData = await resolveComboDetails(comboId);
        if (!comboData) continue;
        await warmComboDetailsData(comboData, { preloadProductConfigs: true });
      } catch {}
    }
  })();

  await Promise.allSettled([productTask, comboTask]);
}

function buildProductDetailsContent(
  product,
  optionGroups,
  selectionState,
  ingredients,
  ingredientState,
  variants,
  variantState,
  {
    onBack,
    mode,
    onSelectionChange,
    onIngredientChange,
    onVariantChange,
    canSelectVariantIndex = null,
    canDraftMutationApply = null,
    qtyPill,
    onQtyMinus,
    onQtyPlus,
    onQtyCenterClick,
    setDefaultVariantForOptionItem = () => {},
    guardDraftMutation = null,
  } = {}
) {
  const wrap = document.createElement("div");
  wrap.className = "shop-pd";

  const scroll = document.createElement("div");
  scroll.className = "shop-pd-scroll";

  // Умный скролл: при раскрытии секций (например, опций) доскролливаем так,
  // чтобы блок оказался сразу под хедером на мобильных.
  function smartScrollIntoView(targetEl) {
    try {
      if (!targetEl || !scroll) return;

      // Только мобильный режим — на десктопе и так всё видно.
      if (!window.matchMedia || !window.matchMedia("(max-width: 768px)").matches) {
        return;
      }

      const header = document.querySelector("header");
      let offset = 0;
      if (header) {
        const headerRect = header.getBoundingClientRect();
        const headerH =
          headerRect.height ||
          header.offsetHeight ||
          parseFloat(getComputedStyle(header).height) ||
          0;
        // Немного запаса под хедером
        offset = headerH + 8;
      }

      const scrollRect = scroll.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      // Положение верха блока относительно начала скролл-контейнера
      const currentTop = targetRect.top - scrollRect.top;
      const desiredTop = offset;
      const delta = currentTop - desiredTop;

      // Если и так почти на месте — ничего не делаем
      if (Math.abs(delta) < 4) return;

      scroll.scrollBy({
        top: delta,
        behavior: "smooth",
      });
    } catch {
      // В случае ошибки просто не скроллим, чтобы не ломать UX
    }
  }

  // Плавное открытие/закрытие списка (аккордеон по высоте),
  // чтобы не было резких "схлопываний"
  function slideDown(listEl, duration = 180) {
    if (!listEl) return;
    listEl.classList.remove("hidden");
    listEl.style.overflow = "hidden";
    listEl.style.maxHeight = "0px";

    // Следующий кадр — анимируем до полной высоты
    const run = () => {
      const full = listEl.scrollHeight || 0;
      listEl.style.transition = `max-height ${duration}ms ease`;
      listEl.style.maxHeight = `${full}px`;
    };
    if (window.requestAnimationFrame) {
      requestAnimationFrame(run);
    } else {
      run();
    }

    const onEnd = () => {
      listEl.style.maxHeight = "";
      listEl.style.overflow = "";
      listEl.style.transition = "";
      listEl.removeEventListener("transitionend", onEnd);
    };
    listEl.addEventListener("transitionend", onEnd);
  }

  function slideUp(listEl, duration = 180, afterHide) {
    if (!listEl) {
      if (typeof afterHide === "function") afterHide();
      return;
    }
    const full = listEl.scrollHeight || 0;
    listEl.style.overflow = "hidden";
    listEl.style.maxHeight = `${full}px`;
    listEl.style.transition = `max-height ${duration}ms ease`;

    // Следующий кадр — анимируем до 0
    const run = () => {
      listEl.style.maxHeight = "0px";
    };
    if (window.requestAnimationFrame) {
      requestAnimationFrame(run);
    } else {
      run();
    }

    const onEnd = () => {
      listEl.classList.add("hidden");
      listEl.style.maxHeight = "";
      listEl.style.overflow = "";
      listEl.style.transition = "";
      listEl.removeEventListener("transitionend", onEnd);
      if (typeof afterHide === "function") afterHide();
    };
    listEl.addEventListener("transitionend", onEnd);
  }

  function setOptionVariantAccordionState(accordionEl, open, duration = 220) {
    if (!accordionEl) return;
    const willOpen = !!open;
    const OPEN_PADDING_TOP_PX = 8;
    const OPEN_MARGIN_TOP_PX = 8;
    const OPEN_BORDER_TOP_WIDTH_PX = 1;
    const currentTeardown = accordionEl.__variantAccordionTeardown;
    if (typeof currentTeardown === "function") {
      try { currentTeardown(); } catch {}
      accordionEl.__variantAccordionTeardown = null;
    }

    if (willOpen) {
      accordionEl.classList.add("is-open");
      accordionEl.style.display = "block";
      const full = accordionEl.scrollHeight || 0;
      accordionEl.style.overflow = "hidden";
      accordionEl.style.maxHeight = "0px";
      accordionEl.style.opacity = "0";
      accordionEl.style.paddingTop = "0px";
      accordionEl.style.marginTop = "0px";
      accordionEl.style.borderTopWidth = "0px";
      accordionEl.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease, padding-top ${duration}ms ease, margin-top ${duration}ms ease, border-top-width ${duration}ms ease`;
      const run = () => {
        const target = accordionEl.scrollHeight || full;
        accordionEl.style.maxHeight = `${target}px`;
        accordionEl.style.opacity = "1";
        accordionEl.style.paddingTop = `${OPEN_PADDING_TOP_PX}px`;
        accordionEl.style.marginTop = `${OPEN_MARGIN_TOP_PX}px`;
        accordionEl.style.borderTopWidth = `${OPEN_BORDER_TOP_WIDTH_PX}px`;
      };
      if (window.requestAnimationFrame) requestAnimationFrame(run);
      else run();
      const onEnd = () => {
        accordionEl.style.maxHeight = "";
        accordionEl.style.overflow = "";
        accordionEl.style.transition = "";
        accordionEl.removeEventListener("transitionend", onEnd);
        accordionEl.__variantAccordionTeardown = null;
      };
      accordionEl.__variantAccordionTeardown = onEnd;
      accordionEl.addEventListener("transitionend", onEnd);
      return;
    }

    if (!accordionEl.classList.contains("is-open")) {
      accordionEl.style.display = "none";
      return;
    }
    const full = accordionEl.scrollHeight || 0;
    accordionEl.style.display = "block";
    accordionEl.style.overflow = "hidden";
    accordionEl.style.maxHeight = `${full}px`;
    accordionEl.style.opacity = "1";
    const computed = window.getComputedStyle(accordionEl);
    accordionEl.style.paddingTop = computed.paddingTop || `${OPEN_PADDING_TOP_PX}px`;
    accordionEl.style.marginTop = computed.marginTop || `${OPEN_MARGIN_TOP_PX}px`;
    accordionEl.style.borderTopWidth = computed.borderTopWidth || `${OPEN_BORDER_TOP_WIDTH_PX}px`;
    accordionEl.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease, padding-top ${duration}ms ease, margin-top ${duration}ms ease, border-top-width ${duration}ms ease`;
    const run = () => {
      accordionEl.style.maxHeight = "0px";
      accordionEl.style.opacity = "0";
      accordionEl.style.paddingTop = "0px";
      accordionEl.style.marginTop = "0px";
      accordionEl.style.borderTopWidth = "0px";
    };
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    else run();
    const onEnd = () => {
      accordionEl.classList.remove("is-open");
      accordionEl.style.display = "none";
      accordionEl.style.maxHeight = "";
      accordionEl.style.opacity = "";
      accordionEl.style.paddingTop = "";
      accordionEl.style.marginTop = "";
      accordionEl.style.borderTopWidth = "";
      accordionEl.style.overflow = "";
      accordionEl.style.transition = "";
      accordionEl.removeEventListener("transitionend", onEnd);
      accordionEl.__variantAccordionTeardown = null;
    };
    accordionEl.__variantAccordionTeardown = onEnd;
    accordionEl.addEventListener("transitionend", onEnd);
  }

  /* ================= HERO (ФОТО + СТРЕЛКИ DESKTOP + СВАЙП MOBILE + DOTS) ================= */

  const photos = safePhotos(product);
  let activeIndex = 0;

  const hero = document.createElement("div");
  hero.className = "shop-product-hero";

  const media = document.createElement("div");
  media.className = "shop-product-hero-media";

  const img = createOptimizedImage(photos[0] || "/static/img/placeholder.png", {
    type: 'product-hero',
    className: 'shop-product-hero-image',
    alt: '',
    priority: true,
  });
  img.style.objectFit = "cover";
  media.appendChild(img);

  hero.appendChild(media);

  let dots = null;

  function setActive(nextIndex) {
    if (!photos.length) return;

    const len = photos.length;
    let i = Number(nextIndex);

    if (!Number.isFinite(i)) i = 0;
    i = (i % len + len) % len;

    if (activeIndex === i) return;
    activeIndex = i;

    img.src = photos[i] || "/static/img/placeholder.png";

    if (dots) {
      dots.querySelectorAll(".shop-product-hero-dot").forEach((d, idx) => {
        d.classList.toggle("is-active", idx === i);
      });
    }
  }

  // стрелки (desktop; на мобилке скрываются CSS-ом)
  if (photos.length > 1) {
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "shop-product-hero-arrow is-prev";
    btnPrev.innerHTML = `<i class="fas fa-chevron-left"></i>`;
    btnPrev.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(activeIndex - 1);
    });

    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "shop-product-hero-arrow is-next";
    btnNext.innerHTML = `<i class="fas fa-chevron-right"></i>`;
    btnNext.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(activeIndex + 1);
    });

    hero.appendChild(btnPrev);
    hero.appendChild(btnNext);
  }

  // dots + клики по точкам
  if (photos.length > 1) {
    dots = document.createElement("div");
    dots.className = "shop-product-hero-dots";

    photos.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className =
        "shop-product-hero-dot" + (i === 0 ? " is-active" : "");

      dot.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(i);
      });

      dots.appendChild(dot);
    });

    hero.appendChild(dots);
  }

  // свайп (mobile)
  if (photos.length > 1) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    media.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        tracking = true;
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );

    media.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;

        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;

        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) setActive(activeIndex + 1);
          else setActive(activeIndex - 1);
        }
      },
      { passive: true }
    );
  }

  scroll.appendChild(hero);

  const runGuardedMutation = (mutator, opts = {}) => {
    if (typeof mutator !== "function") return false;
    if (typeof guardDraftMutation !== "function") {
      mutator();
      return true;
    }
    return !!guardDraftMutation(mutator, opts);
  };

  const canApplyDraftMutation = (mutator) => {
    if (typeof mutator !== "function") return true;
    if (typeof canDraftMutationApply === "function") {
      try {
        return canDraftMutationApply(mutator) !== false;
      } catch {
        return true;
      }
    }
    return true;
  };

  const variantAvailabilityRefreshers = [];
  const registerVariantAvailabilityRefresher = (refreshFn) => {
    if (typeof refreshFn === "function") {
      variantAvailabilityRefreshers.push(refreshFn);
    }
  };
  const refreshVariantAvailability = ({ showToastOnOut = false, forceNow = false } = {}) => {
    if (!variantAvailabilityRefreshers.length) return Promise.resolve();
    return Promise.all(
      variantAvailabilityRefreshers.map((refreshFn) =>
        Promise.resolve(refreshFn({ showToastOnOut, forceNow })).catch(() => {})
      )
    ).then(() => {});
  };

  const createOptionVariantAvailabilityController = ({
    values = [],
    getSelectedIndex,
    setDraftForIndex,
    isOptionItemSelected,
  } = {}) => {
    const buttonsByIndex = new Map();
    const availabilityByIndex = new Map();
    let refreshSeq = 0;
    let refreshTimer = null;

    const applyButtonState = (idx) => {
      const btn = buttonsByIndex.get(Number(idx));
      if (!btn) return;
      const selectedIdx = Number(typeof getSelectedIndex === "function" ? getSelectedIndex() : -1);
      const isSelected = selectedIdx === Number(idx);
      const knownAvailable = availabilityByIndex.has(Number(idx))
        ? availabilityByIndex.get(Number(idx)) !== false
        : true;
      const shouldDisable = !knownAvailable && !isSelected;
      btn.classList.toggle("is-unavailable", shouldDisable);
      btn.disabled = shouldDisable;
      btn.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    };

    const refreshNow = () => {
      if (!Array.isArray(values) || !values.length) return;

      const selectedNow = typeof isOptionItemSelected === "function" ? !!isOptionItemSelected() : true;
      if (!selectedNow) {
        values.forEach((_, idx) => {
          availabilityByIndex.set(Number(idx), true);
          applyButtonState(idx);
        });
        return;
      }

      values.forEach((_, idx) => {
        const allowed = canApplyDraftMutation(() => {
          if (typeof setDraftForIndex === "function") {
            setDraftForIndex(idx);
          }
        });
        availabilityByIndex.set(Number(idx), allowed);
        applyButtonState(idx);
      });
    };

    const scheduleRefresh = ({ forceNow = false } = {}) => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (forceNow) {
        refreshNow();
        return;
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshNow();
      }, 20);
    };

    const registerButton = (idx, btn) => {
      if (!btn) return;
      const key = Number(idx);
      buttonsByIndex.set(key, btn);
      availabilityByIndex.set(key, true);
      applyButtonState(key);
    };

    return {
      applyButtonState,
      scheduleRefresh,
      registerButton,
    };
  };

  /* ================= META ПОД ФОТО ================= */

  const meta = document.createElement("div");
  meta.className = "shop-pd-meta";

  const title = document.createElement("div");
  title.className = "shop-pd-title";
  title.textContent = str(product.name);

  // Цена отображается только в кнопке «В корзину» (shop-pd-action-price)

  const shortDescText = str(product.description_short || "").trim();
  const shortDesc = document.createElement("div");
  shortDesc.className = "shop-pd-short";
  if (shortDescText) shortDesc.textContent = shortDescText;

  meta.appendChild(title);
  if (shortDescText) meta.appendChild(shortDesc);

  scroll.appendChild(meta);

  /* ================= VARIANTS (SHOP) ================= */
  if (Array.isArray(variants) && variants.length) {
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup.values) ? variantGroup.values : [];
    const unitLabel =
      str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();

    const variantWrap = document.createElement("div");
    variantWrap.className = "shop-pd-options";

    const variantTitle = document.createElement("div");
    variantTitle.className = "shop-pd-section-title";
    variantTitle.textContent = variantGroup.title || "Варианты";
    variantWrap.appendChild(variantTitle);

    const valuesWrap = document.createElement("div");
    valuesWrap.className = "shop-pd-option-cards";
    valuesWrap.style.display = "flex";
    valuesWrap.style.gap = "8px";
    valuesWrap.style.overflowX = "auto";
    valuesWrap.style.flexWrap = "nowrap";
    valuesWrap.style.paddingBottom = "4px";

    const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
    const formatValueLabel = (val) => {
      const valueText = str(val);
      if (!valueText) return "";
      if (!unitLabel || hasLetters(valueText)) return valueText;
      return `${valueText} ${unitLabel}`;
    };

    const variantButtonsByIndex = new Map();
    const variantAvailabilityByIndex = new Map();
    let variantAvailabilityRefreshSeq = 0;
    let variantAvailabilityRefreshTimer = null;

    const applyVariantButtonState = (idx) => {
      const btn = variantButtonsByIndex.get(Number(idx));
      if (!btn) return;
      const selectedIdx = Number(variantState.selectedIndex);
      const isSelected = selectedIdx === Number(idx);
      const knownAvailable = variantAvailabilityByIndex.has(Number(idx))
        ? variantAvailabilityByIndex.get(Number(idx)) !== false
        : true;
      const shouldDisable = !knownAvailable && !isSelected;
      btn.classList.toggle("is-unavailable", shouldDisable);
      btn.disabled = shouldDisable;
      btn.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    };

    const applySelectedIndex = (idx) => {
      variantState.selectedIndex = idx;
      variantState.value = values[idx];
      variantState.label = formatValueLabel(values[idx]);
      valuesWrap.querySelectorAll("[data-variant-index]").forEach((btn) => {
        const buttonIndex = Number(btn.dataset.variantIndex);
        btn.classList.toggle("is-selected", buttonIndex === idx);
        applyVariantButtonState(buttonIndex);
      });
    };

    const setSelectedIndex = async (
      idx,
      { showToastOnOut = true, guard = true } = {}
    ) => {
      if (!Number.isFinite(Number(idx))) return false;
      const nextIdx = Number(idx);
      const mutator = () => applySelectedIndex(nextIdx);
      const applied = guard
        ? await runGuardedMutation(mutator, { showToastOnOut })
        : (mutator(), true);
      if (!applied) return false;
      if (typeof onVariantChange === "function") {
        onVariantChange();
      }
      return true;
    };

    const getDraftQtyForVariantCheck = () => {
      const centerText = str(qtyPill?.center?.textContent || "").trim();
      const qtyNum = Number(centerText);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) return 1;
      return qtyNum;
    };

    const refreshVariantAvailabilityNow = () => {
      if (typeof canSelectVariantIndex !== "function" || !values.length) return;
      const desiredQty = getDraftQtyForVariantCheck();

      values.forEach((_, idx) => {
        const available = canSelectVariantIndex(idx, { desiredQty }) !== false;
        variantAvailabilityByIndex.set(Number(idx), available);
        applyVariantButtonState(idx);
      });

      const selectedIdx = Number(variantState.selectedIndex);
      const selectedAvailable =
        !Number.isFinite(selectedIdx) ||
        selectedIdx < 0 ||
        variantAvailabilityByIndex.get(selectedIdx) !== false;

      if (!selectedAvailable) {
        const fallbackIdx = values.findIndex((_, idx) =>
          variantAvailabilityByIndex.get(Number(idx)) !== false
        );
        if (fallbackIdx >= 0 && fallbackIdx !== selectedIdx) {
          setSelectedIndex(fallbackIdx, { showToastOnOut: false, guard: false });
        }
      }
    };

    const scheduleVariantAvailabilityRefresh = ({ forceNow = false } = {}) => {
      if (variantAvailabilityRefreshTimer) {
        clearTimeout(variantAvailabilityRefreshTimer);
        variantAvailabilityRefreshTimer = null;
      }
      if (forceNow) {
        refreshVariantAvailabilityNow();
        return;
      }
      variantAvailabilityRefreshTimer = setTimeout(() => {
        variantAvailabilityRefreshTimer = null;
        refreshVariantAvailabilityNow();
      }, 20);
    };

    registerVariantAvailabilityRefresher(scheduleVariantAvailabilityRefresh);

    values.forEach((value, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-pd-option-card is-clickable";
      btn.style.width = "auto";
      btn.style.flex = "0 0 auto";
      btn.dataset.variantIndex = String(idx);
      btn.textContent = formatValueLabel(value);
      if (variantState.selectedIndex === idx) {
        btn.classList.add("is-selected");
      }
      variantButtonsByIndex.set(Number(idx), btn);
      variantAvailabilityByIndex.set(Number(idx), true);
      applyVariantButtonState(idx);
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        await setSelectedIndex(idx, { showToastOnOut: true, guard: true });
      });
      valuesWrap.appendChild(btn);
    });

    variantWrap.appendChild(valuesWrap);
    scroll.appendChild(variantWrap);

    // Инициализируем выбранный вариант: используем default_value_index из API (индивидуальный или групповой)
    if (Number.isFinite(variantState.selectedIndex) && !variantState.label) {
      void setSelectedIndex(variantState.selectedIndex, {
        showToastOnOut: false,
        guard: false,
      });
    } else if (!Number.isFinite(variantState.selectedIndex) && values.length) {
      // Используем default_value_index (индивидуальный или групповой), если задан, иначе 0
      const defaultIndex = variantGroup.default_value_index != null 
        ? Number(variantGroup.default_value_index) 
        : 0;
      // Проверяем что индекс валидный
      const validIndex = defaultIndex >= 0 && defaultIndex < values.length ? defaultIndex : 0;
      void setSelectedIndex(validIndex, {
        showToastOnOut: false,
        guard: false,
      });
    }

    scheduleVariantAvailabilityRefresh({ showToastOnOut: false, forceNow: true });
  }

  /* ================= OPTIONS (БЕЗ ИЗМЕНЕНИЙ) ================= */

  if (optionGroups.length) {
    const optionsWrap = document.createElement("div");
    optionsWrap.className = "shop-pd-options";

    optionGroups.forEach((group) => {
      const groupState = selectionState.get(group.id);
      const groupType = groupState?.type || getOptionGroupUiType(group);
      const titleText = group.title || "Опция";

      if (groupType === "single") {
        if (
          group?.is_required &&
          (!groupState.selectedId || Number(groupState.selectedId) <= 0)
        ) {
          const first = (group.items || [])[0];
          if (first?.id) groupState.selectedId = Number(first.id);
        }

        const block = document.createElement("div");
        block.className = "shop-pd-option-accordion";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-option-summary";
        titleRow.innerHTML = `<span>${titleText}</span><span></span>`;
        block.appendChild(titleRow);

        const slotWrap = document.createElement("div");
        slotWrap.className = "shop-pd-option-cards";
        block.appendChild(slotWrap);

        const list = document.createElement("div");
        list.className = "shop-pd-option-cards hidden";
        block.appendChild(list);

        const findSelected = () =>
          (group.items || []).find(
            (it) => Number(it.id) === Number(groupState.selectedId)
          ) || null;

        const openList = () => {
          slotWrap.classList.add("hidden");
          list.classList.remove("hidden");
          // При раскрытии прокручиваем карточку так, чтобы блок опции оказался под хедером
          if (block) {
            if (window.requestAnimationFrame) {
              requestAnimationFrame(() => smartScrollIntoView(block));
            } else {
              smartScrollIntoView(block);
            }
          }
        };
        const closeList = () => {
          // Если уже закрыто — ничего не делаем
          if (list.classList.contains("hidden")) return;

          // Плавно схлопываем список по высоте за 300мс.
          // Скролл не трогаем — остаёмся на том же месте.
          slideUp(list, 300, () => {
            slotWrap.classList.remove("hidden");
          });
        };

        function renderSlot() {
          slotWrap.innerHTML = "";
          const selected = findSelected();
          const selectedId = selected ? Number(selected.id) : null;
          
          // Варианты выбранной опции
          const itemVariants = selected && Array.isArray(selected.variants) ? selected.variants : [];
          const hasVariants = itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;
          
          // Функция для расчёта цены с учётом варианта
          const getPriceWithVariant = () => {
            const basePrice = Number(selected?.price || 0);
            if (!selectedId) return basePrice;
            const variantData = groupState.variantByItemId.get(selectedId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          card.style.position = "relative";
          if (hasVariants) {
            card.classList.add("has-variants");
          }

          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";

          const thumb = document.createElement(
            selected?.photo ? "img" : "div"
          );
          thumb.className = "shop-pd-option-thumb";
          if (selected?.photo) thumb.src = selected.photo;
          else thumb.textContent = "—";
          cardContent.appendChild(thumb);

          const info = document.createElement("div");
          info.className = "shop-pd-option-info";
          info.style.flex = "1";
          info.style.minWidth = "0";
          
          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          let variantLabelEl = null;
          if (selected && hasVariants) {
            variantLabelEl = document.createElement("span");
            const savedVariant = groupState.variantByItemId.get(selectedId);
            if (savedVariant && savedVariant.variant_label) {
              variantLabelEl.textContent = savedVariant.variant_label + " ";
            }
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = selected ? str(selected.title) : "Выбрать";
          
          if (variantLabelEl && variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          info.appendChild(firstLine);
          
          // Вторая строка: цена
          const priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          if (selected) {
            priceEl.textContent = money(getPriceWithVariant());
          }
          info.appendChild(priceEl);
          
          cardContent.appendChild(info);

          // ВАЖНО: для single шестерёнка НЕ должна быть на выбранной карточке.
          // Её показываем только внутри списка после "Изменить".

          card.appendChild(cardContent);

          // Кнопка "Изменить" в правом верхнем углу
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "shop-pd-option-edit";
          edit.textContent = "Изменить >";
          edit.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            padding: 4px 8px;
            color: var(--text-muted, #888);
            font-size: 13px;
            cursor: pointer;
            z-index: 10;
          `;
          edit.addEventListener("click", (e) => {
            e.stopPropagation();
            openList();
          });
          card.appendChild(edit);
          card.addEventListener("click", openList);
          slotWrap.appendChild(card);
        }

        // ===== ДОБАВИЛИ "ПУСТУЮ" КАРТОЧКУ ДЛЯ НЕОБЯЗАТЕЛЬНОЙ ОПЦИИ =====
        if (!group?.is_required) {
          const emptyCard = document.createElement("div");
          emptyCard.className = "shop-pd-option-card is-clickable";
          emptyCard.addEventListener("click", () => {
            groupState.selectedId = 0; // сброс выбора
            renderSlot();
            closeList();
            if (onSelectionChange) onSelectionChange();
          });

          emptyCard.innerHTML = `
            <div class="shop-pd-option-thumb">—</div>
            <div class="shop-pd-option-info">
              <div class="shop-pd-option-name">Не выбирать</div>
            </div>
          `;
          list.appendChild(emptyCard);
        }
        // =================================================================

        // Контроллеры аккордеонов вариантов внутри этой группы,
        // чтобы одновременно был открыт только один.
        const singleVariantControllers = [];

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const isOptionUnavailableNow = () => {
            if (!hasOptionProductId) return false;
            const allowed = canApplyDraftMutation(() => {
              groupState.selectedId = itemId;
            });
            return !allowed;
          };
          const isSelectedNow = () => Number(groupState.selectedId || 0) === itemId;
          const shouldHideCardNow = () => !isSelectedNow() && isOptionUnavailableNow();
          if (shouldHideCardNow()) return;
          const allowVariants = Boolean(group.allow_variants);
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          if (hasVariants) card.classList.add("has-variants");
          const refreshOptionCardState = () => {
            const isSelected = isSelectedNow();
            const unavailable = !isSelected && isOptionUnavailableNow();
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
          };
          refreshOptionCardState();

          // content row
          const row = document.createElement("div");
          row.className = "shop-pd-option-card-content";

          row.innerHTML = `
            ${
              item.photo
                ? `<img class="shop-pd-option-thumb" src="${item.photo}">`
                : `<div class="shop-pd-option-thumb">—</div>`
            }
            <div class="shop-pd-option-info">
              <div class="shop-pd-option-name">${str(item.title)}</div>
              ${hasVariants ? `<div class="shop-pd-option-variant-label" style="display:none;"></div>` : ``}
              <div class="shop-pd-option-price">${money(item.price || 0)}</div>
            </div>
          `;

          let variantLabelEl = hasVariants ? row.querySelector(".shop-pd-option-variant-label") : null;
          const priceEl = row.querySelector(".shop-pd-option-price");
          const savedVariant = groupState.variantByItemId.get(itemId);
          
          // Автоматически выбираем дефолтный вариант при рендере, если он ещё не выбран
          if (hasVariants && !savedVariant) {
            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            if (values.length > 0) {
              const unitLabel = str(
                variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || ""
              ).trim();
              const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
              const formatValueLabel = (val) => {
                const valueText = str(val);
                if (!valueText) return "";
                if (!unitLabel || hasLetters(valueText)) return valueText;
                return `${valueText} ${unitLabel}`;
              };
              
              // Определяем дефолтный индекс: сначала из группы, потом первый (0)
              const defaultIdx = variantGroup.default_value_index != null 
                ? Number(variantGroup.default_value_index) 
                : (values.length > 0 ? 0 : null);
              
              if (defaultIdx != null && defaultIdx >= 0 && defaultIdx < values.length) {
                // Рассчитываем цену дефолтного варианта
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
                const priceDiff = unitPrice - Number(item.price || 0);
                
                // Сохраняем дефолтный вариант в state
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                  variant_value_index: defaultIdx,
                  variant_label: formatValueLabel(values[defaultIdx]),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });
                
                // Обновляем отображение цены и лейбла варианта
                if (priceEl) {
                  priceEl.textContent = money(unitPrice);
                }
                if (variantLabelEl) {
                  variantLabelEl.textContent = formatValueLabel(values[defaultIdx]);
                  variantLabelEl.style.display = "block";
                }
              }
            }
          } else if (variantLabelEl && savedVariant?.variant_label) {
            // Если вариант уже выбран, обновляем отображение
            variantLabelEl.textContent = savedVariant.variant_label;
            variantLabelEl.style.display = "block";
            if (priceEl) {
              const basePrice = Number(item.price || 0);
              const priceDiff = savedVariant.variant_price_diff || 0;
              priceEl.textContent = money(basePrice + priceDiff);
            }
          }

          // gear + accordion (only inside list for single)
          let gearBtn = null;
          let variantAccordion = null;
          let accordionOpen = false;

          const setGearState = (open) => {
            accordionOpen = !!open;
            if (!gearBtn || !variantAccordion) return;
            setOptionVariantAccordionState(variantAccordion, accordionOpen);
            gearBtn.classList.toggle("is-open", accordionOpen);
          };

          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (accordionOpen) {
                setGearState(false);
              } else {
                singleVariantControllers.forEach((ctrl) => {
                  if (ctrl.itemId !== itemId) ctrl.setOpen(false);
                });
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                groupState.selectedId = itemId;
                if (typeof onSelectionChange === "function") onSelectionChange();
                setGearState(true);
              }
            });

            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = str(
              variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || ""
            ).trim();
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(itemId, {
                variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(values[idx]),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });
              },
              isOptionItemSelected: () => Number(groupState.selectedId || 0) === itemId,
            });
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);
              if (selectedIdx === idx) {
                variantBtn.style.background = "var(--accent-color, #ff7a00)";
                variantBtn.style.color = "#fff";
                variantBtn.style.borderColor = "var(--accent-color, #ff7a00)";
              }

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;

                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                const applied = await runGuardedMutation(() => {

                // 1) Фиксируем выбранный вариант для этой опции
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(value),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });

                // 2) Сразу считаем, что выбран именно этот товар-опция
                //    (последний кликнутый вариант = актуальный выбор группы)
                groupState.selectedId = itemId;
                }, { showToastOnOut: true });
                if (!applied) return;

                // 3) Мгновенно обновляем цену и вариант в карточке списка
                if (priceEl) {
                  const base = Number(item.price || 0);
                  const diff = Number.isFinite(priceDiff) ? priceDiff : 0;
                  priceEl.textContent = money(base + diff);
                }

                // 4) Перекрашиваем кнопки вариантов в скролле
                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  const isSel = btnIdx === idx;
                  btn.classList.toggle("is-selected", isSel);
                  if (isSel) {
                    btn.style.background = "var(--accent-color, #ff7a00)";
                    btn.style.color = "#fff";
                    btn.style.borderColor = "var(--accent-color, #ff7a00)";
                  } else {
                    btn.style.background = "var(--bg-secondary, #f5f5f5)";
                    btn.style.color = "var(--text-primary, #333)";
                    btn.style.borderColor = "var(--border-color, #ddd)";
                  }
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                // 5) Обновляем подпись варианта в первой строке (вариант + название)
                if (variantLabelEl) {
                  variantLabelEl.textContent = formatValueLabel(value) + " ";
                }

                // 6) Обновляем summary-карточку, чтобы сверху сразу отобразился новый вариант
                renderSlot();

                // 7) Уведомляем об изменении — пересчёт цены на кнопке "В корзину" и т.п.
                if (typeof onSelectionChange === "function") onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);
            row.appendChild(gearBtn);

            // Регистрируем контроллер для управления открытым аккордеоном
            singleVariantControllers.push({
              itemId,
              setOpen: setGearState,
            });
          }

          card.appendChild(row);
          if (variantAccordion) card.appendChild(variantAccordion);

          // Выбор товара (клик по карточке) — но не по шестерёнке/вариантам
          card.addEventListener("click", async (e) => {
            if (e.target.closest(".shop-pd-option-gear-btn") || e.target.closest(".shop-pd-option-variant-accordion")) {
              return;
            }
            if (Number(groupState.selectedId || 0) !== itemId && isOptionUnavailableNow()) {
              showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
              return;
            }
            const applied = runGuardedMutation(() => {
              groupState.selectedId = itemId;
              if (hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                setDefaultVariantForOptionItem(item, groupState.variantByItemId);
              }
            }, { showToastOnOut: true });
            if (!applied) return;
            renderSlot();
            closeList();
            if (typeof onSelectionChange === "function") onSelectionChange();
          });

          // Доступность рассчитывается локально в isOptionUnavailableNow()

          list.appendChild(card);
        });

        renderSlot();
        optionsWrap.appendChild(block);
        return;
      }

      // Обработка типа "multiple_group" - несколько товаров с общим лимитом группы
      if (groupType === "multiple_group") {
        const allowVariants = Boolean(group.allow_variants);
        const block = document.createElement("div");
        block.className = "shop-pd-option-block";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-section-title";
        const minSelect = groupState.minSelect ?? group.min_select ?? 0;
        const maxSelect = groupState.maxSelect ?? group.max_select ?? null;
        const limitText = minSelect > 0 || maxSelect != null 
          ? ` (${minSelect > 0 ? `мин: ${minSelect}` : ""}${minSelect > 0 && maxSelect != null ? ", " : ""}${maxSelect != null ? `макс: ${maxSelect}` : ""})`
          : "";
        titleRow.textContent = `${titleText}${limitText}`;
        block.appendChild(titleRow);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "shop-pd-option-cards";
        block.appendChild(itemsWrap);

        const updateSelectedCount = () => {
          const selectedCount = groupState.selectedIds.size;
          const isValid = (minSelect === 0 || selectedCount >= minSelect) && 
                         (maxSelect == null || selectedCount <= maxSelect);
          
          // Обновляем состояние валидности (можно добавить визуальную индикацию)
          return { count: selectedCount, isValid };
        };

        // Контроллеры аккордеонов вариантов для multiple_group,
        // чтобы одновременно был открыт только один.
        const multiVariantControllers = [];

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const isOptionUnavailableNow = () => {
            if (!hasOptionProductId) return false;
            const allowed = canApplyDraftMutation(() => {
              groupState.selectedIds.add(itemId);
            });
            return !allowed;
          };
          const isSelectedNow = () => groupState.selectedIds.has(itemId);
          if (!isSelectedNow() && isOptionUnavailableNow()) return;
          const isSelected = isSelectedNow();

          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = `shop-pd-option-card is-clickable ${isSelected ? "is-selected" : ""}`;
          card.classList.toggle("is-unavailable", !isSelected && isOptionUnavailableNow());
          if (hasVariants) {
            card.classList.add("has-variants");
          }
          
          // Функция для расчёта цены с учётом варианта
          const getPriceWithVariant = () => {
            const basePrice = Number(item.price || 0);
            const variantData = groupState.variantByItemId.get(itemId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };
          
          const checkbox = document.createElement("span");
          checkbox.className = "shop-pd-option-radio" + (isSelected ? " is-checked" : "");
          checkbox.checked = isSelected;
          
          // Элементы для обновления
          let priceEl = null;
          let variantLabelEl = null;
          
          const updateCard = () => {
            const newIsSelected = isSelectedNow();
            const unavailable = !newIsSelected && isOptionUnavailableNow();
            card.classList.toggle("is-selected", newIsSelected);
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
            checkbox.checked = newIsSelected;
            checkbox.classList.toggle("is-checked", newIsSelected);
            if (priceEl) {
              priceEl.textContent = money(getPriceWithVariant());
            }
            if (variantLabelEl) {
              const variantData = groupState.variantByItemId.get(itemId);
              if (variantData && variantData.variant_label) {
                variantLabelEl.textContent = variantData.variant_label + " ";
              } else {
                variantLabelEl.textContent = "";
              }
            }
          };
          
          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";

          // Фото
          if (item.photo) {
            const img = createOptimizedImage(item.photo, {
              type: 'thumb',
              className: 'shop-pd-option-thumb',
              alt: ''
            });
            cardContent.appendChild(img);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "shop-pd-option-thumb";
            placeholder.textContent = "—";
            cardContent.appendChild(placeholder);
          }

          // Информация
          const infoWrap = document.createElement("div");
          infoWrap.className = "shop-pd-option-info";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          if (hasVariants) {
            variantLabelEl = document.createElement("span");
            const savedVariant = groupState.variantByItemId.get(itemId);
            if (savedVariant && savedVariant.variant_label) {
              variantLabelEl.textContent = savedVariant.variant_label + " ";
            }
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = str(item.title);
          
          if (variantLabelEl && variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          infoWrap.appendChild(firstLine);

          // Вторая строка: цена
          priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          priceEl.textContent = money(getPriceWithVariant());
          infoWrap.appendChild(priceEl);

          cardContent.appendChild(infoWrap);

          // Шестерёнка для вариантов
          let gearBtn = null;
          let variantAccordion = null;
          
          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            cardContent.appendChild(gearBtn);
            cardContent.appendChild(checkbox);

            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();
            
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(itemId, {
                variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(values[idx]),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });
              },
              isOptionItemSelected: () => groupState.selectedIds.has(itemId),
            });
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;
                
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                const applyVariantChange = () => {
                  groupState.variantByItemId.set(itemId, {
                    variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                    variant_value_index: idx,
                    variant_label: formatValueLabel(value),
                    variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                  });
                };
                if (groupState.selectedIds.has(itemId)) {
                  const applied = await runGuardedMutation(applyVariantChange, {
                    showToastOnOut: true,
                  });
                  if (!applied) return;
                } else {
                  applyVariantChange();
                }

                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  btn.classList.toggle("is-selected", btnIdx === idx);
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                updateCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);

            let accordionOpen = false;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              if (accordionOpen) {
                // Перед открытием закрываем другие аккордеоны в группе
                multiVariantControllers.forEach((ctrl) => {
                  if (ctrl.itemId !== itemId) ctrl.close();
                });
                // Дефолтный подсвеченный вариант
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                setOptionVariantAccordionState(variantAccordion, true);
                gearBtn.classList.add("is-open");
                updateCard();
                if (typeof onSelectionChange === "function") onSelectionChange();
              } else {
                setOptionVariantAccordionState(variantAccordion, false);
                gearBtn.classList.remove("is-open");
              }
            });

            // Регистрируем контроллер, чтобы можно было закрыть этот аккордеон при открытии другого
            multiVariantControllers.push({
              itemId,
              close: () => {
                accordionOpen = false;
                setOptionVariantAccordionState(variantAccordion, false);
                gearBtn.classList.remove("is-open");
              },
            });
          }

          // Если нет вариантов — чекбокс добавляем после инфо (справа)
          if (!hasVariants) {
            cardContent.appendChild(checkbox);
          }

          card.appendChild(cardContent);

          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          card.addEventListener("click", async (e) => {
            // Не переключаем если кликнули на шестерёнку или вариант
            if (e.target.closest(".shop-pd-option-gear-btn") || e.target.closest(".shop-pd-option-variant-accordion")) {
              return;
            }

            const { count } = updateSelectedCount();
            const currentlySelected = groupState.selectedIds.has(itemId);
            const maxReached = maxSelect != null && count >= maxSelect && !currentlySelected;
            
            if (maxReached) {
              return;
            }

            if (currentlySelected) {
              groupState.selectedIds.delete(itemId);
            } else {
              if (isOptionUnavailableNow()) {
                showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
                return;
              }
              const applied = runGuardedMutation(() => {
                groupState.selectedIds.add(itemId);
                if (hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
              }, { showToastOnOut: true });
              if (!applied) return;
            }

            updateCard();
            if (onSelectionChange) onSelectionChange();
          });
          
          itemsWrap.appendChild(card);

        });

        optionsWrap.appendChild(block);
        return;
      }

      // Обработка типа "multiple_item" - несколько товаров с индивидуальными лимитами
      if (groupType === "multiple_item") {
        const allowVariants = Boolean(group.allow_variants);
        const block = document.createElement("div");
        block.className = "shop-pd-option-block";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-section-title";
        titleRow.textContent = titleText;
        block.appendChild(titleRow);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "shop-pd-option-cards";
        block.appendChild(itemsWrap);

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const itemMin = item.qty_min ?? 1;
          const itemMax = item.qty_max ?? 1;
          const canApplyOptionQtyMutation = (nextQty) => {
            if (!hasOptionProductId) return true;
            const safeQty = Math.max(0, Number(nextQty || 0));
            return canApplyDraftMutation(() => {
              if (safeQty > 0) groupState.qtyById.set(itemId, safeQty);
              else groupState.qtyById.delete(itemId);
            });
          };
          const isOptionUnavailableNow = () => {
            const currentOptQty = groupState.qtyById.get(itemId) || 0;
            const targetQty = Math.max(currentOptQty, 1);
            return !canApplyOptionQtyMutation(targetQty);
          };
          const isOptionUnavailableForPlus = () => {
            const currentOptQty = groupState.qtyById.get(itemId) || 0;
            const nextQty = currentOptQty === 0
              ? Math.max(itemMin, 1)
              : Math.min(itemMax, currentOptQty + 1);
            if (nextQty <= currentOptQty) return false;
            return !canApplyOptionQtyMutation(nextQty);
          };
          const isSelectedNow = () => (Number(groupState.qtyById.get(itemId)) || 0) > 0;
          if (!isSelectedNow() && isOptionUnavailableNow()) return;
          // Текущее количество из state
          const currentQty = groupState.qtyById.get(itemId) || 0;
          const isSelected = currentQty > 0;
          
          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = `shop-pd-option-card ${isSelected ? "is-selected" : ""}`;
          card.classList.toggle("is-unavailable", !isSelected && isOptionUnavailableNow());

          const qtyControls = document.createElement("div");
          qtyControls.className = "shop-pd-option-qty-controls";
          qtyControls.style.display = "flex";
          qtyControls.style.gap = "8px";
          qtyControls.style.alignItems = "center";
          qtyControls.style.marginLeft = "auto";

          const btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.className = "btn btn-sm shop-pd-option-qty-btn";
          btnMinus.textContent = "−";
          // Кнопка "-" отключена если qty <= itemMin (обязательные опции нельзя убрать)
          btnMinus.disabled = currentQty <= itemMin;
          btnMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = groupState.qtyById.get(itemId) || 0;
            // Уменьшаем, но не ниже itemMin
            const newQty = Math.max(itemMin, current - 1);
            if (newQty > 0) {
              groupState.qtyById.set(itemId, newQty);
              if (hasVariants && typeof setDefaultVariantForOptionItem === "function") setDefaultVariantForOptionItem(item, groupState.variantByItemId);
            } else {
              groupState.qtyById.delete(itemId);
            }
            updateItemCard();
            if (onSelectionChange) onSelectionChange();
          });

          const qtyDisplay = document.createElement("span");
          qtyDisplay.style.minWidth = "24px";
          qtyDisplay.style.textAlign = "center";
          qtyDisplay.textContent = String(currentQty);

          const btnPlus = document.createElement("button");
          btnPlus.type = "button";
          btnPlus.className = "btn btn-sm shop-pd-option-qty-btn";
          btnPlus.textContent = "+";
          btnPlus.disabled = currentQty >= itemMax || isOptionUnavailableForPlus();

          const bindPressFx = (btn) => {
            if (!btn) return;
            const pressOn = () => {
              if (btn.disabled) return;
              btn.classList.add("is-pressed");
            };
            const pressOff = () => btn.classList.remove("is-pressed");
            btn.addEventListener("pointerdown", pressOn);
            btn.addEventListener("pointerup", pressOff);
            btn.addEventListener("pointercancel", pressOff);
            btn.addEventListener("pointerleave", pressOff);
            btn.addEventListener("blur", pressOff);
          };
          bindPressFx(btnMinus);
          bindPressFx(btnPlus);
          btnPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isOptionUnavailableForPlus()) {
              btnPlus.disabled = true;
              showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
              return;
            }
            const current = groupState.qtyById.get(itemId) || 0;
            let newQty;
            if (current === 0) {
              newQty = Math.max(itemMin, 1);
            } else {
              newQty = Math.min(itemMax, current + 1);
            }
            const applied = runGuardedMutation(() => {
              groupState.qtyById.set(itemId, newQty);
              if (newQty > 0 && hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                setDefaultVariantForOptionItem(item, groupState.variantByItemId);
              }
            }, { showToastOnOut: true });
            if (!applied) {
              btnPlus.disabled = true;
              return;
            }
            updateItemCard();
            if (onSelectionChange) onSelectionChange();
          });

          qtyControls.appendChild(btnMinus);
          qtyControls.appendChild(qtyDisplay);
          qtyControls.appendChild(btnPlus);

          // Функция для расчёта цены опции с учётом варианта
          const getItemPriceWithVariant = () => {
            const basePrice = Number(item.price || 0);
            const variantData = groupState.variantByItemId.get(itemId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };

          // Элемент для отображения выбранного варианта
          let variantLabelEl = null;
          let priceEl = null;
          let _optionVariantCtrl = null;

          const updateItemCard = () => {
            const newQty = groupState.qtyById.get(itemId) || 0;
            const newIsSelected = newQty > 0;
            const unavailable = !newIsSelected && isOptionUnavailableNow();
            card.classList.toggle("is-selected", newIsSelected);
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
            qtyDisplay.textContent = String(newQty);
            // Кнопка "-" отключена если qty <= itemMin (обязательные опции нельзя убрать)
            btnMinus.disabled = newQty <= itemMin;
            btnPlus.disabled = newQty >= itemMax || isOptionUnavailableForPlus();

            // Обновляем цену с учётом варианта
            if (priceEl) {
              priceEl.textContent = money(getItemPriceWithVariant());
            }

            // Обновляем отображение выбранного варианта
            if (variantLabelEl) {
              const variantData = groupState.variantByItemId.get(itemId);
              if (variantData && variantData.variant_label) {
                variantLabelEl.textContent = variantData.variant_label + " ";
              } else {
                variantLabelEl.textContent = "";
              }
            }

            // Обновляем доступность вариантов при изменении qty
            if (_optionVariantCtrl) {
              _optionVariantCtrl.scheduleRefresh();
            }
          };

          // Создаём основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";
          cardContent.style.display = "flex";
          cardContent.style.alignItems = "center";
          cardContent.style.width = "100%";
          cardContent.style.gap = "8px";

          // Фото
          if (item.photo) {
            const img = createOptimizedImage(item.photo, {
              type: 'thumb',
              className: 'shop-pd-option-thumb',
              alt: ''
            });
            cardContent.appendChild(img);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "shop-pd-option-thumb";
            placeholder.textContent = "—";
            cardContent.appendChild(placeholder);
          }

          // Информация (название, вариант, цена)
          const infoWrap = document.createElement("div");
          infoWrap.className = "shop-pd-option-info";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          variantLabelEl = document.createElement("span");
          variantLabelEl.style.fontSize = "inherit";
          variantLabelEl.style.fontWeight = "inherit";
          variantLabelEl.style.color = "inherit";
          const savedVariant = groupState.variantByItemId.get(itemId);
          if (savedVariant && savedVariant.variant_label) {
            variantLabelEl.textContent = savedVariant.variant_label + " ";
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = str(item.title);
          
          if (variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          infoWrap.appendChild(firstLine);

          // Вторая строка: цена
          priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          priceEl.textContent = money(getItemPriceWithVariant());
          infoWrap.appendChild(priceEl);

          cardContent.appendChild(infoWrap);

          // Шестерёнка для вариантов (если есть варианты)
          let gearBtn = null;
          let variantAccordion = null;
          
          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll для мыши
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            // Рендерим варианты (берём первую группу)
            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();
            
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            // Текущий выбранный индекс
            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(itemId, {
                variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(values[idx]),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });
              },
              isOptionItemSelected: () => (Number(groupState.qtyById.get(itemId)) || 0) > 0,
            });
            _optionVariantCtrl = optionVariantAvailabilityCtrl;
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;

                // Обновляем выбранный вариант в state
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);

                const applyVariantChange = () => {
                  groupState.variantByItemId.set(itemId, {
                    variant_group_id: Number(variantGroup.variant_group_id || variantGroup.id || 0),
                    variant_value_index: idx,
                    variant_label: formatValueLabel(value),
                    variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                  });
                };
                if ((Number(groupState.qtyById.get(itemId)) || 0) > 0) {
                  const applied = await runGuardedMutation(applyVariantChange, {
                    showToastOnOut: true,
                  });
                  if (!applied) return;
                } else {
                  applyVariantChange();
                }

                // Обновляем UI всех кнопок вариантов
                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  btn.classList.toggle("is-selected", btnIdx === idx);
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                // Обновляем карточку (цена, лейбл варианта)
                updateItemCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);

            let accordionOpen = false;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              if (accordionOpen) {
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                if (typeof onSelectionChange === "function") onSelectionChange();
              }
              setOptionVariantAccordionState(variantAccordion, accordionOpen);
              gearBtn.classList.toggle("is-open", accordionOpen);
            });

            cardContent.appendChild(gearBtn);
          }

          cardContent.appendChild(qtyControls);
          card.appendChild(cardContent);
          
          // Добавляем аккордеон после основного контента
          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          if (hasVariants) {
            card.classList.add("has-variants");
          }

          itemsWrap.appendChild(card);

        });

        optionsWrap.appendChild(block);
        return;
      }
    });

    scroll.appendChild(optionsWrap);
  }

  /* ================= INGREDIENTS ================= */
  if (ingredients && ingredients.length > 0) {
    const ingredientsWrap = document.createElement("div");
    ingredientsWrap.className = "shop-pd-ingredients";

    const title = document.createElement("div");
    title.className = "shop-pd-section-title";
    title.textContent = "Состав (можно настроить):";
    ingredientsWrap.appendChild(title);

    const ingredientsCards = document.createElement("div");
    ingredientsCards.className = "shop-pd-option-cards";
    ingredientsWrap.appendChild(ingredientsCards);

    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const hasIngredientProductId = Number.isFinite(ingId) && ingId > 0;
      const isIngUnavailableForPlus = () => {
        if (!hasIngredientProductId) return false;
        const currentIngQty = Number(ingredientState?.get(ingId)?.quantity ?? ing.quantity ?? 1);
        const step = Number(ing.quantity_step || 1) || 1;
        const nextQty = currentIngQty + step;
        const allowed = canApplyDraftMutation(() => {
          const stateEntry = ingredientState.get(ingId);
          const nextState = stateEntry && typeof stateEntry === "object"
            ? { ...stateEntry, quantity: nextQty }
            : { quantity: nextQty };
          ingredientState.set(ingId, nextState);
        });
        return !allowed;
      };
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const state = (() => {
        const entry = ingredientState?.get(ingId);
        if (entry && typeof entry === "object") return { ...entry };
        return {
        quantity: Number(ing.quantity ?? 1),
        };
      })();

      // Получаем min/max/step из данных ингредиента (для переменного: null/не число min = 0, иначе defaultQty)
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      
      // Начальное количество: берем из state или из ing.quantity, затем ограничиваем и округляем до шага
      let initialQty = isVariable ? (state.quantity ?? defaultQty) : defaultQty;
      initialQty = Math.max(min, Math.min(max, initialQty));
      
      // Округляем до шага при инициализации (относительно min)
      let currentQty = initialQty;
      if (step > 0) {
        // Формула: min + round((value - min) / step) * step
        const stepsFromMin = Math.round((initialQty - min) / step);
        currentQty = min + (stepsFromMin * step);
        // Убеждаемся, что после округления значение все еще в пределах min/max
        currentQty = Math.max(min, Math.min(max, currentQty));
      }
      
      // Сохраняем округленное значение в state
      state.quantity = currentQty;
      ingredientState?.set(ingId, state);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      
      // Рассчитываем цену за единицу с учетом base_qty (как в админке)
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      
      // Цена текущего количества
      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const currentTotalPrice = currentQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * currentQtyInBase : 0;
      
      // Цена базового количества (из БД)
      const baseQty = Number(ing.quantity ?? 1);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const baseTotalPrice = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      
      // Разница от базового состава
      const totalPrice = currentTotalPrice - baseTotalPrice;

      const block = document.createElement("div");
      block.className = "shop-pd-option-card";
      block.setAttribute("data-ingredient-id", ingId);

      const cardContent = document.createElement("div");
      cardContent.className = "shop-pd-option-card-content";
      cardContent.style.display = "flex";
      cardContent.style.alignItems = "center";
      cardContent.style.width = "100%";
      cardContent.style.gap = "8px";

      const photo = document.createElement("div");
      photo.className = "shop-pd-option-thumb";
      if (ing.ingredient_photos && ing.ingredient_photos.length > 0) {
        const img = createOptimizedImage(ing.ingredient_photos[0], {
          type: 'thumb',
          className: '',
          alt: ''
        });
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        photo.appendChild(img);
      } else {
        photo.textContent = "—";
      }

      const info = document.createElement("div");
      info.className = "shop-pd-option-info";
      info.style.flex = "1";
      info.style.minWidth = "0";

      const name = document.createElement("div");
      name.className = "shop-pd-option-name";
      name.textContent = ing.ingredient_name || "";

      if (isVariable) {
        // Variable ingredient - show controls
        const controls = document.createElement("div");
        controls.className = "shop-pd-ingredient-controls";
        controls.style.display = "flex";
        controls.style.alignItems = "center";
        controls.style.gap = "8px";

        const btnMinus = document.createElement("button");
        btnMinus.type = "button";
        btnMinus.className = "btn btn-sm qty-btn qty-minus";
        btnMinus.textContent = "−";
        btnMinus.disabled = currentQty <= min;

        const qtyDisplay = document.createElement("div");
        qtyDisplay.className = "qty-display";
        qtyDisplay.textContent = `${currentQty} ${unitLabel}`;

        const btnPlus = document.createElement("button");
        btnPlus.type = "button";
        btnPlus.className = "btn btn-sm qty-btn qty-plus";
        btnPlus.textContent = "+";
        btnPlus.disabled = currentQty >= max || isIngUnavailableForPlus();

        const bindPressFx = (btn) => {
          if (!btn) return;
          const pressOn = () => {
            if (btn.disabled) return;
            btn.classList.add("is-pressed");
          };
          const pressOff = () => btn.classList.remove("is-pressed");
          btn.addEventListener("pointerdown", pressOn);
          btn.addEventListener("pointerup", pressOff);
          btn.addEventListener("pointercancel", pressOff);
          btn.addEventListener("pointerleave", pressOff);
          btn.addEventListener("blur", pressOff);
        };
        bindPressFx(btnMinus);
        bindPressFx(btnPlus);

        controls.appendChild(btnMinus);
        controls.appendChild(qtyDisplay);
        controls.appendChild(btnPlus);

        const priceInfo = document.createElement("div");
        priceInfo.className = "shop-pd-option-price";
        // Всегда создаем элемент ingredient-total, скрываем если 0
        const priceSign = totalPrice >= 0 ? "+" : "";
        priceInfo.innerHTML = `
          <div class="ingredient-total">${Math.abs(totalPrice) > 0.01 ? `${priceSign}${money(totalPrice)}` : ""}</div>
        `;
        if (Math.abs(totalPrice) <= 0.01) {
          priceInfo.style.display = "none";
        }

        info.appendChild(name);
        info.appendChild(priceInfo);
        
        cardContent.appendChild(photo);
        cardContent.appendChild(info);
        cardContent.appendChild(controls);

        // Handlers: минус — вычитаем шаг, округляем до шага от min, ограничиваем min..max
        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
          let newQty = currentStateQty - step;
          // Для переменного: если после вычитания получилось ≤0 — разрешаем 0 (на случай если min в данных не 0)
          if (isVariable && newQty <= 0) {
            newQty = 0;
          } else {
            if (step > 0) {
              const stepsFromMin = Math.round((newQty - min) / step);
              newQty = min + (stepsFromMin * step);
            }
            newQty = Math.max(min, Math.min(max, newQty));
          }
          if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
            const prevState = ingredientState?.get(ingId);
            const nextState = prevState && typeof prevState === "object"
              ? { ...prevState, quantity: newQty }
              : { quantity: newQty };
            ingredientState?.set(ingId, nextState);
            onIngredientChange();
          }
        });

        btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          if (isIngUnavailableForPlus()) {
            btnPlus.disabled = true;
            showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
            return;
          }
          const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
          let newQty = currentStateQty + step;
          if (step > 0) {
            const stepsFromMin = Math.round((newQty - min) / step);
            newQty = min + (stepsFromMin * step);
          }
          newQty = Math.max(min, Math.min(max, newQty));
          if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
            const applied = runGuardedMutation(() => {
              const prevState = ingredientState?.get(ingId);
              const nextState = prevState && typeof prevState === "object"
                ? { ...prevState, quantity: newQty }
                : { quantity: newQty };
              ingredientState?.set(ingId, nextState);
            }, { showToastOnOut: true });
            if (!applied) {
              btnPlus.disabled = true;
              return;
            }
            onIngredientChange();
          }
        });

      } else {
        // Fixed ingredient - show only info
        const qtyInfo = document.createElement("div");
        qtyInfo.className = "shop-pd-option-price";
        qtyInfo.style.fontSize = "13px";
        qtyInfo.style.color = "var(--text-muted, #888)";
        qtyInfo.textContent = `${currentQty} ${unitLabel}`;

        const priceInfo = document.createElement("div");
        priceInfo.className = "shop-pd-option-price";
        priceInfo.innerHTML = `
          <div class="ingredient-total">+${money(totalPrice)}</div>
        `;

        info.appendChild(name);
        info.appendChild(qtyInfo);
        info.appendChild(priceInfo);
        
        cardContent.appendChild(photo);
        cardContent.appendChild(info);
      }

      block.appendChild(cardContent);

      ingredientsCards.appendChild(block);
    });

    scroll.appendChild(ingredientsWrap);
  }

  if (product.description) {
    const acc = document.createElement("details");
    acc.className = "shop-pd-accordion";
    acc.innerHTML = `
      <summary class="shop-pd-accordion-summary">
        <span>Описание</span>
        <span class="shop-pd-accordion-toggle">
          <i class="fas fa-chevron-down"></i>
        </span>
      </summary>
      <div class="shop-pd-accordion-body">${str(product.description)}</div>
    `;
    scroll.appendChild(acc);
  }

  wrap.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "shop-pd-footer";

  const qtyWrap = document.createElement("div");
  qtyWrap.className = "qty-pill-wrap";
  if (qtyPill?.pill) qtyWrap.appendChild(qtyPill.pill);

  // ===== qty pill handlers (ТОЛЬКО ПОДКЛЮЧИЛИ КЛИКИ) =====
  if (qtyPill?.btnMinus && typeof onQtyMinus === "function") {
    qtyPill.btnMinus.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyMinus();
    });
  }

  if (qtyPill?.btnPlus && typeof onQtyPlus === "function") {
    qtyPill.btnPlus.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyPlus();
    });
  }

  if (qtyPill?.center && typeof onQtyCenterClick === "function") {
    qtyPill.center.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyCenterClick();
    });
  }
  // =======================================================

  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.className = "shop-checkout-btn shop-pd-action";

  footer.appendChild(qtyWrap);
  footer.appendChild(actionBtn);
  wrap.appendChild(footer);

  return { wrap, actionBtn, qtyWrap, basePriceEl: null, refreshVariantAvailability };
}


function buildShopProductHero(product, { onBack } = {}) {
  const images = Array.isArray(product.images) && product.images.length
    ? product.images
    : [];

  let activeIndex = 0;

  const hero = document.createElement("div");
  hero.className = "shop-product-hero";

  /* ================= Media ================= */
  const media = document.createElement("div");
  media.className = "shop-product-hero-media";

  const img = createOptimizedImage(images[0] || "", {
    type: 'product-hero',
    className: 'shop-product-hero-image',
    alt: product.title || "",
    usePicture: true,
    priority: true,
  });

  media.appendChild(img);

  /* ================= Overlay header ================= */
  const header = document.createElement("div");
  header.className = "shop-product-hero-header";

  const backBtn = document.createElement("button");
  backBtn.className = "shop-product-hero-back";
  backBtn.type = "button";
  backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
  backBtn.addEventListener("click", () => {
    if (typeof onBack === "function") onBack();
  });

  const favBtn = document.createElement("button");
  favBtn.className = "shop-product-hero-fav";
  favBtn.type = "button";
  favBtn.innerHTML = '<i class="fas fa-heart"></i>';

  header.appendChild(backBtn);
  header.appendChild(favBtn);
  media.appendChild(header);

  hero.appendChild(media);

  /* ================= Pagination ================= */
  if (images.length > 1) {
    const dots = document.createElement("div");
    dots.className = "shop-product-hero-dots";

    images.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "shop-product-hero-dot" + (i === 0 ? " is-active" : "");

      dot.addEventListener("click", () => {
        if (activeIndex === i) return;
        activeIndex = i;
        img.src = images[i];

        dots.querySelectorAll(".shop-product-hero-dot").forEach((d, idx) => {
          d.classList.toggle("is-active", idx === i);
        });
      });

      dots.appendChild(dot);
    });

    hero.appendChild(dots);
  }

  /* ================= Meta ================= */
  const meta = document.createElement("div");
  meta.className = "shop-product-hero-meta";

  const title = document.createElement("h1");
  title.className = "shop-product-hero-title";
  title.textContent = product.title || "";

  meta.appendChild(title);

  hero.appendChild(meta);

  return hero;
}


async function renderProductDetailsInto(container, product, { onBack, cartKey, prefillItem } = {}) {
  if (!container) return;
  const productIdForRender = Number(product?.id || 0);
  const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
  const isStaticProductView = !cartKey && !prefillItem;
  const canReuseStaticProductView =
    !isMobileViewport &&
    isStaticProductView &&
    Number.isFinite(productIdForRender) &&
    productIdForRender > 0 &&
    container.__shopRenderedViewType === "product" &&
    Number(container.__shopRenderedProductId || 0) === productIdForRender;
  if (canReuseStaticProductView) return;

  if (!isStaticProductView) {
    container.__shopRenderedViewType = "";
    container.__shopRenderedProductId = "";
    container.__shopRenderedComboId = "";
    container.__shopRenderedComboMain = false;
  }

  container.innerHTML = "";

  const {
    optionGroups,
    ingredients,
    variants,
  } = await resolveProductDetailsConfig(product.id);
  const selectionState = new Map();
  const ingredientState = new Map();
  const variantState = {
    groupId: variants[0]?.id ?? null,
    selectedIndex: null,
    value: null,
    label: "",
  };
  
  // TODO: Интегрировать варианты в UI (отображение выбора варианта, расчет цены с учетом варианта и скидок)
  // Варианты доступны в переменной variants, но пока не отображаются в UI

  // Initialize ingredient state with proper min/max/step handling
  ingredients.forEach(ing => {
    const defaultQty = Number(ing.quantity ?? 1);
    const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
    const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
    const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
    const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
    const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
    
    // Начальное количество: ограничиваем min/max и округляем до шага (относительно min)
    let initialQty = isVariable ? defaultQty : defaultQty;
    initialQty = Math.max(min, Math.min(max, initialQty));
    
    // Округляем до шага (относительно min)
    if (step > 0) {
      const stepsFromMin = Math.round((initialQty - min) / step);
      initialQty = min + (stepsFromMin * step);
      initialQty = Math.max(min, Math.min(max, initialQty));
    }
    
    ingredientState.set(Number(ing.ingredient_id), {
      quantity: initialQty,
    });
  });

  const editingItem = cartKey ? getCartItemByKey(cartKey) : null;
  const seedItem =
    editingItem && typeof editingItem === "object"
      ? editingItem
      : (prefillItem && typeof prefillItem === "object" ? prefillItem : null);
  const editMode = !!editingItem;
  const productId = Number(product?.id || 0);
  const stockAvailable = isProductAvailable(product);
  const remainingStockForProduct =
    Number.isFinite(productId) &&
    productId > 0 &&
    typeof getAvailableStock === "function"
      ? getAvailableStock(productId)
      : Infinity;
  const blockedByProductStockLimit =
    !editMode &&
    Number.isFinite(remainingStockForProduct) &&
    remainingStockForProduct <= 0;
  const blockedByIngredientRequirements =
    !editMode &&
    Number.isFinite(productId) &&
    productId > 0 &&
    typeof isProductBlockedByIngredientRequirements === "function"
      ? isProductBlockedByIngredientRequirements(productId)
      : false;
  const available = stockAvailable && !blockedByProductStockLimit && !blockedByIngredientRequirements;

  const editVariantGroupIdRaw = seedItem?.variant_group_id ?? seedItem?.variant?.variant_group_id;
  const editVariantValueIndexRaw = seedItem?.variant_value_index ?? seedItem?.variant?.variant_value_index;
  const editVariantGroupId =
    editVariantGroupIdRaw === undefined || editVariantGroupIdRaw === null || editVariantGroupIdRaw === ""
      ? null
      : Number(editVariantGroupIdRaw);
  const editVariantValueIndex =
    editVariantValueIndexRaw === undefined || editVariantValueIndexRaw === null || editVariantValueIndexRaw === ""
      ? null
      : Number(editVariantValueIndexRaw);

  if (
    seedItem &&
    Number.isFinite(editVariantGroupId) &&
    editVariantGroupId > 0 &&
    Number.isFinite(editVariantValueIndex) &&
    editVariantValueIndex >= 0
  ) {
    variantState.groupId = editVariantGroupId;
    variantState.selectedIndex = editVariantValueIndex;
    variantState.label = str(seedItem.variant_label || seedItem?.variant?.label || seedItem?.variant?.value || "");
  }

  // Restore ingredient quantities from cart if editing
  if (seedItem && Array.isArray(seedItem.ingredients)) {
    seedItem.ingredients.forEach(cartIng => {
      const ingId = Number(cartIng.ingredient_id);
      if (ingredientState.has(ingId)) {
        const ing = ingredients.find(i => Number(i.ingredient_id) === ingId);
        if (!ing) return;
        
        const defaultQty = Number(ing.quantity ?? 1);
        const isVariableIng = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
        const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
        const min = rawMin !== null ? rawMin : (isVariableIng ? 0 : defaultQty);
        const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
        const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
        
        // Берем количество из корзины, нормализуем до допустимого (кратное шагу от min)
        let qty = Number(cartIng.quantity ?? 1);
        qty = Math.max(min, Math.min(max, qty));
        
        // Округляем до шага (относительно min)
        if (step > 0) {
          const stepsFromMin = Math.round((qty - min) / step);
          qty = min + (stepsFromMin * step);
          qty = Math.max(min, Math.min(max, qty));
        }
        
        ingredientState.set(ingId, {
          quantity: qty,
        });
      }
    });
  }

  // qty: default 1, в edit — из корзины
  let qty = seedItem ? Math.max(1, Number(seedItem?.qty || seedItem?.quantity || 1)) : 1;

  // предзаполнение опций из корзины (как было)
  const editOptionIds = new Set((seedItem?.option_item_ids || []).map(Number).filter(Number.isFinite));
  const editOptionQty = new Map();
  (seedItem?.option_items || []).forEach((opt) => {
    const id = Number(opt?.id);
    if (!Number.isFinite(id)) return;
    const q = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
    editOptionQty.set(id, q);
  });

  // Варианты опций из корзины (для восстановления при редактировании)
  const editOptionVariants = new Map();
  (seedItem?.option_items || []).forEach((opt) => {
    const id = Number(opt?.id);
    if (!Number.isFinite(id)) return;
    if (opt.variant_group_id != null && opt.variant_value_index != null) {
      editOptionVariants.set(id, {
        variant_group_id: Number(opt.variant_group_id),
        variant_value_index: Number(opt.variant_value_index),
        variant_label: str(opt.variant_label || ""),
        variant_price_diff: Number(opt.variant_price_diff || 0),
      });
    }
  });

  // Устанавливает дефолтный вариант для опции с вариантами (если ещё не задан)
  function setDefaultVariantForOptionItem(item, variantByItemIdMap) {
    const itemId = Number(item.id);
    if (!Number.isFinite(itemId) || variantByItemIdMap.has(itemId)) return;
    const itemVariants = Array.isArray(item.variants) ? item.variants : [];
    if (itemVariants.length === 0 || !(itemVariants[0]?.values?.length)) return;
    const vg = itemVariants[0];
    const values = Array.isArray(vg.values) ? vg.values : [];
    const defaultIdx = vg.default_value_index != null ? Number(vg.default_value_index) : (values.length ? 0 : null);
    if (defaultIdx == null || defaultIdx < 0 || defaultIdx >= values.length) return;
    const unitPrice = getOptionItemVariantUnitPrice(item, vg, defaultIdx);
    const priceDiff = unitPrice - Number(item.price || 0);
    const unitLabel = str(vg.unit_short_title || vg.unit_code || vg.unit_title || "").trim();
    const valueText = str(values[defaultIdx] ?? "");
    const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
    const variantLabel = unitLabel && !hasLetters(valueText) ? `${valueText} ${unitLabel}` : valueText;
    variantByItemIdMap.set(itemId, {
      variant_group_id: Number(vg.id || vg.variant_group_id || 0),
      variant_value_index: defaultIdx,
      variant_label: variantLabel,
      variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
    });
  }

optionGroups.forEach((group) => {
  const type = getOptionGroupUiType(group);
  const minSelect = Math.max(0, Number(group?.min_select ?? 0));
  const isEditingSeed = !!seedItem;

  const stateEntry = {
    type,
    selectedId: null,
    selectedIds: new Set(),
    qtyById: new Map(),
    // NEW: Варианты для каждого item (itemId -> { variant_group_id, variant_value_index, label, price_diff })
    variantByItemId: new Map(),
    minSelect: group.min_select ?? 0,
    maxSelect: group.max_select ?? null,
  };

  if (type === "single") {
    const preselected = (seedItem?.option_item_ids || []).find((id) =>
      group.items.some((item) => Number(item.id) === Number(id))
    );

    const required = !!group.is_required; // NEW
    const fallback = required ? (group.items[0]?.id ?? null) : null;

    stateEntry.selectedId = preselected || fallback || null;
  } else if (type === "multiple_group") {
    group.items.forEach((item) => {
      if (editOptionIds.has(Number(item.id))) stateEntry.selectedIds.add(Number(item.id));
    });
    if (!isEditingSeed && stateEntry.selectedIds.size === 0 && minSelect > 0) {
      const toSelect = Math.min(minSelect, group.items.length);
      for (let i = 0; i < toSelect; i += 1) {
        const id = Number(group.items[i]?.id);
        if (Number.isFinite(id) && id > 0) stateEntry.selectedIds.add(id);
      }
    }
  } else if (type === "multiple_item") {
    group.items.forEach((item) => {
      const id = Number(item.id);
      const itemMin = Number(item?.qty_min ?? 0);
      // В режиме редактирования берём сохранённое значение
      const savedQty = editOptionQty.get(id) || (editOptionIds.has(id) ? Math.max(1, itemMin || 1) : 0);
      const q = savedQty > 0 ? savedQty : 0;
      if (q > 0) stateEntry.qtyById.set(id, q);
    });
    if (!isEditingSeed && stateEntry.qtyById.size === 0 && minSelect > 0) {
      const toSelect = Math.min(minSelect, group.items.length);
      for (let i = 0; i < toSelect; i += 1) {
        const item = group.items[i];
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const itemMin = Number(item?.qty_min ?? 0);
        const q = itemMin > 0 ? itemMin : 1;
        stateEntry.qtyById.set(id, q);
      }
    }
  }

  // Восстанавливаем варианты из корзины для всех items
  group.items.forEach((item) => {
    const itemId = Number(item.id);
    const savedVariant = editOptionVariants.get(itemId);
    if (savedVariant) {
      stateEntry.variantByItemId.set(itemId, savedVariant);
    }
  });

  selectionState.set(group.id, stateEntry);
});

  // Для выбранных опций с вариантами сразу выставляем дефолтный вариант, чтобы цена отображалась верно
  optionGroups.forEach((group) => {
    const stateEntry = selectionState.get(group.id);
    if (!stateEntry || !group.items?.length) return;
    if (stateEntry.type === "single" && stateEntry.selectedId) {
      const item = group.items.find((it) => Number(it.id) === Number(stateEntry.selectedId));
      if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
    } else if (stateEntry.type === "multiple_group") {
      stateEntry.selectedIds.forEach((itemId) => {
        const item = group.items.find((it) => Number(it.id) === Number(itemId));
        if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
      });
    } else if (stateEntry.type === "multiple_item") {
      stateEntry.qtyById.forEach((qty, itemId) => {
        if (qty <= 0) return;
        const item = group.items.find((it) => Number(it.id) === Number(itemId));
        if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
      });
    }
  });

  // qty pill UI
  const qtyPill = createQtyPill({
    variant: available ? "buy" : "muted",
    big: true,
    centerText: String(qty),
    minusEnabled: available && qty > 1,
    plusEnabled: available,
  });

  let qtyPlusBlockedByStock = available && cartCountTotal() > 0;
  let updateQtyUi = () => {
    if (qtyPill?.center) qtyPill.center.textContent = String(qty);
    // минус блокируем визуально на 1
    if (qtyPill?.btnMinus) {
      const minusDisabled = qty <= 1 || !available;
      qtyPill.btnMinus.classList.toggle("is-disabled", minusDisabled);
      qtyPill.btnMinus.disabled = minusDisabled;
    }
    if (qtyPill?.btnPlus) {
      const plusDisabled = !available || qtyPlusBlockedByStock;
      qtyPill.btnPlus.classList.toggle("is-disabled", plusDisabled);
      qtyPill.btnPlus.disabled = plusDisabled;
    }
  };

  let actionBtnRef = null;
  let basePriceElRef = null;

  // Рассчитывает цену базовых ингредиентов (по ing.quantity из БД)
  const calculateBaseIngredientPrice = () => {
    let total = 0;
    ingredients.forEach(ing => {
      const baseQty = Number(ing.quantity ?? 1); // Базовое количество из БД
      
      // Рассчитываем цену за единицу с учетом base_qty
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      
      // Конверсия базового количества в базовые единицы
      const qtyInBase = getQtyInBase(ing, baseQty);
      const ingredientTotal = qtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * qtyInBase : 0;
      total += ingredientTotal;
    });
    return total;
  };

  // Рассчитывает разницу цены ингредиентов от базового состава
  const calculateIngredientPrice = () => {
    let currentTotal = 0;
    let baseTotal = 0;
    
    ingredients.forEach(ing => {
      const state = ingredientState.get(Number(ing.ingredient_id));
      const currentQty = state ? (state.quantity ?? Number(ing.quantity ?? 1)) : Number(ing.quantity ?? 1);
      const baseQty = Number(ing.quantity ?? 1); // Базовое количество из БД
      
      // Рассчитываем цену за единицу с учетом base_qty
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      
      // Цена текущего количества
      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const currentIngredientTotal = currentQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * currentQtyInBase : 0;
      currentTotal += currentIngredientTotal;
      
      // Цена базового количества
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const baseIngredientTotal = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      baseTotal += baseIngredientTotal;
    });
    
    // Возвращаем разницу: текущие - базовые
    return currentTotal - baseTotal;
  };

  // Повторяем backend-логику расчёта скидки (без tenant-round внутри скидки):
  // 1) считаем сумму скидки
  // 2) ограничиваем max_discount_amount/ценой
  // 3) округляем скидку до 2 знаков
  const calculateProductDiscountAmount = (price, discount) => {
    const srcPrice = Number(price || 0);
    if (!(srcPrice > 0) || !discount) return 0;

    const discType = String(discount.discount_type || "").trim();
    const discValue = Number(discount.discount_value || 0);
    let discountAmount = 0;

    if (discType === "percent") {
      if (!(discValue > 0)) return 0;
      discountAmount = srcPrice * (discValue / 100);
    } else if (discType === "fixed") {
      if (!(discValue > 0)) return 0;
      discountAmount = discValue;
    } else if (discType === "special_price") {
      discountAmount = Math.max(0, srcPrice - discValue);
    } else {
      return 0;
    }

    const maxDiscountAmount = Number(discount.max_discount_amount);
    if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
      discountAmount = maxDiscountAmount;
    }
    if (discountAmount > srcPrice) discountAmount = srcPrice;

    return Math.round(discountAmount * 100) / 100;
  };

  let updateActionText = () => {
    if (!actionBtnRef) return;
    if (!available) {
      actionBtnRef.innerHTML = `<span class="shop-pd-action-label">Нет в наличии</span>`;
      actionBtnRef.disabled = true;
      if (elMobileProductPrice) elMobileProductPrice.textContent = "";
      const mobileOldPrice = elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
      if (mobileOldPrice) {
        mobileOldPrice.textContent = "";
        mobileOldPrice.classList.add("hidden");
      }
      return;
    }
    actionBtnRef.disabled = false;

    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionTotal = optionItemsTotal(selectedItems);
    const variantUnitPrice = getVariantUnitPrice(product, variants, variantState);
    const basePrice = Number(variantUnitPrice || 0) + optionTotal;
    const ingredientsPriceDiff = calculateIngredientPrice(); // Разница от базового состава
    const unitPrice = roundPrice(basePrice + ingredientsPriceDiff);

    // Скидка считается как на бэке, tenant-round применяется к итоговой цене.
    const discountAmount = calculateProductDiscountAmount(unitPrice, product.discount);
    const discountedUnitPrice = roundPrice(Math.max(0, unitPrice - discountAmount));

    // total = unit * qty
    const totalPrice = roundPrice(discountedUnitPrice * Number(qty || 1));
    const totalBeforeDiscount = roundPrice(unitPrice * Number(qty || 1));
    
    // Зачёркнутая цена: либо скидка, либо product.old_price из БД
    const oldBase = Number(product.old_price || 0);
    const oldUnit = oldBase > 0 ? roundPrice(oldBase + optionTotal + ingredientsPriceDiff) : 0;
    const totalOldFromDb = oldUnit > discountedUnitPrice ? roundPrice(oldUnit * Number(qty || 1)) : 0;
    
    // Приоритет: если есть скидка — показываем цену до скидки, иначе old_price
    const hasApiDiscount = discountAmount > 0;
    const totalOld = hasApiDiscount ? totalBeforeDiscount : totalOldFromDb;
    const showOld = totalOld > 0 && totalOld > totalPrice;

    actionBtnRef.innerHTML = `
      <span class="shop-pd-action-prices">
        ${showOld ? `<span class="shop-pd-action-old">${money(totalOld)}</span>` : ""}
        <span class="shop-checkout-total shop-pd-action-price">${money(totalPrice)}</span>
      </span>
      <span class="shop-pd-action-label">${editMode ? "Сохранить" : "в корзину"}</span>
    `;

    if (basePriceElRef) {
      const variantLabel = str(variantState?.label || "").trim();
      if (variantLabel) {
        basePriceElRef.textContent = `${variantLabel} — ${money(variantUnitPrice)}`;
      } else {
        basePriceElRef.textContent = money(product.price || 0);
      }
    }
    // Синхронизация с мобильной кнопкой «В корзину»
    if (elMobileProductPrice) {
      const priceEl = actionBtnRef.querySelector(".shop-pd-action-price");
      if (priceEl) elMobileProductPrice.textContent = priceEl.textContent;
    }
    const oldPriceEl = actionBtnRef.querySelector(".shop-pd-action-old");
    const mobileOldPrice = elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
    if (mobileOldPrice) {
      if (oldPriceEl && oldPriceEl.textContent.trim()) {
        mobileOldPrice.textContent = oldPriceEl.textContent;
        mobileOldPrice.classList.remove("hidden");
      } else {
        mobileOldPrice.textContent = "";
        mobileOldPrice.classList.add("hidden");
      }
    }
  };

  let ingredientsWrapRef = null;
  let refreshVariantAvailabilityUi = () => {};
  
  const onIngredientChange = () => {
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
    // Update ingredient prices in UI
    if (!ingredientsWrapRef) return;
    
    ingredients.forEach(ing => {
      const ingId = Number(ing.ingredient_id);
      const hasIngredientProductId = Number.isFinite(ingId) && ingId > 0;
      const state = ingredientState.get(ingId);
      if (!state) return;
      
      const block = ingredientsWrapRef.querySelector(`[data-ingredient-id="${ingId}"]`);
      if (!block) return;
      
      const defaultQtyNum = Number(ing.quantity ?? 1);
      const isVariableIng = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariableIng ? 0 : defaultQtyNum);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQtyNum;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      let currentQty = state.quantity ?? Number(ing.quantity ?? 1);
      const isIngUnavailableForPlus = () => {
        if (!hasIngredientProductId) return false;
        if (currentQty >= max) return false;
        const snapshot = snapshotDraftState();
        const stateEntry = ingredientState.get(ingId);
        const nextQty = Math.min(max, currentQty + (step > 0 ? step : 1));
        const nextState = stateEntry && typeof stateEntry === "object"
          ? { ...stateEntry, quantity: nextQty }
          : { quantity: nextQty };
        ingredientState.set(ingId, nextState);
        const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
        restoreDraftState(snapshot);
        return !allowed;
      };
      // Round to step (относительно min)
      if (step > 0) {
        const stepsFromMin = Math.round((currentQty - min) / step);
        currentQty = min + (stepsFromMin * step);
      }
      currentQty = Math.max(min, Math.min(max, currentQty));
      state.quantity = currentQty;
      
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      
      // Рассчитываем цену за единицу с учетом base_qty (как в админке)
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      
      // Цена текущего количества
      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const currentTotalPrice = currentQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * currentQtyInBase : 0;
      
      // Цена базового количества (из БД)
      const baseQty = Number(ing.quantity ?? 1);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const baseTotalPrice = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      
      // Разница от базового состава
      const totalPrice = currentTotalPrice - baseTotalPrice;
      
      const qtyDisplay = block.querySelector(".qty-display");
      if (qtyDisplay) qtyDisplay.textContent = `${currentQty} ${unitLabel}`;
      
      const priceInfoEl = block.querySelector(".shop-pd-ingredient-price");
      let totalEl = block.querySelector(".ingredient-total");
      
      // Если элемента нет, создаем его
      if (!totalEl && priceInfoEl) {
        totalEl = document.createElement("div");
        totalEl.className = "ingredient-total";
        priceInfoEl.appendChild(totalEl);
      }
      
      // Показываем разницу от базового состава, скрываем если 0
      if (Math.abs(totalPrice) > 0.01) {
        const priceSign = totalPrice >= 0 ? "+" : "";
        if (totalEl) totalEl.textContent = `${priceSign}${money(totalPrice)}`;
        if (priceInfoEl) priceInfoEl.style.display = "";
      } else {
        if (totalEl) totalEl.textContent = "";
        if (priceInfoEl) priceInfoEl.style.display = "none";
      }
      
      const btnMinus = block.querySelector(".qty-minus");
      const btnPlus = block.querySelector(".qty-plus");
      if (btnMinus) btnMinus.disabled = currentQty <= min;
      if (btnPlus) btnPlus.disabled = currentQty >= max || isIngUnavailableForPlus();
    });
  };

  function buildCurrentIngredientQuantities() {
    const ingredientQuantities = [];
    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const stateEntry = ingredientState.get(ingId);
      const quantity = (stateEntry && stateEntry.quantity !== undefined)
        ? stateEntry.quantity
        : Number(ing.quantity ?? 1);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      ingredientQuantities.push({
        ingredient_id: ingId,
        quantity,
        ingredient_name: ing.ingredient_name || "",
        unit_label: unitLabel,
      });
    });
    return ingredientQuantities;
  }

  function formatVariantValueLabelByIndex(variantIndex) {
    if (!Array.isArray(variants) || !variants.length) return "";
    const group = variants[0] || null;
    const values = Array.isArray(group?.values) ? group.values : [];
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= values.length) return "";

    const unitLabel = str(group?.unit_short_title || group?.unit_code || group?.unit_title || "").trim();
    const valueText = str(values[idx]);
    if (!valueText) return "";
    if (!unitLabel || /[a-zа-я]/i.test(valueText)) return valueText;
    return `${valueText} ${unitLabel}`;
  }

  function buildDraftStockItem(desiredQty, variantOverrides = null) {
    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionItemIds = selectedItems.map((item) => item.id);
    const overrides = variantOverrides && typeof variantOverrides === "object" ? variantOverrides : null;
    const hasGroupOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantGroupId"));
    const hasIndexOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantIndex"));
    const hasLabelOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantLabel"));

    const selectedVariantGroupIdRaw = hasGroupOverride ? overrides.variantGroupId : variantState.groupId;
    const selectedVariantIndexRaw = hasIndexOverride ? overrides.variantIndex : variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const selectedVariantLabel = hasLabelOverride
      ? str(overrides.variantLabel || "")
      : (
          hasIndexOverride
            ? formatVariantValueLabelByIndex(selectedVariantIndex)
            : (str(variantState.label || "") || formatVariantValueLabelByIndex(selectedVariantIndex))
        );
    const variantValue = toStockVariantValue(selectedVariantLabel || "");
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0 &&
      !!variantValue;

    return {
      cart_key: editMode && editingItem ? editingItem.key : null,
      product_id: Number(product.id),
      qty: Math.max(1, Number(desiredQty || 1)),
      option_item_ids: optionItemIds,
      option_items: selectedItems,
      ingredients: buildCurrentIngredientQuantities(),
      variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
      variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
      variant_label: hasVariantSelection ? variantValue : null,
      variants: hasVariantSelection
        ? [{
            variant_group_id: selectedVariantGroupId,
            variant_value_index: selectedVariantIndex,
            value: variantValue,
            label: variantValue,
          }]
        : undefined,
    };
  }

  function buildDraftStockItemsPayload(desiredQty, variantOverrides = null) {
    const cartPayload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved());
    const filtered = (editMode && editingItem)
      ? cartPayload.filter((item) => String(item?.cart_key || "") !== String(editingItem.key || ""))
      : cartPayload.slice();
    filtered.push(buildDraftStockItem(desiredQty, variantOverrides));
    return filtered;
  }

  // --- Локальный расчёт остатков для draft (без обращения к API) ---
  function canUseDraftQtyLocal(desiredQty, variantOverrides) {
    const dQty = Math.max(1, Number(desiredQty || 1));
    // Собираем потребление draft по каждому productId
    const draftConsumption = new Map();
    const addC = (pid, amount) => {
      if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(amount) || amount <= 0) return;
      draftConsumption.set(pid, (draftConsumption.get(pid) || 0) + amount);
    };

    // 1. Основной товар
    const mainPid = Number(product.id || 0);
    if (mainPid > 0) {
      const overrides = variantOverrides && typeof variantOverrides === "object" ? variantOverrides : null;
      let vLabel, vUnitId;
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, "variantIndex")) {
        const idx = Number(overrides.variantIndex);
        const group = Array.isArray(variants) && variants.length ? variants[0] : null;
        const values = group && Array.isArray(group.values) ? group.values : [];
        const unitLabel = str(group?.unit_short_title || group?.unit_code || group?.unit_title || "").trim();
        const rawVal = idx >= 0 && idx < values.length ? str(values[idx]) : "";
        const hasLetters = /[a-zа-я]/i.test(rawVal);
        vLabel = rawVal && unitLabel && !hasLetters ? rawVal + " " + unitLabel : rawVal;
        vUnitId = Number(group?.unit_id || 0);
      } else {
        vLabel = str(variantState.label || "") || formatVariantValueLabelByIndex(variantState.selectedIndex);
        const group = Array.isArray(variants) && variants.length ? variants[0] : null;
        vUnitId = Number(group?.unit_id || 0);
      }
      addC(mainPid, calcConsumedPerUnit(product, vLabel, vUnitId) * dQty);
    }

    // 2. Выбранные опции
    for (const group of optionGroups) {
      const gState = selectionState.get(group.id);
      if (!gState) continue;
      for (const item of (group.items || [])) {
        const tpid = Number(item.target_product_id || 0);
        if (tpid <= 0) continue;
        const iid = Number(item.id);
        let optQty = 0;
        if (gState.type === "single" && Number(gState.selectedId || 0) === iid) optQty = 1;
        else if (gState.type === "multiple_group" && gState.selectedIds && gState.selectedIds.has(iid)) optQty = 1;
        else if (gState.type === "multiple_item" && gState.qtyById) optQty = Number(gState.qtyById.get(iid) || 0);
        if (optQty <= 0) continue;

        const optProduct = state.productCache.get(tpid);
        const vData = gState.variantByItemId ? gState.variantByItemId.get(iid) : null;
        const optVLabel = vData ? (vData.variant_label || "") : "";
        const itemVars = Array.isArray(item.variants) ? item.variants : [];
        const optVUnitId = Number(itemVars.length ? (itemVars[0].unit_id || 0) : 0);
        addC(tpid, calcConsumedPerUnit(optProduct, optVLabel, optVUnitId) * optQty * dQty);
      }
    }

    // 3. Ингредиенты
    for (const ing of ingredients) {
      const ingPid = Number(ing.ingredient_id || 0);
      if (ingPid <= 0) continue;
      const stateEntry = ingredientState.get(ingPid);
      const ingQty = Number(stateEntry && stateEntry.quantity !== undefined ? stateEntry.quantity : (ing.quantity ?? 1));
      if (ingQty <= 0) continue;
      const ingProduct = state.productCache.get(ingPid);
      const ingUnitId = Number(ing.unit_id || 0);
      let consumed = ingQty;
      if (ingProduct && ingUnitId) {
        const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
        if (baseUnitId && ingUnitId !== baseUnitId) {
          const factor = getConversionFactor(ingUnitId, baseUnitId);
          if (factor != null) consumed = ingQty * factor;
        }
      }
      addC(ingPid, consumed * dQty);
    }

    // Проверка по каждому затронутому продукту
    for (const [pid, draftAmount] of draftConsumption) {
      const entry = getStockLevelEntry(pid);
      if (!entry || entry.qty === null || entry.qty === undefined || entry.isUnlimited) continue;
      const stockQty = Number(entry.qty);
      if (!Number.isFinite(stockQty)) continue;
      let cartConsumed = calcProductStockConsumed(pid);
      // В режиме редактирования вычитаем потребление редактируемого элемента
      if (editMode && editingItem) {
        cartConsumed -= calcProductStockConsumed(pid, [editingItem]);
      }
      if (cartConsumed + draftAmount > stockQty) return false;
    }
    return true;
  }

  function canUseDraftQtyWithVariantLocal(variantIndex, desiredQty) {
    if (!Array.isArray(variants) || !variants.length) return true;
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0) return false;
    const qtyForCheck = Math.max(1, Number(desiredQty || qty || 1));
    return canUseDraftQtyLocal(qtyForCheck, { variantIndex: idx });
  }

  async function canUseDraftQty(
    desiredQty,
    {
      showToastOnOut = true,
      refreshOnOut = false,
      variantOverrides = null,
    } = {}
  ) {
    const payloadItems = buildDraftStockItemsPayload(desiredQty, variantOverrides);
    const check = await checkStockForItemsPayload(payloadItems, {
      showToastOnOut,
      toastMessage: "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut,
    });
    return check.available;
  }

  async function canUseDraftQtyWithVariant(
    variantIndex,
    {
      desiredQty = null,
      showToastOnOut = false,
      refreshOnOut = false,
    } = {}
  ) {
    if (!Array.isArray(variants) || !variants.length) return true;
    const group = variants[0] || null;
    const groupId = Number(group?.id || variantState.groupId || 0);
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0) return false;
    const qtyForCheck = Math.max(1, Number(desiredQty || qty || 1));

    return canUseDraftQty(qtyForCheck, {
      showToastOnOut,
      refreshOnOut,
      variantOverrides: {
        variantGroupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
        variantIndex: idx,
      },
    });
  }

  function cloneDraftValue(value) {
    if (value instanceof Map) {
      const out = new Map();
      value.forEach((v, k) => out.set(k, cloneDraftValue(v)));
      return out;
    }
    if (value instanceof Set) {
      const out = new Set();
      value.forEach((v) => out.add(cloneDraftValue(v)));
      return out;
    }
    if (Array.isArray(value)) return value.map((v) => cloneDraftValue(v));
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => {
        out[k] = cloneDraftValue(value[k]);
      });
      return out;
    }
    return value;
  }

  function snapshotDraftState() {
    return {
      selectionState: cloneDraftValue(selectionState),
      ingredientState: cloneDraftValue(ingredientState),
      variantState: cloneDraftValue(variantState),
    };
  }

  function isPlainDraftObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Set);
  }

  function restoreDraftValueInPlace(target, source) {
    if (source instanceof Map) {
      if (!(target instanceof Map)) return cloneDraftValue(source);
      const keysToDelete = [];
      target.forEach((_, key) => {
        if (!source.has(key)) keysToDelete.push(key);
      });
      keysToDelete.forEach((key) => target.delete(key));
      source.forEach((srcValue, key) => {
        if (target.has(key)) {
          const tgtValue = target.get(key);
          target.set(key, restoreDraftValueInPlace(tgtValue, srcValue));
        } else {
          target.set(key, cloneDraftValue(srcValue));
        }
      });
      return target;
    }

    if (source instanceof Set) {
      if (!(target instanceof Set)) return cloneDraftValue(source);
      target.clear();
      source.forEach((v) => target.add(cloneDraftValue(v)));
      return target;
    }

    if (Array.isArray(source)) {
      if (!Array.isArray(target)) return cloneDraftValue(source);
      target.length = 0;
      source.forEach((v) => target.push(cloneDraftValue(v)));
      return target;
    }

    if (isPlainDraftObject(source)) {
      if (!isPlainDraftObject(target)) return cloneDraftValue(source);
      Object.keys(target).forEach((k) => {
        if (!(k in source)) delete target[k];
      });
      Object.keys(source).forEach((k) => {
        target[k] = restoreDraftValueInPlace(target[k], source[k]);
      });
      return target;
    }

    return source;
  }

  function restoreDraftState(snapshot) {
    const selectionSnapshot = snapshot?.selectionState instanceof Map ? snapshot.selectionState : new Map();
    restoreDraftValueInPlace(selectionState, selectionSnapshot);

    const ingredientSnapshot = snapshot?.ingredientState instanceof Map ? snapshot.ingredientState : new Map();
    restoreDraftValueInPlace(ingredientState, ingredientSnapshot);

    const variantSnapshot = snapshot?.variantState && typeof snapshot.variantState === "object" ? snapshot.variantState : {};
    restoreDraftValueInPlace(variantState, variantSnapshot);
  }

  function guardDraftMutation(mutator, { showToastOnOut = true } = {}) {
    if (typeof mutator !== "function") return false;
    const snapshot = snapshotDraftState();
    mutator();
    const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
    if (allowed) return true;
    restoreDraftState(snapshot);
    if (showToastOnOut) showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
    return false;
  }

  function canDraftMutationApplyPreview(mutator) {
    if (typeof mutator !== "function") return true;
    const snapshot = snapshotDraftState();
    mutator();
    const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
    restoreDraftState(snapshot);
    return allowed;
  }

  function refreshQtyPlusStockGate() {
    if (!available) {
      qtyPlusBlockedByStock = true;
      updateQtyUi();
      return false;
    }
    const desiredQty = Math.max(1, Number(qty || 1)) + 1;
    const allowed = canUseDraftQtyLocal(desiredQty);
    qtyPlusBlockedByStock = !allowed;
    updateQtyUi();
    return allowed;
  }

  const onQtyMinus = () => {
    if (!available) return;
    if (qty <= 1) return;
    qty -= 1;
    updateQtyUi();
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
  };

  const onQtyPlus = () => {
    if (!available) return;
    if (qtyPlusBlockedByStock) {
      showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }
    const desiredQty = qty + 1;
    const allowed = canUseDraftQtyLocal(desiredQty);
    if (!allowed) {
      qtyPlusBlockedByStock = true;
      updateQtyUi();
      showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }
    qty = desiredQty;
    qtyPlusBlockedByStock = false;
    updateQtyUi();
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
  };

  const { wrap, actionBtn, basePriceEl, refreshVariantAvailability } = buildProductDetailsContent(
    product,
    optionGroups,
    selectionState,
    ingredients,
    ingredientState,
    variants,
    variantState,
    {
      onBack,
      mode: editMode ? "edit" : "add",
      onSelectionChange: () => {
        updateActionText();
        refreshQtyPlusStockGate();
        refreshVariantAvailabilityUi();
      },
      onIngredientChange,
      onVariantChange: () => {
        updateActionText();
        refreshQtyPlusStockGate();
        refreshVariantAvailabilityUi();
      },
      canSelectVariantIndex: canUseDraftQtyWithVariantLocal,
      canDraftMutationApply: canDraftMutationApplyPreview,
      qtyPill,
      onQtyMinus,
      onQtyPlus,
      setDefaultVariantForOptionItem,
      guardDraftMutation,
    }
  );

  actionBtnRef = actionBtn;
  basePriceElRef = basePriceEl;
  ingredientsWrapRef = wrap.querySelector(".shop-pd-ingredients");
  refreshVariantAvailabilityUi = () => {
    if (typeof refreshVariantAvailability !== "function") return;
    try {
      Promise
        .resolve(refreshVariantAvailability({ showToastOnOut: false }))
        .catch(() => {});
    } catch {}
  };

  updateQtyUi();
  updateActionText();
  refreshQtyPlusStockGate();
  refreshVariantAvailabilityUi();

  // На мобильных: синхронизируем кнопки с единым блоком
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile && elMobileProductActions && elMobileQtyWrap && elMobileAddToCartBtn) {
    // Скрываем footer на мобильных
    const footer = wrap.querySelector(".shop-pd-footer");
    if (footer) footer.style.display = "none";
    
    // Показываем мобильные кнопки
    elMobileProductActions.classList.remove("hidden");
    if (elMobileAddressActions) {
      elMobileAddressActions.classList.add("hidden");
    }
    if (elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    
    // Клонируем qtyPill в мобильный блок
    if (elMobileQtyWrap && qtyPill?.pill) {
      elMobileQtyWrap.innerHTML = "";
      const clonedPill = qtyPill.pill.cloneNode(true);
      elMobileQtyWrap.appendChild(clonedPill);
      
      // Подключаем обработчики
      const clonedMinus = clonedPill.querySelector(".qty-pill__btn--minus");
      const clonedPlus = clonedPill.querySelector(".qty-pill__btn--plus");
      if (clonedMinus) clonedMinus.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onQtyMinus(); });
      if (clonedPlus) clonedPlus.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onQtyPlus(); });
    }
    
    // Обновляем функцию updateActionText для синхронизации с мобильной кнопкой
    const originalUpdateActionText = updateActionText;
    updateActionText = () => {
      originalUpdateActionText();
      if (elMobileProductPrice && elMobileProductLabel) {
        if (!available) {
          elMobileProductLabel.textContent = "Нет в наличии";
          elMobileProductPrice.textContent = "";
          const mobileOldPrice = elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
          if (mobileOldPrice) {
            mobileOldPrice.textContent = "";
            mobileOldPrice.classList.add("hidden");
          }
          if (elMobileAddToCartBtn) elMobileAddToCartBtn.disabled = true;
        } else {
          if (elMobileAddToCartBtn) elMobileAddToCartBtn.disabled = false;
          const priceEl = actionBtnRef?.querySelector(".shop-pd-action-price");
          if (priceEl) {
            elMobileProductPrice.textContent = priceEl.textContent;
          }
          elMobileProductLabel.textContent = editMode ? "Сохранить" : "в корзину";
        }
      }
      // Обновляем qty в клонированном pill
      if (elMobileQtyWrap) {
        const clonedCenter = elMobileQtyWrap.querySelector(".qty-pill__center");
        if (clonedCenter) clonedCenter.textContent = String(qty);
        const clonedMinus = elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
        if (clonedMinus) {
          const minusDisabled = qty <= 1 || !available;
          clonedMinus.classList.toggle("is-disabled", minusDisabled);
          clonedMinus.disabled = minusDisabled;
        }
        const clonedPlus = elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) {
          const plusDisabled = !available || qtyPlusBlockedByStock;
          clonedPlus.classList.toggle("is-disabled", plusDisabled);
          clonedPlus.disabled = plusDisabled;
        }
      }
    };
    
    // Обновляем функцию updateQtyUi для синхронизации
    const originalUpdateQtyUi = updateQtyUi;
    updateQtyUi = () => {
      originalUpdateQtyUi();
      if (elMobileQtyWrap) {
        const clonedCenter = elMobileQtyWrap.querySelector(".qty-pill__center");
        if (clonedCenter) clonedCenter.textContent = String(qty);
        const clonedMinus = elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
        if (clonedMinus) {
          const minusDisabled = qty <= 1 || !available;
          clonedMinus.classList.toggle("is-disabled", minusDisabled);
          clonedMinus.disabled = minusDisabled;
        }
        const clonedPlus = elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) {
          const plusDisabled = !available || qtyPlusBlockedByStock;
          clonedPlus.classList.toggle("is-disabled", plusDisabled);
          clonedPlus.disabled = plusDisabled;
        }
      }
    };
    
    // Подключаем обработчик к мобильной кнопке (снимаем предыдущий, чтобы не копились)
    if (mobileProductActionsState.onAddToCart) {
      elMobileAddToCartBtn.removeEventListener("click", mobileProductActionsState.onAddToCart);
    }
    mobileProductActionsState.onAddToCart = () => {
      actionBtn.click();
    };
    elMobileAddToCartBtn.addEventListener("click", mobileProductActionsState.onAddToCart);
    
    // Обновляем сразу
    updateActionText();
    updateQtyUi();
    
    // Скрываем ботомщит активного заказа при открытии карточки товара
    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
  }

  function composeVariantLabelValueFirst(rawLabel, rawGroupTitle) {
    const raw = str(rawLabel || "").trim();
    if (!raw) return "";

    const colonPos = raw.indexOf(":");
    if (colonPos >= 0) {
      const right = raw.slice(colonPos + 1).trim();
      if (right) return right;
    }
    return raw;
  }

  function buildCurrentProductFavoriteSnapshot() {
    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const ingredientQuantities = buildCurrentIngredientQuantities();
    const optionItemIds = selectedItems
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const selectedVariantGroupIdRaw = variantState.groupId;
    const selectedVariantIndexRaw = variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0;
    const variantGroupTitle = str(variants?.[0]?.title || "").trim();
    const variantValueLabel = str(variantState.label || "").trim();
    const variantLabel = hasVariantSelection
      ? composeVariantLabelValueFirst(variantValueLabel, variantGroupTitle)
      : "";
    const variantUnitPrice = hasVariantSelection
      ? getVariantUnitPrice(product, variants, variantState)
      : Number(product.price || 0);
    const safeQty = Math.max(1, Number(qty || 1));
    const ingredientsPriceDiff = calculateIngredientPrice();

    const draftResolvedItem = {
      product,
      product_id: Number(product.id || 0),
      qty: safeQty,
      option_item_ids: optionItemIds,
      option_items: selectedItems,
      ingredients: ingredientQuantities,
      ingredient_price_diff: Number(ingredientsPriceDiff || 0),
      variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
      variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
      variant_label: variantLabel,
      variant_unit_price: Number(variantUnitPrice || 0),
      unit_price_override: null,
      auto_add: 0,
      auto_add_group_id: null,
    };

    const resolvedItems = cartItemsResolved();
    const totals = {
      nonAutoTotal: computeNonAutoTotal(resolvedItems),
      autoEligibleTotal: computeAutoEligibleTotal(resolvedItems),
    };
    const pricing = computeItemPricing(draftResolvedItem, totals);
    const oldUnitBase = Number(product.old_price || 0);
    const parts = pricing?.parts || {};
    const oldUnit = oldUnitBase > 0
      ? (oldUnitBase + Number(parts.optionTotal || 0) + Number(parts.ingredientDiff || 0))
      : 0;
    const hasDiscount = Number(pricing?.discountAmount || 0) > 0;
    const showOld =
      !pricing?.isAuto &&
      (hasDiscount || (oldUnit > 0 && oldUnit > Number(pricing?.unitPrice || 0)));
    const originalLineTotal = hasDiscount
      ? roundPrice(Number(pricing?.lineTotal || 0) + Number(pricing?.discountAmount || 0))
      : roundPrice(oldUnit * safeQty);

    return buildFavoriteSnapshotFromResolvedItem(draftResolvedItem, {
      pricing,
      oldLineTotal: showOld ? originalLineTotal : null,
    });
  }

  if (window.AppModal?.isOpen && window.AppModal.isOpen()) {
    setSheetHeaderMode("product", {
      onBack,
      favoriteBuildSnapshot: buildCurrentProductFavoriteSnapshot,
    });
  }

  // Привязка избранного к десктопной кнопке в хедере правой панели
  const desktopFavBtn = document.getElementById("shopCartFavBtn");
  if (desktopFavBtn) {
    const freshBtn = desktopFavBtn.cloneNode(true);
    desktopFavBtn.replaceWith(freshBtn);
    freshBtn.classList.remove("is-active", "is-busy");
    delete freshBtn.dataset.favoriteId;
    bindFavoriteButtonsForCartRow(
      [freshBtn],
      () => buildCurrentProductFavoriteSnapshot()
    );
  }

  container.appendChild(wrap);

  actionBtn.addEventListener("click", async () => {
    if (!available) return;
    const previousCartSnapshot = cloneCartState(state.cart);
    const wasEmpty = cartCountTotal() === 0;
    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionItemIds = selectedItems.map((item) => item.id);
    const selectedVariantGroupIdRaw = variantState.groupId;
    const selectedVariantIndexRaw = variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0;
    const variantSelection = hasVariantSelection
      ? { group_id: selectedVariantGroupId, value_index: selectedVariantIndex }
      : null;
    const variantGroupTitle = str(variants?.[0]?.title || "").trim();
    const variantValueLabel = str(variantState.label || "").trim();
    const variantLabel = hasVariantSelection
      ? composeVariantLabelValueFirst(variantValueLabel, variantGroupTitle)
      : "";
    const variantUnitPrice = hasVariantSelection
      ? getVariantUnitPrice(product, variants, variantState)
      : Number(product.price || 0);

    const safeQty = Math.max(1, Number(qty || 1));

    if (!canUseDraftQtyLocal(safeQty)) {
      showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }

    // Collect ingredient quantities with names and units for display
    // ВАЖНО: сохраняем ВСЕ ингредиенты, даже если они не изменены (для отображения в админке)
    const ingredientQuantities = buildCurrentIngredientQuantities();

    const nextKey = makeCartKey(product.id, selectedItems, ingredientQuantities, variantSelection);
    
    // Рассчитываем разницу цены ингредиентов для сохранения в корзину
    const ingredientsPriceDiff = calculateIngredientPrice();

    if (editMode && editingItem) {
      // режим редактирования: обновляем qty и конфигурацию, с merge если совпало
      const sameItem = getCartItemByKey(nextKey);

      if (sameItem && sameItem.key !== editingItem.key) {
        // merge: прибавляем qty текущей редактируемой строки в найденную
        sameItem.qty = Number(sameItem.qty || 0) + safeQty;
        sameItem.ingredients = ingredientQuantities; // Обновляем ингредиенты с названиями
        sameItem.ingredient_price_diff = ingredientsPriceDiff || 0;
        sameItem.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        sameItem.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        sameItem.variant_label = variantLabel;
        sameItem.variant_unit_price = Number(variantUnitPrice || 0);

        // удаляем старую строку
        state.cart = state.cart.filter((it) => it.key !== editingItem.key);
      } else {
        // обновляем текущую строку (сохраняем ингредиенты с названиями)
        editingItem.key = nextKey;
        editingItem.option_item_ids = optionItemIds;
        editingItem.option_items = selectedItems;
        editingItem.ingredients = ingredientQuantities; // Уже содержит названия и единицы
        editingItem.ingredient_price_diff = ingredientsPriceDiff || 0;
        editingItem.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        editingItem.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        editingItem.variant_label = variantLabel;
        editingItem.variant_unit_price = Number(variantUnitPrice || 0);
        editingItem.qty = safeQty;
        if (editingItem.auto_add == null) editingItem.auto_add = 0;
        if (editingItem.auto_add_group_id == null) editingItem.auto_add_group_id = null;
      }
    } else {
      // режим добавления: merge по конфигурации
      const existing = getCartItemByKey(nextKey);
      if (existing) {
        existing.qty = Number(existing.qty || 0) + safeQty;
        existing.ingredients = ingredientQuantities; // Уже содержит названия и единицы
        existing.ingredient_price_diff = ingredientsPriceDiff || 0;
        existing.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        existing.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        existing.variant_label = variantLabel;
        existing.variant_unit_price = Number(variantUnitPrice || 0);
        if (existing.auto_add == null) existing.auto_add = 0;
        if (existing.auto_add_group_id == null) existing.auto_add_group_id = null;
      } else {
        state.cart.push({
          key: nextKey,
          product_id: product.id,
          qty: safeQty,
          option_item_ids: optionItemIds,
          option_items: selectedItems,
          ingredients: ingredientQuantities,
          ingredient_price_diff: ingredientsPriceDiff || 0,
          variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
          variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
          variant_label: variantLabel,
          variant_unit_price: Number(variantUnitPrice || 0),
          auto_add: 0,
          auto_add_group_id: null,
        });
      }
    }

    if (wasEmpty) {
      clearAllAutoAddDismissed();
    }
    applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();
    if (typeof scheduleSyncAllProductCardsFromCart === "function") scheduleSyncAllProductCardsFromCart();
    renderCart();
    updateCartBadge();

    // обновление моб. шита корзины, если открыт
    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      appendUpsellToList(openCartSheetCtx.listEl);
    }

    queueCartStockRecheck(previousCartSnapshot, {
      toastMessage: "Больше нет в наличии",
    });
    const savedItemForLimit = getCartItemByKey(nextKey);
    const savedQtyForLimit = Number(savedItemForLimit?.qty || 0);
    if (savedItemForLimit && savedQtyForLimit > 0) {
      if (typeof refreshNextRegularCartItemLimitLocal === "function") {
        refreshNextRegularCartItemLimitLocal(Number(product.id || 0), nextKey, savedQtyForLimit);
      }
    }

    // На мобильных: скрываем мобильные кнопки при закрытии карточки
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileProductActions) {
      elMobileProductActions.classList.add("hidden");
      // Обновляем ботомщит активного заказа
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    }

    // Закрываем карточку и показываем корзину
    if (onBack && typeof onBack === "function") {
      onBack();
    } else {
      showCartView();
    }
  });

  openProductCtx = {
    productId: product.id,
    onBack: typeof onBack === "function" ? onBack : null,
  };

  if (isStaticProductView && Number.isFinite(productIdForRender) && productIdForRender > 0) {
    container.__shopRenderedViewType = "product";
    container.__shopRenderedProductId = productIdForRender;
    container.__shopRenderedComboId = "";
    container.__shopRenderedComboMain = false;
  }
}

  async function openProductDetails(productId, { cartKey, prefillItem, onBack } = {}) {
    const p = await ensureProduct(productId);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const hasCustomOnBack = typeof onBack === "function";
    const resolvedOnBack = hasCustomOnBack ? onBack : showCartView;

    if (isMobile) {
      if (!hasLiveCartSheetContext()) {
        openCartSheet();
      }
      if (openCartSheetCtx?.showSheetProduct) {
        const sheetArgs = { cartKey, prefillItem };
        if (hasCustomOnBack) {
          sheetArgs.onBack = resolvedOnBack;
        }
        openCartSheetCtx.showSheetProduct(p, sheetArgs);
      }
      return;
    }

    showProductView(p.name);
    await renderProductDetailsInto(elProductContent, p, { onBack: resolvedOnBack, cartKey, prefillItem });
  }

  function comboDiscountedPrice(price, discountPercent) {
    const p = Number(price) || 0;
    const d = Number(discountPercent) || 0;
    return roundPrice(d >= 100 ? 0 : p * (1 - d / 100));
  }

  function renderComboDetailsInto(container, combo, { onBack, cartKey, prefillItem } = {}) {
    if (!container) return;
    const comboIdForRender = Number(combo?.id || combo?.combo_id || 0);
    const isStaticComboView = !cartKey && !prefillItem;
    const shouldRandomizeInitialPreset = isStaticComboView;
    const canReuseStaticComboView =
      isStaticComboView &&
      !shouldRandomizeInitialPreset &&
      Number.isFinite(comboIdForRender) &&
      comboIdForRender > 0 &&
      container.__shopRenderedViewType === "combo" &&
      Number(container.__shopRenderedComboId || 0) === comboIdForRender &&
      container.__shopRenderedComboMain === true;
    if (canReuseStaticComboView) return;

    if (!isStaticComboView) {
      container.__shopRenderedViewType = "";
      container.__shopRenderedProductId = "";
      container.__shopRenderedComboId = "";
      container.__shopRenderedComboMain = false;
    }

    const blocks = Array.isArray(combo.blocks) ? combo.blocks : [];
    const discountPercent = Number(combo.discount_percent) || 0;
    let comboQty = 1;
    const makeEmptyComboBlockState = () => ({
      product_id: null,
      variant_label: "",
      variant_group_id: null,
      variant_group_title: "",
      variant_unit: "",
      unit_id: null,
      ingredients_display: [],
      unit_price_override: null,
      unit_price_before_discount: null,
    });
    const selectionStateByBlock = blocks.map(() => makeEmptyComboBlockState());
    let expandedPickerProductIndex = null;
    let comboPickerRenderTimer = null;
    const COMBO_PICKER_GEAR_ROTATE_MS = 300;
    const comboProductPreviewCache = new Map();
    let cachedMainView = null;
    let cachedMainStateKey = "";
    let cachedPickerView = null;
    let cachedPickerStateKey = "";
    const pickerBlockHydrating = new Set();
    const pickerBlockPreviewLoading = new Set();
    const pickerDefaultsInitializedByBlock = new Set();

    const selectedIndexByBlock = blocks.map((block) => {
      const products = block.products || [];
      const defaultIdx = products.findIndex((p) => p.is_default);
      return defaultIdx >= 0 ? defaultIdx : 0;
    });

    function randomShuffle(list) {
      const arr = Array.isArray(list) ? list.slice() : [];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    function getComboBlockUniqKey(block) {
      const products = Array.isArray(block?.products) ? block.products : [];
      const pids = products
        .map((p) => Number(p?.product_id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
        .sort((a, b) => a - b);
      return pids.join(",");
    }

    const editingComboItem = cartKey ? state.cart.find((x) => x.key === cartKey) : null;
    const seedComboItem = editingComboItem && String(editingComboItem?.type || "") === "combo"
      ? editingComboItem
      : (
        prefillItem &&
        (String(prefillItem?.type || "") === "combo" || Array.isArray(prefillItem?.selections))
          ? prefillItem
          : null
      );
    const isEditFromCart = !!(editingComboItem && String(editingComboItem?.type || "") === "combo");

    if (seedComboItem) {
      comboQty = Math.max(1, Number(seedComboItem.qty || seedComboItem.quantity || 1));
      const selList = Array.isArray(seedComboItem.selections) ? seedComboItem.selections : [];
      blocks.forEach((block, bi) => {
        const sel = selList[bi];
        if (sel && block.products && block.products.length) {
          const idx = block.products.findIndex((p) => Number(p.product_id) === Number(sel.product_id));
          selectedIndexByBlock[bi] = idx >= 0 ? idx : 0;
        }
        if (sel && selectionStateByBlock[bi]) {
          const st = selectionStateByBlock[bi];
          st.product_id = Number(sel.product_id) || null;
          st.variant_label = String(sel.variant_label || "");
          st.variant_group_id = sel.variant_group_id != null ? Number(sel.variant_group_id) : null;
          st.variant_value_index = sel.variant_value_index != null ? Number(sel.variant_value_index) : null;
          st.variant_group_title = String(sel.variant_group_title || "");
          st.variant_unit = String(sel.variant_unit || "");
          st.unit_id = sel.unit_id != null ? Number(sel.unit_id) : null;
          st.ingredients_display = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
          st.unit_price_override = sel.unit_price_override != null ? Number(sel.unit_price_override) : null;
          st.unit_price_before_discount = null;
        }
      });
    }

    function applyRandomizedInitialSelections() {
      if (!shouldRandomizeInitialPreset || seedComboItem) return;
      if (!Array.isArray(blocks) || !blocks.length) return;

      const blockOrder = randomShuffle(blocks.map((_b, idx) => idx));
      const usedByGroup = new Map();

      for (const blockIndex of blockOrder) {
        const block = blocks[blockIndex];
        const products = Array.isArray(block?.products) ? block.products : [];
        if (!products.length) continue;

        const groupKey = getComboBlockUniqKey(block);
        const usedSet = usedByGroup.get(groupKey) || new Set();
        if (!usedByGroup.has(groupKey)) usedByGroup.set(groupKey, usedSet);

        const allIndices = randomShuffle(products.map((_p, idx) => idx));
        const preferred = allIndices.filter((idx) => {
          const pid = Number(products[idx]?.product_id || 0);
          return Number.isFinite(pid) && pid > 0 && !usedSet.has(pid);
        });
        const fallback = allIndices.filter((idx) => !preferred.includes(idx));
        const attempts = preferred.concat(fallback);

        let chosenIdx = -1;
        for (const idx of attempts) {
          if (canUseComboBlockSelectionAtIndex(blockIndex, idx)) {
            chosenIdx = idx;
            break;
          }
        }
        if (chosenIdx < 0) chosenIdx = Number(selectedIndexByBlock[blockIndex] || 0);

        selectedIndexByBlock[blockIndex] = chosenIdx;
        const chosenPid = Number(products[chosenIdx]?.product_id || 0);
        if (Number.isFinite(chosenPid) && chosenPid > 0) usedSet.add(chosenPid);

        const draftState = selectionStateByBlock[blockIndex];
        if (draftState && Number(draftState.product_id || 0) !== chosenPid) {
          Object.keys(draftState).forEach((k) => delete draftState[k]);
          Object.assign(draftState, makeEmptyComboBlockState());
        }
      }
    }

    function getSelectedProduct(blockIndex) {
      const block = blocks[blockIndex];
      if (!block || !block.products || !block.products.length) return null;
      const rawIdx = Number(selectedIndexByBlock[blockIndex]);
      const idx = Number.isFinite(rawIdx) ? rawIdx : 0;
      return block.products[Math.max(0, Math.min(idx, block.products.length - 1))];
    }

    function totalPrice() {
      const sumOld = blocks.reduce((sum, _, blockIndex) => {
        const p = getSelectedProduct(blockIndex);
        if (!p) return sum;
        const state = selectionStateByBlock[blockIndex] || {};
        const oldPrice = state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
          ? Number(state.unit_price_before_discount)
          : Number(p.price) || 0;
        return sum + oldPrice;
      }, 0);
      return roundPrice(comboDiscountedPrice(sumOld, discountPercent));
    }

    function renderFooter({ onAdd, actionLabel = "в корзину", onQtyChanged } = {}) {
      const footer = document.createElement("div");
      footer.className = "shop-pd-footer shop-combo-footer";

      const qtyWrap = document.createElement("div");
      qtyWrap.className = "qty-pill-wrap";

      const qtyPill = createQtyPill({
        variant: "muted",
        centerText: String(comboQty),
        minusEnabled: comboQty > 1,
        plusEnabled: true,
      });

      const qtyPills = [qtyPill];

      function syncQtyControls() {
        const minusDisabled = comboQty <= 1;
        const plusDisabled = !canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) + 1));
        qtyPills.forEach((pillRef) => {
          if (!pillRef) return;
          if (pillRef.center) pillRef.center.textContent = String(comboQty);
          if (pillRef.btnMinus) {
            pillRef.btnMinus.disabled = minusDisabled;
            pillRef.btnMinus.classList.toggle("is-disabled", minusDisabled);
          }
          if (pillRef.btnPlus) {
            pillRef.btnPlus.disabled = plusDisabled;
            pillRef.btnPlus.classList.toggle("is-disabled", plusDisabled);
          }
        });
      }

      function applyQtyDelta(delta) {
        const safeDelta = Number(delta || 0);
        if (!Number.isFinite(safeDelta) || safeDelta === 0) return false;
        if (safeDelta < 0) {
          if (comboQty <= 1) {
            syncQtyControls();
            return false;
          }
          comboQty = Math.max(1, comboQty + safeDelta);
          syncQtyControls();
          updateFooterAction();
          if (typeof onQtyChanged === "function") onQtyChanged(comboQty);
          return true;
        }
        const nextQty = Math.max(1, comboQty + safeDelta);
        const allowed = canUseComboDraftQtyLocal(nextQty);
        if (!allowed) {
          showToast("Больше нет в наличии");
          syncQtyControls();
          return false;
        }
        comboQty = nextQty;
        syncQtyControls();
        updateFooterAction();
        if (typeof onQtyChanged === "function") onQtyChanged(comboQty);
        return true;
      }

      qtyPill.btnPlus.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyQtyDelta(+1);
      });

      qtyPill.btnMinus.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyQtyDelta(-1);
      });

      qtyWrap.appendChild(qtyPill.pill);

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "shop-checkout-btn shop-pd-action shop-combo-action";

      function updateFooterAction() {
        const total = roundPrice(totalPrice() * comboQty);
        const sumOld = blocks.reduce((s, _, blockIndex) => {
          const p = getSelectedProduct(blockIndex);
          if (!p) return s;
          const state = selectionStateByBlock[blockIndex] || {};
          const oldPrice = state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
            ? Number(state.unit_price_before_discount)
            : Number(p.price) || 0;
          return s + oldPrice;
        }, 0);
        const totalOld = roundPrice(sumOld * comboQty);
        const showOld = totalOld > total;

        const pricesHtml = `
          <span class="shop-pd-action-prices">
            ${showOld ? `<span class="shop-pd-action-old">${money(totalOld)}</span>` : ""}
            <span class="shop-checkout-total shop-pd-action-price">${money(total)}</span>
          </span>
        `;

        actionBtn.innerHTML = `
          ${pricesHtml}
          <span class="shop-pd-action-label">${actionLabel}</span>
        `;
        syncQtyControls();
      }
      updateFooterAction();

      // На мобилке привязываем футер комбо к блоку над навигацией (как у товаров)
      const isMobileCombo = window.matchMedia("(max-width: 768px)").matches;
      if (isMobileCombo && openCartSheetCtx && elMobileProductActions && elMobileQtyWrap && elMobileAddToCartBtn) {
        footer.style.display = "none";
        elMobileCartActions.classList.add("hidden");
        if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
        if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
        elMobileProductActions.classList.remove("hidden");

        const syncMobileFromFooter = () => {
          const priceEl = actionBtn.querySelector(".shop-pd-action-price");
          const labelEl = actionBtn.querySelector(".shop-pd-action-label");
          const oldPriceEl = actionBtn.querySelector(".shop-pd-action-old");
          if (priceEl && elMobileProductPrice) elMobileProductPrice.textContent = priceEl.textContent;
          if (labelEl && elMobileProductLabel) elMobileProductLabel.textContent = labelEl.textContent;
          const mobileOldPrice = elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
          if (mobileOldPrice) {
            if (oldPriceEl && oldPriceEl.textContent.trim()) {
              mobileOldPrice.textContent = oldPriceEl.textContent;
              mobileOldPrice.classList.remove("hidden");
            } else {
              mobileOldPrice.textContent = "";
              mobileOldPrice.classList.add("hidden");
            }
          }
          const center = elMobileQtyWrap.querySelector(".qty-pill__center");
          if (center) center.textContent = String(comboQty);
          const minusBtn = elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
          if (minusBtn) {
            const minusDisabled = comboQty <= 1;
            minusBtn.disabled = minusDisabled;
            minusBtn.classList.toggle("is-disabled", minusDisabled);
          }
          const plusBtn = elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
          if (plusBtn) {
            const plusDisabled = !canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) + 1));
            plusBtn.disabled = plusDisabled;
            plusBtn.classList.toggle("is-disabled", plusDisabled);
          }
        };

        const origUpdateFooterAction = updateFooterAction;
        updateFooterAction = () => {
          origUpdateFooterAction();
          syncMobileFromFooter();
        };

        elMobileQtyWrap.innerHTML = "";
        const clonedPill = qtyPill.pill.cloneNode(true);
        elMobileQtyWrap.appendChild(clonedPill);
        const clonedMinus = clonedPill.querySelector(".qty-pill__btn--minus");
        const clonedPlus = clonedPill.querySelector(".qty-pill__btn--plus");
        const clonedCenter = clonedPill.querySelector(".qty-pill__center");
        if (clonedMinus && clonedPlus && clonedCenter) {
          qtyPills.push({
            pill: clonedPill,
            btnMinus: clonedMinus,
            btnPlus: clonedPlus,
            center: clonedCenter,
          });
        }
        if (clonedMinus) {
          clonedMinus.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyQtyDelta(-1);
          });
        }
        if (clonedPlus) {
          clonedPlus.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyQtyDelta(+1);
          });
        }

        if (mobileProductActionsState.onAddToCart) {
          elMobileAddToCartBtn.removeEventListener("click", mobileProductActionsState.onAddToCart);
        }
        mobileProductActionsState.onAddToCart = () => actionBtn.click();
        elMobileAddToCartBtn.addEventListener("click", mobileProductActionsState.onAddToCart);

        syncMobileFromFooter();
      }

      actionBtn.addEventListener("click", () => {
        if (typeof onAdd === "function") onAdd({ qty: comboQty });
      });

      footer.appendChild(qtyWrap);
      footer.appendChild(actionBtn);
      return { footer, updateFooterAction };
    }

    function buildComboSelections() {
      const items = blocks.map((_block, blockIndex) => {
        const p = getSelectedProduct(blockIndex);
        if (!p) return null;
        const stateRaw = selectionStateByBlock[blockIndex] || {};
        const stateProductId = Number(stateRaw.product_id || 0);
        const selectedProductId = Number(p.product_id || 0);
        const state = stateProductId === selectedProductId
          ? stateRaw
          : makeEmptyComboBlockState();
        const oldPrice = state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
          ? Number(state.unit_price_before_discount)
          : Number(p.price) || 0;
        return { blockIndex, p, state, oldPrice };
      }).filter(Boolean);
      const sumOld = items.reduce((s, it) => s + it.oldPrice, 0);
      const totalDisc = totalPrice();
      let assigned = 0;
      const useProportional = sumOld > 0 && Number.isFinite(sumOld);
      return items.map((it, i) => {
        const isLast = i === items.length - 1;
        const unit_price_override = useProportional
          ? (isLast ? roundPrice(totalDisc - assigned) : roundPrice((it.oldPrice / sumOld) * totalDisc))
          : (it.state.unit_price_override != null && Number.isFinite(it.state.unit_price_override) ? Number(it.state.unit_price_override) : roundPrice(comboDiscountedPrice(it.oldPrice, discountPercent)));
        assigned += unit_price_override;
        return {
          product_id: it.p.product_id,
          product_name: it.p.product_name || "",
          product_photo: it.p.product_photo || null,
          unit_price_override,
          variant_label: it.state.variant_label || "",
          variant_group_id: it.state.variant_group_id != null ? Number(it.state.variant_group_id) : null,
          variant_value_index: it.state.variant_value_index,
          unit_id: it.state.unit_id != null ? Number(it.state.unit_id) : null,
          variant_group_title: it.state.variant_group_title || "",
          variant_unit: it.state.variant_unit || "",
          ingredients_display: it.state.ingredients_display || [],
        };
      });
    }

    function calculateComboOldSum() {
      return blocks.reduce((sum, _block, blockIndex) => {
        const p = getSelectedProduct(blockIndex);
        if (!p) return sum;
        const st = selectionStateByBlock[blockIndex] || {};
        const oldP = st.unit_price_before_discount != null && Number.isFinite(st.unit_price_before_discount)
          ? Number(st.unit_price_before_discount)
          : Number(p.price) || 0;
        return sum + oldP;
      }, 0);
    }

    function buildCurrentComboFavoriteSnapshot() {
      const selections = buildComboSelections();
      if (!selections.length) return null;

      const comboId = Number(combo?.id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;

      const safeQty = Math.max(1, Number(comboQty || 1));
      const oldUnitPrice = roundPrice(calculateComboOldSum());
      const unitPrice = roundPrice(
        selections.reduce((sum, sel) => sum + Number(sel?.unit_price_override || 0), 0)
      );

      const resolvedComboItem = {
        type: "combo",
        combo_id: comboId,
        combo_title: combo.title || "Комбо",
        qty: safeQty,
        selections,
        unit_price_override: unitPrice,
        unit_price_before_discount: oldUnitPrice,
      };

      const showOld = oldUnitPrice > unitPrice;
      return buildFavoriteSnapshotFromResolvedItem(resolvedComboItem, {
        oldLineTotal: showOld ? roundPrice(oldUnitPrice * safeQty) : null,
      });
    }

    function cloneComboDraftValue(value) {
      if (Array.isArray(value)) return value.map((v) => cloneComboDraftValue(v));
      if (value && typeof value === "object") {
        const out = {};
        Object.keys(value).forEach((k) => {
          out[k] = cloneComboDraftValue(value[k]);
        });
        return out;
      }
      return value;
    }

    function snapshotComboDraftState() {
      return {
        selectedIndexByBlock: selectedIndexByBlock.slice(),
        selectionStateByBlock: cloneComboDraftValue(selectionStateByBlock),
        expandedPickerProductIndex,
      };
    }

    function restoreComboDraftState(snapshot) {
      const selectedSnapshot = Array.isArray(snapshot?.selectedIndexByBlock)
        ? snapshot.selectedIndexByBlock
        : [];
      for (let i = 0; i < selectedIndexByBlock.length; i++) {
        const next = Number(selectedSnapshot[i]);
        if (Number.isFinite(next)) {
          selectedIndexByBlock[i] = next;
        }
      }

      const stateSnapshot = Array.isArray(snapshot?.selectionStateByBlock)
        ? snapshot.selectionStateByBlock
        : [];
      for (let i = 0; i < selectionStateByBlock.length; i++) {
        const stateRow = stateSnapshot[i];
        const sourceState = stateRow && typeof stateRow === "object"
          ? cloneComboDraftValue(stateRow)
          : makeEmptyComboBlockState();
        const targetState = selectionStateByBlock[i] && typeof selectionStateByBlock[i] === "object"
          ? selectionStateByBlock[i]
          : makeEmptyComboBlockState();
        Object.keys(targetState).forEach((k) => {
          if (!(k in sourceState)) delete targetState[k];
        });
        Object.keys(sourceState).forEach((k) => {
          targetState[k] = sourceState[k];
        });
        selectionStateByBlock[i] = targetState;
      }

      expandedPickerProductIndex = snapshot?.expandedPickerProductIndex ?? null;
    }

    function buildComboMainStateKey() {
      try {
        return JSON.stringify({
          qty: Math.max(1, Number(comboQty || 1)),
          selectedIndexByBlock: selectedIndexByBlock.slice(),
          selectionStateByBlock: cloneComboDraftValue(selectionStateByBlock),
        });
      } catch {
        return String(Date.now());
      }
    }

    function buildComboPickerStateKey(blockIndex) {
      try {
        return JSON.stringify({
          blockIndex: Number(blockIndex || 0),
          qty: Math.max(1, Number(comboQty || 1)),
          selectedIndexByBlock: selectedIndexByBlock.slice(),
          selectionStateByBlock: cloneComboDraftValue(selectionStateByBlock),
          expandedPickerProductIndex,
        });
      } catch {
        return `${Number(blockIndex || 0)}:${Date.now()}`;
      }
    }

    function buildDraftComboCart(desiredQty) {
      const selections = buildComboSelections();
      if (!selections.length) return null;

      const safeQty = Math.max(1, Number(desiredQty) || 1);
      const comboId = combo.id;
      const draftSumOld = calculateComboOldSum();
      const draftCart = cloneCartState(state.cart);

      if (isEditFromCart && cartKey) {
        const draftItem = draftCart.find((x) => x.key === cartKey);
        if (!draftItem) return null;
        draftItem.qty = safeQty;
        draftItem.selections = selections;
        draftItem.unit_price_before_discount = roundPrice(draftSumOld);
      } else {
        draftCart.push({
          key: `combo-draft-${comboId}`,
          type: "combo",
          combo_id: comboId,
          combo_title: combo.title || "Комбо",
          qty: safeQty,
          selections,
          unit_price_before_discount: roundPrice(draftSumOld),
        });
      }

      return draftCart;
    }

    function collectComboDraftProductIds(selections) {
      const ids = new Set();
      (Array.isArray(selections) ? selections : []).forEach((sel) => {
        const productId = Number(sel?.product_id || 0);
        if (Number.isFinite(productId) && productId > 0) {
          ids.add(productId);
          if (typeof getProductIngredientRequirementsSync === "function") {
            const requirements = getProductIngredientRequirementsSync(productId);
            if (requirements === null && typeof ensureProductIngredientRequirements === "function") {
              ensureProductIngredientRequirements(productId).catch(() => {});
            }
            if (requirements instanceof Map) {
              requirements.forEach((_requiredQty, depPid) => {
                const id = Number(depPid || 0);
                if (Number.isFinite(id) && id > 0) ids.add(id);
              });
            }
          }
        }
        const ingredients = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
        ingredients.forEach((ing) => {
          const ingId = Number(ing?.ingredient_id || ing?.product_id || 0);
          if (Number.isFinite(ingId) && ingId > 0) ids.add(ingId);
        });
      });
      return ids;
    }

    function canUseComboDraftQtyLocal(desiredQty) {
      const draftCart = buildDraftComboCart(desiredQty);
      if (!draftCart) return false;
      const affectedProducts = collectComboDraftProductIds(buildComboSelections());
      for (const pid of affectedProducts) {
        const stockEntry = getStockLevelEntry(pid);
        if (!stockEntry || stockEntry.qty === null || stockEntry.qty === undefined || stockEntry.isUnlimited) {
          continue;
        }
        const stockQty = Number(stockEntry.qty);
        if (!Number.isFinite(stockQty)) continue;
        const consumed = calcProductStockConsumed(pid, draftCart);
        if (consumed > stockQty + 1e-9) return false;
      }
      return true;
    }

    function canUseComboDraftForProductIdsLocal(draftCart, productIds) {
      const ids = Array.isArray(productIds)
        ? productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];
      if (!ids.length) return true;

      if (typeof canUseCartDraftForProductIds === "function") {
        try {
          return canUseCartDraftForProductIds(draftCart, ids) !== false;
        } catch {}
      }

      for (const pid of ids) {
        const stockEntry = getStockLevelEntry(pid);
        if (!stockEntry || stockEntry.qty === null || stockEntry.qty === undefined || stockEntry.isUnlimited) {
          continue;
        }
        const stockQty = Number(stockEntry.qty);
        if (!Number.isFinite(stockQty)) continue;
        const consumed = calcProductStockConsumed(pid, draftCart);
        if (consumed > stockQty + 1e-9) return false;
      }
      return true;
    }

    function canUseComboBlockSelectionAtIndex(blockIndex, candidateIndex, { preview = null } = {}) {
      const block = blocks[blockIndex];
      if (!block || !Array.isArray(block.products)) return false;
      const prod = block.products[candidateIndex];
      if (!prod) return false;
      const productId = Number(prod.product_id || 0);
      if (!Number.isFinite(productId) || productId <= 0) return false;

      const snapshot = snapshotComboDraftState();
      try {
        selectedIndexByBlock[blockIndex] = candidateIndex;
        const draftState = selectionStateByBlock[blockIndex];
        if (preview && typeof preview === "object") {
          applyComboPreviewToBlockState(draftState, productId, preview);
        } else if (draftState && Number(draftState.product_id || 0) !== productId) {
          Object.keys(draftState).forEach((k) => delete draftState[k]);
          Object.assign(draftState, makeEmptyComboBlockState());
        }

        const draftCart = buildDraftComboCart(Math.max(1, Number(comboQty) || 1));
        if (!draftCart) return false;
        const selections = buildComboSelections();
        const targetSelection =
          selections[blockIndex] ||
          selections.find((sel) => Number(sel?.product_id || 0) === productId) ||
          null;
        if (!targetSelection) return false;
        const affectedProducts = collectComboDraftProductIds([targetSelection]);
        return canUseComboDraftForProductIdsLocal(draftCart, Array.from(affectedProducts));
      } catch {
        return false;
      } finally {
        restoreComboDraftState(snapshot);
      }
    }

    function applyComboPreviewToBlockState(blockState, productId, preview) {
      if (!blockState || typeof blockState !== "object") return;
      const pid = Number(productId || 0);
      const safePreview = preview && typeof preview === "object" ? preview : {};
      blockState.product_id = Number.isFinite(pid) && pid > 0 ? pid : null;
      blockState.variant_label = String(safePreview.variant_label || "");
      blockState.variant_group_id = safePreview.variant_group_id != null
        ? Number(safePreview.variant_group_id)
        : null;
      blockState.variant_value_index = safePreview.variant_value_index != null
        ? Number(safePreview.variant_value_index)
        : null;
      blockState.variant_group_title = String(safePreview.variant_group_title || "");
      blockState.variant_unit = String(safePreview.variant_unit || "");
      blockState.unit_id = safePreview.unit_id != null ? Number(safePreview.unit_id) : null;
      const previewIngredients = Array.isArray(safePreview.ingredients_display)
        ? safePreview.ingredients_display
        : [];
      blockState.ingredients_display = previewIngredients.map((ing) => cloneComboDraftValue(ing));
      blockState.unit_price_override = safePreview.unit_price_override != null && Number.isFinite(Number(safePreview.unit_price_override))
        ? Number(safePreview.unit_price_override)
        : null;
      blockState.unit_price_before_discount = safePreview.unit_price_before_discount != null && Number.isFinite(Number(safePreview.unit_price_before_discount))
        ? Number(safePreview.unit_price_before_discount)
        : null;
    }

    function canUseComboPickerCandidateWithPreview(blockIndex, candidateIndex, preview, { scope = "block" } = {}) {
      if (scope === "full") {
        const block = blocks[blockIndex];
        if (!block || !Array.isArray(block.products)) return false;
        const prod = block.products[candidateIndex];
        if (!prod) return false;
        const productId = Number(prod.product_id || 0);
        if (!Number.isFinite(productId) || productId <= 0) return false;
        const snapshot = snapshotComboDraftState();
        try {
          selectedIndexByBlock[blockIndex] = candidateIndex;
          const draftState = selectionStateByBlock[blockIndex];
          applyComboPreviewToBlockState(draftState, productId, preview);
          return canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) || 1));
        } catch {
          return false;
        } finally {
          restoreComboDraftState(snapshot);
        }
      }
      return canUseComboBlockSelectionAtIndex(blockIndex, candidateIndex, { preview });
    }

    async function canUseComboDraftQty(desiredQty, { showToastOnOut = true } = {}) {
      const draftCart = buildDraftComboCart(desiredQty);
      if (!draftCart) return false;
      const payload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved(draftCart));
      const check = await checkStockForItemsPayload(payload, {
        showToastOnOut,
        toastMessage: "\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut: false,
      });
      return check.available;
    }

    async function guardComboDraftMutation(
      mutator,
      { showToastOnOut = true, onReject } = {}
    ) {
      if (typeof mutator !== "function") return false;
      const snapshot = snapshotComboDraftState();
      try {
        await mutator();
        const allowed = canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) || 1));
        if (allowed) return true;
      } catch (e) {
        console.warn("Combo draft stock check failed:", e);
      }
      restoreComboDraftState(snapshot);
      if (showToastOnOut) {
        showToast("Больше нет в наличии");
      }
      if (typeof onReject === "function") {
        try { onReject(); } catch {}
      }
      return false;
    }

    let comboHydratedOnce = false;

    async function hydrateBlockSelection(blockIndex, opts = {}) {
      const options = opts && typeof opts === "object" ? opts : {};
      const useRandomizer = options.useRandomizer === true;
      const preferSavedState = options.preferSavedState !== false;
      const block = blocks[blockIndex];
      if (!block) return;
      const prod = getSelectedProduct(blockIndex);
      if (!prod) return;
      const productId = Number(prod.product_id);
      if (!Number.isFinite(productId) || productId <= 0) return;

      try {
        const [product, variants, ingredients] = await Promise.all([
          ensureProduct(productId),
          resolveProductVariants(productId),
          resolveProductIngredients(productId),
        ]);
        if (!product) return;

        const state = selectionStateByBlock[blockIndex] || {};
        const vGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
        const values = Array.isArray(vGroup?.values) ? vGroup.values : [];
        let vIdx;

        // Если в состоянии уже сохранён вариант именно для этого товара — используем его.
        const hasSavedStateForProduct =
          state.product_id === productId &&
          (state.variant_value_index != null || (Array.isArray(state.ingredients_display) && state.ingredients_display.length > 0));
        const useSavedStateForProduct = preferSavedState && hasSavedStateForProduct;

        if (useSavedStateForProduct && state.variant_value_index != null) {
          vIdx = Number(state.variant_value_index);
        } else if (useRandomizer && values.length > 1) {
          const shuffledVariantIdx = randomShuffle(values.map((_v, idx) => idx));
          vIdx = Number(shuffledVariantIdx[0] ?? 0);
        } else if (vGroup?.default_value_index != null) {
          vIdx = Number(vGroup.default_value_index);
        } else {
          vIdx = 0;
        }

        if (!Number.isFinite(vIdx)) vIdx = 0;
        if (values.length) {
          vIdx = Math.max(0, Math.min(vIdx, values.length - 1));
        } else {
          vIdx = 0;
        }
        const vState = {
          selectedIndex: vIdx,
          value: values[vIdx],
          label: String(values[vIdx] || ""),
        };

        const baseUnit = Array.isArray(variants) && variants.length
          ? getVariantUnitPrice(product, variants, vState)
          : Number(product.price || 0);
        let unit = baseUnit;

        // Базовое количество: при повторном открытии шестерёнки берём сохранённый состав
        const ingredientQty = new Map();
        if (useSavedStateForProduct && Array.isArray(state.ingredients_display) && state.ingredients_display.length) {
          state.ingredients_display.forEach((ing) => {
            const ingId = Number(ing.ingredient_id);
            if (Number.isFinite(ingId)) ingredientQty.set(ingId, Number(ing.quantity ?? ing.qty ?? 0));
          });
        } else if (useRandomizer) {
          ingredients.forEach((ing) => {
            const ingId = Number(ing.ingredient_id);
            if (!Number.isFinite(ingId)) return;
            const defaultQty = Number(ing.quantity ?? 1);
            const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
            const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
            const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
            const maxRaw = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
            const max = Number.isFinite(maxRaw) ? maxRaw : defaultQty;
            const stepRaw = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
            const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
            if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
              ingredientQty.set(ingId, defaultQty);
              return;
            }
            const stepsCount = Math.max(0, Math.floor((max - min) / step));
            const randomStep = Math.floor(Math.random() * (stepsCount + 1));
            const randomQty = min + randomStep * step;
            ingredientQty.set(ingId, Math.max(min, Math.min(max, randomQty)));
          });
        }
        ingredients.forEach((ing) => {
          const ingId = Number(ing.ingredient_id);
          if (!Number.isFinite(ingId)) return;
          if (!ingredientQty.has(ingId)) ingredientQty.set(ingId, Number(ing.quantity ?? 0));
        });

        ingredients.forEach((ing) => {
          const ingId = Number(ing.ingredient_id);
          if (!Number.isFinite(ingId)) return;
          const q = Number(ingredientQty.get(ingId) ?? 0);
          const baseQty = Number(ing.quantity ?? 1);
          const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
          const ingredientPrice = Number(ing.ingredient_price || 0);
          const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
          const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
          const currentQtyInBase = getQtyInBase(ing, q);
          const baseQtyInBase = getQtyInBase(ing, baseQty);
          const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
            ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
            : (Number.isFinite(pricePerUnit) ? (q - baseQty) * pricePerUnit : 0);
          unit += diff;
        });

        // Разрешаем цене быть ниже базовой при уменьшении состава, но не ниже нуля.
        unit = Math.max(0, unit);
        state.unit_price_before_discount = roundPrice(unit);
        const discounted = comboDiscountedPrice(unit, discountPercent);
        state.unit_price_override = roundPrice(discounted);
        state.product_id = productId;
        state.variant_label = vState.label;
        state.variant_group_id = (vGroup && (vGroup.id || vGroup.variant_group_id)) ? Number(vGroup.id || vGroup.variant_group_id) : null;
        state.variant_group_title = (vGroup && (vGroup.title || vGroup.title_label)) ? String(vGroup.title || vGroup.title_label) : "";
        state.variant_unit = (vGroup && (vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code)) ? String(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) : "";
        state.unit_id = vGroup && vGroup.unit_id != null ? Number(vGroup.unit_id) : null;
        state.variant_value_index = vIdx;
        state.ingredients_display = ingredients.map((ing) => {
          const ingId = Number(ing.ingredient_id);
          const q = ingredientQty.get(ingId) ?? Number(ing.quantity ?? 0) ?? 0;
          const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "г";
          return {
            ingredient_id: ing.ingredient_id,
            name: ing.ingredient_name || ing.name || "",
            quantity: q,
            qty: q,
            unit: unitLabel,
            unit_id: ing.unit_id != null ? Number(ing.unit_id) : null,
          };
        });
        selectionStateByBlock[blockIndex] = state;
      } catch (e) {
        console.warn("hydrateComboSelectionsFromDefaults failed for product", productId, e);
      }
    }

    async function hydrateComboSelectionsFromDefaults() {
      if (comboHydratedOnce) return;
      comboHydratedOnce = true;
      applyRandomizedInitialSelections();
      await Promise.all(blocks.map((_, blockIndex) => hydrateBlockSelection(blockIndex, {
        useRandomizer: shouldRandomizeInitialPreset,
        preferSavedState: true,
      })));
    }

    function renderComboDetailsLines(detailsWrap, variantLabel, ingredientsDisplay, opts) {
      const o = opts || {};
      const variantGroupTitle = str(o.variantGroupTitle || "").trim();
      const variantUnit = str(o.variantUnit || "").trim();
      const label = str(variantLabel || "").trim();
      const ingList = Array.isArray(ingredientsDisplay) ? ingredientsDisplay : [];

      detailsWrap.innerHTML = "";

      if (!label && !ingList.length) {
        return;
      }

      const subDetails = document.createElement("div");
      subDetails.className = "cart-sub-details";
      subDetails.style.display = "block";

      if (label) {
        const vLine = document.createElement("div");
        vLine.className = "cart-sub-detail-item";
        const variantParts = [label];
        if (variantUnit) variantParts.push(variantUnit);
        if (variantGroupTitle) variantParts.push(variantGroupTitle);
        vLine.textContent = "• " + variantParts.join(" ");
        subDetails.appendChild(vLine);
      }

      ingList.forEach((ing) => {
        const name = str(ing?.name || ing?.ingredient_name || "").trim();
        const rawQty = ing?.qty ?? ing?.quantity;
        const unit = str(ing?.unit || ing?.unit_short_title || ing?.unit_label || "").trim();
        const numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
        if (Number.isFinite(numQty) && numQty === 0) return;
        if (!name && (rawQty == null || rawQty === "")) return;

        const line = document.createElement("div");
        line.className = "cart-sub-detail-item";
        const parts = [];
        if (rawQty != null && rawQty !== "") parts.push(String(rawQty));
        if (unit) parts.push(unit);
        if (name) parts.push(name);
        line.textContent = "• " + parts.join(" ");
        subDetails.appendChild(line);
      });
      detailsWrap.appendChild(subDetails);
    }

    function getComboDescriptionDetailLines(rawText) {
      const text = str(rawText || "");
      if (!text.trim()) return [];
      return text
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\u2022\-\s]+/, "").trim())
        .filter((line) => !!line);
    }

    function renderComboFallbackDetailLines(detailsWrap, rawText) {
      const lines = getComboDescriptionDetailLines(rawText);
      if (!lines.length) return false;
      detailsWrap.innerHTML = "";
      const subDetails = document.createElement("div");
      subDetails.className = "cart-sub-details";
      subDetails.style.display = "block";
      lines.forEach((textLine) => {
        const line = document.createElement("div");
        line.className = "cart-sub-detail-item";
        line.textContent = "вЂў " + textLine;
        subDetails.appendChild(line);
      });
      detailsWrap.appendChild(subDetails);
      return true;
    }

    async function getComboProductPreview(productId) {
      const id = Number(productId);
      if (!Number.isFinite(id) || id <= 0) {
        return {
          variant_label: "",
          variant_group_id: null,
          variant_value_index: null,
          variant_group_title: "",
          variant_unit: "",
          unit_id: null,
          ingredients_display: [],
          hasConfigurable: false,
          unit_price_override: null,
          unit_price_before_discount: null,
        };
      }

      if (comboProductPreviewCache.has(id)) {
        return comboProductPreviewCache.get(id);
      }
      const previewSharedKey = `${id}:${Number(discountPercent || 0)}`;
      const sharedPreviewPromise = getSharedComboProductPreview(previewSharedKey);
      if (sharedPreviewPromise) {
        comboProductPreviewCache.set(id, sharedPreviewPromise);
        return sharedPreviewPromise;
      }

      const promise = (async () => {
        try {
          const [product, variants, ingredients] = await Promise.all([
            ensureProduct(id),
            resolveProductVariants(id),
            resolveProductIngredients(id),
          ]);
          if (!product) {
            return {
              variant_label: "",
              variant_group_id: null,
              variant_value_index: null,
              variant_group_title: "",
              variant_unit: "",
              unit_id: null,
              ingredients_display: [],
              hasConfigurable: false,
              unit_price_override: null,
              unit_price_before_discount: null,
            };
          }

          const vGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
          const values = Array.isArray(vGroup?.values) ? vGroup.values : [];
          let vIdx =
            vGroup?.default_value_index != null
              ? Number(vGroup.default_value_index)
              : 0;
          if (!Number.isFinite(vIdx)) vIdx = 0;
          if (values.length) {
            vIdx = Math.max(0, Math.min(vIdx, values.length - 1));
          } else {
            vIdx = 0;
          }

          const variantLabel = values[vIdx] != null ? String(values[vIdx]) : "";
          const variantGroupId = vGroup && (vGroup.id || vGroup.variant_group_id) != null
            ? Number(vGroup.id || vGroup.variant_group_id)
            : null;
          const variantUnitId = vGroup && vGroup.unit_id != null ? Number(vGroup.unit_id) : null;

          const ingredientQty = new Map();
          ingredients.forEach((ing) => {
            const ingId = Number(ing.ingredient_id);
            if (!Number.isFinite(ingId)) return;
            const baseQty = Number(ing.quantity ?? 0);
            ingredientQty.set(ingId, baseQty);
          });

          const variantGroupTitle = vGroup && (vGroup.title || vGroup.title_label) ? String(vGroup.title || vGroup.title_label) : "";
          const variantUnit = vGroup && (vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) ? String(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) : "";
          const ingredientsDisplay = ingredients.map((ing) => {
            const ingId = Number(ing.ingredient_id);
            const q = ingredientQty.get(ingId) ?? Number(ing.quantity ?? 0) ?? 0;
            const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "г";
              return {
                ingredient_id: ing.ingredient_id,
                name: ing.ingredient_name || ing.name || "",
                quantity: q,
                qty: q,
                unit_id: ing.unit_id != null ? Number(ing.unit_id) : null,
                unit: unitLabel,
              };
            });

          const hasVariantChoices = Array.isArray(values) && values.length > 1;
          const hasAdjustableIngredients = ingredients.some((ing) => {
            const minQty = Number(ing.quantity_min ?? 0);
            const maxQtyRaw = Number(ing.quantity_max);
            const hasMax = Number.isFinite(maxQtyRaw) && maxQtyRaw > 0;
            const maxQty = hasMax ? maxQtyRaw : Infinity;
            const step = Number(ing.quantity_step ?? 1) || 1;
            return step > 0 && (maxQty > minQty);
          });

          let unit_price_override = null;
          let unit_price_before_discount = null;
          try {
            const vState = { selectedIndex: vIdx, value: values[vIdx], label: variantLabel };
            let baseUnit = Array.isArray(variants) && variants.length ? getVariantUnitPrice(product, variants, vState) : Number(product.price || 0);
            let unit = baseUnit;
            ingredients.forEach((ing) => {
              const ingId = Number(ing.ingredient_id);
              if (!Number.isFinite(ingId)) return;
              const q = Number(ingredientQty.get(ingId) ?? 0);
              const baseQty = Number(ing.quantity ?? 1);
              const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
              const ingredientPrice = Number(ing.ingredient_price || 0);
              const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
              const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
              const currentQtyInBase = getQtyInBase(ing, q);
              const baseQtyInBase = getQtyInBase(ing, baseQty);
              const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
                ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
                : (Number.isFinite(pricePerUnit) ? (q - baseQty) * pricePerUnit : 0);
              unit += diff;
            });
            // Разрешаем цене опускаться ниже базовой при уменьшении состава, но не ниже нуля.
            unit = Math.max(0, unit);
            unit_price_before_discount = roundPrice(unit);
            unit_price_override = roundPrice(comboDiscountedPrice(unit, discountPercent));
          } catch (e) {
            // оставляем null — в карточке останется базовая цена
          }

          return {
            variant_label: variantLabel,
            variant_group_id: variantGroupId,
            variant_value_index: vIdx,
            variant_group_title: variantGroupTitle,
            variant_unit: variantUnit,
            unit_id: variantUnitId,
            ingredients_display: ingredientsDisplay,
            hasConfigurable: Boolean(hasVariantChoices || hasAdjustableIngredients),
            unit_price_override: unit_price_override,
            unit_price_before_discount: unit_price_before_discount,
          };
        } catch (e) {
          console.warn("getComboProductPreview failed for product", id, e);
          return {
            variant_label: "",
            variant_group_id: null,
            variant_value_index: null,
            variant_group_title: "",
            variant_unit: "",
            unit_id: null,
            ingredients_display: [],
            hasConfigurable: false,
            unit_price_override: null,
            unit_price_before_discount: null,
          };
        }
      })();

      comboProductPreviewCache.set(id, promise);
      setSharedComboProductPreview(previewSharedKey, promise);
      return promise;
    }

    function warmBlockPickerPreviews(block) {
      const safeBlock = block && typeof block === "object" ? block : null;
      if (!safeBlock) return Promise.resolve(new Map());
      const blockCacheKey = getComboBlockPreviewCacheKey(safeBlock, discountPercent);
      const resolvedMap = getSharedComboBlockPreviewResolved(blockCacheKey);
      if (resolvedMap) return Promise.resolve(resolvedMap);
      const sharedWarmPromise = getSharedComboBlockPreviewWarm(blockCacheKey);
      if (sharedWarmPromise) return sharedWarmPromise;

      const localWarmPromise = (async () => {
        const products = Array.isArray(safeBlock.products) ? safeBlock.products : [];
        const previewEntries = await Promise.all(
          products.map(async (prod) => {
            const pid = Number(prod?.product_id || 0);
            if (!Number.isFinite(pid) || pid <= 0) return null;
            try {
              const preview = await getComboProductPreview(pid);
              return [pid, preview];
            } catch {
              return null;
            }
          })
        );
        const previewMap = new Map();
        previewEntries.forEach((entry) => {
          if (!entry) return;
          previewMap.set(entry[0], entry[1]);
        });
        setSharedComboBlockPreviewResolved(blockCacheKey, previewMap);
        return previewMap;
      })();

      setSharedComboBlockPreviewWarm(blockCacheKey, localWarmPromise);
      return localWarmPromise;
    }

    const discountBadgeText = discountPercent ? `-${discountPercent}%` : "";

    function reconcileComboSelectionsForMainView() {
      blocks.forEach((block, blockIndex) => {
        const products = Array.isArray(block?.products) ? block.products : [];
        if (!products.length) return;

        let currentIdx = Number(selectedIndexByBlock[blockIndex]);
        if (!Number.isFinite(currentIdx)) currentIdx = 0;
        currentIdx = Math.max(0, Math.min(currentIdx, products.length - 1));
        selectedIndexByBlock[blockIndex] = currentIdx;

        const currentAllowed = canUseComboBlockSelectionAtIndex(blockIndex, currentIdx);
        if (currentAllowed) return;

        let fallbackIdx = -1;
        for (let idx = 0; idx < products.length; idx++) {
          if (idx === currentIdx) continue;
          if (canUseComboBlockSelectionAtIndex(blockIndex, idx)) {
            fallbackIdx = idx;
            break;
          }
        }
        if (fallbackIdx < 0) return;

        selectedIndexByBlock[blockIndex] = fallbackIdx;
        const fallbackProductId = Number(products[fallbackIdx]?.product_id || 0);
        const draftState = selectionStateByBlock[blockIndex];
        if (draftState && Number(draftState.product_id || 0) !== fallbackProductId) {
          Object.keys(draftState).forEach((k) => delete draftState[k]);
          Object.assign(draftState, makeEmptyComboBlockState());
        }
      });
    }

    function renderMainView() {
      reconcileComboSelectionsForMainView();
      if (openCartSheetCtx) {
        openCartSheetCtx.comboStepBack = null;
        sheetNavigationState.screen = "combo";
        setSheetHeaderMode("product", {
          onBack,
          discountBadge: discountBadgeText,
          favoriteBuildSnapshot: buildCurrentComboFavoriteSnapshot,
        });
      } else {
        // Десктоп: кнопка «Назад» снова закрывает панель комбо
        window._comboStepBackCallback = null;
        // Привязка избранного к десктопной кнопке
        const dFavBtn = document.getElementById("shopCartFavBtn");
        if (dFavBtn) {
          const fb = dFavBtn.cloneNode(true);
          dFavBtn.replaceWith(fb);
          fb.classList.remove("is-active", "is-busy");
          delete fb.dataset.favoriteId;
          bindFavoriteButtonsForCartRow(
            [fb],
            () => buildCurrentComboFavoriteSnapshot()
          );
        }
      }
      const mainStateKey = buildComboMainStateKey();
      if (cachedMainView && cachedMainStateKey === mainStateKey) {
        container.innerHTML = "";
        container.appendChild(cachedMainView);
        const cachedFooterUpdate = cachedMainView.__comboFooterUpdate;
        renderMainView._updateFooterAction =
          typeof cachedFooterUpdate === "function" ? cachedFooterUpdate : null;
        if (typeof renderMainView._updateFooterAction === "function") {
          renderMainView._updateFooterAction();
        }
        if (isStaticComboView && Number.isFinite(comboIdForRender) && comboIdForRender > 0) {
          container.__shopRenderedViewType = "combo";
          container.__shopRenderedProductId = "";
          container.__shopRenderedComboId = comboIdForRender;
          container.__shopRenderedComboMain = true;
        }
        return;
      }
      container.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "shop-combo-detail";

      const titleEl = document.createElement("h1");
      titleEl.className = "shop-combo-detail-title";
      titleEl.textContent = combo.title || "Комбо";
      wrap.appendChild(titleEl);

      // Подпись (как на карточке комбо в каталоге)
      const caption = (combo.description || "").trim();
      if (caption) {
        const captionEl = document.createElement("div");
        captionEl.className = "shop-combo-detail-caption";
        captionEl.textContent = caption;
        wrap.appendChild(captionEl);
      }

      const list = document.createElement("div");
      list.className = "shop-combo-list";

      blocks.forEach((block, blockIndex) => {
        const prod = getSelectedProduct(blockIndex);
        if (!prod) return;

        const state = selectionStateByBlock[blockIndex] || {};
        const variantLabel = str(state.variant_label || "").trim();
        const ingredientsDisplay = Array.isArray(state.ingredients_display) ? state.ingredients_display : [];
        const displayPrice = state.unit_price_override != null && Number.isFinite(state.unit_price_override)
          ? Number(state.unit_price_override)
          : comboDiscountedPrice(prod.price, discountPercent);

        const row = document.createElement("div");
        row.className = "cart-row shop-combo-row";

        const img = createOptimizedImage(prod.product_photo || "/static/img/placeholder.png", {
          type: "cart-thumb",
          className: "cart-thumb",
          alt: "",
          usePicture: true,
        });
        row.appendChild(img);

        const mid = document.createElement("div");
        mid.className = "cart-mid shop-combo-mid";

        const t = document.createElement("div");
        t.className = "cart-title";
        t.textContent = str(prod.product_name || "");
        mid.appendChild(t);

        const subText = (prod.product_description_short || "").trim();
        if (subText) {
          const sub = document.createElement("div");
          sub.className = "cart-sub";
          sub.textContent = subText;
          mid.appendChild(sub);
        }

        if (variantLabel || ingredientsDisplay.length) {
          const detailsWrap = document.createElement("div");
          detailsWrap.className = "cart-sub-container";
          renderComboDetailsLines(detailsWrap, variantLabel, ingredientsDisplay, {
            variantGroupTitle: state.variant_group_title || "",
            variantUnit: state.variant_unit || "",
          });
          if (detailsWrap.childNodes.length) {
            mid.appendChild(detailsWrap);
          }
        }

        const bottom = document.createElement("div");
        bottom.className = "shop-combo-row-bottom";

        const replaceBtn = document.createElement("button");
        replaceBtn.type = "button";
        replaceBtn.className = "shop-combo-replace";
        replaceBtn.textContent = "Заменить";
        replaceBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          renderBlockPicker(blockIndex);
        });
        bottom.appendChild(replaceBtn);

        const oldPrice = state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
          ? Number(state.unit_price_before_discount)
          : Number(prod.price) || 0;
        if (oldPrice > displayPrice) {
          const oldEl = document.createElement("span");
          oldEl.className = "shop-combo-old";
          oldEl.textContent = moneyNoSign(oldPrice) + " ₽";
          bottom.appendChild(oldEl);
        }
        const pr = document.createElement("span");
        pr.className = "shop-combo-price";
        pr.textContent = moneyNoSign(displayPrice) + " ₽";
        bottom.appendChild(pr);

        mid.appendChild(bottom);
        row.appendChild(mid);
        list.appendChild(row);
      });

      wrap.appendChild(list);

      const { footer, updateFooterAction } = renderFooter({
        actionLabel: isEditFromCart ? "Сохранить" : "в корзину",
        onAdd: async ({ qty }) => {
          const previousCartSnapshot = cloneCartState(state.cart);
          let cartMutated = false;
          const selections = buildComboSelections();
          if (!selections.length) return;
          const comboId = combo.id;
          const desiredQty = Math.max(1, Number(qty) || 1);
          const draftSumOld = calculateComboOldSum();
          const draftCart = cloneCartState(state.cart);
          if (isEditFromCart && cartKey) {
            const draftItem = draftCart.find((x) => x.key === cartKey);
            if (!draftItem) return;
            draftItem.qty = desiredQty;
            draftItem.selections = selections;
            draftItem.unit_price_before_discount = roundPrice(draftSumOld);
          } else {
            draftCart.push({
              key: `combo-draft-${comboId}`,
              type: "combo",
              combo_id: comboId,
              combo_title: combo.title || "Комбо",
              qty: desiredQty,
              selections,
              unit_price_before_discount: roundPrice(draftSumOld),
            });
          }
          try {
            const payload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved(draftCart));
            const draftCheck = await checkStockForItemsPayload(payload, {
              showToastOnOut: true,
              toastMessage: "\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut: false,
            });
            if (!draftCheck.available) return;
          } catch (e) {
            console.warn("Stock check before combo add failed:", e);
            return;
          }
          if (isEditFromCart && cartKey) {
            const cartItem = state.cart.find((x) => x.key === cartKey);
            if (cartItem) {
              const sumOld = calculateComboOldSum();
              cartItem.qty = desiredQty;
              cartItem.selections = selections;
              cartItem.unit_price_before_discount = roundPrice(sumOld);
              applyAutoAddRules();
              saveCart();
              if (typeof scheduleSyncAllProductCardsFromCart === "function") scheduleSyncAllProductCardsFromCart();
              renderCart();
              updateCartBadge();
              cartMutated = true;
              if (typeof onBack === "function") onBack();
            }
          } else {
            const key = "combo-" + comboId + "-" + Date.now();
            const sumOld = calculateComboOldSum();
            state.cart.push({
              key,
              type: "combo",
              combo_id: comboId,
              combo_title: combo.title || "Комбо",
              qty: desiredQty,
              selections,
              unit_price_before_discount: roundPrice(sumOld),
            });
            applyAutoAddRules();
            saveCart();
            if (typeof scheduleSyncAllProductCardsFromCart === "function") scheduleSyncAllProductCardsFromCart();
            renderCart();
            updateCartBadge();
            cartMutated = true;
            if (typeof onBack === "function") onBack();
          }
          if (cartMutated) {
            queueCartStockRecheck(previousCartSnapshot, {
              toastMessage: "Больше нет в наличии",
            });
          }
        },
      });

      const viewWrap = document.createElement("div");
      viewWrap.className = "shop-combo-view";
      wrap.classList.add("shop-combo-detail-scroll");
      viewWrap.appendChild(wrap);
      viewWrap.appendChild(footer);
      container.appendChild(viewWrap);

      viewWrap.__comboFooterUpdate = updateFooterAction;
      cachedMainView = viewWrap;
      cachedMainStateKey = mainStateKey;
      renderMainView._updateFooterAction = updateFooterAction;
      if (isStaticComboView && Number.isFinite(comboIdForRender) && comboIdForRender > 0) {
        container.__shopRenderedViewType = "combo";
        container.__shopRenderedProductId = "";
        container.__shopRenderedComboId = comboIdForRender;
        container.__shopRenderedComboMain = true;
      }
    }

    let pickerFooterUpdate = null;

    function renderBlockPicker(blockIndex, scrollToRestore) {
      let normalizedBlockIndex = Number(blockIndex);
      if (!Number.isFinite(normalizedBlockIndex)) normalizedBlockIndex = 0;
      normalizedBlockIndex = Math.floor(normalizedBlockIndex);
      if (normalizedBlockIndex < 0 || normalizedBlockIndex >= blocks.length) {
        normalizedBlockIndex = 0;
      }
      blockIndex = normalizedBlockIndex;

      const block = blocks[blockIndex];
      if (!block || !block.products || !block.products.length) return;
      const shouldForceDefaultStateInPicker = isStaticComboView && !seedComboItem;
      if (
        shouldForceDefaultStateInPicker &&
        !pickerDefaultsInitializedByBlock.has(Number(blockIndex)) &&
        !pickerBlockHydrating.has(Number(blockIndex))
      ) {
        pickerBlockHydrating.add(Number(blockIndex));
        Promise.resolve()
          .then(() => hydrateBlockSelection(blockIndex, {
            useRandomizer: false,
            preferSavedState: false,
          }))
          .catch(() => {})
          .finally(() => {
            pickerBlockHydrating.delete(Number(blockIndex));
            pickerDefaultsInitializedByBlock.add(Number(blockIndex));
            renderBlockPicker(blockIndex, scrollToRestore);
          });
        return;
      }
      const selectedProdForHydrate = getSelectedProduct(blockIndex);
      const selectedStateForHydrate = selectionStateByBlock[blockIndex] || {};
      const selectedProductIdForHydrate = Number(selectedProdForHydrate?.product_id || 0);
      const stateProductIdForHydrate = Number(selectedStateForHydrate?.product_id || 0);
      const hasStateDetailsForSelected =
        stateProductIdForHydrate === selectedProductIdForHydrate &&
        (str(selectedStateForHydrate?.variant_label || "").trim() !== "" ||
          (Array.isArray(selectedStateForHydrate?.ingredients_display) &&
            selectedStateForHydrate.ingredients_display.length > 0));
      if (
        Number.isFinite(selectedProductIdForHydrate) &&
        selectedProductIdForHydrate > 0 &&
        !hasStateDetailsForSelected &&
        !pickerBlockHydrating.has(Number(blockIndex))
      ) {
        pickerBlockHydrating.add(Number(blockIndex));
        Promise.resolve()
          .then(() => hydrateBlockSelection(blockIndex, {
            useRandomizer: false,
            preferSavedState: true,
          }))
          .catch(() => {})
          .finally(() => {
            pickerBlockHydrating.delete(Number(blockIndex));
            renderBlockPicker(blockIndex, scrollToRestore);
          });
        return;
      }
      container.__shopRenderedComboMain = false;
      const blockPreviewWarmKey = getComboBlockPreviewCacheKey(block, discountPercent);
      const prewarmedBlockPromise = getSharedComboBlockPreviewWarm(blockPreviewWarmKey);
      const prefetchComboPickerBlockConfig = (products) => {
        const ids = new Set();
        (Array.isArray(products) ? products : []).forEach((prod) => {
          const pid = Number(prod?.product_id || 0);
          if (Number.isFinite(pid) && pid > 0) ids.add(pid);
        });
        ids.forEach((pid) => {
          resolveProductVariants(pid).catch(() => {});
          resolveProductIngredients(pid).catch(() => {});
        });
      };
      prefetchComboPickerBlockConfig(block.products);
      if (prewarmedBlockPromise && typeof prewarmedBlockPromise.then === "function") {
        prewarmedBlockPromise.catch(() => {});
      } else {
        warmBlockPickerPreviews(block).catch(() => {});
      }

      // Десктоп: кнопка «Назад» возвращает на шаг назад (в основное представление комбо), а не закрывает панель
      if (!openCartSheetCtx) {
        window._comboStepBackCallback = () => {
          renderMainView();
          window._comboStepBackCallback = null;
        };
      }

      const resolvedPreviewMapForBlock = getSharedComboBlockPreviewResolved(blockPreviewWarmKey);
      if (!(resolvedPreviewMapForBlock instanceof Map)) {
        const previewLoadKey = Number(blockIndex);
        const previewLoadTask =
          prewarmedBlockPromise && typeof prewarmedBlockPromise.then === "function"
            ? prewarmedBlockPromise
            : warmBlockPickerPreviews(block);
        if (!pickerBlockPreviewLoading.has(previewLoadKey)) {
          pickerBlockPreviewLoading.add(previewLoadKey);
          Promise.resolve(previewLoadTask)
            .catch(() => {})
            .finally(() => {
              pickerBlockPreviewLoading.delete(previewLoadKey);
              renderBlockPicker(blockIndex, scrollToRestore);
            });
        }

        container.innerHTML = "";
        const loadingViewWrap = document.createElement("div");
        loadingViewWrap.className = "shop-combo-view";
        const loadingWrap = document.createElement("div");
        loadingWrap.className = "shop-combo-detail shop-combo-detail--picker shop-combo-detail-scroll";
        const loadingState = document.createElement("div");
        loadingState.className = "shop-combo-picker-empty";
        loadingState.textContent = "Загрузка вариантов...";
        loadingWrap.appendChild(loadingState);
        loadingViewWrap.appendChild(loadingWrap);
        container.appendChild(loadingViewWrap);
        if (openCartSheetCtx) {
          const doStepBack = () => {
            renderMainView();
            setSheetHeaderMode("product", {
              onBack,
              discountBadge: discountBadgeText,
              favoriteBuildSnapshot: buildCurrentComboFavoriteSnapshot,
            });
            openCartSheetCtx.comboStepBack = null;
            sheetNavigationState.screen = "combo";
          };
          openCartSheetCtx.comboStepBack = doStepBack;
          setSheetHeaderMode("product", {
            onBack: doStepBack,
            discountBadge: discountBadgeText,
            favoriteBuildSnapshot: buildCurrentComboFavoriteSnapshot,
          });
          sheetNavigationState.screen = "comboPicker";
        }
        return;
      }

      const pickerStateKey = buildComboPickerStateKey(blockIndex);

      container.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "shop-combo-detail shop-combo-detail--picker";

      const listWrap = document.createElement("div");
      listWrap.className = "shop-combo-picker-list";

      let currentSelected = Number(selectedIndexByBlock[blockIndex]);
      if (!Number.isFinite(currentSelected)) {
        const defaultIdx = (Array.isArray(block.products) ? block.products : []).findIndex((p) => Number(p?.is_default) === 1);
        currentSelected = defaultIdx >= 0 ? defaultIdx : 0;
      }
      currentSelected = Math.max(0, Math.min(currentSelected, block.products.length - 1));
      selectedIndexByBlock[blockIndex] = currentSelected;

      const animateOpenPickerCardCollapse = () => {
        const expandEl = container.querySelector(".shop-combo-picker-expand");
        if (!expandEl || expandEl.dataset.closing === "1") return false;
        const rowEl = expandEl.closest(".shop-combo-picker-row");
        const summaryWrap = rowEl ? rowEl.querySelector(".shop-combo-picker-mid .cart-sub-container") : null;
        if (summaryWrap) summaryWrap.style.display = "";
        expandEl.dataset.closing = "1";
        const currentHeight = Math.max(0, expandEl.scrollHeight || expandEl.offsetHeight || 0);
        expandEl.style.maxHeight = currentHeight + "px";
        expandEl.style.opacity = "1";
        expandEl.style.pointerEvents = "none";
        void expandEl.offsetHeight;
        requestAnimationFrame(() => {
          expandEl.style.maxHeight = "0px";
          expandEl.style.opacity = "0";
        });
        return true;
      };

      const prewarmedPreviewMap = getSharedComboBlockPreviewResolved(blockPreviewWarmKey);
      (block.products || []).forEach((prod, idx) => {
        const isSelected = idx === currentSelected;
        const pickerProductId = Number(prod.product_id || 0);
        const hasPickerProductId = Number.isFinite(pickerProductId) && pickerProductId > 0;
        const isPickerUnavailableNow = () => {
          if (!hasPickerProductId) return false;
          if (idx === selectedIndexByBlock[blockIndex]) return false;
          return !canUseComboBlockSelectionAtIndex(blockIndex, idx);
        };
        const pickerUnavailable = !isSelected && isPickerUnavailableNow();
        if (pickerUnavailable) return;
        const state = isSelected ? (selectionStateByBlock[blockIndex] || {}) : {};
        const initialVariantLabel = str(state.variant_label || "").trim();
        const initialIngredientsDisplay = Array.isArray(state.ingredients_display) ? state.ingredients_display : [];
        const displayPrice = isSelected && state.unit_price_override != null && Number.isFinite(state.unit_price_override)
          ? Number(state.unit_price_override)
          : comboDiscountedPrice(prod.price, discountPercent);
        const oldPrice = isSelected && state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
          ? Number(state.unit_price_before_discount)
          : Number(prod.price) || 0;

        const card = document.createElement("div");
        card.className = "cart-row shop-combo-picker-row";
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        if (isSelected) card.classList.add("is-selected");

        const img = createOptimizedImage(prod.product_photo || "/static/img/placeholder.png", {
          type: "cart-thumb",
          className: "cart-thumb",
          alt: "",
          usePicture: true,
        });
        card.appendChild(img);

        const mid = document.createElement("div");
        mid.className = "cart-mid shop-combo-picker-mid";

        const t = document.createElement("div");
        t.className = "cart-title";
        t.textContent = str(prod.product_name || "");
        mid.appendChild(t);

        const subText = (prod.product_description_short || "").trim();
        if (subText) {
          const sub = document.createElement("div");
          sub.className = "cart-sub";
          sub.textContent = subText;
          mid.appendChild(sub);
        }

        const detailsWrap = document.createElement("div");
        detailsWrap.className = "cart-sub-container";

        if (initialVariantLabel || initialIngredientsDisplay.length) {
          renderComboDetailsLines(detailsWrap, initialVariantLabel, initialIngredientsDisplay, {
            variantGroupTitle: state.variant_group_title || "",
            variantUnit: state.variant_unit || "",
          });
        } else {
          renderComboFallbackDetailLines(detailsWrap, prod.product_description_short || "");
        }
        if (idx === expandedPickerProductIndex) detailsWrap.style.display = "none";
        mid.appendChild(detailsWrap);

        const bottomRow = document.createElement("div");
        bottomRow.className = "shop-combo-picker-bottom";

        const priceWrap = document.createElement("div");
        priceWrap.className = "shop-combo-picker-price";
        if (oldPrice > displayPrice) {
          const oldSpan = document.createElement("span");
          oldSpan.className = "shop-combo-old";
          oldSpan.textContent = moneyNoSign(oldPrice) + " ₽";
          priceWrap.appendChild(oldSpan);
        }
        const newSpan = document.createElement("span");
        newSpan.className = "shop-combo-price";
        newSpan.textContent = moneyNoSign(displayPrice) + " ₽";
        priceWrap.appendChild(newSpan);
        bottomRow.appendChild(priceWrap);

        const actionsWrap = document.createElement("div");
        actionsWrap.className = "shop-combo-picker-actions";

        const gearBtn = document.createElement("button");
        gearBtn.type = "button";
        gearBtn.className = "shop-combo-picker-gear" + (expandedPickerProductIndex === idx ? " is-open" : "");
        gearBtn.title = "Настройка состава и вариантов";
        gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
        gearBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (idx !== currentSelected && isPickerUnavailableNow()) {
            showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
            return;
          }
          const detailScroll = container.querySelector(".shop-combo-detail-scroll");
          const listScroll = container.querySelector(".shop-combo-picker-list");
          let scrollParent = null;
          let parentScrollTop = 0;
          let p = container.parentElement;
          while (p) {
            const style = window.getComputedStyle(p);
            const oy = style.overflowY || style.overflow;
            if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight) {
              scrollParent = p;
              parentScrollTop = p.scrollTop;
              break;
            }
            p = p.parentElement;
          }
          const savedScroll = {
            detail: detailScroll ? detailScroll.scrollTop : 0,
            list: listScroll ? listScroll.scrollTop : 0,
            parentEl: scrollParent,
            parentTop: parentScrollTop,
          };
          if (idx !== currentSelected) {
            const applied = await guardComboDraftMutation(async () => {
              selectedIndexByBlock[blockIndex] = idx;
              await hydrateBlockSelection(blockIndex, {
                useRandomizer: false,
                preferSavedState: true,
              });
            }, {
              showToastOnOut: true,
              onReject: () => {
                renderBlockPicker(blockIndex, savedScroll);
              },
            });
            if (!applied) return;
          }
          animateOpenPickerCardCollapse();
          expandedPickerProductIndex = expandedPickerProductIndex === idx ? null : idx;
          gearBtn.classList.toggle("is-open", expandedPickerProductIndex === idx);
          if (comboPickerRenderTimer) {
            clearTimeout(comboPickerRenderTimer);
            comboPickerRenderTimer = null;
          }
          comboPickerRenderTimer = setTimeout(() => {
            comboPickerRenderTimer = null;
            renderBlockPicker(blockIndex, savedScroll);
          }, COMBO_PICKER_GEAR_ROTATE_MS);
        });
        actionsWrap.appendChild(gearBtn);

        const radio = document.createElement("span");
        radio.className = "shop-combo-radio";
        radio.setAttribute("aria-hidden", "true");
        radio.title = expandedPickerProductIndex === idx ? "Сохранить и применить" : "";
        if (idx === currentSelected) radio.classList.add("is-selected");
        radio.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (idx !== currentSelected && isPickerUnavailableNow()) {
            showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
            return;
          }
          if (expandedPickerProductIndex === idx) {
            expandedPickerProductIndex = null;
            renderMainView();
          } else {
            if (idx !== currentSelected) {
              const applied = await guardComboDraftMutation(async () => {
                selectedIndexByBlock[blockIndex] = idx;
                await hydrateBlockSelection(blockIndex, {
                  useRandomizer: false,
                  preferSavedState: true,
                });
              }, {
                showToastOnOut: true,
                onReject: () => {
                  renderBlockPicker(blockIndex);
                },
              });
              if (!applied) return;
            } else {
              try {
                await hydrateBlockSelection(blockIndex, {
                  useRandomizer: false,
                  preferSavedState: true,
                });
              } catch {}
            }
            renderMainView();
          }
        });
        actionsWrap.appendChild(radio);
        bottomRow.appendChild(actionsWrap);

        card.appendChild(mid);
        card.appendChild(bottomRow);

        card.addEventListener("click", async (e) => {
          if (e.target.closest(".shop-combo-picker-gear") || e.target.closest(".shop-combo-radio")) return;
          if (idx !== currentSelected && isPickerUnavailableNow()) {
            showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
            return;
          }
          if (idx !== currentSelected) {
            const applied = await guardComboDraftMutation(async () => {
              selectedIndexByBlock[blockIndex] = idx;
              await hydrateBlockSelection(blockIndex, {
                useRandomizer: false,
                preferSavedState: true,
              });
            }, {
              showToastOnOut: true,
              onReject: () => {
                renderBlockPicker(blockIndex);
              },
            });
            if (!applied) return;
          } else {
            try {
              await hydrateBlockSelection(blockIndex, {
                useRandomizer: false,
                preferSavedState: true,
              });
            } catch {}
          }
          renderMainView();
        });

        const previewHasRenderableDetails = (preview) => {
          if (!preview || typeof preview !== "object") return false;
          const label = str(preview.variant_label || "").trim();
          if (label) return true;
          const ingList = Array.isArray(preview.ingredients_display) ? preview.ingredients_display : [];
          return ingList.some((ing) => {
            const name = str(ing?.name || ing?.ingredient_name || "").trim();
            const rawQty = ing?.qty ?? ing?.quantity;
            const numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
            if (Number.isFinite(numQty) && numQty === 0) return false;
            return Boolean(name || (rawQty != null && rawQty !== ""));
          });
        };

        const applyPreviewToCard = (preview) => {
          if (!preview) return;
          const previewVariantLabel = str(preview.variant_label || "").trim();
          const previewIngredientsDisplay = Array.isArray(preview.ingredients_display)
            ? preview.ingredients_display
            : [];
          if (!isSelected) {
            const candidateAllowed = canUseComboPickerCandidateWithPreview(blockIndex, idx, preview, {
              scope: "block",
            });
            if (!candidateAllowed) {
              card.remove();
              return;
            }
          } else if (!initialVariantLabel && !initialIngredientsDisplay.length) {
            const selectedState = selectionStateByBlock[blockIndex] || makeEmptyComboBlockState();
            selectedState.product_id = Number(prod.product_id || 0) || null;
            selectedState.variant_label = previewVariantLabel;
            selectedState.variant_group_id = preview.variant_group_id != null ? Number(preview.variant_group_id) : null;
            selectedState.variant_value_index = preview.variant_value_index != null ? Number(preview.variant_value_index) : null;
            selectedState.variant_group_title = str(preview.variant_group_title || "");
            selectedState.variant_unit = str(preview.variant_unit || "");
            selectedState.unit_id = preview.unit_id != null ? Number(preview.unit_id) : null;
            selectedState.ingredients_display = previewIngredientsDisplay.map((ing) => cloneComboDraftValue(ing));
            if (preview.unit_price_override != null && Number.isFinite(preview.unit_price_override)) {
              selectedState.unit_price_override = Number(preview.unit_price_override);
            }
            if (preview.unit_price_before_discount != null && Number.isFinite(preview.unit_price_before_discount)) {
              selectedState.unit_price_before_discount = Number(preview.unit_price_before_discount);
            }
            selectionStateByBlock[blockIndex] = selectedState;
          }

          if (!initialVariantLabel && !initialIngredientsDisplay.length) {
            renderComboDetailsLines(detailsWrap, previewVariantLabel, previewIngredientsDisplay, {
              variantGroupTitle: preview.variant_group_title || "",
              variantUnit: preview.variant_unit || "",
            });
            if (preview.unit_price_override != null && Number.isFinite(preview.unit_price_override)) {
              const newSpan = priceWrap.querySelector(".shop-combo-price");
              if (newSpan) newSpan.textContent = moneyNoSign(preview.unit_price_override) + " ₽";
              const oldVal = preview.unit_price_before_discount != null && Number.isFinite(preview.unit_price_before_discount) ? preview.unit_price_before_discount : 0;
              if (oldVal > preview.unit_price_override) {
                let oldSpan = priceWrap.querySelector(".shop-combo-old");
                if (!oldSpan) {
                  oldSpan = document.createElement("span");
                  oldSpan.className = "shop-combo-old";
                  priceWrap.insertBefore(oldSpan, newSpan);
                }
                oldSpan.textContent = moneyNoSign(oldVal) + " ₽";
              } else {
                const oldSpan = priceWrap.querySelector(".shop-combo-old");
                if (oldSpan) oldSpan.remove();
              }
            }
          }

          if (!preview.hasConfigurable) {
            if (gearBtn && gearBtn.isConnected) {
              gearBtn.style.display = "none";
            }
          }
        };

        const prewarmedPreview = prewarmedPreviewMap instanceof Map
          ? prewarmedPreviewMap.get(Number(prod.product_id || 0))
          : null;
        if (prewarmedPreview) {
          applyPreviewToCard(prewarmedPreview);
          const needsFreshPreview =
            !initialVariantLabel &&
            !initialIngredientsDisplay.length &&
            !previewHasRenderableDetails(prewarmedPreview);
          if (needsFreshPreview) {
            getComboProductPreview(prod.product_id)
              .then((preview) => {
                applyPreviewToCard(preview);
              })
              .catch(() => {});
          }
        } else {
          // Универсальная подгрузка превью: и для состава (у невыбранных, если нет state),
          // и для решения, показывать ли шестерёнку.
          getComboProductPreview(prod.product_id)
            .then((preview) => {
              applyPreviewToCard(preview);
            })
            .catch(() => {});
        }

        listWrap.appendChild(card);

        if (expandedPickerProductIndex === idx) {
          const expandWrap = document.createElement("div");
          expandWrap.className = "shop-combo-picker-expand";
          expandWrap.innerHTML = "<div class=\"shop-combo-picker-expand-loading\">Загрузка…</div>";
          card.appendChild(expandWrap);
          expandWrap.style.overflow = "hidden";
          expandWrap.style.maxHeight = "0px";
          expandWrap.style.opacity = "0";
          expandWrap.style.transition = "max-height 260ms ease, opacity 220ms ease";

          (async () => {
            const selectedProd = getSelectedProduct(blockIndex);
            if (!selectedProd) return;
            const productId = Number(selectedProd.product_id);
            const [product, variants, ingredients] = await Promise.all([
              ensureProduct(productId),
              resolveProductVariants(productId),
              resolveProductIngredients(productId),
            ]);
            if (!product) return;

            const state = selectionStateByBlock[blockIndex] || {};
            const variantIdx = state.variant_value_index != null ? Number(state.variant_value_index) : (variants[0]?.default_value_index ?? 0);
            const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
            const safeVariantIdx = values.length ? Math.max(0, Math.min(variantIdx, values.length - 1)) : 0;
            const variantLabel = values[safeVariantIdx] != null ? String(values[safeVariantIdx]) : "";

            const variantState = { selectedIndex: safeVariantIdx, value: values[safeVariantIdx], label: variantLabel };
            let baseUnitPrice = Array.isArray(variants) && variants.length ? getVariantUnitPrice(product, variants, variantState) : Number(product.price || 0);
            const ingredientQty = new Map((state.ingredients_display || []).map((ing) => [Number(ing.ingredient_id), Number(ing.quantity ?? ing.qty ?? 0)]));
            ingredients.forEach((ing) => {
              if (!ingredientQty.has(Number(ing.ingredient_id))) ingredientQty.set(Number(ing.ingredient_id), Number(ing.quantity ?? 0));
            });

            const updatePrice = () => {
              const vs = selectionStateByBlock[blockIndex] || {};
              const vIdx = vs.variant_value_index != null ? Number(vs.variant_value_index) : safeVariantIdx;
              const vState = { selectedIndex: vIdx, value: values[vIdx], label: String(values[vIdx] || "") };
              const baseUnit = Array.isArray(variants) && variants.length ? getVariantUnitPrice(product, variants, vState) : Number(product.price || 0);
              let unit = baseUnit;
              ingredients.forEach((ing) => {
                const q = Number(ingredientQty.get(Number(ing.ingredient_id)) ?? 0);
                const baseQty = Number(ing.quantity ?? 1);
                const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
                const ingredientPrice = Number(ing.ingredient_price || 0);
                const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
                const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
                const currentQtyInBase = getQtyInBase(ing, q);
                const baseQtyInBase = getQtyInBase(ing, baseQty);
                const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
                  ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
                  : (Number.isFinite(pricePerUnit) ? (q - baseQty) * pricePerUnit : 0);
                unit += diff;
              });
              // Разрешаем цене опускаться ниже базовой при уменьшении состава, но не ниже нуля.
              unit = Math.max(0, unit);
              state.unit_price_before_discount = roundPrice(unit);
              const discounted = comboDiscountedPrice(unit, discountPercent);
              state.unit_price_override = roundPrice(discounted);
              state.product_id = productId;
              state.variant_label = vState.label;
              state.variant_group_id = (vGroup && (vGroup.id || vGroup.variant_group_id)) ? Number(vGroup.id || vGroup.variant_group_id) : null;
              state.variant_group_title = (vGroup && (vGroup.title || vGroup.title_label)) ? String(vGroup.title || vGroup.title_label) : "";
              state.variant_unit = (vGroup && (vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code)) ? String(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) : "";
              state.unit_id = vGroup && vGroup.unit_id != null ? Number(vGroup.unit_id) : null;
              state.variant_value_index = vIdx;
              state.ingredients_display = ingredients.map((ing) => ({
                ingredient_id: ing.ingredient_id,
                name: ing.ingredient_name || ing.name || "",
                quantity: ingredientQty.get(Number(ing.ingredient_id)) ?? 0,
                qty: ingredientQty.get(Number(ing.ingredient_id)) ?? 0,
                unit_id: ing.unit_id != null ? Number(ing.unit_id) : null,
                unit: ing.unit_short_title || ing.unit_title || ing.unit_code || "г",
              }));
              updatePriceDisplay();
            };

            const updatePriceDisplay = () => {
              const st = selectionStateByBlock[blockIndex] || {};
              const price = st.unit_price_override != null && Number.isFinite(st.unit_price_override) ? st.unit_price_override : comboDiscountedPrice(prod.price, discountPercent);
              const oldPriceVal = st.unit_price_before_discount != null && Number.isFinite(st.unit_price_before_discount) ? st.unit_price_before_discount : Number(prod.price) || 0;
              const priceEl = card.querySelector(".shop-combo-price");
              if (priceEl) priceEl.textContent = moneyNoSign(price) + " ₽";
              let oldEl = card.querySelector(".shop-combo-old");
              if (oldPriceVal > price) {
                if (!oldEl) {
                  oldEl = document.createElement("span");
                  oldEl.className = "shop-combo-old";
                  priceWrap.insertBefore(oldEl, priceWrap.querySelector(".shop-combo-price"));
                }
                oldEl.textContent = moneyNoSign(oldPriceVal) + " ₽";
              } else if (oldEl) {
                oldEl.remove();
              }
              if (typeof pickerFooterUpdate === "function") pickerFooterUpdate();
            };

            expandWrap.innerHTML = "";

            const expandInner = document.createElement("div");
            expandInner.className = "shop-combo-picker-expand-inner";

            const vGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
            if (vGroup && values.length) {
              const vBlock = document.createElement("div");
              vBlock.className = "shop-combo-picker-variants";
              const vTitle = document.createElement("div");
              vTitle.className = "shop-combo-picker-expand-title";
              vTitle.textContent = vGroup.title || "Вариант";
              vBlock.appendChild(vTitle);
              const unitShort = str(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code || "").trim();
              const vValuesRow = document.createElement("div");
              vValuesRow.className = "shop-combo-picker-variants-row";
              const canUseComboVariantIndex = (candidateIdx) => {
                const idxNum = Number(candidateIdx);
                if (!Number.isFinite(idxNum) || idxNum < 0 || idxNum >= values.length) return false;
                const snapshot = snapshotComboDraftState();
                state.variant_value_index = idxNum;
                state.variant_label = String(values[idxNum] || "");
                updatePrice();
                const allowed = canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) || 1));
                restoreComboDraftState(snapshot);
                updatePrice();
                return allowed;
              };
              const refreshComboVariantButtons = () => {
                vValuesRow.querySelectorAll(".shop-combo-picker-variant-btn").forEach((buttonEl, buttonIndex) => {
                  const isSelectedVariant = Number(state.variant_value_index) === Number(buttonIndex);
                  const allowed = canUseComboVariantIndex(buttonIndex);
                  const unavailable = !allowed && !isSelectedVariant;
                  buttonEl.disabled = unavailable;
                  buttonEl.classList.toggle("is-unavailable", unavailable);
                  buttonEl.classList.toggle("is-active", isSelectedVariant);
                });
              };
              values.forEach((val, vIdx) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "shop-combo-picker-variant-btn" + (vIdx === safeVariantIdx ? " is-active" : "");
                const valStr = String(val);
                btn.textContent = unitShort ? valStr + " " + unitShort : valStr;
                const unavailable = !canUseComboVariantIndex(vIdx) && vIdx !== Number(state.variant_value_index);
                btn.disabled = unavailable;
                btn.classList.toggle("is-unavailable", unavailable);
                btn.addEventListener("click", async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (btn.disabled) return;
                  const applied = await guardComboDraftMutation(() => {
                    state.variant_value_index = vIdx;
                    state.variant_label = String(val);
                    updatePrice();
                  }, {
                    showToastOnOut: true,
                    onReject: () => {
                      renderBlockPicker(blockIndex);
                    },
                  });
                  if (!applied) return;
                  refreshComboVariantButtons();
                });
                vValuesRow.appendChild(btn);
              });
              refreshComboVariantButtons();
              vBlock.appendChild(vValuesRow);
              expandInner.appendChild(vBlock);
            }

            if (ingredients.length) {
              const ingBlock = document.createElement("div");
              ingBlock.className = "shop-combo-picker-ingredients";
              const ingTitle = document.createElement("div");
              ingTitle.className = "shop-combo-picker-expand-title";
              ingTitle.textContent = "Состав (можно настроить):";
              ingBlock.appendChild(ingTitle);
              ingredients.forEach((ing) => {
                const ingId = Number(ing.ingredient_id);
                const hasIngredientProductId = Number.isFinite(ingId) && ingId > 0;
                const row = document.createElement("div");
                row.className = "shop-combo-picker-ingredient-row";
                const ingPhoto = Array.isArray(ing.ingredient_photos) && ing.ingredient_photos[0]
                  ? ing.ingredient_photos[0]
                  : "";
                const imgWrap = document.createElement("div");
                imgWrap.className = "shop-combo-picker-ingredient-img";
                if (ingPhoto) {
                  const img = createOptimizedImage(ingPhoto, { type: "cart-thumb", className: "", alt: "" });
                  imgWrap.appendChild(img);
                }
                row.appendChild(imgWrap);
                const name = document.createElement("span");
                name.className = "shop-combo-picker-ingredient-name";
                name.textContent = ing.ingredient_name || ing.name || "";
                row.appendChild(name);

                const unitShort = ing.unit_short_title || ing.unit_title || "";
                const step = Number(ing.quantity_step ?? 1) || 1;
                const minQty = Number(ing.quantity_min ?? 0);
                const maxQtyRaw = Number(ing.quantity_max);
                const hasMax = Number.isFinite(maxQtyRaw) && maxQtyRaw > 0;
                const maxQty = hasMax ? maxQtyRaw : Infinity;

                const qtyWrap = document.createElement("div");
                qtyWrap.className = "shop-combo-picker-ingredient-qty";

                const btnMinus = document.createElement("button");
                btnMinus.type = "button";
                btnMinus.className = "shop-combo-picker-ingredient-btn";
                btnMinus.textContent = "−";

                const qtyVal = document.createElement("span");
                qtyVal.className = "shop-combo-picker-ingredient-qty-val";
                let currentQty = ingredientQty.get(ingId);
                if (currentQty == null) {
                  currentQty = Number(ing.quantity ?? 0);
                  if (!Number.isFinite(currentQty)) currentQty = 0;
                }
                currentQty = Math.min(Math.max(currentQty, minQty), maxQty);
                ingredientQty.set(ingId, currentQty);
                qtyVal.textContent = currentQty + " " + unitShort;
                const isIngUnavailableForPlus = () => {
                  if (!hasIngredientProductId) return false;
                  const prev = Number(ingredientQty.get(ingId) ?? 0);
                  let next = prev + step;
                  if (next > maxQty) next = maxQty;
                  if (!Number.isFinite(next) || next <= prev) return false;
                  const snapshot = snapshotComboDraftState();
                  ingredientQty.set(ingId, next);
                  updatePrice();
                  const allowed = canUseComboDraftQtyLocal(Math.max(1, Number(comboQty) || 1));
                  restoreComboDraftState(snapshot);
                  ingredientQty.set(ingId, prev);
                  updatePrice();
                  return !allowed;
                };

                const btnPlus = document.createElement("button");
                btnPlus.type = "button";
                btnPlus.className = "shop-combo-picker-ingredient-btn";
                btnPlus.textContent = "+";

                const bindPressFx = (btn) => {
                  if (!btn) return;
                  const pressOn = () => {
                    if (btn.disabled) return;
                    btn.classList.add("is-pressed");
                  };
                  const pressOff = () => btn.classList.remove("is-pressed");
                  btn.addEventListener("pointerdown", pressOn);
                  btn.addEventListener("pointerup", pressOff);
                  btn.addEventListener("pointercancel", pressOff);
                  btn.addEventListener("pointerleave", pressOff);
                  btn.addEventListener("blur", pressOff);
                };
                bindPressFx(btnMinus);
                bindPressFx(btnPlus);

                btnMinus.disabled = currentQty <= minQty;
                btnPlus.disabled = currentQty >= maxQty || isIngUnavailableForPlus();

                btnMinus.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const prev = Number(ingredientQty.get(ingId) ?? 0);
                  let next = prev - step;
                  if (next < minQty) next = minQty;
                  if (!Number.isFinite(next)) next = minQty;
                  ingredientQty.set(ingId, next);
                  updatePrice();
                  qtyVal.textContent = next + " " + unitShort;
                  btnMinus.disabled = next <= minQty;
                  btnPlus.disabled = next >= maxQty || isIngUnavailableForPlus();
                });

                btnPlus.addEventListener("click", async (e) => {
                  e.stopPropagation();
                  if (isIngUnavailableForPlus()) {
                    btnPlus.disabled = true;
                    showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
                    return;
                  }
                  const prev = Number(ingredientQty.get(ingId) ?? 0);
                  let next = prev + step;
                  if (next > maxQty) next = maxQty;
                  if (!Number.isFinite(next)) next = maxQty;
                  const applied = await guardComboDraftMutation(() => {
                    ingredientQty.set(ingId, next);
                    updatePrice();
                  }, {
                    showToastOnOut: true,
                    onReject: () => {
                      renderBlockPicker(blockIndex);
                    },
                  });
                  if (!applied) return;
                  qtyVal.textContent = next + " " + unitShort;
                  btnMinus.disabled = next <= minQty;
                  btnPlus.disabled = next >= maxQty || isIngUnavailableForPlus();
                });

                qtyWrap.appendChild(btnMinus);
                qtyWrap.appendChild(qtyVal);
                qtyWrap.appendChild(btnPlus);
                row.appendChild(qtyWrap);
                ingBlock.appendChild(row);
              });
              expandInner.appendChild(ingBlock);
            }

            expandWrap.appendChild(expandInner);
            expandWrap.addEventListener("click", (e) => {
              e.stopPropagation();
            });
            updatePrice();
            requestAnimationFrame(() => {
              const targetHeight = Math.max(0, expandWrap.scrollHeight || expandInner.scrollHeight || 0);
              expandWrap.style.maxHeight = targetHeight + "px";
              expandWrap.style.opacity = "1";
              let scrollContainer = expandWrap.parentElement;
              while (scrollContainer) {
                const style = window.getComputedStyle(scrollContainer);
                const oy = style.overflowY || style.overflow;
                if ((oy === "auto" || oy === "scroll" || oy === "overlay") && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
                  break;
                }
                scrollContainer = scrollContainer.parentElement;
              }
              if (!scrollContainer) return;
              const parentRow = expandWrap.closest(".shop-combo-picker-row");
              const target = parentRow || expandWrap;
              const targetRect = target.getBoundingClientRect();
              const containerRect = scrollContainer.getBoundingClientRect();
              const targetTopInContent = scrollContainer.scrollTop + (targetRect.top - containerRect.top);
              if (typeof scrollContainer.scrollTo === "function") {
                scrollContainer.scrollTo({ top: targetTopInContent, behavior: "smooth" });
              } else {
                scrollContainer.scrollTop = targetTopInContent;
              }
            });
          })();
        }
      });

      if (!listWrap.childElementCount) {
        const emptyState = document.createElement("div");
        emptyState.className = "shop-combo-picker-empty";
        emptyState.textContent = "Нет доступных вариантов для замены";
        listWrap.appendChild(emptyState);
      }

      wrap.appendChild(listWrap);

      const { footer, updateFooterAction } = renderFooter({
        onQtyChanged: () => {
          const detailEl = container.querySelector(".shop-combo-detail-scroll");
          const listEl = container.querySelector(".shop-combo-picker-list");
          let scrollParent = null;
          let parentScrollTop = 0;
          let p = container.parentElement;
          while (p) {
            const style = window.getComputedStyle(p);
            const oy = style.overflowY || style.overflow;
            if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight) {
              scrollParent = p;
              parentScrollTop = p.scrollTop;
              break;
            }
            p = p.parentElement;
          }
          renderBlockPicker(blockIndex, {
            detail: detailEl ? detailEl.scrollTop : 0,
            list: listEl ? listEl.scrollTop : 0,
            parentEl: scrollParent,
            parentTop: parentScrollTop,
          });
        },
        onAdd: async ({ qty }) => {
          const previousCartSnapshot = cloneCartState(state.cart);
          const selections = buildComboSelections();
          if (!selections.length) return;
          const comboId = combo.id;
          const desiredQty = Math.max(1, Number(qty) || 1);
          const key = "combo-" + comboId + "-" + Date.now();
          const sumOld = calculateComboOldSum();
          const draftCart = cloneCartState(state.cart);
          draftCart.push({
            key: `combo-draft-${comboId}`,
            type: "combo",
            combo_id: comboId,
            combo_title: combo.title || "Комбо",
            qty: desiredQty,
            selections,
            unit_price_before_discount: roundPrice(sumOld),
          });
          try {
            const payload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved(draftCart));
            const draftCheck = await checkStockForItemsPayload(payload, {
              showToastOnOut: true,
              toastMessage: "\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut: false,
            });
            if (!draftCheck.available) return;
          } catch (e) {
            console.warn("Stock check before combo add failed:", e);
            return;
          }
          state.cart.push({
            key,
            type: "combo",
            combo_id: comboId,
            combo_title: combo.title || "Комбо",
            qty: desiredQty,
            selections,
            unit_price_before_discount: roundPrice(sumOld),
          });
          applyAutoAddRules();
          saveCart();
          if (typeof scheduleSyncAllProductCardsFromCart === "function") scheduleSyncAllProductCardsFromCart();
          renderCart();
          updateCartBadge();
          queueCartStockRecheck(previousCartSnapshot, {
            toastMessage: "Больше нет в наличии",
          });
          if (typeof onBack === "function") onBack();
        },
      });
      pickerFooterUpdate = updateFooterAction;
      updateFooterAction();

      const viewWrap = document.createElement("div");
      viewWrap.className = "shop-combo-view";
      wrap.classList.add("shop-combo-detail-scroll");
      viewWrap.appendChild(wrap);
      viewWrap.appendChild(footer);
      container.appendChild(viewWrap);
      cachedPickerView = viewWrap;
      cachedPickerStateKey = pickerStateKey;

      if (scrollToRestore) {
        const detailEl = container.querySelector(".shop-combo-detail-scroll");
        const listEl = container.querySelector(".shop-combo-picker-list");
        if (detailEl && scrollToRestore.detail >= 0) detailEl.scrollTop = scrollToRestore.detail;
        if (listEl && scrollToRestore.list >= 0) listEl.scrollTop = scrollToRestore.list;
        if (scrollToRestore.parentEl && scrollToRestore.parentEl.isConnected && scrollToRestore.parentTop >= 0) {
          scrollToRestore.parentEl.scrollTop = scrollToRestore.parentTop;
        }
      }

      // Шаг назад: стрелка в шапке и кнопка "Назад" на Android
      if (openCartSheetCtx) {
        const doStepBack = () => {
          renderMainView();
          setSheetHeaderMode("product", {
            onBack,
            discountBadge: discountBadgeText,
            favoriteBuildSnapshot: buildCurrentComboFavoriteSnapshot,
          });
          openCartSheetCtx.comboStepBack = null;
          sheetNavigationState.screen = "combo";
        };
        openCartSheetCtx.comboStepBack = doStepBack;
        setSheetHeaderMode("product", {
          onBack: doStepBack,
          discountBadge: discountBadgeText,
          favoriteBuildSnapshot: buildCurrentComboFavoriteSnapshot,
        });
        sheetNavigationState.screen = "comboPicker";
      }
    }

    (async () => {
      await hydrateComboSelectionsFromDefaults();
      renderMainView();
      blocks.forEach((block) => {
        warmBlockPickerPreviews(block).catch(() => {});
      });
    })();
  }

  async function openComboDetails(comboId, { cartKey, prefillItem, onBack } = {}) {
    const safeComboId = Number(comboId || 0);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const hasCustomOnBack = typeof onBack === "function";
    let data = null;
    try {
      data = await resolveComboDetails(safeComboId);
    } catch (e) {
      console.warn("openComboDetails: failed to load combo", comboId, e);
      if (String(e?.message || "") === "OUT_OF_STOCK") {
        showToast("Комбо больше недоступно");
        if (Number.isFinite(Number(state.activeCategoryId))) {
          try {
            await loadProductsForCategory(state.activeCategoryId, { lite: false });
            renderProducts();
          } catch {}
        }
      }
      return;
    }
    if (!data) return;

    if (isMobile) {
      if (!hasLiveCartSheetContext()) {
        openCartSheet();
      }
      if (openCartSheetCtx?.showSheetCombo) {
        const sheetArgs = { cartKey, prefillItem };
        if (hasCustomOnBack) {
          sheetArgs.onBack = onBack;
        }
        openCartSheetCtx.showSheetCombo(data, sheetArgs);
      }
      return;
    }

    const resolvedOnBack = hasCustomOnBack ? onBack : showCartView;
    showProductView(data.title || "Комбо");
    openProductCtx = {
      comboId: Number(data.id || comboId || 0),
      type: "combo",
      onBack: resolvedOnBack,
    };
    renderComboDetailsInto(elProductContent, data, { onBack: resolvedOnBack, cartKey, prefillItem });
  }

  // -----------------------------
  // Shop sheets
  // -----------------------------
  function resetShopModalHeaderUi() {
    const header = document.querySelector(".app-modal-header");
    if (!header) return;

    header.querySelectorAll(".shop-delivery-toggle-wrap").forEach((el) => el.remove());
    const orderBackBtn = header.querySelector(".app-modal-back-btn");
    if (orderBackBtn) orderBackBtn.remove();
    const discountBadge = header.querySelector(".shop-sheet-discount-badge");
    if (discountBadge) discountBadge.remove();

    const titleEl =
      header.querySelector(".app-modal-title") ||
      header.querySelector(".modal-title") ||
      header.querySelector("[data-modal-title]");
    if (titleEl) {
      titleEl.classList.remove("hidden", "is-cart-address-title", "is-empty-address");
      titleEl.style.cursor = "";
      titleEl.onclick = null;
      titleEl.style.textAlign = "";
      titleEl.style.flex = "";
    }

    const closeBtn =
      header.querySelector(".app-modal-close") ||
      header.querySelector("[data-modal-close]") ||
      header.querySelector("button[aria-label='Закрыть']") ||
      header.querySelector("button[aria-label='Close']") ||
      header.querySelector(".modal-close") ||
      header.querySelector(".btn-close");
    if (closeBtn) closeBtn.classList.remove("hidden");

    const sheetBackBtn = header.querySelector("#shopSheetBackBtn");
    if (sheetBackBtn) sheetBackBtn.classList.add("hidden");
    const sheetFavBtn = header.querySelector("#shopSheetFavBtn");
    if (sheetFavBtn) sheetFavBtn.classList.add("hidden");
  }

  function closeShopSheetIfOpen() {
    if (!window.AppModal) return;
    resetShopModalHeaderUi();
    if (window.AppModal.isOpen()) {
      // Сбрасываем состояние просмотра деталей заказа, чтобы при переходе на другую вкладку
      // (домик → каталог) стрелка «назад» не вела в список активных заказов
      sheetNavigationState.type = null;
      sheetNavigationState.screen = null;
      sheetNavigationState.data = null;
      window._isViewingOrderDetails = false;
      window._showOrdersListCallback = null;

      window.AppModal.close("sheet");
      openProductCtx = null;
      resetShopModalHeaderUi();

      // На мобильных: скрываем мобильные кнопки при закрытии sheet
      // Обновляем ботомщит активного заказа
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
      setSheetHeaderMode("");
    }
  }

  function returnToProfileFromSheet() {
    closeShopSheetIfOpen();
    setTimeout(() => {
      openProfileSheet({ initialTab: "addresses" });
    }, 0);
  }

  function clearProfileModalMenu() {
    const header = document.querySelector(".app-modal-header");
    if (!header) return;
    header.querySelectorAll(".shop-profile-modal-settings, .shop-profile-menu").forEach((el) => el.remove());
  }

  let categoriesSheetCache = null;

  function buildCategoriesSheetSignature(categories) {
    const safe = Array.isArray(categories) ? categories : [];
    return safe
      .map((c) => `${Number(c?.id || 0)}:${str(c?.title || "")}:${str(c?.icon || "")}`)
      .join("|");
  }

  function ensureCategoriesSheetDom(categories) {
    const safe = Array.isArray(categories) ? categories : [];
    const signature = buildCategoriesSheetSignature(safe);
    if (
      categoriesSheetCache &&
      categoriesSheetCache.wrap &&
      categoriesSheetCache.list &&
      categoriesSheetCache.signature === signature
    ) {
      return categoriesSheetCache;
    }

    const wrap = document.createElement("div");
    wrap.className = "shop-sheet-content";

    const list = document.createElement("div");
    list.className = "shop-sheet-list";

    safe.forEach((c) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "shop-sheet-row";
      row.setAttribute("data-cat-id", String(Number(c.id || 0)));
      row.appendChild(createCatIcon(c.icon));

      const t = document.createElement("div");
      t.className = "shop-sheet-row-title";
      t.textContent = str(c.title);
      row.appendChild(t);

      row.addEventListener("click", () => {
        selectCategory(c.id, c.title);
        closeShopSheetIfOpen();
      });

      list.appendChild(row);
    });

    wrap.appendChild(list);
    categoriesSheetCache = { signature, wrap, list };
    return categoriesSheetCache;
  }

  function syncCategoriesSheetActiveRow(listEl) {
    if (!listEl) return;
    const activeId = Number(state.activeCategoryId || 0);
    listEl.querySelectorAll(".shop-sheet-row").forEach((row) => {
      const rowId = Number(row.getAttribute("data-cat-id") || 0);
      row.classList.toggle("is-active", Number.isFinite(activeId) && rowId === activeId);
    });
  }

function openCategoriesSheet() {
  if (!window.AppModal) return;
  clearProfileModalMenu();

  // на время открытого шита подсвечиваем "Категории"
  setActiveNav("categories");

  const visibleCategories = getVisibleCategories();
  const cache = ensureCategoriesSheetDom(visibleCategories);
  const wrap = cache.wrap;
  const list = cache.list;
  syncCategoriesSheetActiveRow(list);

  // Обновляем состояние навигации
  sheetNavigationState.type = 'categories';
  sheetNavigationState.screen = null;
  sheetNavigationState.data = null;

  setAppModalMode("shop");
  setSheetHeaderMode("");
  window.AppModal.open({
    title: "Категории",
    content: wrap, // <-- важно: передаём wrap, чтобы был padding/scroll
    onClose: () => {
      // после закрытия шита возвращаемся в "Главная" (каталог)
      setActiveNav("menu");
      // Сбрасываем состояние навигации
      sheetNavigationState.type = null;
      sheetNavigationState.screen = null;
      sheetNavigationState.data = null;
      // Обновляем бейдж после закрытия модального окна
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    },
  });
  
  // Обновляем бейдж сразу после открытия модального окна
  if (typeof window.updateActiveOrdersBadge === "function") {
    setTimeout(() => {
      window.updateActiveOrdersBadge();
    }, 100);
  }
}

function openFavoritesSheet({ force = true, forceOpen = false } = {}) {
  const isMobileSheet = window.matchMedia("(max-width: 1100px)").matches;
  if (isMobileSheet && !window.AppModal) return;
  const isAnySheetOpen =
    Boolean(window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen());
  const currentSheetType = str(sheetNavigationState?.type || "");

  const wrap = document.createElement("div");
  wrap.className = "shop-sheet-content shop-favorites-sheet";

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "shop-cat-chips-wrap shop-favorites-chips-wrap hidden";
  const chips = document.createElement("div");
  chips.className = "shop-cat-chips shop-favorites-chips";
  chipsWrap.appendChild(chips);
  wrap.appendChild(chipsWrap);

  const list = document.createElement("div");
  list.className = "shop-favorites-list";
  wrap.appendChild(list);

  let renderSeq = 0;
  let lastFavoritesRenderSignature = "";
  let currentSwipedContainer = null;
  const favoritesUseSwipe = window.matchMedia("(max-width: 1100px)").matches;

  function closeCurrentSwiped(animate = true, exceptContainer = null) {
    if (!currentSwipedContainer || currentSwipedContainer === exceptContainer) return;
    const closeFn = currentSwipedContainer.__favoriteSwipeClose;
    if (typeof closeFn === "function") {
      closeFn(animate);
      return;
    }
    currentSwipedContainer = null;
  }

  const handleOutsidePointerDown = (event) => {
    if (!currentSwipedContainer) return;
    if (currentSwipedContainer.contains(event.target)) return;
    closeCurrentSwiped(true);
  };
  if (favoritesUseSwipe) {
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
  }

  function hideCategoryChips() {
    chips.innerHTML = "";
    chipsWrap.classList.add("hidden");
  }

  function setActiveCategoryChip(categoryId) {
    const id = Number(categoryId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const all = chips.querySelectorAll(".shop-cat-chip");
    all.forEach((btn) => {
      const btnId = Number(btn.getAttribute("data-cat-id"));
      btn.classList.toggle("is-active", btnId === id);
    });
    const active = chips.querySelector(`.shop-cat-chip[data-cat-id="${id}"]`);
    if (!active) return;
    const target = Math.max(0, active.offsetLeft - 12);
    if (typeof chips.scrollTo === "function") {
      chips.scrollTo({ left: target, behavior: "smooth" });
    } else {
      chips.scrollLeft = target;
    }
  }

  function scrollToCategorySection(categoryId) {
    const id = Number(categoryId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const header = list.querySelector(`.shop-category-header[data-cat-id="${id}"]`);
    if (!header) return;
    const wrapRect = wrap.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const delta = headerRect.top - wrapRect.top;
    const offset = (chipsWrap.offsetHeight || 0) + 8;
    const nextTop = wrap.scrollTop + delta - offset;
    wrap.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }

  function renderFavoriteCategoryChips(sections) {
    chips.innerHTML = "";
    const safeSections = Array.isArray(sections) ? sections : [];
    const navSections = safeSections.filter((section) => Number.isFinite(Number(section?.id)));
    if (!navSections.length) {
      chipsWrap.classList.add("hidden");
      return;
    }

    navSections.forEach((section, idx) => {
      const sectionId = Number(section.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-cat-chip";
      btn.setAttribute("data-cat-id", String(sectionId));
      btn.textContent = str(section.title || "Категория");
      if (idx === 0) btn.classList.add("is-active");
      btn.addEventListener("click", () => {
        setActiveCategoryChip(sectionId);
        scrollToCategorySection(sectionId);
      });
      chips.appendChild(btn);
    });

    chipsWrap.classList.remove("hidden");
  }

  function renderMessage(text) {
    hideCategoryChips();
    list.innerHTML = "";
    const note = document.createElement("div");
    note.className = "muted shop-favorites-empty";
    note.textContent = text;
    list.appendChild(note);
  }

  function renderAuthRequired() {
    hideCategoryChips();
    list.innerHTML = "";
    const box = document.createElement("div");
    box.className = "shop-favorites-auth";

    const note = document.createElement("div");
    note.className = "muted shop-favorites-empty";
    note.textContent = "Войдите в профиль, чтобы пользоваться избранным.";
    box.appendChild(note);

    const authBtn = document.createElement("button");
    authBtn.type = "button";
    authBtn.className = "btn";
    authBtn.textContent = "Войти";
    authBtn.addEventListener("click", () => {
      closeShopSheetIfOpen();
      setTimeout(() => {
        openProfileSheet();
      }, 0);
    });
    box.appendChild(authBtn);
    list.appendChild(box);
  }

  function buildFallbackItemRow(item) {
    const row = document.createElement("div");
    row.className = "cart-row";

    const img = document.createElement("img");
    img.className = "cart-thumb";
    const photos = Array.isArray(item?.photos) ? item.photos.filter(Boolean) : [];
    img.src = photos[0] || "/static/img/placeholder.png";
    img.alt = "";
    row.appendChild(img);

    const mid = document.createElement("div");
    mid.className = "cart-mid";
    const title = document.createElement("div");
    title.className = "cart-title";
    title.textContent = str(item?.name || item?.combo_title || "Товар");
    mid.appendChild(title);
    row.appendChild(mid);

    const right = document.createElement("div");
    right.className = "cart-right";
    const price = document.createElement("div");
    price.className = "cart-price";
    const lineTotalRaw = Number(item?.line_total);
    const lineTotal = Number.isFinite(lineTotalRaw) ? lineTotalRaw : Number(item?.price || 0);
    price.textContent = money(lineTotal);
    right.appendChild(price);
    row.appendChild(right);
    return row;
  }

  function collectFavoriteSnapshotProductIds(snapshot) {
    const prefill = buildRepeatPrefillItem(snapshot);
    if (!prefill) return [];

    const ids = new Set();
    if (String(prefill.type || "") === "combo") {
      const selections = Array.isArray(prefill.selections) ? prefill.selections : [];
      selections.forEach((sel) => {
        const pid = Number(sel?.product_id || 0);
        if (Number.isFinite(pid) && pid > 0) ids.add(pid);
      });
      return [...ids];
    }

    const baseProductId = Number(prefill.product_id || 0);
    if (Number.isFinite(baseProductId) && baseProductId > 0) ids.add(baseProductId);

    const optionItems = Array.isArray(prefill.option_items) ? prefill.option_items : [];
    optionItems.forEach((opt) => {
      const pid = Number(opt?.target_product_id || opt?.product_id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });

    return [...ids];
  }

  function getFavoritesCatalogCategories() {
    let categories = [];
    if (typeof getVisibleCategories === "function") {
      try {
        categories = getVisibleCategories();
      } catch {
        categories = [];
      }
    }
    if (!Array.isArray(categories) || !categories.length) {
      categories = Array.isArray(state.categories) ? state.categories : [];
      categories = categories.filter((cat) => String(cat?.code || "").toLowerCase() !== "all");
    }
    return Array.isArray(categories) ? categories : [];
  }

  function buildFavoriteCategoryLookups(categories) {
    const safeCategories = Array.isArray(categories) ? categories : [];
    const productCategoryById = new Map();
    const comboCategoryById = new Map();

    safeCategories.forEach((cat) => {
      const cid = Number(cat?.id || 0);
      if (!Number.isFinite(cid) || cid <= 0) return;

      const products = state.productsByCategory instanceof Map ? (state.productsByCategory.get(cid) || []) : [];
      (Array.isArray(products) ? products : []).forEach((product) => {
        const pid = Number(product?.id || 0);
        if (!Number.isFinite(pid) || pid <= 0 || productCategoryById.has(pid)) return;
        productCategoryById.set(pid, cid);
      });

      const combos = state.combosByCategory instanceof Map ? (state.combosByCategory.get(cid) || []) : [];
      (Array.isArray(combos) ? combos : []).forEach((combo) => {
        const comboId = Number(combo?.id || 0);
        if (!Number.isFinite(comboId) || comboId <= 0 || comboCategoryById.has(comboId)) return;
        comboCategoryById.set(comboId, cid);
      });
    });

    return { productCategoryById, comboCategoryById };
  }

  function resolveFavoriteCategoryId(favoriteRow, snapshot, lookups, categoriesById, categoriesByCode) {
    const productCategoryById = lookups?.productCategoryById instanceof Map ? lookups.productCategoryById : new Map();
    const comboCategoryById = lookups?.comboCategoryById instanceof Map ? lookups.comboCategoryById : new Map();
    const byId = categoriesById instanceof Map ? categoriesById : new Map();
    const byCode = categoriesByCode instanceof Map ? categoriesByCode : new Map();

    const itemType = str(snapshot?.type || favoriteRow?.item_type || "").toLowerCase();
    const isCombo = itemType === "combo";

    const categoryIdRaw = Number(snapshot?.category_id || snapshot?.categoryId || 0);
    if (Number.isFinite(categoryIdRaw) && categoryIdRaw > 0 && byId.has(categoryIdRaw)) return categoryIdRaw;

    const categoryCode = str(snapshot?.category_code || snapshot?.categoryCode || "").toLowerCase();
    if (categoryCode && byCode.has(categoryCode)) return byCode.get(categoryCode);

    if (isCombo) {
      const comboId = Number(favoriteRow?.combo_id || snapshot?.combo_id || 0);
      if (Number.isFinite(comboId) && comboId > 0 && comboCategoryById.has(comboId)) {
        return comboCategoryById.get(comboId);
      }
      return null;
    }

    const productId = Number(favoriteRow?.product_id || snapshot?.product_id || 0);
    if (Number.isFinite(productId) && productId > 0) {
      if (productCategoryById.has(productId)) {
        return productCategoryById.get(productId);
      }
      const product = state.productCache.get(productId);
      const productCategoryId = Number(product?.category_id || product?.categoryId || 0);
      if (Number.isFinite(productCategoryId) && productCategoryId > 0 && byId.has(productCategoryId)) {
        return productCategoryId;
      }
    }

    return null;
  }

  async function buildFavoritesAvailabilityMap(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const productIdsByIndex = safeRows.map((row) => collectFavoriteSnapshotProductIds(row?.item || row));
    const allProductIds = [...new Set(productIdsByIndex.flat().filter((id) => Number.isFinite(Number(id)) && Number(id) > 0))];
    const unavailableProductIds = new Set();

    await Promise.all(
      allProductIds.map(async (rawId) => {
        const pid = Number(rawId);
        if (!Number.isFinite(pid) || pid <= 0) return;
        try {
          await ensureProduct(pid);
          const product = state.productCache.get(pid);
          if (!product || !isProductAvailable(product)) {
            unavailableProductIds.add(pid);
          }
        } catch (e) {
          console.warn("Failed to resolve favorite availability product:", pid, e);
          unavailableProductIds.add(pid);
        }
      })
    );

    const map = new Map();
    productIdsByIndex.forEach((ids, idx) => {
      const safeIds = Array.isArray(ids) ? ids : [];
      const available =
        safeIds.length === 0 ? true : safeIds.every((pid) => !unavailableProductIds.has(Number(pid)));
      map.set(idx, available);
    });
    return map;
  }

  function applyFavoriteUnavailableView(cardEl) {
    if (!cardEl) return;
    cardEl.classList.add("is-unavailable");
    const row = cardEl.querySelector(".cart-row");
    if (row) row.classList.add("is-unavailable");

    const oldPriceEls = cardEl.querySelectorAll(".cart-old");
    oldPriceEls.forEach((el) => {
      el.classList.add("hidden");
      el.textContent = "";
    });

    const priceEl = cardEl.querySelector(".cart-price");
    if (priceEl) {
      priceEl.textContent = "Нет в наличии";
      priceEl.classList.add("is-unavailable-label");
    }
  }

  function applyFavoriteComboThumbGrid(itemsWrap, snapshot) {
    if (!itemsWrap || !snapshot || typeof snapshot !== "object") return;
    if (str(snapshot.type || "").toLowerCase() !== "combo") return;
    const row = itemsWrap.querySelector(".cart-row--combo");
    if (!row) return;

    const grid = document.createElement("div");
    grid.className = "cart-combo-thumb";

    const photos = (Array.isArray(snapshot.selections) ? snapshot.selections : [])
      .slice(0, 4)
      .map((sel) => str(sel?.product_photo || "").trim());
    const comboGridOrder = [0, 2, 3, 1];

    for (let i = 0; i < 4; i += 1) {
      const cell = document.createElement("div");
      const photo = photos[comboGridOrder[i]] || "";
      cell.className = "cart-combo-thumb__cell" + (photo ? "" : " cart-combo-thumb__cell--empty");
      if (photo) {
        const img = createOptimizedImage(photo, { type: "cart-thumb", className: "cart-thumb", alt: "" });
        cell.appendChild(img);
      }
      grid.appendChild(cell);
    }

    const oldThumb = row.querySelector(".cart-thumb, .cart-combo-thumb");
    if (oldThumb) {
      oldThumb.replaceWith(grid);
    } else {
      row.insertAdjacentElement("afterbegin", grid);
    }
  }

  async function isFavoriteSnapshotAvailableNow(snapshot) {
    const productIds = collectFavoriteSnapshotProductIds(snapshot);
    if (!productIds.length) return true;

    for (const rawId of productIds) {
      const pid = Number(rawId);
      if (!Number.isFinite(pid) || pid <= 0) return false;
      try {
        await ensureProduct(pid);
      } catch (e) {
        console.warn("Failed to load favorite product availability:", pid, e);
        return false;
      }
      const product = state.productCache.get(pid);
      if (!product || !isProductAvailable(product)) return false;
    }

    return true;
  }

  async function addFavoriteSnapshotToCart(snapshot) {
    return addRepeatSnapshotToCartLocal(snapshot);
  }

  function initFavoriteSwipeRow(container, content, { onRemove, onAddToCart, allowAdd = true } = {}) {
    if (!container || !content) return;

    let startX = 0;
    let startY = 0;
    let startTranslateX = 0;
    let translateX = 0;
    let isTracking = false;
    let isHorizontal = null;
    let moved = false;
    let busy = false;
    let suppressClick = false;
    let isTouchMode = false;

    const canAdd = Boolean(allowAdd && typeof onAddToCart === "function");
    if (!canAdd) {
      container.classList.add("is-add-disabled");
    }

    const startThreshold = 8;
    const swipeLimitRatio = 0.82;
    const actionThresholdRatio = 0.5;
    const settleThresholdRatio = 0.45;
    const fallbackRevealWidth = 68;

    const rowWidth = () => Math.max(1, container.offsetWidth || 300);
    const revealWidth = () => {
      try {
        const raw = getComputedStyle(container).getPropertyValue("--favorite-swipe-reveal");
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      } catch {}
      return fallbackRevealWidth;
    };
    const actionThreshold = () => rowWidth() * actionThresholdRatio;
    const settleThreshold = () => revealWidth() * settleThresholdRatio;
    const maxOffset = () => Math.max(revealWidth() + 16, rowWidth() * swipeLimitRatio);

    function clearSwipeState() {
      container.classList.remove("is-swipe-right", "is-swipe-left", "is-armed-add", "is-armed-remove");
      container.style.removeProperty("--favorite-swipe-progress");
    }

    function setOpenState(mode) {
      container.classList.toggle("is-open-add", mode === "add");
      container.classList.toggle("is-open-remove", mode === "remove");
    }

    function isOpen() {
      return container.classList.contains("is-open-add") || container.classList.contains("is-open-remove");
    }

    function setTranslate(x) {
      translateX = x;
      content.style.transform = `translateX(${x}px)`;
      const absX = Math.abs(x);
      const threshold = actionThreshold();
      container.classList.toggle("is-swipe-right", canAdd && x > 0.5);
      container.classList.toggle("is-swipe-left", x < -0.5);
      container.classList.toggle("is-armed-add", canAdd && x >= threshold);
      container.classList.toggle("is-armed-remove", x <= -threshold);
      container.style.setProperty("--favorite-swipe-progress", String(Math.min(1, absX / Math.max(threshold, 1))));
    }

    function closeRow(animate = true) {
      if (animate) {
        content.style.transition = "transform 0.22s ease";
      } else {
        content.style.transition = "";
      }
      setTranslate(0);
      clearSwipeState();
      setOpenState(null);

      if (currentSwipedContainer === container) {
        currentSwipedContainer = null;
      }
      suppressClick = false;

      if (animate) {
        setTimeout(() => {
          if (!content.isConnected) return;
          content.style.transition = "";
        }, 240);
      }
    }

    function openRow(mode) {
      if (mode !== "add" && mode !== "remove") {
        closeRow(true);
        return;
      }
      if (mode === "add" && !canAdd) {
        closeRow(true);
        return;
      }
      closeCurrentSwiped(true, container);
      const targetX = mode === "add" ? revealWidth() : -revealWidth();
      content.style.transition = "transform 0.22s ease";
      setTranslate(targetX);
      clearSwipeState();
      setOpenState(mode);
      currentSwipedContainer = container;
      setTimeout(() => {
        if (!content.isConnected) return;
        content.style.transition = "";
      }, 240);
    }

    container.__favoriteSwipeClose = closeRow;

    function beginTrack(clientX, clientY, touchMode) {
      if (busy) return false;
      closeCurrentSwiped(true, container);
      isTracking = true;
      isHorizontal = null;
      moved = false;
      isTouchMode = !!touchMode;
      startX = clientX;
      startY = clientY;
      startTranslateX = translateX;
      content.style.transition = "";
      return true;
    }

    function handleMove(clientX, clientY, event) {
      if (!isTracking || busy) return;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      if (isHorizontal === null && (Math.abs(deltaX) > startThreshold || Math.abs(deltaY) > startThreshold)) {
        isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      if (isHorizontal === false) return;
      if (isHorizontal !== true) return;

      if (!moved) {
        clearSwipeState();
        setOpenState(null);
      }
      moved = true;
      suppressClick = true;
      if (event && event.cancelable) {
        event.preventDefault();
      }

      const limit = maxOffset();
      let nextX = startTranslateX + deltaX;
      if (!canAdd && nextX > 0) nextX = 0;
      nextX = Math.max(-limit, Math.min(limit, nextX));
      setTranslate(nextX);
    }

    async function runAction(direction) {
      if (busy) return;
      busy = true;
      container.classList.add("is-action-busy");

      const width = rowWidth();
      const reveal = revealWidth();
      const actionTravel = Math.min(width * 0.62, Math.max(reveal * 1.2, reveal + 18));
      content.style.transition = "transform 0.18s ease-out";
      setTranslate(direction === "remove" ? -actionTravel : actionTravel);

      let ok = false;
      try {
        if (direction === "remove") {
          ok = (await (typeof onRemove === "function" ? onRemove() : false)) === true;
        } else {
          if (!canAdd) {
            ok = false;
          } else {
          ok = (await (typeof onAddToCart === "function" ? onAddToCart() : false)) === true;
          }
        }
      } catch (e) {
        console.warn("Favorite swipe action failed:", e);
        ok = false;
      } finally {
        busy = false;
        container.classList.remove("is-action-busy");
      }

      if (!content.isConnected) return;

      if (!ok || direction !== "remove") {
        closeRow(true);
      }
    }

    async function finishTrack() {
      if (!isTracking || busy) return;
      isTracking = false;
      if (!moved) return;

      const threshold = actionThreshold();
      const snapThreshold = settleThreshold();
      const x = translateX;

      if (canAdd && x >= threshold) {
        if (navigator.vibrate) navigator.vibrate(10);
        await runAction("add");
      } else if (x <= -threshold) {
        if (navigator.vibrate) navigator.vibrate(20);
        await runAction("remove");
      } else if (canAdd && x >= snapThreshold) {
        openRow("add");
      } else if (x <= -snapThreshold) {
        openRow("remove");
      } else {
        closeRow(true);
      }
    }

    content.addEventListener(
      "click",
      (event) => {
        if (isOpen()) {
          suppressClick = false;
          event.preventDefault();
          event.stopPropagation();
          closeRow(true);
          return;
        }
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    content.addEventListener("touchstart", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      beginTrack(touch.clientX, touch.clientY, true);
    }, { passive: true });

    content.addEventListener("touchmove", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      handleMove(touch.clientX, touch.clientY, event);
    }, { passive: false });

    content.addEventListener("touchend", async () => {
      await finishTrack();
      isHorizontal = null;
      moved = false;
      isTouchMode = false;
      startTranslateX = translateX;
    }, { passive: true });

    content.addEventListener("touchcancel", () => {
      isTracking = false;
      isHorizontal = null;
      moved = false;
      isTouchMode = false;
      startTranslateX = translateX;
      closeRow(true);
    }, { passive: true });

    content.addEventListener("mousedown", (event) => {
      if (isTouchMode) return;
      if (event.button !== 0) return;
      beginTrack(event.clientX, event.clientY, false);
      const onMouseMove = (moveEvent) => {
        if (!isTracking || isTouchMode) return;
        handleMove(moveEvent.clientX, moveEvent.clientY, moveEvent);
      };
      const onMouseUp = async () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (!isTracking || isTouchMode) return;
        await finishTrack();
        isHorizontal = null;
        moved = false;
        startTranslateX = translateX;
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
  }

  async function renderFavorites({ forceReload = false } = {}) {
    const currentSeq = ++renderSeq;
    currentSwipedContainer = null;
    renderMessage("Загрузка…");

    if (!getCustomerToken()) {
      if (currentSeq !== renderSeq) return;
      renderAuthRequired();
      return;
    }

    if (!window.shopFavoritesApi || typeof window.shopFavoritesApi.list !== "function") {
      if (currentSeq !== renderSeq) return;
      renderMessage("Избранное пока недоступно.");
      return;
    }

    try {
      const favorites = await window.shopFavoritesApi.list({ force: forceReload });
      if (currentSeq !== renderSeq) return;

      const rows = Array.isArray(favorites) ? favorites : [];
      const nextFavoritesSignature = rows
        .map((fav) => {
          const id = Number(fav?.id || 0);
          const itemId = Number(fav?.item_id || fav?.item?.id || 0);
          const updatedAt = str(fav?.updated_at || fav?.item?.updated_at || "");
          return `${id}:${itemId}:${updatedAt}`;
        })
        .join("|");
      if (!forceReload && nextFavoritesSignature && nextFavoritesSignature === lastFavoritesRenderSignature) {
        return;
      }
      if (!rows.length) {
        lastFavoritesRenderSignature = "";
        renderMessage("В избранном пока ничего нет.");
        return;
      }

      const availabilityByIndex = await buildFavoritesAvailabilityMap(rows);

      list.innerHTML = "";
      const repeatItems = [];
      const catalogCategories = getFavoritesCatalogCategories();
      const categoriesById = new Map(
        catalogCategories
          .map((cat) => [Number(cat?.id || 0), cat])
          .filter(([cid]) => Number.isFinite(cid) && cid > 0)
      );
      const categoriesByCode = new Map(
        catalogCategories
          .map((cat) => [str(cat?.code || "").toLowerCase(), Number(cat?.id || 0)])
          .filter(([code, cid]) => code && Number.isFinite(cid) && cid > 0)
      );
      const lookups = buildFavoriteCategoryLookups(catalogCategories);
      const groupedByCategoryId = new Map();
      const uncategorizedEntries = [];

      rows.forEach((fav, rowIndex) => {
        const snapshot = fav?.item && typeof fav.item === "object" ? fav.item : null;
        if (!snapshot) return;
        const categoryId = resolveFavoriteCategoryId(fav, snapshot, lookups, categoriesById, categoriesByCode);
        const entry = { fav, snapshot, rowIndex };
        if (Number.isFinite(Number(categoryId)) && categoriesById.has(Number(categoryId))) {
          const cid = Number(categoryId);
          if (!groupedByCategoryId.has(cid)) groupedByCategoryId.set(cid, []);
          groupedByCategoryId.get(cid).push(entry);
          return;
        }
        uncategorizedEntries.push(entry);
      });

      const sections = [];
      catalogCategories.forEach((cat) => {
        const cid = Number(cat?.id || 0);
        if (!Number.isFinite(cid) || cid <= 0) return;
        const sectionItems = groupedByCategoryId.get(cid) || [];
        if (!sectionItems.length) return;
        sections.push({
          id: cid,
          title: str(cat?.title || "Категория"),
          items: sectionItems,
        });
      });

      if (uncategorizedEntries.length) {
        sections.push({
          id: null,
          title: "Другое",
          items: uncategorizedEntries,
        });
      }

      if (!sections.length) {
        renderMessage("В избранном пока ничего нет.");
        return;
      }

      renderFavoriteCategoryChips(sections);

      const renderFavoriteEntry = ({ fav, snapshot, rowIndex }) => {
        const favoriteId = Number(fav?.id || 0);
        const isAvailable = availabilityByIndex.get(rowIndex) !== false;
        const isUnavailable = !isAvailable;

        const swipeContainer = document.createElement("div");
        swipeContainer.className = "shop-favorite-swipe-container";
        swipeContainer.classList.toggle("is-unavailable", isUnavailable);

        let addAction = null;
        let removeAction = null;
        if (favoritesUseSwipe) {
          addAction = document.createElement("button");
          addAction.type = "button";
          addAction.className = "shop-favorite-swipe-action shop-favorite-swipe-action--add";
          addAction.setAttribute("aria-label", isUnavailable ? "Нет в наличии" : "Добавить в корзину");
          addAction.disabled = isUnavailable;
          addAction.setAttribute("aria-disabled", isUnavailable ? "true" : "false");
          addAction.innerHTML = '<i class="fas fa-shopping-cart"></i>';
          swipeContainer.appendChild(addAction);

          removeAction = document.createElement("button");
          removeAction.type = "button";
          removeAction.className = "shop-favorite-swipe-action shop-favorite-swipe-action--remove";
          removeAction.setAttribute("aria-label", "Удалить из избранного");
          removeAction.innerHTML = '<i class="fas fa-trash"></i>';
          swipeContainer.appendChild(removeAction);
        }

        const content = document.createElement("div");
        content.className = "shop-favorite-swipe-content";

        const card = document.createElement("div");
        card.className = "shop-profile-card shop-favorites-card";

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "shop-cart-items";
        let rowHtml = "";
        if (typeof window.formatOrderItem === "function") {
          try {
            rowHtml = String(window.formatOrderItem(snapshot) || "");
          } catch (e) {
            console.warn("Failed to format favorite item:", e);
          }
        }
        if (rowHtml) {
          itemsWrap.innerHTML = rowHtml;
        } else {
          itemsWrap.appendChild(buildFallbackItemRow(snapshot));
        }
        applyFavoriteComboThumbGrid(itemsWrap, snapshot);
        card.appendChild(itemsWrap);
        if (isUnavailable) {
          applyFavoriteUnavailableView(card);
        }

        content.appendChild(card);
        swipeContainer.appendChild(content);
        list.appendChild(swipeContainer);
        repeatItems.push(snapshot);

        const removeFavorite = async () => {
          if (!Number.isFinite(favoriteId) || favoriteId <= 0) return false;
          try {
            await window.shopFavoritesApi.remove(favoriteId);
            showToast("Удалено из избранного");
            await renderFavorites({ forceReload: false });
            return true;
          } catch (e) {
            console.warn("Failed to remove favorite:", e);
            if (Number(e?.httpStatus) === 401) {
              renderAuthRequired();
              return false;
            }
            showToast("Не удалось удалить из избранного");
            return false;
          }
        };

        const addToCart = async () => {
          if (isUnavailable) {
            showToast("Нет в наличии");
            return false;
          }
          return await addFavoriteSnapshotToCart(snapshot);
        };

        if (!favoritesUseSwipe) {
          const row = itemsWrap.querySelector(".cart-row");
          if (row) {
            row.classList.add("cart-row--favorite-desktop-actions");

            const actions = document.createElement("div");
            actions.className = "shop-favorite-desktop-actions";

            const addDesktopBtn = document.createElement("button");
            addDesktopBtn.type = "button";
            addDesktopBtn.className = "shop-favorite-desktop-action";
            addDesktopBtn.setAttribute("aria-label", isUnavailable ? "Нет в наличии" : "Добавить в корзину");
            addDesktopBtn.innerHTML = '<i class="fas fa-shopping-cart"></i>';
            if (isUnavailable) {
              addDesktopBtn.disabled = true;
              addDesktopBtn.setAttribute("aria-disabled", "true");
            }

            const removeDesktopBtn = document.createElement("button");
            removeDesktopBtn.type = "button";
            removeDesktopBtn.className = "shop-favorite-desktop-action";
            removeDesktopBtn.setAttribute("aria-label", "Удалить из избранного");
            removeDesktopBtn.innerHTML = '<i class="fas fa-trash"></i>';

            addDesktopBtn.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await addToCart();
            });

            removeDesktopBtn.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await removeFavorite();
            });

            actions.appendChild(addDesktopBtn);
            actions.appendChild(removeDesktopBtn);
            row.appendChild(actions);
          }
          return;
        }

        if (removeAction) {
          removeAction.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await removeFavorite();
          });
        }

        if (addAction) {
          addAction.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await addToCart();
            const closeFn = swipeContainer.__favoriteSwipeClose;
            if (typeof closeFn === "function") {
              closeFn(true);
            }
          });
        }

        initFavoriteSwipeRow(swipeContainer, content, {
          onRemove: removeFavorite,
          onAddToCart: addToCart,
          allowAdd: !isUnavailable,
        });
      };

      sections.forEach((section) => {
        const sectionItems = Array.isArray(section?.items) ? section.items : [];
        if (!sectionItems.length) return;
        const header = document.createElement("div");
        header.className = "shop-category-header shop-favorites-category-header";
        header.textContent = str(section?.title || "Категория");
        const sectionId = Number(section?.id || 0);
        if (Number.isFinite(sectionId) && sectionId > 0) {
          header.setAttribute("data-cat-id", String(sectionId));
          header.setAttribute("data-cat-title", str(section?.title || ""));
        }
        list.appendChild(header);
        sectionItems.forEach((entry) => renderFavoriteEntry(entry));
      });

      if (!repeatItems.length) {
        lastFavoritesRenderSignature = "";
        renderMessage("В избранном пока ничего нет.");
        return;
      }

      lastFavoritesRenderSignature = nextFavoritesSignature;
      const reopenFavorites = () => {
        void openFavoritesSheet({ force: false, forceOpen: true });
      };
      bindRepeatOrderItemRows(list, repeatItems, { onBack: reopenFavorites });
    } catch (e) {
      if (currentSeq !== renderSeq) return;
      console.warn("Failed to load favorites:", e);
      if (Number(e?.httpStatus) === 401) {
        if (window.shopFavoritesApi && typeof window.shopFavoritesApi.clearCache === "function") {
          window.shopFavoritesApi.clearCache();
        }
        renderAuthRequired();
        return;
      }
      renderMessage("Ошибка загрузки избранного");
    }
  }

  if (!isMobileSheet) {
    if (typeof closeShopSheetIfOpen === "function") closeShopSheetIfOpen();

    if (!forceOpen && cartViewMode === "favorites") {
      if (typeof restorePreviousPanel === "function") {
        void restorePreviousPanel();
      } else if (typeof showCartView === "function") {
        showCartView();
      }
      return;
    }

    if (!forceOpen && typeof rememberPreviousPanel === "function") {
      rememberPreviousPanel();
    }

    if (typeof showProfileView === "function") {
      showProfileView();
    }
    cartViewMode = "favorites";
    openProductCtx = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("openFavoritesSheet.desktop");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("openFavoritesSheet.desktop");
    }

    if (typeof setHeaderFavoritesButtonActive === "function") {
      setHeaderFavoritesButtonActive(true);
    }

    if (elProfileContent) {
      elProfileContent.innerHTML = "";
      elProfileContent.appendChild(wrap);
    }

    const closeDesktopFavorites = () => {
      const cleanupFn = window.__shopDesktopFavoritesCleanup;
      if (typeof cleanupFn === "function") {
        window.__shopDesktopFavoritesCleanup = null;
        try {
          cleanupFn();
        } catch {}
      }

      if (previousPanelMode === "favorites" && typeof showCartView === "function") {
        showCartView();
        return;
      }

      if (typeof restorePreviousPanel === "function") {
        void restorePreviousPanel();
      } else if (typeof showCartView === "function") {
        showCartView();
      }
    };

    if (typeof setCartHeader === "function") {
      setCartHeader({
        title: "Избранное",
        showAddressChip: false,
        showProfileActions: false,
        showBack: false,
        showFav: false,
        showClose: true,
        onClose: closeDesktopFavorites,
      });
    }

    window.__shopDesktopFavoritesCleanup = () => {
      closeCurrentSwiped(false);
      currentSwipedContainer = null;
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      if (typeof setHeaderFavoritesButtonActive === "function") {
        setHeaderFavoritesButtonActive(false);
      }
    };

    void renderFavorites({ forceReload: force });
    return;
  }

  if (isAnySheetOpen && currentSheetType && currentSheetType !== "favorites") {
    closeShopSheetIfOpen();
  }

  // В режиме избранного не используем контекст корзины, чтобы переключение
  // в "Корзину" не пыталось переиспользовать старый showSheetCart.
  openCartSheetCtx = null;
  openProductCtx = null;

  sheetNavigationState.type = "favorites";
  sheetNavigationState.screen = "list";
  sheetNavigationState.data = null;
  if (typeof queueMobileUiStateSync === "function") {
    queueMobileUiStateSync("openFavoritesSheet.mobile");
  } else if (typeof window.queueShopMobileUiStateSync === "function") {
    window.queueShopMobileUiStateSync("openFavoritesSheet.mobile");
  }

  setAppModalMode("shop");
  setSheetHeaderMode("");
  setActiveNav("fav");
  window.AppModal.open({
    title: "Избранное",
    content: wrap,
    onClose: () => {
      closeCurrentSwiped(false);
      currentSwipedContainer = null;
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      setActiveNav("menu");
      sheetNavigationState.type = null;
      sheetNavigationState.screen = null;
      sheetNavigationState.data = null;
      if (typeof queueMobileUiStateSync === "function") {
        queueMobileUiStateSync("openFavoritesSheet.mobile.onClose");
      } else if (typeof window.queueShopMobileUiStateSync === "function") {
        window.queueShopMobileUiStateSync("openFavoritesSheet.mobile.onClose");
      }
      openCartSheetCtx = null;
      openProductCtx = null;
      setSheetHeaderMode("");
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    },
  });

  // Если до этого был product/combo режим, возвращаем стандартный хедер списка.
  setSheetHeaderMode("");

  void renderFavorites({ forceReload: force });

  if (typeof window.updateActiveOrdersBadge === "function") {
    setTimeout(() => {
      window.updateActiveOrdersBadge();
    }, 100);
  }
}

  function setCartSheetFooterMode(ctx, mode) {
    if (!ctx?.footerEl) return;
    ctx.footerEl.classList.toggle("hidden", mode === "hidden");
    if (ctx.cartActionsEl) ctx.cartActionsEl.classList.toggle("hidden", mode !== "cart");
    if (ctx.checkoutActionsEl) ctx.checkoutActionsEl.classList.toggle("hidden", mode !== "checkout");
  }

function openCartSheet() {
  if (!window.AppModal) return;
  const buildCartSheetRenderSignature = () => {
    const rows = cartItemsResolved().map((item) => {
      const key = str(item?.key || "");
      const qty = Number(item?.qty || 0);
      const type = str(item?.type || "");
      const selLen = Array.isArray(item?.selections) ? item.selections.length : 0;
      return `${key}:${qty}:${type}:${selLen}`;
    });
    return rows.join("|");
  };
  clearProfileModalMenu();
  let addressSheetAsyncToken = 0;
  let postModalCloseUiSyncTimer = null;

  function setAddressSheetBodyState(active) {
    try {
      document.body.classList.toggle("shop-address-sheet-active", !!active);
    } catch {}
  }

  function invalidateAddressSheetUiState() {
    addressSheetAsyncToken += 1;
    setAddressSheetBodyState(false);
    if (elMobileAddressConfirm) {
      elMobileAddressConfirm.classList.add("hidden");
    }
  }

  function schedulePostModalCloseUiSync() {
    if (postModalCloseUiSyncTimer) {
      clearTimeout(postModalCloseUiSyncTimer);
      postModalCloseUiSyncTimer = null;
    }
    postModalCloseUiSyncTimer = setTimeout(() => {
      postModalCloseUiSyncTimer = null;
      if (window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen()) {
        return;
      }
      invalidateAddressSheetUiState();
      if (elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    }, 160);
  }

  if (openCartSheetCtx && openCartSheetCtx.wrapEl) {
    if (typeof setActiveNav === "function") setActiveNav("cart");
    setAppModalMode("shop");
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'cart';
    sheetNavigationState.data = null;
    window.AppModal.open({
      title: "Корзина",
      content: openCartSheetCtx.wrapEl,
      onClose: () => {
        invalidateAddressSheetUiState();
        cleanupCheckoutViewSubscriptions();
        resetShopModalHeaderUi();
        if (elMobileCartActions) elMobileCartActions.classList.add("hidden");
        if (elMobileAddressActions) elMobileAddressActions.classList.add("hidden");
        if (elMobileAddressConfirm) elMobileAddressConfirm.classList.add("hidden");
        if (elMobileProductActions) elMobileProductActions.classList.add("hidden");
        if (window.AppModal?.body) window.AppModal.body.classList.remove("shop-cart-sheet-body");
        openProductCtx = null;
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        schedulePostModalCloseUiSync();
        if (typeof setActiveNav === "function") setActiveNav("menu");
      },
    });
    if (window.AppModal?.body) window.AppModal.body.classList.add("shop-cart-sheet-body");
    if (openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const renderSignature = buildCartSheetRenderSignature();
      if (openCartSheetCtx.lastRenderSignature !== renderSignature) {
        const rendered = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        appendUpsellToList(openCartSheetCtx.listEl);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", rendered.items.length === 0);
        if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = rendered.items.length === 0;
        openCartSheetCtx.lastRenderSignature = renderSignature;
      }
    }
    if (typeof openCartSheetCtx.showSheetCart === "function") openCartSheetCtx.showSheetCart();
    return;
  }

  // bottom nav: подсветить "Корзина" только пока открыт sheet
  if (typeof setActiveNav === "function") setActiveNav("cart");

  const wrap = document.createElement("div");
  wrap.className = "shop-cart-sheet";

  const list = document.createElement("div");
  list.className = "shop-cart-list";
  wrap.appendChild(list);

  const checkoutWrap = document.createElement("div");
  checkoutWrap.className = "shop-checkout-content hidden";
  wrap.appendChild(checkoutWrap);

  const addressWrap = document.createElement("div");
  addressWrap.className = "shop-address-content hidden";
  wrap.appendChild(addressWrap);

  const productWrap = document.createElement("div");
  productWrap.className = "shop-product-content hidden";
  wrap.appendChild(productWrap);

  const pickupSheetWrap = document.createElement("div");
  pickupSheetWrap.className = "shop-pickup-content hidden";
  wrap.appendChild(pickupSheetWrap);

  const pickupSheetListView = document.createElement("div");
  pickupSheetListView.className = "shop-pickup-list-view";

  const pickupSheetList = document.createElement("div");
  pickupSheetList.className = "shop-pickup-list";

  pickupSheetListView.appendChild(pickupSheetList);
  pickupSheetWrap.appendChild(pickupSheetListView);

  const addressListView = document.createElement("div");
  addressListView.className = "shop-address-list-view hidden";

  // Delivery / Pickup toggle
  const deliveryToggleWrap = document.createElement("div");
  deliveryToggleWrap.className = "shop-delivery-toggle-wrap";
  const deliveryToggle = document.createElement("div");
  deliveryToggle.className = "shop-delivery-toggle";
  const toggleDeliveryBtn = document.createElement("button");
  toggleDeliveryBtn.type = "button";
  toggleDeliveryBtn.className = "shop-delivery-toggle-btn is-active";
  toggleDeliveryBtn.textContent = "Доставка";
  toggleDeliveryBtn.dataset.mode = "delivery";
  const togglePickupBtn = document.createElement("button");
  togglePickupBtn.type = "button";
  togglePickupBtn.className = "shop-delivery-toggle-btn";
  togglePickupBtn.textContent = "Самовывоз";
  togglePickupBtn.dataset.mode = "pickup";
  deliveryToggle.appendChild(toggleDeliveryBtn);
  deliveryToggle.appendChild(togglePickupBtn);
  deliveryToggleWrap.appendChild(deliveryToggle);

  const addressListTop = document.createElement("div");
  addressListTop.className = "shop-address-list-top";

  const addressListTitle = document.createElement("span");
  addressListTitle.className = "shop-address-list-title";
  addressListTitle.textContent = "Мои адреса";
  addressListTop.appendChild(addressListTitle);

  const addressNewBtn = document.createElement("button");
  addressNewBtn.type = "button";
  addressNewBtn.className = "shop-address-new-btn";
  addressNewBtn.textContent = "+ Новый адрес";
  addressListTop.appendChild(addressNewBtn);

  const addressList = document.createElement("div");
  addressList.className = "shop-address-list";

  // Pickup list header (title + city selector)
  const pickupListTop = document.createElement("div");
  pickupListTop.className = "shop-pickup-list-top hidden";
  pickupListTop.innerHTML = `
    <div class="shop-pickup-list-title">Филиалы</div>
    <div class="shop-pickup-city-selector">
      <button class="chip chip-city" type="button">
        <span class="chip-city-text">Все города</span>
        <i class="fas fa-chevron-down chip-city-arrow"></i>
      </button>
      <div class="chip-city-dropdown hidden"></div>
    </div>
  `;

  // Pickup list container (inside same view)
  const pickupInlineList = document.createElement("div");
  pickupInlineList.className = "shop-pickup-inline-list hidden";

  addressListView.appendChild(addressListTop);
  addressListView.appendChild(addressList);
  addressListView.appendChild(pickupListTop);
  addressListView.appendChild(pickupInlineList);
  addressWrap.appendChild(addressListView);

  const addressFormView = document.createElement("div");
  addressFormView.className = "shop-address-form-view hidden";
  addressFormView.innerHTML = `
    <div class="shop-address-form-grid">
      <div class="shop-address-form-row shop-address-form-row--full">
        <label class="field-label">Город</label>
        <div class="custom-select" data-a="city">
          <button type="button" class="custom-select-trigger control">
            <span class="custom-select-value"></span>
            <i class="fas fa-chevron-down custom-select-arrow" aria-hidden="true"></i>
          </button>
          <div class="custom-select-dropdown hidden"></div>
        </div>
      </div>
      <div class="shop-address-form-row shop-address-form-row--full">
        <label class="field-label">Улица</label>
        <input class="control" data-a="street" type="text" />
      </div>
      <div class="shop-address-form-row shop-address-form-row--grid">
        <div class="shop-address-form-field">
          <label class="field-label">Дом</label>
          <input class="control" data-a="house" type="text" />
        </div>
        <div class="shop-address-form-field">
          <label class="field-label">Подъезд</label>
          <input class="control" data-a="entrance" type="text" />
        </div>
        <div class="shop-address-form-field">
          <label class="field-label">Этаж</label>
          <input class="control" data-a="floor" type="text" />
        </div>
        <div class="shop-address-form-field">
          <label class="field-label">Квартира</label>
          <input class="control" data-a="apartment" type="text" />
        </div>
      </div>
      <div class="shop-address-form-row shop-address-form-row--full">
        <label class="field-label">Комментарий курьеру</label>
        <input class="control" data-a="comment" type="text" />
      </div>
    </div>
    <div class="shop-address-form-actions">
      <button class="btn btn-primary" type="button" data-a="save">Сохранить</button>
      <button class="btn" type="button" data-a="cancel">Отмена</button>
    </div>
  `;
  addressWrap.appendChild(addressFormView);

  const footer = document.createElement("div");
  footer.className = "shop-cart-sheet-footer";

  const cartActions = document.createElement("div");
  cartActions.className = "shop-cart-footer-actions";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "shop-cart-clear";
  clearBtn.textContent = "Г—";
  clearBtn.title = "Очистить корзину";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "shop-checkout-btn";
  btn.innerHTML = `Оформить · <span class="shop-sheet-checkout-total">0 ₽</span>`;

  cartActions.appendChild(clearBtn);
  cartActions.appendChild(btn);
  footer.appendChild(cartActions);

  const checkoutActions = document.createElement("div");
  checkoutActions.className = "shop-checkout-footer-actions hidden";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "shop-checkout-back";
  backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "shop-checkout-submit-btn";
  submitBtn.textContent = "Заказать";

  checkoutActions.appendChild(backBtn);
  checkoutActions.appendChild(submitBtn);
  footer.appendChild(checkoutActions);

  wrap.appendChild(footer);

  const totalSpan = $(".shop-sheet-checkout-total", btn);
  const { items, total } = renderCartInto(list, totalSpan, null);
  const initialRenderSignature = buildCartSheetRenderSignature();
  appendUpsellToList(list);

  footer.classList.toggle("hidden", items.length === 0);
  btn.disabled = items.length === 0;
  totalSpan.textContent = money(total);
  
  // Синхронизируем с мобильными кнопками
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile && elMobileCartActions && elMobileCartTotal && elMobileCheckoutBtn) {
    // Подключаем обработчики к мобильным кнопкам
    if (elMobileCheckoutBtn) {
      elMobileCheckoutBtn.onclick = () => btn.click();
    }
    if (elMobileCartClearBtn) {
      if (!elMobileCartClearBtn.dataset.twostepClear) {
        attachTwoStepClear(elMobileCartClearBtn, () => clearCartAll());
        elMobileCartClearBtn.dataset.twostepClear = "1";
      }
    }
    if (elMobileCheckoutBackBtn) {
      elMobileCheckoutBackBtn.onclick = () => backBtn.click();
    }
    if (elMobileCheckoutSubmitBtn) {
      elMobileCheckoutSubmitBtn.onclick = () => submitBtn.click();
    }
    
    // Показываем мобильные кнопки
    elMobileCartActions.classList.remove("hidden");
    if (items.length > 0) {
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.remove("hidden");
    } else {
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
    }
    if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    
    // Синхронизируем состояние
    elMobileCartTotal.textContent = money(total);
    elMobileCheckoutBtn.disabled = items.length === 0;
    updateMobileDeliveryProgress();
    
    // Скрываем ботомщит активного заказа при открытии корзины
    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
    
    // Скрываем кнопки товара если они были показаны
    if (elMobileProductActions) {
      elMobileProductActions.classList.add("hidden");
    }
  }
  
  // Синхронизируем с мобильными кнопками
  if (isMobile && elMobileCartTotal) {
    elMobileCartTotal.textContent = money(total);
  }
  if (isMobile && elMobileCheckoutBtn) {
    elMobileCheckoutBtn.disabled = items.length === 0;
  }

  // ===== helpers title =====
function applySheetAddressTitle(backMode = "cart") {
  const line = getSelectedAddressLine();
  const t = line || "Введите адрес";
  if (window.AppModal?.setTitle) window.AppModal.setTitle(t);

    const titleEl =
      document.querySelector(".app-modal-header .app-modal-title") ||
      document.querySelector(".app-modal-header .modal-title") ||
      document.querySelector(".app-modal-header [data-modal-title]");

    if (titleEl) {
      titleEl.classList.add("is-cart-address-title");
      titleEl.classList.toggle("is-empty-address", !line);

      // делаем кликабельным (открыть адреса)
      titleEl.style.cursor = "pointer";
      titleEl.onclick = async () => {
        await refreshAddressState();
        showSheetAddressList(backMode);
      };
    }
  }

  function clearSheetAddressTitleMode() {
    const titleEl =
      document.querySelector(".app-modal-header .app-modal-title") ||
      document.querySelector(".app-modal-header .modal-title") ||
      document.querySelector(".app-modal-header [data-modal-title]");
    if (titleEl) {
      titleEl.classList.remove("is-cart-address-title");
      titleEl.classList.remove("is-empty-address");
      titleEl.style.cursor = "";
      titleEl.onclick = null;
    }
  }

  // Обновляем состояние навигации при открытии корзины
  sheetNavigationState.type = 'cart';
  sheetNavigationState.screen = 'cart';
  sheetNavigationState.data = null;

  setAppModalMode("shop");
  window.AppModal.open({
    title: "Корзина",
    content: wrap,
    onClose: () => {
      invalidateAddressSheetUiState();
      cleanupCheckoutViewSubscriptions();
      resetShopModalHeaderUi();

      // Скрываем мобильные кнопки при закрытии sheet
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions) {
        elMobileCartActions.classList.add("hidden");
      }
      if (isMobile && elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
      if (isMobile && elMobileAddressConfirm) {
        elMobileAddressConfirm.classList.add("hidden");
      }

      if (window.AppModal?.body) window.AppModal.body.classList.remove("shop-cart-sheet-body");
      openProductCtx = null;
      // Сбрасываем состояние навигации
      sheetNavigationState.type = null;
      sheetNavigationState.screen = null;
      sheetNavigationState.data = null;
      // Обновляем бейдж после закрытия модального окна
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
      schedulePostModalCloseUiSync();

      clearSheetAddressTitleMode();

      // bottom nav: после закрытия возвращаем "Главная"
      if (typeof setActiveNav === "function") setActiveNav("menu");
    },
  });
  
  // Обновляем бейдж сразу после открытия модального окна корзины
  if (typeof window.updateActiveOrdersBadge === "function") {
    setTimeout(() => {
      window.updateActiveOrdersBadge();
    }, 100);
  }

  if (window.AppModal?.body) window.AppModal.body.classList.add("shop-cart-sheet-body");

  openCartSheetCtx = {
    wrapEl: wrap,
    listEl: list,
    totalEl: totalSpan,
    footerEl: footer,
    cartActionsEl: cartActions,
    checkoutActionsEl: checkoutActions,
    checkoutBtn: btn,
    clearBtn,
    checkoutEl: checkoutWrap,
    productEl: productWrap,
    addressBackMode: null,
    showSheetAddressForm,
    showSheetProduct,
    showSheetCombo,
    showSheetCart,
    showSheetAddressList,
    lastRenderSignature: initialRenderSignature,
  };

  setCartSheetFooterMode(openCartSheetCtx, items.length ? "cart" : "hidden");
  attachTwoStepClear(clearBtn, () => clearCartAll());

  let sheetEditingId = null;

  function isAddressSheetListActive(mode) {
    if (!window.AppModal || typeof window.AppModal.isOpen !== "function" || !window.AppModal.isOpen()) {
      return false;
    }
    if (sheetNavigationState.type !== "cart" || sheetNavigationState.screen !== "addressList") {
      return false;
    }
    if (addressWrap.classList.contains("hidden") || addressListView.classList.contains("hidden")) {
      return false;
    }
    if (mode && activeToggleMode !== mode) {
      return false;
    }
    return true;
  }

  function isAddressSheetAsyncStateValid(token, mode) {
    return token === addressSheetAsyncToken && isAddressSheetListActive(mode);
  }

  async function showSheetCheckout() {
    invalidateAddressSheetUiState();
    __forceHideCheckoutDeliveryProgress = true;
    hideHeaderToggle();
    checkoutWrap.classList.remove("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "checkout");
    
    // Синхронизируем мобильные кнопки
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) updateMobileDeliveryProgress();

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");

    // обычный режим шапки (крестик есть)
    setSheetHeaderMode("cart");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'checkout';
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showSheetCheckout");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showSheetCheckout");
    }

    // Создаем контент оформления заказа
    await openCheckoutView({
      container: checkoutWrap,
      onBack: showSheetCart,
      hasAddressEditor: true,
      isSheet: true,
      actions: { submitBtn: submitBtn, backBtn: backBtn },
      onEditAddress: () => { window._deliveryMode = "delivery"; showSheetAddressList("checkout"); },
      onEditPickup: () => { window._deliveryMode = "pickup"; showSheetAddressList("checkout"); },
    });
  }

  function showSheetCart() {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    __forceHideCheckoutDeliveryProgress = false;
    hideHeaderToggle();
    checkoutWrap.classList.add("hidden");
    list.classList.remove("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    // Перерисовываем список корзины и апселл при возврате в вид корзины
    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      appendUpsellToList(openCartSheetCtx.listEl);
      if (openCartSheetCtx.checkoutBtn) {
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
    }

    window._checkoutMethodCode = null;
    const hasItems = cartItemsResolved().length > 0;
    setCartSheetFooterMode(openCartSheetCtx, hasItems ? "cart" : "hidden");
    if (openCartSheetCtx?.checkoutBtn) {
      openCartSheetCtx.checkoutBtn.disabled = !hasItems;
    }
    if (openCartSheetCtx) {
      openCartSheetCtx.addressBackMode = null;
    }

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Корзина");

    // На мобильных: скрываем мобильные кнопки товара, показываем кнопки корзины
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      // Managed by unified mobile bottom renderer.
      // На экране корзины всегда показываем блок (полоска прогресса видна и при пустой корзине)
      if (elMobileCheckoutBtn) {
        elMobileCheckoutBtn.disabled = !hasItems;
      }
      const mobileNameWrap = document.getElementById("shopMobileCheckoutNameWrap");
      if (mobileNameWrap) mobileNameWrap.classList.add("hidden");
      const mobileCommentWrap = document.getElementById("shopMobileCheckoutCommentWrap");
      if (mobileCommentWrap) mobileCommentWrap.classList.add("hidden");
      updateMobileDeliveryProgress();
    }
    // Обновляем ботомщит активного заказа
    if (typeof window.updateActiveOrdersBadge === "function") {
      window.updateActiveOrdersBadge();
    }

    // cart mode header: вернуть Г—, убрать в†ђ/в™Ў
    setSheetHeaderMode("cart");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'cart';
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showSheetCart");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showSheetCart");
    }

    openProductCtx = null;
  }

function showSheetAddressList(backMode) {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.remove("hidden");
    addressListView.classList.remove("hidden");
    addressFormView.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");
    if (openCartSheetCtx) {
      const resolvedBackMode =
        backMode !== undefined
          ? backMode || "cart"
          : openCartSheetCtx.addressBackMode || "cart";
      openCartSheetCtx.addressBackMode = resolvedBackMode;
    }

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");
    setSheetHeaderMode("cart");

    // Insert toggle into sheet header
    showHeaderToggle();

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'addressList';
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showSheetAddressList");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showSheetAddressList");
    }
    setAddressSheetBodyState(true);

    // Set toggle based on current delivery mode
    const initMode = window._deliveryMode === "pickup" ? "pickup" : "delivery";
    setToggleMode(initMode);
  }

  function showSheetPickupList() {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    hideHeaderToggle();
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Точка самовывоза");
    setSheetHeaderMode("cart");

    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'pickupList';
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showSheetPickupList");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showSheetPickupList");
    }

    renderSheetPickupList();
  }

  function ensureValidSelectedPickupStoreId(stores) {
    const ids = (Array.isArray(stores) ? stores : [])
      .map((s) => Number(s?.id))
      .filter((id) => Number.isFinite(id));
    if (!ids.length) {
      window._selectedPickupStoreId = null;
      return null;
    }

    const currentId = Number(window._selectedPickupStoreId);
    if (Number.isFinite(currentId) && ids.includes(currentId)) {
      return currentId;
    }

    const activeStoreId = Number(localStorage.getItem("activeStoreId"));
    const fallbackId = (Number.isFinite(activeStoreId) && ids.includes(activeStoreId))
      ? activeStoreId
      : ids[0];
    window._selectedPickupStoreId = fallbackId;
    return fallbackId;
  }

  let selectedPickupCity = null; // null = "Все города"

  function initSheetPickupCitySelector(pickupSheetListView) {
    const stores = window._pickupStores || [];
    const cities = [...new Set(stores.map(s => s.city).filter(Boolean))].sort();

    // Check if header already exists
    let topSection = pickupSheetListView.querySelector(".shop-pickup-list-top");
    if (!topSection) {
      topSection = document.createElement("div");
      topSection.className = "shop-pickup-list-top";

      const title = document.createElement("div");
      title.className = "shop-pickup-list-title";
      title.textContent = "Филиалы";
      topSection.appendChild(title);

      const selector = document.createElement("div");
      selector.className = "shop-pickup-city-selector";

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip-city";
      chip.innerHTML = `
        <span class="chip-city-text">Все города</span>
        <i class="fas fa-chevron-down chip-city-arrow"></i>
      `;

      const dropdown = document.createElement("div");
      dropdown.className = "chip-city-dropdown hidden";

      selector.appendChild(chip);
      selector.appendChild(dropdown);
      topSection.appendChild(selector);

      // Insert at the beginning of pickupSheetListView
      pickupSheetListView.insertBefore(topSection, pickupSheetListView.firstChild);
    }

    const chip = topSection.querySelector(".chip-city");
    const dropdown = topSection.querySelector(".chip-city-dropdown");
    const chipText = chip.querySelector(".chip-city-text");

    // Update chip text
    const updateChipText = () => {
      chipText.textContent = selectedPickupCity || "Все города";
    };

    // Render options
    dropdown.innerHTML = "";

    // Option "All cities"
    const allOption = document.createElement("button");
    allOption.type = "button";
    allOption.className = "chip-city-option" + (!selectedPickupCity ? " is-selected" : "");
    allOption.textContent = "Все города";
    allOption.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedPickupCity = null;
      updateChipText();
      dropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
      allOption.classList.add("is-selected");
      dropdown.classList.add("hidden");
      chip.classList.remove("is-open");
      renderSheetPickupList();
    });
    dropdown.appendChild(allOption);

    // City options
    cities.forEach(city => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "chip-city-option" + (city === selectedPickupCity ? " is-selected" : "");
      opt.textContent = city;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedPickupCity = city;
        updateChipText();
        dropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        dropdown.classList.add("hidden");
        chip.classList.remove("is-open");
        renderSheetPickupList();
      });
      dropdown.appendChild(opt);
    });

    updateChipText();

    // Toggle
    chip.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains("hidden");
      dropdown.classList.toggle("hidden", isOpen);
      chip.classList.toggle("is-open", !isOpen);
    };

    // Close on outside click
    const closeHandler = (e) => {
      const selector = topSection.querySelector(".shop-pickup-city-selector");
      if (selector && !selector.contains(e.target)) {
        dropdown.classList.add("hidden");
        chip.classList.remove("is-open");
      }
    };
    const selectorEl = topSection.querySelector(".shop-pickup-city-selector");
    if (selectorEl) {
      document.removeEventListener("click", selectorEl._closeHandler);
      selectorEl._closeHandler = closeHandler;
      document.addEventListener("click", closeHandler);
    }
  }

  function renderSheetPickupList() {
    pickupSheetList.innerHTML = "";

    const allStores = window._pickupStores || [];

    // Initialize city selector (creates header and selector)
    initSheetPickupCitySelector(pickupSheetListView);

    // Filter by selected city
    const stores = selectedPickupCity
      ? allStores.filter(s => s.city === selectedPickupCity)
      : allStores;

    if (!stores.length) {
      pickupSheetList.innerHTML = selectedPickupCity
        ? `<div class="muted" style="padding:16px">Нет точек самовывоза в городе ${selectedPickupCity}.</div>`
        : `<div class="muted" style="padding:16px">Нет доступных точек самовывоза.</div>`;
      return;
    }

    const currentStoreId = ensureValidSelectedPickupStoreId(stores);

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";

      const isSelected = currentStoreId && Number(store.id) === Number(currentStoreId);
      if (isSelected) row.classList.add("is-selected");

      // Добавляем класс для закрытых точек
      if (store.isOpen === false) row.classList.add("is-closed");

      // Убираем город из адреса (город виден в хедере)
      const fullAddress = store.address || store.name || 'Точка #' + store.id;

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      const titleEl = document.createElement("div");
      titleEl.className = "shop-address-card-title";
      titleEl.textContent = store.name || 'Точка ' + store.id;
      main.appendChild(titleEl);

      const subEl = document.createElement("div");
      subEl.className = "shop-address-card-sub";
      subEl.textContent = fullAddress;
      main.appendChild(subEl);

      // Добавляем часы работы на сегодня
      const hoursText = formatTodayHours(store.storeHours, store.timezone);
      if (hoursText) {
        const hoursEl = document.createElement("div");
        hoursEl.className = "shop-address-card-hours";
        hoursEl.textContent = hoursText;
        main.appendChild(hoursEl);
      }

      card.appendChild(main);

      if (isSelected) {
        const checkIcon = document.createElement("div");
        checkIcon.className = "shop-address-check-icon";
        checkIcon.innerHTML = `<i class="fas fa-check"></i>`;
        card.appendChild(checkIcon);
      }

      row.appendChild(card);

      row.addEventListener("click", async () => {
        window._deliveryMode = "pickup";
        window._selectedPickupStoreId = Number(store.id);

        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }

        await showSheetCheckout();
      });

      pickupSheetList.appendChild(row);
    });
  }

  async function ensureStoresLoaded() {
    if (window._pickupStores && window._pickupStores.length) {
      ensureValidSelectedPickupStoreId(window._pickupStores);
      return;
    }
    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : null;
      if (!tenantId) return;
      const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.stores)) {
        window._pickupStores = data.stores;
        ensureValidSelectedPickupStoreId(window._pickupStores);
      }
    } catch {}
  }

  function populateCitySelect(wrapEl, prefillCity) {
    if (!wrapEl) return;
    initCustomSelect(wrapEl, prefillCity);
  }

  async function showSheetAddressForm(prefill, editingId, backMode) {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    const formAsyncToken = addressSheetAsyncToken;
    hideHeaderToggle();
    sheetEditingId = editingId ? Number(editingId) : null;
    if (openCartSheetCtx) {
      openCartSheetCtx.addressBackMode = backMode || "cart";
    }

    const get = (k) => addressFormView.querySelector(`[data-a="${k}"]`);
    const setVal = (k, v) => {
      const el = get(k);
      if (el) el.value = str(v || "");
    };

    // ensure stores loaded then populate city
    await ensureStoresLoaded();
    if (formAsyncToken !== addressSheetAsyncToken || !window.AppModal || typeof window.AppModal.isOpen !== "function" || !window.AppModal.isOpen()) {
      return;
    }
    populateCitySelect(get("city"), prefill?.city);

    setVal("street", prefill?.street);
    setVal("house", prefill?.house);
    setVal("entrance", prefill?.entrance);
    setVal("floor", prefill?.floor);
    setVal("apartment", prefill?.apartment);
    setVal("comment", prefill?.comment);

    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.remove("hidden");
    addressListView.classList.add("hidden");
    addressFormView.classList.remove("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      if (elMobileAddressSaveBtn) {
        elMobileAddressSaveBtn.onclick = () => {
          const saveBtn = get("save");
          if (saveBtn) saveBtn.click();
        };
      }
      if (elMobileAddressCancelBtn) {
        elMobileAddressCancelBtn.onclick = () => {
          const cancelBtn = get("cancel");
          if (cancelBtn) cancelBtn.click();
        };
      }
    }

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");
    setSheetHeaderMode("cart");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'addressForm';
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showSheetAddressForm");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showSheetAddressForm");
    }

    setTimeout(() => {
      try { get("street")?.focus?.(); } catch {}
    }, 0);
  }

  function showSheetProduct(product, { cartKey, prefillItem, onBack } = {}) {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    hideHeaderToggle();
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    // Просмотр карточки товара — часть главной (каталог), подсвечиваем «Главная»
    if (typeof setActiveNav === "function") setActiveNav("menu");

    // product mode header: в†ђ/в™Ў, Г— скрыть, title скрыть
    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");
    
    // Определяем куда возвращаться при закрытии карточки:
    // - Если cartKey есть (из корзины) - вернуться в корзину
    // - Если cartKey нет (из каталога) - закрыть sheet и вернуться в каталог
    const resolvedOnBack = typeof onBack === "function"
      ? onBack
      : (cartKey ? showSheetCart : closeShopSheetIfOpen);
    
    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'product';
    sheetNavigationState.data = {
      cartKey: cartKey || null,
      customBackHandler: typeof onBack === "function" ? onBack : null,
    };
    
    setSheetHeaderMode("product", { onBack: resolvedOnBack });
    const canReuseProductView =
      openProductCtx &&
      Number(openProductCtx.productId || 0) > 0 &&
      Number(openProductCtx.productId || 0) === Number(product?.id || 0) &&
      openProductCtx.onBack === resolvedOnBack;
    if (!canReuseProductView) {
      renderProductDetailsInto(productWrap, product, { onBack: resolvedOnBack, cartKey, prefillItem });
    }
    
    // На мобильных: скрываем ботомщит активного заказа при открытии карточки товара
    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
  }

  function showSheetCombo(comboData, { cartKey, prefillItem, onBack } = {}) {
    invalidateAddressSheetUiState();
    cleanupCheckoutViewSubscriptions();
    hideHeaderToggle();
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    // Просмотр карточки комбо — часть главной (каталог), подсвечиваем «Главная»
    if (typeof setActiveNav === "function") setActiveNav("menu");

    // На мобилке скрываем футер корзины (Г— и «Оформить»), у комбо свой футер «в корзину» внутри контента
    const isMobileCombo = window.matchMedia("(max-width: 768px)").matches;
    if (isMobileCombo && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");

    const resolvedOnBack = typeof onBack === "function"
      ? onBack
      : (cartKey ? showSheetCart : closeShopSheetIfOpen);
    sheetNavigationState.type = "cart";
    sheetNavigationState.screen = "combo";
    sheetNavigationState.data = {
      cartKey: cartKey || null,
      customBackHandler: typeof onBack === "function" ? onBack : null,
    };

    const comboDiscount = Number(comboData.discount_percent) || 0;
    const comboBadge = comboDiscount ? `-${comboDiscount}%` : "";
    setSheetHeaderMode("product", { onBack: resolvedOnBack, discountBadge: comboBadge });
    const canReuseComboView =
      openProductCtx &&
      openProductCtx.type === "combo" &&
      Number(openProductCtx.comboId || 0) > 0 &&
      Number(openProductCtx.comboId || 0) === Number(comboData?.id || 0) &&
      openProductCtx.onBack === resolvedOnBack;
    if (!canReuseComboView) {
      renderComboDetailsInto(productWrap, comboData, { onBack: resolvedOnBack, cartKey, prefillItem });
    }

    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
  }

function renderSheetAddressList() {
  addressList.innerHTML = "";
  const token = getCustomerToken();
  const listData = (token ? state.addresses : []) || [];
  const local = !token && loadAddressDraft() ? [{ ...loadAddressDraft(), id: null, _local: true }] : [];
  const effectiveList = token ? listData : local;

  if (!effectiveList.length) {
    addressList.innerHTML = `<div class="muted">Адресов пока нет.</div>`;
    return;
  }

  // temporary selection state for radio
  let pendingAddress = state.selectedAddress || null;

  const updateRadios = () => {
    addressList.querySelectorAll(".shop-address-row").forEach((r) => {
      const rid = r.dataset.addrId;
      const isLocal = r.dataset.addrLocal === "1";
      const match = pendingAddress
        ? rid && pendingAddress.id
          ? Number(rid) === Number(pendingAddress.id)
          : isLocal && !!pendingAddress._local
        : false;
      r.classList.toggle("is-selected", match);
    });
  };

  effectiveList.forEach((a) => {
    const row = document.createElement("div");
    row.className = "shop-address-row";
    if (a.id) row.dataset.addrId = a.id;
    if (a._local) row.dataset.addrLocal = "1";

    const isSelected = state.selectedAddress
      ? a.id && state.selectedAddress.id
        ? Number(a.id) === Number(state.selectedAddress.id)
        : !!a._local && !!state.selectedAddress._local
      : false;
    if (isSelected) row.classList.add("is-selected");

    // radio
    const radio = document.createElement("div");
    radio.className = "shop-address-radio";
    row.appendChild(radio);

    const title = formatAddressLine(a);
    const sub = a.comment ? str(a.comment) : "";

    const card = document.createElement("div");
    card.className = "shop-address-card";

    const main = document.createElement("div");
    main.className = "shop-address-card-main";

    const titleEl = document.createElement("div");
    titleEl.className = "shop-address-card-title";
    titleEl.appendChild(document.createTextNode(title || ""));
    main.appendChild(titleEl);

    if (sub) {
      const subEl = document.createElement("div");
      subEl.className = "shop-address-card-sub";
      subEl.textContent = sub;
      main.appendChild(subEl);
    }

    const actions = document.createElement("div");
    actions.className = "shop-address-actions shop-address-actions--compact";

    // edit
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "shop-address-action-icon";
    btnEdit.innerHTML = `<i class="fas fa-pen"></i>`;
    btnEdit.addEventListener("click", (e) => {
      e.stopPropagation();
      const backMode = openCartSheetCtx?.addressBackMode || "cart";
      showSheetAddressForm(a, token ? a.id : null, backMode);
    });
    actions.appendChild(btnEdit);

    // delete
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "shop-address-action-icon is-danger";
    btnDel.title = "Удалить";
    btnDel.innerHTML = `<i class="fas fa-times"></i>`;
    attachDoubleDelete(btnDel, async () => {
      if (token && a.id) {
        try {
          await apiJson(`/api/public/me/addresses/${a.id}`, { method: "DELETE" });
          await refreshAddressState({ force: true });
          renderSheetAddressList();
        } catch (err) {
          alert("Не удалось удалить адрес");
        }
        return;
      }
      clearAddressDraft();
      setSelectedAddress(null);
      renderSheetAddressList();
    });
    actions.appendChild(btnDel);

    card.appendChild(main);
    card.appendChild(actions);
    row.appendChild(card);

    // select radio on click
    row.addEventListener("click", () => {
      pendingAddress = a;
      updateRadios();
    });

    addressList.appendChild(row);
  });

  // confirm button
  const elConfirmBar = document.getElementById("shopMobileAddressConfirm");
  const elConfirmBtn = document.getElementById("shopMobileAddressConfirmBtn");
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile && elConfirmBar && isAddressSheetListActive("delivery")) {
    setAddressSheetBodyState(true);
    elConfirmBar.classList.remove("hidden");
  }
  if (elConfirmBtn) {
    elConfirmBtn.textContent = "Доставить сюда";
    elConfirmBtn.onclick = async () => {
      if (!pendingAddress) return;
      if (token && pendingAddress.id) {
        try {
          await apiJson(`/api/public/me/addresses/${pendingAddress.id}/default`, { method: "PUT" });
          await refreshAddressState({ force: true });
          updateAddressChip();
        } catch (e) {
          alert("Не удалось выбрать адрес");
          return;
        }
      } else {
        setSelectedAddress({ ...pendingAddress, _local: true });
        syncSelectedAddressToCheckoutDraft();
        updateAddressChip();
      }
      // Set delivery mode
      window._deliveryMode = "delivery";
      const d = loadCheckoutDraft();
      d.method_code = "delivery";
      d.method_user_selected = true;
      saveCheckoutDraft(d);
      updateHeaderAddressWidget();
      const mode = openCartSheetCtx?.addressBackMode;
      if (mode === "header") return closeShopSheetIfOpen();
      if (mode === "profile") return returnToProfileFromSheet();
      if (mode === "checkout") return showSheetCheckout();
      return showSheetCart();
    };
  }
}

  // --- Delivery / Pickup toggle: header helpers ---
  function showHeaderToggle() {
    const header = document.querySelector(".app-modal-header");
    if (!header) return;
    const titleEl = header.querySelector(".app-modal-title");
    if (titleEl) titleEl.classList.add("hidden");
    // Insert toggle into header (before actions/close btn)
    if (!header.contains(deliveryToggleWrap)) {
      const actions = header.querySelector(".app-modal-actions");
      if (actions) header.insertBefore(deliveryToggleWrap, actions);
      else header.appendChild(deliveryToggleWrap);
    }
    deliveryToggleWrap.classList.remove("hidden");
  }

  function hideHeaderToggle() {
    deliveryToggleWrap.classList.add("hidden");
    // Move back out of header if needed
    if (deliveryToggleWrap.parentNode) {
      deliveryToggleWrap.remove();
    }
    const header = document.querySelector(".app-modal-header");
    if (header) {
      const titleEl = header.querySelector(".app-modal-title");
      if (titleEl) titleEl.classList.remove("hidden");
    }
  }

  // --- Delivery / Pickup toggle logic ---
  let activeToggleMode = "delivery";

  function setToggleMode(mode) {
    invalidateAddressSheetUiState();
    activeToggleMode = mode;
    toggleDeliveryBtn.classList.toggle("is-active", mode === "delivery");
    togglePickupBtn.classList.toggle("is-active", mode === "pickup");

    const elConfirmBtn = document.getElementById("shopMobileAddressConfirmBtn");
    if (mode === "delivery") {
      addressListTop.classList.remove("hidden");
      addressList.classList.remove("hidden");
      pickupListTop.classList.add("hidden");
      pickupInlineList.classList.add("hidden");
      if (elConfirmBtn) elConfirmBtn.textContent = "Доставить сюда";
      renderSheetAddressList();
    } else {
      addressListTop.classList.add("hidden");
      addressList.classList.add("hidden");
      pickupListTop.classList.remove("hidden");
      pickupInlineList.classList.remove("hidden");
      if (elConfirmBtn) elConfirmBtn.textContent = "Заказать здесь";
      renderInlinePickupList();
    }
  }

  toggleDeliveryBtn.addEventListener("click", () => setToggleMode("delivery"));
  togglePickupBtn.addEventListener("click", () => setToggleMode("pickup"));

  // --- Pickup card helpers ---
  function cleanPhone(raw) {
    return (raw || "").replace(/[^\d+]/g, "").replace(/^8/, "+7").replace(/^7/, "+7");
  }
  function formatPhone(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    // expect 11 digits: 7XXXXXXXXXX or 8XXXXXXXXXX
    const d = digits.length === 11 ? digits : (digits.length === 10 ? "7" + digits : digits);
    if (d.length === 11) {
      return `+${d[0]} ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9,11)}`;
    }
    return raw;
  }
  function getStoreTodayHoursRange(storeHours, timezone) {
    if (!Array.isArray(storeHours) || !storeHours.length) return "";
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = storeHours.find(h => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return "";
    const opens = entry.opens_at ? entry.opens_at.slice(0, 5) : "";
    const closes = entry.closes_at ? entry.closes_at.slice(0, 5) : "";
    if (opens && closes) return `${opens} - ${closes}`;
    return "";
  }
  function getStoreStatusInfo(store) {
    if (!Array.isArray(store.storeHours) || !store.storeHours.length) return null;
    const tz = Number.isNaN(Number(store.timezone)) ? 0 : Number(store.timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + tz * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = store.storeHours.find(h => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return { open: false, text: "Закрыто — выходной" };
    const opens = entry.opens_at ? entry.opens_at.slice(0, 5) : "";
    const closes = entry.closes_at ? entry.closes_at.slice(0, 5) : "";
    if (!opens || !closes) return null;
    const hhmm = localDate.getHours() * 60 + localDate.getMinutes();
    const [oh, om] = opens.split(":").map(Number);
    const [ch, cm] = closes.split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    if (hhmm >= openMin && hhmm < closeMin) {
      return { open: true, text: `Открыто до ${closes}` };
    }
    return { open: false, text: `Закрыто до ${opens}` };
  }

  let mobileSelectedPickupCity = null;

  function initMobilePickupCitySelector() {
    const chip = pickupListTop.querySelector(".chip-city");
    const dropdown = pickupListTop.querySelector(".chip-city-dropdown");
    const chipText = pickupListTop.querySelector(".chip-city-text");
    if (!chip || !dropdown || !chipText) return;

    const allStores = window._pickupStores || [];
    const cities = [...new Set(allStores.map(s => s.city).filter(Boolean))].sort();

    const updateChipText = () => {
      chipText.textContent = mobileSelectedPickupCity || "Все города";
    };

    dropdown.innerHTML = "";

    // "All cities" option
    const allOption = document.createElement("button");
    allOption.type = "button";
    allOption.className = "chip-city-option" + (!mobileSelectedPickupCity ? " is-selected" : "");
    allOption.textContent = "Все города";
    allOption.addEventListener("click", (e) => {
      e.stopPropagation();
      mobileSelectedPickupCity = null;
      updateChipText();
      dropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
      allOption.classList.add("is-selected");
      dropdown.classList.add("hidden");
      chip.classList.remove("is-open");
      renderInlinePickupList();
    });
    dropdown.appendChild(allOption);

    cities.forEach(city => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "chip-city-option" + (city === mobileSelectedPickupCity ? " is-selected" : "");
      opt.textContent = city;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        mobileSelectedPickupCity = city;
        updateChipText();
        dropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        dropdown.classList.add("hidden");
        chip.classList.remove("is-open");
        renderInlinePickupList();
      });
      dropdown.appendChild(opt);
    });

    updateChipText();

    chip.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains("hidden");
      dropdown.classList.toggle("hidden", isOpen);
      chip.classList.toggle("is-open", !isOpen);
    };

    const selectorEl = pickupListTop.querySelector(".shop-pickup-city-selector");
    const closeHandler = (e) => {
      if (selectorEl && !selectorEl.contains(e.target)) {
        dropdown.classList.add("hidden");
        chip.classList.remove("is-open");
      }
    };
    if (selectorEl) {
      document.removeEventListener("click", selectorEl._closeHandler);
      selectorEl._closeHandler = closeHandler;
      document.addEventListener("click", closeHandler);
    }
  }

  async function renderInlinePickupList() {
    const pickupAsyncToken = ++addressSheetAsyncToken;
    pickupInlineList.innerHTML = "";
    await ensureStoresLoaded();
    if (!isAddressSheetAsyncStateValid(pickupAsyncToken, "pickup")) {
      return;
    }

    // Initialize city selector
    initMobilePickupCitySelector();

    const allStores = window._pickupStores || [];

    // Filter by selected city
    const stores = mobileSelectedPickupCity
      ? allStores.filter(s => s.city === mobileSelectedPickupCity)
      : allStores;

    if (!stores.length) {
      pickupInlineList.innerHTML = mobileSelectedPickupCity
        ? `<div class="muted" style="padding:16px">Нет точек самовывоза в городе ${mobileSelectedPickupCity}.</div>`
        : `<div class="muted" style="padding:16px">Нет доступных точек самовывоза.</div>`;
      return;
    }

    let pendingPickupStoreId = ensureValidSelectedPickupStoreId(stores);

    const updatePickupRadios = () => {
      pickupInlineList.querySelectorAll(".shop-address-row").forEach((r) => {
        const sid = r.dataset.storeId;
        r.classList.toggle("is-selected", sid && pendingPickupStoreId && Number(sid) === Number(pendingPickupStoreId));
      });
    };

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row shop-pickup-inline-row";
      row.dataset.storeId = store.id;

      const isSelected = pendingPickupStoreId && Number(store.id) === Number(pendingPickupStoreId);
      if (isSelected) row.classList.add("is-selected");
      if (store.isOpen === false) row.classList.add("is-closed");

      // radio
      const radio = document.createElement("div");
      radio.className = "shop-address-radio";
      row.appendChild(radio);

      const fullAddress = store.address || store.name || "Точка #" + store.id;

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      // City (small muted above address)
      if (store.city) {
        const cityEl = document.createElement("div");
        cityEl.className = "shop-pickup-city";
        cityEl.textContent = store.city;
        main.appendChild(cityEl);
      }

      // Address (bold, larger)
      const addrEl = document.createElement("div");
      addrEl.className = "shop-pickup-address";
      addrEl.textContent = fullAddress;
      main.appendChild(addrEl);

      // Open/closed status
      const statusInfo = getStoreStatusInfo(store);
      if (statusInfo) {
        const statusEl = document.createElement("div");
        statusEl.className = "shop-pickup-status " + (statusInfo.open ? "is-open" : "is-closed");
        statusEl.textContent = statusInfo.text;
        main.appendChild(statusEl);
      }

      // Work hours
      const hoursRange = getStoreTodayHoursRange(store.storeHours, store.timezone);
      if (hoursRange) {
        const hoursRow = document.createElement("div");
        hoursRow.className = "shop-pickup-info-row";
        hoursRow.innerHTML = `<span class="shop-pickup-info-label">Время работы</span><span class="shop-pickup-info-value">${hoursRange}</span>`;
        main.appendChild(hoursRow);
      }

      // Phone
      if (store.phone) {
        const phoneRow = document.createElement("div");
        phoneRow.className = "shop-pickup-info-row";
        const formatted = formatPhone(store.phone);
        phoneRow.innerHTML = `<span class="shop-pickup-info-label">Телефон</span><a href="tel:${cleanPhone(store.phone)}" class="shop-pickup-phone-link">${formatted}</a>`;
        phoneRow.querySelector("a").addEventListener("click", (e) => e.stopPropagation());
        main.appendChild(phoneRow);
      }

      card.appendChild(main);
      row.appendChild(card);

      row.addEventListener("click", () => {
        pendingPickupStoreId = Number(store.id);
        updatePickupRadios();
      });

      pickupInlineList.appendChild(row);
    });

    // Show confirm bar with "Заказать здесь"
    const elConfirmBar = document.getElementById("shopMobileAddressConfirm");
    const elConfirmBtn = document.getElementById("shopMobileAddressConfirmBtn");
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elConfirmBar && isAddressSheetAsyncStateValid(pickupAsyncToken, "pickup")) {
      setAddressSheetBodyState(true);
      elConfirmBar.classList.remove("hidden");
    }
    if (elConfirmBtn) {
      elConfirmBtn.textContent = "Заказать здесь";
      elConfirmBtn.onclick = () => {
        if (!pendingPickupStoreId) return;
        window._selectedPickupStoreId = Number(pendingPickupStoreId);
        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }
        // Save delivery mode as pickup
        window._deliveryMode = "pickup";
        // Update checkout draft
        const d = loadCheckoutDraft();
        d.method_code = "takeaway";
        d.method_user_selected = true;
        d.pickup_store_id = Number(pendingPickupStoreId);
        saveCheckoutDraft(d);
        // Update header
        updateHeaderAddressWidget();
        // Navigate back
        const mode = openCartSheetCtx?.addressBackMode;
        if (mode === "header") return closeShopSheetIfOpen();
        if (mode === "profile") return returnToProfileFromSheet();
        if (mode === "checkout") return showSheetCheckout();
        return showSheetCart();
      };
    }
  }

  // events
  btn.addEventListener("click", async () => {
    const authorized = await requireAuthForCheckout({ isSheet: true });
    if (!authorized) return;
    await refreshAddressState();
    // pickup mode — go directly to checkout (no delivery address needed)
    if (window._deliveryMode === "pickup" && window._selectedPickupStoreId) {
      showSheetCheckout();
    } else if (getSelectedAddressLine()) {
      showSheetCheckout();
    } else {
      showSheetAddressList();
    }
  });

  backBtn.addEventListener("click", () => showSheetCart());

  addressNewBtn.addEventListener("click", () => {
    const backMode = openCartSheetCtx?.addressBackMode || "cart";
    showSheetAddressForm(null, null, backMode);
  });

  const formGet = (k) => addressFormView.querySelector(`[data-a="${k}"]`);
  const saveBtn = formGet("save");
  const cancelBtn = formGet("cancel");

  cancelBtn?.addEventListener("click", () => {
    if (openCartSheetCtx?.addressBackMode === "profile") {
      returnToProfileFromSheet();
      return;
    }
    showSheetAddressList();
  });

  saveBtn?.addEventListener("click", async () => {
    const payload = normalizeAddressPayload({
      city: formGet("city")?.dataset?.value || "",
      street: formGet("street")?.value,
      house: formGet("house")?.value,
      entrance: formGet("entrance")?.value,
      floor: formGet("floor")?.value,
      apartment: formGet("apartment")?.value,
      comment: formGet("comment")?.value,
    });

    if (!payload.street) return alert("Укажите улицу");
    if (!payload.house) return alert("Укажите дом");

    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняем…";

    try {
      const me = await fetchMeSafe();
      const token = getCustomerToken();

      if (me && token) {
        if (sheetEditingId) {
          await apiJson(`/api/public/me/addresses/${sheetEditingId}`, { method: "PUT", body: payload });
        } else {
          await apiJson("/api/public/me/addresses", { method: "POST", body: { ...payload, is_default: 1 } });
        }
        await refreshAddressState({ force: true });
      } else {
        // guest
        saveAddressDraft(payload);
        setSelectedAddress({ ...payload, _local: true });
      }

      syncSelectedAddressToCheckoutDraft();
      updateAddressChip();
      const backMode = openCartSheetCtx?.addressBackMode || "cart";
      if (backMode === "profile") {
        returnToProfileFromSheet();
      } else if (backMode === "checkout") {
        showSheetCheckout();
      } else if (backMode === "header") {
        showSheetAddressList("header");
      } else {
        showSheetCart();
      }
    } catch (e) {
      console.error(e);
      alert("Не удалось сохранить адрес");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Сохранить";
    }
  });

  // стартовое состояние шита
  showSheetCart();
}

  // -----------------------------
  // Profile: login + cabinet
  // -----------------------------
  function enforcePhonePrefix(inp) {
    const selStart = inp.selectionStart;
    const v = str(inp.value);
    let digits = v.replace(/[^\d]/g, "");
    if (!digits.length) {
      inp.value = "+7";
      if (typeof inp.setSelectionRange === "function") {
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
      return;
    }
    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (!digits.startsWith("7")) digits = "7" + digits;
    digits = digits.slice(0, 11);

    let mask = "+7";
    const rest = digits.slice(1); // без ведущей 7
    if (rest.length > 0) mask += " (" + rest.slice(0, 3);
    if (rest.length >= 4) mask += ") " + rest.slice(3, 6);
    if (rest.length >= 7) mask += "-" + rest.slice(6, 8);
    if (rest.length >= 9) mask += "-" + rest.slice(8, 10);

    inp.value = mask;

    // восстановим курсор в конец если он был в конце
    if (selStart >= v.length) {
      inp.selectionStart = inp.selectionEnd = mask.length;
    }
  }

  function normalizeBirthdayInput(raw) {
    const digits = str(raw).replace(/[^\d]/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + "." + digits.slice(2);
    return digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4);
  }

  function calcBirthdayCaret(value, digitsBefore) {
    if (!Number.isFinite(digitsBefore)) return value.length;
    let digits = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (/\d/.test(value[i])) digits += 1;
      if (digits >= digitsBefore) return i + 1;
    }
    return value.length;
  }

  function isValidBirthday(value) {
    const v = str(value).trim();
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return false;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (yyyy < 1900 || yyyy > 2100) return false;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
  }

  function handleBirthdayInput(inp) {
    const start = inp.selectionStart;
    const digitsBefore = Number.isFinite(start)
      ? str(inp.value).slice(0, start).replace(/[^\d]/g, "").length
      : null;
    const next = normalizeBirthdayInput(inp.value);
    inp.value = next;
    if (typeof inp.setSelectionRange === "function") {
      const pos = calcBirthdayCaret(next, digitsBefore ?? next.replace(/[^\d]/g, "").length);
      inp.setSelectionRange(pos, pos);
    }
  }

  async function fetchMeSafe(opts = {}) {
    const force = !!opts?.force;
    const token = getCustomerToken();
    if (!token) return null;
    const cached = !force ? getCustomerCache() : null;
    if (cached) return cached;
    try {
      const boot = await apiJson("/api/public/me/bootstrap");
      const payload = boot?.data || {};
      if (payload.customer) {
        setCustomerCache(payload.customer);
        if (Array.isArray(payload.addresses)) {
          state.addresses = payload.addresses;
        }
        return payload.customer;
      }
      const json = await apiJson("/api/public/me");
      if (!json.customer) return null;
      setCustomerCache(json.customer);
      return json.customer;
    } catch (e) {
      if (String(e.message || "").includes("UNAUTHORIZED")) {
        clearCustomer();
        return null;
      }
      return null;
    }
  }

  function getGuestChatClientIdForAuth() {
    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : 0;
      if (!Number.isFinite(tenantId) || tenantId <= 0) return 0;
      const raw = localStorage.getItem(`shop_company_chat_guest_id_t${tenantId}`);
      const clientId = Number(raw || 0);
      return Number.isFinite(clientId) && clientId > 0 ? Math.trunc(clientId) : 0;
    } catch {
      return 0;
    }
  }

  function buildLoginContent({ onSuccess }) {
    const wrap = document.createElement("div");
    wrap.className = "shop-auth";

    const note = document.createElement("div");
    note.className = "shop-auth-text muted";
    note.textContent = "Введите телефон.";
    wrap.appendChild(note);

    const form = document.createElement("div");
    form.className = "shop-auth-form";

    const phoneLabel = document.createElement("label");
    phoneLabel.className = "field-label";
    phoneLabel.textContent = "Телефон";
    const phone = document.createElement("input");
    phone.className = "control";
    phone.type = "tel";
    phone.value = "+7";
    phone.placeholder = "+7 (999) 999-99-99";
    form.appendChild(phoneLabel);
    form.appendChild(phone);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-primary";
    nextBtn.style.width = "100%";
    nextBtn.textContent = "Продолжить";
    form.appendChild(nextBtn);

    const maxLoginBtn = document.createElement("button");
    maxLoginBtn.type = "button";
    maxLoginBtn.className = "shop-auth-social-btn shop-auth-social-btn--max";
    maxLoginBtn.style.display = "none";
    maxLoginBtn.setAttribute("aria-label", "Войти через MAX");
    const maxIcon = document.createElement("img");
    maxIcon.src = "/static/uploads/auth/max-auth.png";
    maxIcon.alt = "MAX";
    maxLoginBtn.appendChild(maxIcon);

    const tgLoginBtn = document.createElement("button");
    tgLoginBtn.type = "button";
    tgLoginBtn.className = "shop-auth-social-btn shop-auth-social-btn--telegram";
    tgLoginBtn.style.display = "none";
    tgLoginBtn.setAttribute("aria-label", "Войти через Telegram");
    const tgIcon = document.createElement("img");
    tgIcon.src = "/static/uploads/auth/telegram-auth.png";
    tgIcon.alt = "Telegram";
    tgLoginBtn.appendChild(tgIcon);

    const socialRow = document.createElement("div");
    socialRow.className = "shop-auth-social-row";
    socialRow.appendChild(maxLoginBtn);
    socialRow.appendChild(tgLoginBtn);

    (async function syncMaxLoginButtonVisibility() {
      try {
        const probe = await apiJson("/api/public/max/auth-link");
        const hasLink = !!(probe && probe.ok !== false && probe.link);
        maxLoginBtn.style.display = hasLink ? "" : "none";
        socialRow.style.display = (maxLoginBtn.style.display !== "none" || tgLoginBtn.style.display !== "none") ? "" : "none";
      } catch {
        maxLoginBtn.style.display = "none";
        socialRow.style.display = (maxLoginBtn.style.display !== "none" || tgLoginBtn.style.display !== "none") ? "" : "none";
      }
    })();

    (async function syncTgLoginButtonVisibility() {
      try {
        const probe = await apiJson("/api/public/tg/auth-link");
        const hasLink = !!(probe && probe.ok !== false && probe.link);
        tgLoginBtn.style.display = hasLink ? "" : "none";
        socialRow.style.display = (maxLoginBtn.style.display !== "none" || tgLoginBtn.style.display !== "none") ? "" : "none";
      } catch {
        tgLoginBtn.style.display = "none";
        socialRow.style.display = (maxLoginBtn.style.display !== "none" || tgLoginBtn.style.display !== "none") ? "" : "none";
      }
    })();

    const bWrap = document.createElement("div");
    bWrap.style.display = "none";
    bWrap.style.gap = "16px";

    const bLabel = document.createElement("label");
    bLabel.className = "field-label";
    bLabel.textContent = "Дата рождения";
    const bdayInputWrap = document.createElement("div");
    bdayInputWrap.className = "shop-auth-bday-input-wrap";
    const bday = document.createElement("input");
    bday.className = "control";
    bday.type = "text";
    bday.placeholder = "дд.мм.гггг";
    bday.inputMode = "numeric";
    const bdayInfoBtn = document.createElement("button");
    bdayInfoBtn.type = "button";
    bdayInfoBtn.className = "shop-auth-bday-info-btn";
    bdayInfoBtn.setAttribute("aria-label", "Подсказка по дате рождения");
    bdayInfoBtn.innerHTML = '<i class="fas fa-info"></i>';
    const bdayInfoHint = document.createElement("div");
    bdayInfoHint.className = "shop-auth-bday-info-hint hidden";
    bdayInfoHint.textContent = "Дата рождения используется как пароль для входа в учетную запись.";
    const codeWrap = document.createElement("div");
    codeWrap.className = "shop-auth-code-wrap hidden";
    const codeInputs = [];
    for (let i = 0; i < 4; i += 1) {
      const codeCell = document.createElement("input");
      codeCell.type = "text";
      codeCell.inputMode = "numeric";
      codeCell.maxLength = 1;
      codeCell.className = "shop-auth-code-cell";
      codeCell.autocomplete = i === 0 ? "one-time-code" : "off";
      codeInputs.push(codeCell);
      codeWrap.appendChild(codeCell);
    }
    bdayInputWrap.appendChild(bday);
    bdayInputWrap.appendChild(bdayInfoBtn);
    bdayInputWrap.appendChild(codeWrap);
    bdayInputWrap.appendChild(bdayInfoHint);
    bWrap.appendChild(bLabel);
    bWrap.appendChild(bdayInputWrap);


    const bdayError = document.createElement("div");
    bdayError.className = "shop-auth-error hidden";
    bWrap.appendChild(bdayError);

    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.className = "btn btn-primary";
    loginBtn.style.width = "100%";
    loginBtn.textContent = "Войти";
    bWrap.appendChild(loginBtn);

    form.appendChild(bWrap);
    form.appendChild(socialRow);
    wrap.appendChild(form);

    let authStepMode = "birthday";
    const clearCodeInputs = () => codeInputs.forEach((cell) => { cell.value = ""; });
    const getCodeValue = () => codeInputs.map((cell) => String(cell.value || "").replace(/\D/g, "")).join("");
    const focusCodeIndex = (index) => {
      const safe = Math.max(0, Math.min(codeInputs.length - 1, Number(index) || 0));
      if (codeInputs[safe]) codeInputs[safe].focus();
    };

    const setBirthdayStepUi = () => {
      authStepMode = "birthday";
      note.textContent = "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f (\u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433).";
      bLabel.textContent = "\u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f";
      bday.placeholder = "\u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433";
      bday.inputMode = "numeric";
      bday.maxLength = 10;
      bday.value = "";
      bday.style.display = "";
      bdayInfoBtn.classList.remove("hidden");
      codeWrap.classList.add("hidden");
      bdayInfoHint.classList.add("hidden");
      clearCodeInputs();
      setBirthdayError("");
    };

    const setCodeStepUi = () => {
      authStepMode = "code";
      note.textContent = "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438\u0437 \u0431\u043e\u0442\u0430.";
      bLabel.textContent = "\u041a\u043e\u0434 \u0438\u0437 \u0431\u043e\u0442\u0430";
      bday.placeholder = "1234";
      bday.inputMode = "numeric";
      bday.maxLength = 4;
      bday.value = "";
      bday.style.display = "none";
      bdayInfoBtn.classList.add("hidden");
      codeWrap.classList.remove("hidden");
      bdayInfoHint.classList.add("hidden");
      clearCodeInputs();
      setBirthdayError("");
    };

    const revealSecondStep = () => {
      if (nextBtn.style.display === "none") return;
      nextBtn.style.display = "none";
      bWrap.style.display = "grid";
      if (authStepMode === "code") focusCodeIndex(0);
      else bday.focus();
    };
    const checkPhoneStatus = async () => {
      const json = await apiJson("/api/public/auth/phone-status", {
        method: "POST",
        body: { phone: phone.value },
        headers: { "x-customer-token": "" },
      });
      return {
        exists: Boolean(json && json.exists),
        requiresMessengerLogin: Boolean(json && json.requires_messenger_login),
      };
    };
    let autoContinueLockPhone = "";
    phone.addEventListener("input", () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (n && n.length === 11 && n.startsWith("7")) {
        if (nextBtn.style.display !== "none" && !nextBtn.disabled && autoContinueLockPhone !== n) {
          autoContinueLockPhone = n;
          nextBtn.click();
        }
      } else {
        autoContinueLockPhone = "";
      }
    });
    phone.addEventListener("focus", () => enforcePhonePrefix(phone));

    const setBirthdayError = (msg) => {
      bdayError.textContent = msg || "";
      bdayError.classList.toggle("hidden", !msg);
      bday.classList.toggle("is-invalid", !!msg);
    };

    const normalizeBirthdayField = () => {
      if (authStepMode === "birthday") {
        handleBirthdayInput(bday);
        if (isValidBirthday(bday.value) && !loginBtn.disabled) {
          loginBtn.click();
        }
      } else {
        bday.value = String(bday.value || "").replace(/\D/g, "").slice(0, 4);
      }
      setBirthdayError("");
    };

    bday.addEventListener("input", normalizeBirthdayField);
    bday.addEventListener("change", normalizeBirthdayField);
    bday.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!loginBtn.disabled) loginBtn.click();
    });
    bday.addEventListener("blur", () => {
      if (!str(bday.value).trim()) return;
      if (authStepMode === "birthday") {
        if (!isValidBirthday(bday.value)) {
          setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 \u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433");
        }
      } else if (getCodeValue().length !== 4) {
        setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 4-\u0437\u043d\u0430\u0447\u043d\u044b\u0439 \u043a\u043e\u0434");
      }
    });
    codeInputs.forEach((cell, idx) => {
      cell.addEventListener("input", () => {
        const digit = String(cell.value || "").replace(/\D/g, "").slice(-1);
        cell.value = digit;
        setBirthdayError("");
        if (digit && idx < codeInputs.length - 1) focusCodeIndex(idx + 1);
        if (getCodeValue().length === 4 && authStepMode === "code" && !loginBtn.disabled) {
          loginBtn.click();
        }
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          if (!cell.value && idx > 0) {
            e.preventDefault();
            codeInputs[idx - 1].value = "";
            focusCodeIndex(idx - 1);
          }
          return;
        }
        if (e.key === "ArrowLeft" && idx > 0) {
          e.preventDefault();
          focusCodeIndex(idx - 1);
        } else if (e.key === "ArrowRight" && idx < codeInputs.length - 1) {
          e.preventDefault();
          focusCodeIndex(idx + 1);
        } else if (e.key === "Enter" && !loginBtn.disabled) {
          e.preventDefault();
          loginBtn.click();
        }
      });
      cell.addEventListener("paste", (e) => {
        const text = String(e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (!text) return;
        e.preventDefault();
        clearCodeInputs();
        text.split("").forEach((ch, p) => {
          if (codeInputs[p]) codeInputs[p].value = ch;
        });
        focusCodeIndex(Math.min(text.length, 3));
        if (text.length === 4 && authStepMode === "code" && !loginBtn.disabled) {
          loginBtn.click();
        }
      });
    });


    nextBtn.addEventListener("click", async () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        alert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d (\u0420\u0424): +7XXXXXXXXXX");
        return;
      }
      nextBtn.disabled = true;
      try {
        const status = await checkPhoneStatus();
        if (status.requiresMessengerLogin) {
          setCodeStepUi();
          revealSecondStep();
          await apiJson("/api/public/auth/messenger-code/send", {
            method: "POST",
            body: { phone: phone.value },
            headers: { "x-customer-token": "" },
          });
          return;
        }
        setBirthdayStepUi();
        revealSecondStep();
      } catch (e) {
        const err = String(e && e.message ? e.message : "");
        if (err === "MESSENGER_NOT_LINKED") alert("\u041d\u043e\u043c\u0435\u0440 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d, \u043d\u043e \u0431\u043e\u0442 \u043d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d");
        else alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441 \u0432\u0445\u043e\u0434\u0430");
      } finally {
        if (nextBtn.style.display !== "none") nextBtn.disabled = false;
      }
    });

    maxLoginBtn.addEventListener("click", async () => {
      maxLoginBtn.disabled = true;
      maxLoginBtn.classList.add("is-loading");
      try {
        const json = await apiJson("/api/public/max/auth-link");
        if (!json || json.ok === false || !json.link) {
          const errCode = json && json.error ? String(json.error) : "";
          if (errCode === "MAX_LOGIN_DISABLED") {
            alert("MAX login is disabled for this site");
          } else if (errCode === "MAX_BOT_NOT_CONFIGURED") {
            alert("Бот MAX не настроен для этого сайта");
          } else {
            alert("Не удалось открыть вход через MAX");
          }
          return;
        }
        const opened = window.open(String(json.link), "_blank", "noopener,noreferrer");
        if (!opened) return;
      } catch {
        alert("Ошибка при открытии MAX");
      } finally {
        maxLoginBtn.disabled = false;
        maxLoginBtn.classList.remove("is-loading");
      }
    });

    tgLoginBtn.addEventListener("click", async () => {
      tgLoginBtn.disabled = true;
      tgLoginBtn.classList.add("is-loading");
      try {
        const json = await apiJson("/api/public/tg/auth-link");
        if (!json || json.ok === false || !json.link) {
          const errCode = json && json.error ? String(json.error) : "";
          if (errCode === "TG_BOT_NOT_CONFIGURED") {
            alert("\u0411\u043e\u0442 Telegram \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430");
          } else {
            alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u0445\u043e\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram");
          }
          return;
        }
        const opened = window.open(String(json.link), "_blank", "noopener,noreferrer");
        if (!opened) return;
      } catch {
        alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u0438 Telegram");
      } finally {
        tgLoginBtn.disabled = false;
        tgLoginBtn.classList.remove("is-loading");
      }
    });

    bdayInfoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      bdayInfoHint.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!bdayInputWrap.contains(e.target)) bdayInfoHint.classList.add("hidden");
    });

    loginBtn.addEventListener("click", async () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        alert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d (\u0420\u0424): +7XXXXXXXXXX");
        return;
      }
      if (authStepMode === "birthday") {
        if (!isValidBirthday(bday.value)) {
          setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 \u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433");
          return;
        }
      } else {
        const code = getCodeValue().slice(0, 4);
        if (code.length !== 4) {
          setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 4-\u0437\u043d\u0430\u0447\u043d\u044b\u0439 \u043a\u043e\u0434");
          return;
        }
      }

      loginBtn.disabled = true;
      loginBtn.textContent = "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c...";

      try {
        let json = null;
        const guestChatClientId = getGuestChatClientIdForAuth();
        if (authStepMode === "birthday") {
          json = await apiJson("/api/public/auth/login", {
            method: "POST",
            body: {
              phone: phone.value,
              birthday: str(bday.value).trim(),
              chat_guest_client_id: guestChatClientId,
            },
            headers: { "x-customer-token": "" },
          });
        } else {
          json = await apiJson("/api/public/auth/messenger-code/verify", {
            method: "POST",
            body: {
              phone: phone.value,
              code: getCodeValue().slice(0, 4),
              chat_guest_client_id: guestChatClientId,
            },
            headers: { "x-customer-token": "" },
          });
        }

        if (json.token) setCustomerToken(json.token);
        if (json.customer) setCustomerCache(json.customer);

        const me = await fetchMeSafe();
        await refreshAddressState();
        if (me) {
          if (typeof onSuccess === "function") onSuccess(me);
        } else {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438");
        }
      } catch (e) {
        console.error(e);
        const err = String(e.message || "");
        if (err === "WRONG_BIRTHDAY") {
          bday.value = "";
          setBirthdayError("");
          if (typeof showToast === "function") showToast("\u041d\u0435\u0432\u0435\u0440\u043d\u0430\u044f \u0434\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f");
          else alert("\u041d\u0435\u0432\u0435\u0440\u043d\u0430\u044f \u0434\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f");
        }
        else if (err === "MESSENGER_LOGIN_REQUIRED") alert("\u0414\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u043d\u043e\u043c\u0435\u0440\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0432\u0445\u043e\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram \u0438\u043b\u0438 MAX");
        else if (err === "CODE_INVALID") alert("\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043a\u043e\u0434");
        else if (err === "CODE_EXPIRED") alert("\u041a\u043e\u0434 \u0438\u0441\u0442\u0435\u043a, \u0437\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439");
        else alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0445\u043e\u0434\u0430: " + (e.message || "UNKNOWN"));
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "\u0412\u043e\u0439\u0442\u0438";
      }

    });


    return wrap;
  }

  function openLoginSheet({ onSuccess, fromCheckout = false } = {}) {
    if (!window.AppModal) return;
    const wrap = buildLoginContent({ onSuccess });
    setAppModalMode("shop");
    if (fromCheckout && openCartSheetCtx) {
      setCartSheetFooterMode(openCartSheetCtx, "hidden");
    }
    if (fromCheckout && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    // Помечаем как профильный шит, чтобы работали повторный клик и Android Back
    sheetNavigationState.type = 'profile';
    sheetNavigationState.screen = null;
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("openLoginSheet");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("openLoginSheet");
    }
    window.AppModal.open({
      title: "Вход",
      content: wrap,
      onClose: () => {
        if (fromCheckout && openCartSheetCtx) {
          const hasItems = cartItemsResolved().length > 0;
          setCartSheetFooterMode(openCartSheetCtx, hasItems ? "cart" : "hidden");
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
      },
    });
  }

  function getOrderItemLineTotal(item) {
    const lineTotal = Number(item?.line_total);
    if (Number.isFinite(lineTotal)) return roundPrice(lineTotal);
    const unitPrice = Number(item?.price || 0);
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    return roundPrice(unitPrice * qty);
  }

  function parseOrderDiscountsJson(order) {
    const raw = order?.discounts_json;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function buildOrderSummaryData(order) {
    const orderTotal = roundPrice(Number(order?.total_price || 0));
    const deliveryCost = roundPrice(Number(order?.delivery_cost || 0));
    const items = Array.isArray(order?.items) ? order.items : [];
    const discountsList = parseOrderDiscountsJson(order);

    let itemsTotalAfterItemDiscounts = 0;
    let comboDiscount = 0;
    let productDiscount = 0;
    let autoAddDiscount = 0;

    items.forEach((item) => {
      const lineTotal = getOrderItemLineTotal(item);
      itemsTotalAfterItemDiscounts += lineTotal;

      let originalLineTotal = lineTotal;
      const comboOldLineTotal = Number(item?.old_line_total || 0);
      const discountOriginalLineTotal = Number(item?.discount?.original_line_total || 0);
      const oldPrice = Number(item?.old_price || 0);
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const oldPriceLineTotal = oldPrice > 0 ? roundPrice(oldPrice * qty) : 0;

      if (String(item?.type || "") === "combo" && comboOldLineTotal > lineTotal) {
        originalLineTotal = comboOldLineTotal;
      } else if (discountOriginalLineTotal > lineTotal) {
        originalLineTotal = discountOriginalLineTotal;
      } else if (oldPriceLineTotal > lineTotal) {
        originalLineTotal = oldPriceLineTotal;
      }

      const lineDiscount = roundPrice(Math.max(0, originalLineTotal - lineTotal));
      if (!(lineDiscount > 0)) return;

      if (String(item?.type || "") === "combo") {
        comboDiscount += lineDiscount;
      } else if (Number(item?.auto_add || 0) === 1) {
        autoAddDiscount += lineDiscount;
      } else {
        productDiscount += lineDiscount;
      }
    });

    comboDiscount = roundPrice(comboDiscount);
    productDiscount = roundPrice(productDiscount);
    autoAddDiscount = roundPrice(autoAddDiscount);

    const itemsPayableAfterAllDiscounts = roundPrice(Math.max(0, orderTotal - deliveryCost));
    const customerOrderDiscount = roundPrice(Math.max(0, itemsTotalAfterItemDiscounts - itemsPayableAfterAllDiscounts));
    const itemLevelDiscount = roundPrice(comboDiscount + productDiscount + autoAddDiscount);
    const calculatedDiscount = roundPrice(itemLevelDiscount + customerOrderDiscount);
    const storedDiscount = roundPrice(Math.max(0, Number(order?.discount_amount || 0)));
    const totalDiscount = storedDiscount > calculatedDiscount ? storedDiscount : calculatedDiscount;
    const subtotalBeforeDiscounts = roundPrice(itemsPayableAfterAllDiscounts + totalDiscount);

    const orderDiscountTitles = [];
    discountsList.forEach((d) => {
      if (String(d?.apply_to || "").toLowerCase() !== "order") return;
      const title = str(d?.title || "").trim();
      if (title && !orderDiscountTitles.includes(title)) orderDiscountTitles.push(title);
    });

    const breakdown = [
      { title: "Комбо", amount: comboDiscount },
      { title: "Товарные скидки", amount: productDiscount },
      { title: "Автодобавление", amount: autoAddDiscount },
      { title: "Клиентская скидка", amount: customerOrderDiscount },
    ].filter((x) => Number(x.amount || 0) > 0);
    const breakdownTotal = roundPrice(breakdown.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const otherDiscount = roundPrice(Math.max(0, totalDiscount - breakdownTotal));
    if (otherDiscount > 0) breakdown.push({ title: "Прочие скидки", amount: otherDiscount });

    return {
      orderTotal,
      deliveryCost,
      subtotalBeforeDiscounts,
      discountAmount: totalDiscount,
      changeFrom: Number(order?.change_from || 0),
      paymentTitle: str(order?.payment_title || "").trim(),
      breakdown,
      orderDiscountTitles,
    };
  }

  function renderOrderSummaryBlock(order) {
    const summary = buildOrderSummaryData(order);
    const hasDiscount = summary.discountAmount > 0;
    const hasChange = summary.changeFrom > summary.orderTotal;
    const changeAmount = hasChange ? roundPrice(summary.changeFrom - summary.orderTotal) : 0;

    let html = `<div class="shop-order-details-section shop-order-summary">`;
    html += `<div class="shop-order-summary-title">Суммы:</div>`;

    if (summary.paymentTitle) {
      html += `<div class="shop-order-summary-row">`;
      html += `<span class="shop-order-summary-label">Оплата</span>`;
      html += `<span class="shop-order-summary-value">${escapeHtml(summary.paymentTitle)}</span>`;
      html += `</div>`;
    }

    if (hasChange) {
      html += `<div class="shop-order-summary-row">`;
      html += `<span class="shop-order-summary-label">Сдача с</span>`;
      html += `<span class="shop-order-summary-value">${money(summary.changeFrom)}</span>`;
      html += `</div>`;
      html += `<div class="shop-order-summary-row">`;
      html += `<span class="shop-order-summary-label">Сдача</span>`;
      html += `<span class="shop-order-summary-value">${money(changeAmount)}</span>`;
      html += `</div>`;
    }

    if (hasDiscount) {
      html += `<div class="shop-order-summary-row">`;
      html += `<span class="shop-order-summary-label">Сумма товаров</span>`;
      html += `<span class="shop-order-summary-value">${money(summary.subtotalBeforeDiscounts)}</span>`;
      html += `</div>`;

      const hasBreakdown = summary.breakdown.length > 0 || summary.orderDiscountTitles.length > 0;
      html += `<div class="shop-order-summary-row shop-order-summary-discount">`;
      if (hasBreakdown) {
        html += `<span class="shop-order-summary-discount-label-wrap">`;
        html += `<span class="shop-order-summary-label">Скидка</span>`;
        html += `<button type="button" class="shop-order-summary-discount-info-btn" data-order-discount-toggle aria-label="Показать расшифровку скидки" aria-expanded="false"><i class="fas fa-info"></i></button>`;
        html += `</span>`;
      } else {
        html += `<span class="shop-order-summary-label">Скидка</span>`;
      }
      html += `<span class="shop-order-summary-value shop-checkout-discount-value">-${money(summary.discountAmount)}</span>`;
      html += `</div>`;

      if (hasBreakdown) {
        html += `<div class="shop-order-summary-discount-breakdown" data-order-discount-breakdown aria-hidden="true">`;
        summary.breakdown.forEach((entry) => {
          html += `<div class="shop-order-summary-discount-breakdown-row">`;
          html += `<span class="shop-order-summary-discount-breakdown-label">${escapeHtml(entry.title)}</span>`;
          html += `<span class="shop-order-summary-discount-breakdown-value">-${money(entry.amount)}</span>`;
          html += `</div>`;
        });
        if (summary.orderDiscountTitles.length > 0) {
          html += `<div class="shop-order-summary-discount-breakdown-note">Скидка клиента: ${escapeHtml(summary.orderDiscountTitles.join(", "))}</div>`;
        }
        html += `</div>`;
      }
    }

    html += `<div class="shop-order-summary-row">`;
    html += `<span class="shop-order-summary-label">Доставка</span>`;
    html += `<span class="shop-order-summary-value">${money(summary.deliveryCost)}</span>`;
    html += `</div>`;

    html += `<div class="shop-order-summary-divider"></div>`;
    html += `<div class="shop-order-summary-total-row">`;
    html += `<span class="shop-order-summary-total-label">ИТОГО</span>`;
    html += `<span class="shop-order-summary-total-value">${money(summary.orderTotal)}</span>`;
    html += `</div>`;
    html += `<div class="shop-order-summary-thanks">Спасибо за заказ!</div>`;
    html += `</div>`;

    return html;
  }
  if (typeof window !== "undefined") {
    window.renderOrderSummaryBlock = renderOrderSummaryBlock;
  }

  function bindOrderSummaryDiscountToggles(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-order-discount-toggle]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const summary = btn.closest(".shop-order-summary");
        const breakdown = summary ? summary.querySelector("[data-order-discount-breakdown]") : null;
        if (!breakdown) return;
        const willOpen = !breakdown.classList.contains("is-open");
        breakdown.classList.toggle("is-open", willOpen);
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        breakdown.setAttribute("aria-hidden", willOpen ? "false" : "true");
      });
    });
  }
  if (typeof window !== "undefined") {
    window.bindOrderSummaryDiscountToggles = bindOrderSummaryDiscountToggles;
  }

  function hideMobileOrderDetailsActions() {
    if (window.__shopOrderRepeatOutsideHandler) {
      document.removeEventListener("pointerdown", window.__shopOrderRepeatOutsideHandler, true);
      window.__shopOrderRepeatOutsideHandler = null;
    }
    if (elMobileOrderDetailsActions) {
      elMobileOrderDetailsActions.classList.add("hidden");
    }
    if (elMobileOrderRepeatBtn) {
      elMobileOrderRepeatBtn.classList.remove("is-expanded");
      elMobileOrderRepeatBtn.onclick = null;
    }
    if (elMobileOrderTotalBtn) {
      elMobileOrderTotalBtn.onclick = null;
    }
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("hideMobileOrderDetailsActions");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("hideMobileOrderDetailsActions");
    }
  }

  function showMobileOrderDetailsActions(order) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile || !elMobileOrderDetailsActions) {
      hideMobileOrderDetailsActions();
      return;
    }
    const summary = buildOrderSummaryData(order);
    const repeatItems = Array.isArray(order?.items) ? order.items : [];
    if (elMobileOrderTotalValue) {
      elMobileOrderTotalValue.textContent = money(summary.orderTotal || 0);
    }
    if (elMobileOrderRepeatBtn) {
      elMobileOrderRepeatBtn.classList.remove("is-expanded");
      elMobileOrderRepeatBtn.onclick = async (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!elMobileOrderRepeatBtn.classList.contains("is-expanded")) {
          elMobileOrderRepeatBtn.classList.add("is-expanded");
          return;
        }
        if (!repeatItems.length) {
          showToast("\u0412 \u0437\u0430\u043a\u0430\u0437\u0435 \u043d\u0435\u0442 \u0442\u043e\u0432\u0430\u0440\u043e\u0432");
          return;
        }
        if (elMobileOrderRepeatBtn.disabled) return;
        elMobileOrderRepeatBtn.disabled = true;
        try {
          await repeatOrderItemsToCart(repeatItems);
        } finally {
          elMobileOrderRepeatBtn.disabled = false;
        }
      };

      if (window.__shopOrderRepeatOutsideHandler) {
        document.removeEventListener("pointerdown", window.__shopOrderRepeatOutsideHandler, true);
      }
      window.__shopOrderRepeatOutsideHandler = (event) => {
        if (!elMobileOrderRepeatBtn || !event) return;
        const target = event.target;
        if (target instanceof Node && elMobileOrderRepeatBtn.contains(target)) return;
        elMobileOrderRepeatBtn.classList.remove("is-expanded");
      };
      document.addEventListener("pointerdown", window.__shopOrderRepeatOutsideHandler, true);
    }
    if (elMobileOrderTotalBtn) {
      elMobileOrderTotalBtn.onclick = () => {};
    }
    elMobileOrderDetailsActions.classList.remove("hidden");
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("showMobileOrderDetailsActions");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("showMobileOrderDetailsActions");
    }
  }

  function bindDesktopOrderDetailsFooter(order) {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    const summary = buildOrderSummaryData(order);
    if (elOrderDetailsTotalValue) {
      elOrderDetailsTotalValue.textContent = money(summary.orderTotal || 0);
    }
    if (elOrderDetailsTotalBtn) {
      elOrderDetailsTotalBtn.onclick = () => {};
    }
    if (elOrderDetailsRepeatBtn) {
      elOrderDetailsRepeatBtn.onclick = async (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!elOrderDetailsRepeatBtn.classList.contains("is-expanded")) {
          elOrderDetailsRepeatBtn.classList.add("is-expanded");
          return;
        }
        const items = Array.isArray(order?.items) ? order.items : [];
        if (!items.length) {
          showToast("\u0412 \u0437\u0430\u043a\u0430\u0437\u0435 \u043d\u0435\u0442 \u0442\u043e\u0432\u0430\u0440\u043e\u0432");
          return;
        }
        if (elOrderDetailsRepeatBtn.disabled) return;
        elOrderDetailsRepeatBtn.disabled = true;
        try {
          await repeatOrderItemsToCart(items);
        } finally {
          elOrderDetailsRepeatBtn.disabled = false;
        }
      };
    }
    if (window.__shopDesktopOrderRepeatOutsideHandler) {
      document.removeEventListener("pointerdown", window.__shopDesktopOrderRepeatOutsideHandler, true);
    }
    window.__shopDesktopOrderRepeatOutsideHandler = (event) => {
      if (!elOrderDetailsRepeatBtn || !event) return;
      const target = event.target;
      if (target instanceof Node && elOrderDetailsRepeatBtn.contains(target)) return;
      elOrderDetailsRepeatBtn.classList.remove("is-expanded");
    };
    document.addEventListener("pointerdown", window.__shopDesktopOrderRepeatOutsideHandler, true);
    setCartFooterMode("order-details");
  }

  function resetOrderDetailsTransientUi() {
    hideMobileOrderDetailsActions();

    if (elMobileAddToCartBtn && mobileProductActionsState?.onAddToCart) {
      try {
        elMobileAddToCartBtn.removeEventListener("click", mobileProductActionsState.onAddToCart);
      } catch {}
      mobileProductActionsState.onAddToCart = null;
    }

    if (typeof window._comboStepBackCallback !== "undefined") {
      window._comboStepBackCallback = null;
    }
    if (openCartSheetCtx && typeof openCartSheetCtx === "object") {
      openCartSheetCtx.comboStepBack = null;
    }
      openCartSheetCtx = null;
      openProductCtx = null;
      if (elOrderDetailsRepeatBtn) {
        elOrderDetailsRepeatBtn.disabled = false;
        elOrderDetailsRepeatBtn.classList.remove("is-expanded");
        elOrderDetailsRepeatBtn.onclick = null;
      }
      if (elOrderDetailsTotalBtn) {
        elOrderDetailsTotalBtn.onclick = null;
      }
      if (window.__shopDesktopOrderRepeatOutsideHandler) {
        document.removeEventListener("pointerdown", window.__shopDesktopOrderRepeatOutsideHandler, true);
        window.__shopDesktopOrderRepeatOutsideHandler = null;
      }
      if (!window.matchMedia("(max-width: 768px)").matches) {
        setCartFooterMode("hidden");
      }
      if (window.AppModal?.body) {
        window.AppModal.body.classList.remove("shop-cart-sheet-body");
      }
  }

  function hasLiveCartSheetContext() {
    if (!openCartSheetCtx || typeof openCartSheetCtx !== "object") return false;
    const listEl = openCartSheetCtx.listEl;
    if (!listEl || !listEl.isConnected) return false;
    if (window.AppModal?.body && !window.AppModal.body.contains(listEl)) return false;
    return true;
  }

  function buildRepeatVariantLabel(rawLabel, rawGroupTitle) {
    const value = str(rawLabel || "").trim();
    if (!value) return "";
    if (value.includes(":")) {
      const right = value.split(":").slice(1).join(":").trim();
      return right || value;
    }
    return value;
  }

  function normalizeRepeatOptionItems(optionItems) {
    const list = Array.isArray(optionItems) ? optionItems : [];
    return list
      .map((opt) => {
        const itemId = Number(opt?.id || opt?.option_item_id || 0);
        if (!Number.isFinite(itemId) || itemId <= 0) return null;
        const qty = Math.max(0, Number(opt?.qty ?? opt?.quantity ?? 1)) || 1;
        const targetProductId = Number(opt?.target_product_id || opt?.product_id || 0);
        const variantSource =
          opt?.variant && typeof opt.variant === "object"
            ? opt.variant
            : (Array.isArray(opt?.variants) ? opt.variants[0] : null);
        const variantGroupId = Number(opt?.variant_group_id ?? variantSource?.variant_group_id);
        const variantValueIndex = Number(opt?.variant_value_index ?? variantSource?.variant_value_index);
        const variantGroupTitle = str(
          opt?.variant_group_title ||
          variantSource?.group_title ||
          variantSource?.variant_group_title ||
          variantSource?.title ||
          ""
        );
        const variantLabel = buildRepeatVariantLabel(
          opt?.variant_label || variantSource?.label || variantSource?.value || "",
          variantGroupTitle
        );
        return {
          id: itemId,
          title: str(opt?.title || opt?.name || ""),
          price: Number(opt?.price || 0),
          qty,
          target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
          product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
          variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
          variant_label: variantLabel,
          variant_price_diff: Number(opt?.variant_price_diff || 0),
        };
      })
      .filter(Boolean);
  }

  function normalizeRepeatIngredients(ingredients) {
    const list = Array.isArray(ingredients) ? ingredients : [];
    return list
      .map((ing) => {
        const ingredientId = Number(ing?.ingredient_id || 0);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
        const quantityRaw = Number(ing?.quantity ?? ing?.qty ?? 0);
        const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
        const ingredientName = str(
          ing?.ingredient_name ||
          ing?.name ||
          ing?.title ||
          ing?.product_name ||
          ""
        );
        return {
          ingredient_id: ingredientId,
          ingredient_name: ingredientName,
          name: ingredientName,
          quantity,
          qty: quantity,
          unit_id: ing?.unit_id != null && Number.isFinite(Number(ing.unit_id)) ? Number(ing.unit_id) : null,
          unit_label: str(ing?.unit_label || ing?.unit || ""),
          unit: str(ing?.unit || ing?.unit_label || ""),
        };
      })
      .filter(Boolean);
  }

  function buildRepeatPrefillItem(orderItem) {
    if (!orderItem || typeof orderItem !== "object") return null;

    const itemType = str(orderItem.type || "").trim().toLowerCase();
    const hasComboPayload =
      Number.isFinite(Number(orderItem?.combo_id || 0)) &&
      Number(orderItem?.combo_id || 0) > 0;

    if (itemType === "combo" || hasComboPayload) {
      const comboId = Number(orderItem.combo_id || orderItem?.combo?.id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;
      const selections = (Array.isArray(orderItem.selections) ? orderItem.selections : []).map((sel) => {
        const productId = Number(sel?.product_id || sel?.id || sel?.product?.id || 0);
        const selVariant =
          sel?.variant && typeof sel.variant === "object"
            ? sel.variant
            : (Array.isArray(sel?.variants) ? sel.variants[0] : null);
        const rawIngredients = Array.isArray(sel?.ingredients_display)
          ? sel.ingredients_display
          : (Array.isArray(sel?.ingredients) ? sel.ingredients : []);
        const ingredientsDisplay = rawIngredients.map((ing) => {
          const ingredientId = Number(ing?.ingredient_id || 0);
          const quantityRaw = Number(ing?.quantity ?? ing?.qty ?? 0);
          const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
          return {
            ingredient_id: Number.isFinite(ingredientId) && ingredientId > 0 ? ingredientId : null,
            name: str(ing?.name || ing?.ingredient_name || ""),
            quantity,
            qty: quantity,
            unit_id: ing?.unit_id != null && Number.isFinite(Number(ing.unit_id)) ? Number(ing.unit_id) : null,
            unit: str(ing?.unit || ing?.unit_label || ""),
          };
        });
        const variantGroupId = Number(sel?.variant_group_id ?? selVariant?.variant_group_id);
        const variantValueIndex = Number(sel?.variant_value_index ?? selVariant?.variant_value_index);
        return {
          product_id: Number.isFinite(productId) && productId > 0 ? productId : null,
          product_name: str(sel?.product_name || ""),
          product_photo: str(sel?.product_photo || ""),
          variant_label: str(sel?.variant_label || selVariant?.label || selVariant?.value || ""),
          variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
          variant_group_title: str(sel?.variant_group_title || ""),
          variant_unit: str(sel?.variant_unit || ""),
          unit_id: sel?.unit_id != null && Number.isFinite(Number(sel.unit_id)) ? Number(sel.unit_id) : null,
          ingredients_display: ingredientsDisplay,
          unit_price_override: sel?.unit_price_override != null ? Number(sel.unit_price_override) : null,
        };
      });

      return {
        type: "combo",
        combo_id: comboId,
        combo_title: str(orderItem.combo_title || orderItem.name || "Комбо"),
        qty: Math.max(1, Number(orderItem.qty || orderItem.quantity || 1)),
        selections,
        unit_price_before_discount: Number(orderItem.unit_price_before_discount || 0),
      };
    }

    const productId = Number(orderItem.product_id || orderItem.id || orderItem?.product?.id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    const optionItemsRaw = [
      ...(Array.isArray(orderItem.options) ? orderItem.options : []),
      ...(Array.isArray(orderItem.option_items) ? orderItem.option_items : []),
    ];
    const optionItems = normalizeRepeatOptionItems(optionItemsRaw);
    const optionItemsById = new Map();
    optionItems.forEach((opt) => {
      const optionId = Number(opt?.id || 0);
      if (!Number.isFinite(optionId) || optionId <= 0) return;
      optionItemsById.set(optionId, opt);
    });
    const optionIds = new Set();
    (Array.isArray(orderItem.option_item_ids) ? orderItem.option_item_ids : []).forEach((id) => {
      const itemId = Number(id);
      if (Number.isFinite(itemId) && itemId > 0) optionIds.add(itemId);
    });
    optionItemsById.forEach((_opt, id) => {
      if (Number.isFinite(Number(id)) && Number(id) > 0) optionIds.add(Number(id));
    });

    const variantFromArray = Array.isArray(orderItem?.variants) ? orderItem.variants[0] : null;
    const variantSource =
      orderItem?.variant && typeof orderItem.variant === "object"
        ? orderItem.variant
        : (variantFromArray && typeof variantFromArray === "object" ? variantFromArray : null);
    const variantGroupId = Number(orderItem.variant_group_id ?? variantSource?.variant_group_id);
    const variantValueIndex = Number(orderItem.variant_value_index ?? variantSource?.variant_value_index);
    const variantGroupTitle = str(
      orderItem.variant_group_title ||
      variantSource?.group_title ||
      variantSource?.variant_group_title ||
      variantSource?.title ||
      ""
    );
    const variantLabel = buildRepeatVariantLabel(
      orderItem.variant_label ||
      variantSource?.variant_label ||
      variantSource?.label ||
      variantSource?.value ||
      "",
      variantGroupTitle
    );

    return {
      product_id: productId,
      qty: Math.max(1, Number(orderItem.qty || orderItem.quantity || 1)),
      option_item_ids: [...optionIds],
      option_items: Array.from(optionItemsById.values()),
      ingredients: normalizeRepeatIngredients(orderItem.ingredients),
      variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
      variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
      variant_label: variantLabel,
    };
  }

  async function resolveRepeatComboSelectionsWithCatalog(comboId, rawSelections) {
    const sourceSelections = Array.isArray(rawSelections) ? rawSelections : [];
    if (!sourceSelections.length) {
      return { selections: [], unitPriceBeforeDiscount: null };
    }

    const safeComboId = Number(comboId || 0);
    let discountPercent = 0;
    if (Number.isFinite(safeComboId) && safeComboId > 0) {
      try {
        const comboData = await resolveComboDetails(safeComboId);
        discountPercent = Number(comboData?.discount_percent || 0) || 0;
      } catch (e) {
        console.warn("Failed to load combo for repeat pricing:", safeComboId, e);
      }
    }

    const pricedSelections = [];
    for (const rawSelection of sourceSelections) {
      const selection = rawSelection && typeof rawSelection === "object" ? { ...rawSelection } : {};
      const productId = Number(selection.product_id || 0);
      if (!Number.isFinite(productId) || productId <= 0) {
        pricedSelections.push({
          ...selection,
          product_id: null,
          unit_price_before_discount: null,
          unit_price_override:
            selection?.unit_price_override != null && Number.isFinite(Number(selection.unit_price_override))
              ? Number(selection.unit_price_override)
              : null,
        });
        continue;
      }

      let resolvedSelection = null;
      try {
        const [product, variants, ingredients] = await Promise.all([
          ensureProduct(productId),
          resolveProductVariants(productId),
          resolveProductIngredients(productId),
        ]);
        if (product) {
          const variantGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
          const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];

          let variantValueIndex = Number(selection.variant_value_index);
          if (!Number.isFinite(variantValueIndex) && values.length) {
            const wantedLabel = str(selection.variant_label || "").trim();
            if (wantedLabel) {
              const foundIndex = values.findIndex((value) => str(value || "").trim() === wantedLabel);
              if (foundIndex >= 0) variantValueIndex = foundIndex;
            }
          }
          if (!Number.isFinite(variantValueIndex)) {
            variantValueIndex = variantGroup?.default_value_index != null
              ? Number(variantGroup.default_value_index)
              : 0;
          }
          if (!Number.isFinite(variantValueIndex)) variantValueIndex = 0;
          if (values.length) {
            variantValueIndex = Math.max(0, Math.min(variantValueIndex, values.length - 1));
          } else {
            variantValueIndex = 0;
          }

          const variantLabel = values[variantValueIndex] != null
            ? str(values[variantValueIndex])
            : str(selection.variant_label || "");
          const variantState = {
            selectedIndex: variantValueIndex,
            value: values[variantValueIndex],
            label: variantLabel,
          };

          let unitBeforeDiscount = Array.isArray(variants) && variants.length
            ? getVariantUnitPrice(product, variants, variantState)
            : Number(product.price || 0);

          const ingredientSource = Array.isArray(selection.ingredients_display)
            ? selection.ingredients_display
            : (Array.isArray(selection.ingredients) ? selection.ingredients : []);
          const ingredientQty = new Map();
          ingredientSource.forEach((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || ingredient?.id || 0);
            if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
            const quantity = Number(ingredient?.quantity ?? ingredient?.qty ?? 0);
            if (!Number.isFinite(quantity)) return;
            ingredientQty.set(ingredientId, quantity);
          });

          (Array.isArray(ingredients) ? ingredients : []).forEach((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || 0);
            if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
            if (!ingredientQty.has(ingredientId)) {
              ingredientQty.set(ingredientId, Number(ingredient?.quantity ?? 0));
            }
          });

          (Array.isArray(ingredients) ? ingredients : []).forEach((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || 0);
            if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
            const currentQty = Number(ingredientQty.get(ingredientId) ?? 0);
            const baseQty = Number(ingredient?.quantity ?? 1);
            const ingredientBaseQty =
              ingredient?.ingredient_base_qty != null && Number(ingredient.ingredient_base_qty) > 0
                ? Number(ingredient.ingredient_base_qty)
                : 1;
            const ingredientPrice = Number(ingredient?.ingredient_price || 0);
            const catalogBasePrice =
              ingredientBaseQty > 0 && ingredientPrice > 0
                ? ingredientPrice / ingredientBaseQty
                : (ingredientPrice > 0 ? ingredientPrice : 0);
            const pricePerUnit =
              ingredient?.price_override != null && Number(ingredient.price_override) >= 0
                ? Number(ingredient.price_override)
                : catalogBasePrice;
            const currentQtyInBase = getQtyInBase(ingredient, currentQty);
            const baseQtyInBase = getQtyInBase(ingredient, baseQty);
            const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
              ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
              : (Number.isFinite(pricePerUnit) ? (currentQty - baseQty) * pricePerUnit : 0);
            unitBeforeDiscount += diff;
          });

          unitBeforeDiscount = Math.max(0, unitBeforeDiscount);

          const normalizedIngredientsDisplay = (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || 0);
            const quantity = ingredientQty.get(ingredientId) ?? Number(ingredient?.quantity ?? 0) ?? 0;
            const unitLabel = ingredient?.unit_short_title || ingredient?.unit_title || ingredient?.unit_code || "г";
            return {
              ingredient_id: Number.isFinite(ingredientId) && ingredientId > 0 ? ingredientId : null,
              name: str(ingredient?.ingredient_name || ingredient?.name || ""),
              quantity,
              qty: quantity,
              unit_id: ingredient?.unit_id != null && Number.isFinite(Number(ingredient.unit_id)) ? Number(ingredient.unit_id) : null,
              unit: str(unitLabel),
            };
          });

          resolvedSelection = {
            ...selection,
            product_id: productId,
            product_name: str(selection.product_name || product.name || ""),
            product_photo: str(selection.product_photo || safePhotos(product)[0] || ""),
            variant_label: str(selection.variant_label || variantLabel || ""),
            variant_group_id:
              selection?.variant_group_id != null && Number.isFinite(Number(selection.variant_group_id))
                ? Number(selection.variant_group_id)
                : (
                  variantGroup && (variantGroup.id || variantGroup.variant_group_id) != null
                    ? Number(variantGroup.id || variantGroup.variant_group_id)
                    : null
                ),
            variant_value_index: variantValueIndex,
            variant_group_title: str(
              selection.variant_group_title ||
              (variantGroup ? (variantGroup.title || variantGroup.title_label || "") : "")
            ),
            variant_unit: str(
              selection.variant_unit ||
              (variantGroup ? (variantGroup.unit_short_title || variantGroup.unit_title || variantGroup.unit_code || "") : "")
            ),
            unit_id:
              selection.unit_id != null && Number.isFinite(Number(selection.unit_id))
                ? Number(selection.unit_id)
                : (variantGroup?.unit_id != null ? Number(variantGroup.unit_id) : null),
            ingredients_display: normalizedIngredientsDisplay.length ? normalizedIngredientsDisplay : ingredientSource,
            unit_price_before_discount: roundPrice(unitBeforeDiscount),
          };
        }
      } catch (e) {
        console.warn("Failed to resolve repeat combo selection price:", productId, e);
      }

      if (!resolvedSelection) {
        const fallbackOld = Number(selection.unit_price_before_discount || 0);
        const fallbackCurrent = Number(selection.unit_price_override || 0);
        resolvedSelection = {
          ...selection,
          product_id: productId,
          unit_price_before_discount: fallbackOld > 0 ? roundPrice(fallbackOld) : null,
          unit_price_override: fallbackCurrent > 0 ? roundPrice(fallbackCurrent) : null,
        };
      }

      pricedSelections.push(resolvedSelection);
    }

    const unitPriceBeforeDiscount = roundPrice(
      pricedSelections.reduce((sum, selection) => {
        const oldValue = Number(selection?.unit_price_before_discount || 0);
        const currentValue = Number(selection?.unit_price_override || 0);
        return sum + (oldValue > 0 ? oldValue : currentValue);
      }, 0)
    );

    if (unitPriceBeforeDiscount > 0) {
      const unitDiscounted = roundPrice(comboDiscountedPrice(unitPriceBeforeDiscount, discountPercent));
      let assigned = 0;
      pricedSelections.forEach((selection, index) => {
        if (index === pricedSelections.length - 1) {
          selection.unit_price_override = roundPrice(unitDiscounted - assigned);
          return;
        }
        const oldValue = Number(selection?.unit_price_before_discount || 0);
        const share = unitPriceBeforeDiscount > 0 ? oldValue / unitPriceBeforeDiscount : 0;
        const nextValue = roundPrice(unitDiscounted * share);
        selection.unit_price_override = nextValue;
        assigned += nextValue;
      });
    } else {
      pricedSelections.forEach((selection) => {
        const currentValue = Number(selection?.unit_price_override || 0);
        const oldValue = Number(selection?.unit_price_before_discount || 0);
        selection.unit_price_override = currentValue > 0
          ? roundPrice(currentValue)
          : (oldValue > 0 ? roundPrice(comboDiscountedPrice(oldValue, discountPercent)) : null);
      });
    }

    return {
      selections: pricedSelections,
      unitPriceBeforeDiscount: unitPriceBeforeDiscount > 0 ? unitPriceBeforeDiscount : null,
    };
  }

  async function resolveRepeatVariantLabelFromCatalog(productId, variantGroupId, variantValueIndex, fallbackLabel) {
    const safeProductId = Number(productId || 0);
    const safeGroupId = Number(variantGroupId);
    const safeValueIndex = Number(variantValueIndex);
    const fallback = str(fallbackLabel || "").trim();
    const hasVariantSelection =
      Number.isFinite(safeProductId) &&
      safeProductId > 0 &&
      Number.isFinite(safeGroupId) &&
      safeGroupId > 0 &&
      Number.isFinite(safeValueIndex) &&
      safeValueIndex >= 0;
    if (!hasVariantSelection) return "";

    try {
      const variants = await resolveProductVariants(safeProductId);
      const groups = Array.isArray(variants) ? variants : [];
      const matchedGroup = groups.find(
        (group) => Number(group?.id || group?.variant_group_id || 0) === safeGroupId
      );
      const fallbackGroup = !matchedGroup && groups.length === 1 ? groups[0] : null;
      const resolvedGroup = matchedGroup || fallbackGroup;
      const groupTitle = str(resolvedGroup?.title || resolvedGroup?.title_label || "");
      const values = Array.isArray(resolvedGroup?.values) ? resolvedGroup.values : [];
      const catalogValue =
        Number.isFinite(safeValueIndex) &&
        safeValueIndex >= 0 &&
        safeValueIndex < values.length
          ? str(values[safeValueIndex] || "")
          : "";
      const label = buildRepeatVariantLabel(catalogValue || fallback, groupTitle);
      return str(label || fallback).trim();
    } catch (e) {
      console.warn("Failed to resolve repeat variant label from catalog:", safeProductId, e);
      return fallback;
    }
  }

  function isFavoriteUnauthorizedErrorForRepeat(err) {
    if (!err) return false;
    if (Number(err.httpStatus || 0) === 401) return true;
    const msg = String(err.message || "");
    return msg === "UNAUTHORIZED" || msg.includes("UNAUTHORIZED");
  }

  function buildRepeatActionSnapshot(orderItem) {
    const prefillItem = buildRepeatPrefillItem(orderItem);
    if (!prefillItem) return null;

    const source = orderItem && typeof orderItem === "object" ? orderItem : {};
    const qty = Math.max(1, Number(prefillItem.qty || source.qty || source.quantity || 1));

    if (String(prefillItem.type || "") === "combo") {
      const comboId = Number(prefillItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;

      const lineTotalRaw = Number(source.line_total);
      let unitPrice = Number.isFinite(lineTotalRaw) && qty > 0
        ? roundPrice(lineTotalRaw / qty)
        : Number(source.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        unitPrice = roundPrice(
          (Array.isArray(prefillItem.selections) ? prefillItem.selections : []).reduce(
            (sum, sel) => sum + Number(sel?.unit_price_override || 0),
            0
          )
        );
      }

      let oldLineTotal = Number(source.old_line_total || source?.discount?.original_line_total || 0);
      if (!(oldLineTotal > 0)) {
        const oldUnit = Number(prefillItem.unit_price_before_discount || source.unit_price_before_discount || 0);
        if (oldUnit > 0) {
          oldLineTotal = roundPrice(oldUnit * qty);
        }
      }

      const directPhotos = Array.isArray(source.photos)
        ? source.photos.map((photo) => str(photo)).filter(Boolean)
        : [];
      const selectionPhotos = (Array.isArray(prefillItem.selections) ? prefillItem.selections : [])
        .map((sel) => str(sel?.product_photo || "").trim())
        .filter(Boolean);

      return {
        type: "combo",
        combo_id: comboId,
        combo_title: str(prefillItem.combo_title || source.combo_title || source.name || "Комбо"),
        name: str(source.name || prefillItem.combo_title || "Комбо"),
        qty,
        price: roundPrice(Number(unitPrice || 0)),
        line_total: Number.isFinite(lineTotalRaw)
          ? roundPrice(lineTotalRaw)
          : roundPrice(Number(unitPrice || 0) * qty),
        old_line_total: oldLineTotal > 0 ? roundPrice(oldLineTotal) : 0,
        unit_price_before_discount: Number(prefillItem.unit_price_before_discount || source.unit_price_before_discount || 0),
        photos: directPhotos.length ? directPhotos : selectionPhotos,
        selections: Array.isArray(prefillItem.selections) ? prefillItem.selections : [],
      };
    }

    const productId = Number(prefillItem.product_id || source.product_id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    const lineTotalRaw = Number(source.line_total);
    let unitPrice = Number.isFinite(lineTotalRaw) && qty > 0
      ? roundPrice(lineTotalRaw / qty)
      : Number(source.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      unitPrice = 0;
    }

    const discountOriginalLine = Number(source?.discount?.original_line_total || 0);
    const oldPriceRaw = Number(source.old_price || 0);
    const oldPrice = oldPriceRaw > 0
      ? oldPriceRaw
      : (discountOriginalLine > 0 && qty > 0 ? roundPrice(discountOriginalLine / qty) : 0);

    const variantLabel = str(prefillItem.variant_label || source.variant_label || "").trim();
    const variantGroupId = Number(prefillItem.variant_group_id);
    const variantValueIndex = Number(prefillItem.variant_value_index);
    const hasVariant =
      Number.isFinite(variantGroupId) &&
      variantGroupId > 0 &&
      Number.isFinite(variantValueIndex) &&
      variantValueIndex >= 0 &&
      !!variantLabel;

    return {
      type: "product",
      product_id: productId,
      name: str(source.name || source.product_name || "Товар"),
      qty,
      price: roundPrice(Number(unitPrice || 0)),
      line_total: Number.isFinite(lineTotalRaw)
        ? roundPrice(lineTotalRaw)
        : roundPrice(Number(unitPrice || 0) * qty),
      old_price: oldPrice > 0 ? roundPrice(oldPrice) : 0,
      photos: Array.isArray(source.photos)
        ? source.photos.map((photo) => str(photo)).filter(Boolean)
        : [],
      option_item_ids: Array.isArray(prefillItem.option_item_ids) ? prefillItem.option_item_ids : [],
      options: Array.isArray(prefillItem.option_items) ? prefillItem.option_items : [],
      option_items: Array.isArray(prefillItem.option_items) ? prefillItem.option_items : [],
      ingredients: Array.isArray(prefillItem.ingredients) ? prefillItem.ingredients : [],
      variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
      variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
      variant_label: variantLabel,
      variants: hasVariant
        ? [{
          variant_group_id: variantGroupId,
          variant_value_index: variantValueIndex,
          group_title: "",
          value: variantLabel,
          label: variantLabel,
          price_diff: 0,
        }]
        : [],
      discount: discountOriginalLine > 0
        ? { original_line_total: roundPrice(discountOriginalLine) }
        : null,
    };
  }

  function buildSingleQtyRepeatSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;

    const sourceQty = Math.max(1, Number(snapshot.qty || snapshot.quantity || 1));
    const type = str(snapshot.type || "").toLowerCase();
    const next = {
      ...snapshot,
      qty: 1,
      quantity: 1,
    };

    if (type === "combo") {
      const currentUnit = roundPrice(
        Number(snapshot.price || 0) > 0
          ? Number(snapshot.price || 0)
          : Number(snapshot.line_total || 0) / sourceQty
      );
      const oldLineTotal = Number(snapshot.old_line_total || 0);
      const oldUnitFromLine = oldLineTotal > 0 ? roundPrice(oldLineTotal / sourceQty) : 0;
      const oldUnitDirect = Number(snapshot.unit_price_before_discount || 0);
      const oldUnit = oldUnitFromLine > 0 ? oldUnitFromLine : (oldUnitDirect > 0 ? roundPrice(oldUnitDirect) : 0);

      next.price = currentUnit > 0 ? currentUnit : 0;
      next.line_total = next.price;
      next.old_line_total = oldUnit > 0 ? oldUnit : 0;
      next.unit_price_before_discount = oldUnit > 0 ? oldUnit : (oldUnitDirect > 0 ? oldUnitDirect : 0);
      return next;
    }

    const unitPrice = roundPrice(
      Number(snapshot.price || 0) > 0
        ? Number(snapshot.price || 0)
        : Number(snapshot.line_total || 0) / sourceQty
    );
    const oldPrice = Number(snapshot.old_price || 0);
    const discountOriginalLine = Number(snapshot?.discount?.original_line_total || 0);
    const discountOriginalUnit = discountOriginalLine > 0 ? roundPrice(discountOriginalLine / sourceQty) : 0;

    next.price = unitPrice > 0 ? unitPrice : 0;
    next.line_total = next.price;
    next.old_price = oldPrice > 0 ? roundPrice(oldPrice) : 0;
    next.discount = discountOriginalUnit > 0
      ? { ...(snapshot.discount || {}), original_line_total: discountOriginalUnit }
      : null;
    return next;
  }

  async function addRepeatSnapshotToFavorites(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!window.shopFavoritesApi || typeof window.shopFavoritesApi.add !== "function") return false;

    if (!getCustomerToken()) {
      if (typeof promptFavoritesLogin === "function") {
        promptFavoritesLogin();
      } else {
        showToast("Войдите в профиль");
      }
      return false;
    }

    try {
      await window.shopFavoritesApi.add(snapshot);
      showToast("\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435");
      if (navigator.vibrate) navigator.vibrate(10);
      return true;
    } catch (err) {
      if (isFavoriteUnauthorizedErrorForRepeat(err)) {
        if (typeof promptFavoritesLogin === "function") {
          promptFavoritesLogin();
        } else {
          showToast("Войдите в профиль");
        }
      } else {
        console.warn("Failed to add order item to favorites:", err);
        showToast("Не удалось добавить в избранное");
      }
      return false;
    }
  }

  function collectRepeatPrefillProductIds(prefillItem) {
    const ids = new Set();
    const item = prefillItem && typeof prefillItem === "object" ? prefillItem : null;
    if (!item) return [];

    if (String(item.type || "") === "combo") {
      const selections = Array.isArray(item.selections) ? item.selections : [];
      selections.forEach((sel) => {
        const pid = Number(sel?.product_id || 0);
        if (Number.isFinite(pid) && pid > 0) ids.add(pid);
      });
      return [...ids];
    }

    const baseProductId = Number(item.product_id || 0);
    if (Number.isFinite(baseProductId) && baseProductId > 0) ids.add(baseProductId);

    const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
    optionItems.forEach((opt) => {
      const pid = Number(opt?.target_product_id || opt?.product_id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });

    return [...ids];
  }

  function isProductIdAvailableLocally(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return true;

    const cachedProduct = state.productCache.get(pid);
    if (cachedProduct) return isProductAvailable(cachedProduct);

    if (typeof getStockLevelEntry === "function") {
      const stockEntry = getStockLevelEntry(pid);
      if (stockEntry) {
        if (stockEntry.isAvailable !== undefined && stockEntry.isAvailable !== null) {
          return !!stockEntry.isAvailable;
        }
        if (stockEntry.qty !== undefined && stockEntry.qty !== null) {
          return Number(stockEntry.qty) > 0;
        }
      }
    }

    return true;
  }

  function hasUnavailableRepeatPrefillProducts(prefillItem) {
    const ids = collectRepeatPrefillProductIds(prefillItem);
    if (!ids.length) return false;
    return ids.some((pid) => !isProductIdAvailableLocally(pid));
  }

  function normalizeRepeatComboSelectionsLocal(sourceSelections) {
    const list = Array.isArray(sourceSelections) ? sourceSelections : [];
    return list.map((rawSelection) => {
      const selection = rawSelection && typeof rawSelection === "object"
        ? { ...rawSelection }
        : {};

      const productId = Number(selection.product_id || 0);
      if (Number.isFinite(productId) && productId > 0) {
        const cachedProduct = state.productCache.get(productId);
        if (cachedProduct) {
          if (!str(selection.product_name || "").trim()) {
            selection.product_name = str(cachedProduct.name || "");
          }
          if (!str(selection.product_photo || "").trim()) {
            selection.product_photo = str(safePhotos(cachedProduct)[0] || "");
          }
        }
      }

      const oldUnit = Number(selection.unit_price_before_discount || 0);
      const currentUnit = Number(selection.unit_price_override || 0);
      selection.unit_price_before_discount = oldUnit > 0 ? roundPrice(oldUnit) : null;
      selection.unit_price_override = currentUnit > 0 ? roundPrice(currentUnit) : null;
      return selection;
    });
  }

  async function normalizeRepeatSnapshotForCart(snapshot) {
    const source = snapshot && typeof snapshot === "object" ? snapshot : null;
    if (!source) return snapshot;

    const type = str(source.type || "").trim().toLowerCase();
    if (type !== "combo") return source;

    const comboId = Number(source.combo_id || 0);
    const selections = Array.isArray(source.selections) ? source.selections : [];
    if (!selections.length || !Number.isFinite(comboId) || comboId <= 0) return source;

    const hasCurrentPricing = selections.some((sel) => Number(sel?.unit_price_override || 0) > 0);
    const hasOldPricing = selections.some((sel) => Number(sel?.unit_price_before_discount || 0) > 0);
    if (hasCurrentPricing && hasOldPricing) return source;

    try {
      const resolved = await resolveRepeatComboSelectionsWithCatalog(comboId, selections);
      const resolvedSelections = Array.isArray(resolved?.selections) ? resolved.selections : [];
      if (!resolvedSelections.length) return source;

      const qty = Math.max(1, Number(source.qty || source.quantity || 1));
      const next = { ...source, selections: resolvedSelections };
      const currentUnit = roundPrice(
        resolvedSelections.reduce((sum, sel) => sum + Number(sel?.unit_price_override || 0), 0)
      );
      const oldUnit = Number(resolved?.unitPriceBeforeDiscount || 0);

      if (!(Number(next.price || 0) > 0) && currentUnit > 0) {
        next.price = currentUnit;
      }
      if (!(Number(next.line_total || 0) > 0) && Number(next.price || 0) > 0) {
        next.line_total = roundPrice(Number(next.price || 0) * qty);
      }
      if (!(Number(next.unit_price_before_discount || 0) > 0) && oldUnit > 0) {
        next.unit_price_before_discount = roundPrice(oldUnit);
      }
      if (!(Number(next.old_line_total || 0) > 0) && oldUnit > 0) {
        next.old_line_total = roundPrice(oldUnit * qty);
      }
      return next;
    } catch (e) {
      console.warn("Failed to normalize repeat combo snapshot pricing:", comboId, e);
      return source;
    }
  }

  function applyRepeatSnapshotToDraftCart(snapshot, draftCart) {
    if (!snapshot || typeof snapshot !== "object" || !Array.isArray(draftCart)) {
      return { ok: false, reason: "invalid" };
    }
    const prefillItem = buildRepeatPrefillItem(snapshot);
    if (!prefillItem) {
      return { ok: false, reason: "invalid" };
    }
    if (hasUnavailableRepeatPrefillProducts(prefillItem)) {
      return { ok: false, reason: "unavailable" };
    }

    if (String(prefillItem.type || "") === "combo") {
      const comboId = Number(prefillItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) {
        return { ok: false, reason: "invalid" };
      }

      const safeQty = Math.max(1, Number(prefillItem.qty || 1));
      const sourceSelections = Array.isArray(prefillItem.selections) ? prefillItem.selections : [];
      if (!sourceSelections.length) {
        return { ok: false, reason: "invalid" };
      }

      const selections = normalizeRepeatComboSelectionsLocal(sourceSelections);
      let unitOld = Number(prefillItem.unit_price_before_discount || 0);
      if (!(unitOld > 0)) {
        const oldLineTotal =
          Number(snapshot?.old_line_total || 0) ||
          Number(snapshot?.discount?.original_line_total || 0);
        if (oldLineTotal > 0 && safeQty > 0) {
          unitOld = roundPrice(oldLineTotal / safeQty);
        }
      }
      if (!(unitOld > 0)) {
        unitOld = roundPrice(
          selections.reduce((sum, sel) => {
            const oldVal = Number(sel?.unit_price_before_discount || 0);
            const currentVal = Number(sel?.unit_price_override || 0);
            return sum + (oldVal > 0 ? oldVal : currentVal);
          }, 0)
        );
      }

      draftCart.push({
        key: `combo-${comboId}-${Date.now()}`,
        type: "combo",
        combo_id: comboId,
        combo_title: str(prefillItem.combo_title || snapshot?.name || "\u041a\u043e\u043c\u0431\u043e"),
        qty: safeQty,
        selections,
        unit_price_before_discount: unitOld > 0 ? unitOld : null,
      });
      return { ok: true, reason: "added" };
    } else {
      const productId = Number(prefillItem.product_id || 0);
      if (!Number.isFinite(productId) || productId <= 0) {
        return { ok: false, reason: "invalid" };
      }

      const product = state.productCache.get(productId) || null;
      const safeQty = Math.max(1, Number(prefillItem.qty || 1));
      const optionItems = (Array.isArray(prefillItem.option_items) ? prefillItem.option_items : [])
        .map((opt) => {
          const id = Number(opt?.id || 0);
          if (!Number.isFinite(id) || id <= 0) return null;
          const qty = Math.max(1, Number(opt?.qty ?? opt?.quantity ?? 1));
          return {
            id,
            title: str(opt?.title || opt?.name || ""),
            price: Number(opt?.price || 0),
            qty,
            target_product_id: opt?.target_product_id != null ? Number(opt.target_product_id) : null,
            product_id: opt?.product_id != null ? Number(opt.product_id) : null,
            variant_group_id: opt?.variant_group_id != null ? Number(opt.variant_group_id) : null,
            variant_value_index: opt?.variant_value_index != null ? Number(opt.variant_value_index) : null,
            variant_label: str(opt?.variant_label || ""),
            variant_price_diff: Number(opt?.variant_price_diff || 0),
          };
        })
        .filter(Boolean);
      const optionItemIds = optionItems.map((opt) => Number(opt.id));
      const ingredients = normalizeRepeatIngredients(prefillItem.ingredients);

      const variantGroupId = prefillItem.variant_group_id != null ? Number(prefillItem.variant_group_id) : null;
      const variantValueIndex = prefillItem.variant_value_index != null ? Number(prefillItem.variant_value_index) : null;
      const hasVariantSelection =
        Number.isFinite(variantGroupId) &&
        variantGroupId > 0 &&
        Number.isFinite(variantValueIndex) &&
        variantValueIndex >= 0;
      const variantSelection = hasVariantSelection
        ? { group_id: variantGroupId, value_index: variantValueIndex }
        : null;
      const resolvedVariantLabel = hasVariantSelection ? str(prefillItem.variant_label || "") : "";

      const baseProductPrice = Number(product?.price || 0);
      let variantUnitPrice = baseProductPrice;
      if (hasVariantSelection) {
        const snapshotVariants = Array.isArray(snapshot?.variants) ? snapshot.variants : [];
        const firstVariant = snapshotVariants[0] || null;
        const variantPriceDiff = Number(firstVariant?.price_diff ?? prefillItem?.variant_price_diff ?? 0);
        if (Number.isFinite(variantPriceDiff)) {
          variantUnitPrice = baseProductPrice + variantPriceDiff;
        }
      }
      if (!(variantUnitPrice > 0) && hasVariantSelection) {
        const fallbackVariantUnit = Number(prefillItem?.variant_unit_price || 0);
        if (Number.isFinite(fallbackVariantUnit) && fallbackVariantUnit > 0) {
          variantUnitPrice = fallbackVariantUnit;
        }
      }

      const optionTotal = optionItemsTotal(optionItems);
      const snapshotLineTotal = Number(snapshot?.line_total || 0);
      const snapshotUnitPrice = Number.isFinite(snapshotLineTotal) && snapshotLineTotal > 0 && safeQty > 0
        ? roundPrice(snapshotLineTotal / safeQty)
        : Number(snapshot?.price || 0);
      const snapshotOldUnitPrice = Number(snapshot?.old_price || 0);
      const hasApiDiscount = Boolean(product?.discount && Number(product.discount.discount_amount || product.discount.discount_value || 0) > 0);
      let preDiscountUnitPrice =
        Number.isFinite(snapshotUnitPrice) && snapshotUnitPrice > 0
          ? snapshotUnitPrice
          : roundPrice(variantUnitPrice + optionTotal);
      if (hasApiDiscount && Number.isFinite(snapshotOldUnitPrice) && snapshotOldUnitPrice > preDiscountUnitPrice) {
        preDiscountUnitPrice = snapshotOldUnitPrice;
      }

      let ingredientPriceDiff = preDiscountUnitPrice - variantUnitPrice - optionTotal;
      if (!Number.isFinite(ingredientPriceDiff)) ingredientPriceDiff = 0;
      ingredientPriceDiff = roundPrice(ingredientPriceDiff);

      const nextKey = makeCartKey(productId, optionItems, ingredients, variantSelection);
      const existing = draftCart.find((entry) => String(entry?.key || "") === String(nextKey));
      if (existing) {
        existing.qty = Math.max(0, Number(existing.qty || 0)) + safeQty;
        existing.option_item_ids = optionItemIds;
        existing.option_items = optionItems;
        existing.ingredients = ingredients;
        existing.ingredient_price_diff = ingredientPriceDiff;
        existing.variant_group_id = hasVariantSelection ? variantGroupId : null;
        existing.variant_value_index = hasVariantSelection ? variantValueIndex : null;
        existing.variant_label = hasVariantSelection ? str(resolvedVariantLabel || "") : "";
        existing.variant_unit_price = hasVariantSelection ? Number(variantUnitPrice || 0) : 0;
        if (existing.auto_add == null) existing.auto_add = 0;
        if (existing.auto_add_group_id == null) existing.auto_add_group_id = null;
      } else {
        draftCart.push({
          key: nextKey,
          product_id: productId,
          qty: safeQty,
          option_item_ids: optionItemIds,
          option_items: optionItems,
          ingredients,
          ingredient_price_diff: ingredientPriceDiff,
          variant_group_id: hasVariantSelection ? variantGroupId : null,
          variant_value_index: hasVariantSelection ? variantValueIndex : null,
          variant_label: hasVariantSelection ? str(resolvedVariantLabel || "") : "",
          variant_unit_price: hasVariantSelection ? Number(variantUnitPrice || 0) : 0,
          auto_add: 0,
          auto_add_group_id: null,
        });
      }
      return { ok: true, reason: "added" };
    }
  }

  async function addRepeatSnapshotToCartLocal(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const normalizedSnapshot = await normalizeRepeatSnapshotForCart(snapshot);
    const previousCartSnapshot = cloneCartState(state.cart);
    const wasEmpty = cartCountTotal() === 0;
    const draftCart = cloneCartState(state.cart);
    const applyResult = applyRepeatSnapshotToDraftCart(normalizedSnapshot, draftCart);
    if (!applyResult?.ok) {
      if (applyResult?.reason === "unavailable") {
        showToast("\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      } else {
        showToast("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443");
      }
      return false;
    }
    state.cart = draftCart;
    if (wasEmpty) {
      clearAllAutoAddDismissed();
    }
    applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();
    if (typeof scheduleSyncAllProductCardsFromCart === "function") {
      scheduleSyncAllProductCardsFromCart();
    }
    renderCart();
    updateCartBadge();
    queueCartStockRecheck(previousCartSnapshot, {
      toastMessage: "\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut: true,
    });
    if (window.matchMedia("(max-width: 768px)").matches) {
      updateMobileDeliveryProgress();
    }
    showToast("\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443");
    if (navigator.vibrate) navigator.vibrate(10);
    return true;
  }

  async function addRepeatSnapshotToCart(snapshot) {
    return addRepeatSnapshotToCartLocal(snapshot);
  }

  async function repeatOrderItemsToCart(orderItems) {
    const list = Array.isArray(orderItems) ? orderItems : [];
    if (!list.length) return false;

    const previousCartSnapshot = cloneCartState(state.cart);
    const wasEmpty = cartCountTotal() === 0;
    const draftCart = cloneCartState(state.cart);

    let addedCount = 0;
    let unavailableCount = 0;
    let failedCount = 0;

    for (const orderItem of list) {
      const snapshot = buildRepeatActionSnapshot(orderItem);
      if (!snapshot) {
        failedCount += 1;
        continue;
      }
      const normalizedSnapshot = await normalizeRepeatSnapshotForCart(snapshot);
      const applyResult = applyRepeatSnapshotToDraftCart(normalizedSnapshot, draftCart);
      if (applyResult?.ok) {
        addedCount += 1;
      } else if (applyResult?.reason === "unavailable") {
        unavailableCount += 1;
      } else {
        failedCount += 1;
      }
    }

    if (addedCount <= 0) {
      if (unavailableCount > 0) {
        showToast("\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      } else {
        showToast("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443");
      }
      return false;
    }

    state.cart = draftCart;
    if (wasEmpty) {
      clearAllAutoAddDismissed();
    }
    applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();
    if (typeof scheduleSyncAllProductCardsFromCart === "function") {
      scheduleSyncAllProductCardsFromCart();
    }
    renderCart();
    updateCartBadge();
    queueCartStockRecheck(previousCartSnapshot, {
      toastMessage: "\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut: true,
    });
    if (window.matchMedia("(max-width: 768px)").matches) {
      updateMobileDeliveryProgress();
    }

    if (unavailableCount > 0 || failedCount > 0) {
      showToast("\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443. \u0427\u0430\u0441\u0442\u044c \u0442\u043e\u0432\u0430\u0440\u043e\u0432 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
    } else {
      showToast("\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443");
    }
    if (navigator.vibrate) navigator.vibrate(10);
    return true;
  }
  if (typeof window !== "undefined") {
    window.repeatOrderItemsToCart = repeatOrderItemsToCart;
  }

  function initRepeatOrderSwipeRow(
    container,
    content,
    {
      onAddToCart,
      onAddToFavorites,
      allowAddToCart = true,
      allowAddToFavorites = true,
      getCurrentSwiped = null,
      setCurrentSwiped = null,
    } = {}
  ) {
    if (!container || !content) return;

    let startX = 0;
    let startY = 0;
    let startTranslateX = 0;
    let translateX = 0;
    let isTracking = false;
    let isHorizontal = null;
    let moved = false;
    let busy = false;
    let suppressClick = false;
    let isTouchMode = false;

    const canAddToCart = Boolean(allowAddToCart && typeof onAddToCart === "function");
    const canAddToFavorites = Boolean(allowAddToFavorites && typeof onAddToFavorites === "function");

    const startThreshold = 8;
    const swipeLimitRatio = 0.82;
    const actionThresholdRatio = 0.5;
    const settleThresholdRatio = 0.45;
    const fallbackRevealWidth = 68;

    const rowWidth = () => Math.max(1, container.offsetWidth || 300);
    const revealWidth = () => {
      try {
        const raw = getComputedStyle(container).getPropertyValue("--favorite-swipe-reveal");
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      } catch {}
      return fallbackRevealWidth;
    };
    const actionThreshold = () => rowWidth() * actionThresholdRatio;
    const settleThreshold = () => revealWidth() * settleThresholdRatio;
    const maxOffset = () => Math.max(revealWidth() + 16, rowWidth() * swipeLimitRatio);

    const closeCurrentSwiped = (animate = true, exceptContainer = null) => {
      const active =
        typeof getCurrentSwiped === "function"
          ? getCurrentSwiped()
          : null;
      if (!active || active === exceptContainer) return;
      const closeFn = active.__orderSwipeClose;
      if (typeof closeFn === "function") {
        closeFn(animate);
      } else if (typeof setCurrentSwiped === "function") {
        setCurrentSwiped(null);
      }
    };

    function clearSwipeState() {
      container.classList.remove("is-swipe-right", "is-swipe-left", "is-armed-add", "is-armed-remove");
      container.style.removeProperty("--favorite-swipe-progress");
    }

    function setOpenState(mode) {
      container.classList.toggle("is-open-add", mode === "add");
      container.classList.toggle("is-open-remove", mode === "remove");
    }

    function isOpen() {
      return container.classList.contains("is-open-add") || container.classList.contains("is-open-remove");
    }

    function setTranslate(x) {
      translateX = x;
      content.style.transform = `translateX(${x}px)`;
      const absX = Math.abs(x);
      const threshold = actionThreshold();
      container.classList.toggle("is-swipe-right", canAddToCart && x > 0.5);
      container.classList.toggle("is-swipe-left", canAddToFavorites && x < -0.5);
      container.classList.toggle("is-armed-add", canAddToCart && x >= threshold);
      container.classList.toggle("is-armed-remove", canAddToFavorites && x <= -threshold);
      container.style.setProperty("--favorite-swipe-progress", String(Math.min(1, absX / Math.max(threshold, 1))));
    }

    function closeRow(animate = true) {
      if (animate) {
        content.style.transition = "transform 0.22s ease";
      } else {
        content.style.transition = "";
      }
      setTranslate(0);
      clearSwipeState();
      setOpenState(null);

      const active =
        typeof getCurrentSwiped === "function"
          ? getCurrentSwiped()
          : null;
      if (active === container && typeof setCurrentSwiped === "function") {
        setCurrentSwiped(null);
      }
      suppressClick = false;

      if (animate) {
        setTimeout(() => {
          if (!content.isConnected) return;
          content.style.transition = "";
        }, 240);
      }
    }

    function openRow(mode) {
      if (mode !== "add" && mode !== "remove") {
        closeRow(true);
        return;
      }
      if ((mode === "add" && !canAddToCart) || (mode === "remove" && !canAddToFavorites)) {
        closeRow(true);
        return;
      }
      closeCurrentSwiped(true, container);
      const targetX = mode === "add" ? revealWidth() : -revealWidth();
      content.style.transition = "transform 0.22s ease";
      setTranslate(targetX);
      clearSwipeState();
      setOpenState(mode);
      if (typeof setCurrentSwiped === "function") {
        setCurrentSwiped(container);
      }
      setTimeout(() => {
        if (!content.isConnected) return;
        content.style.transition = "";
      }, 240);
    }

    container.__orderSwipeClose = closeRow;

    function beginTrack(clientX, clientY, touchMode) {
      if (busy) return false;
      closeCurrentSwiped(true, container);
      isTracking = true;
      isHorizontal = null;
      moved = false;
      isTouchMode = !!touchMode;
      startX = clientX;
      startY = clientY;
      startTranslateX = translateX;
      content.style.transition = "";
      return true;
    }

    function handleMove(clientX, clientY, event) {
      if (!isTracking || busy) return;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      if (isHorizontal === null && (Math.abs(deltaX) > startThreshold || Math.abs(deltaY) > startThreshold)) {
        isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      if (isHorizontal === false) return;
      if (isHorizontal !== true) return;

      if (!moved) {
        clearSwipeState();
        setOpenState(null);
      }
      moved = true;
      suppressClick = true;
      if (event && event.cancelable) {
        event.preventDefault();
      }

      const limit = maxOffset();
      let nextX = startTranslateX + deltaX;
      if (!canAddToCart && nextX > 0) nextX = 0;
      if (!canAddToFavorites && nextX < 0) nextX = 0;
      nextX = Math.max(-limit, Math.min(limit, nextX));
      setTranslate(nextX);
    }

    async function runAction(direction) {
      if (busy) return;
      busy = true;
      container.classList.add("is-action-busy");

      const width = rowWidth();
      const reveal = revealWidth();
      const actionTravel = Math.min(width * 0.62, Math.max(reveal * 1.2, reveal + 18));
      content.style.transition = "transform 0.18s ease-out";
      setTranslate(direction === "favorite" ? -actionTravel : actionTravel);

      let ok = false;
      try {
        if (direction === "favorite") {
          ok = (await onAddToFavorites()) === true;
        } else {
          ok = (await onAddToCart()) === true;
        }
      } catch (e) {
        console.warn("Order details swipe action failed:", e);
        ok = false;
      } finally {
        busy = false;
        container.classList.remove("is-action-busy");
      }

      if (!content.isConnected) return;
      if (!ok) {
        closeRow(true);
        return;
      }
      closeRow(true);
    }

    async function finishTrack() {
      if (!isTracking || busy) return;
      isTracking = false;
      if (!moved) return;

      const threshold = actionThreshold();
      const snapThreshold = settleThreshold();
      const x = translateX;

      if (canAddToCart && x >= threshold) {
        if (navigator.vibrate) navigator.vibrate(10);
        await runAction("cart");
      } else if (canAddToFavorites && x <= -threshold) {
        if (navigator.vibrate) navigator.vibrate(10);
        await runAction("favorite");
      } else if (canAddToCart && x >= snapThreshold) {
        openRow("add");
      } else if (canAddToFavorites && x <= -snapThreshold) {
        openRow("remove");
      } else {
        closeRow(true);
      }
    }

    content.addEventListener(
      "click",
      (event) => {
        if (isOpen()) {
          suppressClick = false;
          event.preventDefault();
          event.stopPropagation();
          closeRow(true);
          return;
        }
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    content.addEventListener("touchstart", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      beginTrack(touch.clientX, touch.clientY, true);
    }, { passive: true });

    content.addEventListener("touchmove", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      handleMove(touch.clientX, touch.clientY, event);
    }, { passive: false });

    content.addEventListener("touchend", async () => {
      await finishTrack();
      isHorizontal = null;
      moved = false;
      isTouchMode = false;
      startTranslateX = translateX;
    }, { passive: true });

    content.addEventListener("touchcancel", () => {
      isTracking = false;
      isHorizontal = null;
      moved = false;
      isTouchMode = false;
      startTranslateX = translateX;
      closeRow(true);
    }, { passive: true });

    content.addEventListener("mousedown", (event) => {
      if (isTouchMode) return;
      if (event.button !== 0) return;
      beginTrack(event.clientX, event.clientY, false);
      const onMouseMove = (moveEvent) => {
        if (!isTracking || isTouchMode) return;
        handleMove(moveEvent.clientX, moveEvent.clientY, moveEvent);
      };
      const onMouseUp = async () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (!isTracking || isTouchMode) return;
        await finishTrack();
        isHorizontal = null;
        moved = false;
        startTranslateX = translateX;
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
  }

  async function openOrderItemForRepeat(orderItem, { onBack } = {}) {
    const prefillItem = buildRepeatPrefillItem(orderItem);
    if (!prefillItem) return;

    if (String(prefillItem.type || "") === "combo") {
      const comboId = Number(prefillItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return;
      await openComboDetails(comboId, { prefillItem, onBack });
      return;
    }

    const productId = Number(prefillItem.product_id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return;
    await openProductDetails(productId, { prefillItem, onBack });
  }

  function bindRepeatOrderItemRows(hostEl, orderItems, { onBack, enableSwipeActions = false } = {}) {
    if (!hostEl || !Array.isArray(orderItems) || !orderItems.length) return;
    const rows = hostEl.querySelectorAll(".shop-cart-items .cart-row");
    if (!rows || !rows.length) return;
    let currentSwipedContainer = null;
    const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;

    rows.forEach((row, idx) => {
      const orderItem = orderItems[idx];
      if (!orderItem) return;
      const prefillItem = buildRepeatPrefillItem(orderItem);
      if (!prefillItem) return;
      const snapshot = buildRepeatActionSnapshot(orderItem);
      const swipeSnapshot = buildSingleQtyRepeatSnapshot(snapshot);

      row.style.cursor = "pointer";
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");

      const openItem = async () => {
        try {
          await openOrderItemForRepeat(orderItem, { onBack });
        } catch (e) {
          console.warn("Failed to open order item details:", e);
        }
      };

      row.addEventListener("click", (event) => {
        if (event.target && event.target.closest("button, a, input, select, textarea, label")) return;
        event.preventDefault();
        void openItem();
      });

      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void openItem();
      });

      if (!enableSwipeActions || !swipeSnapshot) return;

      const addToCart = async () => {
        return await addRepeatSnapshotToCart(swipeSnapshot);
      };

      const addToFavorites = async () => {
        return await addRepeatSnapshotToFavorites(swipeSnapshot);
      };

      if (!isMobileViewport) {
        row.classList.add("cart-row--repeat-desktop-actions");
        const existingActions = row.querySelector(".shop-order-repeat-desktop-actions");
        if (existingActions) existingActions.remove();

        const actions = document.createElement("div");
        actions.className = "shop-order-repeat-desktop-actions";

        const addCartAction = document.createElement("button");
        addCartAction.type = "button";
        addCartAction.className = "shop-order-repeat-desktop-action";
        addCartAction.setAttribute("aria-label", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u043a\u043e\u0440\u0437\u0438\u043d\u0443");
        addCartAction.innerHTML = '<i class="fas fa-shopping-cart"></i>';

        const addFavoriteAction = document.createElement("button");
        addFavoriteAction.type = "button";
        addFavoriteAction.className = "shop-order-repeat-desktop-action";
        addFavoriteAction.setAttribute("aria-label", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435");
        addFavoriteAction.innerHTML = '<i class="fas fa-heart"></i>';

        addCartAction.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await addToCart();
        });

        addFavoriteAction.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await addToFavorites();
        });

        actions.appendChild(addCartAction);
        actions.appendChild(addFavoriteAction);
        row.appendChild(actions);
        return;
      }

      const rowParent = row.parentElement;
      if (!rowParent) return;

      const swipeContainer = document.createElement("div");
      swipeContainer.className = "shop-favorite-swipe-container shop-order-repeat-swipe-container";

      const addCartAction = document.createElement("button");
      addCartAction.type = "button";
      addCartAction.className = "shop-favorite-swipe-action shop-favorite-swipe-action--add";
      addCartAction.setAttribute("aria-label", "Добавить в корзину");
      addCartAction.innerHTML = '<i class="fas fa-shopping-cart"></i>';
      swipeContainer.appendChild(addCartAction);

      const addFavoriteAction = document.createElement("button");
      addFavoriteAction.type = "button";
      addFavoriteAction.className = "shop-favorite-swipe-action shop-favorite-swipe-action--remove";
      addFavoriteAction.setAttribute("aria-label", "Добавить в избранное");
      addFavoriteAction.innerHTML = '<i class="fas fa-heart"></i>';
      swipeContainer.appendChild(addFavoriteAction);

      const content = document.createElement("div");
      content.className = "shop-favorite-swipe-content";
      swipeContainer.appendChild(content);

      rowParent.insertBefore(swipeContainer, row);
      content.appendChild(row);

      addCartAction.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await addToCart();
        const closeFn = swipeContainer.__orderSwipeClose;
        if (typeof closeFn === "function") closeFn(true);
      });

      addFavoriteAction.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await addToFavorites();
        const closeFn = swipeContainer.__orderSwipeClose;
        if (typeof closeFn === "function") closeFn(true);
      });

      initRepeatOrderSwipeRow(swipeContainer, content, {
        onAddToCart: addToCart,
        onAddToFavorites: addToFavorites,
        allowAddToCart: true,
        allowAddToFavorites: true,
        getCurrentSwiped: () => currentSwipedContainer,
        setCurrentSwiped: (next) => {
          currentSwipedContainer = next || null;
        },
      });
    });
  }
  if (typeof window !== "undefined") {
    window.bindRepeatOrderItemRows = bindRepeatOrderItemRows;
  }

  function buildProfileContent({ host, me, onLogout, initialTab }) {
    host.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "shop-profile";

    const top = document.createElement("div");
    top.className = "shop-profile-top";

    const photo = document.createElement("div");
    photo.className = "shop-profile-photo";

    const photoImg = document.createElement("img");
    photoImg.className = "shop-profile-photo-img hidden";
    photoImg.alt = "Фото профиля";

    const photoPlaceholder = document.createElement("div");
    photoPlaceholder.className = "shop-profile-photo-placeholder";
    photoPlaceholder.textContent = "Фото профиля";

    const photoInput = document.createElement("input");
    photoInput.type = "file";
    photoInput.accept = "image/*";
    photoInput.className = "hidden";

    const photoActions = document.createElement("div");
    photoActions.className = "shop-profile-photo-actions hidden";

    const photoBtn = document.createElement("button");
    photoBtn.type = "button";
    photoBtn.className = "btn shop-profile-photo-btn";
    photoBtn.textContent = "Загрузить фото";

    const photoRemoveBtn = document.createElement("button");
    photoRemoveBtn.type = "button";
    photoRemoveBtn.className = "btn shop-profile-photo-btn shop-profile-photo-btn--ghost";
    photoRemoveBtn.textContent = "Удалить фото";

    photo.appendChild(photoImg);
    photo.appendChild(photoPlaceholder);
    photo.appendChild(photoInput);
    photoActions.appendChild(photoBtn);
    photoActions.appendChild(photoRemoveBtn);

    const photoWrap = document.createElement("div");
    photoWrap.className = "shop-profile-photo-wrap";
    photoWrap.appendChild(photo);
    photoWrap.appendChild(photoActions);
    const photoMenu = document.createElement("div");
    photoMenu.className = "shop-profile-menu shop-profile-photo-menu hidden";
    photoMenu.innerHTML = `
      <button class="shop-profile-menu-item" data-role="photo-upload" type="button">Загрузить фото</button>
      <button class="shop-profile-menu-item" data-role="photo-remove" type="button">Удалить фото</button>
    `;
    photoWrap.appendChild(photoMenu);
    top.appendChild(photoWrap);

    const info = document.createElement("div");
    info.className = "shop-profile-info";

    function addLine(title, value) {
      const line = document.createElement("div");
      line.className = "shop-profile-line";
      const t = document.createElement("div");
      t.className = "shop-profile-line-title";
      t.textContent = title;
      const v = document.createElement("div");
      v.className = "shop-profile-line-value";
      v.textContent = value;
      line.appendChild(t);
      line.appendChild(v);
      info.appendChild(line);
      return v;
    }

    const nameLine = document.createElement("div");
    nameLine.className = "shop-profile-line";

    const nameTitle = document.createElement("div");
    nameTitle.className = "shop-profile-line-title";
    nameTitle.textContent = "Имя";

    const nameValue = document.createElement("div");
    nameValue.className = "shop-profile-line-value shop-profile-name-value";

    const nameText = document.createElement("span");
    nameText.className = "shop-profile-name-text";
    nameText.textContent = str(me?.name || "—");

    const nameEditBtn = document.createElement("button");
    nameEditBtn.type = "button";
    nameEditBtn.className = "btn btn-icon shop-profile-name-edit";
    nameEditBtn.setAttribute("aria-label", "Изменить имя");
    nameEditBtn.innerHTML = `<i class="fas fa-pencil"></i>`;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "control shop-profile-name-input hidden";
    nameInput.value = str(me?.name || "");

    const nameActions = document.createElement("div");
    nameActions.className = "shop-profile-name-actions shop-address-form-actions hidden";

    const nameSave = document.createElement("button");
    nameSave.type = "button";
    nameSave.className = "btn btn-primary";
    nameSave.textContent = "Сохранить";

    const nameCancel = document.createElement("button");
    nameCancel.type = "button";
    nameCancel.className = "btn";
    nameCancel.textContent = "Отмена";

    nameActions.appendChild(nameSave);
    nameActions.appendChild(nameCancel);

    nameValue.appendChild(nameText);
    nameValue.appendChild(nameEditBtn);
    nameValue.appendChild(nameInput);
    nameValue.appendChild(nameActions);

    nameLine.appendChild(nameTitle);
    nameLine.appendChild(nameValue);
    info.appendChild(nameLine);

    addLine("Телефон", me?.phone ? formatPhonePlus7(me.phone) : "—");
    addLine("Дата рождения", formatBirthdayDisplay(me?.birthday || ""));

    top.appendChild(info);
    wrap.appendChild(top);

    const tabs = document.createElement("div");
    tabs.className = "shop-profile-tabs";

    const bindProfileTabsWheelScroll = () => {
      if (!tabs || tabs.dataset.wheelBound === "1") return;
      const onWheel = (event) => {
        const maxScrollLeft = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
        if (maxScrollLeft <= 0) return;
        const deltaX = Number(event.deltaX || 0);
        const deltaY = Number(event.deltaY || 0);
        const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        if (!primaryDelta) return;
        const current = tabs.scrollLeft || 0;
        const next = Math.max(0, Math.min(maxScrollLeft, current + primaryDelta));
        if (Math.abs(next - current) < 0.5) return;
        event.preventDefault();
        tabs.scrollLeft = next;
      };
      tabs.addEventListener("wheel", onWheel, { passive: false });
      tabs.dataset.wheelBound = "1";
    };

    const tabAddresses = document.createElement("button");
    tabAddresses.type = "button";
    tabAddresses.className = "shop-profile-tab is-active";
    tabAddresses.textContent = "Адреса";
    tabAddresses.dataset.tab = "addresses";

    const tabOrders = document.createElement("button");
    tabOrders.type = "button";
    tabOrders.className = "shop-profile-tab";
    tabOrders.textContent = "Мои заказы";
    tabOrders.dataset.tab = "orders";

    const tabDiscounts = document.createElement("button");
    tabDiscounts.type = "button";
    tabDiscounts.className = "shop-profile-tab";
    tabDiscounts.textContent = "Скидки";
    tabDiscounts.dataset.tab = "discounts";

    const tabSettings = document.createElement("button");
    tabSettings.type = "button";
    tabSettings.className = "shop-profile-tab";
    tabSettings.textContent = "Настройки";
    tabSettings.dataset.tab = "settings";

    tabs.appendChild(tabAddresses);
    tabs.appendChild(tabOrders);
    tabs.appendChild(tabDiscounts);
    tabs.appendChild(tabSettings);
    bindProfileTabsWheelScroll();
    wrap.appendChild(tabs);

    const addressesPanel = document.createElement("div");
    addressesPanel.className = "shop-profile-tab-panel is-active";
    addressesPanel.dataset.tab = "addresses";

    const addressesList = document.createElement("div");
    addressesList.className = "shop-profile-list";
    addressesPanel.appendChild(addressesList);

    const addressFormToggle = document.createElement("button");
    addressFormToggle.type = "button";
    addressFormToggle.className = "shop-chip-btn shop-profile-address-toggle";
    addressFormToggle.textContent = "+ Новый адрес";
    addressesPanel.appendChild(addressFormToggle);

    const addressFormCard = document.createElement("div");
    addressFormCard.className = "shop-profile-card hidden";
    addressFormCard.innerHTML = `
      <div class="shop-address-form-grid">
        <div class="shop-address-form-row shop-address-form-row--full">
          <label class="field-label">Улица</label>
          <input class="control" data-a="street" type="text" />
        </div>
        <div class="shop-address-form-row shop-address-form-row--grid">
          <div class="shop-address-form-field">
            <label class="field-label">Дом</label>
            <input class="control" data-a="house" type="text" />
          </div>
          <div class="shop-address-form-field">
            <label class="field-label">Подъезд</label>
            <input class="control" data-a="entrance" type="text" />
          </div>
          <div class="shop-address-form-field">
            <label class="field-label">Этаж</label>
            <input class="control" data-a="floor" type="text" />
          </div>
          <div class="shop-address-form-field">
            <label class="field-label">Квартира</label>
            <input class="control" data-a="apartment" type="text" />
          </div>
        </div>
        <div class="shop-address-form-row shop-address-form-row--full">
          <label class="field-label">Комментарий</label>
          <input class="control" data-a="comment" type="text" />
        </div>
      </div>
      <button type="button" class="btn btn-primary" style="width:100%; margin-top:10px;" data-a="add">Добавить адрес</button>
    `;
    addressesPanel.appendChild(addressFormCard);

    const addBtn = $('[data-a="add"]', addressFormCard);
    let profileEditingId = null;

    const profileAddressFields = ["street", "house", "entrance", "floor", "apartment", "comment"];

    function setProfileAddressValues(values) {
      profileAddressFields.forEach((k) => {
        const el = $(`[data-a="${k}"]`, addressFormCard);
        if (el) el.value = str(values?.[k] || "");
      });
    }

    function openProfileAddressForm(address) {
      profileEditingId = address?.id ? Number(address.id) : null;
      setProfileAddressValues(address || {});
      addressFormCard.classList.remove("hidden");
      addressFormToggle.classList.add("hidden");
      if (addBtn) addBtn.textContent = profileEditingId ? "Сохранить" : "Добавить адрес";
    }

    function closeProfileAddressForm() {
      profileEditingId = null;
      setProfileAddressValues({});
      addressFormCard.classList.add("hidden");
      addressFormToggle.classList.remove("hidden");
      if (addBtn) addBtn.textContent = "Добавить адрес";
    }

    function openProfileAddressFormFromProfile(address) {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile) {
        showAddressFormView(address || null, address?.id || null, "profile");
        return;
      }
      const openForm = () => {
        openCartSheet();
        if (openCartSheetCtx?.showSheetAddressForm) {
          openCartSheetCtx.showSheetAddressForm(address || null, address?.id || null, "profile");
        }
      };
      if (window.AppModal?.isOpen?.()) {
        window.AppModal.close("sheet");
        setTimeout(openForm, 0);
      } else {
        openForm();
      }
    }

    addressFormToggle.addEventListener("click", () => {
      openProfileAddressFormFromProfile();
    });

    const ordersPanel = document.createElement("div");
    ordersPanel.className = "shop-profile-tab-panel";
    ordersPanel.dataset.tab = "orders";

    const ordersList = document.createElement("div");
    ordersList.className = "shop-profile-list";
    ordersPanel.appendChild(ordersList);
    const ordersDetailsHost = document.createElement("div");
    ordersDetailsHost.className = "shop-profile-order-details-host hidden";
    ordersPanel.appendChild(ordersDetailsHost);
    const orderDetailsViewCache = new Map();

    const PROFILE_ORDERS_PAGE_SIZE = 10;
    const profileOrdersSummary = { activeCount: 0, completedCount: 0 };
    let currentProfileOrderSwipedContainer = null;
    if (window.__shopProfileOrderSwipeOutsideHandler) {
      document.removeEventListener("pointerdown", window.__shopProfileOrderSwipeOutsideHandler, true);
      window.__shopProfileOrderSwipeOutsideHandler = null;
    }
    window.__shopProfileOrderSwipeOutsideHandler = (event) => {
      const active = currentProfileOrderSwipedContainer;
      if (!active) return;
      if (active.contains(event.target)) return;
      const closeFn = active.__orderSwipeClose;
      if (typeof closeFn === "function") {
        closeFn(true);
      } else {
        currentProfileOrderSwipedContainer = null;
      }
    };
    document.addEventListener("pointerdown", window.__shopProfileOrderSwipeOutsideHandler, true);
    const profileOrdersState = {
      active: { offset: 0, hasMore: false, loading: false, initialized: false, observer: null, statusFinal: 0 },
      completed: { offset: 0, hasMore: false, loading: false, initialized: false, observer: null, statusFinal: 1 },
    };
    const ordersRowCache = {
      active: new Map(),
      completed: new Map(),
    };

    function createOrdersSection({ title, emptyText, collapsible = false, collapsed = false }) {
      const root = document.createElement("div");
      root.className = "shop-profile-orders-section";
      root.style.marginBottom = "10px";

      const header = collapsible ? document.createElement("button") : document.createElement("div");
      if (collapsible) {
        header.type = "button";
        header.className = "btn";
        header.style.width = "100%";
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.padding = "10px 12px";
      } else {
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.padding = "4px 2px 8px";
      }

      const titleWrap = document.createElement("div");
      titleWrap.style.display = "flex";
      titleWrap.style.alignItems = "center";
      titleWrap.style.gap = "6px";

      const titleEl = document.createElement("div");
      titleEl.style.fontWeight = "700";
      titleEl.textContent = title;

      const countEl = document.createElement("span");
      countEl.className = "muted";

      titleWrap.appendChild(titleEl);
      titleWrap.appendChild(countEl);
      header.appendChild(titleWrap);

      const arrowEl = document.createElement("span");
      arrowEl.className = "muted";
      if (collapsible) {
        arrowEl.textContent = collapsed ? "▸" : "▾";
        header.appendChild(arrowEl);
      }

      const body = document.createElement("div");
      if (collapsible && collapsed) body.classList.add("hidden");

      const items = document.createElement("div");
      items.className = "shop-profile-list";
      body.appendChild(items);

      const emptyEl = document.createElement("div");
      emptyEl.className = "muted hidden";
      emptyEl.style.padding = "4px 2px";
      emptyEl.textContent = emptyText;
      emptyEl.dataset.defaultText = emptyText;
      body.appendChild(emptyEl);

      const anchor = document.createElement("div");
      anchor.className = "hidden";
      anchor.style.width = "100%";
      anchor.style.height = "1px";
      anchor.style.marginTop = "1px";
      body.appendChild(anchor);

      const loader = document.createElement("div");
      loader.className = "muted hidden";
      loader.style.textAlign = "center";
      loader.style.padding = "8px 0 4px";
      loader.textContent = "Загрузка…";
      body.appendChild(loader);

      root.appendChild(header);
      root.appendChild(body);

      return {
        root,
        header,
        titleEl,
        countEl,
        arrowEl,
        body,
        items,
        emptyEl,
        anchor,
        loader,
        collapsible,
        collapsed,
      };
    }

    const ordersActiveSection = createOrdersSection({
      title: "Действующие",
      emptyText: "Действующих заказов пока нет.",
      collapsible: false,
      collapsed: false,
    });
    const ordersCompletedSection = createOrdersSection({
      title: "Завершенные",
      emptyText: "Завершенных заказов пока нет.",
      collapsible: true,
      collapsed: true,
    });
    ordersList.appendChild(ordersActiveSection.root);
    ordersList.appendChild(ordersCompletedSection.root);

    function setOrdersSectionLoading(section, isLoading) {
      section.loader.classList.toggle("hidden", !isLoading);
    }

    function setOrdersSectionAnchorVisible(section, visible) {
      section.anchor.classList.toggle("hidden", !visible);
    }

    function setCompletedSectionCollapsed(collapsed) {
      ordersCompletedSection.collapsed = Boolean(collapsed);
      ordersCompletedSection.body.classList.toggle("hidden", ordersCompletedSection.collapsed);
      if (ordersCompletedSection.arrowEl) {
        ordersCompletedSection.arrowEl.textContent = ordersCompletedSection.collapsed ? "▸" : "▾";
      }
    }

    function updateOrdersSectionHeaders() {
      ordersActiveSection.countEl.textContent = `(${profileOrdersSummary.activeCount || 0})`;
      ordersCompletedSection.countEl.textContent = `(${profileOrdersSummary.completedCount || 0})`;
    }

    function ensureOrdersSectionObserver(sectionKey) {
      if (typeof IntersectionObserver !== "function") return;
      const section = sectionKey === "completed" ? ordersCompletedSection : ordersActiveSection;
      const state = profileOrdersState[sectionKey];
      if (!section || !state || state.observer) return;

      state.observer = new IntersectionObserver(
        (entries) => {
          if (!Array.isArray(entries) || entries.length === 0) return;
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          if (currentOrdersView !== "list") return;
          if (sectionKey === "completed" && ordersCompletedSection.collapsed) return;
          if (state.loading || !state.hasMore) return;
          loadOrdersSection(sectionKey, { reset: false });
        },
        { root: null, threshold: 0.01, rootMargin: "160px 0px 160px 0px" }
      );
      state.observer.observe(section.anchor);
    }

    // Панель скидок
    const discountsPanel = document.createElement("div");
    discountsPanel.className = "shop-profile-tab-panel";
    discountsPanel.dataset.tab = "discounts";

    const discountsList = document.createElement("div");
    discountsList.className = "shop-profile-list shop-profile-discounts-list";
    discountsPanel.appendChild(discountsList);

    const discountsEmpty = document.createElement("div");
    discountsEmpty.className = "shop-profile-empty hidden";
    discountsEmpty.textContent = "У вас пока нет активных скидок";
    discountsPanel.appendChild(discountsEmpty);

    const settingsPanel = document.createElement("div");
    settingsPanel.className = "shop-profile-tab-panel";
    settingsPanel.dataset.tab = "settings";

    const settingsWrap = document.createElement("div");
    settingsWrap.className = "shop-profile-settings";

    const themeRow = document.createElement("div");
    themeRow.className = "shop-profile-settings-row";

    const themeTitle = document.createElement("div");
    themeTitle.className = "shop-profile-settings-title";
    themeTitle.textContent = "Тема";

    const themeSwitch = document.createElement("label");
    themeSwitch.className = "switch";
    const themeInput = document.createElement("input");
    themeInput.type = "checkbox";
    themeInput.className = "switch-input";
    themeInput.checked = getCurrentTheme() === "dark";
    themeInput.addEventListener("change", () => {
      applyTheme(themeInput.checked ? "dark" : "light");
    });
    const themeUi = document.createElement("span");
    themeUi.className = "switch-ui";
    const themeText = document.createElement("span");
    themeText.className = "switch-text";
    themeText.textContent = "Тема";

    themeSwitch.appendChild(themeInput);
    themeSwitch.appendChild(themeUi);
    themeSwitch.appendChild(themeText);

    themeRow.appendChild(themeTitle);
    themeRow.appendChild(themeSwitch);
    settingsWrap.appendChild(themeRow);

    const updateRow = document.createElement("div");
    updateRow.className = "shop-profile-settings-row";
    const updateTitle = document.createElement("div");
    updateTitle.className = "shop-profile-settings-title";
    updateTitle.textContent = "Обновить приложение";
    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "btn btn-sm";
    updateBtn.textContent = "Обновить";
    updateBtn.addEventListener("click", () => {
      updateBtn.disabled = true;
      updateBtn.textContent = "…";
      window.location.reload();
    });
    updateRow.appendChild(updateTitle);
    updateRow.appendChild(updateBtn);
    settingsWrap.appendChild(updateRow);

    const maxLinkRow = document.createElement("div");
    maxLinkRow.className = "shop-profile-settings-row";
    const maxLinkLeft = document.createElement("div");
    maxLinkLeft.style.display = "grid";
    maxLinkLeft.style.gap = "2px";
    const maxLinkTitle = document.createElement("div");
    maxLinkTitle.className = "shop-profile-settings-title";
    maxLinkTitle.textContent = "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c MAX";
    const maxLinkHint = document.createElement("div");
    maxLinkHint.className = "muted";
    maxLinkHint.textContent = "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d";
    maxLinkLeft.appendChild(maxLinkTitle);
    maxLinkLeft.appendChild(maxLinkHint);

    const maxLinkBtn = document.createElement("button");
    maxLinkBtn.type = "button";
    maxLinkBtn.className = "btn btn-sm";
    maxLinkBtn.textContent = "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";

    let authOptionsLoaded = false;
    let maxLoginEnabled = false;
    let tgLoginEnabled = false;
    let settingsBootstrapLoaded = false;
    let settingsBootstrapPromise = null;

    function applyAuthSettingsVisibility() {
      maxLinkRow.style.display = maxLoginEnabled ? "" : "none";
      tgLinkRow.style.display = tgLoginEnabled ? "" : "none";
      phoneVerifyRow.style.display = (maxLoginEnabled || tgLoginEnabled) ? "" : "none";
    }

    async function loadAuthSettingsVisibility() {
      try {
        const json = await apiJson("/api/public/auth/options");
        const data = (json && json.data) || {};
        maxLoginEnabled = Boolean(data.max_login_enabled);
        tgLoginEnabled = Boolean(data.tg_login_enabled);
      } catch {
        maxLoginEnabled = false;
        tgLoginEnabled = false;
      } finally {
        authOptionsLoaded = true;
        applyAuthSettingsVisibility();
      }
    }

    async function loadSettingsBootstrap({ force = false } = {}) {
      if (force) {
        settingsBootstrapLoaded = false;
        settingsBootstrapPromise = null;
      }
      if (settingsBootstrapLoaded) return true;
      if (settingsBootstrapPromise) return settingsBootstrapPromise;

      settingsBootstrapPromise = (async () => {
        try {
          const json = await apiJson("/api/public/me/settings-bootstrap");
          const data = (json && json.data) || {};
          const auth = data.auth_options || {};
          const maxData = data.max || {};
          const tgData = data.tg || {};
          const phoneData = data.phone_verification || {};

          maxLoginEnabled = Boolean(auth.max_login_enabled);
          tgLoginEnabled = Boolean(auth.tg_login_enabled);
          authOptionsLoaded = true;
          applyAuthSettingsVisibility();

          setMaxLinkUi({
            linked: Boolean(maxData.linked),
            maxUserId: maxData.max_user_id || "",
          });
          setTgLinkUi({
            linked: Boolean(tgData.linked),
            tgUserId: tgData.telegram_user_id || "",
          });

          phoneVerifyVerified = Boolean(phoneData.verified);
          phoneVerifyAwaitingCode = !phoneVerifyVerified && Boolean(phoneData.expires_at);
          setPhoneVerifyUi();

          settingsBootstrapLoaded = true;
          return true;
        } catch {
          settingsBootstrapLoaded = false;
          return false;
        } finally {
          settingsBootstrapPromise = null;
        }
      })();

      return settingsBootstrapPromise;
    }

    let maxLinkBusy = false;
    let maxLinkPollTimer = null;

    function setMaxLinkUi(state) {
      const linked = Boolean(state && state.linked);
      const maxUserId = state && state.maxUserId ? String(state.maxUserId) : "";
      if (linked) {
        maxLinkBtn.disabled = false;
        maxLinkBtn.textContent = "\u041f\u0435\u0440\u0435\u043f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";
        maxLinkHint.textContent = `ID: ${maxUserId}`;
        return;
      }
      maxLinkBtn.disabled = Boolean(maxLinkBusy);
      maxLinkBtn.textContent = maxLinkBusy ? "\u2026" : "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";
      if (!maxLinkBusy) maxLinkHint.textContent = "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d";
    }

    async function loadMaxLinkStatus() {
      if (!settingsBootstrapLoaded) {
        const bootOk = await loadSettingsBootstrap();
        if (bootOk) return Boolean(maxLinkHint.textContent && maxLinkHint.textContent.startsWith("ID:"));
      }
      try {
        const json = await apiJson("/api/public/max/link-status");
        if (!json || json.ok === false) return false;
        if (json.linked && json.data && json.data.max_user_id) {
          setMaxLinkUi({ linked: true, maxUserId: json.data.max_user_id });
          return true;
        }
        setMaxLinkUi({ linked: false });
        return false;
      } catch {
        return false;
      }
    }

    maxLinkBtn.addEventListener("click", async () => {
      if (maxLinkBusy) return;
      maxLinkBusy = true;
      maxLinkHint.textContent = "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 \u0441\u0441\u044b\u043b\u043a\u0438\u2026";
      setMaxLinkUi({ linked: false });
      try {
        settingsBootstrapLoaded = false;
        const json = await apiJson("/api/public/auth/link-token", { method: "POST", body: { provider: "max" } });
        if (!json || json.ok === false || !json.link) {
          const errCode = json && json.error ? String(json.error) : "";
          if (errCode === "MAX_LOGIN_DISABLED") {
            alert("MAX login is disabled for this site");
          } else if (errCode === "MAX_BOT_NOT_CONFIGURED") {
            alert("\u0411\u043e\u0442 MAX \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430");
          } else {
            alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438");
          }
          return;
        }

        const link = String(json.link);
        try {
          const opened = window.open(link, "_blank", "noopener,noreferrer");
          if (!opened) return;
        } catch {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u0432\u043a\u043b\u0430\u0434\u043a\u0443. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.");
        }

        maxLinkHint.textContent = "\u041e\u0436\u0438\u0434\u0430\u0435\u043c \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0443\u2026";
        if (maxLinkPollTimer) clearInterval(maxLinkPollTimer);
        maxLinkPollTimer = setInterval(async () => {
          const linked = await loadMaxLinkStatus();
          if (linked && maxLinkPollTimer) {
            clearInterval(maxLinkPollTimer);
            maxLinkPollTimer = null;
          }
        }, 4000);
      } catch {
        alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0435 MAX");
      } finally {
        maxLinkBusy = false;
        setMaxLinkUi({ linked: false });
      }
    });

    maxLinkRow.appendChild(maxLinkLeft);
    maxLinkRow.appendChild(maxLinkBtn);
    settingsWrap.appendChild(maxLinkRow);

    const tgLinkRow = document.createElement("div");
    tgLinkRow.className = "shop-profile-settings-row";
    const tgLinkLeft = document.createElement("div");
    tgLinkLeft.style.display = "grid";
    tgLinkLeft.style.gap = "2px";
    const tgLinkTitle = document.createElement("div");
    tgLinkTitle.className = "shop-profile-settings-title";
    tgLinkTitle.textContent = "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c Telegram";
    const tgLinkHint = document.createElement("div");
    tgLinkHint.className = "muted";
    tgLinkHint.textContent = "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d";
    tgLinkLeft.appendChild(tgLinkTitle);
    tgLinkLeft.appendChild(tgLinkHint);

    const tgLinkBtn = document.createElement("button");
    tgLinkBtn.type = "button";
    tgLinkBtn.className = "btn btn-sm";
    tgLinkBtn.textContent = "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";

    let tgLinkBusy = false;
    let tgLinkPollTimer = null;

    function setTgLinkUi(state) {
      const linked = Boolean(state && state.linked);
      const tgUserId = state && state.tgUserId ? String(state.tgUserId) : "";
      if (linked) {
        tgLinkBtn.disabled = false;
        tgLinkBtn.textContent = "\u041f\u0435\u0440\u0435\u043f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";
        tgLinkHint.textContent = `ID: ${tgUserId}`;
        return;
      }
      tgLinkBtn.disabled = Boolean(tgLinkBusy);
      tgLinkBtn.textContent = tgLinkBusy ? "\u2026" : "\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c";
      if (!tgLinkBusy) tgLinkHint.textContent = "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d";
    }

    async function loadTgLinkStatus() {
      if (!settingsBootstrapLoaded) {
        const bootOk = await loadSettingsBootstrap();
        if (bootOk) return Boolean(tgLinkHint.textContent && tgLinkHint.textContent.startsWith("ID:"));
      }
      try {
        const json = await apiJson("/api/public/tg/link-status");
        if (!json || json.ok === false) return false;
        if (json.linked && json.data && json.data.telegram_user_id) {
          setTgLinkUi({ linked: true, tgUserId: json.data.telegram_user_id });
          return true;
        }
        setTgLinkUi({ linked: false });
        return false;
      } catch {
        return false;
      }
    }

    tgLinkBtn.addEventListener("click", async () => {
      if (tgLinkBusy) return;
      tgLinkBusy = true;
      tgLinkHint.textContent = "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 \u0441\u0441\u044b\u043b\u043a\u0438\u2026";
      setTgLinkUi({ linked: false });
      try {
        settingsBootstrapLoaded = false;
        const json = await apiJson("/api/public/auth/link-token", { method: "POST", body: { provider: "tg" } });
        if (!json || json.ok === false || !json.link) {
          const errCode = json && json.error ? String(json.error) : "";
          if (errCode === "TG_BOT_NOT_CONFIGURED") {
            alert("\u0411\u043e\u0442 Telegram \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430");
          } else {
            alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438");
          }
          return;
        }

        const link = String(json.link);
        try {
          const opened = window.open(link, "_blank", "noopener,noreferrer");
          if (!opened) return;
        } catch {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u0432\u043a\u043b\u0430\u0434\u043a\u0443. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.");
        }

        tgLinkHint.textContent = "\u041e\u0436\u0438\u0434\u0430\u0435\u043c \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0443\u2026";
        if (tgLinkPollTimer) clearInterval(tgLinkPollTimer);
        tgLinkPollTimer = setInterval(async () => {
          const linked = await loadTgLinkStatus();
          if (linked && tgLinkPollTimer) {
            clearInterval(tgLinkPollTimer);
            tgLinkPollTimer = null;
          }
        }, 4000);
      } catch {
        alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0435 Telegram");
      } finally {
        tgLinkBusy = false;
        setTgLinkUi({ linked: false });
      }
    });

    tgLinkRow.appendChild(tgLinkLeft);
    tgLinkRow.appendChild(tgLinkBtn);
    settingsWrap.appendChild(tgLinkRow);

    const phoneVerifyRow = document.createElement("div");
    phoneVerifyRow.className = "shop-profile-settings-row";
    const phoneVerifyLeft = document.createElement("div");
    phoneVerifyLeft.style.display = "grid";
    phoneVerifyLeft.style.gap = "2px";
    const phoneVerifyTitle = document.createElement("div");
    phoneVerifyTitle.className = "shop-profile-settings-title";
    phoneVerifyTitle.textContent = "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0442\u0435\u043b\u0435\u0444\u043e\u043d";
    const phoneVerifyHint = document.createElement("div");
    phoneVerifyHint.className = "muted";
    phoneVerifyHint.textContent = "\u041d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d";
    phoneVerifyLeft.appendChild(phoneVerifyTitle);
    phoneVerifyLeft.appendChild(phoneVerifyHint);

    const phoneVerifyAction = document.createElement("div");
    phoneVerifyAction.style.display = "flex";
    phoneVerifyAction.style.alignItems = "center";
    phoneVerifyAction.style.gap = "8px";

    const phoneVerifyBtn = document.createElement("button");
    phoneVerifyBtn.type = "button";
    phoneVerifyBtn.className = "btn btn-sm";
    phoneVerifyBtn.textContent = "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c";

    const phoneVerifyInput = document.createElement("input");
    phoneVerifyInput.type = "text";
    phoneVerifyInput.inputMode = "numeric";
    phoneVerifyInput.maxLength = 4;
    phoneVerifyInput.placeholder = "\u041a\u043e\u0434";
    phoneVerifyInput.className = "input";
    phoneVerifyInput.style.width = "92px";
    phoneVerifyInput.style.textAlign = "center";
    phoneVerifyInput.style.letterSpacing = "2px";
    phoneVerifyInput.style.display = "none";

    phoneVerifyAction.appendChild(phoneVerifyBtn);
    phoneVerifyAction.appendChild(phoneVerifyInput);

    let phoneVerifyBusy = false;
    let phoneVerifyVerified = false;
    let phoneVerifyAwaitingCode = false;

    function applyPhoneVerifyInputStateInvalid(invalid) {
      if (invalid) {
        phoneVerifyInput.style.borderColor = "#e74c3c";
      } else {
        phoneVerifyInput.style.borderColor = "";
      }
    }

    function setPhoneVerifyUi() {
      if (phoneVerifyVerified) {
        phoneVerifyHint.textContent = "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d";
        phoneVerifyBtn.style.display = "";
        phoneVerifyBtn.disabled = false;
        phoneVerifyBtn.textContent = "\u041f\u0435\u0440\u0435\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c";
        phoneVerifyInput.style.display = "none";
        return;
      }

      phoneVerifyHint.textContent = phoneVerifyAwaitingCode
        ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 4-\u0445 \u0437\u043d\u0430\u0447\u043d\u044b\u0439 \u043a\u043e\u0434 \u0438\u0437 MAX"
        : "\u041d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d";
      phoneVerifyBtn.style.display = phoneVerifyAwaitingCode ? "none" : "";
      phoneVerifyBtn.disabled = phoneVerifyBusy;
      phoneVerifyBtn.textContent = phoneVerifyBusy ? "\u2026" : "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c";
      phoneVerifyInput.style.display = phoneVerifyAwaitingCode ? "" : "none";
      phoneVerifyInput.disabled = phoneVerifyBusy;
    }

    async function loadPhoneVerifyStatus() {
      if (!settingsBootstrapLoaded) {
        const bootOk = await loadSettingsBootstrap();
        if (bootOk) return;
      }
      try {
        const json = await apiJson("/api/public/phone-verification/status");
        const verified = Boolean(json && json.data && json.data.verified);
        phoneVerifyVerified = verified;
        phoneVerifyAwaitingCode = !verified && Boolean(json && json.data && json.data.expires_at);
        setPhoneVerifyUi();
      } catch {
        phoneVerifyVerified = false;
        phoneVerifyAwaitingCode = false;
        setPhoneVerifyUi();
      }
    }

    async function submitPhoneVerifyCode() {
      const code = String(phoneVerifyInput.value || "").replace(/\D/g, "").slice(0, 4);
      if (code.length !== 4 || phoneVerifyBusy) return;
      phoneVerifyBusy = true;
      applyPhoneVerifyInputStateInvalid(false);
      setPhoneVerifyUi();
      try {
        const json = await apiJson("/api/public/phone-verification/verify", {
          method: "POST",
          body: { code },
        });
        if (json && json.ok !== false) {
          phoneVerifyVerified = true;
          phoneVerifyAwaitingCode = false;
          phoneVerifyInput.value = "";
          applyPhoneVerifyInputStateInvalid(false);
        } else {
          phoneVerifyInput.value = "";
          applyPhoneVerifyInputStateInvalid(true);
          phoneVerifyInput.focus();
        }
      } catch {
        phoneVerifyInput.value = "";
        applyPhoneVerifyInputStateInvalid(true);
        phoneVerifyInput.focus();
      } finally {
        phoneVerifyBusy = false;
        setPhoneVerifyUi();
      }
    }

    phoneVerifyBtn.addEventListener("click", async () => {
      if (phoneVerifyBusy) return;
      phoneVerifyBusy = true;
      setPhoneVerifyUi();
      try {
        settingsBootstrapLoaded = false;
        const json = await apiJson("/api/public/phone-verification/send", { method: "POST", body: {} });
        if (json && json.ok !== false) {
          phoneVerifyAwaitingCode = true;
          phoneVerifyVerified = false;
          phoneVerifyInput.value = "";
          applyPhoneVerifyInputStateInvalid(false);
          setPhoneVerifyUi();
          phoneVerifyInput.focus();
        } else {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043a\u043e\u0434 \u0432 MAX");
        }
      } catch (e) {
        if (String(e && e.message || "") === "MAX_NOT_LINKED") {
          alert("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u0440\u0438\u0432\u044f\u0436\u0438\u0442\u0435 MAX");
        } else {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043a\u043e\u0434 \u0432 MAX");
        }
      } finally {
        phoneVerifyBusy = false;
        setPhoneVerifyUi();
      }
    });

    phoneVerifyInput.addEventListener("input", () => {
      const normalized = String(phoneVerifyInput.value || "").replace(/\D/g, "").slice(0, 4);
      phoneVerifyInput.value = normalized;
      applyPhoneVerifyInputStateInvalid(false);
      if (normalized.length === 4) {
        submitPhoneVerifyCode();
      }
    });

    phoneVerifyRow.appendChild(phoneVerifyLeft);
    phoneVerifyRow.appendChild(phoneVerifyAction);
    settingsWrap.appendChild(phoneVerifyRow);

    const logoutRow = document.createElement("div");
    logoutRow.className = "shop-profile-settings-row";
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "btn shop-profile-logout-btn";
    logoutBtn.textContent = "Выйти";
    logoutBtn.addEventListener("click", async () => {
      if (typeof onLogout === "function") onLogout();
    });
    logoutRow.appendChild(logoutBtn);
    settingsWrap.appendChild(logoutRow);

    settingsPanel.appendChild(settingsWrap);

    wrap.appendChild(addressesPanel);
    wrap.appendChild(ordersPanel);
    wrap.appendChild(discountsPanel);
    wrap.appendChild(settingsPanel);

    host.appendChild(wrap);

    // Функция загрузки скидок клиента
    async function loadCustomerDiscounts() {
      try {
        const res = await apiJson('/api/public/me/discounts');
        if (!res.ok) throw new Error(res.error || 'Error');
        return res.data || [];
      } catch (err) {
        console.error('loadCustomerDiscounts error:', err);
        return [];
      }
    }

    // Функция рендеринга скидок
    function renderCustomerDiscounts(discounts) {
      discountsList.innerHTML = '';
      if (!discounts.length) {
        discountsEmpty.classList.remove('hidden');
        return;
      }
      discountsEmpty.classList.add('hidden');

      discounts.forEach((d) => {
        const card = document.createElement('div');
        card.className = 'shop-profile-card shop-profile-discount-card';

        const header = document.createElement('div');
        header.className = 'shop-profile-discount-header';

        const title = document.createElement('div');
        title.className = 'shop-profile-discount-title';
        title.textContent = d.title || 'Скидка';

        const badge = document.createElement('span');
        badge.className = 'sp-discount-badge';
        if (d.discount_type === 'percent') {
          badge.textContent = `-${Math.round(d.discount_value)}%`;
        } else if (d.discount_type === 'fixed') {
          badge.textContent = `-${d.discount_value} ₽`;
        } else if (d.discount_type === 'special_price') {
          badge.textContent = `${d.discount_value} ₽`;
        }
        header.appendChild(title);
        header.appendChild(badge);
        card.appendChild(header);

        if (d.description) {
          const desc = document.createElement('div');
          desc.className = 'shop-profile-discount-desc';
          desc.textContent = d.description;
          card.appendChild(desc);
        }

        const details = document.createElement('div');
        details.className = 'shop-profile-discount-details';

        if (d.apply_to === 'order') {
          const applyLine = document.createElement('div');
          applyLine.textContent = 'Применяется: на весь заказ';
          details.appendChild(applyLine);
        } else if (d.apply_to === 'product') {
          const applyLine = document.createElement('div');
          applyLine.textContent = 'Применяется: на товары';
          details.appendChild(applyLine);
        }

        if (d.min_order_amount) {
          const minLine = document.createElement('div');
          minLine.textContent = `Мин. сумма заказа: ${d.min_order_amount} ₽`;
          details.appendChild(minLine);
        }

        if (d.ends_at) {
          const dateLine = document.createElement('div');
          const endDate = new Date(d.ends_at);
          dateLine.textContent = `Действует до: ${endDate.toLocaleDateString('ru-RU')}`;
          details.appendChild(dateLine);
        }

        if (details.children.length > 0) {
          card.appendChild(details);
        }

        discountsList.appendChild(card);
      });
    }

    let discountsLoaded = false;

    function setActiveTab(tab) {
      [tabAddresses, tabOrders, tabDiscounts, tabSettings].forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
      [addressesPanel, ordersPanel, discountsPanel, settingsPanel].forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tab === tab));
      const activeBtn = tabs.querySelector('.shop-profile-tab.is-active');
      if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
        activeBtn.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      
      // Загружаем скидки при первом открытии таба
      if (tab === 'discounts' && !discountsLoaded) {
        discountsLoaded = true;
        discountsList.innerHTML = '<div class="muted">Загрузка…</div>';
        loadCustomerDiscounts().then(renderCustomerDiscounts);
      }
      if (tab === "settings") {
        loadSettingsBootstrap().then((ok) => {
          if (ok) return;
          if (!authOptionsLoaded) {
            loadAuthSettingsVisibility().then(() => {
              if (maxLoginEnabled) loadMaxLinkStatus();
              if (tgLoginEnabled) loadTgLinkStatus();
              if (maxLoginEnabled || tgLoginEnabled) loadPhoneVerifyStatus();
            });
            return;
          }
          applyAuthSettingsVisibility();
          if (maxLoginEnabled) loadMaxLinkStatus();
          if (tgLoginEnabled) loadTgLinkStatus();
          if (maxLoginEnabled || tgLoginEnabled) loadPhoneVerifyStatus();
        });
      }
    }

    tabAddresses.addEventListener("click", () => setActiveTab("addresses"));
    tabOrders.addEventListener("click", () => setActiveTab("orders"));
    tabDiscounts.addEventListener("click", () => setActiveTab("discounts"));
    tabSettings.addEventListener("click", () => setActiveTab("settings"));

    async function reloadAddresses() {
      addressesList.innerHTML = `<div class="muted">Загрузка…</div>`;
      try {
        const json = await apiJson("/api/public/me/addresses");
        const list = Array.isArray(json.data) ? json.data : [];
        if (!list.length) {
          addressesList.innerHTML = `<div class="muted">Адресов пока нет.</div>`;
          return;
        }

        addressesList.innerHTML = "";
        list.forEach((a) => {
          const row = document.createElement("div");
          row.className = "shop-profile-card shop-profile-card--compact";
          if (Number(a.is_default) === 1) row.classList.add("is-default");

          const txt = [
            a.city ? str(a.city) : "",
            `${str(a.street)} ${str(a.house)}`.trim(),
            a.entrance ? `подъезд ${a.entrance}` : "",
            a.floor ? `этаж ${a.floor}` : "",
            a.apartment ? `кв ${a.apartment}` : "",
          ].filter(Boolean).join(", ");

          const card = document.createElement("div");
          card.className = "shop-address-card";

          const main = document.createElement("div");
          main.className = "shop-address-card-main";

          const title = document.createElement("div");
          title.className = "shop-address-card-title";
          title.appendChild(document.createTextNode(txt || ""));
          if (Number(a.is_default) === 1) {
            const badge = document.createElement("span");
            badge.className = "muted";
            badge.textContent = " • основной";
            title.appendChild(badge);
          }
          main.appendChild(title);

          if (a.comment) {
            const sub = document.createElement("div");
            sub.className = "shop-address-card-sub";
            sub.textContent = str(a.comment);
            main.appendChild(sub);
          }

          const actions = document.createElement("div");
          actions.className = "shop-address-actions shop-address-actions--compact";

          const bDef = document.createElement("button");
          bDef.type = "button";
          bDef.className = "shop-address-action-icon is-default";
          bDef.title = Number(a.is_default) === 1 ? "Основной адрес" : "Сделать основным";
          bDef.innerHTML = `<i class="fas fa-star"></i>`;
          if (Number(a.is_default) === 1) {
            bDef.classList.add("is-active");
          } else {
            bDef.addEventListener("click", async (e) => {
              e.stopPropagation();
              try {
                await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
                await reloadAddresses();
                await refreshAddressState({ force: true });
              } catch (e) {
                alert("Не удалось изменить основной адрес");
              }
            });
          } 
          actions.appendChild(bDef);

          const bEdit = document.createElement("button");
          bEdit.type = "button";
          bEdit.className = "shop-address-action-icon";
          bEdit.title = "Редактировать";
          bEdit.innerHTML = `<i class="fas fa-pen"></i>`;
          bEdit.addEventListener("click", (e) => {
            e.stopPropagation();
            openProfileAddressFormFromProfile(a);
          });
          actions.appendChild(bEdit);

          const bDel = document.createElement("button");
          bDel.type = "button";
          bDel.className = "shop-address-action-icon is-danger";
          bDel.title = "Удалить";
          bDel.innerHTML = `<i class="fas fa-times"></i>`;
          attachDoubleDelete(bDel, async () => {
            try {
              await apiJson(`/api/public/me/addresses/${a.id}`, { method: "DELETE" });
              await reloadAddresses();
              await refreshAddressState({ force: true });
            } catch (e) {
              alert("Не удалось удалить адрес");
            }
          });
          actions.appendChild(bDel);

          card.appendChild(main);
          card.appendChild(actions);
          row.appendChild(card);
          addressesList.appendChild(row);
        });
      } catch (e) {
        addressesList.innerHTML = `<div class="muted">Ошибка загрузки адресов</div>`;
      }
    }

    let currentOrdersView = "list"; // "list" | "details"
    let currentOrderId = null;

    async function loadOrderDetails(orderId) {
      try {
        const json = await apiJson(`/api/public/me/orders/${orderId}`);
        return json.data || null;
      } catch (e) {
        console.error("Failed to load order details:", e);
        return null;
      }
    }

    // formatOrderItem уже определена в глобальной области выше (строка 555)
    // Не переопределяем её здесь, чтобы избежать конфликтов

    async function showOrderDetails(orderId) {
      currentOrdersView = "details";
      currentOrderId = orderId;
      resetOrderDetailsTransientUi();
      const isModalOrderDetails = document.querySelector(".app-modal") && document.querySelector(".app-modal").getAttribute("aria-hidden") !== "true";
      if (isModalOrderDetails) {
        sheetNavigationState.type = 'profile';
        sheetNavigationState.screen = 'orderDetails';
        sheetNavigationState.data = { orderId };
        if (typeof queueMobileUiStateSync === "function") {
          queueMobileUiStateSync("showProfileOrderDetails");
        } else if (typeof window.queueShopMobileUiStateSync === "function") {
          window.queueShopMobileUiStateSync("showProfileOrderDetails");
        }
      }
      if (!isModalOrderDetails && typeof showProfileView === "function") {
        showProfileView();
      }
      
      // Скрываем верхнюю часть профиля и вкладки
      if (top) top.classList.add("hidden");
      if (tabs) tabs.classList.add("hidden");
      
      // Активируем панель заказов
      setActiveTab("orders");
      const orderViewKey = String(orderId);
      let detailView = orderDetailsViewCache.get(orderViewKey);
      if (!detailView) {
        detailView = document.createElement("div");
        detailView.className = "shop-profile-order-details-view";
        orderDetailsViewCache.set(orderViewKey, detailView);
        ordersDetailsHost.appendChild(detailView);
      }
      Array.from(ordersDetailsHost.children).forEach((node) => node.classList.add("hidden"));
      detailView.classList.remove("hidden");
      ordersList.classList.add("hidden");
      ordersDetailsHost.classList.remove("hidden");
      
      // Заменяем содержимое ordersPanel на детали заказа
      detailView.innerHTML = `<div class="muted">Загрузка…</div>`;
      
      const order = await loadOrderDetails(orderId);
      if (!order) {
        detailView.innerHTML = `<div class="muted">Не удалось загрузить детали заказа</div>`;
        return;
      }

      let html = `<div class="shop-order-details">`;
      
      // Заголовок с номером и статусом
      html += `<div class="shop-order-details-header">`;
      html += `<div class="shop-order-details-title">Заказ #${order.id}</div>`;
      if (order.status_title) {
        html += `<div class="shop-order-details-status">${escapeHtml(order.status_title)}</div>`;
      }
      html += `</div>`;
      
      // Информация о заказе
      html += `<div class="shop-order-details-info">`;
      html += `<div class="shop-order-info-row">`;
      html += `<div class="shop-order-info-label">Дата и время</div>`;
      html += `<div class="shop-order-info-value">${new Date(order.created_at).toLocaleString("ru-RU")}</div>`;
      html += `</div>`;
      
      if (order.method_title) {
        html += `<div class="shop-order-info-row">`;
        html += `<div class="shop-order-info-label">Способ доставки</div>`;
        html += `<div class="shop-order-info-value">${escapeHtml(order.method_title)}</div>`;
        html += `</div>`;
      }
      
      if (order.time_option_title) {
        html += `<div class="shop-order-info-row">`;
        html += `<div class="shop-order-info-label">Время доставки</div>`;
        html += `<div class="shop-order-info-value">${escapeHtml(order.time_option_title)}</div>`;
        html += `</div>`;
      }
      
      if (order.scheduled_at) {
        html += `<div class="shop-order-info-row">`;
        html += `<div class="shop-order-info-label">Запланировано на</div>`;
        html += `<div class="shop-order-info-value">${new Date(order.scheduled_at).toLocaleString("ru-RU")}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
      
      // Адрес доставки
      if (order.address) {
        html += `<div class="shop-order-details-section">`;
        html += `<div class="shop-order-section-title">Адрес доставки</div>`;
        html += `<div class="shop-order-address">${escapeHtml(order.address)}</div>`;
        html += `</div>`;
      }
      
      // Товары (используем формат корзины)
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        html += `<div class="shop-order-details-section">`;
        html += `<div class="shop-order-section-title">Товары</div>`;
        html += `<div class="shop-cart-items">`;
        order.items.forEach(item => {
          html += formatOrderItem(item);
        });
        html += `</div>`;
        html += `</div>`;
      }
      
      // Дополнительная информация
      if (order.cutlery_qty && Number(order.cutlery_qty) > 0) {
        html += `<div class="shop-order-details-section">`;
        html += `<div class="shop-order-info-row">`;
        html += `<div class="shop-order-info-label">Приборы</div>`;
        html += `<div class="shop-order-info-value">${order.cutlery_qty} шт.</div>`;
        html += `</div>`;
        html += `</div>`;
      }
      
      // Комментарий
      if (order.comment) {
        html += `<div class="shop-order-details-section">`;
        html += `<div class="shop-order-section-title">Комментарий</div>`;
        html += `<div class="shop-order-comment">${escapeHtml(order.comment)}</div>`;
        html += `</div>`;
      }
      
      // Суммы (единый блок как в активных заказах)
      html += renderOrderSummaryBlock(order);
      
      html += `</div>`;
      
      detailView.innerHTML = html;
      bindOrderSummaryDiscountToggles(detailView);
      const reopenProfileOrderDetails = () => {
        const isMobileProfile = window.matchMedia("(max-width: 768px)").matches;
        if (!isMobileProfile) {
          void showOrderDetails(orderId);
          return;
        }
        if (typeof setActiveNav === "function") setActiveNav("profile");
        const reopenedCtx = openProfileModal(me, { initialTab: "orders" });
        setTimeout(() => {
          const ctx =
            reopenedCtx && typeof reopenedCtx.showOrderDetails === "function"
              ? reopenedCtx
              : window._profileContext;
          if (ctx && typeof ctx.showOrderDetails === "function") {
            ctx.showOrderDetails(orderId);
          }
        }, 0);
      };
      bindRepeatOrderItemRows(
        detailView,
        Array.isArray(order.items) ? order.items : [],
        { onBack: reopenProfileOrderDetails, enableSwipeActions: true }
      );
      showMobileOrderDetailsActions(order);
      
      // Проверяем, открыто ли модальное окно
      const isModal = isModalOrderDetails;
      
      // Добавляем пустое поле 200px внизу для скролла в модальном окне
      if (isModal) {
        const spacer = document.createElement("div");
        spacer.style.height = "200px";
        detailView.appendChild(spacer);
      }
      
      if (isModal) {
        // Модальное окно: используем setSheetHeaderMode
        const titleEl = document.querySelector(".app-modal-title") || document.querySelector(".modal-title") || document.querySelector("[data-modal-title]");
        if (titleEl) {
          titleEl.textContent = "Детали заказа";
          titleEl.classList.remove("hidden");
        }
        
        // Скрываем шестеренку (настройки профиля) в модальном окне
        const settingsBtn = document.querySelector(".shop-profile-modal-settings");
        if (settingsBtn) settingsBtn.classList.add("hidden");
        const profileActions = document.querySelector(".shop-profile-header-actions");
        if (profileActions) profileActions.classList.add("hidden");
        
        setSheetHeaderMode("order", {
          onBack: () => showOrdersList()
        });
      } else {
        // Десктоп: используем setCartHeader
        setCartHeader({ 
          title: "Детали заказа", 
          showAddressChip: false, 
          showProfileActions: false, 
          showBack: true 
        });
        
        // Настраиваем обработчик кнопки "Назад"
        // Используем флаг для переопределения стандартного поведения
        if (elCartBackBtn) {
          // Сохраняем контекст для проверки в глобальном обработчике
          window._isViewingOrderDetails = true;
          window._showOrdersListCallback = showOrdersList;
        }
        bindDesktopOrderDetailsFooter(order);
      }
    }

    function showOrdersList() {
      currentOrdersView = "list";
      currentOrderId = null;
      resetOrderDetailsTransientUi();
      
      // Сбрасываем флаги для кнопки "Назад"
      window._isViewingOrderDetails = false;
      window._showOrdersListCallback = null;
      
      // Показываем верхнюю часть профиля и вкладки обратно
      if (top) top.classList.remove("hidden");
      if (tabs) tabs.classList.remove("hidden");
      
      // Активируем вкладку "История заказов"
      setActiveTab("orders");
      
      // Восстанавливаем ordersPanel с ordersList
      ordersDetailsHost.classList.add("hidden");
      ordersList.classList.remove("hidden");
      
      // Проверяем, открыто ли модальное окно
      const isModal = document.querySelector(".app-modal") && document.querySelector(".app-modal").getAttribute("aria-hidden") !== "true";
      if (isModal) {
        sheetNavigationState.type = 'profile';
        sheetNavigationState.screen = 'ordersList';
        sheetNavigationState.data = null;
        if (typeof queueMobileUiStateSync === "function") {
          queueMobileUiStateSync("showProfileOrdersList");
        } else if (typeof window.queueShopMobileUiStateSync === "function") {
          window.queueShopMobileUiStateSync("showProfileOrdersList");
        }
      }
      if (!isModal && typeof showProfileView === "function") {
        showProfileView();
      }
      
      if (isModal) {
        // Модальное окно: восстанавливаем заголовок и скрываем кнопку "Назад"
        const titleEl = document.querySelector(".app-modal-title") || document.querySelector(".modal-title") || document.querySelector("[data-modal-title]");
        if (titleEl) {
          titleEl.textContent = "Профиль";
        }
        
        // Показываем шестеренку обратно
        const settingsBtn = document.querySelector(".shop-profile-modal-settings");
        if (settingsBtn) settingsBtn.classList.remove("hidden");
        const profileActions = document.querySelector(".shop-profile-header-actions");
        if (profileActions) profileActions.classList.remove("hidden");
        
        setSheetHeaderMode("", {});
      } else {
        // Десктоп: восстанавливаем заголовок
        setCartHeader({ 
          title: "Профиль", 
          showAddressChip: false, 
          showProfileActions: true, 
          showBack: false 
        });
      }
      
      // Перезагружаем список заказов
      const activeState = profileOrdersState.active;
      const completedState = profileOrdersState.completed;
      const shouldReloadOrders =
        !activeState?.initialized &&
        !completedState?.initialized &&
        !activeState?.loading &&
        !completedState?.loading;
      if (shouldReloadOrders) {
        reloadOrders({ reset: true });
      }
    }

    function collectOrderPreviewPhotos(items, maxPhotos = 40) {
      const out = [];
      const pushPhoto = (raw) => {
        if (out.length >= maxPhotos) return;
        const src = str(raw || "").trim();
        if (!src) return;
        out.push(src);
      };

      (Array.isArray(items) ? items : []).forEach((item) => {
        if (out.length >= maxPhotos) return;
        const itemType = str(item?.type || "").trim().toLowerCase();
        const isCombo =
          itemType === "combo" ||
          Number(item?.combo_id || 0) > 0 ||
          Array.isArray(item?.selections);

        if (isCombo) {
          const selections = Array.isArray(item?.selections) ? item.selections : [];
          if (selections.length) {
            selections.forEach((sel) => {
              pushPhoto(sel?.product_photo || (Array.isArray(sel?.photos) ? sel.photos[0] : ""));
            });
          } else {
            const comboPhotos = Array.isArray(item?.photos) ? item.photos : [];
            comboPhotos.forEach((photo) => pushPhoto(photo));
          }
          return;
        }

        const productPhotos = Array.isArray(item?.photos) ? item.photos : [];
        if (productPhotos.length) {
          pushPhoto(productPhotos[0]);
          return;
        }
        pushPhoto(item?.product_photo || item?.photo || "");
      });

      return out;
    }

    function renderProfileOrderRow(o) {
      const row = document.createElement("div");
      row.className = "shop-profile-card";
      row.style.cursor = "pointer";

      const previewPhotos = collectOrderPreviewPhotos(o?.items, 40);
      const orderDate = new Date(o.created_at);
      const orderDateText = Number.isFinite(orderDate.getTime())
        ? orderDate.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      row.innerHTML = `
        <div><strong>Заказ #${o.id}</strong> <span class="muted">• ${o.status_title || "—"}</span></div>
        <div class="muted">${orderDateText}</div>
        <div><strong>${money(o.total_price || 0)}</strong></div>
      `;

      if (previewPhotos.length) {
        const photosRow = document.createElement("div");
        photosRow.className = "shop-profile-order-photos";
        previewPhotos.forEach((src) => {
          const img = document.createElement("img");
          img.className = "shop-profile-order-photo";
          img.src = src;
          img.alt = "";
          img.loading = "lazy";
          img.decoding = "async";
          photosRow.appendChild(img);
        });
        row.appendChild(photosRow);
      }

      row.addEventListener("click", () => {
        showOrderDetails(o.id);
      });

      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const canRepeat = isMobile && Array.isArray(o?.items) && o.items.length > 0;
      if (!canRepeat) return row;

      const swipeContainer = document.createElement("div");
      swipeContainer.className = "shop-favorite-swipe-container shop-order-repeat-swipe-container shop-profile-order-swipe-container";

      const repeatAction = document.createElement("button");
      repeatAction.type = "button";
      repeatAction.className = "shop-favorite-swipe-action shop-favorite-swipe-action--add";
      repeatAction.setAttribute("aria-label", "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437");
      repeatAction.innerHTML = '<i class="fas fa-rotate-right"></i>';
      swipeContainer.appendChild(repeatAction);

      const content = document.createElement("div");
      content.className = "shop-favorite-swipe-content";
      swipeContainer.appendChild(content);
      content.appendChild(row);

      const repeatOrder = async () => {
        if (repeatAction.disabled) return false;
        repeatAction.disabled = true;
        try {
          return await repeatOrderItemsToCart(Array.isArray(o?.items) ? o.items : []);
        } finally {
          repeatAction.disabled = false;
        }
      };

      repeatAction.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await repeatOrder();
        const closeFn = swipeContainer.__orderSwipeClose;
        if (typeof closeFn === "function") closeFn(true);
      });

      initRepeatOrderSwipeRow(swipeContainer, content, {
        onAddToCart: repeatOrder,
        onAddToFavorites: null,
        allowAddToCart: true,
        allowAddToFavorites: false,
        getCurrentSwiped: () => currentProfileOrderSwipedContainer,
        setCurrentSwiped: (next) => {
          currentProfileOrderSwipedContainer = next || null;
        },
      });

      return swipeContainer;
    }

    function applyOrdersSummary(summary) {
      if (!summary || typeof summary !== "object") return;
      const activeCount = Number(summary.active_count ?? summary.activeCount ?? profileOrdersSummary.activeCount);
      const completedCount = Number(summary.completed_count ?? summary.completedCount ?? profileOrdersSummary.completedCount);
      if (Number.isFinite(activeCount)) {
        profileOrdersSummary.activeCount = Math.max(0, Math.trunc(activeCount));
      }
      if (Number.isFinite(completedCount)) {
        profileOrdersSummary.completedCount = Math.max(0, Math.trunc(completedCount));
      }
      updateOrdersSectionHeaders();
    }

    function buildOrderRowSignature(order) {
      const oid = Number(order?.id || 0);
      const updatedAt = str(order?.updated_at || order?.created_at || "");
      const statusId = Number(order?.status_id || 0);
      const statusTitle = str(order?.status_title || "");
      const total = Number(order?.total || order?.total_amount || 0);
      const itemsLen = Array.isArray(order?.items) ? order.items.length : 0;
      return `${oid}:${updatedAt}:${statusId}:${statusTitle}:${total}:${itemsLen}`;
    }

    function getCachedOrderRow(sectionKey, order) {
      const bucket = sectionKey === "completed" ? ordersRowCache.completed : ordersRowCache.active;
      const orderId = Number(order?.id || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return renderProfileOrderRow(order);
      const nextSig = buildOrderRowSignature(order);
      const cached = bucket.get(orderId);
      if (cached && cached.sig === nextSig && cached.node) {
        return cached.node;
      }
      const nextNode = renderProfileOrderRow(order);
      bucket.set(orderId, { sig: nextSig, node: nextNode });
      return nextNode;
    }

    function resetOrdersSection(sectionKey) {
      const section = sectionKey === "completed" ? ordersCompletedSection : ordersActiveSection;
      const state = profileOrdersState[sectionKey];
      if (!section || !state) return;
      state.offset = 0;
      state.hasMore = false;
      state.loading = false;
      state.initialized = false;
      section.items.replaceChildren();
      section.emptyEl.classList.add("hidden");
      if (section.emptyEl?.dataset?.defaultText) {
        section.emptyEl.textContent = section.emptyEl.dataset.defaultText;
      }
      setOrdersSectionAnchorVisible(section, false);
      setOrdersSectionLoading(section, false);
    }

    async function loadOrdersSection(sectionKey, { reset = false } = {}) {
      const section = sectionKey === "completed" ? ordersCompletedSection : ordersActiveSection;
      const state = profileOrdersState[sectionKey];
      if (!section || !state) return;
      if (state.loading) return;
      if (!reset && !state.hasMore) return;
      if (sectionKey === "completed" && ordersCompletedSection.collapsed) return;

      state.loading = true;
      if (reset) {
        section.items.replaceChildren();
        section.emptyEl.classList.add("hidden");
        if (section.emptyEl?.dataset?.defaultText) {
          section.emptyEl.textContent = section.emptyEl.dataset.defaultText;
        }
        setOrdersSectionAnchorVisible(section, false);
      }
      setOrdersSectionLoading(section, true);

      try {
        const json = await apiJson(
          `/api/public/me/orders?limit=${PROFILE_ORDERS_PAGE_SIZE}&offset=${state.offset}&status_is_final=${state.statusFinal}`
        );
        const list = Array.isArray(json?.data) ? json.data : [];
        if (reset) {
          const bucket = sectionKey === "completed" ? ordersRowCache.completed : ordersRowCache.active;
          const actualIds = new Set(
            list
              .map((o) => Number(o?.id || 0))
              .filter((id) => Number.isFinite(id) && id > 0)
          );
          bucket.forEach((_value, key) => {
            if (!actualIds.has(key)) bucket.delete(key);
          });
        }
        const paging = json && typeof json.paging === "object" ? json.paging : null;
        const hasMore = paging ? Boolean(paging.has_more) : list.length >= PROFILE_ORDERS_PAGE_SIZE;
        applyOrdersSummary(json?.summary);

        if (reset) section.items.replaceChildren();
        if (reset && !list.length) {
          section.emptyEl.classList.remove("hidden");
          state.hasMore = false;
          state.initialized = true;
          setOrdersSectionAnchorVisible(section, false);
          return;
        }

        list.forEach((o) => {
          section.items.appendChild(getCachedOrderRow(sectionKey, o));
        });

        state.offset += list.length;
        state.hasMore = hasMore;
        state.initialized = true;

        setOrdersSectionAnchorVisible(section, state.hasMore);
        if (state.hasMore) {
          ensureOrdersSectionObserver(sectionKey);
        }
      } catch (e) {
        if (reset) {
          section.items.replaceChildren();
          section.emptyEl.textContent = "Ошибка загрузки заказов";
          section.emptyEl.classList.remove("hidden");
        }
        state.hasMore = false;
        setOrdersSectionAnchorVisible(section, false);
      } finally {
        state.loading = false;
        setOrdersSectionLoading(section, false);
      }
    }

    async function reloadOrders({ reset = true } = {}) {
      if (reset) {
        resetOrdersSection("active");
        resetOrdersSection("completed");
        setCompletedSectionCollapsed(true);
        profileOrdersSummary.activeCount = 0;
        profileOrdersSummary.completedCount = 0;
        updateOrdersSectionHeaders();
      }
      await loadOrdersSection("active", { reset: true });
    }

    ordersCompletedSection.header.addEventListener("click", () => {
      const nextCollapsed = !ordersCompletedSection.collapsed;
      setCompletedSectionCollapsed(nextCollapsed);
      if (!nextCollapsed && !profileOrdersState.completed.initialized) {
        void loadOrdersSection("completed", { reset: true });
      }
    });

    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const get = (k) => str($(`[data-a="${k}"]`, addressFormCard)?.value || "").trim();

        const resolvedItems = cartItemsResolved();
      const { nonAutoTotal } = computeCartTotals(resolvedItems);
      const payload = {
          street: get("street"),
          house: get("house"),
          entrance: get("entrance") || null,
          floor: get("floor") || null,
          apartment: get("apartment") || null,
          comment: get("comment") || null,
        };

        if (!payload.street) return alert("Укажите улицу");
        if (!payload.house) return alert("Укажите дом");

        addBtn.disabled = true;
        addBtn.textContent = profileEditingId ? "Сохраняем…" : "Добавляем…";
        try {
          if (profileEditingId) {
            await apiJson(`/api/public/me/addresses/${profileEditingId}`, { method: "PUT", body: payload });
          } else {
            await apiJson("/api/public/me/addresses", { method: "POST", body: payload });
          }
          closeProfileAddressForm();
          await reloadAddresses();
          await refreshAddressState({ force: true });
        } catch (e) {
          alert(profileEditingId ? "Не удалось обновить адрес" : "Не удалось добавить адрес");
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = profileEditingId ? "Сохранить" : "Добавить адрес";
        }
      });
    }

    let currentName = str(me?.name || "");
    let isEditing = false;

    function setProfilePhoto(url) {
      const v = str(url || "").trim();
      if (!v) {
        photoImg.src = "";
        photoImg.classList.add("hidden");
        photoPlaceholder.classList.remove("hidden");
        photoRemoveBtn.classList.add("hidden");
        return;
      }
      photoImg.src = v;
      photoImg.classList.remove("hidden");
      photoPlaceholder.classList.add("hidden");
      photoRemoveBtn.classList.remove("hidden");
    }

    setProfilePhoto(me?.photo || "");

    nameEditBtn.addEventListener("click", () => setEditingMode(true));

    function setEditingMode(next) {
      isEditing = Boolean(next);
      wrap.classList.toggle("is-editing", isEditing);
      nameText.classList.toggle("hidden", isEditing);
      nameEditBtn.classList.toggle("hidden", isEditing);
      nameInput.classList.toggle("hidden", !isEditing);
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      nameActions.classList.toggle("hidden", !isEditing || isMobile);
      if (isMobile && elMobileAddressActions) {
        if (isEditing) {
          elMobileAddressActions.classList.remove("hidden");
          if (elMobileAddressSaveBtn) {
            elMobileAddressSaveBtn.textContent = "Сохранить";
            elMobileAddressSaveBtn.disabled = false;
            elMobileAddressSaveBtn.onclick = () => nameSave.click();
          }
          if (elMobileAddressCancelBtn) {
            elMobileAddressCancelBtn.textContent = "Отмена";
            elMobileAddressCancelBtn.disabled = false;
            elMobileAddressCancelBtn.onclick = () => nameCancel.click();
          }
        } else {
          elMobileAddressActions.classList.add("hidden");
          if (elMobileAddressSaveBtn) elMobileAddressSaveBtn.onclick = null;
          if (elMobileAddressCancelBtn) elMobileAddressCancelBtn.onclick = null;
        }
      }
      if (isEditing) {
        nameInput.value = currentName;
        setTimeout(() => nameInput.focus(), 0);
      }
    }

    setEditingMode(false);

    function startPhotoUpload() {
      photoInput.click();
    }

    async function removePhoto() {
      if (!window.confirm("Удалить фото профиля?")) return;
      photoRemoveBtn.disabled = true;
      try {
        await apiJson("/api/public/me/photo", { method: "DELETE" });
        setProfilePhoto("");
        setCustomerCache({ ...me, photo: "" });
      } catch (e) {
        alert("Не удалось удалить фото");
      } finally {
        photoRemoveBtn.disabled = false;
      }
    }

    photoBtn.addEventListener("click", startPhotoUpload);
    photoRemoveBtn.addEventListener("click", removePhoto);

    photoInput.addEventListener("change", async () => {
      const file = photoInput.files && photoInput.files[0];
      photoInput.value = "";
      if (!file) return;

      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(file.type)) {
        alert("Можно загрузить только JPG, PNG или WEBP");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("Размер файла не должен превышать 5MB");
        return;
      }

      const tempUrl = URL.createObjectURL(file);
      setProfilePhoto(tempUrl);

      photoBtn.disabled = true;
      photoBtn.textContent = "Загружаем…";
      try {
        const token = getCustomerToken();
        if (!token) throw new Error("UNAUTHORIZED");
        const fd = new FormData();
        fd.append("photo", file);
        const res = await fetch("/api/public/me/photo", {
          method: "POST",
          headers: { "x-customer-token": token, "x-tenant-id": String(tenantId) },
          body: fd,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) {
          throw new Error((json && json.error) || `HTTP_${res.status}`);
        }
        const finalUrl = `${json.photoUrl}?t=${Date.now()}`;
        setProfilePhoto(finalUrl);
        setCustomerCache({ ...me, photo: json.photoUrl });
      } catch (e) {
        alert("Не удалось загрузить фото");
        setProfilePhoto(me?.photo || "");
      } finally {
        photoBtn.disabled = false;
        photoBtn.textContent = "Загрузить фото";
        try { URL.revokeObjectURL(tempUrl); } catch {}
      }
    });

    let photoMenuOpen = false;
    function closePhotoMenu() {
      photoMenuOpen = false;
      photoMenu.classList.add("hidden");
    }
    function openPhotoMenu() {
      photoMenuOpen = true;
      photoMenu.classList.remove("hidden");
      const onDocClick = (e) => {
        if (photoWrap.contains(e.target)) return;
        closePhotoMenu();
        document.removeEventListener("click", onDocClick);
      };
      setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }

    if (!photoWrap.__photoMenuBound) {
      photoWrap.__photoMenuBound = true;
      photoWrap.addEventListener("click", (e) => {
        const target = e.target;
        if (target && target.closest && target.closest(".shop-profile-menu")) return;
        if (photoMenuOpen) closePhotoMenu();
        else openPhotoMenu();
      });
      photoMenu.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    const photoUploadItem = photoMenu.querySelector('[data-role="photo-upload"]');
    const photoRemoveItem = photoMenu.querySelector('[data-role="photo-remove"]');
    if (photoUploadItem) photoUploadItem.addEventListener("click", () => {
      closePhotoMenu();
      startPhotoUpload();
    });
    if (photoRemoveItem) photoRemoveItem.addEventListener("click", async () => {
      closePhotoMenu();
      await removePhoto();
    });

    nameSave.addEventListener("click", async () => {
      const v = str(nameInput.value).trim();
      if (!v) {
        alert("Введите имя");
        return;
      }
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      nameSave.disabled = true;
      nameSave.textContent = "Сохраняем…";
      if (isMobile && elMobileAddressSaveBtn) {
        elMobileAddressSaveBtn.disabled = true;
        elMobileAddressSaveBtn.textContent = "Сохраняем…";
      }
      try {
        await apiJson("/api/public/me", { method: "PUT", body: { name: v } });
        const me2 = await fetchMeSafe();
        if (me2) {
          currentName = str(me2.name || "");
          nameText.textContent = currentName || "—";
          nameInput.value = currentName;
        }
        setEditingMode(false);
      } catch (e) {
        alert("Не удалось сохранить имя");
      } finally {
        nameSave.disabled = false;
        nameSave.textContent = "Сохранить";
        if (isMobile && elMobileAddressSaveBtn) {
          elMobileAddressSaveBtn.disabled = false;
          elMobileAddressSaveBtn.textContent = "Сохранить";
        }
      }
    });

    nameCancel.addEventListener("click", () => {
      nameInput.value = currentName;
      setEditingMode(false);
    });

    reloadAddresses();
    reloadOrders({ reset: true });

    // Устанавливаем начальную вкладку, если указана
    if (initialTab) {
      setActiveTab(initialTab);
    }

    return {
      showEdit: () => setEditingMode(true),
      hideEdit: () => setEditingMode(false),
      showOrderDetails: (orderId) => showOrderDetails(orderId),
      showOrdersList: () => showOrdersList(),
      setActiveTab: (tab) => setActiveTab(tab),
    };
  }

  let profileMenuListenerAttached = false;

  function attachProfileMenuOutsideClose(menuEl, toggleBtn) {
    if (profileMenuListenerAttached) return;
    profileMenuListenerAttached = true;
    if (menuEl && !menuEl.__stopClickBound) {
      menuEl.__stopClickBound = true;
      menuEl.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }
    document.addEventListener("click", (e) => {
      if (!menuEl || menuEl.classList.contains("hidden")) return;
      if (toggleBtn && toggleBtn.contains(e.target)) return;
      if (menuEl.contains(e.target)) return;
      menuEl.classList.add("hidden");
    });
  }

  async function handleProfileLogout({ closeModal } = {}) {
    try { await apiJson("/api/public/auth/logout", { method: "POST", body: {} }); } catch {}
    clearCustomer();
    await refreshAddressState();
    if (closeModal && window.AppModal) window.AppModal.close("sheet");
  }

  async function openProfilePanel(meOverride, { forceOpen = false, initialTab, onLoginSuccess } = {}) {
    if (!forceOpen && cartViewMode === "profile") {
      await restorePreviousPanel();
      return;
    }
    if (!forceOpen) rememberPreviousPanel();
    showProfileView();
    if (!elProfileContent) return;

    const me = meOverride || await fetchMeSafe();
    if (!me) {
      const loginWrap = buildLoginContent({
        onSuccess: (me2) => {
          if (typeof onLoginSuccess === "function") {
            onLoginSuccess(me2);
            return;
          }
          openProfilePanel(me2, { forceOpen: true });
        },
      });
      elProfileContent.innerHTML = "";
      elProfileContent.appendChild(loginWrap);
      if (elProfileHeaderActions) elProfileHeaderActions.classList.add("hidden");
      setCartHeader({ title: "Вход", showAddressChip: false, showProfileActions: false });
      return;
    }

    const ctx = buildProfileContent({
      host: elProfileContent,
      me,
      onLogout: async () => { await handleProfileLogout(); await openProfilePanel(null, { forceOpen: true }); },
      initialTab,
    });

    // Сохраняем контекст для доступа извне
    window._profileContext = ctx;

    setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: true });

    if (elProfileSettingsBtn && elProfileMenu) {
      elProfileSettingsBtn.onclick = (e) => {
        e.stopPropagation();
        elProfileMenu.classList.toggle("hidden");
      };
    }

    if (elProfileEditBtn && elProfileMenu) {
      elProfileEditBtn.onclick = () => {
        elProfileMenu.classList.add("hidden");
        ctx.showEdit();
      };
    }

    if (elProfileLogoutBtn && elProfileMenu) {
      elProfileLogoutBtn.onclick = async () => {
        elProfileMenu.classList.add("hidden");
        await handleProfileLogout();
        openProfilePanel();
      };
    }

    if (elProfileCloseBtn) {
      elProfileCloseBtn.onclick = () => {
        restorePreviousPanel();
      };
    }

    if (elProfileMenu && elProfileSettingsBtn) {
      attachProfileMenuOutsideClose(elProfileMenu, elProfileSettingsBtn);
    }
  }

  function mountProfileModalMenu({ onEdit, onLogout }) {
    const header = document.querySelector(".app-modal-header");
    if (!header) return () => {};

    const actionsRoot = header.querySelector(".app-modal-actions") || header;

    let actionsWrap = actionsRoot.querySelector(".shop-profile-header-actions");
    if (!actionsWrap) {
      actionsWrap = document.createElement("div");
      actionsWrap.className = "shop-profile-header-actions shop-profile-modal-actions";
      if (actionsRoot === header) actionsRoot.appendChild(actionsWrap);
      else actionsRoot.insertBefore(actionsWrap, actionsRoot.firstChild);
    }

    let settingsBtn = actionsWrap.querySelector(".shop-profile-modal-settings");
    if (!settingsBtn) {
      settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "btn btn-icon shop-profile-modal-settings";
      settingsBtn.innerHTML = `<i class="fas fa-gear"></i>`;
      settingsBtn.setAttribute("aria-label", "Настройки профиля");
      actionsWrap.appendChild(settingsBtn);
    }

    let menu = actionsWrap.querySelector(".shop-profile-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "shop-profile-menu hidden";
      menu.innerHTML = `
        <button class="shop-profile-menu-item" data-role="edit" type="button">Редактировать профиль</button>
        <button class="shop-profile-menu-item" data-role="logout" type="button">Выйти</button>
      `;
      actionsWrap.appendChild(menu);
    }

    const editBtn = menu.querySelector('[data-role="edit"]');
    const logoutBtn = menu.querySelector('[data-role="logout"]');

    const onDocClick = (e) => {
      if (menu.classList.contains("hidden")) return;
      if (settingsBtn.contains(e.target) || menu.contains(e.target)) return;
      menu.classList.add("hidden");
    };

    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    };

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    if (editBtn) editBtn.onclick = () => {
      menu.classList.add("hidden");
      if (typeof onEdit === "function") onEdit();
    };

    if (logoutBtn) logoutBtn.onclick = async () => {
      menu.classList.add("hidden");
      if (typeof onLogout === "function") onLogout();
    };

    document.addEventListener("click", onDocClick);

    return () => {
      document.removeEventListener("click", onDocClick);
      actionsWrap?.remove();
    };
  }

  async function openProfileSheet({ initialTab, onLoginSuccess } = {}) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) {
      await openProfilePanel(null, { initialTab, onLoginSuccess });
      return;
    }

    if (!window.AppModal) return;

    const me = await fetchMeSafe();
    if (!me) {
      openLoginSheet({
        onSuccess: (me2) => {
          if (typeof onLoginSuccess === "function") {
            onLoginSuccess(me2);
            return;
          }
          openProfileModal(me2);
        },
      });
      return;
    }
    setActiveNav("profile");
    openProfileModal(me, { initialTab });
  }

  function openProfileModal(me, { initialTab } = {}) {
    if (!window.AppModal) return;

    const wrap = document.createElement("div");
    wrap.className = "shop-profile-content";
    const ctx = buildProfileContent({
      host: wrap,
      me,
      onLogout: () => handleProfileLogout({ closeModal: true }),
      initialTab,
    });
    window._profileContext = ctx;

    // Обновляем состояние навигации
    sheetNavigationState.type = 'profile';
    sheetNavigationState.screen = null;
    sheetNavigationState.data = null;
    if (typeof queueMobileUiStateSync === "function") {
      queueMobileUiStateSync("openProfileModal");
    } else if (typeof window.queueShopMobileUiStateSync === "function") {
      window.queueShopMobileUiStateSync("openProfileModal");
    }

    setAppModalMode("shop");

    window.AppModal.open({
      title: "Профиль",
      content: wrap,
      onClose: () => {
        setActiveNav("menu");
        // Сбрасываем состояние навигации
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        // Обновляем бейдж после закрытия модального окна
        if (typeof window.updateActiveOrdersBadge === "function") {
          window.updateActiveOrdersBadge();
        }
      },
    });
    
    // Обновляем бейдж сразу после открытия модального окна
    if (typeof window.updateActiveOrdersBadge === "function") {
      setTimeout(() => {
        window.updateActiveOrdersBadge();
      }, 100);
    }
    return ctx;
  }

  async function requireAuthForCheckout({ isSheet }) {
    const me = await fetchMeSafe();
    if (me) return true;

    const continueToCheckout = async () => {
      await refreshAddressState();
      if (isSheet) {
        const resolveShowCheckout = () => {
          if (!openCartSheetCtx) return null;
          if (typeof openCartSheetCtx.showSheetCheckout !== "function") return null;
          return openCartSheetCtx.showSheetCheckout;
        };

        let showSheetCheckoutFn = resolveShowCheckout();
        if (!showSheetCheckoutFn || !openCartSheetCtx?.listEl?.isConnected) {
          openCartSheet();
        }
        showSheetCheckoutFn = resolveShowCheckout();
        if (!showSheetCheckoutFn) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          showSheetCheckoutFn = resolveShowCheckout();
        }
        if (showSheetCheckoutFn) {
          await showSheetCheckoutFn();
          if (sheetNavigationState.screen !== "checkout") {
            await new Promise((resolve) => setTimeout(resolve, 0));
            await showSheetCheckoutFn();
          }
        }
        return;
      }
      if (!elCheckoutContent) return;
      showCheckoutView();
      await openCheckoutView({
        container: elCheckoutContent,
        onBack: showCartView,
        hasAddressEditor: true,
        isSheet: false,
        actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
      });
    };

    if (isSheet) {
      openLoginSheet({
        onSuccess: async () => {
          // После логина из сценария "Оформить" на мобилке
          // принудительно продолжаем именно checkout-flow.
          closeShopSheetIfOpen();
          setActiveNav("cart");
          await continueToCheckout();
        },
        fromCheckout: true,
      });
    } else {
      await openProfilePanel(null, { forceOpen: true, onLoginSuccess: () => { continueToCheckout(); } });
    }
    return false;
  }
  // -----------------------------
  // Bottom nav (mobile) helpers
  // -----------------------------
function setActiveNav(key) {
  const map = {
    menu: elNavMenu,
    categories: elNavCategories,
    cart: elNavCart,
    profile: elNavProfile,
    fav: $("#shopNavFav"),
  };

  Object.keys(map).forEach((k) => {
    const el = map[k];
    if (!el) return;
    el.classList.toggle("is-active", k === key);
    if (k === key) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });

  if (key !== "cart") {
    if (elMobileAddressActions) elMobileAddressActions.classList.add("hidden");
    if (elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
  }
  if (key !== "menu" && elMobileProductActions) {
    elMobileProductActions.classList.add("hidden");
  }
  if (key !== "profile") hideMobileOrderDetailsActions();
  
  // Обновляем бейдж активных заказов при смене вкладки
  if (typeof window.updateActiveOrdersBadge === "function") {
    window.updateActiveOrdersBadge();
  }
  if (typeof queueMobileUiStateSync === "function") {
    queueMobileUiStateSync(`setActiveNav:${key}`);
  } else if (typeof window.queueShopMobileUiStateSync === "function") {
    window.queueShopMobileUiStateSync(`setActiveNav:${key}`);
  }
}

function bounceCartNav() {
  if (!elNavCart) return;

  elNavCart.classList.remove("is-bounce", "is-flash");
  void elNavCart.offsetWidth; // restart animation
  elNavCart.classList.add("is-bounce", "is-flash");

  setTimeout(() => {
    elNavCart.classList.remove("is-bounce", "is-flash");
  }, 450);
}

function pulseCartTab() {
  const cartBtn = document.getElementById("shopNavCart");
  if (!cartBtn) return;

  cartBtn.classList.remove("is-bounce", "is-flash");
  void cartBtn.offsetWidth; // reflow, чтобы анимация повторялась

  cartBtn.classList.add("is-bounce", "is-flash");

  setTimeout(() => cartBtn.classList.remove("is-flash"), 420);
  setTimeout(() => cartBtn.classList.remove("is-bounce"), 420);
}

function setBottomNavActive(tab) {
  const root = document.querySelector(".shop-nav");
  if (!root) return;

  root.querySelectorAll(".shop-nav-btn").forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle("is-active", isActive);
    if (isActive) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (typeof queueMobileUiStateSync === "function") {
    queueMobileUiStateSync(`setBottomNavActive:${tab}`);
  } else if (typeof window.queueShopMobileUiStateSync === "function") {
    window.queueShopMobileUiStateSync(`setBottomNavActive:${tab}`);
  }
}


  // -----------------------------
  // Checkout (оформление заказа)
  // -----------------------------
  let orderConfigCache = null;

  async function getOrderConfig() {
    if (orderConfigCache) return orderConfigCache;
    const json = await apiJson("/api/public/order-config");
    orderConfigCache = json.data;
    return orderConfigCache;
  }

  let deliverySettingsCache = null;

  async function getDeliverySettings() {
    if (deliverySettingsCache) return deliverySettingsCache;
    const json = await apiJson("/api/public/delivery-settings");
    deliverySettingsCache = json.data || null;
    return deliverySettingsCache;
  }

  /**
   * Обновляет полоску прогресса до бесплатной доставки и сумму в кнопке «Оформить» (мобилка и десктоп).
   * В кнопке: сумма корзины + стоимость доставки, если доставка платная; при достижении порога — только сумма корзины.
   */
  let __forceHideCheckoutDeliveryProgress = false;

  async function updateMobileDeliveryProgress() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const isDesktop = !isMobile;
    if (__forceHideCheckoutDeliveryProgress) {
      if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
      if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
      return;
    }
    if (window._checkoutMethodCode != null && window._checkoutMethodCode !== "delivery") {
      if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
      if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
      return;
    }
    let data;
    try {
      data = await getDeliverySettings();
    } catch (e) {
      const cartTotal = computeCartTotals(cartItemsResolved()).total;
      if (elMobileCartTotal) elMobileCartTotal.innerHTML = "<strong>" + money(cartTotal) + "</strong>";
      if (elCartTotal) elCartTotal.innerHTML = "<strong>" + money(cartTotal) + "</strong>";
      if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
      if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
      return;
    }
    const deliveryCost = Number(data?.delivery_cost || 0) || 0;
    const freeFrom = data?.free_delivery_from != null ? Number(data.free_delivery_from) : null;
    const items = cartItemsResolved();
    const cartTotal = computeCartTotals(items).total;
    const deliveryApplied = freeFrom != null && cartTotal >= freeFrom ? 0 : deliveryCost;
    const setTotalHtml = (el, total, applied) => {
      if (!el) return;
      if (applied > 0) {
        el.innerHTML = "<strong>" + money(total) + "</strong> + <strong>" + money(applied) + "</strong>";
      } else {
        el.innerHTML = "<strong>" + money(total) + "</strong>";
      }
    };
    if (isMobile) {
      setTotalHtml(elMobileCartTotal, cartTotal, deliveryApplied);
    }
    if (isDesktop && elCartTotal) {
      setTotalHtml(elCartTotal, cartTotal, deliveryApplied);
    }
    const progress = freeFrom != null && freeFrom > 0 ? Math.min(100, (cartTotal / freeFrom) * 100) : 0;
    const labelFreeHtml = "Бесплатная доставка <i class=\"fas fa-check shop-delivery-check\" aria-hidden=\"true\"></i>";
    const labelProgressHtml = (left, withDelivery) =>
      (withDelivery ? "Доставка <strong>" + money(deliveryCost) + "</strong>. " : "") + "Ещё <strong>" + money(left) + "</strong> до бесплатной доставки";

    if (isMobile && elMobileDeliveryProgressWrap && elMobileDeliveryProgressFill && elMobileDeliveryProgressLabel) {
      if (freeFrom == null || freeFrom <= 0) {
        elMobileDeliveryProgressWrap.classList.add("hidden");
      } else {
        elMobileDeliveryProgressFill.style.width = progress + "%";
        if (elMobileDeliveryProgressBar) elMobileDeliveryProgressBar.setAttribute("aria-valuenow", Math.round(progress));
        if (progress >= 100) {
          elMobileDeliveryProgressLabel.classList.add("is-free");
          elMobileDeliveryProgressLabel.innerHTML = labelFreeHtml;
        } else {
          elMobileDeliveryProgressLabel.classList.remove("is-free");
          elMobileDeliveryProgressLabel.innerHTML = labelProgressHtml(Math.ceil(freeFrom - cartTotal), deliveryCost > 0);
        }
        elMobileDeliveryProgressWrap.classList.remove("hidden");
      }
    }
    if (isDesktop && elDesktopDeliveryProgressWrap && elDesktopDeliveryProgressFill && elDesktopDeliveryProgressLabel) {
      if (freeFrom == null || freeFrom <= 0) {
        elDesktopDeliveryProgressWrap.classList.add("hidden");
      } else {
        elDesktopDeliveryProgressFill.style.width = progress + "%";
        elDesktopDeliveryProgressWrap.querySelector(".shop-cart-delivery-progress-bar")?.setAttribute("aria-valuenow", Math.round(progress));
        if (progress >= 100) {
          elDesktopDeliveryProgressLabel.classList.add("is-free");
          elDesktopDeliveryProgressLabel.innerHTML = labelFreeHtml;
        } else {
          elDesktopDeliveryProgressLabel.classList.remove("is-free");
          elDesktopDeliveryProgressLabel.innerHTML = labelProgressHtml(Math.ceil(freeFrom - cartTotal), deliveryCost > 0);
        }
        elDesktopDeliveryProgressWrap.classList.remove("hidden");
      }
    }
  }

  /**
   * Calculate the next opening time for the store
   * @param {Array} hours - Store hours array from API
   * @param {string} timezone - Store timezone offset (e.g., "+3")
   * @returns {Object|null} - { dayName: 'Пн', time: '10:00', isToday: false } or null if always closed
   */
  function getNextOpeningTime(hours, timezone) {
    if (!Array.isArray(hours) || !hours.length) return null;

    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    // Get current store local time
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const offsetMs = offsetHours * 60 * 60 * 1000;
    const localNow = Date.now() + offsetMs;
    const localDate = new Date(localNow);

    const currentDay = localDate.getUTCDay();
    const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

    // Helper to parse time string to minutes
    function parseTimeToMinutes(timeStr) {
      if (!timeStr) return null;
      const match = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    // Check next 7 days
    for (let offset = 0; offset < 7; offset++) {
      const checkDay = (currentDay + offset) % 7;
      const entry = hours.find(h => Number(h.day_of_week) === checkDay);

      if (!entry || Number(entry.is_closed) === 1) continue;

      const opensAt = parseTimeToMinutes(entry.opens_at);
      if (opensAt === null) continue;

      // If checking today, only consider if opening time is in the future
      if (offset === 0 && currentMinutes >= opensAt) continue;

      // Found next opening
      const hoursVal = Math.floor(opensAt / 60);
      const mins = opensAt % 60;
      const timeStr = `${String(hoursVal).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

      return {
        dayName: dayNames[checkDay],
        time: timeStr,
        isToday: offset === 0
      };
    }

    return null; // No opening time found in next 7 days
  }

  /**
   * Форматирует часы работы на сегодня для отображения в карточке
   * @param {Array} storeHours - Массив часов работы
   * @param {string} timezone - Часовой пояс магазина
   * @returns {string} - Строка вида "Сегодня: 10:00–22:00" или "Сегодня: выходной"
   */
  function formatTodayHours(storeHours, timezone) {
    if (!Array.isArray(storeHours) || !storeHours.length) return '';

    // Получаем текущий день недели по времени магазина
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();

    const entry = storeHours.find(h => Number(h.day_of_week) === currentDay);

    if (!entry || Number(entry.is_closed) === 1) {
      return 'Сегодня: выходной';
    }

    const opens = entry.opens_at ? entry.opens_at.slice(0, 5) : '';
    const closes = entry.closes_at ? entry.closes_at.slice(0, 5) : '';

    if (opens && closes) {
      return `Сегодня: ${opens}–${closes}`;
    }

    return '';
  }

  /**
   * Update the store status notice in the toolbar (desktop) and in the header (mobile)
   */
  async function updateStoreStatus() {
    const statusEl = $("#shopToolbarStatus");

    function setStatus(el, visible, text) {
      if (!el) return;
      if (visible) {
        el.textContent = text || "";
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    }

    try {
      const config = await getOrderConfig();
      if (!config) return;

      const { storeIsOpen, storeHours, storeTimezone } = config;

      if (storeIsOpen) {
        setStatus(statusEl, false);
        return;
      }

      const nextOpening = getNextOpeningTime(storeHours, storeTimezone);

      if (!nextOpening) {
        setStatus(statusEl, true, "Мы закрыты");
        return;
      }

      let message = "Мы закрыты. ";
      if (nextOpening.isToday) {
        message += `Откроемся сегодня в ${nextOpening.time}`;
      } else {
        message += `Откроемся ${nextOpening.dayName} в ${nextOpening.time}`;
      }

      setStatus(statusEl, true, message);
    } catch (err) {
      console.error("Failed to update store status:", err);
    }
  }

  /**
   * Get store opening time for today
   * @param {Array} storeHours - Store hours array from API
   * @param {number} currentDay - Day of week (0-6, Sunday-Saturday)
   * @returns {number|null} - Opening time in minutes from midnight, or null if closed
   */
  function getStoreOpeningTime(storeHours, currentDay) {
    if (!Array.isArray(storeHours) || !storeHours.length) return null;

    const entry = storeHours.find(h => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return null;

    const match = entry.opens_at?.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;

    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }

  /**
   * Determine which time segment we're in for time option filtering
   * @param {boolean} storeIsOpen - Is store currently open
   * @param {string} storeTimezone - Store timezone offset (e.g., "+7")
   * @param {Array} storeHours - Store hours array from API
   * @returns {string} - "OPEN" | "CLOSED_BEFORE_MIDNIGHT" | "CLOSED_AFTER_MIDNIGHT"
   */
  function getTimeSegment(storeIsOpen, storeTimezone, storeHours) {
    // If store is open, easy case
    if (storeIsOpen) return "OPEN";

    // Store is closed - check if we're before or after midnight
    const offsetHours = Number.isNaN(Number(storeTimezone)) ? 0 : Number(storeTimezone);
    const offsetMs = offsetHours * 60 * 60 * 1000;
    const localNow = Date.now() + offsetMs;
    const localDate = new Date(localNow);

    const currentDay = localDate.getUTCDay();
    const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

    // Get store opening time for today
    const openingMinutes = getStoreOpeningTime(storeHours, currentDay);

    // If no opening time today, or if current time is before opening time
    if (openingMinutes !== null && currentMinutes < openingMinutes) {
      return "CLOSED_AFTER_MIDNIGHT";
    }

    // Otherwise, we're after store closed but before midnight (or store closed all day)
    return "CLOSED_BEFORE_MIDNIGHT";
  }

  // Унифицированный поиск скролл-контейнера checkout/bottom sheet,
  // чтобы при открытии/закрытии селектов можно было сохранить позицию.
  function getShopScrollContainer(startEl) {
    if (!startEl || typeof startEl.closest !== "function") {
      return document.scrollingElement || document.documentElement || document.body;
    }

    // Основной скролл внутри checkout
    const directCheckout = startEl.closest(".shop-checkout-content");
    if (directCheckout) return directCheckout;

    // Если элемент внутри тела модалки корзины, ищем checkout там
    const sheetBody = startEl.closest(".shop-cart-sheet-body");
    if (sheetBody) {
      const innerCheckout = sheetBody.querySelector(".shop-checkout-content");
      if (innerCheckout) return innerCheckout;
    }

    // Fallback: глобальный checkout, если открыт
    const globalCheckout = document.querySelector(".shop-cart-sheet .shop-checkout-content");
    if (globalCheckout) return globalCheckout;

    // В крайнем случае — общий скролл документа
    return document.scrollingElement || document.documentElement || document.body;
  }

  let checkoutViewCleanupSubscriptions = [];

  function registerCheckoutViewCleanup(fn) {
    if (typeof fn !== "function") return;
    checkoutViewCleanupSubscriptions.push(fn);
  }

  function cleanupCheckoutViewSubscriptions() {
    if (!Array.isArray(checkoutViewCleanupSubscriptions) || !checkoutViewCleanupSubscriptions.length) {
      return;
    }
    const pending = checkoutViewCleanupSubscriptions.slice();
    checkoutViewCleanupSubscriptions = [];
    pending.forEach((cleanupFn) => {
      try {
        cleanupFn();
      } catch (err) {
        console.warn("checkout cleanup failed", err);
      }
    });
  }

  function buildDropdown(options, value) {
    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-dropdown-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shop-checkout-select";

    const list = document.createElement("div");
    list.className = "shop-checkout-dropdown";

    let opts = Array.isArray(options) ? options.slice() : [];
    let current = value || (opts[0] ? opts[0].code : "");

    function render() {
      const active = opts.find(o => o.code === current) || opts[0];
      if (active) {
        btn.textContent = active.title;
      } else if (opts.length) {
        btn.textContent = "Выбрать";
      } else {
        btn.textContent = "Нет данных";
      }
      list.innerHTML = "";

      opts.filter(o => o.code !== current).forEach(o => {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "shop-checkout-option";
        opt.textContent = o.title;
        opt.addEventListener("click", () => {
          current = o.code;
          render();
          list.classList.remove("is-open");
          wrap.dispatchEvent(new Event("change"));
        });
        list.appendChild(opt);
      });
    }

    function setOptions(nextOptions = [], nextValue) {
      opts = Array.isArray(nextOptions) ? nextOptions.slice() : [];
      if (nextValue !== undefined) {
        current = nextValue;
      } else if (!opts.find(o => o.code === current)) {
        current = opts[0]?.code || "";
      }
      render();
    }

    function setValue(val) {
      current = val;
      render();
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const scrollParent = getShopScrollContainer(btn);
      const prevScrollTop = scrollParent ? scrollParent.scrollTop : null;
      const prevWindowScroll = typeof window !== "undefined" ? (window.scrollY || 0) : 0;

      list.classList.toggle("is-open");

      if (scrollParent != null && prevScrollTop != null) {
        requestAnimationFrame(() => {
          scrollParent.scrollTop = prevScrollTop;
        });
      }
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        requestAnimationFrame(() => {
          window.scrollTo(0, prevWindowScroll);
        });
      }

      // Раньше здесь был scrollIntoView, который на мобилке вызывал
      // заметный «рывок» контента при открытии любого селектора.
      // Теперь мы сохраняем скролл и просто раскрываем список.
    });

    const handleOutsideClick = (e) => {
      if (!wrap.contains(e.target)) list.classList.remove("is-open");
    };
    document.addEventListener("click", handleOutsideClick);

    render();

    wrap.appendChild(btn);
    wrap.appendChild(list);

    return {
      root: wrap,
      getValue: () => current,
      setValue,
      setOptions,
      destroy: () => {
        document.removeEventListener("click", handleOutsideClick);
      },
    };
  }

  /**
   * Apple-style time wheel: one column, scroll to select, expands in place.
   * API compatible with buildDropdown: root, getValue(), setValue(v), setOptions(opts, val), "change" event.
   */
  function buildTimeWheelPicker(options, value) {
    const ITEM_HEIGHT = 44;
    const VISIBLE_ROWS = 5;
    const PADDING_ROWS = 2;
    const WRAP_CLASS = "shop-checkout-time-wheel-wrap";
    const PANEL_CLASS = "shop-checkout-time-wheel-panel";
    const SCROLL_CLASS = "shop-checkout-time-wheel-scroll";
    const ITEM_CLASS = "shop-checkout-time-wheel-item";

    const wrap = document.createElement("div");
    wrap.className = WRAP_CLASS;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shop-checkout-select shop-checkout-time-wheel-trigger";
    btn.setAttribute("aria-expanded", "false");

    const panel = document.createElement("div");
    panel.className = PANEL_CLASS;

    const panelInner = document.createElement("div");
    panelInner.className = "shop-checkout-time-wheel-panel-inner";

    const scrollEl = document.createElement("div");
    scrollEl.className = SCROLL_CLASS;

    let opts = Array.isArray(options) ? options.slice() : [];
    let current = value || (opts[0] ? opts[0].code : "");

    function isOpen() {
      return panel.classList.contains("is-open");
    }

    function setOpen(nextOpen) {
      const willOpen = Boolean(nextOpen);
      panel.classList.toggle("is-open", willOpen);
      wrap.classList.toggle("is-open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen && opts.length > 0) {
        const selectedIndex = getSelectedIndex();
        scrollToIndex(selectedIndex);
        requestAnimationFrame(() => {
          scrollToIndex(selectedIndex);
        });
      }
    }

    function getSelectedIndex() {
      const i = opts.findIndex(o => o.code === current);
      return i >= 0 ? i : 0;
    }

    function updateButtonText() {
      const active = opts.find(o => o.code === current) || opts[0];
      btn.textContent = active ? active.title : "—";
    }

    function scrollToIndex(index) {
      const clamped = Math.max(0, Math.min(index, opts.length - 1));
      scrollEl.scrollTop = clamped * ITEM_HEIGHT;
    }

    function indexFromScrollTop() {
      const index = Math.round(scrollEl.scrollTop / ITEM_HEIGHT);
      return Math.max(0, Math.min(index, opts.length - 1));
    }

    function onScrollEnd() {
      if (opts.length === 0) return;
      const index = indexFromScrollTop();
      const newCode = opts[index].code;
      if (newCode !== current) {
        current = newCode;
        updateButtonText();
        wrap.dispatchEvent(new Event("change"));
      }
      scrollToIndex(index);
    }

    let scrollEndTimer = null;
    scrollEl.addEventListener("scroll", () => {
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(onScrollEnd, 100);
    });

    function renderItems() {
      scrollEl.innerHTML = "";
      const topPad = document.createElement("div");
      topPad.className = "shop-checkout-time-wheel-pad";
      topPad.style.height = PADDING_ROWS * ITEM_HEIGHT + "px";
      scrollEl.appendChild(topPad);

      opts.forEach((o, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = ITEM_CLASS;
        item.textContent = o.title;
        item.dataset.index = String(i);
        item.style.height = ITEM_HEIGHT + "px";
        item.addEventListener("click", () => {
          current = o.code;
          scrollToIndex(i);
          updateButtonText();
          setOpen(false);
          wrap.dispatchEvent(new Event("change"));
        });
        scrollEl.appendChild(item);
      });

      const bottomPad = document.createElement("div");
      bottomPad.className = "shop-checkout-time-wheel-pad";
      bottomPad.style.height = PADDING_ROWS * ITEM_HEIGHT + "px";
      scrollEl.appendChild(bottomPad);
    }

    function setOptions(nextOptions = [], nextValue) {
      opts = Array.isArray(nextOptions) ? nextOptions.slice() : [];
      if (nextValue !== undefined) {
        current = nextValue;
      } else if (!opts.find(o => o.code === current)) {
        current = opts[0]?.code || "";
      }
      updateButtonText();
      renderItems();
      if (isOpen()) {
        scrollToIndex(getSelectedIndex());
      }
    }

    function setValue(val) {
      current = val;
      updateButtonText();
      if (isOpen()) {
        scrollToIndex(getSelectedIndex());
      }
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const scrollParent = getShopScrollContainer(btn);
      const prevScrollTop = scrollParent ? scrollParent.scrollTop : null;
      const prevWindowScroll = typeof window !== "undefined" ? (window.scrollY || 0) : 0;

      // Даже когда слотов нет (opts.length === 0), даём панели
      // раскрыться — так пользователь явно видит, что селектор
      // отреагировал на нажатие, а не «сломался».
      setOpen(!isOpen());

      if (scrollParent != null && prevScrollTop != null) {
        requestAnimationFrame(() => {
          scrollParent.scrollTop = prevScrollTop;
        });
      }
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        requestAnimationFrame(() => {
          window.scrollTo(0, prevWindowScroll);
        });
      }

      if (isOpen() && opts.length > 0) scrollToIndex(getSelectedIndex());
    });

    const handleOutsideClick = (e) => {
      if (!wrap.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);

    updateButtonText();
    wrap.appendChild(btn);
    panelInner.appendChild(scrollEl);
    panel.appendChild(panelInner);
    wrap.appendChild(panel);

    return {
      root: wrap,
      getValue: () => current,
      setValue,
      setOptions,
      destroy: () => {
        if (scrollEndTimer) {
          clearTimeout(scrollEndTimer);
          scrollEndTimer = null;
        }
        document.removeEventListener("click", handleOutsideClick);
      },
    };
  }

  function pickDefaultCode(options, preferred, fallback) {
    const arr = Array.isArray(options) ? options : [];
    if (preferred && arr.some(x => x.code === preferred)) return preferred;
    if (arr.length && arr[0].code) return arr[0].code;
    return fallback || null;
  }

  /**
   * Get current date in store's timezone
   * @param {string} timezone - Timezone offset (e.g., "+7")
   * @returns {Date} - Date object representing current time in store timezone
   */
  function getStoreDateNow(timezone) {
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const offsetMs = offsetHours * 60 * 60 * 1000;
    const localNow = Date.now() + offsetMs;
    return new Date(localNow);
  }

  /**
   * Get today's date string in YYYY-MM-DD format using store timezone
   * @param {string} timezone - Timezone offset (e.g., "+7")
   * @returns {string} - Date string in format "YYYY-MM-DD"
   */
  function getTodayDateString(timezone) {
    const d = timezone ? getStoreDateNow(timezone) : new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getDateString(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function toShopDateKey(d) {
    return getDateString(d);
  }

  function parseShopDateKey(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function extractTimeValue(raw) {
    const v = str(raw || "").trim();
    if (!v) return "";
    if (v.includes("T")) return v.split("T")[1]?.slice(0, 5) || "";
    if (v.includes(" ")) return v.split(" ")[1]?.slice(0, 5) || "";
    if (/^\d{1,2}:\d{2}/.test(v)) return v.slice(0, 5);
    return "";
  }

  function parseTimeToMinutes(value) {
    if (!value) return null;
    const parts = String(value).split(":");
    if (!parts.length) return null;
    const hours = Number(parts[0]);
    const rawMinutes = parts[1] ? parts[1].slice(0, 2) : "0";
    const minutes = Number(rawMinutes);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function formatMinutesToTime(total) {
    if (!Number.isFinite(total)) return "";
    const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function buildTimeSlots(option, targetDate, storeTimezone) {
    if (!option) return [];
    let start = parseTimeToMinutes(option.starts_at);
    let end = parseTimeToMinutes(option.ends_at);
    const stepMinutes = Math.max(1, Number(option.step_minutes) || 30);
    const leadMinutes = Math.max(0, Number(option.lead_minutes) || 0);

    // Fallbacks for incomplete or midnight-bound config.
    if (start === null) start = 0;
    if (end === null) end = 24 * 60;
    if (end === 0 && start > 0) end = 24 * 60;
    if (end <= start) end += 24 * 60;
    if (start < 0) start = 0;
    if (end > 48 * 60) end = 48 * 60;
    if (end <= start) return [];

    // IMPORTANT: use store timezone, not device local timezone.
    const now = getStoreDateNow(storeTimezone || "+0");
    const todayKey = getTodayDateString(storeTimezone || "+0");
    const targetKey = targetDate ? getDateString(targetDate) : todayKey;
    const isToday = (targetKey === todayKey);

    let slot = start;
    if (isToday) {
      const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const minAllowed = nowMinutes + leadMinutes;
      if (slot < minAllowed) {
        const diff = minAllowed - slot;
        const stepsAhead = Math.ceil(diff / stepMinutes);
        slot += stepsAhead * stepMinutes;
      }
    }

    const slots = [];
    const limit = Math.min(end, 24 * 60 - 1);
    while (slot <= limit) {
      slots.push(formatMinutesToTime(slot));
      slot += stepMinutes;
    }
    return slots;
  }

  async function openCheckoutView({ container, onBack, hasAddressEditor, isSheet, actions, onEditAddress, onEditPickup }) {
    __forceHideCheckoutDeliveryProgress = true;
    if (!container) return;
    cleanupCheckoutViewSubscriptions();
    const registerCheckoutCleanup = registerCheckoutViewCleanup;

    const items = cartItemsResolved();
    if (!items.length) {
      alert("Корзина пуста");
      if (onBack) onBack();
      return;
    }

    // Базовые итоги корзины (до клиентской скидки на заказ)
    const cartTotals = computeCartTotals(items);
    const baseOrderTotal = roundPrice(Number(cartTotals.total || 0));

    const cfg = await getOrderConfig();
    let deliverySettings = null;
    try {
      deliverySettings = await getDeliverySettings();
    } catch (err) {
      console.error("Failed to load delivery settings:", err);
    }
    const deliveryRules = {
      cost: Number(deliverySettings?.delivery_cost || 0),
      minOrder: Number(deliverySettings?.min_order_amount || 0),
      freeFrom: deliverySettings?.free_delivery_from != null ? Number(deliverySettings.free_delivery_from) : null,
      hasSettings: Boolean(deliverySettings?.has_settings),
    };
    const draft = loadCheckoutDraft();

    const me = await fetchMeSafe(); // если залогинен — подставим

    function calculateDiscountPreview(price, discountType, discountValue, maxDiscountAmount = null) {
      const srcPrice = Number(price || 0);
      const srcValue = Number(discountValue || 0);
      if (!(srcPrice > 0) || !(srcValue > 0)) return 0;

      let discountAmount = 0;
      if (discountType === "percent") {
        discountAmount = srcPrice * (srcValue / 100);
      } else if (discountType === "fixed") {
        discountAmount = srcValue;
      } else if (discountType === "special_price") {
        discountAmount = Math.max(0, srcPrice - srcValue);
      } else {
        return 0;
      }

      const maxAmount = Number(maxDiscountAmount);
      if (maxAmount > 0 && discountAmount > maxAmount) {
        discountAmount = maxAmount;
      }
      if (discountAmount > srcPrice) {
        discountAmount = srcPrice;
      }
      return roundPrice(discountAmount);
    }

    function applyBestOrderDiscountsPreview(discounts, price) {
      const all = Array.isArray(discounts) ? discounts : [];
      const basePrice = roundPrice(Number(price || 0));
      if (!all.length || !(basePrice > 0)) {
        return { totalDiscount: 0, appliedDiscounts: [] };
      }

      const stackable = all.filter((d) => Number(d?.is_stackable || 0) === 1 || d?.is_stackable === true);
      const nonStackable = all.filter((d) => !(Number(d?.is_stackable || 0) === 1 || d?.is_stackable === true));

      let bestNonStackable = null;
      let bestNonStackableAmount = 0;
      nonStackable.forEach((d) => {
        const amount = calculateDiscountPreview(
          basePrice,
          d?.discount_type,
          Number(d?.discount_value || 0),
          d?.max_discount_amount != null ? Number(d.max_discount_amount) : null
        );
        if (amount > bestNonStackableAmount) {
          bestNonStackableAmount = amount;
          bestNonStackable = d;
        }
      });

      let stackableTotal = 0;
      const stackableApplied = [];
      stackable.forEach((d) => {
        const leftPrice = roundPrice(Math.max(0, basePrice - stackableTotal));
        if (!(leftPrice > 0)) return;
        const amount = calculateDiscountPreview(
          leftPrice,
          d?.discount_type,
          Number(d?.discount_value || 0),
          d?.max_discount_amount != null ? Number(d.max_discount_amount) : null
        );
        if (!(amount > 0)) return;
        stackableTotal = roundPrice(stackableTotal + amount);
        stackableApplied.push({ ...d, discountAmount: amount });
      });

      let totalDiscount = 0;
      let appliedDiscounts = [];
      if (bestNonStackableAmount > stackableTotal) {
        totalDiscount = bestNonStackableAmount;
        if (bestNonStackable) {
          appliedDiscounts = [{ ...bestNonStackable, discountAmount: bestNonStackableAmount }];
        }
      } else {
        totalDiscount = stackableTotal;
        appliedDiscounts = stackableApplied;
      }

      if (totalDiscount > basePrice) totalDiscount = basePrice;
      return { totalDiscount: roundPrice(totalDiscount), appliedDiscounts };
    }

    let customerOrderDiscountAmount = 0;
    let customerOrderAppliedDiscounts = [];
    if (me) {
      try {
        const discountsRes = await apiJson("/api/public/me/discounts");
        const discountsRaw = Array.isArray(discountsRes?.data) ? discountsRes.data : [];
        const activeStoreIdVal = (typeof getActiveStoreId === "function")
          ? Number(getActiveStoreId())
          : Number(localStorage.getItem("activeStoreId"));
        const activeStoreId = Number.isFinite(activeStoreIdVal) ? activeStoreIdVal : null;

        const orderDiscounts = discountsRaw.filter((d) => {
          if (!d) return false;
          if (String(d.apply_to || "") !== "order") return false;
          if (d.is_currently_active !== true) return false;

          // Для совпадения с расчётом при создании заказа используем скидки только текущего филиала.
          if (activeStoreId != null) {
            const discountStoreId = Number(d.store_id);
            if (!Number.isFinite(discountStoreId) || discountStoreId !== activeStoreId) return false;
          }

          const minOrderAmount = Number(d.min_order_amount || 0);
          if (minOrderAmount > 0 && baseOrderTotal < minOrderAmount) return false;
          return true;
        });

        const preview = applyBestOrderDiscountsPreview(orderDiscounts, baseOrderTotal);
        customerOrderDiscountAmount = roundPrice(Number(preview.totalDiscount || 0));
        customerOrderAppliedDiscounts = Array.isArray(preview.appliedDiscounts) ? preview.appliedDiscounts : [];
      } catch (e) {
        customerOrderDiscountAmount = 0;
        customerOrderAppliedDiscounts = [];
      }
    }

    // Итог товаров после всех скидок (включая клиентскую скидку)
    const orderTotal = roundPrice(Math.max(0, baseOrderTotal - customerOrderDiscountAmount));
    const checkoutTotalWithDelivery = orderTotal + getDeliveryCostForTotal(orderTotal);
    function setCheckoutSubmitLabel(payableTotal = checkoutTotalWithDelivery) {
      const label = `Заказать · ${money(payableTotal)}`;
      if (actions?.submitBtn) actions.submitBtn.textContent = label;
      if (elMobileCheckoutSubmitBtn) elMobileCheckoutSubmitBtn.textContent = label;
    }

    container.innerHTML = "";

    if (actions?.submitBtn) {
      actions.submitBtn.disabled = false;
      setCheckoutSubmitLabel();
    }
    if (actions?.backBtn) actions.backBtn.classList.remove("hidden");
    const footerEl = actions?.backBtn?.parentElement;
    if (footerEl) footerEl.classList.remove("is-order-success");
    if (elCheckoutFooterActions) elCheckoutFooterActions.classList.remove("is-order-success");
    if (elMobileCheckoutBackBtn) {
      elMobileCheckoutBackBtn.classList.remove("hidden");
      elMobileCheckoutBackBtn.parentElement?.classList.remove("is-order-success");
    }
    if (elMobileCheckoutSubmitBtn) {
      setCheckoutSubmitLabel();
      if (actions?.submitBtn) elMobileCheckoutSubmitBtn.onclick = () => actions.submitBtn.click();
    }
    if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
    if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout";


    const isPlaceholderCustomerName = (rawName) => {
      const value = str(rawName || "").trim().toLowerCase();
      return value === "клиент";
    };
    // Имя обязательно для новых клиентов после входа, даже если пользователь уже авторизован.
    const needsNameCompletion = !!me && (
      !str(me?.name || "").trim() || isPlaceholderCustomerName(me?.name)
    );
    const isMobileCheckout = window.matchMedia("(max-width: 768px)").matches;
    const isDesktopCheckout = !isMobileCheckout;
    const showMobileNameInput = isMobileCheckout && needsNameCompletion;
    const showDesktopFooterNameInput = isDesktopCheckout && needsNameCompletion;
    const showInlineNameInCheckoutForm = !needsNameCompletion;
    // Поля имя и телефон для неавторизованных; для авторизованных без имени — только имя.
    let name = { value: me ? str(me.name || "") : "" };
    let phone = { value: me ? (me.phone || "") : "" };

    if (!me || needsNameCompletion) {
      const emptyNote = document.createElement("div");
      emptyNote.className = "shop-checkout-note muted";
      emptyNote.textContent = !me ? "Поля обязательные: имя и телефон." : "Укажите имя для оформления заказа.";
      if (showInlineNameInCheckoutForm) wrap.appendChild(emptyNote);

      const nameRow = document.createElement("div");
      nameRow.className = "shop-checkout-grid-row";

      const nameWrap = document.createElement("div");
      const nameLabel = document.createElement("label");
      nameLabel.className = "field-label";
      nameLabel.textContent = "Имя";
      const nameInput = document.createElement("input");
      nameInput.className = "control shop-checkout-name";
      nameInput.type = "text";
      const meName = str(me?.name || "");
      const draftName = str(draft.customer_name || "");
      nameInput.value = isPlaceholderCustomerName(draftName)
        ? ""
        : (draftName || (isPlaceholderCustomerName(meName) ? "" : meName));
      nameInput.addEventListener("input", () => {
        if (str(nameInput.value).trim()) {
          nameInput.classList.remove("is-invalid");
        }
      });
      if (showInlineNameInCheckoutForm) nameWrap.appendChild(nameLabel);
      nameWrap.appendChild(nameInput);
      name = nameInput;

      nameRow.appendChild(nameWrap);
      if (!me) {
        const phoneWrap = document.createElement("div");
        const phoneLabel = document.createElement("label");
        phoneLabel.className = "field-label";
        phoneLabel.textContent = "Телефон";
        const phoneInput = document.createElement("input");
        phoneInput.className = "control shop-checkout-phone";
        phoneInput.type = "tel";
        phoneInput.placeholder = "+7 (999) 000-00-00";
        phoneInput.value = draft.customer_phone || "";
        phoneInput.addEventListener("input", () => enforcePhonePrefix(phoneInput));
        phoneInput.addEventListener("focus", () => enforcePhonePrefix(phoneInput));
        phoneWrap.appendChild(phoneLabel);
        phoneWrap.appendChild(phoneInput);
        phone = phoneInput;
        nameRow.appendChild(phoneWrap);
      }
      if (showInlineNameInCheckoutForm) wrap.appendChild(nameRow);
    }

    const methods = (cfg.methods || []).map((x) => ({
      code: x.code,
      title: x.title,
      icon: x.icon,
      require_client_data: Number(x?.require_client_data ?? 1),
    }));
    const methodUserSelected = Boolean(draft.method_user_selected);
    // Determine preferred method: from draft, or from delivery mode toggle
    let preferredMethodCode = methodUserSelected ? draft.method_code : null;
    // Resolve pickup aliases: "takeaway" / "pickup" may differ from DB code
    if (preferredMethodCode && (preferredMethodCode === "takeaway" || preferredMethodCode === "pickup")) {
      if (!methods.some(m => m.code === preferredMethodCode)) {
        const alt = methods.find(m => m.code !== "delivery");
        if (alt) preferredMethodCode = alt.code;
      }
    }
    if (!preferredMethodCode && window._deliveryMode === "pickup") {
      const pickupMethod = methods.find(m => m.code !== "delivery");
      if (pickupMethod) preferredMethodCode = pickupMethod.code;
    } else if (!preferredMethodCode && window._deliveryMode === "delivery") {
      preferredMethodCode = "delivery";
    }
    const methodDefault = pickDefaultCode(methods, preferredMethodCode, "takeaway");
    const isMethodClientDataRequired = (methodCode) => {
      const code = String(methodCode || methodDefault || "").trim();
      const methodMeta = methods.find((m) => m.code === code) || null;
      return Number(methodMeta?.require_client_data ?? 1) !== 0;
    };

    function createOptionIconElement(iconRaw, fallback) {
      const resolvedIcon = String(iconRaw || "").trim() || String(fallback || "").trim() || "fas fa-circle";
      const isUrl = resolvedIcon.includes("/") || resolvedIcon.startsWith("http");
      if (isUrl) {
        const img = document.createElement("img");
        img.className = "shop-checkout-method-pill-icon-img";
        img.src = resolvedIcon;
        img.alt = "";
        return img;
      }
      const icon = document.createElement("i");
      if (resolvedIcon.includes(" ")) {
        icon.className = resolvedIcon;
      } else if (resolvedIcon.startsWith("fa-")) {
        icon.className = `fas ${resolvedIcon}`;
      } else {
        icon.className = `fas fa-${resolvedIcon}`;
      }
      return icon;
    }

    function createUnifiedIconCarousel(options, cfg = {}) {
      const items = Array.isArray(options) ? options : [];
      const defaultCode = cfg.defaultCode || "";
      const allowEmpty = cfg.allowEmpty === true;
      const resolveIcon = typeof cfg.resolveIcon === "function"
        ? cfg.resolveIcon
        : ((code, iconRaw) => createOptionIconElement(iconRaw, "fas fa-circle"));

      const root = document.createElement("div");
      root.className = "shop-checkout-method-picker";
      const leftSpacer = document.createElement("span");
      leftSpacer.className = "shop-checkout-method-spacer";
      const rightSpacer = document.createElement("span");
      rightSpacer.className = "shop-checkout-method-spacer";
      root.appendChild(leftSpacer);

      let currentCode = "";
      let wheelLockUntil = 0;
      let wheelFinalizeTimer = 0;
      let mobileFinalizeTimer = 0;
      let ensureRafId = 0;
      let visualRafId = 0;
      let smoothScrollRafId = 0;
      let smoothScrollToken = 0;
      let wheelSessionActive = false;
      let hasUserInteracted = false;
      let resizeObserver = null;
      const wheelScrollFactor = 0.45;
      const centerStickyPx = 18;

      function isMobileViewport() {
        return Boolean(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
      }

      function getButtons() {
        return Array.from(root.querySelectorAll(".shop-checkout-method-pill"));
      }

      function hasCode(code) {
        return items.some((item) => item.code === code);
      }

      function resolveCode(code) {
        if (allowEmpty && !code) return "";
        if (hasCode(code)) return code;
        if (hasCode(defaultCode)) return defaultCode;
        return items[0]?.code || "";
      }

      function updatePadding() {
        const firstBtn = root.querySelector(".shop-checkout-method-pill");
        if (!firstBtn) return false;
        if (root.clientWidth <= 0 || firstBtn.offsetWidth <= 0) return false;
        const pad = Math.max(0, (root.clientWidth - firstBtn.offsetWidth) / 2);
        const px = `${Math.round(pad)}px`;
        root.style.setProperty("--carousel-side-pad", px);
        leftSpacer.style.flexBasis = px;
        rightSpacer.style.flexBasis = px;
        return true;
      }

      function updateVisualFocusNow() {
        visualRafId = 0;
        const buttons = getButtons();
        if (!buttons.length) return;
        if (root.clientWidth <= 0) return;
        const rootRect = root.getBoundingClientRect();
        const centerX = rootRect.left + (root.clientWidth / 2);
        buttons.forEach((btn) => {
          const rect = btn.getBoundingClientRect();
          const btnCenter = rect.left + (rect.width / 2);
          const distance = Math.abs(centerX - btnCenter);
          const influenceRadius = Math.max(rect.width * 1.35, 1);
          const focus = Math.max(0, Math.min(1, 1 - (distance / influenceRadius)));
          btn.style.setProperty("--carousel-focus", focus.toFixed(4));
        });
      }

      function scheduleVisualFocusUpdate() {
        if (visualRafId) return;
        visualRafId = requestAnimationFrame(updateVisualFocusNow);
      }

      function getCenteredCode() {
        const buttons = getButtons();
        if (!buttons.length) return null;
        const rootRect = root.getBoundingClientRect();
        const centerX = rootRect.left + (root.clientWidth / 2);
        let nearestCode = buttons[0].getAttribute("data-code");
        let nearestDistance = Number.POSITIVE_INFINITY;
        let currentDistance = Number.POSITIVE_INFINITY;
        buttons.forEach((btn) => {
          const code = btn.getAttribute("data-code");
          const rect = btn.getBoundingClientRect();
          const distance = Math.abs(centerX - (rect.left + (rect.width / 2)));
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestCode = code;
          }
          if (code === currentCode) {
            currentDistance = distance;
          }
        });
        if (currentCode && Number.isFinite(currentDistance) && currentDistance <= centerStickyPx) {
          return currentCode;
        }
        return nearestCode;
      }

      function cancelSmoothScroll() {
        if (smoothScrollRafId) {
          cancelAnimationFrame(smoothScrollRafId);
          smoothScrollRafId = 0;
        }
        smoothScrollToken += 1;
      }

      function smoothScrollTo(targetLeft, opts = {}) {
        const mode = opts && typeof opts.mode === "string" ? opts.mode : "smooth";
        const durationOverride = opts && Number.isFinite(opts.duration) ? Number(opts.duration) : null;
        const maxLeft = Math.max(0, root.scrollWidth - root.clientWidth);
        const clampedTarget = Math.max(0, Math.min(maxLeft, targetLeft));
        const startLeft = root.scrollLeft;
        const distance = Math.abs(clampedTarget - startLeft);
        if (distance < 0.5) {
          root.scrollLeft = clampedTarget;
          return;
        }

        const baseDuration = mode === "soft" ? 140 : 115;
        const adaptivePart = Math.min(65, distance * 0.16);
        const duration = durationOverride != null
          ? Math.max(80, Math.min(270, durationOverride))
          : Math.max(80, Math.min(270, baseDuration + adaptivePart));

        cancelSmoothScroll();
        const token = smoothScrollToken;
        const startTs = performance.now();
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const step = (ts) => {
          if (token !== smoothScrollToken) return;
          const progress = Math.min(1, (ts - startTs) / duration);
          const eased = easeOutCubic(progress);
          root.scrollLeft = startLeft + (clampedTarget - startLeft) * eased;
          if (progress < 1) {
            smoothScrollRafId = requestAnimationFrame(step);
          } else {
            smoothScrollRafId = 0;
          }
        };

        smoothScrollRafId = requestAnimationFrame(step);
      }

      function centerCode(code, behavior = "smooth") {
        if (!code) return false;
        const targetBtn = root.querySelector(`.shop-checkout-method-pill[data-code="${code}"]`);
        if (!targetBtn) return false;
        if (root.clientWidth <= 0 || targetBtn.offsetWidth <= 0) return false;
        const rootRect = root.getBoundingClientRect();
        const targetRect = targetBtn.getBoundingClientRect();
        const rootCenterX = rootRect.left + (rootRect.width / 2);
        const targetCenterX = targetRect.left + (targetRect.width / 2);
        const delta = targetCenterX - rootCenterX;
        const rawLeft = root.scrollLeft + delta;
        const maxLeft = Math.max(0, root.scrollWidth - root.clientWidth);
        const targetLeft = Math.max(0, Math.min(maxLeft, rawLeft));

        if (behavior === "auto") {
          cancelSmoothScroll();
          root.scrollLeft = targetLeft;
          scheduleVisualFocusUpdate();
          return true;
        }

        if (behavior === "smooth") {
          smoothScrollTo(targetLeft, { mode: "smooth" });
          return true;
        }

        if (behavior === "soft") {
          smoothScrollTo(targetLeft, { mode: "soft" });
          return true;
        }

        cancelSmoothScroll();
        root.scrollLeft = targetLeft;
        scheduleVisualFocusUpdate();
        return true;
      }

      function applySelection(code, opts = {}) {
        const silent = Boolean(opts.silent);
        const center = opts.center === true;
        const centerBehavior = opts.centerBehavior || "smooth";
        const prevCode = currentCode;
        currentCode = code;

        root.querySelectorAll(".shop-checkout-method-pill").forEach((btn) => {
          const active = btn.getAttribute("data-code") === currentCode;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (center) centerCode(currentCode, centerBehavior);
        scheduleVisualFocusUpdate();

        if (!silent && prevCode !== currentCode) {
          root.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      function setValue(code, opts = {}) {
        const resolved = resolveCode(code);
        if (!resolved && !allowEmpty) return;
        applySelection(resolved, opts);
      }

      function finalizeByCenter() {
        const centered = getCenteredCode();
        if (!centered || centered === currentCode) return;
        applySelection(centered, { silent: false, center: false });
      }

      function clearWheelFinalize() {
        if (wheelFinalizeTimer) {
          clearTimeout(wheelFinalizeTimer);
          wheelFinalizeTimer = 0;
        }
        wheelSessionActive = false;
      }

      function clearMobileFinalize() {
        if (mobileFinalizeTimer) {
          clearTimeout(mobileFinalizeTimer);
          mobileFinalizeTimer = 0;
        }
      }

      function scheduleWheelFinalize(delay = 170) {
        if (wheelFinalizeTimer) clearTimeout(wheelFinalizeTimer);
        wheelFinalizeTimer = setTimeout(() => {
          wheelFinalizeTimer = 0;
          wheelSessionActive = false;
          finalizeByCenter();
        }, delay);
      }

      function scheduleMobileFinalize(delay = 60) {
        clearMobileFinalize();
        mobileFinalizeTimer = setTimeout(() => {
          mobileFinalizeTimer = 0;
          if (wheelSessionActive) return;
          finalizeByCenter();
        }, delay);
      }

      function ensureCenteredNow() {
        const padded = updatePadding();
        if (!padded) return false;
        if (!currentCode) return false;
        return centerCode(currentCode, "auto");
      }

      function scheduleEnsure(attempt = 0) {
        if (ensureRafId) cancelAnimationFrame(ensureRafId);
        ensureRafId = requestAnimationFrame(() => {
          const ok = ensureCenteredNow();
          if (ok) {
            ensureRafId = 0;
            return;
          }
          if (attempt < 60) {
            scheduleEnsure(attempt + 1);
          } else {
            ensureRafId = 0;
          }
        });
      }

      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shop-checkout-method-pill";
        btn.setAttribute("data-code", item.code);
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML = `
          <span class="shop-checkout-method-pill-icon"></span>
          <span class="shop-checkout-method-pill-title"></span>
        `;
        const iconWrap = btn.querySelector(".shop-checkout-method-pill-icon");
        if (iconWrap) {
          const iconEl = resolveIcon(item.code, item.icon);
          if (iconEl) {
            iconEl.setAttribute("aria-hidden", "true");
            iconWrap.appendChild(iconEl);
          }
        }
        const titleEl = btn.querySelector(".shop-checkout-method-pill-title");
        if (titleEl) titleEl.textContent = item.title || item.code || "";
        btn.addEventListener("click", () => {
          clearWheelFinalize();
          hasUserInteracted = true;
          setValue(item.code, { silent: false, center: true, centerBehavior: "soft" });
        }, { passive: true });
        root.appendChild(btn);
      });
      root.appendChild(rightSpacer);

      root.addEventListener("pointerdown", () => {
        clearWheelFinalize();
        clearMobileFinalize();
        hasUserInteracted = true;
        cancelSmoothScroll();
      });
      root.addEventListener("touchstart", () => {
        clearWheelFinalize();
        clearMobileFinalize();
        hasUserInteracted = true;
        cancelSmoothScroll();
      }, { passive: true });
      root.addEventListener("scroll", () => {
        scheduleVisualFocusUpdate();
        if (wheelSessionActive) return;
        if (!isMobileViewport()) return;
        scheduleMobileFinalize(100);
      }, { passive: true });
      root.addEventListener("pointerup", () => {
        if (wheelSessionActive) return;
        if (isMobileViewport()) return;
        finalizeByCenter();
      });
      root.addEventListener("touchend", () => {
        if (wheelSessionActive) return;
        scheduleMobileFinalize(100);
      }, { passive: true });
      root.addEventListener("wheel", (event) => {
        if (!event || typeof event.deltaY !== "number") return;
        if (window.matchMedia && !window.matchMedia("(min-width: 769px)").matches) return;
        if (!items.length) return;
        const hasOverflowX = root.scrollWidth > root.clientWidth + 1;
        if (!hasOverflowX) return;
        const deltaX = Number(event.deltaX || 0);
        const deltaY = Number(event.deltaY || 0);
        const useHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        const rawDelta = useHorizontal ? deltaX : deltaY;
        if (!Number.isFinite(rawDelta) || Math.abs(rawDelta) < 0.5) return;
        const delta = rawDelta * wheelScrollFactor;
        event.preventDefault();
        const nextLeft = root.scrollLeft + delta;
        hasUserInteracted = true;
        wheelSessionActive = true;
        cancelSmoothScroll();
        root.scrollLeft = nextLeft;
        scheduleWheelFinalize(170);
      }, { passive: false });

      setValue(defaultCode, { silent: true, center: false });
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
          if (hasUserInteracted) return;
          scheduleEnsure();
          scheduleVisualFocusUpdate();
        });
        resizeObserver.observe(root);
      }
      scheduleEnsure();
      scheduleVisualFocusUpdate();

      return {
        root,
        getValue: () => currentCode || "",
        setValue: (code, silent) => setValue(code, { silent: Boolean(silent), center: false }),
        ensureCentered: () => ensureCenteredNow(),
        destroy: () => {
          clearWheelFinalize();
          clearMobileFinalize();
          if (ensureRafId) {
            cancelAnimationFrame(ensureRafId);
            ensureRafId = 0;
          }
          if (visualRafId) {
            cancelAnimationFrame(visualRafId);
            visualRafId = 0;
          }
          cancelSmoothScroll();
          if (resizeObserver) {
            try {
              resizeObserver.disconnect();
            } catch {}
            resizeObserver = null;
          }
        },
      };
    }

    function createMethodIconElement(iconRaw, code) {
      const fallback = code === "delivery" ? "fas fa-truck" : "fas fa-store";
      return createOptionIconElement(iconRaw, fallback);
    }
    const methodSelect = createUnifiedIconCarousel(methods, {
      defaultCode: methodDefault,
      resolveIcon: (code, iconRaw) => createMethodIconElement(iconRaw, code),
      allowEmpty: false,
    });
    if (methodSelect && typeof methodSelect.destroy === "function") {
      registerCheckoutCleanup(() => methodSelect.destroy());
    }

    function syncCheckoutMode(code) {
      const resolvedCode = code || methodDefault || "takeaway";
      window._checkoutMethodCode = resolvedCode;
      window._deliveryMode = (resolvedCode === "delivery") ? "delivery" : "pickup";
      if (typeof updateHeaderAddressWidget === "function") updateHeaderAddressWidget();
      if (typeof updateAddressChip === "function") updateAddressChip();
    }
    if (!methodUserSelected || !draft.method_code) {
      draft.method_user_selected = false;
      draft.method_code = methodSelect.getValue();
      saveCheckoutDraft(draft);
    }
    methodSelect.root.addEventListener("change", () => {
      const code = methodSelect.getValue();
      draft.method_code = code;
      draft.method_user_selected = true;
      saveCheckoutDraft(draft);
      syncCheckoutMode(code);
      updateDeliveryPricing();
      updateMobileDeliveryProgress();
    });

    const methodWrap = document.createElement("div");
    methodWrap.appendChild(methodSelect.root);

    const addressWrap = document.createElement("div");
    const addrLabel = document.createElement("label");
    addrLabel.className = "field-label";
    addrLabel.textContent = "Адрес доставки";
    const addressField = document.createElement("div");
    addressField.className = "shop-checkout-address-field";

    const changeAddrBtn = document.createElement("button");
    changeAddrBtn.type = "button";
    changeAddrBtn.className = "btn shop-checkout-change-address";
    changeAddrBtn.innerHTML = `<i class="fas fa-pen"></i>`;
    changeAddrBtn.setAttribute("aria-label", "Изменить адрес");
    changeAddrBtn.title = "Изменить адрес";

    const address = document.createElement("input");
    address.className = "control";
    address.type = "text";
    address.placeholder = "Улица / Дом / Подъезд / Этаж / Квартира";
    address.readOnly = !!hasAddressEditor;
    address.setAttribute("data-role", "delivery-address");
    address.value = getSelectedAddressLine() || draft.delivery_address || "";

    addressField.appendChild(address);
    addressField.appendChild(changeAddrBtn);
    addressWrap.appendChild(addrLabel);
    addressWrap.appendChild(addressField);

    // Новое: поле выбора точки самовывоза
    const pickupWrap = document.createElement("div");
    const pickupLabel = document.createElement("label");
    pickupLabel.className = "field-label";
    pickupLabel.textContent = "Точка самовывоза";

    const pickupField = document.createElement("div");
    pickupField.className = "shop-checkout-address-field";

    const changePickupBtn = document.createElement("button");
    changePickupBtn.type = "button";
    changePickupBtn.className = "btn shop-checkout-change-address";
    changePickupBtn.innerHTML = `<i class="fas fa-pen"></i>`;
    changePickupBtn.setAttribute("aria-label", "Изменить точку");
    changePickupBtn.title = "Изменить точку самовывоза";

    const pickupAddress = document.createElement("input");
    pickupAddress.className = "control";
    pickupAddress.type = "text";
    pickupAddress.placeholder = "Выберите точку самовывоза";
    pickupAddress.readOnly = true;
    pickupAddress.setAttribute("data-role", "pickup-address");

    // Загрузить Филиалы и установить текущую
    let pickupStores = [];
    let selectedPickupStoreId = null;
    function toFiniteId(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    function resolvePickupStoreId(stores) {
      const ids = (Array.isArray(stores) ? stores : [])
        .map((s) => toFiniteId(s?.id))
        .filter((id) => id != null);
      if (!ids.length) return null;

      const draftId = toFiniteId(draft.pickup_store_id);
      if (draftId != null && ids.includes(draftId)) return draftId;

      const selectedGlobalId = toFiniteId(window._selectedPickupStoreId);
      if (selectedGlobalId != null && ids.includes(selectedGlobalId)) return selectedGlobalId;

      const activeStoreId = toFiniteId(localStorage.getItem("activeStoreId"));
      if (activeStoreId != null && ids.includes(activeStoreId)) return activeStoreId;

      return ids[0];
    }
    function applyPickupStores(stores) {
      pickupStores = Array.isArray(stores) ? stores : [];
      window._pickupStores = pickupStores;

      selectedPickupStoreId = resolvePickupStoreId(pickupStores);
      window._selectedPickupStoreId = selectedPickupStoreId;

      const draftPickupId = toFiniteId(draft.pickup_store_id);
      const selectedId = toFiniteId(selectedPickupStoreId);
      if (draftPickupId !== selectedId) {
        draft.pickup_store_id = selectedId;
        saveCheckoutDraft(draft);
      }

      updatePickupAddress();
      if (typeof updateHeaderAddressWidget === "function") updateHeaderAddressWidget();
      if (typeof updateAddressChip === "function") updateAddressChip();
    }

    async function loadPickupStores() {
      try {
        const cachedStores = Array.isArray(window._pickupStores) ? window._pickupStores : [];
        if (cachedStores.length) {
          applyPickupStores(cachedStores);
          return;
        }

        const metaTenant = document.querySelector('meta[name="tenant_id"]');
        const tenantId = metaTenant ? Number(metaTenant.content) : null;
        if (!tenantId) return;

        const response = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await response.json();

        if (data && data.ok && Array.isArray(data.stores)) {
          applyPickupStores(data.stores);
        }
      } catch (err) {
        console.error('Ошибка загрузки точек самовывоза:', err);
      }
    }

    function updatePickupAddress() {
      if (!pickupStores.length) {
        pickupAddress.value = '—';
        return;
      }

      let store = pickupStores.find(s => Number(s.id) === Number(selectedPickupStoreId));
      if (!store) {
        const fallbackId = resolvePickupStoreId(pickupStores);
        selectedPickupStoreId = fallbackId;
        window._selectedPickupStoreId = fallbackId;
        store = pickupStores.find(s => Number(s.id) === Number(fallbackId));
      }
      if (store) {
        // Убираем город из адреса (город виден в хедере)
        pickupAddress.value = store.address || store.name || '—';
      } else {
        pickupAddress.value = '—';
      }
    }

    // Callback для обновления поля после выбора в renderPickupList
    window._updatePickupAddressCallback = () => {
      selectedPickupStoreId = toFiniteId(window._selectedPickupStoreId);
      updatePickupAddress();
      const draftPickupId = toFiniteId(draft.pickup_store_id);
      const selectedId = toFiniteId(selectedPickupStoreId);
      if (draftPickupId !== selectedId) {
        draft.pickup_store_id = selectedId;
        saveCheckoutDraft(draft);
      }
      if (typeof updateHeaderAddressWidget === "function") updateHeaderAddressWidget();
      if (typeof updateAddressChip === "function") updateAddressChip();
    };

    loadPickupStores();

    pickupField.appendChild(pickupAddress);
    pickupField.appendChild(changePickupBtn);
    pickupWrap.appendChild(pickupLabel);
    pickupWrap.appendChild(pickupField);

    const cLabel = document.createElement("label");
    cLabel.className = "field-label";
    cLabel.textContent = "Комментарий";
    cLabel.style.display = "none";
    const comment = document.createElement("input");
    comment.className = "control shop-checkout-comment";
    comment.type = "text";
    comment.placeholder = "Введите комментарий к заказу";
    comment.value = draft.comment || "";
    wrap.appendChild(cLabel);
    wrap.appendChild(comment);
    const mobileNameWrap = document.getElementById("shopMobileCheckoutNameWrap");
    const mobileNameInput = document.getElementById("shopMobileCheckoutNameInput");
    const desktopFooterNameInput = document.getElementById("shopCheckoutFooterNameInput");
    const mobileCommentWrap = document.getElementById("shopMobileCheckoutCommentWrap");
    const mobileCommentInput = document.getElementById("shopMobileCheckoutCommentInput");
    const desktopFooterCommentInput = document.getElementById("shopCheckoutFooterCommentInput");
    const isCommentTextarea = (node) => String(node?.tagName || "").toUpperCase() === "TEXTAREA";
    const autosizeCommentField = (field) => {
      if (!isCommentTextarea(field)) return;
      if (!field.classList.contains("is-expanded")) return;
      field.style.height = "auto";
      const minHeight = 40;
      const maxHeight = 150;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, field.scrollHeight || minHeight));
      field.style.height = `${nextHeight}px`;
      field.scrollTop = field.scrollHeight;
    };
    const collapseCommentField = (field) => {
      if (!isCommentTextarea(field)) return;
      field.classList.remove("is-expanded");
      field.style.height = "";
      field.scrollTop = 0;
    };
    const bindCommentFieldAutogrow = (field) => {
      if (!isCommentTextarea(field)) return;
      if (field.dataset.commentGrowBound === "1") return;
      field.dataset.commentGrowBound = "1";
      collapseCommentField(field);
      field.addEventListener("focus", () => {
        field.classList.add("is-expanded");
        autosizeCommentField(field);
      });
      field.addEventListener("blur", () => {
        collapseCommentField(field);
      });
      field.addEventListener("input", () => {
        autosizeCommentField(field);
      });
    };
    bindCommentFieldAutogrow(mobileCommentInput);
    bindCommentFieldAutogrow(desktopFooterCommentInput);
    if (mobileNameInput) {
      mobileNameInput.value = str(name.value || "");
      mobileNameInput.oninput = () => {
        name.value = mobileNameInput.value || "";
        if (str(name.value).trim()) {
          mobileNameInput.classList.remove("is-invalid");
        }
      };
      if (name && typeof name.addEventListener === "function") {
        name.addEventListener("input", () => {
          if (mobileNameInput.value !== name.value) mobileNameInput.value = name.value || "";
        });
      }
    }
    if (mobileCommentInput) {
      mobileCommentInput.value = comment.value || "";
      mobileCommentInput.oninput = () => {
        comment.value = mobileCommentInput.value || "";
        autosizeCommentField(mobileCommentInput);
        if (desktopFooterCommentInput && desktopFooterCommentInput.value !== comment.value) {
          desktopFooterCommentInput.value = comment.value;
          autosizeCommentField(desktopFooterCommentInput);
        }
      };
      comment.addEventListener("input", () => {
        if (mobileCommentInput.value !== comment.value) mobileCommentInput.value = comment.value;
        autosizeCommentField(mobileCommentInput);
        if (desktopFooterCommentInput && desktopFooterCommentInput.value !== comment.value) {
          desktopFooterCommentInput.value = comment.value;
          autosizeCommentField(desktopFooterCommentInput);
        }
      });
    }
    if (desktopFooterCommentInput) {
      desktopFooterCommentInput.value = comment.value || "";
      desktopFooterCommentInput.oninput = () => {
        comment.value = desktopFooterCommentInput.value || "";
        autosizeCommentField(desktopFooterCommentInput);
        if (mobileCommentInput && mobileCommentInput.value !== comment.value) {
          mobileCommentInput.value = comment.value;
          autosizeCommentField(mobileCommentInput);
        }
      };
    }
    if (desktopFooterNameInput) {
      desktopFooterNameInput.value = str(name.value || "");
      desktopFooterNameInput.oninput = () => {
        name.value = desktopFooterNameInput.value || "";
        if (str(name.value).trim()) {
          desktopFooterNameInput.classList.remove("is-invalid");
        }
      };
      desktopFooterNameInput.classList.toggle("hidden", !showDesktopFooterNameInput);
    }
    if (elCheckoutFooterActions) {
      elCheckoutFooterActions.classList.toggle("has-name-input", !!showDesktopFooterNameInput);
    }
    if (isMobileCheckout) {
      cLabel.style.display = "none";
      comment.style.display = "none";
      if (mobileNameWrap) mobileNameWrap.classList.toggle("hidden", !showMobileNameInput);
      if (mobileCommentWrap) mobileCommentWrap.classList.remove("hidden");
    } else {
      if (mobileNameWrap) mobileNameWrap.classList.add("hidden");
      if (mobileCommentWrap) mobileCommentWrap.classList.add("hidden");
    }
    if (isDesktopCheckout) {
      cLabel.style.display = "none";
      comment.style.display = "none";
    }
    const getCommentValue = () => {
      if (isMobileCheckout && mobileCommentInput) return str(mobileCommentInput.value).trim();
      if (isDesktopCheckout && desktopFooterCommentInput) return str(desktopFooterCommentInput.value).trim();
      return str(comment.value).trim();
    };

    const methodRow = document.createElement("div");
    methodRow.className = "shop-checkout-method-block";
    methodRow.appendChild(methodWrap);
    wrap.appendChild(methodRow);

    function refreshAddressVisibility() {
      const v = methodSelect.getValue();
      const isDelivery = v === "delivery";
      const isTakeaway = v === "takeaway" || v === "pickup";

      addressWrap.style.display = isDelivery ? "" : "none";
      pickupWrap.style.display = isTakeaway ? "" : "none";

      changeAddrBtn.style.display = (isDelivery && hasAddressEditor) ? "" : "none";
      if (isDelivery && hasAddressEditor) {
        address.value = getSelectedAddressLine() || address.value || "";
      }
    }
    methodSelect.root.addEventListener("change", refreshAddressVisibility);
    refreshAddressVisibility();
    syncCheckoutMode(methodSelect.getValue());

    const timeLabel = document.createElement("label");
    timeLabel.className = "field-label";
    timeLabel.textContent = "Когда приготовить?";
    timeLabel.style.display = "none";
    wrap.appendChild(timeLabel);

    const timeOptions = (cfg.timeOptions || []).map(x => ({ code: x.code, title: x.title, icon: x.icon }));
    const storeIsOpen = Boolean(cfg.storeIsOpen);
    const storeTimezone = cfg.storeTimezone || "+0";
    const storeHours = cfg.storeHours || [];
    const timeSegment = getTimeSegment(storeIsOpen, storeTimezone, storeHours);

    // Filter options based on time segment
    let filteredTimeOptions = timeOptions;
    let defaultFallback = "asap";

    if (timeSegment === "OPEN") {
      // Rule 1: Store open - all options available, default "asap"
      filteredTimeOptions = timeOptions;
      defaultFallback = "asap";

    } else if (timeSegment === "CLOSED_BEFORE_MIDNIGHT") {
      // Rule 2: After closing, before midnight - only "on_date"
      filteredTimeOptions = timeOptions.filter(opt => opt.code === "on_date");
      defaultFallback = "on_date";

    } else if (timeSegment === "CLOSED_AFTER_MIDNIGHT") {
      // Rule 3: After midnight, before opening - "at_time" and "on_date"
      filteredTimeOptions = timeOptions.filter(opt =>
        opt.code === "at_time" || opt.code === "on_date"
      );
      defaultFallback = "at_time";
    }

    // Exact guard: if "at_time" has no actual slots right now, hide it to prevent empty picker.
    const detailedTimeOptionByCode = (cfg.timeOptions || []).reduce((acc, option) => {
      if (option && option.code) acc[option.code] = option;
      return acc;
    }, {});
    const atTimeOption = detailedTimeOptionByCode.at_time;
    if (atTimeOption && Number(atTimeOption.has_time_window) === 1) {
      const atTimeSlots = buildTimeSlots(atTimeOption, null, storeTimezone);
      if (!atTimeSlots.length) {
        filteredTimeOptions = filteredTimeOptions.filter(opt => opt.code !== "at_time");
        if (defaultFallback === "at_time") defaultFallback = "on_date";
      }
    }

    const availableTimeOptions = filteredTimeOptions.length ? filteredTimeOptions : timeOptions;

    // Always use defaultFallback for the segment, ignore saved draft
    // Draft can cause wrong defaults (e.g., "on_date" when store is OPEN and should be "asap")
    const fallbackCode = availableTimeOptions.some(opt => opt.code === defaultFallback)
      ? defaultFallback
      : (availableTimeOptions[0]?.code || defaultFallback);
    const timeDefault = fallbackCode;

    function createTimeIconPicker(options, defaultCode) {
      const fallbackIcons = {
        asap: "fas fa-bolt",
        at_time: "fas fa-clock",
        on_date: "fas fa-calendar-day",
      };
      return createUnifiedIconCarousel(options, {
        defaultCode,
        allowEmpty: true,
        resolveIcon: (code, iconRaw) => createOptionIconElement(iconRaw, fallbackIcons[code] || "fas fa-clock"),
      });
    }

    const timeSelect = createTimeIconPicker(availableTimeOptions, timeDefault);
    if (timeSelect && typeof timeSelect.destroy === "function") {
      registerCheckoutCleanup(() => timeSelect.destroy());
    }

    // --- Hidden input для итогового значения времени ---
    const timeInput = document.createElement("input");
    timeInput.type = "hidden";
    timeInput.value = extractTimeValue(draft.scheduled_at);

    // --- Состояние выбора даты ---
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let selectedDate;
    if (draft.scheduled_date) {
      const parsed = parseShopDateKey(draft.scheduled_date);
      if (parsed && toShopDateKey(parsed) > toShopDateKey(new Date())) {
        selectedDate = parsed;
      } else {
        selectedDate = new Date(tomorrow);
      }
    } else {
      selectedDate = new Date(tomorrow);
    }
    let calendarViewYear = selectedDate.getFullYear();
    let calendarViewMonth = selectedDate.getMonth();
    let calendarOpen = false;

    // Row for "Ко времени": [Сегодня] + [слоты времени]
    const timePickerRow = document.createElement("div");
    timePickerRow.className = "shop-checkout-method-block";
    timePickerRow.appendChild(timeSelect.root);

    const timeRow = document.createElement("div");
    timeRow.className = "shop-checkout-date-row1";
    timeRow.classList.add("shop-checkout-time-stack");

    const todayAtTimeWrap = document.createElement("div");
    todayAtTimeWrap.className = "shop-checkout-dropdown-wrap";
    todayAtTimeWrap.style.display = "none";
    const todayAtTimeLabel = document.createElement("button");
    todayAtTimeLabel.type = "button";
    todayAtTimeLabel.className = "shop-checkout-select shop-checkout-date-display shop-checkout-time-static-label";
    todayAtTimeLabel.textContent = "Сегодня";
    todayAtTimeLabel.disabled = true;
    todayAtTimeWrap.appendChild(todayAtTimeLabel);
    timeRow.appendChild(todayAtTimeWrap);

    const asapNowWrap = document.createElement("div");
    asapNowWrap.className = "shop-checkout-dropdown-wrap";
    asapNowWrap.classList.add("shop-checkout-time-stack-divider");
    asapNowWrap.style.display = "none";
    const asapNowLabel = document.createElement("button");
    asapNowLabel.type = "button";
    asapNowLabel.className = "shop-checkout-select shop-checkout-date-display shop-checkout-time-static-label";
    asapNowLabel.textContent = "40-80 мин";
    asapNowLabel.disabled = true;
    asapNowWrap.appendChild(asapNowLabel);
    timeRow.appendChild(asapNowWrap);

    // --- Секция "На дату" (Row 2 + календарь) ---
    const dateSection = document.createElement("div");
    dateSection.className = "shop-checkout-time-input--ondate";

    // Календарь-попover
    const calPopover = document.createElement("div");
    calPopover.className = "date-popover hidden";

    const calHeader = document.createElement("div");
    calHeader.className = "date-popover-header";

    const calPrev = document.createElement("button");
    calPrev.type = "button";
    calPrev.className = "icon-btn btn-xs";
    calPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';

    const calTitle = document.createElement("div");
    calTitle.className = "date-popover-title";

    const calNext = document.createElement("button");
    calNext.type = "button";
    calNext.className = "icon-btn btn-xs";
    calNext.innerHTML = '<i class="fas fa-chevron-right"></i>';

    calHeader.appendChild(calPrev);
    calHeader.appendChild(calTitle);
    calHeader.appendChild(calNext);
    calPopover.appendChild(calHeader);

    const weekdaysRow = document.createElement("div");
    weekdaysRow.className = "date-weekdays";
    ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].forEach(d => {
      const s = document.createElement("span");
      s.textContent = d;
      weekdaysRow.appendChild(s);
    });
    calPopover.appendChild(weekdaysRow);

    const calGrid = document.createElement("div");
    calGrid.className = "date-grid";
    calPopover.appendChild(calGrid);

    // Row 2: [На завтра / дд.мм] + [селектор времени]
    const dateRow2 = document.createElement("div");
    dateRow2.className = "shop-checkout-date-row2";
    dateRow2.classList.add("shop-checkout-time-stack");

    const dateDisplayWrap = document.createElement("div");
    dateDisplayWrap.className = "shop-checkout-dropdown-wrap shop-checkout-date-calendar";
    const dateDisplay = document.createElement("button");
    dateDisplay.type = "button";
    dateDisplay.className = "shop-checkout-select shop-checkout-date-display";
    dateDisplayWrap.appendChild(dateDisplay);
    dateDisplayWrap.appendChild(calPopover);

    const timeSlotsDropdown = buildTimeWheelPicker([], "");
    if (timeSlotsDropdown && typeof timeSlotsDropdown.destroy === "function") {
      registerCheckoutCleanup(() => timeSlotsDropdown.destroy());
    }
    const dateSlotsWrap = document.createElement("div");
    dateSlotsWrap.className = "shop-checkout-time-input--slots";
    dateSlotsWrap.classList.add("shop-checkout-time-stack-divider");
    dateSlotsWrap.appendChild(timeSlotsDropdown.root);

    dateRow2.appendChild(dateDisplayWrap);
    dateRow2.appendChild(dateSlotsWrap);
    dateSection.appendChild(dateRow2);

    // Слоты для "Ко времени" — в том же ряду что и timeSelect
    const timeSlotsWrapAtTime = document.createElement("div");
    timeSlotsWrapAtTime.className = "shop-checkout-time-input--slots";
    timeSlotsWrapAtTime.classList.add("shop-checkout-time-stack-divider");
    timeSlotsWrapAtTime.style.display = "none";
    const timeSlotsDropdownAtTime = buildTimeWheelPicker([], "");
    if (timeSlotsDropdownAtTime && typeof timeSlotsDropdownAtTime.destroy === "function") {
      registerCheckoutCleanup(() => timeSlotsDropdownAtTime.destroy());
    }
    timeSlotsWrapAtTime.appendChild(timeSlotsDropdownAtTime.root);
    timeRow.appendChild(timeSlotsWrapAtTime);

    wrap.appendChild(timePickerRow);
    wrap.appendChild(timeRow);
    wrap.appendChild(dateSection);
    wrap.appendChild(timeInput);

    // --- Рендер календаря ---
    function renderShopCalendar() {
      const year = calendarViewYear;
      const month = calendarViewMonth;
      const first = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7;
      const todayKey = toShopDateKey(new Date());
      const selectedKey = toShopDateKey(selectedDate);

      const monthTitle = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
      calTitle.textContent = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);

      const cells = [];
      for (let i = 0; i < offset; i++) {
        cells.push('<span class="date-empty"></span>');
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const key = toShopDateKey(d);
        const isSelected = key === selectedKey;
        const isToday = key === todayKey;
        const isPast = key <= todayKey;

        const classes = [
          "date-cell",
          isSelected ? "is-start" : "",
          isToday ? "is-today" : "",
          isPast ? "is-past" : "",
        ].filter(Boolean).join(" ");

        if (isPast) {
          cells.push(`<span class="${classes}">${day}</span>`);
        } else {
          cells.push(`<button class="${classes}" type="button" data-date="${key}">${day}</button>`);
        }
      }

      calGrid.innerHTML = cells.join("");
    }

    // --- Формат отображения даты ---
    function formatDateDisplay(d) {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      if (toShopDateKey(d) === toShopDateKey(tmrw)) return "Завтра";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}.${mm}`;
    }

    function setSelectedDate(d) {
      selectedDate = d;
      dateDisplay.textContent = formatDateDisplay(d);
      updateTimeSlotsOptions();
    }

    // Инициализируем отображение даты
    dateDisplay.textContent = formatDateDisplay(selectedDate);

    // --- Обработчики ---
    // Клик по dateDisplay открывает/закрывает календарь выбора даты
    dateDisplay.addEventListener("click", () => {
      if (calendarOpen) {
        calPopover.classList.add("hidden");
        calendarOpen = false;
      } else {
        calendarViewYear = selectedDate.getFullYear();
        calendarViewMonth = selectedDate.getMonth();
        renderShopCalendar();
        calPopover.classList.remove("hidden");
        calendarOpen = true;
      }
    });

    calPrev.addEventListener("click", () => {
      calendarViewMonth -= 1;
      if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear -= 1; }
      renderShopCalendar();
    });

    calNext.addEventListener("click", () => {
      calendarViewMonth += 1;
      if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear += 1; }
      renderShopCalendar();
    });

    calGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-date]");
      if (!btn) return;
      const clicked = parseShopDateKey(btn.getAttribute("data-date"));
      if (!clicked) return;
      setSelectedDate(clicked);
      renderShopCalendar();
      calPopover.classList.add("hidden");
      calendarOpen = false;
    });

    const handleCalendarOutsideClick = (e) => {
      if (calendarOpen && !dateDisplayWrap.contains(e.target)) {
        calPopover.classList.add("hidden");
        calendarOpen = false;
      }
    };
    document.addEventListener("click", handleCalendarOutsideClick);
    registerCheckoutCleanup(() => {
      document.removeEventListener("click", handleCalendarOutsideClick);
    });

    // --- Логика видимости и слотов ---
    const timeOptionByCode = (cfg.timeOptions || []).reduce((acc, option) => {
      if (option && option.code) acc[option.code] = option;
      return acc;
    }, {});
    const storedDraftTime = extractTimeValue(draft.scheduled_at);

    function refreshTimeInputVisibility() {
      const selectedCode = timeSelect.getValue();
      const config = timeOptionByCode[selectedCode];
      const hasWindow = config && Number(config.has_time_window) === 1;
      const isOnDate = selectedCode === "on_date";
      const isAtTime = selectedCode === "at_time";
      const isAsap = selectedCode === "asap";
      const showAtTimePair = isAtTime && hasWindow;
      const showAsapPair = isAsap;
      if (todayAtTimeLabel) {
        todayAtTimeLabel.textContent = showAtTimePair ? "Сегодня" : "Сейчас";
      }
      dateSection.style.display = isOnDate ? "" : "none";
      todayAtTimeWrap.style.display = (showAtTimePair || showAsapPair) ? "" : "none";
      timeSlotsWrapAtTime.style.display = showAtTimePair ? "" : "none";
      asapNowWrap.style.display = showAsapPair ? "" : "none";
      // Когда нет соседних элементов — timeSelect на всю ширину
      const hasNeighbor = showAtTimePair || showAsapPair;
      timeRow.style.display = hasNeighbor ? "" : "none";
      timeRow.classList.toggle("is-combined", hasNeighbor);
      timeSlotsWrapAtTime.style.gridColumn = "";
    }

    function updateTimeSlotsOptions() {
      const selectedCode = timeSelect.getValue();
      const config = timeOptionByCode[selectedCode];

      if (selectedCode === "on_date") {
        if (!config || Number(config.has_time_window) !== 1) {
          dateSlotsWrap.style.display = "none";
          dateRow2.classList.remove("is-combined");
          return;
        }
        dateSlotsWrap.style.display = "";
        dateRow2.classList.add("is-combined");
        const slots = buildTimeSlots(config, selectedDate, storeTimezone);
        const slotOptions = slots.map(value => ({ code: value, title: value }));
        const preferred = timeInput.value || storedDraftTime || "";
        const defaultSlot = slotOptions.find(slot => slot.code === preferred)
          ? preferred
          : (slotOptions[0]?.code || "");
        timeSlotsDropdown.setOptions(slotOptions, defaultSlot);
        timeInput.value = defaultSlot;
        return;
      }

      if (!config || Number(config.has_time_window) !== 1) {
        timeSlotsDropdownAtTime.setOptions([]);
        dateRow2.classList.remove("is-combined");
        return;
      }
      dateRow2.classList.remove("is-combined");
      const slots = buildTimeSlots(config, null, storeTimezone);
      const slotOptions = slots.map(value => ({ code: value, title: value }));
      const preferred = timeInput.value || storedDraftTime || "";
      const defaultSlot = slotOptions.find(slot => slot.code === preferred)
        ? preferred
        : (slotOptions[0]?.code || "");
      timeSlotsDropdownAtTime.setOptions(slotOptions, defaultSlot);
      timeInput.value = defaultSlot;
    }

    timeSlotsDropdown.root.addEventListener("change", () => {
      timeInput.value = timeSlotsDropdown.getValue() || "";
    });

    timeSlotsDropdownAtTime.root.addEventListener("change", () => {
      timeInput.value = timeSlotsDropdownAtTime.getValue() || "";
    });

    timeSelect.root.addEventListener("change", () => {
      refreshTimeInputVisibility();
      updateTimeSlotsOptions();
    });
    refreshTimeInputVisibility();
    updateTimeSlotsOptions();

    function getDeliveryCostForTotal(baseTotal) {
      if (deliveryRules.freeFrom != null && baseTotal >= deliveryRules.freeFrom) return 0;
      return deliveryRules.cost;
    }

    function getPayableTotalForMethod(methodCode) {
      if (methodCode !== "delivery") return orderTotal;
      return orderTotal + getDeliveryCostForTotal(orderTotal);
    }

    let currentPayableTotal = getPayableTotalForMethod(methodSelect.getValue());

    const payments = (cfg.payments || []).map(x => ({ code: x.code, title: x.title, icon: x.icon }));
    const payDefault = "";
    function createPaymentIconPicker(options, defaultCode) {
      const fallbackIcons = {
        cash: "fas fa-money-bill-wave",
        card: "fas fa-credit-card",
        online: "fas fa-wallet",
        sbp: "fas fa-qrcode",
      };
      return createUnifiedIconCarousel(options, {
        defaultCode,
        allowEmpty: false,
        resolveIcon: (code, iconRaw) => createOptionIconElement(iconRaw, fallbackIcons[code] || "fas fa-credit-card"),
      });
    }
    const paySelect = createPaymentIconPicker(payments, payDefault);
    if (paySelect && typeof paySelect.destroy === "function") {
      registerCheckoutCleanup(() => paySelect.destroy());
    }

    const changeAmounts = [500, 1000, 2000, 5000].filter(v => v > currentPayableTotal);
    const changeOptions = [
      { code: "", title: "Сдача не нужна" },
      ...changeAmounts.map(v => ({ code: String(v), title: String(v) })),
      { code: "custom", title: "Другая сумма" },
    ];
    const isCustomChange = draft.change_from && !changeAmounts.includes(draft.change_from);
    const changeDefault = isCustomChange ? "custom" : (draft.change_from ? String(draft.change_from) : "");
    const changeSelect = buildTimeWheelPicker(changeOptions, changeDefault);
    if (changeSelect && typeof changeSelect.destroy === "function") {
      registerCheckoutCleanup(() => changeSelect.destroy());
    }

    const payWrap = document.createElement("div");
    const payLabel = document.createElement("label");
    payLabel.className = "field-label";
    payLabel.textContent = "Оплата";
    payLabel.style.display = "none";
    payWrap.appendChild(payLabel);
    payWrap.appendChild(paySelect.root);
    const clearPaymentInvalidState = () => {
      paySelect.root.classList.remove("is-invalid");
    };
    const markPaymentInvalidState = () => {
      paySelect.root.classList.add("is-invalid");
      if (typeof payWrap.scrollIntoView === "function") {
        payWrap.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setTimeout(() => {
        clearPaymentInvalidState();
      }, 2600);
    };

    const changeWrap = document.createElement("div");
    changeWrap.className = "shop-checkout-change";
    const changeLabel = document.createElement("label");
    changeLabel.className = "field-label";
    changeLabel.textContent = "Сдача";
    changeLabel.style.display = "none";
    changeWrap.appendChild(changeLabel);
    changeWrap.appendChild(changeSelect.root);

    const changeNonCashHint = document.createElement("button");
    changeNonCashHint.type = "button";
    changeNonCashHint.className = "shop-checkout-select shop-checkout-change-noncash";
    changeNonCashHint.textContent = "При получении";
    changeNonCashHint.disabled = true;
    changeNonCashHint.style.display = "none";
    changeWrap.appendChild(changeNonCashHint);

    const changeCustomInput = document.createElement("input");
    const minChangeAmount = Math.ceil(currentPayableTotal) + 1;
    changeCustomInput.className = "control shop-checkout-change-custom";
    changeCustomInput.type = "number";
    changeCustomInput.min = String(minChangeAmount);
    changeCustomInput.placeholder = `Больше ${Math.ceil(currentPayableTotal)}`;
    changeCustomInput.value = isCustomChange ? String(draft.change_from) : "";
    changeCustomInput.style.display = isCustomChange ? "" : "none";
    changeCustomInput.addEventListener("blur", () => {
      const val = parseInt(changeCustomInput.value, 10);
      if (val && val <= currentPayableTotal) {
        changeCustomInput.value = "";
        alert(`Сумма должна быть больше ${Math.ceil(currentPayableTotal)} ₽`);
      }
    });
    changeWrap.appendChild(changeCustomInput);

    const payMethodRow = document.createElement("div");
    payMethodRow.className = "shop-checkout-method-block";
    payMethodRow.appendChild(payWrap);
    wrap.appendChild(payMethodRow);

    wrap.appendChild(changeWrap);

    const deliveryInfoWrap = document.createElement("div");
    deliveryInfoWrap.className = "shop-checkout-delivery-info";

    const deliveryCostRow = document.createElement("div");
    deliveryCostRow.className = "shop-checkout-grid-row";
    const deliveryCostLabel = document.createElement("div");
    deliveryCostLabel.className = "muted";
    deliveryCostLabel.textContent = "Стоимость доставки";
    const deliveryCostValue = document.createElement("div");
    deliveryCostRow.appendChild(deliveryCostLabel);
    deliveryCostRow.appendChild(deliveryCostValue);
    deliveryInfoWrap.appendChild(deliveryCostRow);

    const deliveryFreeNote = document.createElement("div");
    deliveryFreeNote.className = "shop-checkout-note muted";
    deliveryInfoWrap.appendChild(deliveryFreeNote);

    const deliveryMinNote = document.createElement("div");
    deliveryMinNote.className = "shop-checkout-note muted";
    deliveryInfoWrap.appendChild(deliveryMinNote);

    wrap.appendChild(deliveryInfoWrap);

    const totalBeforeCustomerDiscount = roundPrice(Number(cartTotals.total || 0));
    const itemLevelDiscount = roundPrice(Number(cartTotals.totalDiscount || 0));
    const totalBeforeDiscount = roundPrice(Number(cartTotals.totalBeforeDiscount || totalBeforeCustomerDiscount));
    const nonAutoTotal = Number(cartTotals.nonAutoTotal || 0);
    const autoEligibleTotal = Number(cartTotals.autoEligibleTotal || 0);
    const total = orderTotal;
    const totalDiscount = roundPrice(itemLevelDiscount + customerOrderDiscountAmount);
    // Общая скидка = разница между суммой до скидок и итогом (включая клиентскую скидку)
    const actualDiscount = totalBeforeDiscount > total
      ? roundPrice(totalBeforeDiscount - total)
      : totalDiscount;
    const hasDiscount = actualDiscount > 0;

    function buildCheckoutDiscountBreakdown(cartItems, totalsForPricing, summaryDiscount, customerDiscount) {
      const safeItems = Array.isArray(cartItems) ? cartItems : [];
      const pricingTotals = {
        nonAutoTotal: Number(totalsForPricing?.nonAutoTotal || 0),
        autoEligibleTotal: Number(totalsForPricing?.autoEligibleTotal || 0),
      };
      let comboDiscount = 0;
      let productDiscount = 0;
      let autoAddDiscount = 0;
      const customerOrderDiscount = roundPrice(Math.max(0, Number(customerDiscount) || 0));

      safeItems.forEach((item) => {
        const qty = Math.max(0, Number(item?.qty || 0));
        if (!qty) return;

        if (item.type === "combo") {
          const currentUnit = roundPrice(Number(item.unit_price_override || 0));
          const oldRaw = Number(item.unit_price_before_discount || 0);
          const oldUnit = oldRaw > currentUnit ? roundPrice(oldRaw) : currentUnit;
          const lineDiscount = roundPrice(Math.max(0, (oldUnit - currentUnit) * qty));
          comboDiscount += lineDiscount;
          return;
        }

        const pricing = computeItemPricing(item, pricingTotals);
        const parts = pricing.parts || {};
        const product = item?.product || {};

        let originalUnit = Number(pricing.unitPrice || 0);
        if (product?.original_price && Number(product.original_price) > 0) {
          originalUnit = roundPrice(
            Number(product.original_price) +
            (Number(parts.optionTotal) || 0) +
            (Number(parts.ingredientDiff) || 0)
          );
        } else if (product?.old_price && Number(product.old_price) > Number(pricing.unitPrice || 0)) {
          originalUnit = roundPrice(
            Number(product.old_price) +
            (Number(parts.optionTotal) || 0) +
            (Number(parts.ingredientDiff) || 0)
          );
        } else {
          originalUnit = roundPrice(originalUnit);
        }

        // Для auto_add в breakdown используем ту же базу, что и в computeCartTotals:
        // только платное количество, включая корректный ноль.
        const originalQty = Number.isFinite(Number(pricing.paidQty))
          ? Math.max(0, Number(pricing.paidQty))
          : qty;
        const originalLineTotal = roundPrice(originalUnit * originalQty);
        const lineTotal = roundPrice(Number(pricing.lineTotal || 0));
        const lineDiscount = roundPrice(Math.max(0, originalLineTotal - lineTotal));
        if (!lineDiscount) return;

        if (pricing.isAuto || Number(item?.auto_add || 0) === 1) {
          autoAddDiscount += lineDiscount;
        } else {
          productDiscount += lineDiscount;
        }
      });

      comboDiscount = roundPrice(comboDiscount);
      productDiscount = roundPrice(productDiscount);
      autoAddDiscount = roundPrice(autoAddDiscount);

      const totalKnown = roundPrice(comboDiscount + productDiscount + autoAddDiscount + customerOrderDiscount);
      const target = roundPrice(Number(summaryDiscount) || 0);
      const otherDiscount = roundPrice(Math.max(0, target - totalKnown));

      return {
        comboDiscount,
        productDiscount,
        autoAddDiscount,
        customerOrderDiscount,
        otherDiscount,
      };
    }

    const discountBreakdown = buildCheckoutDiscountBreakdown(
      items,
      { nonAutoTotal, autoEligibleTotal },
      actualDiscount,
      customerOrderDiscountAmount
    );

    // Строка "Сумма товаров" (показываем только если есть скидка)
    const subtotalRow = document.createElement("div");
    subtotalRow.className = "shop-checkout-grid-row";
    const subtotalLabel = document.createElement("div");
    subtotalLabel.className = "muted";
    subtotalLabel.textContent = "Сумма товаров";
    const subtotalValue = document.createElement("div");
    subtotalValue.textContent = money(hasDiscount ? totalBeforeDiscount : total);
    subtotalRow.appendChild(subtotalLabel);
    subtotalRow.appendChild(subtotalValue);
    if (hasDiscount) {
      wrap.appendChild(subtotalRow);
    }

    // Строка скидки (если есть)
    const discountRow = document.createElement("div");
    discountRow.className = "shop-checkout-grid-row shop-checkout-discount-row";
    const discountLabelWrap = document.createElement("div");
    discountLabelWrap.className = "shop-checkout-discount-label-wrap";

    const discountLabel = document.createElement("div");
    discountLabel.className = "muted";
    discountLabel.textContent = "Скидка";
    discountLabelWrap.appendChild(discountLabel);

    const discountDetailItems = [
      { key: "combo", title: "Комбо", amount: Number(discountBreakdown.comboDiscount || 0) },
      { key: "product", title: "Товарные скидки", amount: Number(discountBreakdown.productDiscount || 0) },
      { key: "auto_add", title: "Автодобавление", amount: Number(discountBreakdown.autoAddDiscount || 0) },
      { key: "customer", title: "Клиентская скидка", amount: Number(discountBreakdown.customerOrderDiscount || 0) },
      { key: "other", title: "Прочие скидки", amount: Number(discountBreakdown.otherDiscount || 0) },
    ].filter((x) => x.amount > 0);

    const canShowDiscountDetails = discountDetailItems.length > 0;
    const discountDetails = document.createElement("div");
    discountDetails.className = "shop-checkout-discount-breakdown";
    discountDetails.setAttribute("aria-hidden", "true");

    discountDetailItems.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "shop-checkout-discount-breakdown-row";

      const label = document.createElement("div");
      label.className = "shop-checkout-discount-breakdown-label";
      label.textContent = entry.title;

      const value = document.createElement("div");
      value.className = "shop-checkout-discount-breakdown-value";
      value.textContent = `-${money(entry.amount)}`;

      row.appendChild(label);
      row.appendChild(value);
      discountDetails.appendChild(row);
    });

    const customerDiscountTitles = customerOrderAppliedDiscounts
      .map((d) => str(d?.title || "").trim())
      .filter(Boolean);
    if (customerDiscountTitles.length > 0) {
      const customerNote = document.createElement("div");
      customerNote.className = "shop-checkout-discount-breakdown-note";
      customerNote.textContent = `Скидка клиента: ${customerDiscountTitles.join(", ")}`;
      discountDetails.appendChild(customerNote);
    }

    if (canShowDiscountDetails) {
      const discountInfoBtn = document.createElement("button");
      discountInfoBtn.type = "button";
      discountInfoBtn.className = "shop-checkout-discount-info-btn";
      discountInfoBtn.setAttribute("aria-label", "Показать расшифровку скидки");
      discountInfoBtn.setAttribute("aria-expanded", "false");
      discountInfoBtn.innerHTML = `<i class="fas fa-info"></i>`;
      discountLabelWrap.appendChild(discountInfoBtn);

      discountInfoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const willOpen = !discountDetails.classList.contains("is-open");
        discountDetails.classList.toggle("is-open", willOpen);
        discountInfoBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        discountDetails.setAttribute("aria-hidden", willOpen ? "false" : "true");
      });
    }

    const discountValue = document.createElement("div");
    discountValue.className = "shop-checkout-discount-value";
    discountValue.textContent = `-${money(actualDiscount)}`;
    discountRow.appendChild(discountLabelWrap);
    discountRow.appendChild(discountValue);
    if (hasDiscount) {
      wrap.appendChild(discountRow);
      if (canShowDiscountDetails) wrap.appendChild(discountDetails);
    }

    const totalRow = document.createElement("div");
    totalRow.className = "shop-checkout-grid-row shop-checkout-total-row";
    const totalLabel = document.createElement("div");
    totalLabel.textContent = "Итого";
    const totalValue = document.createElement("div");
    totalValue.textContent = money(currentPayableTotal);
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalValue);
    wrap.appendChild(totalRow);

    function updateChangeOptions(nextTotal) {
      currentPayableTotal = nextTotal;
      const amounts = [500, 1000, 2000, 5000].filter(v => v > currentPayableTotal);
      const options = [
        { code: "", title: "Сдача не нужна" },
        ...amounts.map(v => ({ code: String(v), title: String(v) })),
        { code: "custom", title: "Другая сумма" },
      ];
      const currentValue = changeSelect.getValue();
      const isCustom = currentValue === "custom";
      const nextValue = isCustom ? "custom" : (options.find(o => o.code === currentValue) ? currentValue : "");
      changeSelect.setOptions(options, nextValue);

      const minAmount = Math.ceil(currentPayableTotal) + 1;
      changeCustomInput.min = String(minAmount);
      changeCustomInput.placeholder = `Больше ${Math.ceil(currentPayableTotal)}`;
      if (changeCustomInput.value) {
        const val = parseInt(changeCustomInput.value, 10);
        if (val && val <= currentPayableTotal) changeCustomInput.value = "";
      }
    }

    function updateDeliveryPricing() {
      const methodCode = methodSelect.getValue() || methodDefault || "takeaway";
      const isDelivery = methodCode === "delivery";
      const deliveryCost = isDelivery ? getDeliveryCostForTotal(orderTotal) : 0;
      const payableTotal = orderTotal + deliveryCost;

      updateChangeOptions(payableTotal);
      refreshChangeVisibility();

      if (deliveryInfoWrap) deliveryInfoWrap.style.display = isDelivery ? "" : "none";
      if (deliveryCostValue) deliveryCostValue.textContent = isDelivery ? money(deliveryCost) : "—";

      if (deliveryFreeNote) {
        if (!isDelivery) {
          deliveryFreeNote.style.display = "none";
        } else if (deliveryRules.freeFrom != null) {
          if (deliveryRules.freeFrom <= 0) {
            deliveryFreeNote.textContent = "Доставка бесплатно";
          } else {
            deliveryFreeNote.textContent = `Бесплатно от ${money(deliveryRules.freeFrom)}`;
          }
          deliveryFreeNote.style.display = "";
        } else {
          deliveryFreeNote.style.display = "none";
        }
      }

      if (deliveryMinNote) {
        if (!isDelivery || deliveryRules.minOrder <= 0) {
          deliveryMinNote.style.display = "none";
        } else {
          if (orderTotal < deliveryRules.minOrder) {
            const diff = deliveryRules.minOrder - orderTotal;
            deliveryMinNote.textContent = `Минимальная сумма заказа ${money(deliveryRules.minOrder)}. Добавьте ещё ${money(diff)}.`;
          } else {
            deliveryMinNote.textContent = `Минимальная сумма заказа ${money(deliveryRules.minOrder)}.`;
          }
          deliveryMinNote.style.display = "";
        }
      }

      if (totalValue) totalValue.textContent = money(payableTotal);
      setCheckoutSubmitLabel(payableTotal);

      if (actions?.submitBtn) {
        const shouldBlock = isDelivery && deliveryRules.minOrder > 0 && orderTotal < deliveryRules.minOrder;
        actions.submitBtn.disabled = shouldBlock;
      }
    }

    function refreshChangeVisibility() {
      const isCash = paySelect.getValue() === "cash";
      changeWrap.style.display = "";
      changeSelect.root.style.display = isCash ? "" : "none";
      changeNonCashHint.style.display = isCash ? "none" : "";
      const isCustom = changeSelect.getValue() === "custom";
      const showCustomInput = isCash && isCustom;
      changeCustomInput.style.display = showCustomInput ? "" : "none";
      changeWrap.classList.toggle("is-combined", showCustomInput);
    }
    paySelect.root.addEventListener("change", clearPaymentInvalidState);
    paySelect.root.addEventListener("change", refreshChangeVisibility);
    changeSelect.root.addEventListener("change", refreshChangeVisibility);
    refreshChangeVisibility();
    updateDeliveryPricing();

    function getChangeFromValue() {
      const val = changeSelect.getValue();
      if (!val) return null;
      if (val === "custom") {
        const customVal = parseInt(changeCustomInput.value, 10);
        return customVal > 0 ? customVal : null;
      }
      return Number(val);
    }

    // Промокод временно скрыт
    const promo = { value: draft.promo_code || "" };

      if (hasAddressEditor) {
        changeAddrBtn.addEventListener("click", async () => {
          const methodCode = methodSelect.getValue() || methodDefault || "takeaway";
          saveCheckoutDraft({
            promo_code: str(promo.value).trim() || null,
            customer_name: str(name.value).trim(),
            customer_phone: str(phone.value).trim(),
            method_code: methodCode,
            method_user_selected: Boolean(draft.method_user_selected),
            delivery_address: str(address.value).trim() || null,
            pickup_store_id: selectedPickupStoreId || null,
            comment: getCommentValue() || null,
            address_comment: draft?.address_comment ?? null,
            time_option_code: timeSelect.getValue() || timeDefault || "asap",
            scheduled_at: timeInput.value || "",
            scheduled_date: getDateString(selectedDate),
            payment_code: paySelect.getValue() || null,
            change_from: getChangeFromValue(),
          });
          cleanupCheckoutViewSubscriptions();
          if (typeof onEditAddress === "function") onEditAddress();
          else await openAddressEditorFromCheckout();
        });
      }

    // Обработчик кнопки изменения точки самовывоза
      changePickupBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!pickupStores.length) {
          alert('Нет доступных точек самовывоза');
          return;
        }

        // Сохраняем черновик перед переходом
        const methodCode = methodSelect.getValue() || methodDefault || "takeaway";
        saveCheckoutDraft({
          promo_code: str(promo.value).trim() || null,
          customer_name: str(name.value).trim(),
          customer_phone: str(phone.value).trim(),
          method_code: methodCode,
          method_user_selected: Boolean(draft.method_user_selected),
          delivery_address: str(address.value).trim() || null,
          pickup_store_id: selectedPickupStoreId || null,
          comment: getCommentValue() || null,
          address_comment: draft?.address_comment ?? null,
          time_option_code: timeSelect.getValue() || timeDefault || "asap",
          scheduled_at: timeInput.value || "",
          scheduled_date: getDateString(selectedDate),
          payment_code: paySelect.getValue() || null,
          change_from: getChangeFromValue(),
        });

        // Переключаем на pickup view (sheet или panel)
        cleanupCheckoutViewSubscriptions();
        if (typeof onEditPickup === "function") onEditPickup();
        else showPickupListView('checkout');
      });

    container.appendChild(wrap);
    if (timeSelect && typeof timeSelect.ensureCentered === "function") {
      timeSelect.ensureCentered();
    }
    if (paySelect && typeof paySelect.ensureCentered === "function") {
      paySelect.ensureCentered();
    }

    updateMobileDeliveryProgress();

    const resultWrap = document.createElement("div");
    resultWrap.className = "shop-order-result hidden";
    container.appendChild(resultWrap);
    let checkoutSendingOverlay = null;

    function ensureCheckoutSendingOverlay() {
      if (checkoutSendingOverlay) return checkoutSendingOverlay;
      const overlay = document.createElement("div");
      overlay.className = "shop-checkout-sending-overlay hidden";
      overlay.innerHTML = `
        <div class="shop-checkout-sending-card">
          <div class="shop-checkout-sending-spinner" aria-hidden="true"></div>
          <div class="shop-checkout-sending-text">Подождите, отправляем заказ...</div>
        </div>
      `;
      document.body.appendChild(overlay);
      checkoutSendingOverlay = overlay;
      return overlay;
    }
    if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
    if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

    function setCheckoutSubmitting(isSubmitting) {
      if (actions?.submitBtn) actions.submitBtn.disabled = !!isSubmitting;
      if (elMobileCheckoutSubmitBtn) elMobileCheckoutSubmitBtn.disabled = !!isSubmitting;
      const overlay = ensureCheckoutSendingOverlay();
      overlay.classList.toggle("hidden", !isSubmitting);
    }

    function showOrderSuccess(orderId, publicId, totalPrice) {
      resultWrap.innerHTML = `
        <div class="shop-order-result-card">
          <div class="shop-order-result-icon"><i class="fas fa-check-circle"></i></div>
          <h2 class="shop-order-result-title">Заказ оформлен</h2>
          <p class="shop-order-result-order">Заказ #${orderId}</p>
          <p class="shop-order-result-total">${money(totalPrice)}</p>
        </div>`;
      resultWrap.classList.remove("hidden");
      wrap.classList.add("hidden");

      const goToMain = async () => {
        __forceHideCheckoutDeliveryProgress = false;
        clearCartAll();
        saveCheckoutDraft({});
        if (typeof window.updateActiveOrdersBadge === "function") { Promise.resolve(window.updateActiveOrdersBadge({ force: true })).catch(() => {}); }
        if (isSheet) {
          if (typeof closeShopSheetIfOpen === "function") {
            closeShopSheetIfOpen();
          } else if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
            window.AppModal.close("sheet");
          }
          return;
        } else if (typeof showCartView === "function") {
          showCartView();
        }
        if (typeof setActiveNav === "function") setActiveNav("menu");
        try {
          const scroller = document.querySelector(".shop-products-panel .panel-body");
          if (scroller && typeof scroller.scrollTo === "function") scroller.scrollTo({ top: 0, behavior: "smooth" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {}
      };

      if (actions?.backBtn) {
        actions.backBtn.classList.add("hidden");
      }
      if (actions?.submitBtn) {
        actions.submitBtn.textContent = "На главную";
        actions.submitBtn.disabled = false;
        actions.submitBtn.onclick = (e) => {
          e.preventDefault();
          goToMain();
        };
      }
      const footerEl = actions?.backBtn?.parentElement;
      if (footerEl) footerEl.classList.add("is-order-success");

      if (elCheckoutFooterActions) elCheckoutFooterActions.classList.add("is-order-success");
      if (elMobileCheckoutBackBtn) {
        elMobileCheckoutBackBtn.classList.add("hidden");
        elMobileCheckoutBackBtn.parentElement?.classList.add("is-order-success");
      }
      if (elMobileCheckoutSubmitBtn) {
        elMobileCheckoutSubmitBtn.textContent = "На главную";
        elMobileCheckoutSubmitBtn.onclick = (e) => {
          e.preventDefault();
          goToMain();
        };
      }

      // Мобильная навигация: после оформления заказа показываем
      // нижний блок корзины в режиме "успешный заказ" с кнопкой "На главную"
      const mobileNameWrap = document.getElementById("shopMobileCheckoutNameWrap");
      if (mobileNameWrap) mobileNameWrap.classList.add("hidden");
      const mobileCommentWrap = document.getElementById("shopMobileCheckoutCommentWrap");
      if (mobileCommentWrap) mobileCommentWrap.classList.add("hidden");
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions && elMobileCartActionsCheckout) {
        elMobileCartActions.classList.remove("hidden");
        if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
        elMobileCartActionsCheckout.classList.remove("hidden");
        elMobileCartActionsCheckout.classList.add("is-order-success");
        if (elMobileDeliveryProgressWrap) elMobileDeliveryProgressWrap.classList.add("hidden");
      }
      if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
    }

    function showOrderConflict(existingOrder, onCreateNew, onCancel) {
      const totalStr = money(existingOrder.total_price || 0);
      resultWrap.innerHTML = `
        <div class="shop-order-result-card shop-order-result-conflict">
          <div class="shop-order-result-icon shop-order-result-icon--warn"><i class="fas fa-info-circle"></i></div>
          <h2 class="shop-order-result-title">Похожий заказ уже есть</h2>
          <p class="shop-order-result-text">У вас уже есть заказ #${existingOrder.id} на сумму ${totalStr}.</p>
          <p class="shop-order-result-text">Создать новый заказ?</p>
          <div class="shop-order-result-actions">
            <button type="button" class="btn btn-primary shop-order-result-btn" data-action="order-conflict-new">Создать новый заказ</button>
            <button type="button" class="btn shop-order-result-btn" data-action="order-conflict-cancel">Нет, вернуться</button>
          </div>
        </div>`;
      resultWrap.classList.remove("hidden");
      wrap.classList.add("hidden");
      const btnNew = resultWrap.querySelector("[data-action=\"order-conflict-new\"]");
      const btnCancel = resultWrap.querySelector("[data-action=\"order-conflict-cancel\"]");
      if (btnNew) btnNew.onclick = () => onCreateNew();
      if (btnCancel) btnCancel.onclick = () => {
        resultWrap.classList.add("hidden");
        resultWrap.innerHTML = "";
        wrap.classList.remove("hidden");
        onCancel();
      };
    }

    if (actions?.backBtn && typeof onBack === "function") {
      actions.backBtn.onclick = () => {
        cleanupCheckoutViewSubscriptions();
        onBack();
      };
    }

    if (actions?.submitBtn) {
      actions.submitBtn.onclick = async () => {
        const resolvedItems = cartItemsResolved();
        const totals = computeCartTotals(resolvedItems);
      const payload = {
        customer_name: str(name.value).trim(),
        customer_phone: str(phone.value).trim(),
        promo_code: str(promo.value).trim() || null,
        method_code: methodSelect.getValue() || methodDefault || "takeaway",
        delivery_address: str(address.value).trim() || null,
        delivery_address_id: (methodSelect.getValue() || methodDefault || "takeaway") === "delivery" && state.selectedAddress?.id ? Number(state.selectedAddress.id) : null,
        pickup_store_id: selectedPickupStoreId || null,
        comment: getCommentValue() || null,
        address_comment: (draft && draft.address_comment) ? str(draft.address_comment).trim() || null : null,
        time_option_code: timeSelect.getValue() || timeDefault || "asap",
        scheduled_at: null,
        payment_code: paySelect.getValue() || null,
        cutlery_qty: 0,
        change_from: getChangeFromValue(),
        items: resolvedItems.map(x => {
          if (x.type === "combo") {
            const pricing = computeItemPricing(x, totals);
            // Старая цена до скидки комбо
            const comboOldLineTotal = (Number(x.unit_price_before_discount) || 0) * (x.qty || 1);
            return {
              type: "combo",
              combo_id: x.combo_id,
              combo_title: x.combo_title || "Комбо",
              qty: x.qty,
              line_total: pricing.lineTotal,
              old_line_total: comboOldLineTotal > pricing.lineTotal ? comboOldLineTotal : 0,
              selections: Array.isArray(x.selections)
                ? x.selections.map((s) => ({
                    product_id: s.product_id,
                    product_name: s.product_name,
                    product_photo: s.product_photo,
                    variant_label: s.variant_label,
                    variant_group_title: s.variant_group_title,
                    variant_unit: s.variant_unit,
                    variant_value_index: s.variant_value_index,
                    variant_group_id: s.variant_group_id,
                    ingredients_display: Array.isArray(s.ingredients_display) ? s.ingredients_display : [],
                    unit_price_override: s.unit_price_override,
                  }))
                : [],
            };
          }
          // Рассчитываем итоговую цену товара (базовая + опции + разница ингредиентов + варианты)
          const pricing = computeItemPricing(x, totals);
          const lineTotal = pricing.lineTotal;

          // Формируем информацию о варианте для сохранения
          const variant = (x.variant_group_id && x.variant_label) ? {
            variant_group_id: x.variant_group_id,
            variant_value_index: x.variant_value_index,
            group_title: "", // Будет заполнено на сервере
            value: x.variant_label || "",
            label: x.variant_label || "",
            price_diff: 0, // Варианты не имеют доплаты, цена уже учтена в variant_unit_price
          } : null;

          return {
            product_id: x.product.id,
            qty: x.qty,
            option_item_ids: x.option_item_ids || [],
            option_items: x.option_items || [],
            ingredients: x.ingredients || [],
            variant_group_id: x.variant_group_id || null,
            variant_value_index: x.variant_value_index || null,
            variant_label: x.variant_label || null,
            variant: variant,
            line_total: lineTotal, // Отправляем уже посчитанную итоговую цену
            original_line_total: roundPrice(pricing.unitPrice * pricing.paidQty), // Цена до скидки
          };
        }),
      };

      const isAuthed = !!(getCustomerToken() && me);
      const requireClientData = isMethodClientDataRequired(payload.method_code);

      if (!requireClientData) {
        if (!str(payload.customer_name).trim() || isPlaceholderCustomerName(payload.customer_name)) {
          payload.customer_name = null;
        }
        if (!str(payload.customer_phone).trim()) {
          payload.customer_phone = null;
        }
      }

      if (requireClientData && (!payload.customer_name || isPlaceholderCustomerName(payload.customer_name))) {
        if (typeof showToast === "function") showToast("Введите имя");
        if (mobileNameInput && typeof mobileNameInput.classList?.add === "function") {
          mobileNameInput.classList.add("is-invalid");
        }
        if (desktopFooterNameInput && typeof desktopFooterNameInput.classList?.add === "function") {
          desktopFooterNameInput.classList.add("is-invalid");
        }
        if (name && typeof name.classList?.add === "function") {
          name.classList.add("is-invalid");
        }
        const nameFocusTarget = showMobileNameInput
          ? mobileNameInput
          : (showDesktopFooterNameInput ? desktopFooterNameInput : name);
        if (nameFocusTarget && typeof nameFocusTarget.focus === "function") {
          nameFocusTarget.focus();
          if (typeof nameFocusTarget.select === "function") nameFocusTarget.select();
          if (typeof nameFocusTarget.scrollIntoView === "function") {
            nameFocusTarget.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }
        return;
      }

      if (!isAuthed) {
        const rawPhone = str(payload.customer_phone).trim();
        const hasPhone = !!rawPhone;
        const normPhone = hasPhone ? normalizePhone(rawPhone) : null;
        if ((requireClientData || hasPhone) && (!normPhone || normPhone.length !== 11 || !normPhone.startsWith("7"))) {
          alert("Введите телефон (РФ): +7XXXXXXXXXX");
          return;
        }
        if (normPhone) {
          payload.customer_phone = `+${normPhone}`;
        } else if (!requireClientData) {
          payload.customer_phone = null;
        }
      }

      if (payload.method_code === "delivery" && deliveryRules.minOrder > 0 && orderTotal < deliveryRules.minOrder) {
        const diff = deliveryRules.minOrder - orderTotal;
        alert(`Минимальная сумма заказа ${money(deliveryRules.minOrder)}. Добавьте ещё ${money(diff)}.`);
        return;
      }
      if (payload.method_code === "delivery" && !payload.delivery_address) {
        alert("Введите адрес доставки");
        return;
      }

      if ((payload.method_code === "takeaway" || payload.method_code === "pickup") && !payload.pickup_store_id) {
        alert("Выберите точку самовывоза");
        return;
      }
      if (!payload.payment_code) {
        alert("Выберите способ оплаты");
        markPaymentInvalidState();
        return;
      }

      if ((payload.time_option_code === "at_time" || payload.time_option_code === "on_date")) {
        if (!timeInput.value) {
          alert("Укажите время");
          return;
        }
        // Use store timezone to ensure correct date is used
        const storeTimezone = cfg.storeTimezone || "+0";
        if (payload.time_option_code === "on_date") {
          payload.scheduled_at = `${getDateString(selectedDate)} ${timeInput.value}:00`;
        } else {
          payload.scheduled_at = `${getTodayDateString(storeTimezone)} ${timeInput.value}:00`;
        }
      }

      setCheckoutSubmitting(true);

      if (isAuthed && needsNameCompletion && requireClientData && payload.customer_name) {
        try {
          await apiJson("/api/public/me", { method: "PUT", body: { name: payload.customer_name } });
        } catch (e) {
          console.warn("Failed to persist customer name before checkout submit:", e);
        }
      }

      

      saveCheckoutDraft({
        promo_code: payload.promo_code,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        method_code: payload.method_code,
        delivery_address: payload.delivery_address,
        pickup_store_id: payload.pickup_store_id,
        comment: payload.comment,
        address_comment: payload.address_comment ?? draft?.address_comment ?? null,
        time_option_code: payload.time_option_code,
        scheduled_at: timeInput.value || "",
        scheduled_date: getDateString(selectedDate),
        payment_code: payload.payment_code,
        change_from: payload.change_from,
      });

      setCheckoutSubmitting(true);

      const orderTotalWithDelivery = orderTotal + getDeliveryCostForTotal(orderTotal);

      try {
        const res = await apiJson("/api/public/orders", { method: "POST", body: payload });

        if (res.data && res.data.duplicate && res.data.needConfirmation && res.data.existingOrder) {
          setCheckoutSubmitting(false);
          setCheckoutSubmitLabel();
          showOrderConflict(res.data.existingOrder, async () => {
            payload.force_new = true;
            const btnNewAgain = resultWrap.querySelector("[data-action=\"order-conflict-new\"]");
            if (btnNewAgain) {
              btnNewAgain.disabled = true;
              btnNewAgain.textContent = "Отправляем…";
            }
            try {
              const res2 = await apiJson("/api/public/orders", { method: "POST", body: payload });
              if (res2.data && res2.data.id && res2.data.public_id) {
                localStorage.setItem(LAST_ORDER_KEY, String(res2.data.public_id));
                clearCartAll();
                saveCheckoutDraft({});
                setCheckoutSubmitting(false);
                showOrderSuccess(res2.data.id, res2.data.public_id, orderTotalWithDelivery);
              } else {
                alert("Не удалось создать заказ.");
                if (btnNewAgain) {
                  btnNewAgain.disabled = false;
                  btnNewAgain.textContent = "Создать новый заказ";
                }
              }
            } catch (e2) {
              console.error(e2);
              alert("Ошибка оформления заказа: " + (e2.message || "UNKNOWN"));
              if (btnNewAgain) {
                btnNewAgain.disabled = false;
                btnNewAgain.textContent = "Создать новый заказ";
              }
            }
          }, () => {
            setCheckoutSubmitting(false);
            setCheckoutSubmitLabel();
          });
          return;
        }

        if (res.data && res.data.id && res.data.public_id) {
          localStorage.setItem(LAST_ORDER_KEY, String(res.data.public_id));
          clearCartAll();
          saveCheckoutDraft({});
          if (typeof window.updateActiveOrdersBadge === "function") { Promise.resolve(window.updateActiveOrdersBadge({ force: true })).catch(() => {}); }
          setCheckoutSubmitting(false);
          showOrderSuccess(res.data.id, res.data.public_id, orderTotalWithDelivery);
        } else {
          setCheckoutSubmitting(false);
          setCheckoutSubmitLabel();
        }
      } catch (e) {
        console.error(e);
        if (e.message === "MIN_ORDER" && deliveryRules.minOrder > 0) {
          alert(`Минимальная сумма заказа ${money(deliveryRules.minOrder)}.`);
          setCheckoutSubmitting(false);
          setCheckoutSubmitLabel();
          return;
        }
        alert("Ошибка оформления заказа: " + (e.message || "UNKNOWN"));
        setCheckoutSubmitting(false);
        setCheckoutSubmitLabel();
      }
      };
    }
  }

  // -----------------------------
  // Pull-to-refresh (PWA / мобилка)
  // -----------------------------
  function getScrollTopForRefresh() {
    const panel = document.querySelector(".shop-products-panel .panel-body");
    if (panel) {
      const style = window.getComputedStyle(panel);
      const overflowY = style.overflowY;
      const isScrollable = panel.scrollHeight > panel.clientHeight && overflowY !== "visible";
      if (isScrollable) return panel.scrollTop;
    }
    return window.scrollY || 0;
  }

  function initPullToRefresh() {
    if (!isShopPage()) return;
    const PULL_THRESHOLD = 70;
    let pullStartY = null;
    let pullDistance = 0;

    document.addEventListener(
      "touchstart",
      (e) => {
        if (getScrollTopForRefresh() === 0) {
          pullStartY = e.touches[0].pageY;
          pullDistance = 0;
        } else {
          pullStartY = null;
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        if (pullStartY === null) return;
        const currentY = e.touches[0].pageY;
        if (currentY > pullStartY && getScrollTopForRefresh() === 0) {
          pullDistance = currentY - pullStartY;
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "touchend",
      () => {
        if (pullStartY !== null && pullDistance >= PULL_THRESHOLD) {
          refreshShopData();
        }
        pullStartY = null;
        pullDistance = 0;
      },
      { passive: true }
    );
  }

function initShopLate() {
  try {
    runWhenIdle(async () => {
      try {
        await loadUnitConversions();
        await loadAutoAdd();
        await loadUpsellProducts();
        if (applyAutoAddRules()) {
          saveCart();
          if (typeof syncAllProductCardsFromCart === "function") syncAllProductCardsFromCart();
        }
        await warmupCartProducts();
        renderCart();
        updateCartBadge();
        await initAddresses();
      } catch (e) {
        console.warn("initShopLate: background tasks failed", e);
      }
    }, 2500);

        bindCategoryScrollSpy();
        initPullToRefresh();

      if (elCartContent && !elCartContent.classList.contains("hidden")) {
        showCartView();
      }
      if (elCartClearBtn) {
        attachTwoStepClear(elCartClearBtn, () => clearCartAll());
      }
      if (elCheckoutBtn) {
        elCheckoutBtn.addEventListener("click", async () => {
          const authorized = await requireAuthForCheckout({ isSheet: false });
          if (!authorized) return;
          if (!elCheckoutContent) return;
          showCheckoutView();
          await openCheckoutView({
            container: elCheckoutContent,
            onBack: showCartView,
            hasAddressEditor: true,
            isSheet: false,
            actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
          });
        });
      }

      if (elCartBackBtn) {
        elCartBackBtn.addEventListener("click", () => {
          // Комбо: шаг назад (экран "Заменить" → основное представление комбо)
          if (typeof window._comboStepBackCallback === "function") {
            window._comboStepBackCallback();
            return;
          }
          // Товар/комбо, открытый из контекста (например, из деталей заказа): возвращаемся в тот же контекст
          if (cartViewMode === "product" && openProductCtx && typeof openProductCtx.onBack === "function") {
            openProductCtx.onBack();
            return;
          }
          // Режим просмотра деталей заказа
          if (window._isViewingOrderDetails && typeof window._showOrdersListCallback === "function") {
            window._showOrdersListCallback();
            return;
          }
          openProductCtx = null;
          showCartView();
        });
      }

      // Nav
      const isSheetOpenOfType = (type) => {
        if (!window.AppModal || typeof window.AppModal.isOpen !== "function") return false;
        if (!window.AppModal.isOpen()) return false;
        return sheetNavigationState.type === type;
      };

      const bindNavToggle = (el, type, opener) => {
        if (!el) return;
        el.addEventListener("click", () => {
          if (isSheetOpenOfType(type)) {
            closeShopSheetIfOpen();
            setActiveNav("menu");
            return;
          }
          closeShopSheetIfOpen();
          opener();
        });
      };

      bindNavToggle(elNavCategories, "categories", openCategoriesSheet);
      // Корзина: при просмотре карточки товара — сразу переключаем на корзину, а не закрываем
      if (elNavCart) {
        elNavCart.addEventListener("click", () => {
          const sheetOpen = window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen();
          const notOnCart =
            sheetOpen &&
            sheetNavigationState.type === "cart" &&
            openCartSheetCtx &&
            sheetNavigationState.screen &&
            sheetNavigationState.screen !== "cart";
          if (notOnCart) {
            const showCart = openCartSheetCtx?.showSheetCart;
            if (typeof showCart === "function") showCart();
            if (typeof setActiveNav === "function") setActiveNav("cart");
            return;
          }
          if (isSheetOpenOfType("cart")) {
            closeShopSheetIfOpen();
            setActiveNav("menu");
            return;
          }
          closeShopSheetIfOpen();
          openCartSheet();
        });
      }
      bindNavToggle(elNavProfile, "profile", () => openProfileSheet());
      bindNavToggle(elNavFav, "favorites", openFavoritesSheet);

      // Обработчик кнопки "назад" на Android (popstate)
      // Добавляем запись в историю при открытии bottom sheet, чтобы можно было обработать "назад"
      let originalOpen = window.AppModal?.open;
      let originalClose = window.AppModal?.close;
      let isOpeningSheet = false;
      let hasSheetHistoryEntry = false;
      const ensureSheetHistoryEntry = () => {
        if (hasSheetHistoryEntry) return;
        window.history.pushState({ sheet: true, shopBack: true }, '', window.location.href);
        hasSheetHistoryEntry = true;
      };
      if (originalOpen && typeof originalOpen === 'function') {
        window.AppModal.open = function(opts) {
          // Добавляем запись в историю перед открытием только если sheet еще не открыт
          if (!isOpeningSheet && (!window.AppModal.isOpen || !window.AppModal.isOpen())) {
            isOpeningSheet = true;
            ensureSheetHistoryEntry();
            setTimeout(() => {
              isOpeningSheet = false;
            }, 100);
          }
          return originalOpen.call(this, opts);
        };
      }
      if (originalClose && typeof originalClose === "function") {
        window.AppModal.close = function(type) {
          const result = originalClose.call(this, type);
          if (!window.AppModal.isOpen || !window.AppModal.isOpen()) {
            hasSheetHistoryEntry = false;
            resetShopModalHeaderUi();
            if (typeof schedulePostModalCloseUiSync === "function") {
              schedulePostModalCloseUiSync();
            } else {
              try {
                document.body.classList.remove("shop-address-sheet-active");
              } catch {}
              if (elMobileAddressActions) elMobileAddressActions.classList.add("hidden");
              if (elMobileAddressConfirm) elMobileAddressConfirm.classList.add("hidden");
              if (typeof queueMobileUiStateSync === "function") {
                queueMobileUiStateSync("appModal.close.fallback");
              } else if (typeof window.queueShopMobileUiStateSync === "function") {
                window.queueShopMobileUiStateSync("appModal.close.fallback");
              }
              if (typeof window.updateActiveOrdersBadge === "function") {
                window.updateActiveOrdersBadge();
              }
            }
          }
          return result;
        };
      }

      // Глобальный обработчик popstate для всех bottom sheets
      // Используем флаг, чтобы избежать конфликтов с другими обработчиками
      let isHandlingBackButton = false;
      window.addEventListener("popstate", (e) => {
        if (isHandlingBackButton) return;
      
        if (handleAndroidBackButton()) {
          // Предотвращаем стандартное поведение браузера
          e.preventDefault();
          e.stopPropagation();
          // Добавляем запись обратно в историю, чтобы можно было снова нажать "назад"
          isHandlingBackButton = true;
          window.history.pushState({ sheet: true, shopBack: true }, '', window.location.href);
          hasSheetHistoryEntry = true;
          setTimeout(() => {
            isHandlingBackButton = false;
          }, 0);
        } else if (!window.AppModal || !window.AppModal.isOpen || !window.AppModal.isOpen()) {
          hasSheetHistoryEntry = false;
        }
      });

      // "Главная" (домик):
      // 1) если открыт любой шит/модалка — закрываем и возвращаемся в каталог
      // 2) если ничего не открыто — скроллим каталог наверх (внутренний скролл-контейнер на мобилке)
      if (elNavMenu) {
        elNavMenu.addEventListener("click", () => {
          const isAnySheetOpen =
            window.AppModal &&
            typeof window.AppModal.isOpen === "function" &&
            window.AppModal.isOpen();

          if (isAnySheetOpen) {
            closeShopSheetIfOpen(); // закрыть то, что открыто (категории/корзина/профиль/детали)
            setActiveNav("menu");
            return;
          }

          setActiveNav("menu");

          // на мобилке скролл либо внутри панели каталога, либо у body (iOS)
          const scroller = document.querySelector(".shop-products-panel .panel-body");
          let canScrollPanel = false;

          if (scroller && typeof scroller.scrollTo === "function") {
            const scrollerStyle = window.getComputedStyle(scroller);
            const overflowY = scrollerStyle ? scrollerStyle.overflowY : "";
            canScrollPanel = scroller.scrollHeight > scroller.clientHeight && overflowY !== "visible";
          }

          if (canScrollPanel && scroller) {
            scroller.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
      }

      if (elCartOpenDesktop) elCartOpenDesktop.addEventListener("click", openCartSheet);

      if (elHeaderFavoritesBtn) {
        elHeaderFavoritesBtn.addEventListener("click", (e) => {
          if (isShopPage()) {
            e.preventDefault();
            openFavoritesSheet({ force: true });
          }
        });
      }

      // Header profile: не уходим на /auth, открываем модалку
      if (elHeaderProfileBtn) {
        elHeaderProfileBtn.addEventListener("click", (e) => {
          // только на витрине
          if (isShopPage()) {
            e.preventDefault();
            openProfileSheet();
          }
        });
      }

      // Глобальная переменная для хранения активных заказов
      window._activeOrders = [];
      let activeOrdersBadgeLoading = false;
      let activeOrdersBadgeLastSyncAt = 0;
      const ACTIVE_ORDERS_BADGE_MIN_REFRESH_MS = 4000;
    
      // Активные заказы: обновление бейджа и обработчик клика
      window.updateActiveOrdersBadge = async function updateActiveOrdersBadge(opts = {}) {
        const badges = [elActiveOrdersBadge, elActiveOrdersBadgeMobile, elActiveOrdersSheetCollapsed].filter(Boolean);
        if (badges.length === 0) return;
      
        // Проверяем, находимся ли мы на главной странице витрины
        const isShopMainPage = isShopPage();
        const isMobile = window.matchMedia("(max-width: 768px)").matches;
      
        // Проверяем активную вкладку в мобильной навигации
        let isMainTabActive = true;
        let isAnyModalOpen = false;
      
        if (isMobile) {
          // Проверяем, открыто ли модальное окно (профиль, корзина, категории и т.д.)
          if (window.AppModal && typeof window.AppModal.isOpen === "function") {
            isAnyModalOpen = window.AppModal.isOpen();
          }
        
          // Проверяем, активна ли главная вкладка (menu)
          // Ищем элемент с классом is-active среди навигационных кнопок
          const activeNavBtn = document.querySelector(".shop-nav-btn.is-active");
          if (activeNavBtn) {
            const activeTab = activeNavBtn.getAttribute("data-tab") || activeNavBtn.id;
            isMainTabActive = activeTab === "menu" || activeTab === "shopNavMenu";
          } else if (elNavMenu) {
            // Fallback: проверяем elNavMenu напрямую
            isMainTabActive = elNavMenu.classList.contains("is-active");
          }
        }

        // Если не главная вкладка/страница или открыт модал — скрываем мгновенно
        const isProductOpen = elMobileProductActions && !elMobileProductActions.classList.contains("hidden");
        if (isMobile && (!isShopMainPage || !isMainTabActive || isAnyModalOpen || isProductOpen)) {
          badges.forEach(badge => badge.classList.add("hidden"));
          if (typeof queueMobileUiStateSync === "function") {
            queueMobileUiStateSync("updateActiveOrdersBadge.prehide");
          } else if (typeof window.queueShopMobileUiStateSync === "function") {
            window.queueShopMobileUiStateSync("updateActiveOrdersBadge.prehide");
          }
          return;
        }

        const forceRefresh = Boolean(opts && opts.force === true);
        if (activeOrdersBadgeLoading) return;
        if (!forceRefresh && Date.now() - activeOrdersBadgeLastSyncAt < ACTIVE_ORDERS_BADGE_MIN_REFRESH_MS) {
          return;
        }
        activeOrdersBadgeLoading = true;
      
        try {
          const token = getCustomerToken();
          if (!token) {
            badges.forEach(badge => badge.classList.add("hidden"));
            window._activeOrders = [];
            return;
          }

          const json = await apiJson("/api/public/me/orders?limit=20");
          const orders = Array.isArray(json.data) ? json.data : [];
        
          // Считаем активные заказы: все заказы с нефинальными статусами
          // Активными считаем заказы, у которых статус не является финальным (is_final !== 1)
          const activeOrders = orders.filter(order => {
            const isFinal = Number(order.status_is_final || 0) === 1;
            return !isFinal;
          });

          // Сохраняем активные заказы в глобальную переменную
          window._activeOrders = activeOrders;
          activeOrdersBadgeLastSyncAt = Date.now();

          const count = activeOrders.length;
        
          if (count > 0) {
            badges.forEach(badge => {
              const countEl = badge.querySelector(".shop-active-orders-count");
              const textEl = badge.querySelector(".shop-active-orders-text");
            
              // Для мобильного приоткрытого bottom sheet: если заказ один, показываем статус
              if (elActiveOrdersSheetCollapsed && badge === elActiveOrdersSheetCollapsed && count === 1) {
                const order = activeOrders[0];
                const statusTitle = order.status_title || "";
                if (textEl) {
                  textEl.textContent = statusTitle ? `Активный заказ • ${statusTitle}` : "Активный заказ";
                }
                if (countEl) {
                  countEl.textContent = "";
                }
              } else if (elActiveOrdersBadgeMobile && badge === elActiveOrdersBadgeMobile && count === 1) {
                // Для старого мобильного бейджа: если заказ один, показываем статус
                const order = activeOrders[0];
                const statusTitle = order.status_title || "";
                if (textEl) {
                  textEl.textContent = statusTitle ? `Активный заказ • ${statusTitle}` : "Активный заказ";
                }
                if (countEl) {
                  countEl.textContent = "";
                }
              } else {
                // Для нескольких заказов или десктопного бейджа
                if (textEl) {
                  textEl.textContent = "Активный заказ";
                }
                if (countEl) {
                  countEl.textContent = count > 1 ? ` +${count}` : "";
                }
              }
            
              // Мобильный приоткрытый bottom sheet показываем только на главной странице и на главной вкладке, и когда нет открытых модалок и не открыта карточка товара
              if (elActiveOrdersSheetCollapsed && badge === elActiveOrdersSheetCollapsed) {
                // Это мобильный приоткрытый bottom sheet - показываем только на главной странице, главной вкладке, когда нет открытых модалок и не открыта карточка товара
                const isProductOpen = elMobileProductActions && !elMobileProductActions.classList.contains("hidden");
                if (isMobile && isShopMainPage && isMainTabActive && !isAnyModalOpen && !isProductOpen) {
                  badge.classList.remove("hidden");
                } else {
                  badge.classList.add("hidden");
                }
              } else if (elActiveOrdersBadgeMobile && badge === elActiveOrdersBadgeMobile) {
                // Старый мобильный бейдж - скрываем (оставляем для обратной совместимости)
                badge.classList.add("hidden");
              } else {
                // Десктопный бейдж показываем всегда (если есть активные заказы)
                badge.classList.remove("hidden");
              }
            });
          } else {
            badges.forEach(badge => badge.classList.add("hidden"));
            window._activeOrders = [];
          }
        } catch (e) {
          // Если ошибка (не авторизован и т.д.), скрываем бейджи
          badges.forEach(badge => badge.classList.add("hidden"));
          window._activeOrders = [];
        } finally {
          activeOrdersBadgeLoading = false;
          if (typeof queueMobileUiStateSync === "function") {
            queueMobileUiStateSync("updateActiveOrdersBadge.finally");
          } else if (typeof window.queueShopMobileUiStateSync === "function") {
            window.queueShopMobileUiStateSync("updateActiveOrdersBadge.finally");
          }
        }
      }

      const activeOrdersRowCache = new Map();
      const activeOrdersDetailsCache = new Map();
      let activeOrdersSheetWrap = null;
      let activeOrdersListView = null;
      let activeOrdersDetailsHost = null;
      let activeOrdersEmptyView = null;
      let activeOrdersListSignature = "";

      function ensureActiveOrdersSheetShell() {
        if (activeOrdersSheetWrap && activeOrdersListView && activeOrdersDetailsHost && activeOrdersEmptyView) {
          return {
            wrap: activeOrdersSheetWrap,
            listView: activeOrdersListView,
            detailsHost: activeOrdersDetailsHost,
            emptyView: activeOrdersEmptyView,
          };
        }
        const wrap = document.createElement("div");
        wrap.className = "shop-active-orders-sheet";
        const listView = document.createElement("div");
        listView.className = "shop-active-orders-list";
        const detailsHost = document.createElement("div");
        detailsHost.className = "shop-active-order-details-host hidden";
        const emptyView = document.createElement("div");
        emptyView.className = "muted hidden";
        emptyView.style.padding = "20px";
        emptyView.style.textAlign = "center";
        emptyView.textContent = "Нет активных заказов";
        wrap.appendChild(listView);
        wrap.appendChild(detailsHost);
        wrap.appendChild(emptyView);
        activeOrdersSheetWrap = wrap;
        activeOrdersListView = listView;
        activeOrdersDetailsHost = detailsHost;
        activeOrdersEmptyView = emptyView;
        return { wrap, listView, detailsHost, emptyView };
      }

      function buildActiveOrdersListSignature(orders) {
        return (Array.isArray(orders) ? orders : [])
          .map((order) => {
            const id = Number(order?.id || 0);
            const updatedAt = str(order?.updated_at || order?.created_at || "");
            const status = str(order?.status_title || "");
            const total = Number(order?.total_price || 0);
            return `${id}:${updatedAt}:${status}:${total}`;
          })
          .join("|");
      }

      function buildActiveOrderRowSignature(order) {
        const id = Number(order?.id || 0);
        const updatedAt = str(order?.updated_at || order?.created_at || "");
        const status = str(order?.status_title || "");
        const total = Number(order?.total_price || 0);
        const itemsNum = Number(order?.items_count || (Array.isArray(order?.items) ? order.items.length : 0));
        return `${id}:${updatedAt}:${status}:${total}:${itemsNum}`;
      }

      function buildActiveOrderListRow(order) {
        const card = document.createElement("div");
        card.className = "shop-active-order-card";
        card.style.cursor = "pointer";
        card.style.padding = "16px";
        card.style.borderBottom = "1px solid var(--color-border, #e5e5e5)";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "8px";

        const orderNum = document.createElement("div");
        orderNum.style.fontWeight = "600";
        orderNum.textContent = `Заказ #${order.id}`;

        const status = document.createElement("div");
        status.style.color = "var(--shop-buy, #f97316)";
        status.style.fontSize = "14px";
        status.textContent = order.status_title || "";

        header.appendChild(orderNum);
        header.appendChild(status);

        const meta = document.createElement("div");
        meta.style.fontSize = "13px";
        meta.style.color = "var(--color-text-muted, #666)";
        meta.style.marginBottom = "8px";
        meta.textContent = new Date(order.created_at).toLocaleString("ru-RU");

        const footer = document.createElement("div");
        footer.style.display = "flex";
        footer.style.justifyContent = "space-between";
        footer.style.alignItems = "center";

        const total = document.createElement("div");
        total.style.fontWeight = "600";
        total.textContent = money(order.total_price || 0);

        const itemsCount = document.createElement("div");
        itemsCount.style.fontSize = "13px";
        itemsCount.style.color = "var(--color-text-muted, #666)";
        const itemsNum = order.items_count || (order.items && order.items.length) || 0;
        itemsCount.textContent = `${itemsNum} ${itemsNum === 1 ? "позиция" : itemsNum < 5 ? "позиции" : "позиций"}`;

        footer.appendChild(total);
        footer.appendChild(itemsCount);

        card.appendChild(header);
        card.appendChild(meta);
        card.appendChild(footer);

        card.addEventListener("click", async () => {
          await showActiveOrderDetails(order.id);
        });

        return card;
      }

      function renderActiveOrdersListContent(orders) {
        const shell = ensureActiveOrdersSheetShell();
        const list = Array.isArray(orders) ? orders : [];
        shell.detailsHost.classList.add("hidden");
        shell.listView.classList.remove("hidden");
        shell.emptyView.classList.toggle("hidden", list.length > 0);
        if (!list.length) {
          shell.listView.replaceChildren();
          activeOrdersListSignature = "";
          return;
        }
        const nextSignature = buildActiveOrdersListSignature(list);
        if (activeOrdersListSignature === nextSignature) return;
        const frag = document.createDocumentFragment();
        const actualIds = new Set();
        list.forEach((order) => {
          const oid = Number(order?.id || 0);
          const rowSig = buildActiveOrderRowSignature(order);
          let row = null;
          const cached = activeOrdersRowCache.get(oid);
          if (cached && cached.sig === rowSig && cached.node) {
            row = cached.node;
          } else {
            row = buildActiveOrderListRow(order);
            if (Number.isFinite(oid) && oid > 0) {
              activeOrdersRowCache.set(oid, { sig: rowSig, node: row });
            }
          }
          if (Number.isFinite(oid) && oid > 0) actualIds.add(oid);
          frag.appendChild(row);
        });
        activeOrdersRowCache.forEach((_v, key) => {
          if (!actualIds.has(key)) activeOrdersRowCache.delete(key);
        });
        shell.listView.replaceChildren(frag);
        activeOrdersListSignature = nextSignature;
      }

      function setActiveOrdersDetailsMessage(text) {
        const shell = ensureActiveOrdersSheetShell();
        let view = shell.detailsHost.querySelector(".shop-active-order-details");
        if (!view) {
          view = document.createElement("div");
          view.className = "shop-active-order-details";
          shell.detailsHost.appendChild(view);
        }
        const msg = document.createElement("div");
        msg.className = "muted";
        msg.style.padding = "20px";
        msg.style.textAlign = "center";
        msg.textContent = text;
        view.replaceChildren(msg);
        shell.listView.classList.add("hidden");
        shell.emptyView.classList.add("hidden");
        shell.detailsHost.classList.remove("hidden");
      }

      // Функция обработки клика на бейдж активных заказов
      const handleActiveOrdersBadgeClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
      
        // Только на витрине
        if (!isShopPage()) return;
      
        // Проверяем, мобильная версия или десктоп
        const isMobile = window.matchMedia("(max-width: 768px)").matches;
      
        if (!isMobile) {
          // Десктоп: открываем профиль и переключаем на вкладку "История заказов"
          const me = await fetchMeSafe();
          if (!me) {
            openProfileSheet();
            return;
          }
        
          await openProfilePanel(me, { forceOpen: true, initialTab: "orders" });
        
          // Ждем немного, чтобы профиль успел загрузиться, затем переключаем на вкладку
          setTimeout(() => {
            // Пробуем использовать контекст профиля для переключения
            if (window._profileContext && typeof window._profileContext.setActiveTab === "function") {
              window._profileContext.setActiveTab("orders");
            } else {
              // Fallback: находим вкладку и кликаем на неё
              const profileContent = document.querySelector(".shop-profile");
              if (profileContent) {
                const ordersTab = profileContent.querySelector('[data-tab="orders"]');
                if (ordersTab) {
                  ordersTab.click();
                }
              }
            }
          }, 300);
        } else {
          // Мобильная версия: открываем bottom sheet с активными заказами
          openActiveOrdersSheet();
        }
      };
    
      // Функция открытия bottom sheet с активными заказами
      async function openActiveOrdersSheet() {
        if (!window.AppModal) return;
        resetShopModalHeaderUi();
      
        // Скрываем приоткрытый bottom sheet при открытии полноценного
      
        const activeOrders = window._activeOrders || [];
        if (activeOrders.length === 0) {
          // Если нет активных заказов, обновляем и пробуем снова
          await window.updateActiveOrdersBadge({ force: true });
          const updatedOrders = window._activeOrders || [];
          if (updatedOrders.length === 0) return;
          activeOrders.push(...updatedOrders);
        }
      
        // Если заказ один - сразу показываем детали
        if (activeOrders.length === 1) {
          const orderId = activeOrders[0].id;
          await showActiveOrderDetails(orderId);
          return;
        }
      
        // Если заказов несколько - показываем список
        showActiveOrdersList(activeOrders);
      }
    
      // Показать список активных заказов
      function showActiveOrdersList(orders) {
        if (!window.AppModal) return;
        resetOrderDetailsTransientUi();
        resetShopModalHeaderUi();
      
        // Обновляем состояние навигации
        sheetNavigationState.type = 'activeOrders';
        sheetNavigationState.screen = 'list';
        sheetNavigationState.data = null;
        if (typeof queueMobileUiStateSync === "function") {
          queueMobileUiStateSync("showActiveOrdersList");
        } else if (typeof window.queueShopMobileUiStateSync === "function") {
          window.queueShopMobileUiStateSync("showActiveOrdersList");
        }
        const shell = ensureActiveOrdersSheetShell();
        const list = Array.isArray(orders) ? orders : [];
        if (!list.length && typeof window.updateActiveOrdersBadge === "function") {
          window.updateActiveOrdersBadge().then(() => {
            const updatedOrders = window._activeOrders || [];
            renderActiveOrdersListContent(updatedOrders);
          }).catch(() => {
            renderActiveOrdersListContent([]);
          });
        } else {
          renderActiveOrdersListContent(list);
        }
      
        // Обновляем состояние навигации
        sheetNavigationState.type = 'activeOrders';
        sheetNavigationState.screen = 'list';
        sheetNavigationState.data = null;
        if (typeof queueMobileUiStateSync === "function") {
          queueMobileUiStateSync("showActiveOrdersList.open");
        } else if (typeof window.queueShopMobileUiStateSync === "function") {
          window.queueShopMobileUiStateSync("showActiveOrdersList.open");
        }

        setAppModalMode("shop");
        if (window.AppModal.isOpen && window.AppModal.isOpen()) {
          window.AppModal.setTitle("Активные заказы");
          window.AppModal.setContent(shell.wrap);
        } else {
          window.AppModal.open({
            title: "Активные заказы",
            content: shell.wrap,
            onClose: () => {
              sheetNavigationState.type = null;
              sheetNavigationState.screen = null;
              sheetNavigationState.data = null;
              if (elActiveOrdersSheetCollapsed && typeof window.updateActiveOrdersBadge === "function") {
                window.updateActiveOrdersBadge();
              }
            },
          });
        }
        setSheetHeaderMode("", {});
        const modalHeader = document.querySelector(".app-modal-header");
        if (modalHeader) {
          const backBtn = modalHeader.querySelector(".app-modal-back-btn");
          if (backBtn) backBtn.remove();
          const modalTitle = document.querySelector("#appModalTitle");
          if (modalTitle) {
            modalTitle.style.textAlign = "";
            modalTitle.style.flex = "";
          }
        }
      }
    
      // Показать детали активного заказа
      async function showActiveOrderDetails(orderId) {
        if (!window.AppModal) return;
        resetOrderDetailsTransientUi();
        resetShopModalHeaderUi();
        const shell = ensureActiveOrdersSheetShell();
        shell.listView.classList.add("hidden");
        shell.emptyView.classList.add("hidden");
        shell.detailsHost.classList.remove("hidden");
        setActiveOrdersDetailsMessage("Загрузка…");
      
        // Сохраняем список активных заказов в глобальную переменную для использования при возврате
        const activeOrders = window._activeOrders || [];
        window._savedActiveOrdersForBack = [...activeOrders]; // Сохраняем копию
        const hasMultipleOrders = activeOrders.length > 1;
      
        // Обновляем состояние навигации
        sheetNavigationState.type = 'activeOrders';
        sheetNavigationState.screen = 'details';
        sheetNavigationState.data = { orderId };
        if (typeof queueMobileUiStateSync === "function") {
          queueMobileUiStateSync("showActiveOrderDetails");
        } else if (typeof window.queueShopMobileUiStateSync === "function") {
          window.queueShopMobileUiStateSync("showActiveOrderDetails");
        }
      
        setAppModalMode("shop");
        if (window.AppModal.isOpen && window.AppModal.isOpen()) {
          window.AppModal.setTitle("Детали заказа");
          window.AppModal.setContent(shell.wrap);
        } else {
          window.AppModal.open({
            title: "Детали заказа",
            content: shell.wrap,
            onClose: () => {
              sheetNavigationState.type = null;
              sheetNavigationState.screen = null;
              sheetNavigationState.data = null;
              if (elActiveOrdersSheetCollapsed && typeof window.updateActiveOrdersBadge === "function") {
                window.updateActiveOrdersBadge();
              }
            },
          });
        }
        setSheetHeaderMode("", {});
      
        // Настраиваем кастомный хедер: стрелка слева, "Детали заказа" по центру, крестик справа
        const modalHeader = document.querySelector(".app-modal-header");
        const modalTitle = document.querySelector("#appModalTitle");
        const modalActions = document.querySelector("#appModalActions");
      
        if (modalHeader && modalTitle && modalActions) {
          // Создаем кнопку назад слева
          let backBtn = modalHeader.querySelector(".app-modal-back-btn");
          if (!backBtn && hasMultipleOrders) {
            backBtn = document.createElement("button");
            backBtn.className = "btn btn-icon app-modal-back-btn";
            backBtn.type = "button";
            backBtn.setAttribute("aria-label", "Назад");
            backBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;
            backBtn.style.marginRight = "auto";
            modalHeader.insertBefore(backBtn, modalTitle);
          
            // Обработчик кнопки "Назад"
            backBtn.addEventListener("click", () => {
              // Используем сохраненный список заказов из глобальной переменной
              const savedOrders = window._savedActiveOrdersForBack || [];
            
              // Не закрываем модальное окно, а обновляем контент напрямую
              if (savedOrders && savedOrders.length > 0) {
                showActiveOrdersList(savedOrders);
              } else {
                // Если список пуст, загружаем заново
                if (typeof window.updateActiveOrdersBadge === "function") {
                  window.updateActiveOrdersBadge().then(() => {
                    const updatedOrders = window._activeOrders || [];
                    if (updatedOrders.length > 0) {
                      showActiveOrdersList(updatedOrders);
                    } else {
                      showActiveOrdersList([]);
                    
                      // Убираем кнопку назад из хедера
                      const modalHeader = document.querySelector(".app-modal-header");
                      if (modalHeader) {
                        const backBtn = modalHeader.querySelector(".app-modal-back-btn");
                        if (backBtn) {
                          backBtn.remove();
                        }
                        const modalTitle = document.querySelector("#appModalTitle");
                        if (modalTitle) {
                          modalTitle.style.textAlign = "";
                          modalTitle.style.flex = "";
                        }
                      }
                    }
                  });
                }
              }
            });
          } else if (backBtn && !hasMultipleOrders) {
            // Удаляем кнопку назад, если заказ один
            backBtn.remove();
          }
        
          // Центрируем заголовок
          modalTitle.style.textAlign = "center";
          modalTitle.style.flex = "1";
        }
      
        // Загружаем детали заказа
        try {
          const json = await apiJson(`/api/public/me/orders/${orderId}`);
          const order = json.data || null;
          let detailView = shell.detailsHost.querySelector(`.shop-active-order-details[data-order-id="${Number(orderId)}"]`);
          if (!detailView) {
            detailView = document.createElement("div");
            detailView.className = "shop-active-order-details";
            detailView.setAttribute("data-order-id", String(Number(orderId)));
            shell.detailsHost.appendChild(detailView);
          }
          Array.from(shell.detailsHost.children).forEach((node) => node.classList.add("hidden"));
          detailView.classList.remove("hidden");
        
          if (!order) {
            setActiveOrdersDetailsMessage("Не удалось загрузить детали заказа");
            return;
          }
        
          let html = `<div class="shop-order-details">`;
        
          // Заголовок с номером и статусом (кнопка "Назад" теперь в хедере)
          html += `<div class="shop-order-details-header">`;
          html += `<div class="shop-order-details-title">Заказ #${order.id}</div>`;
          if (order.status_title) {
            html += `<div class="shop-order-details-status">${escapeHtml(order.status_title)}</div>`;
          }
          html += `</div>`;
        
          // Информация о заказе
          html += `<div class="shop-order-details-info">`;
          html += `<div class="shop-order-info-row">`;
          html += `<div class="shop-order-info-label">Дата и время</div>`;
          html += `<div class="shop-order-info-value">${new Date(order.created_at).toLocaleString("ru-RU")}</div>`;
          html += `</div>`;
        
          if (order.method_title) {
            html += `<div class="shop-order-info-row">`;
            html += `<div class="shop-order-info-label">Способ доставки</div>`;
            html += `<div class="shop-order-info-value">${escapeHtml(order.method_title)}</div>`;
            html += `</div>`;
          }
        
          if (order.time_option_title) {
            html += `<div class="shop-order-info-row">`;
            html += `<div class="shop-order-info-label">Время доставки</div>`;
            html += `<div class="shop-order-info-value">${escapeHtml(order.time_option_title)}</div>`;
            html += `</div>`;
          }
        
          if (order.scheduled_at) {
            html += `<div class="shop-order-info-row">`;
            html += `<div class="shop-order-info-label">Запланировано на</div>`;
            html += `<div class="shop-order-info-value">${new Date(order.scheduled_at).toLocaleString("ru-RU")}</div>`;
            html += `</div>`;
          }
          html += `</div>`;
        
          // Адрес доставки
          if (order.address) {
            html += `<div class="shop-order-details-section">`;
            html += `<div class="shop-order-section-title">Адрес доставки</div>`;
            html += `<div class="shop-order-address">${escapeHtml(order.address)}</div>`;
            html += `</div>`;
          }
        
          // Товары
          if (order.items && Array.isArray(order.items) && order.items.length > 0) {
            html += `<div class="shop-order-details-section">`;
            html += `<div class="shop-order-section-title">Товары</div>`;
            html += `<div class="shop-cart-items">`;
            order.items.forEach(item => {
              // Используем window.formatOrderItem, которая уже правильно обрабатывает варианты, опции и ингредиенты
              if (window.formatOrderItem && typeof window.formatOrderItem === "function") {
                try {
                  html += window.formatOrderItem(item);
                } catch (e) {
                  console.error("Error formatting order item:", e, item);
                  // Fallback при ошибке
                  const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
                  const mainPhoto = photos[0] || "/static/img/placeholder.png";
                  html += `<div class="cart-row">`;
                  html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
                  html += `<div class="cart-mid">`;
                  html += `<div class="cart-title">${escapeHtml(item.name || "—")}</div>`;
                  html += `</div>`;
                  html += `<div class="cart-right">`;
                  html += `<div class="cart-price">${money(getOrderItemLineTotal(item))}</div>`;
                  html += `</div>`;
                  html += `</div>`;
                }
              } else {
                console.error("window.formatOrderItem is not available");
                // Fallback: простая версия если formatOrderItem недоступна
                const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
                const mainPhoto = photos[0] || "/static/img/placeholder.png";
                html += `<div class="cart-row">`;
                html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
                html += `<div class="cart-mid">`;
                html += `<div class="cart-title">${escapeHtml(item.name || "—")}</div>`;
                html += `</div>`;
                html += `<div class="cart-right">`;
                html += `<div class="cart-price">${money(getOrderItemLineTotal(item))}</div>`;
                html += `</div>`;
                html += `</div>`;
              }
            });
            html += `</div>`;
            html += `</div>`;
          }
        
          // Дополнительная информация
          if (order.cutlery_qty && Number(order.cutlery_qty) > 0) {
            html += `<div class="shop-order-details-section">`;
            html += `<div class="shop-order-info-row">`;
            html += `<div class="shop-order-info-label">Приборы</div>`;
            html += `<div class="shop-order-info-value">${order.cutlery_qty} шт.</div>`;
            html += `</div>`;
            html += `</div>`;
          }
        
          // Комментарий
          if (order.comment) {
            html += `<div class="shop-order-details-section">`;
            html += `<div class="shop-order-section-title">Комментарий</div>`;
            html += `<div class="shop-order-comment">${escapeHtml(order.comment)}</div>`;
            html += `</div>`;
          }
        
          // Суммы (единый блок как в истории заказов)
          html += renderOrderSummaryBlock(order);
        
          // Пустое поле 200px внизу для скролла
          html += `<div style="height: 200px;"></div>`;
        
          html += `</div>`;
        
          const detailSig = `${Number(order?.id || 0)}:${str(order?.updated_at || order?.created_at || "")}:${Number(order?.total_price || 0)}:${Array.isArray(order?.items) ? order.items.length : 0}`;
          const cachedDetail = activeOrdersDetailsCache.get(Number(order?.id || 0));
          if (cachedDetail && cachedDetail.sig === detailSig && cachedDetail.node) {
            detailView.replaceChildren(cachedDetail.node);
          } else {
            const holder = document.createElement("div");
            holder.innerHTML = html;
            const node = holder.firstElementChild || holder;
            detailView.replaceChildren(node);
            activeOrdersDetailsCache.set(Number(order?.id || 0), { sig: detailSig, node: node.cloneNode(true) });
          }
          bindOrderSummaryDiscountToggles(detailView);
          const reopenActiveOrderDetails = () => {
            void showActiveOrderDetails(orderId);
          };
          bindRepeatOrderItemRows(
            detailView,
            Array.isArray(order.items) ? order.items : [],
            { onBack: reopenActiveOrderDetails, enableSwipeActions: true }
          );
        
          // Кнопка "Назад" уже настроена в хедере выше
        } catch (e) {
          console.error("Failed to load order details:", e);
          setActiveOrdersDetailsMessage("Не удалось загрузить детали заказа");
        }
      }

      // Обработчик клика на десктоп бейдж
      if (elActiveOrdersBadge) {
        elActiveOrdersBadge.removeEventListener("click", handleActiveOrdersBadgeClick);
        elActiveOrdersBadge.addEventListener("click", handleActiveOrdersBadgeClick);
      }

      // Обработчик клика на мобильный бейдж (старый)
      if (elActiveOrdersBadgeMobile) {
        elActiveOrdersBadgeMobile.removeEventListener("click", handleActiveOrdersBadgeClick);
        elActiveOrdersBadgeMobile.addEventListener("click", handleActiveOrdersBadgeClick);
      }
    
      // Обработчик клика на приоткрытый bottom sheet
      if (elActiveOrdersSheetCollapsed) {
        elActiveOrdersSheetCollapsed.removeEventListener("click", handleActiveOrdersBadgeClick);
        elActiveOrdersSheetCollapsed.addEventListener("click", handleActiveOrdersBadgeClick);
      }

      // Обновляем бейдж при загрузке и периодически
      if (elActiveOrdersBadge || elActiveOrdersBadgeMobile) {
        updateActiveOrdersBadge();
        // Обновляем каждые 30 секунд
        if (window.__shopActiveOrdersBadgeInterval) {
          clearInterval(window.__shopActiveOrdersBadgeInterval);
        }
        window.__shopActiveOrdersBadgeInterval = setInterval(updateActiveOrdersBadge, 30000);
      
        // Обновляем при возврате на страницу
        if (typeof window.__shopActiveOrdersVisibilityHandler === "function") {
          document.removeEventListener("visibilitychange", window.__shopActiveOrdersVisibilityHandler);
        }
        window.__shopActiveOrdersVisibilityHandler = () => {
          if (!document.hidden) {
            updateActiveOrdersBadge();
          }
        };
        document.addEventListener("visibilitychange", window.__shopActiveOrdersVisibilityHandler);
      
        // Обновляем при изменении URL (для SPA навигации)
        window.__shopActiveOrdersLastPathname = window.location.pathname;
        const checkPathnameChange = () => {
          const currentPathname = window.location.pathname;
          if (currentPathname !== window.__shopActiveOrdersLastPathname) {
            window.__shopActiveOrdersLastPathname = currentPathname;
            updateActiveOrdersBadge();
          }
        };
      
        // Проверяем изменение URL периодически (для SPA)
        if (window.__shopActiveOrdersPathInterval) {
          clearInterval(window.__shopActiveOrdersPathInterval);
        }
        window.__shopActiveOrdersPathInterval = setInterval(checkPathnameChange, 500);
      
        // Также слушаем события popstate (кнопка назад/вперед)
        // Примечание: основной обработчик popstate для bottom sheets добавлен в секции Nav выше
        // Здесь только обновляем бейдж, если не обработали bottom sheet
        if (typeof window.__shopActiveOrdersPopstateHandler === "function") {
          window.removeEventListener("popstate", window.__shopActiveOrdersPopstateHandler);
        }
        window.__shopActiveOrdersPopstateHandler = () => {
          // Если bottom sheet не был обработан, просто обновляем бейдж
          if (!(window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen())) {
            updateActiveOrdersBadge();
          }
        };
        window.addEventListener("popstate", window.__shopActiveOrdersPopstateHandler);
      }
  } catch (e) {
    console.error(e);
  }
}

window.prefetchProductDetailsConfig = prefetchProductDetailsConfig;
window.prefetchComboDetails = prefetchComboDetails;
window.warmInitialCatalogPayload = warmInitialCatalogPayload;


