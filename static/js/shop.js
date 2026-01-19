(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  const elCategoryTitle =
    $("#shopCategoryTitle") ||
    $("#shopToolbarTitle") ||
    $("[data-shop-category-title]");

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

  const elNavCartBadge = $("#shopNavCartBadge") || $("#shopCartBadge");
  const elCartOpenDesktop = $("#shopCartOpenDesktopBtn");

  // header profile (у тебя в header.ejs есть id)
  const elHeaderProfileBtn = $("#shopProfileBtn");

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

  const tenantId = getTenantId();
  const CART_KEY = `shop_cart_t${tenantId}`;
  const FAV_KEY = `shop_fav_t${tenantId}`;
  const LAST_ORDER_KEY = `shop_last_order_public_t${tenantId}`;
  const CHECKOUT_DRAFT_KEY = `shop_checkout_draft_t${tenantId}`;
  const ADDRESS_DRAFT_KEY = `shop_address_draft_t${tenantId}`;

  const CUSTOMER_TOKEN_KEY = `shop_customer_token_t${tenantId}`;
  const CUSTOMER_CACHE_KEY = `shop_customer_cache_t${tenantId}`;

  // -----------------------------
  // Format helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function moneyNoSign(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0);
  }

  function str(v) {
    return v === undefined || v === null ? "" : String(v);
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
    activeCategoryTitle: "Все товары",
    products: [],
    productCache: new Map(),
    cart: loadCart(),
    optionGroupCache: new Map(),
    productOptionsCache: new Map(),
    unitConversions: [],

    // addresses (cart header chip)
    addresses: [],
    selectedAddress: null,
    addressEditingId: null,
    _addressFormBackMode: null,
    _addressListBackMode: null,
  };

  let openCartSheetCtx = null;
  let openProductCtx = null;
  let cartViewMode = "cart";
  let previousPanelMode = "cart";
  let previousPanelProductId = null;

  function normalizeCart(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
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
            }))
            : normalizedOptionIds.map((id) => ({
              id,
              title: "",
              price: 0,
              qty: 1,
            }));
          return {
            key: makeCartKey(productId, normalizedOptionItems, [], {
              group_id: item.variant_group_id,
              value_index: item.variant_value_index,
            }),
            product_id: productId,
            qty,
            option_item_ids: normalizedOptionItems.map((opt) => opt.id),
            option_items: normalizedOptionItems,
            variant_group_id: Number(item.variant_group_id ?? null),
            variant_value_index: Number.isFinite(Number(item.variant_value_index))
              ? Number(item.variant_value_index)
              : null,
            variant_label: str(item.variant_label || ""),
            variant_unit_price: Number(item.variant_unit_price || 0),
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

  function makeCartKey(productId, optionItemsOrIds, ingredients = [], variantSelection = null) {
    const entries = (Array.isArray(optionItemsOrIds) ? optionItemsOrIds : [])
      .map((opt) => {
        if (typeof opt === "number") return { id: opt, qty: 1 };
        if (!opt || typeof opt !== "object") return null;
        const id = Number(opt.id);
        if (!Number.isFinite(id)) return null;
        const qty = Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1;
        return { id, qty };
      })
      .filter(Boolean)
      .sort((a, b) => a.id - b.id);
    const optionPart = entries.map((entry) => `${entry.id}${entry.qty !== 1 ? `x${entry.qty}` : ""}`).join(",");
    
    // Добавляем ингредиенты в ключ для различения составов
    const ingEntries = (Array.isArray(ingredients) ? ingredients : [])
      .map((ing) => {
        const id = Number(ing.ingredient_id || ing.id);
        const qty = Number(ing.quantity || ing.qty || 1);
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

  function cartLinePrice(product, optionItems) {
    return Number(product?.price || 0) + optionItemsTotal(optionItems);
  }

  function formatOptionTitles(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items.map((opt) => str(opt.title || opt.name || "")).filter(Boolean).join(", ");
  }

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

  // Product: показать ←/♡, скрыть ×, скрыть title
  backBtn.classList.toggle("hidden", !isProduct);
  favBtn.classList.toggle("hidden", !isProduct);

  if (closeBtn) closeBtn.classList.toggle("hidden", isProduct);
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
      btnDel.innerHTML = `<i class="fas fa-times"></i>`;
      btnDel.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!window.confirm("Удалить адрес?")) return;

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
          if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
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

          if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
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
      const img = document.createElement("img");
      img.className = "shop-cat-icon-img";
      img.alt = "";
      img.src = v;
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

  function renderCategories() {
    elCatsList.innerHTML = "";

    state.categories.forEach((c) => {
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
    const price = calculatedPrice != null ? calculatedPrice : Number(product.price || 0);
    const showOld = old > 0 && old > price;

    if (qty > 0) return `${moneyNoSign(price)} ₽`;
    if (showOld) return `<span class="old">${moneyNoSign(old)} ₽</span>${moneyNoSign(price)} ₽`;
    return `${moneyNoSign(price)} ₽`;
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
      
      // Если есть варианты, берём цену первого варианта по умолчанию
      if (variants.length > 0 && variants[0].values?.length > 0) {
        const variantState = {
          selectedIndex: 0,
          value: variants[0].values[0],
          label: String(variants[0].values[0]),
        };
        price = getVariantUnitPrice(product, variants, variantState);
      }

      // Загружаем опции
      const optionGroups = await resolveProductOptionGroups(productId);
      
      // Добавляем стоимость обязательных опций по умолчанию
      for (const group of optionGroups) {
        if (group.is_required && group.items?.length > 0) {
          // Берём первый элемент как дефолтный для обязательной опции
          const defaultItem = group.items[0];
          if (defaultItem?.price) {
            price += Number(defaultItem.price || 0);
          }
        }
      }
    } catch (e) {
      console.error("Error calculating default price:", e);
    }

    // Сохраняем в кэш
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

    if (!state.products.length) {
      if (elProductsEmpty) elProductsEmpty.classList.remove("hidden");
    } else {
      if (elProductsEmpty) elProductsEmpty.classList.add("hidden");
    }

    state.products.forEach((p) => {
      const id = p.id;
      const qty = cartQty(id);
      const photos = safePhotos(p);
      const mainPhoto = photos[0] || "";

      const card = document.createElement("article");
      card.className = "sp-card";
      card.setAttribute("data-product-id", String(id));
      card.setAttribute("data-qty", String(qty));
      if (qty > 0) card.classList.add("is-in-cart");

      const media = document.createElement("div");
      media.className = "sp-media";

      const img = document.createElement("img");
      img.className = "sp-img";
      img.alt = "";
      img.src = mainPhoto || "/static/img/placeholder.png";
      img.loading = "lazy";
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
        variant: "buy",
        centerHtml: catalogCenterHtml(p, qty),
        minusEnabled: qty > 0,
      });

      if (qty <= 0) pill.classList.add("is-empty");
      else pill.classList.add("has-qty");

      bottom.appendChild(pill);
      info.appendChild(bottom);
      card.appendChild(info);

      btnPlus.addEventListener("click", async (e) => {
        e.stopPropagation();
        // Всегда открываем карточку товара при нажатии +
        await openProductDetails(id);
      });

      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(id, -1);
      });

      card.addEventListener("click", () => openProductDetails(id));

      elProductsGrid.appendChild(card);
      applyCardState(card, p, qty, null);
      
      // Асинхронно обновляем цену с учётом вариантов и опций по умолчанию
      updateCardPrice(card, p);
    });

    updateCartBadge();
  }

  function applyCardState(card, product, qty, dir) {
    const media = $(".sp-media", card);
    const overlay = $(".sp-qtyOverlay", card);
    const qtyBox = $(".qty-carousel", card);

    const pill = $(".qty-pill", card);
    const btnMinus = $(".qty-pill__btn--minus", card);
    const center = $(".qty-pill__center", card);

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
    }
    if (btnMinus) btnMinus.classList.toggle("is-disabled", qty <= 0);
    if (center) {
      // Используем кэшированную цену если есть
      const cachedPrice = defaultPriceCache.get(product.id);
      center.innerHTML = catalogCenterHtml(product, qty, cachedPrice);
    }
  }

  // -----------------------------
  // Cart render
  // -----------------------------
  function renderCartInto(listEl, totalEl, emptyPlaceholderEl) {
    const items = cartItemsResolved();
    if (listEl) listEl.innerHTML = "";

    if (!items.length) {
      if (emptyPlaceholderEl) emptyPlaceholderEl.classList.remove("hidden");
      else if (listEl) listEl.innerHTML = `<div class="shop-cart-empty-sheet">В корзине пусто</div>`;
      if (totalEl) totalEl.textContent = money(0);
      return { items, total: 0 };
    }

    if (emptyPlaceholderEl) emptyPlaceholderEl.classList.add("hidden");

    let total = 0;

    items.forEach(({ product, qty, key, option_items: optionItems, ingredients: cartIngredients, ingredient_price_diff = 0, variant_label: variantLabel, variant_unit_price: variantUnitPrice }) => {
      const old = Number(product.old_price || 0);
      const basePrice = Number(variantUnitPrice || product.price || 0);
      const optionTotal = optionItemsTotal(optionItems);
      const ingredientPriceDiff = Number(ingredient_price_diff || 0);
      const price = basePrice + optionTotal + ingredientPriceDiff;
      total += price * qty;

      const row = document.createElement("div");
      row.className = "cart-row";
      row.setAttribute("data-product-id", String(product.id));
      row.setAttribute("data-cart-key", String(key || ""));
      row.addEventListener("click", () => openProductDetails(product.id, { cartKey: key }));

      const photos = safePhotos(product);
      const mainPhoto = photos[0] || "";

      const img = document.createElement("img");
      img.className = "cart-thumb";
      img.alt = "";
      img.src = mainPhoto || "/static/img/placeholder.png";
      row.appendChild(img);

      const mid = document.createElement("div");
      mid.className = "cart-mid";

      const t = document.createElement("div");
      t.className = "cart-title";
      t.textContent = str(product.name);
      mid.appendChild(t);

      const sub = document.createElement("div");
      sub.className = "cart-sub";
      
      // Формируем строку: ингредиенты + опции через запятую
      const parts = [];
      
      // Добавляем ингредиенты с названиями
      if (Array.isArray(cartIngredients) && cartIngredients.length > 0) {
        cartIngredients.forEach(ing => {
          const name = str(ing.ingredient_name || "");
          const qty = Number(ing.quantity || 1);
          const unit = str(ing.unit_label || "");
          if (name) {
            parts.push(`${name}: ${qty}${unit ? ` ${unit}` : ""}`);
          }
        });
      }
      
      // Добавляем опции
      const optionText = formatOptionTitles(optionItems);
      if (optionText) {
        parts.push(optionText);
      }

      if (variantLabel) {
        parts.push(variantLabel);
      }
      
      sub.textContent = parts.join(", ");
      mid.appendChild(sub);

      const q = document.createElement("div");
      q.className = "cart-qty";

      const { pill, btnMinus, btnPlus, center } = createQtyPill({
        variant: "muted",
        centerText: String(qty),
        minusEnabled: qty > 0,
      });

      btnPlus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(product.id, +1, null, key);
        center.textContent = String(getCartItemByKey(key)?.qty || 0);
      });
      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(product.id, -1, null, key);
        center.textContent = String(getCartItemByKey(key)?.qty || 0);
      });

      q.appendChild(pill);
      mid.appendChild(q);
      row.appendChild(mid);

      const right = document.createElement("div");
      right.className = "cart-right";

      const showOld = old > 0 && old > basePrice;

      const oldEl = document.createElement("div");
      oldEl.className = "cart-old";
      oldEl.textContent = showOld ? moneyNoSign((old + optionTotal) * qty) : "";
      if (!showOld) oldEl.classList.add("hidden");

      const pr = document.createElement("div");
      pr.className = "cart-price";
      pr.textContent = money(price * qty);

      right.appendChild(oldEl);
      right.appendChild(pr);
      row.appendChild(right);

      listEl.appendChild(row);
    });

    if (totalEl) totalEl.textContent = money(total);
    return { items, total };
  }

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
    saveCart();
    renderProducts();
    renderCart();
    updateCartBadge();

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
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
      };
      state.cart.push(item);
    }

    if (item) {
      const prevQty = Number(item.qty || 0);
      nextQty = Math.max(0, prevQty + delta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        state.cart = state.cart.filter((x) => x.key !== targetKey);
      }
    }

    saveCart();

    const card = elProductsGrid.querySelector(`.sp-card[data-product-id="${pid}"]`);
    const p = state.productCache.get(pid);
    if (card && p) applyCardState(card, p, cartQty(pid), delta > 0 ? "inc" : "dec");

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
    state.activeCategoryId = Number(categoryId);
    state.activeCategoryTitle = str(title || "Категория");
    if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;

    $$(".shop-cat-item", elCatsList).forEach((x) => {
      const id = Number(x.getAttribute("data-cat-id"));
      x.classList.toggle("is-active", id === state.activeCategoryId);
    });

    await loadProducts();
    renderProducts();
    await warmupCartProducts();
    renderCart();
  }

  async function loadCategories() {
    const json = await apiJson("/api/public/categories");
    state.categories = Array.isArray(json.data) ? json.data : [];

    const hasAll = state.categories.some((c) => c.code === "all");
    if (!hasAll) {
      state.categories.unshift({ id: 0, title: "Все товары", icon: null, code: "all" });
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
    if (discountPercent > 0) {
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

  async function loadProducts() {
    const cid = state.activeCategoryId ?? 0;
    const url =
      cid && cid !== 0
        ? `/api/public/products?category_id=${encodeURIComponent(cid)}`
        : `/api/public/products?category_code=all`;

    const json = await apiJson(url);
    state.products = Array.isArray(json.data) ? json.data : [];

    // ВАЖНО: не очищаем productCache при смене категории.
    // Корзина рендерится из productCache, поэтому очистка приводила к тому,
    // что товары вне выбранной категории «пропадали» из корзины.
    for (const p of state.products) {
      if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
      state.productCache.set(Number(p.id), p);
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
    state.productCache.set(id, p);
    return p;
  }

  async function loadProductOptionAssignments(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return [];
    if (state.productOptionsCache.has(pid)) return state.productOptionsCache.get(pid);
    try {
      const json = await apiJson(`/api/admin/products/${pid}/option-assignments`);
      const list = Array.isArray(json.data) ? json.data : [];
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
      const json = await apiJson(`/api/admin/options/groups/${gid}`);
      const details = json.data || null;
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
    if (!group || group.selection_type !== "multiple") return "single";
    const items = Array.isArray(group.items) ? group.items : [];
    const hasItemLimits = items.some((item) => {
      const min = item.qty_min ?? 1;
      const max = item.qty_max ?? 1;
      return min !== 1 || max !== 1;
    });
    return hasItemLimits ? "multiple_item" : "multiple_group";
  }

  function collectSelectedOptionItems(optionGroups, selectionState) {
    const selectedItems = [];
    optionGroups.forEach((group) => {
      const state = selectionState.get(group.id);
      if (!state) return;
      const itemsById = new Map((group.items || []).map((item) => [Number(item.id), item]));
      if (state.type === "single") {
        const item = itemsById.get(Number(state.selectedId));
        if (item) selectedItems.push({ id: item.id, title: item.title, price: item.price, qty: 1 });
        return;
      }
      if (state.type === "multiple_group") {
        state.selectedIds.forEach((id) => {
          const item = itemsById.get(Number(id));
          if (item) selectedItems.push({ id: item.id, title: item.title, price: item.price, qty: 1 });
        });
        return;
      }
      if (state.type === "multiple_item") {
        state.qtyById.forEach((qty, id) => {
          const item = itemsById.get(Number(id));
          if (item && qty > 0) selectedItems.push({ id: item.id, title: item.title, price: item.price, qty });
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

    const groupSelectionType = assignment.selection_type || details?.group?.selection_type || "single";

    groups.push({
      id: Number(assignment.group_id),
      title: str(assignment.title || details?.group?.title || ""),
      selection_type: groupSelectionType,
      min_select: assignment.min_select ?? details?.group?.min_select ?? 0,
      max_select: assignment.max_select ?? details?.group?.max_select ?? null,

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

        return {
          id: Number(item.id),
          title: str(item.product_name || item.name || ""),
          price: getOptionItemPrice(item),
          qty_min: item.qty_min ?? 1,
          qty_max: item.qty_max ?? 1,
          photo,
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

  const img = document.createElement("img");
  img.className = "shop-product-hero-image";
  img.src = photos[0] || "/static/img/placeholder.png";
  img.alt = "";
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

  // === ДОБАВИЛИ: базовая цена товара (без опций) ===
  const basePrice = document.createElement("div");
  basePrice.className = "shop-pd-baseprice";
  basePrice.textContent = money(product.price || 0);

  // === ДОБАВИЛИ: короткое описание под ценой (если есть) ===
  const shortDescText = str(product.description_short || "").trim();
  const shortDesc = document.createElement("div");
  shortDesc.className = "shop-pd-short";
  if (shortDescText) shortDesc.textContent = shortDescText;

  meta.appendChild(title);
  meta.appendChild(basePrice);
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

    if (Number.isFinite(variantState.selectedIndex) && !variantState.label) {
      setSelectedIndex(variantState.selectedIndex);
    } else if (!Number.isFinite(variantState.selectedIndex) && values.length) {
      setSelectedIndex(0);
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

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";

          const thumb = document.createElement(
            selected?.photo ? "img" : "div"
          );
          thumb.className = "shop-pd-option-thumb";
          if (selected?.photo) thumb.src = selected.photo;
          else thumb.textContent = "—";
          card.appendChild(thumb);

          const info = document.createElement("div");
          info.className = "shop-pd-option-info";
          info.innerHTML = `
            <div class="shop-pd-option-name">
              ${selected ? str(selected.title) : "Выбрать"}
            </div>
            ${
              selected
                ? `<div class="shop-pd-option-price">${money(
                    selected.price || 0
                  )}</div>`
                : ""
            }
          `;
          card.appendChild(info);

          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "btn btn-link shop-pd-option-edit";
          edit.textContent = "Изменить >";
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
          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          card.addEventListener("click", () => {
            groupState.selectedId = Number(item.id);
            renderSlot();
            closeList();
            if (onSelectionChange) onSelectionChange();
          });

          card.innerHTML = `
            ${
              item.photo
                ? `<img class="shop-pd-option-thumb" src="${item.photo}">`
                : `<div class="shop-pd-option-thumb">—</div>`
            }
            <div class="shop-pd-option-info">
              <div class="shop-pd-option-name">${str(item.title)}</div>
              <div class="shop-pd-option-price">${money(item.price || 0)}</div>
            </div>
          `;
          list.appendChild(card);
        });

        renderSlot();
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

    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const state = ingredientState?.get(ingId) || {
        quantity: Number(ing.quantity || 1),
      };

      // Получаем min/max/step из данных ингредиента
      const defaultQty = Number(ing.quantity || 1);
      const min = ing.quantity_min != null ? Number(ing.quantity_min) : defaultQty;
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      
      // Начальное количество: берем из state или из ing.quantity, затем ограничиваем и округляем до шага
      let initialQty = isVariable ? (state.quantity || defaultQty) : defaultQty;
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
      const baseQty = Number(ing.quantity || 1);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const baseTotalPrice = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      
      // Разница от базового состава
      const totalPrice = currentTotalPrice - baseTotalPrice;

      const block = document.createElement("div");
      block.className = "shop-pd-ingredient-block";
      block.setAttribute("data-ingredient-id", ingId);

      const photo = document.createElement("div");
      photo.className = "shop-pd-ingredient-photo";
      if (ing.ingredient_photos && ing.ingredient_photos.length > 0) {
        const img = document.createElement("img");
        img.src = ing.ingredient_photos[0];
        img.alt = "";
        photo.appendChild(img);
      } else {
        photo.textContent = "📷";
      }

      const info = document.createElement("div");
      info.className = "shop-pd-ingredient-info";

      const name = document.createElement("div");
      name.className = "shop-pd-ingredient-name";
      name.textContent = ing.ingredient_name || "";

      if (isVariable) {
        // Variable ingredient - show controls
        const controls = document.createElement("div");
        controls.className = "shop-pd-ingredient-controls";

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
        priceInfo.className = "shop-pd-ingredient-price";
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
        info.appendChild(controls);

        // Handlers
        btnMinus.addEventListener("click", () => {
          // Берем актуальное значение из state, а не из замыкания
          const currentStateQty = state.quantity || currentQty;
          let newQty = currentStateQty - step;
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

        btnPlus.addEventListener("click", () => {
          // Берем актуальное значение из state, а не из замыкания
          const currentStateQty = state.quantity || currentQty;
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
        qtyInfo.className = "shop-pd-ingredient-qty-fixed";
        qtyInfo.textContent = `${currentQty} ${unitLabel}`;

        const priceInfo = document.createElement("div");
        priceInfo.className = "shop-pd-ingredient-price";
        priceInfo.innerHTML = `
          <div class="ingredient-total">+${money(totalPrice)}</div>
        `;

        info.appendChild(name);
        info.appendChild(qtyInfo);
        info.appendChild(priceInfo);
      }

      block.appendChild(photo);
      block.appendChild(info);

      ingredientsWrap.appendChild(block);
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

  return { wrap, actionBtn, qtyWrap, basePriceEl: basePrice };
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

  const img = document.createElement("img");
  img.className = "shop-product-hero-image";
  img.src = images[0] || "";
  img.alt = product.title || "";

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
    const defaultQty = Number(ing.quantity || 1);
    const min = ing.quantity_min != null ? Number(ing.quantity_min) : defaultQty;
    const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
    const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
    const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
    
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
        
        const defaultQty = Number(ing.quantity || 1);
        const min = ing.quantity_min != null ? Number(ing.quantity_min) : defaultQty;
        const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
        const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
        
        // Берем количество из корзины, нормализуем до допустимого (кратное шагу от min)
        let qty = Number(cartIng.quantity || 1);
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

optionGroups.forEach((group) => {
  const type = getOptionGroupUiType(group);

  const stateEntry = {
    type,
    selectedId: null,
    selectedIds: new Set(),
    qtyById: new Map(),
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
      const q = editOptionQty.get(id) || (editOptionIds.has(id) ? 1 : 0);
      if (q > 0) stateEntry.qtyById.set(id, q);
    });
  }

  selectionState.set(group.id, stateEntry);
});

  // qty pill UI
  const qtyPill = createQtyPill({
    variant: "buy",
    big: true,
    centerText: String(qty),
  });

  const updateQtyUi = () => {
    if (qtyPill?.center) qtyPill.center.textContent = String(qty);
    // минус блокируем визуально на 1
    if (qtyPill?.btnMinus) {
      qtyPill.btnMinus.classList.toggle("is-disabled", qty <= 1);
    }
  };

  let actionBtnRef = null;
  let basePriceElRef = null;

  // Рассчитывает цену базовых ингредиентов (по ing.quantity из БД)
  const calculateBaseIngredientPrice = () => {
    let total = 0;
    ingredients.forEach(ing => {
      const baseQty = ing.quantity || 1; // Базовое количество из БД
      
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
      const currentQty = state ? (state.quantity || Number(ing.quantity || 1)) : Number(ing.quantity || 1);
      const baseQty = Number(ing.quantity || 1); // Базовое количество из БД
      
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

  const updateActionText = () => {
    if (!actionBtnRef) return;

    const selectedItems = collectSelectedOptionItems(optionGroups, selectionState);
    const optionTotal = optionItemsTotal(selectedItems);
    const variantUnitPrice = getVariantUnitPrice(product, variants, variantState);
    const basePrice = Number(variantUnitPrice || 0) + optionTotal;
    const ingredientsPriceDiff = calculateIngredientPrice(); // Разница от базового состава
    const unitPrice = basePrice + ingredientsPriceDiff;

    // total = unit * qty
    const totalPrice = unitPrice * Number(qty || 1);

    const label = editMode ? "Сохранить" : "Добавить";

    // разметка как у "Оформить": текст + span суммы
    actionBtnRef.innerHTML = `${label} <span class="shop-checkout-total shop-pd-action-price">${money(totalPrice)}</span>`;

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
      
      const min = ing.quantity_min != null ? Number(ing.quantity_min) : Number(ing.quantity || 1);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : Number(ing.quantity || 1);
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      let currentQty = state.quantity || Number(ing.quantity || 1);
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
      const baseQty = Number(ing.quantity || 1);
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
    if (qty <= 1) return;
    qty -= 1;
    updateQtyUi();
    updateActionText();
  };

  const onQtyPlus = () => {
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
      onSelectionChange: updateActionText,
      onIngredientChange,
      onVariantChange: updateActionText,
      qtyPill,
      onQtyMinus,
      onQtyPlus,
    }
  );

  actionBtnRef = actionBtn;
  basePriceElRef = basePriceEl;
  ingredientsWrapRef = wrap.querySelector(".shop-pd-ingredients");

  updateQtyUi();
  updateActionText();

  container.appendChild(wrap);

  actionBtn.addEventListener("click", () => {
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
    const ingredientQuantities = [];
    ingredients.forEach(ing => {
      const state = ingredientState.get(Number(ing.ingredient_id));
      if (state && state.quantity !== undefined) {
        const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
        ingredientQuantities.push({
          ingredient_id: Number(ing.ingredient_id),
          quantity: state.quantity,
          ingredient_name: ing.ingredient_name || "",
          unit_label: unitLabel,
        });
      }
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
        });
      }
    }

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

  // -----------------------------
  // Shop sheets
  // -----------------------------
  function closeShopSheetIfOpen() {
    if (!window.AppModal) return;
    if (window.AppModal.isOpen()) window.AppModal.close("sheet");
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

  state.categories.forEach((c) => {
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

  setAppModalMode("shop");
  window.AppModal.open({
    title: "Категории",
    content: wrap, // <-- важно: передаём wrap, чтобы был padding/scroll
    onClose: () => {
      // после закрытия шита возвращаемся в "Главная" (каталог)
      setActiveNav("menu");
    },
  });
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

  // ===== helpers title =====
  function applySheetAddressTitle() {
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
        showSheetAddressList();
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

  setAppModalMode("shop");
  window.AppModal.open({
    title: "Введите адрес",
    content: wrap,
    onClose: () => {
      openCartSheetCtx = null;
      if (window.AppModal?.body) window.AppModal.body.classList.remove("shop-cart-sheet-body");
      openProductCtx = null;

      clearSheetAddressTitleMode();

      // bottom nav: после закрытия возвращаем "Главная"
      if (typeof setActiveNav === "function") setActiveNav("menu");
    },
  });

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
    showSheetProduct,
  };

  setCartSheetFooterMode(openCartSheetCtx, items.length ? "cart" : "hidden");
  attachTwoStepClear(clearBtn, () => clearCartAll());

  let sheetEditingId = null;

  async function showSheetCheckout() {
    checkoutWrap.classList.remove("hidden");
    list.classList.add("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "checkout");

    // title = адрес, без стрелок/иконок
    clearSheetAddressTitleMode();
    applySheetAddressTitle();

    // обычный режим шапки (крестик есть)
    setSheetHeaderMode("cart");

    // Создаем контент оформления заказа
    await openCheckoutView({
      container: checkoutWrap,
      onBack: showSheetCart,
      hasAddressEditor: true,
      isSheet: true,
      actions: { submitBtn: submitBtn, backBtn: backBtn },
    });
  }

  function showSheetCart() {
    checkoutWrap.classList.add("hidden");
    list.classList.remove("hidden");
    addressWrap.classList.add("hidden");
    productWrap.classList.add("hidden");

    const hasItems = cartItemsResolved().length > 0;
    setCartSheetFooterMode(openCartSheetCtx, hasItems ? "cart" : "hidden");
    if (openCartSheetCtx?.checkoutBtn) {
      openCartSheetCtx.checkoutBtn.disabled = !hasItems;
    }

    clearSheetAddressTitleMode();
    applySheetAddressTitle();

    // cart mode header: вернуть ×, убрать ←/♡
    setSheetHeaderMode("cart");

    openProductCtx = null;
  }

  function showSheetAddressList() {
    checkoutWrap.classList.add("hidden");
    list.classList.add("hidden");
    addressWrap.classList.remove("hidden");
    addressListView.classList.remove("hidden");
    addressFormView.classList.add("hidden");
    productWrap.classList.add("hidden");

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");

    renderSheetAddressList();
  }

  function showSheetAddressForm(prefill, editingId) {
    sheetEditingId = editingId ? Number(editingId) : null;

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

    setCartSheetFooterMode(openCartSheetCtx, "hidden");

    clearSheetAddressTitleMode();
    if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");

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
    setSheetHeaderMode("product", { onBack: showSheetCart });

    renderProductDetailsInto(productWrap, product, { onBack: showSheetCart, cartKey });
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
      showSheetAddressForm(a, token ? a.id : null);
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
          if (!getSelectedAddressLine()) showSheetCart();
        } catch (err) {
          alert("Не удалось удалить адрес");
        }
        return;
      }

      // guest
      clearAddressDraft();
      setSelectedAddress(null);
      renderSheetAddressList();
      showSheetCart();
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
          showSheetCart();
          return;
        }
        try {
          await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
          await refreshAddressState();
          updateAddressChip();
          showSheetCart();
        } catch (e) {
          alert("Не удалось выбрать адрес");
        }
        return;
      }

      // guest
      setSelectedAddress({ ...a, _local: true });
      syncSelectedAddressToCheckoutDraft();
      updateAddressChip();
      showSheetCart();
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

  addressNewBtn.addEventListener("click", () => showSheetAddressForm(null, null));

  const formGet = (k) => addressFormView.querySelector(`[data-a="${k}"]`);
  const saveBtn = formGet("save");
  const cancelBtn = formGet("cancel");

  cancelBtn?.addEventListener("click", () => showSheetAddressList());

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
      showSheetCart();
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
    window.AppModal.open({
      title: "Профиль",
      content: wrap,
    });
  }

  function buildProfileContent({ host, me, onLogout }) {
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
    nameValue.className = "shop-profile-line-value";

    const nameText = document.createElement("span");
    nameText.className = "shop-profile-name-text";
    nameText.textContent = str(me?.name || "—");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "control shop-profile-name-input hidden";
    nameInput.value = str(me?.name || "");

    const nameActions = document.createElement("div");
    nameActions.className = "shop-profile-name-actions hidden";

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

    addressFormToggle.addEventListener("click", () => {
      openProfileAddressForm(null);
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
            openProfileAddressForm(a);
          });
          actions.appendChild(bEdit);

          const bDel = document.createElement("button");
          bDel.type = "button";
          bDel.className = "shop-address-action-icon is-danger";
          bDel.title = "Удалить";
          bDel.innerHTML = `<i class="fas fa-times"></i>`;
          bDel.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!window.confirm("Удалить адрес?")) return;
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

          let itemsCount = 0;
          if (Array.isArray(o.items)) {
            o.items.forEach(it => { itemsCount += Number(it.qty || it.quantity || 0) || 0; });
          }

          row.innerHTML = `
            <div><strong>Заказ #${o.id}</strong> <span class="muted">• ${o.status_title || "—"}</span></div>
            <div class="muted">${new Date(o.created_at).toLocaleString("ru-RU")}</div>
            <div><strong>${money(o.total_price || 0)}</strong> <span class="muted">• позиций: ${itemsCount}</span></div>
          `;
          ordersList.appendChild(row);
        });
      } catch (e) {
        ordersList.innerHTML = `<div class="muted">Ошибка загрузки заказов</div>`;
      }
    }

    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const get = (k) => str($(`[data-a="${k}"]`, addressFormCard)?.value || "").trim();

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
      nameActions.classList.toggle("hidden", !isEditing);
      photoActions.classList.toggle("hidden", !isEditing);
      if (isEditing) {
        nameInput.value = currentName;
        setTimeout(() => nameInput.focus(), 0);
      }
    }

    setEditingMode(false);

    photoBtn.addEventListener("click", () => {
      if (!isEditing) return;
      photoInput.click();
    });

    photoRemoveBtn.addEventListener("click", async () => {
      if (!isEditing) return;
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
    });

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

    nameSave.addEventListener("click", async () => {
      const v = str(nameInput.value).trim();
      if (!v) {
        alert("Введите имя");
        return;
      }
      nameSave.disabled = true;
      nameSave.textContent = "Сохраняем…";
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
      }
    });

    nameCancel.addEventListener("click", () => {
      nameInput.value = currentName;
      setEditingMode(false);
    });

    reloadAddresses();
    reloadOrders();

    return {
      showEdit: () => setEditingMode(true),
      hideEdit: () => setEditingMode(false),
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

  async function openProfilePanel(meOverride, { forceOpen = false } = {}) {
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
    });

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

  async function openProfileSheet() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) {
      await openProfilePanel();
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
    openProfileModal(me);
  }

  function openProfileModal(me) {
    if (!window.AppModal) return;

    const wrap = document.createElement("div");
    wrap.className = "shop-profile-content";
    const ctx = buildProfileContent({
      host: wrap,
      me,
      onLogout: () => handleProfileLogout({ closeModal: true }),
    });

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
      },
    });
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

  function buildDropdown(options, value) {
    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-dropdown-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shop-checkout-select";

    const list = document.createElement("div");
    list.className = "shop-checkout-dropdown";

    let current = value || (options[0] ? options[0].code : "");

    function render() {
      const active = options.find(o => o.code === current) || options[0];
      btn.textContent = active ? active.title : "Выбрать";
      list.innerHTML = "";

      options.filter(o => o.code !== current).forEach(o => {
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

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      list.classList.toggle("is-open");
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
      setValue: (val) => {
        current = val;
        render();
      },
    };
  }

  function pickDefaultCode(options, preferred, fallback) {
    const arr = Array.isArray(options) ? options : [];
    if (preferred && arr.some(x => x.code === preferred)) return preferred;
    if (arr.length && arr[0].code) return arr[0].code;
    return fallback || null;
  }

  function getTodayDateString() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function extractTimeValue(raw) {
    const v = str(raw || "").trim();
    if (!v) return "";
    if (v.includes("T")) return v.split("T")[1]?.slice(0, 5) || "";
    if (v.includes(" ")) return v.split(" ")[1]?.slice(0, 5) || "";
    if (/^\d{1,2}:\d{2}/.test(v)) return v.slice(0, 5);
    return "";
  }

  async function openCheckoutView({ container, onBack, hasAddressEditor, isSheet, actions, onEditAddress }) {
    if (!container) return;

    const items = cartItemsResolved();
    if (!items.length) {
      alert("Корзина пуста");
      if (onBack) onBack();
      return;
    }

    const cfg = await getOrderConfig();
    const draft = loadCheckoutDraft();

    const me = await fetchMeSafe(); // если залогинен — подставим

    container.innerHTML = "";

    if (actions?.submitBtn) {
      actions.submitBtn.disabled = false;
      actions.submitBtn.textContent = "Заказать";
    }

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout";

    const title = document.createElement("div");
    title.className = "shop-checkout-title";
    title.textContent = "Ваш заказ:";
    wrap.appendChild(title);

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
    const name = document.createElement("input");
    name.className = "control shop-checkout-name";
    name.type = "text";
    name.value = me ? str(me.name || "") : (draft.customer_name || "");
    nameWrap.appendChild(nameLabel);
    nameWrap.appendChild(name);

    const phoneWrap = document.createElement("div");
    const phoneLabel = document.createElement("label");
    phoneLabel.className = "field-label";
    phoneLabel.textContent = "Телефон";
    const phone = document.createElement("input");
    phone.className = "control shop-checkout-phone";
    phone.type = "tel";
    phone.placeholder = "+7 (999) 000-00-00";
    phone.value = me ? formatPhonePlus7(me.phone || "") : (draft.customer_phone || "");
    if (me) phone.disabled = true;
    if (!me) {
      phone.addEventListener("input", () => enforcePhonePrefix(phone));
      phone.addEventListener("focus", () => enforcePhonePrefix(phone));
    }
    phoneWrap.appendChild(phoneLabel);
    phoneWrap.appendChild(phone);

    nameRow.appendChild(nameWrap);
    nameRow.appendChild(phoneWrap);
    wrap.appendChild(nameRow);

    const methods = (cfg.methods || []).map(x => ({ code: x.code, title: x.title }));
    const methodDefault = pickDefaultCode(methods, draft.method_code, "takeaway");
    const methodSelect = buildDropdown(methods, methodDefault);

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

    const methodRow = document.createElement("div");
    methodRow.className = "shop-checkout-grid-row shop-checkout-grid-row--two";
    methodRow.appendChild(methodWrap);
    methodRow.appendChild(addressWrap);
    wrap.appendChild(methodRow);

    function refreshAddressVisibility() {
      const v = methodSelect.getValue();
      const isDelivery = v === "delivery";
      addressWrap.style.display = isDelivery ? "" : "none";
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
    const timeDefault = pickDefaultCode(timeOptions, draft.time_option_code, "asap");
    const timeSelect = buildDropdown(timeOptions, timeDefault);
    wrap.appendChild(timeSelect.root);

    const timeInputWrap = document.createElement("div");
    timeInputWrap.className = "shop-checkout-time-input";

    const timeInput = document.createElement("input");
    timeInput.className = "control";
    timeInput.type = "time";
    timeInput.value = extractTimeValue(draft.scheduled_at);

    timeInputWrap.appendChild(timeInput);
    wrap.appendChild(timeInputWrap);

    function refreshTimeInputVisibility() {
      const v = timeSelect.getValue();
      const show = v === "at_time" || v === "on_date";
      timeInputWrap.style.display = show ? "" : "none";
    }
    timeSelect.root.addEventListener("change", refreshTimeInputVisibility);
    refreshTimeInputVisibility();

    const payments = (cfg.payments || []).map(x => ({ code: x.code, title: x.title }));
    const payDefault = pickDefaultCode(payments, draft.payment_code, "cash");
    const paySelect = buildDropdown(payments, payDefault);

    const changeOptions = [
      { code: "", title: "Сдача не нужна" },
      ...[500, 1000, 2000, 5000].map(v => ({ code: String(v), title: String(v) })),
    ];
    const changeDefault = draft.change_from ? String(draft.change_from) : "";
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

    const payRow = document.createElement("div");
    payRow.className = "shop-checkout-grid-row shop-checkout-grid-row--two";
    payRow.appendChild(payWrap);
    payRow.appendChild(changeWrap);
    wrap.appendChild(payRow);

    function refreshChangeVisibility() {
      changeWrap.style.display = (paySelect.getValue() === "cash") ? "" : "none";
    }
    paySelect.root.addEventListener("change", refreshChangeVisibility);
    refreshChangeVisibility();

    const promoLabel = document.createElement("label");
    promoLabel.className = "field-label";
    promoLabel.textContent = "Промокод";
    const promo = document.createElement("input");
    promo.className = "control";
    promo.type = "text";
    promo.placeholder = "";
    promo.value = draft.promo_code || "";
    wrap.appendChild(promoLabel);
    wrap.appendChild(promo);

    if (hasAddressEditor) {
      changeAddrBtn.addEventListener("click", () => {
        saveCheckoutDraft({
          promo_code: str(promo.value).trim() || null,
          customer_name: str(name.value).trim(),
          customer_phone: str(phone.value).trim(),
          method_code: methodSelect.getValue() || methodDefault || "takeaway",
          delivery_address: str(address.value).trim() || null,
          comment: str(comment.value).trim() || null,
          time_option_code: timeSelect.getValue() || timeDefault || "asap",
          scheduled_at: timeInput.value || "",
          payment_code: paySelect.getValue() || payDefault || "cash",
          change_from: changeSelect.getValue() ? Number(changeSelect.getValue()) : null,
        });
        if (typeof onEditAddress === "function") onEditAddress();
        else openAddressEditorFromCheckout();
      });
    }

    container.appendChild(wrap);

    if (actions?.backBtn && typeof onBack === "function") {
      actions.backBtn.onclick = () => onBack();
    }

    if (actions?.submitBtn) {
      actions.submitBtn.onclick = async () => {
      const payload = {
        customer_name: str(name.value).trim(),
        customer_phone: str(phone.value).trim(),
        promo_code: str(promo.value).trim() || null,
        method_code: methodSelect.getValue() || methodDefault || "takeaway",
        delivery_address: str(address.value).trim() || null,
        comment: str(comment.value).trim() || null,
        time_option_code: timeSelect.getValue() || timeDefault || "asap",
        scheduled_at: null,
        payment_code: paySelect.getValue() || payDefault || "cash",
        cutlery_qty: 0,
        change_from: changeSelect.getValue() ? Number(changeSelect.getValue()) : null,
        items: cartItemsResolved().map(x => ({
          product_id: x.product.id,
          qty: x.qty,
          option_item_ids: x.option_item_ids || [],
          option_items: x.option_items || [],
        })),
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

      if (payload.method_code === "delivery" && !payload.delivery_address) {
        alert("Введите адрес доставки");
        return;
      }

      if ((payload.time_option_code === "at_time" || payload.time_option_code === "on_date")) {
        if (!timeInput.value) {
          alert("Укажите время");
          return;
        }
        payload.scheduled_at = `${getTodayDateString()} ${timeInput.value}:00`;
      }

      saveCheckoutDraft({
        promo_code: payload.promo_code,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        method_code: payload.method_code,
        delivery_address: payload.delivery_address,
        comment: payload.comment,
        time_option_code: payload.time_option_code,
        scheduled_at: timeInput.value || "",
        payment_code: payload.payment_code,
        change_from: payload.change_from,
      });

      actions.submitBtn.disabled = true;
      actions.submitBtn.textContent = "Отправляем…";

      try {
        const res = await apiJson("/api/public/orders", { method: "POST", body: payload });

        if (res.data && res.data.public_id) {
          localStorage.setItem(LAST_ORDER_KEY, String(res.data.public_id));
        }

        clearCartAll();
        saveCheckoutDraft({});
        if (isSheet && window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
          window.AppModal.close("sheet");
        }
        window.location.href = "/shop";
      } catch (e) {
        console.error(e);
        alert("Ошибка оформления заказа: " + (e.message || "UNKNOWN"));
        actions.submitBtn.disabled = false;
        actions.submitBtn.textContent = "Заказать";
      }
      };
    }
  }

  // -----------------------------
  // Init
  // -----------------------------
async function init() {
  try {
    await loadCategories();
    await loadUnitConversions();
    renderCategories();

    const all = state.categories.find((c) => c.code === "all") || state.categories[0];
    state.activeCategoryId = all ? Number(all.id) : 0;
    state.activeCategoryTitle = all ? str(all.title) : "Все товары";
    if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;

    await loadProducts();
    renderProducts();
    await warmupCartProducts();
    renderCart();
    updateCartBadge();
    await initAddresses();

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
        openProductCtx = null;
        showCartView();
      });
    }

    // Nav
    if (elNavCategories) elNavCategories.addEventListener("click", openCategoriesSheet);
    if (elNavCart) elNavCart.addEventListener("click", openCartSheet);
    if (elNavProfile) elNavProfile.addEventListener("click", openProfileSheet);

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

        // на мобилке скролл обычно внутри панели каталога, а не window
        const scroller = document.querySelector(".shop-products-panel .panel-body");
        if (scroller && typeof scroller.scrollTo === "function") {
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
        if (String(window.location.pathname || "").startsWith("/shop")) {
          e.preventDefault();
          openProfileSheet();
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}
  init();
})();