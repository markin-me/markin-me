  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isShopPage = () => document.body && document.body.classList.contains("page-shop");
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

  // address (right cart panel)
  const elAddressChip = $("#shopAddressChip");
  const elAddressContent = $("#shopAddressContent");
  const elAddressListView = $("#shopAddressListView");
  const elAddressFormView = $("#shopAddressFormView");
  const elAddressList = $("#shopAddressList");

  const elAddressNewBtn = $("#shopAddressNewBtn");
  const elAddressSaveBtn = $("#shopAddressSaveBtn");
  const elAddressCancelBtn = $("#shopAddressCancelBtn");

  // pickup store (right cart panel)
  const elPickupContent = $("#shopPickupContent");
  const elPickupListView = $("#shopPickupListView");
  const elPickupList = $("#shopPickupList");

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
  const elHeaderProfileBtn = $("#shopProfileBtn");
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
  const elMobileAddressActions = $("#shopMobileAddressActions");
  const elMobileAddressSaveBtn = $("#shopMobileAddressSaveBtn");
  const elMobileAddressCancelBtn = $("#shopMobileAddressCancelBtn");
  
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

  const CUSTOMER_TOKEN_KEY = `shop_customer_token_t${tenantId}`;
  const CUSTOMER_CACHE_KEY = `shop_customer_cache_t${tenantId}`;

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
      return picture;
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

    return img;
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
    });

    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) {
      const err = json?.error || `API_ERROR (${res.status})`;
      const e = new Error(err);
      e.httpStatus = res.status;
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
    _addressFormBackMode: null,
    _addressListBackMode: null,
  };

  let openCartSheetCtx = null;
  let categoryHeaders = [];
  let isProgrammaticCategoryScroll = false;
  let categoryScrollRaf = null;

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
  
  // ??????? ???????????? ????????? ????????? ? bottom sheets ??? ????????? ?????? "?????"
  let sheetNavigationState = {
    type: null, // 'cart' | 'categories' | 'profile' | 'activeOrders' | 'order' | 'product' | null
    screen: null, // ??????? ????? ?????? sheet
    data: null, // ?????????????? ?????? (????????, cartKey ??? product)
  };

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
      // ?? ?????? ??????? - ???????????? ? ?????????? ??????
      showSheetCheckout();
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
          const normalizedOptionItems = optionItems.length
            ? optionItems.map((opt) => ({
              id: Number(opt.id),
              title: str(opt.title || opt.name || ""),
              price: Number(opt.price || 0),
              qty: Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1,
              // ???????? ?????
              variant_group_id: opt.variant_group_id != null ? Number(opt.variant_group_id) : null,
              variant_value_index: opt.variant_value_index != null ? Number(opt.variant_value_index) : null,
              variant_label: str(opt.variant_label || ""),
              variant_price_diff: Number(opt.variant_price_diff || 0),
            }))
            : normalizedOptionIds.map((id) => ({
              id,
              title: "",
              price: 0,
              qty: 1,
              variant_group_id: null,
              variant_value_index: null,
              variant_label: "",
              variant_price_diff: 0,
            }));
          // ??????????????? ??????????? ?? ??????????? ??????
          const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
          
          return {
            key: makeCartKey(productId, normalizedOptionItems, ingredients, {
              group_id: item.variant_group_id,
              value_index: item.variant_value_index,
            }),
            product_id: productId,
            qty,
            option_item_ids: normalizedOptionItems.map((opt) => opt.id),
            option_items: normalizedOptionItems,
            ingredients: ingredients,
            ingredient_price_diff: Number(item?.ingredient_price_diff || 0),
            variant_group_id: Number(item.variant_group_id ?? null),
            variant_value_index: Number.isFinite(Number(item.variant_value_index))
              ? Number(item.variant_value_index)
              : null,
            variant_label: str(item.variant_label || ""),
            variant_unit_price: Number(item.variant_unit_price || 0),
            auto_add: Number(item?.auto_add || 0) ? 1 : 0,
            auto_add_group_id: Number(item?.auto_add_group_id ?? null),
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

  function cartCountTotal() {
    return state.cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }

  function getCartItemByKey(key) {
    return state.cart.find((item) => item.key === key) || null;
  }

  function cartItemsResolved() {
    const items = [];
    for (const item of state.cart) {
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
      items.push({
        key: item.key,
        product: p,
        qty,
        option_item_ids: Array.isArray(item.option_item_ids) ? item.option_item_ids : [],
        option_items: Array.isArray(item.option_items) ? item.option_items : [],
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        ingredient_price_diff: Number(item.ingredient_price_diff || 0),
        variant_group_id: Number(item.variant_group_id ?? null),
        variant_value_index: Number.isFinite(Number(item.variant_value_index))
          ? Number(item.variant_value_index)
          : null,
        variant_label: str(item.variant_label || ""),
        variant_unit_price: Number(item.variant_unit_price || 0),
        unit_price_override: item.unit_price_override != null ? Number(item.unit_price_override) : null,
        auto_add: Number(item.auto_add || 0),
        auto_add_group_id: Number(item.auto_add_group_id ?? null),
      });
    }
    return items;
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
    const hasVariant = Number.isFinite(Number(item.variant_group_id)) || Number.isFinite(Number(item.variant_value_index));
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
    const lineTotal = roundPrice(unitPrice * paidQty);
    return { lineTotal, unitPrice, paidQty, freeQty, isAuto: isAutoItem, parts };
  }

  function computeCartTotals(items) {
    const nonAutoTotal = computeNonAutoTotal(items);
    const autoEligibleTotal = computeAutoEligibleTotal(items);
    let total = 0;
    (Array.isArray(items) ? items : []).forEach((item) => {
      const pricing = computeItemPricing(item, { nonAutoTotal, autoEligibleTotal });
      total += pricing.lineTotal;
    });
    return { nonAutoTotal, autoEligibleTotal, total };
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
      // ??????: ???????? ????????_?????? (???????? "1?? ????" ??? "200? ????")
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

  // ?????????????? ?????? ?????? - ???????? ? ?????????? ??????? ??? ????????????? ? bottom sheet
  window.formatOrderItem = function formatOrderItem(item) {
    // ?????: ??? ?? ??????, ??? ? ??????? ? ? ??????? ? ???????? ????? ? ????????? ?????? ??? ??????? ? 0
    if (item.type === "combo") {
      const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
      const mainPhoto = photos[0] || "/static/img/placeholder.png";
      const itemQty = Number(item.qty || item.quantity || 1);
      const itemName = `${escapeHtml(item.name || item.combo_title || "Комбо")} × ${itemQty}`;
      let html = `<div class="cart-row cart-row--combo">`;
      html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
      html += `<div class="cart-mid">`;
      html += `<div class="cart-title">${itemName}</div>`;
      const selections = Array.isArray(item.selections) ? item.selections : [];
      if (selections.length) {
        html += `<div class="cart-sub-container cart-combo-details" style="margin-top: 4px; padding-left: 8px;">`;
        selections.forEach((sel) => {
          const productName = str(sel.product_name || "?").trim();
          html += `<div class="cart-combo-detail-block">`;
          html += `<div class="cart-combo-detail-name" style="font-weight: 600;">1 × ${escapeHtml(productName)}</div>`;
          const vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
          if (vParts.length) {
            html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">• ${escapeHtml(vParts.join(" "))}</div>`;
          }
          const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
          ingredientsDisplay.forEach((ing) => {
            const rawQty = ing.qty ?? ing.quantity;
            const numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
            if (!Number.isFinite(numQty) || numQty <= 0) return; // ?? ?????????? ???????? ? 0
            const name = str(ing.name || "").trim();
            if (!name && (rawQty == null || rawQty === "")) return;
            const unit = str(ing.unit || "").trim();
            const parts = [];
            if (rawQty != null && rawQty !== "") parts.push(String(rawQty));
            if (unit) parts.push(unit);
            if (name) parts.push(name);
            html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">• ${escapeHtml(parts.join(" "))}</div>`;
          });
          html += `</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
      html += `<div class="cart-right"><div class="cart-price">${money(item.line_total || item.price || 0)}</div></div>`;
      html += `</div>`;
      return html;
    }

    // ??????? ?????: ?????????? ?????? ??? ? ???????, ?? ????? ?????????
    const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
    const mainPhoto = photos[0] || "/static/img/placeholder.png";
    
    // ????????? ???????? ? ?????????? ???????: ???????? ? ????? ? ???????? ????? ? ???????????
    const variantParts = [];
    const optionParts = [];
    const ingredientParts = [];
    
    // 1. ???????? ?????? (???????)
    if (item.variants && Array.isArray(item.variants) && item.variants.length > 0) {
      item.variants.forEach(v => {
        if (v.label || v.value) {
          const groupTitle = str(v.group_title || "Вариант");
          const variantValue = str(v.label || v.value || "");
          // ??????: ???????? ????????_?????? (???????? "200? ????")
          const formatted = `${variantValue} ${groupTitle}`.trim();
          if (formatted) variantParts.push(formatted);
        }
      });
    }
    
    // 2. ????? (???????)
    if (item.options && Array.isArray(item.options) && item.options.length > 0) {
      item.options.forEach(opt => {
        if (Number(opt.qty ?? opt.quantity ?? 0) <= 0) return; // ?? ?????????? ????? В корзине пусто??????
        const formatted = formatOption({
          title: opt.title || opt.name,
          qty: opt.qty || opt.quantity,
          variant_label: opt.variant_label || opt.variantLabel
        });
        if (formatted) optionParts.push(formatted);
      });
    }
    
    // 3. ??????????? (????????)
    if (item.ingredients && Array.isArray(item.ingredients) && item.ingredients.length > 0) {
      item.ingredients.forEach(ing => {
        // ???????????? ??? ???????: ing.name ? ing.ingredient_name
        // ? JSON ?? ?? ???????????? ing.name
        const ingredientName = ing.ingredient_name || ing.name || ing.ingredientName;
        if (!ingredientName) return; // ?????????? ???? ??? ????????
        
        const quantity = ing.quantity ?? ing.qty ?? 1;
        if (Number(quantity) <= 0) return; // ?? ?????????? ??????? В корзине пусто??????
        // ??????? ????????? ????? ???? ? ?????? ?????
        // ? JSON ?? ?В корзине пусто ?????????????, ?????????? "?" ?? ????????? ??В корзине пусто???????
        let unitLabel = ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "";
        
        // ???? ??????? ?? ???????, ???????? ?????????? ?? ??????????
        // ???? quantity > 10, ???????? ??? ??????
        if (!unitLabel && quantity > 10) {
          unitLabel = "г";
        } else if (!unitLabel) {
          unitLabel = "шт";
        }
        
        const formatted = formatIngredient({
          ingredient_name: ingredientName,
          quantity: quantity,
          unit_label: unitLabel
        });
        if (formatted) ingredientParts.push(formatted);
      });
    }
    
    // ?????????? ??? ????????
    const allParts = [...variantParts, ...optionParts, ...ingredientParts];
    
    // ??????? HTML ??? ? ???????
    let html = `<div class="cart-row">`;
    
    // ????
    html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
    
    // ??????? ????? ? ????????? ? ????????
    html += `<div class="cart-mid">`;
    
    // ???????? ?????? ? ??????????? (? ?????, ??? ? ???????)
    const itemQty = Number(item.qty || item.quantity || 1);
    const itemName = `${escapeHtml(item.name || "Товар")} × ${itemQty}`;
    html += `<div class="cart-title">${itemName}</div>`;
    
    // ?????? (????????? ?????)
    if (allParts.length > 0) {
      html += `<div class="cart-sub-container">`;
      html += `<div class="cart-sub-details" style="display: block; margin-top: 4px; padding-left: 8px;">`;
      allParts.forEach(part => {
        html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">• ${escapeHtml(part)}</div>`;
      });
      html += `</div>`;
      html += `</div>`;
    }
    
    html += `</div>`;
    
    // ?????? ????? ? ??????????? ? ?????
    html += `<div class="cart-right">`;
    html += `<div class="cart-price">${money(item.line_total || item.price || 0)}</div>`;
    html += `</div>`;
    
    html += `</div>`;
    
    return html;
  };

  // -----------------------------
  // Cart warmup: ensure products for all cart items are in cache
  // (????? ??????? ?? ???????? ?В корзине пусто???? ?????????)
  // -----------------------------
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
          await ensureProduct(pid);
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

  function normalizeAddressPayload(p) {
    const a = p && typeof p === "object" ? p : {};
    const out = {
      street: str(a.street).trim(),
      house: str(a.house).trim(),
      entrance: str(a.entrance).trim(),
      floor: str(a.floor).trim(),
      apartment: str(a.apartment).trim(),
      comment: str(a.comment).trim(),
    };
    if (!out.entrance) out.entrance = null;
    if (!out.floor) out.floor = null;
    if (!out.apartment) out.apartment = null;
    if (!out.comment) out.comment = null;
    return out;
  }

  function formatAddressLine(a) {
    if (!a) return "";
    const street = str(a.street).trim();
    const house = str(a.house).trim();

    const parts = [];
    if (street || house) parts.push([street, house].filter(Boolean).join(" ").trim());

    if (a.entrance) parts.push(`подъезд ${str(a.entrance).trim()}`);
    if (a.floor) parts.push(`этаж ${str(a.floor).trim()}`);
    if (a.apartment) parts.push(`кв ${str(a.apartment).trim()}`);

    return parts.filter(Boolean).join(", ");
  }

  function getSelectedAddressLine() {
    return state.selectedAddress ? formatAddressLine(state.selectedAddress) : "";
  }

  function syncSelectedAddressToCheckoutDraft() {
    const line = getSelectedAddressLine();
    try {
      const d = loadCheckoutDraft();
      d.delivery_address = line || "";
      saveCheckoutDraft(d);
    } catch {}
  }

function updateAddressChip() {
  const line = getSelectedAddressLine();

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
    elCartHeaderTitle.innerHTML = `
      <span class="shop-cart-header-title-text"></span>
      <i class="fas fa-chevron-right shop-cart-header-title-arrow" aria-hidden="true"></i>
    `;
    const textEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-text");
    if (textEl) textEl.textContent = t;

    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
    elCartHeaderTitle.classList.add("is-clickable-address-title");
  }
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
      // ?????? + ????????
      elCartHeaderTitle.innerHTML = `
        <span class="shop-cart-header-title-text"></span>
        <i class="fas fa-chevron-right shop-cart-header-title-arrow" aria-hidden="true"></i>
      `;
      const textEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-text");
      if (textEl) textEl.textContent = title;

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

  // ????? ?????? ??? ??????????
  if (headerEl) headerEl.classList.toggle("is-address-title", !!addressAsTitle);
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("is-address-title", !!addressAsTitle);
}

function setSheetHeaderMode(mode, { onBack } = {}) {
  const header = document.querySelector(".app-modal-header");
  if (!header) return;

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
    favBtn.innerHTML = `<i class="far fa-heart"></i>`;
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

  if (closeBtn) closeBtn.classList.toggle("hidden", isProduct || isOrder);
  if (titleEl) titleEl.classList.toggle("hidden", isProduct);
}

  function setCartFooterMode(mode) {
    if (!elCartFooter) return;
    const isHidden = mode === "hidden";
    elCartFooter.classList.toggle("hidden", isHidden);
    if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", mode !== "cart");
    if (elCheckoutFooterActions) elCheckoutFooterActions.classList.toggle("hidden", mode !== "checkout");
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

  function setSelectedAddress(addr) {
    state.selectedAddress = addr || null;
    updateAddressChip();
    syncSelectedAddressToCheckoutDraft();

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
  cartViewMode = "cart";
  openProductCtx = null;
  if (typeof window._comboStepBackCallback !== "undefined") window._comboStepBackCallback = null;
  window._checkoutMethodCode = null;

  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCartContent) elCartContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  const line = getSelectedAddressLine();
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
  renderCart();
}

function showCheckoutView() {
  cartViewMode = "checkout";
  openProductCtx = null;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elPickupContent) elPickupContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  const line = getSelectedAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    hideTitle: false,
    showAddressChip: false,
    showProfileActions: false,
    showBack: true,
    showFav: false,
    addressAsTitle: true,
    showClose: false,
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("checkout");
}

function showAddressListView(backMode = "cart") {
  if (!elAddressContent || !elAddressListView || !elAddressFormView) return;

  cartViewMode = "address";
  openProductCtx = null;
  state._addressListBackMode = backMode;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  elAddressContent.classList.remove("hidden");
  elAddressListView.classList.remove("hidden");
  elAddressFormView.classList.add("hidden");

  const line = getSelectedAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    showAddressChip: false,     // IMPORTANT: ??? ???????
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: false,
    addressAsTitle: false,      // IMPORTANT: ??? ??????? ???
    showClose: true,            // ??????? ??????
    onClose: () => backAfterAddressSelection(),
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("hidden");
  renderAddressList();
}

function showAddressFormView(prefill, editingId, backMode) {
  if (!elAddressContent || !elAddressFormView || !elAddressListView) return;

  state.addressEditingId = editingId ? Number(editingId) : null;
  state._addressFormBackMode = backMode || (state.selectedAddress ? "list" : "cart");
  cartViewMode = "address";
  openProductCtx = null;

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
  setTimeout(() => { try { elAddrStreet?.focus?.(); } catch {} }, 0);
}

function showPickupListView(backMode = "checkout") {
  if (!elPickupContent || !elPickupListView) return;

  cartViewMode = "pickup";
  openProductCtx = null;
  state._pickupListBackMode = backMode;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  elPickupContent.classList.remove("hidden");
  elPickupListView.classList.remove("hidden");

  setCartHeader({
    title: "Точки самовывоза",
    showAddressChip: false,
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: false,
    addressAsTitle: false,
    showClose: true,
    onClose: async () => {
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
    },
  });

  setCartFooterMode("hidden");
  renderPickupList();
}

  function showProfileView() {
    cartViewMode = "profile";
    openProductCtx = null;
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProductContent) elProductContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.remove("hidden");
    setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: true, showBack: false });
    setCartFooterMode("hidden");
  }

  function rememberPreviousPanel() {
    if (cartViewMode === "profile") return;
    previousPanelMode = cartViewMode;
    previousPanelProductId = openProductCtx?.productId || null;
  }

  async function restorePreviousPanel() {
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
}

  async function reloadAddressesFromServer() {
    try {
      const json = await apiJson("/api/public/me/addresses");
      state.addresses = Array.isArray(json.data) ? json.data : [];
    } catch {
      state.addresses = [];
    }
  }

  function pickDefaultAddress(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.find(a => Number(a.is_default) === 1) || arr[0] || null;
  }

  async function syncDraftAddressToAccountIfNeeded() {
    const token = getCustomerToken();
    if (!token) return;

    const me = await fetchMeSafe();
    if (!me) return;

    const draft = loadAddressDraft();
    if (!draft) return;

    const payload = normalizeAddressPayload(draft);
    if (!payload.street || !payload.house) return;

    try {
      await apiJson("/api/public/me/addresses", { method: "POST", body: { ...payload, is_default: 1 } });
      clearAddressDraft();
    } catch (e) {
      // ?? ????????? ?????????
      console.error(e);
    }
  }

  async function refreshAddressState() {
    const token = getCustomerToken();
    if (token) {
      const me = await fetchMeSafe();
      if (me) {
        await syncDraftAddressToAccountIfNeeded();
        await reloadAddressesFromServer();
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

  function renderAddressList() {
    if (!elAddressList) return;

    elAddressList.innerHTML = "";

    const token = getCustomerToken();
    const list = (token ? state.addresses : []) || [];
    const local = (!token && loadAddressDraft()) ? [{ ...loadAddressDraft(), id: null, _local: true }] : [];

    const effectiveList = token ? list : local;

    if (!effectiveList.length) {
      elAddressList.innerHTML = `<div class="muted">Адресов пока нет.</div>`;
      return;
    }

    effectiveList.forEach((a) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";
      if (Number(a.is_default) === 1) row.classList.add("is-default");

      const isSelected = state.selectedAddress
        ? (a.id && state.selectedAddress.id ? Number(a.id) === Number(state.selectedAddress.id) : !!a._local && !!state.selectedAddress._local)
        : false;
      if (isSelected) row.classList.add("is-selected");

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

      if (token) {
        const btnDef = document.createElement("button");
        btnDef.type = "button";
        btnDef.className = "shop-address-action-icon is-default";
        btnDef.title = Number(a.is_default) === 1 ? "Основной адрес" : "Сделать основным";
        btnDef.innerHTML = `<i class="fas fa-star"></i>`;
        if (Number(a.is_default) === 1) {
          btnDef.classList.add("is-active");
        } else {
          btnDef.addEventListener("click", async (e) => {
            e.stopPropagation();
            try {
              await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
              await refreshAddressState();
              renderAddressList();
            } catch (e) {
              alert("Не удалось обновить адрес");
            }
          });
        } 
        actions.appendChild(btnDef);
      }

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
            await refreshAddressState();
            renderAddressList();
            if (!getSelectedAddressLine()) backAfterAddressSelection();
          } catch (err) {
            alert("Не удалось удалить адрес");
          }
          return;
        }

        clearAddressDraft();
        setSelectedAddress(null);
        renderAddressList();
        backAfterAddressSelection();
      });
      actions.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(actions);
      row.appendChild(card);

      // select by click
      row.addEventListener("click", async () => {
        if (token && a.id) {
          // ??? ?????? (? ?????? ????? default) ? ?????? ?????????
          if (state.selectedAddress && state.selectedAddress.id && Number(state.selectedAddress.id) === Number(a.id)) {
            backAfterAddressSelection();
            return;
          }
          try {
            await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
            await refreshAddressState();
            backAfterAddressSelection();
          } catch (e) {
            alert("Не удалось удалить адрес");
          }
          return;
        }

        // guest
        setSelectedAddress({ ...a, _local: true });
        backAfterAddressSelection();
      });

      elAddressList.appendChild(row);
    });
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

    if (hasList) showAddressListView("checkout");
    else showAddressFormView(prefill || null, null, "checkout");

    try { document.querySelector("#shopCartPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
  }

async function initAddresses() {
  if (!elAddressContent) return;

  async function openAddressFlow(fromMode = "cart") {
    await refreshAddressState();
    if (getSelectedAddressLine()) showAddressListView(fromMode);
    else showAddressFormView(loadAddressDraft(), null, fromMode);
  }

  // chip (???? ?? ????) ? ????? ???????? ??? fallback
  if (elAddressChip) {
    elAddressChip.addEventListener("click", async () => {
      await openAddressFlow("cart");
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

  // ??????
  if (elAddressCancelBtn) {
    elAddressCancelBtn.addEventListener("click", () => {
      const back = state._addressFormBackMode || "cart";
      if (back === "list" && getSelectedAddressLine()) showAddressListView();
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
        street: elAddrStreet?.value,
        house: elAddrHouse?.value,
        entrance: elAddrEntrance?.value,
        floor: elAddrFloor?.value,
        apartment: elAddrApartment?.value,
        comment: elAddrComment?.value,
      });

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
          await refreshAddressState();

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
}

  // -----------------------------
  // UI: qty animation (photo overlay)
  // -----------------------------
  function animateNumber(el, newValue, dir) {
    const prev = el.getAttribute("data-v") || el.textContent.trim() || "0";
    const next = String(newValue);
    el.setAttribute("data-v", next);

    if (!prev) {
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
    newSpan.style.transform = dir === "inc" ? "translateX(100%)" : "translateX(-100%)";

    void el.offsetWidth;

    requestAnimationFrame(() => {
      oldSpan.style.transform = dir === "inc" ? "translateX(-100%)" : "translateX(100%)";
      newSpan.style.transform = "translateX(0)";
    });

    setTimeout(() => {
      el.innerHTML = "";
      el.textContent = next;
    }, 120);
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
    if (!minusEnabled) btnMinus.classList.add("is-disabled");

    const center = document.createElement("div");
    center.className = "qty-pill__center";
    if (centerHtml) center.innerHTML = centerHtml;
    else center.textContent = centerText;

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "qty-pill__btn qty-pill__btn--plus";
    btnPlus.textContent = "+";
    if (!plusEnabled) btnPlus.classList.add("is-disabled");

    pill.appendChild(btnMinus);
    pill.appendChild(center);
    pill.appendChild(btnPlus);

    return { pill, btnMinus, btnPlus, center };
  }

  function catalogCenterHtml(product, qty, calculatedPrice = null) {
    const old = Number(product.old_price || 0);
    const price = calculatedPrice != null
      ? calculatedPrice
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    const showOld = old > 0 && old > price;

    if (!isProductAvailable(product)) return "Нет в наличии";
    if (qty > 0) return `${moneyNoSign(price)} ₽`;
    if (showOld) return `<span class="old">${moneyNoSign(old)} ₽</span>${moneyNoSign(price)} ₽`;
    return `${moneyNoSign(price)} ₽`;
  }

  function isProductAvailable(product) {
    if (!product) return true;
    if (product.is_available !== undefined && product.is_available !== null) {
      return Number(product.is_available) === 1 || product.is_available === true;
    }
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
          // ??? multiple ? ????????? ??? ???????? ? qty_min > 0
          for (const item of (group.items || [])) {
            const qtyMin = item.qty_min ?? 1;
            if (qtyMin > 0 && item.price) {
              price += Number(item.price || 0) * qtyMin;
            }
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
        existing.addEventListener('error', () => resolve());
        return;
      }
      const s = document.createElement('script');
      s.src = '/static/js/shop-late.js';
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
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return __shopLatePromise;
  }

  function openProductDetails(productId, opts = {}) {
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
    };

    ["pointerdown", "touchstart", "wheel", "keydown"].forEach((evt) => {
      window.addEventListener(evt, start, { passive: true, once: true });
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
  }

  function openComboDetails(comboId, opts = {}) {
    return ensureShopLateLoaded().then(() => {
      if (typeof window.openComboDetails === "function" && window.openComboDetails !== openComboDetails) {
        return window.openComboDetails(comboId, opts);
      }
    });
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

      products.forEach((p) => {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        if (appendOnly && existingProductIds && existingProductIds.has(id)) return;
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
          // ?????? ????????? ???????? ?????? ??? ??????? +, ???? ????????
          if (!available) return;
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

      // ???????? ?????-??????? ? ???? ?????????
      const combos = state.combosByCategory.get(cid) || [];
      combos.forEach((combo) => {
        const comboId = Number(combo.id);
        if (!Number.isFinite(comboId)) return;
        if (appendOnly && existingComboIds && existingComboIds.has(comboId)) return;
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

        frag.appendChild(card);
        totalProducts += 1;
        globalCardIndex += 1;
      });
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
    const available = isProductAvailable(product);

    card.setAttribute("data-qty", String(qty));

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
      pill.classList.toggle("qty-pill--muted", !available);
    }
    if (btnMinus) btnMinus.classList.toggle("is-disabled", qty <= 0 || !available);
    if (btnPlus) btnPlus.classList.toggle("is-disabled", !available);
    if (center) {
      if (!available) {
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

  function renderCartInto(listEl, totalEl, emptyPlaceholderEl) {
    const items = sortCartItemsForDisplay(cartItemsResolved());
    if (listEl) listEl.innerHTML = "";

    if (!items.length) {
      if (emptyPlaceholderEl) emptyPlaceholderEl.classList.remove("hidden");
      else if (listEl) listEl.innerHTML = `<div class="shop-cart-empty-sheet">В корзине пусто</div>`;
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
        favBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showToast("Добавлено в избранное");
          favBtn.classList.toggle("is-active");
          if (navigator.vibrate) navigator.vibrate(10);
          resetSwipe(swipeContainer);
        });
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
        t.textContent = comboTitle + (qty > 1 ? " × " + qty : "");
        mid.appendChild(t);

        const subContainer = document.createElement("div");
        subContainer.className = "cart-sub-container cart-combo-details";
        (selections || []).forEach((sel) => {
          const productName = String(sel.product_name || "").trim();
          const variantLabel = String(sel.variant_label || "").trim();
          const variantGroupTitle = String(sel.variant_group_title || "").trim();
          const variantUnit = String(sel.variant_unit || "").trim();
          const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
          const selBlock = document.createElement("div");
          selBlock.className = "cart-combo-detail-block";
          const nameLine = document.createElement("div");
          nameLine.className = "cart-combo-detail-name";
          nameLine.textContent = "1 × " + (productName || "Товар");
          selBlock.appendChild(nameLine);
          const detailsWrap = document.createElement("div");
          detailsWrap.className = "cart-sub-details";
          if (variantLabel || variantGroupTitle || variantUnit) {
            const vParts = [variantLabel, variantUnit, variantGroupTitle].filter(Boolean);
            const vLine = document.createElement("div");
            vLine.className = "cart-sub-detail-item";
            vLine.textContent = "• " + vParts.join(" ");
            detailsWrap.appendChild(vLine);
          }
          ingredientsDisplay.forEach((ing) => {
            const name = String(ing.name || "").trim();
            const rawQty = ing.qty ?? ing.quantity;
            const numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
            if (Number.isFinite(numQty) && numQty === 0) return;
            if (!name && (rawQty == null || rawQty === "")) return;
            const unit = String(ing.unit || "").trim();
            const parts = [];
            if (rawQty != null && rawQty !== "") parts.push(String(rawQty));
            if (unit) parts.push(unit);
            if (name) parts.push(name);
            const line = document.createElement("div");
            line.className = "cart-sub-detail-item";
            line.textContent = "• " + parts.join(" ");
            detailsWrap.appendChild(line);
          });
          selBlock.appendChild(detailsWrap);
          subContainer.appendChild(selBlock);
        });
        mid.appendChild(subContainer);

        const q = document.createElement("div");
        q.className = "cart-qty";
        const { pill, btnMinus, btnPlus, center } = createQtyPill({
          variant: "muted",
          centerText: String(qty),
          // Минус всегда активен при qty > 0 — при qty = 1 будет работать как удаление
          minusEnabled: qty > 0,
          plusEnabled: true,
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
        desktopFavBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showToast("Добавлено в избранное");
          desktopFavBtn.classList.toggle("is-active");
        });
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

        const updateComboQty = () => {
          const cartItem = state.cart.find((x) => x.key === key);
          const newQty = Math.max(1, Number(cartItem?.qty || 0));
          center.textContent = String(newQty);
          // Минус не блокируем на qty = 1 — он должен работать как удаление
          btnMinus.classList.toggle("is-disabled", newQty <= 0);
          pr.textContent = money(roundPrice(unitPrice * newQty));
          const oldEl = row.querySelector(".cart-combo-old");
          if (oldEl) {
            const uOld = Number(cartItem?.unit_price_before_discount || 0) || unitPrice;
            oldEl.textContent = moneyNoSign(roundPrice(uOld * newQty)) + " ₽";
          }
        };
        btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem) return;
          cartItem.qty = Math.max(1, Number(cartItem.qty || 0) + 1);
          saveCart();
          updateComboQty();
          const { total: newTotal } = computeCartTotals(cartItemsResolved());
          if (totalEl) totalEl.textContent = money(newTotal);
          if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
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
          auto_add_group_id: Number(item.auto_add_group_id ?? null),
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
      favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // ???????? ??? ??????????
        showToast("Добавлено в избранное");
        favBtn.classList.toggle("is-active");
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);
        // ???????? ?????
        resetSwipe(swipeContainer);
      });

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
      t.textContent = `${str(product.name)} × ${qty}`;
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
          const formatted = formatIngredient(ing);
          if (formatted) ingredientParts.push(formatted);
        });
      }
      
      // 3. ????? (????????) ? ?? ?????????? ? ??????????? 0
      if (Array.isArray(optionItems) && optionItems.length > 0) {
        optionItems.forEach(opt => {
          if (Number(opt.qty ?? opt.quantity ?? 0) <= 0) return;
          const formatted = formatOption(opt);
          if (formatted) optionParts.push(formatted);
        });
      }

      if (pricing.isAuto && pricing.freeQty > 0) {
        optionParts.push(`Бесплатно: ${pricing.freeQty} шт.`);
      }
      
      // ?????????? ??? ????????
      const allParts = [...variantParts, ...ingredientParts, ...optionParts];
      
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
          detailItem.textContent = `• ${part}`;
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

      const { pill, btnMinus, btnPlus, center } = createQtyPill({
        variant: "muted",
        centerText: String(qty),
        minusEnabled: qty > 0 && allowQty,
      });

      btnPlus.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowQty) return;
        changeQty(product.id, +1, null, key);
        center.textContent = String(getCartItemByKey(key)?.qty || 0);
      });
      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowQty) return;
        changeQty(product.id, -1, null, key);
        center.textContent = String(getCartItemByKey(key)?.qty || 0);
      });
      if (!allowQty) {
        btnPlus.disabled = true;
        btnMinus.disabled = true;
        pill.classList.add("is-disabled");
      }

      q.appendChild(pill);
      const right = document.createElement("div");
      right.className = "cart-right";

      const showOld = !pricing.isAuto && oldUnit > 0 && oldUnit > pricing.unitPrice;

      const oldEl = document.createElement("div");
      oldEl.className = "cart-old";
      oldEl.textContent = showOld ? moneyNoSign(oldUnit * qty) : "";
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
      desktopFavBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showToast("Добавлено в избранное");
        desktopFavBtn.classList.toggle("is-active");
      });

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

          btnPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            clearAutoAddDismissed(groupId, pid);
            const desiredQty = getAutoAddDesiredQty(rule);
            const targetKey = makeCartKey(pid, []);
            changeQty(pid, desiredQty, null, targetKey);
            const restored = getCartItemByKey(targetKey) || state.cart.find((x) => Number(x.product_id || x.id) === pid) || null;
            if (restored) {
              restored.auto_add = 1;
              restored.auto_add_group_id = groupId;
            }
            center.textContent = String(getCartItemByKey(targetKey)?.qty || restored?.qty || 0);
          });

          q.appendChild(pill);
          mid.appendChild(q);
          row.appendChild(mid);

          const right = document.createElement("div");
          right.className = "cart-right";
          const pr = document.createElement("div");
          pr.className = "cart-price";
          pr.textContent = money(0);
          right.appendChild(pr);
          row.appendChild(right);

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
    const idx = state.cart.findIndex(item => {
      if (cartKey && item.key === cartKey) return true;
      if (!cartKey && item.id === productId && !item.key) return true;
      return false;
    });
    if (idx !== -1) {
      const removedItem = state.cart[idx];
      if (removedItem) {
        const pid = Number(removedItem.product_id || removedItem.id);
        if (Number.isFinite(pid) && Number(removedItem.auto_add || 0) === 1) {
          markAutoAddDismissedByProduct(pid);
        }
      }
      state.cart.splice(idx, 1);
      applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      saveCart();
      renderProducts();
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
          openCartSheetCtx.listEl.innerHTML = '<div class="shop-cart-empty-sheet">В корзине пусто</div>';
        }
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
      renderCart();
    }
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

  function renderCart() {
    if (!elCartList) return;

    const { items, total } = renderCartInto(elCartList, elCartTotal, elCartEmpty);

    if (elCartFooter && cartViewMode === "cart") {
      elCartFooter.classList.toggle("hidden", items.length === 0);
    }
    if (elCheckoutBtn) elCheckoutBtn.disabled = items.length === 0;

    if (elCheckoutBtn) {
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(total);
    }
    updateMobileDeliveryProgress();
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
    renderProducts();
    prioritizeAboveFoldCardImages();
    renderCart();
    updateCartBadge();

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
    }

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileCartActions) {
      // ????????? ???? ??????? ? ????? ???????? ?????? ???????????? ? ??? ?????? ???????
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
      updateMobileDeliveryProgress();
    }
  }

  function attachTwoStepClear(btn, onConfirm) {
    if (!btn) return;
    let armed = false;
    let timer = null;

    const reset = () => {
      armed = false;
      btn.classList.remove("is-confirm");
      btn.textContent = "×";
      btn.title = "Очистить корзину";
      btn.setAttribute("aria-label", "Очистить корзину");
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const arm = () => {
      armed = true;
      btn.classList.add("is-confirm");
      btn.textContent = "Очистить корзину";
      btn.title = "Очистить корзину";
      btn.setAttribute("aria-label", "Очистить корзину");
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 6500);
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

  // -----------------------------
  // Qty change
  // -----------------------------
  function changeQty(productId, delta, optionalCartNumEl, cartKey) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return;

    const wasEmpty = cartCountTotal() === 0;

    const p = state.productCache.get(pid);
    if (delta > 0 && p && !isProductAvailable(p)) return;

    let targetKey = cartKey;
    if (targetKey == null && delta < 0) {
      // Из каталога нажали «−» — убираем последнюю добавленную позицию этого товара (любой вариант)
      let lastIdx = -1;
      for (let i = state.cart.length - 1; i >= 0; i--) {
        if (Number(state.cart[i].product_id) === pid) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx >= 0) targetKey = state.cart[lastIdx].key;
    }
    if (targetKey == null) targetKey = makeCartKey(pid, []);
    let item = getCartItemByKey(targetKey);
    let nextQty = 0;

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
      state.cart.push(item);
      if (wasEmpty) {
        clearAllAutoAddDismissed();
      }
    }

    if (item) {
      const prevQty = Number(item.qty || 0);
      nextQty = Math.max(0, prevQty + delta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        if (prevQty > 0 && Number(item.auto_add || 0) === 1) {
          markAutoAddDismissedByProduct(pid);
        }
        state.cart = state.cart.filter((x) => x.key !== targetKey);
      }
    }

    const autoChanged = applyAutoAddRules();
    if (autoChanged) {
      nextQty = Number(getCartItemByKey(targetKey)?.qty || 0);
      scheduleSyncAllProductCardsFromCart();
    }
    clearAutoAddDismissedIfCartEmpty();
    const currentItem = getCartItemByKey(targetKey);
    if (currentItem && Number(currentItem.qty || 0) > 0 && Number(currentItem.auto_add || 0) === 1) {
      clearAutoAddDismissedByProduct(pid);
    }
    saveCart();

    const cards = elProductsGrid.querySelectorAll(`.sp-card[data-product-id="${pid}"]`);
    if (cards.length && p) {
      cards.forEach((card) => applyCardState(card, p, cartQty(pid), delta > 0 ? "inc" : "dec"));
    }

    if (optionalCartNumEl) animateNumber(optionalCartNumEl, nextQty || 0, delta > 0 ? "inc" : "dec");

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
      if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
    }
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

  async function loadCategories() {
    const json = await apiJson("/api/public/categories");
    state.categories = Array.isArray(json.data) ? json.data : [];
  }

  async function loadAutoAdd() {
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
        state.productCache.set(Number(p.id), p);
      });
    } catch (e) {
      console.warn("Failed to load auto-add rules", e);
      state.autoAdd.groups = [];
      state.autoAdd.items = [];
      state.autoAdd.byProductId = new Map();
      state.autoAdd.byGroupId = new Map();
    }
  }

  async function loadUnitConversions() {
    try {
      const json = await apiJson("/api/admin/unit-conversions?all=1");
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
    const entries = await Promise.all(
      categories.map(async (c) => {
        try {
          const json = await apiJson(`/api/public/products?category_id=${encodeURIComponent(c.id)}`);
          const list = Array.isArray(json.data) ? json.data : [];
          for (const p of list) {
            if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
            p.is_available = isProductAvailable(p);
            state.productCache.set(Number(p.id), p);
          }
          const combos = Array.isArray(json.combos) ? json.combos : [];
          state.combosByCategory.set(Number(c.id), combos);
          return [Number(c.id), list];
        } catch (e) {
          console.warn("loadProductsByCategory: failed for category", c.id, e);
          state.combosByCategory.set(Number(c.id), []);
          return [Number(c.id), []];
        }
      })
    );

    state.productsByCategory = new Map(entries);
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
    } finally {
      showStatus("");
    }
  }


// -----------------------------
// Init (core)
// -----------------------------
async function initCore() {
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    if (isShopPage()) {
      document.body.classList.add("shop-main");
    } else {
      document.body.classList.remove("shop-main");
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

    // ????? ?????? ??В корзине пусто???? (?????? + ?????),
    // ????? ??????? ??? ????????? ????? ??? ?????????.
    if (visibleCategories.length) {
      await loadProductsByCategory();
    } else {
      state.productsByCategory = new Map();
      state.combosByCategory = new Map();
    }

    renderProducts();
    prioritizeAboveFoldCardImages();

    // Перед первым “боевым” рендером корзины прогреваем товары из корзины,
    // чтобы сразу использовать тот же путь и те же данные, что и при
    // последующих обновлениях (после любых действий пользователя).
    await warmupCartProducts();
    renderCart();
    updateCartBadge();
    bindLateActionDelegates();
    try { window.scrollTo(0, 0); } catch {}

    bindCategoryScrollSpy();
    bindShopWarmups();

    // Раньше initShopLate/ensureShopLateLoaded запускались только после первого клика.
    // Теперь мы инициализируем late-часть сразу после загрузки магазина,
    // чтобы корзина и остальные элементы не зависели от первого взаимодействия.
    try {
      ensureShopLateLoaded();
    } catch {}
  } catch (e) {
    console.error(e);
  }
}

if (__shopHasRequiredDom) initCore();

// Late-loaded on shop-late.js. Core keeps a safe no-op to avoid ReferenceError during first paint.
function updateMobileDeliveryProgress() {}
