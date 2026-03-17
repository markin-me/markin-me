  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isShopPage = () => document.body && document.body.classList.contains("page-shop");

  // Custom select component
  function initCustomSelect(wrapEl, selectedValue) {
    if (!wrapEl || !wrapEl.classList.contains("custom-select")) return;
    const trigger = wrapEl.querySelector(".custom-select-trigger");
    const valueEl = wrapEl.querySelector(".custom-select-value");
    const dropdown = wrapEl.querySelector(".custom-select-dropdown");
    if (!trigger || !valueEl || !dropdown) return;

    const stores = window._pickupStores || [];
    const cities = [...new Set(stores.map(s => s.city).filter(Boolean))].sort();
    const placeholder = str(
      wrapEl.dataset.placeholder
      || trigger.getAttribute("aria-label")
      || "Выберите"
    ).trim() || "Выберите";
    const current = (selectedValue && cities.includes(selectedValue)) ? selectedValue : (cities[0] || "");

    wrapEl.dataset.value = current;
    valueEl.textContent = current || placeholder;
    valueEl.classList.toggle("is-placeholder", !current);
    dropdown.innerHTML = "";

    cities.forEach(c => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "custom-select-option" + (c === current ? " is-selected" : "");
      opt.textContent = c;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        wrapEl.dataset.value = c;
        valueEl.textContent = c;
        valueEl.classList.remove("is-placeholder");
        dropdown.querySelectorAll(".custom-select-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
        wrapEl.dispatchEvent(new Event("change"));
      });
      dropdown.appendChild(opt);
    });

    // toggle
    trigger.onclick = (e) => {
      e.stopPropagation();
      const open = !dropdown.classList.contains("hidden");
      if (open) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      } else {
        dropdown.classList.remove("hidden");
        wrapEl.classList.add("is-open");
      }
    };

    // close on outside click
    const closeHandler = (e) => {
      if (!wrapEl.contains(e.target)) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      }
    };
    document.removeEventListener("click", wrapEl._csClose);
    wrapEl._csClose = closeHandler;
    document.addEventListener("click", closeHandler);
  }

  function initPickupCitySelector() {
    if (!elPickupCitySelector || !elPickupCityChip || !elPickupCityDropdown) return;

    const stores = window._pickupStores || [];
    const cities = [...new Set(stores.map(s => s.city).filter(Boolean))].sort();

    elPickupCitySelector.classList.remove("hidden");

    // Update chip text
    const updateChipText = () => {
      const text = state._selectedPickupCity || "Все города";
      const textEl = elPickupCityChip.querySelector(".chip-city-text");
      if (textEl) textEl.textContent = text;

    };

    // Render options
    elPickupCityDropdown.innerHTML = "";

    // Option "All cities"
    const allOption = document.createElement("button");
    allOption.type = "button";
    allOption.className = "chip-city-option" + (!state._selectedPickupCity ? " is-selected" : "");
    allOption.textContent = "Все города";
    allOption.addEventListener("click", (e) => {
      e.stopPropagation();
      state._selectedPickupCity = null;
      updateChipText();
      elPickupCityDropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
      allOption.classList.add("is-selected");
      elPickupCityDropdown.classList.add("hidden");
      elPickupCityChip.classList.remove("is-open");
      renderAddressPickupList();
    });
    elPickupCityDropdown.appendChild(allOption);

    // City options
    cities.forEach(city => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "chip-city-option" + (city === state._selectedPickupCity ? " is-selected" : "");
      opt.textContent = city;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        state._selectedPickupCity = city;
        updateChipText();
        elPickupCityDropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
        renderAddressPickupList();
      });
      elPickupCityDropdown.appendChild(opt);
    });

    updateChipText();

    // Toggle dropdown
    elPickupCityChip.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !elPickupCityDropdown.classList.contains("hidden");
      if (isOpen) {
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
      } else {
        elPickupCityDropdown.classList.remove("hidden");
        elPickupCityChip.classList.add("is-open");
      }
    };

    // Close on outside click
    const closeHandler = (e) => {
      if (!elPickupCitySelector.contains(e.target)) {
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
      }
    };
    document.removeEventListener("click", elPickupCitySelector._closeHandler);
    elPickupCitySelector._closeHandler = closeHandler;
    document.addEventListener("click", closeHandler);
  }

  const getShopBasePath = () => {
    const pathname = String(window.location.pathname || "");
    return pathname.startsWith("/shop") ? "/shop" : "/";
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const elCatsList =
    $("#shopCategoriesList") ||
    $("#shopCatsList") ||
    $("[data-shop-categories]");

  const elProductsGrid =
    $("#shopProductsGrid") ||
    $("#shopProductsList") ||
    $("[data-shop-products]");
  const elProductsScroller = document.querySelector(".shop-products-panel .panel-body");

  const elCategoryTitle =
    $("#shopCategoryTitle") ||
    $("#shopToolbarTitle") ||
    $("[data-shop-category-title]");
  const elCatChipsWrap = $("#shopCatChipsWrap");
  const elCatChips = $("#shopCatChips");

  const elCartList =
    $("#shopCartList") ||
    $("#shopCartItems") ||
    $("[data-shop-cart]");

  const elCartContent = $("#shopCartContent");
  const elCartHeaderTitle = $("#shopCartHeaderTitle");
  const elCartBackBtn = $("#shopCartBackBtn");
  const elCartHeaderModeWrap = $("#shopCartHeaderModeWrap");

  // address (right cart panel)
  const elAddressChip = $("#shopAddressChip");
  const elAddressContent = $("#shopAddressContent");
  const elAddressListView = $("#shopAddressListView");
  const elAddressFormView = $("#shopAddressFormView");
  const elAddressList = $("#shopAddressList");
  const elAddressPickupList = $("#shopAddressPickupList");
  const elAddressListTitle = $("#shopAddressListTitle");
  const elAddressConfirmBtn = $("#shopAddressConfirmBtn");
  const elAddressToggleDeliveryBtn = $("#shopAddressToggleDelivery");
  const elAddressTogglePickupBtn = $("#shopAddressTogglePickup");
  const elPickupListTop = $("#shopPickupListTop");
  const elPickupCitySelector = $("#shopPickupCitySelector");
  const elPickupCityChip = $("#shopPickupCityChip");
  const elPickupCityDropdown = $("#shopPickupCityDropdown");

  const elAddressNewBtn = $("#shopAddressNewBtn");
  const elAddressSaveBtn = $("#shopAddressSaveBtn");
  const elAddressCancelBtn = $("#shopAddressCancelBtn");

  // pickup store (right cart panel)
  const elPickupContent = $("#shopPickupContent");
  const elPickupListView = $("#shopPickupListView");
  const elPickupList = $("#shopPickupList");

  const elAddrCity = $("#shopAddrCity");
  const elAddrLookupWrap = $("#shopAddrLookupWrap");
  const elAddrLookup = $("#shopAddrLookup");
  const elAddrLookupPopover = $("#shopAddrLookupPopover");
  const elAddrLookupStatus = $("#shopAddrLookupStatus");
  const elAddrLookupResults = $("#shopAddrLookupResults");
  const elAddrStreet = $("#shopAddrStreet");
  const elAddrHouse = $("#shopAddrHouse");
  const elAddrEntrance = $("#shopAddrEntrance");
  const elAddrFloor = $("#shopAddrFloor");
  const elAddrApartment = $("#shopAddrApartment");
  const elAddrComment = $("#shopAddrComment");

  const elCartTotal =
    $("#shopCartTotal") ||
    $("[data-shop-cart-total]");

  const elCartEmpty =
    $("#shopCartEmpty") ||
    $("[data-shop-cart-empty]");

  const elProductsEmpty =
    $("#shopProductsEmpty") ||
    $("#shopEmptyState") ||
    $("[data-shop-products-empty]");

  const elNavCategories = $("#shopNavCategories");
  const elNavMenu = $("#shopNavMenu");
  const elNavCart = $("#shopNavCart");
  const elNavProfile = $("#shopNavProfile");
  const elNavFav = $("#shopNavFav");

  const elNavCartBadge = $("#shopNavCartBadge") || $("#shopCartBadge");
  const elCartOpenDesktop = $("#shopCartOpenDesktopBtn");

  // header profile (? header.ejs ???? id)
  const elHeaderFavoritesBtn = $("#shopHeaderFavBtn");
  const elHeaderProfileBtn = $("#shopProfileBtn");
  const elCompanyChatOpenBtn = $("#shopCompanyChatOpenBtn");
  const elActiveOrdersBadge = $("#shopActiveOrdersBadge");
  const elActiveOrdersBadgeMobile = $("#shopActiveOrdersBadgeMobile");
  const elActiveOrdersSheetCollapsed = $("#shopActiveOrdersSheetCollapsed");
  
  // ????????? ?????? ?????????? ? ???????
  const elMobileProductActions = $("#shopMobileProductActions");
  const elMobileQtyWrap = $("#shopMobileQtyWrap");
  const elMobileAddToCartBtn = $("#shopMobileAddToCartBtn");
  const elMobileProductPrice = $("#shopMobileProductPrice");
  const elMobileProductLabel = $("#shopMobileProductLabel");
  
  // ????????? ?????? ???????
  const elMobileCartActions = $("#shopMobileCartActions");
  const elMobileCartActionsCart = $("#shopMobileCartActionsCart");
  const elMobileCartActionsCheckout = $("#shopMobileCartActionsCheckout");
  const elMobileCartClearBtn = $("#shopMobileCartClearBtn");
  const elMobileCheckoutBtn = $("#shopMobileCheckoutBtn");
  const elMobileCartTotal = $("#shopMobileCartTotal");
  const elMobileDeliveryProgressWrap = $("#shopMobileDeliveryProgressWrap");
  const elMobileDeliveryProgressFill = $("#shopMobileDeliveryProgressFill");
  const elMobileDeliveryProgressLabel = $("#shopMobileDeliveryProgressLabel");
  const elMobileDeliveryProgressBar = document.querySelector(".shop-mobile-delivery-progress-bar");
  const elMobileCheckoutBackBtn = $("#shopMobileCheckoutBackBtn");
  const elMobileCheckoutSubmitBtn = $("#shopMobileCheckoutSubmitBtn");
  const elMobileOrderDetailsActions = $("#shopMobileOrderDetailsActions");
  const elMobileOrderRepeatBtn = $("#shopMobileOrderRepeatBtn");
  const elMobileOrderTotalBtn = $("#shopMobileOrderTotalBtn");
  const elMobileOrderTotalValue = $("#shopMobileOrderTotalValue");
  const elMobileAddressActions = $("#shopMobileAddressActions");
  const elMobileAddressSaveBtn = $("#shopMobileAddressSaveBtn");
  const elMobileAddressCancelBtn = $("#shopMobileAddressCancelBtn");
  const elMobileAddressConfirm = $("#shopMobileAddressConfirm");
  
  // ????????? ????????? ??????
  let mobileProductActionsState = {
    qtyPill: null,
    onQtyMinus: null,
    onQtyPlus: null,
    onAddToCart: null,
  };

  // desktop cart footer
  const elCartFooter = $("#shopCartFooter");
  const elCartFooterActions = $("#shopCartFooterActions");
  const elDesktopDeliveryProgressWrap = $("#shopCartDeliveryProgress");
  const elDesktopDeliveryProgressFill = $("#shopCartDeliveryProgressFill");
  const elDesktopDeliveryProgressLabel = $("#shopCartDeliveryProgressLabel");
  const elCheckoutFooterActions = $("#shopCheckoutFooterActions");
  const elOrderDetailsFooterActions = $("#shopOrderDetailsFooterActions");
  const elOrderDetailsRepeatBtn = $("#shopOrderDetailsRepeatBtn");
  const elOrderDetailsTotalBtn = $("#shopOrderDetailsTotalBtn");
  const elOrderDetailsTotalValue = $("#shopOrderDetailsTotalValue");
  const elCheckoutBtn = $("#shopCheckoutBtn");
  const elCartClearBtn = $("#shopCartClearBtn");
  const elCheckoutBackBtn = $("#shopCheckoutBackBtn");
  const elCheckoutSubmitBtn = $("#shopCheckoutSubmitBtn");
  const elCheckoutContent = $("#shopCheckoutContent");
  const elProfileContent = $("#shopProfileContent");
  const elProductContent = $("#shopProductContent");
  const elProfileHeaderActions = $("#shopProfileHeaderActions");
  const elProfileCloseBtn = $("#shopProfileCloseBtn");
  const elProfileSettingsBtn = $("#shopProfileSettingsBtn");
  const elProfileMenu = $("#shopProfileMenu");
  const elProfileEditBtn = $("#shopProfileEditBtn");
  const elProfileLogoutBtn = $("#shopProfileLogoutBtn");

  const __shopHasRequiredDom = !!(elProductsGrid && elCatsList);

  // -----------------------------
  // Tenant
  // -----------------------------
  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return n;
    }
    try {
      const u = new URL(window.location.href);
      const q = Number(u.searchParams.get("tenant_id"));
      if (Number.isFinite(q) && q > 0) return q;
    } catch {}
    return 1;
  }

  function getActiveStoreId() {
    const stored = localStorage.getItem("activeStoreId");
    const n = Number(stored);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  const tenantId = getTenantId();
  const CART_KEY = `shop_cart_t${tenantId}`;
  const FAV_KEY = `shop_fav_t${tenantId}`;
  const LAST_ORDER_KEY = `shop_last_order_public_t${tenantId}`;
  const CHECKOUT_DRAFT_KEY = `shop_checkout_draft_t${tenantId}`;
  const ADDRESS_DRAFT_KEY = `shop_address_draft_t${tenantId}`;
  const AUTO_ADD_DISMISSED_KEY = `shop_auto_add_dismissed_t${tenantId}_s${getActiveStoreId()}`;
  const CATALOG_SNAPSHOT_VERSION = 1;
  const CATALOG_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const CATALOG_SNAPSHOT_KEY = `shop_catalog_snapshot_v${CATALOG_SNAPSHOT_VERSION}_t${tenantId}_s${getActiveStoreId()}`;

  const CUSTOMER_TOKEN_KEY = `shop_customer_token_t${tenantId}`;
  const CUSTOMER_CACHE_KEY = `shop_customer_cache_t${tenantId}`;
  let meBootstrapPromise = null;
  let meBootstrapToken = "";
  let meBootstrapLoaded = false;

  // -----------------------------
  // Format helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  function getTenantFromStorage() {
    try {
      const t = localStorage.getItem("tenant");
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  }

  function isAddressMapModeEnabled() {
    const tenant = getTenantFromStorage();
    if (tenant && Object.prototype.hasOwnProperty.call(tenant, "store_address_map_enabled")) {
      return Boolean(tenant.store_address_map_enabled);
    }
    return Boolean(window.__shopOrderConfig && window.__shopOrderConfig.storeAddressMapEnabled);
  }

  function getPriceRoundingSettings() {
    const tenant = getTenantFromStorage();
    const modeRaw = tenant?.price_rounding_mode;
    const mode = typeof modeRaw === "string" ? modeRaw : "none";
    const allowed = new Set(["none", "down", "up", "nearest"]);
    const safeMode = allowed.has(mode) ? mode : "none";
    const precisionRaw = Number(tenant?.price_rounding_precision);
    const precision = precisionRaw === 0 ? 0 : 2;
    return { mode: safeMode, precision };
  }

  function roundPrice(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const { mode, precision } = getPriceRoundingSettings();
    if (!mode || mode === "none") return n;
    const factor = precision > 0 ? Math.pow(10, precision) : 1;
    if (mode === "up") return Math.ceil(n * factor) / factor;
    if (mode === "down") return Math.floor(n * factor) / factor;
    return Math.round(n * factor) / factor;
  }

  function money(v) {
    const n = roundPrice(Number(v || 0));
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function moneyNoSign(v) {
    const n = roundPrice(Number(v || 0));
    return moneyFmt.format(Number.isFinite(n) ? n : 0);
  }

  function str(v) {
    return v === undefined || v === null ? "" : String(v);
  }

  function toFiniteNumberOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  // -----------------------------
  // Adaptive Image Optimization
  // -----------------------------
  /**
   * ?????????? URL ??? ?????? ???????? ??????????? (??В корзине пусто???? WebP/AVIF)
   * @param {string} imageUrl - ???????? URL ???????????
   * @param {string} format - ??????: 'webp' | 'avif' | 'original'
   * @returns {string}
   */
  function getImageUrlForFormat(imageUrl, format = 'original') {
    if (!imageUrl || imageUrl === '/static/img/placeholder.png') return imageUrl;

    // ??????? URL ?? ???????
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

    if (format === 'original') return imageUrl;

    // WebP: ??????????? ?????? ???? URL ??? .webp (???? ????? ????).
    // ??? ?????? .jpg/.png ?? ??????????? .webp ? ?????? ??? ???, ????? 404.
    if (format === 'webp') {
      if (imageUrl.endsWith('.webp')) return imageUrl;
      return imageUrl;
    }

    // AVIF ???? ?? ???????????? ? ?????????? ????????
    if (format === 'avif') {
      return imageUrl;
    }

    return imageUrl;
  }

  /**
   * ??????? ???????????????? ??????????? ??? ?????? ????????? (???ka ???????, ??????? ? ?.?.)
   * @param {string} imageUrl - URL ????????? ???????????
   * @param {Object} options - ????????? ???????
   * @param {string} options.type - ??? ?????????????: 'product-grid' | 'product-hero' | 'cart-thumb' | 'thumb' | 'custom'
   * @param {string} options.sizes - ??????? sizes (??? type='custom')
   * @param {string} options.srcset - ????????? srcset (???? ????? ?????????????? ??????????????)
   * @param {boolean} options.usePicture - ???????????? ?? picture ? WebP/AVIF (?? ????????? false)
   * @param {string} options.alt - alt??????
   * @param {string} options.className - CSS??????
   * @param {boolean} options.priority - ??????? ????????? ???????? (hero / ?????? ????????)
   * @returns {HTMLImageElement|HTMLPictureElement}
   */
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
    const cachedTemplate = getOptimizedImageTemplate(cacheKey);
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
      setOptimizedImageTemplate(cacheKey, picture);
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

    setOptimizedImageTemplate(cacheKey, img);
    return img.cloneNode(true);
  }

  const optimizedImageTemplateCache = new Map();
  const OPTIMIZED_IMAGE_TEMPLATE_LIMIT = 300;

  function getOptimizedImageTemplate(key) {
    const cacheKey = String(key || "");
    if (!cacheKey || !optimizedImageTemplateCache.has(cacheKey)) return null;
    const node = optimizedImageTemplateCache.get(cacheKey);
    optimizedImageTemplateCache.delete(cacheKey);
    optimizedImageTemplateCache.set(cacheKey, node);
    return node.cloneNode(true);
  }

  function setOptimizedImageTemplate(key, node) {
    const cacheKey = String(key || "");
    if (!cacheKey || !node || !node.cloneNode) return;
    if (optimizedImageTemplateCache.has(cacheKey)) {
      optimizedImageTemplateCache.delete(cacheKey);
    }
    optimizedImageTemplateCache.set(cacheKey, node.cloneNode(true));
    while (optimizedImageTemplateCache.size > OPTIMIZED_IMAGE_TEMPLATE_LIMIT) {
      const oldestKey = optimizedImageTemplateCache.keys().next().value;
      if (!oldestKey) break;
      optimizedImageTemplateCache.delete(oldestKey);
    }
  }

  const preloadedImages = new Set();
  function preloadImageOnce(url, opts = {}) {
    if (!url || preloadedImages.has(url)) return;
    preloadedImages.add(url);
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

  function prioritizeAboveFoldCardImages(maxCards = 16, extraPx = 200) {
    try {
      if (!elProductsGrid) return;
      const cards = Array.from(elProductsGrid.querySelectorAll(".sp-card"));
      let taken = 0;
      for (const card of cards) {
        if (taken >= maxCards) break;
        const r = card.getBoundingClientRect();
        if (r.bottom < -extraPx) continue;
        if (r.top > (window.innerHeight || 0) + extraPx) break;
        const imgs = card.querySelectorAll("img.sp-img-lqip, img.sp-img-full");
        imgs.forEach((img) => {
          try { img.loading = "eager"; } catch {}
          try { img.decoding = "async"; } catch {}
          try { if ("fetchPriority" in img) img.fetchPriority = "high"; } catch {}
          const url = img.currentSrc || img.src || img.getAttribute("src");
          preloadImageOnce(url, { fetchPriority: "high" });
        });
        taken += 1;
      }
    } catch {}
  }

  function looksLikeUrl(s) {
    if (!s) return false;
    const v = String(s);
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("/static/") ||
      v.startsWith("/uploads/") ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(v)
    );
  }

  function runWhenIdle(fn, timeout = 2500) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout });
      return;
    }
    setTimeout(fn, timeout);
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

  function normalizePhone(v) {
    const s = String(v || "").trim();
    const digits = s.replace(/[^\d]/g, "");
    if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
      return "7" + digits.slice(1);
    }
    return digits;
  }

  function formatPhonePlus7(raw) {
    const d = normalizePhone(raw);
    if (!d) return "+7";
    // d = 7XXXXXXXXXX
    if (d.length === 11 && d.startsWith("7")) {
      const p1 = d.slice(1, 4);
      const p2 = d.slice(4, 7);
      const p3 = d.slice(7, 9);
      const p4 = d.slice(9, 11);
      return `+7 (${p1}) ${p2}-${p3}-${p4}`;
    }
    return raw;
  }

  function formatBirthdayDisplay(raw) {
    const v = str(raw || "").trim();
    if (!v) return "?";
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    return v;
  }

  // -----------------------------
  // Customer token/cache
  // -----------------------------
  function getCustomerToken() {
    try { return localStorage.getItem(CUSTOMER_TOKEN_KEY) || ""; } catch { return ""; }
  }
  function setCustomerToken(t) {
    try {
      if (!t) localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      else localStorage.setItem(CUSTOMER_TOKEN_KEY, String(t));
    } catch {}
  }
  function setCustomerCache(c) {
    try {
      if (!c) localStorage.removeItem(CUSTOMER_CACHE_KEY);
      else localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(c));
    } catch {}
  }
  function getCustomerCache() {
    try {
      const raw = localStorage.getItem(CUSTOMER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function clearCustomer() {
    setCustomerToken("");
    setCustomerCache(null);
    resetFavoritesCache();
    meBootstrapPromise = null;
    meBootstrapToken = "";
    meBootstrapLoaded = false;
  }

  // -----------------------------
  // API
  // -----------------------------
  async function apiJson(url, opts = {}) {
    const token = getCustomerToken();
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": String(getActiveStoreId()),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-customer-token": token } : {}),
      ...(opts.headers || {}),
    };

    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) {
      const err = json?.error || `API_ERROR (${res.status})`;
      const e = new Error(err);
      e.httpStatus = res.status;
      e.payload = json || null;
      throw e;
    }
    return json;
  }

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    categories: [],
    activeCategoryId: null,
    activeCategoryTitle: "Каталог",
    productsByCategory: new Map(),
    combosByCategory: new Map(),
    productCache: new Map(),
    stockLevels: new Map(),
    cart: loadCart(),
    optionGroupCache: new Map(),
    productOptionsCache: new Map(),
    unitConversions: [],
    autoAdd: {
      groups: [],
      items: [],
      byProductId: new Map(),
      byGroupId: new Map(),
    },
    autoAddDismissed: loadAutoAddDismissed(),

    // addresses (cart header chip)
    addresses: [],
    selectedAddress: null,
    addressEditingId: null,
    _addressFormResolved: null,
    _addressFormBackMode: null,
    _addressListBackMode: null,
    _addressListMode: "delivery",
    _addressPendingAddress: null,
    _addressPendingPickupStoreId: null,
    _selectedPickupCity: null,
  };
  const addressLookupState = {
    open: false,
    items: [],
    activeIndex: -1,
    status: "",
    mode: "idle",
    requestSeq: 0,
    debounceTimer: null,
  };
  let mobileUiState = {
    isMobile: false,
    tab: "menu",
    panel: "menu",
    footerMode: "nav",
    cartViewMode: "cart",
    sheet: {
      open: false,
      type: null,
      screen: null,
    },
    lastReason: "init",
    lastUpdatedAt: Date.now(),
  };
  let mobileUiStateSyncQueued = false;
  let mobileUiStateQueuedReason = "";
  let openCartSheetCtx = null;
  let categoryHeaders = [];
  let isProgrammaticCategoryScroll = false;
  let categoryScrollRaf = null;
  const STOCK_SYNC_INTERVAL_MS = 120000;
  let stockEventsSource = null;
  let stockEventsStoreId = null;
  let stockEventsReconnectTimer = null;
  let stockEventsWaitLoopStarted = false;
  let stockEventsWaitLoopToken = 0;
  let stockEventsWaitSupported = true;
  let stockEventsCursor = 0;
  let stockEventsWaitAbortController = null;
  let stockRefreshDebounceTimer = null;
  let stockRefreshInFlight = false;
  let stockRefreshPending = false;
  let stockSyncIntervalHandle = null;
  let stockSyncWakeupBound = false;
  let autoAddLoadPromise = null;
  let autoAddLoaded = false;
  let upsellLoadPromise = null;
  let upsellLoaded = false;
  let cartEnhancersPreloadPromise = null;
  let cartEnhancersRefreshPromise = null;
  let cartEnhancersLastRefreshSignature = "";
  const upsellDefaultConfigCache = new Map();
  let upsellConfigObserver = null;
  let upsellConfigObserverRoot = null;
  let upsellConfigBatchTimer = null;
  const upsellConfigBatchPendingIds = new Set();
  let cartUiRevision = 1;
  let cartUiRenderedRevision = 0;

  function markCartUiDirty() {
    cartUiRevision += 1;
  }

  function normalizeStockQty(rawQty) {
    if (rawQty === undefined) return undefined;
    if (rawQty === null || rawQty === "") return null;
    const n = Number(rawQty);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 1000;
  }

  function toStockBool(rawValue, fallback = undefined) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
    if (typeof rawValue === "boolean") return rawValue;
    const n = Number(rawValue);
    if (Number.isFinite(n)) return n !== 0;
    const text = String(rawValue).trim().toLowerCase();
    if (!text) return fallback;
    if (text === "true" || text === "yes" || text === "on") return true;
    if (text === "false" || text === "no" || text === "off") return false;
    return fallback;
  }

  function getStockLevelEntry(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    if (!(state.stockLevels instanceof Map)) state.stockLevels = new Map();
    return state.stockLevels.get(pid) || null;
  }

  function upsertStockLevelRow(rawRow, source = "unknown") {
    if (!rawRow || typeof rawRow !== "object") return false;
    const pid = Number(
      rawRow.productId ||
      rawRow.product_id ||
      rawRow.id ||
      rawRow.product_id_num ||
      0
    );
    if (!Number.isFinite(pid) || pid <= 0) return false;

    const prev = getStockLevelEntry(pid) || {};
    const next = { ...prev, productId: pid };

    let qtyRaw = undefined;
    if (Object.prototype.hasOwnProperty.call(rawRow, "qty")) qtyRaw = rawRow.qty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "availableQty")) qtyRaw = rawRow.availableQty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "available_qty")) qtyRaw = rawRow.available_qty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "stock_qty")) qtyRaw = rawRow.stock_qty;
    const qty = normalizeStockQty(qtyRaw);
    const hasQty = qty !== undefined;

    if (hasQty) {
      next.qty = qty;
      next.isUnlimited = qty === null;
    }

    const requiredQty = normalizeStockQty(
      rawRow.requiredQty !== undefined ? rawRow.requiredQty : rawRow.required_qty
    );
    if (requiredQty !== undefined) next.requiredQty = requiredQty;

    const remainingQty = normalizeStockQty(
      rawRow.remainingQty !== undefined ? rawRow.remainingQty : rawRow.remaining_qty
    );
    if (remainingQty !== undefined) next.remainingQty = remainingQty;

    const explicitUnlimited = toStockBool(
      rawRow.isUnlimited !== undefined ? rawRow.isUnlimited : rawRow.is_unlimited,
      undefined
    );
    if (explicitUnlimited !== undefined) next.isUnlimited = explicitUnlimited;

    const explicitAvailable = toStockBool(
      rawRow.isAvailable !== undefined ? rawRow.isAvailable : (rawRow.is_available !== undefined ? rawRow.is_available : rawRow.available),
      undefined
    );
    if (hasQty && qty === null) {
      // null stock means unlimited availability regardless of explicit flags
      next.isUnlimited = true;
      next.isAvailable = true;
      next.canFulfill = true;
    } else if (explicitAvailable !== undefined) {
      next.isAvailable = explicitAvailable;
    } else if (hasQty) {
      next.isAvailable = qty > 0;
    }

    const explicitCanFulfill = toStockBool(
      rawRow.canFulfill !== undefined ? rawRow.canFulfill : rawRow.can_fulfill,
      undefined
    );
    if (explicitCanFulfill !== undefined) {
      next.canFulfill = explicitCanFulfill;
    } else if (requiredQty !== undefined && hasQty && qty !== null) {
      next.canFulfill = qty + 1e-9 >= Number(requiredQty || 0);
    } else if (hasQty && qty === null) {
      next.canFulfill = true;
    }

    const productNameRaw =
      rawRow.productName !== undefined ? rawRow.productName : rawRow.product_name;
    if (productNameRaw !== undefined && productNameRaw !== null) {
      next.productName = String(productNameRaw || "").trim();
    }

    next.updatedAt = Date.now();
    next.source = String(source || "unknown");

    const changed =
      prev.qty !== next.qty ||
      prev.requiredQty !== next.requiredQty ||
      prev.remainingQty !== next.remainingQty ||
      prev.isUnlimited !== next.isUnlimited ||
      prev.isAvailable !== next.isAvailable ||
      prev.canFulfill !== next.canFulfill ||
      prev.productName !== next.productName;

    if (!(state.stockLevels instanceof Map)) state.stockLevels = new Map();
    state.stockLevels.set(pid, next);

    const cachedProduct = state.productCache.get(pid);
    if (cachedProduct && hasQty) {
      cachedProduct.stock_qty = qty;
    }

    return changed;
  }

  function mergeStockLevels(rows, source = "unknown") {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return false;
    let changed = false;
    list.forEach((row) => {
      if (upsertStockLevelRow(row, source)) changed = true;
    });
    return changed;
  }

  function extractStockLevelsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.stock_levels)) return payload.stock_levels;
    if (Array.isArray(payload.stockLevels)) return payload.stockLevels;
    return [];
  }

  function cacheStockFromProductPayload(product, source = "product_payload") {
    const pid = Number(product?.id || product?.product_id || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    const row = { productId: pid };
    if (Object.prototype.hasOwnProperty.call(product || {}, "stock_qty")) {
      row.qty = product.stock_qty;
    }
    if (product?.is_available !== undefined && product?.is_available !== null) {
      row.isAvailable = Number(product.is_available) === 1 || product.is_available === true;
    }
    return upsertStockLevelRow(row, source);
  }

  function extractStockEventProductIds(event) {
    const raw = String(event?.data || "").trim();
    if (!raw) return [];
    try {
      const payload = JSON.parse(raw);
      const ids = Array.isArray(payload?.product_ids) ? payload.product_ids : [];
      return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    } catch {
      return [];
    }
  }

  function closeStockEventsSource() {
    if (stockEventsSource) {
      try { stockEventsSource.close(); } catch {}
    }
    stockEventsSource = null;
    stockEventsStoreId = null;
  }

  function queueStockAvailabilityRefresh(reason = "stock_sync", delayMs = 250) {
    const delay = Math.max(0, Number(delayMs || 0));
    if (stockRefreshDebounceTimer) clearTimeout(stockRefreshDebounceTimer);
    stockRefreshDebounceTimer = setTimeout(() => {
      stockRefreshDebounceTimer = null;
      void refreshAvailabilityAfterStockChange(reason);
    }, delay);
  }

  async function refreshAvailabilityAfterStockChange(reason = "stock_sync") {
    if (stockRefreshInFlight) {
      stockRefreshPending = true;
      return;
    }
    stockRefreshInFlight = true;
    try {
      const openedProductId = Number(openProductCtx?.productId || 0);
      if (Number.isFinite(openedProductId) && openedProductId > 0) {
        try {
          const json = await apiJson(`/api/public/products/${openedProductId}`);
          const product = json?.data || null;
          if (product) {
            if (!Array.isArray(product.photos)) product.photos = safePhotos(product);
            cacheStockFromProductPayload(product, "product_refresh_opened");
            product.is_available = isProductAvailable(product);
            state.productCache.set(openedProductId, product);
          }
        } catch {}

      }

      await warmupCartProducts();
      pruneUnavailableCartItems();
    } catch (e) {
      console.warn("Stock sync refresh failed:", reason, e);
    } finally {
      stockRefreshInFlight = false;
      if (stockRefreshPending) {
        stockRefreshPending = false;
        queueStockAvailabilityRefresh("stock_sync_pending", 100);
      }
    }
  }

  function ensurePublicStockEventsConnection() {
    const currentStoreId = Number(getActiveStoreId() || 0) || 1;
    stockEventsStoreId = currentStoreId;
    startPublicStockEventsWaitLoop();
  }

  async function waitForPublicStockEventsChange() {
    if (!stockEventsWaitSupported) {
      return { changed: false, cursor: Number(stockEventsCursor || 0) || 0 };
    }
    const qs = new URLSearchParams({
      since: String(Number(stockEventsCursor || 0) || 0),
      timeout_ms: "20000",
      _ts: String(Date.now()),
    });
    const controller = new AbortController();
    stockEventsWaitAbortController = controller;
    try {
      const json = await apiJson(`/api/public/changes/wait?${qs.toString()}`, { signal: controller.signal });
      const data = json?.data || {};
      const nextCursor = Number(data.cursor || 0);
      return {
        changed: data.changed === true,
        cursor: Number.isFinite(nextCursor) && nextCursor >= 0 ? nextCursor : Number(stockEventsCursor || 0) || 0,
      };
    } finally {
      if (stockEventsWaitAbortController === controller) {
        stockEventsWaitAbortController = null;
      }
    }
  }

  async function fetchPublicStockEventsSince(sinceCursor) {
    const since = Number(sinceCursor || 0);
    const qs = new URLSearchParams({
      since: String(Number.isFinite(since) && since > 0 ? since : 0),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`/api/public/changes?${qs.toString()}`);
    const events = Array.isArray(json?.data) ? json.data : [];
    return events;
  }

  async function applyStockChangedEvent(evtData) {
    const data = evtData && typeof evtData === "object" ? evtData : {};
    const stockLevels = extractStockLevelsFromPayload(data);
    if (stockLevels.length) {
      mergeStockLevels(stockLevels, "stock_event");
      pruneUnavailableCartItems();
      return;
    }

    const productIds = Array.isArray(data.product_ids)
      ? data.product_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!productIds.length) return;
    await refreshProductsByIds(productIds);
    pruneUnavailableCartItems();
  }

  function startPublicStockEventsWaitLoop() {
    if (stockEventsWaitLoopStarted) return;
    stockEventsWaitLoopStarted = true;
    stockEventsWaitLoopToken += 1;
    const token = stockEventsWaitLoopToken;

    (async function runWaitLoop() {
      while (stockEventsWaitLoopStarted && token === stockEventsWaitLoopToken) {
        if (!getCustomerToken()) {
          stockEventsCursor = 0;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        if (!stockEventsWaitSupported) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        try {
          const prevCursor = Number(stockEventsCursor || 0) || 0;
          const waited = await waitForPublicStockEventsChange();
          if (!stockEventsWaitLoopStarted || token !== stockEventsWaitLoopToken) break;
          stockEventsCursor = Number(waited.cursor || stockEventsCursor || 0) || 0;
          if (!waited.changed) continue;

          const events = await fetchPublicStockEventsSince(prevCursor);
          for (const evt of events) {
            const eventName = String(evt?.event || "").toLowerCase();
            if (eventName !== "stock.changed") continue;
            await applyStockChangedEvent(evt?.data || {});
          }
        } catch (e) {
          if (e?.name === "AbortError") {
            continue;
          }
          const msg = String(e?.message || "");
          if (e?.httpStatus === 404 || e?.httpStatus === 405 || e?.httpStatus === 410 || msg === "EVENTS_UNAVAILABLE") {
            stockEventsWaitSupported = false;
          }
          if (e?.httpStatus === 401 || msg === "UNAUTHORIZED") {
            stockEventsCursor = 0;
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    })().catch(() => {});
  }

  function bindStockSyncWakeupHandlers() {
    if (stockSyncWakeupBound) return;
    stockSyncWakeupBound = true;

    const wakeup = () => {
      ensurePublicStockEventsConnection();
      queueStockAvailabilityRefresh("stock_sync_wakeup", 200);
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wakeup();
    });
    window.addEventListener("focus", wakeup, { passive: true });
    window.addEventListener("beforeunload", () => {
      closeStockEventsSource();
      if (stockEventsReconnectTimer) {
        clearTimeout(stockEventsReconnectTimer);
        stockEventsReconnectTimer = null;
      }
    });
    document.addEventListener("tenantStoreChanged", () => {
      stockEventsCursor = 0;
      stockEventsWaitSupported = true;
    });
  }

  function startStockSync() {
    ensurePublicStockEventsConnection();
    bindStockSyncWakeupHandlers();

    if (!stockSyncIntervalHandle) {
      stockSyncIntervalHandle = setInterval(() => {
        ensurePublicStockEventsConnection();
        queueStockAvailabilityRefresh("stock_sync_interval", 0);
      }, STOCK_SYNC_INTERVAL_MS);
    }
  }

  // -----------------------------
  // Categories helpers
  // -----------------------------
  function isAllCategory(cat) {
    return String(cat?.code || "").toLowerCase() === "all";
  }

  function getVisibleCategories() {
    return state.categories.filter((c) => !isAllCategory(c));
  }

  function updateCategoriesActiveUi() {
    $$(".shop-cat-item", elCatsList).forEach((x) => {
      const id = Number(x.getAttribute("data-cat-id"));
      x.classList.toggle("is-active", Number(state.activeCategoryId) === id);
    });

    if (elCatChips) {
      $$(".shop-cat-chip", elCatChips).forEach((x) => {
        const id = Number(x.getAttribute("data-cat-id"));
        x.classList.toggle("is-active", Number(state.activeCategoryId) === id);
      });
    }
  }
  
  function isMobileViewport() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function isVisibleNode(el) {
    return !!(el && !el.classList.contains("hidden"));
  }

  function getCurrentMobileTabFromDom() {
    const active = document.querySelector(".shop-nav-btn.is-active");
    if (!active) return null;
    const raw = String(active.getAttribute("data-tab") || "").trim().toLowerCase();
    if (raw === "menu" || raw === "categories" || raw === "cart" || raw === "fav" || raw === "profile") {
      return raw;
    }
    return null;
  }

  function resolveMobilePanelSnapshot(sheetOpen, sheetType, sheetScreen) {
    if (sheetOpen) {
      if (sheetType === "cart") {
        if (sheetScreen === "checkout") return "checkout";
        if (sheetScreen === "addressList" || sheetScreen === "pickupList") return "address-list";
        if (sheetScreen === "addressForm") return "address-form";
        if (sheetScreen === "product" || sheetScreen === "combo" || sheetScreen === "comboPicker") return "product";
        return "cart";
      }
      if (sheetType === "categories") return "categories";
      if (sheetType === "profile") return sheetScreen === "orderDetails" ? "profile-order-details" : "profile";
      if (sheetType === "favorites") return "favorites";
      if (sheetType === "activeOrders") return sheetScreen === "details" ? "active-orders-details" : "active-orders-list";
      return "sheet";
    }

    let mode = "";
    try {
      mode = String(cartViewMode || "");
    } catch {}

    if (mode === "checkout") return "checkout";
    if (mode === "address") {
      if (isVisibleNode(elAddressFormView)) return "address-form";
      return "address-list";
    }
    if (mode === "product") return "product";
    if (mode === "profile") return "profile";
    if (mode === "favorites") return "favorites";
    if (mode === "cart") return "cart";
    return "menu";
  }

  function resolveMobileFooterModeSnapshot() {
    if (isVisibleNode(elMobileProductActions)) return "product-actions";
    if (isVisibleNode(elMobileAddressActions)) return "address-actions";
    if (isVisibleNode(elMobileAddressConfirm)) return "address-confirm";
    if (isVisibleNode(elMobileOrderDetailsActions)) return "order-details-actions";
    if (isVisibleNode(elActiveOrdersSheetCollapsed)) return "active-orders-collapsed";
    if (isVisibleNode(elMobileCartActions)) {
      if (isVisibleNode(elMobileCartActionsCheckout)) return "checkout-actions";
      if (isVisibleNode(elMobileCartActionsCart)) return "cart-actions";
      return "cart-actions";
    }
    return "nav";
  }

  function resolveMobileFooterModeByPanel(panel, opts = {}) {
    const options = opts && typeof opts === "object" ? opts : {};
    const isCartSheetOpen = Boolean(options.sheetOpen) && String(options.sheetType || "") === "cart";
    const panelName = String(panel || "");
    if (panelName === "checkout") return isCartSheetOpen ? "checkout-actions" : "nav";
    if (panelName === "cart") {
      if (!isCartSheetOpen) return "nav";
      const resolvedItems = cartItemsResolved();
      const cartItemsCount = Array.isArray(resolvedItems) ? resolvedItems.length : 0;
      return cartItemsCount > 0 ? "cart-actions" : "nav";
    }
    if (panelName === "address-form") return "address-actions";
    if (panelName === "address-list") return "address-confirm";
    if (panelName === "product") return "product-actions";
    if (panelName === "profile-order-details") return "order-details-actions";
    if (
      panelName === "menu" ||
      panelName === "categories" ||
      panelName === "profile" ||
      panelName === "favorites" ||
      panelName === "active-orders-details" ||
      panelName === "active-orders-list" ||
      panelName === "sheet"
    ) {
      return "nav";
    }
    return null;
  }

  function renderMobileBottomByState(snapshot, reason = "renderMobileBottomByState") {
    const stateSnapshot = snapshot && typeof snapshot === "object" ? snapshot : window.getShopMobileUiState();
    const isMobile = Boolean(stateSnapshot && stateSnapshot.isMobile);
    if (!isMobile) return;

    const normalizeTab = (rawTab) => {
      const t = String(rawTab || "").toLowerCase();
      if (t === "menu" || t === "categories" || t === "cart" || t === "fav" || t === "profile") return t;
      return "menu";
    };

    const tab = normalizeTab(stateSnapshot.tab);
    const navMap = {
      menu: elNavMenu,
      categories: elNavCategories,
      cart: elNavCart,
      fav: elNavFav,
      profile: elNavProfile,
    };

    Object.keys(navMap).forEach((key) => {
      const btn = navMap[key];
      if (!btn) return;
      const active = key === tab;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    const modeRaw = String(stateSnapshot.footerMode || "nav");
    const sheetOpen = Boolean(stateSnapshot?.sheet?.open);
    const sheetType = String(stateSnapshot?.sheet?.type || "").trim();
    let mode = modeRaw || "nav";
    if ((mode === "cart-actions" || mode === "checkout-actions") && !(sheetOpen && sheetType === "cart")) {
      mode = "nav";
    }
    const setVisible = (el, visible) => {
      if (!el) return;
      el.classList.toggle("hidden", !visible);
    };

    const showProductActions = mode === "product-actions";
    const showCartActions = mode === "cart-actions" || mode === "checkout-actions";
    const showCartActionsCart = mode === "cart-actions";
    const showCartActionsCheckout = mode === "checkout-actions";
    const showAddressActions = mode === "address-actions";
    const showAddressConfirm = mode === "address-confirm";
    const showOrderDetailsActions = mode === "order-details-actions";
    const showActiveOrdersCollapsed = mode === "active-orders-collapsed";

    setVisible(elMobileProductActions, showProductActions);
    setVisible(elMobileCartActions, showCartActions);
    setVisible(elMobileCartActionsCart, showCartActionsCart);
    setVisible(elMobileCartActionsCheckout, showCartActionsCheckout);
    setVisible(elMobileAddressActions, showAddressActions);
    setVisible(elMobileAddressConfirm, showAddressConfirm);
    setVisible(elMobileOrderDetailsActions, showOrderDetailsActions);

    if (elActiveOrdersSheetCollapsed) {
      if (showActiveOrdersCollapsed) {
        elActiveOrdersSheetCollapsed.classList.remove("hidden");
      } else if (sheetOpen || mode !== "nav") {
        // Collapsed active-orders bar is only allowed on main nav when no sheet is open.
        elActiveOrdersSheetCollapsed.classList.add("hidden");
      }
    }

    if (mode === "cart-actions" || mode === "checkout-actions") {
      try {
        if (typeof updateMobileDeliveryProgress === "function") updateMobileDeliveryProgress();
      } catch {}
    }

    window.__shopMobileBottomRender = {
      reason: String(reason || "render"),
      mode,
      tab,
      ts: Date.now(),
    };
  }

  function emitMobileUiStateChange() {
    try {
      document.dispatchEvent(new CustomEvent("shop:mobile-ui-state-change", {
        detail: window.getShopMobileUiState(),
      }));
    } catch {}
  }

  function setMobileUiStateSnapshot(nextState, reason = "setMobileUiStateSnapshot", opts = {}) {
    const previous = mobileUiState;
    const next = {
      ...previous,
      ...(nextState || {}),
      sheet: {
        ...(previous.sheet || {}),
        ...((nextState && nextState.sheet) || {}),
      },
      lastReason: String(reason || "state-update"),
      lastUpdatedAt: Date.now(),
    };

    const changed =
      previous.isMobile !== next.isMobile ||
      previous.tab !== next.tab ||
      previous.panel !== next.panel ||
      previous.footerMode !== next.footerMode ||
      previous.cartViewMode !== next.cartViewMode ||
      (previous.sheet?.open !== next.sheet?.open) ||
      (previous.sheet?.type !== next.sheet?.type) ||
      (previous.sheet?.screen !== next.sheet?.screen);

    mobileUiState = next;
    window.__shopMobileUiState = next;
    if (changed && !opts.silent) emitMobileUiStateChange();
    return changed;
  }

  function syncMobileUiState(reason = "syncMobileUiState") {
    const isMobile = isMobileViewport();
    const sheetOpen = !!(window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen());
    const sheetType = String(sheetNavigationState?.type || "").trim() || null;
    const sheetScreen = String(sheetNavigationState?.screen || "").trim() || null;
    const panel = resolveMobilePanelSnapshot(sheetOpen, sheetType, sheetScreen);
    const footerMode = resolveMobileFooterModeByPanel(panel, {
      sheetOpen,
      sheetType,
      sheetScreen,
    }) || resolveMobileFooterModeSnapshot();
    const currentTab = getCurrentMobileTabFromDom();

    let cartModeSnapshot = "";
    try {
      cartModeSnapshot = String(cartViewMode || "");
    } catch {}

    let tab = currentTab || "menu";
    if (!currentTab) {
      if (panel === "categories") tab = "categories";
      else if (panel === "cart" || panel === "checkout") tab = "cart";
      else if (panel === "profile") tab = "profile";
      else if (panel === "favorites") tab = "fav";
      else tab = "menu";
    }

    return setMobileUiStateSnapshot(
      {
        isMobile,
        tab,
        panel,
        footerMode,
        cartViewMode: cartModeSnapshot || "cart",
        sheet: {
          open: sheetOpen,
          type: sheetType,
          screen: sheetScreen,
        },
      },
      reason
    );
  }

  function queueMobileUiStateSync(reason = "queueMobileUiStateSync") {
    mobileUiStateQueuedReason = String(reason || mobileUiStateQueuedReason || "queue");
    if (mobileUiStateSyncQueued) return;
    mobileUiStateSyncQueued = true;
    const flush = () => {
      mobileUiStateSyncQueued = false;
      const syncReason = mobileUiStateQueuedReason || "queued-sync";
      mobileUiStateQueuedReason = "";
      syncMobileUiState(syncReason);
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(flush);
      return;
    }
    setTimeout(flush, 0);
  }

  window.getShopMobileUiState = function getShopMobileUiState() {
    const snapshot = mobileUiState || {};
    return {
      ...snapshot,
      sheet: {
        ...(snapshot.sheet || {}),
      },
    };
  };
  window.syncShopMobileUiState = function syncShopMobileUiState(reason) {
    return syncMobileUiState(String(reason || "external-sync"));
  };
  window.queueShopMobileUiStateSync = queueMobileUiStateSync;
  window.renderShopMobileBottomByState = function renderShopMobileBottomByState(reason = "external-render") {
    renderMobileBottomByState(window.getShopMobileUiState(), String(reason || "external-render"));
  };

  if (!window.__shopMobileUiViewportWatcherBound) {
    window.__shopMobileUiViewportWatcherBound = true;
    window.addEventListener("resize", () => queueMobileUiStateSync("viewport-resize"), { passive: true });
    window.addEventListener("orientationchange", () => queueMobileUiStateSync("viewport-orientation"), { passive: true });
  }

  if (!window.__shopMobileUiRenderBound) {
    window.__shopMobileUiRenderBound = true;
    document.addEventListener("shop:mobile-ui-state-change", (event) => {
      const detail = event && event.detail && typeof event.detail === "object"
        ? event.detail
        : window.getShopMobileUiState();
      renderMobileBottomByState(detail, "shop:mobile-ui-state-change");
    });
  }

  // ??????? ???????????? ????????? ????????? ? bottom sheets ??? ????????? ?????? "?????"
  const __sheetNavigationStateRaw = {
    type: null, // 'cart' | 'categories' | 'profile' | 'activeOrders' | 'order' | 'product' | null
    screen: null, // ??????? ????? ?????? sheet
    data: null, // ?????????????? ?????? (????????, cartKey ??? product)
  };
  let sheetNavigationState = new Proxy(__sheetNavigationStateRaw, {
    set(target, prop, value) {
      if (target[prop] === value) return true;
      target[prop] = value;
      queueMobileUiStateSync(`sheetNavigationState.${String(prop)}`);
      return true;
    },
    get(target, prop) {
      return target[prop];
    },
  });

  // ??????? ????????? ?????? "?????" ?? Android
  function handleAndroidBackButton() {
    // ?????????, ?????? ?? bottom sheet ????? AppModal
    if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
      // ???????????? ????????? ?????? bottom sheet ? ??????????? ?? ????
      if (sheetNavigationState.type === 'cart') {
        return handleCartSheetBack();
      } else if (sheetNavigationState.type === 'activeOrders') {
        return handleActiveOrdersSheetBack();
      } else if (sheetNavigationState.type === 'categories' || 
                 sheetNavigationState.type === 'profile' ||
                 sheetNavigationState.type === 'favorites') {
        // ??????? bottom sheets ??? ????????? - ?????? ?????????
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // ????????? ?????? bottom sheets (orders.js, products.js)
    const orderSheet = document.getElementById('orderSheet');
    if (orderSheet && orderSheet.classList.contains('is-open')) {
      // ????????? bottom sheet ?? orders.js
      if (typeof window.closeOrderSheet === 'function') {
        window.closeOrderSheet();
      } else {
        orderSheet.classList.remove('is-open');
        const backdrop = document.getElementById('sheetBackdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('sheet-open');
      }
      return true;
    }
    
    const productSheet = document.getElementById('productSheet');
    if (productSheet && productSheet.classList.contains('is-open')) {
      // ????????? bottom sheet ?? products.js
      if (typeof window.closeProductSheet === 'function') {
        window.closeProductSheet();
      } else {
        productSheet.classList.remove('is-open');
        const backdrop = document.getElementById('productSheetBackdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('sheet-open');
      }
      return true;
    }
    
    return false; // ?? ??????????, ????В корзине пусто? ????
  }

  // ????????? ?????? "?????" ??? ???????
  function handleCartSheetBack() {
    if (!openCartSheetCtx) {
      closeShopSheetIfOpen();
      return true;
    }
    
    const { checkoutEl, productEl, listEl } = openCartSheetCtx;
    const addressWrap = checkoutEl?.parentElement?.querySelector('.shop-address-content');
    const addressListView = addressWrap?.querySelector('.shop-address-list-view');
    const addressFormView = addressWrap?.querySelector('.shop-address-form-view');
    const pickupWrapEl = checkoutEl?.parentElement?.querySelector('.shop-pickup-content');

    // ????????В корзине пусто
    if (pickupWrapEl && !pickupWrapEl.classList.contains('hidden')) {
      // ?? ?????? ????? ?????????? - ???????????? ? ??????????
      showSheetCheckout();
      return true;
    } else if (productEl && !productEl.classList.contains('hidden')) {
      // ?????: ???? ?????? ????? "????????" ? ??? ????? ? ???????? ????????????? ?????
      if (openCartSheetCtx?.comboStepBack && typeof openCartSheetCtx.comboStepBack === "function") {
        openCartSheetCtx.comboStepBack();
        return true;
      }
      const customBackHandler = sheetNavigationState.data?.customBackHandler;
      if (typeof customBackHandler === "function") {
        if (elMobileProductActions) elMobileProductActions.classList.add("hidden");
        if (typeof window._comboStepBackCallback !== "undefined") {
          window._comboStepBackCallback = null;
        }
        if (openCartSheetCtx && typeof openCartSheetCtx === "object") {
          openCartSheetCtx.comboStepBack = null;
        }
        openCartSheetCtx = null;
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove("shop-cart-sheet-body");
        }
        customBackHandler();
        return true;
      }
      // ?? ?????? ?????? - ???????????? ? ??????? ??? ????????? sheet
      const cartKey = sheetNavigationState.data?.cartKey;
      if (cartKey) {
        showSheetCart();
        return true;
      } else {
        closeShopSheetIfOpen();
        return true;
      }
    } else if (addressFormView && !addressFormView.classList.contains('hidden')) {
      // ?? ????? ?????? - ???????????? ? ?????? ???????
      if (openCartSheetCtx?.addressBackMode === "profile") {
        returnToProfileFromSheet();
        return true;
      }
      showSheetAddressList();
      return true;
    } else if (addressListView && !addressListView.classList.contains('hidden')) {
      const backMode = openCartSheetCtx?.addressBackMode || "cart";
      if (backMode === "header") {
        closeShopSheetIfOpen();
      } else if (backMode === "profile") {
        returnToProfileFromSheet();
      } else if (backMode === "checkout") {
        showSheetCheckout();
      } else {
        showSheetCart();
      }
      return true;
    } else if (checkoutEl && !checkoutEl.classList.contains('hidden')) {
      // ?? ?????????? ?????? - ???????????? ? ???????
      showSheetCart();
      return true;
    } else if (listEl && !listEl.classList.contains('hidden')) {
      // ?? ??????? - ????????? sheet
      closeShopSheetIfOpen();
      return true;
    }
    
    // Fallback - ????????? sheet
    closeShopSheetIfOpen();
    return true;
  }

  // ????????? ?????? "?????" ??? ???????? ???????
  function handleActiveOrdersSheetBack() {
    // ???? ?В корзине пусто? - ???????????? ? ??????
    if (sheetNavigationState.screen === 'details') {
      const savedOrders = window._savedActiveOrdersForBack || [];
      if (savedOrders && savedOrders.length > 0) {
        // ??????? ??????? showActiveOrdersList В корзине пусто????
        // ??? ?????????? ?????? ??????? init, ??????? ????? ??????? ?? ????? ?????????
        // ??? ?????????? ?????? ????????? ? ???????, ???? ??? ???????? ?????????
        const activeOrders = window._activeOrders || [];
        if (activeOrders.length > 1 || savedOrders.length > 1) {
          // ???В корзине пусто????, ?????????? ??????
          // ?????????? ?????? ????????? В корзине пусто ??????? ?????????
          // ??? ????? ????? ????? ??????? ? ?????????, ??? ??? ??????????
          // ???????? ?????????? ???????? ???? - ????????В корзине пусто???
          const wrap = document.createElement("div");
          wrap.className = "shop-active-orders-sheet";
          
          const list = document.createElement("div");
          list.className = "shop-active-orders-list";
          
          savedOrders.forEach(order => {
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
            
            list.appendChild(card);
          });
          
          wrap.appendChild(list);
          
          window.AppModal.setTitle("Активные заказы");
          window.AppModal.setContent(wrap);
          
          // ??????? ?????? ????? ?? ??????
          const modalHeader = document.querySelector(".app-modal-header");
          if (modalHeader) {
            const backBtn = modalHeader.querySelector(".app-modal-back-btn");
            if (backBtn) {
              backBtn.remove();
            }
          }
          
          // ????????? ????????? ?????????
          sheetNavigationState.screen = 'list';
          return true;
        } else {
          // ???? ????? ????, ????????? sheet
          closeShopSheetIfOpen();
          return true;
        }
      } else {
        // ???? ?????? ????, ????????? sheet
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // ?? ?????? ??? fallback - ????????? sheet
    closeShopSheetIfOpen();
    return true;
  }
  let openProductCtx = null;
  let cartViewMode = "cart";
  let previousPanelMode = "cart";
  let previousPanelProductId = null;
  queueMobileUiStateSync("cartViewMode.init");

  function normalizeCart(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (item?.type === "combo") {
            const qty = Math.max(0, Number(item?.qty || 0));
            if (qty <= 0) return null;
            return {
              key: item.key || "combo-" + (item.combo_id || "") + "-" + Date.now(),
              type: "combo",
              combo_id: item.combo_id,
              combo_title: item.combo_title || "Комбо",
              qty,
              selections: Array.isArray(item.selections) ? item.selections : [],
              unit_price_before_discount: item.unit_price_before_discount != null ? Number(item.unit_price_before_discount) : null,
            };
          }
          const productId = Number(item?.product_id);
          const qty = Math.max(0, Number(item?.qty || 0));
          if (!Number.isFinite(productId) || qty <= 0) return null;
          const optionItems = Array.isArray(item?.option_items) ? item.option_items : [];
          const optionIds = Array.isArray(item?.option_item_ids) ? item.option_item_ids : optionItems.map((opt) => opt.id);
          const normalizedOptionIds = optionIds.map(Number).filter(Number.isFinite);
          const normalizedVariantGroupId = toFiniteNumberOrNull(item?.variant_group_id);
          const normalizedVariantValueIndex = toFiniteNumberOrNull(item?.variant_value_index);
          const hasVariantSelection = normalizedVariantGroupId !== null && normalizedVariantValueIndex !== null;
          const variantSelection = hasVariantSelection
            ? { group_id: normalizedVariantGroupId, value_index: normalizedVariantValueIndex }
            : null;
          const normalizedOptionItems = optionItems.length
            ? optionItems.map((opt) => {
              const optionVariantGroupId = toFiniteNumberOrNull(opt.variant_group_id);
              const optionVariantValueIndex = toFiniteNumberOrNull(opt.variant_value_index);
              const hasOptionVariant = optionVariantGroupId !== null && optionVariantValueIndex !== null;
              const optionTargetProductId = toFiniteNumberOrNull(
                opt?.target_product_id !== undefined ? opt.target_product_id : opt?.product_id
              );
              return {
                id: Number(opt.id),
                title: str(opt.title || opt.name || ""),
                price: Number(opt.price || 0),
                qty: Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1,
                target_product_id: optionTargetProductId,
                product_id: optionTargetProductId,
                // ???????? ?????
                variant_group_id: hasOptionVariant ? optionVariantGroupId : null,
                variant_value_index: hasOptionVariant ? optionVariantValueIndex : null,
                variant_label: hasOptionVariant ? str(opt.variant_label || "") : "",
                variant_price_diff: hasOptionVariant ? Number(opt.variant_price_diff || 0) : 0,
              };
            })
            : normalizedOptionIds.map((id) => ({
              id,
              title: "",
              price: 0,
              qty: 1,
              target_product_id: null,
              product_id: null,
              variant_group_id: null,
              variant_value_index: null,
              variant_label: "",
              variant_price_diff: 0,
            }));
          // ??????????????? ??????????? ?? ??????????? ??????
          const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
          
          return {
            key: makeCartKey(productId, normalizedOptionItems, ingredients, variantSelection),
            product_id: productId,
            qty,
            option_item_ids: normalizedOptionItems.map((opt) => opt.id),
            option_items: normalizedOptionItems,
            ingredients: ingredients,
            ingredient_price_diff: Number(item?.ingredient_price_diff || 0),
            variant_group_id: normalizedVariantGroupId,
            variant_value_index: normalizedVariantValueIndex,
            variant_label: hasVariantSelection ? str(item.variant_label || "") : "",
            variant_unit_price: hasVariantSelection ? Number(item.variant_unit_price || 0) : 0,
            auto_add: Number(item?.auto_add || 0) ? 1 : 0,
            auto_add_group_id: toFiniteNumberOrNull(item?.auto_add_group_id),
          };
        })
        .filter(Boolean);
    }

    if (raw && typeof raw === "object") {
      return Object.keys(raw)
        .map((k) => {
          const productId = Number(k);
          const qty = Math.max(0, Number(raw[k] || 0));
          if (!Number.isFinite(productId) || qty <= 0) return null;
          return {
            key: makeCartKey(productId, []),
            product_id: productId,
            qty,
            option_item_ids: [],
            option_items: [],
            variant_group_id: null,
            variant_value_index: null,
            variant_label: "",
            variant_unit_price: 0,
            auto_add: 0,
            auto_add_group_id: null,
          };
        })
        .filter(Boolean);
    }

    return [];
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return normalizeCart(parsed);
    } catch {}
    return [];
  }

  function saveCart() {
    markCartUiDirty();
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {}
  }

  function loadAutoAddDismissed() {
    try {
      const raw = localStorage.getItem(AUTO_ADD_DISMISSED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => String(x)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function applyAutoAddRules() {
    const groups = Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [];
    const rules = Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [];
    if (!groups.length || !rules.length) return false;

    let changed = false;

    const hasBaseItems = state.cart.some((item) => {
      const qty = Number(item.qty || 0);
      if (qty <= 0) return false;
      if (item.type === "combo") return true;
      const pid = Number(item.product_id || item.id);
      if (!Number.isFinite(pid)) return false;
      return Number(item.auto_add || 0) !== 1;
    });

    if (!hasBaseItems) {
      const before = state.cart.length;
      state.cart = state.cart.filter((item) => {
        const qty = Number(item.qty || 0);
        if (qty <= 0) return false;
        return Number(item.auto_add || 0) !== 1;
      });
      if (state.cart.length !== before) {
        changed = true;
      }
      if (state.cart.length === 0) {
        if (state.autoAddDismissed.size) {
          clearAllAutoAddDismissed();
          changed = true;
        }
      }
      return changed;
    }

    const itemsByGroup = new Map();
    rules.forEach((rule) => {
      const gid = Number(rule.group_id);
      if (!Number.isFinite(gid)) return;
      if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
      itemsByGroup.get(gid).push(rule);
    });

    const totals = computeCartTotals(cartItemsResolved());
    const nonAutoTotal = totals.nonAutoTotal;
    const autoEligibleTotal = totals.autoEligibleTotal;

    const sortedGroups = groups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0));

    sortedGroups.forEach((group) => {
      const groupId = Number(group.id);
      if (!Number.isFinite(groupId)) return;
      const groupRules = (itemsByGroup.get(groupId) || []).slice().sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0)
      );
      if (!groupRules.length) return;

      const baseTotal = Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
      const minAmount = group.min_cart_amount != null ? Number(group.min_cart_amount) : null;
      const maxAmount = group.max_cart_amount != null ? Number(group.max_cart_amount) : null;
      const minOk = minAmount == null || baseTotal >= minAmount;
      const maxOk = maxAmount == null || baseTotal <= maxAmount;
      const eligible = minOk && maxOk;

      if (!eligible) {
        groupRules.forEach((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return;
          const key = makeCartKey(pid, []);
          if (getCartItemByKey(key)) {
            state.cart = state.cart.filter((x) => x.key !== key);
            changed = true;
          }
        });
        return;
      }

      const allowQty = Number(group.allow_customer_qty ?? 1) === 1;

      groupRules.forEach((rule) => {
        const pid = Number(rule.product_id);
        if (!Number.isFinite(pid)) return;

        const p = state.productCache.get(pid);
        if (p && !isProductAvailable(p)) return;

        const key = makeCartKey(pid, []);
        const matching = state.cart.filter((x) => Number(x.product_id || x.id) === pid);
        let item = matching.find((x) => Number(x.auto_add || 0) === 1) || null;
        if (!item) {
          item = matching.find((x) => isPlainCartItem(x)) || null;
        }
        if (!item && matching.length === 1) {
          item = matching[0] || null;
        }

        const dismissed = isAutoAddDismissed(groupId, pid);
        if (item && dismissed) {
          clearAutoAddDismissed(groupId, pid);
        }
        if (!item && dismissed) return;

        if (item && Number(item.auto_add || 0) !== 1) {
          item.auto_add = 1;
          item.auto_add_group_id = groupId;
          changed = true;
        }

        if (matching.length > 1 && item) {
          matching.forEach((candidate) => {
            if (candidate === item) return;
            if (Number(candidate.auto_add || 0) === 1 || isPlainCartItem(candidate)) {
              const idx = state.cart.indexOf(candidate);
              if (idx !== -1) {
                state.cart.splice(idx, 1);
                changed = true;
              }
            }
          });
        }

        const minQty = Math.max(0, Number(rule.min_qty || 0));
        const defaultQty = Math.max(0, Number(rule.default_qty || 0));
        const maxQty = rule.max_qty != null ? Math.max(0, Number(rule.max_qty)) : null;
        const desired = Math.max(minQty, defaultQty);

        if (!item && desired > 0) {
          item = {
            key,
            product_id: pid,
            qty: desired,
            option_item_ids: [],
            option_items: [],
            ingredients: [],
            ingredient_price_diff: 0,
            variant_group_id: null,
            variant_value_index: null,
            variant_label: "",
            variant_unit_price: 0,
            auto_add: 1,
            auto_add_group_id: groupId,
          };
          state.cart.push(item);
          changed = true;
        }

        if (!item) return;

        let nextQty = Math.max(0, Number(item.qty || 0));
        if (!allowQty) {
          nextQty = desired;
        } else {
          if (minQty > 0 && nextQty < minQty) nextQty = minQty;
          if (maxQty != null && nextQty > maxQty) nextQty = maxQty;
        }
        if (maxQty != null && nextQty > maxQty) nextQty = maxQty;

        if (nextQty !== item.qty) {
          item.qty = nextQty;
          changed = true;
        }
        if (nextQty <= 0) {
          state.cart = state.cart.filter((x) => x !== item && x.key !== key);
          changed = true;
        }
      });

      const maxGroupQty = group.max_items_qty != null ? Number(group.max_items_qty) : null;
      if (maxGroupQty != null && Number.isFinite(maxGroupQty)) {
        const groupItems = groupRules.map((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return null;
          const key = makeCartKey(pid, []);
          const item = getCartItemByKey(key);
          if (!item) return null;
          return { rule, item, key };
        }).filter(Boolean);

        const totalQty = groupItems.reduce((sum, entry) => sum + Math.max(0, Number(entry.item.qty || 0)), 0);
        let overflow = totalQty - maxGroupQty;
        if (overflow > 0) {
          const sortedItems = groupItems.slice().sort((a, b) => {
            const aSort = a.rule.sort_order ?? 0;
            const bSort = b.rule.sort_order ?? 0;
            return bSort - aSort || Number(b.rule.id || 0) - Number(a.rule.id || 0);
          });
          sortedItems.forEach((entry) => {
            if (overflow <= 0) return;
            const minQty = Math.max(0, Number(entry.rule.min_qty || 0));
            const currentQty = Math.max(0, Number(entry.item.qty || 0));
            const reducible = Math.max(0, currentQty - minQty);
            if (reducible <= 0) return;
            const reduceBy = Math.min(reducible, overflow);
            const nextQty = currentQty - reduceBy;
            entry.item.qty = nextQty;
            overflow -= reduceBy;
            changed = true;
            if (nextQty <= 0 && minQty <= 0 && Number(entry.rule.default_qty || 0) <= 0) {
              state.cart = state.cart.filter((x) => x.key !== entry.key);
            }
          });
        }
      }
    });

    return changed;
  }

  function pruneUnavailableCartItems() {
    const before = state.cart.length;
    state.cart = state.cart.filter((item) => {
      // ????? ?? ???????? ?? product_id ? ?? ?????? ????????? ???? ????????
      if (item?.type === "combo") return true;
      const pid = Number(item.product_id || item.id);
      if (!Number.isFinite(pid)) return false;
      const p = state.productCache.get(pid);
      if (p && !isProductAvailable(p)) return false;
      return true;
    });
    if (state.cart.length !== before) {
      saveCart();
      return true;
    }
    return false;
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

  function cartQty(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return 0;
    return state.cart.reduce((sum, item) => {
      if (Number(item.product_id) !== pid) return sum;
      return sum + Number(item.qty || 0);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Локальный расчёт потребления stock
  // ---------------------------------------------------------------------------

  /**
   * Количество единиц stock, которое потребляет один «юнит» продукта/опции/ингредиента.
   * Учитывает вариант (если есть) и конверсию единиц.
   *   product     — объект продукта из productCache (нужны base_qty, base_unit_id)
   *   variantLabel — строка варианта, напр. "3" или "3 шт" (из variant_label)
   *   variantUnitId — unit_id группы вариантов
   * Возвращает число (по умолчанию product.base_qty || 1).
   */
  function calcConsumedPerUnit(product, variantLabel, variantUnitId) {
    if (!product) return 1;
    // Пробуем распарсить числовое значение из варианта
    if (variantLabel != null && variantLabel !== "") {
      const numericValue = parseVariantValueNumber(variantLabel);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        const baseUnitId = Number(product.base_unit_id || product.unit_id || 0);
        const fromUnitId = Number(variantUnitId || 0);
        if (fromUnitId > 0 && baseUnitId > 0) {
          if (fromUnitId === baseUnitId) return numericValue;
          const factor = getConversionFactor(fromUnitId, baseUnitId);
          if (factor != null) {
            const inBase = numericValue * factor;
            if (Number.isFinite(inBase) && inBase > 0) return inBase;
          }
        }
        // Если нет конверсии но есть числовое значение — возвращаем как есть
        return numericValue;
      }
    }
    // Фолбэк: base_qty продукта (по умолчанию 1)
    const bq = Number(product.base_qty || 1);
    return Number.isFinite(bq) && bq > 0 ? bq : 1;
  }

  /**
   * Считает суммарное потребление stock для productId по всей корзине.
   * Учитывает: основной товар, option items, ingredients, combo selections.
   */
  function resolveOptionTargetProductId(optionItem) {
    const direct = Number(optionItem?.target_product_id || optionItem?.product_id || 0);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const optionItemId = Number(optionItem?.id || 0);
    if (!Number.isFinite(optionItemId) || optionItemId <= 0) return 0;
    if (!(state.optionGroupCache instanceof Map) || state.optionGroupCache.size === 0) return 0;

    for (const details of state.optionGroupCache.values()) {
      const items = Array.isArray(details?.items) ? details.items : [];
      const matched = items.find((it) => Number(it?.id || 0) === optionItemId);
      if (!matched) continue;
      const matchedPid = Number(matched?.target_product_id || matched?.product_id || 0);
      if (Number.isFinite(matchedPid) && matchedPid > 0) return matchedPid;
    }
    return 0;
  }

  function calcProductStockConsumed(productId, sourceCart) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return 0;
    const cart = Array.isArray(sourceCart) ? sourceCart : state.cart;
    let total = 0;

    for (const item of cart) {
      if (!item) continue;
      const itemQty = Math.max(0, Number(item.qty || 0));
      if (!itemQty) continue;

      // ----- Combo -----
      if (item.type === "combo") {
        const selections = Array.isArray(item.selections) ? item.selections : [];
        for (const sel of selections) {
          const selPid = Number(sel?.product_id || 0);
          // Combo selection — основной продукт
          if (selPid === pid) {
            const selProduct = state.productCache.get(selPid);
            const variantLabel = sel?.variant_label || sel?.variant_value || "";
            const variantGroupId = Number(sel?.variant_group_id || 0);
            const selVariants = selProduct && Array.isArray(selProduct.variants) ? selProduct.variants : [];
            const variantUnitId = Number(sel?.unit_id || 0)
              || (variantGroupId > 0 && selVariants.length ? Number(selVariants[0]?.unit_id || 0) : 0);
            total += calcConsumedPerUnit(selProduct, variantLabel, variantUnitId) * itemQty;
          }
          // Combo selection — ingredients
          const selIngredients = Array.isArray(sel?.ingredients_display)
            ? sel.ingredients_display
            : (Array.isArray(sel?.ingredients) ? sel.ingredients : []);
          for (const ing of selIngredients) {
            const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
            if (ingPid !== pid) continue;
            const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
            if (ingQty <= 0) continue;
            const ingProduct = state.productCache.get(ingPid);
            const ingUnitId = Number(ing?.unit_id || 0);
            if (ingProduct && ingUnitId) {
              const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
              if (baseUnitId && ingUnitId !== baseUnitId) {
                const factor = getConversionFactor(ingUnitId, baseUnitId);
                if (factor != null) {
                  total += ingQty * factor * itemQty;
                  continue;
                }
              }
            }
            total += ingQty * itemQty;
          }
        }
        continue;
      }

      // ----- Regular product -----
      const itemPid = Number(item.product_id || 0);

      // Основной товар
      if (itemPid === pid) {
        const product = state.productCache.get(itemPid);
        const variantLabel = item.variant_label || "";
        const variants = product && Array.isArray(product.variants) ? product.variants : [];
        const variantUnitId = Number(variants[0]?.unit_id || 0);
        total += calcConsumedPerUnit(product, variantLabel, variantUnitId) * itemQty;
      }

      // Option items
      const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
      for (const opt of optionItems) {
        const optPid = resolveOptionTargetProductId(opt);
        if (optPid !== pid) continue;
        const optQty = Math.max(0, Number(opt?.qty || 1));
        const optProduct = state.productCache.get(optPid);
        const optVariantLabel = opt?.variant_label || "";
        const optVariants = optProduct && Array.isArray(optProduct.variants) ? optProduct.variants : [];
        const optVariantGroupId = Number(opt?.variant_group_id || 0);
        const optVariantUnitId = Number(opt?.unit_id || 0)
          || (optVariantGroupId > 0 && optVariants.length ? Number(optVariants[0]?.unit_id || 0) : 0);
        total += calcConsumedPerUnit(optProduct, optVariantLabel, optVariantUnitId) * optQty * itemQty;
      }

      // Ingredients
      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      for (const ing of ingredients) {
        const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
        if (ingPid !== pid) continue;
        const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
        if (ingQty <= 0) continue;
        const ingProduct = state.productCache.get(ingPid);
        const ingUnitId = Number(ing?.unit_id || 0);
        if (ingProduct && ingUnitId) {
          const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
          if (baseUnitId && ingUnitId !== baseUnitId) {
            const factor = getConversionFactor(ingUnitId, baseUnitId);
            if (factor != null) {
              total += ingQty * factor * itemQty;
              continue;
            }
          }
        }
        total += ingQty * itemQty;
      }
    }

    return total;
  }

  /**
   * Доступный остаток stock для productId (уже вычтена корзина).
   * Возвращает Infinity если stock unlimited, число >= 0 иначе.
   */
  function getAvailableStock(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return Infinity;
    const entry = getStockLevelEntry(pid);
    if (!entry) return Infinity;
    if (entry.qty === null || entry.qty === undefined) return Infinity;
    if (entry.isUnlimited) return Infinity;
    const stockQty = Number(entry.qty);
    if (!Number.isFinite(stockQty)) return Infinity;
    return Math.max(0, stockQty - calcProductStockConsumed(pid));
  }

  /**
   * Сколько ещё можно «добавить» для productId с учётом дополнительного потребления
   * (то что набрано в текущем пикере, но ещё не в корзине).
   */
  function getProductRemainingForPicker(productId, additionalConsumed) {
    const available = getAvailableStock(productId);
    if (!Number.isFinite(available)) return Infinity;
    const extra = Number(additionalConsumed || 0);
    return Math.max(0, available - extra);
  }

  // ---------------------------------------------------------------------------
  // Локальная проверка доступности составных блюд (ингредиенты по умолчанию)
  // ---------------------------------------------------------------------------

  const productIngredientRequirementsCache = new Map();

  function normalizeIngredientRequirementInBase(ingredientRow) {
    const rawQty = Number(ingredientRow?.quantity ?? ingredientRow?.qty ?? 0);
    if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
    const inBase = getQtyInBase(ingredientRow, rawQty);
    if (Number.isFinite(inBase) && inBase > 0) return inBase;
    return rawQty;
  }

  async function ensureProductIngredientRequirements(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return new Map();

    const cached = productIngredientRequirementsCache.get(pid);
    if (cached?.status === "ready" || cached?.status === "error") {
      return cached.requirements instanceof Map ? cached.requirements : new Map();
    }
    if (cached?.status === "pending" && cached.promise) {
      return cached.promise;
    }

    const promise = (async () => {
      try {
        const json = await apiJson(`/api/public/products/${pid}/ingredients`);
        const rows = Array.isArray(json?.data) ? json.data : [];
        const requirements = new Map();
        for (const ing of rows) {
          const depPid = Number(ing?.ingredient_id || 0);
          if (!Number.isFinite(depPid) || depPid <= 0) continue;
          const amount = normalizeIngredientRequirementInBase(ing);
          if (!(amount > 0)) continue;
          requirements.set(depPid, Number(requirements.get(depPid) || 0) + amount);
        }
        productIngredientRequirementsCache.set(pid, {
          status: "ready",
          requirements,
        });
        return requirements;
      } catch (err) {
        productIngredientRequirementsCache.set(pid, {
          status: "error",
          requirements: new Map(),
        });
        return new Map();
      } finally {
        // Когда требования догрузились — сразу пересчитываем видимые карточки
        scheduleSyncAllProductCardsFromCart();
      }
    })();

    productIngredientRequirementsCache.set(pid, {
      status: "pending",
      promise,
      requirements: new Map(),
    });
    return promise;
  }

  async function batchLoadIngredientRequirements(productIds) {
    const ids = [];
    for (const rawId of productIds) {
      const pid = Number(rawId || 0);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const cached = productIngredientRequirementsCache.get(pid);
      if (cached?.status === "ready" || cached?.status === "error") continue;
      ids.push(pid);
    }
    if (!ids.length) return;

    try {
      const json = await apiJson('/api/public/products/batch/ingredients', {
        method: 'POST',
        body: { ids },
      });
      const data = json?.data || {};
      for (const pid of ids) {
        const rows = Array.isArray(data[pid]) ? data[pid] : [];
        const requirements = new Map();
        for (const ing of rows) {
          const depPid = Number(ing?.ingredient_id || 0);
          if (!Number.isFinite(depPid) || depPid <= 0) continue;
          const amount = normalizeIngredientRequirementInBase(ing);
          if (!(amount > 0)) continue;
          requirements.set(depPid, Number(requirements.get(depPid) || 0) + amount);
        }
        productIngredientRequirementsCache.set(pid, { status: "ready", requirements });
      }
    } catch (err) {
      for (const pid of ids) {
        if (!productIngredientRequirementsCache.has(pid) || productIngredientRequirementsCache.get(pid)?.status === "pending") {
          productIngredientRequirementsCache.set(pid, { status: "error", requirements: new Map() });
        }
      }
    }
    scheduleSyncAllProductCardsFromCart();
  }

  function getProductIngredientRequirementsSync(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return new Map();
    const cached = productIngredientRequirementsCache.get(pid);
    if (!cached) {
      return null;
    }
    if (cached.status === "pending") return null;
    return cached.requirements instanceof Map ? cached.requirements : new Map();
  }

  function isProductBlockedByIngredientRequirements(productId) {
    const requirements = getProductIngredientRequirementsSync(productId);
    // Пока требования не догружены — не блокируем карточку преждевременно.
    if (!(requirements instanceof Map)) return false;
    if (!requirements.size) return false;

    for (const [depPid, requiredAmount] of requirements.entries()) {
      if (!(requiredAmount > 0)) continue;
      const remaining = getAvailableStock(depPid);
      if (!Number.isFinite(remaining)) continue;
      if (remaining + 1e-9 < requiredAmount) {
        return true;
      }
    }
    return false;
  }

  function cartCountTotal() {
    return state.cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }

  function getCartItemByKey(key) {
    return state.cart.find((item) => item.key === key) || null;
  }

  function cartItemsResolved(sourceCart = state.cart) {
    const items = [];
    const safeCart = Array.isArray(sourceCart) ? sourceCart : [];
    for (const item of safeCart) {
      if (item.type === "combo") {
        const qty = Math.max(0, Number(item.qty || 0));
        if (!qty) continue;
        const unitPrice = (item.selections || []).reduce((s, sel) => s + Number(sel.unit_price_override || 0), 0);
        items.push({
          key: item.key,
          type: "combo",
          combo_id: item.combo_id,
          combo_title: item.combo_title || "Комбо",
          qty,
          selections: Array.isArray(item.selections) ? item.selections : [],
          unit_price_override: roundPrice(unitPrice),
          unit_price_before_discount: item.unit_price_before_discount != null ? Number(item.unit_price_before_discount) : null,
          auto_add: 0,
          auto_add_group_id: null,
        });
        continue;
      }
      const pid = Number(item.product_id);
      const qty = Number(item.qty || 0);
      if (!qty || !Number.isFinite(pid)) continue;
      const p = state.productCache.get(pid);
      if (!p) continue;
      const variantGroupId = toFiniteNumberOrNull(item.variant_group_id);
      const variantValueIndex = toFiniteNumberOrNull(item.variant_value_index);
      const hasVariantSelection = variantGroupId !== null && variantValueIndex !== null;
      items.push({
        key: item.key,
        product: p,
        qty,
        option_item_ids: Array.isArray(item.option_item_ids) ? item.option_item_ids : [],
        option_items: Array.isArray(item.option_items) ? item.option_items : [],
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        ingredient_price_diff: Number(item.ingredient_price_diff || 0),
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: hasVariantSelection ? str(item.variant_label || "") : "",
        variant_unit_price: hasVariantSelection ? Number(item.variant_unit_price || 0) : 0,
        unit_price_override: item.unit_price_override != null ? Number(item.unit_price_override) : null,
        auto_add: Number(item.auto_add || 0),
        auto_add_group_id: toFiniteNumberOrNull(item.auto_add_group_id),
      });
    }
    return items;
  }

  function cloneCartState(cartItems = state.cart) {
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

  function toStockVariantValue(rawLabel) {
    const text = str(rawLabel || "").trim();
    if (!text) return "";
    const colonPos = text.indexOf(":");
    if (colonPos >= 0) {
      const right = text.slice(colonPos + 1).trim();
      return right || text;
    }
    return text;
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
            variant_label: str(sel.variant_label || ""),
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

      const variantGroupId = toFiniteNumberOrNull(item?.variant_group_id);
      const variantValueIndex = toFiniteNumberOrNull(item?.variant_value_index);
      const variantLabel = toStockVariantValue(item?.variant_label || "");
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

  function extractStockShortagesFromError(err) {
    const shortagesRaw = Array.isArray(err?.payload?.data?.shortages) ? err.payload.data.shortages : [];
    return shortagesRaw
      .map((row) => {
        const productId = Number(row?.productId || row?.product_id || 0);
        if (!Number.isFinite(productId) || productId <= 0) return null;
        return {
          productId,
          requiredQty: Number(row?.requiredQty ?? row?.required_qty ?? 0) || 0,
          availableQty: row?.availableQty == null ? null : Number(row.availableQty),
          productName: str(row?.productName || row?.product_name || "").trim(),
        };
      })
      .filter(Boolean);
  }

  function getShortageProductIds(shortages) {
    const ids = new Set();
    (Array.isArray(shortages) ? shortages : []).forEach((row) => {
      const pid = Number(row?.productId || row?.product_id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });
    return Array.from(ids);
  }

  async function refreshProductsByIds(productIds) {
    const ids = Array.isArray(productIds)
      ? productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!ids.length) return;

    await Promise.all(ids.map(async (pid) => {
      try {
        const json = await apiJson(`/api/public/products/${pid}`);
        const product = json?.data || null;
        if (!product) return;
        if (!Array.isArray(product.photos)) product.photos = safePhotos(product);
        cacheStockFromProductPayload(product, "product_refresh_by_id");
        product.is_available = isProductAvailable(product);
        state.productCache.set(pid, product);
      } catch {}
    }));
  }

  function syncCartUiAfterStateChange() {
    scheduleSyncAllProductCardsFromCart();
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
    if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
  }

  async function checkStockForItemsPayload(itemsPayload, opts = {}) {
    const safeItems = Array.isArray(itemsPayload) ? itemsPayload : [];
    if (!safeItems.length) return { available: true, shortages: [], stockLevels: [] };

    const finalizeOutOfStock = async (shortages, stockLevels) => {
      if (opts.refreshOnOut !== false) {
        const refreshIds = new Set(getShortageProductIds(shortages));
        stockLevels.forEach((row) => {
          const pid = Number(row?.productId || row?.product_id || 0);
          if (Number.isFinite(pid) && pid > 0) refreshIds.add(pid);
        });
        await refreshProductsByIds(Array.from(refreshIds));
      }
      if (opts.showToastOnOut) {
        showToast(opts.toastMessage || "Больше нет в наличии");
      }
      return { available: false, shortages, stockLevels };
    };

    try {
      const json = await apiJson("/api/public/orders/stock-check", {
        method: "POST",
        body: { items: safeItems },
      });

      const payloadData = json?.data || null;
      const stockLevels = extractStockLevelsFromPayload(payloadData);
      if (stockLevels.length) {
        mergeStockLevels(stockLevels, payloadData?.available === false ? "stock_check_out" : "stock_check_success");
      }

      if (payloadData?.available === false) {
        const shortages = extractStockShortagesFromError({
          payload: { data: payloadData },
        });
        return finalizeOutOfStock(shortages, stockLevels);
      }

      return { available: true, shortages: [], stockLevels };
    } catch (e) {
      // Backward compatibility for servers that still return 409 OUT_OF_STOCK.
      if (String(e?.message || "") !== "OUT_OF_STOCK") throw e;
      const shortages = extractStockShortagesFromError(e);
      const stockLevels = extractStockLevelsFromPayload(e?.payload?.data || null);
      if (stockLevels.length) {
        mergeStockLevels(stockLevels, "stock_check_out");
      }
      return finalizeOutOfStock(shortages, stockLevels);
    }
  }

  async function validateCurrentCartStock(opts = {}) {
    const itemsPayload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved());
    return checkStockForItemsPayload(itemsPayload, opts);
  }

  let __cartStockRecheckSeq = 0;
  let __cartStockRecheckTimer = null;
  let __cartStockRecheckSnapshot = [];
  let __cartStockRecheckOpts = {};
  const ENABLE_LIVE_CART_STOCK_RECHECK = false;
  function queueCartStockRecheck(previousCartSnapshot, opts = {}) {
    if (!ENABLE_LIVE_CART_STOCK_RECHECK) return;
    __cartStockRecheckSnapshot = cloneCartState(previousCartSnapshot || []);
    __cartStockRecheckOpts = { ...(opts || {}) };
    const seq = ++__cartStockRecheckSeq;

    if (__cartStockRecheckTimer) {
      clearTimeout(__cartStockRecheckTimer);
      __cartStockRecheckTimer = null;
    }

    __cartStockRecheckTimer = setTimeout(() => {
      __cartStockRecheckTimer = null;
      const snapshot = cloneCartState(__cartStockRecheckSnapshot || []);
      const localOpts = { ...(__cartStockRecheckOpts || {}) };

      (async () => {
        try {
          const check = await validateCurrentCartStock({
            refreshOnOut: localOpts.refreshOnOut !== false,
            showToastOnOut: false,
          });
          if (seq !== __cartStockRecheckSeq) return;
          if (check.available) return;

          state.cart = snapshot;
          saveCart();
          syncCartUiAfterStateChange();
          if (localOpts.showToast !== false) {
            showToast(localOpts.toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
          }
        } catch (e) {
          console.warn("Stock recheck failed:", e);
        }
      })();
    }, 180);
  }

  const cartQtyHardLimitByKey = new Map();

  function getCartQtyHardLimit(cartKey) {
    const key = String(cartKey || "");
    if (!key) return null;
    const value = Number(cartQtyHardLimitByKey.get(key));
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function setCartQtyHardLimit(cartKey, qty) {
    const key = String(cartKey || "");
    const value = Number(qty);
    if (!key || !Number.isFinite(value) || value < 0) return false;
    const prev = getCartQtyHardLimit(key);
    if (prev != null && Math.abs(prev - value) < 1e-9) return false;
    cartQtyHardLimitByKey.set(key, value);
    return true;
  }

  function clearCartQtyHardLimit(cartKey) {
    const key = String(cartKey || "");
    if (!key) return false;
    return cartQtyHardLimitByKey.delete(key);
  }

  function cleanupCartQtyHardLimits() {
    const activeKeys = new Set((Array.isArray(state.cart) ? state.cart : []).map((it) => String(it?.key || "")));
    const toDelete = [];
    cartQtyHardLimitByKey.forEach((_v, key) => {
      if (!activeKeys.has(String(key || ""))) toDelete.push(key);
    });
    toDelete.forEach((key) => cartQtyHardLimitByKey.delete(key));
    return toDelete.length > 0;
  }

  function isCartQtyPlusBlocked(cartKey, currentQty) {
    const limit = getCartQtyHardLimit(cartKey);
    if (limit == null) return false;
    const qty = Number(currentQty || 0);
    if (!Number.isFinite(qty)) return false;
    return qty >= limit - 1e-9;
  }

  function refreshQtyLimitUi() {
    scheduleSyncAllProductCardsFromCart();
    renderCart();
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
    if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
  }

  function resolveCartKeyForQtyChange(pid, delta, cartKey, cartRef = state.cart) {
    let targetKey = cartKey;
    const safeCart = Array.isArray(cartRef) ? cartRef : [];
    if (targetKey == null && delta < 0) {
      let lastIdx = -1;
      for (let i = safeCart.length - 1; i >= 0; i--) {
        if (Number(safeCart[i]?.product_id) === Number(pid)) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx >= 0) targetKey = safeCart[lastIdx].key;
    }
    if (targetKey == null) targetKey = makeCartKey(pid, []);
    return String(targetKey || "");
  }

  function applyQtyChangeOnCartDraft(cartDraft, pid, delta, targetKey) {
    const safeCart = Array.isArray(cartDraft) ? cartDraft : [];
    let item = safeCart.find((x) => String(x?.key || "") === String(targetKey || "")) || null;
    if (!item && delta > 0) {
      item = {
        key: targetKey,
        product_id: pid,
        qty: 0,
        option_item_ids: [],
        option_items: [],
        auto_add: 0,
        auto_add_group_id: null,
      };
      safeCart.push(item);
    }
    const prevQty = Number(item?.qty || 0);
    let nextQty = prevQty;
    if (item) {
      nextQty = Math.max(0, prevQty + delta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        const idx = safeCart.findIndex((x) => String(x?.key || "") === String(targetKey || ""));
        if (idx >= 0) safeCart.splice(idx, 1);
      }
    }
    return { prevQty, nextQty };
  }

  function canUseCartDraftForProductIds(draftCart, productIds) {
    const ids = Array.isArray(productIds)
      ? productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!ids.length) return true;
    for (const depPid of ids) {
      const stockEntry = getStockLevelEntry(depPid);
      if (!stockEntry || stockEntry.qty === null || stockEntry.qty === undefined || stockEntry.isUnlimited) {
        continue;
      }
      const stockQty = Number(stockEntry.qty);
      if (!Number.isFinite(stockQty)) continue;
      const consumed = calcProductStockConsumed(depPid, draftCart);
      if (consumed > stockQty + 1e-9) return false;
    }
    return true;
  }

  function collectRegularCartAffectedProductIds(productId) {
    const pid = Number(productId || 0);
    const ids = new Set();
    if (Number.isFinite(pid) && pid > 0) ids.add(pid);

    const requirements = getProductIngredientRequirementsSync(pid);
    if (requirements === null) {
      ensureProductIngredientRequirements(pid).catch(() => {});
    }
    if (requirements instanceof Map) {
      requirements.forEach((_requiredQty, depPid) => {
        const id = Number(depPid || 0);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      });
    }

    return Array.from(ids);
  }

  function collectComboCartAffectedProductIds(comboItem) {
    const ids = new Set();
    const selections = Array.isArray(comboItem?.selections) ? comboItem.selections : [];

    for (const sel of selections) {
      const selPid = Number(sel?.product_id || 0);
      if (Number.isFinite(selPid) && selPid > 0) {
        ids.add(selPid);
        const requirements = getProductIngredientRequirementsSync(selPid);
        if (requirements === null) {
          ensureProductIngredientRequirements(selPid).catch(() => {});
        }
        if (requirements instanceof Map) {
          requirements.forEach((_requiredQty, depPid) => {
            const id = Number(depPid || 0);
            if (Number.isFinite(id) && id > 0) ids.add(id);
          });
        }
      }

      const selIngredients = Array.isArray(sel?.ingredients_display)
        ? sel.ingredients_display
        : (Array.isArray(sel?.ingredients) ? sel.ingredients : []);
      for (const ing of selIngredients) {
        const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
        if (Number.isFinite(ingPid) && ingPid > 0) ids.add(ingPid);
      }
    }

    return Array.from(ids);
  }

  function canIncreaseComboCartItemBeforeApply(targetKey, delta, opts = {}) {
    const key = String(targetKey || "");
    const safeDelta = Number(delta || 0);
    const showToastOnOut = opts.showToastOnOut !== false;
    const toastMessage = opts.toastMessage || null;

    const currentItem = state.cart.find(
      (x) => String(x?.key || "") === key && String(x?.type || "") === "combo"
    ) || null;
    const currentQty = Number(currentItem?.qty || 0);

    if (!currentItem || !Number.isFinite(safeDelta) || safeDelta <= 0) {
      return { allowed: false, targetKey: key, currentQty, nextQty: currentQty };
    }

    const draft = cloneCartState(state.cart);
    const draftItem = draft.find(
      (x) => String(x?.key || "") === key && String(x?.type || "") === "combo"
    );
    if (!draftItem) {
      return { allowed: false, targetKey: key, currentQty, nextQty: currentQty };
    }

    const nextQty = Math.max(1, Number(draftItem.qty || 0) + safeDelta);
    draftItem.qty = nextQty;

    const affectedProducts = collectComboCartAffectedProductIds(draftItem);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    if (!allowed && showToastOnOut) {
      showToast(toastMessage || "Больше нет в наличии");
    }

    return { allowed, targetKey: key, currentQty, nextQty };
  }

  async function canIncreaseRegularCartItemBeforeApply(pid, delta, targetKey, opts = {}) {
    const safePid = Number(pid || 0);
    const safeDelta = Number(delta || 0);
    const showToastOnOut = opts.showToastOnOut !== false;
    const toastMessage = opts.toastMessage || null;
    const currentQty = Number(getCartItemByKey(targetKey)?.qty || 0);

    if (!Number.isFinite(safePid) || safePid <= 0 || !Number.isFinite(safeDelta) || safeDelta <= 0) {
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    if (isCartQtyPlusBlocked(targetKey, currentQty)) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    if (isProductBlockedByIngredientRequirements(safePid)) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    const draft = cloneCartState(state.cart);
    const { nextQty } = applyQtyChangeOnCartDraft(draft, safePid, safeDelta, targetKey);
    const affectedProducts = collectRegularCartAffectedProductIds(safePid);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    if (!allowed) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty };
    }

    return { allowed: true, targetKey, currentQty, nextQty };
  }

  function refreshNextRegularCartItemLimitLocal(pid, targetKey, expectedQty) {
    const currentItem = getCartItemByKey(targetKey);
    const currentQty = Number(currentItem?.qty || 0);
    if (!currentItem || currentQty <= 0 || currentQty !== Number(expectedQty)) {
      if (clearCartQtyHardLimit(targetKey)) refreshQtyLimitUi();
      return;
    }

    const safePid = Number(pid || 0);
    if (!Number.isFinite(safePid) || safePid <= 0) {
      if (clearCartQtyHardLimit(targetKey)) refreshQtyLimitUi();
      return;
    }

    const draft = cloneCartState(state.cart);
    const draftItem = draft.find((x) => String(x?.key || "") === String(targetKey || ""));
    if (!draftItem) return;
    draftItem.qty = Math.max(1, Number(draftItem.qty || 0) + 1);

    const affectedProducts = collectRegularCartAffectedProductIds(safePid);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    let changed = false;
    if (!allowed) {
      changed = setCartQtyHardLimit(targetKey, currentQty);
    } else {
      changed = clearCartQtyHardLimit(targetKey);
    }
    if (changed) refreshQtyLimitUi();
  }

  function optionItemsTotal(optionItems) {
    return (Array.isArray(optionItems) ? optionItems : []).reduce((sum, opt) => {
      const qty = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
      return sum + Number(opt?.price || 0) * qty;
    }, 0);
  }

  function getAutoRuleByProductId(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return null;
    const rule = state.autoAdd?.byProductId?.get(pid) || null;
    if (rule && !rule.group && state.autoAdd?.byGroupId) {
      rule.group = state.autoAdd.byGroupId.get(Number(rule.group_id)) || null;
    }
    return rule;
  }

  function makeAutoAddDismissKey(groupId, productId) {
    const gid = Number(groupId);
    const pid = Number(productId);
    if (!Number.isFinite(gid) || !Number.isFinite(pid)) return null;
    return `${gid}:${pid}`;
  }

  function saveAutoAddDismissed() {
    markCartUiDirty();
    try {
      localStorage.setItem(AUTO_ADD_DISMISSED_KEY, JSON.stringify(Array.from(state.autoAddDismissed)));
    } catch {}
  }

  function isAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return false;
    return state.autoAddDismissed.has(key);
  }

  function markAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return;
    if (!state.autoAddDismissed.has(key)) {
      state.autoAddDismissed.add(key);
      saveAutoAddDismissed();
    }
  }

  function clearAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return;
    if (state.autoAddDismissed.delete(key)) {
      saveAutoAddDismissed();
    }
  }

  function markAutoAddDismissedByProduct(productId) {
    const rule = getAutoRuleByProductId(productId);
    if (!rule) return;
    markAutoAddDismissed(rule.group_id, productId);
  }

  function clearAutoAddDismissedByProduct(productId) {
    const rule = getAutoRuleByProductId(productId);
    if (!rule) return;
    clearAutoAddDismissed(rule.group_id, productId);
  }

  function clearAllAutoAddDismissed() {
    if (!state.autoAddDismissed.size) return;
    state.autoAddDismissed.clear();
    saveAutoAddDismissed();
  }

  function clearAutoAddDismissedIfCartEmpty() {
    if (cartCountTotal() !== 0) return;
    clearAllAutoAddDismissed();
  }

  function getAutoAddDesiredQty(rule) {
    const minQty = Math.max(0, Number(rule?.min_qty || 0));
    const defaultQty = Math.max(0, Number(rule?.default_qty || 0));
    const desired = Math.max(minQty, defaultQty);
    return desired > 0 ? desired : 1;
  }

  function isPlainCartItem(item) {
    if (!item) return false;
    const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const hasOptions = optionItems.length > 0;
    const hasIngredients = ingredients.length > 0;
    const hasVariant =
      toFiniteNumberOrNull(item.variant_group_id) !== null ||
      toFiniteNumberOrNull(item.variant_value_index) !== null;
    return !hasOptions && !hasIngredients && !hasVariant;
  }

  function parseRuleAmount(val) {
    if (val == null || val === "") return 0;
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const s = String(val).trim().replace(",", ".");
    const n2 = Number(s);
    return Number.isFinite(n2) ? n2 : 0;
  }

  function calcAutoFreeQty(rule, baseTotal) {
    if (!rule) return 0;
    let freeQty = Math.max(0, parseRuleAmount(rule.free_first_qty));
    const amountStep = parseRuleAmount(rule.free_per_amount);
    const stepQty = Math.max(0, parseRuleAmount(rule.free_per_amount_qty));
    if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
      freeQty += Math.floor(baseTotal / amountStep) * stepQty;
    }
    const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
    if (maxFree != null && Number.isFinite(maxFree)) {
      freeQty = Math.min(freeQty, Math.max(0, maxFree));
    }
    return freeQty;
  }

  function getItemUnitParts(item) {
    // ????? ????: unit_price_override ??? ????????? variant_unit_price; ????? ? ???? ???????? (????? ??? ?????????????? ? variant_unit_price: 0)
    const ov = item?.unit_price_override != null ? Number(item.unit_price_override) : null;
    const vp = item?.variant_unit_price != null ? Number(item.variant_unit_price) : null;
    const baseProductUnit = Number(
      (ov != null ? ov : (vp != null && vp !== 0 ? vp : null)) ?? item?.product?.price ?? 0
    );
    const optionTotal = optionItemsTotal(item?.option_items || []);
    const ingredientDiff = Number(item?.ingredient_price_diff || 0);
    const baseUnit = baseProductUnit + optionTotal + ingredientDiff;
    return { baseProductUnit, optionTotal, ingredientDiff, baseUnit };
  }

  function computeNonAutoTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      if (Number(item?.auto_add || 0) === 1) return sum;
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const { baseUnit } = getItemUnitParts(item);
      const unitPrice = roundPrice(baseUnit);
      const lineTotal = roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

  function computeAutoEligibleTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const isAuto = Number(item?.auto_add || 0) === 1;
      if (!isAuto) {
        const parts = getItemUnitParts(item);
        const unitPrice = roundPrice(parts.baseUnit);
        const lineTotal = roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      const rule = getAutoRuleByProductId(item?.product?.id || item?.product_id);
      const parts = getItemUnitParts(item);
      if (!rule) {
        const unitPrice = roundPrice(parts.baseUnit);
        const lineTotal = roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      const unitPrice = roundPrice(priceOverride + parts.optionTotal + parts.ingredientDiff);
      const lineTotal = roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

  function computeItemPricing(item, totals) {
    const qty = Math.max(0, Number(item?.qty || 0));
    const rule = getAutoRuleByProductId(item?.product?.id || item?.product_id);
    const isAuto = Number(item?.auto_add || 0) === 1;
    const parts = getItemUnitParts(item);
    let unitPrice = parts.baseUnit;
    let paidQty = qty;
    let freeQty = 0;
    let isAutoItem = false;
    let discountAmount = 0;
    let discountInfo = null;

    if (rule && isAuto) {
      const group = rule.group || null;
      const nonAutoTotal = totals?.nonAutoTotal ?? 0;
      const autoEligibleTotal = totals?.autoEligibleTotal ?? nonAutoTotal;
      const baseTotal = group && Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      unitPrice = priceOverride + parts.optionTotal + parts.ingredientDiff;
      freeQty = calcAutoFreeQty(rule, baseTotal);
      paidQty = Math.max(0, qty - freeQty);
      isAutoItem = true;
    }

    unitPrice = roundPrice(unitPrice);
    let lineTotal = roundPrice(unitPrice * paidQty);

    function calculateProductDiscountAmount(price, discount) {
      const srcPrice = Number(price || 0);
      if (!(srcPrice > 0) || !discount) return 0;

      const discType = String(discount.discount_type || "").trim();
      const discValue = Number(discount.discount_value || 0);
      if (!(discValue > 0)) return 0;

      let amount = 0;
      if (discType === "percent") {
        amount = srcPrice * (discValue / 100);
      } else if (discType === "fixed") {
        amount = discValue;
      } else if (discType === "special_price") {
        amount = Math.max(0, srcPrice - discValue);
      } else {
        return 0;
      }

      const maxDiscountAmount = Number(discount.max_discount_amount);
      if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && amount > maxDiscountAmount) {
        amount = maxDiscountAmount;
      }
      if (amount > srcPrice) amount = srcPrice;
      return Math.round(amount * 100) / 100;
    }

    // Применяем скидку если есть
    const product = item?.product;
    if (product?.discount && product.discount.discount_amount > 0 && !isAutoItem) {
      discountInfo = product.discount;
      // Рассчитываем скидку на lineTotal
      discountAmount = calculateProductDiscountAmount(lineTotal, discountInfo);
      lineTotal = roundPrice(lineTotal - discountAmount);
    }

    return { lineTotal, unitPrice, paidQty, freeQty, isAuto: isAutoItem, parts, discountAmount, discountInfo };
  }

  function computeCartTotals(items) {
    const nonAutoTotal = computeNonAutoTotal(items);
    const autoEligibleTotal = computeAutoEligibleTotal(items);
    let total = 0;
    let totalDiscount = 0;
    let totalBeforeDiscount = 0;
    
    (Array.isArray(items) ? items : []).forEach((item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return;
      
      if (item.type === "combo") {
        // Для комбо: unit_price_before_discount содержит сумму до скидки комбо
        const unitPrice = Number(item.unit_price_override || 0);
        const unitPriceOld = Number(item.unit_price_before_discount || 0) || unitPrice;
        const lineTotal = roundPrice(unitPrice * qty);
        total += lineTotal;
        totalBeforeDiscount += roundPrice(unitPriceOld * qty);
        // Скидка комбо = разница между старой и новой ценой
        if (unitPriceOld > unitPrice) {
          totalDiscount += roundPrice((unitPriceOld - unitPrice) * qty);
        }
      } else {
        const pricing = computeItemPricing(item, { nonAutoTotal, autoEligibleTotal });
        total += pricing.lineTotal;
        totalDiscount += pricing.discountAmount || 0;
        
        // Рассчитываем оригинальную цену до всех скидок
        const product = item?.product;
        const parts = pricing.parts || {};
        
        // Приоритет: original_price (API) > old_price (админка) > unitPrice
        let originalUnit = pricing.unitPrice;
        if (product?.original_price && Number(product.original_price) > 0) {
          // Цена до API-скидки + опции + ингредиенты
          originalUnit = roundPrice(Number(product.original_price) + (parts.optionTotal || 0) + (parts.ingredientDiff || 0));
        } else if (product?.old_price && Number(product.old_price) > pricing.unitPrice) {
          // Старая цена из админки + опции + ингредиенты
          originalUnit = roundPrice(Number(product.old_price) + (parts.optionTotal || 0) + (parts.ingredientDiff || 0));
        }
        
        // Для auto_add товаров учитываем только платные позиции.
        // Важно: 0 (полностью бесплатные позиции) должен оставаться 0, без fallback на qty.
        const paidQty = Number.isFinite(Number(pricing.paidQty))
          ? Math.max(0, Number(pricing.paidQty))
          : qty;
        totalBeforeDiscount += roundPrice(originalUnit * paidQty);
        
        // Если old_price > текущей цены и нет API-скидки, добавляем эту разницу к totalDiscount
        if (!pricing.discountAmount && product?.old_price && Number(product.old_price) > pricing.unitPrice) {
          const oldPriceDiff = roundPrice((Number(product.old_price) - pricing.unitPrice + (parts.optionTotal || 0) + (parts.ingredientDiff || 0)) * paidQty);
          // Уже учтено в totalBeforeDiscount, добавляем в totalDiscount
          totalDiscount += roundPrice((originalUnit - pricing.unitPrice) * paidQty);
        }
      }
    });
    
    return { nonAutoTotal, autoEligibleTotal, total, totalDiscount, totalBeforeDiscount };
  }

  function cartLinePrice(product, optionItems) {
    return Number(product?.price || 0) + optionItemsTotal(optionItems);
  }

  function formatOptionTitles(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items.map((opt) => str(opt.title || opt.name || "")).filter(Boolean).join(", ");
  }

  // ?????????????? ????????: ????????? ???????? ? ???????? ?????? ?? variant_label
  function formatVariant(variantLabel) {
    if (!variantLabel || !variantLabel.trim()) return null;
    // variant_label ????? ?????? "???????? ??????: ????????" (???????? "???????: 1 ??" ??? "????: 200?")
    const parts = variantLabel.split(":");
    if (parts.length >= 2) {
      const groupTitle = parts[0].trim();
      const value = parts.slice(1).join(":").trim();
      if (!value) return null;
      return `${value} ${groupTitle}`;
    }
    // ???? ?????? ???????????, ?????????? ??? ????
    return variantLabel.trim();
  }

  // ?????????????? ???????????: ????????????????? ???????? (??????? ? 0 ?? ??????????)
  function formatIngredient(ing) {
    const name = str(ing.ingredient_name || "");
    if (!name) return null;
    const qty = Number(ing.quantity ?? ing.qty ?? 1);
    if (qty <= 0) return null;
    const unit = str(ing.unit_label || "");
    // ??????: ????????????????? ???????? (???????? "150? ???????????? ????")
    return `${qty}${unit} ${name}`.trim();
  }

  // ?????????????? ?????: ????????????????? ????????
  function formatOption(opt) {
    const name = str(opt.title || opt.name || "");
    if (!name) return null;
    
    // ???? ? ????? ???? ??????? (variant_label), ?????????? ??? ?????? ?????????? "??"
    const variantLabel = str(opt.variant_label || "").trim();
    if (variantLabel) {
      // variant_label ??? ???????? ???????? ? ???????? (???????? "200?")
      return `${variantLabel} ${name}`;
    }
    
    // ???? ???????? ???, ?????????? ??????????? ?????? ? ???????????
    const optQty = Math.max(1, Number(opt.qty || 1));
    // ??? ????В корзине пусто? "??", ?? ????? ???? ? ????????
    // ??????: ????????????????? ???????? (???????? "1?? ???????????? ????")
    return `${optQty}шт ${name}`;
  }

  function mergeVariantUnitForOrder(labelRaw, unitRaw) {
    const cleanLabel = str(labelRaw || "").trim();
    const cleanUnit = str(unitRaw || "").trim();
    if (!cleanLabel) return cleanUnit;
    if (!cleanUnit) return cleanLabel;
    const escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const measureMatch = cleanLabel.match(new RegExp(`^\\s*([\\d.,]+\\s*${escapedUnit})(?:\\b|\\s|$)`, "i"));
    if (measureMatch && str(measureMatch[1] || "").trim()) {
      return str(measureMatch[1] || "").trim();
    }
    const labelLower = cleanLabel.toLowerCase();
    const unitLower = cleanUnit.toLowerCase();
    if (labelLower.endsWith(` ${unitLower}`) || labelLower === unitLower) return cleanLabel;
    return `${cleanLabel} ${cleanUnit}`.trim();
  }

  function isDefaultVariantLabelForOrder(valueRaw) {
    const value = str(valueRaw || "").trim().toLowerCase();
    return value === "не указано" || value === "не указано:";
  }

  function normalizeVariantDisplayLineForOrder(lineRaw, groupTitleRaw) {
    let line = str(lineRaw || "").trim();
    if (!line) return "";

    const groupTitle = str(groupTitleRaw || "").trim();
    if (groupTitle) {
      const escapedGroupTitle = groupTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      line = line.replace(new RegExp(`\\s+${escapedGroupTitle}(?:\\s*\\([^)]*\\))?\\s*$`, "i"), "").trim();
    }

    if (!line) return "";
    const compactMatch = line.match(/^([\d.,]+\s+[^\s()]+)\s+.+$/);
    if (compactMatch && (groupTitle || line.includes("("))) {
      return str(compactMatch[1] || "").trim();
    }
    return line;
  }

  function buildVariantDisplayLineForOrder(labelRaw, unitRaw, groupTitleRaw) {
    const rawLabel = str(labelRaw || "").trim();
    const rawUnit = str(unitRaw || "").trim();

    let line = mergeVariantUnitForOrder(rawLabel, rawUnit);
    if (!line && rawLabel) {
      if (rawLabel.includes(":")) {
        const valueOnly = str(rawLabel.split(":").slice(1).join(":")).trim();
        line = valueOnly || rawLabel;
      } else {
        line = rawLabel;
      }
    }
    line = normalizeVariantDisplayLineForOrder(line, groupTitleRaw);
    if (!line) return "";
    if (isDefaultVariantLabelForOrder(line)) return "";
    return line;
  }

  function formatQtyUnitNameForOrder(qtyRaw, unitRaw, nameRaw) {
    const qtyNum = Number(qtyRaw);
    const qtyText = Number.isFinite(qtyNum)
      ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
      : str(qtyRaw ?? "").trim();
    const unitText = str(unitRaw || "").trim();
    const nameText = str(nameRaw || "").trim();
    return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
  }

  function formatIngredientLineForOrder(ing) {
    const rawQty = ing?.qty ?? ing?.quantity;
    const numQty = Number(rawQty);
    if (!Number.isFinite(numQty) || numQty <= 0) return "";
    const unitText = str(
      ing?.unit ||
      ing?.unit_label ||
      ing?.unitLabel ||
      ing?.unit_short_title ||
      ing?.unit_title ||
      ""
    ).trim();
    const nameText = str(ing?.name || ing?.ingredient_name || ing?.ingredientName || "").trim();
    return formatQtyUnitNameForOrder(rawQty, unitText, nameText);
  }

  function formatOptionLineForOrder(opt) {
    const qtyText = Math.max(1, Number(opt?.qty || opt?.quantity || 1));
    const title = str(opt?.title || opt?.name || "").trim();
    if (!title) return "";
    const variantLine = buildVariantDisplayLineForOrder(
      opt?.variant_label || opt?.variantLabel,
      opt?.variant_unit || opt?.variantUnit,
      opt?.variant_group_title || opt?.group_title || ""
    );
    return variantLine ? `${variantLine} ${title}`.trim() : `${qtyText} ${title}`.trim();
  }

  // ?????????????? ?????? ?????? - ???????? ? ?????????? ??????? ??? ????????????? ? bottom sheet
  function normalizeFavoriteOptionItemsFromCart(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items
      .map((opt) => {
        const id = Number(opt?.id || 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        const qty = Math.max(1, Number(opt?.qty ?? opt?.quantity ?? 1));
        const targetProductId = toFiniteNumberOrNull(opt?.target_product_id ?? opt?.product_id);
        return {
          id,
          title: str(opt?.title || opt?.name || ""),
          name: str(opt?.name || opt?.title || ""),
          price: Number(opt?.price || 0),
          qty,
          quantity: qty,
          target_product_id: targetProductId,
          product_id: targetProductId,
          variant_group_id: toFiniteNumberOrNull(opt?.variant_group_id),
          variant_value_index: toFiniteNumberOrNull(opt?.variant_value_index),
          variant_label: str(opt?.variant_label || ""),
          variant_price_diff: Number(opt?.variant_price_diff || 0),
        };
      })
      .filter(Boolean);
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
          ingredient_name: str(ing?.ingredient_name || ing?.name || ""),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity,
          qty: quantity,
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit_label: str(ing?.unit_label || ing?.unit || ""),
          unit: str(ing?.unit || ing?.unit_label || ""),
        };
      })
      .filter(Boolean);
  }

  function buildFavoriteSnapshotFromResolvedItem(resolvedItem, { pricing = null, oldLineTotal = null } = {}) {
    if (!resolvedItem || typeof resolvedItem !== "object") return null;

    if (String(resolvedItem.type || "") === "combo") {
      const comboId = Number(resolvedItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;
      const qty = Math.max(1, Number(resolvedItem.qty || 1));
      const unitPrice = Number(resolvedItem.unit_price_override || 0);
      const lineTotal = roundPrice(unitPrice * qty);
      const oldLine = oldLineTotal != null
        ? roundPrice(Number(oldLineTotal || 0))
        : roundPrice((Number(resolvedItem.unit_price_before_discount || 0) || unitPrice) * qty);
      const selections = (Array.isArray(resolvedItem.selections) ? resolvedItem.selections : []).map((sel) => ({
        product_id: toFiniteNumberOrNull(sel?.product_id),
        product_name: str(sel?.product_name || ""),
        product_photo: str(sel?.product_photo || ""),
        variant_label: str(sel?.variant_label || ""),
        variant_group_id: toFiniteNumberOrNull(sel?.variant_group_id),
        variant_value_index: toFiniteNumberOrNull(sel?.variant_value_index),
        variant_group_title: str(sel?.variant_group_title || ""),
        variant_unit: str(sel?.variant_unit || ""),
        unit_id: toFiniteNumberOrNull(sel?.unit_id),
        unit_price_override: sel?.unit_price_override != null ? Number(sel.unit_price_override) : null,
        unit_price_before_discount: sel?.unit_price_before_discount != null ? Number(sel.unit_price_before_discount) : null,
        ingredients_display: (Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : []).map((ing) => ({
          ingredient_id: toFiniteNumberOrNull(ing?.ingredient_id),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity: Number(ing?.quantity ?? ing?.qty ?? 0),
          qty: Number(ing?.qty ?? ing?.quantity ?? 0),
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit: str(ing?.unit || ing?.unit_label || ""),
        })),
      }));
      const photos = selections.map((sel) => str(sel.product_photo || "")).filter(Boolean);

      return {
        type: "combo",
        combo_id: comboId,
        combo_title: str(resolvedItem.combo_title || "Комбо"),
        name: str(resolvedItem.combo_title || resolvedItem.name || "Комбо"),
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
    const selectedOptionItems = normalizeFavoriteOptionItemsFromCart(
      Array.isArray(resolvedItem.option_items) ? resolvedItem.option_items : []
    );
    const ingredients = normalizeFavoriteIngredientsFromCart(
      Array.isArray(resolvedItem.ingredients) ? resolvedItem.ingredients : []
    );
    const variantGroupId = toFiniteNumberOrNull(resolvedItem.variant_group_id);
    const variantValueIndex = toFiniteNumberOrNull(resolvedItem.variant_value_index);
    const variantLabel = str(resolvedItem.variant_label || "").trim();
    const hasVariant = variantLabel || (variantGroupId != null && variantValueIndex != null);
    const variantDiff = Number(resolvedItem.variant_unit_price || 0) - Number(product?.price || 0);

    let pricingData = pricing;
    if (!pricingData) {
      const resolvedItems = cartItemsResolved();
      const totals = {
        nonAutoTotal: computeNonAutoTotal(resolvedItems),
        autoEligibleTotal: computeAutoEligibleTotal(resolvedItems),
      };
      pricingData = computeItemPricing(
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
          auto_add_group_id: toFiniteNumberOrNull(resolvedItem.auto_add_group_id),
        },
        totals
      );
    }

    const lineTotal = roundPrice(Number(pricingData?.lineTotal || 0));
    const unitPrice = roundPrice(Number(pricingData?.unitPrice || (qty > 0 ? lineTotal / qty : 0)));
    const oldLineFromArg = oldLineTotal != null ? roundPrice(Number(oldLineTotal || 0)) : 0;
    const oldPricePerUnit = Number(product?.old_price || 0);
    const oldLineFromProduct = oldPricePerUnit > 0 ? roundPrice(oldPricePerUnit * qty) : 0;
    const originalLineTotal = oldLineFromArg > 0 ? oldLineFromArg : oldLineFromProduct;
    const showOldLine = originalLineTotal > lineTotal;

    const variantEntries = hasVariant
      ? [{
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        group_title: "",
        value: variantLabel,
        label: variantLabel,
        price_diff: Number.isFinite(variantDiff) ? variantDiff : 0,
      }]
      : [];

    return {
      type: "product",
      product_id: productId,
      name: str(product?.name || resolvedItem.name || "Товар"),
      qty,
      price: Number(unitPrice || 0),
      old_price: showOldLine ? roundPrice(originalLineTotal / qty) : Number(oldPricePerUnit || 0),
      line_total: Number(lineTotal || 0),
      photos: safePhotos(product),
      option_item_ids: selectedOptionItems.map((opt) => Number(opt.id)),
      options: selectedOptionItems,
      option_items: selectedOptionItems,
      ingredients,
      variant_group_id: variantGroupId,
      variant_value_index: variantValueIndex,
      variant_label: variantLabel,
      variants: variantEntries,
      discount: showOldLine ? { original_line_total: Number(originalLineTotal) } : null,
    };
  }

  window.formatOrderItem = function formatOrderItem(item) {
    if (item.type === "combo") {
      const selections = Array.isArray(item.selections) ? item.selections : [];
      const selectionPhotos = selections
        .map((sel) => str(sel?.product_photo || "").trim())
        .filter(Boolean);
      const fallbackPhotos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
      const photos = (selectionPhotos.length ? selectionPhotos : fallbackPhotos).slice(0, 4);
      const comboGridOrder = [0, 2, 3, 1];
      const itemQty = Math.max(1, Number(item.qty || item.quantity || 1));
      const comboTitle = str(item.name || item.combo_title || "Комбо").trim() || "Комбо";

      let html = `<div class="cart-row cart-row--combo">`;
      html += `<div class="cart-combo-thumb">`;
      for (let i = 0; i < 4; i += 1) {
        const photo = photos[comboGridOrder[i]] || "";
        const cellClass = `cart-combo-thumb__cell${photo ? "" : " cart-combo-thumb__cell--empty"}`;
        html += `<div class="${cellClass}">`;
        if (photo) {
          html += `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />`;
        }
        html += `</div>`;
      }
      html += `</div>`;

      html += `<div class="cart-mid">`;
      html += `<div class="cart-title">${itemQty} x ${escapeHtml(comboTitle)}</div>`;
      if (selections.length) {
        html += `<div class="cart-sub-container cart-combo-details" style="margin-top: 4px; padding-left: 8px;">`;
        selections.forEach((sel) => {
          const productName = str(sel?.product_name || "").trim();
          const variantLine = buildVariantDisplayLineForOrder(
            sel?.variant_label,
            sel?.variant_unit,
            sel?.variant_group_title
          );
          const primaryLine = [variantLine, productName].filter(Boolean).join(" ").trim() || (productName || "Товар");

          html += `<div class="cart-combo-detail-block">`;
          html += `<div class="cart-combo-detail-name" style="font-weight: 600;">1 x ${escapeHtml(primaryLine)}</div>`;

          const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
          ingredientsDisplay.forEach((ing) => {
            const line = formatIngredientLineForOrder(ing);
            if (!line) return;
            html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">&bull; ${escapeHtml(line)}</div>`;
          });

          html += `</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;

      const comboLineTotalRaw = Number(item.line_total);
      const comboLineTotal = Number.isFinite(comboLineTotalRaw)
        ? comboLineTotalRaw
        : Number(item.price || 0);
      const comboOldLineTotal = Number(item.old_line_total || 0);
      const comboShowOld = comboOldLineTotal > comboLineTotal;
      const comboPriceHtml = comboShowOld
        ? `<span class="cart-old">${money(comboOldLineTotal)}</span>${money(comboLineTotal)}`
        : money(comboLineTotal);
      html += `<div class="cart-right"><div class="cart-price">${comboPriceHtml}</div></div>`;
      html += `</div>`;
      return html;
    }

    const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
    const mainPhoto = photos[0] || "/static/img/placeholder.png";
    const itemQty = Math.max(1, Number(item.qty || item.quantity || 1));
    const productName = str(item.name || "Товар").trim() || "Товар";

    const variantLines = [];
    const variants = Array.isArray(item.variants) ? item.variants : [];
    variants.forEach((v) => {
      const line = buildVariantDisplayLineForOrder(
        v?.label || v?.value,
        v?.unit || v?.unit_short_title || v?.unitLabel || "",
        v?.group_title || ""
      );
      if (line) variantLines.push(line);
    });
    if (!variantLines.length) {
      const fallbackVariant = buildVariantDisplayLineForOrder(
        item?.variant_label,
        item?.variant_unit || item?.variantUnit || "",
        item?.variant_group_title || ""
      );
      if (fallbackVariant) variantLines.push(fallbackVariant);
    }

    const primaryVariantLine = variantLines.length ? variantLines[0] : "";
    const titleBase = [primaryVariantLine, productName].filter(Boolean).join(" ").trim() || productName;

    const detailLines = [];
    if (variantLines.length > 1) detailLines.push(...variantLines.slice(1));

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    ingredients.forEach((ing) => {
      const line = formatIngredientLineForOrder(ing);
      if (line) detailLines.push(line);
    });

    const options = Array.isArray(item.options) ? item.options : [];
    options.forEach((opt) => {
      if (Number(opt?.qty ?? opt?.quantity ?? 0) <= 0) return;
      const line = formatOptionLineForOrder(opt);
      if (line) detailLines.push(line);
    });

    let html = `<div class="cart-row">`;
    html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
    html += `<div class="cart-mid">`;
    html += `<div class="cart-title">${itemQty} x ${escapeHtml(titleBase)}</div>`;

    if (detailLines.length > 0) {
      html += `<div class="cart-sub-container">`;
      html += `<div class="cart-sub-details" style="display: block; margin-top: 4px; padding-left: 8px;">`;
      detailLines.forEach((line) => {
        html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">&bull; ${escapeHtml(line)}</div>`;
      });
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`;

    const itemLineTotalRaw = Number(item.line_total);
    const itemLineTotal = Number.isFinite(itemLineTotalRaw)
      ? itemLineTotalRaw
      : Number(item.price || 0);
    const discountOriginal = item.discount?.original_line_total;
    const itemOldPrice = Number(item.old_price || 0);
    const qtyForOldPrice = Number(item.qty || item.quantity || 1);
    const itemOldLineTotal = discountOriginal || (itemOldPrice > 0 ? itemOldPrice * qtyForOldPrice : 0);
    const itemShowOld = itemOldLineTotal > itemLineTotal;
    const itemPriceHtml = itemShowOld
      ? `<span class="cart-old">${money(itemOldLineTotal)}</span>${money(itemLineTotal)}`
      : money(itemLineTotal);
    html += `<div class="cart-right">`;
    html += `<div class="cart-price">${itemPriceHtml}</div>`;
    html += `</div>`;

    html += `</div>`;
    return html;
  };

  // -----------------------------
  // Cart warmup: ensure products for all cart items are in cache
  // (????? ??????? ?? ???????? ?В корзине пусто???? ?????????)
  // -----------------------------
  async function ensureProductForWarmup(pid) {
    const id = Number(pid);
    if (!Number.isFinite(id)) return null;
    if (state.productCache.has(id)) return state.productCache.get(id);

    if (typeof ensureProduct === "function") {
      return ensureProduct(id);
    }

    // Late bundle may not be loaded yet during first paint.
    try {
      await ensureShopLateLoaded();
    } catch {}

    if (typeof ensureProduct === "function") {
      return ensureProduct(id);
    }

    // Fallback to a direct fetch so warmup never throws on missing late API.
    const json = await apiJson(`/api/public/products/${id}`);
    const p = json.data;
    if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
    cacheStockFromProductPayload(p, "product_warmup");
    p.is_available = isProductAvailable(p);
    state.productCache.set(id, p);
    return p;
  }

  async function warmupCartProducts() {
    const missing = [];
    for (const item of state.cart) {
      const pid = Number(item.product_id);
      const qty = Number(item.qty || 0);
      if (!qty || !Number.isFinite(pid)) continue;
      if (!state.productCache.has(pid)) missing.push(pid);
    }
    if (!missing.length) return;

    await Promise.all(
      missing.map(async (pid) => {
        try {
          await ensureProductForWarmup(pid);
        } catch (e) {
          // ???? ????? ?????? ??? API ?????????? ? ?? ??????, ?????? ??????????.
          console.warn("warmupCartProducts: failed to load product", pid, e);
        }
      })
    );
  }

  function loadFavs() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? new Set(arr.map((x) => Number(x))) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveFavs(set) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  const favoritesCacheState = {
    loaded: false,
    items: [],
    byId: new Map(),
  };

  function normalizeFavoriteApiRow(row) {
    if (!row || typeof row !== "object") return null;
    const id = Number(row.id || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const itemRaw = row.item && typeof row.item === "object"
      ? row.item
      : (row.item_json && typeof row.item_json === "object" ? row.item_json : null);
    if (!itemRaw || typeof itemRaw !== "object") return null;
    return {
      id,
      item_signature: str(row.item_signature || row.signature || ""),
      item_type: str(row.item_type || row.type || ""),
      product_id: toFiniteNumberOrNull(row.product_id),
      combo_id: toFiniteNumberOrNull(row.combo_id),
      title: str(row.title || ""),
      photo: str(row.photo || ""),
      item: itemRaw,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  function setFavoritesCache(items) {
    const list = Array.isArray(items) ? items : [];
    favoritesCacheState.items = list.map(normalizeFavoriteApiRow).filter(Boolean);
    favoritesCacheState.byId = new Map(favoritesCacheState.items.map((fav) => [Number(fav.id), fav]));
    favoritesCacheState.loaded = true;
  }

  function resetFavoritesCache() {
    favoritesCacheState.loaded = false;
    favoritesCacheState.items = [];
    favoritesCacheState.byId = new Map();
  }

  function getCachedFavorites() {
    if (!favoritesCacheState.loaded) return [];
    return favoritesCacheState.items.slice();
  }

  async function fetchFavoritesList({ force = false } = {}) {
    const token = getCustomerToken();
    if (!token) {
      resetFavoritesCache();
      return [];
    }

    if (!force && favoritesCacheState.loaded) {
      return getCachedFavorites();
    }

    const json = await apiJson("/api/public/me/favorites");
    const rows = Array.isArray(json.data) ? json.data : [];
    setFavoritesCache(rows);
    return getCachedFavorites();
  }

  async function addFavoriteItemSnapshot(item) {
    const token = getCustomerToken();
    if (!token) {
      const err = new Error("UNAUTHORIZED");
      err.httpStatus = 401;
      throw err;
    }
    const json = await apiJson("/api/public/me/favorites", {
      method: "POST",
      body: { item },
    });
    const row = normalizeFavoriteApiRow(json?.data || null);
    if (row) {
      if (!favoritesCacheState.loaded) favoritesCacheState.loaded = true;
      const prevIdx = favoritesCacheState.items.findIndex((fav) => Number(fav.id) === Number(row.id));
      if (prevIdx >= 0) favoritesCacheState.items.splice(prevIdx, 1);
      favoritesCacheState.items.unshift(row);
      favoritesCacheState.byId.set(Number(row.id), row);
    }
    return row;
  }

  async function removeFavoriteById(favoriteId) {
    const id = Number(favoriteId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    const token = getCustomerToken();
    if (!token) {
      const err = new Error("UNAUTHORIZED");
      err.httpStatus = 401;
      throw err;
    }
    await apiJson(`/api/public/me/favorites/${id}`, { method: "DELETE" });
    if (favoritesCacheState.loaded) {
      favoritesCacheState.items = favoritesCacheState.items.filter((fav) => Number(fav.id) !== id);
      favoritesCacheState.byId.delete(id);
    }
    return true;
  }

  function promptFavoritesLogin() {
    showToast("Войдите в профиль, чтобы использовать избранное");
    if (typeof openProfileSheet === "function") {
      try {
        openProfileSheet();
      } catch {}
    }
  }

  window.shopFavoritesApi = {
    list: fetchFavoritesList,
    add: addFavoriteItemSnapshot,
    remove: removeFavoriteById,
    clearCache: resetFavoritesCache,
    getCached: getCachedFavorites,
  };

  function loadCheckoutDraft() {
    try {
      const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function saveCheckoutDraft(draft) {
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft || {}));
    } catch {}
  }


  // -----------------------------
  // Addresses (cart chip + form)
  // -----------------------------
  function loadAddressDraft() {
    try {
      const raw = localStorage.getItem(ADDRESS_DRAFT_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }

  function saveAddressDraft(addr) {
    try {
      if (!addr) {
        localStorage.removeItem(ADDRESS_DRAFT_KEY);
        return;
      }
      localStorage.setItem(ADDRESS_DRAFT_KEY, JSON.stringify(addr));
    } catch {}
  }

  function clearAddressDraft() {
    try { localStorage.removeItem(ADDRESS_DRAFT_KEY); } catch {}
  }

  function normalizeAddressCoordinate(value, axis = "lat") {
    const raw = str(value).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    const limit = axis === "lat" ? 90 : 180;
    if (numeric < -limit || numeric > limit) return null;
    return Number(numeric.toFixed(7));
  }

  function normalizeAddressId(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric);
  }

  function buildAddressLookupDisplay(address) {
    const source = address && typeof address === "object" ? address : {};
    const city = str(source.city).trim();
    const locality = str(source.address_context_locality || source.context_locality).trim();
    const street = str(source.street).trim();
    const house = str(source.house).trim();
    const normalized = str(source.address_normalized_display).trim();
    const base = [street, house].filter(Boolean).join(", ").trim() || normalized;
    if (!base) return "";
    if (!locality || locality.toLowerCase() === city.toLowerCase()) return base;
    if (base.toLowerCase().startsWith(locality.toLowerCase())) return base;
    return `${locality}, ${base}`;
  }

  function getAddressLookupItemType(item) {
    const rawType = str(item && (item.object_type || item.selected_object_type)).trim().toLowerCase();
    if (rawType === "street") return "street";
    if (rawType === "context-locality" || rawType === "place" || rawType === "context") return "context-locality";
    return "address";
  }

  function buildAddressLookupSelectionDisplay(item, cityValue = "") {
    const source = item && typeof item === "object" ? item : {};
    const itemType = getAddressLookupItemType(source);
    const city = str(cityValue || source.city_name).trim();
    const context = str(source.context_locality || source.city_name || city).trim();
    if (itemType === "context-locality") {
      return context ? `${context}, ` : "";
    }

    const street = str(source.street_name || source.value || source.label).trim();
    const house = str(source.house_number || source.house).trim();
    const display = buildAddressLookupDisplay({
      city,
      street,
      house: itemType === "address" ? house : "",
      address_context_locality: context,
      address_normalized_display: str(source.full_address || source.value || source.label).trim() || street,
    });
    if (itemType === "street" && display) {
      return `${display}, `.replace(/\s*,\s*$/, ", ");
    }
    return display;
  }

  function buildAddressLookupSuggestionTitle(item, cityValue = "") {
    const source = item && typeof item === "object" ? item : {};
    const itemType = getAddressLookupItemType(source);
    if (itemType === "context-locality") {
      return str(source.context_locality || source.city_name || source.value || source.label).trim();
    }
    if (itemType === "street") {
      return str(source.street_name || source.value || source.label).trim();
    }
    return buildAddressLookupDisplay({
      city: str(cityValue || source.city_name).trim(),
      street: str(source.street_name || source.value || source.label).trim(),
      house: str(source.house_number || source.house).trim(),
      address_context_locality: str(source.context_locality || source.city_name).trim(),
      address_normalized_display: str(source.full_address || source.value || source.label).trim(),
    }) || str(source.full_address || source.value || source.label).trim();
  }

  function buildAddressLookupIntermediateState(item, cityValue = "", currentResolved = null) {
    const source = item && typeof item === "object" ? item : {};
    const current = currentResolved && typeof currentResolved === "object" ? currentResolved : {};
    const display = buildAddressLookupSelectionDisplay(source, cityValue);
    return {
      address_ref: str(source.source_key || source.selected_source_key).trim() || null,
      selected_object_type: getAddressLookupItemType(source),
      resolved_city_source_key: str(current.resolved_city_source_key || source.locality_source_key).trim() || null,
      address_context_locality: str(source.context_locality || source.city_name).trim() || null,
      address_normalized_display: display || null,
      lat: null,
      lng: null,
      delivery_zone_id: null,
      delivery_store_id: null,
      _lookup_prefix: display || null,
    };
  }

  function shouldPreserveAddressLookupResolution(resolvedState, nextValue) {
    const resolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const selectedType = str(resolved.selected_object_type).trim().toLowerCase();
    if (selectedType !== "street" && selectedType !== "context-locality") return false;
    const lookupValue = str(nextValue).trim().toLowerCase();
    const prefix = str(resolved._lookup_prefix || resolved.address_normalized_display).trim().toLowerCase();
    if (!lookupValue || !prefix) return false;
    return lookupValue === prefix || lookupValue.startsWith(prefix);
  }

  function extractResolvedAddressState(source) {
    const address = source && typeof source === "object" ? source : {};
    return {
      address_ref: str(address.address_ref).trim() || null,
      selected_object_type: str(address.selected_object_type).trim() || null,
      resolved_city_source_key: str(address.resolved_city_source_key).trim() || null,
      address_context_locality: str(address.address_context_locality || address.context_locality).trim() || null,
      address_normalized_display: str(address.address_normalized_display).trim() || buildAddressLookupDisplay(address) || null,
      lat: normalizeAddressCoordinate(address.lat, "lat"),
      lng: normalizeAddressCoordinate(address.lng, "lng"),
      delivery_zone_id: normalizeAddressId(address.delivery_zone_id),
      delivery_store_id: normalizeAddressId(address.delivery_store_id),
    };
  }

  function resetAddressFormResolvedState(source = null) {
    state._addressFormResolved = extractResolvedAddressState(source);
  }

  function clearAddressFormResolution({ syncLookupFromFields = true, clearLookup = false } = {}) {
    const current = state._addressFormResolved || {};
    state._addressFormResolved = {
      address_ref: null,
      selected_object_type: null,
      resolved_city_source_key: current.resolved_city_source_key || null,
      address_context_locality: null,
      address_normalized_display: null,
      lat: null,
      lng: null,
      delivery_zone_id: null,
      delivery_store_id: null,
    };
    if (elAddrLookup) {
      if (clearLookup) {
        elAddrLookup.value = "";
      } else if (syncLookupFromFields) {
        elAddrLookup.value = buildAddressLookupDisplay({
          city: elAddrCity?.dataset?.value || "",
          street: elAddrStreet?.value || "",
          house: elAddrHouse?.value || "",
          address_context_locality: "",
        });
      }
    }
  }

  function syncAddressLookupResolutionFromInputValue(value) {
    if (shouldPreserveAddressLookupResolution(state._addressFormResolved, value)) {
      state._addressFormResolved = {
        ...(state._addressFormResolved || {}),
        address_normalized_display: str(value).trim() || null,
        lat: null,
        lng: null,
        delivery_zone_id: null,
        delivery_store_id: null,
      };
      return;
    }
    clearAddressFormResolution({ syncLookupFromFields: false });
  }

  function getAddressLookupContinuationInfo(value, resolvedState = null) {
    const lookupValue = str(value).trim();
    const currentResolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const selectedType = getAddressLookupItemType(currentResolved);
    const selectedSourceKey = str(currentResolved.address_ref).trim();
    const citySourceKey = str(currentResolved.resolved_city_source_key).trim();
    if (!lookupValue) {
      return {
        preserve: false,
        stage: "address",
        query: "",
        selectedSourceKey: "",
        citySourceKey,
      };
    }

    if (shouldPreserveAddressLookupResolution(currentResolved, lookupValue)) {
      const prefix = str(currentResolved._lookup_prefix || currentResolved.address_normalized_display).trim();
      const suffix = prefix && lookupValue.toLowerCase().startsWith(prefix.toLowerCase())
        ? str(lookupValue.slice(prefix.length)).trim()
        : lookupValue;
      return {
        preserve: true,
        stage: selectedType === "street" && suffix ? "house" : "address",
        query: suffix || lookupValue,
        selectedSourceKey: selectedType === "street" || selectedType === "context-locality" ? selectedSourceKey : "",
        citySourceKey,
      };
    }

    return {
      preserve: false,
      stage: "address",
      query: lookupValue,
      selectedSourceKey: "",
      citySourceKey,
    };
  }

  function normalizeAddressPayload(p) {
    const a = p && typeof p === "object" ? p : {};
    const out = {
      city: str(a.city).trim() || null,
      street: str(a.street).trim(),
      house: str(a.house).trim(),
      entrance: str(a.entrance).trim(),
      floor: str(a.floor).trim(),
      apartment: str(a.apartment).trim(),
      comment: str(a.comment).trim(),
      address_ref: str(a.address_ref).trim() || null,
      selected_object_type: str(a.selected_object_type).trim() || null,
      resolved_city_source_key: str(a.resolved_city_source_key).trim() || null,
      address_context_locality: str(a.address_context_locality || a.context_locality).trim() || null,
      address_normalized_display: str(a.address_normalized_display).trim() || buildAddressLookupDisplay(a) || null,
      lat: normalizeAddressCoordinate(a.lat, "lat"),
      lng: normalizeAddressCoordinate(a.lng, "lng"),
      delivery_zone_id: normalizeAddressId(a.delivery_zone_id),
      delivery_store_id: normalizeAddressId(a.delivery_store_id),
    };
    if (!out.entrance) out.entrance = null;
    if (!out.floor) out.floor = null;
    if (!out.apartment) out.apartment = null;
    if (!out.comment) out.comment = null;
    if (out.lat == null || out.lng == null) {
      out.delivery_zone_id = null;
      out.delivery_store_id = null;
    }
    return out;
  }

  function formatAddressLine(a) {
    if (!a) return "";
    const city = str(a.city).trim();
    const street = str(a.street).trim();
    const house = str(a.house).trim();

    const parts = [];
    if (city) parts.push(city);
    if (street || house) parts.push([street, house].filter(Boolean).join(" ").trim());

    if (a.entrance) parts.push(`подъезд ${str(a.entrance).trim()}`);
    if (a.floor) parts.push(`этаж ${str(a.floor).trim()}`);
    if (a.apartment) parts.push(`кв ${str(a.apartment).trim()}`);

    return parts.filter(Boolean).join(", ");
  }

  function getSelectedAddressLine() {
    return state.selectedAddress ? formatAddressLine(state.selectedAddress) : "";
  }

  const HEADER_STREET_TYPE_PREFIX_RE = /^\s*(?:(?:улица|ул\.?)|(?:проспект|просп\.?|пр-т|пр-кт)|(?:переулок|пер\.?)|(?:проезд|пр-д)|(?:бульвар|бул\.?|б-р)|(?:площадь|пл\.?)|(?:шоссе|ш\.?)|(?:аллея|ал\.?)|(?:набережная|наб\.?)|(?:тупик|туп\.?)|(?:тракт|тр\.?)|(?:линия|лин\.?)|(?:микрорайон|мкр\.?|мкрн\.?)|(?:квартал|кв-л)|(?:дорога|дор\.?))\s+/i;
  const HEADER_STREET_TYPE_SUFFIX_RE = /\s+(?:(?:улица|ул\.?)|(?:проспект|просп\.?|пр-т|пр-кт)|(?:переулок|пер\.?)|(?:проезд|пр-д)|(?:бульвар|бул\.?|б-р)|(?:площадь|пл\.?)|(?:шоссе|ш\.?)|(?:аллея|ал\.?)|(?:набережная|наб\.?)|(?:тупик|туп\.?)|(?:тракт|тр\.?)|(?:линия|лин\.?)|(?:микрорайон|мкр\.?|мкрн\.?)|(?:квартал|кв-л)|(?:дорога|дор\.?))\.?\s*$/i;

  function normalizeHeaderStreetName(streetRaw) {
    const street = str(streetRaw).trim();
    if (!street) return "";
    const strippedPrefix = street.replace(HEADER_STREET_TYPE_PREFIX_RE, "").trim();
    const strippedSuffix = strippedPrefix.replace(HEADER_STREET_TYPE_SUFFIX_RE, "").trim();
    return strippedSuffix || strippedPrefix || street;
  }

  function formatHeaderAddressStreetHouseApartment(a) {
    if (!a) return "";
    const street = normalizeHeaderStreetName(a.street) || str(a.street).trim();
    const house = str(a.house).trim();
    const apartment = str(a.apartment).trim();

    const base = [street, house].filter(Boolean).join(" ").trim();
    if (!base) return "";
    if (!apartment) return base;
    return `${base}, кв ${apartment}`;
  }

  function formatHeaderPickupStoreAddress(store) {
    if (!store) return "";
    const rawAddress = str(store.address).trim();
    const fallback = rawAddress || str(store.name).trim();
    if (!rawAddress) return fallback;

    const parts = rawAddress.split(",").map((part) => str(part).trim()).filter(Boolean);
    if (!parts.length) return fallback;

    let house = "";
    let street = "";
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      if (!/\d/.test(part)) continue;
      house = part;
      street = i > 0 ? parts[i - 1] : "";
      break;
    }

    if (!street) {
      street = parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
    }

    const normalizedStreet = normalizeHeaderStreetName(street);
    const compact = [normalizedStreet, house].filter(Boolean).join(" ").trim();
    return compact || fallback;
  }

  function formatAddressStreetHouseApartment(a) {
    if (!a) return "";
    const street = str(a.street).trim();
    const house = str(a.house).trim();
    const apartment = str(a.apartment).trim();

    const base = [street, house].filter(Boolean).join(" ").trim();
    if (!base) return "";
    if (!apartment) return base;
    return `${base}, кв ${apartment}`;
  }

  function getAddressLookupCityValue() {
    return str(elAddrCity?.dataset?.value || "").trim();
  }

  function clearAddressLookupDebounce() {
    if (!addressLookupState.debounceTimer) return;
    clearTimeout(addressLookupState.debounceTimer);
    addressLookupState.debounceTimer = null;
  }

  function renderAddressLookupPopover() {
    if (!elAddrLookupPopover || !elAddrLookupStatus || !elAddrLookupResults) return;
    const isVisible = addressLookupState.open && (
      addressLookupState.mode !== "idle" ||
      addressLookupState.items.length > 0
    );
    elAddrLookupPopover.classList.toggle("hidden", !isVisible);

    const statusText = str(addressLookupState.status).trim();
    elAddrLookupStatus.textContent = statusText;
    elAddrLookupStatus.classList.toggle("hidden", !statusText);
    elAddrLookupStatus.classList.toggle("is-error", addressLookupState.mode === "error");
    elAddrLookupStatus.classList.toggle("is-loading", addressLookupState.mode === "loading");

    elAddrLookupResults.innerHTML = "";
    addressLookupState.items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shop-address-lookup-item";
      if (index === addressLookupState.activeIndex) button.classList.add("is-active");
      button.setAttribute("aria-selected", index === addressLookupState.activeIndex ? "true" : "false");

      const title = document.createElement("div");
      title.className = "shop-address-lookup-item-title";
      title.textContent = buildAddressLookupSuggestionTitle(item, getAddressLookupCityValue());
      button.appendChild(title);

      const metaText = str(item.context_locality || item.city_name).trim();
      if (metaText) {
        const meta = document.createElement("div");
        meta.className = "shop-address-lookup-item-meta";
        meta.textContent = metaText;
        button.appendChild(meta);
      }

      button.addEventListener("mouseenter", () => {
        if (addressLookupState.activeIndex === index) return;
        addressLookupState.activeIndex = index;
        renderAddressLookupPopover();
      });
      button.addEventListener("click", async () => {
        await applyAddressLookupSuggestion(item);
      });

      elAddrLookupResults.appendChild(button);
    });
  }

  function closeAddressLookupPopover() {
    clearAddressLookupDebounce();
    addressLookupState.requestSeq += 1;
    addressLookupState.open = false;
    addressLookupState.items = [];
    addressLookupState.activeIndex = -1;
    addressLookupState.status = "";
    addressLookupState.mode = "idle";
    renderAddressLookupPopover();
  }

  function setAddressLookupStatus(message, mode = "idle") {
    addressLookupState.status = str(message).trim();
    addressLookupState.mode = str(mode).trim() || "idle";
    if (addressLookupState.mode !== "idle" || addressLookupState.items.length) {
      addressLookupState.open = true;
    }
    renderAddressLookupPopover();
  }

  function setAddressLookupItems(items) {
    addressLookupState.items = Array.isArray(items) ? items.slice() : [];
    addressLookupState.activeIndex = addressLookupState.items.length ? 0 : -1;
    if (addressLookupState.items.length) {
      addressLookupState.open = true;
      if (addressLookupState.mode === "idle" || addressLookupState.mode === "loading" || addressLookupState.mode === "empty") {
        addressLookupState.mode = "ready";
      }
    }
    renderAddressLookupPopover();
  }

  async function applyAddressLookupSuggestion(item) {
    const selectedItem = item && typeof item === "object" ? item : null;
    if (!selectedItem) return;
    const city = getAddressLookupCityValue();
    const selectedType = getAddressLookupItemType(selectedItem);
    if (selectedType !== "address") {
      const nextCity = str(selectedItem.city_name || city).trim();
      if (nextCity && elAddrCity) {
        initCustomSelect(elAddrCity, nextCity);
      }
      const nextState = buildAddressLookupIntermediateState(selectedItem, nextCity || city, state._addressFormResolved);
      if (elAddrLookup) {
        elAddrLookup.value = str(nextState.address_normalized_display).trim();
        elAddrLookup.focus();
        const caretPos = elAddrLookup.value.length;
        try {
          elAddrLookup.setSelectionRange(caretPos, caretPos);
        } catch (_) {}
      }
      if (elAddrStreet) {
        elAddrStreet.value = selectedType === "street"
          ? str(selectedItem.street_name || selectedItem.value || selectedItem.label).trim()
          : "";
      }
      if (elAddrHouse) elAddrHouse.value = "";
      state._addressFormResolved = nextState;
      closeAddressLookupPopover();
      return;
    }

    const subtotal = computeCartTotals(cartItemsResolved()).total;
    try {
      const json = await apiJson("/api/public/address-resolve", {
        method: "POST",
        body: {
          subtotal,
          city,
          street: selectedItem.street_name || "",
          house: selectedItem.house_number || "",
          address_ref: selectedItem.source_key || "",
          selected_object_type: selectedItem.object_type || "address",
          address_context_locality: selectedItem.context_locality || selectedItem.city_name || "",
          address_normalized_display: selectedItem.full_address || selectedItem.value || selectedItem.label || "",
          lat: selectedItem.lat,
          lng: selectedItem.lng,
        },
      });
      const data = json?.data || {};
      if (data.city && elAddrCity) {
        initCustomSelect(elAddrCity, data.city);
      }
      if (elAddrLookup) {
        elAddrLookup.value = str(data.address_normalized_display || buildAddressLookupDisplay(data)).trim();
      }
      if (elAddrStreet) elAddrStreet.value = str(data.street || selectedItem.street_name || "").trim();
      if (elAddrHouse) elAddrHouse.value = str(data.house || selectedItem.house_number || "").trim();
      state._addressFormResolved = {
        ...extractResolvedAddressState({
          address_ref: data.address_ref,
          selected_object_type: data.selected_object_type,
          resolved_city_source_key: data.resolved_city_source_key,
          address_context_locality: data.context_locality,
          address_normalized_display: data.address_normalized_display,
          lat: data.lat,
          lng: data.lng,
          delivery_zone_id: data.delivery_zone_id,
          delivery_store_id: data.delivery_store_id,
        }),
        _lookup_prefix: str(data.address_normalized_display || buildAddressLookupDisplay(data)).trim() || null,
      };
      closeAddressLookupPopover();
      if (typeof updateMobileDeliveryProgress === "function") {
        Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
      }
    } catch (error) {
      console.error(error);
      setAddressLookupItems([]);
      setAddressLookupStatus("Не удалось получить адрес.", "error");
    }
  }

  async function searchAddressLookupSuggestions(query, requestId) {
    const normalizedQuery = str(query).trim();
    const city = getAddressLookupCityValue();
    const continuation = getAddressLookupContinuationInfo(normalizedQuery, state._addressFormResolved);
    const apiQuery = str(continuation.query).trim();
    const minLength = continuation.stage === "house" ? 1 : 2;
    if (!apiQuery || apiQuery.length < minLength) {
      closeAddressLookupPopover();
      return;
    }
    if (!city) {
      setAddressLookupItems([]);
      setAddressLookupStatus("Сначала выберите город.", "error");
      return;
    }
    addressLookupState.open = true;
    setAddressLookupStatus("Ищем адрес...", "loading");
    try {
      const params = new URLSearchParams({
        stage: continuation.stage,
        q: apiQuery,
        city,
      });
      if (continuation.citySourceKey) {
        params.set("city_source_key", continuation.citySourceKey);
      }
      if (continuation.selectedSourceKey) {
        params.set("selected_source_key", continuation.selectedSourceKey);
      }
      const response = await fetch(`/api/public/address-suggest?${params.toString()}`, {
        headers: {
          "x-tenant-id": String(tenantId),
        },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "ADDRESS_SUGGEST_FAILED");
      }
      if (requestId !== addressLookupState.requestSeq) return;
      const items = Array.isArray(json?.data?.items) ? json.data.items : [];
      if (!items.length) {
        setAddressLookupItems([]);
        setAddressLookupStatus("Ничего не найдено.", "empty");
        return;
      }
      setAddressLookupItems(items);
      setAddressLookupStatus(`Поиск: ${str(json?.data?.scope_label || city).trim()}`, "ready");
    } catch (error) {
      if (requestId !== addressLookupState.requestSeq) return;
      console.error(error);
      setAddressLookupItems([]);
      setAddressLookupStatus("Не удалось получить подсказки адреса.", "error");
    }
  }

  function scheduleAddressLookupSuggestions() {
    if (!isAddressMapModeEnabled() || !elAddrLookup) return;
    const normalizedValue = str(elAddrLookup.value).trim();
    const continuation = getAddressLookupContinuationInfo(normalizedValue, state._addressFormResolved);
    const minLength = continuation.stage === "house" ? 1 : 2;
    clearAddressLookupDebounce();
    addressLookupState.requestSeq += 1;
    if (!normalizedValue || str(continuation.query).trim().length < minLength) {
      closeAddressLookupPopover();
      return;
    }
    const requestId = addressLookupState.requestSeq;
    addressLookupState.debounceTimer = setTimeout(() => {
      addressLookupState.debounceTimer = null;
      searchAddressLookupSuggestions(normalizedValue, requestId);
    }, 180);
  }

  function isDesktopViewport() {
    try {
      return !!(window.matchMedia && window.matchMedia("(min-width: 769px)").matches);
    } catch {
      return false;
    }
  }

  function getHeaderPickupStore() {
    if (window._deliveryMode !== "pickup" || !window._selectedPickupStoreId) return null;
    const stores = window._pickupStores || [];
    if (!Array.isArray(stores) || !stores.length) return null;
    return stores.find((s) => Number(s.id) === Number(window._selectedPickupStoreId)) || null;
  }

  function getCartHeaderAddressLine() {
    const pickupStore = getHeaderPickupStore();
    if (pickupStore) return formatHeaderPickupStoreAddress(pickupStore);
    if (isDesktopViewport()) {
      return formatAddressStreetHouseApartment(state.selectedAddress);
    }
    return getSelectedAddressLine();
  }

  let cartHeaderStoresLoadPromise = null;

  function ensureStoresForHeaderStatus() {
    const cachedStores = window._pickupStores;
    if (Array.isArray(cachedStores) && cachedStores.length) {
      return Promise.resolve(cachedStores);
    }
    if (cartHeaderStoresLoadPromise) {
      return cartHeaderStoresLoadPromise;
    }
    cartHeaderStoresLoadPromise = (async () => {
      try {
        const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.ok && Array.isArray(data.stores)) {
          window._pickupStores = data.stores;
          return data.stores;
        }
      } catch (e) {
        console.warn("Failed to load stores for cart header status:", e);
      }
      return Array.isArray(window._pickupStores) ? window._pickupStores : [];
    })().finally(() => {
      cartHeaderStoresLoadPromise = null;
    });
    return cartHeaderStoresLoadPromise;
  }

  function getHeaderDeliveryStore() {
    const stores = Array.isArray(window._pickupStores) ? window._pickupStores : [];
    if (!stores.length) return null;

    const address = state.selectedAddress || null;
    const candidateIds = [
      Number(address?.delivery_store_id || 0),
      Number(address?.store_id || 0),
      Number(getActiveStoreId() || 0),
    ].filter((id) => Number.isFinite(id) && id > 0);

    for (const id of candidateIds) {
      const byId = stores.find((s) => Number(s?.id) === id);
      if (byId) return byId;
    }

    const addressCity = str(address?.city || "").trim().toLowerCase();
    if (addressCity) {
      const byCity = stores.filter((s) => str(s?.city || "").trim().toLowerCase() === addressCity);
      if (byCity.length === 1) return byCity[0];
      if (byCity.length > 1) {
        const activeId = Number(getActiveStoreId() || 0);
        return byCity.find((s) => Number(s?.id) === activeId) || byCity[0];
      }
    }

    return null;
  }

  function getCartHeaderStatusStore() {
    if (window._deliveryMode === "pickup") {
      return getHeaderPickupStore();
    }
    return getHeaderDeliveryStore();
  }

  function getHeaderStoreStatusText() {
    if (!getCartHeaderAddressLine()) return "";
    const store = getCartHeaderStatusStore();
    if (!store) return "";

    const statusInfo = getStoreStatusInfoForList(store);
    if (statusInfo && str(statusInfo.text).trim()) {
      return str(statusInfo.text).trim();
    }

    const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
    return str(hoursRange || "").trim();
  }

  function getCartHeaderStoreStatusText() {
    if (!isDesktopViewport()) return "";
    return getHeaderStoreStatusText();
  }

  function getCartHeaderModeIconClass() {
    return window._deliveryMode === "pickup" ? "fa-store" : "fa-location-dot";
  }

  function renderCartHeaderAddressTitle(titleText) {
    if (!elCartHeaderTitle) return;
    elCartHeaderTitle.innerHTML = `
      <i class="fas ${getCartHeaderModeIconClass()} shop-cart-header-mode-icon" aria-hidden="true"></i>
      <span class="shop-cart-header-title-main">
        <span class="shop-cart-header-title-text-row">
          <span class="shop-cart-header-title-text"></span>
          <i class="fas fa-chevron-right shop-cart-header-title-arrow" aria-hidden="true"></i>
        </span>
        <span class="shop-cart-header-title-sub hidden"></span>
      </span>
    `;
    const textEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-text");
    if (textEl) textEl.textContent = str(titleText || "");
  }

  function setCartHeaderStatusLine(statusText) {
    if (!elCartHeaderTitle) return;
    const subEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-sub");
    if (!subEl) return;
    const text = str(statusText || "").trim();
    const show = Boolean(text) && isDesktopViewport();
    subEl.textContent = show ? text : "";
    subEl.classList.toggle("hidden", !show);
  }

  function updateCartHeaderStoreStatus({ ensureStores = false } = {}) {
    const statusText = getCartHeaderStoreStatusText();
    setCartHeaderStatusLine(statusText);
    if (statusText || !ensureStores || !isDesktopViewport()) return;

    ensureStoresForHeaderStatus()
      .then(() => {
        setCartHeaderStatusLine(getCartHeaderStoreStatusText());
      })
      .catch(() => {});
  }

  function setMobileHeaderStatusLine(statusText) {
    const statusEl = document.getElementById("shopMobileHeaderStatus");
    if (!statusEl) return;
    const text = str(statusText || "").trim();
    statusEl.textContent = text;
    statusEl.classList.toggle("hidden", !text);
  }

  function updateMobileHeaderStoreStatus({ ensureStores = false } = {}) {
    const statusText = getHeaderStoreStatusText();
    setMobileHeaderStatusLine(statusText);
    if (statusText || !ensureStores) return;

    ensureStoresForHeaderStatus()
      .then(() => {
        setMobileHeaderStatusLine(getHeaderStoreStatusText());
      })
      .catch(() => {});
  }

  function syncSelectedAddressToCheckoutDraft() {
    const line = getSelectedAddressLine();
    const addressComment = (state.selectedAddress && state.selectedAddress.comment)
      ? String(state.selectedAddress.comment).trim()
      : null;
    try {
      const d = loadCheckoutDraft();
      d.delivery_address = line || "";
      d.address_comment = addressComment || null;
      saveCheckoutDraft(d);
    } catch {}
  }

function updateAddressChip() {
  const line = getCartHeaderAddressLine();

  // chip ????? ??? ?????? ???????, ?? ? ???????/?????????? ?? ?????
  if (elAddressChip) {
    elAddressChip.textContent = line || "Укажите адрес";
    elAddressChip.classList.toggle("chip-plus", !line);
    elAddressChip.title = line || "";
  }

  // ???? ?????? ?????? ????? ???????/?????????? В корзине пусто???? ???????
  const headerEl = document.querySelector(".shop-cart-header");
  const isAddrTitle = !!headerEl && headerEl.classList.contains("is-address-title");
  const isCartLike = cartViewMode === "cart" || cartViewMode === "checkout";

  if (isCartLike && isAddrTitle && elCartHeaderTitle) {
    // ?????: ?? ?????? textContent, ? ?????? + ????????
    const t = line || "Укажите адрес";
    renderCartHeaderAddressTitle(t);

    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
    elCartHeaderTitle.classList.add("is-clickable-address-title");
    updateCartHeaderStoreStatus({ ensureStores: true });
  }
}

function updateHeaderAddressWidget() {
  const textEl = document.getElementById("headerAddressText");
  const iconEl = document.querySelector(".header-address-icon");
  if (!textEl) return;

  let hasAddressText = false;

  // Pickup mode
  if (window._deliveryMode === "pickup" && window._selectedPickupStoreId) {
    const stores = window._pickupStores || [];
    const store = stores.find((s) => Number(s.id) === Number(window._selectedPickupStoreId));
    if (store) {
      textEl.textContent = formatHeaderPickupStoreAddress(store) || "Самовывоз";
      textEl.classList.remove("is-placeholder");
      hasAddressText = true;
      if (iconEl) {
        iconEl.classList.remove("fa-location-dot");
        iconEl.classList.add("fa-store");
      }
    }
  }

  // Delivery mode (default)
  if (!hasAddressText) {
    if (iconEl) {
      iconEl.classList.remove("fa-store");
      iconEl.classList.add("fa-location-dot");
    }
    const a = state.selectedAddress;
    if (a) {
      const headerAddressText = formatHeaderAddressStreetHouseApartment(a);
      if (headerAddressText) {
        textEl.textContent = headerAddressText;
        textEl.classList.remove("is-placeholder");
        hasAddressText = true;
      } else {
        textEl.textContent = "Укажите адрес доставки";
        textEl.classList.add("is-placeholder");
      }
    } else {
      textEl.textContent = "Укажите адрес доставки";
      textEl.classList.add("is-placeholder");
    }
  }

  updateMobileHeaderStoreStatus({ ensureStores: hasAddressText });
}

function setCartHeader({
  title,
  showAddressChip = true,
  showProfileActions = false,
  showBack = false,
  showFav = false,
  hideTitle = false,

  // ????? ?????? ????????? (???????/??????????)
  addressAsTitle = false,

  // NEW: ??????? ???????? (??? ?????? ???????)
  showClose = false,
  onClose = null,
  showAddressModeToggle = false,
} = {}) {
  const headerEl = document.querySelector(".shop-cart-header");

  // --- ensure close button (creates once) ---
  let closeBtn = document.querySelector("#shopCartCloseBtn");
  if (!closeBtn && headerEl) {
    const right = headerEl.querySelector(".shop-cart-header-right");
    if (right) {
      closeBtn = document.createElement("button");
      closeBtn.id = "shopCartCloseBtn";
      closeBtn.type = "button";
      closeBtn.className = "btn btn-icon shop-cart-close hidden";
      closeBtn.setAttribute("aria-label", "Закрыть");
      closeBtn.innerHTML = `<i class="fas fa-times"></i>`;
      right.appendChild(closeBtn);
    }
  }

  if (closeBtn) {
    closeBtn.classList.toggle("hidden", !showClose);
    closeBtn.onclick = typeof onClose === "function" ? onClose : null;
  }

  // --- title render ---
  if (elCartHeaderTitle && typeof title === "string") {
    if (addressAsTitle) {
      renderCartHeaderAddressTitle(title);
      updateCartHeaderStoreStatus({ ensureStores: true });

      elCartHeaderTitle.classList.add("is-clickable-address-title");
    } else {
      // ??????? ?????
      elCartHeaderTitle.textContent = title;
      elCartHeaderTitle.classList.remove("is-clickable-address-title");
    }
  }

  // title show/hide
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("hidden", !!hideTitle);

  // address chip / profile actions / back
  if (elAddressChip) elAddressChip.classList.toggle("hidden", !showAddressChip);
  if (elProfileHeaderActions) elProfileHeaderActions.classList.toggle("hidden", !showProfileActions);
  if (elCartBackBtn) elCartBackBtn.classList.toggle("hidden", !showBack);

  // fav (desktop panel header)
  const elCartFavBtn = $("#shopCartFavBtn");
  if (elCartFavBtn) elCartFavBtn.classList.toggle("hidden", !showFav);

  if (!showProfileActions && elProfileMenu) elProfileMenu.classList.add("hidden");

  if (elCartHeaderModeWrap) {
    elCartHeaderModeWrap.classList.toggle("hidden", !showAddressModeToggle);
  }
  if (headerEl) {
    headerEl.classList.toggle("is-address-mode", !!showAddressModeToggle);
  }

  // ????? ?????? ??? ??????????
  if (headerEl) headerEl.classList.toggle("is-address-title", !!addressAsTitle);
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("is-address-title", !!addressAsTitle);
}

function setSheetHeaderMode(
  mode,
  { onBack, discountBadge, favoriteBuildSnapshot, favoriteAfterToggle } = {}
) {
  const header = document.querySelector(".app-modal-header");
  if (!header) return;

  // Удаляем предыдущий бейдж скидки
  const oldBadge = header.querySelector(".shop-sheet-discount-badge");
  if (oldBadge) oldBadge.remove();

  // ??????? ?????? ??????? ?В корзине пусто?, ????? ?? ???? ???В корзине пусто ???????? ? ?????? ??????
  const orderBackBtn = header.querySelector(".app-modal-back-btn");
  if (orderBackBtn) orderBackBtn.remove();

  // ??????? ????? ??????? (? ?????? ??????? AppModal ?? ????? ?????????? ??-???????)
  const closeBtn =
    header.querySelector(".app-modal-close") ||
    header.querySelector("[data-modal-close]") ||
    header.querySelector("button[aria-label='Закрыть']") ||
    header.querySelector("button[aria-label='Close']") ||
    header.querySelector(".modal-close") ||
    header.querySelector(".btn-close");

  // title (???? ???? ????????? ???????)
  const titleEl =
    header.querySelector(".app-modal-title") ||
    header.querySelector(".modal-title") ||
    header.querySelector("[data-modal-title]");

  // ensure back btn (left)
  let backBtn = header.querySelector("#shopSheetBackBtn");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.id = "shopSheetBackBtn";
    backBtn.type = "button";
    backBtn.className = "btn btn-icon shop-sheet-back";
    backBtn.setAttribute("aria-label", "Назад");
    backBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;
    header.prepend(backBtn);
  }

  // ensure fav btn (right)
  let favBtn = header.querySelector("#shopSheetFavBtn");
  if (!favBtn) {
    favBtn = document.createElement("button");
    favBtn.id = "shopSheetFavBtn";
    favBtn.type = "button";
    favBtn.className = "btn btn-icon shop-sheet-fav";
    favBtn.setAttribute("aria-label", "Избранное");
    favBtn.innerHTML = `<i class="fas fa-heart"></i>`;
    header.appendChild(favBtn);
  }

  // bind back handler (????????? ?????? ???)
  backBtn.onclick = () => {
    if (typeof onBack === "function") onBack();
  };

  const isProduct = mode === "product";
  const isOrder = mode === "order";

  // Product: ???????? ?/?, ?????? ?, ?????? title
  // Order: ???????? ?, ?????? ?, ???????? title
  backBtn.classList.toggle("hidden", !isProduct && !isOrder);
  favBtn.classList.toggle("hidden", !isProduct);

  if (isProduct) {
    const nextFavBtn = favBtn.cloneNode(true);
    favBtn.replaceWith(nextFavBtn);
    favBtn = nextFavBtn;
    favBtn.classList.remove("is-active", "is-busy");
    delete favBtn.dataset.favoriteId;

    if (typeof favoriteBuildSnapshot === "function") {
      bindFavoriteButtonsForCartRow(
        [favBtn],
        () => favoriteBuildSnapshot(),
        {
          afterToggle:
            typeof favoriteAfterToggle === "function" ? favoriteAfterToggle : undefined,
        }
      );
    }
  }

  if (closeBtn) closeBtn.classList.toggle("hidden", isProduct || isOrder);
  if (titleEl) titleEl.classList.toggle("hidden", isProduct);

  // Бейдж скидки по центру хедера
  if (discountBadge) {
    const badge = document.createElement("span");
    badge.className = "shop-sheet-discount-badge";
    badge.textContent = discountBadge;
    favBtn.before(badge);
  }
}

  function setCartFooterMode(mode) {
    if (!elCartFooter) return;
    const isHidden = mode === "hidden";
    elCartFooter.classList.toggle("hidden", isHidden);
    if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", mode !== "cart");
    if (elCheckoutFooterActions) elCheckoutFooterActions.classList.toggle("hidden", mode !== "checkout");
    if (elOrderDetailsFooterActions) elOrderDetailsFooterActions.classList.toggle("hidden", mode !== "order-details");
    if (elDesktopDeliveryProgressWrap) {
      elDesktopDeliveryProgressWrap.classList.toggle("hidden", mode === "order-details");
    }
  }

  function applyTheme(nextTheme) {
    const root = document.documentElement;
    const next = nextTheme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      const icon = btn.querySelector("i");
      if (icon) icon.className = next === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function setHeaderFavoritesButtonActive(isActive = false) {
    if (!elHeaderFavoritesBtn) return;
    const active = Boolean(isActive);
    elHeaderFavoritesBtn.classList.toggle("is-active", active);
    elHeaderFavoritesBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function cleanupDesktopFavoritesPanelIfNeeded() {
    const cleanupFn = window.__shopDesktopFavoritesCleanup;
    if (typeof cleanupFn !== "function") return;
    window.__shopDesktopFavoritesCleanup = null;
    try {
      cleanupFn();
    } catch (e) {
      console.warn("Failed to cleanup desktop favorites panel:", e);
    }
  }

  window.setHeaderFavoritesButtonActive = setHeaderFavoritesButtonActive;

  function setSelectedAddress(addr) {
    state.selectedAddress = addr || null;
    updateAddressChip();
    updateHeaderAddressWidget();
    syncSelectedAddressToCheckoutDraft();
    if (typeof updateMobileDeliveryProgress === "function") {
      Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
    }

    // ???В корзине пусто?? checkout ? ??????? ????
    try {
      if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
        const inp = window.AppModal.body?.querySelector?.('[data-role="delivery-address"]');
        if (inp) inp.value = getSelectedAddressLine();
      }
    } catch {}

    document.querySelectorAll('[data-role="delivery-address"]').forEach((inp) => {
      inp.value = getSelectedAddressLine();
    });
  }

function showCartView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "cart";
  openProductCtx = null;
  if (typeof window._comboStepBackCallback !== "undefined") window._comboStepBackCallback = null;
  window._checkoutMethodCode = null;

  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCartContent) elCartContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  const line = getCartHeaderAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    hideTitle: false,
    showAddressChip: false,
    showProfileActions: false,
    showBack: false,
    showFav: false,
    addressAsTitle: true,
    showClose: false,
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("cart");
  syncCartFooterVisibilityForCartMode(cartItemsResolved().length);
  renderCartIfDirty();
  queueMobileUiStateSync("showCartView");
}

function showCheckoutView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "checkout";
  openProductCtx = null;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elPickupContent) elPickupContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  const line = getCartHeaderAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    hideTitle: false,
    showAddressChip: false,
    showProfileActions: false,
    showBack: false,
    showFav: false,
    addressAsTitle: true,
    showClose: false,
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("checkout");
  queueMobileUiStateSync("showCheckoutView");
}

function showAddressListView(backMode = "cart", opts = {}) {
  if (!elAddressContent || !elAddressListView || !elAddressFormView) return;

  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "address";
  openProductCtx = null;
  state._addressListBackMode = backMode;
  state._addressPendingAddress = state.selectedAddress ? { ...state.selectedAddress } : null;
  state._addressPendingPickupStoreId = window._selectedPickupStoreId ? Number(window._selectedPickupStoreId) : null;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  elAddressContent.classList.remove("hidden");
  elAddressListView.classList.remove("hidden");
  elAddressFormView.classList.add("hidden");
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

  setCartHeader({
    title: "",
    showAddressChip: false,     // IMPORTANT: ??? ???????
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: true,
    addressAsTitle: false,      // IMPORTANT: ??? ??????? ???
    showClose: true,            // ??????? ??????
    onClose: () => backAfterAddressSelection(),
    showAddressModeToggle: true,
  });

  setCartFooterMode("hidden");
  const preferredMode = (opts && (opts.preferredMode === "pickup" || opts.preferredMode === "delivery"))
    ? opts.preferredMode
    : (window._deliveryMode === "pickup" ? "pickup" : "delivery");
  setAddressListMode(preferredMode, { rerender: false });
  renderAddressList();
  queueMobileUiStateSync("showAddressListView");
}

async function showAddressFormView(prefill, editingId, backMode) {
  if (!elAddressContent || !elAddressFormView || !elAddressListView) return;

  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  const addressMapModeEnabled = isAddressMapModeEnabled();
  state.addressEditingId = editingId ? Number(editingId) : null;
  state._addressFormBackMode = backMode || (state.selectedAddress ? "list" : "cart");
  cartViewMode = "address";
  openProductCtx = null;

  // ensure stores loaded for city selector
  if (!window._pickupStores || !window._pickupStores.length) {
    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : null;
      if (tenantId) {
        const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.stores)) window._pickupStores = data.stores;
      }
    } catch {}
  }
  if (elAddrCity) {
    initCustomSelect(elAddrCity, prefill?.city);
  }
  resetAddressFormResolvedState(addressMapModeEnabled ? (prefill || null) : null);
  if (elAddrLookupWrap) {
    elAddrLookupWrap.classList.toggle("hidden", !addressMapModeEnabled);
  }
  if (elAddrLookup) {
    elAddrLookup.value = addressMapModeEnabled ? buildAddressLookupDisplay(prefill || {}) : "";
  }
  closeAddressLookupPopover();
  if (elAddrStreet) elAddrStreet.value = str(prefill?.street || "");
  if (elAddrHouse) elAddrHouse.value = str(prefill?.house || "");
  if (elAddrEntrance) elAddrEntrance.value = str(prefill?.entrance || "");
  if (elAddrFloor) elAddrFloor.value = str(prefill?.floor || "");
  if (elAddrApartment) elAddrApartment.value = str(prefill?.apartment || "");
  if (elAddrComment) elAddrComment.value = str(prefill?.comment || "");

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  elAddressContent.classList.remove("hidden");
  elAddressFormView.classList.remove("hidden");
  elAddressListView.classList.add("hidden");
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

  const line = getSelectedAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    showAddressChip: false,
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: false,
    addressAsTitle: false,
    showClose: true,
    onClose: () => backAfterAddressSelection(),
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("hidden");
  queueMobileUiStateSync("showAddressFormView");
  setTimeout(() => {
    try {
      (addressMapModeEnabled ? elAddrLookup : elAddrStreet)?.focus?.();
    } catch {}
  }, 0);
}

function showPickupListView(backMode = "checkout") {
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
  showAddressListView(backMode, { preferredMode: "pickup" });
}

  function showProfileView() {
    cleanupDesktopFavoritesPanelIfNeeded();
    setHeaderFavoritesButtonActive(false);
    cartViewMode = "profile";
    openProductCtx = null;
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProductContent) elProductContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.remove("hidden");
    setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: true, showBack: false });
    setCartFooterMode("hidden");
    queueMobileUiStateSync("showProfileView");
  }

  function rememberPreviousPanel() {
    if (cartViewMode === "profile") return;
    previousPanelMode = cartViewMode;
    previousPanelProductId = openProductCtx?.productId || null;
  }

  async function restorePreviousPanel() {
    if (previousPanelMode === "favorites" && typeof openFavoritesSheet === "function") {
      await openFavoritesSheet({ force: false, forceOpen: true });
      return;
    }
    if (previousPanelMode === "product" && previousPanelProductId) {
      await openProductDetails(previousPanelProductId);
      return;
    }
    if (previousPanelMode === "checkout" && elCheckoutContent) {
      showCheckoutView();
      await openCheckoutView({
        container: elCheckoutContent,
        onBack: showCartView,
        hasAddressEditor: true,
        isSheet: false,
        actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
      });
      return;
    }
    if (previousPanelMode === "address") {
      showAddressListView(state._addressListBackMode || "cart");
      return;
    }
    showCartView();
  }

function showProductView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "product";

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.remove("hidden");

  // Product mode (desktop header): ? ?????, ? ??????, title+chip ??????
  setCartHeader({
    title: "",
    hideTitle: true,
    showAddressChip: false,
    showProfileActions: false,
    showBack: true,
    showFav: true,
  });

  setCartFooterMode("hidden");
  queueMobileUiStateSync("showProductView");
}

  async function reloadAddressesFromServer() {
    try {
      const json = await apiJson("/api/public/me/addresses");
      state.addresses = Array.isArray(json.data) ? json.data : [];
    } catch {
      state.addresses = [];
    }
  }

  function invalidateMeBootstrap() {
    meBootstrapPromise = null;
    meBootstrapLoaded = false;
    meBootstrapToken = "";
  }

  async function loadMeBootstrap({ force = false } = {}) {
    const token = getCustomerToken();
    if (!token) return null;

    if (force) invalidateMeBootstrap();

    if (meBootstrapLoaded && meBootstrapToken === token) {
      return {
        customer: getCustomerCache(),
        addresses: Array.isArray(state.addresses) ? state.addresses : [],
      };
    }
    if (meBootstrapPromise) return meBootstrapPromise;

    meBootstrapPromise = (async () => {
      try {
        const json = await apiJson("/api/public/me/bootstrap");
        const payload = json?.data || {};
        const customer = payload?.customer || null;
        const addresses = Array.isArray(payload?.addresses) ? payload.addresses : [];
        if (customer) setCustomerCache(customer);
        state.addresses = addresses;
        meBootstrapLoaded = true;
        meBootstrapToken = token;
        return { customer, addresses };
      } catch (e) {
        if (String(e?.message || "").includes("UNAUTHORIZED")) {
          clearCustomer();
          state.addresses = [];
          return null;
        }
        throw e;
      } finally {
        meBootstrapPromise = null;
      }
    })();

    return meBootstrapPromise;
  }

  function pickDefaultAddress(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.find(a => Number(a.is_default) === 1) || arr[0] || null;
  }

  async function syncDraftAddressToAccountIfNeeded() {
    const token = getCustomerToken();
    if (!token) return false;
    const cachedCustomer = getCustomerCache();
    if (!cachedCustomer) return false;

    const draft = loadAddressDraft();
    if (!draft) return false;

    const payload = normalizeAddressPayload(draft);
    if (!payload.street || !payload.house) return false;

    try {
      await apiJson("/api/public/me/addresses", { method: "POST", body: { ...payload, is_default: 1 } });
      clearAddressDraft();
      return true;
    } catch (e) {
      // ?? ????????? ?????????
      console.error(e);
      return false;
    }
  }

  async function refreshAddressState(opts = {}) {
    const force = !!opts?.force;
    const token = getCustomerToken();
    if (token) {
      const boot = await loadMeBootstrap({ force });
      const me = boot?.customer || null;
      if (me) {
        const syncedDraft = await syncDraftAddressToAccountIfNeeded();
        if (syncedDraft) {
          await loadMeBootstrap({ force: true });
        }
        const sel = pickDefaultAddress(state.addresses);
        setSelectedAddress(sel ? sel : null);
        return;
      }
    }

    // guest / token invalid
    state.addresses = [];
    const draft = loadAddressDraft();
    setSelectedAddress(draft ? { ...draft, _local: true } : null);
  }

  function backAfterAddressSelection() {
    const back = state._addressListBackMode || state._addressFormBackMode || "cart";
    if (back === "profile") {
      openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
      return;
    }
    if (back === "checkout" && elCheckoutContent) {
      showCheckoutView();
      openCheckoutView({
        container: elCheckoutContent,
        onBack: showCartView,
        hasAddressEditor: true,
        isSheet: false,
        actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
      });
      return;
    }
    showCartView();
  }

  function attachDoubleDelete(btn, onConfirm, { timeout = 2500 } = {}) {
    const originalHtml = btn.innerHTML;
    const originalTitle = btn.title || "";
    let timer = null;
    const mobileCheckoutLabel = "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C";

    const setMobileCheckoutCompact = (compact) => {
      if (!elMobileCheckoutBtn || !elMobileCartTotal) return;
      if (compact) {
        elMobileCheckoutBtn.dataset.compactSumOnly = "1";
        elMobileCheckoutBtn.textContent = "";
        elMobileCheckoutBtn.appendChild(elMobileCartTotal);
        return;
      }
      if (elMobileCheckoutBtn.dataset.compactSumOnly !== "1") return;
      delete elMobileCheckoutBtn.dataset.compactSumOnly;
      elMobileCheckoutBtn.textContent = `${mobileCheckoutLabel} \u00B7 `;
      elMobileCheckoutBtn.appendChild(elMobileCartTotal);
    };

    const reset = () => {
      btn.classList.remove("is-confirm");
      btn.dataset.confirming = "";
      btn.innerHTML = originalHtml;
      btn.title = originalTitle;
      btn.setAttribute("aria-label", originalTitle || "Удалить");
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (btn.dataset.confirming === "1") {
        reset();
        await onConfirm();
        return;
      }

      btn.dataset.confirming = "1";
      btn.classList.add("is-confirm");
      btn.innerHTML = "Удалить?";
      btn.title = "Нажмите ещё раз чтобы удалить";
      btn.setAttribute("aria-label", "Удалить? Нажмите ещё раз чтобы удалить");
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, timeout);
    });

    btn.addEventListener("blur", reset);
  }

  function isSameAddressRef(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return Number(a.id) === Number(b.id);
    return !!a._local && !!b._local;
  }

  function normalizePhoneForTel(raw) {
    return str(raw || "").replace(/[^\d+]/g, "").replace(/^8/, "+7").replace(/^7/, "+7");
  }

  function formatPickupPhone(raw) {
    const digits = str(raw || "").replace(/\D/g, "");
    const normalized = digits.length === 11 ? digits : (digits.length === 10 ? "7" + digits : digits);
    if (normalized.length === 11) {
      return `+${normalized[0]} ${normalized.slice(1, 4)} ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
    }
    return str(raw || "");
  }

  function getStoreTodayHoursRangeForList(storeHours, timezone) {
    if (!Array.isArray(storeHours) || !storeHours.length) return "";
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = storeHours.find((h) => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return "";
    const opens = entry.opens_at ? String(entry.opens_at).slice(0, 5) : "";
    const closes = entry.closes_at ? String(entry.closes_at).slice(0, 5) : "";
    return (opens && closes) ? `${opens} - ${closes}` : "";
  }

  function getStoreStatusInfoForList(store) {
    if (!Array.isArray(store?.storeHours) || !store.storeHours.length) return null;
    const tz = Number.isNaN(Number(store.timezone)) ? 0 : Number(store.timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + tz * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = store.storeHours.find((h) => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return { open: false, text: "Закрыто - выходной" };

    const opens = entry.opens_at ? String(entry.opens_at).slice(0, 5) : "";
    const closes = entry.closes_at ? String(entry.closes_at).slice(0, 5) : "";
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

  function ensureValidPickupStoreIdForAddressList(stores) {
    const ids = (Array.isArray(stores) ? stores : [])
      .map((s) => Number(s?.id))
      .filter((id) => Number.isFinite(id));

    if (!ids.length) {
      state._addressPendingPickupStoreId = null;
      return null;
    }

    const pendingId = Number(state._addressPendingPickupStoreId);
    if (Number.isFinite(pendingId) && ids.includes(pendingId)) {
      return pendingId;
    }

    const selectedId = Number(window._selectedPickupStoreId);
    if (Number.isFinite(selectedId) && ids.includes(selectedId)) {
      state._addressPendingPickupStoreId = selectedId;
      return selectedId;
    }

    const draft = loadCheckoutDraft();
    const draftId = Number(draft.pickup_store_id);
    if (Number.isFinite(draftId) && ids.includes(draftId)) {
      state._addressPendingPickupStoreId = draftId;
      window._selectedPickupStoreId = draftId;
      return draftId;
    }

    const activeStoreId = Number(localStorage.getItem("activeStoreId"));
    const fallbackId = (Number.isFinite(activeStoreId) && ids.includes(activeStoreId))
      ? activeStoreId
      : ids[0];

    state._addressPendingPickupStoreId = fallbackId;
    window._selectedPickupStoreId = fallbackId;
    return fallbackId;
  }

  async function ensurePickupStoresLoadedForAddressList() {
    if (window._pickupStores && window._pickupStores.length) {
      ensureValidPickupStoreIdForAddressList(window._pickupStores);
      return window._pickupStores;
    }

    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : null;
      if (!tenantId) return [];

      const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.stores)) {
        window._pickupStores = data.stores;
        ensureValidPickupStoreIdForAddressList(window._pickupStores);
        return window._pickupStores;
      }
    } catch {}

    return [];
  }

  function setAddressListMode(mode, { rerender = true } = {}) {
    const nextMode = mode === "pickup" ? "pickup" : "delivery";
    state._addressListMode = nextMode;

    const isPickup = nextMode === "pickup";
    if (elAddressToggleDeliveryBtn) elAddressToggleDeliveryBtn.classList.toggle("is-active", !isPickup);
    if (elAddressTogglePickupBtn) elAddressTogglePickupBtn.classList.toggle("is-active", isPickup);

    const top = elAddressListView ? elAddressListView.querySelector(".shop-address-list-top") : null;
    if (top) top.classList.toggle("hidden", isPickup);

    // Show/hide pickup header with city selector
    if (elPickupListTop) elPickupListTop.classList.toggle("hidden", !isPickup);

    if (elAddressListTitle) {
      elAddressListTitle.textContent = isPickup ? "Точки самовывоза" : "Мои адреса";
    }

    if (elAddressList) elAddressList.classList.toggle("hidden", isPickup);
    if (elAddressPickupList) elAddressPickupList.classList.toggle("hidden", !isPickup);
    if (elAddressConfirmBtn) {
      elAddressConfirmBtn.textContent = isPickup ? "Заказать здесь" : "Доставить сюда";
    }

    if (rerender) renderAddressList();
  }

  function renderAddressList() {
    if (state._addressListMode === "pickup") {
      void renderAddressPickupList();
      return;
    }
    renderAddressDeliveryList();
  }

  function renderAddressDeliveryList() {
    if (!elAddressList) return;

    elAddressList.innerHTML = "";
    if (elAddressPickupList) elAddressPickupList.innerHTML = "";

    const token = getCustomerToken();
    const list = (token ? state.addresses : []) || [];
    const localDraft = loadAddressDraft();
    const local = (!token && localDraft) ? [{ ...localDraft, id: null, _local: true }] : [];
    const effectiveList = token ? list : local;

    if (!effectiveList.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Адресов пока нет.";
      elAddressList.appendChild(empty);
      state._addressPendingAddress = null;
      if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = true;
      return;
    }

    let pendingAddress = state._addressPendingAddress;
    if (!pendingAddress || !effectiveList.some((a) => isSameAddressRef(a, pendingAddress))) {
      pendingAddress = effectiveList.find((a) => isSameAddressRef(a, state.selectedAddress)) || effectiveList[0] || null;
      state._addressPendingAddress = pendingAddress ? { ...pendingAddress } : null;
    }
    if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = !state._addressPendingAddress;

    const updateRadios = () => {
      elAddressList.querySelectorAll(".shop-address-row").forEach((row) => {
        const rid = row.dataset.addrId;
        const isLocal = row.dataset.addrLocal === "1";
        const match = state._addressPendingAddress
          ? rid && state._addressPendingAddress.id
            ? Number(rid) === Number(state._addressPendingAddress.id)
            : isLocal && !!state._addressPendingAddress._local
          : false;
        row.classList.toggle("is-selected", match);
      });
    };

    effectiveList.forEach((a) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";
      if (a.id) row.dataset.addrId = String(a.id);
      if (a._local) row.dataset.addrLocal = "1";
      if (state._addressPendingAddress && isSameAddressRef(a, state._addressPendingAddress)) {
        row.classList.add("is-selected");
      }

      const radio = document.createElement("div");
      radio.className = "shop-address-radio";
      row.appendChild(radio);

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      const titleEl = document.createElement("div");
      titleEl.className = "shop-address-card-title";
      titleEl.textContent = formatAddressLine(a) || "";
      main.appendChild(titleEl);

      const sub = a.comment ? str(a.comment) : "";
      if (sub) {
        const subEl = document.createElement("div");
        subEl.className = "shop-address-card-sub";
        subEl.textContent = sub;
        main.appendChild(subEl);
      }

      const actions = document.createElement("div");
      actions.className = "shop-address-actions shop-address-actions--compact";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "shop-address-action-icon";
      btnEdit.innerHTML = `<i class="fas fa-pen"></i>`;
      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        showAddressFormView(a, token ? a.id : null, "list");
      });
      actions.appendChild(btnEdit);

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
            if (state._addressPendingAddress && isSameAddressRef(a, state._addressPendingAddress)) {
              state._addressPendingAddress = null;
            }
            renderAddressList();
          } catch (err) {
            alert("Не удалось удалить адрес");
          }
          return;
        }

        clearAddressDraft();
        setSelectedAddress(null);
        state._addressPendingAddress = null;
        renderAddressList();
      });
      actions.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(actions);
      row.appendChild(card);

      row.addEventListener("click", () => {
        state._addressPendingAddress = { ...a };
        if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = false;
        updateRadios();
      });

      elAddressList.appendChild(row);
    });
  }

  async function renderAddressPickupList() {
    if (!elAddressPickupList) return;

    elAddressPickupList.innerHTML = "";
    if (elAddressList) elAddressList.innerHTML = "";

    const allStores = await ensurePickupStoresLoadedForAddressList();

    // Initialize city selector
    initPickupCitySelector();

    // Filter by selected city
    const stores = state._selectedPickupCity
      ? allStores.filter(s => s.city === state._selectedPickupCity)
      : allStores;

    if (!stores.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "16px";
      empty.textContent = state._selectedPickupCity
        ? `Нет точек самовывоза в городе ${state._selectedPickupCity}.`
        : "Нет доступных точек самовывоза.";
      elAddressPickupList.appendChild(empty);
      state._addressPendingPickupStoreId = null;
      if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = true;
      return;
    }

    let pendingPickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
    state._addressPendingPickupStoreId = pendingPickupStoreId;
    if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = !pendingPickupStoreId;

    const updatePickupRadios = () => {
      elAddressPickupList.querySelectorAll(".shop-address-row").forEach((row) => {
        const sid = Number(row.dataset.storeId);
        row.classList.toggle("is-selected", Number.isFinite(sid) && Number(sid) === Number(pendingPickupStoreId));
      });
    };

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row shop-pickup-inline-row";
      row.dataset.storeId = String(store.id);

      if (Number(store.id) === Number(pendingPickupStoreId)) row.classList.add("is-selected");
      if (store.isOpen === false) row.classList.add("is-closed");

      const radio = document.createElement("div");
      radio.className = "shop-address-radio";
      row.appendChild(radio);

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      if (store.city) {
        const cityEl = document.createElement("div");
        cityEl.className = "shop-pickup-city";
        cityEl.textContent = store.city;
        main.appendChild(cityEl);
      }

      const addrEl = document.createElement("div");
      addrEl.className = "shop-pickup-address";
      addrEl.textContent = store.address || store.name || (`Точка #${store.id}`);
      main.appendChild(addrEl);

      const statusInfo = getStoreStatusInfoForList(store);
      if (statusInfo) {
        const statusEl = document.createElement("div");
        statusEl.className = "shop-pickup-status " + (statusInfo.open ? "is-open" : "is-closed");
        statusEl.textContent = statusInfo.text;
        main.appendChild(statusEl);
      }

      const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
      if (hoursRange) {
        const hoursRow = document.createElement("div");
        hoursRow.className = "shop-pickup-info-row";
        const label = document.createElement("span");
        label.className = "shop-pickup-info-label";
        label.textContent = "Время работы";
        const value = document.createElement("span");
        value.className = "shop-pickup-info-value";
        value.textContent = hoursRange;
        hoursRow.appendChild(label);
        hoursRow.appendChild(value);
        main.appendChild(hoursRow);
      }

      if (store.phone) {
        const phoneRow = document.createElement("div");
        phoneRow.className = "shop-pickup-info-row";

        const label = document.createElement("span");
        label.className = "shop-pickup-info-label";
        label.textContent = "Телефон";

        const link = document.createElement("a");
        link.className = "shop-pickup-phone-link";
        link.href = `tel:${normalizePhoneForTel(store.phone)}`;
        link.textContent = formatPickupPhone(store.phone);
        link.addEventListener("click", (e) => e.stopPropagation());

        phoneRow.appendChild(label);
        phoneRow.appendChild(link);
        main.appendChild(phoneRow);
      }

      card.appendChild(main);
      row.appendChild(card);

      row.addEventListener("click", () => {
        pendingPickupStoreId = Number(store.id);
        state._addressPendingPickupStoreId = pendingPickupStoreId;
        if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = false;
        updatePickupRadios();
      });

      elAddressPickupList.appendChild(row);
    });
  }

  async function confirmAddressListSelection() {
    const mode = state._addressListMode === "pickup" ? "pickup" : "delivery";

    if (mode === "pickup") {
      const stores = await ensurePickupStoresLoadedForAddressList();
      const pickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
      if (!pickupStoreId) return;

      const resolvedPickupStoreId = Number(pickupStoreId);
      state._addressPendingPickupStoreId = resolvedPickupStoreId;
      window._selectedPickupStoreId = resolvedPickupStoreId;
      window._deliveryMode = "pickup";

      const draft = loadCheckoutDraft();
      draft.method_code = "takeaway";
      draft.method_user_selected = true;
      draft.pickup_store_id = resolvedPickupStoreId;
      saveCheckoutDraft(draft);

      if (window._updatePickupAddressCallback) {
        try { window._updatePickupAddressCallback(); } catch {}
      }

      updateHeaderAddressWidget();
      updateAddressChip();
      backAfterAddressSelection();
      return;
    }

    const pendingAddress = state._addressPendingAddress;
    if (!pendingAddress) return;

    const token = getCustomerToken();
    if (token && pendingAddress.id) {
      try {
        await apiJson(`/api/public/me/addresses/${pendingAddress.id}/default`, { method: "PUT" });
        await refreshAddressState({ force: true });
      } catch (e) {
        alert("Не удалось выбрать адрес");
        return;
      }
    } else {
      const localAddress = pendingAddress._local
        ? { ...pendingAddress, _local: true }
        : { ...pendingAddress };
      setSelectedAddress(localAddress);
    }

    window._deliveryMode = "delivery";
    const draft = loadCheckoutDraft();
    draft.method_code = "delivery";
    draft.method_user_selected = true;
    draft.pickup_store_id = null;
    saveCheckoutDraft(draft);

    updateHeaderAddressWidget();
    updateAddressChip();
    backAfterAddressSelection();
  }

  function renderPickupList() {
    if (!elPickupList) return;

    elPickupList.innerHTML = "";

    // ???????? ?????? ????? ?? ?????????? ?????????? pickupStores (??????????? ? buildCheckoutForm)
    const stores = window._pickupStores || [];

    if (!stores.length) {
      elPickupList.innerHTML = `<div class="muted">Нет доступных точек самовывоза.</div>`;
      return;
    }

    const currentStoreId = window._selectedPickupStoreId || null;

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";

      const isSelected = currentStoreId && Number(store.id) === Number(currentStoreId);
      if (isSelected) row.classList.add("is-selected");

      // ????????? ????? ??? ???????? ?????
      if (store.isOpen === false) row.classList.add("is-closed");

      // ??????? ????? ?? ?????? (????? ????? ? ??????)
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

      // ????????? ???? ?????? ?? ???????
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

        // ????????? ???? ? ????? ???????
        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }

        // ???????????? ? ??????
        const back = state._pickupListBackMode || "checkout";
        if (back === "checkout" && elCheckoutContent) {
          showCheckoutView();
          await openCheckoutView({
            container: elCheckoutContent,
            onBack: showCartView,
            hasAddressEditor: true,
            isSheet: false,
            actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
          });
        } else {
          showCartView();
        }
      });

      elPickupList.appendChild(row);
    });
  }

  async function openAddressEditorFromCheckout() {
    await refreshAddressState();
    const token = getCustomerToken();
    const hasList = token ? (state.addresses || []).length : !!loadAddressDraft();
    const prefill = state.selectedAddress && !state.selectedAddress._local
      ? state.selectedAddress
      : (loadAddressDraft() || state.selectedAddress);
    const isPickupMode = window._deliveryMode === "pickup";

    if (isPickupMode || hasList) {
      showAddressListView("checkout", { preferredMode: isPickupMode ? "pickup" : "delivery" });
    }
    else showAddressFormView(prefill || null, null, "checkout");

    try { document.querySelector("#shopCartPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
  }

async function initAddresses() {
  if (!elAddressContent) return;

  async function openAddressFlow(fromMode = "cart") {
    await refreshAddressState();
    const token = getCustomerToken();
    const hasList = token ? (state.addresses || []).length > 0 : !!loadAddressDraft();
    const isPickupMode = window._deliveryMode === "pickup";
    if (isPickupMode || hasList || getSelectedAddressLine()) {
      showAddressListView(fromMode, { preferredMode: isPickupMode ? "pickup" : "delivery" });
    }
    else showAddressFormView(loadAddressDraft(), null, fromMode);
  }

  // chip (???? ?? ????) ? ????? ???????? ??? fallback
  if (elAddressChip) {
    elAddressChip.addEventListener("click", async () => {
      await openAddressFlow("cart");
    });
  }

  // header address widget (mobile)
  const headerAddrBtn = document.getElementById("headerAddressButton");
  if (headerAddrBtn) {
    headerAddrBtn.addEventListener("click", async () => {
      const isCartSheetOpen =
        !!window.AppModal &&
        typeof window.AppModal.isOpen === "function" &&
        window.AppModal.isOpen() &&
        sheetNavigationState.type === "cart";
      if (!isCartSheetOpen) openCartSheet();
      if (openCartSheetCtx?.showSheetAddressList) {
        openCartSheetCtx.showSheetAddressList("header");
      }
      if (typeof setActiveNav === "function") setActiveNav("menu");
    });
  }

  // ???????: ???? ?? ????????? ??????? (??????)
  if (elCartHeaderTitle) {
    elCartHeaderTitle.addEventListener("click", async (e) => {
      // ?????? ???????/??????????
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;
      e.preventDefault();
      e.stopPropagation();
      await openAddressFlow("cart");
    });
  }

  // ?????????: ???? ????????? ????????????? ? ????? ???? ?? ????? ?????? ???????
  const cartHeader = document.querySelector(".shop-cart-header");
  if (cartHeader) {
    cartHeader.addEventListener("click", async (e) => {
      // ?????? ???????/??????????
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;

      // ????????? ?????? ???? ???? ??? ? ???? ?????????
      const t = e.target;
      const clickedTitle =
        (elCartHeaderTitle && (t === elCartHeaderTitle || elCartHeaderTitle.contains(t))) ||
        (t && t.closest && t.closest("#shopCartHeaderTitle"));

      if (!clickedTitle) return;

      e.preventDefault();
      e.stopPropagation();
      await openAddressFlow("cart");
    });
  }

  // + ????? ?????
  if (elAddressNewBtn) {
    elAddressNewBtn.addEventListener("click", () => showAddressFormView(null, null, "list"));
  }

  if (elAddressToggleDeliveryBtn) {
    elAddressToggleDeliveryBtn.addEventListener("click", () => setAddressListMode("delivery"));
  }
  if (elAddressTogglePickupBtn) {
    elAddressTogglePickupBtn.addEventListener("click", () => setAddressListMode("pickup"));
  }
  if (elAddressConfirmBtn) {
    elAddressConfirmBtn.addEventListener("click", async () => {
      await confirmAddressListSelection();
    });
  }

  if (elAddrLookup) {
    elAddrLookup.addEventListener("input", () => {
      if (!isAddressMapModeEnabled()) return;
      syncAddressLookupResolutionFromInputValue(elAddrLookup.value);
      scheduleAddressLookupSuggestions();
    });
    elAddrLookup.addEventListener("focus", () => {
      if (!isAddressMapModeEnabled()) return;
      if (str(elAddrLookup.value).trim().length >= 2) {
        scheduleAddressLookupSuggestions();
      }
    });
    elAddrLookup.addEventListener("keydown", async (event) => {
      if (!addressLookupState.open || !addressLookupState.items.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        addressLookupState.activeIndex = Math.min(addressLookupState.items.length - 1, addressLookupState.activeIndex + 1);
        renderAddressLookupPopover();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        addressLookupState.activeIndex = Math.max(0, addressLookupState.activeIndex - 1);
        renderAddressLookupPopover();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeAddressLookupPopover();
        return;
      }
      if (event.key === "Enter") {
        const activeItem = addressLookupState.items[addressLookupState.activeIndex] || addressLookupState.items[0];
        if (!activeItem) return;
        event.preventDefault();
        await applyAddressLookupSuggestion(activeItem);
      }
    });
  }

  if (elAddrCity) {
    elAddrCity.addEventListener("change", () => {
      if (!isAddressMapModeEnabled()) return;
      closeAddressLookupPopover();
      resetAddressFormResolvedState(null);
      if (elAddrLookup) elAddrLookup.value = "";
      if (elAddrStreet) elAddrStreet.value = "";
      if (elAddrHouse) elAddrHouse.value = "";
    });
  }

  [elAddrStreet, elAddrHouse].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      if (!isAddressMapModeEnabled()) return;
      const resolved = state._addressFormResolved || {};
      if (!resolved.address_ref && resolved.lat == null && resolved.lng == null && !resolved.delivery_zone_id && !resolved.delivery_store_id) {
        return;
      }
      clearAddressFormResolution({ syncLookupFromFields: true });
    });
  });

  document.addEventListener("click", (event) => {
    if (!elAddrLookupWrap || !elAddrLookupWrap.contains(event.target)) {
      closeAddressLookupPopover();
    }
  });

  // ??????
  if (elAddressCancelBtn) {
    elAddressCancelBtn.addEventListener("click", () => {
      const back = state._addressFormBackMode || "cart";
      if (back === "list") {
        showAddressListView(state._addressListBackMode || "cart", { preferredMode: state._addressListMode });
      }
      else if (back === "checkout") {
        if (elCheckoutContent) {
          showCheckoutView();
          openCheckoutView({
            container: elCheckoutContent,
            onBack: showCartView,
            hasAddressEditor: true,
            isSheet: false,
            actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
          });
        } else {
          showCartView();
        }
      } else if (back === "profile") {
        openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
      } else showCartView();
    });
  }

  // ?????????
  if (elAddressSaveBtn) {
    elAddressSaveBtn.addEventListener("click", async () => {
      const payload = normalizeAddressPayload({
        city: elAddrCity?.dataset?.value || "",
        address_normalized_display: isAddressMapModeEnabled() ? elAddrLookup?.value : "",
        street: elAddrStreet?.value,
        house: elAddrHouse?.value,
        entrance: elAddrEntrance?.value,
        floor: elAddrFloor?.value,
        apartment: elAddrApartment?.value,
        comment: elAddrComment?.value,
        ...(isAddressMapModeEnabled() ? (state._addressFormResolved || {}) : {}),
      });
      if (!payload.city) return alert("Укажите город");
      if (!payload.street || !payload.house) {
        elAddressSaveBtn.disabled = true;
        elAddressSaveBtn.textContent = "РЎРѕС…СЂР°РЅРµРЅРёРµ...";

        try {
          const me = await fetchMeSafe();
          const token = getCustomerToken();

          if (me && token) {
            if (state.addressEditingId) {
              await apiJson(`/api/public/me/addresses/${state.addressEditingId}`, {
                method: "PUT",
                body: payload,
              });
            } else {
              await apiJson("/api/public/me/addresses", {
                method: "POST",
                body: { ...payload, is_default: 1 },
              });
            }
            await refreshAddressState({ force: true });

            if (state._addressFormBackMode === "profile") {
              await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
            } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
              showCheckoutView();
              openCheckoutView({
                container: elCheckoutContent,
                onBack: showCartView,
                hasAddressEditor: true,
                isSheet: false,
                actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
              });
            } else {
              showCartView();
            }
          } else {
            saveAddressDraft(payload);
            setSelectedAddress({ ...payload, _local: true });

            if (state._addressFormBackMode === "profile") {
              await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
            } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
              showCheckoutView();
              openCheckoutView({
                container: elCheckoutContent,
                onBack: showCartView,
                hasAddressEditor: true,
                isSheet: false,
                actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
              });
            } else {
              showCartView();
            }
          }
        } catch (e) {
          console.error(e);
          alert("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р°РґСЂРµСЃ");
        } finally {
          elAddressSaveBtn.disabled = false;
          elAddressSaveBtn.textContent = "РЎРѕС…СЂР°РЅРёС‚СЊ";
        }
        return;
      }

      if (!payload.street) return alert("Укажите улицу");
      if (!payload.house) return alert("Укажите дом");

      elAddressSaveBtn.disabled = true;
      elAddressSaveBtn.textContent = "Сохранение...";

      try {
        const me = await fetchMeSafe();
        const token = getCustomerToken();

        if (me && token) {
          if (state.addressEditingId) {
            await apiJson(`/api/public/me/addresses/${state.addressEditingId}`, {
              method: "PUT",
              body: payload,
            });
          } else {
            await apiJson("/api/public/me/addresses", {
              method: "POST",
              body: { ...payload, is_default: 1 },
            });
          }
          await refreshAddressState({ force: true });

          // ????? ?????????? ? ???????? ?????
          if (state._addressFormBackMode === "profile") {
            await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
          } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
            showCheckoutView();
            openCheckoutView({
              container: elCheckoutContent,
              onBack: showCartView,
              hasAddressEditor: true,
              isSheet: false,
              actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
            });
          } else {
            showCartView();
          }
        } else {
          // guest
          saveAddressDraft(payload);
          setSelectedAddress({ ...payload, _local: true });

          if (state._addressFormBackMode === "profile") {
            await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
          } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
            showCheckoutView();
            openCheckoutView({
              container: elCheckoutContent,
              onBack: showCartView,
              hasAddressEditor: true,
              isSheet: false,
              actions: { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn },
            });
          } else {
            showCartView();
          }
        }
      } catch (e) {
        console.error(e);
        alert("Не удалось сохранить адрес");
      } finally {
        elAddressSaveBtn.disabled = false;
        elAddressSaveBtn.textContent = "Сохранить";
      }
    });
  }

  await refreshAddressState();
  updateAddressChip();
  // Restore delivery mode from checkout draft
  try {
    const draft = loadCheckoutDraft();
    if (draft.method_code === "takeaway" || draft.method_code === "pickup") {
      window._deliveryMode = "pickup";
      if (draft.pickup_store_id) window._selectedPickupStoreId = Number(draft.pickup_store_id);
      // Load stores for header widget display
      if (!window._pickupStores || !window._pickupStores.length) {
        const metaTenant = document.querySelector('meta[name="tenant_id"]');
        const tid = metaTenant ? Number(metaTenant.content) : null;
        if (tid) {
          fetch(`/api/public/tenant/stores?tenant_id=${tid}`)
            .then(r => r.json())
            .then(d => {
              if (d?.ok && Array.isArray(d.stores)) {
                window._pickupStores = d.stores;
                updateHeaderAddressWidget();
                updateAddressChip();
              }
            }).catch(() => {});
        }
      }
    } else {
      window._deliveryMode = "delivery";
    }
  } catch {}
  updateHeaderAddressWidget();
  updateAddressChip();
}

  // -----------------------------
  // UI: qty animation (photo overlay)
  // -----------------------------
  function animateNumber(el, newValue, dir) {
    const prev = el.getAttribute("data-v") || el.textContent.trim() || "0";
    const next = String(newValue);
    el.setAttribute("data-v", next);

    if (!prev || prev === next) {
      el.textContent = next;
      return;
    }

    el.innerHTML = "";
    const oldSpan = document.createElement("span");
    oldSpan.className = "qty-num qty-old";
    oldSpan.textContent = prev;

    const newSpan = document.createElement("span");
    newSpan.className = "qty-num qty-new";
    newSpan.textContent = next;

    el.appendChild(oldSpan);
    el.appendChild(newSpan);

    oldSpan.style.transform = "translateX(0)";
    oldSpan.style.opacity = "1";
    newSpan.style.transform = "translateX(0) scale(0.8)";
    newSpan.style.opacity = "0";

    void el.offsetWidth;

    requestAnimationFrame(() => {
      oldSpan.style.transform = dir === "inc" ? "translateX(-105%) scale(0.9)" : "translateX(105%) scale(0.9)";
      oldSpan.style.opacity = "0";
      newSpan.style.transform = "translateX(0) scale(1)";
      newSpan.style.opacity = "1";
    });

    setTimeout(() => {
      el.innerHTML = "";
      el.textContent = next;
    }, 320);
  }

  // -----------------------------
  // Categories
  // -----------------------------
  function createCatIcon(icon) {
    const wrap = document.createElement("div");
    wrap.className = "shop-cat-icon";

    const v = str(icon).trim();
    if (looksLikeUrl(v)) {
      const img = createOptimizedImage(v, {
        type: 'thumb',
        className: 'shop-cat-icon-img',
        alt: '',
        usePicture: true,
      });
      wrap.appendChild(img);
      return wrap;
    }

    if (v) {
      const i = document.createElement("i");
      i.className = v;
      wrap.appendChild(i);
      return wrap;
    }

    const dot = document.createElement("div");
    dot.className = "shop-cat-icon-ph";
    wrap.appendChild(dot);
    return wrap;
  }

  function setActiveCategory(categoryId, title, { scroll = false } = {}) {
    const id = Number(categoryId);
    if (!Number.isFinite(id)) return;

    const nextTitle = str(title || "Категория");
    state.activeCategoryId = id;
    state.activeCategoryTitle = nextTitle;
    if (elCategoryTitle) elCategoryTitle.textContent = nextTitle;

    updateCategoriesActiveUi();
    scrollChipsToCategory(id);

    if (scroll) scrollToCategory(id);
  }

  function scrollToCategory(categoryId) {
    const id = Number(categoryId);
    if (!Number.isFinite(id)) return;
    const header = elProductsGrid?.querySelector?.(`.shop-category-header[data-cat-id="${id}"]`);
    if (!header) return;

    isProgrammaticCategoryScroll = true;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      const headerH = Number(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0;
      const chipsPanel = document.querySelector(".center-stack > .panel:first-child");
      const chipsH = chipsPanel?.getBoundingClientRect ? chipsPanel.getBoundingClientRect().height : 0;
      const offset = headerH + chipsH + 45;
      const rect = header.getBoundingClientRect();
      const top = window.scrollY + rect.top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      const scroller = elProductsScroller;
      const padTop = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop || "0") : 0;
      const offset = Math.max(0, padTop || 0) + 120;
      if (elProductsScroller && typeof elProductsScroller.scrollTo === "function") {
        const top = header.offsetTop - offset;
        elProductsScroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else if (typeof header.scrollIntoView === "function") {
        header.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    setTimeout(() => {
      isProgrammaticCategoryScroll = false;
      // После завершения программного скролла ещё раз выравниваем чипы,
      // чтобы правило привязки к левому краю сработало и при выборе через список категорий.
      scrollChipsToCategory(state.activeCategoryId);
    }, 450);
  }

  function refreshCategoryHeaders() {
    categoryHeaders = Array.from(elProductsGrid?.querySelectorAll?.(".shop-category-header") || []);
  }

  function scrollChipsToCategory(categoryId) {
    const id = Number(categoryId);
    if (!Number.isFinite(id) || !elCatChips) return;
    const chip = elCatChips.querySelector(`.shop-cat-chip[data-cat-id="${id}"]`);
    if (!chip) return;

    const scroller = elCatChips;
    const wrap = elCatChipsWrap || elCatChips;
    if (!scroller || !wrap) return;

    // Делаем так, чтобы активный чип оказывался у левого края (с небольшим отступом)
    const paddingLeft = 12;
    let target = Math.max(0, chip.offsetLeft - paddingLeft);

    // Если уже почти на нужном месте — не дёргаем скролл
    const current = scroller.scrollLeft || 0;
    if (Math.abs(current - target) < 2) return;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: target, behavior: "smooth" });
    } else {
      scroller.scrollLeft = target;
    }
  }

  function updateActiveCategoryFromScroll() {
    if (!categoryHeaders.length) return;
    if (isProgrammaticCategoryScroll) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    let containerTop = 0;
    let offset = 0;
    if (isMobile) {
      const headerH = Number(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0;
      const chipsPanel = document.querySelector(".center-stack > .panel:first-child");
      const chipsH = chipsPanel?.getBoundingClientRect ? chipsPanel.getBoundingClientRect().height : 0;
      offset = headerH + chipsH + 70;
      containerTop = 0;
    } else {
      containerTop = elProductsScroller?.getBoundingClientRect
        ? elProductsScroller.getBoundingClientRect().top
        : 0;
      const scroller = elProductsScroller;
      const padTop = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop || "0") : 0;
      offset = Math.max(0, padTop || 0) + 120;
    }

    let activeHeader = categoryHeaders[0];
    if (!isMobile && elProductsScroller) {
      const scrollTop = elProductsScroller.scrollTop || 0;
      for (const h of categoryHeaders) {
        const top = h.offsetTop - scrollTop;
        if (top <= offset) activeHeader = h;
        else break;
      }
    } else {
      for (const h of categoryHeaders) {
        const top = h.getBoundingClientRect().top - containerTop;
        if (top <= offset) activeHeader = h;
        else break;
      }
    }

    const nextId = Number(activeHeader?.dataset?.catId);
    if (!Number.isFinite(nextId) || nextId === Number(state.activeCategoryId)) return;
    const nextTitle = activeHeader?.dataset?.catTitle || "";
    setActiveCategory(nextId, nextTitle, { scroll: false });
    ensureCategoryLoaded(nextId, { limit: 200 });
  }

  function bindCategoryScrollSpy() {
    if (bindCategoryScrollSpy._bound) return;
    bindCategoryScrollSpy._bound = true;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const scroller = isMobile ? window : (elProductsScroller || window);
    if (!scroller || !scroller.addEventListener) return;
    scroller.addEventListener("scroll", () => {
      if (categoryScrollRaf) return;
      categoryScrollRaf = requestAnimationFrame(() => {
        categoryScrollRaf = null;
        updateActiveCategoryFromScroll();
      });
    });

    // Desktop fallback: also listen on window in case scroll container changes
    if (!isMobile && scroller !== window) {
      window.addEventListener("scroll", () => {
        if (categoryScrollRaf) return;
        categoryScrollRaf = requestAnimationFrame(() => {
          categoryScrollRaf = null;
          updateActiveCategoryFromScroll();
        });
      });
    }
  }

  function renderCategories() {
    elCatsList.innerHTML = "";

    getVisibleCategories().forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-cat-item";
      btn.setAttribute("data-cat-id", String(c.id));

      if (Number(state.activeCategoryId) === Number(c.id)) btn.classList.add("is-active");

      btn.appendChild(createCatIcon(c.icon));

      const text = document.createElement("div");
      text.className = "shop-cat-text";

      const title = document.createElement("div");
      title.className = "shop-cat-title";
      title.textContent = str(c.title);

      text.appendChild(title);
      btn.appendChild(text);

      btn.addEventListener("click", () => {
        selectCategory(c.id, c.title);
        closeShopSheetIfOpen();
      });

      elCatsList.appendChild(btn);
    });
  }

  function renderCategoryChips() {
    if (!elCatChips) return;
    elCatChips.innerHTML = "";

    getVisibleCategories().forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-cat-chip";
      btn.setAttribute("data-cat-id", String(c.id));
      btn.textContent = str(c.title);
      if (Number(state.activeCategoryId) === Number(c.id)) btn.classList.add("is-active");

      btn.addEventListener("click", () => {
        selectCategory(c.id, c.title);
      });

      elCatChips.appendChild(btn);
    });

    if (elCatChipsWrap) elCatChipsWrap.classList.remove("hidden");
    scrollChipsToCategory(state.activeCategoryId);
    bindCategoryChipsWheelScroll();
  }

  function bindCategoryChipsWheelScroll() {
    if (!elCatChips || elCatChips.dataset.wheelBound === "1") return;
    const tabletMq = window.matchMedia("(min-width: 769px) and (max-width: 1199px)");
    const onWheel = (event) => {
      if (!tabletMq.matches) return;
      const scroller = elCatChips;
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      if (maxScrollLeft <= 0) return;

      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      if (!primaryDelta) return;

      const current = scroller.scrollLeft || 0;
      const next = Math.max(0, Math.min(maxScrollLeft, current + primaryDelta));
      if (Math.abs(next - current) < 0.5) return;

      event.preventDefault();
      scroller.scrollLeft = next;
    };
    elCatChips.addEventListener("wheel", onWheel, { passive: false });
    elCatChips.dataset.wheelBound = "1";
  }

  // -----------------------------
  // Pills
  // -----------------------------
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

  function catalogCenterHtml(product, qty, calculatedPrice = null) {
    const old = Number(product.old_price || 0);
    let price = calculatedPrice != null
      ? calculatedPrice
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    let showOld = old > 0 && old > price;

    // Обработка скидок из API (бейдж теперь на картинке, здесь только цена)
    if (product.discount && product.discount.discount_amount > 0) {
      const originalPrice = Number(product.original_price || price);
      const discountedPrice = Number(product.discounted_price || price);
      
      // Отображаем старую цену зачёркнутой
      if (!showOld && originalPrice > discountedPrice) {
        showOld = true;
        price = discountedPrice;
      }
    }

    if (!isProductAvailable(product)) return "Нет в наличии";
    if (qty > 0) return `${moneyNoSign(price)} ₽`;
    if (showOld) {
      const oldPrice = product.discount ? Number(product.original_price) : old;
      return `<span class="sp-old-price">${moneyNoSign(oldPrice)} ₽</span>${moneyNoSign(price)} ₽`;
    }
    return `${moneyNoSign(price)} ₽`;
  }

  function isProductAvailable(product) {
    if (!product) return true;
    const explicitAvailability =
      product.is_available !== undefined && product.is_available !== null
        ? Number(product.is_available) === 1 || product.is_available === true
        : null;

    const pid = Number(product.id || product.product_id || 0);
    const stockEntry = Number.isFinite(pid) && pid > 0 ? getStockLevelEntry(pid) : null;
    const stockAvailability = stockEntry
      ? (
          stockEntry.isAvailable !== undefined && stockEntry.isAvailable !== null
            ? !!stockEntry.isAvailable
            : (stockEntry.qty === undefined || stockEntry.qty === null ? true : Number(stockEntry.qty) > 0)
        )
      : null;

    if (explicitAvailability === false || stockAvailability === false) return false;
    if (explicitAvailability === true) return true;
    if (stockAvailability !== null) return stockAvailability;

    if (product.stock_qty !== undefined && product.stock_qty !== null) {
      return Number(product.stock_qty) !== 0;
    }
    return true;
  }

  // ??? ??? ???????????? ??? ?? ?????????
  const defaultPriceCache = new Map();

  /**
   * ???????????? ???? ?????? ? ?????? ???????? ? ????? ?? ?????????
   */
  async function calculateDefaultPrice(product) {
    const productId = product.id;
    
    // ????????? ???
    if (defaultPriceCache.has(productId)) {
      return defaultPriceCache.get(productId);
    }

    let price = Number(product.price || 0);

    try {
      // ????????? ????????
      const variants = await resolveProductVariants(productId);
      
      // ???? ???? ????????, ????? ???? ???????? ?? ????????? (?????????????? ??? ?????????)
      if (variants.length > 0 && variants[0].values?.length > 0) {
        const variant = variants[0];
        // ?????????? default_value_index (?????????????? ??? ?????????), ???? ?????, ????? 0
        const defaultIndex = variant.default_value_index != null 
          ? Number(variant.default_value_index) 
          : 0;
        // ????????? ??? ?????? ????????
        const validIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
        const variantState = {
          selectedIndex: validIndex,
          value: variant.values[validIndex],
          label: String(variant.values[validIndex]),
        };
        price = getVariantUnitPrice(product, variants, variantState);
      }

      // ????????? ?????
      const optionGroups = await resolveProductOptionGroups(productId);
      
      // ????????? ????????? ???????????? ????? ?? ?????????
      for (const group of optionGroups) {
        const groupType = getOptionGroupUiType(group);
        
        if (groupType === "single" && group.is_required && group.items?.length > 0) {
          // ??? single ? is_required ? ????? ?????? ??????? ??? ?????????
          const defaultItem = group.items[0];
          if (defaultItem?.price) {
            price += Number(defaultItem.price || 0);
          }
        } else if (groupType === "multiple_item" || groupType === "multiple_group") {
          const minSelect = Math.max(0, Number(group?.min_select ?? 0));
          if (minSelect <= 0) continue;

          let selectedCount = 0;
          for (const item of (group.items || [])) {
            if (selectedCount >= minSelect) break;
            const qtyMin = Number(item?.qty_min ?? 0);
            const defaultQty = qtyMin > 0 ? qtyMin : 1;
            if (item.price) {
              price += Number(item.price || 0) * defaultQty;
            }
            selectedCount += 1;
          }
        }
      }
    } catch (e) {
      console.error("Error calculating default price:", e);
    }

    // ????????? ? ???
    price = roundPrice(price);
    defaultPriceCache.set(productId, price);
    return price;
  }

  /**
   * ?????????? ????????? ???? ?? ???????? ??????
   */
  async function updateCardPrice(card, product) {
    const qty = cartQty(product.id);
    const calculatedPrice = await calculateDefaultPrice(product);
    
    const center = card.querySelector(".qty-pill__center");
    if (center) {
      center.innerHTML = catalogCenterHtml(product, qty, calculatedPrice);
    }
  }

  let __shopChatPromise = null;
  function ensureShopChatLoaded() {
    if (__shopChatPromise) return __shopChatPromise;
    __shopChatPromise = new Promise((resolve) => {
      if (window.__shopChatLoaded) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-shop-chat]');
      if (existing) {
        existing.addEventListener('load', () => {
          window.__shopChatLoaded = true;
          resolve();
        });
        existing.addEventListener('error', () => {
          __shopChatPromise = null;
          resolve();
        });
        return;
      }
      var url = window.__shopChatUrl || '/static/js/shop-company-chat.js';
      var sc = document.createElement('script');
      sc.src = url;
      sc.defer = true;
      sc.dataset.shopChat = '1';
      sc.onload = () => {
        window.__shopChatLoaded = true;
        resolve();
      };
      sc.onerror = () => {
        __shopChatPromise = null;
        resolve();
      };
      document.head.appendChild(sc);
    });
    return __shopChatPromise;
  }

  let __shopLatePromise = null;
  function ensureShopLateLoaded() {
    if (__shopLatePromise) return __shopLatePromise;
    __shopLatePromise = new Promise((resolve) => {
      if (window.__shopLateLoaded) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-shop-late]');
      if (existing) {
        existing.addEventListener('load', () => {
          window.__shopLateLoaded = true;
          if (!window.__shopLateInitDone && typeof initShopLate === "function") {
            window.__shopLateInitDone = true;
            initShopLate();
          }
          resolve();
        });
        existing.addEventListener('error', () => { resolve(); });
        return;
      }
      const s = document.createElement('script');
      s.src = window.__shopLateUrl || '/static/js/shop-late.js';
      s.defer = true;
      s.dataset.shopLate = '1';
      s.onload = () => {
        window.__shopLateLoaded = true;
        if (!window.__shopLateInitDone && typeof initShopLate === "function") {
          window.__shopLateInitDone = true;
          initShopLate();
        }
        resolve();
      };
      s.onerror = () => { resolve(); };
      document.head.appendChild(s);
    });
    return __shopLatePromise;
  }

  function openProductDetails(productId, opts = {}) {
    try {
      if (stockEventsWaitAbortController) stockEventsWaitAbortController.abort();
    } catch {}
    return ensureShopLateLoaded().then(() => {
      if (typeof window.openProductDetails === "function" && window.openProductDetails !== openProductDetails) {
        return window.openProductDetails(productId, opts);
      }
    });
  }

  function bindShopWarmups() {
    if (bindShopWarmups._bound) return;
    bindShopWarmups._bound = true;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;

      // After first real user interaction we can warm up non-critical features.
      runWhenIdle(() => {
        try { ensureShopLateLoaded(); } catch {}
      }, 1500);

      runWhenIdle(() => {
        try {
          if (state.activeCategoryId != null) {
            ensureCategoryLoaded(state.activeCategoryId, { limit: 200 });
          }
        } catch {}
      }, 2000);

      runWhenIdle(() => {
        try { preloadCartEnhancers(); } catch {}
      }, 900);
    };

    ["pointerdown", "touchstart", "wheel", "keydown"].forEach((evt) => {
      window.addEventListener(evt, start, { passive: true, once: true });
    });

    const warmByCartIntent = () => {
      try { preloadCartEnhancers(); } catch {}
    };
    [elCartOpenDesktop, elNavCart, elMobileCheckoutBtn].forEach((el) => {
      if (!el || !el.addEventListener) return;
      el.addEventListener("pointerenter", warmByCartIntent, { passive: true, once: true });
      el.addEventListener("touchstart", warmByCartIntent, { passive: true, once: true });
      el.addEventListener("focus", warmByCartIntent, { passive: true, once: true });
    });
  }

  function bindLateActionDelegates() {
    if (bindLateActionDelegates._bound) return;
    bindLateActionDelegates._bound = true;

    const bindClickLazy = (el) => {
      if (!el || !el.addEventListener) return;
      el.addEventListener(
        "click",
        (e) => {
          if (window.__shopLateLoaded) return;
          e.preventDefault();
          e.stopPropagation();
          const prevDisabled = !!el.disabled;
          try { el.disabled = true; } catch {}
          ensureShopLateLoaded().then(() => {
            try { el.disabled = prevDisabled; } catch {}
            try { el.click(); } catch {}
          });
        },
        { capture: true }
      );
    };

    // Core renders cart immediately; late bundle wires complex flows (checkout, clear with confirm, etc.).
    bindClickLazy(elCheckoutBtn);
    bindClickLazy(elCartClearBtn);

    if (elCompanyChatOpenBtn && elCompanyChatOpenBtn.addEventListener) {
      elCompanyChatOpenBtn.addEventListener(
        "click",
        (e) => {
          if (window.__shopChatLoaded) return;
          e.preventDefault();
          e.stopPropagation();
          ensureShopChatLoaded().then(() => {
            try { elCompanyChatOpenBtn.click(); } catch {}
          });
        },
        { capture: true }
      );
    }
  }

  function openComboDetails(comboId, opts = {}) {
    try {
      if (stockEventsWaitAbortController) stockEventsWaitAbortController.abort();
    } catch {}
    return ensureShopLateLoaded().then(() => {
      if (typeof window.openComboDetails === "function" && window.openComboDetails !== openComboDetails) {
        return window.openComboDetails(comboId, opts);
      }
    });
  }

  let comboDetailsPrefetchFlushTimer = null;
  const comboDetailsPrefetchPendingIds = new Set();
  let comboDetailsPrefetchPendingLimit = 8;
  let comboDetailsPrefetchPendingDelayMs = 220;
  const INITIAL_CATALOG_SKELETON_CARDS = 8;
  const INITIAL_CATALOG_SKELETON_CATEGORIES = 10;
  const INITIAL_CATALOG_PREFETCH_PRODUCTS = 14;
  const INITIAL_CATALOG_PREFETCH_COMBOS = 6;
  const INITIAL_CATALOG_WARM_TIMEOUT_MS = 1400;

  function renderCategoriesSkeleton(count = INITIAL_CATALOG_SKELETON_CATEGORIES) {
    if (!elCatsList) return;
    const n = Math.max(1, Number(count || 0));
    const frag = document.createDocumentFragment();
    elCatsList.innerHTML = "";
    for (let i = 0; i < n; i += 1) {
      const item = document.createElement("div");
      item.className = "shop-cat-item shop-cat-item--skeleton";
      item.setAttribute("aria-hidden", "true");

      const icon = document.createElement("div");
      icon.className = "shop-cat-icon shop-skeleton-shimmer";
      item.appendChild(icon);

      const text = document.createElement("div");
      text.className = "shop-cat-text";
      const line = document.createElement("div");
      line.className = "shop-cat-title shop-skeleton-shimmer shop-cat-title--skeleton";
      text.appendChild(line);
      item.appendChild(text);

      frag.appendChild(item);
    }
    elCatsList.appendChild(frag);
  }

  function renderProductsSkeleton(count = INITIAL_CATALOG_SKELETON_CARDS) {
    if (!elProductsGrid) return;
    const n = Math.max(2, Number(count || 0));
    const frag = document.createDocumentFragment();
    elProductsGrid.innerHTML = "";
    if (elProductsEmpty) elProductsEmpty.classList.add("hidden");

    for (let i = 0; i < n; i += 1) {
      const card = document.createElement("article");
      card.className = "sp-card sp-card--skeleton";
      card.setAttribute("aria-hidden", "true");

      const media = document.createElement("div");
      media.className = "sp-media shop-skeleton-shimmer";
      card.appendChild(media);

      const info = document.createElement("div");
      info.className = "sp-info";

      const title = document.createElement("div");
      title.className = "shop-skeleton-shimmer sp-skel-line sp-skel-line--title";
      info.appendChild(title);

      const sub = document.createElement("div");
      sub.className = "shop-skeleton-shimmer sp-skel-line sp-skel-line--sub";
      info.appendChild(sub);

      const bottom = document.createElement("div");
      bottom.className = "sp-bottom";
      const btn = document.createElement("div");
      btn.className = "shop-skeleton-shimmer sp-skel-pill";
      bottom.appendChild(btn);
      info.appendChild(bottom);

      card.appendChild(info);
      frag.appendChild(card);
    }
    elProductsGrid.appendChild(frag);
  }

  function collectInitialCatalogWarmIds() {
    const productIds = [];
    const comboIds = [];
    const categories = getVisibleCategories();

    for (const c of categories) {
      const cid = Number(c?.id || 0);
      if (!Number.isFinite(cid) || cid <= 0) continue;

      const products = Array.isArray(state.productsByCategory?.get(cid))
        ? state.productsByCategory.get(cid)
        : [];
      for (const p of products) {
        const pid = Number(p?.id || 0);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        productIds.push(pid);
        if (productIds.length >= INITIAL_CATALOG_PREFETCH_PRODUCTS) break;
      }

      const combos = Array.isArray(state.combosByCategory?.get(cid))
        ? state.combosByCategory.get(cid)
        : [];
      for (const combo of combos) {
        const comboId = Number(combo?.id || 0);
        if (!Number.isFinite(comboId) || comboId <= 0) continue;
        comboIds.push(comboId);
        if (comboIds.length >= INITIAL_CATALOG_PREFETCH_COMBOS) break;
      }

      if (
        productIds.length >= INITIAL_CATALOG_PREFETCH_PRODUCTS &&
        comboIds.length >= INITIAL_CATALOG_PREFETCH_COMBOS
      ) {
        break;
      }
    }

    return {
      productIds: Array.from(new Set(productIds)).slice(0, INITIAL_CATALOG_PREFETCH_PRODUCTS),
      comboIds: Array.from(new Set(comboIds)).slice(0, INITIAL_CATALOG_PREFETCH_COMBOS),
    };
  }

  async function warmInitialCatalogInteractionData() {
    const { productIds, comboIds } = collectInitialCatalogWarmIds();
    if (!productIds.length && !comboIds.length) return;

    try {
      await ensureShopLateLoaded();
    } catch {
      return;
    }

    const warmTask = (async () => {
      if (typeof window.warmInitialCatalogPayload === "function") {
        await window.warmInitialCatalogPayload({
          productIds,
          comboIds,
          productLimit: INITIAL_CATALOG_PREFETCH_PRODUCTS,
          comboLimit: INITIAL_CATALOG_PREFETCH_COMBOS,
        });
        return;
      }

      if (typeof window.prefetchProductDetailsConfig === "function" && productIds.length) {
        window.prefetchProductDetailsConfig(productIds, {
          limit: productIds.length,
          delayMs: 0,
        });
      }
      if (typeof window.prefetchComboDetails === "function" && comboIds.length) {
        window.prefetchComboDetails(comboIds, {
          limit: comboIds.length,
          delayMs: 0,
          preloadProductConfigs: true,
          eager: true,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    })();

    await Promise.race([
      warmTask.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, INITIAL_CATALOG_WARM_TIMEOUT_MS)),
    ]);
  }

  function scheduleComboDetailsPrefetch(comboIds, opts = {}) {
    const ids = Array.isArray(comboIds)
      ? comboIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!ids.length) return;

    ids.forEach((id) => comboDetailsPrefetchPendingIds.add(id));

    const limit = Number(opts.limit || 0);
    if (Number.isFinite(limit) && limit > 0) {
      comboDetailsPrefetchPendingLimit = Math.max(comboDetailsPrefetchPendingLimit, Math.floor(limit));
    }
    const delayMs = Number(opts.delayMs);
    if (Number.isFinite(delayMs) && delayMs >= 0) {
      comboDetailsPrefetchPendingDelayMs = Math.min(comboDetailsPrefetchPendingDelayMs, Math.floor(delayMs));
    }

    if (comboDetailsPrefetchFlushTimer) {
      clearTimeout(comboDetailsPrefetchFlushTimer);
      comboDetailsPrefetchFlushTimer = null;
    }
    comboDetailsPrefetchFlushTimer = setTimeout(() => {
      comboDetailsPrefetchFlushTimer = null;
      const pendingIds = Array.from(comboDetailsPrefetchPendingIds);
      comboDetailsPrefetchPendingIds.clear();
      const limitToUse = Math.max(1, Number(comboDetailsPrefetchPendingLimit || 8), pendingIds.length);
      comboDetailsPrefetchPendingLimit = 8;
      comboDetailsPrefetchPendingDelayMs = 220;
      if (!pendingIds.length) return;

      ensureShopLateLoaded().then(() => {
        if (typeof window.prefetchComboDetails === "function") {
          window.prefetchComboDetails(pendingIds, {
            limit: limitToUse,
            delayMs: 0,
            preloadProductConfigs: true,
            eager: true,
          });
        }
      }).catch(() => {});
    }, Math.max(0, Number(comboDetailsPrefetchPendingDelayMs || 0)));
  }

  // -----------------------------
  // Products (???????? ?? ??????)
  // -----------------------------
  function renderProducts(opts = {}) {
    const appendOnly = !!opts.appendOnly;
    const allowCritical = !appendOnly;
    if (!appendOnly) {
      elProductsGrid.innerHTML = "";
    }

    const categories = getVisibleCategories();
    let totalProducts = 0;
    const CRITICAL_PRODUCT_CARDS = 16;
    let globalCardIndex = 0; // ???????? ?????? ???????? (?????? + ?????) ??? ????????????? ???????????

    categories.forEach((c) => {
      const cid = Number(c.id);
      if (!Number.isFinite(cid)) return;

      let header = elProductsGrid.querySelector(`.shop-category-header[data-cat-id="${cid}"]`);
      if (!header) {
        header = document.createElement("div");
        header.className = "shop-category-header";
        header.setAttribute("data-cat-id", String(cid));
        header.setAttribute("data-cat-title", str(c.title));
        header.textContent = str(c.title);
        elProductsGrid.appendChild(header);
      } else if (!appendOnly) {
        header.setAttribute("data-cat-title", str(c.title));
        header.textContent = str(c.title);
      }

      let insertBefore = null;
      const existingProductIds = appendOnly ? new Set() : null;
      const existingComboIds = appendOnly ? new Set() : null;
      if (appendOnly) {
        let n = header.nextSibling;
        while (n) {
          if (n.nodeType === 1 && n.classList && n.classList.contains("shop-category-header")) {
            insertBefore = n;
            break;
          }
          n = n.nextSibling;
        }

        let m = header.nextSibling;
        while (m && m !== insertBefore) {
          if (m.nodeType === 1 && m.classList && m.classList.contains("sp-card")) {
            const pid = Number(m.getAttribute("data-product-id"));
            if (Number.isFinite(pid)) existingProductIds.add(pid);
            const coid = Number(m.getAttribute("data-combo-id"));
            if (Number.isFinite(coid)) existingComboIds.add(coid);
          }
          m = m.nextSibling;
        }
      }

      const products = state.productsByCategory.get(cid) || [];
      totalProducts += products.length;
      const frag = document.createDocumentFragment();
      const prefetchProductIds = [];
      const prefetchComboIds = [];

      products.forEach((p) => {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        if (appendOnly && existingProductIds && existingProductIds.has(id)) return;
        prefetchProductIds.push(id);
        const qty = cartQty(id);
        const available = isProductAvailable(p);
        const photos = safePhotos(p);
        const mainPhoto = photos[0] || "";
        const gridPhoto = p.photo_thumb || mainPhoto || "";
        const previewPhoto = p.photo_lqip || p.photo_thumb || mainPhoto || "/static/img/placeholder.png";

        const card = document.createElement("article");
        card.className = "sp-card";
        card.setAttribute("data-product-id", String(id));
        card.setAttribute("data-qty", String(qty));
        if (qty > 0) card.classList.add("is-in-cart");

        const media = document.createElement("div");
        media.className = "sp-media";

        const isCriticalCard = allowCritical && globalCardIndex < CRITICAL_PRODUCT_CARDS;
        if (isCriticalCard) {
          preloadImageOnce(gridPhoto || mainPhoto || "/static/img/placeholder.png", { fetchPriority: 'high' });
        }

        // LQIP-?????? (????? ???????????? ????????? previewPhoto, ???? ?????? ??? ??????)
        const imgPreview = createOptimizedImage(previewPhoto, {
          type: 'product-grid',
          className: 'sp-img sp-img-lqip',
          alt: '',
          usePicture: false,
          priority: isCriticalCard,
        });
        media.appendChild(imgPreview);

        // ??????????? ??????????? ?????? (createOptimizedImage ????? ??????? <picture> ??? .webp)
        const imgFull = createOptimizedImage(gridPhoto || mainPhoto || "/static/img/placeholder.png", {
          type: 'product-grid',
          className: 'sp-img sp-img-full',
          alt: '',
          usePicture: true,
          priority: isCriticalCard,
        });
        const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
        if (fullImgEl) {
          fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
          fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
        }
        media.appendChild(imgFull);
        if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");

        const overlay = document.createElement("div");
        overlay.className = "sp-qtyOverlay";
        if (qty <= 0) overlay.classList.add("hidden");

        const qBox = document.createElement("div");
        qBox.className = "qty-carousel";
        qBox.textContent = String(qty || "");
        qBox.setAttribute("data-v", String(qty || 0));

        overlay.appendChild(qBox);
        media.appendChild(overlay);

        // Бейдж скидки поверх изображения (как на комбо)
        if (p.discount && p.discount.discount_amount > 0) {
          const discountBadge = document.createElement("div");
          discountBadge.className = "sp-combo-discount";
          if (p.discount.discount_type === 'percent') {
            discountBadge.textContent = `-${Math.round(p.discount.discount_value)}%`;
          } else {
            discountBadge.textContent = `-${moneyNoSign(p.discount.discount_amount)} ₽`;
          }
          media.appendChild(discountBadge);
        }

        card.appendChild(media);

        const info = document.createElement("div");
        info.className = "sp-info";

        const title = document.createElement("div");
        title.className = "sp-title";
        title.textContent = str(p.name);
        info.appendChild(title);

        const sub = document.createElement("div");
        sub.className = "sp-sub";
        sub.textContent = str(p.description_short || "");
        info.appendChild(sub);

        const bottom = document.createElement("div");
        bottom.className = "sp-bottom";

        const { pill, btnMinus, btnPlus, center } = createQtyPill({
          variant: available ? "buy" : "muted",
          centerHtml: catalogCenterHtml(p, qty),
          minusEnabled: qty > 0 && available,
          plusEnabled: available,
        });

        if (qty <= 0) pill.classList.add("is-empty");
        else pill.classList.add("has-qty");
        if (!available) card.classList.add("is-unavailable");

        bottom.appendChild(pill);
        info.appendChild(bottom);
        card.appendChild(info);

        btnPlus.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
          await openProductDetails(id);
        });

        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          changeQty(id, -1);
        });

        card.addEventListener("click", () => openProductDetails(id));

        frag.appendChild(card);
        applyCardState(card, p, qty, null);

        // ???? ? ??????? ?? ?????? display_price ? ?????????? ?????????? ???????? ? ????????? ????
        // display_price calculation is deferred for performance (handled in shop-late/product details)

        globalCardIndex += 1;
      });

      if (typeof window.prefetchProductDetailsConfig === "function" && prefetchProductIds.length) {
        window.prefetchProductDetailsConfig(prefetchProductIds, {
          limit: appendOnly ? 4 : 8,
          delayMs: appendOnly ? 140 : 260,
        });
      }

      // ???????? ?????-??????? ? ???? ?????????
      const combos = state.combosByCategory.get(cid) || [];
      combos.forEach((combo) => {
        const comboId = Number(combo.id);
        if (!Number.isFinite(comboId)) return;
        if (appendOnly && existingComboIds && existingComboIds.has(comboId)) return;
        if (!isComboCatalogEntryAvailable(combo)) return;
        prefetchComboIds.push(comboId);
        const card = document.createElement("article");
        card.className = "sp-card sp-card--combo";
        card.setAttribute("data-combo-id", String(comboId));

        const media = document.createElement("div");
        media.className = "sp-media sp-media--combo";

        const gridPhotos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
        const gridThumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
        const singleImage = (combo.image_url || "").trim();
        const singleImageThumb = (combo.image_thumb || "").trim();
        // ??????? ???? ? ????? 2?2: ?????? 0,1,2,3 ? ???? 1, 3, 4, 2 (??????? 0, 2, 3, 1)
        const comboGridOrder = [0, 2, 3, 1];
        const isCriticalCard = allowCritical && globalCardIndex < CRITICAL_PRODUCT_CARDS;

        if (singleImage) {
          const finalImage = singleImageThumb || singleImage;
          const previewUrl = combo.image_lqip || finalImage;
          if (isCriticalCard) {
            preloadImageOnce(finalImage, { fetchPriority: 'high' });
          }

          const imgPreview = createOptimizedImage(previewUrl, {
            type: "product-grid",
            className: "sp-img sp-img-lqip",
            alt: "",
            priority: isCriticalCard,
          });
          media.appendChild(imgPreview);

          const imgFull = createOptimizedImage(finalImage, {
            type: "product-grid",
            className: "sp-img sp-img-full",
            alt: "",
            priority: isCriticalCard,
          });
          const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
          if (fullImgEl) {
            fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
            fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
          }
          media.appendChild(imgFull);
          if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
        } else if (gridPhotos.length > 0) {
          const grid = document.createElement("div");
          grid.className = "sp-combo-grid";
          for (let i = 0; i < 4; i++) {
            const cell = document.createElement("div");
            cell.className = "sp-combo-grid__cell";
            const src = gridPhotos[comboGridOrder[i]] || "";
            const thumb = gridThumbs[comboGridOrder[i]] || "";
            const finalSrc = thumb || src;
            if (finalSrc) {
              const previewUrl = finalSrc; // ??? ??????? ???? ????? ?????????? ????????? LQIP ??? ??????
              if (isCriticalCard) {
                preloadImageOnce(finalSrc, { fetchPriority: 'high' });
              }

              const imgPreview = createOptimizedImage(previewUrl, {
                type: "product-grid",
                className: "sp-img sp-img-lqip",
                alt: "",
                priority: isCriticalCard,
              });
              cell.appendChild(imgPreview);

              const imgFull = createOptimizedImage(finalSrc, {
                type: "product-grid",
                className: "sp-img sp-img-full",
                alt: "",
                priority: isCriticalCard,
              });
              const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
              if (fullImgEl) {
                fullImgEl.addEventListener("load", () => cell.classList.add("is-loaded"));
                fullImgEl.addEventListener("error", () => cell.classList.add("is-loaded"));
              }
              cell.appendChild(imgFull);
              if (fullImgEl && fullImgEl.complete) cell.classList.add("is-loaded");
            } else {
              cell.classList.add("sp-combo-grid__cell--empty");
            }
            grid.appendChild(cell);
          }
          media.appendChild(grid);
        } else {
          const imgPreview = createOptimizedImage("/static/img/placeholder.png", {
            type: "product-grid",
            className: "sp-img sp-img-lqip",
            alt: "",
            priority: isCriticalCard,
          });
          media.appendChild(imgPreview);

          const imgFull = createOptimizedImage("/static/img/placeholder.png", {
            type: "product-grid",
            className: "sp-img sp-img-full",
            alt: "",
            priority: isCriticalCard,
          });
          const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
          if (fullImgEl) {
            fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
            fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
          }
          media.appendChild(imgFull);
          if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
        }

        const discountPercent = Number(combo.discount_percent) || 0;
        if (discountPercent > 0) {
          const badge = document.createElement("div");
          badge.className = "sp-combo-discount";
          badge.textContent = "-" + Math.round(discountPercent) + "%";
          media.appendChild(badge);
        }

        card.appendChild(media);

        const info = document.createElement("div");
        info.className = "sp-info";

        const title = document.createElement("div");
        title.className = "sp-title sp-title--two-lines";
        title.textContent = str(combo.title);
        info.appendChild(title);

        const sub = document.createElement("div");
        sub.className = "sp-sub sp-sub--one-line";
        sub.textContent = str(combo.description || "");
        info.appendChild(sub);

        const bottom = document.createElement("div");
        bottom.className = "sp-bottom";
        const minPrice = Number(combo.min_price) || 0;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sp-combo-btn";
        btn.innerHTML = `<span class="sp-combo-btn__text">от ${moneyNoSign(minPrice)} ₽</span><span class="sp-combo-btn__arrow" aria-hidden="true">›</span>`;
        bottom.appendChild(btn);
        info.appendChild(bottom);
        card.appendChild(info);

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openComboDetails(comboId);
        });
        card.addEventListener("click", (e) => {
          if (!e.target.closest(".sp-combo-btn")) openComboDetails(comboId);
        });
        const warmComboDetailsOnIntent = () => {
          scheduleComboDetailsPrefetch([comboId], { limit: 1, delayMs: 0 });
        };
        card.addEventListener("pointerenter", warmComboDetailsOnIntent, { passive: true, once: true });
        card.addEventListener("touchstart", warmComboDetailsOnIntent, { passive: true, once: true });
        btn.addEventListener("focus", warmComboDetailsOnIntent, { once: true });

        frag.appendChild(card);
        totalProducts += 1;
        globalCardIndex += 1;
      });

      if (prefetchComboIds.length) {
        scheduleComboDetailsPrefetch(prefetchComboIds, {
          limit: appendOnly ? 4 : 12,
          delayMs: appendOnly ? 100 : 180,
        });
      }
      if (appendOnly) {
        elProductsGrid.insertBefore(frag, insertBefore);
      } else {
        elProductsGrid.appendChild(frag);
      }
    });

    if (!appendOnly && elProductsEmpty) {
      if (totalProducts === 0) elProductsEmpty.classList.remove("hidden");
      else elProductsEmpty.classList.add("hidden");
    }

    updateCartBadge();
    refreshCategoryHeaders();
  }

  function applyCardState(card, product, qty, dir) {
    const media = $(".sp-media", card);
    const overlay = $(".sp-qtyOverlay", card);
    const qtyBox = $(".qty-carousel", card);

    const pill = $(".qty-pill", card);
    const btnMinus = $(".qty-pill__btn--minus", card);
    const btnPlus = $(".qty-pill__btn--plus", card);
    const center = $(".qty-pill__center", card);
    const stockAvailable = isProductAvailable(product);
    const pid = Number(product?.id || 0);
    const remaining = Number.isFinite(pid) && pid > 0 ? getAvailableStock(pid) : Infinity;
    const plusBlockedByLimit = stockAvailable && Number.isFinite(remaining) && remaining <= 0;
    const plusBlockedByIngredients =
      stockAvailable && Number.isFinite(pid) && pid > 0 ? isProductBlockedByIngredientRequirements(pid) : false;
    const availableForAdd = stockAvailable && !plusBlockedByLimit && !plusBlockedByIngredients;

    card.setAttribute("data-qty", String(qty));
    card.classList.toggle("is-unavailable", !availableForAdd);

    if (qty > 0) {
      card.classList.add("is-in-cart");
      if (overlay) overlay.classList.remove("hidden");
      if (qtyBox) {
        if (dir) animateNumber(qtyBox, qty, dir);
        else {
          qtyBox.textContent = String(qty);
          qtyBox.setAttribute("data-v", String(qty));
        }
      }
      if (media) media.classList.add("is-dim");
    } else {
      card.classList.remove("is-in-cart");
      if (overlay) overlay.classList.add("hidden");
      if (qtyBox) {
        qtyBox.textContent = "";
        qtyBox.setAttribute("data-v", "0");
      }
      if (media) media.classList.remove("is-dim");
    }

    if (pill) {
      pill.classList.toggle("is-empty", qty <= 0);
      pill.classList.toggle("has-qty", qty > 0);
      pill.classList.toggle("qty-pill--muted", !stockAvailable);
    }
    if (btnMinus) {
      const minusDisabled = qty <= 0;
      btnMinus.classList.toggle("is-disabled", minusDisabled);
      btnMinus.disabled = minusDisabled;
    }
    if (btnPlus) {
      const plusDisabled = !availableForAdd;
      btnPlus.classList.toggle("is-disabled", plusDisabled);
      btnPlus.disabled = plusDisabled;
    }
    if (center) {
      if (!availableForAdd) {
        center.textContent = "Нет в наличии";
      } else {
        // ?????????? ???????????? ???? ???? ????
        const cachedPrice = defaultPriceCache.get(product.id);
        center.innerHTML = catalogCenterHtml(product, qty, cachedPrice);
      }
    }
  }

  // -----------------------------
  // Cart render
  // -----------------------------
  function sortCartItemsForDisplay(items) {
    const normal = [];
    const auto = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item?.type === "combo") normal.push(item);
      else if (Number(item?.auto_add || 0) === 1) auto.push(item);
      else normal.push(item);
    });
    auto.sort((a, b) => {
      const nameA = String(a?.product?.name || "");
      const nameB = String(b?.product?.name || "");
      return nameA.localeCompare(nameB, "ru", { sensitivity: "base" });
    });
    return normal.concat(auto);
  }

  function isFavoriteUnauthorizedError(err) {
    if (!err) return false;
    if (Number(err.httpStatus || 0) === 401) return true;
    const msg = String(err.message || "");
    return msg === "UNAUTHORIZED" || msg.includes("UNAUTHORIZED");
  }

  function setFavoriteButtonsActive(buttons, active) {
    (Array.isArray(buttons) ? buttons : []).forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle("is-active", !!active);
    });
  }

  function setFavoriteButtonsBusy(buttons, busy) {
    (Array.isArray(buttons) ? buttons : []).forEach((btn) => {
      if (!btn) return;
      btn.disabled = !!busy;
      btn.classList.toggle("is-busy", !!busy);
    });
  }

  function bindFavoriteButtonsForCartRow(buttons, buildSnapshot, { afterToggle } = {}) {
    const allButtons = (Array.isArray(buttons) ? buttons : []).filter(Boolean);
    if (!allButtons.length) return;

    let favoriteId = null;
    let isBusy = false;
    const syncActive = () => {
      setFavoriteButtonsActive(allButtons, !!favoriteId);
      allButtons.forEach((btn) => {
        if (!btn) return;
        if (favoriteId) btn.dataset.favoriteId = String(favoriteId);
        else delete btn.dataset.favoriteId;
      });
    };
    syncActive();

    const handleClick = async (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (isBusy) return;

      const token = getCustomerToken();
      if (!token) {
        promptFavoritesLogin();
        return;
      }

      isBusy = true;
      setFavoriteButtonsBusy(allButtons, true);

      try {
        if (favoriteId) {
          await removeFavoriteById(favoriteId);
          favoriteId = null;
          syncActive();
          showToast("Удалено из избранного");
          if (navigator.vibrate) navigator.vibrate(10);
          if (typeof afterToggle === "function") afterToggle({ active: false, favoriteId: null });
          return;
        }

        const snapshot = typeof buildSnapshot === "function" ? buildSnapshot() : null;
        if (!snapshot) {
          showToast("Не удалось сохранить в избранное");
          return;
        }

        const saved = await addFavoriteItemSnapshot(snapshot);
        favoriteId = Number(saved?.id || 0) || null;
        syncActive();
        showToast("Добавлено в избранное");
        if (navigator.vibrate) navigator.vibrate(10);
        if (typeof afterToggle === "function") afterToggle({ active: true, favoriteId });
      } catch (err) {
        if (isFavoriteUnauthorizedError(err)) {
          promptFavoritesLogin();
        } else {
          console.warn("Failed to toggle favorite:", err);
          showToast("Не удалось обновить избранное");
        }
      } finally {
        isBusy = false;
        setFavoriteButtonsBusy(allButtons, false);
      }
    };

    allButtons.forEach((btn) => {
      btn.addEventListener("click", handleClick);
    });
  }

  function renderCartInto(listEl, totalEl, emptyPlaceholderEl) {
    const items = sortCartItemsForDisplay(cartItemsResolved());
    const comboIdsForPrefetch = items
      .filter((item) => item && item.type === "combo")
      .map((item) => Number(item.combo_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (comboIdsForPrefetch.length) {
      scheduleComboDetailsPrefetch(comboIdsForPrefetch, { limit: 6, delayMs: 120 });
    }
    if (listEl) listEl.innerHTML = "";

    if (!items.length) {
      if (emptyPlaceholderEl) emptyPlaceholderEl.classList.remove("hidden");
      else if (listEl) listEl.innerHTML = '<div class="shop-cart-empty-sheet"><div class="empty-state"><div class="empty-icon"><i class="fas fa-shopping-cart"></i></div><div class="empty-title">Корзина пуста</div><div class="empty-text">Добавьте товары из каталога</div></div></div>';
      if (totalEl) totalEl.textContent = money(0);
      return { items, total: 0 };
    }

    if (emptyPlaceholderEl) emptyPlaceholderEl.classList.add("hidden");

    let total = 0;
    const totals = {
      nonAutoTotal: computeNonAutoTotal(items),
      autoEligibleTotal: computeAutoEligibleTotal(items),
    };

    items.forEach((item) => {
      if (item.type === "combo") {
        const { key, combo_id: comboId, combo_title: comboTitle, qty, selections } = item;
        const unitPrice = Number(item.unit_price_override || 0);
        const lineTotal = roundPrice(unitPrice * qty);
        total += lineTotal;
        const unitPriceOld = Number(item.unit_price_before_discount || 0) || unitPrice;
        const lineTotalOld = roundPrice(unitPriceOld * qty);
        const showComboOld = lineTotalOld > lineTotal;

        const swipeContainer = document.createElement("div");
        swipeContainer.className = "cart-swipe-container cart-combo-container";
        swipeContainer.setAttribute("data-cart-key", String(key || ""));

        const swipeActions = document.createElement("div");
        swipeActions.className = "cart-swipe-actions";
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "cart-swipe-btn cart-swipe-fav";
        favBtn.innerHTML = '<i class="fas fa-heart"></i>';
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "cart-swipe-btn cart-swipe-delete";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (navigator.vibrate) navigator.vibrate(20);
          deleteCartItemWithAnimation(swipeContainer, null, key);
        });
        swipeActions.appendChild(favBtn);
        swipeActions.appendChild(deleteBtn);
        swipeContainer.appendChild(swipeActions);

        const row = document.createElement("div");
        row.className = "cart-row cart-swipe-content cart-row--combo";
        row.setAttribute("data-cart-key", String(key || ""));
        row.addEventListener("click", (e) => {
          if (swipeContainer.classList.contains("is-swiped")) {
            e.stopPropagation();
            resetSwipe(swipeContainer);
            return;
          }
          if (comboId != null && Number.isFinite(Number(comboId))) {
            openComboDetails(Number(comboId), { cartKey: key });
          }
        });

        const grid = document.createElement("div");
        grid.className = "cart-combo-thumb";
        const photos = (selections || []).slice(0, 4).map((s) => s.product_photo || "");
        const comboGridOrder = [0, 2, 3, 1];
        for (let i = 0; i < 4; i++) {
          const photo = photos[comboGridOrder[i]] || "";
          const cell = document.createElement("div");
          cell.className = "cart-combo-thumb__cell" + (photo ? "" : " cart-combo-thumb__cell--empty");
          if (photo) {
            const img = createOptimizedImage(photo, { type: "cart-thumb", className: "cart-thumb", alt: "" });
            cell.appendChild(img);
          }
          grid.appendChild(cell);
        }
        row.appendChild(grid);

        const mid = document.createElement("div");
        mid.className = "cart-mid";
        const t = document.createElement("div");
        t.className = "cart-title";
        const comboTitleText = str(comboTitle || "Комбо");
        t.textContent = `${qty} x ${comboTitleText}`;
        mid.appendChild(t);

        const subContainer = document.createElement("div");
        subContainer.className = "cart-sub-container cart-combo-details";
        (selections || []).forEach((sel) => {
          const productName = String(sel.product_name || "").trim();
          const variantLine = buildVariantDisplayLineForOrder(
            sel?.variant_label,
            sel?.variant_unit,
            sel?.variant_group_title
          );
          const primaryLine = [variantLine, productName].filter(Boolean).join(" ").trim() || (productName || "Товар");
          const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
          const selBlock = document.createElement("div");
          selBlock.className = "cart-combo-detail-block";
          const nameLine = document.createElement("div");
          nameLine.className = "cart-combo-detail-name";
          nameLine.textContent = "1 x " + primaryLine;
          selBlock.appendChild(nameLine);
          const detailsWrap = document.createElement("div");
          detailsWrap.className = "cart-sub-details";
          ingredientsDisplay.forEach((ing) => {
            const lineText = formatIngredientLineForOrder(ing);
            if (!lineText) return;
            const line = document.createElement("div");
            line.className = "cart-sub-detail-item";
            line.textContent = "\u2022 " + lineText;
            detailsWrap.appendChild(line);
          });
          if (detailsWrap.childNodes.length) selBlock.appendChild(detailsWrap);
          subContainer.appendChild(selBlock);
        });
        mid.appendChild(subContainer);

        const q = document.createElement("div");
        q.className = "cart-qty";
        const comboPlusBlockedByLimit = !canIncreaseComboCartItemBeforeApply(key, +1, {
          showToastOnOut: false,
        }).allowed;
        const { pill, btnMinus, btnPlus, center } = createQtyPill({
          variant: "muted",
          centerText: String(qty),
          // Минус всегда активен при qty > 0 — при qty = 1 будет работать как удаление
          minusEnabled: qty > 0,
          plusEnabled: !comboPlusBlockedByLimit,
        });
        const right = document.createElement("div");
        right.className = "cart-right";
        if (showComboOld) {
          const oldPr = document.createElement("div");
          oldPr.className = "cart-old cart-combo-old";
          oldPr.textContent = moneyNoSign(lineTotalOld) + " ₽";
          right.appendChild(oldPr);
        }
        const pr = document.createElement("div");
        pr.className = "cart-price";
        pr.textContent = money(lineTotal);
        right.appendChild(pr);
        const desktopActions = document.createElement("div");
        desktopActions.className = "cart-desktop-actions";
        const desktopFavBtn = document.createElement("button");
        desktopFavBtn.type = "button";
        desktopFavBtn.className = "cart-desktop-btn cart-desktop-fav";
        desktopFavBtn.innerHTML = '<i class="fas fa-heart"></i>';
        desktopFavBtn.title = "В избранное";
        const desktopDeleteBtn = document.createElement("button");
        desktopDeleteBtn.type = "button";
        desktopDeleteBtn.className = "cart-desktop-btn cart-desktop-delete";
        desktopDeleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        desktopDeleteBtn.title = "Удалить";
        desktopDeleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteCartItemWithAnimation(swipeContainer, null, key);
        });
        desktopActions.appendChild(desktopFavBtn);
        desktopActions.appendChild(desktopDeleteBtn);
        right.appendChild(desktopActions);
        bindFavoriteButtonsForCartRow(
          [favBtn, desktopFavBtn],
          () => buildFavoriteSnapshotFromResolvedItem(item, { oldLineTotal: lineTotalOld }),
          {
            afterToggle: () => {
              if (swipeContainer.classList.contains("is-swiped")) {
                resetSwipe(swipeContainer);
              }
            },
          }
        );
        const updateComboQty = () => {
          const cartItem = state.cart.find((x) => x.key === key);
          const newQty = Math.max(1, Number(cartItem?.qty || 0));
          center.textContent = String(newQty);
          t.textContent = `${newQty} x ${comboTitleText}`;
          // Минус не блокируем на qty = 1 — он должен работать как удаление
          btnMinus.classList.toggle("is-disabled", newQty <= 0);
          pr.textContent = money(roundPrice(unitPrice * newQty));
          const oldEl = row.querySelector(".cart-combo-old");
          if (oldEl) {
            const uOld = Number(cartItem?.unit_price_before_discount || 0) || unitPrice;
            oldEl.textContent = moneyNoSign(roundPrice(uOld * newQty)) + " ₽";
          }
          const plusGate = canIncreaseComboCartItemBeforeApply(key, +1, {
            showToastOnOut: false,
          });
          btnPlus.disabled = !plusGate.allowed;
          btnPlus.classList.toggle("is-disabled", !plusGate.allowed);
        };
        btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          if (btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
          const gate = canIncreaseComboCartItemBeforeApply(key, +1, {
            showToastOnOut: true,
            toastMessage: "Больше нет в наличии",
          });
          if (!gate.allowed) {
            updateComboQty();
            return;
          }
          const previousCartSnapshot = cloneCartState(state.cart);
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem) return;
          cartItem.qty = Math.max(1, Number(cartItem.qty || 0) + 1);
          saveCart();
          updateComboQty();
          const { total: newTotal } = computeCartTotals(cartItemsResolved());
          if (totalEl) totalEl.textContent = money(newTotal);
          if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
          queueCartStockRecheck(previousCartSnapshot, {
            toastMessage: "Больше нет в наличии",
          });
        });
        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem) return;
          cartItem.qty = Math.max(0, Number(cartItem.qty || 0) - 1);
          if (cartItem.qty < 1) {
            removeFromCartByKey(key, null);
            swipeContainer.remove();
          } else {
            saveCart();
            updateComboQty();
          }
          const { total: newTotal } = computeCartTotals(cartItemsResolved());
          if (totalEl) totalEl.textContent = money(newTotal);
          if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
        });
        q.appendChild(pill);
        const bottomRow = document.createElement("div");
        bottomRow.className = "cart-bottom-row";
        bottomRow.appendChild(q);
        bottomRow.appendChild(right);
        mid.appendChild(bottomRow);
        row.appendChild(mid);

        initSwipeGesture(swipeContainer, row, null, key);
        swipeContainer.appendChild(row);
        if (listEl) listEl.appendChild(swipeContainer);
        return;
      }

      const {
        product,
        qty,
        key,
        option_items: optionItems,
        ingredients: cartIngredients,
        ingredient_price_diff = 0,
        variant_label: variantLabel,
        variant_unit_price: variantUnitPrice,
      } = item;
      const pricing = computeItemPricing(
        {
          product,
          qty,
          option_items: optionItems,
          ingredients: cartIngredients,
          ingredient_price_diff,
          variant_label: variantLabel,
          variant_unit_price: variantUnitPrice,
          unit_price_override: item.unit_price_override != null ? Number(item.unit_price_override) : null,
          auto_add: Number(item.auto_add || 0),
          auto_add_group_id: toFiniteNumberOrNull(item.auto_add_group_id),
        },
        totals
      );
      const rule = pricing.isAuto ? getAutoRuleByProductId(product.id) : null;
      const group = rule?.group || null;
      const allowQty = !pricing.isAuto || !group ? true : Number(group.allow_customer_qty ?? 1) === 1;
      const allowRemove = true;
      const old = Number(product.old_price || 0);
      const parts = pricing.parts;
      const oldUnit = old > 0 ? (old + parts.optionTotal + parts.ingredientDiff) : 0;
      total += pricing.lineTotal;

      // ?????-?????????
      const swipeContainer = document.createElement("div");
      swipeContainer.className = "cart-swipe-container";
      swipeContainer.setAttribute("data-cart-key", String(key || ""));

      // ?????? ???????? (?? ?????????)
      const swipeActions = document.createElement("div");
      swipeActions.className = "cart-swipe-actions";

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "cart-swipe-btn cart-swipe-fav";
      favBtn.innerHTML = '<i class="fas fa-heart"></i>';
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "cart-swipe-btn cart-swipe-delete";
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowRemove) return;
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(20);
        // ??????? ? ?????????
        deleteCartItemWithAnimation(swipeContainer, product.id, key);
      });
      if (!allowRemove) {
        deleteBtn.disabled = true;
        deleteBtn.style.pointerEvents = "none";
        deleteBtn.style.opacity = "0.5";
      }

      swipeActions.appendChild(favBtn);
      swipeActions.appendChild(deleteBtn);
      swipeContainer.appendChild(swipeActions);

      // ???????? ?????????? ????????
      const row = document.createElement("div");
      row.className = "cart-row cart-swipe-content";
      row.setAttribute("data-product-id", String(product.id));
      row.setAttribute("data-cart-key", String(key || ""));
      row.addEventListener("click", (e) => {
        // ?? ????????? ???? ????? ???????
        if (swipeContainer.classList.contains("is-swiped")) {
          e.stopPropagation();
          resetSwipe(swipeContainer);
          return;
        }
        openProductDetails(product.id, { cartKey: key });
      });

      const photos = safePhotos(product);
      const mainPhoto = photos[0] || "";

      const img = createOptimizedImage(mainPhoto || "/static/img/placeholder.png", {
        type: 'cart-thumb',
        className: 'cart-thumb',
        alt: '',
        usePicture: true,
      });
      row.appendChild(img);

      const mid = document.createElement("div");
      mid.className = "cart-mid";

      const t = document.createElement("div");
      t.className = "cart-title";
      const productNameText = str(product?.name || item?.name || "Товар");
      const primaryVariantLine = buildVariantDisplayLineForOrder(
        variantLabel,
        item?.variant_unit || item?.variantUnit || "",
        item?.variant_group_title || ""
      );
      const titleBase = [primaryVariantLine, productNameText].filter(Boolean).join(" ").trim() || productNameText;
      t.textContent = `${qty} x ${titleBase}`;
      mid.appendChild(t);

      // ????????? ???????? ? ?????????? ???????: ???????? ? ??????????? ? ?????
      const variantParts = [];
      const ingredientParts = [];
      const optionParts = [];
      
      // 1. ??????? (??????/????????? ? ?.?.)
      if (variantLabel && variantLabel.trim()) {
        const raw = variantLabel.trim();
        const lower = raw.toLowerCase();
        // Фильтруем дефолтные варианты типа "Не указано" / "Не указано:"
        const isDefaultLabel =
          lower === "не указано" ||
          lower === "не указано:";
        if (!isDefaultLabel) {
          const formatted = formatVariant(raw);
          if (formatted) variantParts.push(formatted);
        }
      }
      
      // 2. ??????????? (???????) ? ?? ?????????? ? ??????????? 0
      if (Array.isArray(cartIngredients) && cartIngredients.length > 0) {
        cartIngredients.forEach(ing => {
          if (Number(ing.quantity ?? ing.qty ?? 0) <= 0) return;
          const formatted = formatIngredientLineForOrder(ing);
          if (formatted) ingredientParts.push(formatted);
        });
      }
      
      // 3. ????? (????????) ? ?? ?????????? ? ??????????? 0
      if (Array.isArray(optionItems) && optionItems.length > 0) {
        optionItems.forEach(opt => {
          if (Number(opt.qty ?? opt.quantity ?? 0) <= 0) return;
          const formatted = formatOptionLineForOrder(opt);
          if (formatted) optionParts.push(formatted);
        });
      }

      if (pricing.isAuto && pricing.freeQty > 0) {
        optionParts.push(`Бесплатно: ${pricing.freeQty} шт.`);
      }
      
      // ?????????? ??? ????????
      const allParts = [...ingredientParts, ...optionParts];
      
      // ??????? ????????? ??? ???????? (????? ???????????)
      const subContainer = document.createElement("div");
      subContainer.className = "cart-sub-container";
      
      if (allParts.length > 0) {
        // ????????? ?????? ??????? (??? В корзине пусто?)
        const subDetails = document.createElement("div");
        subDetails.className = "cart-sub-details";
        subDetails.style.display = "block";
        subDetails.style.marginTop = "4px";
        subDetails.style.paddingLeft = "8px";
        
        allParts.forEach(part => {
          const detailItem = document.createElement("div");
          detailItem.className = "cart-sub-detail-item";
          detailItem.textContent = `\u2022 ${part}`;
          detailItem.style.fontSize = "0.9em";
          detailItem.style.color = "var(--color-text-muted, #666)";
          detailItem.style.marginTop = "2px";
          subDetails.appendChild(detailItem);
        });
        
        subContainer.appendChild(subDetails);
      } else {
        // ???? ??? ?????????, ?????? ?????? ??????
        subContainer.style.display = "none";
      }
      
      mid.appendChild(subContainer);

      const q = document.createElement("div");
      q.className = "cart-qty";

      const plusBlockedByLimit = allowQty && isCartQtyPlusBlocked(key, qty);
      const { pill, btnMinus, btnPlus, center } = createQtyPill({
        variant: "muted",
        centerText: String(qty),
        minusEnabled: qty > 0 && allowQty,
        plusEnabled: allowQty && !plusBlockedByLimit,
      });

      const syncRegularRowQtyUi = () => {
        if (!row.isConnected) return 0;
        const cartItem = getCartItemByKey(key);
        const newQty = Math.max(0, Number(cartItem?.qty || 0));
        if (newQty <= 0) return 0;

        center.textContent = String(newQty);
        t.textContent = `${newQty} x ${titleBase}`;

        const resolvedItems = cartItemsResolved();
        const currentItemResolved = resolvedItems.find((x) => String(x?.key || "") === String(key || ""));
        if (currentItemResolved) {
          const currentTotals = {
            nonAutoTotal: computeNonAutoTotal(resolvedItems),
            autoEligibleTotal: computeAutoEligibleTotal(resolvedItems),
          };
          const currentPricing = computeItemPricing(currentItemResolved, currentTotals);
          const currentParts = currentPricing.parts || {};
          const currentOld = Number(currentItemResolved.product?.old_price || 0);
          const currentOldUnit = currentOld > 0
            ? (currentOld + Number(currentParts.optionTotal || 0) + Number(currentParts.ingredientDiff || 0))
            : 0;
          const currentHasDiscount = Number(currentPricing.discountAmount || 0) > 0;
          const currentShowOld =
            !currentPricing.isAuto &&
            (currentHasDiscount || (currentOldUnit > 0 && currentOldUnit > currentPricing.unitPrice));
          const currentOriginalLineTotal = currentHasDiscount
            ? (currentPricing.lineTotal + Number(currentPricing.discountAmount || 0))
            : (currentOldUnit * newQty);

          pr.textContent = money(currentPricing.lineTotal);
          oldEl.textContent = currentShowOld ? moneyNoSign(currentOriginalLineTotal) : "";
          oldEl.classList.toggle("hidden", !currentShowOld);
        }

        const plusBlockedNow = !allowQty || isCartQtyPlusBlocked(key, newQty);
        btnPlus.disabled = plusBlockedNow;
        btnPlus.classList.toggle("is-disabled", plusBlockedNow);
        const minusDisabledNow = !allowQty || newQty <= 0;
        btnMinus.disabled = minusDisabledNow;
        btnMinus.classList.toggle("is-disabled", minusDisabledNow);
        return newQty;
      };

      btnPlus.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!allowQty || btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
        await changeQty(product.id, +1, null, key, { skipCartRerender: true });
        syncRegularRowQtyUi();
      });
      btnMinus.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!allowQty || btnMinus.disabled || btnMinus.classList.contains("is-disabled")) return;
        const currentQty = Number(getCartItemByKey(key)?.qty || 0);
        if (currentQty <= 1) {
          deleteCartItemWithAnimation(swipeContainer, product.id, key);
          return;
        }
        const canLightUpdate = currentQty > 1;
        await changeQty(product.id, -1, null, key, { skipCartRerender: canLightUpdate });
        if (canLightUpdate) syncRegularRowQtyUi();
      });
      if (!allowQty) {
        btnPlus.disabled = true;
        btnMinus.disabled = true;
        pill.classList.add("is-disabled");
      } else {
        btnPlus.disabled = plusBlockedByLimit;
        btnPlus.classList.toggle("is-disabled", plusBlockedByLimit);
      }

      q.appendChild(pill);
      const right = document.createElement("div");
      right.className = "cart-right";

      // Показываем старую цену если есть скидка или old_price
      const hasDiscount = pricing.discountAmount > 0;
      const showOld = !pricing.isAuto && (hasDiscount || (oldUnit > 0 && oldUnit > pricing.unitPrice));
      const originalLineTotal = hasDiscount ? (pricing.lineTotal + pricing.discountAmount) : (oldUnit * qty);

      const oldEl = document.createElement("div");
      oldEl.className = "cart-old";
      oldEl.textContent = showOld ? moneyNoSign(originalLineTotal) : "";
      if (!showOld) oldEl.classList.add("hidden");

      const pr = document.createElement("div");
      pr.className = "cart-price";
      pr.textContent = money(pricing.lineTotal);

      right.appendChild(oldEl);
      right.appendChild(pr);

      // ?????????? ?????? ????????
      const desktopActions = document.createElement("div");
      desktopActions.className = "cart-desktop-actions";

      const desktopFavBtn = document.createElement("button");
      desktopFavBtn.type = "button";
      desktopFavBtn.className = "cart-desktop-btn cart-desktop-fav";
      desktopFavBtn.innerHTML = '<i class="fas fa-heart"></i>';
      desktopFavBtn.title = "В избранное";
      const desktopDeleteBtn = document.createElement("button");
      desktopDeleteBtn.type = "button";
      desktopDeleteBtn.className = "cart-desktop-btn cart-desktop-delete";
      desktopDeleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      desktopDeleteBtn.title = "Удалить";
      desktopDeleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowRemove) return;
        deleteCartItemWithAnimation(swipeContainer, product.id, key);
      });
      if (!allowRemove) {
        desktopDeleteBtn.disabled = true;
        desktopDeleteBtn.style.pointerEvents = "none";
        desktopDeleteBtn.style.opacity = "0.5";
      }

      desktopActions.appendChild(desktopFavBtn);
      desktopActions.appendChild(desktopDeleteBtn);
      right.appendChild(desktopActions);
      bindFavoriteButtonsForCartRow(
        [favBtn, desktopFavBtn],
        () =>
          buildFavoriteSnapshotFromResolvedItem(item, {
            pricing,
            oldLineTotal: showOld ? originalLineTotal : null,
          }),
        {
          afterToggle: () => {
            if (swipeContainer.classList.contains("is-swiped")) {
              resetSwipe(swipeContainer);
            }
          },
        }
      );
      const bottomRow = document.createElement("div");
      bottomRow.className = "cart-bottom-row";
      bottomRow.appendChild(q);
      bottomRow.appendChild(right);
      mid.appendChild(bottomRow);
      row.appendChild(mid);

      swipeContainer.appendChild(row);

      // ????????????? ?????-??????
      initSwipeGesture(swipeContainer, row, product.id, key);

      listEl.appendChild(swipeContainer);
    });

    const hasBaseItems = items.some((item) => {
      const qty = Number(item?.qty || 0);
      if (qty <= 0) return false;
      if (item?.type === "combo") return true;
      const pid = Number(item?.product?.id || item?.product_id);
      if (!Number.isFinite(pid)) return false;
      return Number(item?.auto_add || 0) !== 1;
    });

    if (listEl && hasBaseItems && state.autoAddDismissed.size) {
      const cartProductIds = new Set(
        items
          .map((item) => Number(item?.product?.id || item?.product_id))
          .filter((pid) => Number.isFinite(pid))
      );
      const groups = Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [];
      const rules = Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [];
      const itemsByGroup = new Map();
      rules.forEach((rule) => {
        const gid = Number(rule.group_id);
        if (!Number.isFinite(gid)) return;
        if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
        itemsByGroup.get(gid).push(rule);
      });

      const sortedGroups = groups
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0));

      sortedGroups.forEach((group) => {
        const groupId = Number(group.id);
        if (!Number.isFinite(groupId)) return;
        const groupRules = (itemsByGroup.get(groupId) || []).slice().sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0)
        );
        if (!groupRules.length) return;

        const baseTotal = Number(group.include_auto_in_total || 0) === 1 ? totals.autoEligibleTotal : totals.nonAutoTotal;
        const minAmount = group.min_cart_amount != null ? Number(group.min_cart_amount) : null;
        const maxAmount = group.max_cart_amount != null ? Number(group.max_cart_amount) : null;
        const minOk = minAmount == null || baseTotal >= minAmount;
        const maxOk = maxAmount == null || baseTotal <= maxAmount;
        const eligible = minOk && maxOk;
        if (!eligible) return;

        groupRules.forEach((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return;
          if (cartProductIds.has(pid)) return;
          if (!isAutoAddDismissed(groupId, pid)) return;

          const product = state.productCache.get(pid) || rule.product;
          if (!product) return;
          if (!isProductAvailable(product)) return;

          const row = document.createElement("div");
          row.className = "cart-row is-auto-ghost";
          row.setAttribute("data-product-id", String(product.id));
          row.addEventListener("click", () => {
            openProductDetails(product.id);
          });

          const photos = safePhotos(product);
          const mainPhoto = photos[0] || "";
          const img = createOptimizedImage(mainPhoto || "/static/img/placeholder.png", {
            type: "cart-thumb",
            className: "cart-thumb",
            alt: "",
          });
          row.appendChild(img);

          const mid = document.createElement("div");
          mid.className = "cart-mid";

          const t = document.createElement("div");
          t.className = "cart-title";
          t.textContent = `${str(product.name)} × 0`;
          mid.appendChild(t);

          const subContainer = document.createElement("div");
          subContainer.className = "cart-sub-container";
          subContainer.textContent = "Рекомендуемое";
          mid.appendChild(subContainer);

          const q = document.createElement("div");
          q.className = "cart-qty";
          const { pill, btnMinus, btnPlus, center } = createQtyPill({
            variant: "muted",
            centerText: "0",
            minusEnabled: false,
          });
          btnMinus.disabled = true;
          pill.classList.add("is-disabled");

          btnPlus.addEventListener("click", async (e) => {
            e.stopPropagation();
            clearAutoAddDismissed(groupId, pid);
            const desiredQty = getAutoAddDesiredQty(rule);
            const targetKey = makeCartKey(pid, []);
            await changeQty(pid, desiredQty, null, targetKey);
            const restored = getCartItemByKey(targetKey) || state.cart.find((x) => Number(x.product_id || x.id) === pid) || null;
            if (restored) {
              restored.auto_add = 1;
              restored.auto_add_group_id = groupId;
            }
            center.textContent = String(getCartItemByKey(targetKey)?.qty || restored?.qty || 0);
          });

          q.appendChild(pill);
          const right = document.createElement("div");
          right.className = "cart-right";
          const pr = document.createElement("div");
          pr.className = "cart-price";
          pr.textContent = money(0);
          right.appendChild(pr);

          const bottomRow = document.createElement("div");
          bottomRow.className = "cart-bottom-row";
          bottomRow.appendChild(q);
          bottomRow.appendChild(right);
          mid.appendChild(bottomRow);
          row.appendChild(mid);

          listEl.appendChild(row);
        });
      });
    }

    if (totalEl) totalEl.textContent = money(total);
    return { items, total };
  }

  // ========== ?????-?????????? ??? ??????? ==========
  let currentSwipedContainer = null;
  const SWIPE_THRESHOLD = 10; // px ??? ?????? ??????
  const SWIPE_ACTIONS_WIDTH = 120; // ?????? ???? ??????
  const DELETE_THRESHOLD = 0.6; // 60% ?????? ??? ????????

  function showToast(message) {
    // ??????? ?????????? toast ???? ????
    const existing = document.querySelector(".shop-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "shop-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    // ??????????
    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    // ???????? ????? 2 ???
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function resetSwipe(container, animate = true) {
    if (!container) return;
    const content = container.querySelector(".cart-swipe-content");
    if (!content) return;

    if (animate) {
      content.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    }
    content.style.transform = "translateX(0)";
    container.classList.remove("is-swiped");

    if (currentSwipedContainer === container) {
      currentSwipedContainer = null;
    }

    if (animate) {
      setTimeout(() => {
        content.style.transition = "";
      }, 300);
    }
  }

  function resetAllSwipes() {
    document.querySelectorAll(".cart-swipe-container.is-swiped").forEach(c => resetSwipe(c));
  }

  function deleteCartItemWithAnimation(container, productId, cartKey) {
    if (!container) return;

    const content = container.querySelector(".cart-swipe-content");
    if (content) {
      content.style.transition = "transform 0.3s ease-out";
      content.style.transform = "translateX(-100%)";
    }

    container.style.transition = "height 0.3s ease-out, opacity 0.3s ease-out, margin 0.3s ease-out, padding 0.3s ease-out";
    container.style.overflow = "hidden";

    setTimeout(() => {
      const height = container.offsetHeight;
      container.style.height = height + "px";

      requestAnimationFrame(() => {
        container.style.height = "0";
        container.style.opacity = "0";
        container.style.marginTop = "0";
        container.style.marginBottom = "0";
        container.style.paddingTop = "0";
        container.style.paddingBottom = "0";
      });
    }, 50);

    setTimeout(() => {
      // ??????? ?? ???????
      removeFromCartByKey(cartKey, productId);
      container.remove();
    }, 350);
  }

function removeFromCartByKey(cartKey, productId) {
    console.log("[DEBUG] removeFromCartByKey called, cartKey:", cartKey, "productId:", productId, "cart:", JSON.stringify(state.cart.map(i => ({ key: i.key, type: i.type, product_id: i.product_id }))));
    const idx = state.cart.findIndex(item => {
      if (cartKey && item.key === cartKey) return true;
      if (!cartKey && item.id === productId && !item.key) return true;
      return false;
    });
    console.log("[DEBUG] Found index:", idx);
    if (idx !== -1) {
      const removedItem = state.cart[idx];
      if (removedItem) {
        const pid = Number(removedItem.product_id || removedItem.id);
        if (Number.isFinite(pid) && Number(removedItem.auto_add || 0) === 1) {
          markAutoAddDismissedByProduct(pid);
        }
      }
      state.cart.splice(idx, 1);
      const removedKey = String(removedItem?.key || cartKey || "");
      if (removedKey) {
        const escapedKey = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
          ? CSS.escape(removedKey)
          : removedKey.replace(/([\"\\])/g, "\\$1");
        document
          .querySelectorAll(`.cart-swipe-container[data-cart-key="${escapedKey}"], .cart-row[data-cart-key="${escapedKey}"]`)
          .forEach((node) => {
            if (node && node.parentNode) node.remove();
          });
      }
      applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      saveCart();
      scheduleSyncAllProductCardsFromCart();
      updateCartBadge();

      // ????????? footer ? ?????? ??????????
      const items = cartItemsResolved();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (openCartSheetCtx) {
        if (openCartSheetCtx.footerEl) {
          openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        }
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          const total = computeCartTotals(items).total;
          if (tspan) tspan.textContent = money(total);
          if (isMobile && elMobileCheckoutBtn) {
            elMobileCheckoutBtn.disabled = items.length === 0;
          }
        }
        if (openCartSheetCtx.totalEl) {
          openCartSheetCtx.totalEl.textContent = money(computeCartTotals(items).total);
        }
        // ???В корзине пусто - ???????? ?????????
        if (items.length === 0 && openCartSheetCtx.listEl) {
          openCartSheetCtx.listEl.innerHTML = '<div class="shop-cart-empty-sheet"><div class="empty-state"><div class="empty-icon"><i class="fas fa-shopping-cart"></i></div><div class="empty-title">Корзина пуста</div><div class="empty-text">Добавьте товары из каталога</div></div></div>';
        }
        // Перестраиваем апселл: удалённый товар должен снова появиться в списке
      }

      // ???????: ???????? ?????? В корзине пусто???? ???????? (????? ? ????????)
      if (isMobile) updateMobileDeliveryProgress();
      // ???????: ??? ?????В корзине пусто??? ?????? ?????? (? ? ????????), ??????? ????????? ???????? ????????
      if (isMobile && elMobileCartActions) {
        if (items.length === 0) {
          elMobileCartActionsCart?.classList.add("hidden");
          elMobileCartActionsCheckout?.classList.add("hidden");
          updateMobileDeliveryProgress();
        } else {
          elMobileCartActionsCart?.classList.remove("hidden");
          updateMobileDeliveryProgress();
        }
      }

      // ????????В корзине пусто??
      markCartUiDirty();
      if (items.length === 0) {
        renderCart(true);
        return;
      }

      if (elCartEmpty) elCartEmpty.classList.add("hidden");
      if (elCartList) appendUpsellToList(elCartList);
      if (openCartSheetCtx?.listEl && openCartSheetCtx.listEl !== elCartList) {
        appendUpsellToList(openCartSheetCtx.listEl);
      }
      updateCartTotalsUiOnly();
      cartUiRenderedRevision = cartUiRevision;
    }
  }

  function isComboCatalogBlockProductAddable(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    const product = state.productCache.get(pid);
    if (!product) return true;

    const stockAvailable = isProductAvailable(product);
    if (!stockAvailable) return false;
    if (isProductBlockedByIngredientRequirements(pid)) return false;

    const remaining = getAvailableStock(pid);
    if (!Number.isFinite(remaining)) return true;

    const requiredPerUnit = calcConsumedPerUnit(product, null, null);
    const required = Number.isFinite(requiredPerUnit) && requiredPerUnit > 0 ? requiredPerUnit : 1;
    return remaining + 1e-9 >= required;
  }

  function isComboCatalogEntryAvailable(combo) {
    const blocks = Array.isArray(combo?.block_product_ids) ? combo.block_product_ids : [];
    if (!blocks.length) return true;

    for (const block of blocks) {
      const pids = Array.isArray(block)
        ? block.map((pid) => Number(pid || 0)).filter((pid) => Number.isFinite(pid) && pid > 0)
        : [];
      if (!pids.length) return false;
      if (!pids.some((pid) => isComboCatalogBlockProductAddable(pid))) return false;
    }
    return true;
  }

  function initSwipeGesture(container, content, productId, cartKey) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isHorizontal = null;
    const containerWidth = () => container.offsetWidth || 300;

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      
      // ???????? ?????? ??????
      if (currentSwipedContainer && currentSwipedContainer !== container) {
        resetSwipe(currentSwipedContainer);
      }

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = container.classList.contains("is-swiped") ? -SWIPE_ACTIONS_WIDTH : 0;
      isDragging = false;
      isHorizontal = null;
      content.style.transition = "";
    }

    function onTouchMove(e) {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // ?????????? ??????????? ??? ?????? ????????
      if (isHorizontal === null && (Math.abs(deltaX) > SWIPE_THRESHOLD || Math.abs(deltaY) > SWIPE_THRESHOLD)) {
        isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      // ???? ???????????? ???????? - ?? ?????????????
      if (isHorizontal === false) return;

      // ???? ?????????????? - ????????
      if (isHorizontal === true) {
        isDragging = true;
        
        let newX = currentX + deltaX;
        
        // ???????????: ?? ?????? ?????? ??? 0, ?? ?????? ????? ??? 60% ??????
        const maxLeft = -containerWidth() * DELETE_THRESHOLD;
        newX = Math.max(maxLeft, Math.min(20, newX)); // ????????? bounce ??????
        
        content.style.transform = `translateX(${newX}px)`;

        // Haptic ??? ?????????? ?????? ????????
        if (newX <= maxLeft + 5 && newX > maxLeft - 5) {
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }
    }

    function onTouchEnd(e) {
      if (!isDragging) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      let finalX = currentX + deltaX;

      const width = containerWidth();
      const deleteThreshold = -width * DELETE_THRESHOLD;

      content.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

      if (finalX <= deleteThreshold) {
        // ???????
        if (navigator.vibrate) navigator.vibrate(20);
        deleteCartItemWithAnimation(container, productId, cartKey);
      } else if (finalX < -SWIPE_ACTIONS_WIDTH / 2) {
        // ????????? ?? ???????
        content.style.transform = `translateX(-${SWIPE_ACTIONS_WIDTH}px)`;
        container.classList.add("is-swiped");
        currentSwipedContainer = container;
      } else {
        // ?????????? ?????
        content.style.transform = "translateX(0)";
        container.classList.remove("is-swiped");
        if (currentSwipedContainer === container) {
          currentSwipedContainer = null;
        }
      }

      setTimeout(() => {
        content.style.transition = "";
      }, 300);

      isDragging = false;
      isHorizontal = null;
    }

    content.addEventListener("touchstart", onTouchStart, { passive: true });
    content.addEventListener("touchmove", onTouchMove, { passive: true });
    content.addEventListener("touchend", onTouchEnd, { passive: true });
  }

  // ????? ?????? ??? ????? ??? ????????
  document.addEventListener("click", (e) => {
    if (currentSwipedContainer && !currentSwipedContainer.contains(e.target)) {
      resetSwipe(currentSwipedContainer);
    }
  });

  function syncCartFooterVisibilityForCartMode(itemsCount) {
    if (!elCartFooter || cartViewMode !== "cart") return;
    const hasItems = Number(itemsCount || 0) > 0;

    if (isDesktopViewport()) {
      // Desktop empty cart: keep delivery progress visible, hide only action buttons.
      elCartFooter.classList.remove("hidden");
      if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.remove("hidden");
      if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", !hasItems);
      return;
    }

    // Mobile behavior remains unchanged.
    elCartFooter.classList.toggle("hidden", !hasItems);
  }

  function renderCart(force = false) {
    if (!elCartList) return;
    if (!force && cartUiRenderedRevision === cartUiRevision) {
      updateMobileDeliveryProgress();
      queueMobileUiStateSync("renderCart.noop");
      return;
    }

    const { items, total } = renderCartInto(elCartList, elCartTotal, elCartEmpty);

    syncCartFooterVisibilityForCartMode(items.length);
    if (elCheckoutBtn) elCheckoutBtn.disabled = items.length === 0;

    if (elCheckoutBtn) {
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(total);
    }
    updateMobileDeliveryProgress();
    appendUpsellToList(elCartList);
    cartUiRenderedRevision = cartUiRevision;
    queueMobileUiStateSync("renderCart.rendered");
  }

  function renderCartIfDirty(force = false) {
    renderCart(force);
  }

function updateCartBadge() {
  const n = cartCountTotal();

  // ????????? badge
  if (elNavCartBadge) {
    elNavCartBadge.textContent = String(n);
    if (n > 0) elNavCartBadge.classList.remove("hidden");
    else elNavCartBadge.classList.add("hidden");
  }

  // ???? ???? desktop badge (???????????)
  if (elCartOpenDesktop) {
    const b = $("#shopCartBadge", elCartOpenDesktop);
    if (b) {
      b.textContent = String(n);
      if (n > 0) b.classList.remove("hidden");
      else b.classList.add("hidden");
    }
  }

  // bounce ?????? ????? ?????????? ???????????
  const prev = window.__lastCartCountForNav || 0;
  if (n > prev && typeof bounceCartNav === "function") bounceCartNav();
  window.__lastCartCountForNav = n;
}

  function clearCartAll() {
    state.cart = [];
    clearAllAutoAddDismissed();
    applyAutoAddRules();
    saveCart();
    scheduleSyncAllProductCardsFromCart();
    prioritizeAboveFoldCardImages();
    renderCart();
    updateCartBadge();

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
      appendUpsellToList(openCartSheetCtx.listEl);
    }

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileCartActions) {
      // ????????? ???? ??????? ? ????? ???????? ?????? ???????????? ? ??? ?????? ???????
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
      updateMobileDeliveryProgress();
    }
    queueMobileUiStateSync("clearCartAll");
  }

  function attachTwoStepClear(btn, onConfirm) {
    if (!btn) return;
    let armed = false;
    let timer = null;
    const mobileCheckoutLabel = "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C";

    const setMobileCheckoutCompact = (compact) => {
      if (!elMobileCheckoutBtn || !elMobileCartTotal) return;
      if (compact) {
        elMobileCheckoutBtn.dataset.compactSumOnly = "1";
        elMobileCheckoutBtn.textContent = "";
        elMobileCheckoutBtn.appendChild(elMobileCartTotal);
        return;
      }
      if (elMobileCheckoutBtn.dataset.compactSumOnly !== "1") return;
      delete elMobileCheckoutBtn.dataset.compactSumOnly;
      elMobileCheckoutBtn.textContent = `${mobileCheckoutLabel} \u00B7 `;
      elMobileCheckoutBtn.appendChild(elMobileCartTotal);
    };

    const reset = () => {
      armed = false;
      btn.classList.remove("is-confirm");
      btn.textContent = "×";
      btn.title = "Очистить корзину";
      btn.setAttribute("aria-label", "Очистить корзину");
      if (timer) clearTimeout(timer);
      timer = null;
      setMobileCheckoutCompact(false);
    };

    const arm = () => {
      armed = true;
      btn.classList.add("is-confirm");
      btn.textContent = "Очистить корзину";
      btn.title = "Очистить корзину";
      btn.setAttribute("aria-label", "Очистить корзину");
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 6500);
      setMobileCheckoutCompact(true);
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cartCountTotal() <= 0) return;
      if (!armed) {
        arm();
        return;
      }
      reset();
      onConfirm();
    });

    document.addEventListener("click", (e) => {
      if (!armed) return;
      if (btn.contains(e.target)) return;
      reset();
    });
  }

  let __syncAllCardsTimer = null;
  function syncAllProductCardsFromCart() {
    if (!elProductsGrid) return;
    const cards = elProductsGrid.querySelectorAll(".sp-card[data-product-id]");
    cards.forEach((card) => {
      const pid = Number(card.getAttribute("data-product-id"));
      if (!Number.isFinite(pid)) return;
      const p = state.productCache.get(pid);
      if (!p) return;
      applyCardState(card, p, cartQty(pid));
    });
  }

  function scheduleSyncAllProductCardsFromCart() {
    if (__syncAllCardsTimer) return;
    __syncAllCardsTimer = setTimeout(() => {
      __syncAllCardsTimer = null;
      syncAllProductCardsFromCart();
    }, 0);
  }

  function buildCartKeySignature(cartItems = state.cart) {
    const list = Array.isArray(cartItems) ? cartItems : [];
    return list
      .map((item) => String(item?.key || ""))
      .filter(Boolean)
      .sort()
      .join("|");
  }

  function buildCartProductIdsSignature(cartItems = state.cart) {
    const ids = new Set();
    const list = Array.isArray(cartItems) ? cartItems : [];
    list.forEach((item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return;
      const pid = Number(item?.product_id || item?.id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });
    return Array.from(ids).sort((a, b) => a - b).join(",");
  }

  function updateCartTotalsUiOnly() {
    const items = cartItemsResolved();
    const totals = computeCartTotals(items);
    const total = Number(totals.total || 0);
    if (elCartTotal) elCartTotal.textContent = money(total);

    syncCartFooterVisibilityForCartMode(items.length);
    if (elCheckoutBtn) {
      elCheckoutBtn.disabled = items.length === 0;
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(total);
    }

    if (openCartSheetCtx) {
      if (openCartSheetCtx.footerEl) {
        openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      }
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      if (openCartSheetCtx.totalEl) {
        openCartSheetCtx.totalEl.textContent = money(total);
      }
    }

    if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
    return { items, total };
  }

  function extractRenderedCartNodeKey(node) {
    if (!node || node.nodeType !== 1) return "";
    const direct = String(node.getAttribute("data-cart-key") || "");
    if (direct) return direct;
    const nested = node.querySelector("[data-cart-key]");
    return nested ? String(nested.getAttribute("data-cart-key") || "") : "";
  }

  function captureRenderedCartRowsByKey(listEl) {
    const rowsByKey = new Map();
    if (!listEl) return rowsByKey;
    const nodes = listEl.querySelectorAll(".cart-swipe-container[data-cart-key], .cart-row[data-cart-key]");
    nodes.forEach((node) => {
      const key = extractRenderedCartNodeKey(node);
      if (!key || rowsByKey.has(key)) return;
      rowsByKey.set(key, node);
    });
    return rowsByKey;
  }

  function renderCartIntoWithRowReuse(listEl, totalEl, emptyPlaceholderEl, reuseRowsByKey, reuseUpsellNode = null) {
    if (!listEl) return renderCartInto(listEl, totalEl, emptyPlaceholderEl);
    const tempList = document.createElement("div");
    const tempTotal = document.createElement("span");
    const rendered = renderCartInto(tempList, tempTotal, null);
    const reusable = reuseRowsByKey instanceof Map ? reuseRowsByKey : new Map();

    const nextNodes = Array.from(tempList.children);
    const fragment = document.createDocumentFragment();
    nextNodes.forEach((nextNode) => {
      const key = extractRenderedCartNodeKey(nextNode);
      const reusedNode = key ? reusable.get(key) : null;
      if (reusedNode) {
        reusable.delete(key);
        fragment.appendChild(reusedNode);
      } else {
        fragment.appendChild(nextNode);
      }
    });

    const keepUpsellInPlace =
      reuseUpsellNode &&
      reuseUpsellNode.nodeType === 1 &&
      reuseUpsellNode.parentNode === listEl;
    if (keepUpsellInPlace) {
      const currentChildren = Array.from(listEl.children);
      currentChildren.forEach((child) => {
        if (child === reuseUpsellNode) return;
        child.remove();
      });
      listEl.insertBefore(fragment, reuseUpsellNode);
      if (reuseUpsellNode !== listEl.lastElementChild) {
        listEl.appendChild(reuseUpsellNode);
      }
    } else {
      listEl.innerHTML = "";
      listEl.appendChild(fragment);
      if (reuseUpsellNode && reuseUpsellNode.nodeType === 1) {
        listEl.appendChild(reuseUpsellNode);
      }
    }

    if (totalEl) totalEl.textContent = money(rendered.total);
    if (emptyPlaceholderEl) emptyPlaceholderEl.classList.toggle("hidden", rendered.items.length > 0);
    return rendered;
  }

  function captureUpsellScrollState(listEl) {
    if (!listEl) return null;
    const scrollEl = listEl.querySelector(".shop-cart-upsell-scroll");
    if (!scrollEl) return null;
    return {
      left: Number(scrollEl.scrollLeft || 0),
      max: Math.max(0, Number(scrollEl.scrollWidth || 0) - Number(scrollEl.clientWidth || 0)),
    };
  }

  function restoreUpsellScrollState(listEl, state) {
    if (!listEl || !state) return;
    const scrollEl = listEl.querySelector(".shop-cart-upsell-scroll");
    if (!scrollEl) return;
    const currentMax = Math.max(0, Number(scrollEl.scrollWidth || 0) - Number(scrollEl.clientWidth || 0));
    const safeLeft = Math.min(Math.max(0, Number(state.left || 0)), currentMax);
    scrollEl.scrollLeft = safeLeft;
  }

  // -----------------------------
  // Qty change
  // -----------------------------
  async function changeQty(productId, delta, optionalCartNumEl, cartKey, opts = {}) {
    const pid = Number(productId);
    const qtyDelta = Number(delta);
    if (!Number.isFinite(pid) || !Number.isFinite(qtyDelta) || qtyDelta === 0) return Number(cartQty(pid) || 0);

    const skipCartRerender = opts?.skipCartRerender === true;
    const cartKeysBefore = buildCartKeySignature(state.cart);
    const cartProductsBefore = buildCartProductIdsSignature(state.cart);

    const wasEmpty = cartCountTotal() === 0;
    const p = state.productCache.get(pid);
    if (qtyDelta > 0 && p && !isProductAvailable(p)) return Number(cartQty(pid) || 0);

    const targetKey = resolveCartKeyForQtyChange(pid, qtyDelta, cartKey, state.cart);
    if (!targetKey) return Number(cartQty(pid) || 0);

    if (qtyDelta > 0) {
      try {
        const gate = await canIncreaseRegularCartItemBeforeApply(pid, qtyDelta, targetKey);
        if (!gate.allowed) {
          const limitChanged = setCartQtyHardLimit(targetKey, Math.max(0, Number(gate.currentQty || 0)));
          if (limitChanged) refreshQtyLimitUi();
          return Number(gate.currentQty || cartQty(pid) || 0);
        }
        clearCartQtyHardLimit(targetKey);
      } catch (e) {
        console.warn("Stock precheck before qty+ failed:", e);
        return Number(cartQty(pid) || 0);
      }
    } else if (qtyDelta < 0) {
      clearCartQtyHardLimit(targetKey);
    }

    const previousCartSnapshot = qtyDelta > 0 ? cloneCartState(state.cart) : null;
    let item = getCartItemByKey(targetKey);
    let nextQty = 0;

    if (!item && qtyDelta > 0) {
      item = {
        key: targetKey,
        product_id: pid,
        qty: 0,
        option_item_ids: [],
        option_items: [],
        auto_add: 0,
        auto_add_group_id: null,
      };
      state.cart.push(item);
      if (wasEmpty) {
        clearAllAutoAddDismissed();
      }
    }

    if (item) {
      const prevQty = Number(item.qty || 0);
      nextQty = Math.max(0, prevQty + qtyDelta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        if (prevQty > 0 && Number(item.auto_add || 0) === 1) {
          markAutoAddDismissedByProduct(pid);
        }
        clearCartQtyHardLimit(targetKey);
        state.cart = state.cart.filter((x) => x.key !== targetKey);
      }
    }

    const autoChanged = applyAutoAddRules();
    if (autoChanged) {
      nextQty = Number(getCartItemByKey(targetKey)?.qty || 0);
      scheduleSyncAllProductCardsFromCart();
    }
    const cartKeysAfter = buildCartKeySignature(state.cart);
    const cartProductsAfter = buildCartProductIdsSignature(state.cart);
    const cartStructureChanged = cartKeysBefore !== cartKeysAfter;
    const cartProductsChanged = cartProductsBefore !== cartProductsAfter;
    const limitsCleaned = cleanupCartQtyHardLimits();
    clearAutoAddDismissedIfCartEmpty();
    const currentItem = getCartItemByKey(targetKey);
    if (currentItem && Number(currentItem.qty || 0) > 0 && Number(currentItem.auto_add || 0) === 1) {
      clearAutoAddDismissedByProduct(pid);
    }
    saveCart();
    scheduleSyncAllProductCardsFromCart();

    const cards = elProductsGrid.querySelectorAll(`.sp-card[data-product-id="${pid}"]`);
    if (cards.length && p) {
      cards.forEach((card) => applyCardState(card, p, cartQty(pid), qtyDelta > 0 ? "inc" : "dec"));
    }

    if (optionalCartNumEl) animateNumber(optionalCartNumEl, nextQty || 0, qtyDelta > 0 ? "inc" : "dec");

    const shouldFullRerender = !skipCartRerender || autoChanged || cartStructureChanged;
    if (shouldFullRerender) {
      renderCart();
    } else {
      updateCartTotalsUiOnly();
      if (cartProductsChanged) {
        appendUpsellToList(elCartList);
        if (openCartSheetCtx?.listEl && openCartSheetCtx.listEl !== elCartList) {
          appendUpsellToList(openCartSheetCtx.listEl);
        }
      }
    }
    updateCartBadge();

    if (shouldFullRerender && openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      appendUpsellToList(openCartSheetCtx.listEl);
      if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
    }

    if (qtyDelta > 0) {
      const currentQtyForKey = Number(getCartItemByKey(targetKey)?.qty || 0);
      if (currentQtyForKey > 0) {
        refreshNextRegularCartItemLimitLocal(pid, targetKey, currentQtyForKey);
      } else {
        clearCartQtyHardLimit(targetKey);
      }
    } else if (qtyDelta < 0) {
      clearCartQtyHardLimit(targetKey);
    }

    if (qtyDelta > 0 && previousCartSnapshot) {
      queueCartStockRecheck(previousCartSnapshot, {
        toastMessage: "Больше нет в наличии",
      });
    }

    if (limitsCleaned) scheduleSyncAllProductCardsFromCart();
    return Number(nextQty || 0);
  }

  // -----------------------------
  // Category select + lazy load
  // -----------------------------
  const __loadingCategoryIds = new Set();
  const __categoryLoadLimit = new Map();

  async function ensureCategoryLoaded(categoryId, opts = {}) {
    const cid = Number(categoryId);
    if (!Number.isFinite(cid)) return [];
    if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();

    const limitRaw = Number(opts.limit);
    const desired = (Number.isFinite(limitRaw) && limitRaw > 0) ? Math.min(200, Math.max(1, limitRaw)) : 0;

    const existing = state.productsByCategory.get(cid);
    const loadedLimit = Number(__categoryLoadLimit.get(cid) || 0) || 0;
    if (existing && (!desired || loadedLimit >= desired)) return existing;
    if (__loadingCategoryIds.has(cid)) return existing || [];

    const reqLimit = desired || Math.max(loadedLimit || 0, 24) || 24;
    __loadingCategoryIds.add(cid);
    __categoryLoadLimit.set(cid, reqLimit);
    try {
      await loadProductsForCategory(cid, { limit: reqLimit, lite: true });
      renderProducts({ appendOnly: true });
      prioritizeAboveFoldCardImages();
      return state.productsByCategory.get(cid) || [];
    } finally {
      __loadingCategoryIds.delete(cid);
    }
  }

  async function selectCategory(categoryId, title) {
    setActiveCategory(categoryId, title, { scroll: true });
    // Don't block click -> scroll; load in background.
    ensureCategoryLoaded(categoryId, { limit: 200 });
    await warmupCartProducts();
    renderCart();
  }

  function mapToPlainObject(sourceMap) {
    const out = {};
    if (!(sourceMap instanceof Map)) return out;
    sourceMap.forEach((value, key) => {
      const id = Number(key);
      if (!Number.isFinite(id)) return;
      out[String(id)] = value;
    });
    return out;
  }

  function saveCatalogSnapshotFromState() {
    try {
      const payload = {
        v: CATALOG_SNAPSHOT_VERSION,
        ts: Date.now(),
        activeCategoryId: Number(state.activeCategoryId || 0) || null,
        categories: Array.isArray(state.categories) ? state.categories : [],
        productsByCategory: mapToPlainObject(state.productsByCategory),
        combosByCategory: mapToPlainObject(state.combosByCategory),
      };
      localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadCatalogSnapshotFromStorage() {
    try {
      const raw = localStorage.getItem(CATALOG_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Number(parsed.v) !== Number(CATALOG_SNAPSHOT_VERSION)) return null;
      const ts = Number(parsed.ts || 0);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      if (Date.now() - ts > CATALOG_SNAPSHOT_MAX_AGE_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function applyCatalogSnapshot(snapshot) {
    const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
    if (!categories.length) return false;

    state.categories = categories;
    state.productsByCategory = new Map();
    state.combosByCategory = new Map();

    const productsByCategory = snapshot?.productsByCategory && typeof snapshot.productsByCategory === "object"
      ? snapshot.productsByCategory
      : {};
    Object.keys(productsByCategory).forEach((rawKey) => {
      const cid = Number(rawKey);
      if (!Number.isFinite(cid)) return;
      const listRaw = Array.isArray(productsByCategory[rawKey]) ? productsByCategory[rawKey] : [];
      const list = listRaw
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          const row = { ...p };
          if (!Array.isArray(row.photos)) row.photos = safePhotos(row);
          return row;
        });
      list.forEach((p) => {
        const pid = Number(p.id || 0);
        if (!Number.isFinite(pid) || pid <= 0) return;
        cacheStockFromProductPayload(p, "snapshot_restore");
        p.is_available = isProductAvailable(p);
        state.productCache.set(pid, p);
      });
      state.productsByCategory.set(cid, list);
    });

    const combosByCategory = snapshot?.combosByCategory && typeof snapshot.combosByCategory === "object"
      ? snapshot.combosByCategory
      : {};
    Object.keys(combosByCategory).forEach((rawKey) => {
      const cid = Number(rawKey);
      if (!Number.isFinite(cid)) return;
      state.combosByCategory.set(cid, Array.isArray(combosByCategory[rawKey]) ? combosByCategory[rawKey] : []);
    });

    const visible = getVisibleCategories();
    const wantedId = Number(snapshot?.activeCategoryId || 0);
    const active = visible.find((c) => Number(c.id) === wantedId) || visible[0] || null;
    if (active) {
      setActiveCategory(active.id, active.title, { scroll: false });
    } else {
      state.activeCategoryId = null;
      state.activeCategoryTitle = "\u041a\u0430\u0442\u0430\u043b\u043e\u0433";
      if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
    }

    renderCategories();
    renderCategoryChips();
    renderProducts();
    updateCartBadge();
    return true;
  }

  function restoreCatalogSnapshotForFastPaint() {
    const snapshot = loadCatalogSnapshotFromStorage();
    if (!snapshot) return false;
    return applyCatalogSnapshot(snapshot);
  }

  async function loadCategories() {
    const json = await apiJson("/api/public/categories");
    state.categories = Array.isArray(json.data) ? json.data : [];
  }

  async function loadAutoAdd() {
    if (autoAddLoaded) return;
    if (autoAddLoadPromise) return autoAddLoadPromise;
    autoAddLoadPromise = (async () => {
    try {
      const json = await apiJson("/api/public/auto-add");
      const groups = Array.isArray(json.data?.groups) ? json.data.groups : [];
      const items = Array.isArray(json.data?.items) ? json.data.items : [];
      state.autoAdd.groups = groups;
      state.autoAdd.items = items;
      state.autoAdd.byGroupId = new Map(
        groups
          .map((g) => [Number(g.id), g])
          .filter(([gid]) => Number.isFinite(gid))
      );
      state.autoAdd.byProductId = new Map(
        items
          .map((it) => [Number(it.product_id), it])
          .filter(([pid]) => Number.isFinite(pid))
      );

      items.forEach((it) => {
        if (!it.group && Number.isFinite(Number(it.group_id))) {
          it.group = state.autoAdd.byGroupId.get(Number(it.group_id)) || null;
        }
        const p = it.product;
        if (!p) return;
        if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
        cacheStockFromProductPayload(p, "auto_add_product");
        p.is_available = isProductAvailable(p);
        // Не перезаписываем продукт, если он уже есть в кэше с более полными данными
        const pid = Number(p.id);
        if (!state.productCache.has(pid)) {
          state.productCache.set(pid, p);
        }
      });
      autoAddLoaded = true;
    } catch (e) {
      console.warn("Failed to load auto-add rules", e);
      state.autoAdd.groups = [];
      state.autoAdd.items = [];
      state.autoAdd.byProductId = new Map();
      state.autoAdd.byGroupId = new Map();
      autoAddLoaded = false;
    } finally {
      autoAddLoadPromise = null;
    }
    })();
    return autoAddLoadPromise;
  }

  async function loadUpsellProducts() {
    if (upsellLoaded) return;
    if (upsellLoadPromise) return upsellLoadPromise;
    upsellLoadPromise = (async () => {
    try {
      const json = await apiJson(`/api/public/cart-upsell`);
      state.upsellProducts = Array.isArray(json.data) ? json.data : [];
      upsellLoaded = true;
    } catch (e) {
      console.warn("Failed to load upsell products", e);
      state.upsellProducts = [];
      upsellLoaded = false;
    } finally {
      upsellLoadPromise = null;
      }
    })();
    return upsellLoadPromise;
  }

  function getCartEnhancersRefreshSignature() {
    const cartSig = Array.isArray(state.cart)
      ? state.cart
        .map((item) => [
          String(item?.key || ""),
          String(item?.type || ""),
          Number(item?.product_id || item?.id || 0),
          Number(item?.qty || 0),
          Number(item?.auto_add || 0),
          Number(item?.auto_add_group_id || 0),
        ].join(":"))
        .join("|")
      : "";
    const dismissedSig = state.autoAddDismissed instanceof Set
      ? Array.from(state.autoAddDismissed).sort().join("|")
      : "";
    const autoAddSig = autoAddLoaded
      ? [
        (state.autoAdd?.groups || []).map((group) => Number(group?.id || 0)).join(","),
        (state.autoAdd?.items || []).map((item) => Number(item?.product_id || item?.id || 0)).join(","),
      ].join("::")
      : "pending";
    const upsellSig = upsellLoaded
      ? (state.upsellProducts || []).map((product) => Number(product?.id || 0)).join(",")
      : "pending";
    return [cartSig, dismissedSig, autoAddSig, upsellSig].join("|||");
  }

  async function refreshCartAfterEnhancersLoaded(opts = {}) {
    if (cartEnhancersRefreshPromise) return cartEnhancersRefreshPromise;
    const force = !!opts.force;
    const beforeSignature = getCartEnhancersRefreshSignature();
    if (!force && beforeSignature === cartEnhancersLastRefreshSignature) return false;

    cartEnhancersRefreshPromise = (async () => {
      const autoChanged = applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      if (autoChanged) {
        saveCart();
        scheduleSyncAllProductCardsFromCart();
      }

      await warmupCartProducts();
      renderCart(true);
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
      if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();

      cartEnhancersLastRefreshSignature = getCartEnhancersRefreshSignature();
      return autoChanged;
    })().finally(() => {
      cartEnhancersRefreshPromise = null;
    });

    return cartEnhancersRefreshPromise;
  }

  function getUpsellDefaultConfigCacheEntry(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return upsellDefaultConfigCache.get(pid) || null;
  }

  function warmUpsellDefaultConfig(productId, sourceProduct) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const cached = getUpsellDefaultConfigCacheEntry(pid);
    if (cached && cached.promise) return cached.promise;

    const promise = buildUpsellDefaultCartConfig(pid, sourceProduct)
      .then((cfg) => {
        upsellDefaultConfigCache.set(pid, { promise: Promise.resolve(cfg), data: cfg, ts: Date.now() });
        return cfg;
      })
      .catch((err) => {
        upsellDefaultConfigCache.delete(pid);
        throw err;
      });

    upsellDefaultConfigCache.set(pid, { promise, data: null, ts: Date.now() });
    return promise;
  }

  async function warmUpsellDefaultConfigBatch(productIds, productsById) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    const unresolved = ids.filter((id) => !upsellDefaultConfigCache.has(id));
    if (!unresolved.length) return;

    const byId = productsById instanceof Map ? productsById : new Map();
    const resolved = new Set();

    try {
      const json = await apiJson('/api/public/products/batch/default-cart-config', {
        method: 'POST',
        body: { ids: unresolved },
      });
      const data = json?.data && typeof json.data === "object" ? json.data : {};
      unresolved.forEach((pid) => {
        const cfg = data[pid];
        if (!cfg || typeof cfg !== "object") return;
        upsellDefaultConfigCache.set(pid, { promise: Promise.resolve(cfg), data: cfg, ts: Date.now() });
        resolved.add(pid);
      });
    } catch {}

    const fallbackIds = unresolved.filter((id) => !resolved.has(id));
    if (!fallbackIds.length) return;

    await Promise.all(fallbackIds.map(async (pid) => {
      const src = byId.get(pid) || null;
      try {
        await warmUpsellDefaultConfig(pid, src);
      } catch {}
    }));
  }

  function queueUpsellConfigBatch(productIds, productsById, opts = {}) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    const unresolved = ids.filter((id) => !upsellDefaultConfigCache.has(id));
    if (!unresolved.length) return;
    unresolved.forEach((id) => upsellConfigBatchPendingIds.add(id));

    const flush = async () => {
      const batchIds = Array.from(upsellConfigBatchPendingIds).filter((id) => !upsellDefaultConfigCache.has(id));
      upsellConfigBatchPendingIds.clear();
      if (!batchIds.length) return;

      const byId = productsById instanceof Map ? productsById : new Map();
      await warmUpsellDefaultConfigBatch(batchIds, byId);
    };

    if (upsellConfigBatchTimer) clearTimeout(upsellConfigBatchTimer);
    const delayMs = Math.max(0, Number(opts.delayMs ?? 80));
    upsellConfigBatchTimer = setTimeout(() => {
      upsellConfigBatchTimer = null;
      flush().catch(() => {});
    }, delayMs);
  }

  function ensureUpsellConfigObserver(scrollEl, productsById) {
    if (!scrollEl) return;
    const byId = productsById instanceof Map ? productsById : new Map();
    if (!("IntersectionObserver" in window)) {
      const ids = Array.from(byId.keys()).slice(0, 6);
      queueUpsellConfigBatch(ids, byId, { delayMs: 0 });
      return;
    }

    if (upsellConfigObserver && upsellConfigObserverRoot !== scrollEl) {
      try { upsellConfigObserver.disconnect(); } catch {}
      upsellConfigObserver = null;
      upsellConfigObserverRoot = null;
    }

    if (!upsellConfigObserver) {
      upsellConfigObserverRoot = scrollEl;
      upsellConfigObserver = new IntersectionObserver((entries) => {
        const ids = [];
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const pid = Number(entry.target?.dataset?.productId || 0);
          if (!Number.isFinite(pid) || pid <= 0) return;
          ids.push(pid);
        });
        if (ids.length) queueUpsellConfigBatch(ids, byId, { delayMs: 60 });
      }, {
        root: scrollEl,
        rootMargin: "120px 0px",
        threshold: 0.01,
      });
    }

    const cards = scrollEl.querySelectorAll(".cart-upsell-card");
    cards.forEach((card) => {
      const pid = Number(card?.dataset?.productId || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      if (upsellConfigObserver) upsellConfigObserver.observe(card);
    });

    const initialIds = Array.from(cards)
      .slice(0, 4)
      .map((card) => Number(card?.dataset?.productId || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    queueUpsellConfigBatch(initialIds, byId, { delayMs: 0 });
  }

  async function preloadCartEnhancers() {
    if (cartEnhancersPreloadPromise) return cartEnhancersPreloadPromise;
    cartEnhancersPreloadPromise = (async () => {
      await Promise.allSettled([loadAutoAdd(), loadUpsellProducts()]);
      await refreshCartAfterEnhancersLoaded();
    })().finally(() => {
      cartEnhancersPreloadPromise = null;
    });
    return cartEnhancersPreloadPromise;
  }

  function _createUpsellCard(p, scrollEl, upsellEl, listEl) {
    const price = p.display_price != null ? p.display_price : (p.price || 0);
    const thumb = p.thumb || (Array.isArray(p.photos) && p.photos[0]) || "";
    const card = document.createElement("div");
    card.className = "cart-upsell-card";
    card.dataset.productId = String(p.id);

    // Формируем подпись с названием варианта если есть
    var descText = "";
    if (p.default_variant && p.default_variant.variant_label) {
      descText = escapeHtml(p.default_variant.variant_label);
    }

    card.innerHTML =
      '<div class="cart-upsell-photo">' +
        (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" />' : '<div class="cart-upsell-no-photo"></div>') +
      '</div>' +
      '<div class="cart-upsell-name">' + escapeHtml(p.name || "") + '</div>' +
      (descText ? '<div class="cart-upsell-desc">' + descText + '</div>' : '') +
      '<button class="cart-upsell-btn" type="button">' + money(price) + '</button>';
    card.addEventListener("click", function() {
      card.remove();
      _syncUpsellVisibility(scrollEl, upsellEl);
      void addUpsellToCart(p, listEl);
    });
    return card;
  }

  function _syncUpsellVisibility(scrollEl, upsellEl) {
    var titleEl = upsellEl.querySelector(".shop-cart-upsell-title");
    var hasCards = scrollEl && scrollEl.querySelector(".cart-upsell-card");
    if (titleEl) titleEl.style.display = hasCards ? "" : "none";
    if (scrollEl) scrollEl.style.display = hasCards ? "" : "none";
  }

  function appendUpsellToList(listEl) {
    if (!listEl) return;
    var allProducts = state.upsellProducts || [];
    if (allProducts.length === 0) {
      var old = listEl.querySelector(".shop-cart-upsell");
      if (old) old.remove();
      return;
    }

    var cartProductIds = new Set(
      (state.cart || []).map(function(ci) { return Number(ci.product_id); }).filter(Boolean)
    );
    var visibleIds = new Set(
      allProducts.filter(function(p) { return !cartProductIds.has(Number(p.id)); }).map(function(p) { return Number(p.id); })
    );

    var upsellEl = listEl.querySelector(".shop-cart-upsell");
    var scrollEl;

    if (!upsellEl) {
      // Создаём блок с нуля
      upsellEl = document.createElement("div");
      upsellEl.className = "shop-cart-upsell";
      var titleEl = document.createElement("div");
      titleEl.className = "shop-cart-upsell-title";
      titleEl.textContent = "Добавить к заказу?";
      scrollEl = document.createElement("div");
      scrollEl.className = "shop-cart-upsell-scroll";
      scrollEl.addEventListener("wheel", function(e) {
        if (scrollEl.scrollWidth > scrollEl.clientWidth) {
          e.preventDefault();
          scrollEl.scrollLeft += e.deltaY;
        }
      }, { passive: false });
      upsellEl.appendChild(titleEl);
      upsellEl.appendChild(scrollEl);
      listEl.appendChild(upsellEl);
    } else {
      scrollEl = upsellEl.querySelector(".shop-cart-upsell-scroll");
      if (!scrollEl) {
        scrollEl = document.createElement("div");
        scrollEl.className = "shop-cart-upsell-scroll";
        upsellEl.appendChild(scrollEl);
      }
      // Убеждаемся что блок в конце listEl
      if (upsellEl.parentNode === listEl && upsellEl !== listEl.lastElementChild) {
        listEl.appendChild(upsellEl);
      }
    }

    // Синхронизируем карточки: убираем лишние, добавляем недостающие
    var existingCards = scrollEl.querySelectorAll(".cart-upsell-card");
    var presentIds = new Set();
    existingCards.forEach(function(card) {
      var pid = Number(card.dataset.productId);
      if (!visibleIds.has(pid)) {
        card.remove();
      } else {
        presentIds.add(pid);
      }
    });

    // Добавляем недостающие карточки
    allProducts.forEach(function(p) {
      var pid = Number(p.id);
      if (visibleIds.has(pid) && !presentIds.has(pid)) {
        scrollEl.appendChild(_createUpsellCard(p, scrollEl, upsellEl, listEl));
      }
    });

    _syncUpsellVisibility(scrollEl, upsellEl);
    const visibleProducts = allProducts.filter((p) => visibleIds.has(Number(p.id)));
    const productsById = new Map(visibleProducts.map((p) => [Number(p.id), p]));
    ensureUpsellConfigObserver(scrollEl, productsById);
  }

    function formatUpsellVariantValueLabel(value, unitShortTitle) {
    const rawValue = str(value || "").trim();
    const unit = str(unitShortTitle || "").trim();
    if (!rawValue) return "";
    if (!unit) return rawValue;
    const hasLetters = /[a-zа-я]/i.test(rawValue);
    return hasLetters ? rawValue : `${rawValue} ${unit}`;
  }

  async function buildUpsellDefaultCartConfig(pid, sourceProduct) {
    const productId = Number(pid || 0);
    if (!Number.isFinite(productId) || productId <= 0) {
      return {
        option_item_ids: [],
        option_items: [],
        ingredients: [],
        ingredient_price_diff: 0,
        variant_group_id: null,
        variant_value_index: null,
        variant_label: "",
        variant_unit_price: 0,
      };
    }

    let product = state.productCache.get(productId) || null;
    if (!product) {
      try {
        const productJson = await apiJson(`/api/public/products/${productId}`);
        product = productJson?.data || null;
      } catch {}
    }
    if (!product && sourceProduct && typeof sourceProduct === "object") {
      product = sourceProduct;
    }
    if (!product) {
      return {
        option_item_ids: [],
        option_items: [],
        ingredients: [],
        ingredient_price_diff: 0,
        variant_group_id: null,
        variant_value_index: null,
        variant_label: "",
        variant_unit_price: 0,
      };
    }

    try {
      const json = await apiJson('/api/public/products/batch/default-cart-config', {
        method: 'POST',
        body: { ids: [productId] },
      });
      const cfg = json?.data?.[productId];
      if (cfg && typeof cfg === "object") {
        return {
          option_item_ids: Array.isArray(cfg.option_item_ids) ? cfg.option_item_ids : [],
          option_items: Array.isArray(cfg.option_items) ? cfg.option_items : [],
          ingredients: Array.isArray(cfg.ingredients) ? cfg.ingredients : [],
          ingredient_price_diff: Number(cfg.ingredient_price_diff || 0),
          variant_group_id: cfg.variant_group_id != null ? Number(cfg.variant_group_id) : null,
          variant_value_index: cfg.variant_value_index != null ? Number(cfg.variant_value_index) : null,
          variant_label: str(cfg.variant_label || ""),
          variant_unit_price: Number(cfg.variant_unit_price || 0),
        };
      }
    } catch {}

    let variants = [];
    let optionAssignments = [];
    let ingredientsRaw = [];
    const [variantsRes, assignmentsRes, ingredientsRes] = await Promise.allSettled([
      apiJson(`/api/public/products/${productId}/variants`),
      apiJson(`/api/public/products/${productId}/option-assignments`),
      apiJson(`/api/public/products/${productId}/ingredients`),
    ]);
    if (variantsRes.status === "fulfilled") {
      variants = Array.isArray(variantsRes.value?.data) ? variantsRes.value.data : [];
    }
    if (assignmentsRes.status === "fulfilled") {
      optionAssignments = Array.isArray(assignmentsRes.value?.data) ? assignmentsRes.value.data : [];
    }
    if (ingredientsRes.status === "fulfilled") {
      ingredientsRaw = Array.isArray(ingredientsRes.value?.data) ? ingredientsRes.value.data : [];
    }

    let variantGroupId = null;
    let variantValueIndex = null;
    let variantLabel = "";
    let variantUnitPrice = Number(product.price || 0);
    const firstVariantGroup = Array.isArray(variants) && variants.length > 0 ? variants[0] : null;
    const variantValues = Array.isArray(firstVariantGroup?.values) ? firstVariantGroup.values : [];
    if (firstVariantGroup && variantValues.length > 0) {
      const rawIdx = firstVariantGroup.default_value_index != null ? Number(firstVariantGroup.default_value_index) : 0;
      const safeIdx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < variantValues.length ? rawIdx : 0;
      const valueLabel = formatUpsellVariantValueLabel(
        variantValues[safeIdx],
        firstVariantGroup.unit_short_title || firstVariantGroup.unit_code || firstVariantGroup.unit_title || ""
      );
      variantGroupId = Number(firstVariantGroup.id || firstVariantGroup.variant_group_id || 0) || null;
      variantValueIndex = safeIdx;
      variantLabel = valueLabel;
      variantUnitPrice = Number(
        getVariantUnitPrice(product, variants, {
          selectedIndex: safeIdx,
          value: variantValues[safeIdx],
          label: valueLabel,
        }) || product.price || 0
      );
    }

    const selectedOptionItems = [];
    const activeAssignments = (Array.isArray(optionAssignments) ? optionAssignments : [])
      .filter((assignment) => Number(assignment?.is_active ?? 1) === 1);
    const groups = await Promise.all(
      activeAssignments.map(async (assignment) => {
        const groupId = Number(assignment?.group_id || 0);
        if (!Number.isFinite(groupId) || groupId <= 0) return null;
        try {
          const groupJson = await apiJson(`/api/public/options/groups/${groupId}`);
          return { assignment, details: groupJson?.data || null };
        } catch {
          return null;
        }
      })
    );

    groups.forEach((entry) => {
      if (!entry || !entry.details) return;
      const assignment = entry.assignment || {};
      const details = entry.details || {};
      const groupMeta = details.group || details || {};
      const items = (Array.isArray(details.items) ? details.items : [])
        .filter((item) => Number(item?.is_active ?? 1) === 1);
      if (!items.length) return;

      const selectionType = str(groupMeta.selection_type || assignment.selection_type || "single").trim().toLowerCase() || "single";
      const minSelect = Number(groupMeta.min_select ?? assignment.min_select ?? 0);
      const requiredSingle = selectionType === "single" && (Number(groupMeta.is_required || 0) === 1 || minSelect > 0);

      const addDefaultOptionItem = (item, qty) => {
        const safeQty = Math.max(1, Number(qty || 1));
        const targetProductId = Number(item?.target_product_id || item?.product_id || 0);
        const out = {
          id: Number(item.id),
          title: str(item.title || item.name || ""),
          name: str(item.name || item.title || ""),
          price: Number(item.price || 0),
          qty: safeQty,
          quantity: safeQty,
          target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
          product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
        };

        const itemVariants = Array.isArray(item?.variants) ? item.variants : [];
        const firstItemVariantGroup = itemVariants.length ? itemVariants[0] : null;
        const itemVariantValues = Array.isArray(firstItemVariantGroup?.values) ? firstItemVariantGroup.values : [];
        if (firstItemVariantGroup && itemVariantValues.length > 0) {
          const rawVariantIdx = firstItemVariantGroup.default_value_index != null ? Number(firstItemVariantGroup.default_value_index) : 0;
          const safeVariantIdx = Number.isFinite(rawVariantIdx) && rawVariantIdx >= 0 && rawVariantIdx < itemVariantValues.length ? rawVariantIdx : 0;
          const variantUnitPriceForOption = Number(getOptionItemVariantUnitPrice(item, firstItemVariantGroup, safeVariantIdx) || out.price || 0);
          out.variant_group_id = Number(firstItemVariantGroup.id || firstItemVariantGroup.variant_group_id || 0) || null;
          out.variant_value_index = safeVariantIdx;
          out.variant_label = formatUpsellVariantValueLabel(
            itemVariantValues[safeVariantIdx],
            firstItemVariantGroup.unit_short_title || firstItemVariantGroup.unit_code || firstItemVariantGroup.unit_title || ""
          );
          out.variant_price_diff = roundPrice(variantUnitPriceForOption - Number(out.price || 0));
          out.price = variantUnitPriceForOption;
        }

        selectedOptionItems.push(out);
      };

      if (selectionType === "single") {
        if (requiredSingle) addDefaultOptionItem(items[0], 1);
        return;
      }

      if (selectionType === "multiple_group" || selectionType === "multiple_item" || selectionType === "multiple") {
        const requiredCount = Number.isFinite(minSelect) ? Math.max(0, Math.floor(minSelect)) : 0;
        if (requiredCount <= 0) {
          return;
        }

        let selectedCount = 0;
        items.forEach((item) => {
          if (selectedCount >= requiredCount) return;
          const qtyMin = Number(item?.qty_min ?? 0);
          const defaultQty = qtyMin > 0 ? qtyMin : 1;
          addDefaultOptionItem(item, defaultQty);
          selectedCount += 1;
        });
      }
    });

    const ingredients = (Array.isArray(ingredientsRaw) ? ingredientsRaw : [])
      .map((ing) => {
        const ingredientId = Number(ing?.ingredient_id || ing?.id || 0);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
        const quantity = Number(ing?.quantity ?? ing?.qty ?? 0);
        if (!(quantity > 0)) return null;
        return {
          ingredient_id: ingredientId,
          ingredient_name: str(ing?.ingredient_name || ing?.name || ""),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity,
          qty: quantity,
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit_label: str(ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ing?.unit || ""),
          unit: str(ing?.unit || ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ""),
        };
      })
      .filter(Boolean);

    return {
      option_item_ids: selectedOptionItems.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0),
      option_items: selectedOptionItems,
      ingredients,
      ingredient_price_diff: 0,
      variant_group_id: variantGroupId,
      variant_value_index: variantValueIndex,
      variant_label: variantLabel,
      variant_unit_price: Number(variantUnitPrice || 0),
    };
  }

  async function addUpsellToCart(p, listEl) {
    const pid = Number(p.id);
    if (!Number.isFinite(pid)) return;
    const wasEmpty = cartCountTotal() === 0;
    const mainUpsellBlockBefore = elCartList?.querySelector(".shop-cart-upsell") || null;
    const sheetUpsellBlockBefore = openCartSheetCtx?.listEl
      ? openCartSheetCtx.listEl.querySelector(".shop-cart-upsell")
      : null;
    const mainUpsellScrollBefore = captureUpsellScrollState(elCartList);
    const sheetUpsellScrollBefore = openCartSheetCtx?.listEl
      ? captureUpsellScrollState(openCartSheetCtx.listEl)
      : null;
    const mainRowsBefore = captureRenderedCartRowsByKey(elCartList);
    const sheetRowsBefore = openCartSheetCtx?.listEl
      ? captureRenderedCartRowsByKey(openCartSheetCtx.listEl)
      : new Map();

    const cachedDefaults = getUpsellDefaultConfigCacheEntry(pid);
    const defaults = cachedDefaults && cachedDefaults.promise
      ? await cachedDefaults.promise
      : await warmUpsellDefaultConfig(pid, p);
    let normalizedVariantUnitPrice = Number(defaults?.variant_unit_price || 0);
    let normalizedVariantGroupId = defaults?.variant_group_id != null ? Number(defaults.variant_group_id) : null;
    let normalizedVariantValueIndex = defaults?.variant_value_index != null ? Number(defaults.variant_value_index) : null;
    let normalizedVariantLabel = str(defaults?.variant_label || "");

    try {
      const [productForVariant, variantsForVariant] = await Promise.all([
        ensureProduct(pid),
        resolveProductVariants(pid),
      ]);
      const vGroups = Array.isArray(variantsForVariant) ? variantsForVariant : [];
      const firstVariantGroup = vGroups.length ? vGroups[0] : null;
      const values = Array.isArray(firstVariantGroup?.values) ? firstVariantGroup.values : [];
      if (firstVariantGroup && values.length) {
        const rawIdx = normalizedVariantValueIndex != null
          ? Number(normalizedVariantValueIndex)
          : (firstVariantGroup.default_value_index != null ? Number(firstVariantGroup.default_value_index) : 0);
        const safeIdx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < values.length ? rawIdx : 0;
        const valueLabel = formatUpsellVariantValueLabel(
          values[safeIdx],
          firstVariantGroup.unit_short_title || firstVariantGroup.unit_code || firstVariantGroup.unit_title || ""
        );
        const recalculated = Number(getVariantUnitPrice(productForVariant, vGroups, {
          selectedIndex: safeIdx,
          value: values[safeIdx],
          label: valueLabel,
        }) || 0);
        if (Number.isFinite(recalculated) && recalculated > 0) {
          normalizedVariantUnitPrice = recalculated;
        }
        normalizedVariantGroupId = Number(firstVariantGroup.id || firstVariantGroup.variant_group_id || 0) || null;
        normalizedVariantValueIndex = safeIdx;
        normalizedVariantLabel = valueLabel;
      } else {
        normalizedVariantGroupId = null;
        normalizedVariantValueIndex = null;
        normalizedVariantLabel = "";
      }
    } catch {}

    // Upsell flow: ignore option groups entirely (keep only product + variant + ingredients).
    const optionItems = [];
    const ingredients = Array.isArray(defaults.ingredients) ? defaults.ingredients : [];
    const hasVariant =
      Number.isFinite(Number(normalizedVariantGroupId)) &&
      Number.isFinite(Number(normalizedVariantValueIndex));
    const variantSelection = hasVariant
      ? {
          group_id: Number(normalizedVariantGroupId),
          value_index: Number(normalizedVariantValueIndex),
        }
      : null;

    const key = makeCartKey(pid, optionItems, ingredients, variantSelection);
    const existing = getCartItemByKey(key);
    if (existing) {
      existing.qty += 1;
      existing.option_item_ids = [];
      existing.option_items = optionItems;
      existing.ingredients = ingredients;
      existing.ingredient_price_diff = Number(defaults.ingredient_price_diff || 0);
      existing.variant_group_id = hasVariant ? Number(normalizedVariantGroupId) : null;
      existing.variant_value_index = hasVariant ? Number(normalizedVariantValueIndex) : null;
      existing.variant_label = hasVariant ? str(normalizedVariantLabel || "") : "";
      existing.variant_unit_price = hasVariant ? Number(normalizedVariantUnitPrice || 0) : 0;
    } else {
      state.cart.push({
        key: key,
        product_id: pid,
        qty: 1,
        option_item_ids: [],
        option_items: optionItems,
        ingredients: ingredients,
        ingredient_price_diff: Number(defaults.ingredient_price_diff || 0),
        variant_group_id: hasVariant ? Number(normalizedVariantGroupId) : null,
        variant_value_index: hasVariant ? Number(normalizedVariantValueIndex) : null,
        variant_label: hasVariant ? str(normalizedVariantLabel || "") : "",
        variant_unit_price: hasVariant ? Number(normalizedVariantUnitPrice || 0) : 0,
        auto_add: 0,
        auto_add_group_id: null,
      });
    }
    if (wasEmpty) {
      clearAllAutoAddDismissed();
    }
    const autoChanged = applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();

    const canReuseRows = !existing && !autoChanged;
    if (canReuseRows) {
      const { items, total } = renderCartIntoWithRowReuse(
        elCartList,
        elCartTotal,
        elCartEmpty,
        mainRowsBefore,
        mainUpsellBlockBefore
      );
      syncCartFooterVisibilityForCartMode(items.length);
      if (elCheckoutBtn) {
        elCheckoutBtn.disabled = items.length === 0;
        const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
        if (totalSpan) totalSpan.textContent = money(total);
      }
      appendUpsellToList(elCartList);
      restoreUpsellScrollState(elCartList, mainUpsellScrollBefore);
      updateMobileDeliveryProgress();
      cartUiRenderedRevision = cartUiRevision;
    } else {
      renderCart();
      restoreUpsellScrollState(elCartList, mainUpsellScrollBefore);
    }

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const isSameListAsMain = openCartSheetCtx.listEl === elCartList;
      const rendered = isSameListAsMain
        ? { items: cartItemsResolved(), total: computeCartTotals(cartItemsResolved()).total }
        : (canReuseRows
          ? renderCartIntoWithRowReuse(
            openCartSheetCtx.listEl,
            openCartSheetCtx.totalEl,
            null,
            sheetRowsBefore,
            sheetUpsellBlockBefore
          )
          : renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null));
      const items = rendered.items;
      const total = rendered.total;
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      const isMobileUpsell = window.matchMedia("(max-width: 768px)").matches;
      if (isMobileUpsell && elMobileCartActions) {
        elMobileCartActionsCart?.classList.toggle("hidden", items.length === 0);
        updateMobileDeliveryProgress();
      }
      appendUpsellToList(openCartSheetCtx.listEl);
      if (isSameListAsMain) {
        restoreUpsellScrollState(openCartSheetCtx.listEl, mainUpsellScrollBefore);
      } else {
        restoreUpsellScrollState(openCartSheetCtx.listEl, sheetUpsellScrollBefore);
      }
    }

    const hasItemsNow = cartItemsResolved().length > 0;
    updateCartBadge();
    if (elMobileCheckoutBtn) {
      elMobileCheckoutBtn.disabled = !hasItemsNow;
    }
    if (window.matchMedia("(max-width: 768px)").matches && elMobileCartActionsCart) {
      elMobileCartActionsCart.classList.toggle("hidden", !hasItemsNow);
    }
  }

  async function loadUnitConversions() {
    try {
      const json = await apiJson("/api/public/unit-conversions");
      state.unitConversions = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error("Failed to load unit conversions", e);
      state.unitConversions = [];
    }
  }

  function getConversionFactor(fromUnitId, toUnitId) {
    if (!fromUnitId || !toUnitId) return null;
    if (Number(fromUnitId) === Number(toUnitId)) return 1;
    const direct = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(fromUnitId) && Number(c.to_unit_id) === Number(toUnitId) && Number(c.is_active) === 1
    );
    if (direct && Number(direct.factor)) return Number(direct.factor);
    const inverse = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(toUnitId) && Number(c.to_unit_id) === Number(fromUnitId) && Number(c.is_active) === 1
    );
    if (inverse && Number(inverse.factor)) return 1 / Number(inverse.factor);
    return null;
  }

  function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  /**
   * ???? ??????-????? ? ?????? ?????????? ???????? (?????? ?????).
   * ???????????? ??? ????? ?????? (??/?, ?/?? ? ?.?.): ?????????? ??????????? ??? ??? ????????? ???????? ??????.
   */
  function getOptionItemVariantUnitPrice(optionItem, variantGroup, selectedIndex) {
    const fallbackPrice = Number(optionItem?.price || 0);
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return fallbackPrice;
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return fallbackPrice;

    const numericValue = parseVariantValueNumber(values[idx]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackPrice;

    const productId = Number(optionItem?.target_product_id || 0);
    const product = productId > 0 ? state.productCache.get(productId) : null;

    let unitPrice = null;

    if (product) {
      const basePrice = Number(product.price || 0);
      const baseUnitId = Number(product.base_unit_id || product.unit_id || variantGroup?.unit_id || 0);
      const baseQty = Number(product.base_qty || 1) || 1;
      const variantUnitId = Number(variantGroup?.unit_id || baseUnitId);

      if (basePrice > 0 && baseUnitId && variantUnitId) {
        const factor = getConversionFactor(variantUnitId, baseUnitId);
        if (factor != null) {
          const qtyInBase = numericValue * Number(factor || 0);
          if (Number.isFinite(qtyInBase) && qtyInBase > 0) {
            unitPrice = basePrice * (qtyInBase / baseQty);
          }
        }
      }
    }

    // ???? ?В корзине пусто???? ????? ?????/??????????? ? ?????????В корзине пусто???? ?? ???? ?????
    if (unitPrice == null) {
      const baseValue = parseVariantValueNumber(values[0]);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fallbackPrice;
      unitPrice = fallbackPrice * (numericValue / baseValue);
    }

    const tiers = Array.isArray(variantGroup?.discount_tiers) ? variantGroup.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === idx);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

  function getVariantUnitPrice(product, variants, variantState) {
    if (!product) return 0;
    const basePrice = Number(product.price || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const selectedIndex = Number(variantState?.selectedIndex);
    if (!Number.isFinite(selectedIndex)) return basePrice;

    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;

    const value = Array.isArray(group.values) ? group.values[selectedIndex] : null;
    const numericValue = parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;

    const factor = getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return basePrice;
    const qtyInBase = numericValue * Number(factor || 0);
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;

    let unitPrice = basePrice * (qtyInBase / baseQty);

    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selectedIndex);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

  function getQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    
    // ??? ????????? ????? pcs ?????????? ingredient_pcs_factor ???? ????
    // ????????? ????? ??? ???????, ??? ??? ??? ??????? ? ?????? ?????? ? ??????
    // ?????? ????? ?????????? ????? ????????? ????? getConversionFactor
    
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  async function loadProductsByCategory() {
    const categories = getVisibleCategories();
    const categoryIds = categories.map(c => Number(c.id));

    let productsByCategory = {};
    let combosByCategory = {};

    try {
      const json = await apiJson('/api/public/products/batch/categories', {
        method: 'POST',
        body: { category_ids: categoryIds },
      });
      productsByCategory = json.data || {};
      combosByCategory = json.combos || {};
    } catch (e) {
      console.warn("loadProductsByCategory: batch failed, falling back", e);
      // fallback: загружаем по одному
      const entries = await Promise.all(
        categories.map(async (c) => {
          try {
            const json = await apiJson(`/api/public/products?category_id=${encodeURIComponent(c.id)}`);
            combosByCategory[c.id] = Array.isArray(json.combos) ? json.combos : [];
            return [Number(c.id), Array.isArray(json.data) ? json.data : []];
          } catch (e2) {
            combosByCategory[c.id] = [];
            return [Number(c.id), []];
          }
        })
      );
      for (const [id, list] of entries) productsByCategory[id] = list;
    }

    const entries = categoryIds.map(id => {
      const list = Array.isArray(productsByCategory[id]) ? productsByCategory[id] : [];
      for (const p of list) {
        if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
        cacheStockFromProductPayload(p, "products_by_category");
        p.is_available = isProductAvailable(p);
        state.productCache.set(Number(p.id), p);
      }
      state.combosByCategory.set(id, Array.isArray(combosByCategory[id]) ? combosByCategory[id] : []);
      return [id, list];
    });

    state.productsByCategory = new Map(entries);
    saveCatalogSnapshotFromState();
    if (pruneUnavailableCartItems()) {
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
  }

  // ??????? ????????: ?????? ???? ????????? (??? ???????? LCP).
  async function loadProductsForCategory(categoryId, opts = {}) {
    const cid = Number(categoryId);
    if (!Number.isFinite(cid)) return [];
    try {
      // ??В корзине пусто?? ????? "lite" ?????: ??????? ?????, ?????В корзине пусто????? ?? ???????.
      // ?????? ????? ?????????? ????? ????? loadProductsByCategory().
      const lite = opts && opts.lite !== false;
      const limitRaw = Number(opts && opts.limit);
      const limit = (Number.isFinite(limitRaw) && limitRaw > 0) ? Math.min(200, Math.max(1, limitRaw)) : 24;
      const url = lite
        ? `/api/public/products?category_id=${encodeURIComponent(cid)}&lite=1&limit=${encodeURIComponent(limit)}`
        : `/api/public/products?category_id=${encodeURIComponent(cid)}`;
      const json = await apiJson(url);
      const list = Array.isArray(json.data) ? json.data : [];
      for (const p of list) {
        if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
        cacheStockFromProductPayload(p, "products_for_category");
        p.is_available = isProductAvailable(p);
        state.productCache.set(Number(p.id), p);
      }
      const combos = Array.isArray(json.combos) ? json.combos : [];
      // В lite режиме не перезаписываем комбо пустым массивом, если они уже загружены
      if (combos.length || !lite) {
        state.combosByCategory.set(cid, combos);
      }
      if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();
      state.productsByCategory.set(cid, list);
      saveCatalogSnapshotFromState();
      try { if (lite) __categoryLoadLimit.set(cid, limit); } catch {}
      return list;
    } catch (e) {
      console.warn("loadProductsForCategory: failed for category", cid, e);

      // ?????????? ????????????, ??? ??????? ?? ??????????
      try {
        const statusEl = document.getElementById("shopToolbarStatus");
        if (statusEl) {
          statusEl.textContent = "Ошибка загрузки каталога";
          statusEl.classList.remove("hidden");
        }
      } catch {}

      state.combosByCategory.set(cid, []);
      if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();
      state.productsByCategory.set(cid, []);
      return [];
    } finally {
      if (pruneUnavailableCartItems()) {
        renderCart();
        updateCartBadge();
      }
    }
  }

  async function refreshShopData() {
    const statusEl = document.getElementById("shopToolbarStatus");
    const showStatus = (text) => {
      if (statusEl) {
        statusEl.textContent = text || "";
        statusEl.classList.toggle("hidden", !text);
      }
    };
    showStatus("Загружаем...");
    try {
      await loadCategories();
      renderCategories();
      renderCategoryChips();
      if (typeof updateStoreStatus === "function") if (typeof updateStoreStatus === "function") updateStoreStatus();
      const visible = getVisibleCategories();
      const stillActive = visible.some((c) => Number(c.id) === Number(state.activeCategoryId));
      if (!stillActive && visible.length) {
        const first = visible[0];
        setActiveCategory(first.id, first.title, { scroll: false });
      } else if (!visible.length) {
        state.activeCategoryId = null;
        state.activeCategoryTitle = "Каталог";
        if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
      }

      // ?????? ??В корзине пусто???? ?????, ????? ?????? ? ????? ???? ???????? ??? ?????????.
      if (visible.length) {
        await loadProductsByCategory();
      } else {
        state.productsByCategory = new Map();
        state.combosByCategory = new Map();
      }
      renderProducts();
      renderCart();
      updateCartBadge();
      saveCatalogSnapshotFromState();
    } finally {
      showStatus("");
    }
  }


// -----------------------------
// Init (core)
// -----------------------------
const SHOP_SPLASH_MIN_VISIBLE_MS = 1500;
const SHOP_SPLASH_FADE_OUT_MS = 350;
const __shopSplashStartedAt = Date.now();
let __shopSplashHideScheduled = false;
let __shopSplashHidden = false;

function scheduleHideShopSplash(minVisibleMs = SHOP_SPLASH_MIN_VISIBLE_MS) {
  if (__shopSplashHidden || __shopSplashHideScheduled) return;
  const splashEl = document.getElementById("shopSplash");
  if (!splashEl) {
    __shopSplashHidden = true;
    return;
  }

  __shopSplashHideScheduled = true;
  const elapsedMs = Date.now() - __shopSplashStartedAt;
  const waitMs = Math.max(0, Number(minVisibleMs || 0) - elapsedMs);

  setTimeout(() => {
    const el = document.getElementById("shopSplash");
    if (!el) {
      __shopSplashHidden = true;
      return;
    }
    el.classList.add("is-done");
    setTimeout(() => {
      try { el.remove(); } catch {}
      __shopSplashHidden = true;
    }, SHOP_SPLASH_FADE_OUT_MS);
  }, waitMs);
}

async function initCore() {
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    try { bindIosBackSwipeGuard(); } catch {}
    try { bindMobileZoomGuard(); } catch {}
    try { bindMobilePortraitGuard(); } catch {}
    if (isShopPage()) {
      document.body.classList.add("shop-main");
    } else {
      document.body.classList.remove("shop-main");
    }

    const hasSnapshotPaint = restoreCatalogSnapshotForFastPaint();
    if (hasSnapshotPaint) {
      try {
        if (typeof updateStoreStatus === "function") updateStoreStatus();
      } catch {}
      try { prioritizeAboveFoldCardImages(); } catch {}
      scheduleHideShopSplash();
    } else {
      renderCategoriesSkeleton();
      renderProductsSkeleton();
      scheduleHideShopSplash();
    }

    await loadCategories();
    renderCategories();
    renderCategoryChips();
    if (typeof updateStoreStatus === "function") if (typeof updateStoreStatus === "function") updateStoreStatus();

    const visibleCategories = getVisibleCategories();
    const first = visibleCategories[0] || null;
    if (first) {
      setActiveCategory(first.id, first.title, { scroll: false });
    } else {
      state.activeCategoryId = null;
      state.activeCategoryTitle = "Каталог";
      if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
    }

    // Загружаем адрес параллельно с товарами, чтобы хедер обновился как можно раньше
    const addressPromise = refreshAddressState().then(() => {
      updateAddressChip();
    }).catch(() => {});

    // ????? ?????? ??В корзине пусто???? (?????? + ?????),
    // ????? ??????? ??? ????????? ????? ??? ?????????.
    if (visibleCategories.length) {
      await loadProductsByCategory();
    } else {
      state.productsByCategory = new Map();
      state.combosByCategory = new Map();
    }

    if (!hasSnapshotPaint) {
      await warmInitialCatalogInteractionData();
    }

    renderProducts();
    prioritizeAboveFoldCardImages();

    // Убираем loader — контент готов
    scheduleHideShopSplash();

    // Batch-загрузка ингредиентов для всех товаров одним запросом
    const allProductIds = [];
    if (state.productsByCategory instanceof Map) {
      state.productsByCategory.forEach(function(products) {
        for (var i = 0; i < products.length; i++) {
          var pid = Number(products[i]?.id);
          if (Number.isFinite(pid) && pid > 0) allProductIds.push(pid);
        }
      });
    }
    if (allProductIds.length) batchLoadIngredientRequirements(allProductIds).catch(function() {});

    await addressPromise;

    // Перед первым "боевым" рендером корзины прогреваем товары из корзины,
    // чтобы сразу использовать тот же путь и те же данные, что и при
    // последующих обновлениях (после любых действий пользователя).
    await warmupCartProducts();
    renderCart();
    // Apply cart-header address mode immediately on first paint.
    showCartView();
    updateCartBadge();
    try { void preloadCartEnhancers(); } catch {}
    bindLateActionDelegates();
    try { window.scrollTo(0, 0); } catch {}

    bindCategoryScrollSpy();
    bindShopWarmups();
    startStockSync();

    // Раньше initShopLate/ensureShopLateLoaded запускались только после первого клика.
    // Теперь мы инициализируем late-часть сразу после загрузки магазина,
    // чтобы корзина и остальные элементы не зависели от первого взаимодействия.
    try {
      ensureShopLateLoaded();
    } catch {}
  } catch (e) {
    console.error(e);
    scheduleHideShopSplash();
  }
}

if (__shopHasRequiredDom) initCore();

// Late-loaded on shop-late.js. Core keeps a safe no-op to avoid ReferenceError during first paint.
function updateMobileDeliveryProgress() {}

let __iosBackSwipeGuardBound = false;
function bindIosBackSwipeGuard() {
  if (__iosBackSwipeGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isAppleTouch = /iP(hone|od|ad)/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  const EDGE_PX = 24;
  const SWIPE_TRIGGER_PX = 18;
  const VERTICAL_TOLERANCE_PX = 14;

  document.addEventListener("touchstart", (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = startX <= EDGE_PX;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!tracking) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = Math.abs(touch.clientY - startY);
    if (dx > SWIPE_TRIGGER_PX && dy < VERTICAL_TOLERANCE_PX) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    tracking = false;
  }, { passive: true });
  document.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });

  __iosBackSwipeGuardBound = true;
}

let __mobileZoomGuardBound = false;
function bindMobileZoomGuard() {
  if (__mobileZoomGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isMobile) return;

  // iOS Safari pinch gesture event.
  document.addEventListener("gesturestart", (event) => {
    event.preventDefault();
  }, { passive: false });

  // Prevent double-tap zoom while keeping single taps intact.
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  __mobileZoomGuardBound = true;
}

let __mobilePortraitGuardBound = false;
function bindMobilePortraitGuard() {
  if (__mobilePortraitGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isMobile) return;

  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      screen.orientation.lock("portrait").catch(() => {});
    }
  } catch {}

  let guard = document.getElementById("shopPortraitGuard");
  if (!guard) {
    guard = document.createElement("div");
    guard.id = "shopPortraitGuard";
    guard.className = "shop-portrait-guard hidden";
    guard.innerHTML = '<div class="shop-portrait-guard-card">\u041f\u043e\u0432\u0435\u0440\u043d\u0438\u0442\u0435 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e \u0432 \u043f\u043e\u0440\u0442\u0440\u0435\u0442\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c</div>';
    document.body.appendChild(guard);
  }

  const updatePortraitGuard = () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const isSmallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
    const shouldBlock = isLandscape && isSmallScreen;
    guard.classList.toggle("hidden", !shouldBlock);
    document.body.classList.toggle("shop-portrait-guard-active", shouldBlock);
  };

  updatePortraitGuard();
  window.addEventListener("resize", updatePortraitGuard, { passive: true });
  window.addEventListener("orientationchange", updatePortraitGuard, { passive: true });

  __mobilePortraitGuardBound = true;
}


