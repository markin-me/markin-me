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
  const elProfileHeaderActions = $("#shopProfileHeaderActions");
  const elProfileCloseBtn = $("#shopProfileCloseBtn");
  const elProfileSettingsBtn = $("#shopProfileSettingsBtn");
  const elProfileMenu = $("#shopProfileMenu");
  const elProfileEditBtn = $("#shopProfileEditBtn");
  const elProfileSettingsMenuBtn = $("#shopProfileSettingsMenuBtn");
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

  function normalizeCartEntry(entry) {
    if (entry === null || entry === undefined) return null;
    if (typeof entry === "number") {
      return { qty: Math.max(0, entry), options: [] };
    }
    if (typeof entry === "object") {
      const qty = Math.max(0, Number(entry.qty || entry.quantity || 0));
      const options = Array.isArray(entry.options) ? entry.options : [];
      return { qty, options };
    }
    return null;
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") {
        const out = {};
        Object.keys(parsed).forEach((k) => {
          const entry = normalizeCartEntry(parsed[k]);
          if (entry) out[k] = entry;
        });
        return out;
      }
    } catch {}
    return {};
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {}
  }

  function cartEntry(productId) {
    return state.cart[String(productId)] || null;
  }

  function cartQty(productId) {
    return Number(cartEntry(productId)?.qty || 0);
  }

  function cartCountTotal() {
    let total = 0;
    for (const k of Object.keys(state.cart)) total += Number(state.cart[k]?.qty || 0);
    return total;
  }

  function cartItemsResolved() {
    const items = [];
    for (const k of Object.keys(state.cart)) {
      const pid = Number(k);
      const entry = state.cart[k];
      const qty = Number(entry?.qty || 0);
      if (!qty || !Number.isFinite(pid)) continue;
      const p = state.productCache.get(pid);
      if (p) items.push({ product: p, qty, options: entry.options || [] });
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
      const qty = Number(state.cart[k]?.qty || 0);
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

  function setCartHeader({ title, showAddressChip = true, showProfileActions = false } = {}) {
    if (elCartHeaderTitle && typeof title === "string") {
      elCartHeaderTitle.textContent = title;
    }
    if (elAddressChip) elAddressChip.classList.toggle("hidden", !showAddressChip);
    if (elProfileHeaderActions) elProfileHeaderActions.classList.toggle("hidden", !showProfileActions);
    if (!showProfileActions && elProfileMenu) elProfileMenu.classList.add("hidden");
  }

  function setCartFooterMode(mode) {
    if (!elCartFooter) return;
    const isHidden = mode === "hidden";
    elCartFooter.classList.toggle("hidden", isHidden);
    if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", mode !== "cart");
    if (elCheckoutFooterActions) elCheckoutFooterActions.classList.toggle("hidden", mode !== "checkout");
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
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elCartContent) elCartContent.classList.remove("hidden");
    if (elProfileContent) elProfileContent.classList.add("hidden");
    if (elCartFooter) {
      // вернём как было: footer показывается только если корзина не пустая (renderCart решает)
      // тут ничего не делаем
    }
    setCartHeader({ title: "Корзина", showAddressChip: true, showProfileActions: false });
    setCartFooterMode("cart");
    renderCart();
  }

  function showCheckoutView() {
    cartViewMode = "checkout";
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.remove("hidden");
    if (elProfileContent) elProfileContent.classList.add("hidden");
    setCartHeader({ title: "Корзина", showAddressChip: true, showProfileActions: false });
    setCartFooterMode("checkout");
  }

  function showAddressListView(backMode = "cart") {
    if (!elAddressContent || !elAddressListView || !elAddressFormView) return;
    cartViewMode = "address";
    state._addressListBackMode = backMode;
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.add("hidden");

    elAddressContent.classList.remove("hidden");
    elAddressListView.classList.remove("hidden");
    elAddressFormView.classList.add("hidden");

    setCartHeader({ title: "Введите адрес", showAddressChip: true, showProfileActions: false });
    setCartFooterMode("hidden");
    renderAddressList();
  }

  function showAddressFormView(prefill, editingId, backMode) {
    if (!elAddressContent || !elAddressFormView || !elAddressListView) return;

    state.addressEditingId = editingId ? Number(editingId) : null;
    state._addressFormBackMode = backMode || (state.selectedAddress ? "list" : "cart");
    cartViewMode = "address";

    if (elAddrStreet) elAddrStreet.value = str(prefill?.street || "");
    if (elAddrHouse) elAddrHouse.value = str(prefill?.house || "");
    if (elAddrEntrance) elAddrEntrance.value = str(prefill?.entrance || "");
    if (elAddrFloor) elAddrFloor.value = str(prefill?.floor || "");
    if (elAddrApartment) elAddrApartment.value = str(prefill?.apartment || "");
    if (elAddrComment) elAddrComment.value = str(prefill?.comment || "");

    if (elCartContent) elCartContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.add("hidden");

    elAddressContent.classList.remove("hidden");
    elAddressFormView.classList.remove("hidden");
    elAddressListView.classList.add("hidden");

    setCartHeader({ title: "Введите адрес", showAddressChip: true, showProfileActions: false });
    setCartFooterMode("hidden");
    setTimeout(() => { try { elAddrStreet?.focus?.(); } catch {} }, 0);
  }

  function showProfileView() {
    cartViewMode = "profile";
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.remove("hidden");
    setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: true });
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

      const isSelected = state.selectedAddress
        ? (a.id && state.selectedAddress.id ? Number(a.id) === Number(state.selectedAddress.id) : !!a._local && !!state.selectedAddress._local)
        : false;
      if (isSelected) row.classList.add("is-selected");

      const title = formatAddressLine(a);
      const sub = a.comment ? str(a.comment) : "";

      row.innerHTML = `
        <div class="shop-address-row-top">
          <div>
            <div class="shop-address-row-title">${title || ""}</div>
            ${sub ? `<div class="shop-address-row-sub">${sub}</div>` : ""}
          </div>
          ${token && Number(a.is_default) === 1 ? `<div class="muted">основной</div>` : ``}
        </div>
      `;

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

      const actions = document.createElement("div");
      actions.className = "shop-address-actions";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "btn";
      btnEdit.textContent = "Редактировать";
      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        showAddressFormView(a, token ? a.id : null, "list");
      });
      actions.appendChild(btnEdit);

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn";
      btnDel.textContent = "Удалить";
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

        // guest
        clearAddressDraft();
        setSelectedAddress(null);
        renderAddressList();
        backAfterAddressSelection();
      });
      actions.appendChild(btnDel);

      row.appendChild(actions);
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
  function optionsUnitTotal(options) {
    const list = Array.isArray(options) ? options : [];
    let sum = 0;
    list.forEach((g) => {
      const selections = Array.isArray(g.selections) ? g.selections : [];
      selections.forEach((s) => {
        const unit = Number(s.unit_price || 0);
        const qty = Number(s.qty || 1);
        sum += unit * qty;
      });
    });
    return sum;
  }

  function lineTotalForItem(product, qty, options) {
    const base = Number(product.price || 0);
    const optUnit = optionsUnitTotal(options);
    return (base + optUnit) * qty;
  }

  function serializeOrderOptions(options) {
    const list = Array.isArray(options) ? options : [];
    return list.map((g) => {
      const gid = Number(g.group_id);
      const selections = Array.isArray(g.selections) ? g.selections : [];
      return {
        group_id: gid,
        selections: selections
          .map((s) => ({
            item_id: Number(s.item_id),
            qty: Number(s.qty || 1),
            resolved_product_id: s.resolved_product_id ? Number(s.resolved_product_id) : null,
          }))
          .filter((s) => Number.isFinite(s.item_id)),
      };
    }).filter((g) => Number.isFinite(g.group_id) && g.selections.length);
  }

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

    items.forEach(({ product, qty, options }) => {
      const old = Number(product.old_price || 0);
      const price = Number(product.price || 0);
      const lineTotal = lineTotalForItem(product, qty, options);
      total += lineTotal;

      const row = document.createElement("div");
      row.className = "cart-row";
      row.setAttribute("data-product-id", String(product.id));

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
      pr.textContent = money(lineTotal);

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
    else {
      const existing = state.cart[String(pid)] || { qty: 0, options: [] };
      state.cart[String(pid)] = { ...existing, qty: next };
    }

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

  async function openProductDetails(productId) {
    if (!window.AppModal) return;

    const p = await ensureProduct(productId);
    const qty = cartQty(p.id);
    const photos = safePhotos(p);
    const main = photos[0] || "";

    const wrap = document.createElement("div");
    wrap.className = "shop-pd";

    const scroll = document.createElement("div");
    scroll.className = "shop-pd-scroll";

    const head = document.createElement("div");
    head.className = "shop-pd-head";

    const img = document.createElement("img");
    img.className = "shop-pd-thumb";
    img.alt = "";
    img.src = main || "/static/img/placeholder.png";
    head.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "shop-pd-meta";

    const t = document.createElement("div");
    t.className = "shop-pd-title";
    t.textContent = str(p.name);
    meta.appendChild(t);

    if (p.description_short) {
      const s = document.createElement("div");
      s.className = "shop-pd-sub";
      s.textContent = str(p.description_short);
      meta.appendChild(s);
    }

    head.appendChild(meta);

    const prices = document.createElement("div");
    prices.className = "shop-pd-prices";

    const old = Number(p.old_price || 0);
    const showOld = old > 0 && old > Number(p.price || 0);

    const oldEl = document.createElement("div");
    oldEl.className = "shop-pd-old";
    oldEl.textContent = showOld ? money(old) : "";
    if (!showOld) oldEl.classList.add("hidden");

    const pr = document.createElement("div");
    pr.className = "shop-pd-price";
    pr.textContent = money(p.price);

    prices.appendChild(oldEl);
    prices.appendChild(pr);
    head.appendChild(prices);

    scroll.appendChild(head);

    if (p.description) {
      const d = document.createElement("div");
      d.className = "shop-pd-desc";
      d.textContent = str(p.description);
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
    if (favs.has(Number(p.id))) {
      favBtn.classList.add("is-active");
      favBtn.innerHTML = "<span aria-hidden=\"true\">♥</span>";
    }

    const { pill, btnMinus, btnPlus, center } = createQtyPill({
      variant: "buy",
      big: true,
      centerHtml: pdCenterHtml(p, qty),
      minusEnabled: qty > 0,
    });

    footer.appendChild(favBtn);
    footer.appendChild(pill);
    wrap.appendChild(footer);

    setAppModalMode("shop");
    window.AppModal.open({
      title: "",
      content: wrap,
      onClose: () => {
        openProductCtx = null;
      },
    });

    openProductCtx = { productId: p.id, centerEl: center, minusBtn: btnMinus };

    btnPlus.addEventListener("click", () => changeQty(p.id, +1));
    btnMinus.addEventListener("click", () => changeQty(p.id, -1));

    favBtn.addEventListener("click", () => {
      const set = loadFavs();
      if (set.has(Number(p.id))) set.delete(Number(p.id));
      else set.add(Number(p.id));
      saveFavs(set);

      const active = set.has(Number(p.id));
      favBtn.classList.toggle("is-active", active);
      favBtn.innerHTML = active ? "<span aria-hidden=\"true\">♥</span>" : "<span aria-hidden=\"true\">♡</span>";
    });
  }

  // -----------------------------
  // Shop sheets
  // -----------------------------
  function closeShopSheetIfOpen() {
    if (!window.AppModal) return;
    if (window.AppModal.isOpen()) window.AppModal.close("sheet");
  }

  function openCategoriesSheet() {
    if (!window.AppModal) return;

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
      },
    });

    openCartSheetCtx = {
      listEl: list,
      totalEl: totalSpan,
      footerEl: footer,
      cartActionsEl: cartActions,
      checkoutActionsEl: checkoutActions,
      checkoutBtn: btn,
      clearBtn,
      checkoutEl: checkoutWrap,
    };

    setCartSheetFooterMode(openCartSheetCtx, items.length ? "cart" : "hidden");
    attachTwoStepClear(clearBtn, () => clearCartAll());

    let sheetEditingId = null;

    function showSheetCheckout() {
      checkoutWrap.classList.remove("hidden");
      list.classList.add("hidden");
      addressWrap.classList.add("hidden");
      setCartSheetFooterMode(openCartSheetCtx, "checkout");
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Корзина");
    }

    function showSheetCart() {
      checkoutWrap.classList.add("hidden");
      list.classList.remove("hidden");
      addressWrap.classList.add("hidden");
      setCartSheetFooterMode(openCartSheetCtx, "cart");
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Корзина");
    }

    function showSheetAddressList() {
      checkoutWrap.classList.add("hidden");
      list.classList.add("hidden");
      addressWrap.classList.remove("hidden");
      addressListView.classList.remove("hidden");
      addressFormView.classList.add("hidden");
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
      setCartSheetFooterMode(openCartSheetCtx, "hidden");
      if (window.AppModal?.setTitle) window.AppModal.setTitle("Введите адрес");
      setTimeout(() => { try { get("street")?.focus?.(); } catch {} }, 0);
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

        const isSelected = state.selectedAddress
          ? (a.id && state.selectedAddress.id ? Number(a.id) === Number(state.selectedAddress.id) : !!a._local && !!state.selectedAddress._local)
          : false;
        if (isSelected) row.classList.add("is-selected");

        const title = formatAddressLine(a);
        const sub = a.comment ? str(a.comment) : "";

        row.innerHTML = `
          <div class="shop-address-row-top">
            <div>
              <div class="shop-address-row-title">${title || ""}</div>
              ${sub ? `<div class="shop-address-row-sub">${sub}</div>` : ""}
            </div>
            ${token && Number(a.is_default) === 1 ? `<div class="muted">основной</div>` : ``}
          </div>
        `;

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

        const actions = document.createElement("div");
        actions.className = "shop-address-actions";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn";
        btnEdit.textContent = "Редактировать";
        btnEdit.addEventListener("click", (e) => {
          e.stopPropagation();
          showSheetAddressForm(a, token ? a.id : null);
        });
        actions.appendChild(btnEdit);

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Удалить";
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

        row.appendChild(actions);
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

  function maskBirthday(inp) {
    let d = str(inp.value).replace(/[^\d]/g, "").slice(0, 8); // ddmmyyyy
    const parts = [];
    if (d.length >= 2) parts.push(d.slice(0, 2));
    if (d.length >= 4) parts.push(d.slice(2, 4));
    if (d.length > 4) parts.push(d.slice(4));
    inp.value = parts.join(".");
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
    photoImg.alt = "";
    photoImg.className = "hidden";

    const photoPlaceholder = document.createElement("div");
    photoPlaceholder.className = "shop-profile-photo-placeholder";
    photoPlaceholder.textContent = "Нет фото";

    const photoBtn = document.createElement("button");
    photoBtn.type = "button";
    photoBtn.className = "shop-profile-photo-btn";
    photoBtn.textContent = "Изменить";

    const photoInput = document.createElement("input");
    photoInput.type = "file";
    photoInput.accept = "image/*";
    photoInput.className = "hidden";

    function setPhotoSrc(url) {
      if (url) {
        photoImg.src = url;
        photoImg.classList.remove("hidden");
        photoPlaceholder.classList.add("hidden");
      } else {
        photoImg.src = "";
        photoImg.classList.add("hidden");
        photoPlaceholder.classList.remove("hidden");
      }
    }

    setPhotoSrc(me?.photo || "");

    photoBtn.addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      const token = getCustomerToken();
      if (!token) return;

      const previewUrl = URL.createObjectURL(file);
      setPhotoSrc(previewUrl);

      const fd = new FormData();
      fd.append("photo", file);

      try {
        const res = await fetch("/api/public/me/photo", {
          method: "POST",
          headers: { "x-customer-token": token },
          body: fd,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) {
          throw new Error(json?.error || `HTTP_${res.status}`);
        }
        const url = `${json.photoUrl}?t=${Date.now()}`;
        setPhotoSrc(url);
        const cached = getCustomerCache() || {};
        setCustomerCache({ ...cached, photo: json.photoUrl });
      } catch (e) {
        console.error(e);
        alert("Не удалось загрузить фото");
        setPhotoSrc(me?.photo || "");
      } finally {
        photoInput.value = "";
        try { URL.revokeObjectURL(previewUrl); } catch {}
      }
    });

    photo.appendChild(photoImg);
    photo.appendChild(photoPlaceholder);
    photo.appendChild(photoBtn);
    photo.appendChild(photoInput);
    top.appendChild(photo);

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

    const nameLine = addLine("Имя", str(me?.name || "—"));
    const phoneLine = addLine("Телефон", me?.phone ? formatPhonePlus7(me.phone) : "—");
    const bdayLine = addLine("Дата рождения", formatBirthdayDisplay(me?.birthday || ""));

    top.appendChild(info);
    wrap.appendChild(top);

    const editWrap = document.createElement("div");
    editWrap.className = "shop-profile-edit";

    const editLabel = document.createElement("label");
    editLabel.className = "field-label";
    editLabel.textContent = "Имя";
    const editInput = document.createElement("input");
    editInput.className = "control";
    editInput.type = "text";
    editInput.value = str(me?.name || "");
    const editSave = document.createElement("button");
    editSave.type = "button";
    editSave.className = "btn btn-primary";
    editSave.textContent = "Сохранить имя";
    editWrap.appendChild(editLabel);
    editWrap.appendChild(editInput);
    editWrap.appendChild(editSave);
    wrap.appendChild(editWrap);

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

    tabs.appendChild(tabAddresses);
    tabs.appendChild(tabOrders);
    wrap.appendChild(tabs);

    const addressesPanel = document.createElement("div");
    addressesPanel.className = "shop-profile-tab-panel is-active";
    addressesPanel.dataset.tab = "addresses";

    const addressesList = document.createElement("div");
    addressesList.className = "shop-profile-list";
    addressesPanel.appendChild(addressesList);

    const addressFormCard = document.createElement("div");
    addressFormCard.className = "shop-profile-card";
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

    const ordersPanel = document.createElement("div");
    ordersPanel.className = "shop-profile-tab-panel";
    ordersPanel.dataset.tab = "orders";

    const ordersList = document.createElement("div");
    ordersList.className = "shop-profile-list";
    ordersPanel.appendChild(ordersList);

    wrap.appendChild(addressesPanel);
    wrap.appendChild(ordersPanel);

    host.appendChild(wrap);

    function setActiveTab(tab) {
      [tabAddresses, tabOrders].forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
      [addressesPanel, ordersPanel].forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tab === tab));
    }

    tabAddresses.addEventListener("click", () => setActiveTab("addresses"));
    tabOrders.addEventListener("click", () => setActiveTab("orders"));

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
          row.className = "shop-profile-card shop-address-card";
          if (Number(a.is_default) === 1) row.classList.add("is-default");

          const txt = [
            `${str(a.street)} ${str(a.house)}`,
            a.entrance ? `подъезд ${a.entrance}` : "",
            a.floor ? `этаж ${a.floor}` : "",
            a.apartment ? `кв ${a.apartment}` : "",
          ].filter(Boolean).join(", ");

          row.innerHTML = `
            <div class="shop-address-card-main">
              <div class="shop-address-card-title">
                ${txt}
                ${Number(a.is_default) === 1 ? '<span class="shop-address-star"><i class="fas fa-star"></i> основной</span>' : ''}
              </div>
              ${a.comment ? `<div class="shop-address-card-sub">${str(a.comment)}</div>` : ''}
            </div>
          `;

          const actions = document.createElement("div");
          actions.style.display = "flex";
          actions.style.gap = "8px";
          actions.style.marginTop = "8px";

          if (Number(a.is_default) !== 1) {
            const bDef = document.createElement("button");
            bDef.type = "button";
            bDef.className = "btn";
            bDef.textContent = "Сделать основным";
            bDef.addEventListener("click", async () => {
              try {
                await apiJson(`/api/public/me/addresses/${a.id}/default`, { method: "PUT" });
                await reloadAddresses();
                await refreshAddressState();
              } catch (e) {
                alert("Не удалось изменить основной адрес");
              }
            });
            actions.appendChild(bDef);
          }

          const bDel = document.createElement("button");
          bDel.type = "button";
          bDel.className = "btn";
          bDel.textContent = "Удалить";
          bDel.addEventListener("click", async () => {
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

          row.appendChild(actions);
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

    const addBtn = $('[data-a="add"]', addressFormCard);
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
        addBtn.textContent = "Добавляем…";
        try {
          await apiJson("/api/public/me/addresses", { method: "POST", body: payload });
          ["street","house","entrance","floor","apartment","comment"].forEach(k => {
            const el = $(`[data-a="${k}"]`, addressFormCard);
            if (el) el.value = "";
          });
          await reloadAddresses();
          await refreshAddressState();
        } catch (e) {
          alert("Не удалось добавить адрес");
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = "Добавить адрес";
        }
      });
    }

    editSave.addEventListener("click", async () => {
      const v = str(editInput.value).trim();
      if (!v) {
        alert("Введите имя");
        return;
      }
      editSave.disabled = true;
      editSave.textContent = "Сохраняем…";
      try {
        await apiJson("/api/public/me", { method: "PUT", body: { name: v } });
        const me2 = await fetchMeSafe();
        if (me2) {
          editInput.value = str(me2.name || "");
          nameLine.textContent = str(me2.name || "—");
        }
      } catch (e) {
        alert("Не удалось сохранить имя");
      } finally {
        editSave.disabled = false;
        editSave.textContent = "Сохранить имя";
      }
    });

    reloadAddresses();
    reloadOrders();

    return {
      showEdit: () => editWrap.classList.add("is-active"),
      hideEdit: () => editWrap.classList.remove("is-active"),
    };
  }

  let profileMenuListenerAttached = false;

  function attachProfileMenuOutsideClose(menuEl, toggleBtn) {
    if (profileMenuListenerAttached) return;
    profileMenuListenerAttached = true;
    if (menuEl) {
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

    if (elProfileSettingsMenuBtn && elProfileMenu) {
      elProfileSettingsMenuBtn.onclick = () => {
        elProfileMenu.classList.add("hidden");
        alert("Настройки скоро появятся");
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

  function mountProfileModalMenu({ onEdit, onSettings, onLogout }) {
    const header = document.querySelector(".app-modal-header");
    if (!header) return () => {};

    let settingsBtn = header.querySelector(".shop-profile-modal-settings");
    if (!settingsBtn) {
      settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "btn btn-icon shop-profile-modal-settings";
      settingsBtn.innerHTML = `<i class="fas fa-gear"></i>`;
      settingsBtn.setAttribute("aria-label", "Настройки профиля");
      header.appendChild(settingsBtn);
    }

    let menu = header.querySelector(".shop-profile-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "shop-profile-menu hidden";
      menu.innerHTML = `
        <button class="shop-profile-menu-item" data-role="edit" type="button">Редактировать профиль</button>
        <button class="shop-profile-menu-item" data-role="settings" type="button">Настройки</button>
        <button class="shop-profile-menu-item" data-role="logout" type="button">Выйти</button>
      `;
      header.appendChild(menu);
    }

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const editBtn = menu.querySelector('[data-role="edit"]');
    const settingsMenuBtn = menu.querySelector('[data-role="settings"]');
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

    if (editBtn) editBtn.onclick = () => {
      menu.classList.add("hidden");
      if (typeof onEdit === "function") onEdit();
    };

    if (settingsMenuBtn) settingsMenuBtn.onclick = () => {
      menu.classList.add("hidden");
      if (typeof onSettings === "function") onSettings();
    };

    if (logoutBtn) logoutBtn.onclick = async () => {
      menu.classList.add("hidden");
      if (typeof onLogout === "function") onLogout();
    };

    document.addEventListener("click", onDocClick);

    return () => {
      document.removeEventListener("click", onDocClick);
      settingsBtn?.remove();
      menu?.remove();
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
      onSettings: () => alert("Настройки скоро появятся"),
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

  function buildSelect(options, value, placeholder) {
    const sel = document.createElement("select");
    sel.className = "control";
    if (placeholder) {
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = placeholder;
      sel.appendChild(opt0);
    }
    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.code;
      opt.textContent = o.title;
      sel.appendChild(opt);
    });
    if (value) sel.value = value;
    return sel;
  }

  function buildRadioGroup(options, name, value) {
    const box = document.createElement("div");
    box.className = "shop-checkout-radios";
    options.forEach(o => {
      const label = document.createElement("label");
      label.className = "shop-radio";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = o.code;
      input.checked = value ? (value === o.code) : false;

      const span = document.createElement("span");
      span.textContent = o.title;

      label.appendChild(input);
      label.appendChild(span);
      box.appendChild(label);
    });
    if (!value && options.length) {
      const first = box.querySelector('input[type="radio"]');
      if (first) first.checked = true;
    }
    return box;
  }

  function getRadioValue(root, name) {
    const el = root.querySelector(`input[type="radio"][name="${name}"]:checked`);
    return el ? el.value : null;
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

    // promo
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

    // name
    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label";
    nameLabel.textContent = "Имя";
    const name = document.createElement("input");
    name.className = "control";
    name.type = "text";
    name.value = me ? str(me.name || "") : (draft.customer_name || "");
    wrap.appendChild(nameLabel);
    wrap.appendChild(name);

    // phone
    const phoneLabel = document.createElement("label");
    phoneLabel.className = "field-label";
    phoneLabel.textContent = "Телефон";
    const phone = document.createElement("input");
    phone.className = "control";
    phone.type = "tel";
    phone.placeholder = "+7 (999) 000-00-00";
    phone.value = me ? formatPhonePlus7(me.phone || "") : (draft.customer_phone || "");
    if (me) phone.disabled = true; // как договорились: нельзя менять
    if (!me) {
      phone.addEventListener("input", () => enforcePhonePrefix(phone));
      phone.addEventListener("focus", () => enforcePhonePrefix(phone));
    }
    wrap.appendChild(phoneLabel);
    wrap.appendChild(phone);

    // method
    const mLabel = document.createElement("div");
    mLabel.className = "shop-checkout-section-title";
    mLabel.textContent = "Способ:";
    wrap.appendChild(mLabel);

    const methods = (cfg.methods || []).map(x => ({ code: x.code, title: x.title }));
    const methodDefault = pickDefaultCode(methods, draft.method_code, "takeaway");
    const methodGroup = buildRadioGroup(methods, "method", methodDefault);
    wrap.appendChild(methodGroup);

    // delivery address
    const addrWrap = document.createElement("div");
    addrWrap.className = "shop-checkout-address";

    const addrRow = document.createElement("div");
    addrRow.className = "shop-checkout-address-row";

    const addrLabel = document.createElement("label");
    addrLabel.className = "field-label";
    addrLabel.textContent = "Адрес доставки";

    const changeAddrBtn = document.createElement("button");
    changeAddrBtn.type = "button";
    changeAddrBtn.className = "btn shop-checkout-change-address";
    changeAddrBtn.innerHTML = `<i class="fas fa-pen"></i>`;
    changeAddrBtn.setAttribute("aria-label", "Изменить адрес");
    changeAddrBtn.title = "Изменить адрес";

    addrRow.appendChild(addrLabel);
    addrRow.appendChild(changeAddrBtn);

    const address = document.createElement("input");
    address.className = "control";
    address.type = "text";
    address.placeholder = "Улица / Дом / Подъезд / Этаж / Квартира";
    address.readOnly = !!hasAddressEditor;
    address.setAttribute("data-role", "delivery-address");
    address.value = getSelectedAddressLine() || draft.delivery_address || "";

    addrWrap.appendChild(addrRow);
    addrWrap.appendChild(address);
    wrap.appendChild(addrWrap);

    function refreshAddressVisibility() {
      const v = getRadioValue(methodGroup, "method");
      const isDelivery = v === "delivery";
      addrWrap.style.display = isDelivery ? "" : "none";
      changeAddrBtn.style.display = (isDelivery && hasAddressEditor) ? "" : "none";
      if (isDelivery && hasAddressEditor) {
        address.value = getSelectedAddressLine() || address.value || "";
      }
    }
    methodGroup.addEventListener("change", refreshAddressVisibility);
    refreshAddressVisibility();

    // comment
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

    // time option
    const tLabel = document.createElement("div");
    tLabel.className = "shop-checkout-section-title";
    tLabel.textContent = "Когда приготовить?";
    wrap.appendChild(tLabel);

    const timeOptions = (cfg.timeOptions || []).map(x => ({ code: x.code, title: x.title }));
    const timeDefault = pickDefaultCode(timeOptions, draft.time_option_code, "asap");
    const timeGroup = buildRadioGroup(timeOptions, "timeopt", timeDefault);
    wrap.appendChild(timeGroup);

    const timeInputWrap = document.createElement("div");
    timeInputWrap.className = "shop-checkout-time-input";

    const timeInput = document.createElement("input");
    timeInput.className = "control";
    timeInput.type = "time";
    timeInput.value = extractTimeValue(draft.scheduled_at);

    timeInputWrap.appendChild(timeInput);
    wrap.appendChild(timeInputWrap);

    function refreshTimeInputVisibility() {
      const v = getRadioValue(timeGroup, "timeopt");
      const show = v === "at_time" || v === "on_date";
      timeInputWrap.style.display = show ? "" : "none";
    }
    timeGroup.addEventListener("change", refreshTimeInputVisibility);
    refreshTimeInputVisibility();

    // payment
    const payLabel = document.createElement("label");
    payLabel.className = "field-label";
    payLabel.textContent = "Оплата";
    const payments = (cfg.payments || []).map(x => ({ code: x.code, title: x.title }));
    const payDefault = pickDefaultCode(payments, draft.payment_code, "cash");
    const pay = buildSelect(payments, payDefault, null);
    wrap.appendChild(payLabel);
    wrap.appendChild(pay);

    // change from (only for cash)
    const changeLabel = document.createElement("label");
    changeLabel.className = "field-label";
    changeLabel.textContent = "Сдача с";

    const change = document.createElement("select");
    change.className = "control";
    const ch0 = document.createElement("option");
    ch0.value = "";
    ch0.textContent = "Сдача не нужна";
    change.appendChild(ch0);
    [500, 1000, 2000, 5000].forEach(v => {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = String(v);
      change.appendChild(o);
    });
    change.value = draft.change_from ? String(draft.change_from) : "";

    const changeWrap = document.createElement("div");
    changeWrap.className = "shop-checkout-change";
    changeWrap.appendChild(changeLabel);
    changeWrap.appendChild(change);
    wrap.appendChild(changeWrap);

    function refreshChangeVisibility() {
      changeWrap.style.display = (pay.value === "cash") ? "" : "none";
    }
    pay.addEventListener("change", refreshChangeVisibility);
    refreshChangeVisibility();

    if (hasAddressEditor) {
      changeAddrBtn.addEventListener("click", () => {
        saveCheckoutDraft({
          promo_code: str(promo.value).trim() || null,
          customer_name: str(name.value).trim(),
          customer_phone: str(phone.value).trim(),
          method_code: getRadioValue(methodGroup, "method") || methodDefault || "takeaway",
          delivery_address: str(address.value).trim() || null,
          comment: str(comment.value).trim() || null,
          time_option_code: getRadioValue(timeGroup, "timeopt") || timeDefault || "asap",
          scheduled_at: timeInput.value || "",
          payment_code: pay.value || payDefault || "cash",
          change_from: change.value ? Number(change.value) : null,
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
        method_code: getRadioValue(methodGroup, "method") || methodDefault || "takeaway",
        delivery_address: str(address.value).trim() || null,
        comment: str(comment.value).trim() || null,
        time_option_code: getRadioValue(timeGroup, "timeopt") || timeDefault || "asap",
        scheduled_at: null,
        payment_code: pay.value || payDefault || "cash",
        cutlery_qty: 0,
        change_from: change.value ? Number(change.value) : null,
        items: cartItemsResolved().map(x => ({
          product_id: x.product.id,
          qty: x.qty,
          options: serializeOrderOptions(x.options),
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
