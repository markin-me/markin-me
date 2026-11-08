(function () {
  "use strict";
  const factories = [];
  const instances = new Set();
  window.SharedProductRuntime = Object.freeze({
    register(factory) { factories.push(factory); instances.forEach(runtime => Object.assign(runtime, factory(runtime))); },
    create(services) {
      const runtime = Object.create(null);
      Object.defineProperties(runtime, Object.getOwnPropertyDescriptors(services));
      factories.forEach(factory => Object.assign(runtime, factory(runtime)));
      instances.add(runtime);
      return runtime;
    },
  });
})();

// Shared implementation used by the storefront and administrative order entry.
SharedProductRuntime.register(function (runtime) {
  "use strict";

  function getConfigurableIngredients(product, ingredients) {
    let config = product?.blocks_config ?? product?.blocks_config_json;
    if (typeof config === "string") config = JSON.parse(config);
    if (config && (config.ingredients === false || config.ingredients === 0)) return [];
    return (Array.isArray(ingredients) ? ingredients : []).filter(row => row.is_variable == null || row.is_variable === true || Number(row.is_variable) === 1);
  }

function createOptimizedImage(imageUrl, options = {}) {
    const {
      type = 'product-grid',
      sizes: customSizes,
      srcset: customSrcset,
      usePicture = false,
      alt = '',
      className = '',
      priority = false,
    } = options;

    // ????????? sizes ??? ?????? ????? ???????????
    const sizesMap = {
      'product-grid': '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw',
      'product-hero': '(max-width: 768px) 100vw, 350px',
      'cart-thumb': '92px',
      'thumb': '52px',
      'custom': customSizes || '100vw'
    };

    const finalUrl = imageUrl || '/static/img/placeholder.png';
    const finalSizes = sizesMap[type] || sizesMap['custom'];
    const cacheKey = [
      usePicture ? "1" : "0",
      finalUrl,
      String(customSrcset || ""),
      finalSizes,
      className,
      alt,
      priority ? "1" : "0",
    ].join("|");
    const cachedTemplate = runtime.getOptimizedImageTemplate(cacheKey);
    if (cachedTemplate) return cachedTemplate;

    // Picture ? WebP ?????? ????? URL ??? ????? ?? .webp (???? ???? ?? ???????).
    // ??? ?????? .jpg/.png ?????????? ???? img, ????? ?? ??????????? ?????????????? .webp.
    if (usePicture && finalUrl.endsWith('.webp')) {
      const picture = document.createElement('picture');
      const webpSource = document.createElement('source');
      webpSource.type = 'image/webp';
      webpSource.srcset = finalUrl;
      picture.appendChild(webpSource);
      const img = document.createElement('img');
      if (className) img.className = className;
      img.alt = alt;
      img.loading = priority ? 'eager' : 'lazy';
      if (priority && 'fetchPriority' in img) {
        img.fetchPriority = 'high';
      }
      img.src = finalUrl;
      if (customSrcset) img.srcset = customSrcset;
      img.sizes = finalSizes;
      picture.appendChild(img);
      runtime.setOptimizedImageTemplate(cacheKey, picture);
      return picture.cloneNode(true);
    }

    // ??????? img ??????? ? ??????????? ??????????
    const img = document.createElement('img');
    if (className) img.className = className;
    img.alt = alt;
    img.loading = priority ? 'eager' : 'lazy';
    if (priority && 'fetchPriority' in img) {
      img.fetchPriority = 'high';
    }

    if (customSrcset) {
      img.srcset = customSrcset;
      img.sizes = finalSizes;
      // src ???????????? ??? fallback ??? ?????? ?????????
      img.src = finalUrl;
    } else {
      // ???? ?????????? ???? URL, ?? ? ?????????? sizes ??В корзине пусто??????
      img.src = finalUrl;
      img.sizes = finalSizes;
    }

    runtime.setOptimizedImageTemplate(cacheKey, img);
    return img.cloneNode(true);
  }

function setOptimizedImageTemplate(key, node) {
    const cacheKey = String(key || "");
    if (!cacheKey || !node || !node.cloneNode) return;
    if (runtime.optimizedImageTemplateCache.has(cacheKey)) {
      runtime.optimizedImageTemplateCache.delete(cacheKey);
    }
    runtime.optimizedImageTemplateCache.set(cacheKey, node.cloneNode(true));
    while (runtime.optimizedImageTemplateCache.size > runtime.OPTIMIZED_IMAGE_TEMPLATE_LIMIT) {
      const oldestKey = runtime.optimizedImageTemplateCache.keys().next().value;
      if (!oldestKey) break;
      runtime.optimizedImageTemplateCache.delete(oldestKey);
    }
  }

function getOptimizedImageTemplate(key) {
    const cacheKey = String(key || "");
    if (!cacheKey || !runtime.optimizedImageTemplateCache.has(cacheKey)) return null;
    const node = runtime.optimizedImageTemplateCache.get(cacheKey);
    runtime.optimizedImageTemplateCache.delete(cacheKey);
    runtime.optimizedImageTemplateCache.set(cacheKey, node);
    return node.cloneNode(true);
  }

function waitForComboGridImage(url, timeoutMs = 1400) {
    const imageReady = runtime.preloadComboGridImage(url);
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    });
    return Promise.race([imageReady, timeout]).then(Boolean).catch(() => false);
  }

function preloadComboGridImage(url) {
    const key = runtime.str(url || "").trim();
    if (!key) return Promise.resolve(false);
    const cached = runtime.comboGridImageReadyCache.get(key);
    if (cached) return cached;

    const readyPromise = new Promise((resolve) => {
      try {
        const img = new Image();
        const done = (ok) => resolve(!!ok);
        img.onload = () => {
          if (img.decode) {
            img.decode().then(() => done(true)).catch(() => done(true));
          } else {
            done(true);
          }
        };
        img.onerror = () => done(false);
        img.src = key;
        if (img.complete && img.naturalWidth > 0) {
          if (img.decode) {
            img.decode().then(() => done(true)).catch(() => done(true));
          } else {
            done(true);
          }
        }
      } catch {
        resolve(false);
      }
    }).then((ok) => {
      if (!ok) runtime.comboGridImageReadyCache.delete(key);
      return ok;
    });

    return runtime.rememberComboGridImageReady(key, readyPromise);
  }

function rememberComboGridImageReady(url, promise) {
    const key = runtime.str(url || "").trim();
    if (!key || !promise) return promise;
    if (runtime.comboGridImageReadyCache.has(key)) runtime.comboGridImageReadyCache.delete(key);
    runtime.comboGridImageReadyCache.set(key, promise);
    while (runtime.comboGridImageReadyCache.size > runtime.COMBO_GRID_IMAGE_READY_LIMIT) {
      const oldestKey = runtime.comboGridImageReadyCache.keys().next().value;
      if (!oldestKey) break;
      runtime.comboGridImageReadyCache.delete(oldestKey);
    }
    return promise;
  }

function str(v) {
    return v === undefined || v === null ? "" : String(v);
  }

function preloadComboGridImagesInBackground(urls) {
    const uniqueUrls = runtime.normalizeComboGridPhotoUrls(urls);
    if (!uniqueUrls.length) return;
    const run = () => uniqueUrls.forEach((url) => { runtime.preloadComboGridImage(url); });
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      setTimeout(run, 0);
    }
  }

function normalizeComboGridPhotoUrls(photoUrls) {
    const photos = Array.from(new Set((Array.isArray(photoUrls) ? photoUrls : [])
      .map((url) => runtime.str(url || "").trim())
      .filter(Boolean)));
    return photos;
  }

function normalizeComboVariantList(rawList) {
  const variants = Array.isArray(rawList) ? rawList : [];
  return variants.map((v) => {
    const groupId = Number(v.id ?? v.variant_group_id ?? 0);
    return {
      id: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
      variant_group_id: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
      title: runtime.str(v.title || ""),
      unit_id: v.unit_id ? Number(v.unit_id) : null,
      unit_code: runtime.str(v.unit_code || ""),
      unit_title: runtime.str(v.unit_title || ""),
      unit_short_title: runtime.str(v.unit_short_title || ""),
      values: Array.isArray(v.values) ? v.values : [],
      discount_tiers: Array.isArray(v.discount_tiers) ? v.discount_tiers : [],
      default_value_index: v.default_value_index != null ? Number(v.default_value_index) : null,
      unit_to_grams_factor: v.unit_to_grams_factor,
    };
  });
}

function buildProductOptionGroupsFromBatch(productId, assignments, optionGroupsById) {
  const activeAssignments = (Array.isArray(assignments) ? assignments : [])
    .filter((a) => Number(a?.is_active || 0) === 1);
  const groups = [];

  activeAssignments.forEach((assignment) => {
    const groupId = Number(assignment?.group_id || 0);
    if (!Number.isFinite(groupId) || groupId <= 0) return;
    const details = optionGroupsById[groupId] || optionGroupsById[String(groupId)] || null;
    const items = Array.isArray(details?.items) ? details.items : [];
    const activeItems = items.filter((item) => Number(item?.is_active || 0) === 1);
    if (!activeItems.length) return;

    const groupSelectionType = details?.group?.selection_type || assignment.selection_type || "single";
    const groupMinSelect = details?.group?.min_select ?? assignment.min_select ?? 0;
    const groupMaxSelect = details?.group?.max_select ?? assignment.max_select ?? null;

    groups.push({
      id: groupId,
      title: runtime.str(assignment.title || details?.group?.title || ""),
      selection_type: groupSelectionType,
      min_select: groupMinSelect,
      max_select: groupMaxSelect,
      allow_variants: Boolean(details?.group?.allow_variants),
      is_required:
        groupSelectionType === "single"
          ? (Number(details?.group?.is_required ?? 1) === 1)
          : false,
      items: activeItems.map((item) => {
        return runtime.normalizeOptionItemForDisplay({
          id: Number(item.id),
          target_product_id: Number(item.target_product_id || 0),
          title: runtime.str(item.product_name || item.name || ""),
          product_price: Number(item.product_price || 0),
          product_base_qty: Number(item.product_base_qty || 1) || 1,
          product_base_unit_id: item.product_base_unit_id ? Number(item.product_base_unit_id) : null,
          product_unit_id: item.product_unit_id ? Number(item.product_unit_id) : null,
          qty_min: item.qty_min ?? 1,
          qty_max: item.qty_max ?? 1,
          nutrition_per_100g: item.nutrition_per_100g || null,
          nutrition_per_portion: item.nutrition_per_portion || null,
          base_qty_grams: item.base_qty_grams,
          nutrition_portion_grams: item.nutrition_portion_grams,
          unit_to_grams_factor: item.unit_to_grams_factor,
          variants: Array.isArray(item?.variants) ? item.variants : [],
          product_photos_json: item.product_photos_json,
          old_price: item.old_price,
          original_price: item.original_price,
          discounted_price: item.discounted_price,
          discount: item.discount,
          buy_x_get_y_badge: item.buy_x_get_y_badge,
          price_mode: item.price_mode,
          price_value: item.price_value,
        });
      }),
    });
  });

  return groups;
}

function normalizeOptionItemForDisplay(item) {
    if (!item || typeof item !== "object") return item;
    const targetProductId = Number(item.target_product_id || item.product_id || 0);
    const cachedProduct = runtime.getOptionItemTargetProduct(item);
    const photos = runtime.getOptionItemPhotos(item, cachedProduct);
    const photo = runtime.str(item.photo || item.product_photo || photos[0] || "").trim();
    return {
      ...item,
      target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
      product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
      title: runtime.str(item.title || item.product_name || item.name || ""),
      name: runtime.str(item.name || item.product_name || item.title || ""),
      price: runtime.getOptionItemResolvedDisplayBasePrice(item, cachedProduct) || runtime.getOptionItemPrice(item),
      product_price: Number(item.product_price || cachedProduct?.price || 0),
      product_photos_json: photos,
      photos,
      photo,
      old_price: Number(item.old_price || cachedProduct?.old_price || 0),
      original_price: item.original_price != null
        ? Number(item.original_price || 0)
        : Number(cachedProduct?.original_price || 0),
      discounted_price: item.discounted_price != null
        ? Number(item.discounted_price || 0)
        : Number(cachedProduct?.discounted_price || 0),
      discount: item.discount && typeof item.discount === "object"
        ? { ...item.discount }
        : (cachedProduct?.discount && typeof cachedProduct.discount === "object" ? { ...cachedProduct.discount } : null),
      buy_x_get_y_badge: item.buy_x_get_y_badge || cachedProduct?.buy_x_get_y_badge || null,
      variants: Array.isArray(item?.variants) ? item.variants : [],
    };
  }

function getOptionItemPhotos(item, cachedProduct = null) {
    const directPhotos = Array.isArray(item?.photos)
      ? item.photos
      : (
        typeof item?.product_photos_json === "string"
          ? (() => {
              try {
                return JSON.parse(item.product_photos_json);
              } catch {
                return [];
              }
            })()
          : (Array.isArray(item?.product_photos_json) ? item.product_photos_json : [])
      );
    const normalizedDirect = Array.isArray(directPhotos)
      ? directPhotos.map((photo) => runtime.str(photo || "").trim()).filter(Boolean)
      : [];
    if (normalizedDirect.length) return normalizedDirect;
    if (cachedProduct) {
      return runtime.safePhotos(cachedProduct).map((photo) => runtime.str(photo || "").trim()).filter(Boolean);
    }
    return [];
  }

function safePhotos(p) {
    if (Array.isArray(p?.photos)) return p.photos.filter(Boolean);
    if (typeof p?.photos_json === "string") {
      try {
        const arr = JSON.parse(p.photos_json);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

function makeCartKey(productId, optionItemsOrIds, ingredients = [], variantSelection = null) {
    const entries = (Array.isArray(optionItemsOrIds) ? optionItemsOrIds : [])
      .map((opt) => {
        if (typeof opt === "number") return { id: opt, qty: 1, variant_group_id: null, variant_value_index: null };
        if (!opt || typeof opt !== "object") return null;
        const id = Number(opt.id);
        if (!Number.isFinite(id)) return null;
        const qty = Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1;
        // ????????? ???????? ????? ? ?????
        const variantGroupId = Number(opt.variant_group_id);
        const variantIndex = Number(opt.variant_value_index);
        const hasVariant = Number.isFinite(variantGroupId) && Number.isFinite(variantIndex);
        return { 
          id, 
          qty, 
          variant_group_id: hasVariant ? variantGroupId : null, 
          variant_value_index: hasVariant ? variantIndex : null 
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // ????????? ??????? ?? id, ????? ?? ????????
        if (a.id !== b.id) return a.id - b.id;
        if (a.variant_group_id !== b.variant_group_id) {
          const aVg = a.variant_group_id ?? 0;
          const bVg = b.variant_group_id ?? 0;
          return aVg - bVg;
        }
        const aVi = a.variant_value_index ?? 0;
        const bVi = b.variant_value_index ?? 0;
        return aVi - bVi;
      });
    const optionPart = entries.map((entry) => {
      let part = `${entry.id}${entry.qty !== 1 ? `x${entry.qty}` : ""}`;
      // ????????В корзине пусто ? ????, ???? ?? ????
      if (entry.variant_group_id != null && entry.variant_value_index != null) {
        part += `v${entry.variant_group_id}-${entry.variant_value_index}`;
      }
      return part;
    }).join(",");
    
    // ????????? ??????????? ? ???? ??? ?????????? ????????
    const ingEntries = (Array.isArray(ingredients) ? ingredients : [])
      .map((ing) => {
        const id = Number(ing.ingredient_id || ing.id);
        const qty = Number(ing.quantity ?? ing.qty ?? 1);
        if (!Number.isFinite(id)) return null;
        return { id, qty };
      })
      .filter(Boolean)
      .sort((a, b) => a.id - b.id);
    const ingPart = ingEntries.map((entry) => `${entry.id}x${entry.qty}`).join(",");
    
    const variantGroupId = Number(variantSelection?.group_id);
    const variantIndex = Number(variantSelection?.value_index);
    const variantPart = Number.isFinite(variantGroupId) && Number.isFinite(variantIndex)
      ? `v${variantGroupId}-${variantIndex}`
      : "";

    const keyParts = [Number(productId), optionPart || "", ingPart || "", variantPart || ""].filter(Boolean).join(":");
    return keyParts;
  }

function cloneCartState(cartItems = runtime.state.cart) {
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(Array.isArray(cartItems) ? cartItems : []);
      }
    } catch {}
    try {
      return JSON.parse(JSON.stringify(Array.isArray(cartItems) ? cartItems : []));
    } catch {
      return Array.isArray(cartItems) ? cartItems.map((it) => ({ ...it })) : [];
    }
  }

function buildFavoriteSnapshotFromResolvedItem(resolvedItem, { pricing = null, oldLineTotal = null } = {}) {
    if (!resolvedItem || typeof resolvedItem !== "object") return null;

    if (String(resolvedItem.type || "") === "combo") {
      const comboId = Number(resolvedItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;
      const qty = Math.max(1, Number(resolvedItem.qty || 1));
      const unitPrice = Number(resolvedItem.unit_price_override || 0);
      const lineTotal = runtime.roundPrice(unitPrice * qty);
      const oldLine = oldLineTotal != null
        ? runtime.roundPrice(Number(oldLineTotal || 0))
        : runtime.roundPrice((Number(resolvedItem.unit_price_before_discount || 0) || unitPrice) * qty);
      const selections = (Array.isArray(resolvedItem.selections) ? resolvedItem.selections : []).map((sel) => ({
        product_id: runtime.toFiniteNumberOrNull(sel?.product_id),
        product_name: runtime.str(sel?.product_name || ""),
        product_photo: runtime.str(sel?.product_photo || ""),
        variant_label: runtime.str(sel?.variant_label || ""),
        variant_group_id: runtime.toFiniteNumberOrNull(sel?.variant_group_id),
        variant_value_index: runtime.toFiniteNumberOrNull(sel?.variant_value_index),
        variant_group_title: runtime.str(sel?.variant_group_title || ""),
        variant_unit: runtime.str(sel?.variant_unit || ""),
        unit_id: runtime.toFiniteNumberOrNull(sel?.unit_id),
        unit_price_override: sel?.unit_price_override != null ? Number(sel.unit_price_override) : null,
        unit_price_before_discount: sel?.unit_price_before_discount != null ? Number(sel.unit_price_before_discount) : null,
        ingredients_display: (Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : []).map((ing) => ({
          ingredient_id: runtime.toFiniteNumberOrNull(ing?.ingredient_id),
          name: runtime.str(ing?.name || ing?.ingredient_name || ""),
          quantity: Number(ing?.quantity ?? ing?.qty ?? 0),
          qty: Number(ing?.qty ?? ing?.quantity ?? 0),
          unit_id: runtime.toFiniteNumberOrNull(ing?.unit_id),
          unit: runtime.str(ing?.unit || ing?.unit_label || ""),
        })),
      }));
      const photos = selections.map((sel) => runtime.str(sel.product_photo || "")).filter(Boolean);

      return {
        type: "combo",
        combo_id: comboId,
        combo_title: runtime.str(resolvedItem.combo_title || "Комбо"),
        name: runtime.str(resolvedItem.combo_title || resolvedItem.name || "Комбо"),
        qty,
        price: Number(unitPrice || 0),
        line_total: Number(lineTotal || 0),
        old_line_total: oldLine > lineTotal ? Number(oldLine) : 0,
        unit_price_before_discount: Number(resolvedItem.unit_price_before_discount || 0),
        photos,
        selections,
      };
    }

    const product = resolvedItem.product || null;
    const productId = Number(resolvedItem.product_id || product?.id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;
    const qty = Math.max(1, Number(resolvedItem.qty || 1));
    const selectedOptionItems = runtime.normalizeFavoriteOptionItemsFromCart(
      Array.isArray(resolvedItem.option_items) ? resolvedItem.option_items : []
    );
    const ingredients = runtime.normalizeFavoriteIngredientsFromCart(
      Array.isArray(resolvedItem.ingredients) ? resolvedItem.ingredients : []
    );
    const variantGroupId = runtime.toFiniteNumberOrNull(resolvedItem.variant_group_id);
    const variantValueIndex = runtime.toFiniteNumberOrNull(resolvedItem.variant_value_index);
    const variantGroupTitle = runtime.str(
      resolvedItem.variant_group_title ||
      resolvedItem?.variant?.group_title ||
      resolvedItem?.variant?.variant_group_title ||
      ""
    ).trim();
    const variantUnit = runtime.str(
      resolvedItem.variant_unit ||
      resolvedItem?.variant?.unit ||
      resolvedItem?.variant?.unit_label ||
      ""
    ).trim();
    const variantLabel = runtime.extractVariantValueForOrder(
      resolvedItem.variant_label || resolvedItem?.variant?.label || resolvedItem?.variant?.value || "",
      variantGroupTitle
    );
    const hasVariant = variantLabel || (variantGroupId != null && variantValueIndex != null);
    const variantDiff = Number(resolvedItem.variant_unit_price || 0) - Number(product?.price || 0);

    let pricingData = pricing;
    if (!pricingData) {
      const resolvedItems = runtime.cartItemsResolved();
      const totals = {
        nonAutoTotal: runtime.computeNonAutoTotal(resolvedItems),
        autoEligibleTotal: runtime.computeAutoEligibleTotal(resolvedItems),
      };
      pricingData = runtime.computeItemPricing(
        {
          product,
          qty,
          option_items: selectedOptionItems,
          ingredients,
          ingredient_price_diff: Number(resolvedItem.ingredient_price_diff || 0),
          variant_label: variantLabel,
          variant_unit_price: Number(resolvedItem.variant_unit_price || 0),
          unit_price_override:
            resolvedItem.unit_price_override != null
              ? Number(resolvedItem.unit_price_override)
              : null,
          auto_add: Number(resolvedItem.auto_add || 0),
          auto_add_group_id: runtime.toFiniteNumberOrNull(resolvedItem.auto_add_group_id),
        },
        totals
      );
    }

    const lineTotal = runtime.roundPrice(Number(pricingData?.lineTotal || 0));
    const unitPrice = runtime.roundPrice(Number(pricingData?.unitPrice || (qty > 0 ? lineTotal / qty : 0)));
    const oldLineFromArg = oldLineTotal != null ? runtime.roundPrice(Number(oldLineTotal || 0)) : 0;
    const oldPricePerUnit = runtime.scaleProductBasePriceForCurrentUnit(
      product,
      Number(pricingData?.parts?.baseProductUnit || unitPrice || 0),
      Number(product?.old_price || 0)
    );
    const oldLineFromProduct = oldPricePerUnit > 0 ? runtime.roundPrice(oldPricePerUnit * qty) : 0;
    const originalLineTotal = oldLineFromArg > 0 ? oldLineFromArg : oldLineFromProduct;
    const showOldLine = originalLineTotal > lineTotal;

    const variantEntries = hasVariant
      ? [{
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        group_title: variantGroupTitle,
        variant_group_title: variantGroupTitle,
        value: variantLabel,
        label: variantLabel,
        unit: variantUnit,
        price_diff: Number.isFinite(variantDiff) ? variantDiff : 0,
      }]
      : [];

    return {
      type: "product",
      product_id: productId,
      name: runtime.str(product?.name || resolvedItem.name || "Товар"),
      qty,
      price: Number(unitPrice || 0),
      old_price: showOldLine ? runtime.roundPrice(originalLineTotal / qty) : Number(oldPricePerUnit || 0),
      line_total: Number(lineTotal || 0),
      photos: runtime.safePhotos(product),
      option_item_ids: selectedOptionItems.map((opt) => Number(opt.id)),
      options: selectedOptionItems,
      option_items: selectedOptionItems,
      ingredients,
      variant_group_id: variantGroupId,
      variant_value_index: variantValueIndex,
      variant_label: variantLabel,
      variant_group_title: variantGroupTitle,
      variant_unit: variantUnit,
      variant_unit_price: Number(resolvedItem.variant_unit_price || 0),
      variants: variantEntries,
      discount: showOldLine ? { original_line_total: Number(originalLineTotal) } : null,
    };
  }

function extractVariantValueForOrder(labelRaw, groupTitleRaw) {
    const rawLabel = runtime.str(labelRaw || "").trim();
    if (!rawLabel) return "";

    const groupTitle = runtime.str(groupTitleRaw || "").trim();
    let value = rawLabel;
    if (groupTitle) {
      const escapedGroupTitle = groupTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      value = value.replace(new runtime.RegExp(`^${escapedGroupTitle}(?:\\s*\\([^)]*\\))?\\s*:\\s*`, "i"), "").trim();
    }
    if (!value) value = rawLabel;

    if (value.includes(":")) {
      const right = runtime.str(value.split(":").slice(1).join(":")).trim();
      if (right) value = right;
    }
    return value.trim();
  }

function normalizeFavoriteIngredientsFromCart(ingredients) {
    const list = Array.isArray(ingredients) ? ingredients : [];
    return list
      .map((ing) => {
        const ingredientId = Number(ing?.ingredient_id || 0);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
        const quantityRaw = Number(ing?.quantity ?? ing?.qty ?? 0);
        const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
        return {
          ingredient_id: ingredientId,
          ingredient_name: runtime.str(ing?.ingredient_name || ing?.name || ""),
          name: runtime.str(ing?.name || ing?.ingredient_name || ""),
          quantity,
          qty: quantity,
          unit_id: runtime.toFiniteNumberOrNull(ing?.unit_id),
          unit_label: runtime.str(ing?.unit_label || ing?.unit || ""),
          unit: runtime.str(ing?.unit || ing?.unit_label || ""),
        };
      })
      .filter(Boolean);
  }

function toFiniteNumberOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

function normalizeFavoriteOptionItemsFromCart(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items
      .map((opt) => {
        const id = Number(opt?.id || 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        const qty = Math.max(1, Number(opt?.qty ?? opt?.quantity ?? 1));
        const targetProductId = runtime.toFiniteNumberOrNull(opt?.target_product_id ?? opt?.product_id);
        return {
          id,
          title: runtime.str(opt?.title || opt?.name || ""),
          name: runtime.str(opt?.name || opt?.title || ""),
          price: Number(opt?.price || 0),
          qty,
          quantity: qty,
          target_product_id: targetProductId,
          product_id: targetProductId,
          variant_group_id: runtime.toFiniteNumberOrNull(opt?.variant_group_id),
          variant_value_index: runtime.toFiniteNumberOrNull(opt?.variant_value_index),
          variant_label: runtime.str(opt?.variant_label || ""),
          variant_group_title: runtime.str(opt?.variant_group_title || opt?.group_title || ""),
          variant_unit: runtime.str(opt?.variant_unit || opt?.unit || ""),
          unit_id: runtime.toFiniteNumberOrNull(opt?.unit_id),
          variant_price_diff: Number(opt?.variant_price_diff || 0),
        };
      })
      .filter(Boolean);
  }

function createProductBuyXGetYActionCard(product) {
  const source = product?.buy_x_get_y_badge;
  if (!source || typeof source !== "object") return null;
  const badgeText = runtime.str(source.badge_text || "").trim();
  if (!badgeText) return null;
  const titleText = runtime.str(source.title || badgeText).trim() || badgeText;

  const card = document.createElement("div");
  card.className = "shop-product-action-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${titleText}. Акция ${badgeText}`);

  const content = document.createElement("div");
  content.className = "shop-product-action-card__content";

  const title = document.createElement("div");
  title.className = "shop-product-action-card__title";
  title.textContent = titleText;

  const type = document.createElement("div");
  type.className = "shop-product-action-card__type";
  type.textContent = `Акция ${badgeText}`;

  const badge = document.createElement("span");
  badge.className = "shop-product-action-card__badge";
  badge.textContent = badgeText;

  content.appendChild(title);
  content.appendChild(type);
  card.appendChild(content);
  card.appendChild(badge);

  const openDetails = async (event = null) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (card.__isOpeningActionDetails) return;
    card.__isOpeningActionDetails = true;
    card.classList.add("is-loading");
    try {
      const opened = await runtime.openProductBuyXGetYBenefitDetail(product);
      if (!opened && typeof runtime.showToast === "function") {
        runtime.showToast("Не удалось открыть детали акции");
      }
    } catch (err) {
      console.error("Failed to open product action details:", err);
      if (typeof runtime.showToast === "function") {
        runtime.showToast("Не удалось открыть детали акции");
      }
    } finally {
      card.__isOpeningActionDetails = false;
      card.classList.remove("is-loading");
    }
  };

  card.addEventListener("click", openDetails);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      void openDetails(event);
    }
  });

  return card;
}

function renderOptionItemPrice(priceEl, item, variantData = null) {
    if (!priceEl) return;
    const pricing = runtime.getOptionItemDisplayPricing(item, variantData);
    const oldText = pricing.showOld ? runtime.money(pricing.originalPrice) : "";
    const currentText = runtime.money(pricing.currentPrice);
    const badgeHtml = pricing.badgeText
      ? `<span class="sp-discount-badge sp-discount-badge--cart cart-discount-badge">${runtime.escapeHtml(pricing.badgeText)}</span>`
      : "";
    const oldHtml = pricing.showOld
      ? `<span class="cart-old">${runtime.escapeHtml(oldText)}</span>`
      : "";
    priceEl.innerHTML = `<span class="cart-price-group"><span class="cart-price-stack"><span class="cart-price">${runtime.escapeHtml(currentText)}</span>${oldHtml}</span>${badgeHtml}</span>`;
  }

function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

function money(v) {
    const n = runtime.roundPrice(Number(v || 0));
    return runtime.moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

function moneyNoSign(v) {
    const n = runtime.roundPrice(Number(v || 0));
    return runtime.moneyFmt.format(Number.isFinite(n) ? n : 0);
  }

function decorateOptionItemThumb(thumbHost, item, variantData = null) {
    if (!thumbHost || !thumbHost.appendChild) return;
    const product = runtime.getOptionItemTargetProduct(item);
    if (!product) return;

    thumbHost.style.position = "relative";

    const existingDiscountBadge = thumbHost.querySelector(".sp-card-discount-badge");
    if (existingDiscountBadge) existingDiscountBadge.remove();
    const existingBogoBadge = thumbHost.querySelector(".sp-card-bogo-badge");
    if (existingBogoBadge) existingBogoBadge.remove();

    if (typeof runtime.createCatalogBuyXGetYBadge === "function") {
      const bogoBadge = runtime.createCatalogBuyXGetYBadge(product);
      if (bogoBadge) {
        bogoBadge.style.position = "absolute";
        bogoBadge.style.top = "4px";
        bogoBadge.style.left = "4px";
        thumbHost.appendChild(bogoBadge);
      }
    }
  }

function createCatalogBuyXGetYBadge(product) {
    const text = runtime.getCatalogBuyXGetYBadgeText(product);
    if (!text) return null;
    const badge = document.createElement("div");
    badge.className = "sp-card-bogo-badge";
    badge.textContent = text;
    return badge;
  }

function getCatalogBuyXGetYBadgeText(product) {
    const source = product?.buy_x_get_y_badge;
    if (!source || typeof source !== "object") return "";
    const directText = runtime.str(source.badge_text || "").trim();
    const plusMatch = directText.match(/^(\d+)\s*\+\s*(\d+)$/);
    const equalsMatch = directText.match(/^(\d+)\s*=\s*(\d+)$/);
    const hasQty = source.buy_qty != null || source.reward_qty != null || !!plusMatch || !!equalsMatch;
    if (!hasQty) return directText;
    const buyQty = Math.max(1, Math.floor(Number(source.buy_qty ?? plusMatch?.[1] ?? equalsMatch?.[2] ?? 0)) || 1);
    const rewardQtyFromEquals = equalsMatch ? Math.max(1, Number(equalsMatch[1] || 0) - Number(equalsMatch[2] || 0)) : 0;
    const rewardQty = Math.max(1, Math.floor(Number(source.reward_qty ?? plusMatch?.[2] ?? rewardQtyFromEquals ?? 0)) || 1);
    if (buyQty > 0 && rewardQty > 0) return `${buyQty + rewardQty}=${buyQty}`;
    return directText;
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

function buildOptionItemVariantState(item, variantGroup, valueIndex, valueRaw = null) {
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    const safeIndex = Number(valueIndex);
    const targetProduct = runtime.getOptionItemTargetProduct(item);
    const baseDisplayPrice = runtime.getOptionItemResolvedDisplayBasePrice(item, targetProduct);
    const unitPrice = runtime.getOptionItemCurrentDisplayPrice(item, {
      variant_group_id: Number(variantGroup?.variant_group_id || variantGroup?.id || 0),
      variant_value_index: safeIndex,
    }, targetProduct);
    const priceDiff = unitPrice - baseDisplayPrice;
    const unitLabel = runtime.str(
      variantGroup?.unit_short_title ||
      variantGroup?.unit_code ||
      variantGroup?.unit_title ||
      ""
    ).trim();
    const groupTitle = runtime.str(variantGroup?.title || variantGroup?.title_label || "").trim();
    const rawValue = valueRaw != null
      ? runtime.str(valueRaw)
      : (
        Number.isFinite(safeIndex) &&
        safeIndex >= 0 &&
        safeIndex < values.length
          ? runtime.str(values[safeIndex])
          : ""
      );
    const hasLetters = (value) => /[a-zа-я]/i.test(String(value || ""));
    const variantLabel = unitLabel && !hasLetters(rawValue) ? `${rawValue} ${unitLabel}` : rawValue;
    return {
      variant_group_id: Number(variantGroup?.variant_group_id || variantGroup?.id || 0),
      variant_value_index: Number.isFinite(safeIndex) ? safeIndex : null,
      variant_label: runtime.str(variantLabel || "").trim(),
      variant_group_title: groupTitle,
      variant_unit: unitLabel,
      unit_id:
        variantGroup?.unit_id != null && Number.isFinite(Number(variantGroup.unit_id))
          ? Number(variantGroup.unit_id)
          : null,
      variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
    };
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
            variant_group_title: variantData.variant_group_title || "",
            variant_unit: variantData.variant_unit || "",
            unit_id:
              variantData.unit_id != null && Number.isFinite(Number(variantData.unit_id))
                ? Number(variantData.unit_id)
                : null,
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
            nutrition_per_100g: item.nutrition_per_100g || null,
            nutrition_per_portion: item.nutrition_per_portion || null,
            base_qty_grams: item.base_qty_grams,
            nutrition_portion_grams: item.nutrition_portion_grams,
            unit_to_grams_factor: item.unit_to_grams_factor,
            variants: Array.isArray(item.variants) ? item.variants : [],
            old_price: Number(item.old_price || 0),
            original_price: Number(item.original_price || 0),
            discounted_price: Number(item.discounted_price || 0),
            discount: item.discount && typeof item.discount === "object" ? { ...item.discount } : null,
            buy_x_get_y_badge: item.buy_x_get_y_badge || null,
            price_mode: item.price_mode,
            price_value: item.price_value,
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
              nutrition_per_100g: item.nutrition_per_100g || null,
              nutrition_per_portion: item.nutrition_per_portion || null,
              base_qty_grams: item.base_qty_grams,
              nutrition_portion_grams: item.nutrition_portion_grams,
              unit_to_grams_factor: item.unit_to_grams_factor,
              variants: Array.isArray(item.variants) ? item.variants : [],
              old_price: Number(item.old_price || 0),
              original_price: Number(item.original_price || 0),
              discounted_price: Number(item.discounted_price || 0),
              discount: item.discount && typeof item.discount === "object" ? { ...item.discount } : null,
              buy_x_get_y_badge: item.buy_x_get_y_badge || null,
              price_mode: item.price_mode,
              price_value: item.price_value,
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
              nutrition_per_100g: item.nutrition_per_100g || null,
              nutrition_per_portion: item.nutrition_per_portion || null,
              base_qty_grams: item.base_qty_grams,
              nutrition_portion_grams: item.nutrition_portion_grams,
              unit_to_grams_factor: item.unit_to_grams_factor,
              variants: Array.isArray(item.variants) ? item.variants : [],
              old_price: Number(item.old_price || 0),
              original_price: Number(item.original_price || 0),
              discounted_price: Number(item.discounted_price || 0),
              discount: item.discount && typeof item.discount === "object" ? { ...item.discount } : null,
              buy_x_get_y_badge: item.buy_x_get_y_badge || null,
              price_mode: item.price_mode,
              price_value: item.price_value,
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

function buildStockCheckItemsPayloadFromResolved(resolvedItems) {
    const safeItems = Array.isArray(resolvedItems) ? resolvedItems : [];
    return safeItems.map((item) => {
      if (item?.type === "combo") {
        const selections = Array.isArray(item.selections) ? item.selections : [];
        return {
          cart_key: item.key || null,
          type: "combo",
          combo_id: item.combo_id || null,
          qty: Math.max(1, Number(item.qty || 1)),
          selections: selections.map((sel) => ({
            product_id: Number(sel.product_id || 0) || null,
            variant_group_id: sel.variant_group_id != null ? Number(sel.variant_group_id) : null,
            variant_value_index: sel.variant_value_index != null ? Number(sel.variant_value_index) : null,
            variant_label: runtime.str(sel.variant_label || ""),
            unit_id: sel.unit_id != null ? Number(sel.unit_id) : null,
            ingredients_display: Array.isArray(sel.ingredients_display)
              ? sel.ingredients_display.map((ing) => ({
                  ingredient_id: ing.ingredient_id != null ? Number(ing.ingredient_id) : null,
                  product_id: ing.product_id != null ? Number(ing.product_id) : null,
                  quantity: ing.quantity != null ? Number(ing.quantity) : null,
                  qty: ing.qty != null ? Number(ing.qty) : null,
                  unit_id: ing.unit_id != null ? Number(ing.unit_id) : null,
                }))
              : [],
          })),
        };
      }

      const variantGroupId = runtime.toFiniteNumberOrNull(item?.variant_group_id);
      const variantValueIndex = runtime.toFiniteNumberOrNull(item?.variant_value_index);
      const variantLabel = runtime.toStockVariantValue(item?.variant_label || "");
      const hasVariant = variantGroupId !== null && variantValueIndex !== null && !!variantLabel;

      return {
        cart_key: item?.key || null,
        product_id: Number(item?.product?.id || item?.product_id || 0) || null,
        qty: Math.max(1, Number(item?.qty || 1)),
        option_item_ids: Array.isArray(item?.option_item_ids) ? item.option_item_ids : [],
        option_items: Array.isArray(item?.option_items) ? item.option_items : [],
        ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [],
        variant_group_id: hasVariant ? variantGroupId : null,
        variant_value_index: hasVariant ? variantValueIndex : null,
        variant_label: hasVariant ? variantLabel : null,
        variants: hasVariant
          ? [{
              variant_group_id: variantGroupId,
              variant_value_index: variantValueIndex,
              value: variantLabel,
              label: variantLabel,
            }]
          : undefined,
      };
    });
  }

function syncProductHeroBadges(mediaEl, product, currentPrice = null, originalPrice = 0) {
    if (!mediaEl || !product) return;

    const currentDiscountBadge = mediaEl.querySelector(".shop-product-hero-discount-badge");
    if (currentDiscountBadge) currentDiscountBadge.remove();

    const currentBogoBadge = mediaEl.querySelector(".shop-product-hero-bogo-badge");
    if (currentBogoBadge) currentBogoBadge.remove();

    const resolvedCurrentPrice = currentPrice != null
      ? runtime.roundPrice(Number(currentPrice || 0))
      : runtime.roundPrice(Number(product?.display_price != null ? product.display_price : product?.price || 0));
    const resolvedOriginalPrice = runtime.roundPrice(Number(originalPrice || 0));
    const badgeText = runtime.getDiscountBadgeTextForPricePair(resolvedCurrentPrice, resolvedOriginalPrice);

    if (badgeText && typeof runtime.createCatalogDiscountBadge === "function") {
      const discountBadge = runtime.createCatalogDiscountBadge(badgeText);
      if (discountBadge) {
        discountBadge.classList.add("shop-product-hero-discount-badge");
        mediaEl.appendChild(discountBadge);
      }
    }

    if (typeof runtime.createCatalogBuyXGetYBadge === "function") {
      const bogoBadge = runtime.createCatalogBuyXGetYBadge(product);
      if (bogoBadge) {
        bogoBadge.classList.add("shop-product-hero-bogo-badge");
        if (badgeText) {
          bogoBadge.style.left = "12px";
          bogoBadge.style.right = "auto";
        }
        mediaEl.appendChild(bogoBadge);
      }
    }
  }

function createCatalogDiscountBadge(badgeText) {
    const text = runtime.str(badgeText || "").trim();
    if (!text) return null;
    const badge = document.createElement("div");
    badge.className = "sp-card-discount-badge sp-combo-discount";
    badge.textContent = text;
    return badge;
  }

function createQtyPill({
    variant = "buy",
    big = false,
    centerText = "",
    centerHtml = "",
    minusEnabled = true,
    plusEnabled = true,
  } = {}) {
    const pill = document.createElement("div");
    pill.className = "qty-pill";
    if (variant === "muted") pill.classList.add("qty-pill--muted");
    if (big) pill.classList.add("qty-pill--big");

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "qty-pill__btn qty-pill__btn--minus";
    btnMinus.textContent = "−";
    if (!minusEnabled) {
      btnMinus.classList.add("is-disabled");
      btnMinus.disabled = true;
    }

    const center = document.createElement("div");
    center.className = "qty-pill__center";
    if (centerHtml) center.innerHTML = centerHtml;
    else center.textContent = centerText;

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "qty-pill__btn qty-pill__btn--plus";
    btnPlus.textContent = "+";
    if (!plusEnabled) {
      btnPlus.classList.add("is-disabled");
      btnPlus.disabled = true;
    }

    pill.appendChild(btnMinus);
    pill.appendChild(center);
    pill.appendChild(btnPlus);

    return { pill, btnMinus, btnPlus, center };
  }

function normalizeProductOptionGroups(optionGroups) {
    return (Array.isArray(optionGroups) ? optionGroups : []).map((group) => ({
      ...group,
      items: (Array.isArray(group?.items) ? group.items : []).map((item) => runtime.normalizeOptionItemForDisplay(item)),
    }));
  }

function preloadImageOnce(url, opts = {}) {
    if (!url || runtime.preloadedImages.has(url)) return;
    runtime.preloadedImages.add(url);
    try {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      if (opts.fetchPriority && 'fetchPriority' in link) {
        link.fetchPriority = opts.fetchPriority;
      }
      document.head.appendChild(link);
    } catch {
      // fallback: warm cache without blocking render
      try {
        const img = new Image();
        img.src = url;
      } catch {}
    }
  }

  return { getConfigurableIngredients, createOptimizedImage, setOptimizedImageTemplate, getOptimizedImageTemplate, waitForComboGridImage, preloadComboGridImage, rememberComboGridImageReady, str, preloadComboGridImagesInBackground, normalizeComboGridPhotoUrls, normalizeComboVariantList, buildProductOptionGroupsFromBatch, normalizeOptionItemForDisplay, getOptionItemPhotos, safePhotos, makeCartKey, cloneCartState, buildFavoriteSnapshotFromResolvedItem, extractVariantValueForOrder, normalizeFavoriteIngredientsFromCart, toFiniteNumberOrNull, normalizeFavoriteOptionItemsFromCart, createProductBuyXGetYActionCard, renderOptionItemPrice, escapeHtml, money, moneyNoSign, decorateOptionItemThumb, createCatalogBuyXGetYBadge, getCatalogBuyXGetYBadgeText, getOptionGroupUiType, buildOptionItemVariantState, collectSelectedOptionItems, buildStockCheckItemsPayloadFromResolved, syncProductHeroBadges, createCatalogDiscountBadge, createQtyPill, normalizeProductOptionGroups, preloadImageOnce };
});
