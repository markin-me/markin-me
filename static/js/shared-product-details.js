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
    const missing = ids.filter(id => !getPassport(id) && !passportRequests.has(id));
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
      script.src = `/static/js/shared-product-${name}.js?v=components-v2`;
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
      get priceRoundingRuntime() { return source.getRounding?.() || { mode: "none", precision: 2 }; },
      get openProductCtx() { return productContext; },
      set openProductCtx(value) { productContext = value; },
      getProductPassport: getPassport,
      ensureProduct: async id => { if (!getProduct(id)) await fetchPassports([id]); return getProduct(id); },
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
      if (options.mode === "admin-order") target.classList.add("shared-product-details-root--admin-order");
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
    mount, prepare, ensureDetails, preload: ensureDetails,
    prefetch: fetchPassports, getSummaries,
    getPassport: async id => { await fetchPassports([id]); return getPassport(id); },
    createCatalogSurface: host => createSurface(host, "shared-product-catalog"),
    createCard: (product, context) => getRuntime().createCatalogProductCard(product, context),
    createComboCard: (combo, context) => getRuntime().createCatalogComboCard(combo, context),
    syncCard: (card, product, qty, context) => getRuntime().applyCardState(card, product, qty, null, context),
  });
})();
