(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

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
  const CLIENT_DETAILS_CACHE_KEY = `dashboard:clients:details:v1:${tenantId}`;
  const CLIENT_DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;
  const CLIENT_DETAILS_CACHE_MAX_CLIENTS = 120;
  const SHARED_ORDER_DETAILS_CACHE_KEY = `dashboard:orders:details:v1:${tenantId}`;
  const SHARED_ORDER_DETAILS_CACHE_TTL_MS = 15 * 60 * 1000;
  const SHARED_ORDER_DETAILS_CACHE_MAX = 400;

  async function apiJson(url, opts = {}) {
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": storeId,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
      throw new Error('UNAUTHORIZED');
    }
    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) {
      const err = json?.error || `API_ERROR (${res.status})`;
      throw new Error(err);
    }
    return json;
  }

  async function fetchClientOrdersShared(clientId) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) {
      return apiJson(`/api/admin/clients/${clientId}/orders`);
    }
    const shared = typeof window !== "undefined" ? window.__markinMeSharedOrdersFetcher : null;
    if (typeof shared === "function") {
      return shared(id, () => apiJson(`/api/admin/clients/${id}/orders`));
    }
    return apiJson(`/api/admin/clients/${id}/orders`);
  }

  function readSharedOrderDetailsCache() {
    try {
      const raw = localStorage.getItem(SHARED_ORDER_DETAILS_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function getSharedOrderDetails(orderId) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const cache = readSharedOrderDetailsCache();
    const entry = cache[String(id)];
    if (!entry || typeof entry !== "object") return null;
    const updatedAt = Number(entry.updatedAt || 0);
    if (!updatedAt || (Date.now() - updatedAt) > SHARED_ORDER_DETAILS_CACHE_TTL_MS) return null;
    const order = entry.order && typeof entry.order === "object" ? entry.order : null;
    return order ? { ...order } : null;
  }

  function setSharedOrderDetails(order) {
    const id = Number(order?.id || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const cache = readSharedOrderDetailsCache();
    cache[String(id)] = {
      updatedAt: Date.now(),
      order: order && typeof order === "object" ? { ...order } : null,
    };
    const compacted = Object.entries(cache)
      .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
      .slice(0, SHARED_ORDER_DETAILS_CACHE_MAX)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    try {
      localStorage.setItem(SHARED_ORDER_DETAILS_CACHE_KEY, JSON.stringify(compacted));
    } catch {}
  }

  // -----------------------------
  // DOM
  // -----------------------------
  const elFilters = $("#clientsFiltersList");
  const elList = $("#clientsList");
  const elEmpty = $("#clientsEmptyHint");
  const elSearch = $("#clientsSearch");
  const elSearchToggle = $("#clientsSearchToggle");
  const elSearchWrap = $("#clientsSearchWrap");
  const elToolbarTitle = $("#clientsToolbarTitle");
  const elToolbarText = $("#clientsToolbarText");
  const elSortToggle = $("#clientsSortToggle");
  const elSortDropdown = $("#clientsSortDropdown");
  const elSortWrap = $("#clientsSortWrap");
  const elAddBtn = $("#clientsAddBtn");
  const elOpenFilterCategoriesBtn = $("#openFilterCategoriesBtn");
  const elClientsScroll = elList ? elList.closest(".panel-body") : null;

  // Discounts accordion
  const elDiscountsFilters = $("#discountsFiltersList");
  const elAddDiscountBtn = $("#addDiscountBtn");

  // Discounts view elements
  const elDiscountsList = $("#discountsList");
  const elDiscountsEmptyHint = $("#discountsEmptyHint");
  const elDiscountEmpty = $("#discountEmpty");
  const elDiscountEditorWrap = $("#discountEditorWrap");
  const elDiscountEditorForm = $("#discountEditorForm");
  const elDiscountEditorFooter = $("#discountEditorFooter");
  const elDiscountInfoWrap = $("#discountInfoWrap");
  const elDiscountSaveBtn = $("#discountSaveBtn");
  const elDiscountDeleteBtn = $("#discountDeleteBtn");
  const elDiscountEditBtn = $("#discountEditBtn");

  // Discount picker elements
  const elDeProductsChips = $("#de_products_chips");
  const elDeCustomersChips = $("#de_customers_chips");
  const elDeAddProductsBtn = $("#de_add_products_btn");
  const elDeAddCustomersBtn = $("#de_add_customers_btn");
  const elDiscountProductPicker = $("#discountProductPicker");
  const elDiscountCustomerPicker = $("#discountCustomerPicker");
  const elDiscountPickerTabs = $("#discountPickerTabs");
  const elDiscountPickerSearch = $("#discountPickerSearch");
  const elDiscountPickerSelectAll = $("#discountPickerSelectAll");
  const elDiscountPickerList = $("#discountPickerList");
  const elDiscountCustomerPickerTabs = $("#discountCustomerPickerTabs");
  const elDiscountCustomerPickerSearch = $("#discountCustomerPickerSearch");
  const elDiscountCustomerPickerSelectAll = $("#discountCustomerPickerSelectAll");
  const elDiscountCustomerPickerList = $("#discountCustomerPickerList");
  const elDiscountPickerFooter = $("#discountPickerFooter");
  const elDiscountPickerCancelBtn = $("#discountPickerCancelBtn");
  const elDiscountPickerApplyBtn = $("#discountPickerApplyBtn");

  // Filter categories view
  const elFilterCategoriesList = $("#filterCategoriesList");
  const elFilterCategoriesEmpty = $("#filterCategoriesEmptyHint");
  const elFilterCategoryEmpty = $("#filterCategoryEmpty");

  // Filter editor
  const elFilterEditorWrap = $("#filterEditorWrap");
  const elFilterEditorForm = $("#filterEditorForm");
  const elFilterEditorFooter = $("#filterEditorFooter");
  const elFilterRulesContainer = $("#filterRulesContainer");
  const elFilterAddRuleBtn = $("#filterAddRuleBtn");
  const elFilterSaveBtn = $("#filterSaveBtn");
  const elFilterDeleteBtn = $("#filterDeleteBtn");

  // client tabs (top-level, switching between clients)
  const clientTabsHeader = $("#clientTabsHeader");
  const clientTabs = $("#clientTabs");
  const clientEmpty = $("#clientEmpty");
  const clientInfoWrap = $("#clientInfoWrap");
  const clientOrderInfoWrap = $("#clientOrderInfoWrap");

  // profile header
  const clientPhoto = $("#clientPhoto");
  const clientPhotoPlaceholder = $("#clientPhotoPlaceholder");

  // info fields
  const infoName = $("#clientInfoName");
  const infoPhone = $("#clientInfoPhone");
  const infoBirthday = $("#clientInfoBirthday");

  // content tabs
  const clientContentTabs = $("#clientContentTabs");
  const clientTabAddresses = $("#clientTabAddresses");
  const clientTabOrders = $("#clientTabOrders");
  const clientTabDiscounts = $("#clientTabDiscounts");
  const clientAddressesList = $("#clientAddresses");
  const clientOrdersList = $("#clientOrdersList");
  const clientOrdersListView = $("#clientOrdersListView");
  const clientDiscountsList = $("#clientDiscountsList");
  const clientDiscountsEmpty = $("#clientDiscountsEmpty");
  const clientOrderDetailView = $("#clientOrderDetailView");
  const clientOrderDetailContent = $("#clientOrderDetailContent");
  const clientOrderBackBtn = $("#clientOrderBackBtn");

  // address form
  const addrToggleBtn = $("#clientAddrToggleBtn");
  const addrFormCard = $("#clientAddrFormCard");
  const addrStreet = $("#addrStreet");
  const addrHouse = $("#addrHouse");
  const addrEntrance = $("#addrEntrance");
  const addrFloor = $("#addrFloor");
  const addrApartment = $("#addrApartment");
  const addrComment = $("#addrComment");
  const addrAddBtn = $("#addrAddBtn");

  // sheet info (mobile)
  const sheet = $("#clientSheet");
  const sheetBackdrop = $("#clientSheetBackdrop");
  const sheetClose = $("#clientSheetClose");
  const sheetInfo = {
    title: $("#sheetClientInfoTitle"),
    meta: $("#sheetClientInfoMeta"),
    name: $("#sheetClientInfoName"),
    phone: $("#sheetClientInfoPhone"),
    birthday: $("#sheetClientInfoBirthday"),
    orders: $("#sheetClientInfoOrders"),
    spent: $("#sheetClientInfoSpent"),
    last: $("#sheetClientInfoLastOrder"),
    addrs: $("#sheetClientAddresses"),
  };

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    currentView: "clients",   // "clients" | "filter-categories" | "discounts"
    activeFilter: "all",      // "all" | "custom_<id>"
    activeCustomFilterId: null,
    q: "",
    sort: "last_desc",
    clients: [],
    clientsOffset: 0,
    clientsTotal: 0,
    clientsHasMore: true,
    clientsLoading: false,
    activeClientId: null,
    activeClient: null,
    activeOrderId: null,
    activeOrder: null,
    orderCache: new Map(),
    orderStatuses: [],
    orderStatusesLoaded: false,
    orderStatusesLoading: false,
    addresses: [],
    clientOrders: [],
    clientDiscounts: [],      // Скидки клиента
    totals: { all: 0 },
    activeContentTab: "addresses",
    customFilters: [],        // Кастомные фильтры из БД
    editingFilterId: null,    // ID фильтра, который редактируем
    // Скидки и акции
    discounts: [],
    discountsTotals: { all: 0 },
    activeDiscountFilter: "all",
    activeDiscountId: null,
    editingDiscountId: null,    // ID редактируемой скидки
    activeDiscount: null,       // Данные активной скидки
    discountOrders: [],         // Заказы с применённой скидкой
    // Picker для скидок
    discountPickerLevel: null,        // null | 'products' | 'customers'
    discountPickerSelection: new Set(),
    discountPickerCategoryId: null,   // Активная категория в picker
    discountPickerProducts: [],       // Список товаров в текущей категории
    discountPickerQuery: '',          // Поисковый запрос
    // Выбранные элементы для скидки
    discountSelectedProducts: [],     // [{type:'product'|'category'|'combo', id, title}]
    discountSelectedCustomers: [],    // [{type:'category'|'customer', id, title}]
    // Кэш данных для picker
    catalogCategories: [],
    catalogProducts: [],
    customerCategories: [],
    customersList: [],
    customersById: new Map(),
    clientDetailsCache: new Map(),
  };
  const CLIENTS_PAGE_LIMIT = 80;
  const CLIENTS_SCROLL_THRESHOLD_PX = 220;
  let clientsRequestToken = 0;
  let clientProfileRequestToken = 0;
  let orderRequestToken = 0;
  let discountCustomerSearchToken = 0;
  let discountCustomerSearchDebounce = null;

  function sanitizeCachedClientForDetails(row, fallbackId = 0) {
    const id = Number(row?.id || fallbackId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
      id,
      name: String(row?.name || ""),
      phone: String(row?.phone || ""),
      birthday: String(row?.birthday || ""),
      photo: String(row?.photo || ""),
      total_orders: Number(row?.total_orders || 0),
      total_spent: Number(row?.total_spent || 0),
      last_order_date: String(row?.last_order_date || ""),
      created_at: String(row?.created_at || ""),
      updated_at: String(row?.updated_at || ""),
      is_guest_chat: row?.is_guest_chat === true,
    };
  }

  function sanitizeCachedAddresses(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: Number(row?.id || 0),
        street: String(row?.street || ""),
        house: String(row?.house || ""),
        entrance: String(row?.entrance || ""),
        floor: String(row?.floor || ""),
        apartment: String(row?.apartment || ""),
        comment: String(row?.comment || ""),
        is_default: Number(row?.is_default || 0) === 1 ? 1 : 0,
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  }

  function sanitizeCachedOrders(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: Number(row?.id || 0),
        public_id: String(row?.public_id || ""),
        created_at: String(row?.created_at || ""),
        total_price: Number(row?.total_price || 0),
        items: row?.items ?? null,
        status_id: Number(row?.status_id || 0),
        status_title: String(row?.status_title || ""),
        status_color: String(row?.status_color || ""),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  }

  function sanitizeCachedDiscounts(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: Number(row?.id || 0),
        title: String(row?.title || ""),
        discount_type: String(row?.discount_type || ""),
        discount_value: Number(row?.discount_value || 0),
        link_type: String(row?.link_type || ""),
        category_title: String(row?.category_title || ""),
        is_active: Number(row?.is_active || 0) === 1 ? 1 : 0,
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  }

  function loadClientDetailsCache() {
    try {
      const raw = localStorage.getItem(CLIENT_DETAILS_CACHE_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === "object" ? parsed : {};
      const out = new Map();
      const now = Date.now();
      Object.keys(entries).forEach((key) => {
        const id = Number(key || 0);
        if (!Number.isFinite(id) || id <= 0) return;
        const item = entries[key] && typeof entries[key] === "object" ? entries[key] : null;
        if (!item) return;
        const updatedAt = Number(item.updatedAt || 0);
        if (!updatedAt || (now - updatedAt) > CLIENT_DETAILS_CACHE_TTL_MS) return;
        const cachedClient = sanitizeCachedClientForDetails(item.client, id);
        if (!cachedClient) return;
        out.set(String(id), {
          updatedAt,
          client: cachedClient,
          addresses: sanitizeCachedAddresses(item.addresses),
          orders: sanitizeCachedOrders(item.orders),
          discounts: sanitizeCachedDiscounts(item.discounts),
        });
      });
      return out;
    } catch {
      return new Map();
    }
  }

  function saveClientDetailsCache() {
    try {
      const rows = Array.from(state.clientDetailsCache.entries())
        .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
        .slice(0, CLIENT_DETAILS_CACHE_MAX_CLIENTS);
      const payload = {};
      rows.forEach(([id, item]) => {
        payload[id] = {
          updatedAt: Number(item?.updatedAt || Date.now()),
          client: sanitizeCachedClientForDetails(item?.client, id),
          addresses: sanitizeCachedAddresses(item?.addresses),
          orders: sanitizeCachedOrders(item?.orders),
          discounts: sanitizeCachedDiscounts(item?.discounts),
        };
      });
      localStorage.setItem(CLIENT_DETAILS_CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function getCachedClientDetails(clientId) {
    const key = String(Number(clientId || 0) || "");
    if (!key) return null;
    const entry = state.clientDetailsCache.get(key);
    if (!entry || typeof entry !== "object") return null;
    const updatedAt = Number(entry.updatedAt || 0);
    if (!updatedAt || (Date.now() - updatedAt) > CLIENT_DETAILS_CACHE_TTL_MS) {
      state.clientDetailsCache.delete(key);
      return null;
    }
    return {
      client: sanitizeCachedClientForDetails(entry.client, key),
      addresses: sanitizeCachedAddresses(entry.addresses),
      orders: sanitizeCachedOrders(entry.orders),
      discounts: sanitizeCachedDiscounts(entry.discounts),
      updatedAt,
    };
  }

  function setCachedClientDetails(clientId, patch = {}) {
    const key = String(Number(clientId || 0) || "");
    if (!key) return;
    const prev = getCachedClientDetails(key) || {
      client: sanitizeCachedClientForDetails({ id: Number(key) }, key),
      addresses: [],
      orders: [],
      discounts: [],
      updatedAt: 0,
    };
    const nextClient = Object.prototype.hasOwnProperty.call(patch, "client")
      ? sanitizeCachedClientForDetails(patch.client, key)
      : prev.client;
    const nextAddresses = Object.prototype.hasOwnProperty.call(patch, "addresses")
      ? sanitizeCachedAddresses(patch.addresses)
      : prev.addresses;
    const nextOrders = Object.prototype.hasOwnProperty.call(patch, "orders")
      ? sanitizeCachedOrders(patch.orders)
      : prev.orders;
    const nextDiscounts = Object.prototype.hasOwnProperty.call(patch, "discounts")
      ? sanitizeCachedDiscounts(patch.discounts)
      : prev.discounts;
    if (!nextClient) return;
    state.clientDetailsCache.set(key, {
      updatedAt: Date.now(),
      client: nextClient,
      addresses: nextAddresses,
      orders: nextOrders,
      discounts: nextDiscounts,
    });
    saveClientDetailsCache();
  }

  state.clientDetailsCache = loadClientDetailsCache();

  // -----------------------------
  // Tabs state (top-level: switching between clients)
  // -----------------------------
  const tabsState = {
    tabs: [],
    activeKey: null,
  };

  const orderInfoEls = (() => {
    if (!clientOrderInfoWrap) return null;
    const q = (sel) => $$(sel, clientOrderInfoWrap);
    return {
      empty: q('.order-info-empty'),
      emptyTitle: q('.order-info-empty .empty-title'),
      emptyText: q('.order-info-empty .empty-text'),
      content: q('[data-info="content"]'),
      title: q('[data-info="order-title"]'),
      meta: q('[data-info="order-meta"]'),
      status: q('[data-info="order-status"]'),
      statusToggle: q('[data-action="order-status-menu-toggle"]'),
      statusMenu: q('[data-role="order-status-menu"]'),
      clientName: q('[data-info="client-name"]'),
      clientPhone: q('[data-info="client-phone"]'),
      deliveryIntervalRow: q('[data-info="delivery-interval-row"]'),
      deliveryInterval: q('[data-info="delivery-interval"]'),
      deliveryAddressTitle: q('[data-info="delivery-address-title"]'),
      deliveryAddress: q('[data-info="delivery-address"]'),
      deliveryAddressComment: q('[data-info="delivery-address-comment"]'),
      deliveryAddressCommentText: q('[data-info="delivery-address-comment-text"]'),
      orderCommentBlock: q('[data-info="order-comment-block"]'),
      orderCommentText: q('[data-info="order-comment-text"]'),
      itemsList: q('[data-info="items-list"]'),
      payMethod: q('[data-info="payment-method"]'),
      payIcon: q('[data-info="payment-icon"]'),
      changeFrom: q('[data-info="change-from"]'),
      changeAmount: q('[data-info="change-amount"]'),
      changeFromRow: q('[data-info="change-from-row"]'),
      changeAmountRow: q('[data-info="change-amount-row"]'),
      subtotal: q('[data-info="subtotal"]'),
      subtotalRow: q('[data-info="subtotal-row"]'),
      discountAmount: q('[data-info="discount-amount"]'),
      discountRow: q('[data-info="discount-row"]'),
      discountInfoBtn: q('[data-info="discount-info-btn"]'),
      discountBreakdown: q('[data-info="discount-breakdown"]'),
      deliveryCost: q('[data-info="delivery-cost"]'),
      deliveryRow: q('[data-info="delivery-row"]'),
      total: q('[data-info="order-total"]'),
      urgent: q('[data-info="delivery-urgent"]'),
    };
  })();

  function buildTabKey(type, id) {
    return `${type}:${id}`;
  }

  function renderTabs() {
    if (!clientTabsHeader || !clientTabs) return;
    const hasTabs = tabsState.tabs.length > 0;
    clientTabsHeader.classList.toggle("hidden", !hasTabs);
    if (!hasTabs) {
      clientTabs.innerHTML = "";
      showEmptyState();
      return;
    }
    clientTabs.innerHTML = tabsState.tabs.map((tab) => {
      const isActive = tab.key === tabsState.activeKey;
      const fallbackTitle = tab.type === 'order' ? `#${tab.id}` : 'Клиент';
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-tab-key="${tab.key}">
          <span class="product-tab-title">${escapeHtml(tab.title || fallbackTitle)}</span>
          <button class="product-tab-close" type="button" data-tab-close="${tab.key}" aria-label="Close">&times;</button>
        </div>
      `;
    }).join("");
  }

  function showEmptyState() {
    updateRightPanel();
  }

  function hideEmptyState() {
    updateRightPanel();
  }

  async function setActiveTabKey(key) {
    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    tabsState.activeKey = key;

    // Keep center column in sync with active right-side tab.
    const targetView = tab.type === 'discount'
      ? 'discounts'
      : tab.type === 'category'
        ? 'filter-categories'
        : 'clients';
    if (state.currentView !== targetView) {
      switchView(targetView);
    }

    renderTabs();
    hideEmptyState();
    
    // Обработка активации таба в зависимости от типа
    if (tab.type === 'discount') {
      const discount = state.discounts.find(d => d.id === tab.id);
      if (discount) {
        state.activeDiscount = discount;
        state.activeDiscountId = discount.id;
        renderDiscountInfo(discount);
      }
    }
    
    if (typeof tab.onActivate === "function") {
      await tab.onActivate();
    }
    
    updateRightPanel();
  }

  function ensureTab({ type = 'client', id, title, onActivate, activate = true }) {
    const key = buildTabKey(type, id);
    let tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = { key, type, id, title, onActivate };
      tabsState.tabs.push(tab);
    } else {
      tab.title = title;
      tab.onActivate = onActivate || tab.onActivate;
    }
    if (activate) {
      setActiveTabKey(key);
    } else {
      renderTabs();
    }
    return tab;
  }

  async function closeTab(key) {
    const idx = tabsState.tabs.findIndex((t) => t.key === key);
    if (idx === -1) return;
    const closedTab = tabsState.tabs[idx];
    const wasActive = tabsState.activeKey === key;
    tabsState.tabs.splice(idx, 1);

    if (closedTab.type === 'client') {
      if (state.activeClientId === closedTab.id) {
        state.activeClientId = null;
        state.activeClient = null;
      }
    } else if (closedTab.type === 'category') {
      if (state.editingFilterId === closedTab.id) {
        state.editingFilterId = null;
      }
    } else if (closedTab.type === 'discount') {
      if (state.activeDiscountId === closedTab.id || state.editingDiscountId === closedTab.id) {
        state.activeDiscountId = null;
        state.editingDiscountId = null;
        state.activeDiscount = null;
        state.discountOrders = [];
      }
    } else if (closedTab.type === 'order') {
      if (state.activeOrderId === closedTab.id) {
        state.activeOrderId = null;
        state.activeOrder = null;
      }
    }

    if (wasActive) {
      if (tabsState.tabs.length > 0) {
        const newIdx = Math.min(idx, tabsState.tabs.length - 1);
        await setActiveTabKey(tabsState.tabs[newIdx].key);
      } else {
        tabsState.activeKey = null;
        renderTabs();
        updateRightPanel();
        $$(".order-row.is-active", document).forEach((n) => n.classList.remove("is-active"));
      }
    } else {
      renderTabs();
    }
  }

  // Tab click events (top-level)
  if (clientTabs) {
    clientTabs.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("[data-tab-close]");
      if (closeBtn) {
        e.stopPropagation();
        const key = closeBtn.dataset.tabClose;
        if (key) closeTab(key);
        return;
      }
      const tabEl = e.target.closest("[data-tab-key]");
      if (tabEl) {
        const key = tabEl.dataset.tabKey;
        if (key) setActiveTabKey(key);
      }
    });
    clientTabs.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        clientTabs.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action="open-client"]');
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();

    let clientId = Number(trigger.getAttribute('data-client-id') || 0);
    const clientPhone = String(trigger.getAttribute('data-client-phone') || '').trim();

    if (!Number.isFinite(clientId) || clientId <= 0) {
      if (!clientPhone) return;
      findClientIdByPhone(clientPhone)
        .then((id) => {
          if (id) selectClient(id);
        })
        .catch(console.error);
      return;
    }

    selectClient(clientId).catch(console.error);
  });

  document.addEventListener('click', (e) => {
    if (!clientOrderInfoWrap) return;

    const statusOptionBtn = e.target.closest('[data-action="order-status-menu-select"]');
    if (statusOptionBtn && clientOrderInfoWrap.contains(statusOptionBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const nextStatusId = Number(statusOptionBtn.getAttribute('data-status-id') || 0);
      if (Number.isFinite(nextStatusId) && nextStatusId > 0) {
        selectActiveClientOrderStatus(nextStatusId).catch(console.error);
      }
      return;
    }

    const statusToggleBtn = e.target.closest('[data-action="order-status-menu-toggle"]');
    if (statusToggleBtn && clientOrderInfoWrap.contains(statusToggleBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = statusToggleBtn.closest('[data-role="order-inline-status"]');
      const dropdown = wrap ? $('[data-role="order-status-menu"]', wrap) : null;
      const willOpen = !!dropdown && dropdown.classList.contains('hidden');
      closeClientOrderStatusMenus();
      if (dropdown && willOpen) {
        wrap.classList.add('is-open');
        dropdown.classList.remove('hidden');
        statusToggleBtn.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const discountInfoBtn = e.target.closest('[data-info="discount-info-btn"]');
    if (discountInfoBtn && clientOrderInfoWrap.contains(discountInfoBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const summaryCard = discountInfoBtn.closest('.order-summary');
      const breakdown = summaryCard ? $('[data-info="discount-breakdown"]', summaryCard) : null;
      if (!breakdown) return;
      const willOpen = breakdown.classList.contains('hidden');
      breakdown.classList.toggle('hidden', !willOpen);
      breakdown.classList.toggle('is-open', willOpen);
      breakdown.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
      discountInfoBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    if (!e.target.closest('[data-role="order-inline-status"]')) {
      closeClientOrderStatusMenus();
    }
  });

  // -----------------------------
  // Content tabs (Адреса / История заказов / Скидки)
  // -----------------------------
  function setContentTab(tab) {
    state.activeContentTab = tab;
    if (clientContentTabs) {
      $$("[data-ctab]", clientContentTabs).forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.ctab === tab);
      });
    }
    [clientTabAddresses, clientTabOrders, clientTabDiscounts].forEach((panel) => {
      if (panel) panel.classList.toggle("is-active", panel.dataset.ctab === tab);
    });
    // lazy load orders
    if (tab === "orders" && state.activeClientId) {
      loadClientOrders().catch(console.error);
    }
    // lazy load discounts
    if (tab === "discounts" && state.activeClientId) {
      loadClientDiscounts().catch(console.error);
    }
  }

  if (clientContentTabs) {
    clientContentTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ctab]");
      if (btn) setContentTab(btn.dataset.ctab);
    });
  }

  // -----------------------------
  // Sorting
  // -----------------------------
  function applyClientsSort() {
    if (!Array.isArray(state.clients)) return;
    const arr = state.clients;
    switch (state.sort) {
      case 'name_asc':
        arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
        break;
      case 'orders_desc':
        arr.sort((a, b) => (Number(b.total_orders || 0) - Number(a.total_orders || 0)) || (Number(b.id||0)-Number(a.id||0)));
        break;
      case 'created_desc':
        arr.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta || (Number(b.id||0)-Number(a.id||0));
        });
        break;
      case 'last_desc':
      default:
        arr.sort((a, b) => {
          const ta = a.last_order_date ? new Date(a.last_order_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const tb = b.last_order_date ? new Date(b.last_order_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return tb - ta || (Number(b.id||0)-Number(a.id||0));
        });
        break;
    }
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function formatPhoneDigitsToRU(digits) {
    const s = String(digits || "").replace(/[^\d]/g, "");
    if (s.length !== 11) return digits || "—";
    const a = s.slice(1, 4);
    const b = s.slice(4, 7);
    const c = s.slice(7, 9);
    const d = s.slice(9, 11);
    return `+7 (${a}) ${b}-${c}-${d}`;
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function getClientOpenRequestFromUrl() {
    try {
      const url = new URL(window.location.href);
      const rawId = Number(url.searchParams.get("open_client_id") || 0);
      const clientId = Number.isFinite(rawId) && rawId > 0 ? rawId : null;
      const clientPhone = String(url.searchParams.get("open_client_phone") || "").trim();
      return { clientId, clientPhone };
    } catch {
      return { clientId: null, clientPhone: "" };
    }
  }

  function clearClientOpenRequestFromUrl() {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has("open_client_id")) {
        url.searchParams.delete("open_client_id");
        changed = true;
      }
      if (url.searchParams.has("open_client_phone")) {
        url.searchParams.delete("open_client_phone");
        changed = true;
      }
      if (changed) {
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", nextUrl);
      }
    } catch {}
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("ru-RU");
  }

  function fmtDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function openSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-active");
    sheet.setAttribute("aria-hidden", "false");
    sheetBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-active");
    sheet.setAttribute("aria-hidden", "true");
    sheetBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sheet-open");
  }

  function setTextAll(nodes, text) {
    nodes.forEach((n) => { if (n) n.textContent = text; });
  }

  function setNodesText(nodes, text) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((n) => {
      if (n) n.textContent = text;
    });
  }

  function setNodesHtml(nodes, html) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((n) => {
      if (n) n.innerHTML = html;
    });
  }

  function setNodesHidden(nodes, hidden) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((n) => {
      if (!n) return;
      n.classList.toggle('hidden', !!hidden);
    });
  }

  // -----------------------------
  // Render: filters
  // -----------------------------
  function renderFilters() {
    if (!elFilters) return;
    elFilters.innerHTML = "";
    
    // Базовый фильтр "Все клиенты"
    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "stage-item";
    btnAll.setAttribute("data-filter", "all");
    btnAll.classList.toggle("is-active", state.activeFilter === "all");
    btnAll.innerHTML = `
      <span class="stage-meta stage-text"><b>Все клиенты</b></span>
      <span class="stage-count">${escapeHtml(state.totals.all)}</span>
    `;
    btnAll.addEventListener("click", () => {
      state.activeFilter = "all";
      state.activeCustomFilterId = null;
      if (state.currentView !== 'clients') {
        switchView('clients');
      }
      renderFilters();
      loadClients().catch(console.error);
    });
    elFilters.appendChild(btnAll);

    // Кастомные категории клиентов
    state.customFilters.forEach((filter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-item";
      btn.setAttribute("data-filter", `custom_${filter.id}`);
      btn.classList.toggle("is-active", state.activeFilter === "custom" && state.activeCustomFilterId === filter.id);
      btn.innerHTML = `
        <span class="stage-meta stage-text"><b>${escapeHtml(filter.title)}</b></span>
        <span class="stage-count">${escapeHtml(filter.count || 0)}</span>
      `;
      btn.addEventListener("click", () => {
        state.activeFilter = "custom";
        state.activeCustomFilterId = filter.id;
        if (state.currentView !== 'clients') {
          switchView('clients');
        }
        renderFilters();
        loadClients().catch(console.error);
      });
      elFilters.appendChild(btn);
    });
  }

  // -----------------------------
  // Discounts & Promotions
  // -----------------------------
  async function loadDiscounts() {
    try {
      const json = await apiJson("/api/admin/discounts");
      state.discounts = json.discounts || [];
      state.discountsTotals.all = state.discounts.length;
      renderDiscountFilters();
    } catch (err) {
      console.error("loadDiscounts error:", err);
    }
  }

  function renderDiscountFilters() {
    if (!elDiscountsFilters) return;
    elDiscountsFilters.innerHTML = "";

    // Базовый фильтр "Все скидки"
    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "stage-item";
    btnAll.setAttribute("data-filter", "all");
    btnAll.classList.toggle("is-active", state.activeDiscountFilter === "all");
    btnAll.innerHTML = `
      <span class="stage-meta stage-text"><b>Все скидки</b></span>
      <span class="stage-count">${escapeHtml(state.discountsTotals.all)}</span>
    `;
    btnAll.addEventListener("click", () => {
      state.activeDiscountFilter = "all";
      state.activeDiscountId = null;
      state.activeDiscount = null;
      state.editingDiscountId = null;
      state.discountOrders = [];
      tabsState.activeKey = null;
      if (state.currentView !== 'discounts') {
        switchView('discounts');
      } else {
        renderDiscountsList();
        updateRightPanel();
      }
      renderTabs();
      renderDiscountFilters();
    });
    elDiscountsFilters.appendChild(btnAll);

    // Список скидок
    state.discounts.forEach((discount) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-item";
      btn.setAttribute("data-filter", `discount_${discount.id}`);
      btn.classList.toggle("is-active", state.activeDiscountId === discount.id);
      
      const statusIcon = discount.is_active 
        ? '<i class="fas fa-check-circle" style="color:var(--color-success);margin-right:6px;"></i>' 
        : '<i class="fas fa-pause-circle" style="color:var(--color-muted);margin-right:6px;"></i>';
      
      btn.innerHTML = `
        <span class="stage-meta stage-text">${statusIcon}<b>${escapeHtml(discount.title)}</b></span>
      `;
      btn.addEventListener("click", () => {
        state.activeDiscountFilter = "discount";
        state.activeDiscountId = discount.id;
        openDiscountTab(discount);
        renderDiscountFilters();
      });
      elDiscountsFilters.appendChild(btn);
    });
  }

  // Отрисовать список скидок в центральной колонке
  function renderDiscountsList() {
    if (!elDiscountsList) return;
    elDiscountsList.innerHTML = '';

    if (!state.discounts.length) {
      if (elDiscountsEmptyHint) elDiscountsEmptyHint.classList.remove('hidden');
      return;
    }
    if (elDiscountsEmptyHint) elDiscountsEmptyHint.classList.add('hidden');

    state.discounts.forEach((discount) => {
      const row = document.createElement('div');
      row.className = 'discount-row';
      row.classList.toggle('is-active', state.activeDiscountId === discount.id);

      const valueText = discount.discount_type === 'percent' 
        ? `${discount.discount_value}%`
        : discount.discount_type === 'fixed'
          ? `-${discount.discount_value}₽`
          : `${discount.discount_value}₽`;

      const applyToText = {
        'order': 'Заказ',
        'product': 'Товар',
        'category': 'Категория',
        'combo': 'Комбо'
      }[discount.apply_to] || discount.apply_to;

      row.innerHTML = `
        <div class="discount-row-icon"><i class="fas fa-percentage"></i></div>
        <div class="discount-row-info">
          <div class="discount-row-title">${escapeHtml(discount.title)}</div>
          <div class="discount-row-meta">${applyToText} • ${discount.usage_count || 0} использований</div>
        </div>
        <div class="discount-row-value">${valueText}</div>
        <div class="discount-row-status ${discount.is_active ? '' : 'inactive'}"></div>
      `;

      row.addEventListener('click', () => {
        state.activeDiscountId = discount.id;
        openDiscountTab(discount);
        renderDiscountsList();
        renderDiscountFilters();
      });

      elDiscountsList.appendChild(row);
    });
  }

  // Открыть таб скидки
  async function openDiscountTab(discount) {
    if (state.currentView !== 'discounts') {
      switchView('discounts');
    }

    const tabKey = buildTabKey('discount', discount.id);
    let existing = tabsState.tabs.find(t => t.key === tabKey);
    if (!existing) {
      tabsState.tabs.push({
        key: tabKey,
        type: 'discount',
        id: discount.id,
        title: discount.title,
      });
    }
    tabsState.activeKey = tabKey;
    state.activeDiscount = discount;
    state.editingDiscountId = null; // Сначала показываем инфо, не редактор
    renderTabs();
    updateRightPanel();

    // Загружаем полные данные скидки с товарами и клиентами
    try {
      const json = await apiJson(`/api/admin/discounts/${discount.id}`);
      if (json.discount) {
        state.activeDiscount = json.discount;
        renderDiscountInfo(json.discount);
      } else {
        renderDiscountInfo(discount);
      }
    } catch (e) {
      console.error('openDiscountTab load error:', e);
      renderDiscountInfo(discount);
    }
  }

  // Открыть редактор скидки
  async function openDiscountEditor(discountId) {
    const isNew = !discountId;
    const tabKey = isNew ? buildTabKey('discount', 'new') : buildTabKey('discount', discountId);
    
    let existing = tabsState.tabs.find(t => t.key === tabKey);
    if (!existing) {
      tabsState.tabs.push({
        key: tabKey,
        type: 'discount',
        id: discountId || 'new',
        title: isNew ? 'Новая скидка' : 'Редактирование',
      });
    }
    tabsState.activeKey = tabKey;
    state.editingDiscountId = discountId || 'new';

    // Заполняем форму
    if (elDiscountEditorForm) {
      if (isNew) {
        elDiscountEditorForm.reset();
        $('#de_id').value = '';
        $('#de_is_active').checked = true;
        $('#de_is_stackable').checked = false;
        $('#de_priority').value = '0';
        // Сброс выбранных товаров/клиентов
        state.discountSelectedProducts = [];
        state.discountSelectedCustomers = [];
        renderDiscountProductChips();
        renderDiscountCustomerChips();
      } else {
        // Загружаем полные данные скидки с сервера (включая products и customers)
        try {
          const json = await apiJson(`/api/admin/discounts/${discountId}`);
          if (json.discount) {
            fillDiscountForm(json.discount);
          }
        } catch (e) {
          console.error('openDiscountEditor load error:', e);
          // Fallback к локальным данным
          const discount = state.discounts.find(d => d.id === discountId);
          if (discount) {
            fillDiscountForm(discount);
          }
        }
      }
    }

    // Показать кнопку удаления только для существующих
    if (elDiscountDeleteBtn) {
      elDiscountDeleteBtn.style.display = isNew ? 'none' : '';
    }

    renderTabs();
    updateRightPanel();
  }

  // Заполнить форму скидки данными
  function fillDiscountForm(discount) {
    if (!elDiscountEditorForm) return;
    
    $('#de_id').value = discount.id || '';
    $('#de_title').value = discount.title || '';
    $('#de_discount_type').value = discount.discount_type || 'percent';
    $('#de_discount_value').value = discount.discount_value || '';
    $('#de_apply_to').value = discount.apply_to || 'order';
    $('#de_min_order_amount').value = discount.min_order_amount || '';
    $('#de_max_discount_amount').value = discount.max_discount_amount || '';
    
    // Даты
    if (discount.starts_at) {
      $('#de_starts_at').value = formatDateTimeLocal(discount.starts_at);
    } else {
      $('#de_starts_at').value = '';
    }
    if (discount.ends_at) {
      $('#de_ends_at').value = formatDateTimeLocal(discount.ends_at);
    } else {
      $('#de_ends_at').value = '';
    }
    
    // Расписание дней
    const scheduleDays = discount.schedule_days ? (typeof discount.schedule_days === 'string' ? JSON.parse(discount.schedule_days) : discount.schedule_days) : [];
    $$('#de_schedule_days input[type="checkbox"]').forEach(cb => {
      cb.checked = scheduleDays.includes(parseInt(cb.value, 10));
    });
    
    $('#de_schedule_time_start').value = discount.schedule_time_start || '';
    $('#de_schedule_time_end').value = discount.schedule_time_end || '';
    $('#de_usage_limit').value = discount.usage_limit || '';
    $('#de_usage_per_customer').value = discount.usage_per_customer || '';
    $('#de_priority').value = discount.priority || '0';
    $('#de_is_stackable').checked = !!discount.is_stackable;
    $('#de_is_active').checked = discount.is_active !== false && discount.is_active !== 0;

    // Загружаем выбранные товары
    if (Array.isArray(discount.products)) {
      state.discountSelectedProducts = discount.products.map(p => ({
        type: p.entity_type || 'product',
        id: p.entity_id,
        title: p.title || `#${p.entity_id}`
      }));
    } else {
      state.discountSelectedProducts = [];
    }
    renderDiscountProductChips();

    // Загружаем выбранных клиентов
    if (Array.isArray(discount.customers)) {
      state.discountSelectedCustomers = discount.customers.map(c => ({
        type: c.entity_type || 'customer',
        id: c.entity_id,
        title: c.title || `#${c.entity_id}`
      }));
    } else {
      state.discountSelectedCustomers = [];
    }
    renderDiscountCustomerChips();
  }

  // Форматировать дату для input datetime-local
  function formatDateTimeLocal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  }

  // Отобразить инфо скидки в правой панели
  function renderDiscountInfo(discount) {
    if (!discount) return;

    const titleEl = $('#discountInfoTitle');
    const badgeEl = $('#discountInfoBadge');
    const valueEl = $('#discountInfoValue');
    const usageEl = $('#discountInfoUsageCount');
    const applyToEl = $('#discountInfoApplyTo');
    const periodEl = $('#discountInfoPeriod');
    const limitEl = $('#discountInfoLimit');

    if (titleEl) titleEl.textContent = discount.title;
    
    if (badgeEl) {
      badgeEl.textContent = discount.is_active ? 'Активна' : 'Неактивна';
      badgeEl.classList.toggle('inactive', !discount.is_active);
    }

    if (valueEl) {
      const valueText = discount.discount_type === 'percent' 
        ? `${discount.discount_value}%`
        : discount.discount_type === 'fixed'
          ? `-${discount.discount_value}₽`
          : `${discount.discount_value}₽`;
      valueEl.textContent = valueText;
    }

    if (usageEl) usageEl.textContent = discount.usage_count || 0;

    if (applyToEl) {
      const applyToText = {
        'order': 'Весь заказ',
        'product': 'Товар',
        'category': 'Категория',
        'combo': 'Комбо'
      }[discount.apply_to] || discount.apply_to;
      applyToEl.textContent = applyToText;
    }

    if (periodEl) {
      if (discount.starts_at || discount.ends_at) {
        const start = discount.starts_at ? new Date(discount.starts_at).toLocaleDateString('ru') : '—';
        const end = discount.ends_at ? new Date(discount.ends_at).toLocaleDateString('ru') : '—';
        periodEl.textContent = `${start} — ${end}`;
      } else {
        periodEl.textContent = 'Без ограничений';
      }
    }

    if (limitEl) {
      if (discount.usage_limit) {
        limitEl.textContent = `${discount.usage_count || 0} / ${discount.usage_limit}`;
      } else {
        limitEl.textContent = 'Без ограничений';
      }
    }

    // Отображаем привязанные товары
    const productsEl = $('#discountInfoProducts');
    const productsSectionEl = $('#discountInfoProductsSection');
    if (productsEl) {
      const products = discount.products || [];
      if (products.length > 0) {
        if (productsSectionEl) productsSectionEl.classList.remove('hidden');
        productsEl.innerHTML = products.map(p => {
          const cls = p.entity_type === 'category' ? 'is-category' : (p.entity_type === 'combo' ? 'is-combo' : '');
          return `<span class="discount-chip ${cls}">${escapeHtml(p.title || `#${p.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (productsSectionEl) productsSectionEl.classList.add('hidden');
        productsEl.innerHTML = '';
      }
    }

    // Отображаем привязанных клиентов
    const customersEl = $('#discountInfoCustomers');
    const customersSectionEl = $('#discountInfoCustomersSection');
    if (customersEl) {
      const customers = discount.customers || [];
      if (customers.length > 0) {
        if (customersSectionEl) customersSectionEl.classList.remove('hidden');
        customersEl.innerHTML = customers.map(c => {
          const cls = c.entity_type === 'category' ? 'is-category' : '';
          return `<span class="discount-chip ${cls}">${escapeHtml(c.title || `#${c.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (customersSectionEl) customersSectionEl.classList.add('hidden');
        customersEl.innerHTML = '';
      }
    }
    
    // Загружаем заказы со скидкой
    loadDiscountOrders(discount.id);
  }

  // Загрузить заказы, где использовалась скидка
  async function loadDiscountOrders(discountId) {
    try {
      const json = await apiJson(`/api/admin/discounts/${discountId}/orders`);
      state.discountOrders = json.orders || [];
      renderDiscountOrders();
    } catch (err) {
      console.error('loadDiscountOrders error:', err);
      state.discountOrders = [];
    }
  }

  // Отрисовать заказы со скидкой в центральной колонке
  function renderDiscountOrders() {
    if (!elDiscountsList) return;
    
    // Если активна скидка, показываем её заказы
    if (!state.activeDiscount) {
      renderDiscountsList();
      return;
    }

    elDiscountsList.innerHTML = '';

    if (!state.discountOrders.length) {
      elDiscountsList.innerHTML = '<div class="empty-hint">Нет заказов с этой скидкой</div>';
      return;
    }

    state.discountOrders.forEach((order) => {
      const row = document.createElement('div');
      row.className = 'order-row discount-order-row';
      
      const date = order.used_at ? new Date(order.used_at).toLocaleString('ru') : '—';
      const total = order.total_price ? `${order.total_price}₽` : '—';
      const discountAmount = order.discount_amount ? `-${order.discount_amount}₽` : '';

      row.innerHTML = `
        <div class="order-row-info">
          <div class="order-row-title">${escapeHtml(order.customer_name || order.customer_phone || 'Без имени')}</div>
          <div class="order-row-meta">${date}</div>
        </div>
        <div class="order-row-right">
          <div class="order-row-total">${total}</div>
          <div class="order-row-discount">${discountAmount}</div>
        </div>
      `;

      elDiscountsList.appendChild(row);
    });
  }

  // Сохранить скидку
  async function saveDiscount() {
    if (!elDiscountEditorForm) return;

    const id = $('#de_id').value;
    const isNew = !id || id === 'new';

    // Собираем данные формы
    const scheduleDays = [];
    $$('#de_schedule_days input[type="checkbox"]:checked').forEach(cb => {
      scheduleDays.push(parseInt(cb.value, 10));
    });

    const data = {
      title: $('#de_title').value.trim(),
      discount_type: $('#de_discount_type').value,
      discount_value: parseFloat($('#de_discount_value').value) || 0,
      apply_to: $('#de_apply_to').value,
      min_order_amount: parseFloat($('#de_min_order_amount').value) || null,
      max_discount_amount: parseFloat($('#de_max_discount_amount').value) || null,
      starts_at: $('#de_starts_at').value || null,
      ends_at: $('#de_ends_at').value || null,
      schedule_days: scheduleDays.length ? scheduleDays : null,
      schedule_time_start: $('#de_schedule_time_start').value || null,
      schedule_time_end: $('#de_schedule_time_end').value || null,
      usage_limit: parseInt($('#de_usage_limit').value, 10) || null,
      usage_per_customer: parseInt($('#de_usage_per_customer').value, 10) || null,
      priority: parseInt($('#de_priority').value, 10) || 0,
      is_stackable: $('#de_is_stackable').checked,
      is_active: $('#de_is_active').checked,
      // Товары и клиенты
      products: state.discountSelectedProducts.map(p => ({
        entity_type: p.type,
        entity_id: p.id
      })),
      customers: state.discountSelectedCustomers.map(c => ({
        entity_type: c.type,
        entity_id: c.id
      })),
    };

    if (!data.title) {
      alert('Введите название скидки');
      return;
    }
    if (!data.discount_value || data.discount_value <= 0) {
      alert('Введите корректное значение скидки');
      return;
    }

    try {
      if (isNew) {
        await apiJson('/api/admin/discounts', { method: 'POST', body: data });
      } else {
        await apiJson(`/api/admin/discounts/${id}`, { method: 'PUT', body: data });
      }

      // Перезагружаем список скидок
      await loadDiscounts();
      
      // Закрываем таб
      closeActiveTab();
      
      state.editingDiscountId = null;
      updateRightPanel();
    } catch (err) {
      console.error('saveDiscount error:', err);
      alert('Ошибка сохранения: ' + err.message);
    }
  }

  // Удалить скидку
  async function deleteDiscount() {
    const id = $('#de_id').value;
    if (!id || id === 'new') return;

    if (!confirm('Удалить эту скидку?')) return;

    try {
      await apiJson(`/api/admin/discounts/${id}`, { method: 'DELETE' });
      
      // Перезагружаем список
      await loadDiscounts();
      
      // Закрываем таб
      closeActiveTab();
      
      state.editingDiscountId = null;
      state.activeDiscount = null;
      updateRightPanel();
    } catch (err) {
      console.error('deleteDiscount error:', err);
      alert('Ошибка удаления: ' + err.message);
    }
  }

  // -----------------------------
  // Discount Picker (products/customers)
  // -----------------------------

  // Загрузить категории товаров
  async function loadCatalogCategories() {
    if (state.catalogCategories.length > 0) return state.catalogCategories;
    try {
      const json = await apiJson('/api/prod_categories');
      state.catalogCategories = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error('loadCatalogCategories error:', e);
      state.catalogCategories = [];
    }
    return state.catalogCategories;
  }

  // Загрузить товары по категории
  async function loadCatalogProducts(categoryId) {
    try {
      const url = categoryId ? `/api/prod_products?category_id=${categoryId}` : '/api/prod_products';
      const json = await apiJson(url);
      state.catalogProducts = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error('loadCatalogProducts error:', e);
      state.catalogProducts = [];
    }
    return state.catalogProducts;
  }

  // Загрузить категории клиентов
  async function loadCustomerCategories() {
    if (state.customerCategories.length > 0) return state.customerCategories;
    try {
      const json = await apiJson('/api/admin/clients/filters/list');
      state.customerCategories = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error('loadCustomerCategories error:', e);
      state.customerCategories = [];
    }
    return state.customerCategories;
  }

  function rememberCustomers(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      const id = Number(row?.id || 0);
      if (!Number.isFinite(id) || id <= 0) return;
      state.customersById.set(id, row);
    });
  }

  // Загрузить список клиентов (поиск по всей таблице с пагинацией)
  async function loadCustomersList(query = '') {
    const token = ++discountCustomerSearchToken;
    const search = String(query || '').trim();
    const limit = 200;
    let offset = 0;
    let total = null;
    const rows = [];
    const seenIds = new Set();

    try {
      while (total === null || offset < total) {
        const qs = new URLSearchParams();
        qs.set('limit', String(limit));
        qs.set('offset', String(offset));
        if (search) qs.set('q', search);

        const json = await apiJson(`/api/admin/clients?${qs.toString()}`);
        if (token !== discountCustomerSearchToken) {
          return state.customersList;
        }

        const chunk = Array.isArray(json.data) ? json.data : [];
        total = Number(json.total || 0);

        chunk.forEach((item) => {
          const id = Number(item?.id || 0);
          if (!Number.isFinite(id) || id <= 0) return;
          if (seenIds.has(id)) return;
          seenIds.add(id);
          rows.push(item);
        });

        if (!chunk.length) break;
        offset += chunk.length;

        // Защита от бесконечного цикла при неконсистентном total
        if (offset > 5000) break;
      }

      if (token !== discountCustomerSearchToken) {
        return state.customersList;
      }

      state.customersList = rows;
      rememberCustomers(rows);
    } catch (e) {
      if (token === discountCustomerSearchToken) {
        console.error('loadCustomersList error:', e);
        state.customersList = [];
      }
    }

    return state.customersList;
  }

  // Открыть picker для товаров
  async function openDiscountProductPicker() {
    state.discountPickerLevel = 'products';
    state.discountPickerQuery = '';
    state.discountPickerCategoryId = null;
    
    // Копируем текущий выбор в Set
    state.discountPickerSelection = new Set(
      state.discountSelectedProducts.map(p => `${p.type}:${p.id}`)
    );

    // Загружаем категории
    await loadCatalogCategories();
    
    // Показываем picker, скрываем форму
    if (elDiscountEditorWrap) elDiscountEditorWrap.classList.add('hidden');
    if (elDiscountEditorFooter) elDiscountEditorFooter.classList.add('hidden');
    if (elDiscountProductPicker) elDiscountProductPicker.classList.remove('hidden');
    if (elDiscountPickerFooter) elDiscountPickerFooter.classList.remove('hidden');
    
    // Рендерим
    renderDiscountPickerTabs();
    await refreshDiscountPickerProducts();
  }

  // Открыть picker для клиентов
  async function openDiscountCustomerPicker() {
    state.discountPickerLevel = 'customers';
    state.discountPickerQuery = '';
    state.discountPickerCategoryId = null;
    if (elDiscountCustomerPickerSearch) {
      elDiscountCustomerPickerSearch.value = '';
    }
    
    // Копируем текущий выбор в Set
    state.discountPickerSelection = new Set(
      state.discountSelectedCustomers.map(c => `${c.type}:${c.id}`)
    );

    // Загружаем категории клиентов
    await loadCustomerCategories();
    
    // Показываем picker, скрываем форму
    if (elDiscountEditorWrap) elDiscountEditorWrap.classList.add('hidden');
    if (elDiscountEditorFooter) elDiscountEditorFooter.classList.add('hidden');
    if (elDiscountCustomerPicker) elDiscountCustomerPicker.classList.remove('hidden');
    if (elDiscountPickerFooter) elDiscountPickerFooter.classList.remove('hidden');
    
    // Рендерим
    renderDiscountCustomerPickerTabs();
    await refreshDiscountCustomerPickerList();
  }

  // Закрыть picker без сохранения
  function closeDiscountPicker() {
    state.discountPickerLevel = null;
    state.discountPickerSelection.clear();
    
    // Скрываем pickers
    if (elDiscountProductPicker) elDiscountProductPicker.classList.add('hidden');
    if (elDiscountCustomerPicker) elDiscountCustomerPicker.classList.add('hidden');
    if (elDiscountPickerFooter) elDiscountPickerFooter.classList.add('hidden');
    
    // Показываем форму
    if (elDiscountEditorWrap) elDiscountEditorWrap.classList.remove('hidden');
    if (elDiscountEditorFooter) elDiscountEditorFooter.classList.remove('hidden');
  }

  // Применить выбор
  function applyDiscountPickerSelection() {
    if (state.discountPickerLevel === 'products') {
      // Конвертируем Set обратно в массив объектов
      const newSelection = [];
      state.discountPickerSelection.forEach(key => {
        const [type, idStr] = key.split(':');
        const id = parseInt(idStr, 10);
        // Находим название
        let title = '';
        if (type === 'category') {
          const cat = state.catalogCategories.find(c => c.id === id);
          title = cat?.title || `Категория #${id}`;
        } else {
          const prod = state.catalogProducts.find(p => p.id === id);
          title = prod?.name || prod?.title || `Товар #${id}`;
        }
        newSelection.push({ type, id, title });
      });
      state.discountSelectedProducts = newSelection;
      renderDiscountProductChips();
    } else if (state.discountPickerLevel === 'customers') {
      const newSelection = [];
      state.discountPickerSelection.forEach(key => {
        const [type, idStr] = key.split(':');
        const id = parseInt(idStr, 10);
        let title = '';
        if (type === 'category') {
          const cat = state.customerCategories.find(c => c.id === id);
          title = cat?.title || `Категория #${id}`;
        } else {
          const cust = state.customersById.get(id) || state.customersList.find(c => c.id === id);
          title = cust?.name || cust?.phone || `Клиент #${id}`;
        }
        newSelection.push({ type, id, title });
      });
      state.discountSelectedCustomers = newSelection;
      renderDiscountCustomerChips();
    }
    
    closeDiscountPicker();
  }

  // Рендеринг табов категорий товаров
  function renderDiscountPickerTabs() {
    if (!elDiscountPickerTabs) return;
    
    const categories = state.catalogCategories;
    const activeId = state.discountPickerCategoryId;
    
    let html = `<button type="button" class="option-picker-tab ${activeId === null ? 'is-active' : ''}" data-cat-id="">Все</button>`;
    categories.forEach(cat => {
      html += `<button type="button" class="option-picker-tab ${activeId === cat.id ? 'is-active' : ''}" data-cat-id="${cat.id}">${escapeHtml(cat.title)}</button>`;
    });
    
    elDiscountPickerTabs.innerHTML = html;
  }

  // Рендеринг табов категорий клиентов
  function renderDiscountCustomerPickerTabs() {
    if (!elDiscountCustomerPickerTabs) return;
    
    const categories = state.customerCategories;
    const activeId = state.discountPickerCategoryId;
    
    let html = `<button type="button" class="option-picker-tab ${activeId === null ? 'is-active' : ''}" data-cat-id="">Все клиенты</button>`;
    html += `<button type="button" class="option-picker-tab ${activeId === 'categories' ? 'is-active' : ''}" data-cat-id="categories">Категории</button>`;
    
    elDiscountCustomerPickerTabs.innerHTML = html;
  }

  // Обновить список товаров в picker
  async function refreshDiscountPickerProducts() {
    await loadCatalogProducts(state.discountPickerCategoryId);
    renderDiscountPickerList();
  }

  // Обновить список в picker клиентов
  async function refreshDiscountCustomerPickerList() {
    if (state.discountPickerCategoryId === 'categories') {
      // Показываем категории клиентов
      renderDiscountCustomerCategoryList();
    } else {
      // Показываем клиентов (поиск по всей базе, не по локальному кэшу)
      if (elDiscountCustomerPickerList) {
        elDiscountCustomerPickerList.innerHTML = '<div class="option-picker-empty">Загрузка клиентов...</div>';
      }
      await loadCustomersList(state.discountPickerQuery);
      renderDiscountCustomerList();
    }
  }

  // Рендеринг списка товаров
  function renderDiscountPickerList() {
    if (!elDiscountPickerList) return;
    
    let items = state.catalogProducts;
    const query = state.discountPickerQuery.toLowerCase();
    if (query) {
      items = items.filter(p => (p.name || p.title) && (p.name || p.title).toLowerCase().includes(query));
    }
    
    if (items.length === 0) {
      elDiscountPickerList.innerHTML = '<div class="option-picker-empty">Товары не найдены</div>';
      return;
    }
    
    elDiscountPickerList.innerHTML = items.map(prod => {
      const key = `product:${prod.id}`;
      const isChecked = state.discountPickerSelection.has(key);
      const prodName = prod.name || prod.title || '';
      return `
        <label class="option-picker-row${isChecked ? ' is-selected' : ''}">
          <input type="checkbox" data-key="${key}" ${isChecked ? 'checked' : ''} />
          <span class="option-picker-title">${escapeHtml(prodName)}</span>
          <span class="option-picker-price">${prod.price ? 'Цена: ' + prod.price + ' ₽' : ''}</span>
        </label>
      `;
    }).join('');

    updatePickerSelectAll();
  }

  // Рендеринг списка категорий клиентов
  function renderDiscountCustomerCategoryList() {
    if (!elDiscountCustomerPickerList) return;
    
    const categories = state.customerCategories;
    if (categories.length === 0) {
      elDiscountCustomerPickerList.innerHTML = '<div class="option-picker-empty">Категории не найдены</div>';
      return;
    }
    
    elDiscountCustomerPickerList.innerHTML = categories.map(cat => {
      const key = `category:${cat.id}`;
      const isChecked = state.discountPickerSelection.has(key);
      return `
        <label class="option-picker-row${isChecked ? ' is-selected' : ''}">
          <input type="checkbox" data-key="${key}" ${isChecked ? 'checked' : ''} />
          <span class="option-picker-title">${escapeHtml(cat.title)}</span>
        </label>
      `;
    }).join('');

    updateCustomerPickerSelectAll();
  }

  // Рендеринг списка клиентов
  function renderDiscountCustomerList() {
    if (!elDiscountCustomerPickerList) return;
    
    const items = state.customersList;
    
    if (items.length === 0) {
      elDiscountCustomerPickerList.innerHTML = '<div class="option-picker-empty">Клиенты не найдены</div>';
      return;
    }
    
    elDiscountCustomerPickerList.innerHTML = items.map(cust => {
      const key = `customer:${cust.id}`;
      const isChecked = state.discountPickerSelection.has(key);
      return `
        <label class="option-picker-row${isChecked ? ' is-selected' : ''}">
          <input type="checkbox" data-key="${key}" ${isChecked ? 'checked' : ''} />
          <span class="option-picker-title">${escapeHtml(cust.name || 'Без имени')}</span>
          <span class="option-picker-price">${escapeHtml(cust.phone || '')}</span>
        </label>
      `;
    }).join('');

    updateCustomerPickerSelectAll();
  }

  // Обновить состояние "Выбрать все"
  function updatePickerSelectAll() {
    if (!elDiscountPickerSelectAll) return;
    const checkboxes = $$('#discountPickerList input[type="checkbox"]');
    const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
    elDiscountPickerSelectAll.checked = allChecked;
  }

  function updateCustomerPickerSelectAll() {
    if (!elDiscountCustomerPickerSelectAll) return;
    const checkboxes = $$('#discountCustomerPickerList input[type="checkbox"]');
    const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
    elDiscountCustomerPickerSelectAll.checked = allChecked;
  }

  // Рендеринг чипсов выбранных товаров
  function renderDiscountProductChips() {
    if (!elDeProductsChips) return;
    
    if (state.discountSelectedProducts.length === 0) {
      elDeProductsChips.innerHTML = '<span class="discount-chips-empty">Не выбрано</span>';
      return;
    }
    
    elDeProductsChips.innerHTML = state.discountSelectedProducts.map(item => {
      const cls = item.type === 'category' ? 'is-category' : (item.type === 'combo' ? 'is-combo' : '');
      return `
        <span class="discount-chip ${cls}" data-type="${item.type}" data-id="${item.id}">
          <span class="discount-chip-text">${escapeHtml(item.title)}</span>
          <span class="discount-chip-remove"><i class="fas fa-times"></i></span>
        </span>
      `;
    }).join('');
  }

  // Рендеринг чипсов выбранных клиентов
  function renderDiscountCustomerChips() {
    if (!elDeCustomersChips) return;
    
    if (state.discountSelectedCustomers.length === 0) {
      elDeCustomersChips.innerHTML = '<span class="discount-chips-empty">Не выбрано</span>';
      return;
    }
    
    elDeCustomersChips.innerHTML = state.discountSelectedCustomers.map(item => {
      const cls = item.type === 'category' ? 'is-category' : '';
      return `
        <span class="discount-chip ${cls}" data-type="${item.type}" data-id="${item.id}">
          <span class="discount-chip-text">${escapeHtml(item.title)}</span>
          <span class="discount-chip-remove"><i class="fas fa-times"></i></span>
        </span>
      `;
    }).join('');
  }

  // Удалить чип товара
  function removeDiscountProductChip(type, id) {
    state.discountSelectedProducts = state.discountSelectedProducts.filter(
      p => !(p.type === type && p.id === id)
    );
    renderDiscountProductChips();
  }

  // Удалить чип клиента
  function removeDiscountCustomerChip(type, id) {
    state.discountSelectedCustomers = state.discountSelectedCustomers.filter(
      c => !(c.type === type && c.id === id)
    );
    renderDiscountCustomerChips();
  }

  // Закрыть активный таб
  function closeActiveTab() {
    if (!tabsState.activeKey) return;
    const idx = tabsState.tabs.findIndex(t => t.key === tabsState.activeKey);
    if (idx !== -1) {
      tabsState.tabs.splice(idx, 1);
      tabsState.activeKey = tabsState.tabs.length > 0 ? tabsState.tabs[tabsState.tabs.length - 1].key : null;
    }
    renderTabs();
  }

  // -----------------------------
  // Custom Filters (Marketing)
  // -----------------------------
  const filterFieldOptions = [
    { value: 'total_orders', label: 'Количество заказов' },
    { value: 'total_spent', label: 'Сумма покупок' },
    { value: 'last_order_date', label: 'Последний заказ' },
    { value: 'created_at', label: 'Дата регистрации' },
  ];

  const filterOperatorOptions = [
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '=', label: '=' },
  ];

  async function loadCustomFilters() {
    try {
      const json = await apiJson('/api/admin/clients/filters/list');
      state.customFilters = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error('Failed to load custom filters:', e);
      state.customFilters = [];
    }
    // Обновляем список фильтров в левой панели
    renderFilters();
  }

  // Переключение между views
  function switchView(viewName) {
    state.currentView = viewName;

    // Переключаем контент в центральной колонке
    $$('[data-view-content]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.viewContent !== viewName);
    });

    // Обновляем toolbar
    if (elToolbarText) {
      const titles = {
        'clients': 'Клиенты',
        'filter-categories': 'Категории',
        'discounts': 'Скидки'
      };
      elToolbarText.textContent = titles[viewName] || 'Клиенты';
    }
    if (elToolbarTitle) {
      const icon = elToolbarTitle.querySelector('i');
      if (icon) {
        const icons = {
          'clients': 'fas fa-users',
          'filter-categories': 'fas fa-filter',
          'discounts': 'fas fa-percentage'
        };
        icon.className = icons[viewName] || 'fas fa-users';
      }
    }

    // Показываем/скрываем элементы toolbar в зависимости от view
    if (elSearchWrap) elSearchWrap.style.display = viewName === 'clients' ? '' : 'none';
    if (elSortWrap) elSortWrap.style.display = viewName === 'clients' ? '' : 'none';

    // Обновляем правую колонку
    updateRightPanel();

    // Загружаем данные
    if (viewName === 'filter-categories') {
      renderFilterCategoriesList();
    } else if (viewName === 'discounts') {
      renderDiscountsList();
    } else if (viewName === 'clients') {
      maybeLoadMoreClientsOnScroll();
      ensureClientsScrollable().catch(console.error);
    }
  }

  function updateRightPanel() {
    const activeTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
    const isClientTab = activeTab?.type === 'client';
    const isOrderTab = activeTab?.type === 'order';
    const isCategoryTab = activeTab?.type === 'category';
    const isDiscountTab = activeTab?.type === 'discount';
    const noTabs = !activeTab;

    if (clientEmpty) clientEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'clients');
    if (clientInfoWrap) clientInfoWrap.classList.toggle('hidden', !isClientTab);
    if (clientOrderInfoWrap) clientOrderInfoWrap.classList.toggle('hidden', !isOrderTab);

    if (elFilterCategoryEmpty) elFilterCategoryEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'filter-categories');
    if (elFilterEditorWrap) elFilterEditorWrap.classList.toggle('hidden', !isCategoryTab);
    if (elFilterEditorFooter) elFilterEditorFooter.classList.toggle('hidden', !isCategoryTab);

    if (elDiscountEmpty) elDiscountEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'discounts');
    const isEditingDiscount = isDiscountTab && state.editingDiscountId !== null;
    const isViewingDiscount = isDiscountTab && state.editingDiscountId === null && state.activeDiscount;
    if (elDiscountEditorWrap) elDiscountEditorWrap.classList.toggle('hidden', !isEditingDiscount);
    if (elDiscountEditorFooter) elDiscountEditorFooter.classList.toggle('hidden', !isEditingDiscount);
    if (elDiscountInfoWrap) elDiscountInfoWrap.classList.toggle('hidden', !isViewingDiscount);
  }

  function renderFilterCategoriesList() {
    if (!elFilterCategoriesList) return;
    elFilterCategoriesList.innerHTML = '';

    if (!state.customFilters.length) {
      if (elFilterCategoriesEmpty) elFilterCategoriesEmpty.classList.remove('hidden');
      return;
    }
    if (elFilterCategoriesEmpty) elFilterCategoriesEmpty.classList.add('hidden');

    state.customFilters.forEach((filter) => {
      const row = document.createElement('div');
      row.className = 'order-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('data-filter-id', String(filter.id));
      
      // Подсветка если открыт таб этой категории
      const tabKey = buildTabKey('category', filter.id);
      const isTabOpen = tabsState.tabs.some(t => t.key === tabKey);
      if (isTabOpen && tabsState.activeKey === tabKey) row.classList.add('is-active');

      const rulesCount = filter.conditions?.rules?.length || 0;

      row.innerHTML = `
        <div class="order-icon"><i class="fas ${escapeHtml(filter.icon || 'fa-filter')}"></i></div>
        <div class="order-mid"><strong>${escapeHtml(filter.title)}</strong></div>
        <div class="order-actions"><span class="pill">${rulesCount}</span></div>
      `;

      row.addEventListener('click', () => openFilterEditor(filter));
      elFilterCategoriesList.appendChild(row);
    });
  }

  function openFilterEditor(filter = null) {
    const isNew = filter === null;
    const tabId = isNew ? 'new' : filter.id;
    const tabTitle = isNew ? 'Новая категория' : (filter.title || 'Категория');
    
    ensureTab({
      type: 'category',
      id: tabId,
      title: tabTitle,
      onActivate: () => activateFilterEditor(filter),
    });
  }

  function activateFilterEditor(filter = null) {
    const isNew = filter === null;
    state.editingFilterId = isNew ? 'new' : filter.id;

    // Заполняем форму
    const titleInput = $('#fe_title');
    const logicWrap = $('#fe_logic');
    const idInput = $('#fe_id');
    const isActiveInput = $('#fe_is_active');

    if (titleInput) titleInput.value = filter?.title || '';
    
    // Обновляем кастомный select для логики
    if (logicWrap) {
      const logicVal = filter?.conditions?.logic || 'AND';
      logicWrap.dataset.value = logicVal;
      const logicLabel = logicVal === 'OR' ? 'Любое условие (ИЛИ)' : 'Все условия (И)';
      const valueSpan = logicWrap.querySelector('.cs-value');
      if (valueSpan) valueSpan.textContent = logicLabel;
      logicWrap.querySelectorAll('.cs-option').forEach(opt => {
        opt.classList.toggle('is-selected', opt.dataset.value === logicVal);
      });
    }
    
    if (idInput) idInput.value = filter?.id || '';
    if (isActiveInput) isActiveInput.checked = filter?.is_active !== false;

    // Рендерим правила
    renderFilterRules(filter?.conditions?.rules || []);

    // Обновляем кнопку сохранения
    if (elFilterSaveBtn) {
      elFilterSaveBtn.textContent = isNew ? 'Создать' : 'Сохранить';
    }

    // Показываем/скрываем кнопку удаления
    if (elFilterDeleteBtn) {
      elFilterDeleteBtn.classList.toggle('hidden', isNew);
    }

    updateRightPanel();

    // Обновляем список чтобы подсветить выбранный
    renderFilterCategoriesList();
  }

  function renderFilterRules(rules) {
    if (!elFilterRulesContainer) return;
    elFilterRulesContainer.innerHTML = '';

    if (!rules.length) {
      // Добавляем одно пустое правило
      rules = [{ field: 'total_orders', operator: '>=', value: '' }];
    }

    rules.forEach((rule, idx) => {
      const html = renderRuleRow(idx, rule);
      elFilterRulesContainer.insertAdjacentHTML('beforeend', html);
    });

    bindRuleRowEvents();
  }

  // ─── Custom Select Component ───
  function createCustomSelect(options, selectedValue, className = '', placeholder = 'Выберите...') {
    const selected = options.find(o => o.value === selectedValue) || options[0] || { value: '', label: placeholder };
    const optionsHtml = options.map(opt => 
      `<button type="button" class="cs-option${opt.value === selected.value ? ' is-selected' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`
    ).join('');

    return `
      <div class="custom-select ${className}" data-value="${escapeHtml(selected.value)}">
        <button type="button" class="cs-trigger control">
          <span class="cs-value">${escapeHtml(selected.label)}</span>
          <i class="fas fa-chevron-down cs-arrow"></i>
        </button>
        <div class="cs-dropdown hidden">${optionsHtml}</div>
      </div>
    `;
  }

  function initCustomSelects(container) {
    if (!container) return;
    container.querySelectorAll('.custom-select').forEach(wrap => {
      const trigger = wrap.querySelector('.cs-trigger');
      const dropdown = wrap.querySelector('.cs-dropdown');
      const valueSpan = wrap.querySelector('.cs-value');
      if (!trigger || !dropdown) return;

      // Открытие/закрытие
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        closeAllCustomSelects();
        if (!isOpen) {
          dropdown.classList.remove('hidden');
          wrap.classList.add('is-open');
        }
      });

      // Выбор опции
      dropdown.querySelectorAll('.cs-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = opt.dataset.value;
          wrap.dataset.value = val;
          if (valueSpan) valueSpan.textContent = opt.textContent;
          dropdown.querySelectorAll('.cs-option').forEach(o => o.classList.remove('is-selected'));
          opt.classList.add('is-selected');
          dropdown.classList.add('hidden');
          wrap.classList.remove('is-open');
          // Dispatch change event
          wrap.dispatchEvent(new CustomEvent('cs-change', { detail: { value: val } }));
        });
      });
    });
  }

  function closeAllCustomSelects() {
    document.querySelectorAll('.custom-select.is-open').forEach(wrap => {
      wrap.classList.remove('is-open');
      const dd = wrap.querySelector('.cs-dropdown');
      if (dd) dd.classList.add('hidden');
    });
  }

  // Закрытие при клике вне
  document.addEventListener('click', () => closeAllCustomSelects());

  function renderRuleRow(idx, rule) {
    const isDateField = ['last_order_date', 'created_at', 'registration_date'].includes(rule.field);
    const daysValue = typeof rule.value === 'string' && rule.value.match(/^-(\d+)d$/) ? rule.value.slice(1, -1) : '';

    const fieldSelect = createCustomSelect(filterFieldOptions, rule.field, 'rule-field');
    const operatorSelect = createCustomSelect(filterOperatorOptions, rule.operator, 'rule-operator');

    return `
      <div class="filter-rule-row">
        ${fieldSelect}
        ${operatorSelect}
        <input type="text" class="control rule-value${isDateField ? ' hidden' : ''}" value="${escapeHtml(isDateField ? '' : String(rule.value || ''))}" placeholder="Значение" />
        <div class="rule-date-input${isDateField ? '' : ' hidden'}">
          <input type="number" class="control rule-value-days" value="${escapeHtml(daysValue)}" placeholder="Дней" />
          <span class="rule-date-suffix">дней назад</span>
        </div>
        <button type="button" class="icon-btn rule-remove" title="Удалить"><i class="fas fa-times"></i></button>
      </div>
    `;
  }

  function bindRuleRowEvents() {
    if (!elFilterRulesContainer) return;

    // Инициализация custom selects
    initCustomSelects(elFilterRulesContainer);

    // Переключение типа ввода в зависимости от поля
    elFilterRulesContainer.querySelectorAll('.rule-field').forEach(wrap => {
      wrap.addEventListener('cs-change', handleFieldChange);
    });

    // Удаление правила
    elFilterRulesContainer.querySelectorAll('.rule-remove').forEach(btn => {
      btn.onclick = () => {
        btn.closest('.filter-rule-row')?.remove();
      };
    });
  }

  function handleFieldChange(e) {
    const row = e.target.closest('.filter-rule-row');
    if (!row) return;
    const fieldValue = e.detail?.value || e.target.dataset?.value;
    const isDate = ['last_order_date', 'created_at', 'registration_date'].includes(fieldValue);
    const valueInput = row.querySelector('.rule-value');
    const dateInput = row.querySelector('.rule-date-input');
    if (valueInput) valueInput.classList.toggle('hidden', isDate);
    if (dateInput) dateInput.classList.toggle('hidden', !isDate);
  }

  function collectFilterFormData() {
    const titleInput = $('#fe_title');
    const logicWrap = $('#fe_logic');
    const isActiveInput = $('#fe_is_active');

    const title = titleInput?.value?.trim();
    if (!title) {
      titleInput?.focus();
      return null;
    }

    const rules = [];
    if (elFilterRulesContainer) {
      elFilterRulesContainer.querySelectorAll('.filter-rule-row').forEach((row) => {
        // Получаем значения из custom select компонентов
        const fieldWrap = row.querySelector('.rule-field');
        const operatorWrap = row.querySelector('.rule-operator');
        const field = fieldWrap?.dataset?.value;
        const operator = operatorWrap?.dataset?.value;
        let value = row.querySelector('.rule-value')?.value?.trim();
        
        // Преобразуем относительные даты
        const valueDays = row.querySelector('.rule-value-days')?.value;
        if (valueDays) {
          value = '-' + valueDays + 'd';
        }

        if (field && operator && value !== '') {
          rules.push({ field, operator, value: isNaN(value) ? value : Number(value) });
        }
      });
    }

    return {
      title,
      conditions: {
        logic: logicWrap?.dataset?.value || 'AND',
        rules,
      },
      is_active: isActiveInput?.checked !== false,
    };
  }

  async function saveFilter() {
    const data = collectFilterFormData();
    if (!data) return;

    const isNew = state.editingFilterId === 'new';
    const oldTabKey = buildTabKey('category', state.editingFilterId);

    try {
      let savedId;
      if (isNew) {
        const res = await apiJson('/api/admin/clients/filters', {
          method: 'POST',
          body: data,
        });
        savedId = res.data?.id;
      } else {
        await apiJson('/api/admin/clients/filters/' + state.editingFilterId, {
          method: 'PUT',
          body: data,
        });
        savedId = state.editingFilterId;
      }
      
      await loadCustomFilters();
      renderFilterCategoriesList();
      
      // Обновляем или закрываем таб
      if (isNew && savedId) {
        // Закрываем таб "new" и открываем таб с сохранённым фильтром
        await closeTab(oldTabKey);
        const savedFilter = state.customFilters.find(f => f.id === savedId);
        if (savedFilter) {
          openFilterEditor(savedFilter);
        }
      } else {
        // Обновляем название таба
        const tab = tabsState.tabs.find(t => t.key === oldTabKey);
        if (tab) {
          tab.title = data.title;
          renderTabs();
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteFilter() {
    if (state.editingFilterId === 'new' || !state.editingFilterId) return;

    const filter = state.customFilters.find(f => f.id === state.editingFilterId);
    if (!confirm('Удалить категорию "' + (filter?.title || '') + '"?')) return;

    const tabKey = buildTabKey('category', state.editingFilterId);

    try {
      await apiJson('/api/admin/clients/filters/' + state.editingFilterId, { method: 'DELETE' });
      
      if (state.activeCustomFilterId === state.editingFilterId) {
        state.activeFilter = 'all';
        state.activeCustomFilterId = null;
      }
      
      // Закрываем таб удалённой категории
      await closeTab(tabKey);
      
      await loadCustomFilters();
      renderFilterCategoriesList();
    } catch (e) {
      console.error(e);
    }
  }

  // -----------------------------
  // Accordion
  // -----------------------------
  function initClientsAccordion() {
    const container = $("#clientsAccordion");
    if (!container) return;

    container.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-acc-trigger]");
      if (!trigger || !container.contains(trigger)) return;

      const item = trigger.closest(".acc-item");
      const panel = item && item.querySelector("[data-acc-panel]");
      if (!panel) return;

      const isOpen = trigger.classList.contains("is-open");
      trigger.classList.toggle("is-open", !isOpen);
      panel.classList.toggle("is-open", !isOpen);
      panel.style.maxHeight = !isOpen ? panel.scrollHeight + "px" : "0px";
    });
  }

  // -----------------------------
  // Render: clients list
  // -----------------------------
  function buildClientRow(c) {
    const row = document.createElement("div");
    row.className = "order-row js-client";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("data-client-id", String(c.id));
    if (state.activeClientId && Number(state.activeClientId) === Number(c.id)) {
      row.classList.add("is-active");
    }
    row.style.gridTemplateColumns = '64px minmax(200px, 1fr) 80px';
    row.innerHTML = `
      <div class="order-main">
        <div class="order-num">${escapeHtml(c.id)}</div>
        <div class="order-time">${escapeHtml(c.is_active ? "Активен" : "Неактивен")}</div>
      </div>
      <div class="order-mid">
        <div class="order-line"><strong>${escapeHtml(c.name || "—")}</strong></div>
        <div class="order-line muted"><i class="fas fa-phone"></i> <span class="client-phone" style="white-space:nowrap;display:inline-block;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escapeHtml(formatPhoneDigitsToRU(c.phone))}</span></div>
      </div>
      <div class="order-actions">
        <div class="pill pill-strong" style="padding:6px 10px;font-size:13px;height:32px;min-width:40px;max-width:80px;box-sizing:border-box;overflow:hidden;text-align:center;">${escapeHtml(Number(c.total_orders || 0))}</div>
      </div>
    `;
    row.addEventListener("click", () => selectClient(c.id));
    return row;
  }

  function renderClients() {
    if (!elList) return;
    elList.innerHTML = "";
    const list = state.clients || [];
    if (!list.length) {
      if (elEmpty) elEmpty.classList.remove("hidden");
      return;
    }
    if (elEmpty) elEmpty.classList.add("hidden");

    list.forEach((c) => {
      elList.appendChild(buildClientRow(c));
    });
  }

  function appendClients(items) {
    if (!elList || !Array.isArray(items) || !items.length) return;
    if (elEmpty) elEmpty.classList.add("hidden");
    items.forEach((c) => {
      elList.appendChild(buildClientRow(c));
    });
  }

  // -----------------------------
  // Client info (profile header)
  // -----------------------------
  function setClient(client) {
    state.activeClient = client;

    if (!client) {
      if (infoName) infoName.textContent = "—";
      if (infoPhone) infoPhone.textContent = "—";
      if (infoBirthday) infoBirthday.textContent = "—";
      if (clientPhoto) clientPhoto.classList.add("hidden");
      if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.remove("hidden");
      // sheet
      setTextAll([sheetInfo.title], "Клиент не выбран");
      setTextAll([sheetInfo.meta], "—");
      setTextAll([sheetInfo.name], "—");
      setTextAll([sheetInfo.phone], "—");
      setTextAll([sheetInfo.birthday], "—");
      setTextAll([sheetInfo.orders], "—");
      setTextAll([sheetInfo.spent], "—");
      setTextAll([sheetInfo.last], "—");
      if (sheetInfo.addrs) sheetInfo.addrs.innerHTML = "";
      return;
    }

    // Desktop profile header
    if (infoName) infoName.textContent = client.name || "—";
    if (infoPhone) infoPhone.textContent = formatPhoneDigitsToRU(client.phone) || "—";
    if (infoBirthday) infoBirthday.textContent = client.birthday ? fmtDate(client.birthday) : "—";

    // Photo
    if (client.photo) {
      if (clientPhoto) {
        clientPhoto.src = client.photo;
        clientPhoto.classList.remove("hidden");
      }
      if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.add("hidden");
    } else {
      if (clientPhoto) clientPhoto.classList.add("hidden");
      if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.remove("hidden");
    }

    // Sheet (mobile)
    setTextAll([sheetInfo.title], `Клиент #${client.id}`);
    setTextAll([sheetInfo.meta], `Создан: ${fmtDateTime(client.created_at)}`);
    setTextAll([sheetInfo.name], client.name || "—");
    setTextAll([sheetInfo.phone], formatPhoneDigitsToRU(client.phone) || "—");
    setTextAll([sheetInfo.birthday], client.birthday ? fmtDate(client.birthday) : "—");
    setTextAll([sheetInfo.orders], String(Number(client.total_orders || 0)));
    setTextAll([sheetInfo.spent], money(client.total_spent || 0));
    setTextAll([sheetInfo.last], client.last_order_date ? fmtDateTime(client.last_order_date) : "—");
  }

  // -----------------------------
  // Addresses (shop-style cards)
  // -----------------------------
  function renderAddresses() {
    const targets = [clientAddressesList, sheetInfo.addrs].filter(Boolean);
    targets.forEach((t) => (t.innerHTML = ""));

    const list = state.addresses || [];
    if (!list.length) {
      targets.forEach((t) => {
        t.innerHTML = `<div class="muted" style="padding:4px 0;">Адресов пока нет.</div>`;
      });
      return;
    }

    list.forEach((a) => {
      const txt = [
        a.street ? escapeHtml(a.street) : "",
        a.house ? escapeHtml(a.house) : "",
      ].filter(Boolean).join(" ");

      const details = [
        a.entrance ? `подъезд ${escapeHtml(a.entrance)}` : "",
        a.floor ? `этаж ${escapeHtml(a.floor)}` : "",
        a.apartment ? `кв ${escapeHtml(a.apartment)}` : "",
      ].filter(Boolean).join(", ");

      const fullAddr = [txt, details].filter(Boolean).join(", ");

      const cardHtml = `
        <div class="shop-profile-card shop-profile-card--compact">
          <div class="shop-address-card">
            <div class="shop-address-card-main">
              <div class="shop-address-card-title">
                ${fullAddr}
                ${Number(a.is_default) === 1 ? `<span class="muted"> • основной</span>` : ""}
              </div>
              ${a.comment ? `<div class="shop-address-card-sub">${escapeHtml(a.comment)}</div>` : ""}
            </div>
            <div class="shop-address-actions shop-address-actions--compact">
              <button class="shop-address-action-icon is-default ${Number(a.is_default) === 1 ? "is-active" : ""}" type="button"
                title="${Number(a.is_default) === 1 ? "Основной адрес" : "Сделать основным"}"
                ${Number(a.is_default) === 1 ? "" : `data-addr-default="${a.id}"`}>
                <i class="fas fa-star"></i>
              </button>
              <button class="shop-address-action-icon is-danger" type="button" title="Удалить" data-addr-del="${a.id}">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      `;

      targets.forEach((t) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = cardHtml;
        t.appendChild(wrap.firstElementChild);
      });
    });
  }

  async function loadAddresses(options = {}) {
    if (!state.activeClientId) return;
    const clientId = Number(state.activeClientId || 0);
    const preferCache = options?.preferCache !== false;
    const refresh = options?.refresh !== false;

    if (preferCache) {
      const cached = getCachedClientDetails(clientId);
      if (cached && Array.isArray(cached.addresses)) {
        state.addresses = cached.addresses.slice();
        renderAddresses();
      }
    }

    if (!refresh) return;
    const json = await apiJson(`/api/admin/clients/${clientId}/addresses`);
    const rows = Array.isArray(json.data) ? json.data : [];
    state.addresses = rows;
    setCachedClientDetails(clientId, { addresses: rows });
    renderAddresses();
  }

  // Address action events (delegated)
  document.addEventListener("click", async (e) => {
    const btnDefault = e.target.closest("[data-addr-default]");
    if (btnDefault) {
      if (!state.activeClientId) return;
      const addressId = Number(btnDefault.getAttribute("data-addr-default"));
      if (!Number.isFinite(addressId)) return;
      try {
        await apiJson(`/api/admin/clients/${state.activeClientId}/addresses/${addressId}/default`, {
          method: "PUT",
          body: {},
        });
        await loadAddresses();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const btnDel = e.target.closest("[data-addr-del]");
    if (btnDel) {
      if (!state.activeClientId) return;
      const addressId = Number(btnDel.getAttribute("data-addr-del"));
      if (!Number.isFinite(addressId)) return;
      try {
        await apiJson(`/api/admin/clients/${state.activeClientId}/addresses/${addressId}`, {
          method: "DELETE",
        });
        await loadAddresses();
      } catch (err) {
        console.error(err);
      }
    }
  });

  // Toggle address form
  if (addrToggleBtn && addrFormCard) {
    addrToggleBtn.addEventListener("click", () => {
      addrFormCard.classList.toggle("hidden");
      addrToggleBtn.textContent = addrFormCard.classList.contains("hidden") ? "+ Новый адрес" : "Скрыть форму";
    });
  }

  async function addAddress() {
    if (!state.activeClientId) return;
    const body = {
      street: addrStreet ? addrStreet.value.trim() : "",
      house: addrHouse ? addrHouse.value.trim() : "",
      entrance: addrEntrance ? addrEntrance.value.trim() : "",
      floor: addrFloor ? addrFloor.value.trim() : "",
      apartment: addrApartment ? addrApartment.value.trim() : "",
      comment: addrComment ? addrComment.value.trim() : "",
      is_default: false,
    };
    if (!body.street || !body.house) return;

    await apiJson(`/api/admin/clients/${state.activeClientId}/addresses`, {
      method: "POST",
      body,
    });

    // clear form
    [addrStreet, addrHouse, addrEntrance, addrFloor, addrApartment, addrComment].forEach((el) => {
      if (el) el.value = "";
    });
    if (addrFormCard) addrFormCard.classList.add("hidden");
    if (addrToggleBtn) addrToggleBtn.textContent = "+ Новый адрес";

    await loadAddresses();
  }

  if (addrAddBtn) addrAddBtn.addEventListener("click", () => addAddress().catch(console.error));

  // -----------------------------
  // Orders history
  // -----------------------------
  function showOrdersList() {
    if (clientOrdersListView) clientOrdersListView.classList.remove("hidden");
    if (clientOrderDetailView) clientOrderDetailView.classList.add("hidden");
  }

  function showOrderDetail() {
    if (clientOrdersListView) clientOrdersListView.classList.add("hidden");
    if (clientOrderDetailView) clientOrderDetailView.classList.remove("hidden");
  }

  if (clientOrderBackBtn) {
    clientOrderBackBtn.addEventListener("click", showOrdersList);
  }

  async function loadClientOrders(options = {}) {
    if (!state.activeClientId) return;
    const clientId = Number(state.activeClientId || 0);
    const preferCache = options?.preferCache !== false;
    const refresh = options?.refresh !== false;
    showOrdersList();

    let usedCached = false;
    if (preferCache) {
      const cached = getCachedClientDetails(clientId);
      if (cached && Array.isArray(cached.orders)) {
        state.clientOrders = cached.orders.slice();
        renderClientOrders();
        usedCached = true;
      }
    }
    if (!usedCached && clientOrdersList) {
      clientOrdersList.innerHTML = `<div class="muted">Загрузка…</div>`;
    }
    if (!refresh) return;

    try {
      const json = await fetchClientOrdersShared(clientId);
      const rows = Array.isArray(json.data) ? json.data : [];
      state.clientOrders = rows;
      setCachedClientDetails(clientId, { orders: rows });
      renderClientOrders();
    } catch (err) {
      console.error(err);
      if (!usedCached && clientOrdersList) {
        clientOrdersList.innerHTML = `<div class="muted">Ошибка загрузки заказов</div>`;
      }
    }
  }

  function renderClientOrders() {
    if (!clientOrdersList) return;
    clientOrdersList.innerHTML = "";

    const list = state.clientOrders || [];
    if (!list.length) {
      clientOrdersList.innerHTML = `<div class="muted" style="padding:4px 0;">Заказов пока нет.</div>`;
      return;
    }

    list.forEach((o) => {
      let itemsCount = 0;
      let items;
      try {
        items = typeof o.items === "string" ? JSON.parse(o.items) : o.items;
      } catch {
        items = [];
      }
      if (Array.isArray(items)) {
        items.forEach((it) => {
          itemsCount += Number(it.qty || it.quantity || 0) || 0;
        });
      }

      const card = document.createElement("div");
      card.className = "shop-profile-card order-client-history-card";
      card.style.cursor = "pointer";
      card.innerHTML = `
        <div><strong>Заказ #${escapeHtml(o.id)}</strong> <span class="muted">• ${escapeHtml(o.status_title || "—")}</span></div>
        <div class="muted">${escapeHtml(fmtDateTime(o.created_at))}</div>
        <div><strong>${money(o.total_price || 0)}</strong> <span class="muted">• позиций: ${itemsCount}</span></div>
      `;
      card.addEventListener("click", () => openOrderTab(o.id));
      clientOrdersList.appendChild(card);
    });
  }

  // -----------------------------
  // Client discounts
  // -----------------------------
  async function loadClientDiscounts(options = {}) {
    if (!state.activeClientId) return;
    const clientId = Number(state.activeClientId || 0);
    const preferCache = options?.preferCache !== false;
    const refresh = options?.refresh !== false;

    let usedCached = false;
    if (preferCache) {
      const cached = getCachedClientDetails(clientId);
      if (cached && Array.isArray(cached.discounts)) {
        state.clientDiscounts = cached.discounts.slice();
        renderClientDiscounts();
        usedCached = true;
      }
    }
    if (!usedCached && clientDiscountsList) {
      clientDiscountsList.innerHTML = `<div class="muted">Загрузка…</div>`;
    }
    if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add('hidden');
    if (!refresh) return;

    try {
      const json = await apiJson(`/api/admin/clients/${clientId}/discounts`);
      const rows = Array.isArray(json.data) ? json.data : [];
      state.clientDiscounts = rows;
      setCachedClientDetails(clientId, { discounts: rows });
      renderClientDiscounts();
    } catch (err) {
      console.error(err);
      if (!usedCached && clientDiscountsList) {
        clientDiscountsList.innerHTML = `<div class="muted">Ошибка загрузки скидок</div>`;
      }
    }
  }

  function renderClientDiscounts() {
    if (!clientDiscountsList) return;
    clientDiscountsList.innerHTML = "";

    const list = state.clientDiscounts || [];
    if (!list.length) {
      if (clientDiscountsEmpty) clientDiscountsEmpty.classList.remove('hidden');
      return;
    }
    if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add('hidden');

    list.forEach((d) => {
      const valueText = d.discount_type === 'percent' 
        ? `${d.discount_value}%`
        : d.discount_type === 'fixed'
          ? `-${d.discount_value}₽`
          : `${d.discount_value}₽`;

      const linkTypeText = d.link_type === 'direct' ? 'Напрямую' : `Категория: ${d.category_title || '—'}`;
      const statusClass = d.is_active ? '' : 'inactive';

      const card = document.createElement("div");
      card.className = "discount-row";
      card.innerHTML = `
        <div class="discount-row-icon"><i class="fas fa-percentage"></i></div>
        <div class="discount-row-info">
          <div class="discount-row-title">${escapeHtml(d.title)}</div>
          <div class="discount-row-meta">${escapeHtml(linkTypeText)}</div>
        </div>
        <div class="discount-row-value">${valueText}</div>
        <div class="discount-row-status ${statusClass}"></div>
      `;
      clientDiscountsList.appendChild(card);
    });
  }

  // -----------------------------
  // Order detail (shared info_content.ejs)
  // -----------------------------
  function paymentIconClass(code) {
    const raw = String(code || "").toLowerCase();
    if (raw.includes("cash")) return "fa-money-bill-wave";
    if (raw.includes("card")) return "fa-credit-card";
    if (raw.includes("online")) return "fa-globe";
    return "fa-credit-card";
  }

  function formatDateTimeNumeric(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy}, ${hh}:${mi}`;
  }

  function formatTimeValue(value) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  }

  function formatScheduleText(order) {
    if (!order) return "";
    const scheduledAt = order.scheduled_at;
    const title = String(order.time_option_title || "").trim();
    if (!scheduledAt) return title;

    const code = String(order.time_option_code || "").trim().toLowerCase();
    if (code === "at_time") {
      return formatTimeValue(scheduledAt) || title;
    }
    return formatDateTimeNumeric(scheduledAt) || title;
  }

  function parseOrderItems(order) {
    if (!order) return [];
    try {
      const raw = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function pickBestOrderItemPhoto(item) {
    const source = item && typeof item === "object" ? item : {};
    const candidates = [];
    const push = (value) => {
      const url = String(value || "").trim();
      if (!url) return;
      candidates.push(url);
    };

    // explicit single-photo fields that may already point to optimized assets
    push(source.photo_webp);
    push(source.product_photo_webp);
    push(source.photo);
    push(source.product_photo);

    // list fields
    (Array.isArray(source.photos) ? source.photos : []).forEach(push);
    (Array.isArray(source.images) ? source.images : []).forEach(push);
    (Array.isArray(source.product_photos) ? source.product_photos : []).forEach(push);

    if (!candidates.length) return "";
    const webp = candidates.find((url) => /\.webp(?:\?|$)/i.test(String(url || "")));
    return String(webp || candidates[0] || "").trim();
  }

  function roundMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function getOrderItemLineTotal(item) {
    const explicit = Number(item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(explicit)) return roundMoney(explicit);
    const unit = Number(item?.price || 0);
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    return roundMoney(unit * qty);
  }

  function isAutoAddOrderItem(item) {
    if (Number(item?.auto_add || 0) === 1) return true;
    const name = String(item?.product_name || item?.name || "").trim().toLowerCase();
    return name === "приборы";
  }

  function renderOrderItemComposition(item) {
    const lines = [];

    if (String(item?.type || "").toLowerCase() === "combo") {
      const selections = Array.isArray(item?.selections) ? item.selections : [];
      selections.forEach((sel) => {
        const productName = String(sel?.product_name || "").trim();
        if (productName) lines.push(`1 × ${productName}`);

        const variantParts = [
          sel?.variant_label,
          sel?.variant_unit,
          sel?.variant_group_title,
        ].filter(Boolean);
        if (variantParts.length) lines.push(variantParts.join(" "));

        const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
        ingredientsDisplay.forEach((ing) => {
          const qty = ing?.qty ?? ing?.quantity;
          const numQty = Number(qty);
          if (Number.isFinite(numQty) && numQty <= 0) return;
          const unit = String(ing?.unit || "").trim();
          const name = String(ing?.name || "").trim();
          const parts = [];
          if (qty !== null && qty !== undefined && String(qty).trim() !== "") parts.push(String(qty).trim());
          if (unit) parts.push(unit);
          if (name) parts.push(name);
          if (parts.length) lines.push(parts.join(" "));
        });
      });
    }

    const variants = Array.isArray(item?.variants) ? item.variants : [];
    variants.forEach((variant) => {
      const parts = [variant?.label || variant?.value || "", variant?.unit_label || "", variant?.group_title || ""]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (parts.length) lines.push(parts.join(" "));
    });

    const options = Array.isArray(item?.options) ? item.options : [];
    options.forEach((opt) => {
      const qty = Number(opt?.qty || opt?.quantity || 0);
      if (qty <= 0) return;
      const variantLabel = String(opt?.variant_label || "").trim();
      const name = String(opt?.title || opt?.name || "").trim();
      if (variantLabel && name) {
        lines.push(`${variantLabel} ${name}`.trim());
        return;
      }
      if (variantLabel) {
        lines.push(variantLabel);
        return;
      }
      if (name) {
        lines.push(`${qty} шт ${name}`.trim());
      }
    });

    const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
    ingredients.forEach((ing) => {
      const qty = ing?.quantity ?? ing?.qty;
      const numQty = Number(qty);
      if (Number.isFinite(numQty) && numQty <= 0) return;
      const unit = String(ing?.unit_label || ing?.unit || "").trim();
      const name = String(ing?.ingredient_name || ing?.name || "").trim();
      const parts = [];
      if (qty !== null && qty !== undefined && String(qty).trim() !== "") parts.push(String(qty).trim());
      if (unit) parts.push(unit);
      if (name) parts.push(name);
      if (parts.length) lines.push(parts.join(" "));
    });

    if (!lines.length) return "";
    return `
      <div class="order-item-composition">
        ${lines.map((line) => `<div class="order-item-composition-item">• ${escapeHtml(line)}</div>`).join("")}
      </div>
    `;
  }

  function renderOrderItemsHtml(items) {
    if (!Array.isArray(items) || !items.length) return `<div class="muted">Нет позиций в заказе</div>`;

    const sorted = items.slice().sort((a, b) => {
      const aAuto = isAutoAddOrderItem(a);
      const bAuto = isAutoAddOrderItem(b);
      if (aAuto && !bAuto) return 1;
      if (!aAuto && bAuto) return -1;
      return 0;
    });

    return sorted.map((item) => {
      const name = String(item?.product_name || item?.name || "Товар");
      const qty = Math.max(1, Number(item?.qty || item?.quantity || 0) || 1);
      const lineTotal = getOrderItemLineTotal(item);
      let oldLineTotal = Number(item?.discount?.original_line_total || item?.old_line_total || 0);
      const oldPrice = Number(item?.old_price || 0);
      if (!(oldLineTotal > lineTotal) && oldPrice > 0) oldLineTotal = roundMoney(oldPrice * qty);
      const showOldPrice = oldLineTotal > lineTotal;

      const photoSrc = pickBestOrderItemPhoto(item);
      const photoHtml = photoSrc
        ? `<div class="order-item-photo-small"><img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(name)}"></div>`
        : "";

      const compositionHtml = renderOrderItemComposition(item);
      const priceHtml = showOldPrice
        ? `<span class="order-item-old-price">${money(oldLineTotal)}</span><span class="order-item-price-current">${money(lineTotal)}</span>`
        : `<span class="order-item-price-current">${money(lineTotal)}</span>`;

      return `
        <div class="order-item${String(item?.type || "").toLowerCase() === "combo" ? " order-item--combo" : ""}">
          <div class="order-item-line">
            ${photoHtml}
            <div class="order-item-content">
              <div class="order-item-title">${escapeHtml(name)} × ${qty}</div>
              ${compositionHtml}
              <div class="order-item-footer">
                <div class="order-item-price">${priceHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function parseOrderDiscounts(order) {
    const raw = order?.discounts_json;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function computeOrderSummary(order, items) {
    const total = roundMoney(Number(order?.total_price || 0));
    const deliveryCost = roundMoney(Number(order?.delivery_cost || 0));
    const discountAmount = roundMoney(Math.max(0, Number(order?.discount_amount || 0)));
    const changeFrom = roundMoney(Number(order?.change_from || 0));
    const changeAmount = changeFrom > total ? roundMoney(changeFrom - total) : 0;

    let subtotal = roundMoney(Number(order?.subtotal || order?.items_total || order?.items_price || 0));
    if (!(subtotal > 0)) {
      const itemsTotal = roundMoney((items || []).reduce((sum, item) => sum + getOrderItemLineTotal(item), 0));
      subtotal = itemsTotal > 0 ? roundMoney(itemsTotal + discountAmount) : roundMoney(total - deliveryCost + discountAmount);
    }
    if (subtotal < 0) subtotal = 0;

    const breakdown = [];
    parseOrderDiscounts(order).forEach((entry) => {
      const amountRaw = Number(entry?.amount ?? entry?.discount_amount ?? entry?.value ?? 0);
      const amount = roundMoney(Math.abs(amountRaw));
      if (!(amount > 0)) return;
      const title = String(entry?.title || "").trim() || "Скидка";
      breakdown.push({ title, amount });
    });

    return {
      total,
      deliveryCost,
      discountAmount,
      subtotal,
      changeFrom,
      changeAmount,
      breakdown,
    };
  }

  function renderDiscountBreakdownHtml(summary) {
    const rows = Array.isArray(summary?.breakdown) ? summary.breakdown : [];
    if (!rows.length) return "";
    return rows.map((entry) => `
      <div class="order-summary-discount-breakdown-row">
        <span class="order-summary-discount-breakdown-label">${escapeHtml(entry.title || "Скидка")}</span>
        <span class="order-summary-discount-breakdown-value">-${money(entry.amount || 0)}</span>
      </div>
    `).join("");
  }

  function closeClientOrderStatusMenus() {
    if (!Array.isArray(orderInfoEls?.statusMenu) || !Array.isArray(orderInfoEls?.statusToggle)) return;
    orderInfoEls.statusMenu.forEach((menu) => {
      if (!menu) return;
      menu.classList.add("hidden");
      const wrap = menu.closest('[data-role="order-inline-status"]');
      if (wrap) wrap.classList.remove("is-open");
    });
    orderInfoEls.statusToggle.forEach((btn) => {
      if (!btn) return;
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function getSortedOrderStatuses() {
    const list = Array.isArray(state.orderStatuses) ? state.orderStatuses : [];
    return list
      .filter((status) => Number.isFinite(Number(status?.id)) && Number(status.id) > 0)
      .sort((a, b) => (Number(a?.sort || 0) - Number(b?.sort || 0)) || (Number(a.id) - Number(b.id)));
  }

  async function ensureOrderStatusesLoaded(force = false) {
    if (state.orderStatusesLoading) return;
    if (!force && state.orderStatusesLoaded) return;

    state.orderStatusesLoading = true;
    try {
      const json = await apiJson('/api/admin/orders/statuses');
      state.orderStatuses = Array.isArray(json.data) ? json.data : [];
      state.orderStatusesLoaded = true;
    } catch (err) {
      console.error(err);
      state.orderStatuses = [];
      state.orderStatusesLoaded = true;
    } finally {
      state.orderStatusesLoading = false;
    }
  }

  function renderClientOrderStatusMenu(order) {
    if (!orderInfoEls) return;
    const statuses = getSortedOrderStatuses();
    if (!statuses.length) {
      setNodesHtml(orderInfoEls.statusMenu, "");
      closeClientOrderStatusMenus();
      return;
    }
    const currentStatusId = Number(order?.status_id || 0);
    const optionsHtml = statuses.map((status) => {
      const statusId = Number(status.id || 0);
      const isSelected = statusId === currentStatusId;
      return `
        <button
          class="order-status-inline-option${isSelected ? " is-selected" : ""}"
          type="button"
          data-action="order-status-menu-select"
          data-status-id="${statusId}"
          role="option"
          aria-selected="${isSelected ? "true" : "false"}"
        >
          ${escapeHtml(status.title || "—")}
        </button>
      `;
    }).join("");
    setNodesHtml(orderInfoEls.statusMenu, optionsHtml);
    closeClientOrderStatusMenus();
  }

  function showClientOrderInfoEmpty(
    title = "Выберите заказ слева",
    text = "Нажмите на заказ в истории клиента, чтобы открыть детали."
  ) {
    if (!orderInfoEls) return;
    setNodesHidden(orderInfoEls.empty, false);
    setNodesHidden(orderInfoEls.content, true);
    setNodesText(orderInfoEls.emptyTitle, title);
    setNodesText(orderInfoEls.emptyText, text);
    closeClientOrderStatusMenus();
  }

  function renderClientOrderInfo(order) {
    if (!orderInfoEls || !order) {
      showClientOrderInfoEmpty();
      return;
    }

    const orderId = Number(order.id || 0);
    setNodesHidden(orderInfoEls.empty, true);
    setNodesHidden(orderInfoEls.content, false);
    setNodesText(orderInfoEls.title, `ЗАКАЗ #${orderId > 0 ? orderId : "—"}`);
    setNodesText(orderInfoEls.meta, formatDateTimeNumeric(order.created_at));
    setNodesText(orderInfoEls.status, String(order.status_title || "—"));
    renderClientOrderStatusMenu(order);

    const clientName = String(order.customer_name || "—").trim() || "—";
    const clientPhoneRaw = String(order.customer_phone || "").trim();
    const clientDigits = normalizePhoneDigits(clientPhoneRaw);
    const clientPhoneView = clientDigits.length === 11 ? formatPhoneDigitsToRU(clientDigits) : (clientPhoneRaw || "—");
    const clientId = Number(order.customer_id || 0);
    setNodesText(orderInfoEls.clientName, clientName);
    setNodesText(orderInfoEls.clientPhone, clientPhoneView);
    orderInfoEls.clientPhone.forEach((node) => {
      if (!node) return;
      const canOpenClient = (Number.isFinite(clientId) && clientId > 0) || !!clientPhoneRaw;
      if (canOpenClient) {
        node.setAttribute("href", "#");
        node.setAttribute("data-action", "open-client");
        if (clientId > 0) node.setAttribute("data-client-id", String(clientId));
        else node.removeAttribute("data-client-id");
        node.setAttribute("data-client-phone", clientPhoneRaw);
        node.setAttribute("data-client-name", clientName);
      } else {
        node.removeAttribute("href");
        node.removeAttribute("data-action");
        node.removeAttribute("data-client-id");
        node.removeAttribute("data-client-phone");
        node.removeAttribute("data-client-name");
      }
    });

    const methodCode = String(order.method_code || "").toLowerCase();
    const isPickup = methodCode === "pickup";
    const deliveryTitle = isPickup ? "Адрес самовывоза" : "Адрес доставки";
    const deliveryAddress = isPickup
      ? (order.pickup_store_address
        ? (order.pickup_store_name ? `${order.pickup_store_name}, ${order.pickup_store_address}` : String(order.pickup_store_address))
        : (order.address || "—"))
      : (order.address || "—");
    const deliveryInterval = formatScheduleText(order);
    const isUrgent = Boolean(order.is_urgent || order.urgent || String(order.time_option_code || "").toLowerCase() === "urgent");
    const addressComment = isPickup ? "" : String(order.address_comment || "").trim();
    const orderComment = String(order.comment || "").trim();

    setNodesText(orderInfoEls.deliveryAddressTitle, deliveryTitle);
    setNodesText(orderInfoEls.deliveryAddress, deliveryAddress || "—");
    setNodesText(orderInfoEls.deliveryInterval, deliveryInterval || "—");
    setNodesHidden(orderInfoEls.deliveryIntervalRow, !deliveryInterval);
    setNodesHidden(orderInfoEls.urgent, !isUrgent);
    setNodesText(orderInfoEls.deliveryAddressCommentText, addressComment);
    setNodesHidden(orderInfoEls.deliveryAddressComment, !addressComment);
    setNodesText(orderInfoEls.orderCommentText, orderComment);
    setNodesHidden(orderInfoEls.orderCommentBlock, !orderComment);

    const items = parseOrderItems(order);
    setNodesHtml(orderInfoEls.itemsList, renderOrderItemsHtml(items));

    const summary = computeOrderSummary(order, items);
    setNodesText(orderInfoEls.payMethod, String(order.payment_title || "—"));
    setNodesHtml(orderInfoEls.payIcon, `<i class="fas ${paymentIconClass(order.payment_code)}"></i>`);
    setNodesText(orderInfoEls.changeFrom, money(summary.changeFrom));
    setNodesText(orderInfoEls.changeAmount, money(summary.changeAmount));
    setNodesHidden(orderInfoEls.changeFromRow, !(summary.changeFrom > 0));
    setNodesHidden(orderInfoEls.changeAmountRow, !(summary.changeFrom > 0));
    setNodesText(orderInfoEls.subtotal, money(summary.subtotal));
    setNodesText(orderInfoEls.discountAmount, `-${money(summary.discountAmount)}`);
    setNodesHidden(orderInfoEls.subtotalRow, !(summary.discountAmount > 0));
    setNodesHidden(orderInfoEls.discountRow, !(summary.discountAmount > 0));
    setNodesText(orderInfoEls.deliveryCost, money(summary.deliveryCost));
    setNodesHidden(orderInfoEls.deliveryRow, isPickup);
    setNodesText(orderInfoEls.total, money(summary.total));

    const breakdownHtml = renderDiscountBreakdownHtml(summary);
    const hasBreakdown = Boolean(breakdownHtml);
    setNodesHtml(orderInfoEls.discountBreakdown, breakdownHtml);
    setNodesHidden(orderInfoEls.discountInfoBtn, !hasBreakdown);
    orderInfoEls.discountInfoBtn.forEach((btn) => {
      if (!btn) return;
      btn.setAttribute("aria-expanded", "false");
    });
    orderInfoEls.discountBreakdown.forEach((node) => {
      if (!node) return;
      node.classList.add("hidden");
      node.classList.remove("is-open");
      node.setAttribute("aria-hidden", "true");
    });
  }

  function emitOrderUpdated(order) {
    if (!order || typeof order !== "object") return;
    try {
      document.dispatchEvent(new CustomEvent("dashboard:order-updated", {
        detail: { order: { ...order } },
      }));
    } catch {}
  }

  function updateClientOrderInState(order) {
    const id = Number(order?.id || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    state.clientOrders = (state.clientOrders || []).map((item) => {
      if (Number(item?.id || 0) !== id) return item;
      return { ...item, ...order };
    });
    emitOrderUpdated(order);
  }

  async function selectActiveClientOrderStatus(statusId) {
    const orderId = Number(state.activeOrderId || state.activeOrder?.id || 0);
    const nextStatusId = Number(statusId || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;
    if (Number(state.activeOrder?.status_id || 0) === nextStatusId) {
      closeClientOrderStatusMenus();
      return;
    }

    try {
      await apiJson(`/api/admin/orders/${orderId}/status`, {
        method: "PUT",
        body: { status_id: nextStatusId },
      });
      const json = await apiJson(`/api/admin/orders/${orderId}`);
      const order = json?.data || null;
      if (!order) return;
      state.activeOrder = order;
      state.orderCache.set(orderId, order);
      setSharedOrderDetails(order);
      updateClientOrderInState(order);
      renderClientOrderInfo(order);
      if (state.activeContentTab === "orders" && state.activeClientId) {
        renderClientOrders();
      }
    } catch (err) {
      console.error(err);
    } finally {
      closeClientOrderStatusMenus();
    }
  }

  async function activateOrderById(orderId) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return;

    state.activeOrderId = id;
    state.activeOrder = null;

    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey);
    if (!activeTab || activeTab.type !== "order" || Number(activeTab.id) !== id) return;

    await ensureOrderStatusesLoaded();

    const cached = state.orderCache.get(id);
    const sharedCached = getSharedOrderDetails(id);
    const warmOrder = cached || sharedCached;
    if (warmOrder) {
      state.activeOrder = warmOrder;
      state.orderCache.set(id, warmOrder);
      renderClientOrderInfo(warmOrder);
    } else {
      showClientOrderInfoEmpty("Загрузка заказа...", "Подождите, загружаем детали заказа.");
    }

    const requestId = ++orderRequestToken;
    try {
      const json = await apiJson(`/api/admin/orders/${id}`);
      if (requestId !== orderRequestToken) return;
      const order = json?.data || null;
      if (!order) {
        showClientOrderInfoEmpty("Заказ не найден", "Не удалось получить детали выбранного заказа.");
        return;
      }
      state.activeOrder = order;
      state.orderCache.set(id, order);
      setSharedOrderDetails(order);
      updateClientOrderInState(order);

      const stillActive = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey);
      if (!stillActive || stillActive.type !== "order" || Number(stillActive.id) !== id) return;
      renderClientOrderInfo(order);
    } catch (err) {
      if (requestId !== orderRequestToken) return;
      console.error(err);
      showClientOrderInfoEmpty("Ошибка загрузки", "Не удалось загрузить детали заказа.");
    }
  }

  function openOrderTab(orderId, options = {}) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const opts = options && typeof options === "object" ? options : {};
    const tabKey = buildTabKey("order", id);
    const isAlreadyActive = tabsState.activeKey === tabKey;
    if (isAlreadyActive && opts.forceRefresh !== true) {
      if (isMobile()) openSheet();
      return;
    }
    if (opts.forceRefresh === true) {
      try { state.orderCache.delete(id); } catch {}
    }
    ensureTab({
      type: "order",
      id,
      title: `№${id}`,
      onActivate: () => activateOrderById(id),
    });
    if (isMobile()) openSheet();
  }

  // -----------------------------
  // Open client
  // -----------------------------
  async function openClientById(id) {
    const requestToken = ++clientProfileRequestToken;
    state.activeClientId = Number(id) || null;
    state.activeOrderId = null;
    state.activeOrder = null;
    const activeId = Number(state.activeClientId || 0);
    const cached = getCachedClientDetails(activeId);
    const hasCachedAddresses = !!(cached && Array.isArray(cached.addresses) && cached.addresses.length);
    const hasCachedOrders = !!(cached && Array.isArray(cached.orders) && cached.orders.length);
    const hasCachedDiscounts = !!(cached && Array.isArray(cached.discounts) && cached.discounts.length);
    const useCacheOnlyForPreload = isChatBridgeMode && !!cached;

    // highlight list
    $$(".order-row.is-active", document).forEach((n) => n.classList.remove("is-active"));
    const row = $(`.order-row[data-client-id="${state.activeClientId}"]`, document);
    if (row) row.classList.add("is-active");

    if (cached?.client) {
      setClient(cached.client);
      state.addresses = Array.isArray(cached.addresses) ? cached.addresses.slice() : [];
      state.clientOrders = Array.isArray(cached.orders) ? cached.orders.slice() : [];
      state.clientDiscounts = Array.isArray(cached.discounts) ? cached.discounts.slice() : [];
      renderAddresses();
      renderClientOrders();
      renderClientDiscounts();
    }

    let loadedClient = null;
    try {
      const json = await apiJson(`/api/admin/clients/${state.activeClientId}`);
      if (requestToken !== clientProfileRequestToken) return;
      loadedClient = json?.data || null;
      if (loadedClient) {
        setCachedClientDetails(activeId, { client: loadedClient });
      }
    } catch (err) {
      console.error(err);
      if (requestToken !== clientProfileRequestToken) return;
    }
    setClient(loadedClient || cached?.client || null);

    // Ensure right-side tab title is the client name (not #id fallback).
    const activeTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
    if (activeTab && activeTab.type === "client" && Number(activeTab.id) === Number(state.activeClientId)) {
      const nextTitle = String(loadedClient?.name || "").trim() || "Клиент";
      if (activeTab.title !== nextTitle) {
        activeTab.title = nextTitle;
        renderTabs();
      }
    }
    hideEmptyState();

    // Reset content tab to addresses and order detail view
    showOrdersList();
    setContentTab("addresses");

    const preloadTasks = isChatBridgeMode
      ? [
        loadClientOrders({
          preferCache: true,
          refresh: useCacheOnlyForPreload ? !hasCachedOrders : true,
        }),
      ]
      : [
        loadAddresses({
          preferCache: true,
          refresh: useCacheOnlyForPreload ? !hasCachedAddresses : true,
        }),
        loadClientOrders({
          preferCache: true,
          refresh: useCacheOnlyForPreload ? !hasCachedOrders : true,
        }),
        loadClientDiscounts({
          preferCache: true,
          refresh: useCacheOnlyForPreload ? !hasCachedDiscounts : true,
        }),
      ];
    await Promise.allSettled(preloadTasks);
    if (requestToken !== clientProfileRequestToken) return;

    // Reset address form
    if (addrFormCard) addrFormCard.classList.add("hidden");
    if (addrToggleBtn) addrToggleBtn.textContent = "+ Новый адрес";
  }

  function buildGuestClientProfile(clientId, preferredTitle = "") {
    const title = String(preferredTitle || "").trim() || "\u0413\u043e\u0441\u0442\u044c";
    return {
      id: Number(clientId || 0) || 0,
      name: title,
      phone: "",
      birthday: "",
      photo: "",
      total_orders: 0,
      total_spent: 0,
      last_order_date: "",
      created_at: "",
      is_guest_chat: true,
    };
  }

  function normalizeGuestTitle(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isGuestTitle(value) {
    const normalized = normalizeGuestTitle(value);
    if (!normalized) return false;
    return /^\u0433\u043e\u0441\u0442\u044c\b/.test(normalized);
  }

  async function openGuestClientById(id, preferredTitle = "") {
    const requestToken = ++clientProfileRequestToken;
    const clientId = Number(id) || null;
    state.activeClientId = null;
    state.activeOrderId = null;
    state.activeOrder = null;

    $$(".order-row.is-active", document).forEach((n) => n.classList.remove("is-active"));
    const row = $(`.order-row[data-client-id="${clientId}"]`, document);
    if (row) row.classList.add("is-active");

    setClient(buildGuestClientProfile(clientId, preferredTitle));

    const activeTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
    if (activeTab && activeTab.type === "client" && Number(activeTab.id) === Number(clientId)) {
      const nextTitle = String(preferredTitle || "").trim() || "\u0413\u043e\u0441\u0442\u044c";
      if (activeTab.title !== nextTitle) {
        activeTab.title = nextTitle;
        renderTabs();
      }
    }

    hideEmptyState();
    showOrdersList();
    setContentTab("addresses");

    state.addresses = [];
    state.clientOrders = [];
    state.clientDiscounts = [];
    renderAddresses();
    renderClientOrders();
    renderClientDiscounts();
    if (requestToken !== clientProfileRequestToken) return;

    if (addrFormCard) addrFormCard.classList.add("hidden");
    if (addrToggleBtn) addrToggleBtn.textContent = "+ \u041d\u043e\u0432\u044b\u0439 \u0430\u0434\u0440\u0435\u0441";
  }

  async function selectClient(id, preferredTitle = "", options = {}) {
    const clientId = Number(id) || null;
    if (!clientId) return;
    const opts = options && typeof options === "object" ? options : {};
    const hintedTitle = String(preferredTitle || "").trim();
    const isGuestChatClient = opts.chatGuest === true || isGuestTitle(hintedTitle);

    const clientData = state.clients.find((x) => Number(x.id) === clientId);
    const title = isGuestChatClient
      ? (hintedTitle || "\u0413\u043e\u0441\u0442\u044c")
      : (String(clientData?.name || "").trim() || hintedTitle || "\u041a\u043b\u0438\u0435\u043d\u0442");

    ensureTab({
      type: 'client',
      id: clientId,
      title,
      onActivate: () => (
        isGuestChatClient
          ? openGuestClientById(clientId, title)
          : openClientById(clientId)
      ),
    });

    if (opts.forceRefresh === true) {
      activateOrderById(id).catch(console.error);
    }
    if (isMobile()) openSheet();
  }

  async function findClientIdByPhone(phoneValue) {
    const digits = normalizePhoneDigits(phoneValue);
    if (!digits) return null;

    const localMatch = (state.clients || []).find((client) => normalizePhoneDigits(client.phone) === digits);
    if (localMatch) {
      const localId = Number(localMatch.id || 0);
      return Number.isFinite(localId) && localId > 0 ? localId : null;
    }

    const qs = new URLSearchParams();
    qs.set("limit", "1");
    qs.set("offset", "0");
    qs.set("q", digits);
    const json = await apiJson(`/api/admin/clients?${qs.toString()}`);
    const rows = Array.isArray(json.data) ? json.data : [];
    const match = rows.find((client) => normalizePhoneDigits(client.phone) === digits) || rows[0];
    const id = match ? Number(match.id || 0) : 0;
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  async function openClientRequestedInUrl(request) {
    if (!request || (!request.clientId && !request.clientPhone)) return;

    let targetClientId = request.clientId;
    try {
      if (!targetClientId && request.clientPhone) {
        targetClientId = await findClientIdByPhone(request.clientPhone);
      }
      if (targetClientId) {
        await selectClient(targetClientId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      clearClientOpenRequestFromUrl();
    }
  }

  // -----------------------------
  // Load clients
  // -----------------------------
  async function loadTotals() {
    const q = state.q ? `&q=${encodeURIComponent(state.q)}` : "";
    const a = await apiJson(`/api/admin/clients?limit=1&offset=0${q}`);
    state.totals.all = Number(a.total || 0);
  }

  function buildClientsListQuery(offset, limit) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    qs.set("sort", state.sort || "last_desc");
    if (state.q) qs.set("q", state.q);
    if (state.activeFilter === "custom" && state.activeCustomFilterId) {
      qs.set("filter_id", String(state.activeCustomFilterId));
    }
    return qs;
  }

  async function loadMoreClients() {
    if (state.clientsLoading) return;
    if (!state.clientsHasMore) return;

    state.clientsLoading = true;
    const token = clientsRequestToken;
    try {
      const qs = buildClientsListQuery(state.clientsOffset, CLIENTS_PAGE_LIMIT);
      const json = await apiJson(`/api/admin/clients?${qs.toString()}`);
      if (token !== clientsRequestToken) return;

      const chunk = Array.isArray(json.data) ? json.data : [];
      const knownIds = new Set((state.clients || []).map((x) => Number(x.id)));
      const append = chunk.filter((x) => !knownIds.has(Number(x.id)));

      state.clients = (state.clients || []).concat(append);
      state.clientsOffset += chunk.length;
      state.clientsTotal = Number(json.total || 0);
      state.clientsHasMore = chunk.length > 0 && state.clients.length < state.clientsTotal;

      appendClients(append);
    } finally {
      if (token === clientsRequestToken) {
        state.clientsLoading = false;
        if (state.currentView === "clients") {
          maybeLoadMoreClientsOnScroll();
        }
      }
    }
  }

  async function ensureClientsScrollable() {
    if (!elClientsScroll) return;
    let guard = 0;
    while (
      state.currentView === "clients" &&
      state.clientsHasMore &&
      !state.clientsLoading &&
      elClientsScroll.scrollHeight <= (elClientsScroll.clientHeight + 20) &&
      guard < 5
    ) {
      guard += 1;
      await loadMoreClients();
    }
  }

  async function loadClients() {
    clientsRequestToken += 1;
    state.clientsLoading = false;
    state.clients = [];
    state.clientsOffset = 0;
    state.clientsTotal = 0;
    state.clientsHasMore = true;
    renderClients();

    await loadTotals();
    renderFilters();

    await loadMoreClients();
    await ensureClientsScrollable();
  }

  // -----------------------------
  // Search
  // -----------------------------
  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const onSearch = debounce(() => {
    state.q = elSearch ? elSearch.value.trim() : "";
    loadClients().catch(console.error);
  }, 250);

  function maybeLoadMoreClientsOnScroll() {
    if (!elClientsScroll) return;
    if (state.currentView !== "clients") return;
    if (state.clientsLoading || !state.clientsHasMore) return;
    const nearBottom =
      (elClientsScroll.scrollTop + elClientsScroll.clientHeight) >=
      (elClientsScroll.scrollHeight - CLIENTS_SCROLL_THRESHOLD_PX);
    if (nearBottom) {
      loadMoreClients().catch(console.error);
    }
  }

  // -----------------------------
  // Sheet events
  // -----------------------------
  if (sheetClose) sheetClose.addEventListener("click", closeSheet);
  if (sheetBackdrop) sheetBackdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });
  window.addEventListener("resize", () => {
    if (!isMobile()) closeSheet();
  });

  // -----------------------------
  // Toolbar: expandable search
  // -----------------------------
  function openSearch() {
    if (elSearchWrap) elSearchWrap.classList.add("is-open");
    if (elSearch) { elSearch.value = state.q || ""; elSearch.focus(); }
  }

  function closeSearch() {
    if (elSearchWrap) elSearchWrap.classList.remove("is-open");
    if (elSearch) elSearch.value = "";
    if (state.q) {
      state.q = "";
      loadClients().catch(console.error);
    }
  }

  if (elSearchToggle) {
    elSearchToggle.addEventListener("click", () => {
      const isOpen = elSearchWrap && elSearchWrap.classList.contains("is-open");
      if (isOpen) closeSearch();
      else openSearch();
    });
  }

  if (elSearch) elSearch.addEventListener("input", onSearch);
  if (elSearch) elSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch();
  });
  if (elClientsScroll) {
    elClientsScroll.addEventListener("scroll", maybeLoadMoreClientsOnScroll, { passive: true });
  }

  // -----------------------------
  // Toolbar: sort dropdown
  // -----------------------------
  function toggleSortDropdown() {
    if (!elSortDropdown) return;
    elSortDropdown.classList.toggle("hidden");
  }
  function closeSortDropdown() {
    if (elSortDropdown) elSortDropdown.classList.add("hidden");
  }

  if (elSortToggle) {
    elSortToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSortDropdown();
    });
  }

  if (elSortDropdown) {
    elSortDropdown.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sort-val]");
      if (!btn) return;
      e.stopPropagation();
      state.sort = btn.dataset.sortVal || "last_desc";
      // update active state
      $$("[data-sort-val]", elSortDropdown).forEach((b) => {
        b.classList.toggle("is-active", b.dataset.sortVal === state.sort);
      });
      closeSortDropdown();
      loadClients().catch(console.error);
    });
  }

  // close sort dropdown on outside click
  document.addEventListener("click", (e) => {
    if (elSortWrap && !elSortWrap.contains(e.target)) {
      closeSortDropdown();
    }
  });

  // Add button (context-dependent)
  if (elAddBtn) {
    elAddBtn.addEventListener("click", () => {
      if (state.currentView === 'filter-categories') {
        // Создать новую категорию/фильтр
        openFilterEditor(null);
      } else if (state.currentView === 'discounts') {
        // Создать новую скидку
        openDiscountEditor(null);
      } else {
        // TODO: открыть форму добавления клиента
      }
    });
  }

  // Кнопка "Категории" внутри аккордеона
  if (elOpenFilterCategoriesBtn) {
    elOpenFilterCategoriesBtn.addEventListener('click', () => {
      switchView('filter-categories');
    });
  }

  // Кнопка "Скидки" — переключить на view скидок
  if (elAddDiscountBtn) {
    elAddDiscountBtn.addEventListener('click', () => {
      switchView('discounts');
    });
  }

  // Кнопка добавления правила в редакторе фильтра
  if (elFilterAddRuleBtn) {
    elFilterAddRuleBtn.addEventListener('click', () => {
      if (!elFilterRulesContainer) return;
      const html = renderRuleRow(elFilterRulesContainer.querySelectorAll('.filter-rule-row').length, { field: 'total_orders', operator: '>=', value: '' });
      elFilterRulesContainer.insertAdjacentHTML('beforeend', html);
      bindRuleRowEvents();
    });
  }

  // Кнопка сохранения фильтра
  if (elFilterSaveBtn) {
    elFilterSaveBtn.addEventListener('click', saveFilter);
  }

  // Кнопка удаления фильтра
  if (elFilterDeleteBtn) {
    elFilterDeleteBtn.addEventListener('click', deleteFilter);
  }

  // Кнопка сохранения скидки
  if (elDiscountSaveBtn) {
    elDiscountSaveBtn.addEventListener('click', saveDiscount);
  }

  // Кнопка удаления скидки
  if (elDiscountDeleteBtn) {
    elDiscountDeleteBtn.addEventListener('click', deleteDiscount);
  }

  // Кнопка редактирования скидки (из инфо-панели)
  if (elDiscountEditBtn) {
    elDiscountEditBtn.addEventListener('click', () => {
      if (state.activeDiscount) {
        openDiscountEditor(state.activeDiscount.id);
      }
    });
  }

  // Кнопка добавления товаров в скидку
  if (elDeAddProductsBtn) {
    elDeAddProductsBtn.addEventListener('click', openDiscountProductPicker);
  }

  // Кнопка добавления клиентов в скидку
  if (elDeAddCustomersBtn) {
    elDeAddCustomersBtn.addEventListener('click', openDiscountCustomerPicker);
  }

  // Отмена picker
  if (elDiscountPickerCancelBtn) {
    elDiscountPickerCancelBtn.addEventListener('click', closeDiscountPicker);
  }

  // Применить picker
  if (elDiscountPickerApplyBtn) {
    elDiscountPickerApplyBtn.addEventListener('click', applyDiscountPickerSelection);
  }

  // Поиск в picker товаров
  if (elDiscountPickerSearch) {
    elDiscountPickerSearch.addEventListener('input', (e) => {
      state.discountPickerQuery = e.target.value;
      renderDiscountPickerList();
    });
  }

  // Поиск в picker клиентов
  if (elDiscountCustomerPickerSearch) {
    elDiscountCustomerPickerSearch.addEventListener('input', (e) => {
      state.discountPickerQuery = e.target.value;
      if (state.discountPickerCategoryId === 'categories') {
        renderDiscountCustomerCategoryList();
      } else {
        if (discountCustomerSearchDebounce) {
          clearTimeout(discountCustomerSearchDebounce);
        }
        discountCustomerSearchDebounce = setTimeout(() => {
          refreshDiscountCustomerPickerList().catch(console.error);
        }, 220);
      }
    });
  }

  // Выделить все в picker товаров
  if (elDiscountPickerSelectAll) {
    elDiscountPickerSelectAll.addEventListener('change', (e) => {
      const checkboxes = $$('#discountPickerList input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          state.discountPickerSelection.add(cb.dataset.key);
        } else {
          state.discountPickerSelection.delete(cb.dataset.key);
        }
      });
    });
  }

  // Выделить все в picker клиентов
  if (elDiscountCustomerPickerSelectAll) {
    elDiscountCustomerPickerSelectAll.addEventListener('change', (e) => {
      const checkboxes = $$('#discountCustomerPickerList input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          state.discountPickerSelection.add(cb.dataset.key);
        } else {
          state.discountPickerSelection.delete(cb.dataset.key);
        }
      });
    });
  }

  // Делегирование событий для табов picker товаров
  if (elDiscountPickerTabs) {
    elDiscountPickerTabs.addEventListener('click', async (e) => {
      const tab = e.target.closest('.option-picker-tab');
      if (!tab) return;
      const catId = tab.dataset.catId;
      state.discountPickerCategoryId = catId ? parseInt(catId, 10) : null;
      renderDiscountPickerTabs();
      await refreshDiscountPickerProducts();
    });
  }

  // Делегирование событий для табов picker клиентов
  if (elDiscountCustomerPickerTabs) {
    elDiscountCustomerPickerTabs.addEventListener('click', async (e) => {
      const tab = e.target.closest('.option-picker-tab');
      if (!tab) return;
      const catId = tab.dataset.catId;
      state.discountPickerCategoryId = catId || null;
      renderDiscountCustomerPickerTabs();
      await refreshDiscountCustomerPickerList();
    });
  }

  // Делегирование событий для чекбоксов в picker товаров
  if (elDiscountPickerList) {
    elDiscountPickerList.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const key = e.target.dataset.key;
      if (e.target.checked) {
        state.discountPickerSelection.add(key);
      } else {
        state.discountPickerSelection.delete(key);
      }
      updatePickerSelectAll();
    });
  }

  // Делегирование событий для чекбоксов в picker клиентов
  if (elDiscountCustomerPickerList) {
    elDiscountCustomerPickerList.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const key = e.target.dataset.key;
      if (e.target.checked) {
        state.discountPickerSelection.add(key);
      } else {
        state.discountPickerSelection.delete(key);
      }
      updateCustomerPickerSelectAll();
    });
  }

  // Делегирование событий для удаления чипов товаров
  if (elDeProductsChips) {
    elDeProductsChips.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.discount-chip-remove');
      if (!removeBtn) return;
      const chip = removeBtn.closest('.discount-chip');
      if (!chip) return;
      const type = chip.dataset.type;
      const id = parseInt(chip.dataset.id, 10);
      removeDiscountProductChip(type, id);
    });
  }

  // Делегирование событий для удаления чипов клиентов
  if (elDeCustomersChips) {
    elDeCustomersChips.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.discount-chip-remove');
      if (!removeBtn) return;
      const chip = removeBtn.closest('.discount-chip');
      if (!chip) return;
      const type = chip.dataset.type;
      const id = parseInt(chip.dataset.id, 10);
      removeDiscountCustomerChip(type, id);
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  initClientsAccordion();
  
  // Инициализируем кастомный select для логики условий
  const logicSelectWrap = $('#fe_logic');
  if (logicSelectWrap) {
    initCustomSelects(logicSelectWrap.parentElement);
  }

  const isChatBridgeMode = !!(document.body && document.body.classList.contains("page-chat"));
  if (!isChatBridgeMode) {
    const initialClientOpenRequest = getClientOpenRequestFromUrl();

  loadCustomFilters().catch(console.error);
  loadClients()
    .then(() => openClientRequestedInUrl(initialClientOpenRequest))
    .catch((err) => {
      console.error(err);
      clearClientOpenRequestFromUrl();
    });
  loadDiscounts().catch(console.error);

  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен (clients):', event.detail.store);
    loadCustomFilters().catch(console.error);
    loadClients().catch(console.error);
    loadDiscounts().catch(console.error);
  });
  }
  window.__clientsDashboardApi = {
    selectClientById(id, preferredTitle = "", options = {}) {
      return selectClient(id, preferredTitle, options);
    },
    selectGuestChatClient(id, preferredTitle = "") {
      return selectClient(id, preferredTitle, { chatGuest: true });
    },
    refreshClients() {
      return loadClients();
    },
    refreshDiscounts() {
      return loadDiscounts();
    },
    openOrderById(orderId, options = {}) {
      return openOrderTab(orderId, options);
    },
  };
})();

