(function () {
  "use strict";

  const passportPayloads = new Map();
  const passportRequests = new Map();
  const scriptLoads = new Map();
  let source = {};
  let currentOptions = {};
  let productContext = null;
  let runtime = null;
  const defaultPrices = new Map();
  const imageTemplates = new Map();
  const imageReady = new Map();
  const preloaded = new Set();
  const normalizeIds = (ids) => [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(id => id > 0))];
  const nativeRuntime = () => document.body.classList.contains("page-shop") && typeof window.getSharedShopProductRuntime === "function" ? window.getSharedShopProductRuntime() : null;
  const getPassport = (id) => source.getPassport?.(Number(id)) || nativeRuntime()?.getProductPassport(Number(id)) || passportPayloads.get(Number(id)) || null;
  const getProduct = (id) => source.getProduct?.(Number(id)) || nativeRuntime()?.state.productCache.get(Number(id)) || getPassport(id)?.product || null;
  const getCartItems = () => currentOptions.cartContext?.getItems() || [];

  async function request(url, options = {}) {
    if (source.request) return source.request(url, options);
    const response = await fetch(url, {
      ...options, credentials: "same-origin",
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw Object.assign(new Error(result.error || `HTTP_${response.status}`), { payload: result });
    return result;
  }

  async function fetchPassports(productIds) {
    const ids = normalizeIds(productIds);
    const missing = ids.filter(id => (!getPassport(id) || !['order', 'preorder'].includes(getPassport(id)?.product?.sale_mode)) && !passportRequests.has(id));
    if (missing.length) {
      const task = (async () => {
        for (let offset = 0; offset < missing.length; offset += 100) {
          const chunk = missing.slice(offset, offset + 100);
          if (source.ensurePassports) await source.ensurePassports(chunk);
          else {
            const json = await request("/api/public/products/batch/passports", { method: "POST", body: { ids: chunk } });
            Object.entries(json.data || {}).forEach(([id, passport]) => passportPayloads.set(Number(id), passport));
          }
        }
      })().finally(() => missing.forEach(id => passportRequests.delete(id)));
      missing.forEach(id => passportRequests.set(id, task));
    }
    await Promise.all([...new Set(ids.map(id => passportRequests.get(id)).filter(Boolean))]);
    ids.forEach(id => { if (!getPassport(id)) throw new Error(`PRODUCT_PASSPORT_UNAVAILABLE:${id}`); });
  }

  function loadScript(name) {
    if (scriptLoads.has(name)) return scriptLoads.get(name);
    const task = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const assetKey = name === 'configurator' ? 'sharedProductConfigurator' : 'sharedProductDetailsContent';
      script.src = window.__ADMIN_ASSET_URLS__?.[assetKey] || `/static/js/shared-product-${name}.js?v=components-v4-preorder`;
      script.onload = resolve;
      script.onerror = () => { scriptLoads.delete(name); script.remove(); reject(new Error(`PRODUCT_COMPONENT_UNAVAILABLE:${name}`)); };
      document.head.appendChild(script);
    });
    scriptLoads.set(name, task);
    return task;
  }

  async function ensureDetails() {
    await Promise.all([loadScript("details-content"), loadScript("configurator")]);
  }

  function getStockEntry(id) {
    if (source.getStock) return source.getStock(Number(id));
    const passport = getPassport(id);
    if (!passport?.stock) return null;
    return { qty: passport.stock.stock_qty, isUnlimited: passport.stock.stock_qty == null, isAvailable: passport.availability?.is_available !== false };
  }

  function isAvailable(product) {
    if (source.isAvailable) return source.isAvailable(product);
    return product?.is_available == null || product.is_available === true || Number(product.is_available) === 1;
  }

  function getRemaining(id) {
    if (currentOptions.cartContext) return currentOptions.cartContext.getRemaining(Number(id));
    const entry = getStockEntry(id);
    return entry?.qty == null ? Infinity : Number(entry.qty);
  }

  function showError(message) {
    if (source.showToast) source.showToast(message);
    else window.alert(message);
  }

  function getRuntime() {
    if (runtime) return runtime;
    const data = {
      productCache: { get: getProduct, has: id => !!getProduct(id) },
      get cart() { return getCartItems(); },
      get unitConversions() { return source.getUnitConversions?.() || [...passportPayloads.values()].find(p => p.unitConversions)?.unitConversions || []; },
      get autoAdd() { return source.getAutoAdd?.(); },
    };
    runtime = window.SharedProductRuntime.create({
      $: (selector, root = document) => root.querySelector(selector), RegExp,
      state: data,
      defaultPriceCache: defaultPrices,
      optimizedImageTemplateCache: imageTemplates, OPTIMIZED_IMAGE_TEMPLATE_LIMIT: 300,
      comboGridImageReadyCache: imageReady, COMBO_GRID_IMAGE_READY_LIMIT: 300,
      preloadedImages: preloaded,
      moneyFmt: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }),
      get showPreorderMediaLabel() { return source.showPreorderMediaLabel === true; },
      getPreorderToday: () => source.getPreorderToday?.(),
      get priceRoundingRuntime() { return source.getRounding?.() || { mode: "none", precision: 2 }; },
      get openProductCtx() { return productContext; },
      set openProductCtx(value) { productContext = value; },
      getProductPassport: getPassport,
      ensureProduct: async id => {
        if (!getProduct(id) || !['order', 'preorder'].includes(getProduct(id)?.sale_mode)) await fetchPassports([id]);
        const product = getPassport(id)?.product || getProduct(id);
        if (product && !['order', 'preorder'].includes(product.sale_mode)) throw new Error('PREORDER_SETTINGS_INVALID');
        return product;
      },
      resolveProductDetailsConfig: async id => {
        await fetchPassports([id]);
        const passport = getPassport(id);
        const byId = {};
        (passport.options || []).forEach(entry => { byId[Number(entry.group?.id || entry.group_id || entry.id)] = entry; });
        return {
          ingredients: runtime.getConfigurableIngredients(passport.product, passport.ingredients || []),
          variants: runtime.normalizeComboVariantList(passport.variants || []),
          optionGroups: Array.isArray(passport.optionGroups)
            ? passport.optionGroups
            : (Array.isArray(passport.options)
              ? passport.options
              : (Array.isArray(passport.option_groups)
                ? passport.option_groups
                : runtime.buildProductOptionGroupsFromBatch(Number(id), passport.optionAssignments || [], passport.option_groups || byId))),
        };
      },
      resolveProductVariants: async id => (await runtime.resolveProductDetailsConfig(id)).variants,
      resolveProductOptionGroups: async id => (await runtime.resolveProductDetailsConfig(id)).optionGroups,
      isProductAvailable: isAvailable,
      getAvailableStock: getRemaining,
      getStockLevelEntry: getStockEntry,
      isProductBlockedByIngredientRequirements: id => getPassport(id)?.defaultConfig?.is_fulfillable === false,
      calcProductStockConsumed: id => currentOptions.cartContext?.getConsumed(Number(id)) || 0,
      getConversionFactor: (from, to) => {
        if (Number(from) === Number(to)) return 1;
        const direct = data.unitConversions.find(row => Number(row.from_unit_id) === Number(from) && Number(row.to_unit_id) === Number(to) && Number(row.is_active) === 1);
        if (direct) return Number(direct.factor);
        const inverse = data.unitConversions.find(row => Number(row.to_unit_id) === Number(from) && Number(row.from_unit_id) === Number(to) && Number(row.is_active) === 1);
        return inverse && Number(inverse.factor) ? 1 / Number(inverse.factor) : null;
      },
      cartItemsResolved: getCartItems,
      cartCountTotal: () => getCartItems().reduce((sum, item) => sum + Number(item.qty || 0), 0),
      getCartItemByKey: key => getCartItems().find(item => item.key === key),
      checkStockForItemsPayload: async (items, options) => {
        const json = await request("/api/public/orders/stock-check", { method: "POST", body: { items } });
        const result = json.data || {};
        if (result.available === false && options?.showToastOnOut) showError(options.toastMessage);
        return { ...result, available: result.available !== false };
      },
      apiJson: request,
      showToast: showError,
      mobileProductActionsState: {},
      isKsoCatalogCache: false,
      openProductBuyXGetYBenefitDetail: product => {
        if (!source.openBenefit) throw new Error("PRODUCT_BENEFIT_ACTION_UNAVAILABLE");
        return source.openBenefit(product);
      },
    });
    return runtime;
  }

  function createSurface(host, className) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const existing = shadow.querySelector(`.${className}`);
    if (existing) return existing;
    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/static/css/shared-product-details.css?v=components-v2";
    const icons = document.createElement("link");
    icons.rel = "stylesheet";
    icons.href = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css";
    const root = document.createElement("div");
    root.className = className;
    shadow.append(styles, icons, root);
    return root;
  }

  function ensureOverlay() {
    if (document.getElementById("newOrderProductOverlay")) return document.getElementById("newOrderProductOverlay");
    const wrap = document.createElement("div");
    wrap.id = "newOrderProductOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet new-order-product-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="product-overlay-close"><i class="fas fa-arrow-left"></i></button>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar new-order-product-sheet-list" id="newOrderProductOverlayList"></div>
        <div class="new-order-product-sheet-footer shop-pd-footer">
          <div class="qty-pill qty-pill--muted new-order-product-sheet-qty">
            <button class="qty-pill__btn qty-pill__btn--minus" type="button" data-action="product-overlay-qty-minus">−</button>
            <span class="qty-pill__center" id="newOrderProductOverlayQtyValue">1</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="product-overlay-qty-plus">+</button>
          </div>
          <button class="shop-checkout-btn shop-pd-action new-order-product-sheet-add" type="button" id="newOrderProductOverlayAddBtn" data-action="product-overlay-add">РІ РєРѕСЂР·РёРЅСѓ</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    return wrap;
  }

  function renderCompositionRow(row, context) {
    const { item, active, isGiftReward, fixedGiftComposition, getCartItemCheckoutRequireAll, escapeHtml, selectionMode = false, hideOptionConfiguration = false } = context;
  const comboLineText = row.rowKind === "combo"
    ? [String(row.unitLabel || "").trim(), String(row.productName || "").trim()].filter(Boolean).join(" ").trim()
    : "";
  const baseLineRaw = selectionMode && row.rowKind === 'product' ? '' : row.rowKind === "combo"
    ? (comboLineText ? `1 x ${comboLineText}` : `1 x ${String(row.productName || "—").trim() || "—"}`)
    : (row.unitLabel
      ? `${String(row.unitLabel || "").trim()} ${String(row.productName || "").trim()}`.trim()
      : (row.rowKind === "option" ? String(row.productName || "").trim() : ""));
  const baseLine = baseLineRaw ? escapeHtml(baseLineRaw) : "";
  const cartItemIsCombo = String(item?.type || "") === "combo";
  const isCheckoutComposedCombo = cartItemIsCombo && Number(item?.combo_id || 0) <= 0;
  const comboRequireAll = getCartItemCheckoutRequireAll(item);
  const canRemoveComboSection = row.rowKind === "combo"
    && isCheckoutComposedCombo
    && comboRequireAll === false
    && Number.isFinite(Number(row.sectionIndex))
    && Number(row.sectionIndex) >= 0;
  const canRemoveProductRow = row.rowKind === "product" && row.variantValues.length > 1;
  const removeBtn = !selectionMode && !fixedGiftComposition && (canRemoveProductRow || canRemoveComboSection)
    ? `
      <button
        type="button"
        class="new-order-right-cart-variant-chip new-order-right-cart-variant-remove"
        data-action="right-cart-row-remove"
        data-order-id="${Number(active?.id || 0)}"
        data-cart-item-id="${Number(item?.id || 0)}"
        data-row-kind="${row.rowKind}"
        data-section-index="${row.sectionIndex}"
        aria-label="Удалить позицию"
        title="Удалить позицию"
      >×</button>
    `
    : "";
  const optionIcon = row.rowKind === "option" && !fixedGiftComposition && !hideOptionConfiguration
    ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="Опции товара"><i class="fas fa-sliders-h"></i></button>`
    : "";
  const productOptionIcon = row.rowKind === "product" && row.hasOptions && !fixedGiftComposition && !hideOptionConfiguration
    ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="Опции товара"><i class="fas fa-sliders-h"></i></button>`
    : "";
  const chips = row.variantValues.length > 1 && !fixedGiftComposition
    ? `
      <div class="new-order-right-cart-variant-scroll no-scrollbar">
        <div class="new-order-right-cart-variant-row">
          ${row.rowKind === "option" ? "" : `${removeBtn}${productOptionIcon}`}
          ${row.variantValues.map((label, variantIndex) => `
            <button
              type="button"
              class="new-order-right-cart-variant-chip ${variantIndex === row.selectedVariantIndex ? "is-selected" : ""}"
              data-action="right-cart-variant-select"
              data-order-id="${Number(active?.id || 0)}"
              data-cart-item-id="${Number(item?.id || 0)}"
              data-row-kind="${row.rowKind}"
              data-section-index="${row.sectionIndex}"
              data-option-index="${Number(row.optionIndex || 0)}"
              data-variant-index="${variantIndex}"
            >${escapeHtml(label)}</button>
          `).join("")}
        </div>
      </div>
    `
    : "";
  const optionQtyControls = row.rowKind === "option" && row.showQtyControls && !fixedGiftComposition
    ? `
      <div class="new-order-right-cart-ing-controls">
        <button type="button" class="new-order-right-cart-ing-btn${row.canMinus ? "" : " is-disabled"}" data-action="right-cart-option-qty-minus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">−</button>
        <span class="new-order-right-cart-ing-qty">${Number(row.optionQty || 0)}</span>
        <button type="button" class="new-order-right-cart-ing-btn${row.canPlus ? "" : " is-disabled"}" data-action="right-cart-option-qty-plus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">+</button>
      </div>
    `
    : "";
  const optionRemoveBtn = row.rowKind === "option" && !row.isLocked && !fixedGiftComposition
    ? `
      <button
        type="button"
        class="new-order-right-cart-variant-chip new-order-right-cart-variant-remove"
        data-action="right-cart-option-remove"
        data-order-id="${Number(active?.id || 0)}"
        data-cart-item-id="${Number(item?.id || 0)}"
        data-option-index="${Number(row.optionIndex || 0)}"
        aria-label="Удалить опцию"
        title="Удалить опцию"
      >×</button>
    `
    : "";
  const ingredientRows = Array.isArray(row.ingredients) ? row.ingredients : [];
  const ingredientsHtml = ingredientRows.length
    ? `
      <div class="new-order-right-cart-ingredients">
        ${ingredientRows.map((ing, ingIndex) => {
          const ingName = String(ing?.ingredient_name || "").trim();
          const qty = Number(ing?.qty || 0);
          const unitLabel = String(ing?.unit_label || "").trim();
          if (fixedGiftComposition || (selectionMode && ing.is_variable != null && Number(ing.is_variable) !== 1)) {
            return `
              <div class="new-order-right-cart-ing-row">
                <div class="new-order-right-cart-ing-qty">${escapeHtml(String(qty))}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</div>
                <div class="new-order-right-cart-ing-name" title="${escapeHtml(ingName)}">${escapeHtml(ingName)}</div>
              </div>
            `;
          }
          const min = Number(ing?.qty_min ?? 0);
          const max = Number(ing?.qty_max ?? qty);
          const canMinus = qty > min;
          const canPlus = qty < max;
          return `
            <div class="new-order-right-cart-ing-row">
              <div class="new-order-right-cart-ing-controls">
                <button type="button" class="new-order-right-cart-ing-btn${canMinus ? "" : " is-disabled"}" data-action="right-cart-ingredient-minus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-row-kind="${row.rowKind}" data-section-index="${row.sectionIndex}" data-ingredient-index="${ingIndex}">−</button>
                <span class="new-order-right-cart-ing-qty">${escapeHtml(String(qty))}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</span>
                <button type="button" class="new-order-right-cart-ing-btn${canPlus ? "" : " is-disabled"}" data-action="right-cart-ingredient-plus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-row-kind="${row.rowKind}" data-section-index="${row.sectionIndex}" data-ingredient-index="${ingIndex}">+</button>
              </div>
              <div class="new-order-right-cart-ing-name" title="${escapeHtml(ingName)}">${escapeHtml(ingName)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `
    : "";
  const optionTitle = row.rowKind === "option"
    ? `<div class="new-order-right-cart-option-title">${
        row.showQtyControls
          ? `${escapeHtml(String(Number(row.optionQty || 0)))} ${baseLine || escapeHtml(row.productName || "")}`
          : (baseLine || escapeHtml(row.productName || ""))
      }</div>`
    : "";
  const optionControlsRow = row.rowKind === "option"
    ? `
      <div class="new-order-right-cart-option-controls-row">
        ${optionRemoveBtn}
        ${optionIcon}
        ${row.showQtyControls ? optionQtyControls : chips}
      </div>
    `
    : "";
  const productControlsRow = row.rowKind !== "option" && row.variantValues.length <= 1 && !isGiftReward && (removeBtn || productOptionIcon)
    ? `<div class="new-order-right-cart-option-controls-row">${removeBtn}${productOptionIcon}</div>`
    : "";
  const rowClass = row.rowKind === "combo"
    ? "new-order-right-cart-composition-row new-order-right-cart-combo-row"
    : "new-order-right-cart-composition-row";
  const comboTitleClass = row.rowKind === "combo" ? "new-order-right-cart-combo-title" : "";
  const html = `<div class="${rowClass}">${row.rowKind === "option" ? `${optionTitle}${optionControlsRow}` : (baseLine ? `<div class="${comboTitleClass}">${baseLine}</div>` : "")}${row.rowKind === "option" ? "" : `${chips}${productControlsRow}`}${ingredientsHtml}</div>`;
  return selectionMode ? html.replace(/data-action="right-cart-/g, 'data-action="selection-') : html;
  }

  function normalizePriceRoundingSettings(source) {
    const modeRaw = source && typeof source === "object"
      ? (typeof source.price_rounding_mode === "string" ? source.price_rounding_mode : source.mode)
      : "none";
    const mode = typeof modeRaw === "string" ? modeRaw : "none";
    const allowed = new Set(["none", "down", "up", "nearest"]);
    const safeMode = allowed.has(mode) ? mode : "none";
    const precisionValue = source && typeof source === "object"
      ? (Object.prototype.hasOwnProperty.call(source, "price_rounding_precision") ? source.price_rounding_precision : source.precision)
      : null;
    const precisionRaw = Number(precisionValue);
    const precision = precisionRaw === 0 ? 0 : 2;
    return { mode: safeMode, precision };
  }

  let overlayGeneration = 0;
  let closeSelectionOverlay = null;
  async function open(options = {}) {
    closeSelectionOverlay?.();
    const overlay = ensureOverlay();
    const generation = ++overlayGeneration;
    const list = overlay.querySelector('#newOrderProductOverlayList');
    const host = document.createElement('div');
    host.className = 'new-order-shared-product-host';
    list.replaceChildren(host);
    overlay.classList.add('is-shared-product');
    overlay.classList.remove('hidden');
    const onKey = event => { if (event.key === 'Escape') close(); };
    const close = () => {
      if (generation !== overlayGeneration) return;
      overlayGeneration += 1;
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('hidden');
      overlay.onclick = null;
      list.replaceChildren();
      closeSelectionOverlay = null;
      options.onBack?.();
    };
    closeSelectionOverlay = close;
    overlay.onclick = event => {
      if (event.target === overlay || event.target.closest('[data-action="product-overlay-close"]')) close();
    };
    document.addEventListener('keydown', onKey);
    try {
      await mount({ ...options, container: host, onBack: close,
        isCurrent: () => generation === overlayGeneration && host.isConnected,
        onSave: value => { if (generation === overlayGeneration) { close(); options.onSave?.(value); } },
      });
    } catch (error) { close(); throw error; }
  }

  const selectionDetails = new Map();
  function sameSelectionPassport(previous, current) {
    return Boolean(previous && current && ['product', 'ingredients', 'variants', 'options', 'optionGroups',
      'option_groups', 'optionAssignments', 'defaultConfig', 'nestedIngredients', 'units', 'unitConversions',
      'productUnitLinks', 'stock', 'availability'].every(key => previous[key] === current[key]));
  }
  async function prepareSelections(ids) {
    await fetchPassports(ids);
    await Promise.all(normalizeIds(ids).map(async id => {
      const passport = getPassport(id);
      if (sameSelectionPassport(selectionDetails.get(id)?.passport, passport)) return;
      selectionDetails.set(id, { passport, details: await getRuntime().resolveProductDetailsConfig(id) });
    }));
    const relatedIds = normalizeIds(normalizeIds(ids).flatMap(id => {
      const passport = getPassport(id), details = selectionDetails.get(id)?.details;
      return [...(passport?.ingredients || []).map(row => row.ingredient_id),
        ...(details?.optionGroups || []).flatMap(group => (group.items || []).map(row => row.target_product_id || row.product_id))];
    }));
    if (relatedIds.length) await fetchPassports(relatedIds);
  }

  function getSelection(id, selected) {
    const passport = getPassport(id);
    const cached = selectionDetails.get(Number(id));
    const details = sameSelectionPassport(cached?.passport, passport) ? cached.details : null;
    if (!passport || !details) return null;
    const configuration = JSON.parse(JSON.stringify({ ...(passport.defaultConfig || {}), ...(selected || {}) }));
    const ingredients = (details.ingredients || []).map(ingredient => {
      const choice = (configuration.ingredients || []).find(row => Number(row.ingredient_id) === Number(ingredient.ingredient_id));
      const variable = ingredient.is_variable == null || Number(ingredient.is_variable) === 1;
      return { ...ingredient, ingredient_id: Number(ingredient.ingredient_id),
        ingredient_name: ingredient.ingredient_name || choice?.ingredient_name || choice?.name || '',
        qty: Number(choice?.quantity ?? choice?.qty ?? ingredient.quantity ?? 0),
        qty_min: Number(variable ? ingredient.quantity_min ?? 0 : ingredient.quantity),
        qty_max: Number(variable ? ingredient.quantity_max ?? ingredient.quantity : ingredient.quantity),
        qty_step: Number(ingredient.quantity_step || 1),
        unit_label: ingredient.unit_short_title || ingredient.unit_title || ingredient.unit_code || choice?.unit_label || '',
      };
    });
    const group = (details.variants || []).find(row => Number(row.id || row.variant_group_id) === Number(configuration.variant_group_id)) || details.variants?.[0];
    const labels = variantGroup => (variantGroup?.values || []).map(value => {
      const label = String(value ?? '').trim(), unit = variantGroup.unit_short_title || variantGroup.unit_code || '';
      return unit && /\d$/.test(label) ? `${label} ${unit}` : label;
    });
    const mainLabels = labels(group);
    const mainIndex = Number(configuration.variant_value_index ?? group?.default_value_index ?? 0);
    const rows = [{ rowKind: 'product', sectionIndex: 0, productName: '', unitLabel: mainLabels[mainIndex] || '',
      variantValues: mainLabels, selectedVariantIndex: mainIndex, ingredients,
      hasOptions: (details.optionGroups || []).length > 0, variantGroup: group }];
    (configuration.option_items || []).forEach((option, optionIndex) => {
      const optionGroup = (details.optionGroups || []).find(row => row.items?.some(item => Number(item.id) === Number(option.id)));
      const item = optionGroup?.items?.find(row => Number(row.id) === Number(option.id));
      if (!item) return;
      const variantGroup = item.variants?.find(row => Number(row.id || row.variant_group_id) === Number(option.variant_group_id)) || item.variants?.[0];
      const variantValues = labels(variantGroup);
      const index = Number(option.variant_value_index ?? variantGroup?.default_value_index ?? 0);
      const qty = Number(option.qty ?? option.quantity ?? 1);
      const minimum = Number(item.qty_min ?? 1), maximum = Number(item.qty_max ?? 1);
      const optionPassport = getPassport(option.target_product_id || option.product_id);
      const configurableOptionIngredients = getRuntime().getConfigurableIngredients(optionPassport?.product,
        optionPassport?.ingredients || []);
      const optionIngredients = configurableOptionIngredients.map(ingredient => {
        const selected = (option.ingredients || []).find(row => Number(row.ingredient_id) === Number(ingredient.ingredient_id));
        const quantity = selected?.quantity ?? selected?.qty ?? ingredient.quantity;
        return { ...ingredient, ...selected, qty: quantity, qty_min: quantity, qty_max: quantity,
          unit_label: ingredient.unit_short_title || ingredient.unit_title || ingredient.unit_code || selected?.unit_label || '' };
      });
      rows.push({ rowKind: 'option', optionIndex, sectionIndex: 0,
        isLocked: Boolean(item.is_locked),
        productName: item.title || item.name || option.title || '',
        unitLabel: variantValues[index] || option.variant_label || '', variantValues, selectedVariantIndex: index,
        optionQty: qty, showQtyControls: getRuntime().getOptionGroupUiType(optionGroup) === 'multiple_item',
        canMinus: qty > minimum, canPlus: qty < maximum, minimum, maximum, variantGroup,
        ingredients: optionIngredients,
      });
    });
    return { configuration, rows: rows.filter(row => row.rowKind === 'option' || row.unitLabel || row.ingredients.length || row.hasOptions), passport };
  }

  function getSelectionCost(id, configuration, parents = new Set()) {
    id = Number(id);
    if (parents.has(id)) throw new Error('PRODUCT_CONFIGURATION_CYCLE');
    const passport = getPassport(id);
    if (!passport?.product) throw new Error(`PRODUCT_PASSPORT_UNAVAILABLE:${id}`);
    const ui = getRuntime(), product = passport.product;
    const chosen = { ...(passport.defaultConfig || {}), ...(configuration || {}) };
    const group = (passport.variants || []).find(row => Number(row.id || row.variant_group_id) === Number(chosen.variant_group_id));
    const index = Number(chosen.variant_value_index ?? group?.default_value_index ?? 0);
    let cost = ui.getVariantUnitPrice({ ...product, price: Number(product.cost_price || 0) },
      group ? [{ ...group, discount_tiers: [] }] : [], { selectedIndex: index });
    for (const ingredient of passport.ingredients || []) {
      const selected = (chosen.ingredients || []).find(row => Number(row.ingredient_id) === Number(ingredient.ingredient_id));
      if (!selected) continue;
      const target = getPassport(ingredient.ingredient_id)?.product;
      const unitCost = Number(target?.cost_price ?? ingredient.ingredient_cost_price ?? 0)
        / Number(target?.base_qty || ingredient.ingredient_base_qty || 1);
      const current = ui.getQtyInBase(ingredient, Number(selected.quantity ?? selected.qty ?? ingredient.quantity));
      const base = ui.getQtyInBase(ingredient, Number(ingredient.quantity || 0));
      if (current == null || base == null) throw new Error('INGREDIENT_UNIT_CONVERSION_UNAVAILABLE');
      cost += (current - base) * unitCost;
    }
    const nextParents = new Set(parents).add(id);
    for (const option of chosen.option_items || []) {
      cost += getSelectionCost(option.target_product_id || option.product_id, option, nextParents)
        * Number(option.qty ?? option.quantity ?? 1);
    }
    return ui.roundPrice(Math.max(0, cost));
  }

  function getSelectionPresentation(id, configuration) {
    const selection = getSelection(id, configuration);
    if (!selection) return null;
    const ui = getRuntime(), product = selection.passport.product;
    const details = selectionDetails.get(Number(id)).details;
    const chosen = selection.configuration;
    const variant = (details.variants || []).find(row => Number(row.id || row.variant_group_id) === Number(chosen.variant_group_id)) || details.variants?.[0];
    const index = Number(chosen.variant_value_index ?? variant?.default_value_index ?? 0);
    const variantPrice = ui.getVariantUnitPrice(product, variant ? [variant] : [], { selectedIndex: index });
    const options = (chosen.option_items || []).map(choice => {
      const item = (details.optionGroups || []).flatMap(group => group.items || []).find(row => Number(row.id) === Number(choice.id));
      if (!item) throw new Error('OPTION_CONFIGURATION_UNAVAILABLE');
      const group = item.variants?.find(row => Number(row.id || row.variant_group_id) === Number(choice.variant_group_id)) || item.variants?.[0];
      const selectedIndex = Number(choice.variant_value_index ?? group?.default_value_index ?? 0);
      const option = { ...item, ...choice, variants: item.variants, configuration_json: item.configuration_json };
      if (group) Object.assign(option, ui.buildOptionItemVariantState(item, group, selectedIndex));
      return option;
    });
    const optionPricing = ui.getSelectedOptionItemsPricingTotals(options);
    const ingredientState = new Map((chosen.ingredients || []).map(row => [Number(row.ingredient_id), { quantity: row.quantity ?? row.qty }]));
    const ingredientPricing = ui.calculateIngredientPricing(details.ingredients || [], ingredientState);
    const ordinaryPrice = Math.max(variantPrice, ui.scaleProductBasePriceForCurrentUnit(product, variantPrice, Number(product.old_price || 0)))
      + optionPricing.originalComparableTotal + ingredientPricing.originalDiff;
    const unitPrice = ui.applyProductPromoPricing(product,
      variantPrice + optionPricing.currentTotal + ingredientPricing.currentDiff, ordinaryPrice);
    const discount = ui.calculateProductDiscountAmount(unitPrice, product.discount);
    const price = ui.roundPrice(Math.max(0, unitPrice - discount));
    const oldBase = ui.scaleProductBasePriceForCurrentUnit(product, variantPrice || Number(product.price || 0), Number(product.old_price || 0));
    const oldPrice = discount > 0
      ? ui.roundPrice(unitPrice + Math.max(0, optionPricing.originalComparableTotal - optionPricing.currentTotal))
      : ui.roundPrice(Math.max(oldBase, variantPrice) + ingredientPricing.originalDiff + optionPricing.originalComparableTotal);
    const label = selection.rows.find(row => row.rowKind === 'product')?.unitLabel || '';
    const title = ui.getCatalogProductTitle({ ...product, default_variant: { ...product.default_variant, variant_label: label } });
    return { title, price, priceText: ui.money(price), oldPrice: oldPrice > price ? oldPrice : 0,
      oldPriceText: oldPrice > price ? ui.money(oldPrice) : '' };
  }

  async function mount(options = {}) {
    const id = Number(options.productId || options.product?.id || 0);
    if (!(id > 0) || !options.container) throw new Error("INVALID_PRODUCT_DETAILS_TARGET");
    if (options.passports) prepare(options.passports);
    await Promise.all([ensureDetails(), fetchPassports([id])]);
    if (options.isCurrent && !options.isCurrent()) return null;
    currentOptions = options;
    const native = document.body.classList.contains("page-shop") && typeof window.getSharedShopProductRuntime === "function";
    const renderer = native ? window.getSharedShopProductRuntime() : getRuntime();
    let target = options.container;
    if (!native || options.mode === "subscription") {
      const previous = createSurface(options.container, "shared-product-details-root");
      target = document.createElement("div");
      target.className = "shared-product-details-root";
      previous.replaceWith(target);
      if (options.mode === "admin-order" || options.mode === "selection") target.classList.add("shared-product-details-root--admin-order");
    }
    const product = options.product || getProduct(id);
    await renderer.renderProductDetailsInto(target, product, {
      ...options, mode: native ? options.mode : (options.mode || "subscription"),
      prefillItem: options.initialValue || options.prefillItem || null,
      readOnly: options.mode === "readonly" || options.readOnly === true,
    });
    return { productId: id, product };
  }

  function prepare(passports) {
    if (!source.getPassport) Object.entries(passports || {}).forEach(([id, passport]) => passportPayloads.set(Number(id), passport));
  }

  async function getSummaries(productIds = []) {
  await fetchPassports(productIds);
    const ui = nativeRuntime() || getRuntime();
    const ids = normalizeIds(productIds);
  const entries = await Promise.all(ids.map(async (productId) => {
    const passport = typeof ui.getProductPassport === "function" ? ui.getProductPassport(productId) : null;
    const product = passport?.product || ui.state.productCache.get(productId) || null;
    if (!product) return [productId, null];
    const config = passport?.defaultConfig && typeof passport.defaultConfig === "object"
      ? passport.defaultConfig
      : buildImmediateUpsellDefaults(product);
    const variantLabel = ui.str(config?.variant_label || product?.default_variant?.variant_label || "").trim();
    const title = [variantLabel, ui.str(product?.name || product?.title || "").trim()].filter(Boolean).join(" ");
    const lines = [
      ...(Array.isArray(config?.ingredients) ? config.ingredients.map(ui.formatIngredientLineForOrder) : []),
      ...(Array.isArray(config?.option_items) ? config.option_items.map((option) => {
        const title = ui.str(option?.title || option?.name || "").trim();
        const variantLabel = ui.str(option?.variant_label || "").trim();
        if (variantLabel) return `${variantLabel} ${title}`;
        const qty = Math.max(1, Number(option?.qty || option?.quantity || 1));
        return qty > 1 ? `${qty} шт ${title}` : title;
      }) : []),
    ].map((line) => ui.str(line || "").trim()).filter(Boolean);
    const price = Number(await ui.calculateDefaultPrice(product)) || 0;
    let oldPrice = 0;
    if (product?.discount && Number(product?.original_price || 0) > price) {
      oldPrice = Number(product.original_price || 0);
    } else {
      const scaledOld = ui.scaleProductBasePriceForCurrentUnit(product, price, Number(product?.old_price || 0));
      if (scaledOld > price) oldPrice = scaledOld;
    }
    const discountPercent = oldPrice > price && oldPrice > 0
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : 0;
    return [productId, { productId, title, lines, price, oldPrice, discountPercent }];
  }));
  return Object.fromEntries(entries.filter(([, summary]) => summary));
}

  window.SharedProductDetails = Object.freeze({
    configure(options) { source = options || {}; },
    normalizePriceRoundingSettings, mount, open, prepare, ensureOverlay, renderCompositionRow, prepareSelections, getSelection, getSelectionPresentation, ensureDetails, preload: ensureDetails,
    prefetch: fetchPassports, getSummaries,
    getOptionItemDisplayPricing: (item, variant) => getRuntime().getOptionItemDisplayPricing(item, variant),
    getSelectionCost,
    applyProductPromoPricing: (product, current, original) => getRuntime().applyProductPromoPricing(product, current, original),
    getConfiguredBasePrice: (product, group, index) => getRuntime().getVariantUnitPrice(product, group ? [group] : [], { selectedIndex: index }),
    getPassport: async id => { await fetchPassports([id]); return getPassport(id); },
    getPreorderDescription: product => getRuntime().getProductPreorderDescription(product),
    getPreorderInfo: product => getRuntime().getProductPreorderInfo(product),
    getPreorderWeekdaysHtml: weekdays => getRuntime().getPreorderWeekdaysHtml(weekdays),
    createCatalogSurface: host => createSurface(host, "shared-product-catalog"),
    createCard: (product, context) => getRuntime().createCatalogProductCard(product, context),
    createComboCard: (combo, context) => getRuntime().createCatalogComboCard(combo, context),
    syncCard: (card, product, qty, context) => getRuntime().applyCardState(card, product, qty, null, context),
  });
})();
