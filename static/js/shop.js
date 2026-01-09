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

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return {};
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {}
  }

  function cartQty(productId) {
    return Number(state.cart[String(productId)] || 0);
  }

  function cartCountTotal() {
    let total = 0;
    for (const k of Object.keys(state.cart)) total += Number(state.cart[k] || 0);
    return total;
  }

  function cartItemsResolved() {
    const items = [];
    for (const k of Object.keys(state.cart)) {
      const pid = Number(k);
      const qty = Number(state.cart[k] || 0);
      if (!qty || !Number.isFinite(pid)) continue;
      const p = state.productCache.get(pid);
      if (p) items.push({ product: p, qty });
    }
    return items;
  }

  // -----------------------------
  // Cart warmup: ensure products for all cart items are in cache
  // (чтобы корзина не зависела от текущей выбранной категории)
  // -----------------------------
  async function warmupCartProducts() {
    const missing = [];
    for (const k of Object.keys(state.cart)) {
      const pid = Number(k);
      const qty = Number(state.cart[k] || 0);
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
    if (!elAddressChip) return;
    const line = getSelectedAddressLine();
    elAddressChip.textContent = line || "Введите адрес";
    elAddressChip.classList.toggle("chip-plus", !line);
    elAddressChip.title = line || "";
  }

  function setCartHeader({ title, showAddressChip = true, showProfileActions = false, showBack = false } = {}) {
    if (elCartHeaderTitle && typeof title === "string") {
      elCartHeaderTitle.textContent = title;
    }
    if (elAddressChip) elAddressChip.classList.toggle("hidden", !showAddressChip);
    if (elProfileHeaderActions) elProfileHeaderActions.classList.toggle("hidden", !showProfileActions);
    if (elCartBackBtn) elCartBackBtn.classList.toggle("hidden", !showBack);
    if (!showProfileActions && elProfileMenu) elProfileMenu.classList.add("hidden");
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
    if (elCartFooter) {
      // вернём как было: footer показывается только если корзина не пустая (renderCart решает)
      // тут ничего не делаем
    }
    setCartHeader({ title: "Корзина", showAddressChip: true, showProfileActions: false, showBack: false });
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
    setCartHeader({ title: "Корзина", showAddressChip: true, showProfileActions: false, showBack: false });
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

    setCartHeader({ title: "Введите адрес", showAddressChip: true, showProfileActions: false, showBack: false });
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

    setCartHeader({ title: "Введите адрес", showAddressChip: true, showProfileActions: false, showBack: false });
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

  function showProductView(title) {
    cartViewMode = "product";
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.add("hidden");
    if (elProductContent) elProductContent.classList.remove("hidden");
    setCartHeader({ title: title || "Товар", showAddressChip: false, showProfileActions: false, showBack: true });
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
        } else {
          btnDef.disabled = true;
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
    if (!elAddressChip || !elAddressContent) return;

    elAddressChip.addEventListener("click", async () => {
      await refreshAddressState();
      if (getSelectedAddressLine()) showAddressListView();
      else showAddressFormView(loadAddressDraft(), null, "cart");
    });

    if (elAddressNewBtn) {
      elAddressNewBtn.addEventListener("click", () => showAddressFormView(null, null, "list"));
    }

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
              await apiJson(`/api/public/me/addresses/${state.addressEditingId}`, { method: "PUT", body: payload });
            } else {
              await apiJson("/api/public/me/addresses", { method: "POST", body: { ...payload, is_default: 1 } });
            }
            await refreshAddressState();
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

  function catalogCenterHtml(product, qty) {
    const old = Number(product.old_price || 0);
    const price = Number(product.price || 0);
    const showOld = old > 0 && old > price;

    if (qty > 0) return `${moneyNoSign(price)} ₽`;
    if (showOld) return `<span class="old">${moneyNoSign(old)} ₽</span>${moneyNoSign(price)} ₽`;
    return `${moneyNoSign(price)} ₽`;
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

      btnPlus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(id, +1);
      });

      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(id, -1);
      });

      card.addEventListener("click", () => openProductDetails(id));

      elProductsGrid.appendChild(card);
      applyCardState(card, p, qty, null);
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
    if (center) center.innerHTML = catalogCenterHtml(product, qty);
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

    items.forEach(({ product, qty }) => {
      const old = Number(product.old_price || 0);
      const price = Number(product.price || 0);
      total += price * qty;

      const row = document.createElement("div");
      row.className = "cart-row";
      row.setAttribute("data-product-id", String(product.id));
      row.addEventListener("click", () => openProductDetails(product.id));

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
      sub.textContent = str(product.description_short || "");
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
        changeQty(product.id, +1);
        center.textContent = String(cartQty(product.id));
      });
      btnMinus.addEventListener("click", (e) => {
        e.stopPropagation();
        changeQty(product.id, -1);
        center.textContent = String(cartQty(product.id) || 0);
      });

      q.appendChild(pill);
      mid.appendChild(q);
      row.appendChild(mid);

      const right = document.createElement("div");
      right.className = "cart-right";

      const showOld = old > 0 && old > price;

      const oldEl = document.createElement("div");
      oldEl.className = "cart-old";
      oldEl.textContent = showOld ? moneyNoSign(old * qty) : "";
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
    if (elNavCartBadge) {
      elNavCartBadge.textContent = String(n);
      if (n > 0) elNavCartBadge.classList.remove("hidden");
      else elNavCartBadge.classList.add("hidden");
    }
    if (elCartOpenDesktop) {
      const b = $("#shopCartBadge", elCartOpenDesktop);
      if (b) {
        b.textContent = String(n);
        if (n > 0) b.classList.remove("hidden");
        else b.classList.add("hidden");
      }
    }
  }

  function clearCartAll() {
    state.cart = {};
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
  function changeQty(productId, delta, optionalCartNumEl) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return;

    const prev = cartQty(pid);
    const next = Math.max(0, prev + delta);

    if (next <= 0) delete state.cart[String(pid)];
    else state.cart[String(pid)] = next;

    saveCart();

    const card = elProductsGrid.querySelector(`.sp-card[data-product-id="${pid}"]`);
    const p = state.productCache.get(pid);
    if (card && p) applyCardState(card, p, next, delta > 0 ? "inc" : "dec");

    if (optionalCartNumEl) animateNumber(optionalCartNumEl, next || 0, delta > 0 ? "inc" : "dec");

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

    if (openProductCtx && Number(openProductCtx.productId) === pid) {
      const prod = state.productCache.get(pid);
      if (prod && openProductCtx.centerEl) {
        const q = cartQty(pid);
        openProductCtx.centerEl.innerHTML = pdCenterHtml(prod, q);
        if (openProductCtx.minusBtn) openProductCtx.minusBtn.classList.toggle("is-disabled", q <= 0);
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

  function pdCenterHtml(product, qty) {
    const old = Number(product.old_price || 0);
    const price = Number(product.price || 0);
    const showOld = old > 0 && old > price;

    if (qty > 0) return `${qty} × ${moneyNoSign(price)} ₽`;
    if (showOld) return `<span class="old">${moneyNoSign(old)} ₽</span>${moneyNoSign(price)} ₽`;
    return `${moneyNoSign(price)} ₽`;
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

  function buildProductDetailsContent(product, qty, { onBack } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "shop-pd";

    if (typeof onBack === "function") {
      const backRow = document.createElement("div");
      backRow.className = "shop-pd-back";
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "btn";
      backBtn.textContent = "Назад в корзину";
      backBtn.addEventListener("click", () => {
        onBack();
        openProductCtx = null;
      });
      backRow.appendChild(backBtn);
      wrap.appendChild(backRow);
    }

    const scroll = document.createElement("div");
    scroll.className = "shop-pd-scroll";

    const head = document.createElement("div");
    head.className = "shop-pd-head";

    const photos = safePhotos(product);
    const main = photos[0] || "";

    const img = document.createElement("img");
    img.className = "shop-pd-thumb";
    img.alt = "";
    img.src = main || "/static/img/placeholder.png";
    head.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "shop-pd-meta";

    const t = document.createElement("div");
    t.className = "shop-pd-title";
    t.textContent = str(product.name);
    meta.appendChild(t);

    if (product.description_short) {
      const s = document.createElement("div");
      s.className = "shop-pd-sub";
      s.textContent = str(product.description_short);
      meta.appendChild(s);
    }

    head.appendChild(meta);

    const prices = document.createElement("div");
    prices.className = "shop-pd-prices";

    const old = Number(product.old_price || 0);
    const showOld = old > 0 && old > Number(product.price || 0);

    const oldEl = document.createElement("div");
    oldEl.className = "shop-pd-old";
    oldEl.textContent = showOld ? money(old) : "";
    if (!showOld) oldEl.classList.add("hidden");

    const pr = document.createElement("div");
    pr.className = "shop-pd-price";
    pr.textContent = money(product.price);

    prices.appendChild(oldEl);
    prices.appendChild(pr);
    head.appendChild(prices);

    scroll.appendChild(head);

    if (product.description) {
      const d = document.createElement("div");
      d.className = "shop-pd-desc";
      d.textContent = str(product.description);
      scroll.appendChild(d);
    }

    wrap.appendChild(scroll);

    const footer = document.createElement("div");
    footer.className = "shop-pd-footer";

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "shop-pd-fav";
    favBtn.innerHTML = "<span aria-hidden=\"true\">♡</span>";

    const favs = loadFavs();
    if (favs.has(Number(product.id))) {
      favBtn.classList.add("is-active");
      favBtn.innerHTML = "<span aria-hidden=\"true\">♥</span>";
    }

    const { pill, btnMinus, btnPlus, center } = createQtyPill({
      variant: "buy",
      big: true,
      centerHtml: pdCenterHtml(product, qty),
      minusEnabled: qty > 0,
    });

    footer.appendChild(favBtn);
    footer.appendChild(pill);
    wrap.appendChild(footer);

    return { wrap, center, btnMinus, btnPlus, favBtn };
  }

  function renderProductDetailsInto(container, product, { onBack } = {}) {
    if (!container) return;
    const qty = cartQty(product.id);
    container.innerHTML = "";

    const { wrap, center, btnMinus, btnPlus, favBtn } = buildProductDetailsContent(product, qty, { onBack });
    container.appendChild(wrap);

    openProductCtx = { productId: product.id, centerEl: center, minusBtn: btnMinus };

    btnPlus.addEventListener("click", () => changeQty(product.id, +1));
    btnMinus.addEventListener("click", () => changeQty(product.id, -1));

    favBtn.addEventListener("click", () => {
      const set = loadFavs();
      if (set.has(Number(product.id))) set.delete(Number(product.id));
      else set.add(Number(product.id));
      saveFavs(set);

      const active = set.has(Number(product.id));
      favBtn.classList.toggle("is-active", active);
      favBtn.innerHTML = active ? "<span aria-hidden=\"true\">♥</span>" : "<span aria-hidden=\"true\">♡</span>";
    });
  }

  async function openProductDetails(productId) {
    const p = await ensureProduct(productId);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    if (isMobile) {
      if (!openCartSheetCtx) openCartSheet();
      if (openCartSheetCtx?.showSheetProduct) {
        openCartSheetCtx.showSheetProduct(p);
      }
      return;
    }

    showProductView(p.name);
    renderProductDetailsInto(elProductContent, p);
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

    setAppModalMode("shop");
    window.AppModal.open({
      title: "Категории",
      content: list,
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
    addressNewBtn.innerHTML = `<i class="fas fa-plus"></i> Новый адрес`;
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
    backBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;

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

    setAppModalMode("shop");
    window.AppModal.open({
      title: "Корзина",
      content: wrap,
      onClose: () => {
        openCartSheetCtx = null;
        if (window.AppModal?.body) window.AppModal.body.classList.remove("shop-cart-sheet-body");
        openProductCtx = null;
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

    function showSheetCheckout() {
      checkoutWrap.classList.remove("hidden");
      list.classList.add("hidden");
      addressWrap.classList.add("hidden");
      productWrap.classList.add("hidden");
      setCartSheetFooterMode(openCartSheetCtx, "checkout");
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Корзина");
    }

    function showSheetCart() {
      checkoutWrap.classList.add("hidden");
      list.classList.remove("hidden");
      addressWrap.classList.add("hidden");
      productWrap.classList.add("hidden");
      setCartSheetFooterMode(openCartSheetCtx, "cart");
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Корзина");
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
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");
      renderSheetAddressList();
    }

    function showSheetAddressForm(prefill, editingId) {
      sheetEditingId = editingId ? Number(editingId) : null;
      const get = (k) => addressFormView.querySelector(`[data-a="${k}"]`);
      const setVal = (k, v) => { const el = get(k); if (el) el.value = str(v || ""); };
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
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");
      setTimeout(() => { try { get("street")?.focus?.(); } catch {} }, 0);
    }

    function showSheetProduct(product) {
      checkoutWrap.classList.add("hidden");
      list.classList.add("hidden");
      addressWrap.classList.add("hidden");
      productWrap.classList.remove("hidden");
      setCartSheetFooterMode(openCartSheetCtx, "hidden");
      if (window.AppModal?.setTitle) window.AppModal.setTitle(str(product?.name || "Товар"));
      renderProductDetailsInto(productWrap, product, { onBack: showSheetCart });
    }

    function renderSheetAddressList() {
      addressList.innerHTML = "";
      const token = getCustomerToken();
      const listData = (token ? state.addresses : []) || [];
      const local = (!token && loadAddressDraft()) ? [{ ...loadAddressDraft(), id: null, _local: true }] : [];
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
                renderSheetAddressList();
              } catch (e) {
                alert("Не удалось изменить основной адрес");
              }
            });
          } else {
            btnDef.disabled = true;
          }
          actions.appendChild(btnDef);
        }

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "shop-address-action-icon";
        btnEdit.innerHTML = `<i class="fas fa-pen"></i>`;
        btnEdit.addEventListener("click", (e) => {
          e.stopPropagation();
          showSheetAddressForm(a, token ? a.id : null);
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

        row.addEventListener("click", async () => {
          if (token && a.id) {
            try {
              await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
              await refreshAddressState();
              showSheetCheckout();
            } catch (e) {
              alert("Не удалось выбрать адрес");
            }
            return;
          }

          setSelectedAddress({ ...a, _local: true });
          showSheetCheckout();
        });

        addressList.appendChild(row);
      });
    }

    addressNewBtn.addEventListener("click", () => showSheetAddressForm(null, null));

    const sheetSaveBtn = addressFormView.querySelector('[data-a="save"]');
    const sheetCancelBtn = addressFormView.querySelector('[data-a="cancel"]');

    if (sheetCancelBtn) {
      sheetCancelBtn.addEventListener("click", () => showSheetAddressList());
    }

    if (sheetSaveBtn) {
      sheetSaveBtn.addEventListener("click", async () => {
        const get = (k) => str(addressFormView.querySelector(`[data-a="${k}"]`)?.value || "").trim();
        const payload = normalizeAddressPayload({
          street: get("street"),
          house: get("house"),
          entrance: get("entrance"),
          floor: get("floor"),
          apartment: get("apartment"),
          comment: get("comment"),
        });

        if (!payload.street) return alert("Укажите улицу");
        if (!payload.house) return alert("Укажите дом");

        sheetSaveBtn.disabled = true;
        sheetSaveBtn.textContent = "Сохраняем…";

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
            showSheetCheckout();
          } else {
            saveAddressDraft(payload);
            setSelectedAddress({ ...payload, _local: true });
            showSheetCheckout();
          }
        } catch (e) {
          console.error(e);
          alert("Не удалось сохранить адрес");
        } finally {
          sheetSaveBtn.disabled = false;
          sheetSaveBtn.textContent = "Сохранить";
        }
      });
    }

    async function openSheetAddressEditor() {
      await refreshAddressState();
      const token = getCustomerToken();
      const effectiveList = token ? state.addresses : (loadAddressDraft() ? [{ ...loadAddressDraft(), _local: true }] : []);
      if (effectiveList.length) showSheetAddressList();
      else showSheetAddressForm(loadAddressDraft(), null);
    }

    btn.addEventListener("click", () => {
      if (!checkoutWrap) return;
      showSheetCheckout();

      openCheckoutView({
        container: checkoutWrap,
        onBack: () => showSheetCart(),
        hasAddressEditor: true,
        isSheet: true,
        actions: { submitBtn, backBtn },
        onEditAddress: () => openSheetAddressEditor(),
      });
    });
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

  function formatBirthdayValue(raw) {
    const d = str(raw).replace(/[^\d]/g, "").slice(0, 8); // ddmmyyyy
    const parts = [];
    if (d.length >= 2) parts.push(d.slice(0, 2));
    if (d.length >= 4) parts.push(d.slice(2, 4));
    if (d.length > 4) parts.push(d.slice(4));
    return parts.join(".");
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

  function maskBirthday(inp) {
    const start = inp.selectionStart;
    const digitsBefore = Number.isFinite(start)
      ? str(inp.value).slice(0, start).replace(/[^\d]/g, "").length
      : null;
    const next = formatBirthdayValue(inp.value);
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

    bday.addEventListener("input", () => maskBirthday(bday));

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
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(str(bday.value).trim())) {
        alert("Введите дату рождения в формате дд.мм.гггг");
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
          } else {
            bDef.disabled = true;
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

  async function openProfilePanel(meOverride) {
    showProfileView();
    if (!elProfileContent) return;

    const me = meOverride || await fetchMeSafe();
    if (!me) {
      const loginWrap = buildLoginContent({
        onSuccess: (me2) => {
          openProfilePanel(me2);
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
        showCartView();
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

    openProfileModal(me);
  }

  function openProfileModal(me) {
    if (!window.AppModal) return;

    const wrap = document.createElement("div");
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
      },
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
        items: cartItemsResolved().map(x => ({ product_id: x.product.id, qty: x.qty })),
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
      if (elNavMenu) elNavMenu.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

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
