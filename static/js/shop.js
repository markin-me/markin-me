(function () {
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
    $("[data-shop-products-empty]");

  const elNavCategories = $("#shopNavCategories");
  const elNavMenu = $("#shopNavMenu");
  const elNavCart = $("#shopNavCart");
  const elNavProfile = $("#shopNavProfile");
  const elNavFav = $("#shopNavFav");

  const elNavCartBadge = $("#shopNavCartBadge") || $("#shopCartBadge");
  const elCartOpenDesktop = $("#shopCartOpenDesktopBtn");

  // header profile (у тебя в header.ejs есть id)
  const elHeaderProfileBtn = $("#shopProfileBtn");
  const elActiveOrdersBadge = $("#shopActiveOrdersBadge");
  const elActiveOrdersBadgeMobile = $("#shopActiveOrdersBadgeMobile");
  const elActiveOrdersSheetCollapsed = $("#shopActiveOrdersSheetCollapsed");
  
  // Мобильные кнопки добавления в корзину
  const elMobileProductActions = $("#shopMobileProductActions");
  const elMobileQtyWrap = $("#shopMobileQtyWrap");
  const elMobileAddToCartBtn = $("#shopMobileAddToCartBtn");
  const elMobileProductPrice = $("#shopMobileProductPrice");
  const elMobileProductLabel = $("#shopMobileProductLabel");
  
  // Мобильные кнопки корзины
  const elMobileCartActions = $("#shopMobileCartActions");
  const elMobileCartActionsCart = $("#shopMobileCartActionsCart");
  const elMobileCartActionsCheckout = $("#shopMobileCartActionsCheckout");
  const elMobileCartClearBtn = $("#shopMobileCartClearBtn");
  const elMobileCheckoutBtn = $("#shopMobileCheckoutBtn");
  const elMobileCartTotal = $("#shopMobileCartTotal");
  const elMobileCheckoutBackBtn = $("#shopMobileCheckoutBackBtn");
  const elMobileCheckoutSubmitBtn = $("#shopMobileCheckoutSubmitBtn");
  const elMobileAddressActions = $("#shopMobileAddressActions");
  const elMobileAddressSaveBtn = $("#shopMobileAddressSaveBtn");
  const elMobileAddressCancelBtn = $("#shopMobileAddressCancelBtn");
  
  // Состояние мобильных кнопок
  let mobileProductActionsState = {
    qtyPill: null,
    onQtyMinus: null,
    onQtyPlus: null,
    onAddToCart: null,
  };

  // desktop cart footer
  const elCartFooter = $("#shopCartFooter");
  const elCartFooterActions = $("#shopCartFooterActions");
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

  if (!elProductsGrid || !elCatsList) return;

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
   * Генерирует URL для разных форматов изображений (для будущей поддержки WebP/AVIF)
   * @param {string} imageUrl - Оригинальный URL изображения
   * @param {string} format - Формат: 'webp' | 'avif' | 'original'
   * @returns {string}
   */
  function getImageUrlForFormat(imageUrl, format = 'original') {
    if (!imageUrl || imageUrl === '/static/img/placeholder.png') return imageUrl;
    if (format === 'original') return imageUrl;
    
    // В будущем здесь можно добавить логику преобразования URL
    // Например: /static/uploads/products/1/photo.jpg -> /static/uploads/products/1/photo.webp
    // Или использовать серверный endpoint для конвертации: /api/image/convert?url=...&format=webp
    // Пока возвращаем оригинальный URL
    return imageUrl;
  }

  /**
   * Создает оптимизированное изображение с адаптивной загрузкой
   * @param {string} imageUrl - URL изображения
   * @param {Object} options - Опции оптимизации
   * @param {string} options.type - Тип изображения: 'product-grid' | 'product-hero' | 'cart-thumb' | 'thumb' | 'custom'
   * @param {string} options.sizes - Кастомный sizes атрибут (если type='custom')
   * @param {string} options.srcset - Кастомный srcset (опционально, для будущей серверной оптимизации)
   * @param {boolean} options.usePicture - Использовать picture элемент с поддержкой WebP/AVIF (по умолчанию false)
   * @param {string} options.alt - Alt текст
   * @param {string} options.className - CSS класс
   * @returns {HTMLImageElement|HTMLPictureElement}
   */
  function createOptimizedImage(imageUrl, options = {}) {
    const {
      type = 'product-grid',
      sizes: customSizes,
      srcset: customSrcset,
      usePicture = false,
      alt = '',
      className = ''
    } = options;

    // Настройки sizes для разных типов изображений
    const sizesMap = {
      'product-grid': '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw',
      'product-hero': '(max-width: 768px) 100vw, 350px',
      'cart-thumb': '92px',
      'thumb': '52px',
      'custom': customSizes || '100vw'
    };

    const finalUrl = imageUrl || '/static/img/placeholder.png';
    const finalSizes = sizesMap[type] || sizesMap['custom'];

    // Если нужно использовать picture элемент для поддержки современных форматов
    if (usePicture) {
      const picture = document.createElement('picture');
      
      // AVIF (самый современный формат)
      const avifSource = document.createElement('source');
      avifSource.type = 'image/avif';
      avifSource.srcset = getImageUrlForFormat(finalUrl, 'avif');
      picture.appendChild(avifSource);
      
      // WebP (хорошая поддержка)
      const webpSource = document.createElement('source');
      webpSource.type = 'image/webp';
      webpSource.srcset = getImageUrlForFormat(finalUrl, 'webp');
      picture.appendChild(webpSource);
      
      // Fallback на оригинальный формат
      const img = document.createElement('img');
      if (className) img.className = className;
      img.alt = alt;
      img.loading = 'lazy';
      img.src = finalUrl;
      
      if (customSrcset) {
        img.srcset = customSrcset;
      }
      img.sizes = finalSizes;
      
      picture.appendChild(img);
      return picture;
    }

    // Обычный img элемент с адаптивными атрибутами
    const img = document.createElement('img');
    if (className) img.className = className;
    img.alt = alt;
    img.loading = 'lazy';

    if (customSrcset) {
      img.srcset = customSrcset;
      img.sizes = finalSizes;
      // src используется как fallback для старых браузеров
      img.src = finalUrl;
    } else {
      // Пока используем один URL, но с правильным sizes для будущей оптимизации
      img.src = finalUrl;
      img.sizes = finalSizes;
    }

    return img;
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
    if (!v) return "—";
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
  
  // Система отслеживания состояния навигации в bottom sheets для обработки кнопки "назад"
  let sheetNavigationState = {
    type: null, // 'cart' | 'categories' | 'profile' | 'activeOrders' | 'order' | 'product' | null
    screen: null, // текущий экран внутри sheet
    data: null, // дополнительные данные (например, cartKey для product)
  };

  // Функция обработки кнопки "назад" на Android
  function handleAndroidBackButton() {
    // Проверяем, открыт ли bottom sheet через AppModal
    if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
      // Обрабатываем навигацию внутри bottom sheet в зависимости от типа
      if (sheetNavigationState.type === 'cart') {
        return handleCartSheetBack();
      } else if (sheetNavigationState.type === 'activeOrders') {
        return handleActiveOrdersSheetBack();
      } else if (sheetNavigationState.type === 'categories' || 
                 sheetNavigationState.type === 'profile' ||
                 sheetNavigationState.type === 'favorites') {
        // Простые bottom sheets без навигации - просто закрываем
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // Проверяем другие bottom sheets (orders.js, products.js)
    const orderSheet = document.getElementById('orderSheet');
    if (orderSheet && orderSheet.classList.contains('is-open')) {
      // Закрываем bottom sheet из orders.js
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
      // Закрываем bottom sheet из products.js
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
    
    return false; // Не обработали, пусть браузер делает свое
  }

  // Обработка кнопки "назад" для корзины
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

    // Проверяем текущий экран
    if (pickupWrapEl && !pickupWrapEl.classList.contains('hidden')) {
      // На списке точек самовывоза - возвращаемся к оформлению
      showSheetCheckout();
      return true;
    } else if (productEl && !productEl.classList.contains('hidden')) {
      // Комбо: если открыт экран "Заменить" — шаг назад в основное представление комбо
      if (openCartSheetCtx?.comboStepBack && typeof openCartSheetCtx.comboStepBack === "function") {
        openCartSheetCtx.comboStepBack();
        return true;
      }
      // На экране товара - возвращаемся в корзину или закрываем sheet
      const cartKey = sheetNavigationState.data?.cartKey;
      if (cartKey) {
        showSheetCart();
        return true;
      } else {
        closeShopSheetIfOpen();
        return true;
      }
    } else if (addressFormView && !addressFormView.classList.contains('hidden')) {
      // На форме адреса - возвращаемся к списку адресов
      if (openCartSheetCtx?.addressBackMode === "profile") {
        returnToProfileFromSheet();
        return true;
      }
      showSheetAddressList();
      return true;
    } else if (addressListView && !addressListView.classList.contains('hidden')) {
      // На списке адресов - возвращаемся к оформлению заказа
      showSheetCheckout();
      return true;
    } else if (checkoutEl && !checkoutEl.classList.contains('hidden')) {
      // На оформлении заказа - возвращаемся в корзину
      showSheetCart();
      return true;
    } else if (listEl && !listEl.classList.contains('hidden')) {
      // На корзине - закрываем sheet
      closeShopSheetIfOpen();
      return true;
    }
    
    // Fallback - закрываем sheet
    closeShopSheetIfOpen();
    return true;
  }

  // Обработка кнопки "назад" для активных заказов
  function handleActiveOrdersSheetBack() {
    // Если на деталях заказа - возвращаемся к списку
    if (sheetNavigationState.screen === 'details') {
      const savedOrders = window._savedActiveOrdersForBack || [];
      if (savedOrders && savedOrders.length > 0) {
        // Находим функцию showActiveOrdersList в области видимости
        // Она определена внутри функции init, поэтому нужно вызвать её через замыкание
        // Или используем прямое обращение к функции, если она доступна глобально
        const activeOrders = window._activeOrders || [];
        if (activeOrders.length > 1 || savedOrders.length > 1) {
          // Если заказов несколько, показываем список
          // Используем прямое обращение к функции через область видимости
          // Для этого нужно найти функцию в контексте, где она определена
          // Временно используем обходной путь - обновляем контент напрямую
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
          
          // Убираем кнопку назад из хедера
          const modalHeader = document.querySelector(".app-modal-header");
          if (modalHeader) {
            const backBtn = modalHeader.querySelector(".app-modal-back-btn");
            if (backBtn) {
              backBtn.remove();
            }
          }
          
          // Обновляем состояние навигации
          sheetNavigationState.screen = 'list';
          return true;
        } else {
          // Если заказ один, закрываем sheet
          closeShopSheetIfOpen();
          return true;
        }
      } else {
        // Если список пуст, закрываем sheet
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // На списке или fallback - закрываем sheet
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
              // Варианты опций
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
          // Восстанавливаем ингредиенты из сохранённых данных
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
      // Комбо не завязаны на product_id и не должны удаляться этим фильтром
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
        // Учитываем варианты опции в ключе
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
        // Сортируем сначала по id, потом по варианту
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
      // Добавляем вариант опции в ключ, если он есть
      if (entry.variant_group_id != null && entry.variant_value_index != null) {
        part += `v${entry.variant_group_id}-${entry.variant_value_index}`;
      }
      return part;
    }).join(",");
    
    // Добавляем ингредиенты в ключ для различения составов
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
    // Явная цена: unit_price_override или ненулевой variant_unit_price; иначе — цена каталога (важно для автодобавлений с variant_unit_price: 0)
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
      // Учитываем условия автодобавления: если в правиле не задана цена (null/0) — берём цену товара
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
      // Учитываем условия автодобавления: если в правиле не задана цена (null/0) — берём цену товара
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

  // Форматирование варианта: извлекаем значение и название группы из variant_label
  function formatVariant(variantLabel) {
    if (!variantLabel || !variantLabel.trim()) return null;
    // variant_label имеет формат "Название группы: значение" (например "Вариант: 1 шт" или "порц: 200г")
    const parts = variantLabel.split(":");
    if (parts.length >= 2) {
      const groupTitle = parts[0].trim();
      const value = parts.slice(1).join(":").trim();
      // Формат: значение название_группы (например "1шт порц" или "200г порц")
      return `${value} ${groupTitle}`;
    }
    // Если формат неожиданный, возвращаем как есть
    return variantLabel.trim();
  }

  // Форматирование ингредиента: количествоединица название (позиции с 0 не показываем)
  function formatIngredient(ing) {
    const name = str(ing.ingredient_name || "");
    if (!name) return null;
    const qty = Number(ing.quantity ?? ing.qty ?? 1);
    if (qty <= 0) return null;
    const unit = str(ing.unit_label || "");
    // Формат: количествоединица название (например "150г картофельное пюре")
    return `${qty}${unit} ${name}`.trim();
  }

  // Форматирование опции: количествоединица название
  function formatOption(opt) {
    const name = str(opt.title || opt.name || "");
    if (!name) return null;
    
    // Если у опции есть вариант (variant_label), используем его вместо количества "шт"
    const variantLabel = str(opt.variant_label || "").trim();
    if (variantLabel) {
      // variant_label уже содержит значение с единицей (например "200г")
      return `${variantLabel} ${name}`;
    }
    
    // Если варианта нет, используем стандартный формат с количеством
    const optQty = Math.max(1, Number(opt.qty || 1));
    // Для опций единица обычно "шт", но может быть в названии
    // Формат: количествоединица название (например "1шт картофельное пюре")
    return `${optQty}шт ${name}`;
  }

  // Форматирование товара заказа - вынесено в глобальную область для использования в bottom sheet
  window.formatOrderItem = function formatOrderItem(item) {
    // Комбо: тот же формат, что в корзине и в админке — название комбо и вложенный состав без позиций с 0
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
          const productName = str(sel.product_name || "—").trim();
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
            if (!Number.isFinite(numQty) || numQty <= 0) return; // не показываем значения с 0
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

    // Обычный товар: используем формат как в корзине, но сразу раскрытый
    const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
    const mainPhoto = photos[0] || "/static/img/placeholder.png";
    
    // Формируем элементы в правильном порядке: варианты → опции → варианты опций → ингредиенты
    const variantParts = [];
    const optionParts = [];
    const ingredientParts = [];
    
    // 1. Варианты товара (первыми)
    if (item.variants && Array.isArray(item.variants) && item.variants.length > 0) {
      item.variants.forEach(v => {
        if (v.label || v.value) {
          const groupTitle = str(v.group_title || "Вариант");
          const variantValue = str(v.label || v.value || "");
          // Формат: значение название_группы (например "200г порц")
          const formatted = `${variantValue} ${groupTitle}`.trim();
          if (formatted) variantParts.push(formatted);
        }
      });
    }
    
    // 2. Опции (вторыми)
    if (item.options && Array.isArray(item.options) && item.options.length > 0) {
      item.options.forEach(opt => {
        if (Number(opt.qty ?? opt.quantity ?? 0) <= 0) return; // Не показываем опции с нулевым количеством
        const formatted = formatOption({
          title: opt.title || opt.name,
          qty: opt.qty || opt.quantity,
          variant_label: opt.variant_label || opt.variantLabel
        });
        if (formatted) optionParts.push(formatted);
      });
    }
    
    // 3. Ингредиенты (третьими)
    if (item.ingredients && Array.isArray(item.ingredients) && item.ingredients.length > 0) {
      item.ingredients.forEach(ing => {
        // Поддерживаем оба формата: ing.name и ing.ingredient_name
        // В JSON из БД используется ing.name
        const ingredientName = ing.ingredient_name || ing.name || ing.ingredientName;
        if (!ingredientName) return; // Пропускаем если нет названия
        
        const quantity = ing.quantity ?? ing.qty ?? 1;
        if (Number(quantity) <= 0) return; // Не показываем позиции с нулевым количеством
        // Единицы измерения могут быть в разных полях
        // В JSON из БД единицы могут отсутствовать, используем "г" по умолчанию для весовых ингредиентов
        let unitLabel = ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "";
        
        // Если единица не указана, пытаемся определить по количеству
        // Если quantity > 10, вероятно это граммы
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
    
    // Объединяем все элементы
    const allParts = [...variantParts, ...optionParts, ...ingredientParts];
    
    // Создаем HTML как в корзине
    let html = `<div class="cart-row">`;
    
    // Фото
    html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
    
    // Средняя часть с названием и деталями
    html += `<div class="cart-mid">`;
    
    // Название товара с количеством (в конце, как в корзине)
    const itemQty = Number(item.qty || item.quantity || 1);
    const itemName = `${escapeHtml(item.name || "—")} × ${itemQty}`;
    html += `<div class="cart-title">${itemName}</div>`;
    
    // Детали (раскрытые сразу)
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
    
    // Правая часть с количеством и ценой
    html += `<div class="cart-right">`;
    html += `<div class="cart-price">${money(item.line_total || item.price || 0)}</div>`;
    html += `</div>`;
    
    html += `</div>`;
    
    return html;
  };

  // -----------------------------
  // Cart warmup: ensure products for all cart items are in cache
  // (чтобы корзина не зависела от текущей выбранной категории)
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
          // Если товар удалён или API недоступно — не падаем, просто пропускаем.
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

  // chip живёт для экрана адресов, но в корзине/оформлении он скрыт
  if (elAddressChip) {
    elAddressChip.textContent = line || "Введите адрес";
    elAddressChip.classList.toggle("chip-plus", !line);
    elAddressChip.title = line || "";
  }

  // если сейчас открыт режим корзины/оформления — обновим заголовок адресом
  const headerEl = document.querySelector(".shop-cart-header");
  const isAddrTitle = !!headerEl && headerEl.classList.contains("is-address-title");
  const isCartLike = cartViewMode === "cart" || cartViewMode === "checkout";

  if (isCartLike && isAddrTitle && elCartHeaderTitle) {
    // важно: не просто textContent, а “адрес + стрелка”
    const t = line || "Введите адрес";
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

  // адрес вместо заголовка (корзина/оформление)
  addressAsTitle = false,

  // NEW: крестик закрытия (для экрана адресов)
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
      // “адрес + стрелка”
      elCartHeaderTitle.innerHTML = `
        <span class="shop-cart-header-title-text"></span>
        <i class="fas fa-chevron-right shop-cart-header-title-arrow" aria-hidden="true"></i>
      `;
      const textEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-text");
      if (textEl) textEl.textContent = title;

      elCartHeaderTitle.classList.add("is-clickable-address-title");
    } else {
      // обычный текст
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

  // режим “адрес как заголовок”
  if (headerEl) headerEl.classList.toggle("is-address-title", !!addressAsTitle);
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("is-address-title", !!addressAsTitle);
}

function setSheetHeaderMode(mode, { onBack } = {}) {
  const header = document.querySelector(".app-modal-header");
  if (!header) return;

  // пробуем найти крестик (в разных сборках AppModal он может называться по-разному)
  const closeBtn =
    header.querySelector(".app-modal-close") ||
    header.querySelector("[data-modal-close]") ||
    header.querySelector("button[aria-label='Закрыть']") ||
    header.querySelector("button[aria-label='Close']") ||
    header.querySelector(".modal-close") ||
    header.querySelector(".btn-close");

  // title (если есть отдельный элемент)
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

  // bind back handler (обновляем каждый раз)
  backBtn.onclick = () => {
    if (typeof onBack === "function") onBack();
  };

  const isProduct = mode === "product";
  const isOrder = mode === "order";

  // Product: показать ←/♡, скрыть ×, скрыть title
  // Order: показать ←, скрыть ♡, показать title
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

    // если открыта модалка checkout — обновим поле
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

  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCartContent) elCartContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");

  const line = getSelectedAddressLine();
  const t = line || "Введите адрес";

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
  const t = line || "Введите адрес";

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
  const t = line || "Введите адрес";

  setCartHeader({
    title: t,
    showAddressChip: false,     // IMPORTANT: чип убираем
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: false,
    addressAsTitle: false,      // IMPORTANT: без стрелки тут
    showClose: true,            // крестик справа
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
  const t = line || "Введите адрес";

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
    title: "Точка самовывоза",
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

  // Product mode (desktop header): ← слева, ♡ справа, title+chip скрыть
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
      // не блокируем интерфейс
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
              alert("Не удалось изменить основной адрес");
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
          // уже выбран (и скорее всего default) — просто закрываем
          if (state.selectedAddress && state.selectedAddress.id && Number(state.selectedAddress.id) === Number(a.id)) {
            backAfterAddressSelection();
            return;
          }
          try {
            await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
            await refreshAddressState();
            backAfterAddressSelection();
          } catch (e) {
            alert("Не удалось выбрать адрес");
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

    // Получаем список точек из глобальной переменной pickupStores (заполняется в buildCheckoutForm)
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
        window._selectedPickupStoreId = Number(store.id);

        // Обновляем поле в форме чекаута
        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }

        // Возвращаемся в чекаут
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

  // chip (если он есть) — пусть работает как fallback
  if (elAddressChip) {
    elAddressChip.addEventListener("click", async () => {
      await openAddressFlow("cart");
    });
  }

  // Главное: клик по заголовку корзины (адресу)
  if (elCartHeaderTitle) {
    elCartHeaderTitle.addEventListener("click", async (e) => {
      // только корзина/оформление
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;
      e.preventDefault();
      e.stopPropagation();
      await openAddressFlow("cart");
    });
  }

  // Страховка: если заголовок перекрывается — ловим клик по всему хедеру корзины
  const cartHeader = document.querySelector(".shop-cart-header");
  if (cartHeader) {
    cartHeader.addEventListener("click", async (e) => {
      // только корзина/оформление
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;

      // открываем только если клик был в зоне заголовка
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

  // + Новый адрес
  if (elAddressNewBtn) {
    elAddressNewBtn.addEventListener("click", () => showAddressFormView(null, null, "list"));
  }

  // Отмена
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

  // Сохранить
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
      elAddressSaveBtn.textContent = "Сохраняем…";

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

          // после сохранения — вернёмся назад
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
        alt: ''
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
      const offset = headerH + chipsH + 50;
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

    const wrapRect = wrap.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const visibleLeft = wrapRect.left;
    const visibleRight = wrapRect.right;
    const paddingLeft = 12;

    const target = Math.max(0, chip.offsetLeft - paddingLeft);
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
      offset = headerH + chipsH + 50;
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
  }

  function bindCategoryScrollSpy() {
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
    btnMinus.textContent = "—";
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

  // Кэш для рассчитанных цен по умолчанию
  const defaultPriceCache = new Map();

  /**
   * Рассчитывает цену товара с учётом варианта и опций по умолчанию
   */
  async function calculateDefaultPrice(product) {
    const productId = product.id;
    
    // Проверяем кэш
    if (defaultPriceCache.has(productId)) {
      return defaultPriceCache.get(productId);
    }

    let price = Number(product.price || 0);

    try {
      // Загружаем варианты
      const variants = await resolveProductVariants(productId);
      
      // Если есть варианты, берём цену варианта по умолчанию (индивидуальный или групповой)
      if (variants.length > 0 && variants[0].values?.length > 0) {
        const variant = variants[0];
        // Используем default_value_index (индивидуальный или групповой), если задан, иначе 0
        const defaultIndex = variant.default_value_index != null 
          ? Number(variant.default_value_index) 
          : 0;
        // Проверяем что индекс валидный
        const validIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
        const variantState = {
          selectedIndex: validIndex,
          value: variant.values[validIndex],
          label: String(variant.values[validIndex]),
        };
        price = getVariantUnitPrice(product, variants, variantState);
      }

      // Загружаем опции
      const optionGroups = await resolveProductOptionGroups(productId);
      
      // Добавляем стоимость обязательных опций по умолчанию
      for (const group of optionGroups) {
        const groupType = getOptionGroupUiType(group);
        
        if (groupType === "single" && group.is_required && group.items?.length > 0) {
          // Для single с is_required — берём первый элемент как дефолтный
          const defaultItem = group.items[0];
          if (defaultItem?.price) {
            price += Number(defaultItem.price || 0);
          }
        } else if (groupType === "multiple_item" || groupType === "multiple_group") {
          // Для multiple — добавляем все элементы с qty_min > 0
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

    // Сохраняем в кэш
    price = roundPrice(price);
    defaultPriceCache.set(productId, price);
    return price;
  }

  /**
   * Асинхронно обновляет цену на карточке товара
   */
  async function updateCardPrice(card, product) {
    const qty = cartQty(product.id);
    const calculatedPrice = await calculateDefaultPrice(product);
    
    const center = card.querySelector(".qty-pill__center");
    if (center) {
      center.innerHTML = catalogCenterHtml(product, qty, calculatedPrice);
    }
  }

  // -----------------------------
  // Products (КАРТОЧКИ НЕ ТРОГАЮ)
  // -----------------------------
  function renderProducts() {
    elProductsGrid.innerHTML = "";

    const categories = getVisibleCategories();
    let totalProducts = 0;

    categories.forEach((c) => {
      const header = document.createElement("div");
      header.className = "shop-category-header";
      header.setAttribute("data-cat-id", String(c.id));
      header.setAttribute("data-cat-title", str(c.title));
      header.textContent = str(c.title);
      elProductsGrid.appendChild(header);

      const products = state.productsByCategory.get(Number(c.id)) || [];
      totalProducts += products.length;

      products.forEach((p) => {
      const id = p.id;
      const qty = cartQty(id);
      const available = isProductAvailable(p);
      const photos = safePhotos(p);
      const mainPhoto = photos[0] || "";

      const card = document.createElement("article");
      card.className = "sp-card";
      card.setAttribute("data-product-id", String(id));
      card.setAttribute("data-qty", String(qty));
      if (qty > 0) card.classList.add("is-in-cart");

      const media = document.createElement("div");
      media.className = "sp-media";

      const img = createOptimizedImage(mainPhoto || "/static/img/placeholder.png", {
        type: 'product-grid',
        className: 'sp-img',
        alt: ''
      });
      media.appendChild(img);

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
        // Всегда открываем карточку товара при нажатии +, если доступен
        if (!available) return;
        await openProductDetails(id);
      });

      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(id, -1);
      });

      card.addEventListener("click", () => openProductDetails(id));

      elProductsGrid.appendChild(card);
      applyCardState(card, p, qty, null);
      
      // Если с бэкенда не пришёл display_price — асинхронно подгружаем варианты и обновляем цену
      if (p.display_price == null) updateCardPrice(card, p);
      });

      // Карточки комбо-наборов в этой категории
      const combos = state.combosByCategory.get(Number(c.id)) || [];
      combos.forEach((combo) => {
        const card = document.createElement("article");
        card.className = "sp-card sp-card--combo";
        card.setAttribute("data-combo-id", String(combo.id));

        const media = document.createElement("div");
        media.className = "sp-media sp-media--combo";

        const gridPhotos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
        const singleImage = (combo.image_url || "").trim();
        // Порядок фото в сетке 2×2: ячейки 0,1,2,3 → фото 1, 3, 4, 2 (индексы 0, 2, 3, 1)
        const comboGridOrder = [0, 2, 3, 1];

        if (singleImage) {
          const img = createOptimizedImage(singleImage, { type: "product-grid", className: "sp-img", alt: "" });
          media.appendChild(img);
        } else if (gridPhotos.length > 0) {
          const grid = document.createElement("div");
          grid.className = "sp-combo-grid";
          for (let i = 0; i < 4; i++) {
            const cell = document.createElement("div");
            cell.className = "sp-combo-grid__cell";
            const src = gridPhotos[comboGridOrder[i]] || "";
            if (src) {
              const img = createOptimizedImage(src, { type: "product-grid", className: "sp-img", alt: "" });
              cell.appendChild(img);
            } else {
              cell.classList.add("sp-combo-grid__cell--empty");
            }
            grid.appendChild(cell);
          }
          media.appendChild(grid);
        } else {
          const img = createOptimizedImage("/static/img/placeholder.png", { type: "product-grid", className: "sp-img", alt: "" });
          media.appendChild(img);
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
        btn.innerHTML = `<span class="sp-combo-btn__text">От ${moneyNoSign(minPrice)} ₽</span><span class="sp-combo-btn__arrow" aria-hidden="true">→</span>`;
        bottom.appendChild(btn);
        info.appendChild(bottom);
        card.appendChild(info);

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openComboDetails(combo.id);
        });
        card.addEventListener("click", (e) => {
          if (!e.target.closest(".sp-combo-btn")) openComboDetails(combo.id);
        });

        elProductsGrid.appendChild(card);
        totalProducts += 1;
      });
    });

    if (elProductsEmpty) {
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
        // Используем кэшированную цену если есть
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
          nameLine.textContent = "1 × " + (productName || "—");
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
          minusEnabled: qty > 1,
          plusEnabled: true,
        });
        const updateComboQty = () => {
          const cartItem = state.cart.find((x) => x.key === key);
          const newQty = Math.max(1, Number(cartItem?.qty || 0));
          center.textContent = String(newQty);
          btnMinus.classList.toggle("is-disabled", newQty <= 1);
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
          // Мобилка: синхронизируем сумму в кнопке "Оформить"
          const isMobile = window.matchMedia("(max-width: 768px)").matches;
          if (isMobile && elMobileCartTotal) {
            elMobileCartTotal.textContent = money(newTotal);
          }
        });
        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem || Number(cartItem.qty || 0) <= 1) return;
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
          // Мобилка: синхронизируем сумму в кнопке "Оформить"
          const isMobile = window.matchMedia("(max-width: 768px)").matches;
          if (isMobile && elMobileCartTotal) {
            elMobileCartTotal.textContent = money(newTotal);
          }
        });
        if (qty <= 1) btnMinus.classList.add("is-disabled");
        q.appendChild(pill);
        mid.appendChild(q);
        row.appendChild(mid);

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
        row.appendChild(right);

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

      // Свайп-контейнер
      const swipeContainer = document.createElement("div");
      swipeContainer.className = "cart-swipe-container";
      swipeContainer.setAttribute("data-cart-key", String(key || ""));

      // Кнопки действий (за карточкой)
      const swipeActions = document.createElement("div");
      swipeActions.className = "cart-swipe-actions";

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "cart-swipe-btn cart-swipe-fav";
      favBtn.innerHTML = '<i class="fas fa-heart"></i>';
      favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Заглушка для избранного
        showToast("Добавлено в избранное");
        favBtn.classList.toggle("is-active");
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);
        // Сбросить свайп
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
        // Удалить с анимацией
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

      // Основное содержимое карточки
      const row = document.createElement("div");
      row.className = "cart-row cart-swipe-content";
      row.setAttribute("data-product-id", String(product.id));
      row.setAttribute("data-cart-key", String(key || ""));
      row.addEventListener("click", (e) => {
        // Не открывать если свайп активен
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
        alt: ''
      });
      row.appendChild(img);

      const mid = document.createElement("div");
      mid.className = "cart-mid";

      const t = document.createElement("div");
      t.className = "cart-title";
      t.textContent = `${str(product.name)} × ${qty}`;
      mid.appendChild(t);

      // Формируем элементы в правильном порядке: варианты → ингредиенты → опции
      const variantParts = [];
      const ingredientParts = [];
      const optionParts = [];
      
      // 1. Варианты (первыми)
      if (variantLabel && variantLabel.trim() && !variantLabel.match(/^Вариант:\s*$/)) {
        const formatted = formatVariant(variantLabel);
        if (formatted) variantParts.push(formatted);
      }
      
      // 2. Ингредиенты (вторыми) — не показываем с количеством 0
      if (Array.isArray(cartIngredients) && cartIngredients.length > 0) {
        cartIngredients.forEach(ing => {
          if (Number(ing.quantity ?? ing.qty ?? 0) <= 0) return;
          const formatted = formatIngredient(ing);
          if (formatted) ingredientParts.push(formatted);
        });
      }
      
      // 3. Опции (третьими) — не показываем с количеством 0
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
      
      // Объединяем все элементы
      const allParts = [...variantParts, ...ingredientParts, ...optionParts];
      
      // Создаем контейнер для описания (сразу развернутый)
      const subContainer = document.createElement("div");
      subContainer.className = "cart-sub-container";
      
      if (allParts.length > 0) {
        // Раскрытый список деталей (как в деталях заказа)
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
        // Если нет элементов, просто пустая строка
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
      mid.appendChild(q);
      row.appendChild(mid);

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

      // Десктопные кнопки действий
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

      row.appendChild(right);

      swipeContainer.appendChild(row);

      // Инициализация свайп-жестов
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
          subContainer.textContent = "Автодобавление";
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

  // ========== Свайп-функционал для корзины ==========
  let currentSwipedContainer = null;
  const SWIPE_THRESHOLD = 10; // px для начала свайпа
  const SWIPE_ACTIONS_WIDTH = 120; // ширина зоны кнопок
  const DELETE_THRESHOLD = 0.6; // 60% ширины для удаления

  function showToast(message) {
    // Удаляем предыдущий toast если есть
    const existing = document.querySelector(".shop-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "shop-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    // Показываем
    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    // Скрываем через 2 сек
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
      // Удаляем из корзины
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

      // Обновляем footer и кнопку оформления
      const items = cartItemsResolved();
      if (openCartSheetCtx) {
        if (openCartSheetCtx.footerEl) {
          openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        }
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          const total = computeCartTotals(items).total;
          if (tspan) tspan.textContent = money(total);
          // Синхронизируем с мобильными кнопками
          const isMobile = window.matchMedia("(max-width: 768px)").matches;
          if (isMobile && elMobileCartTotal) {
            elMobileCartTotal.textContent = money(total);
          }
          if (isMobile && elMobileCheckoutBtn) {
            elMobileCheckoutBtn.disabled = items.length === 0;
          }
        }
        if (openCartSheetCtx.totalEl) {
          openCartSheetCtx.totalEl.textContent = money(computeCartTotals(items).total);
        }
        // Если корзина пуста - показать сообщение
        if (items.length === 0 && openCartSheetCtx.listEl) {
          openCartSheetCtx.listEl.innerHTML = '<div class="shop-cart-empty-sheet">В корзине пусто</div>';
        }
      }

      // Мобилка: скрыть нижние кнопки корзины, если корзина пуста
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions) {
        if (items.length === 0) {
          elMobileCartActions.classList.add("hidden");
          if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
          if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
        }
      }

      // Обновляем десктоп корзину
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
      
      // Сбросить другие свайпы
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

      // Определяем направление при первом движении
      if (isHorizontal === null && (Math.abs(deltaX) > SWIPE_THRESHOLD || Math.abs(deltaY) > SWIPE_THRESHOLD)) {
        isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      // Если вертикальное движение - не перехватываем
      if (isHorizontal === false) return;

      // Если горизонтальное - свайпаем
      if (isHorizontal === true) {
        isDragging = true;
        
        let newX = currentX + deltaX;
        
        // Ограничения: не больше вправо чем 0, не больше влево чем 60% ширины
        const maxLeft = -containerWidth() * DELETE_THRESHOLD;
        newX = Math.max(maxLeft, Math.min(20, newX)); // небольшой bounce вправо
        
        content.style.transform = `translateX(${newX}px)`;

        // Haptic при достижении порога удаления
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
        // Удаляем
        if (navigator.vibrate) navigator.vibrate(20);
        deleteCartItemWithAnimation(container, productId, cartKey);
      } else if (finalX < -SWIPE_ACTIONS_WIDTH / 2) {
        // Фиксируем на кнопках
        content.style.transform = `translateX(-${SWIPE_ACTIONS_WIDTH}px)`;
        container.classList.add("is-swiped");
        currentSwipedContainer = container;
      } else {
        // Возвращаем назад
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

  // Сброс свайпа при клике вне карточки
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
  }

function updateCartBadge() {
  const n = cartCountTotal();

  // мобильный badge
  if (elNavCartBadge) {
    elNavCartBadge.textContent = String(n);
    if (n > 0) elNavCartBadge.classList.remove("hidden");
    else elNavCartBadge.classList.add("hidden");
  }

  // если есть desktop badge (опционально)
  if (elCartOpenDesktop) {
    const b = $("#shopCartBadge", elCartOpenDesktop);
    if (b) {
      b.textContent = String(n);
      if (n > 0) b.classList.remove("hidden");
      else b.classList.add("hidden");
    }
  }

  // bounce только когда количество увеличилось
  const prev = window.__lastCartCountForNav || 0;
  if (n > prev) bounceCartNav();
  window.__lastCartCountForNav = n;
}

  function clearCartAll() {
    state.cart = [];
    clearAllAutoAddDismissed();
    applyAutoAddRules();
    saveCart();
    renderProducts();
    renderCart();
    updateCartBadge();

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
    }

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
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
      btn.textContent = "Очистить корзину?";
      btn.title = "Очистить корзину?";
      btn.setAttribute("aria-label", "Очистить корзину?");
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

  // -----------------------------
  // Qty change
  // -----------------------------
  function changeQty(productId, delta, optionalCartNumEl, cartKey) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return;

    const wasEmpty = cartCountTotal() === 0;

    const p = state.productCache.get(pid);
    if (delta > 0 && p && !isProductAvailable(p)) return;

    const targetKey = cartKey || makeCartKey(pid, []);
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

    if (applyAutoAddRules()) {
      nextQty = Number(getCartItemByKey(targetKey)?.qty || 0);
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
    }
  }

  // -----------------------------
  // Category select + load
  // -----------------------------
  async function selectCategory(categoryId, title) {
    setActiveCategory(categoryId, title, { scroll: true });
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
   * Цена товара-опции с учётом выбранного варианта (внутри опции).
   * Универсально для любых единиц (кг/г, м/см и т.п.): используем конвертацию как для основного варианта товара.
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

    // Если не удалось посчитать через товар/конвертацию — используем простую пропорцию от цены опции
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
    
    // Для конверсии через pcs используем ingredient_pcs_factor если есть
    // Проверяем через код единицы, так как нет доступа к списку единиц с кодами
    // Вместо этого используем общую конверсию через getConversionFactor
    
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

  async function refreshShopData() {
    const statusEl = document.getElementById("shopToolbarStatus");
    const showStatus = (text) => {
      if (statusEl) {
        statusEl.textContent = text || "";
        statusEl.classList.toggle("hidden", !text);
      }
    };
    showStatus("Обновление…");
    try {
      await loadCategories();
      await loadUnitConversions();
      renderCategories();
      renderCategoryChips();
      updateStoreStatus();
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
      await loadProductsByCategory();
      await loadAutoAdd();
      if (applyAutoAddRules()) saveCart();
      renderProducts();
      renderCart();
      updateCartBadge();
      await warmupCartProducts();
      renderCart();
      updateCartBadge();
    } finally {
      showStatus("");
    }
  }

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
          const entry = { id: item.id, title: item.title, price: getPriceWithVariant(item, itemId), qty: 1 };
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
            const entry = { id: item.id, title: item.title, price: getPriceWithVariant(item, itemId), qty: 1 };
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
            const entry = { id: item.id, title: item.title, price: getPriceWithVariant(item, itemId), qty };
            const variant = getVariantData(itemId);
            if (variant) Object.assign(entry, variant);
            selectedItems.push(entry);
          }
        });
      }
    });
    return selectedItems;
  }

async function resolveProductIngredients(productId) {
  try {
    const res = await fetch(`/api/public/products/${productId}/ingredients`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) return [];
    return Array.isArray(data.data) ? data.data : [];
  } catch (e) {
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
  try {
    const res = await apiJson(`/api/public/products/${productId}/variants`);
    const variants = Array.isArray(res.data) ? res.data : [];
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
  } catch (e) {
    console.error("Failed to load product variants:", e);
    return [];
  }
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
    qtyPill,
    onQtyMinus,
    onQtyPlus,
    onQtyCenterClick,
    setDefaultVariantForOptionItem = () => {},
  } = {}
) {
  const wrap = document.createElement("div");
  wrap.className = "shop-pd";

  const scroll = document.createElement("div");
  scroll.className = "shop-pd-scroll";

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
    alt: ''
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

    const setSelectedIndex = (idx) => {
      variantState.selectedIndex = idx;
      variantState.value = values[idx];
      variantState.label = formatValueLabel(values[idx]);
      valuesWrap.querySelectorAll("[data-variant-index]").forEach((btn) => {
        const buttonIndex = Number(btn.dataset.variantIndex);
        btn.classList.toggle("is-selected", buttonIndex === idx);
      });
      if (typeof onVariantChange === "function") {
        onVariantChange();
      }
    };

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
      btn.addEventListener("click", () => setSelectedIndex(idx));
      valuesWrap.appendChild(btn);
    });

    variantWrap.appendChild(valuesWrap);
    scroll.appendChild(variantWrap);

    // Инициализируем выбранный вариант: используем default_value_index из API (индивидуальный или групповой)
    if (Number.isFinite(variantState.selectedIndex) && !variantState.label) {
      setSelectedIndex(variantState.selectedIndex);
    } else if (!Number.isFinite(variantState.selectedIndex) && values.length) {
      // Используем default_value_index (индивидуальный или групповой), если задан, иначе 0
      const defaultIndex = variantGroup.default_value_index != null 
        ? Number(variantGroup.default_value_index) 
        : 0;
      // Проверяем что индекс валидный
      const validIndex = defaultIndex >= 0 && defaultIndex < values.length ? defaultIndex : 0;
      setSelectedIndex(validIndex);
    }
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
        };
        const closeList = () => {
          list.classList.add("hidden");
          slotWrap.classList.remove("hidden");
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
            card.style.flexDirection = "column";
            card.style.alignItems = "stretch";
          }

          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";
          cardContent.style.display = "flex";
          cardContent.style.alignItems = "center";
          cardContent.style.width = "100%";
          cardContent.style.gap = "8px";

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
          firstLine.style.display = "flex";
          firstLine.style.alignItems = "center";
          firstLine.style.gap = "4px";
          
          let variantLabelEl = null;
          if (selected && hasVariants) {
            variantLabelEl = document.createElement("span");
            variantLabelEl.style.fontSize = "inherit";
            variantLabelEl.style.fontWeight = "inherit";
            variantLabelEl.style.color = "inherit";
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

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const allowVariants = Boolean(group.allow_variants);
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          if (hasVariants) card.classList.add("has-variants");

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

          const gearIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
          const checkIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>`;

          const setGearState = (open) => {
            accordionOpen = !!open;
            if (!gearBtn || !variantAccordion) return;
            variantAccordion.style.display = accordionOpen ? "block" : "none";
            gearBtn.innerHTML = accordionOpen ? checkIcon : gearIcon;
            gearBtn.classList.toggle("is-open", accordionOpen);
            gearBtn.style.color = accordionOpen ? "var(--accent-color, #ff7a00)" : "var(--text-muted, #888)";
          };

          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = gearIcon;
            gearBtn.style.cssText = `
              background: none;
              border: none;
              padding: 4px;
              cursor: pointer;
              color: var(--text-muted, #888);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              transition: color 0.2s, transform 0.2s;
            `;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (accordionOpen) {
                // Галочка: подтверждаем выбор варианта, выбираем товар и закрываем оба аккордеона
                const currentVariant = groupState.variantByItemId.get(itemId);
                if (currentVariant) {
                  // Выбираем товар с выбранным вариантом
                  groupState.selectedId = itemId;
                  // Закрываем аккордеон с вариантами
                  setGearState(false);
                  // Закрываем список товаров
                  closeList();
                  // Обновляем отображение
                  renderSlot();
                  // Уведомляем об изменении
                  if (typeof onSelectionChange === "function") onSelectionChange();
                } else {
                  // Если вариант не выбран, просто закрываем аккордеон
                  setGearState(false);
                }
              } else {
                // Шестерёнка: открываем аккордеон с вариантами
                setGearState(true);
              }
            });

            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";
            variantAccordion.style.cssText = `
              display: none;
              width: 100%;
              padding: 8px 0 0 0;
              margin-top: 8px;
              border-top: 1px solid var(--border-color, #eee);
            `;

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
                variant_group_id: Number(variantGroup.variant_group_id),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              if (selectedIdx === idx) {
                variantBtn.style.background = "var(--accent-color, #ff7a00)";
                variantBtn.style.color = "#fff";
                variantBtn.style.borderColor = "var(--accent-color, #ff7a00)";
              }

              variantBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(value),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });

                // Мгновенно обновляем цену и вариант в карточке
                if (priceEl) {
                  const base = Number(item.price || 0);
                  const diff = Number.isFinite(priceDiff) ? priceDiff : 0;
                  priceEl.textContent = money(base + diff);
                }

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
                });

                // Обновляем вариант в первой строке (вариант + название)
                if (variantLabelEl) {
                  variantLabelEl.textContent = formatValueLabel(value) + " ";
                }

                // Если это текущая выбранная опция — обновим summary-карточку тоже
                if (Number(groupState.selectedId) === itemId) {
                  renderSlot();
                }
                if (typeof onSelectionChange === "function") onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            variantAccordion.appendChild(variantScroll);
            row.appendChild(gearBtn);
          }

          card.appendChild(row);
          if (variantAccordion) card.appendChild(variantAccordion);

          // Выбор товара (клик по карточке) — но не по шестерёнке/вариантам
          card.addEventListener("click", (e) => {
            if (e.target.closest(".shop-pd-option-gear-btn") || e.target.closest(".shop-pd-option-variant-accordion")) {
              return;
            }
            groupState.selectedId = itemId;
            // Сразу выставляем дефолтный вариант у опции с вариантами, чтобы цена отображалась верно
            if (hasVariants && typeof setDefaultVariantForOptionItem === "function") setDefaultVariantForOptionItem(item, groupState.variantByItemId);
            renderSlot();
            closeList();
            if (typeof onSelectionChange === "function") onSelectionChange();
          });

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

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const isSelected = groupState.selectedIds.has(itemId);
          
          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;
          
          const card = document.createElement("div");
          card.className = `shop-pd-option-card is-clickable ${isSelected ? "is-selected" : ""}`;
          if (hasVariants) {
            card.classList.add("has-variants");
            card.style.flexDirection = "column";
            card.style.alignItems = "stretch";
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
          
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = isSelected;
          checkbox.style.marginRight = "8px";
          checkbox.style.flexShrink = "0";
          
          // Элементы для обновления
          let priceEl = null;
          let variantLabelEl = null;
          
          const updateCard = () => {
            const newIsSelected = groupState.selectedIds.has(itemId);
            card.classList.toggle("is-selected", newIsSelected);
            checkbox.checked = newIsSelected;
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
          
          checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
            const { count } = updateSelectedCount();
            const maxReached = maxSelect != null && count >= maxSelect && !checkbox.checked;
            
            if (maxReached) {
              checkbox.checked = false;
              return;
            }

            if (checkbox.checked) {
              groupState.selectedIds.add(itemId);
              // Сразу выставляем дефолтный вариант у опции с вариантами, чтобы цена отображалась верно
              if (hasVariants && typeof setDefaultVariantForOptionItem === "function") setDefaultVariantForOptionItem(item, groupState.variantByItemId);
            } else {
              groupState.selectedIds.delete(itemId);
            }
            
            updateCard();
            if (onSelectionChange) onSelectionChange();
          });

          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";
          cardContent.style.display = "flex";
          cardContent.style.alignItems = "center";
          cardContent.style.width = "100%";
          cardContent.style.gap = "8px";

          cardContent.appendChild(checkbox);

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
          infoWrap.style.flex = "1";
          infoWrap.style.minWidth = "0";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          firstLine.style.display = "flex";
          firstLine.style.alignItems = "center";
          firstLine.style.gap = "4px";
          
          if (hasVariants) {
            variantLabelEl = document.createElement("span");
            variantLabelEl.style.fontSize = "inherit";
            variantLabelEl.style.fontWeight = "inherit";
            variantLabelEl.style.color = "inherit";
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
            gearBtn.style.cssText = `
              background: none;
              border: none;
              padding: 4px;
              cursor: pointer;
              color: var(--text-muted, #888);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              transition: color 0.2s, transform 0.2s;
            `;
            cardContent.appendChild(gearBtn);

            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";
            variantAccordion.style.cssText = `
              display: none;
              width: 100%;
              padding: 8px 0 0 0;
              margin-top: 8px;
              border-top: 1px solid var(--border-color, #eee);
            `;

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";
            variantScroll.style.cssText = `
              display: flex;
              gap: 8px;
              overflow-x: auto;
              overflow-y: hidden;
              padding-bottom: 4px;
              -webkit-overflow-scrolling: touch;
              scrollbar-width: none;
              cursor: grab;
            `;

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
                variant_group_id: Number(variantGroup.variant_group_id),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              variantBtn.style.cssText = `
                flex-shrink: 0;
                padding: 6px 12px;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 16px;
                background: var(--bg-secondary, #f5f5f5);
                color: var(--text-primary, #333);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
              `;
              
              if (selectedIdx === idx) {
                variantBtn.style.background = "var(--accent-color, #ff7a00)";
                variantBtn.style.color = "#fff";
                variantBtn.style.borderColor = "var(--accent-color, #ff7a00)";
              }

              variantBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(value),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });

                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  const isSelected = btnIdx === idx;
                  btn.classList.toggle("is-selected", isSelected);
                  if (isSelected) {
                    btn.style.background = "var(--accent-color, #ff7a00)";
                    btn.style.color = "#fff";
                    btn.style.borderColor = "var(--accent-color, #ff7a00)";
                  } else {
                    btn.style.background = "var(--bg-secondary, #f5f5f5)";
                    btn.style.color = "var(--text-primary, #333)";
                    btn.style.borderColor = "var(--border-color, #ddd)";
                  }
                });

                updateCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            variantAccordion.appendChild(variantScroll);

            const gearIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            const checkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`;
            let accordionOpen = false;
            gearBtn.innerHTML = gearIcon;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              variantAccordion.style.display = accordionOpen ? "block" : "none";
              gearBtn.innerHTML = accordionOpen ? checkIcon : gearIcon;
              gearBtn.classList.toggle("is-open", accordionOpen);
              gearBtn.style.color = accordionOpen ? "var(--accent-color, #ff7a00)" : "var(--text-muted, #888)";
            });
          }

          card.appendChild(cardContent);
          
          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          card.addEventListener("click", (e) => {
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
              groupState.selectedIds.add(itemId);
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
          const itemMin = item.qty_min ?? 1;
          const itemMax = item.qty_max ?? 1;
          // Текущее количество из state
          const currentQty = groupState.qtyById.get(itemId) || 0;
          const isSelected = currentQty > 0;
          
          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = `shop-pd-option-card ${isSelected ? "is-selected" : ""}`;

          const qtyControls = document.createElement("div");
          qtyControls.className = "shop-pd-option-qty-controls";
          qtyControls.style.display = "flex";
          qtyControls.style.gap = "8px";
          qtyControls.style.alignItems = "center";
          qtyControls.style.marginLeft = "auto";

          const btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.className = "btn btn-sm";
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
          btnPlus.className = "btn btn-sm";
          btnPlus.textContent = "+";
          btnPlus.disabled = currentQty >= itemMax;
          btnPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = groupState.qtyById.get(itemId) || 0;
            let newQty;
            if (current === 0) {
              // Если сейчас 0, ставим минимум (но не меньше 1)
              newQty = Math.max(itemMin, 1);
            } else {
              newQty = Math.min(itemMax, current + 1);
            }
            groupState.qtyById.set(itemId, newQty);
            if (newQty > 0 && hasVariants && typeof setDefaultVariantForOptionItem === "function") setDefaultVariantForOptionItem(item, groupState.variantByItemId);
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

          const updateItemCard = () => {
            const newQty = groupState.qtyById.get(itemId) || 0;
            const newIsSelected = newQty > 0;
            card.classList.toggle("is-selected", newIsSelected);
            qtyDisplay.textContent = String(newQty);
            // Кнопка "-" отключена если qty <= itemMin (обязательные опции нельзя убрать)
            btnMinus.disabled = newQty <= itemMin;
            btnPlus.disabled = newQty >= itemMax;
            
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
          infoWrap.style.flex = "1";
          infoWrap.style.minWidth = "0";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          firstLine.style.display = "flex";
          firstLine.style.alignItems = "center";
          firstLine.style.gap = "4px";
          
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
            gearBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            gearBtn.style.cssText = `
              background: none;
              border: none;
              padding: 4px;
              cursor: pointer;
              color: var(--text-muted, #888);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              transition: color 0.2s, transform 0.2s;
            `;
            
            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";
            variantAccordion.style.cssText = `
              display: none;
              width: 100%;
              padding: 8px 0 0 0;
              margin-top: 8px;
              border-top: 1px solid var(--border-color, #eee);
            `;

            // Горизонтальный скролл с вариантами
            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";
            variantScroll.style.cssText = `
              display: flex;
              gap: 8px;
              overflow-x: auto;
              overflow-y: hidden;
              padding-bottom: 4px;
              -webkit-overflow-scrolling: touch;
              scrollbar-width: none;
              cursor: grab;
            `;
            variantScroll.style.setProperty("-ms-overflow-style", "none");

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
                variant_group_id: Number(variantGroup.variant_group_id),
                variant_value_index: defaultIdx,
                variant_label: formatValueLabel(values[defaultIdx]),
                variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
              });
            }

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              variantBtn.style.cssText = `
                flex-shrink: 0;
                padding: 6px 12px;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 16px;
                background: var(--bg-secondary, #f5f5f5);
                color: var(--text-primary, #333);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
              `;
              
              if (selectedIdx === idx) {
                variantBtn.style.background = "var(--accent-color, #ff7a00)";
                variantBtn.style.color = "#fff";
                variantBtn.style.borderColor = "var(--accent-color, #ff7a00)";
              }

              variantBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                
                // Обновляем выбранный вариант в state
                const unitPrice = getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                
                groupState.variantByItemId.set(itemId, {
                  variant_group_id: Number(variantGroup.variant_group_id),
                  variant_value_index: idx,
                  variant_label: formatValueLabel(value),
                  variant_price_diff: Number.isFinite(priceDiff) ? priceDiff : 0,
                });

                // Обновляем UI всех кнопок вариантов
                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  const isSelected = btnIdx === idx;
                  btn.classList.toggle("is-selected", isSelected);
                  if (isSelected) {
                    btn.style.background = "var(--accent-color, #ff7a00)";
                    btn.style.color = "#fff";
                    btn.style.borderColor = "var(--accent-color, #ff7a00)";
                  } else {
                    btn.style.background = "var(--bg-secondary, #f5f5f5)";
                    btn.style.color = "var(--text-primary, #333)";
                    btn.style.borderColor = "var(--border-color, #ddd)";
                  }
                });

                // Обновляем карточку (цена, лейбл варианта)
                updateItemCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            variantAccordion.appendChild(variantScroll);

            // Обработчик клика на шестерёнку (⚙️ ↔ ✓)
            const gearIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            const checkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`;
            let accordionOpen = false;
            gearBtn.innerHTML = gearIcon;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              variantAccordion.style.display = accordionOpen ? "block" : "none";
              gearBtn.innerHTML = accordionOpen ? checkIcon : gearIcon;
              gearBtn.classList.toggle("is-open", accordionOpen);
              gearBtn.style.color = accordionOpen ? "var(--accent-color, #ff7a00)" : "var(--text-muted, #888)";
            });

            cardContent.appendChild(gearBtn);
          }

          cardContent.appendChild(qtyControls);
          card.appendChild(cardContent);
          
          // Добавляем аккордеон после основного контента
          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          // Стиль карточки для flex-direction: column когда есть аккордеон
          if (hasVariants) {
            card.style.flexDirection = "column";
            card.style.alignItems = "stretch";
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
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const state = ingredientState?.get(ingId) || {
        quantity: Number(ing.quantity ?? 1),
      };

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
        btnPlus.disabled = currentQty >= max;

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
          const currentStateQty = state.quantity ?? currentQty;
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
            state.quantity = newQty;
            ingredientState?.set(ingId, state);
            onIngredientChange();
          }
        });

        btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          const currentStateQty = state.quantity ?? currentQty;
          let newQty = currentStateQty + step;
          // Округляем до шага (относительно min)
          if (step > 0) {
            const stepsFromMin = Math.round((newQty - min) / step);
            newQty = min + (stepsFromMin * step);
          }
          // Ограничиваем min/max
          newQty = Math.max(min, Math.min(max, newQty));
          if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
            state.quantity = newQty;
            ingredientState?.set(ingId, state);
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

  return { wrap, actionBtn, qtyWrap, basePriceEl: null };
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
    alt: product.title || ""
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
  favBtn.innerHTML = '<i class="far fa-heart"></i>';

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


async function renderProductDetailsInto(container, product, { onBack, cartKey } = {}) {
  if (!container) return;
  container.innerHTML = "";

  const optionGroups = await resolveProductOptionGroups(product.id);
  const ingredients = await resolveProductIngredients(product.id);
  const variants = await resolveProductVariants(product.id);
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
  const editMode = !!editingItem;
  const available = isProductAvailable(product);

  if (editMode && editingItem && Number.isFinite(Number(editingItem.variant_value_index))) {
    const targetGroupId = Number(editingItem.variant_group_id);
    if (Number.isFinite(targetGroupId)) {
      variantState.groupId = targetGroupId;
    }
    variantState.selectedIndex = Number(editingItem.variant_value_index);
    variantState.label = str(editingItem.variant_label || "");
  }

  // Restore ingredient quantities from cart if editing
  if (editMode && editingItem && Array.isArray(editingItem.ingredients)) {
    editingItem.ingredients.forEach(cartIng => {
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
  let qty = editMode ? Math.max(1, Number(editingItem?.qty || 1)) : 1;

  // предзаполнение опций из корзины (как было)
  const editOptionIds = new Set((editingItem?.option_item_ids || []).map(Number).filter(Number.isFinite));
  const editOptionQty = new Map();
  (editingItem?.option_items || []).forEach((opt) => {
    const id = Number(opt?.id);
    if (!Number.isFinite(id)) return;
    const q = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
    editOptionQty.set(id, q);
  });

  // Варианты опций из корзины (для восстановления при редактировании)
  const editOptionVariants = new Map();
  (editingItem?.option_items || []).forEach((opt) => {
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
    const preselected = (editingItem?.option_item_ids || []).find((id) =>
      group.items.some((item) => Number(item.id) === Number(id))
    );

    const required = !!group.is_required; // NEW
    const fallback = required ? (group.items[0]?.id ?? null) : null;

    stateEntry.selectedId = preselected || fallback || null;
  } else if (type === "multiple_group") {
    group.items.forEach((item) => {
      if (editOptionIds.has(Number(item.id))) stateEntry.selectedIds.add(Number(item.id));
    });
  } else if (type === "multiple_item") {
    group.items.forEach((item) => {
      const id = Number(item.id);
      const itemMin = item.qty_min ?? 1;
      // В режиме редактирования берём сохранённое значение
      const savedQty = editOptionQty.get(id) || (editOptionIds.has(id) ? itemMin : 0);
      // Если qty_min > 0 — товар выбран по умолчанию с этим количеством
      const q = savedQty > 0 ? savedQty : (itemMin > 0 ? itemMin : 0);
      if (q > 0) stateEntry.qtyById.set(id, q);
    });
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

  let updateQtyUi = () => {
    if (qtyPill?.center) qtyPill.center.textContent = String(qty);
    // минус блокируем визуально на 1
    if (qtyPill?.btnMinus) {
      qtyPill.btnMinus.classList.toggle("is-disabled", qty <= 1 || !available);
    }
    if (qtyPill?.btnPlus) {
      qtyPill.btnPlus.classList.toggle("is-disabled", !available);
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

  let updateActionText = () => {
    if (!actionBtnRef) return;
    if (!available) {
      actionBtnRef.innerHTML = `<span class="shop-pd-action-label">Нет в наличии</span>`;
      actionBtnRef.disabled = true;
      return;
    }
    actionBtnRef.disabled = false;

    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionTotal = optionItemsTotal(selectedItems);
    const variantUnitPrice = getVariantUnitPrice(product, variants, variantState);
    const basePrice = Number(variantUnitPrice || 0) + optionTotal;
    const ingredientsPriceDiff = calculateIngredientPrice(); // Разница от базового состава
    const unitPrice = roundPrice(basePrice + ingredientsPriceDiff);

    // total = unit * qty
    const totalPrice = roundPrice(unitPrice * Number(qty || 1));

    // Новая структура: цена сверху, текст "в корзину" снизу
    actionBtnRef.innerHTML = `
      <span class="shop-checkout-total shop-pd-action-price">${money(totalPrice)}</span>
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
  };

  let ingredientsWrapRef = null;
  
  const onIngredientChange = () => {
    updateActionText();
    // Update ingredient prices in UI
    if (!ingredientsWrapRef) return;
    
    ingredients.forEach(ing => {
      const ingId = Number(ing.ingredient_id);
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
      if (btnPlus) btnPlus.disabled = currentQty >= max;
    });
  };

  const onQtyMinus = () => {
    if (!available) return;
    if (qty <= 1) return;
    qty -= 1;
    updateQtyUi();
    updateActionText();
  };

  const onQtyPlus = () => {
    if (!available) return;
    qty += 1;
    updateQtyUi();
    updateActionText();
  };

  const { wrap, actionBtn, basePriceEl } = buildProductDetailsContent(
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
      onSelectionChange: () => updateActionText(),
      onIngredientChange,
      onVariantChange: () => updateActionText(),
      qtyPill,
      onQtyMinus,
      onQtyPlus,
      setDefaultVariantForOptionItem,
    }
  );

  actionBtnRef = actionBtn;
  basePriceElRef = basePriceEl;
  ingredientsWrapRef = wrap.querySelector(".shop-pd-ingredients");

  updateQtyUi();
  updateActionText();

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
          if (elMobileAddToCartBtn) elMobileAddToCartBtn.disabled = true;
        } else {
          if (elMobileAddToCartBtn) elMobileAddToCartBtn.disabled = false;
        const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
        const optionTotal = optionItemsTotal(selectedItems);
        const variantUnitPrice = getVariantUnitPrice(product, variants, variantState);
        const basePrice = Number(variantUnitPrice || 0) + optionTotal;
        const ingredientsPriceDiff = calculateIngredientPrice();
        const unitPrice = roundPrice(basePrice + ingredientsPriceDiff);
        const totalPrice = roundPrice(unitPrice * Number(qty || 1));
        elMobileProductPrice.textContent = money(totalPrice);
        elMobileProductLabel.textContent = editMode ? "Сохранить" : "в корзину";
        }
      }
      // Обновляем qty в клонированном pill
      if (elMobileQtyWrap) {
        const clonedCenter = elMobileQtyWrap.querySelector(".qty-pill__center");
        if (clonedCenter) clonedCenter.textContent = String(qty);
        const clonedMinus = elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
        if (clonedMinus) clonedMinus.classList.toggle("is-disabled", qty <= 1 || !available);
        const clonedPlus = elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) clonedPlus.classList.toggle("is-disabled", !available);
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
        if (clonedMinus) clonedMinus.classList.toggle("is-disabled", qty <= 1 || !available);
        const clonedPlus = elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) clonedPlus.classList.toggle("is-disabled", !available);
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

  container.appendChild(wrap);

  actionBtn.addEventListener("click", () => {
    if (!available) return;
    const wasEmpty = cartCountTotal() === 0;
    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionItemIds = selectedItems.map((item) => item.id);
    const selectedVariantGroupId = Number(variantState.groupId);
    const selectedVariantIndex = Number(variantState.selectedIndex);
    const hasVariantSelection = Number.isFinite(selectedVariantGroupId) && Number.isFinite(selectedVariantIndex);
    const variantSelection = hasVariantSelection
      ? { group_id: selectedVariantGroupId, value_index: selectedVariantIndex }
      : null;
    const variantLabel = hasVariantSelection
      ? `${str(variants?.[0]?.title || "Вариант")}: ${str(variantState.label || "")}`.trim()
      : "";
    const variantUnitPrice = hasVariantSelection
      ? getVariantUnitPrice(product, variants, variantState)
      : Number(product.price || 0);

    const safeQty = Math.max(1, Number(qty || 1));

    // Collect ingredient quantities with names and units for display
    // ВАЖНО: сохраняем ВСЕ ингредиенты, даже если они не изменены (для отображения в админке)
    const ingredientQuantities = [];
    ingredients.forEach(ing => {
      const ingId = Number(ing.ingredient_id);
      const state = ingredientState.get(ingId);
      // Используем quantity из state если есть, иначе базовое значение из ing
      const quantity = (state && state.quantity !== undefined) 
        ? state.quantity 
        : Number(ing.quantity ?? 1);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      ingredientQuantities.push({
        ingredient_id: ingId,
        quantity: quantity,
        ingredient_name: ing.ingredient_name || "",
        unit_label: unitLabel,
      });
    });

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
    renderProducts();
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

  openProductCtx = { productId: product.id };
}

  async function openProductDetails(productId, { cartKey } = {}) {
    const p = await ensureProduct(productId);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    if (isMobile) {
      if (!openCartSheetCtx) openCartSheet();
      if (openCartSheetCtx?.showSheetProduct) {
        openCartSheetCtx.showSheetProduct(p, { cartKey });
      }
      return;
    }

    showProductView(p.name);
    await renderProductDetailsInto(elProductContent, p, { cartKey });
  }

  function comboDiscountedPrice(price, discountPercent) {
    const p = Number(price) || 0;
    const d = Number(discountPercent) || 0;
    return roundPrice(d >= 100 ? 0 : p * (1 - d / 100));
  }

  function renderComboDetailsInto(container, combo, { onBack, cartKey } = {}) {
    if (!container) return;
    const blocks = Array.isArray(combo.blocks) ? combo.blocks : [];
    const discountPercent = Number(combo.discount_percent) || 0;
    let comboQty = 1;
    const selectionStateByBlock = blocks.map(() => ({ product_id: null, variant_label: "", variant_group_title: "", variant_unit: "", ingredients_display: [], unit_price_override: null, unit_price_before_discount: null }));
    let expandedPickerProductIndex = null;
    const comboProductPreviewCache = new Map();

    const selectedIndexByBlock = blocks.map((block) => {
      const products = block.products || [];
      const defaultIdx = products.findIndex((p) => p.is_default);
      return defaultIdx >= 0 ? defaultIdx : 0;
    });

    if (cartKey) {
      const cartItem = state.cart.find((x) => x.key === cartKey);
      if (cartItem && cartItem.type === "combo") {
        comboQty = Math.max(1, Number(cartItem.qty || 0));
        const selList = Array.isArray(cartItem.selections) ? cartItem.selections : [];
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
            st.variant_value_index = sel.variant_value_index != null ? Number(sel.variant_value_index) : null;
            st.variant_group_title = String(sel.variant_group_title || "");
            st.variant_unit = String(sel.variant_unit || "");
            st.ingredients_display = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
            st.unit_price_override = sel.unit_price_override != null ? Number(sel.unit_price_override) : null;
            st.unit_price_before_discount = null;
          }
        });
      }
    }

    function getSelectedProduct(blockIndex) {
      const block = blocks[blockIndex];
      if (!block || !block.products || !block.products.length) return null;
      const idx = selectedIndexByBlock[blockIndex];
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

    function renderFooter({ onAdd, actionLabel = "в корзину" } = {}) {
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

      qtyPill.btnPlus.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        comboQty += 1;
        qtyPill.center.textContent = String(comboQty);
        qtyPill.btnMinus.classList.toggle("is-disabled", comboQty <= 1);
        updateFooterAction();
      });

      qtyPill.btnMinus.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (comboQty <= 1) return;
        comboQty -= 1;
        qtyPill.center.textContent = String(comboQty);
        qtyPill.btnMinus.classList.toggle("is-disabled", comboQty <= 1);
        updateFooterAction();
      });

      if (comboQty <= 1) qtyPill.btnMinus.classList.add("is-disabled");

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
          if (minusBtn) minusBtn.classList.toggle("is-disabled", comboQty <= 1);
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
        if (clonedMinus) {
          clonedMinus.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (comboQty <= 1) return;
            comboQty -= 1;
            qtyPill.center.textContent = String(comboQty);
            qtyPill.btnMinus.classList.toggle("is-disabled", comboQty <= 1);
            updateFooterAction();
          });
        }
        if (clonedPlus) {
          clonedPlus.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            comboQty += 1;
            qtyPill.center.textContent = String(comboQty);
            qtyPill.btnMinus.classList.toggle("is-disabled", comboQty <= 1);
            updateFooterAction();
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
        const state = selectionStateByBlock[blockIndex] || {};
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
          variant_value_index: it.state.variant_value_index,
          variant_group_title: it.state.variant_group_title || "",
          variant_unit: it.state.variant_unit || "",
          ingredients_display: it.state.ingredients_display || [],
        };
      });
    }

    let comboHydratedOnce = false;

    async function hydrateBlockSelection(blockIndex) {
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
        if (state.product_id === productId && state.variant_value_index != null) {
          vIdx = Number(state.variant_value_index);
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
        if (state.product_id === productId && Array.isArray(state.ingredients_display) && state.ingredients_display.length) {
          state.ingredients_display.forEach((ing) => {
            const ingId = Number(ing.ingredient_id);
            if (Number.isFinite(ingId)) ingredientQty.set(ingId, Number(ing.quantity ?? ing.qty ?? 0));
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
          const baseQty = Number(ing.quantity ?? 1) || 1;
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

        // Ниже базовой цены варианта не опускаем — чтобы не показывать 0
        unit = Math.max(baseUnit, unit);
        state.unit_price_before_discount = roundPrice(unit);
        const discounted = comboDiscountedPrice(unit, discountPercent);
        state.unit_price_override = roundPrice(discounted);
        state.product_id = productId;
        state.variant_label = vState.label;
        state.variant_group_title = (vGroup && (vGroup.title || vGroup.title_label)) ? String(vGroup.title || vGroup.title_label) : "";
        state.variant_unit = (vGroup && (vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code)) ? String(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) : "";
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
      await Promise.all(blocks.map((_, blockIndex) => hydrateBlockSelection(blockIndex)));
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

      if (label) {
        const vLine = document.createElement("div");
        vLine.className = "cart-sub-detail-item";
        const variantParts = [label];
        if (variantUnit) variantParts.push(variantUnit);
        if (variantGroupTitle) variantParts.push(variantGroupTitle);
        vLine.textContent = "• " + variantParts.join(" ");
        detailsWrap.appendChild(vLine);
      }

      ingList.forEach((ing) => {
        const name = String(ing.name || "").trim();
        const rawQty = ing.qty ?? ing.quantity;
        const unit = String(ing.unit || "").trim();
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
        detailsWrap.appendChild(line);
      });
    }

    async function getComboProductPreview(productId) {
      const id = Number(productId);
      if (!Number.isFinite(id) || id <= 0) {
        return { variant_label: "", ingredients_display: [], hasConfigurable: false, unit_price_override: null, unit_price_before_discount: null };
      }

      if (comboProductPreviewCache.has(id)) {
        return comboProductPreviewCache.get(id);
      }

      const promise = (async () => {
        try {
          const [product, variants, ingredients] = await Promise.all([
            ensureProduct(id),
            resolveProductVariants(id),
            resolveProductIngredients(id),
          ]);
          if (!product) return { variant_label: "", ingredients_display: [], hasConfigurable: false, unit_price_override: null, unit_price_before_discount: null };

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
              const baseQty = Number(ing.quantity ?? 1) || 1;
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
            unit = Math.max(baseUnit, unit);
            unit_price_before_discount = roundPrice(unit);
            unit_price_override = roundPrice(comboDiscountedPrice(unit, discountPercent));
          } catch (e) {
            // оставляем null — в карточке останется базовая цена
          }

          return {
            variant_label: variantLabel,
            variant_group_title: variantGroupTitle,
            variant_unit: variantUnit,
            ingredients_display: ingredientsDisplay,
            hasConfigurable: Boolean(hasVariantChoices || hasAdjustableIngredients),
            unit_price_override: unit_price_override,
            unit_price_before_discount: unit_price_before_discount,
          };
        } catch (e) {
          console.warn("getComboProductPreview failed for product", id, e);
          return { variant_label: "", ingredients_display: [], hasConfigurable: false, unit_price_override: null, unit_price_before_discount: null };
        }
      })();

      comboProductPreviewCache.set(id, promise);
      return promise;
    }

    function renderMainView() {
      if (openCartSheetCtx) {
        openCartSheetCtx.comboStepBack = null;
        sheetNavigationState.screen = "combo";
        setSheetHeaderMode("product", { onBack });
      } else {
        // Десктоп: кнопка «Назад» снова закрывает панель комбо
        window._comboStepBackCallback = null;
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

        mid.appendChild(bottom);
        row.appendChild(mid);

        const right = document.createElement("div");
        right.className = "shop-combo-right";
        const oldPrice = state.unit_price_before_discount != null && Number.isFinite(state.unit_price_before_discount)
          ? Number(state.unit_price_before_discount)
          : Number(prod.price) || 0;
        if (oldPrice > displayPrice) {
          const oldEl = document.createElement("div");
          oldEl.className = "shop-combo-old";
          oldEl.textContent = moneyNoSign(oldPrice) + " ₽";
          right.appendChild(oldEl);
        }
        const pr = document.createElement("div");
        pr.className = "shop-combo-price";
        pr.textContent = moneyNoSign(displayPrice) + " ₽";
        right.appendChild(pr);

        row.appendChild(right);
        list.appendChild(row);
      });

      wrap.appendChild(list);

      const isEditFromCart = Boolean(cartKey);
      const { footer, updateFooterAction } = renderFooter({
        actionLabel: isEditFromCart ? "Сохранить" : "в корзину",
        onAdd: ({ qty }) => {
          const selections = buildComboSelections();
          if (!selections.length) return;
          const comboId = combo.id;
          if (isEditFromCart && cartKey) {
            const cartItem = state.cart.find((x) => x.key === cartKey);
            if (cartItem) {
              const sumOld = blocks.reduce((s, _, blockIndex) => {
                const p = getSelectedProduct(blockIndex);
                if (!p) return s;
                const st = selectionStateByBlock[blockIndex] || {};
                const oldP = st.unit_price_before_discount != null && Number.isFinite(st.unit_price_before_discount)
                  ? Number(st.unit_price_before_discount)
                  : Number(p.price) || 0;
                return s + oldP;
              }, 0);
              cartItem.qty = Math.max(1, Number(qty) || 1);
              cartItem.selections = selections;
              cartItem.unit_price_before_discount = roundPrice(sumOld);
              applyAutoAddRules();
              saveCart();
              renderCart();
              updateCartBadge();
              if (typeof onBack === "function") onBack();
            }
          } else {
            const key = "combo-" + comboId + "-" + Date.now();
            const sumOld = blocks.reduce((s, _, blockIndex) => {
              const p = getSelectedProduct(blockIndex);
              if (!p) return s;
              const st = selectionStateByBlock[blockIndex] || {};
              const oldP = st.unit_price_before_discount != null && Number.isFinite(st.unit_price_before_discount)
                ? Number(st.unit_price_before_discount)
                : Number(p.price) || 0;
              return s + oldP;
            }, 0);
            state.cart.push({
              key,
              type: "combo",
              combo_id: comboId,
              combo_title: combo.title || "Комбо",
              qty: Math.max(1, Number(qty) || 1),
              selections,
              unit_price_before_discount: roundPrice(sumOld),
            });
            applyAutoAddRules();
            saveCart();
            renderCart();
            updateCartBadge();
            if (typeof onBack === "function") onBack();
          }
        },
      });

      const viewWrap = document.createElement("div");
      viewWrap.className = "shop-combo-view";
      wrap.classList.add("shop-combo-detail-scroll");
      viewWrap.appendChild(wrap);
      viewWrap.appendChild(footer);
      container.appendChild(viewWrap);

      renderMainView._updateFooterAction = updateFooterAction;
    }

    let pickerFooterUpdate = null;

    function renderBlockPicker(blockIndex) {
      const block = blocks[blockIndex];
      if (!block || !block.products || !block.products.length) return;

      // Десктоп: кнопка «Назад» возвращает на шаг назад (в основное представление комбо), а не закрывает панель
      if (!openCartSheetCtx) {
        window._comboStepBackCallback = () => {
          renderMainView();
          window._comboStepBackCallback = null;
        };
      }

      container.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "shop-combo-detail shop-combo-detail--picker";

      const titleEl = document.createElement("h1");
      titleEl.className = "shop-combo-detail-title";
      titleEl.textContent = combo.title || "Комбо";
      wrap.appendChild(titleEl);

      const caption = (combo.description || "").trim();
      if (caption) {
        const captionEl = document.createElement("div");
        captionEl.className = "shop-combo-detail-caption";
        captionEl.textContent = caption;
        wrap.appendChild(captionEl);
      }

      const listWrap = document.createElement("div");
      listWrap.className = "shop-combo-picker-list";

      const currentSelected = selectedIndexByBlock[blockIndex];
      (block.products || []).forEach((prod, idx) => {
        const isSelected = idx === currentSelected;
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

        mid.appendChild(bottomRow);
        card.appendChild(mid);

        const actionsWrap = document.createElement("div");
        actionsWrap.className = "shop-combo-picker-actions";

        const gearBtn = document.createElement("button");
        gearBtn.type = "button";
        gearBtn.className = "shop-combo-picker-gear";
        gearBtn.title = "Настройка состава и вариантов";
        gearBtn.innerHTML = "<i class=\"fas fa-cog\"></i>";
        gearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (idx !== currentSelected) selectedIndexByBlock[blockIndex] = idx;
          expandedPickerProductIndex = expandedPickerProductIndex === idx ? null : idx;
          hydrateBlockSelection(blockIndex)
            .then(() => {
              renderBlockPicker(blockIndex);
            })
            .catch(() => {
              renderBlockPicker(blockIndex);
            });
        });
        actionsWrap.appendChild(gearBtn);

        const radio = document.createElement("span");
        radio.className = "shop-combo-radio";
        radio.setAttribute("aria-hidden", "true");
        radio.title = expandedPickerProductIndex === idx ? "Сохранить и применить" : "";
        if (idx === currentSelected) radio.classList.add("is-selected");
        radio.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (expandedPickerProductIndex === idx) {
            expandedPickerProductIndex = null;
            renderMainView();
          } else {
            selectedIndexByBlock[blockIndex] = idx;
            hydrateBlockSelection(blockIndex)
              .then(() => renderMainView())
              .catch(() => renderMainView());
          }
        });
        actionsWrap.appendChild(radio);
        card.appendChild(actionsWrap);

        card.addEventListener("click", (e) => {
          if (e.target.closest(".shop-combo-picker-gear") || e.target.closest(".shop-combo-radio")) return;
          selectedIndexByBlock[blockIndex] = idx;
          hydrateBlockSelection(blockIndex)
            .then(() => renderMainView())
            .catch(() => renderMainView());
        });

        // Универсальная подгрузка превью: и для состава (у невыбранных, если нет state),
        // и для решения, показывать ли шестерёнку.
        getComboProductPreview(prod.product_id)
          .then((preview) => {
            if (!card.isConnected) return;

            if (!isSelected && (!initialVariantLabel && !initialIngredientsDisplay.length)) {
              if (!detailsWrap.isConnected) return;
              renderComboDetailsLines(detailsWrap, preview.variant_label, preview.ingredients_display, {
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
          })
          .catch(() => {});

        listWrap.appendChild(card);

        if (expandedPickerProductIndex === idx) {
          const expandWrap = document.createElement("div");
          expandWrap.className = "shop-combo-picker-expand";
          expandWrap.innerHTML = "<div class=\"shop-combo-picker-expand-loading\">Загрузка…</div>";
          card.appendChild(expandWrap);

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
                const baseQty = Number(ing.quantity ?? 1) || 1;
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
              // Ниже базовой цены варианта не опускаем — чтобы не показывать 0
              unit = Math.max(baseUnit, unit);
              state.unit_price_before_discount = roundPrice(unit);
              const discounted = comboDiscountedPrice(unit, discountPercent);
              state.unit_price_override = roundPrice(discounted);
              state.variant_label = vState.label;
              state.variant_group_title = (vGroup && (vGroup.title || vGroup.title_label)) ? String(vGroup.title || vGroup.title_label) : "";
              state.variant_unit = (vGroup && (vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code)) ? String(vGroup.unit_short_title || vGroup.unit_title || vGroup.unit_code) : "";
              state.variant_value_index = vIdx;
              state.ingredients_display = ingredients.map((ing) => ({
                ingredient_id: ing.ingredient_id,
                name: ing.ingredient_name || ing.name || "",
                quantity: ingredientQty.get(Number(ing.ingredient_id)) ?? 0,
                qty: ingredientQty.get(Number(ing.ingredient_id)) ?? 0,
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
              values.forEach((val, vIdx) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "shop-combo-picker-variant-btn" + (vIdx === safeVariantIdx ? " is-active" : "");
                btn.textContent = String(val);
                btn.addEventListener("click", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  state.variant_value_index = vIdx;
                  state.variant_label = String(val);
                  expandWrap.querySelectorAll(".shop-combo-picker-variant-btn").forEach((b, i) => b.classList.toggle("is-active", i === vIdx));
                  updatePrice();
                });
                vBlock.appendChild(btn);
              });
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

                const btnPlus = document.createElement("button");
                btnPlus.type = "button";
                btnPlus.className = "shop-combo-picker-ingredient-btn";
                btnPlus.textContent = "+";

                btnMinus.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const prev = Number(ingredientQty.get(ingId) ?? 0);
                  let next = prev - step;
                  if (next < minQty) next = minQty;
                  if (!Number.isFinite(next)) next = minQty;
                  ingredientQty.set(ingId, next);
                  qtyVal.textContent = next + " " + unitShort;
                  updatePrice();
                });

                btnPlus.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const prev = Number(ingredientQty.get(ingId) ?? 0);
                  let next = prev + step;
                  if (next > maxQty) next = maxQty;
                  if (!Number.isFinite(next)) next = maxQty;
                  ingredientQty.set(ingId, next);
                  qtyVal.textContent = next + " " + unitShort;
                  updatePrice();
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
              expandWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
          })();
        }
      });

      wrap.appendChild(listWrap);

      const { footer, updateFooterAction } = renderFooter({
        onAdd: ({ qty }) => {
          const selections = buildComboSelections();
          if (!selections.length) return;
          const comboId = combo.id;
          const key = "combo-" + comboId + "-" + Date.now();
          const sumOld = blocks.reduce((s, _, blockIndex) => {
            const p = getSelectedProduct(blockIndex);
            if (!p) return s;
            const st = selectionStateByBlock[blockIndex] || {};
            const oldP = st.unit_price_before_discount != null && Number.isFinite(st.unit_price_before_discount)
              ? Number(st.unit_price_before_discount)
              : Number(p.price) || 0;
            return s + oldP;
          }, 0);
          state.cart.push({
            key,
            type: "combo",
            combo_id: comboId,
            combo_title: combo.title || "Комбо",
            qty: Math.max(1, Number(qty) || 1),
            selections,
            unit_price_before_discount: roundPrice(sumOld),
          });
          applyAutoAddRules();
          saveCart();
          renderCart();
          updateCartBadge();
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

      // Шаг назад: стрелка в шапке и кнопка "Назад" на Android
      if (openCartSheetCtx) {
        const doStepBack = () => {
          renderMainView();
          setSheetHeaderMode("product", { onBack });
          openCartSheetCtx.comboStepBack = null;
          sheetNavigationState.screen = "combo";
        };
        openCartSheetCtx.comboStepBack = doStepBack;
        setSheetHeaderMode("product", { onBack: doStepBack });
        sheetNavigationState.screen = "comboPicker";
      }
    }

    (async () => {
      await hydrateComboSelectionsFromDefaults();
      renderMainView();
    })();
  }

  async function openComboDetails(comboId, { cartKey } = {}) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    let json;
    try {
      json = await apiJson("/api/public/combos/" + encodeURIComponent(comboId));
    } catch (e) {
      console.warn("openComboDetails: failed to load combo", comboId, e);
      return;
    }
    const data = json?.data;
    if (!data) return;

    if (isMobile) {
      if (!openCartSheetCtx) openCartSheet();
      if (openCartSheetCtx?.showSheetCombo) {
        openCartSheetCtx.showSheetCombo(data, { cartKey });
      }
      return;
    }

    showProductView(data.title || "Комбо");
    renderComboDetailsInto(elProductContent, data, { onBack: showCartView, cartKey });
  }

  // -----------------------------
  // Shop sheets
  // -----------------------------
  function closeShopSheetIfOpen() {
    if (!window.AppModal) return;
    if (window.AppModal.isOpen()) {
      window.AppModal.close("sheet");
      // Принудительно обнуляем контекст, чтобы следующее открытие создало новый sheet
      openCartSheetCtx = null;
      openProductCtx = null;
      
      // На мобильных: скрываем мобильные кнопки при закрытии sheet
      if (elMobileProductActions) {
        elMobileProductActions.classList.add("hidden");
      }
      if (elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
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

function openCategoriesSheet() {
  if (!window.AppModal) return;
  clearProfileModalMenu();

  // на время открытого шита подсвечиваем "Категории"
  setActiveNav("categories");

  const wrap = document.createElement("div");
  wrap.className = "shop-sheet-content";

  const list = document.createElement("div");
  list.className = "shop-sheet-list";

  getVisibleCategories().forEach((c) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "shop-sheet-row";
    if (Number(state.activeCategoryId) === Number(c.id)) row.classList.add("is-active");

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

function showFavoritesPlaceholder() {
  if (!window.AppModal) return;

  const wrap = document.createElement("div");
  wrap.className = "shop-sheet-content";
  const note = document.createElement("div");
  note.className = "muted";
  note.style.padding = "32px 16px";
  note.style.textAlign = "center";
  note.textContent = "Избранное пока в разработке. Скоро появится.";
  wrap.appendChild(note);

  sheetNavigationState.type = 'favorites';
  sheetNavigationState.screen = null;
  sheetNavigationState.data = null;

  setAppModalMode("shop");
  setActiveNav("fav");
  window.AppModal.open({
    title: "Избранное",
    content: wrap,
    onClose: () => {
      setActiveNav("menu");
      sheetNavigationState.type = null;
      sheetNavigationState.screen = null;
      sheetNavigationState.data = null;
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    },
  });

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
  clearProfileModalMenu();

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

  const addressListTop = document.createElement("div");
  addressListTop.className = "shop-address-list-top";

  const addressNewBtn = document.createElement("button");
  addressNewBtn.type = "button";
  addressNewBtn.className = "chip chip-plus";
  addressNewBtn.textContent = "Новый адрес";
  addressListTop.appendChild(addressNewBtn);

  const addressList = document.createElement("div");
  addressList.className = "shop-address-list";

  addressListView.appendChild(addressListTop);
  addressListView.appendChild(addressList);
  addressWrap.appendChild(addressListView);

  const addressFormView = document.createElement("div");
  addressFormView.className = "shop-address-form-view hidden";
  addressFormView.innerHTML = `
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
  clearBtn.textContent = "×";
  clearBtn.title = "Очистить корзину";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "shop-checkout-btn";
  btn.innerHTML = `Оформить <span class="shop-sheet-checkout-total">0 ₽</span>`;

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
    if (elMobileCartActionsCart) elMobileCartActionsCart.classList.remove("hidden");
    if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    
    // Синхронизируем состояние
    elMobileCartTotal.textContent = money(total);
    elMobileCheckoutBtn.disabled = items.length === 0;
    
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
    title: "Введите адрес",
    content: wrap,
    onClose: () => {
      // Скрываем мобильные кнопки при закрытии sheet
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions) {
        elMobileCartActions.classList.add("hidden");
      }
      if (isMobile && elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
      if (elMobileProductActions) {
        elMobileProductActions.classList.add("hidden");
      }
      
      openCartSheetCtx = null;
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
  };

  setCartSheetFooterMode(openCartSheetCtx, items.length ? "cart" : "hidden");
  attachTwoStepClear(clearBtn, () => clearCartAll());

  let sheetEditingId = null;

  async function showSheetCheckout() {
    checkoutWrap.classList.remove("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "checkout");
    
    // Синхронизируем мобильные кнопки
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      if (elMobileCartActions) {
        elMobileCartActions.classList.remove("hidden");
      }
      if (elMobileCartActionsCart && elMobileCartActionsCheckout) {
        elMobileCartActionsCart.classList.add("hidden");
        elMobileCartActionsCheckout.classList.remove("hidden");
      }
      if (elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
    }

    // title = адрес, без стрелок/иконок
    clearSheetAddressTitleMode();
    applySheetAddressTitle("checkout");

    // обычный режим шапки (крестик есть)
    setSheetHeaderMode("cart");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'checkout';
    sheetNavigationState.data = null;

    // Создаем контент оформления заказа
    await openCheckoutView({
      container: checkoutWrap,
      onBack: showSheetCart,
      hasAddressEditor: true,
      isSheet: true,
      actions: { submitBtn: submitBtn, backBtn: backBtn },
      onEditAddress: () => showSheetAddressList("checkout"),
      onEditPickup: () => showSheetPickupList(),
    });
  }

  function showSheetCart() {
    checkoutWrap.classList.add("hidden");
    list.classList.remove("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.add("hidden");

    const hasItems = cartItemsResolved().length > 0;
    setCartSheetFooterMode(openCartSheetCtx, hasItems ? "cart" : "hidden");
    if (openCartSheetCtx?.checkoutBtn) {
      openCartSheetCtx.checkoutBtn.disabled = !hasItems;
    }
    if (openCartSheetCtx) {
      openCartSheetCtx.addressBackMode = null;
    }

    clearSheetAddressTitleMode();
    applySheetAddressTitle();
    
    // На мобильных: скрываем мобильные кнопки товара, показываем кнопки корзины
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      if (elMobileProductActions) {
        elMobileProductActions.classList.add("hidden");
      }
      if (elMobileCartActions && hasItems) {
        elMobileCartActions.classList.remove("hidden");
      } else if (elMobileCartActions && !hasItems) {
        elMobileCartActions.classList.add("hidden");
      }
      if (elMobileAddressActions) {
        elMobileAddressActions.classList.add("hidden");
      }
      if (elMobileCartActionsCart && elMobileCartActionsCheckout) {
        elMobileCartActionsCart.classList.remove("hidden");
        elMobileCartActionsCheckout.classList.add("hidden");
      }
      if (elMobileCheckoutBtn) {
        elMobileCheckoutBtn.disabled = !hasItems;
      }
    }
    // Обновляем ботомщит активного заказа
    if (typeof window.updateActiveOrdersBadge === "function") {
      window.updateActiveOrdersBadge();
    }

    // cart mode header: вернуть ×, убрать ←/♡
    setSheetHeaderMode("cart");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'cart';
    sheetNavigationState.data = null;

    openProductCtx = null;
  }

function showSheetAddressList(backMode) {
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

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileProductActions) {
      elMobileProductActions.classList.add("hidden");
    }
    if (isMobile && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    if (isMobile && elMobileAddressActions) {
      elMobileAddressActions.classList.add("hidden");
    }

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'addressList';
    sheetNavigationState.data = null;

    renderSheetAddressList();
  }

  function showSheetPickupList() {
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");
    pickupSheetWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && elMobileProductActions) {
      elMobileProductActions.classList.add("hidden");
    }
    if (isMobile && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    if (isMobile && elMobileAddressActions) {
      elMobileAddressActions.classList.add("hidden");
    }

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Точка самовывоза");

    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'pickupList';
    sheetNavigationState.data = null;

    renderSheetPickupList();
  }

  function renderSheetPickupList() {
    pickupSheetList.innerHTML = "";

    const stores = window._pickupStores || [];
    if (!stores.length) {
      pickupSheetList.innerHTML = `<div class="muted" style="padding:16px">Нет доступных точек самовывоза.</div>`;
      return;
    }

    const currentStoreId = window._selectedPickupStoreId || null;

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
        window._selectedPickupStoreId = Number(store.id);

        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }

        await showSheetCheckout();
      });

      pickupSheetList.appendChild(row);
    });
  }

  function showSheetAddressForm(prefill, editingId, backMode) {
    sheetEditingId = editingId ? Number(editingId) : null;
    if (openCartSheetCtx) {
      openCartSheetCtx.addressBackMode = backMode || "cart";
    }

    const get = (k) => addressFormView.querySelector(`[data-a="${k}"]`);
    const setVal = (k, v) => {
      const el = get(k);
      if (el) el.value = str(v || "");
    };

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
      if (elMobileProductActions) {
        elMobileProductActions.classList.add("hidden");
      }
      if (elMobileCartActions) {
        elMobileCartActions.classList.add("hidden");
        if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
        if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
      }
      if (elMobileAddressActions) {
        elMobileAddressActions.classList.remove("hidden");
      }
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

    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'addressForm';
    sheetNavigationState.data = null;

    setTimeout(() => {
      try { get("street")?.focus?.(); } catch {}
    }, 0);
  }

  function showSheetProduct(product, { cartKey } = {}) {
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    // product mode header: ←/♡, × скрыть, title скрыть
    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");
    
    // Определяем куда возвращаться при закрытии карточки:
    // - Если cartKey есть (из корзины) - вернуться в корзину
    // - Если cartKey нет (из каталога) - закрыть sheet и вернуться в каталог
    const onBack = cartKey ? showSheetCart : closeShopSheetIfOpen;
    
    // Обновляем состояние навигации
    sheetNavigationState.type = 'cart';
    sheetNavigationState.screen = 'product';
    sheetNavigationState.data = { cartKey: cartKey || null };
    
    setSheetHeaderMode("product", { onBack });
    renderProductDetailsInto(productWrap, product, { onBack, cartKey });
    
    // На мобильных: скрываем ботомщит активного заказа при открытии карточки товара
    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
  }

  function showSheetCombo(comboData, { cartKey } = {}) {
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.remove("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");
    // На мобилке скрываем футер корзины (× и «Оформить»), у комбо свой футер «в корзину» внутри контента
    const isMobileCombo = window.matchMedia("(max-width: 768px)").matches;
    if (isMobileCombo && elMobileCartActions) {
      elMobileCartActions.classList.add("hidden");
      if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
      if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
    }
    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("");

    const onBack = cartKey ? showSheetCart : closeShopSheetIfOpen;
    sheetNavigationState.type = "cart";
    sheetNavigationState.screen = "combo";
    sheetNavigationState.data = cartKey ? { cartKey } : null;

    setSheetHeaderMode("product", { onBack });
    renderComboDetailsInto(productWrap, comboData, { onBack, cartKey });

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

  const navigateAfterAddressSelection = () => {
    const mode = openCartSheetCtx?.addressBackMode;
    if (mode === "profile") {
      return returnToProfileFromSheet();
    }
    if (mode === "checkout") {
      return showSheetCheckout();
    }
    return showSheetCart();
  };

  if (!effectiveList.length) {
    addressList.innerHTML = `<div class="muted">Адресов пока нет.</div>`;
    return;
  }

  effectiveList.forEach((a) => {
    const row = document.createElement("div");
    row.className = "shop-address-row";
    if (Number(a.is_default) === 1) row.classList.add("is-default");

    const isSelected = state.selectedAddress
      ? a.id && state.selectedAddress.id
        ? Number(a.id) === Number(state.selectedAddress.id)
        : !!a._local && !!state.selectedAddress._local
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

    // ⭐ default (только если залогинен)
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
            renderSheetAddressList();
          } catch (e) {
            alert("Не удалось изменить основной адрес");
          }
        });
      }
      actions.appendChild(btnDef);
    }

    // ✏️ edit
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "shop-address-action-icon";
    btnEdit.innerHTML = `<i class="fas fa-pen"></i>`;
    btnEdit.addEventListener("click", (e) => {
      e.stopPropagation();
      showSheetAddressForm(a, token ? a.id : null, "cart");
    });
    actions.appendChild(btnEdit);

    // ✖ delete
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "shop-address-action-icon is-danger";
    btnDel.innerHTML = `<i class="fas fa-times"></i>`;
    btnDel.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!window.confirm("Удалить адрес?")) return;

      if (token && a.id) {
        try {
          await apiJson(`/api/public/me/addresses/${a.id}`, { method: "DELETE" });
          await refreshAddressState();
          renderSheetAddressList();
          if (!getSelectedAddressLine()) navigateAfterAddressSelection();
        } catch (err) {
          alert("Не удалось удалить адрес");
        }
        return;
      }

      // guest
      clearAddressDraft();
      setSelectedAddress(null);
      renderSheetAddressList();
      navigateAfterAddressSelection();
    });
    actions.appendChild(btnDel);

    card.appendChild(main);
    card.appendChild(actions);
    row.appendChild(card);

    // select by click
    row.addEventListener("click", async () => {
      if (token && a.id) {
        // если уже выбран — просто закрываем
        if (state.selectedAddress && state.selectedAddress.id && Number(state.selectedAddress.id) === Number(a.id)) {
          navigateAfterAddressSelection();
          return;
        }
        try {
          await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
          await refreshAddressState();
          updateAddressChip();
          navigateAfterAddressSelection();
        } catch (e) {
          alert("Не удалось выбрать адрес");
        }
        return;
      }

      // guest
      setSelectedAddress({ ...a, _local: true });
      syncSelectedAddressToCheckoutDraft();
      updateAddressChip();
      return navigateAfterAddressSelection();
    });

    addressList.appendChild(row);
  });
}

  // events
  btn.addEventListener("click", async () => {
    await refreshAddressState();
    // если адрес есть — checkout, если нет — адреса
    if (getSelectedAddressLine()) showSheetCheckout();
    else showSheetAddressList();
  });

  backBtn.addEventListener("click", () => showSheetCart());

  addressNewBtn.addEventListener("click", () => showSheetAddressForm(null, null, "cart"));

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
        await refreshAddressState();
      } else {
        // guest
        saveAddressDraft(payload);
        setSelectedAddress({ ...payload, _local: true });
      }

      syncSelectedAddressToCheckoutDraft();
      updateAddressChip();
      if (openCartSheetCtx?.addressBackMode === "profile") {
        returnToProfileFromSheet();
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
    const v = str(inp.value);
    if (!v.startsWith("+7")) {
      const digits = v.replace(/[^\d]/g, "");
      // если пользователь вставил 8..., превратим в +7...
      let d = digits;
      if (d.startsWith("8")) d = "7" + d.slice(1);
      if (!d.startsWith("7")) d = "7" + d;
      inp.value = "+7" + (d.length > 1 ? d.slice(1) : "");
    }
    if (inp.value === "+7") inp.value = "+7 ";
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

  async function fetchMeSafe() {
    const token = getCustomerToken();
    if (!token) return null;
    try {
      const json = await apiJson("/api/public/me");
      if (json.customer) {
        setCustomerCache(json.customer);
        return json.customer;
      }
      return null;
    } catch (e) {
      if (String(e.message || "").includes("UNAUTHORIZED")) {
        clearCustomer();
        return null;
      }
      return null;
    }
  }

  function buildLoginContent({ onSuccess }) {
    const wrap = document.createElement("div");
    wrap.className = "shop-auth";

    const title = document.createElement("div");
    title.className = "shop-auth-title";
    title.textContent = "Вход";
    wrap.appendChild(title);

    const note = document.createElement("div");
    note.className = "shop-auth-text muted";
    note.textContent = "Введите телефон, затем дату рождения (дд.мм.гггг).";
    wrap.appendChild(note);

    const form = document.createElement("div");
    form.className = "shop-auth-form";

    const phoneLabel = document.createElement("label");
    phoneLabel.className = "field-label";
    phoneLabel.textContent = "Телефон";
    const phone = document.createElement("input");
    phone.className = "control";
    phone.type = "tel";
    phone.value = "+7 ";
    form.appendChild(phoneLabel);
    form.appendChild(phone);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-primary";
    nextBtn.style.width = "100%";
    nextBtn.textContent = "Продолжить";
    form.appendChild(nextBtn);

    const bWrap = document.createElement("div");
    bWrap.style.display = "none";

    const bLabel = document.createElement("label");
    bLabel.className = "field-label";
    bLabel.textContent = "Дата рождения";
    const bday = document.createElement("input");
    bday.className = "control";
    bday.type = "text";
    bday.placeholder = "дд.мм.гггг";
    bday.inputMode = "numeric";
    bWrap.appendChild(bLabel);
    bWrap.appendChild(bday);


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
    wrap.appendChild(form);

    phone.addEventListener("input", () => enforcePhonePrefix(phone));
    phone.addEventListener("focus", () => enforcePhonePrefix(phone));

    const setBirthdayError = (msg) => {
      bdayError.textContent = msg || "";
      bdayError.classList.toggle("hidden", !msg);
      bday.classList.toggle("is-invalid", !!msg);
    };

    const normalizeBirthdayField = () => {
      handleBirthdayInput(bday);
      setBirthdayError("");
    };

    bday.addEventListener("input", normalizeBirthdayField);
    bday.addEventListener("change", normalizeBirthdayField);
    bday.addEventListener("blur", () => {
      if (!str(bday.value).trim()) return;
      if (!isValidBirthday(bday.value)) {
        setBirthdayError("Введите дату рождения в формате дд.мм.гггг");
      }
    });

    nextBtn.addEventListener("click", () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        alert("Введите телефон (РФ): +7XXXXXXXXXX");
        return;
      }
      nextBtn.disabled = true;
      nextBtn.style.display = "none";
      bWrap.style.display = "grid";
      bday.focus();
    });

    loginBtn.addEventListener("click", async () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        alert("Введите телефон (РФ): +7XXXXXXXXXX");
        return;
      }
      if (!isValidBirthday(bday.value)) {
        setBirthdayError("Введите дату рождения в формате дд.мм.гггг");
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = "Проверяем…";

      try {
        const json = await apiJson("/api/public/auth/login", {
          method: "POST",
          body: { phone: phone.value, birthday: str(bday.value).trim() },
          headers: { "x-customer-token": "" }, // на логин не надо старый токен
        });

        if (json.token) setCustomerToken(json.token);
        if (json.customer) setCustomerCache(json.customer);

        const me = await fetchMeSafe();
        await refreshAddressState();
        if (me) {
          if (typeof onSuccess === "function") onSuccess(me);
        } else {
          alert("Не удалось войти");
        }
      } catch (e) {
        console.error(e);
        if (String(e.message || "") === "WRONG_BIRTHDAY") alert("Дата рождения не совпадает");
        else alert("Ошибка входа: " + (e.message || "UNKNOWN"));
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Войти";
      }
    });

    return wrap;
  }

  function openLoginSheet({ onSuccess } = {}) {
    if (!window.AppModal) return;
    const wrap = buildLoginContent({ onSuccess });
    setAppModalMode("shop");
    // Помечаем как профильный шит, чтобы работали повторный клик и Android Back
    sheetNavigationState.type = 'profile';
    sheetNavigationState.screen = null;
    sheetNavigationState.data = null;
    window.AppModal.open({
      title: "Профиль",
      content: wrap,
      onClose: () => {
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
      },
    });
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

    const tabAddresses = document.createElement("button");
    tabAddresses.type = "button";
    tabAddresses.className = "shop-profile-tab is-active";
    tabAddresses.textContent = "Адреса";
    tabAddresses.dataset.tab = "addresses";

    const tabOrders = document.createElement("button");
    tabOrders.type = "button";
    tabOrders.className = "shop-profile-tab";
    tabOrders.textContent = "История заказов";
    tabOrders.dataset.tab = "orders";

    const tabSettings = document.createElement("button");
    tabSettings.type = "button";
    tabSettings.className = "shop-profile-tab";
    tabSettings.textContent = "Настройки";
    tabSettings.dataset.tab = "settings";

    tabs.appendChild(tabAddresses);
    tabs.appendChild(tabOrders);
    tabs.appendChild(tabSettings);
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

    settingsPanel.appendChild(settingsWrap);

    wrap.appendChild(addressesPanel);
    wrap.appendChild(ordersPanel);
    wrap.appendChild(settingsPanel);

    host.appendChild(wrap);

    function setActiveTab(tab) {
      [tabAddresses, tabOrders, tabSettings].forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
      [addressesPanel, ordersPanel, settingsPanel].forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tab === tab));
    }

    tabAddresses.addEventListener("click", () => setActiveTab("addresses"));
    tabOrders.addEventListener("click", () => setActiveTab("orders"));
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
            `${str(a.street)} ${str(a.house)}`,
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
                await refreshAddressState();
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
              await refreshAddressState();
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
      
      // Скрываем верхнюю часть профиля и вкладки
      if (top) top.classList.add("hidden");
      if (tabs) tabs.classList.add("hidden");
      
      // Активируем панель заказов
      setActiveTab("orders");
      
      // Заменяем содержимое ordersPanel на детали заказа
      ordersPanel.innerHTML = `<div class="muted">Загрузка…</div>`;
      
      const order = await loadOrderDetails(orderId);
      if (!order) {
        ordersPanel.innerHTML = `<div class="muted">Не удалось загрузить детали заказа</div>`;
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
      
      // Суммы (нормализованный вид)
      const orderTotalNum = Number(order.total_price) || 0;
      const changeFromNum = Number(order.change_from) || 0;
      const hasChange = changeFromNum > orderTotalNum;
      const changeAmountVal = hasChange ? changeFromNum - orderTotalNum : 0;
      html += `<div class="shop-order-details-section shop-order-summary">`;
      html += `<div class="shop-order-summary-title">Суммы:</div>`;
      if (order.payment_title) {
        html += `<div class="shop-order-summary-row">`;
        html += `<span class="shop-order-summary-label">Оплата</span>`;
        html += `<span class="shop-order-summary-value">${escapeHtml(order.payment_title)}</span>`;
        html += `</div>`;
      }
      if (hasChange) {
        html += `<div class="shop-order-summary-row">`;
        html += `<span class="shop-order-summary-label">Сдача с</span>`;
        html += `<span class="shop-order-summary-value">${money(order.change_from)}</span>`;
        html += `</div>`;
        html += `<div class="shop-order-summary-row">`;
        html += `<span class="shop-order-summary-label">Сдача</span>`;
        html += `<span class="shop-order-summary-value">${money(changeAmountVal)}</span>`;
        html += `</div>`;
      }
      html += `<div class="shop-order-summary-row">`;
      html += `<span class="shop-order-summary-label">Доставка</span>`;
      html += `<span class="shop-order-summary-value">${money(order.delivery_cost || 0)}</span>`;
      html += `</div>`;
      html += `<div class="shop-order-summary-divider"></div>`;
      html += `<div class="shop-order-summary-total-row">`;
      html += `<span class="shop-order-summary-total-label">ИТОГО</span>`;
      html += `<span class="shop-order-summary-total-value">${money(order.total_price || 0)}</span>`;
      html += `</div>`;
      html += `<div class="shop-order-summary-thanks">Спасибо за заказ!</div>`;
      html += `</div>`;
      
      html += `</div>`;
      
      ordersPanel.innerHTML = html;
      
      // Проверяем, открыто ли модальное окно
      const isModal = document.querySelector(".app-modal") && document.querySelector(".app-modal").getAttribute("aria-hidden") !== "true";
      
      // Добавляем пустое поле 200px внизу для скролла в модальном окне
      if (isModal) {
        const spacer = document.createElement("div");
        spacer.style.height = "200px";
        ordersPanel.appendChild(spacer);
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
      }
    }

    function showOrdersList() {
      currentOrdersView = "list";
      currentOrderId = null;
      
      // Сбрасываем флаги для кнопки "Назад"
      window._isViewingOrderDetails = false;
      window._showOrdersListCallback = null;
      
      // Показываем верхнюю часть профиля и вкладки обратно
      if (top) top.classList.remove("hidden");
      if (tabs) tabs.classList.remove("hidden");
      
      // Активируем вкладку "История заказов"
      setActiveTab("orders");
      
      // Восстанавливаем ordersPanel с ordersList
      ordersPanel.innerHTML = "";
      ordersPanel.appendChild(ordersList);
      
      // Проверяем, открыто ли модальное окно
      const isModal = document.querySelector(".app-modal") && document.querySelector(".app-modal").getAttribute("aria-hidden") !== "true";
      
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
      reloadOrders();
    }

    async function reloadOrders() {
      ordersList.innerHTML = `<div class="muted">Загрузка…</div>`;
      try {
        const json = await apiJson("/api/public/me/orders");
        const list = Array.isArray(json.data) ? json.data : [];
        if (!list.length) {
          ordersList.innerHTML = `<div class="muted">Заказов пока нет.</div>`;
          return;
        }

        ordersList.innerHTML = "";
        list.forEach((o) => {
          const row = document.createElement("div");
          row.className = "shop-profile-card";
          row.style.cursor = "pointer";

          let itemsCount = 0;
          if (Array.isArray(o.items)) {
            o.items.forEach(it => { itemsCount += Number(it.qty || it.quantity || 0) || 0; });
          }

          row.innerHTML = `
            <div><strong>Заказ #${o.id}</strong> <span class="muted">• ${o.status_title || "—"}</span></div>
            <div class="muted">${new Date(o.created_at).toLocaleString("ru-RU")}</div>
            <div><strong>${money(o.total_price || 0)}</strong> <span class="muted">• позиций: ${itemsCount}</span></div>
          `;
          
          // Добавляем обработчик клика
          row.addEventListener("click", () => {
            showOrderDetails(o.id);
          });
          
          ordersList.appendChild(row);
        });
      } catch (e) {
        ordersList.innerHTML = `<div class="muted">Ошибка загрузки заказов</div>`;
      }
    }

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
          await refreshAddressState();
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

    function setEditingMode(next) {
      isEditing = Boolean(next);
      wrap.classList.toggle("is-editing", isEditing);
      nameText.classList.toggle("hidden", isEditing);
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
    reloadOrders();

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

  async function openProfilePanel(meOverride, { forceOpen = false, initialTab } = {}) {
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
          openProfilePanel(me2, { forceOpen: true });
        },
      });
      elProfileContent.innerHTML = "";
      elProfileContent.appendChild(loginWrap);
      if (elProfileHeaderActions) elProfileHeaderActions.classList.add("hidden");
      setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: false });
      return;
    }

    const ctx = buildProfileContent({
      host: elProfileContent,
      me,
      onLogout: () => handleProfileLogout(),
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

  async function openProfileSheet({ initialTab } = {}) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) {
      await openProfilePanel(null, { initialTab });
      return;
    }

    if (!window.AppModal) return;

    const me = await fetchMeSafe();
    if (!me) {
      openLoginSheet({
        onSuccess: (me2) => openProfileModal(me2),
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

    // Обновляем состояние навигации
    sheetNavigationState.type = 'profile';
    sheetNavigationState.screen = null;
    sheetNavigationState.data = null;

    setAppModalMode("shop");
    const cleanupMenu = mountProfileModalMenu({
      onEdit: () => ctx.showEdit(),
      onLogout: async () => {
        await handleProfileLogout({ closeModal: true });
      },
    });

    window.AppModal.open({
      title: "Профиль",
      content: wrap,
      onClose: () => {
        cleanupMenu();
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
  
  // Обновляем бейдж активных заказов при смене вкладки
  if (typeof window.updateActiveOrdersBadge === "function") {
    window.updateActiveOrdersBadge();
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
    const mobileStatusEl = $("#shopMobileHeaderStatus");

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
        setStatus(mobileStatusEl, false);
        return;
      }

      const nextOpening = getNextOpeningTime(storeHours, storeTimezone);

      if (!nextOpening) {
        setStatus(statusEl, true, "Мы закрыты");
        setStatus(mobileStatusEl, true, "Мы закрыты");
        return;
      }

      let message = "Мы закрыты. ";
      if (nextOpening.isToday) {
        message += `Откроемся сегодня в ${nextOpening.time}`;
      } else {
        message += `Откроемся ${nextOpening.dayName} в ${nextOpening.time}`;
      }

      setStatus(statusEl, true, message);
      setStatus(mobileStatusEl, true, message);
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
      list.classList.toggle("is-open");
      if (list.classList.contains("is-open")) {
        setTimeout(() => {
          list.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 10);
      }
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) list.classList.remove("is-open");
    });

    render();

    wrap.appendChild(btn);
    wrap.appendChild(list);

    return {
      root: wrap,
      getValue: () => current,
      setValue,
      setOptions,
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

  function buildTimeSlots(option, targetDate) {
    if (!option) return [];
    const start = parseTimeToMinutes(option.starts_at);
    const end = parseTimeToMinutes(option.ends_at);
    if (start === null || end === null || end <= start) return [];
    const stepMinutes = Math.max(1, Number(option.step_minutes) || 30);
    const leadMinutes = Math.max(0, Number(option.lead_minutes) || 0);

    const now = new Date();
    const todayKey = getDateString(now);
    const targetKey = targetDate ? getDateString(targetDate) : todayKey;
    const isToday = (targetKey === todayKey);

    let slot = start;
    if (isToday) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
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
    if (!container) return;

    const items = cartItemsResolved();
    if (!items.length) {
      alert("Корзина пуста");
      if (onBack) onBack();
      return;
    }

    // Вычисляем сумму заказа для фильтрации опций сдачи
    const { total: orderTotal } = computeCartTotals(items);

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

    container.innerHTML = "";

    if (actions?.submitBtn) {
      actions.submitBtn.disabled = false;
      actions.submitBtn.textContent = "Заказать";
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
      elMobileCheckoutSubmitBtn.textContent = "Заказать";
      if (actions?.submitBtn) elMobileCheckoutSubmitBtn.onclick = () => actions.submitBtn.click();
    }

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout";

    const title = document.createElement("div");
    title.className = "shop-checkout-title";
    title.textContent = "Ваш заказ:";
    wrap.appendChild(title);

    // Поля имя и телефон только для неавторизованных
    let name = { value: me ? str(me.name || "") : "" };
    let phone = { value: me ? (me.phone || "") : "" };

    if (!me) {
      const emptyNote = document.createElement("div");
      emptyNote.className = "shop-checkout-note muted";
      emptyNote.textContent = "Поля обязательные: имя и телефон.";
      wrap.appendChild(emptyNote);

      const nameRow = document.createElement("div");
      nameRow.className = "shop-checkout-grid-row";

      const nameWrap = document.createElement("div");
      const nameLabel = document.createElement("label");
      nameLabel.className = "field-label";
      nameLabel.textContent = "Имя";
      const nameInput = document.createElement("input");
      nameInput.className = "control shop-checkout-name";
      nameInput.type = "text";
      nameInput.value = draft.customer_name || "";
      nameWrap.appendChild(nameLabel);
      nameWrap.appendChild(nameInput);
      name = nameInput;

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

      nameRow.appendChild(nameWrap);
      nameRow.appendChild(phoneWrap);
      wrap.appendChild(nameRow);
    }

    const methods = (cfg.methods || []).map(x => ({ code: x.code, title: x.title }));
    const methodUserSelected = Boolean(draft.method_user_selected);
    const preferredMethodCode = methodUserSelected ? draft.method_code : null;
    const methodDefault = pickDefaultCode(methods, preferredMethodCode, "takeaway");
    const methodSelect = buildDropdown(methods, methodDefault);
    if (!methodUserSelected || !draft.method_code) {
      draft.method_user_selected = false;
      draft.method_code = methodSelect.getValue();
      saveCheckoutDraft(draft);
    }
    methodSelect.root.addEventListener("change", () => {
      draft.method_code = methodSelect.getValue();
      draft.method_user_selected = true;
      saveCheckoutDraft(draft);
      updateDeliveryPricing();
    });

    const methodWrap = document.createElement("div");
    const methodLabel = document.createElement("label");
    methodLabel.className = "field-label";
    methodLabel.textContent = "Способ";
    methodWrap.appendChild(methodLabel);
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

    async function loadPickupStores() {
      try {
        const metaTenant = document.querySelector('meta[name="tenant_id"]');
        const tenantId = metaTenant ? Number(metaTenant.content) : null;
        if (!tenantId) return;

        const response = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await response.json();

        if (data && data.ok && Array.isArray(data.stores)) {
          pickupStores = data.stores;

          // Сохраняем в глобальные переменные для использования в renderPickupList
          window._pickupStores = pickupStores;

          // Если есть сохраненный store_id в draft
          if (draft.pickup_store_id) {
            selectedPickupStoreId = draft.pickup_store_id;
          } else {
            // Иначе берем activeStoreId из localStorage
            const activeStoreId = localStorage.getItem('activeStoreId');
            selectedPickupStoreId = activeStoreId ? Number(activeStoreId) : (pickupStores[0]?.id || null);
          }

          window._selectedPickupStoreId = selectedPickupStoreId;
          updatePickupAddress();
        }
      } catch (err) {
        console.error('Ошибка загрузки точек самовывоза:', err);
      }
    }

    function updatePickupAddress() {
      if (!selectedPickupStoreId || !pickupStores.length) {
        pickupAddress.value = '—';
        return;
      }

      const store = pickupStores.find(s => Number(s.id) === Number(selectedPickupStoreId));
      if (store) {
        // Убираем город из адреса (город виден в хедере)
        pickupAddress.value = store.address || store.name || '—';
      }
    }

    // Callback для обновления поля после выбора в renderPickupList
    window._updatePickupAddressCallback = () => {
      selectedPickupStoreId = window._selectedPickupStoreId;
      updatePickupAddress();
    };

    loadPickupStores();

    pickupField.appendChild(pickupAddress);
    pickupField.appendChild(changePickupBtn);
    pickupWrap.appendChild(pickupLabel);
    pickupWrap.appendChild(pickupField);

    const methodRow = document.createElement("div");
    methodRow.className = "shop-checkout-method-block";
    methodRow.appendChild(methodWrap);
    methodRow.appendChild(addressWrap);
    methodRow.appendChild(pickupWrap);
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

    const cLabel = document.createElement("label");
    cLabel.className = "field-label";
    cLabel.textContent = "Комментарий";
    const comment = document.createElement("input");
    comment.className = "control";
    comment.type = "text";
    comment.placeholder = "Комментарий";
    comment.value = draft.comment || "";
    wrap.appendChild(cLabel);
    wrap.appendChild(comment);

    const timeLabel = document.createElement("label");
    timeLabel.className = "field-label";
    timeLabel.textContent = "Когда приготовить?";
    wrap.appendChild(timeLabel);

    const timeOptions = (cfg.timeOptions || []).map(x => ({ code: x.code, title: x.title }));
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

    const availableTimeOptions = filteredTimeOptions.length ? filteredTimeOptions : timeOptions;

    // Always use defaultFallback for the segment, ignore saved draft
    // Draft can cause wrong defaults (e.g., "on_date" when store is OPEN and should be "asap")
    const timeDefault = availableTimeOptions[0]?.code || defaultFallback;

    const timeSelect = buildDropdown(availableTimeOptions, timeDefault);

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

    // Row 1: [На дату ▾] + [Другой день]  (timeSelect всегда видим, btnOtherDay только при on_date)
    const timeRow = document.createElement("div");
    timeRow.className = "shop-checkout-date-row1";
    timeRow.appendChild(timeSelect.root);

    const btnOtherDay = document.createElement("button");
    btnOtherDay.type = "button";
    btnOtherDay.className = "shop-checkout-date-toggle";
    btnOtherDay.textContent = "Выбрать день";
    timeRow.appendChild(btnOtherDay);

    // --- Секция "На дату" (Row 2 + календарь) ---
    const dateSection = document.createElement("div");
    dateSection.className = "shop-checkout-time-input--ondate";

    // Календарь-попover
    const calendarWrap = document.createElement("div");
    calendarWrap.className = "shop-checkout-date-calendar";

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

    calendarWrap.appendChild(calPopover);
    dateSection.appendChild(calendarWrap);

    // Row 2: [На завтра / дд.мм] + [селектор времени]
    const dateRow2 = document.createElement("div");
    dateRow2.className = "shop-checkout-date-row2";

    const dateDisplayWrap = document.createElement("div");
    dateDisplayWrap.className = "shop-checkout-dropdown-wrap";
    const dateDisplay = document.createElement("button");
    dateDisplay.type = "button";
    dateDisplay.className = "shop-checkout-select shop-checkout-date-display";
    dateDisplayWrap.appendChild(dateDisplay);

    const timeSlotsDropdown = buildDropdown([], "");
    const dateSlotsWrap = document.createElement("div");
    dateSlotsWrap.className = "shop-checkout-time-input--slots";
    dateSlotsWrap.appendChild(timeSlotsDropdown.root);

    dateRow2.appendChild(dateDisplayWrap);
    dateRow2.appendChild(dateSlotsWrap);
    dateSection.appendChild(dateRow2);

    // Слоты для "Ко времени" — в том же ряду что и timeSelect
    const timeSlotsWrapAtTime = document.createElement("div");
    timeSlotsWrapAtTime.className = "shop-checkout-time-input--slots";
    timeSlotsWrapAtTime.style.display = "none";
    const timeSlotsDropdownAtTime = buildDropdown([], "");
    timeSlotsWrapAtTime.appendChild(timeSlotsDropdownAtTime.root);
    timeRow.appendChild(timeSlotsWrapAtTime);

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
    // Клик по dateDisplay сбрасывает на "завтра"
    dateDisplay.addEventListener("click", () => {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      setSelectedDate(tmrw);
      calPopover.classList.add("hidden");
      calendarOpen = false;
    });

    btnOtherDay.addEventListener("click", () => {
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

    document.addEventListener("click", (e) => {
      if (calendarOpen && !calendarWrap.contains(e.target) && !btnOtherDay.contains(e.target)) {
        calPopover.classList.add("hidden");
        calendarOpen = false;
      }
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
      btnOtherDay.style.display = isOnDate ? "" : "none";
      dateSection.style.display = isOnDate ? "" : "none";
      timeSlotsWrapAtTime.style.display = (hasWindow && !isOnDate) ? "" : "none";
      // Когда нет соседних элементов — timeSelect на всю ширину
      const hasNeighbor = isOnDate || (hasWindow && !isOnDate);
      timeSelect.root.style.gridColumn = hasNeighbor ? "" : "1 / -1";
    }

    function updateTimeSlotsOptions() {
      const selectedCode = timeSelect.getValue();
      const config = timeOptionByCode[selectedCode];

      if (selectedCode === "on_date") {
        if (!config || Number(config.has_time_window) !== 1) {
          dateSlotsWrap.style.display = "none";
          return;
        }
        dateSlotsWrap.style.display = "";
        const slots = buildTimeSlots(config, selectedDate);
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
        return;
      }
      const slots = buildTimeSlots(config);
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

    const payments = (cfg.payments || []).map(x => ({ code: x.code, title: x.title }));
    const payDefault = pickDefaultCode(payments, draft.payment_code, "cash");
    const paySelect = buildDropdown(payments, payDefault);

    const changeAmounts = [500, 1000, 2000, 5000].filter(v => v > currentPayableTotal);
    const changeOptions = [
      { code: "", title: "Сдача не нужна" },
      ...changeAmounts.map(v => ({ code: String(v), title: String(v) })),
      { code: "custom", title: "Другая сумма" },
    ];
    const isCustomChange = draft.change_from && !changeAmounts.includes(draft.change_from);
    const changeDefault = isCustomChange ? "custom" : (draft.change_from ? String(draft.change_from) : "");
    const changeSelect = buildDropdown(changeOptions, changeDefault);

    const payWrap = document.createElement("div");
    const payLabel = document.createElement("label");
    payLabel.className = "field-label";
    payLabel.textContent = "Оплата";
    payWrap.appendChild(payLabel);
    payWrap.appendChild(paySelect.root);

    const changeWrap = document.createElement("div");
    changeWrap.className = "shop-checkout-change";
    const changeLabel = document.createElement("label");
    changeLabel.className = "field-label";
    changeLabel.textContent = "Сдача";
    changeWrap.appendChild(changeLabel);
    changeWrap.appendChild(changeSelect.root);

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

    const payRow = document.createElement("div");
    payRow.className = "shop-checkout-grid-row shop-checkout-grid-row--two";
    payRow.appendChild(payWrap);
    payRow.appendChild(changeWrap);
    wrap.appendChild(payRow);

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

      if (actions?.submitBtn) {
        const shouldBlock = isDelivery && deliveryRules.minOrder > 0 && orderTotal < deliveryRules.minOrder;
        actions.submitBtn.disabled = shouldBlock;
      }
    }

    function refreshChangeVisibility() {
      const isCash = paySelect.getValue() === "cash";
      changeWrap.style.display = isCash ? "" : "none";
      const isCustom = changeSelect.getValue() === "custom";
      changeCustomInput.style.display = (isCash && isCustom) ? "" : "none";
    }
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
            comment: str(comment.value).trim() || null,
            time_option_code: timeSelect.getValue() || timeDefault || "asap",
            scheduled_at: timeInput.value || "",
            scheduled_date: getDateString(selectedDate),
            payment_code: paySelect.getValue() || payDefault || "cash",
            change_from: getChangeFromValue(),
          });
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
          comment: str(comment.value).trim() || null,
          time_option_code: timeSelect.getValue() || timeDefault || "asap",
          scheduled_at: timeInput.value || "",
          scheduled_date: getDateString(selectedDate),
          payment_code: paySelect.getValue() || payDefault || "cash",
          change_from: getChangeFromValue(),
        });

        // Переключаем на pickup view (sheet или panel)
        if (typeof onEditPickup === "function") onEditPickup();
        else showPickupListView('checkout');
      });

    container.appendChild(wrap);

    const resultWrap = document.createElement("div");
    resultWrap.className = "shop-order-result hidden";
    container.appendChild(resultWrap);

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
        clearCartAll();
        saveCheckoutDraft({});
        if (typeof window.updateActiveOrdersBadge === "function") await window.updateActiveOrdersBadge();
        if (isSheet && window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) window.AppModal.close("sheet");
        window.location.href = getShopBasePath();
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
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions && elMobileCartActionsCheckout) {
        elMobileCartActions.classList.remove("hidden");
        if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
        elMobileCartActionsCheckout.classList.remove("hidden");
        elMobileCartActionsCheckout.classList.add("is-order-success");
      }
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
      actions.backBtn.onclick = () => onBack();
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
        pickup_store_id: selectedPickupStoreId || null,
        comment: str(comment.value).trim() || null,
        time_option_code: timeSelect.getValue() || timeDefault || "asap",
        scheduled_at: null,
        payment_code: paySelect.getValue() || payDefault || "cash",
        cutlery_qty: 0,
        change_from: getChangeFromValue(),
        items: resolvedItems.map(x => {
          if (x.type === "combo") {
            const pricing = computeItemPricing(x, totals);
            return {
              type: "combo",
              combo_id: x.combo_id,
              combo_title: x.combo_title || "Комбо",
              qty: x.qty,
              line_total: pricing.lineTotal,
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
          };
        }),
      };

      const isAuthed = !!(getCustomerToken() && me);

      if (!payload.customer_name) {
        if (isAuthed) payload.customer_name = "Клиент";
        else {
          alert("Введите имя");
          return;
        }
      }

      if (!isAuthed) {
        const normPhone = normalizePhone(payload.customer_phone);
        if (!normPhone || normPhone.length !== 11 || !normPhone.startsWith("7")) {
          alert("Введите телефон (РФ): +7XXXXXXXXXX");
          return;
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

      saveCheckoutDraft({
        promo_code: payload.promo_code,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        method_code: payload.method_code,
        delivery_address: payload.delivery_address,
        pickup_store_id: payload.pickup_store_id,
        comment: payload.comment,
        time_option_code: payload.time_option_code,
        scheduled_at: timeInput.value || "",
        scheduled_date: getDateString(selectedDate),
        payment_code: payload.payment_code,
        change_from: payload.change_from,
      });

      actions.submitBtn.disabled = true;
      actions.submitBtn.textContent = "Отправляем…";

      const orderTotalWithDelivery = orderTotal + getDeliveryCostForTotal(orderTotal);

      try {
        const res = await apiJson("/api/public/orders", { method: "POST", body: payload });

        if (res.data && res.data.duplicate && res.data.needConfirmation && res.data.existingOrder) {
          actions.submitBtn.disabled = false;
          actions.submitBtn.textContent = "Заказать";
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
            actions.submitBtn.disabled = false;
            actions.submitBtn.textContent = "Заказать";
          });
          return;
        }

        if (res.data && res.data.id && res.data.public_id) {
          localStorage.setItem(LAST_ORDER_KEY, String(res.data.public_id));
          clearCartAll();
          saveCheckoutDraft({});
          if (typeof window.updateActiveOrdersBadge === "function") await window.updateActiveOrdersBadge();
          showOrderSuccess(res.data.id, res.data.public_id, orderTotalWithDelivery);
        } else {
          actions.submitBtn.disabled = false;
          actions.submitBtn.textContent = "Заказать";
        }
      } catch (e) {
        console.error(e);
        if (e.message === "MIN_ORDER" && deliveryRules.minOrder > 0) {
          alert(`Минимальная сумма заказа ${money(deliveryRules.minOrder)}.`);
          actions.submitBtn.disabled = false;
          actions.submitBtn.textContent = "Заказать";
          return;
        }
        alert("Ошибка оформления заказа: " + (e.message || "UNKNOWN"));
        actions.submitBtn.disabled = false;
        actions.submitBtn.textContent = "Заказать";
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

  // -----------------------------
  // Init
  // -----------------------------
async function init() {
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
    await loadUnitConversions();
    renderCategories();
    renderCategoryChips();
    updateStoreStatus();

    const visibleCategories = getVisibleCategories();
    const first = visibleCategories[0] || null;
    if (first) {
      setActiveCategory(first.id, first.title, { scroll: false });
    } else {
      state.activeCategoryId = null;
      state.activeCategoryTitle = "Каталог";
      if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
    }

    await loadProductsByCategory();
    await loadAutoAdd();
    if (applyAutoAddRules()) saveCart();
    renderProducts();
    bindCategoryScrollSpy();
    initPullToRefresh();
    await warmupCartProducts();
    renderCart();
    updateCartBadge();
    await initAddresses();
    try { window.scrollTo(0, 0); } catch {}

    if (elCartContent && !elCartContent.classList.contains("hidden")) {
      showCartView();
    }
    if (elCartClearBtn) {
      attachTwoStepClear(elCartClearBtn, () => clearCartAll());
    }
    if (elCheckoutBtn) {
      elCheckoutBtn.addEventListener("click", async () => {
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
    bindNavToggle(elNavCart, "cart", openCartSheet);
    bindNavToggle(elNavProfile, "profile", () => openProfileSheet());
    bindNavToggle(elNavFav, "favorites", showFavoritesPlaceholder);

    // Обработчик кнопки "назад" на Android (popstate)
    // Добавляем запись в историю при открытии bottom sheet, чтобы можно было обработать "назад"
    let originalOpen = window.AppModal?.open;
    let isOpeningSheet = false;
    if (originalOpen && typeof originalOpen === 'function') {
      window.AppModal.open = function(opts) {
        // Добавляем запись в историю перед открытием только если sheet еще не открыт
        if (!isOpeningSheet && (!window.AppModal.isOpen || !window.AppModal.isOpen())) {
          isOpeningSheet = true;
          window.history.pushState({ sheet: true }, '', window.location.href);
          setTimeout(() => {
            isOpeningSheet = false;
          }, 100);
        }
        return originalOpen.call(this, opts);
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
        window.history.pushState({ sheet: true }, '', window.location.href);
        setTimeout(() => {
          isHandlingBackButton = false;
        }, 0);
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
    
    // Активные заказы: обновление бейджа и обработчик клика
    window.updateActiveOrdersBadge = async function updateActiveOrdersBadge() {
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
        return;
      }
      
      try {
        const token = getCustomerToken();
        if (!token) {
          badges.forEach(badge => badge.classList.add("hidden"));
          window._activeOrders = [];
          return;
        }

        const json = await apiJson("/api/public/me/orders");
        const orders = Array.isArray(json.data) ? json.data : [];
        
        // Считаем активные заказы: все заказы с нефинальными статусами
        // Активными считаем заказы, у которых статус не является финальным (is_final !== 1)
        const activeOrders = orders.filter(order => {
          const isFinal = Number(order.status_is_final || 0) === 1;
          return !isFinal;
        });

        // Сохраняем активные заказы в глобальную переменную
        window._activeOrders = activeOrders;

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
      }
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
      
      // Скрываем приоткрытый bottom sheet при открытии полноценного
      if (elActiveOrdersSheetCollapsed) {
        elActiveOrdersSheetCollapsed.classList.add("hidden");
      }
      
      const activeOrders = window._activeOrders || [];
      if (activeOrders.length === 0) {
        // Если нет активных заказов, обновляем и пробуем снова
        await window.updateActiveOrdersBadge();
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
      
      // Обновляем состояние навигации
      sheetNavigationState.type = 'activeOrders';
      sheetNavigationState.screen = 'list';
      sheetNavigationState.data = null;
      
      // Проверяем, что orders не пустой
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        // Пытаемся загрузить заказы заново
        if (typeof window.updateActiveOrdersBadge === "function") {
          window.updateActiveOrdersBadge().then(() => {
            const updatedOrders = window._activeOrders || [];
            if (updatedOrders.length > 0) {
              showActiveOrdersList(updatedOrders);
            } else {
              // Если все еще пусто, показываем сообщение
              if (window.AppModal.isOpen && window.AppModal.isOpen()) {
                const wrap = document.createElement("div");
                wrap.className = "shop-active-orders-sheet";
                wrap.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Нет активных заказов</div>`;
                window.AppModal.setContent(wrap);
              }
            }
          });
        }
        return;
      }
      
      // Если модальное окно уже открыто, обновляем контент
      if (window.AppModal.isOpen && window.AppModal.isOpen()) {
        const wrap = document.createElement("div");
        wrap.className = "shop-active-orders-sheet";
        
        const list = document.createElement("div");
        list.className = "shop-active-orders-list";
        
        if (orders.length === 0) {
          list.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Нет активных заказов</div>`;
        } else {
          orders.forEach(order => {
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
        }
        
        wrap.appendChild(list);
        
        // Обновляем контент и заголовок
        window.AppModal.setTitle("Активные заказы");
        window.AppModal.setContent(wrap);
        
        // Убираем кнопку назад из хедера, если она была
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
        
        return;
      }
      
      // Если модальное окно закрыто, открываем его
      const wrap = document.createElement("div");
      wrap.className = "shop-active-orders-sheet";
      
      const list = document.createElement("div");
      list.className = "shop-active-orders-list";
      
      orders.forEach(order => {
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
      
      // Обновляем состояние навигации
      sheetNavigationState.type = 'activeOrders';
      sheetNavigationState.screen = 'list';
      sheetNavigationState.data = null;

      setAppModalMode("shop");
      window.AppModal.open({
        title: "Активные заказы",
        content: wrap,
        onClose: () => {
          // Сбрасываем состояние навигации
          sheetNavigationState.type = null;
          sheetNavigationState.screen = null;
          sheetNavigationState.data = null;
          // Показываем приоткрытый bottom sheet обратно после закрытия
          if (elActiveOrdersSheetCollapsed && typeof window.updateActiveOrdersBadge === "function") {
            window.updateActiveOrdersBadge();
          }
        },
      });
    }
    
    // Показать детали активного заказа
    async function showActiveOrderDetails(orderId) {
      if (!window.AppModal) return;
      
      const wrap = document.createElement("div");
      wrap.className = "shop-active-order-details";
      wrap.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Загрузка…</div>`;
      
      // Сохраняем список активных заказов в глобальную переменную для использования при возврате
      const activeOrders = window._activeOrders || [];
      window._savedActiveOrdersForBack = [...activeOrders]; // Сохраняем копию
      const hasMultipleOrders = activeOrders.length > 1;
      
      // Обновляем состояние навигации
      sheetNavigationState.type = 'activeOrders';
      sheetNavigationState.screen = 'details';
      sheetNavigationState.data = { orderId };
      
      setAppModalMode("shop");
      window.AppModal.open({
        title: "Детали заказа",
        content: wrap,
        onClose: () => {
          // Сбрасываем состояние навигации
          sheetNavigationState.type = null;
          sheetNavigationState.screen = null;
          sheetNavigationState.data = null;
          // Показываем приоткрытый bottom sheet обратно после закрытия
          if (elActiveOrdersSheetCollapsed && typeof window.updateActiveOrdersBadge === "function") {
            window.updateActiveOrdersBadge();
          }
        },
      });
      
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
                    // Если все еще пусто, показываем сообщение
                    const wrap = document.createElement("div");
                    wrap.className = "shop-active-orders-sheet";
                    wrap.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Нет активных заказов</div>`;
                    window.AppModal.setTitle("Активные заказы");
                    window.AppModal.setContent(wrap);
                    
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
        
        if (!order) {
          wrap.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Не удалось загрузить детали заказа</div>`;
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
                html += `<div class="cart-price">${money(item.line_total || item.price || 0)}</div>`;
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
              html += `<div class="cart-price">${money(item.line_total || item.price || 0)}</div>`;
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
        
        // Суммы (нормализованный вид)
        const orderTotalNum2 = Number(order.total_price) || 0;
        const changeFromNum2 = Number(order.change_from) || 0;
        const hasChange2 = changeFromNum2 > orderTotalNum2;
        const changeAmountVal2 = hasChange2 ? changeFromNum2 - orderTotalNum2 : 0;
        html += `<div class="shop-order-details-section shop-order-summary">`;
        html += `<div class="shop-order-summary-title">Суммы:</div>`;
        if (order.payment_title) {
          html += `<div class="shop-order-summary-row">`;
          html += `<span class="shop-order-summary-label">Оплата</span>`;
          html += `<span class="shop-order-summary-value">${escapeHtml(order.payment_title)}</span>`;
          html += `</div>`;
        }
        if (hasChange2) {
          html += `<div class="shop-order-summary-row">`;
          html += `<span class="shop-order-summary-label">Сдача с</span>`;
          html += `<span class="shop-order-summary-value">${money(order.change_from)}</span>`;
          html += `</div>`;
          html += `<div class="shop-order-summary-row">`;
          html += `<span class="shop-order-summary-label">Сдача</span>`;
          html += `<span class="shop-order-summary-value">${money(changeAmountVal2)}</span>`;
          html += `</div>`;
        }
        html += `<div class="shop-order-summary-row">`;
        html += `<span class="shop-order-summary-label">Доставка</span>`;
        html += `<span class="shop-order-summary-value">${money(order.delivery_cost || 0)}</span>`;
        html += `</div>`;
        html += `<div class="shop-order-summary-divider"></div>`;
        html += `<div class="shop-order-summary-total-row">`;
        html += `<span class="shop-order-summary-total-label">ИТОГО</span>`;
        html += `<span class="shop-order-summary-total-value">${money(order.total_price || 0)}</span>`;
        html += `</div>`;
        html += `<div class="shop-order-summary-thanks">Спасибо за заказ!</div>`;
        html += `</div>`;
        
        // Пустое поле 200px внизу для скролла
        html += `<div style="height: 200px;"></div>`;
        
        html += `</div>`;
        
        wrap.innerHTML = html;
        
        // Кнопка "Назад" уже настроена в хедере выше
      } catch (e) {
        console.error("Failed to load order details:", e);
        wrap.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">Не удалось загрузить детали заказа</div>`;
      }
    }

    // Обработчик клика на десктоп бейдж
    if (elActiveOrdersBadge) {
      elActiveOrdersBadge.addEventListener("click", handleActiveOrdersBadgeClick);
    }

    // Обработчик клика на мобильный бейдж (старый)
    if (elActiveOrdersBadgeMobile) {
      elActiveOrdersBadgeMobile.addEventListener("click", handleActiveOrdersBadgeClick);
    }
    
    // Обработчик клика на приоткрытый bottom sheet
    if (elActiveOrdersSheetCollapsed) {
      elActiveOrdersSheetCollapsed.addEventListener("click", handleActiveOrdersBadgeClick);
    }

    // Обновляем бейдж при загрузке и периодически
    if (elActiveOrdersBadge || elActiveOrdersBadgeMobile) {
      updateActiveOrdersBadge();
      // Обновляем каждые 30 секунд
      setInterval(updateActiveOrdersBadge, 30000);
      
      // Обновляем при возврате на страницу
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          updateActiveOrdersBadge();
        }
      });
      
      // Обновляем при изменении URL (для SPA навигации)
      let lastPathname = window.location.pathname;
      const checkPathnameChange = () => {
        const currentPathname = window.location.pathname;
        if (currentPathname !== lastPathname) {
          lastPathname = currentPathname;
          updateActiveOrdersBadge();
        }
      };
      
      // Проверяем изменение URL периодически (для SPA)
      setInterval(checkPathnameChange, 500);
      
      // Также слушаем события popstate (кнопка назад/вперед)
      // Примечание: основной обработчик popstate для bottom sheets добавлен в секции Nav выше
      // Здесь только обновляем бейдж, если не обработали bottom sheet
      window.addEventListener("popstate", () => {
        // Если bottom sheet не был обработан, просто обновляем бейдж
        if (!(window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen())) {
          updateActiveOrdersBadge();
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}
  init();
})();
