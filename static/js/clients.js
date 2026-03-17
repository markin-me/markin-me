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
  const elDeMechanicType = $("#de_mechanic_type");
  const elDeDescription = $("#de_description");
  const elDeSimpleWrap = $("#de_simple_wrap");
  const elDeSimpleVariant = $("#de_simple_variant");
  const elDeSimpleRegularWrap = $("#de_simple_regular_wrap");
  const elDeDiscountType = $("#de_discount_type");
  const elDeActivationMode = $("#de_activation_mode");
  const elDePromoEnabled = $("#de_promo_enabled");
  const elDePromoWrap = $("#de_promo_wrap");
  const elDePromoSettingsWrap = $("#de_promo_settings_wrap");
  const elDePromoCodeMode = $("#de_promo_code_mode");
  const elDePromoSharedWrap = $("#de_promo_shared_wrap");
  const elDePromoSharedCode = $("#de_promo_shared_code");
  const elDePromoSharedUsageLimit = $("#de_promo_shared_usage_limit");
  const elDePromoUniqueWrap = $("#de_promo_unique_wrap");
  const elDePromoUniqueUsageLimit = $("#de_promo_unique_usage_limit");
  const elDePromoGenerateCount = $("#de_promo_generate_count");
  const elDePromoGenerateBtn = $("#de_promo_generate_btn");
  const elDePromoGenerateHint = $("#de_promo_generate_hint");
  const elDePromoCodesWrap = $("#de_promo_codes_wrap");
  const elDePromoCodesList = $("#de_promo_codes_list");
  const elDePromoRewardType = $("#de_promo_reward_type");
  const elDePromoRewardVariantDiscountWrap = $("#de_promo_reward_variant_discount_wrap");
  const elDePromoRewardVariantProductWrap = $("#de_promo_reward_variant_product_wrap");
  const elDePromoProductRewardTypeWrap = $("#de_promo_product_reward_type_wrap");
  const elDePromoProductRewardType = $("#de_promo_product_reward_type");
  const elDePromoProductDiscountRow = $("#de_promo_product_discount_row");
  const elDePromoProductDiscountType = $("#de_promo_product_discount_type");
  const elDePromoProductDiscountValue = $("#de_promo_product_discount_value");
  const elDePromoDiscountTypeWrap = $("#de_promo_discount_type_wrap");
  const elDePromoDiscountType = $("#de_promo_discount_type");
  const elDePromoDiscountValueWrap = $("#de_promo_discount_value_wrap");
  const elDePromoDiscountValue = $("#de_promo_discount_value");
  const elDePromoApplyToWrap = $("#de_promo_apply_to_wrap");
  const elDePromoApplyTo = $("#de_promo_apply_to");
  const elDePromoDiscountRow = $("#de_promo_discount_row");
  const elDePromoProductsWrap = $("#de_promo_products_wrap");
  const elDePromoProductsChips = $("#de_promo_products_chips");
  const elDeAddPromoProductsBtn = $("#de_add_promo_products_btn");
  const elDeBuyXGetYWrap = $("#de_buy_x_get_y_wrap");
  const elDeBuyQty = $("#de_buy_qty");
  const elDeRewardQty = $("#de_reward_qty");
  const elDeBuyQualifyingMode = $("#de_buy_qualifying_mode");
  const elDeBuyRepeatMode = $("#de_buy_repeat_mode");
  const elDeBuyRewardSource = $("#de_buy_reward_source");
  const elDeBuyRewardKind = $("#de_buy_reward_kind");
  const elDeBuyConditionProductsWrap = $("#de_buy_condition_products_wrap");
  const elDeBuyConditionProductsChips = $("#de_buy_condition_products_chips");
  const elDeAddBuyConditionProductsBtn = $("#de_add_buy_condition_products_btn");
  const elDeBuyRewardProductsWrap = $("#de_buy_reward_products_wrap");
  const elDeBuyRewardProductsChips = $("#de_buy_reward_products_chips");
  const elDeAddBuyRewardProductsBtn = $("#de_add_buy_reward_products_btn");
  const elDeBuyRewardDiscountWrap = $("#de_buy_reward_discount_wrap");
  const elDeBuyRewardDiscountType = $("#de_buy_reward_discount_type");
  const elDeBuyRewardDiscountValue = $("#de_buy_reward_discount_value");
  const elDeThresholdWrap = $("#de_threshold_wrap");
  const elDeThresholdBasis = $("#de_threshold_basis");
  const elDeThresholdApplyMode = $("#de_threshold_apply_mode");
  const elDeThresholdTiersList = $("#de_threshold_tiers_list");
  const elDeAddThresholdTierBtn = $("#de_add_threshold_tier_btn");
  const elDeProductsWrap = $("#de_products_wrap");

  if (elDePromoCodeMode && elDePromoCodeMode.options.length >= 2) {
    elDePromoCodeMode.options[0].text = 'Общий';
    elDePromoCodeMode.options[1].text = 'Уникальный';
  }
  if (elDePromoSharedCode) elDePromoSharedCode.placeholder = 'Промокод';
  if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.placeholder = 'Лимит на код';
  if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.placeholder = 'Лимит на один код';
  if (elDePromoGenerateCount) elDePromoGenerateCount.placeholder = 'Количество';

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
    discountPickerTarget: 'discount_products',
    discountPickerSelection: new Set(),
    discountPickerCategoryId: null,   // Активная категория в picker
    discountPickerProducts: [],       // Список товаров в текущей категории
    discountPickerQuery: '',          // Поисковый запрос
    // Выбранные элементы для скидки
    discountSelectedProducts: [],     // [{type:'product'|'category'|'combo', id, title}]
    discountSelectedCustomers: [],    // [{type:'category'|'customer', id, title}]
    discountBuyConditionProducts: [],
    discountBuyRewardProducts: [],
    discountThresholdTiers: [],
    discountThresholdTierSeq: 1,
    // Кэш данных для picker
    catalogCategories: [],
    catalogProducts: [],
    customerCategories: [],
    customersList: [],
    customersById: new Map(),
    clientDetailsCache: new Map(),
    discountPromoCodes: [],
  };
  const CLIENTS_PAGE_LIMIT = 80;
  const CLIENTS_SCROLL_THRESHOLD_PX = 220;
  let clientsRequestToken = 0;
  let clientProfileRequestToken = 0;
  let orderRequestToken = 0;
  let discountCustomerSearchToken = 0;
  let discountCustomerSearchDebounce = null;
  const clientOrderMetricsRequests = new Map();
  let customFilterCountsRequestToken = 0;
  let filterDraftCountPreview = null;
  let filterDraftCountRequestToken = 0;
  let filterDraftCountTimer = null;

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

  function computeClientMetricsFromOrders(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let totalOrders = 0;
    let totalSpent = 0;
    let lastOrderTs = 0;
    let lastOrderDate = "";
    list.forEach((row) => {
      totalOrders += 1;
      totalSpent += Number(row?.total_price || 0) || 0;
      const createdAt = String(row?.created_at || "");
      const ts = createdAt ? new Date(createdAt).getTime() : 0;
      if (ts > lastOrderTs) {
        lastOrderTs = ts;
        lastOrderDate = createdAt;
      }
    });
    return {
      total_orders: totalOrders,
      total_spent: totalSpent,
      last_order_date: lastOrderDate,
    };
  }

  function updateClientRowMetrics(clientId, metrics) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0 || !metrics || typeof metrics !== "object") return;

    const totalOrders = Math.max(0, Number(metrics.total_orders || 0));
    const totalSpent = Math.max(0, Number(metrics.total_spent || 0));
    const lastOrderDate = String(metrics.last_order_date || "");

    const list = Array.isArray(state.clients) ? state.clients : [];
    const idx = list.findIndex((row) => Number(row?.id || 0) === id);
    if (idx >= 0) {
      const prev = list[idx] || {};
      list[idx] = {
        ...prev,
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
      };
    }

    const rowEl = $(`.order-row[data-client-id="${id}"]`, document);
    const pillEl = rowEl ? $(".order-actions .pill", rowEl) : null;
    if (pillEl) {
      pillEl.textContent = String(totalOrders);
    }

    const cached = getCachedClientDetails(id);
    const baseClient =
      cached?.client
      || (state.activeClient && Number(state.activeClient.id || 0) === id ? state.activeClient : null)
      || (idx >= 0 ? list[idx] : null)
      || { id };
    setCachedClientDetails(id, {
      client: {
        ...baseClient,
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
      },
    });

    if (state.activeClient && Number(state.activeClient.id || 0) === id) {
      setClient({
        ...state.activeClient,
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
      });
    }

    refreshCustomFilterCountsFromClientList();
  }

  async function ensureClientOrderMetrics(clientId, options = {}) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (clientOrderMetricsRequests.has(id)) {
      return clientOrderMetricsRequests.get(id);
    }

    const request = (async () => {
      const cached = getCachedClientDetails(id);
      if (!options.force && cached && Array.isArray(cached.orders) && cached.orders.length) {
        const metrics = computeClientMetricsFromOrders(cached.orders);
        updateClientRowMetrics(id, metrics);
        return metrics;
      }

      const json = await fetchClientOrdersShared(id);
      const rows = Array.isArray(json?.data) ? json.data : [];
      const metrics = computeClientMetricsFromOrders(rows);
      setCachedClientDetails(id, { orders: rows });
      updateClientRowMetrics(id, metrics);
      return metrics;
    })()
      .catch((err) => {
        console.error(err);
        return null;
      })
      .finally(() => {
        clientOrderMetricsRequests.delete(id);
      });

    clientOrderMetricsRequests.set(id, request);
    return request;
  }

  function reconcileClientListOrderMetrics(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return;
    const candidates = rows.filter((row) => Number(row?.id || 0) > 0 && Number(row?.total_orders || 0) <= 0);
    if (!candidates.length) return;

    const limit = state.q ? 20 : 8;
    const run = async () => {
      for (const row of candidates.slice(0, limit)) {
        await ensureClientOrderMetrics(row.id);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => { run().catch(console.error); }, { timeout: 1200 });
      return;
    }
    window.setTimeout(() => { run().catch(console.error); }, 60);
  }

  function getRelativeDateFilterValue(rawValue) {
    if (typeof rawValue !== "string" || !/^-\d+d$/.test(rawValue)) return null;
    const days = Number.parseInt(rawValue.slice(1, -1), 10);
    if (!Number.isFinite(days) || days < 0) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - days);
    return now.getTime();
  }

  function evaluateCustomFilterRule(client, rule) {
    if (!rule || typeof rule !== "object") return null;
    const field = String(rule.field || "").trim();
    const operator = String(rule.operator || "").trim();
    const numericFields = new Set(["total_orders", "total_spent", "is_active"]);
    const dateFields = new Set(["last_order_date", "registration_date", "created_at"]);
    const supported = new Set(["=", "!=", ">=", "<=", ">", "<"]);
    if ((!numericFields.has(field) && !dateFields.has(field)) || !supported.has(operator)) {
      return null;
    }

    let left = client?.[field];
    let right = rule.value;

    if (numericFields.has(field)) {
      if (right === "" || right == null) return null;
      left = Number(left || 0);
      right = Number(right);
      if (!Number.isFinite(right)) return null;
    } else if (dateFields.has(field)) {
      const relativeTs = getRelativeDateFilterValue(right);
      const leftTs = left ? new Date(left).getTime() : NaN;
      const rightTs = relativeTs ?? (right ? new Date(right).getTime() : NaN);
      if (!Number.isFinite(leftTs) || !Number.isFinite(rightTs)) return false;
      left = leftTs;
      right = rightTs;
    }

    switch (operator) {
      case "=": return left === right;
      case "!=": return left !== right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      case ">": return left > right;
      case "<": return left < right;
      default: return null;
    }
  }

  function doesClientMatchCustomFilter(client, conditions) {
    const rules = Array.isArray(conditions?.rules) ? conditions.rules : [];
    const validResults = rules
      .map((rule) => evaluateCustomFilterRule(client, rule))
      .filter((result) => result !== null);
    if (!validResults.length) return true;
    if (String(conditions?.logic || "").toUpperCase() === "OR") {
      return validResults.some(Boolean);
    }
    return validResults.every(Boolean);
  }

  function refreshCustomFilterCountsFromClientList() {
    if (!state.editingFilterId || state.editingFilterId === 'new') return;
    scheduleFilterDraftCountPreview();
  }

  function getDisplayedFilterCount(filter) {
    const filterId = Number(filter?.id || 0);
    const editingFilterId = Number(state.editingFilterId || 0);
    if (
      filterId > 0 &&
      editingFilterId > 0 &&
      filterId === editingFilterId &&
      Number.isFinite(filterDraftCountPreview)
    ) {
      return Math.max(0, Number(filterDraftCountPreview || 0));
    }
    return Math.max(0, Number(filter?.count || 0));
  }

  function clearFilterDraftCountPreview(options = {}) {
    filterDraftCountRequestToken += 1;
    filterDraftCountPreview = null;
    if (filterDraftCountTimer) {
      window.clearTimeout(filterDraftCountTimer);
      filterDraftCountTimer = null;
    }
    if (options.render === true) {
      renderFilters();
      if (state.currentView === 'filter-categories') {
        renderFilterCategoriesList();
      }
    }
  }

  async function refreshSavedCustomFilterCounts() {
    const token = ++customFilterCountsRequestToken;
    const filterIds = [...new Set((state.customFilters || [])
      .map((filter) => Number(filter?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0))];
    if (!filterIds.length) return;

    const results = await Promise.all(filterIds.map(async (id) => {
      try {
        const json = await apiJson(`/api/admin/clients?filter_id=${id}&limit=1&offset=0`);
        return { id, count: Math.max(0, Number(json?.total || 0)) };
      } catch (err) {
        console.error(err);
        return null;
      }
    }));
    if (token !== customFilterCountsRequestToken) return;

    let changed = false;
    const resultMap = new Map(results.filter(Boolean).map((item) => [item.id, item.count]));
    state.customFilters = (state.customFilters || []).map((filter) => {
      const id = Number(filter?.id || 0);
      if (!resultMap.has(id)) return filter;
      const nextCount = resultMap.get(id);
      if (Number(filter?.count || 0) === nextCount && Number(filter?.server_count || 0) === nextCount) {
        return filter;
      }
      changed = true;
      return {
        ...filter,
        count: nextCount,
        server_count: nextCount,
      };
    });

    if (changed) {
      renderFilters();
      if (state.currentView === 'filter-categories') {
        renderFilterCategoriesList();
      }
    }
  }

  async function refreshFilterDraftCountPreview() {
    const editingFilterId = Number(state.editingFilterId || 0);
    if (!(editingFilterId > 0)) {
      clearFilterDraftCountPreview({ render: true });
      return;
    }

    const data = collectFilterFormData({ requireTitle: false });
    if (!data) return;

    const requestToken = ++filterDraftCountRequestToken;
    try {
      const json = await apiJson('/api/admin/clients/filters/preview-count', {
        method: 'POST',
        body: { conditions: data.conditions },
      });
      if (requestToken !== filterDraftCountRequestToken || Number(state.editingFilterId || 0) !== editingFilterId) {
        return;
      }
      filterDraftCountPreview = Math.max(0, Number(json?.data?.count || 0));
      renderFilters();
      if (state.currentView === 'filter-categories') {
        renderFilterCategoriesList();
      }
    } catch (err) {
      console.error(err);
      if (requestToken !== filterDraftCountRequestToken) return;
      filterDraftCountPreview = null;
      renderFilters();
      if (state.currentView === 'filter-categories') {
        renderFilterCategoriesList();
      }
    }
  }

  function scheduleFilterDraftCountPreview(immediate = false) {
    if (filterDraftCountTimer) {
      window.clearTimeout(filterDraftCountTimer);
      filterDraftCountTimer = null;
    }
    if (immediate) {
      refreshFilterDraftCountPreview().catch(console.error);
      return;
    }
    filterDraftCountTimer = window.setTimeout(() => {
      refreshFilterDraftCountPreview().catch(console.error);
    }, 180);
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
      const displayedCount = getDisplayedFilterCount(filter);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-item";
      btn.setAttribute("data-filter", `custom_${filter.id}`);
      btn.classList.toggle("is-active", state.activeFilter === "custom" && state.activeCustomFilterId === filter.id);
      btn.innerHTML = `
        <span class="stage-meta stage-text"><b>${escapeHtml(filter.title)}</b></span>
        <span class="stage-count">${escapeHtml(displayedCount)}</span>
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
  function formatDiscountValue(discount) {
    if (!discount) return "—";
    if (discount.discount_type === 'percent') return `${discount.discount_value}%`;
    if (discount.discount_type === 'fixed') return `-${discount.discount_value}₽`;
    return `${discount.discount_value}₽`;
  }

  function formatDiscountApplyToText(applyTo) {
    return {
      order: 'Заказ',
      product: 'Товар',
      category: 'Категория',
      combo: 'Комбо',
    }[applyTo] || applyTo || '—';
  }

  function formatDiscountActivationText(activationMode) {
    return activationMode === 'promo_code' ? 'По промокоду' : 'Автоматически';
  }

  function formatDiscountPromoModeText(codeMode) {
    return codeMode === 'unique' ? 'Уникальные коды' : 'Один общий код';
  }

  function normalizePromoCodeInputValue(value) {
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function syncDiscountChoiceGroup(targetId) {
    if (!elDiscountEditorForm || !targetId) return;
    const control = document.getElementById(targetId);
    const group = elDiscountEditorForm.querySelector(`[data-discount-choice-group="${targetId}"]`);
    if (!control || !group) return;
    const currentValue = String(control.value || '');
    group.querySelectorAll('[data-discount-choice-value]').forEach((button) => {
      const isActive = String(button.getAttribute('data-discount-choice-value') || '') === currentValue;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function syncDiscountChoiceGroups() {
    syncDiscountChoiceGroup('de_discount_type');
    syncDiscountChoiceGroup('de_activation_mode');
  }

  function getDiscountPromoFromDiscount(discount) {
    const promo = discount?.promo && typeof discount.promo === 'object' ? discount.promo : {};
    const activationMode = discount?.activation_mode || (promo.enabled ? 'promo_code' : 'auto');
    const codeMode = promo.code_mode || discount?.promo_code_mode || 'shared';
    return {
      enabled: activationMode === 'promo_code',
      activation_mode: activationMode,
      code_mode: codeMode === 'unique' ? 'unique' : 'shared',
      shared_code: promo.shared_code || '',
      shared_code_usage_limit: promo.shared_code_usage_limit ?? null,
      unique_code_usage_limit: promo.unique_code_usage_limit ?? discount?.unique_code_usage_limit ?? 1,
      unique_codes_count: Number(promo.unique_codes_count || 0),
      unique_codes_active_count: Number(promo.unique_codes_active_count || 0),
      unique_codes_used_count: Number(promo.unique_codes_used_count || 0),
    };
  }

  function buildDiscountPromoSummary(discount) {
    const promo = getDiscountPromoFromDiscount(discount);
    if (!promo.enabled) return 'Не используется';
    if (promo.code_mode === 'shared') {
      const code = promo.shared_code || '—';
      const limit = promo.shared_code_usage_limit ? `, лимит ${promo.shared_code_usage_limit}` : '';
      return `${code}${limit}`;
    }
    return `${promo.unique_codes_count} кодов, активных ${promo.unique_codes_active_count}, использовано ${promo.unique_codes_used_count}`;
  }

  function normalizeDiscountMechanicType(value) {
    return ['simple_discount', 'buy_x_get_y', 'threshold'].includes(String(value || '').trim())
      ? String(value || '').trim()
      : 'simple_discount';
  }

  function cloneDiscountEntities(items = []) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => ({
        type: String(item?.type || item?.entity_type || 'product'),
        id: Number(item?.id || item?.entity_id || 0),
        title: String(item?.title || '').trim(),
      }))
      .filter((item) => item.id > 0);
  }

  function buildEmptyThresholdTier(partial = {}) {
    const nextId = partial.id || `tier_${state.discountThresholdTierSeq++}`;
    return {
      id: nextId,
      min_amount: partial.min_amount ?? '',
      reward_kind: partial.reward_kind || 'gift',
      reward_products: cloneDiscountEntities(partial.reward_products || []),
      reward_discount: {
        discount_type: partial.reward_discount?.discount_type || 'percent',
        discount_value: partial.reward_discount?.discount_value ?? '',
      },
    };
  }

  function getDiscountMechanic(discount) {
    const mechanicType = normalizeDiscountMechanicType(discount?.mechanic_type);
    const mechanic = discount?.mechanic && typeof discount.mechanic === 'object' ? discount.mechanic : {};

    if (mechanicType === 'buy_x_get_y') {
      return {
        type: 'buy_x_get_y',
        buy_qty: Number(mechanic.buy_qty || 5),
        reward_qty: Number(mechanic.reward_qty || 1),
        qualifying_mode: mechanic.qualifying_mode === 'pool' ? 'pool' : 'same_sku',
        repeat_mode: mechanic.repeat_mode === 'repeat' ? 'repeat' : 'single',
        reward_source: mechanic.reward_source === 'reward_list' ? 'reward_list' : 'same_pool',
        reward_kind: mechanic.reward_kind === 'product_discount' ? 'product_discount' : 'gift',
        qualifying_items: cloneDiscountEntities(mechanic.qualifying_items || []),
        reward_products: cloneDiscountEntities(mechanic.reward_products || []),
        reward_discount: {
          discount_type: mechanic.reward_discount?.discount_type || 'percent',
          discount_value: mechanic.reward_discount?.discount_value ?? '',
        },
      };
    }

    if (mechanicType === 'threshold') {
      return {
        type: 'threshold',
        threshold_basis: mechanic.threshold_basis === 'after_discounts' ? 'after_discounts' : 'before_discounts',
        threshold_apply_mode: mechanic.threshold_apply_mode === 'cumulative' ? 'cumulative' : 'best_only',
        tiers: Array.isArray(mechanic.tiers) && mechanic.tiers.length
          ? mechanic.tiers.map((tier) => buildEmptyThresholdTier(tier))
          : [buildEmptyThresholdTier()],
      };
    }

    return {
      type: 'simple_discount',
      discount_type: discount?.discount_type || mechanic.discount_type || 'percent',
      discount_value: discount?.discount_value ?? mechanic.discount_value ?? '',
      apply_to: discount?.apply_to || mechanic.apply_to || 'order',
    };
  }

  function formatDiscountApplyToText(applyTo) {
    return {
      order: 'Заказ',
      product: 'Товар',
      category: 'Категория',
      combo: 'Комбо',
    }[applyTo] || applyTo || '—';
  }

  function formatDiscountMechanicText(discount) {
    const mechanic = getDiscountMechanic(discount);
    if (mechanic.type === 'buy_x_get_y') return '5+1';
    if (mechanic.type === 'threshold') return 'Пороговая';
    return 'Скидка';
  }

  function formatDiscountValue(discount) {
    if (!discount) return "—";
    const mechanic = getDiscountMechanic(discount);
    if (mechanic.type === 'buy_x_get_y') {
      return `${mechanic.buy_qty}+${mechanic.reward_qty}`;
    }
    if (mechanic.type === 'threshold') {
      return `${Array.isArray(mechanic.tiers) ? mechanic.tiers.length : 0} ступ.`;
    }
    if (discount.discount_type === 'percent') return `${discount.discount_value}%`;
    if (discount.discount_type === 'fixed') return `-${discount.discount_value}₽`;
    return `${discount.discount_value}₽`;
  }

  function formatDiscountPromoModeText(codeMode) {
    return codeMode === 'unique' ? 'Уникальные коды' : 'Один общий код';
  }

  function getDiscountPromoFromDiscount(discount) {
    const promo = discount?.promo && typeof discount.promo === 'object' ? discount.promo : {};
    const enabled = promo.enabled === true || String(discount?.activation_mode || '') === 'promo_code';
    const codeMode = promo.code_mode || discount?.promo_code_mode || 'shared';
    return {
      enabled,
      activation_mode: enabled ? 'promo_code' : 'auto',
      code_mode: codeMode === 'unique' ? 'unique' : 'shared',
      shared_code: promo.shared_code || '',
      shared_code_usage_limit: promo.shared_code_usage_limit ?? null,
      unique_code_usage_limit: promo.unique_code_usage_limit ?? discount?.unique_code_usage_limit ?? 1,
      unique_codes_count: Number(promo.unique_codes_count || 0),
      unique_codes_active_count: Number(promo.unique_codes_active_count || 0),
      unique_codes_used_count: Number(promo.unique_codes_used_count || 0),
    };
  }

  function buildDiscountPromoSummary(discount) {
    const promo = getDiscountPromoFromDiscount(discount);
    if (!promo.enabled) return 'Не используется';
    if (promo.code_mode === 'shared') {
      const code = promo.shared_code || '—';
      const limit = promo.shared_code_usage_limit ? `, лимит ${promo.shared_code_usage_limit}` : '';
      return `${code}${limit}`;
    }
    return `${promo.unique_codes_count} кодов, активных ${promo.unique_codes_active_count}, использовано ${promo.unique_codes_used_count}`;
  }

  function syncDiscountChoiceGroups() {
    syncDiscountChoiceGroup('de_mechanic_type');
    syncDiscountChoiceGroup('de_discount_type');
  }

  function buildThresholdTierProductsHtml(items) {
    const rows = cloneDiscountEntities(items);
    if (!rows.length) return '<span class="discount-chips-empty">Не выбрано</span>';
    return rows.map((item) => `
      <span class="discount-chip">
        <span class="discount-chip-text">${escapeHtml(item.title || `#${item.id}`)}</span>
      </span>
    `).join('');
  }

  function renderThresholdTiers() {
    if (!elDeThresholdTiersList) return;
    if (!Array.isArray(state.discountThresholdTiers) || !state.discountThresholdTiers.length) {
      state.discountThresholdTiers = [buildEmptyThresholdTier()];
    }

    elDeThresholdTiersList.innerHTML = state.discountThresholdTiers.map((tier, index) => {
      const rewardKind = tier.reward_kind || 'gift';
      const showProducts = rewardKind !== 'order_discount';
      const showDiscount = rewardKind === 'product_discount' || rewardKind === 'order_discount';
      return `
        <div class="discount-threshold-tier" data-threshold-tier-id="${escapeHtml(tier.id)}">
          <div class="discount-threshold-tier-head">
            <div class="discount-threshold-tier-title">Ступень ${index + 1}</div>
            <button type="button" class="btn btn-sm${state.discountThresholdTiers.length <= 1 ? ' hidden' : ''}" data-threshold-tier-remove="${escapeHtml(tier.id)}">Удалить</button>
          </div>
          <div class="form-row-2">
            <div class="field-wrap">
              <label class="field-label">Порог</label>
              <input class="control" type="number" step="0.01" min="0" data-threshold-field="min_amount" data-threshold-tier-id="${escapeHtml(tier.id)}" value="${escapeHtml(tier.min_amount ?? '')}" placeholder="500" />
            </div>
            <div class="field-wrap">
              <label class="field-label">Тип награды</label>
              <select class="control hidden discount-editor-native-select" data-threshold-field="reward_kind" data-threshold-tier-id="${escapeHtml(tier.id)}">
                <option value="gift"${rewardKind === 'gift' ? ' selected' : ''}>Подарок</option>
                <option value="product_discount"${rewardKind === 'product_discount' ? ' selected' : ''}>Товар со скидкой</option>
                <option value="order_discount"${rewardKind === 'order_discount' ? ' selected' : ''}>Скидка на чек</option>
              </select>
            </div>
          </div>
          <div class="field-wrap${showProducts ? '' : ' hidden'}">
            <label class="field-label">Товары-награды</label>
            <div class="discount-chips-wrap">
              <div class="discount-chips">${buildThresholdTierProductsHtml(tier.reward_products)}</div>
              <button type="button" class="btn btn-sm" data-threshold-tier-products="${escapeHtml(tier.id)}">
                <i class="fas fa-plus"></i> Добавить товары
              </button>
            </div>
          </div>
          <div class="form-row-2${showDiscount ? '' : ' hidden'}">
            <div class="field-wrap">
              <label class="field-label">Тип скидки</label>
              <select class="control hidden discount-editor-native-select" data-threshold-field="discount_type" data-threshold-tier-id="${escapeHtml(tier.id)}">
                <option value="percent"${tier.reward_discount?.discount_type === 'percent' ? ' selected' : ''}>Процент (%)</option>
                <option value="fixed"${tier.reward_discount?.discount_type === 'fixed' ? ' selected' : ''}>Фиксированная сумма (₽)</option>
                <option value="special_price"${tier.reward_discount?.discount_type === 'special_price' ? ' selected' : ''}>Специальная цена</option>
              </select>
            </div>
            <div class="field-wrap">
              <label class="field-label">Значение</label>
              <input class="control" type="number" step="0.01" min="0" data-threshold-field="discount_value" data-threshold-tier-id="${escapeHtml(tier.id)}" value="${escapeHtml(tier.reward_discount?.discount_value ?? '')}" placeholder="10" />
            </div>
          </div>
        </div>
      `;
    }).join('');
    syncDiscountEditorCustomSelects(elDeThresholdTiersList);
  }

  function renderDiscountMechanicUi() {
    syncDiscountChoiceGroups();
    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    const isBuyXGetY = mechanicType === 'buy_x_get_y';
    const isThreshold = mechanicType === 'threshold';
    const qualifyingMode = elDeBuyQualifyingMode?.value || 'same_sku';
    const rewardSource = elDeBuyRewardSource?.value || 'same_pool';
    const rewardKind = elDeBuyRewardKind?.value || 'gift';

    if (elDeSimpleWrap) elDeSimpleWrap.classList.toggle('hidden', mechanicType !== 'simple_discount');
    if (elDeBuyXGetYWrap) elDeBuyXGetYWrap.classList.toggle('hidden', !isBuyXGetY);
    if (elDeThresholdWrap) elDeThresholdWrap.classList.toggle('hidden', !isThreshold);
    if (elDeBuyConditionProductsWrap) elDeBuyConditionProductsWrap.classList.toggle('hidden', !isBuyXGetY || qualifyingMode !== 'pool');
    if (elDeBuyRewardProductsWrap) elDeBuyRewardProductsWrap.classList.toggle('hidden', !isBuyXGetY || rewardSource !== 'reward_list');
    if (elDeBuyRewardDiscountWrap) elDeBuyRewardDiscountWrap.classList.toggle('hidden', !isBuyXGetY || rewardKind !== 'product_discount');
    if (isThreshold) renderThresholdTiers();
  }

  function updateDiscountPromoUi() {
    renderDiscountMechanicUi();
    const isPromo = !!elDePromoEnabled?.checked;
    const codeMode = elDePromoCodeMode?.value || 'shared';
    const isUnique = isPromo && codeMode === 'unique';
    const hasSavedDiscount = Number($('#de_id')?.value || 0) > 0;

    if (elDeActivationMode) {
      elDeActivationMode.value = isPromo ? 'promo_code' : 'auto';
    }
    if (elDePromoSettingsWrap) elDePromoSettingsWrap.classList.toggle('hidden', !isPromo);
    if (elDePromoSharedWrap) elDePromoSharedWrap.classList.toggle('hidden', !isPromo || codeMode !== 'shared');
    if (elDePromoUniqueWrap) elDePromoUniqueWrap.classList.toggle('hidden', !isUnique);

    if (elDePromoCodesWrap) {
      const shouldShowCodes = isUnique && (hasSavedDiscount || state.discountPromoCodes.length > 0);
      elDePromoCodesWrap.classList.toggle('hidden', !shouldShowCodes);
    }

    if (elDePromoGenerateBtn) {
      elDePromoGenerateBtn.disabled = !isUnique || !hasSavedDiscount;
    }

    if (elDePromoGenerateHint) {
      if (!isUnique) {
        elDePromoGenerateHint.textContent = '';
      } else if (!hasSavedDiscount) {
        elDePromoGenerateHint.textContent = 'Сначала сохраните акцию, затем можно будет сгенерировать коды.';
      } else {
        elDePromoGenerateHint.textContent = 'Можно генерировать дополнительные уникальные коды для этой акции.';
      }
    }

    if (isUnique) {
      renderDiscountPromoCodes();
    }
  }

  function renderDiscountPromoCodes() {
    if (!elDePromoCodesList || !elDePromoCodesWrap) return;
    const uniqueCodes = Array.isArray(state.discountPromoCodes)
      ? state.discountPromoCodes.filter((row) => String(row?.code_mode || '') === 'unique')
      : [];

    if (!uniqueCodes.length) {
      elDePromoCodesWrap.classList.remove('hidden');
      elDePromoCodesList.innerHTML = '<div class="discount-promo-empty">Пока нет сгенерированных кодов.</div>';
      return;
    }

    elDePromoCodesWrap.classList.remove('hidden');
    elDePromoCodesList.innerHTML = uniqueCodes.map((row) => {
      const isActive = Number(row?.is_active || 0) === 1;
      const usageLimit = row?.usage_limit == null ? 'без лимита' : `лимит ${row.usage_limit}`;
      const createdAt = row?.created_at ? new Date(row.created_at).toLocaleString('ru') : '—';
      return `
        <div class="discount-promo-row">
          <div class="discount-promo-main">
            <div class="discount-promo-code">${escapeHtml(row.code || '')}</div>
            <div class="discount-promo-meta">Использовано ${Number(row.usage_count || 0)} • ${usageLimit} • ${createdAt}</div>
          </div>
          <div class="discount-promo-actions">
            <span class="discount-promo-status ${isActive ? '' : 'is-inactive'}">${isActive ? 'Активен' : 'Выключен'}</span>
            <button type="button" class="btn btn-sm" data-promo-toggle-id="${Number(row.id || 0)}">
              ${isActive ? 'Выключить' : 'Включить'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateDiscountPromoUi() {
    renderDiscountMechanicUi();
    const codeMode = elDePromoCodeMode?.value || 'shared';
    const isPromo = !!elDePromoEnabled?.checked;
    const isUnique = isPromo && codeMode === 'unique';
    const hasSavedDiscount = Number($('#de_id')?.value || 0) > 0;

    if (elDeActivationMode) {
      elDeActivationMode.value = isPromo ? 'promo_code' : 'auto';
    }
    if (elDePromoSettingsWrap) elDePromoSettingsWrap.classList.toggle('hidden', !isPromo);
    if (elDePromoSharedWrap) elDePromoSharedWrap.classList.toggle('hidden', !isPromo || codeMode !== 'shared');
    if (elDePromoUniqueWrap) elDePromoUniqueWrap.classList.toggle('hidden', !isUnique);

    if (elDePromoCodesWrap) {
      const shouldShowCodes = isUnique && (hasSavedDiscount || state.discountPromoCodes.length > 0);
      elDePromoCodesWrap.classList.toggle('hidden', !shouldShowCodes);
    }

    if (elDePromoGenerateBtn) {
      elDePromoGenerateBtn.disabled = !isUnique || !hasSavedDiscount;
    }

    if (elDePromoGenerateHint) {
      if (!isUnique) {
        elDePromoGenerateHint.textContent = '';
      } else if (!hasSavedDiscount) {
        elDePromoGenerateHint.textContent = 'Сначала сохраните акцию, затем можно будет сгенерировать коды.';
      } else {
        elDePromoGenerateHint.textContent = 'Можно генерировать дополнительные уникальные коды для этой акции.';
      }
    }

    if (isUnique) {
      renderDiscountPromoCodes();
    }
  }

  async function loadDiscountPromoCodes(discountId) {
    if (!(Number(discountId) > 0)) {
      state.discountPromoCodes = [];
      renderDiscountPromoCodes();
      return [];
    }

    const json = await apiJson(`/api/admin/discounts/${discountId}/promo-codes`);
    state.discountPromoCodes = Array.isArray(json.promo_codes) ? json.promo_codes : [];
    renderDiscountPromoCodes();
    return state.discountPromoCodes;
  }

  async function generateDiscountPromoCodes() {
    const discountId = Number($('#de_id')?.value || 0);
    if (!(discountId > 0)) {
      alert('Сначала сохраните акцию');
      return;
    }

    const count = Math.max(1, Math.min(500, Number(elDePromoGenerateCount?.value || 0)));
    if (!(count > 0)) {
      alert('Введите корректное количество кодов');
      return;
    }

    try {
      await apiJson(`/api/admin/discounts/${discountId}/promo-codes/generate`, {
        method: 'POST',
        body: { count },
      });
      await loadDiscountPromoCodes(discountId);
    } catch (err) {
      console.error('generateDiscountPromoCodes error:', err);
      alert('Ошибка генерации промокодов: ' + err.message);
    }
  }

  async function toggleDiscountPromoCode(codeId) {
    const discountId = Number($('#de_id')?.value || 0);
    if (!(discountId > 0) || !(Number(codeId) > 0)) return;

    try {
      await apiJson(`/api/admin/discounts/${discountId}/promo-codes/${codeId}/toggle`, {
        method: 'POST',
      });
      await loadDiscountPromoCodes(discountId);
    } catch (err) {
      console.error('toggleDiscountPromoCode error:', err);
      alert('Ошибка обновления промокода: ' + err.message);
    }
  }

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

      const valueText = formatDiscountValue(discount);
      const applyToText = formatDiscountApplyToText(discount.apply_to);
      const activationText = formatDiscountActivationText(discount.activation_mode);

      row.innerHTML = `
        <div class="discount-row-icon"><i class="fas fa-percentage"></i></div>
        <div class="discount-row-info">
          <div class="discount-row-title">${escapeHtml(discount.title)}</div>
          <div class="discount-row-meta">${applyToText} • ${activationText} • ${discount.usage_count || 0} использований</div>
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

  async function openDiscountEditor(discountId) {
    const isNew = !discountId;
    const tabKey = isNew ? buildTabKey('discount', 'new') : buildTabKey('discount', discountId);

    let existing = tabsState.tabs.find((t) => t.key === tabKey);
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
    state.discountPromoCodes = [];

    if (elDiscountEditorForm) {
      if (isNew) {
        elDiscountEditorForm.reset();
        $('#de_id').value = '';
        $('#de_is_active').checked = true;
        $('#de_is_stackable').checked = false;
        $('#de_priority').value = '0';
        if (elDeActivationMode) elDeActivationMode.value = 'auto';
        if (elDePromoCodeMode) elDePromoCodeMode.value = 'shared';
        if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = '1';
        if (elDePromoGenerateCount) elDePromoGenerateCount.value = '10';
        if (elDePromoSharedCode) elDePromoSharedCode.value = '';
        if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = '';
        state.discountSelectedProducts = [];
        state.discountSelectedCustomers = [];
        renderDiscountProductChips();
        renderDiscountCustomerChips();
        renderDiscountPromoCodes();
        updateDiscountPromoUi();
      } else {
        try {
          const json = await apiJson(`/api/admin/discounts/${discountId}`);
          if (json.discount) {
            state.activeDiscount = json.discount;
            fillDiscountForm(json.discount);
            const promo = getDiscountPromoFromDiscount(json.discount);
            if (promo.enabled && promo.code_mode === 'unique') {
              await loadDiscountPromoCodes(discountId);
            } else {
              state.discountPromoCodes = [];
              renderDiscountPromoCodes();
            }
            updateDiscountPromoUi();
          }
        } catch (e) {
          console.error('openDiscountEditor load error:', e);
          const discount = state.discounts.find((d) => d.id === discountId);
          if (discount) {
            fillDiscountForm(discount);
          }
        }
      }
    }

    if (elDiscountDeleteBtn) {
      elDiscountDeleteBtn.style.display = isNew ? 'none' : '';
    }

    renderTabs();
    updateRightPanel();
  }

  function fillDiscountForm(discount) {
    if (!elDiscountEditorForm) return;

    $('#de_id').value = discount.id || '';
    $('#de_title').value = discount.title || '';
    $('#de_discount_type').value = discount.discount_type || 'percent';
    $('#de_discount_value').value = discount.discount_value || '';
    $('#de_apply_to').value = discount.apply_to || 'order';
    $('#de_min_order_amount').value = discount.min_order_amount || '';
    $('#de_max_discount_amount').value = discount.max_discount_amount || '';

    $('#de_starts_at').value = discount.starts_at ? formatDateTimeLocal(discount.starts_at) : '';
    $('#de_ends_at').value = discount.ends_at ? formatDateTimeLocal(discount.ends_at) : '';

    let scheduleDays = [];
    if (Array.isArray(discount.schedule_days)) {
      scheduleDays = discount.schedule_days;
    } else if (typeof discount.schedule_days === 'string') {
      try {
        scheduleDays = JSON.parse(discount.schedule_days);
      } catch {
        scheduleDays = [];
      }
    }
    $$('#de_schedule_days input[type="checkbox"]').forEach((cb) => {
      cb.checked = scheduleDays.includes(parseInt(cb.value, 10));
    });

    $('#de_schedule_time_start').value = discount.schedule_time_start || '';
    $('#de_schedule_time_end').value = discount.schedule_time_end || '';
    $('#de_usage_limit').value = discount.usage_limit || '';
    $('#de_usage_per_customer').value = discount.usage_per_customer || '';
    $('#de_priority').value = discount.priority || '0';
    $('#de_is_stackable').checked = !!discount.is_stackable;
    $('#de_is_active').checked = discount.is_active !== false && discount.is_active !== 0;

    const promo = getDiscountPromoFromDiscount(discount);
    if (elDeActivationMode) elDeActivationMode.value = promo.activation_mode;
    if (elDePromoCodeMode) elDePromoCodeMode.value = promo.code_mode;
    if (elDePromoSharedCode) elDePromoSharedCode.value = promo.shared_code || '';
    if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = promo.shared_code_usage_limit ?? '';
    if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = promo.unique_code_usage_limit ?? 1;
    if (elDePromoGenerateCount && !elDePromoGenerateCount.value) elDePromoGenerateCount.value = '10';

    if (Array.isArray(discount.products)) {
      state.discountSelectedProducts = discount.products.map((p) => ({
        type: p.entity_type || 'product',
        id: p.entity_id,
        title: p.title || `#${p.entity_id}`,
      }));
    } else {
      state.discountSelectedProducts = [];
    }
    renderDiscountProductChips();

    if (Array.isArray(discount.customers)) {
      state.discountSelectedCustomers = discount.customers.map((c) => ({
        type: c.entity_type || 'customer',
        id: c.entity_id,
        title: c.title || `#${c.entity_id}`,
      }));
    } else {
      state.discountSelectedCustomers = [];
    }
    renderDiscountCustomerChips();

    state.discountPromoCodes = [];
    renderDiscountPromoCodes();
    updateDiscountPromoUi();
  }

  function renderDiscountInfo(discount) {
    if (!discount) return;

    const titleEl = $('#discountInfoTitle');
    const badgeEl = $('#discountInfoBadge');
    const valueEl = $('#discountInfoValue');
    const usageEl = $('#discountInfoUsageCount');
    const applyToEl = $('#discountInfoApplyTo');
    const activationEl = $('#discountInfoActivation');
    const promoModeEl = $('#discountInfoPromoMode');
    const promoModeRowEl = $('#discountInfoPromoModeRow');
    const promoSummaryEl = $('#discountInfoPromoSummary');
    const promoSummaryRowEl = $('#discountInfoPromoSummaryRow');
    const periodEl = $('#discountInfoPeriod');
    const limitEl = $('#discountInfoLimit');

    if (titleEl) titleEl.textContent = discount.title;

    if (badgeEl) {
      badgeEl.textContent = discount.is_active ? 'Активна' : 'Неактивна';
      badgeEl.classList.toggle('inactive', !discount.is_active);
    }

    if (valueEl) {
      valueEl.textContent = formatDiscountValue(discount);
    }

    if (usageEl) usageEl.textContent = discount.usage_count || 0;

    if (applyToEl) {
      const fullApplyToText = {
        order: 'Весь заказ',
        product: 'Товар',
        category: 'Категория',
        combo: 'Комбо',
      }[discount.apply_to] || discount.apply_to;
      applyToEl.textContent = fullApplyToText;
    }

    if (activationEl) {
      activationEl.textContent = formatDiscountActivationText(discount.activation_mode);
    }

    const promo = getDiscountPromoFromDiscount(discount);
    const isPromo = promo.enabled;
    if (promoModeRowEl) promoModeRowEl.classList.toggle('hidden', !isPromo);
    if (promoSummaryRowEl) promoSummaryRowEl.classList.toggle('hidden', !isPromo);
    if (promoModeEl) promoModeEl.textContent = isPromo ? formatDiscountPromoModeText(promo.code_mode) : '—';
    if (promoSummaryEl) promoSummaryEl.textContent = isPromo ? buildDiscountPromoSummary(discount) : '—';

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
      const limitBits = [];
      if (discount.usage_limit) {
        limitBits.push(`${discount.usage_count || 0} / ${discount.usage_limit}`);
      } else {
        limitBits.push('без общего лимита');
      }
      if (discount.usage_per_customer) {
        limitBits.push(`${discount.usage_per_customer} на клиента`);
      }
      limitEl.textContent = limitBits.join(' • ');
    }

    const productsEl = $('#discountInfoProducts');
    const productsSectionEl = $('#discountInfoProductsSection');
    if (productsEl) {
      const products = discount.products || [];
      if (products.length > 0) {
        if (productsSectionEl) productsSectionEl.classList.remove('hidden');
        productsEl.innerHTML = products.map((p) => {
          const cls = p.entity_type === 'category' ? 'is-category' : (p.entity_type === 'combo' ? 'is-combo' : '');
          return `<span class="discount-chip ${cls}">${escapeHtml(p.title || `#${p.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (productsSectionEl) productsSectionEl.classList.add('hidden');
        productsEl.innerHTML = '';
      }
    }

    const customersEl = $('#discountInfoCustomers');
    const customersSectionEl = $('#discountInfoCustomersSection');
    if (customersEl) {
      const customers = discount.customers || [];
      if (customersSectionEl) customersSectionEl.classList.remove('hidden');
      if (customers.length > 0) {
        customersEl.innerHTML = customers.map((c) => {
          const cls = c.entity_type === 'category' ? 'is-category' : '';
          return `<span class="discount-chip ${cls}">${escapeHtml(c.title || `#${c.entity_id}`)}</span>`;
        }).join('');
      } else {
        customersEl.innerHTML = '<span class="discount-chip">Все клиенты</span>';
      }
    }

    loadDiscountOrders(discount.id);
  }

  async function saveDiscount() {
    if (!elDiscountEditorForm) return;

    const id = $('#de_id').value;
    const isNew = !id || id === 'new';
    const scheduleDays = [];
    $$('#de_schedule_days input[type="checkbox"]:checked').forEach((cb) => {
      scheduleDays.push(parseInt(cb.value, 10));
    });

    const activationMode = elDeActivationMode?.value || 'auto';
    const promoCodeMode = elDePromoCodeMode?.value || 'shared';
    const promoEnabled = activationMode === 'promo_code';
    const sharedCode = normalizePromoCodeInputValue(elDePromoSharedCode?.value);
    const sharedCodeUsageLimit = parseInt(elDePromoSharedUsageLimit?.value, 10) || null;
    const uniqueCodeUsageLimit = Math.max(1, parseInt(elDePromoUniqueUsageLimit?.value, 10) || 1);

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
      activation_mode: activationMode,
      reward_type: 'discount',
      promo: {
        enabled: promoEnabled,
        code_mode: promoCodeMode,
        shared_code: sharedCode,
        shared_code_usage_limit: sharedCodeUsageLimit,
        unique_code_usage_limit: uniqueCodeUsageLimit,
      },
      products: state.discountSelectedProducts.map((p) => ({
        entity_type: p.type,
        entity_id: p.id,
      })),
      customers: state.discountSelectedCustomers.map((c) => ({
        entity_type: c.type,
        entity_id: c.id,
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
    if (promoEnabled && promoCodeMode === 'shared' && !sharedCode) {
      alert('Введите промокод');
      return;
    }

    try {
      const response = isNew
        ? await apiJson('/api/admin/discounts', { method: 'POST', body: data })
        : await apiJson(`/api/admin/discounts/${id}`, { method: 'PUT', body: data });

      await loadDiscounts();

      if (isNew && promoEnabled && promoCodeMode === 'unique' && Number(response?.id || 0) > 0) {
        const createdId = Number(response.id);
        await closeTab(buildTabKey('discount', 'new'));
        state.activeDiscountId = createdId;
        renderDiscountFilters();
        renderDiscountsList();
        await openDiscountEditor(createdId);
        return;
      }

      closeActiveTab();
      state.editingDiscountId = null;
      updateRightPanel();
    } catch (err) {
      console.error('saveDiscount error:', err);
      alert(formatDiscountSaveErrorMessage(err));
    }
  }

  // -----------------------------
  function getDiscountListIcon(discount) {
    const mechanicType = normalizeDiscountMechanicType(discount?.mechanic_type);
    if (mechanicType === 'buy_x_get_y') return 'fa-gift';
    if (mechanicType === 'threshold') return 'fa-layer-group';
    return 'fa-percentage';
  }

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

      const promo = getDiscountPromoFromDiscount(discount);
      const mechanicText = formatDiscountMechanicText(discount);
      const promoText = promo.enabled ? (promo.code_mode === 'unique' ? 'Уникальные коды' : 'Промокод') : 'Авто';

      row.innerHTML = `
        <div class="discount-row-icon"><i class="fas ${getDiscountListIcon(discount)}"></i></div>
        <div class="discount-row-info">
          <div class="discount-row-title">${escapeHtml(discount.title)}</div>
          <div class="discount-row-meta">${mechanicText} • ${promoText} • ${discount.usage_count || 0} использований</div>
        </div>
        <div class="discount-row-value">${formatDiscountValue(discount)}</div>
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

  async function openDiscountEditor(discountId) {
    const isNew = !discountId;
    const tabKey = isNew ? buildTabKey('discount', 'new') : buildTabKey('discount', discountId);

    let existing = tabsState.tabs.find((t) => t.key === tabKey);
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
    state.discountPromoCodes = [];

    if (elDiscountEditorForm) {
      if (isNew) {
        elDiscountEditorForm.reset();
        $('#de_id').value = '';
        $('#de_is_active').checked = true;
        $('#de_is_stackable').checked = false;
        $('#de_priority').value = '0';
        if (elDeMechanicType) elDeMechanicType.value = 'simple_discount';
        if (elDeDiscountType) elDeDiscountType.value = 'percent';
        if (elDePromoEnabled) elDePromoEnabled.checked = false;
        if (elDeActivationMode) elDeActivationMode.value = 'auto';
        if (elDePromoCodeMode) elDePromoCodeMode.value = 'shared';
        if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = '1';
        if (elDePromoGenerateCount) elDePromoGenerateCount.value = '10';
        if (elDePromoSharedCode) elDePromoSharedCode.value = '';
        if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = '';
        if (elDeBuyQty) elDeBuyQty.value = '5';
        if (elDeRewardQty) elDeRewardQty.value = '1';
        if (elDeBuyQualifyingMode) elDeBuyQualifyingMode.value = 'same_sku';
        if (elDeBuyRepeatMode) elDeBuyRepeatMode.value = 'single';
        if (elDeBuyRewardSource) elDeBuyRewardSource.value = 'same_pool';
        if (elDeBuyRewardKind) elDeBuyRewardKind.value = 'gift';
        if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = 'percent';
        if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = '';
        if (elDeThresholdBasis) elDeThresholdBasis.value = 'before_discounts';
        if (elDeThresholdApplyMode) elDeThresholdApplyMode.value = 'best_only';
        state.discountSelectedProducts = [];
        state.discountSelectedCustomers = [];
        state.discountBuyConditionProducts = [];
        state.discountBuyRewardProducts = [];
        state.discountThresholdTiers = [buildEmptyThresholdTier()];
        renderDiscountProductChips();
        renderDiscountCustomerChips();
        renderDiscountBuyConditionChips();
        renderDiscountBuyRewardChips();
        renderThresholdTiers();
        renderDiscountPromoCodes();
        updateDiscountPromoUi();
      } else {
        try {
          const json = await apiJson(`/api/admin/discounts/${discountId}`);
          if (json.discount) {
            state.activeDiscount = json.discount;
            fillDiscountForm(json.discount);
            const promo = getDiscountPromoFromDiscount(json.discount);
            if (promo.enabled && promo.code_mode === 'unique') {
              await loadDiscountPromoCodes(discountId);
            } else {
              state.discountPromoCodes = [];
              renderDiscountPromoCodes();
            }
            updateDiscountPromoUi();
          }
        } catch (e) {
          console.error('openDiscountEditor load error:', e);
          const discount = state.discounts.find((d) => d.id === discountId);
          if (discount) {
            fillDiscountForm(discount);
          }
        }
      }
    }

    if (elDiscountDeleteBtn) {
      elDiscountDeleteBtn.style.display = isNew ? 'none' : '';
    }

    renderTabs();
    updateRightPanel();
  }

  function fillDiscountForm(discount) {
    if (!elDiscountEditorForm) return;

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    $('#de_id').value = discount.id || '';
    $('#de_title').value = discount.title || '';
    if (elDeDescription) elDeDescription.value = discount.description || '';
    if (elDeMechanicType) elDeMechanicType.value = mechanic.type;
    $('#de_discount_type').value = mechanic.discount_type || discount.discount_type || 'percent';
    $('#de_discount_value').value = mechanic.discount_value ?? discount.discount_value ?? '';
    $('#de_apply_to').value = mechanic.apply_to || discount.apply_to || 'order';
    $('#de_min_order_amount').value = discount.min_order_amount || '';
    $('#de_max_discount_amount').value = discount.max_discount_amount || '';
    $('#de_starts_at').value = discount.starts_at ? formatDateTimeLocal(discount.starts_at) : '';
    $('#de_ends_at').value = discount.ends_at ? formatDateTimeLocal(discount.ends_at) : '';

    let scheduleDays = [];
    if (Array.isArray(discount.schedule_days)) {
      scheduleDays = discount.schedule_days;
    } else if (typeof discount.schedule_days === 'string') {
      try {
        scheduleDays = JSON.parse(discount.schedule_days);
      } catch {
        scheduleDays = [];
      }
    }
    $$('#de_schedule_days input[type="checkbox"]').forEach((cb) => {
      cb.checked = scheduleDays.includes(parseInt(cb.value, 10));
    });

    $('#de_schedule_time_start').value = discount.schedule_time_start || '';
    $('#de_schedule_time_end').value = discount.schedule_time_end || '';
    $('#de_usage_limit').value = discount.usage_limit || '';
    $('#de_usage_per_customer').value = discount.usage_per_customer || '';
    $('#de_priority').value = discount.priority || '0';
    $('#de_is_stackable').checked = !!discount.is_stackable;
    $('#de_is_active').checked = discount.is_active !== false && discount.is_active !== 0;

    if (elDePromoEnabled) elDePromoEnabled.checked = promo.enabled;
    if (elDeActivationMode) elDeActivationMode.value = promo.activation_mode;
    if (elDePromoCodeMode) elDePromoCodeMode.value = promo.code_mode;
    if (elDePromoSharedCode) elDePromoSharedCode.value = promo.shared_code || '';
    if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = promo.shared_code_usage_limit ?? '';
    if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = promo.unique_code_usage_limit ?? 1;
    if (elDePromoGenerateCount && !elDePromoGenerateCount.value) elDePromoGenerateCount.value = '10';

    if (Array.isArray(discount.products)) {
      state.discountSelectedProducts = discount.products.map((p) => ({
        type: p.entity_type || 'product',
        id: p.entity_id,
        title: p.title || `#${p.entity_id}`,
      }));
    } else {
      state.discountSelectedProducts = [];
    }
    renderDiscountProductChips();

    state.discountBuyConditionProducts = cloneDiscountEntities(mechanic.qualifying_items || []);
    state.discountBuyRewardProducts = cloneDiscountEntities(mechanic.reward_products || []);
    state.discountThresholdTiers = Array.isArray(mechanic.tiers) && mechanic.tiers.length
      ? mechanic.tiers.map((tier) => buildEmptyThresholdTier(tier))
      : [buildEmptyThresholdTier()];
    renderDiscountBuyConditionChips();
    renderDiscountBuyRewardChips();
    renderThresholdTiers();

    if (elDeBuyQty) elDeBuyQty.value = mechanic.buy_qty ?? 5;
    if (elDeRewardQty) elDeRewardQty.value = mechanic.reward_qty ?? 1;
    if (elDeBuyQualifyingMode) elDeBuyQualifyingMode.value = mechanic.qualifying_mode || 'same_sku';
    if (elDeBuyRepeatMode) elDeBuyRepeatMode.value = mechanic.repeat_mode || 'single';
    if (elDeBuyRewardSource) elDeBuyRewardSource.value = mechanic.reward_source || 'same_pool';
    if (elDeBuyRewardKind) elDeBuyRewardKind.value = mechanic.reward_kind || 'gift';
    if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = mechanic.reward_discount?.discount_type || 'percent';
    if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = mechanic.reward_discount?.discount_value ?? '';
    if (elDeThresholdBasis) elDeThresholdBasis.value = mechanic.threshold_basis || 'before_discounts';
    if (elDeThresholdApplyMode) elDeThresholdApplyMode.value = mechanic.threshold_apply_mode || 'best_only';

    if (Array.isArray(discount.customers)) {
      state.discountSelectedCustomers = discount.customers.map((c) => ({
        type: c.entity_type || 'customer',
        id: c.entity_id,
        title: c.title || `#${c.entity_id}`,
      }));
    } else {
      state.discountSelectedCustomers = [];
    }
    renderDiscountCustomerChips();

    state.discountPromoCodes = [];
    renderDiscountPromoCodes();
    updateDiscountPromoUi();
  }

  function renderDiscountInfo(discount) {
    if (!discount) return;

    const titleEl = $('#discountInfoTitle');
    const badgeEl = $('#discountInfoBadge');
    const valueEl = $('#discountInfoValue');
    const valueLabelEl = $('#discountInfoValueLabel');
    const usageEl = $('#discountInfoUsageCount');
    const mechanicEl = $('#discountInfoMechanic');
    const applyToEl = $('#discountInfoApplyTo');
    const applyToRowEl = $('#discountInfoApplyToRow');
    const promoModeEl = $('#discountInfoPromoMode');
    const promoModeRowEl = $('#discountInfoPromoModeRow');
    const promoSummaryEl = $('#discountInfoPromoSummary');
    const promoSummaryRowEl = $('#discountInfoPromoSummaryRow');
    const periodEl = $('#discountInfoPeriod');
    const limitEl = $('#discountInfoLimit');

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    if (titleEl) titleEl.textContent = discount.title;
    if (badgeEl) {
      badgeEl.textContent = discount.is_active ? 'Активна' : 'Неактивна';
      badgeEl.classList.toggle('inactive', !discount.is_active);
    }
    if (valueEl) valueEl.textContent = formatDiscountValue(discount);
    if (valueLabelEl) {
      valueLabelEl.textContent = mechanic.type === 'buy_x_get_y'
        ? 'Формула акции'
        : mechanic.type === 'threshold'
          ? 'Ступени'
          : 'Размер скидки';
    }
    if (usageEl) usageEl.textContent = discount.usage_count || 0;
    if (mechanicEl) mechanicEl.textContent = formatDiscountMechanicText(discount);
    if (applyToRowEl) applyToRowEl.classList.toggle('hidden', mechanic.type !== 'simple_discount');
    if (applyToEl) applyToEl.textContent = formatDiscountApplyToText(discount.apply_to);
    if (promoModeRowEl) promoModeRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoSummaryRowEl) promoSummaryRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoModeEl) promoModeEl.textContent = promo.enabled ? formatDiscountPromoModeText(promo.code_mode) : '—';
    if (promoSummaryEl) promoSummaryEl.textContent = promo.enabled ? buildDiscountPromoSummary(discount) : '—';

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

    const productsEl = $('#discountInfoProducts');
    const productsSectionEl = $('#discountInfoProductsSection');
    if (productsEl) {
      const products = mechanic.type === 'simple_discount' ? (discount.products || []) : [];
      if (products.length > 0) {
        if (productsSectionEl) productsSectionEl.classList.remove('hidden');
        productsEl.innerHTML = products.map((p) => {
          const cls = p.entity_type === 'category' ? 'is-category' : (p.entity_type === 'combo' ? 'is-combo' : '');
          return `<span class="discount-chip ${cls}">${escapeHtml(p.title || `#${p.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (productsSectionEl) productsSectionEl.classList.add('hidden');
        productsEl.innerHTML = '';
      }
    }

    const customersEl = $('#discountInfoCustomers');
    const customersSectionEl = $('#discountInfoCustomersSection');
    if (customersEl) {
      const customers = discount.customers || [];
      if (customers.length > 0) {
        if (customersSectionEl) customersSectionEl.classList.remove('hidden');
        customersEl.innerHTML = customers.map((c) => {
          const cls = c.entity_type === 'category' ? 'is-category' : '';
          return `<span class="discount-chip ${cls}">${escapeHtml(c.title || `#${c.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (customersSectionEl) customersSectionEl.classList.add('hidden');
        customersEl.innerHTML = '';
      }
    }

    loadDiscountOrders(discount.id);
  }

  async function saveDiscount() {
    if (!elDiscountEditorForm) return;

    const id = $('#de_id').value;
    const isNew = !id || id === 'new';
    const scheduleDays = [];
    $$('#de_schedule_days input[type="checkbox"]:checked').forEach((cb) => {
      scheduleDays.push(parseInt(cb.value, 10));
    });

    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    const promoEnabled = !!elDePromoEnabled?.checked;
    const promoCodeMode = elDePromoCodeMode?.value || 'shared';
    const sharedCode = normalizePromoCodeInputValue(elDePromoSharedCode?.value);
    const sharedCodeUsageLimit = parseInt(elDePromoSharedUsageLimit?.value, 10) || null;
    const uniqueCodeUsageLimit = Math.max(1, parseInt(elDePromoUniqueUsageLimit?.value, 10) || 1);

    const data = {
      title: $('#de_title').value.trim(),
      description: elDeDescription?.value.trim() || null,
      mechanic_type: mechanicType,
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
      promo: {
        enabled: promoEnabled,
        code_mode: promoCodeMode,
        shared_code: sharedCode,
        shared_code_usage_limit: sharedCodeUsageLimit,
        unique_code_usage_limit: uniqueCodeUsageLimit,
      },
      customers: state.discountSelectedCustomers.map((c) => ({
        entity_type: c.type,
        entity_id: c.id,
      })),
      products: [],
      mechanic: {},
    };

    if (!data.title) {
      alert('Введите название скидки');
      return;
    }

    if (mechanicType === 'simple_discount') {
      data.discount_type = $('#de_discount_type').value;
      data.discount_value = parseFloat($('#de_discount_value').value) || 0;
      data.apply_to = $('#de_apply_to').value;
      data.products = state.discountSelectedProducts.map((p) => ({
        entity_type: p.type,
        entity_id: p.id,
      }));
      data.mechanic = {
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        apply_to: data.apply_to,
      };
      if (!(data.discount_value > 0)) {
        alert('Введите корректное значение скидки');
        return;
      }
    } else if (mechanicType === 'buy_x_get_y') {
      const buyQty = Math.max(1, parseInt(elDeBuyQty?.value, 10) || 0);
      const rewardQty = Math.max(1, parseInt(elDeRewardQty?.value, 10) || 0);
      const qualifyingMode = elDeBuyQualifyingMode?.value || 'same_sku';
      const rewardSource = elDeBuyRewardSource?.value || 'same_pool';
      const rewardKind = elDeBuyRewardKind?.value || 'gift';
      const rewardDiscountValue = parseFloat(elDeBuyRewardDiscountValue?.value) || 0;

      if (qualifyingMode === 'pool' && !state.discountBuyConditionProducts.length) {
        alert('Добавьте товары для условия акции');
        return;
      }
      if (rewardSource === 'reward_list' && !state.discountBuyRewardProducts.length) {
        alert('Добавьте товары-награды');
        return;
      }
      if (rewardKind === 'product_discount' && !(rewardDiscountValue > 0)) {
        alert('Введите корректную скидку для товара-награды');
        return;
      }

      data.mechanic = {
        buy_qty: buyQty,
        reward_qty: rewardQty,
        qualifying_mode: qualifyingMode,
        repeat_mode: elDeBuyRepeatMode?.value || 'single',
        reward_source: rewardSource,
        reward_kind: rewardKind,
        qualifying_items: state.discountBuyConditionProducts.map((p) => ({
          entity_type: p.type,
          entity_id: p.id,
        })),
        reward_products: state.discountBuyRewardProducts.map((p) => ({
          entity_type: p.type,
          entity_id: p.id,
        })),
        reward_discount: {
          discount_type: elDeBuyRewardDiscountType?.value || 'percent',
          discount_value: rewardDiscountValue || null,
        },
      };
    } else {
      const tiers = (state.discountThresholdTiers || []).map((tier) => ({
        id: tier.id,
        min_amount: parseFloat(tier.min_amount) || 0,
        reward_kind: tier.reward_kind || 'gift',
        reward_products: (tier.reward_kind || 'gift') === 'order_discount'
          ? []
          : cloneDiscountEntities(tier.reward_products || []).map((item) => ({
              entity_type: item.type,
              entity_id: item.id,
            })),
        reward_discount: {
          discount_type: tier.reward_discount?.discount_type || 'percent',
          discount_value: (tier.reward_kind || 'gift') === 'gift'
            ? null
            : (parseFloat(tier.reward_discount?.discount_value) || null),
        },
      }));

      if (!tiers.length || tiers.some((tier) => !(tier.min_amount > 0))) {
        alert('Добавьте корректные ступени для пороговой акции');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'gift' || tier.reward_kind === 'product_discount') && !tier.reward_products.length)) {
        alert('У каждой товарной ступени должны быть товары-награды');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'product_discount' || tier.reward_kind === 'order_discount') && !(Number(tier.reward_discount.discount_value) > 0))) {
        alert('Укажите значение скидки для скидочных ступеней');
        return;
      }

      data.mechanic = {
        threshold_basis: elDeThresholdBasis?.value || 'before_discounts',
        threshold_apply_mode: elDeThresholdApplyMode?.value || 'best_only',
        tiers,
      };
    }

    if (promoEnabled && promoCodeMode === 'shared' && !sharedCode) {
      alert('Введите промокод');
      return;
    }

    try {
      const response = isNew
        ? await apiJson('/api/admin/discounts', { method: 'POST', body: data })
        : await apiJson(`/api/admin/discounts/${id}`, { method: 'PUT', body: data });

      await loadDiscounts();

      if (isNew && promoEnabled && promoCodeMode === 'unique' && Number(response?.id || 0) > 0) {
        const createdId = Number(response.id);
        await closeTab(buildTabKey('discount', 'new'));
        state.activeDiscountId = createdId;
        renderDiscountFilters();
        renderDiscountsList();
        await openDiscountEditor(createdId);
        return;
      }

      closeActiveTab();
      state.editingDiscountId = null;
      updateRightPanel();
    } catch (err) {
      console.error('saveDiscount error:', err);
      alert('Ошибка сохранения: ' + err.message);
    }
  }

  function normalizeSimpleVariant(value) {
    return ['promo_code', 'percent', 'fixed', 'special_price'].includes(String(value || '').trim())
      ? String(value || '').trim()
      : 'percent';
  }

  function normalizePromoRewardType(value) {
    return ['discount', 'product'].includes(String(value || '').trim())
      ? String(value || '').trim()
      : 'discount';
  }

  function normalizePromoProductRewardType(value) {
    return ['gift', 'product_discount'].includes(String(value || '').trim())
      ? String(value || '').trim()
      : 'gift';
  }

  function normalizePromoDiscountType(value) {
    return ['fixed', 'special_price'].includes(String(value || '').trim())
      ? 'fixed'
      : 'percent';
  }

  function normalizePromoApplyTo(value) {
    const raw = String(value || '').trim();
    return ['product', 'category'].includes(raw) ? raw : 'order';
  }

  function syncDiscountChoiceGroups() {
    syncDiscountChoiceGroup('de_mechanic_type');
    syncDiscountChoiceGroup('de_simple_variant');
    syncDiscountChoiceGroup('de_promo_code_mode');
    syncDiscountChoiceGroup('de_promo_reward_type');
    syncDiscountChoiceGroup('de_promo_product_reward_type');
    syncDiscountChoiceGroup('de_promo_discount_type');
    syncDiscountChoiceGroup('de_promo_apply_to');
  }

  function getDiscountMechanic(discount) {
    const mechanicType = normalizeDiscountMechanicType(discount?.mechanic_type);
    const mechanic = discount?.mechanic && typeof discount.mechanic === 'object' ? discount.mechanic : {};

    if (mechanicType === 'buy_x_get_y') {
      return {
        type: 'buy_x_get_y',
        buy_qty: Number(mechanic.buy_qty || 5),
        reward_qty: Number(mechanic.reward_qty || 1),
        qualifying_mode: mechanic.qualifying_mode === 'pool' ? 'pool' : 'same_sku',
        repeat_mode: mechanic.repeat_mode === 'repeat' ? 'repeat' : 'single',
        reward_source: mechanic.reward_source === 'reward_list' ? 'reward_list' : 'same_pool',
        reward_kind: mechanic.reward_kind === 'product_discount' ? 'product_discount' : 'gift',
        qualifying_items: cloneDiscountEntities(mechanic.qualifying_items || []),
        reward_products: cloneDiscountEntities(mechanic.reward_products || []),
        reward_discount: {
          discount_type: mechanic.reward_discount?.discount_type || 'percent',
          discount_value: mechanic.reward_discount?.discount_value ?? '',
        },
      };
    }

    if (mechanicType === 'threshold') {
      return {
        type: 'threshold',
        threshold_basis: mechanic.threshold_basis === 'after_discounts' ? 'after_discounts' : 'before_discounts',
        threshold_apply_mode: mechanic.threshold_apply_mode === 'cumulative' ? 'cumulative' : 'best_only',
        tiers: Array.isArray(mechanic.tiers) && mechanic.tiers.length
          ? mechanic.tiers.map((tier) => buildEmptyThresholdTier(tier))
          : [buildEmptyThresholdTier()],
      };
    }

    const simpleVariant = normalizeSimpleVariant(
      mechanic.simple_variant || (String(discount?.activation_mode || '') === 'promo_code' ? 'promo_code' : (discount?.discount_type || mechanic.discount_type))
    );
    const promoReward = mechanic.promo_reward && typeof mechanic.promo_reward === 'object'
      ? mechanic.promo_reward
      : {};
    const promoRewardType = normalizePromoRewardType(
      promoReward.reward_type || (
        ['gift', 'product_discount'].includes(String(promoReward.reward_kind || '').trim())
          ? 'product'
          : 'discount'
      )
    );
    const promoProductRewardType = normalizePromoProductRewardType(
      promoReward.product_reward_type || promoReward.reward_kind
    );
    const promoDiscountType = normalizePromoDiscountType(
      promoReward.discount_type || discount?.discount_type || 'percent'
    );
    const promoDiscountValue = promoRewardType === 'product' && promoProductRewardType === 'gift'
      ? ''
      : (promoReward.discount_value ?? discount?.discount_value ?? '');
    const promoApplyTo = promoRewardType === 'discount'
      ? normalizePromoApplyTo(promoReward.apply_to || discount?.apply_to || 'order')
      : 'product';

    return {
      type: 'simple_discount',
      simple_variant: simpleVariant,
      discount_type: simpleVariant === 'promo_code'
        ? promoDiscountType
        : (discount?.discount_type || mechanic.discount_type || simpleVariant),
      discount_value: simpleVariant === 'promo_code'
        ? promoDiscountValue
        : (discount?.discount_value ?? mechanic.discount_value ?? ''),
      apply_to: simpleVariant === 'promo_code'
        ? promoApplyTo
        : (discount?.apply_to || mechanic.apply_to || 'order'),
      promo_reward: {
        reward_type: promoRewardType,
        product_reward_type: promoProductRewardType,
        reward_kind: promoRewardType === 'product' ? promoProductRewardType : 'discount',
        discount_type: promoDiscountType,
        discount_value: promoDiscountValue,
        apply_to: promoApplyTo,
      },
    };
  }

  function formatDiscountSimpleVariantText(discount) {
    const mechanic = getDiscountMechanic(discount);
    if (mechanic.type !== 'simple_discount') return '';
    if (mechanic.simple_variant === 'promo_code') return 'Промокод';
    if (mechanic.discount_type === 'fixed') return 'Фикс. сумма';
    if (mechanic.discount_type === 'special_price') return 'Спеццена';
    return 'Процент';
  }

  function getDiscountPromoFromDiscount(discount) {
    const promo = discount?.promo && typeof discount.promo === 'object' ? discount.promo : {};
    const mechanic = getDiscountMechanic(discount);
    const enabled = mechanic.type === 'simple_discount' && mechanic.simple_variant === 'promo_code';
    const codeMode = promo.code_mode || discount?.promo_code_mode || 'shared';
    return {
      enabled,
      activation_mode: enabled ? 'promo_code' : 'auto',
      code_mode: codeMode === 'unique' ? 'unique' : 'shared',
      shared_code: promo.shared_code || '',
      shared_code_usage_limit: promo.shared_code_usage_limit ?? null,
      unique_code_usage_limit: promo.unique_code_usage_limit ?? discount?.unique_code_usage_limit ?? 1,
      unique_codes_count: Number(promo.unique_codes_count || 0),
      unique_codes_active_count: Number(promo.unique_codes_active_count || 0),
      unique_codes_used_count: Number(promo.unique_codes_used_count || 0),
    };
  }

  function buildDiscountPromoSummary(discount) {
    const promo = getDiscountPromoFromDiscount(discount);
    if (!promo.enabled) return 'Не используется';
    if (promo.code_mode === 'shared') {
      const code = promo.shared_code || '—';
      const limit = promo.shared_code_usage_limit ? `, лимит ${promo.shared_code_usage_limit}` : '';
      return `${code}${limit}`;
    }
    return `${promo.unique_codes_count} кодов, активных ${promo.unique_codes_active_count}, использовано ${promo.unique_codes_used_count}`;
  }

  function formatDiscountMechanicText(discount) {
    const mechanic = getDiscountMechanic(discount);
    if (mechanic.type === 'buy_x_get_y') return '5+1';
    if (mechanic.type === 'threshold') return 'Пороговая';
    return 'Скидка';
  }

  function formatDiscountValue(discount) {
    if (!discount) return '—';
    const mechanic = getDiscountMechanic(discount);
    if (mechanic.type === 'buy_x_get_y') {
      return `${mechanic.buy_qty}+${mechanic.reward_qty}`;
    }
    if (mechanic.type === 'threshold') {
      return `${Array.isArray(mechanic.tiers) ? mechanic.tiers.length : 0} ступ.`;
    }
    if (mechanic.simple_variant === 'promo_code') {
      const promoReward = mechanic.promo_reward || {};
      if (promoReward.reward_type === 'product') {
        if (promoReward.product_reward_type === 'gift') return 'Подарок';
        if (promoReward.discount_type === 'fixed') return `Товар -${promoReward.discount_value}₽`;
        return `Товар -${promoReward.discount_value}%`;
      }
    }
    if (mechanic.discount_type === 'percent') return `${mechanic.discount_value}%`;
    if (mechanic.discount_type === 'fixed') return `-${mechanic.discount_value}₽`;
    return `${mechanic.discount_value}₽`;
  }

  function getDiscountAudienceSummary(discount) {
    const customers = Array.isArray(discount?.customers) ? discount.customers : [];
    if (!customers.length) return 'Все клиенты';

    const customerCount = customers.filter((item) => item.entity_type === 'customer').length;
    const categoryCount = customers.filter((item) => item.entity_type === 'category').length;
    const parts = [];

    if (customerCount) parts.push(`клиенты ${customerCount}`);
    if (categoryCount) parts.push(`категории ${categoryCount}`);

    return parts.length ? parts.join(', ') : `${customers.length} сегмента`;
  }

  function getDiscountLimitSummary(discount) {
    const usageCount = Number(discount?.usage_count || 0);
    const usageLimit = Number(discount?.usage_limit || 0);
    return usageLimit > 0 ? `лимит ${usageCount}/${usageLimit}` : `${usageCount} использований`;
  }

  function formatDiscountSaveErrorMessage(err) {
    const code = String(err?.message || '').trim();
    if (code === 'TITLE_REQUIRED') return 'Введите название акции.';
    if (code === 'INVALID_CUSTOMERS') return 'Проверьте выбранных клиентов и клиентские категории.';
    if (code === 'INVALID_PRODUCTS') return 'Проверьте выбранные товары, категории или комбо.';
    if (code === 'INVALID_DATE_RANGE') return 'Дата окончания не может быть раньше даты начала.';
    if (code === 'PRODUCTS_REQUIRED') return 'Добавьте товары, категории или комбо для выбранной механики.';
    if (code === 'PRODUCTS_NOT_ALLOWED') return 'Для этой механики список товаров заполнять не нужно.';
    if (code === 'PROMO_NOT_AVAILABLE') return 'Промокод доступен только для простой скидки с механикой "Промокод".';
    if (code === 'PROMO_CODE_REQUIRED') return 'Введите общий промокод.';
    if (code === 'PROMO_CODE_TAKEN') return 'Такой промокод уже существует.';
    if (code === 'PROMO_REWARD_PRODUCTS_REQUIRED') return 'Добавьте товары для награды по промокоду.';
    if (code === 'INVALID_DISCOUNT_VALUE') return 'Укажите корректное значение скидки.';
    if (code === 'INVALID_MECHANIC_CONFIG') return 'Проверьте настройки механики акции.';
    if (code === 'QUALIFYING_ITEMS_REQUIRED') return 'Добавьте товары для условия акции 5+1.';
    if (code === 'REWARD_PRODUCTS_REQUIRED') return 'Добавьте товары-награды.';
    if (code === 'INVALID_REWARD_DISCOUNT') return 'Проверьте размер скидки для награды.';
    if (code === 'THRESHOLD_TIERS_REQUIRED') return 'Добавьте хотя бы одну ступень пороговой акции.';
    if (code === 'INVALID_THRESHOLD_TIER') return 'Заполните все обязательные поля в ступенях пороговой акции.';
    return code ? `Ошибка сохранения: ${code}` : 'Не удалось сохранить акцию.';
  }

  function resetDiscountSelectedProducts() {
    state.discountSelectedProducts = [];
    renderDiscountProductChips();
  }

  function resetDiscountPromoCodesState() {
    state.discountPromoCodes = [];
    renderDiscountPromoCodes();
  }

  function resetDiscountPromoFields() {
    if (elDePromoCodeMode) elDePromoCodeMode.value = 'shared';
    if (elDePromoSharedCode) elDePromoSharedCode.value = '';
    if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = '';
    if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = '1';
    if (elDePromoGenerateCount) elDePromoGenerateCount.value = '10';
    if (elDePromoRewardType) elDePromoRewardType.value = 'discount';
    if (elDePromoProductRewardType) elDePromoProductRewardType.value = 'gift';
    if (elDePromoDiscountType) elDePromoDiscountType.value = 'percent';
    if (elDePromoDiscountValue) elDePromoDiscountValue.value = '';
    if (elDePromoProductDiscountType) elDePromoProductDiscountType.value = 'percent';
    if (elDePromoProductDiscountValue) elDePromoProductDiscountValue.value = '';
    if (elDePromoApplyTo) elDePromoApplyTo.value = 'order';
    resetDiscountPromoCodesState();
  }

  function resetDiscountSimpleFields() {
    if (elDeDiscountType) elDeDiscountType.value = 'percent';
    if ($('#de_discount_value')) $('#de_discount_value').value = '';
    if ($('#de_apply_to')) $('#de_apply_to').value = 'order';
    resetDiscountSelectedProducts();
  }

  function resetDiscountBuyMechanicFields() {
    if (elDeBuyQty) elDeBuyQty.value = '5';
    if (elDeRewardQty) elDeRewardQty.value = '1';
    if (elDeBuyQualifyingMode) elDeBuyQualifyingMode.value = 'same_sku';
    if (elDeBuyRepeatMode) elDeBuyRepeatMode.value = 'single';
    if (elDeBuyRewardSource) elDeBuyRewardSource.value = 'same_pool';
    if (elDeBuyRewardKind) elDeBuyRewardKind.value = 'gift';
    if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = 'percent';
    if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = '';
    state.discountBuyConditionProducts = [];
    state.discountBuyRewardProducts = [];
    renderDiscountBuyConditionChips();
    renderDiscountBuyRewardChips();
  }

  function resetDiscountThresholdFields() {
    if (elDeThresholdBasis) elDeThresholdBasis.value = 'before_discounts';
    if (elDeThresholdApplyMode) elDeThresholdApplyMode.value = 'best_only';
    state.discountThresholdTiers = [buildEmptyThresholdTier()];
    renderThresholdTiers();
  }

  function handleDiscountMechanicTypeChange() {
    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    if (mechanicType !== 'simple_discount') {
      resetDiscountSimpleFields();
      resetDiscountPromoFields();
    }
    if (mechanicType !== 'buy_x_get_y') {
      resetDiscountBuyMechanicFields();
    }
    if (mechanicType !== 'threshold') {
      resetDiscountThresholdFields();
    }
    updateDiscountPromoUi();
  }

  function handleDiscountSimpleVariantChange() {
    const simpleVariant = normalizeSimpleVariant(elDeSimpleVariant?.value || 'percent');
    if (simpleVariant === 'promo_code') {
      resetDiscountSimpleFields();
      resetDiscountPromoFields();
    } else {
      resetDiscountPromoFields();
      if (elDeDiscountType) {
        elDeDiscountType.value = simpleVariant === 'fixed'
          ? 'fixed'
          : (simpleVariant === 'special_price' ? 'special_price' : 'percent');
      }
      if ($('#de_discount_value')) $('#de_discount_value').value = '';
    }
    updateDiscountPromoUi();
  }

  function handleDiscountApplyToChange() {
    resetDiscountSelectedProducts();
    updateDiscountPromoUi();
  }

  function handleDiscountPromoRewardTypeChange() {
    const rewardType = normalizePromoRewardType(elDePromoRewardType?.value || 'discount');
    resetDiscountSelectedProducts();
    if (rewardType === 'product') {
      if (elDePromoApplyTo) elDePromoApplyTo.value = 'product';
      if (elDePromoDiscountValue) elDePromoDiscountValue.value = '';
    } else {
      if (elDePromoProductRewardType) elDePromoProductRewardType.value = 'gift';
      if (elDePromoProductDiscountType) elDePromoProductDiscountType.value = 'percent';
      if (elDePromoProductDiscountValue) elDePromoProductDiscountValue.value = '';
    }
    updateDiscountPromoUi();
  }

  function handleDiscountPromoApplyToChange() {
    resetDiscountSelectedProducts();
    updateDiscountPromoUi();
  }

  async function handleDiscountPromoCodeModeChange() {
    const codeMode = elDePromoCodeMode?.value || 'shared';
    if (codeMode === 'shared') {
      if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = '1';
      resetDiscountPromoCodesState();
    } else {
      if (elDePromoSharedCode) elDePromoSharedCode.value = '';
      if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = '';
    }

    updateDiscountPromoUi();

    const discountId = Number($('#de_id')?.value || 0);
    if (codeMode === 'unique' && discountId > 0) {
      try {
        await loadDiscountPromoCodes(discountId);
      } catch (err) {
        console.error('promo mode switch load error:', err);
      }
    }
  }

  function handleDiscountPromoProductRewardTypeChange() {
    const rewardType = normalizePromoProductRewardType(elDePromoProductRewardType?.value || 'gift');
    if (rewardType === 'gift') {
      if (elDePromoProductDiscountType) elDePromoProductDiscountType.value = 'percent';
      if (elDePromoProductDiscountValue) elDePromoProductDiscountValue.value = '';
    }
    resetDiscountSelectedProducts();
    updateDiscountPromoUi();
  }

  function handleDiscountBuyQualifyingModeChange() {
    if ((elDeBuyQualifyingMode?.value || 'same_sku') === 'same_sku') {
      state.discountBuyConditionProducts = [];
      renderDiscountBuyConditionChips();
    }
    updateDiscountPromoUi();
  }

  function handleDiscountBuyRewardSourceChange() {
    if ((elDeBuyRewardSource?.value || 'same_pool') === 'same_pool') {
      state.discountBuyRewardProducts = [];
      renderDiscountBuyRewardChips();
    }
    updateDiscountPromoUi();
  }

  function handleDiscountBuyRewardKindChange() {
    if ((elDeBuyRewardKind?.value || 'gift') === 'gift') {
      if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = 'percent';
      if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = '';
    }
    updateDiscountPromoUi();
  }

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

      const promo = getDiscountPromoFromDiscount(discount);
      const mechanicText = formatDiscountMechanicText(discount);
      const metaBits = [mechanicText];
      if (promo.enabled) {
        metaBits.push(promo.code_mode === 'unique' ? 'Промокод: уникальные коды' : 'Промокод: общий код');
      } else if (getDiscountMechanic(discount).type === 'simple_discount') {
        metaBits.push(formatDiscountSimpleVariantText(discount));
      }
      metaBits.push(getDiscountAudienceSummary(discount));
      metaBits.push(getDiscountLimitSummary(discount));

      row.innerHTML = `
        <div class="discount-row-icon"><i class="fas ${getDiscountListIcon(discount)}"></i></div>
        <div class="discount-row-info">
          <div class="discount-row-title">${escapeHtml(discount.title)}</div>
          <div class="discount-row-meta">${metaBits.join(' • ')}</div>
        </div>
        <div class="discount-row-value">${formatDiscountValue(discount)}</div>
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

  function renderDiscountProductChips() {
    const html = state.discountSelectedProducts.length === 0
      ? '<span class="discount-chips-empty">Не выбрано</span>'
      : state.discountSelectedProducts.map((item) => {
          const cls = item.type === 'category' ? 'is-category' : (item.type === 'combo' ? 'is-combo' : '');
          return `
            <span class="discount-chip ${cls}" data-type="${item.type}" data-id="${item.id}">
              <span class="discount-chip-text">${escapeHtml(item.title)}</span>
              <span class="discount-chip-remove"><i class="fas fa-times"></i></span>
            </span>
          `;
        }).join('');
    [elDeProductsChips, elDePromoProductsChips].forEach((target) => {
      if (target) target.innerHTML = html;
    });
  }

  function renderDiscountMechanicUi() {
    syncDiscountChoiceGroups();
    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    const simpleVariant = normalizeSimpleVariant(elDeSimpleVariant?.value || 'percent');
    const isSimple = mechanicType === 'simple_discount';
    const isPromoSimple = isSimple && simpleVariant === 'promo_code';
    const isBuyXGetY = mechanicType === 'buy_x_get_y';
    const isThreshold = mechanicType === 'threshold';
    const applyTo = $('#de_apply_to')?.value || 'order';
    const qualifyingMode = elDeBuyQualifyingMode?.value || 'same_sku';
    const rewardSource = elDeBuyRewardSource?.value || 'same_pool';
    const rewardKind = elDeBuyRewardKind?.value || 'gift';
    const showSimpleProducts = isSimple && !isPromoSimple && applyTo !== 'order';

    if (elDeSimpleWrap) elDeSimpleWrap.classList.toggle('hidden', !isSimple);
    if (elDeSimpleRegularWrap) elDeSimpleRegularWrap.classList.toggle('hidden', !isSimple || isPromoSimple);
    if (elDeProductsWrap) elDeProductsWrap.classList.toggle('hidden', !showSimpleProducts);
    if (elDePromoWrap) elDePromoWrap.classList.toggle('hidden', !isPromoSimple);
    if (elDeBuyXGetYWrap) elDeBuyXGetYWrap.classList.toggle('hidden', !isBuyXGetY);
    if (elDeThresholdWrap) elDeThresholdWrap.classList.toggle('hidden', !isThreshold);
    if (elDeBuyConditionProductsWrap) elDeBuyConditionProductsWrap.classList.toggle('hidden', !isBuyXGetY || qualifyingMode !== 'pool');
    if (elDeBuyRewardProductsWrap) elDeBuyRewardProductsWrap.classList.toggle('hidden', !isBuyXGetY || rewardSource !== 'reward_list');
    if (elDeBuyRewardDiscountWrap) elDeBuyRewardDiscountWrap.classList.toggle('hidden', !isBuyXGetY || rewardKind !== 'product_discount');

    if (elDeDiscountType && isSimple && !isPromoSimple) {
      elDeDiscountType.value = simpleVariant;
    }
    if (isThreshold) renderThresholdTiers();
  }

  function updateDiscountPromoUi() {
    renderDiscountMechanicUi();
    const simpleVariant = normalizeSimpleVariant(elDeSimpleVariant?.value || 'percent');
    const isPromo = (elDeMechanicType?.value || 'simple_discount') === 'simple_discount' && simpleVariant === 'promo_code';
    const codeMode = elDePromoCodeMode?.value || 'shared';
    const isUnique = isPromo && codeMode === 'unique';
    const promoRewardType = normalizePromoRewardType(elDePromoRewardType?.value || 'discount');
    const promoProductRewardType = normalizePromoProductRewardType(elDePromoProductRewardType?.value || 'gift');
    const showPromoDiscountVariant = isPromo && promoRewardType === 'discount';
    const showPromoProductVariant = isPromo && promoRewardType === 'product';
    const showPromoDiscountRow = isPromo && promoRewardType === 'discount';
    const showPromoProductDiscountRow = isPromo && promoRewardType === 'product' && promoProductRewardType === 'product_discount';
    const promoApplyTo = normalizePromoApplyTo(elDePromoApplyTo?.value || 'order');
    const showPromoProducts = isPromo && (
      promoRewardType === 'product' || (promoRewardType === 'discount' && promoApplyTo !== 'order')
    );
    const hasSavedDiscount = Number($('#de_id')?.value || 0) > 0;

    if (elDePromoWrap) {
      elDePromoWrap.classList.toggle('is-promo-shared', isPromo && codeMode === 'shared');
      elDePromoWrap.classList.toggle('is-promo-unique', isPromo && codeMode === 'unique');
    }
    if (elDePromoSharedWrap) elDePromoSharedWrap.classList.toggle('hidden', !isPromo || codeMode !== 'shared');
    if (elDePromoUniqueWrap) elDePromoUniqueWrap.classList.toggle('hidden', !isUnique);
    if (elDePromoRewardVariantDiscountWrap) elDePromoRewardVariantDiscountWrap.classList.toggle('hidden', !showPromoDiscountVariant);
    if (elDePromoRewardVariantProductWrap) elDePromoRewardVariantProductWrap.classList.toggle('hidden', !showPromoProductVariant);
    if (elDePromoDiscountRow) elDePromoDiscountRow.classList.toggle('hidden', !showPromoDiscountRow);
    if (elDePromoDiscountValueWrap) elDePromoDiscountValueWrap.classList.toggle('hidden', !showPromoDiscountRow);
    if (elDePromoProductDiscountRow) elDePromoProductDiscountRow.classList.toggle('hidden', !showPromoProductDiscountRow);
    if (elDePromoProductsWrap) elDePromoProductsWrap.classList.toggle('hidden', !showPromoProducts);

    if (elDePromoCodesWrap) {
      const shouldShowCodes = isUnique && (hasSavedDiscount || state.discountPromoCodes.length > 0);
      elDePromoCodesWrap.classList.toggle('hidden', !shouldShowCodes);
    }

    if (elDePromoGenerateBtn) {
      elDePromoGenerateBtn.disabled = !isUnique || !hasSavedDiscount;
    }

    if (elDePromoGenerateHint) {
      if (!isUnique) {
        elDePromoGenerateHint.textContent = '';
      } else if (!hasSavedDiscount) {
        elDePromoGenerateHint.textContent = 'Сначала сохраните акцию, затем можно будет сгенерировать коды.';
      } else {
        elDePromoGenerateHint.textContent = 'Можно генерировать дополнительные уникальные коды для этой акции.';
      }
    }

    if (isUnique) {
      renderDiscountPromoCodes();
    }

    syncDiscountEditorCustomSelects(elDiscountEditorForm);
  }

  async function openDiscountEditor(discountId) {
    const isNew = !discountId;
    const tabKey = isNew ? buildTabKey('discount', 'new') : buildTabKey('discount', discountId);

    let existing = tabsState.tabs.find((t) => t.key === tabKey);
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
    state.discountPromoCodes = [];

    if (elDiscountEditorForm) {
      if (isNew) {
        elDiscountEditorForm.reset();
        $('#de_id').value = '';
        $('#de_title').value = '';
        if (elDeDescription) elDeDescription.value = '';
        if (elDeMechanicType) elDeMechanicType.value = 'simple_discount';
        if (elDeSimpleVariant) elDeSimpleVariant.value = 'percent';
        $('#de_is_active').checked = true;
        $('#de_is_stackable').checked = false;
        $('#de_priority').value = '0';
        state.discountSelectedCustomers = [];
        resetDiscountSimpleFields();
        renderDiscountCustomerChips();
        resetDiscountPromoFields();
        resetDiscountBuyMechanicFields();
        resetDiscountThresholdFields();
        updateDiscountPromoUi();
      } else {
        try {
          const json = await apiJson(`/api/admin/discounts/${discountId}`);
          if (json.discount) {
            state.activeDiscount = json.discount;
            fillDiscountForm(json.discount);
            const promo = getDiscountPromoFromDiscount(json.discount);
            if (promo.enabled && promo.code_mode === 'unique') {
              await loadDiscountPromoCodes(discountId);
            } else {
              state.discountPromoCodes = [];
              renderDiscountPromoCodes();
            }
            updateDiscountPromoUi();
          }
        } catch (e) {
          console.error('openDiscountEditor load error:', e);
          const discount = state.discounts.find((d) => d.id === discountId);
          if (discount) {
            fillDiscountForm(discount);
          }
        }
      }
    }

    if (elDiscountDeleteBtn) {
      elDiscountDeleteBtn.style.display = isNew ? 'none' : '';
    }

    renderTabs();
    updateRightPanel();
  }

  function fillDiscountForm(discount) {
    if (!elDiscountEditorForm) return;

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    $('#de_id').value = discount.id || '';
    $('#de_title').value = discount.title || '';
    if (elDeMechanicType) elDeMechanicType.value = mechanic.type;
    if (elDeSimpleVariant) elDeSimpleVariant.value = mechanic.type === 'simple_discount' ? mechanic.simple_variant : 'percent';
    $('#de_discount_type').value = mechanic.simple_variant === 'promo_code'
      ? (mechanic.promo_reward?.discount_type || discount.discount_type || 'percent')
      : (mechanic.discount_type || discount.discount_type || 'percent');
    $('#de_discount_value').value = mechanic.simple_variant === 'promo_code' ? '' : (mechanic.discount_value ?? discount.discount_value ?? '');
    $('#de_apply_to').value = mechanic.simple_variant === 'promo_code' ? 'order' : (mechanic.apply_to || discount.apply_to || 'order');
    if (elDePromoRewardType) elDePromoRewardType.value = mechanic.promo_reward?.reward_type || 'discount';
    if (elDePromoProductRewardType) elDePromoProductRewardType.value = mechanic.promo_reward?.product_reward_type || 'gift';
    if (elDePromoDiscountType) elDePromoDiscountType.value = normalizePromoDiscountType(mechanic.promo_reward?.discount_type || discount.discount_type || 'percent');
    if (elDePromoDiscountValue) elDePromoDiscountValue.value = mechanic.promo_reward?.discount_value ?? '';
    if (elDePromoProductDiscountType) elDePromoProductDiscountType.value = normalizePromoDiscountType(mechanic.promo_reward?.discount_type || discount.discount_type || 'percent');
    if (elDePromoProductDiscountValue) elDePromoProductDiscountValue.value = mechanic.promo_reward?.discount_value ?? '';
    if (elDePromoApplyTo) elDePromoApplyTo.value = normalizePromoApplyTo(mechanic.promo_reward?.apply_to || 'order');
    $('#de_min_order_amount').value = discount.min_order_amount || '';
    $('#de_max_discount_amount').value = discount.max_discount_amount || '';
    $('#de_starts_at').value = discount.starts_at ? formatDateTimeLocal(discount.starts_at) : '';
    $('#de_ends_at').value = discount.ends_at ? formatDateTimeLocal(discount.ends_at) : '';

    let scheduleDays = [];
    if (Array.isArray(discount.schedule_days)) {
      scheduleDays = discount.schedule_days;
    } else if (typeof discount.schedule_days === 'string') {
      try {
        scheduleDays = JSON.parse(discount.schedule_days);
      } catch {
        scheduleDays = [];
      }
    }
    $$('#de_schedule_days input[type="checkbox"]').forEach((cb) => {
      cb.checked = scheduleDays.includes(parseInt(cb.value, 10));
    });

    $('#de_schedule_time_start').value = discount.schedule_time_start || '';
    $('#de_schedule_time_end').value = discount.schedule_time_end || '';
    $('#de_usage_limit').value = discount.usage_limit || '';
    $('#de_usage_per_customer').value = discount.usage_per_customer || '';
    $('#de_priority').value = discount.priority || '0';
    $('#de_is_stackable').checked = !!discount.is_stackable;
    $('#de_is_active').checked = discount.is_active !== false && discount.is_active !== 0;

    if (elDePromoCodeMode) elDePromoCodeMode.value = promo.code_mode;
    if (elDePromoSharedCode) elDePromoSharedCode.value = promo.shared_code || '';
    if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = promo.shared_code_usage_limit ?? '';
    if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = promo.unique_code_usage_limit ?? 1;
    if (elDePromoGenerateCount && !elDePromoGenerateCount.value) elDePromoGenerateCount.value = '10';

    if (Array.isArray(discount.products)) {
      state.discountSelectedProducts = discount.products.map((p) => ({
        type: p.entity_type || 'product',
        id: p.entity_id,
        title: p.title || `#${p.entity_id}`,
      }));
    } else {
      state.discountSelectedProducts = [];
    }
    renderDiscountProductChips();

    state.discountBuyConditionProducts = cloneDiscountEntities(mechanic.qualifying_items || []);
    state.discountBuyRewardProducts = cloneDiscountEntities(mechanic.reward_products || []);
    state.discountThresholdTiers = Array.isArray(mechanic.tiers) && mechanic.tiers.length
      ? mechanic.tiers.map((tier) => buildEmptyThresholdTier(tier))
      : [buildEmptyThresholdTier()];
    renderDiscountBuyConditionChips();
    renderDiscountBuyRewardChips();
    renderThresholdTiers();

    if (elDeBuyQty) elDeBuyQty.value = mechanic.buy_qty ?? 5;
    if (elDeRewardQty) elDeRewardQty.value = mechanic.reward_qty ?? 1;
    if (elDeBuyQualifyingMode) elDeBuyQualifyingMode.value = mechanic.qualifying_mode || 'same_sku';
    if (elDeBuyRepeatMode) elDeBuyRepeatMode.value = mechanic.repeat_mode || 'single';
    if (elDeBuyRewardSource) elDeBuyRewardSource.value = mechanic.reward_source || 'same_pool';
    if (elDeBuyRewardKind) elDeBuyRewardKind.value = mechanic.reward_kind || 'gift';
    if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = mechanic.reward_discount?.discount_type || 'percent';
    if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = mechanic.reward_discount?.discount_value ?? '';
    if (elDeThresholdBasis) elDeThresholdBasis.value = mechanic.threshold_basis || 'before_discounts';
    if (elDeThresholdApplyMode) elDeThresholdApplyMode.value = mechanic.threshold_apply_mode || 'best_only';

    if (Array.isArray(discount.customers)) {
      state.discountSelectedCustomers = discount.customers.map((c) => ({
        type: c.entity_type || 'customer',
        id: c.entity_id,
        title: c.title || `#${c.entity_id}`,
      }));
    } else {
      state.discountSelectedCustomers = [];
    }
    renderDiscountCustomerChips();

    state.discountPromoCodes = [];
    renderDiscountPromoCodes();
    updateDiscountPromoUi();
  }

  function renderDiscountInfo(discount) {
    if (!discount) return;

    const titleEl = $('#discountInfoTitle');
    const badgeEl = $('#discountInfoBadge');
    const valueEl = $('#discountInfoValue');
    const valueLabelEl = $('#discountInfoValueLabel');
    const usageEl = $('#discountInfoUsageCount');
    const mechanicEl = $('#discountInfoMechanic');
    const applyToEl = $('#discountInfoApplyTo');
    const applyToRowEl = $('#discountInfoApplyToRow');
    const promoModeEl = $('#discountInfoPromoMode');
    const promoModeRowEl = $('#discountInfoPromoModeRow');
    const promoSummaryEl = $('#discountInfoPromoSummary');
    const promoSummaryRowEl = $('#discountInfoPromoSummaryRow');
    const periodEl = $('#discountInfoPeriod');
    const limitEl = $('#discountInfoLimit');

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    if (titleEl) titleEl.textContent = discount.title;
    if (badgeEl) {
      badgeEl.textContent = discount.is_active ? 'Активна' : 'Неактивна';
      badgeEl.classList.toggle('inactive', !discount.is_active);
    }
    if (valueEl) valueEl.textContent = formatDiscountValue(discount);
    if (valueLabelEl) {
      valueLabelEl.textContent = mechanic.type === 'buy_x_get_y'
        ? 'Формула акции'
        : mechanic.type === 'threshold'
          ? 'Ступени'
          : promo.enabled
            ? 'Награда по коду'
            : 'Размер скидки';
    }
    if (usageEl) usageEl.textContent = discount.usage_count || 0;
    if (mechanicEl) {
      mechanicEl.textContent = mechanic.type === 'simple_discount'
        ? `${formatDiscountMechanicText(discount)} • ${formatDiscountSimpleVariantText(discount)}`
        : formatDiscountMechanicText(discount);
    }
    if (applyToRowEl) applyToRowEl.classList.toggle('hidden', mechanic.type !== 'simple_discount');
    if (applyToEl) applyToEl.textContent = formatDiscountApplyToText(mechanic.apply_to);
    if (promoModeRowEl) promoModeRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoSummaryRowEl) promoSummaryRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoModeEl) promoModeEl.textContent = promo.enabled ? formatDiscountPromoModeText(promo.code_mode) : '—';
    if (promoSummaryEl) promoSummaryEl.textContent = promo.enabled ? buildDiscountPromoSummary(discount) : '—';

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

    const productsEl = $('#discountInfoProducts');
    const productsSectionEl = $('#discountInfoProductsSection');
    if (productsEl) {
      const products = mechanic.type === 'simple_discount' ? (discount.products || []) : [];
      if (products.length > 0) {
        if (productsSectionEl) productsSectionEl.classList.remove('hidden');
        productsEl.innerHTML = products.map((p) => {
          const cls = p.entity_type === 'category' ? 'is-category' : (p.entity_type === 'combo' ? 'is-combo' : '');
          return `<span class="discount-chip ${cls}">${escapeHtml(p.title || `#${p.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (productsSectionEl) productsSectionEl.classList.add('hidden');
        productsEl.innerHTML = '';
      }
    }

    const customersEl = $('#discountInfoCustomers');
    const customersSectionEl = $('#discountInfoCustomersSection');
    if (customersEl) {
      const customers = discount.customers || [];
      if (customers.length > 0) {
        if (customersSectionEl) customersSectionEl.classList.remove('hidden');
        customersEl.innerHTML = customers.map((c) => {
          const cls = c.entity_type === 'category' ? 'is-category' : '';
          return `<span class="discount-chip ${cls}">${escapeHtml(c.title || `#${c.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (customersSectionEl) customersSectionEl.classList.add('hidden');
        customersEl.innerHTML = '';
      }
    }

    loadDiscountOrders(discount.id);
  }

  async function saveDiscount() {
    if (!elDiscountEditorForm) return;

    const id = $('#de_id').value;
    const isNew = !id || id === 'new';
    const scheduleDays = [];
    $$('#de_schedule_days input[type="checkbox"]:checked').forEach((cb) => {
      scheduleDays.push(parseInt(cb.value, 10));
    });

    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    const simpleVariant = normalizeSimpleVariant(elDeSimpleVariant?.value || 'percent');
    const promoEnabled = mechanicType === 'simple_discount' && simpleVariant === 'promo_code';
    const promoCodeMode = promoEnabled ? (elDePromoCodeMode?.value || 'shared') : null;
    const sharedCode = promoEnabled ? normalizePromoCodeInputValue(elDePromoSharedCode?.value) : '';
    const sharedCodeUsageLimit = promoEnabled ? (parseInt(elDePromoSharedUsageLimit?.value, 10) || null) : null;
    const uniqueCodeUsageLimit = promoEnabled ? Math.max(1, parseInt(elDePromoUniqueUsageLimit?.value, 10) || 1) : null;

    const data = {
      title: $('#de_title').value.trim(),
      mechanic_type: mechanicType,
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
      promo: promoEnabled
        ? {
            enabled: true,
            code_mode: promoCodeMode,
            shared_code: sharedCode,
            shared_code_usage_limit: sharedCodeUsageLimit,
            unique_code_usage_limit: uniqueCodeUsageLimit,
          }
        : { enabled: false },
      customers: state.discountSelectedCustomers.map((c) => ({
        entity_type: c.type,
        entity_id: c.id,
      })),
      products: [],
      mechanic: {},
    };

    if (!data.title) {
      alert('Введите название скидки');
      return;
    }

    if (mechanicType === 'simple_discount') {
      const selectedProducts = state.discountSelectedProducts.map((p) => ({
        entity_type: p.type,
        entity_id: p.id,
      }));
      if (promoEnabled) {
        const promoRewardType = normalizePromoRewardType(elDePromoRewardType?.value || 'discount');
        const promoProductRewardType = normalizePromoProductRewardType(elDePromoProductRewardType?.value || 'gift');
        const promoDiscountType = normalizePromoDiscountType(elDePromoDiscountType?.value || 'percent');
        const promoDiscountValue = parseFloat(elDePromoDiscountValue?.value) || 0;
        const promoProductDiscountType = normalizePromoDiscountType(elDePromoProductDiscountType?.value || promoDiscountType || 'percent');
        const promoProductDiscountValue = parseFloat(elDePromoProductDiscountValue?.value) || 0;
        const activePromoDiscountType = promoRewardType === 'product' ? promoProductDiscountType : promoDiscountType;
        const activePromoDiscountValue = promoRewardType === 'product' && promoProductRewardType === 'product_discount'
          ? promoProductDiscountValue
          : promoDiscountValue;
        const promoApplyTo = promoRewardType === 'discount'
          ? normalizePromoApplyTo(elDePromoApplyTo?.value || 'order')
          : 'product';

        if (promoCodeMode === 'shared' && !sharedCode) {
          alert('Введите промокод');
          return;
        }
        if (promoRewardType === 'discount' && !(promoDiscountValue > 0)) {
          alert('Введите корректное значение скидки по промокоду');
          return;
        }
        if (promoRewardType === 'discount' && promoApplyTo !== 'order' && !selectedProducts.length) {
          alert('Добавьте товары, категории или комбо для награды по промокоду');
          return;
        }
        if (promoRewardType === 'product' && !selectedProducts.length) {
          alert('Добавьте товары для награды по промокоду');
          return;
        }
        if (promoRewardType === 'product' && promoProductRewardType === 'product_discount' && !(promoProductDiscountValue > 0)) {
          alert('Введите корректное значение скидки для товара по промокоду');
          return;
        }

        data.discount_type = activePromoDiscountType;
        data.discount_value = promoRewardType === 'product' && promoProductRewardType === 'gift' ? 0 : activePromoDiscountValue;
        data.apply_to = promoApplyTo;
        data.products = promoRewardType === 'discount' && promoApplyTo === 'order'
          ? []
          : selectedProducts;
        data.mechanic = {
          simple_variant: 'promo_code',
          promo_reward: {
            reward_type: promoRewardType,
            product_reward_type: promoProductRewardType,
            reward_kind: promoRewardType === 'product' ? promoProductRewardType : 'discount',
            discount_type: activePromoDiscountType,
            discount_value: promoRewardType === 'product' && promoProductRewardType === 'gift' ? null : activePromoDiscountValue,
            apply_to: promoApplyTo,
          },
        };
      } else {
        const discountType = simpleVariant;
        const discountValue = parseFloat($('#de_discount_value').value) || 0;
        const applyTo = $('#de_apply_to').value;

        if (!(discountValue > 0)) {
          alert('Введите корректное значение скидки');
          return;
        }

        if (applyTo !== 'order' && !selectedProducts.length) {
          alert('Добавьте товары, категории или комбо для скидки');
          return;
        }

        data.discount_type = discountType;
        data.discount_value = discountValue;
        data.apply_to = applyTo;
        data.products = applyTo === 'order' ? [] : selectedProducts;
        data.mechanic = {
          simple_variant: discountType,
          discount_type: discountType,
          discount_value: discountValue,
          apply_to: applyTo,
        };
      }
    } else if (mechanicType === 'buy_x_get_y') {
      const buyQty = Math.max(1, parseInt(elDeBuyQty?.value, 10) || 0);
      const rewardQty = Math.max(1, parseInt(elDeRewardQty?.value, 10) || 0);
      const qualifyingMode = elDeBuyQualifyingMode?.value || 'same_sku';
      const rewardSource = elDeBuyRewardSource?.value || 'same_pool';
      const rewardKind = elDeBuyRewardKind?.value || 'gift';
      const rewardDiscountValue = parseFloat(elDeBuyRewardDiscountValue?.value) || 0;

      if (qualifyingMode === 'pool' && !state.discountBuyConditionProducts.length) {
        alert('Добавьте товары для условия акции');
        return;
      }
      if (rewardSource === 'reward_list' && !state.discountBuyRewardProducts.length) {
        alert('Добавьте товары-награды');
        return;
      }
      if (rewardKind === 'product_discount' && !(rewardDiscountValue > 0)) {
        alert('Введите корректную скидку для товара-награды');
        return;
      }

      data.mechanic = {
        buy_qty: buyQty,
        reward_qty: rewardQty,
        qualifying_mode: qualifyingMode,
        repeat_mode: elDeBuyRepeatMode?.value || 'single',
        reward_source: rewardSource,
        reward_kind: rewardKind,
        qualifying_items: state.discountBuyConditionProducts.map((p) => ({
          entity_type: p.type,
          entity_id: p.id,
        })),
        reward_products: state.discountBuyRewardProducts.map((p) => ({
          entity_type: p.type,
          entity_id: p.id,
        })),
        reward_discount: {
          discount_type: elDeBuyRewardDiscountType?.value || 'percent',
          discount_value: rewardDiscountValue || null,
        },
      };
    } else {
      const tiers = (state.discountThresholdTiers || []).map((tier) => ({
        id: tier.id,
        min_amount: parseFloat(tier.min_amount) || 0,
        reward_kind: tier.reward_kind || 'gift',
        reward_products: cloneDiscountEntities(tier.reward_products || []).map((item) => ({
          entity_type: item.type,
          entity_id: item.id,
        })),
        reward_discount: {
          discount_type: tier.reward_discount?.discount_type || 'percent',
          discount_value: parseFloat(tier.reward_discount?.discount_value) || null,
        },
      }));

      if (!tiers.length || tiers.some((tier) => !(tier.min_amount > 0))) {
        alert('Добавьте корректные ступени для пороговой акции');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'gift' || tier.reward_kind === 'product_discount') && !tier.reward_products.length)) {
        alert('У каждой товарной ступени должны быть товары-награды');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'product_discount' || tier.reward_kind === 'order_discount') && !(Number(tier.reward_discount.discount_value) > 0))) {
        alert('Укажите значение скидки для скидочных ступеней');
        return;
      }

      data.mechanic = {
        threshold_basis: elDeThresholdBasis?.value || 'before_discounts',
        threshold_apply_mode: elDeThresholdApplyMode?.value || 'best_only',
        tiers,
      };
    }

    try {
      const response = isNew
        ? await apiJson('/api/admin/discounts', { method: 'POST', body: data })
        : await apiJson(`/api/admin/discounts/${id}`, { method: 'PUT', body: data });

      await loadDiscounts();

      if (isNew && promoEnabled && promoCodeMode === 'unique' && Number(response?.id || 0) > 0) {
        const createdId = Number(response.id);
        await closeTab(buildTabKey('discount', 'new'));
        state.activeDiscountId = createdId;
        renderDiscountFilters();
        renderDiscountsList();
        await openDiscountEditor(createdId);
        return;
      }

      closeActiveTab();
      state.editingDiscountId = null;
      updateRightPanel();
    } catch (err) {
      console.error('saveDiscount error:', err);
      alert('Ошибка сохранения: ' + err.message);
    }
  }

  function fillDiscountForm(discount) {
    if (!elDiscountEditorForm) return;

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    $('#de_id').value = discount.id || '';
    $('#de_title').value = discount.title || '';
    if (elDeDescription) elDeDescription.value = discount.description || '';
    if (elDeMechanicType) elDeMechanicType.value = mechanic.type;
    if (elDeSimpleVariant) elDeSimpleVariant.value = mechanic.type === 'simple_discount' ? mechanic.simple_variant : 'percent';
    $('#de_discount_type').value = mechanic.simple_variant === 'promo_code'
      ? (mechanic.promo_reward?.discount_type || discount.discount_type || 'percent')
      : (mechanic.discount_type || discount.discount_type || 'percent');
    $('#de_discount_value').value = mechanic.simple_variant === 'promo_code' ? '' : (mechanic.discount_value ?? discount.discount_value ?? '');
    $('#de_apply_to').value = mechanic.simple_variant === 'promo_code' ? 'order' : (mechanic.apply_to || discount.apply_to || 'order');
    if (elDePromoRewardType) elDePromoRewardType.value = mechanic.promo_reward?.reward_type || 'discount';
    if (elDePromoProductRewardType) elDePromoProductRewardType.value = mechanic.promo_reward?.product_reward_type || 'gift';
    if (elDePromoDiscountType) elDePromoDiscountType.value = normalizePromoDiscountType(mechanic.promo_reward?.discount_type || discount.discount_type || 'percent');
    if (elDePromoDiscountValue) elDePromoDiscountValue.value = mechanic.promo_reward?.discount_value ?? '';
    if (elDePromoProductDiscountType) elDePromoProductDiscountType.value = normalizePromoDiscountType(mechanic.promo_reward?.discount_type || discount.discount_type || 'percent');
    if (elDePromoProductDiscountValue) elDePromoProductDiscountValue.value = mechanic.promo_reward?.discount_value ?? '';
    if (elDePromoApplyTo) elDePromoApplyTo.value = normalizePromoApplyTo(mechanic.promo_reward?.apply_to || 'order');
    $('#de_min_order_amount').value = discount.min_order_amount || '';
    $('#de_max_discount_amount').value = discount.max_discount_amount || '';
    $('#de_starts_at').value = discount.starts_at ? formatDateTimeLocal(discount.starts_at) : '';
    $('#de_ends_at').value = discount.ends_at ? formatDateTimeLocal(discount.ends_at) : '';

    let scheduleDays = [];
    if (Array.isArray(discount.schedule_days)) {
      scheduleDays = discount.schedule_days;
    } else if (typeof discount.schedule_days === 'string') {
      try {
        scheduleDays = JSON.parse(discount.schedule_days);
      } catch {
        scheduleDays = [];
      }
    }
    $$('#de_schedule_days input[type="checkbox"]').forEach((cb) => {
      cb.checked = scheduleDays.includes(parseInt(cb.value, 10));
    });

    $('#de_schedule_time_start').value = discount.schedule_time_start || '';
    $('#de_schedule_time_end').value = discount.schedule_time_end || '';
    $('#de_usage_limit').value = discount.usage_limit || '';
    $('#de_usage_per_customer').value = discount.usage_per_customer || '';
    $('#de_priority').value = discount.priority || '0';
    $('#de_is_stackable').checked = !!discount.is_stackable;
    $('#de_is_active').checked = discount.is_active !== false && discount.is_active !== 0;

    if (elDePromoCodeMode) elDePromoCodeMode.value = promo.code_mode;
    if (elDePromoSharedCode) elDePromoSharedCode.value = promo.shared_code || '';
    if (elDePromoSharedUsageLimit) elDePromoSharedUsageLimit.value = promo.shared_code_usage_limit ?? '';
    if (elDePromoUniqueUsageLimit) elDePromoUniqueUsageLimit.value = promo.unique_code_usage_limit ?? 1;
    if (elDePromoGenerateCount && !elDePromoGenerateCount.value) elDePromoGenerateCount.value = '10';

    state.discountSelectedProducts = Array.isArray(discount.products)
      ? discount.products.map((p) => ({
          type: p.entity_type || 'product',
          id: p.entity_id,
          title: p.title || `#${p.entity_id}`,
        }))
      : [];
    renderDiscountProductChips();

    state.discountBuyConditionProducts = cloneDiscountEntities(mechanic.qualifying_items || []);
    state.discountBuyRewardProducts = cloneDiscountEntities(mechanic.reward_products || []);
    state.discountThresholdTiers = Array.isArray(mechanic.tiers) && mechanic.tiers.length
      ? mechanic.tiers.map((tier) => buildEmptyThresholdTier(tier))
      : [buildEmptyThresholdTier()];
    renderDiscountBuyConditionChips();
    renderDiscountBuyRewardChips();
    renderThresholdTiers();

    if (elDeBuyQty) elDeBuyQty.value = mechanic.buy_qty ?? 5;
    if (elDeRewardQty) elDeRewardQty.value = mechanic.reward_qty ?? 1;
    if (elDeBuyQualifyingMode) elDeBuyQualifyingMode.value = mechanic.qualifying_mode || 'same_sku';
    if (elDeBuyRepeatMode) elDeBuyRepeatMode.value = mechanic.repeat_mode || 'single';
    if (elDeBuyRewardSource) elDeBuyRewardSource.value = mechanic.reward_source || 'same_pool';
    if (elDeBuyRewardKind) elDeBuyRewardKind.value = mechanic.reward_kind || 'gift';
    if (elDeBuyRewardDiscountType) elDeBuyRewardDiscountType.value = mechanic.reward_discount?.discount_type || 'percent';
    if (elDeBuyRewardDiscountValue) elDeBuyRewardDiscountValue.value = mechanic.reward_discount?.discount_value ?? '';
    if (elDeThresholdBasis) elDeThresholdBasis.value = mechanic.threshold_basis || 'before_discounts';
    if (elDeThresholdApplyMode) elDeThresholdApplyMode.value = mechanic.threshold_apply_mode || 'best_only';

    state.discountSelectedCustomers = Array.isArray(discount.customers)
      ? discount.customers.map((c) => ({
          type: c.entity_type || 'customer',
          id: c.entity_id,
          title: c.title || `#${c.entity_id}`,
        }))
      : [];
    renderDiscountCustomerChips();

    state.discountPromoCodes = [];
    renderDiscountPromoCodes();
    updateDiscountPromoUi();
  }

  function renderDiscountInfo(discount) {
    if (!discount) return;

    const titleEl = $('#discountInfoTitle');
    const badgeEl = $('#discountInfoBadge');
    const valueEl = $('#discountInfoValue');
    const valueLabelEl = $('#discountInfoValueLabel');
    const usageEl = $('#discountInfoUsageCount');
    const mechanicEl = $('#discountInfoMechanic');
    const applyToEl = $('#discountInfoApplyTo');
    const applyToRowEl = $('#discountInfoApplyToRow');
    const promoModeEl = $('#discountInfoPromoMode');
    const promoModeRowEl = $('#discountInfoPromoModeRow');
    const promoSummaryEl = $('#discountInfoPromoSummary');
    const promoSummaryRowEl = $('#discountInfoPromoSummaryRow');
    const periodEl = $('#discountInfoPeriod');
    const limitEl = $('#discountInfoLimit');

    const mechanic = getDiscountMechanic(discount);
    const promo = getDiscountPromoFromDiscount(discount);

    if (titleEl) titleEl.textContent = discount.title;
    if (badgeEl) {
      badgeEl.textContent = discount.is_active ? 'Активна' : 'Неактивна';
      badgeEl.classList.toggle('inactive', !discount.is_active);
    }
    if (valueEl) valueEl.textContent = formatDiscountValue(discount);
    if (valueLabelEl) {
      valueLabelEl.textContent = mechanic.type === 'buy_x_get_y'
        ? 'Формула акции'
        : mechanic.type === 'threshold'
          ? 'Ступени'
          : promo.enabled
            ? 'Награда по коду'
            : 'Размер скидки';
    }
    if (usageEl) usageEl.textContent = discount.usage_count || 0;
    if (mechanicEl) {
      mechanicEl.textContent = mechanic.type === 'simple_discount'
        ? `${formatDiscountMechanicText(discount)} • ${formatDiscountSimpleVariantText(discount)}`
        : formatDiscountMechanicText(discount);
    }
    if (applyToRowEl) applyToRowEl.classList.toggle('hidden', mechanic.type !== 'simple_discount');
    if (applyToEl) applyToEl.textContent = formatDiscountApplyToText(mechanic.apply_to);
    if (promoModeRowEl) promoModeRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoSummaryRowEl) promoSummaryRowEl.classList.toggle('hidden', !promo.enabled);
    if (promoModeEl) promoModeEl.textContent = promo.enabled ? formatDiscountPromoModeText(promo.code_mode) : '—';
    if (promoSummaryEl) promoSummaryEl.textContent = promo.enabled ? buildDiscountPromoSummary(discount) : '—';

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
      const limitBits = [];
      if (discount.usage_limit) {
        limitBits.push(`${discount.usage_count || 0} / ${discount.usage_limit}`);
      } else {
        limitBits.push('без общего лимита');
      }
      if (discount.usage_per_customer) {
        limitBits.push(`${discount.usage_per_customer} на клиента`);
      }
      limitEl.textContent = limitBits.join(' • ');
    }

    const productsEl = $('#discountInfoProducts');
    const productsSectionEl = $('#discountInfoProductsSection');
    if (productsEl) {
      const products = mechanic.type === 'simple_discount' ? (discount.products || []) : [];
      if (products.length > 0) {
        if (productsSectionEl) productsSectionEl.classList.remove('hidden');
        productsEl.innerHTML = products.map((p) => {
          const cls = p.entity_type === 'category' ? 'is-category' : (p.entity_type === 'combo' ? 'is-combo' : '');
          return `<span class="discount-chip ${cls}">${escapeHtml(p.title || `#${p.entity_id}`)}</span>`;
        }).join('');
      } else {
        if (productsSectionEl) productsSectionEl.classList.add('hidden');
        productsEl.innerHTML = '';
      }
    }

    const customersEl = $('#discountInfoCustomers');
    const customersSectionEl = $('#discountInfoCustomersSection');
    if (customersEl) {
      const customers = Array.isArray(discount.customers) ? discount.customers : [];
      if (customersSectionEl) customersSectionEl.classList.remove('hidden');
      if (customers.length > 0) {
        customersEl.innerHTML = customers.map((c) => {
          const cls = c.entity_type === 'category' ? 'is-category' : '';
          return `<span class="discount-chip ${cls}">${escapeHtml(c.title || `#${c.entity_id}`)}</span>`;
        }).join('');
      } else {
        customersEl.innerHTML = '<span class="discount-chip">Все клиенты</span>';
      }
    }

    loadDiscountOrders(discount.id);
  }

  async function saveDiscount() {
    if (!elDiscountEditorForm) return;

    const id = $('#de_id').value;
    const isNew = !id || id === 'new';
    const scheduleDays = [];
    $$('#de_schedule_days input[type="checkbox"]:checked').forEach((cb) => {
      scheduleDays.push(parseInt(cb.value, 10));
    });

    const mechanicType = elDeMechanicType?.value || 'simple_discount';
    const simpleVariant = normalizeSimpleVariant(elDeSimpleVariant?.value || 'percent');
    const promoEnabled = mechanicType === 'simple_discount' && simpleVariant === 'promo_code';
    const promoCodeMode = promoEnabled ? (elDePromoCodeMode?.value || 'shared') : null;
    const sharedCode = promoEnabled ? normalizePromoCodeInputValue(elDePromoSharedCode?.value) : '';
    const sharedCodeUsageLimit = promoEnabled && promoCodeMode === 'shared'
      ? (parseInt(elDePromoSharedUsageLimit?.value, 10) || null)
      : null;
    const uniqueCodeUsageLimit = promoEnabled && promoCodeMode === 'unique'
      ? Math.max(1, parseInt(elDePromoUniqueUsageLimit?.value, 10) || 1)
      : null;

    const data = {
      title: $('#de_title').value.trim(),
      description: elDeDescription?.value.trim() || null,
      mechanic_type: mechanicType,
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
      promo: promoEnabled
        ? {
            enabled: true,
            code_mode: promoCodeMode,
            shared_code: sharedCode,
            shared_code_usage_limit: sharedCodeUsageLimit,
            unique_code_usage_limit: uniqueCodeUsageLimit,
          }
        : { enabled: false },
      customers: state.discountSelectedCustomers.map((c) => ({
        entity_type: c.type,
        entity_id: c.id,
      })),
      products: [],
      mechanic: {},
    };

    if (!data.title) {
      alert('Введите название скидки');
      return;
    }

    if (mechanicType === 'simple_discount') {
      const selectedProducts = state.discountSelectedProducts.map((p) => ({
        entity_type: p.type,
        entity_id: p.id,
      }));

      if (promoEnabled) {
        const promoRewardType = normalizePromoRewardType(elDePromoRewardType?.value || 'discount');
        const promoProductRewardType = normalizePromoProductRewardType(elDePromoProductRewardType?.value || 'gift');
        const promoDiscountType = normalizePromoDiscountType(elDePromoDiscountType?.value || 'percent');
        const promoDiscountValue = parseFloat(elDePromoDiscountValue?.value) || 0;
        const promoProductDiscountType = normalizePromoDiscountType(elDePromoProductDiscountType?.value || promoDiscountType || 'percent');
        const promoProductDiscountValue = parseFloat(elDePromoProductDiscountValue?.value) || 0;
        const activePromoDiscountType = promoRewardType === 'product' ? promoProductDiscountType : promoDiscountType;
        const activePromoDiscountValue = promoRewardType === 'product' && promoProductRewardType === 'product_discount'
          ? promoProductDiscountValue
          : promoDiscountValue;
        const promoApplyTo = promoRewardType === 'discount'
          ? normalizePromoApplyTo(elDePromoApplyTo?.value || 'order')
          : 'product';

        if (promoCodeMode === 'shared' && !sharedCode) {
          alert('Введите промокод');
          return;
        }
        if (promoRewardType === 'discount' && !(promoDiscountValue > 0)) {
          alert('Введите корректное значение скидки по промокоду');
          return;
        }
        if (promoRewardType === 'discount' && promoApplyTo !== 'order' && !selectedProducts.length) {
          alert('Добавьте товары, категории или комбо для награды по промокоду');
          return;
        }
        if (promoRewardType === 'product' && !selectedProducts.length) {
          alert('Добавьте товары для награды по промокоду');
          return;
        }
        if (promoRewardType === 'product' && promoProductRewardType === 'product_discount' && !(promoProductDiscountValue > 0)) {
          alert('Введите корректное значение скидки для товара по промокоду');
          return;
        }

        data.discount_type = activePromoDiscountType;
        data.discount_value = promoRewardType === 'product' && promoProductRewardType === 'gift' ? 0 : activePromoDiscountValue;
        data.apply_to = promoApplyTo;
        data.products = promoRewardType === 'discount' && promoApplyTo === 'order' ? [] : selectedProducts;
        data.mechanic = {
          simple_variant: 'promo_code',
          promo_reward: {
            reward_type: promoRewardType,
            product_reward_type: promoProductRewardType,
            reward_kind: promoRewardType === 'product' ? promoProductRewardType : 'discount',
            discount_type: activePromoDiscountType,
            discount_value: promoRewardType === 'product' && promoProductRewardType === 'gift' ? null : activePromoDiscountValue,
            apply_to: promoApplyTo,
          },
        };
      } else {
        const discountType = simpleVariant === 'fixed'
          ? 'fixed'
          : (simpleVariant === 'special_price' ? 'special_price' : 'percent');
        const discountValue = parseFloat($('#de_discount_value').value) || 0;
        const applyTo = $('#de_apply_to').value;

        if (!(discountValue > 0)) {
          alert('Введите корректное значение скидки');
          return;
        }
        if (applyTo !== 'order' && !selectedProducts.length) {
          alert('Добавьте товары, категории или комбо для скидки');
          return;
        }

        data.discount_type = discountType;
        data.discount_value = discountValue;
        data.apply_to = applyTo;
        data.products = applyTo === 'order' ? [] : selectedProducts;
        data.mechanic = {
          simple_variant: discountType,
          discount_type: discountType,
          discount_value: discountValue,
          apply_to: applyTo,
        };
      }
    } else if (mechanicType === 'buy_x_get_y') {
      const buyQty = Math.max(1, parseInt(elDeBuyQty?.value, 10) || 0);
      const rewardQty = Math.max(1, parseInt(elDeRewardQty?.value, 10) || 0);
      const qualifyingMode = elDeBuyQualifyingMode?.value || 'same_sku';
      const rewardSource = elDeBuyRewardSource?.value || 'same_pool';
      const rewardKind = elDeBuyRewardKind?.value || 'gift';
      const rewardDiscountValue = parseFloat(elDeBuyRewardDiscountValue?.value) || 0;

      if (qualifyingMode === 'pool' && !state.discountBuyConditionProducts.length) {
        alert('Добавьте товары для условия акции');
        return;
      }
      if (rewardSource === 'reward_list' && !state.discountBuyRewardProducts.length) {
        alert('Добавьте товары-награды');
        return;
      }
      if (rewardKind === 'product_discount' && !(rewardDiscountValue > 0)) {
        alert('Введите корректную скидку для товара-награды');
        return;
      }

      data.mechanic = {
        buy_qty: buyQty,
        reward_qty: rewardQty,
        qualifying_mode: qualifyingMode,
        repeat_mode: elDeBuyRepeatMode?.value || 'single',
        reward_source: rewardSource,
        reward_kind: rewardKind,
        qualifying_items: qualifyingMode === 'pool'
          ? state.discountBuyConditionProducts.map((p) => ({
              entity_type: p.type,
              entity_id: p.id,
            }))
          : [],
        reward_products: rewardSource === 'reward_list'
          ? state.discountBuyRewardProducts.map((p) => ({
              entity_type: p.type,
              entity_id: p.id,
            }))
          : [],
        reward_discount: {
          discount_type: elDeBuyRewardDiscountType?.value || 'percent',
          discount_value: rewardKind === 'product_discount' ? rewardDiscountValue : null,
        },
      };
    } else {
      const tiers = (state.discountThresholdTiers || []).map((tier) => {
        const rewardKind = tier.reward_kind || 'gift';
        return {
          id: tier.id,
          min_amount: parseFloat(tier.min_amount) || 0,
          reward_kind: rewardKind,
          reward_products: rewardKind === 'order_discount'
            ? []
            : cloneDiscountEntities(tier.reward_products || []).map((item) => ({
                entity_type: item.type,
                entity_id: item.id,
              })),
          reward_discount: {
            discount_type: tier.reward_discount?.discount_type || 'percent',
            discount_value: rewardKind === 'gift'
              ? null
              : (parseFloat(tier.reward_discount?.discount_value) || null),
          },
        };
      });

      if (!tiers.length || tiers.some((tier) => !(tier.min_amount > 0))) {
        alert('Добавьте корректные ступени для пороговой акции');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'gift' || tier.reward_kind === 'product_discount') && !tier.reward_products.length)) {
        alert('У каждой товарной ступени должны быть товары-награды');
        return;
      }
      if (tiers.some((tier) => (tier.reward_kind === 'product_discount' || tier.reward_kind === 'order_discount') && !(Number(tier.reward_discount.discount_value) > 0))) {
        alert('Укажите значение скидки для скидочных ступеней');
        return;
      }

      data.mechanic = {
        threshold_basis: elDeThresholdBasis?.value || 'before_discounts',
        threshold_apply_mode: elDeThresholdApplyMode?.value || 'best_only',
        tiers,
      };
    }

    try {
      const response = isNew
        ? await apiJson('/api/admin/discounts', { method: 'POST', body: data })
        : await apiJson(`/api/admin/discounts/${id}`, { method: 'PUT', body: data });

      await loadDiscounts();

      if (isNew && promoEnabled && promoCodeMode === 'unique' && Number(response?.id || 0) > 0) {
        const createdId = Number(response.id);
        await closeTab(buildTabKey('discount', 'new'));
        state.activeDiscountId = createdId;
        renderDiscountFilters();
        renderDiscountsList();
        await openDiscountEditor(createdId);
        return;
      }

      closeActiveTab();
      state.editingDiscountId = null;
      updateRightPanel();
    } catch (err) {
      console.error('saveDiscount error:', err);
      alert(formatDiscountSaveErrorMessage(err));
    }
  }

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
  function getDiscountProductSelectionForTarget(target) {
    if (target === 'buy_condition') return state.discountBuyConditionProducts;
    if (target === 'buy_reward') return state.discountBuyRewardProducts;
    if (String(target || '').startsWith('threshold:')) {
      const tierId = String(target).split(':')[1] || '';
      const tier = Array.isArray(state.discountThresholdTiers)
        ? state.discountThresholdTiers.find((item) => String(item.id) === tierId)
        : null;
      return tier?.reward_products || [];
    }
    return state.discountSelectedProducts;
  }

  function setDiscountProductSelectionForTarget(target, items) {
    const normalized = cloneDiscountEntities(items);
    if (target === 'buy_condition') {
      state.discountBuyConditionProducts = normalized;
      renderDiscountBuyConditionChips();
      return;
    }
    if (target === 'buy_reward') {
      state.discountBuyRewardProducts = normalized;
      renderDiscountBuyRewardChips();
      return;
    }
    if (String(target || '').startsWith('threshold:')) {
      const tierId = String(target).split(':')[1] || '';
      state.discountThresholdTiers = (state.discountThresholdTiers || []).map((tier) => (
        String(tier.id) === tierId ? { ...tier, reward_products: normalized } : tier
      ));
      renderThresholdTiers();
      return;
    }
    state.discountSelectedProducts = normalized;
    renderDiscountProductChips();
  }

  async function openDiscountProductPicker(target = 'discount_products') {
    state.discountPickerLevel = 'products';
    state.discountPickerTarget = target;
    state.discountPickerQuery = '';
    state.discountPickerCategoryId = null;
    
    // Копируем текущий выбор в Set
    state.discountPickerSelection = new Set(
      getDiscountProductSelectionForTarget(target).map((p) => `${p.type}:${p.id}`)
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
      setDiscountProductSelectionForTarget(state.discountPickerTarget, newSelection);
    } else if (state.discountPickerLevel === 'customers') {
      const newSelection = [];
      state.discountPickerSelection.forEach(key => {
        const [type, idStr] = key.split(':');
        const id = parseInt(idStr, 10);
        let title = '';
        if (type === 'category') {
          const cat = state.customerCategories.find(c => c.id === id);
          title = cat?.title || `Выборка #${id}`;
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
    html += `<button type="button" class="option-picker-tab ${activeId === 'categories' ? 'is-active' : ''}" data-cat-id="categories">Выборки</button>`;
    
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
      elDiscountCustomerPickerList.innerHTML = '<div class="option-picker-empty">Выборки не найдены</div>';
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
    const html = state.discountSelectedProducts.length === 0
      ? '<span class="discount-chips-empty">Не выбрано</span>'
      : state.discountSelectedProducts.map((item) => {
          const cls = item.type === 'category' ? 'is-category' : (item.type === 'combo' ? 'is-combo' : '');
          return `
            <span class="discount-chip ${cls}" data-type="${item.type}" data-id="${item.id}">
              <span class="discount-chip-text">${escapeHtml(item.title)}</span>
              <span class="discount-chip-remove"><i class="fas fa-times"></i></span>
            </span>
          `;
        }).join('');
    [elDeProductsChips, elDePromoProductsChips].forEach((target) => {
      if (target) target.innerHTML = html;
    });
  }

  function renderDiscountEntityChips(targetEl, items) {
    if (!targetEl) return;
    const rows = cloneDiscountEntities(items);
    if (!rows.length) {
      targetEl.innerHTML = '<span class="discount-chips-empty">Не выбрано</span>';
      return;
    }
    targetEl.innerHTML = rows.map((item) => `
      <span class="discount-chip" data-type="${escapeHtml(item.type)}" data-id="${Number(item.id)}">
        <span class="discount-chip-text">${escapeHtml(item.title || `#${item.id}`)}</span>
        <span class="discount-chip-remove"><i class="fas fa-times"></i></span>
      </span>
    `).join('');
  }

  function renderDiscountBuyConditionChips() {
    renderDiscountEntityChips(elDeBuyConditionProductsChips, state.discountBuyConditionProducts);
  }

  function renderDiscountBuyRewardChips() {
    renderDiscountEntityChips(elDeBuyRewardProductsChips, state.discountBuyRewardProducts);
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
      state.customFilters = (Array.isArray(json.data) ? json.data : []).map((filter) => ({
        ...filter,
        server_count: Number(filter?.count || 0),
        count: Number(filter?.count || 0),
      }));
    } catch (e) {
      console.error('Failed to load custom filters:', e);
      state.customFilters = [];
    }
    // Обновляем список фильтров в левой панели
    renderFilters();
    refreshSavedCustomFilterCounts().catch(console.error);
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
        'filter-categories': 'Выборки',
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
      refreshSavedCustomFilterCounts().catch(console.error);
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
      const displayedCount = getDisplayedFilterCount(filter);
      const row = document.createElement('div');
      row.className = 'order-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('data-filter-id', String(filter.id));
      
      // Подсветка если открыт таб этой категории
      const tabKey = buildTabKey('category', filter.id);
      const isTabOpen = tabsState.tabs.some(t => t.key === tabKey);
      if (isTabOpen && tabsState.activeKey === tabKey) row.classList.add('is-active');

      row.innerHTML = `
        <div class="order-icon"><i class="fas ${escapeHtml(filter.icon || 'fa-filter')}"></i></div>
        <div class="order-mid"><strong>${escapeHtml(filter.title)}</strong></div>
        <div class="order-actions"><span class="pill">${displayedCount}</span></div>
      `;

      row.addEventListener('click', () => openFilterEditor(filter));
      elFilterCategoriesList.appendChild(row);
    });
  }

  function openFilterEditor(filter = null) {
    const isNew = filter === null;
    const tabId = isNew ? 'new' : filter.id;
    const tabTitle = isNew ? 'Новая выборка' : (filter.title || 'Выборка');
    
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
    filterDraftCountPreview = isNew ? null : Math.max(0, Number(filter?.count || 0));

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
    renderFilters();
    if (!isNew) {
      scheduleFilterDraftCountPreview(true);
    }
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

  function syncDiscountEditorCustomSelects(container = elDiscountEditorForm) {
    if (!container) return;
    container.querySelectorAll('select.discount-editor-native-select').forEach((nativeSelect) => {
      const options = Array.from(nativeSelect.options || []).map((option) => ({
        value: String(option.value ?? ''),
        label: String(option.textContent || '').trim(),
      }));
      if (!options.length) return;

      let host = nativeSelect.nextElementSibling;
      if (!host || !host.classList.contains('discount-editor-select-host')) {
        host = document.createElement('div');
        host.className = 'discount-editor-select-host';
        nativeSelect.insertAdjacentElement('afterend', host);
      }

      const extraClass = String(nativeSelect.dataset.discountSelectClass || '').trim();
      host.innerHTML = createCustomSelect(
        options,
        String(nativeSelect.value ?? ''),
        `discount-editor-select${extraClass ? ` ${extraClass}` : ''}`
      );
      initCustomSelects(host);

      const wrap = host.querySelector('.custom-select');
      if (!wrap) return;
      wrap.addEventListener('cs-change', (event) => {
        const nextValue = String(event.detail?.value ?? '');
        if (String(nativeSelect.value ?? '') === nextValue) return;
        nativeSelect.value = nextValue;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
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
      wrap.addEventListener('cs-change', (e) => {
        handleFieldChange(e);
        scheduleFilterDraftCountPreview();
      });
    });

    elFilterRulesContainer.querySelectorAll('.rule-operator').forEach(wrap => {
      wrap.addEventListener('cs-change', () => scheduleFilterDraftCountPreview());
    });

    elFilterRulesContainer.querySelectorAll('.rule-value, .rule-value-days').forEach(input => {
      input.addEventListener('input', () => scheduleFilterDraftCountPreview());
    });

    // Удаление правила
    elFilterRulesContainer.querySelectorAll('.rule-remove').forEach(btn => {
      btn.onclick = () => {
        btn.closest('.filter-rule-row')?.remove();
        scheduleFilterDraftCountPreview();
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

  function collectFilterFormData(options = {}) {
    const titleInput = $('#fe_title');
    const logicWrap = $('#fe_logic');
    const isActiveInput = $('#fe_is_active');
    const requireTitle = options?.requireTitle !== false;

    const title = titleInput?.value?.trim();
    if (requireTitle && !title) {
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
      title: title || '',
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
      clearFilterDraftCountPreview();
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
    if (!confirm('Удалить выборку "' + (filter?.title || '') + '"?')) return;

    const tabKey = buildTabKey('category', state.editingFilterId);

    try {
      await apiJson('/api/admin/clients/filters/' + state.editingFilterId, { method: 'DELETE' });
      
      if (state.activeCustomFilterId === state.editingFilterId) {
        state.activeFilter = 'all';
        state.activeCustomFilterId = null;
      }
      
      // Закрываем таб удалённой категории
      await closeTab(tabKey);
      clearFilterDraftCountPreview();
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
    row.style.gridTemplateColumns = '64px minmax(200px, 1fr) 126px';
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
        <button
          class="icon-btn clients-chat-hint-btn"
          type="button"
          aria-label="Написать клиенту"
          title="Написать клиенту"
          tabindex="-1"
        >
          <i class="fas fa-comment-dots" aria-hidden="true"></i>
        </button>
        <div class="pill pill-strong" style="padding:6px 10px;font-size:13px;height:32px;min-width:40px;max-width:80px;box-sizing:border-box;overflow:hidden;text-align:center;">${escapeHtml(Number(c.total_orders || 0))}</div>
      </div>
    `;
    const chatHintBtn = row.querySelector(".clients-chat-hint-btn");
    if (chatHintBtn) {
      chatHintBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCompanyChatBottomsheetForClient(c);
      });
    }
    row.addEventListener("click", () => selectClient(c.id));
    return row;
  }

  function openCompanyChatBottomsheetForClient(client) {
    const clientId = Number(client && client.id || 0);
    if (!Number.isFinite(clientId) || clientId <= 0) return;

    const normalizedName = String(client && client.name || "").trim() || ("Клиент #" + String(clientId));
    const normalizedPhone = String(client && client.phone || "").trim();
    try {
      window.__shopCompanyChatActor = "out";
      window.__shopCompanyChatClientProfile = {
        id: Math.trunc(clientId),
        name: normalizedName,
        phone: normalizedPhone,
      };
    } catch {}

    ensureCompanyChatStylesheetLoaded()
      .catch(() => {})
      .then(() => ensureCompanyChatRuntimeLoaded())
      .catch(() => {})
      .finally(() => {
        const openBtn = document.getElementById("shopCompanyChatOpenBtn");
        if (openBtn) {
          openBtn.click();
          return;
        }
        console.warn("[clients] company chat open button not found");
      });
  }

  let companyChatStylesheetPromise = null;
  let companyChatRuntimePromise = null;
  let companyChatRuntimePreloadStarted = false;
  let companyChatWarmupScheduled = false;
  const COMPANY_CHAT_STYLESHEET_URL = "/static/css/shop.css?v=20260310n";
  const COMPANY_CHAT_RUNTIME_URL = "/static/js/shop-company-chat.js?admin_mode=2&typing_hotfix=14&v=20260317a";
  function ensureCompanyChatStylesheetLoaded() {
    if (companyChatStylesheetPromise) return companyChatStylesheetPromise;
    companyChatStylesheetPromise = new Promise((resolve) => {
      const existing = document.getElementById("shopCompanyChatStylesheet");
      if (existing && String(existing.getAttribute("href") || "") === COMPANY_CHAT_STYLESHEET_URL) {
        resolve();
        return;
      }
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      const link = document.createElement("link");
      link.id = "shopCompanyChatStylesheet";
      link.rel = "stylesheet";
      link.href = COMPANY_CHAT_STYLESHEET_URL;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    return companyChatStylesheetPromise;
  }

  function ensureCompanyChatRuntimeLoaded() {
    if (companyChatRuntimePromise) return companyChatRuntimePromise;
    companyChatRuntimePromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-shop-company-chat-runtime="1"]');
      if (existing && String(existing.getAttribute("src") || "") === COMPANY_CHAT_RUNTIME_URL) {
        resolve();
        return;
      }
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      const script = document.createElement("script");
      script.src = COMPANY_CHAT_RUNTIME_URL;
      script.async = false;
      script.defer = false;
      script.dataset.shopCompanyChatRuntime = "1";
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
    return companyChatRuntimePromise;
  }

  function preloadCompanyChatRuntimeAsset() {
    if (companyChatRuntimePreloadStarted) return;
    companyChatRuntimePreloadStarted = true;
    const existing = document.querySelector('link[data-shop-company-chat-runtime-preload="1"]');
    if (existing && String(existing.getAttribute("href") || "") === COMPANY_CHAT_RUNTIME_URL) return;
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "script";
    link.href = COMPANY_CHAT_RUNTIME_URL;
    link.dataset.shopCompanyChatRuntimePreload = "1";
    document.head.appendChild(link);
  }

  function scheduleCompanyChatWarmup() {
    if (companyChatWarmupScheduled) return;
    companyChatWarmupScheduled = true;
    const warmup = () => {
      ensureCompanyChatStylesheetLoaded().catch(() => {});
      preloadCompanyChatRuntimeAsset();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warmup, { timeout: 1200 });
      return;
    }
    window.setTimeout(warmup, 500);
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
    reconcileClientListOrderMetrics(items);
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
        if (cached.orders.length) {
          updateClientRowMetrics(clientId, computeClientMetricsFromOrders(cached.orders));
        }
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
      updateClientRowMetrics(clientId, computeClientMetricsFromOrders(rows));
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
      title: title || '',
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
      refreshCustomFilterCountsFromClientList();
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
    refreshCustomFilterCountsFromClientList();

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
      scheduleFilterDraftCountPreview();
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
  if (elDeMechanicType) {
    elDeMechanicType.addEventListener('change', handleDiscountMechanicTypeChange);
  }

  if (elDeSimpleVariant) {
    elDeSimpleVariant.addEventListener('change', handleDiscountSimpleVariantChange);
  }

  if ($('#de_apply_to')) {
    $('#de_apply_to').addEventListener('change', handleDiscountApplyToChange);
  }

  if (elDePromoRewardType) {
    elDePromoRewardType.addEventListener('change', handleDiscountPromoRewardTypeChange);
  }

  if (elDePromoProductRewardType) {
    elDePromoProductRewardType.addEventListener('change', handleDiscountPromoProductRewardTypeChange);
  }

  if (elDePromoApplyTo) {
    elDePromoApplyTo.addEventListener('change', handleDiscountPromoApplyToChange);
  }

  if (elDeBuyQualifyingMode) {
    elDeBuyQualifyingMode.addEventListener('change', handleDiscountBuyQualifyingModeChange);
  }

  if (elDeBuyRewardSource) {
    elDeBuyRewardSource.addEventListener('change', handleDiscountBuyRewardSourceChange);
  }

  if (elDeBuyRewardKind) {
    elDeBuyRewardKind.addEventListener('change', handleDiscountBuyRewardKindChange);
  }

  [elDeThresholdBasis, elDeThresholdApplyMode].forEach((node) => {
    if (!node) return;
    node.addEventListener('change', updateDiscountPromoUi);
  });

  if (elDePromoCodeMode) {
    elDePromoCodeMode.addEventListener('change', handleDiscountPromoCodeModeChange);
  }

  if (elDePromoSharedCode) {
    elDePromoSharedCode.addEventListener('blur', () => {
      elDePromoSharedCode.value = normalizePromoCodeInputValue(elDePromoSharedCode.value);
    });
  }

  if (elDePromoGenerateBtn) {
    elDePromoGenerateBtn.addEventListener('click', generateDiscountPromoCodes);
  }

  if (elDePromoCodesList) {
    elDePromoCodesList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-promo-toggle-id]');
      if (!btn) return;
      toggleDiscountPromoCode(Number(btn.dataset.promoToggleId || 0));
    });
  }

  if (elDiscountEditorForm) {
    elDiscountEditorForm.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-discount-choice-value]');
      if (!btn) return;
      const group = btn.closest('[data-discount-choice-group]');
      if (!group) return;
      const targetId = String(group.getAttribute('data-discount-choice-group') || '').trim();
      const control = targetId ? document.getElementById(targetId) : null;
      if (!control) return;
      const nextValue = String(btn.getAttribute('data-discount-choice-value') || '').trim();
      if (!nextValue || control.value === nextValue) return;
      control.value = nextValue;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      syncDiscountChoiceGroup(targetId);
    });

    elDiscountEditorForm.addEventListener('click', (e) => {
      const removeTierBtn = e.target.closest('[data-threshold-tier-remove]');
      if (removeTierBtn) {
        const tierId = String(removeTierBtn.getAttribute('data-threshold-tier-remove') || '');
        state.discountThresholdTiers = (state.discountThresholdTiers || []).filter((tier) => String(tier.id) !== tierId);
        if (!state.discountThresholdTiers.length) {
          state.discountThresholdTiers = [buildEmptyThresholdTier()];
        }
        renderThresholdTiers();
        return;
      }

      const tierProductsBtn = e.target.closest('[data-threshold-tier-products]');
      if (tierProductsBtn) {
        const tierId = String(tierProductsBtn.getAttribute('data-threshold-tier-products') || '');
        openDiscountProductPicker(`threshold:${tierId}`);
      }
    });

    elDiscountEditorForm.addEventListener('input', (e) => {
      const field = e.target?.getAttribute?.('data-threshold-field');
      const tierId = e.target?.getAttribute?.('data-threshold-tier-id');
      if (!field || !tierId) return;
      state.discountThresholdTiers = (state.discountThresholdTiers || []).map((tier) => {
        if (String(tier.id) !== String(tierId)) return tier;
        if (field === 'min_amount') return { ...tier, min_amount: e.target.value };
        if (field === 'discount_value') {
          return {
            ...tier,
            reward_discount: { ...(tier.reward_discount || {}), discount_value: e.target.value },
          };
        }
        return tier;
      });
    });

    elDiscountEditorForm.addEventListener('change', (e) => {
      const field = e.target?.getAttribute?.('data-threshold-field');
      const tierId = e.target?.getAttribute?.('data-threshold-tier-id');
      if (!field || !tierId) return;
      state.discountThresholdTiers = (state.discountThresholdTiers || []).map((tier) => {
        if (String(tier.id) !== String(tierId)) return tier;
        if (field === 'reward_kind') {
          const nextRewardKind = e.target.value || 'gift';
          return {
            ...tier,
            reward_kind: nextRewardKind,
            reward_products: nextRewardKind === 'order_discount' ? [] : cloneDiscountEntities(tier.reward_products || []),
            reward_discount: {
              ...(tier.reward_discount || {}),
              discount_type: tier.reward_discount?.discount_type || 'percent',
              discount_value: nextRewardKind === 'gift'
                ? ''
                : (nextRewardKind === 'order_discount' && tier.reward_discount?.discount_value == null
                    ? ''
                    : (tier.reward_discount?.discount_value ?? '')),
            },
          };
        }
        if (field === 'discount_type') {
          return {
            ...tier,
            reward_discount: { ...(tier.reward_discount || {}), discount_type: e.target.value || 'percent' },
          };
        }
        return tier;
      });
      renderThresholdTiers();
    });
  }

  if (elDeAddProductsBtn) {
    elDeAddProductsBtn.addEventListener('click', openDiscountProductPicker);
  }

  if (elDeAddPromoProductsBtn) {
    elDeAddPromoProductsBtn.addEventListener('click', openDiscountProductPicker);
  }

  if (elDeAddBuyConditionProductsBtn) {
    elDeAddBuyConditionProductsBtn.addEventListener('click', () => openDiscountProductPicker('buy_condition'));
  }

  if (elDeAddBuyRewardProductsBtn) {
    elDeAddBuyRewardProductsBtn.addEventListener('click', () => openDiscountProductPicker('buy_reward'));
  }

  // Кнопка добавления клиентов в скидку
  if (elDeAddCustomersBtn) {
    elDeAddCustomersBtn.addEventListener('click', openDiscountCustomerPicker);
  }

  if (elDeAddThresholdTierBtn) {
    elDeAddThresholdTierBtn.addEventListener('click', () => {
      state.discountThresholdTiers = [...(state.discountThresholdTiers || []), buildEmptyThresholdTier()];
      renderThresholdTiers();
    });
  }

  if (elDeBuyConditionProductsChips) {
    elDeBuyConditionProductsChips.addEventListener('click', (e) => {
      if (!e.target.closest('.discount-chip-remove')) return;
      const chip = e.target.closest('.discount-chip');
      if (!chip) return;
      const id = Number(chip.getAttribute('data-id') || 0);
      const type = String(chip.getAttribute('data-type') || 'product');
      state.discountBuyConditionProducts = state.discountBuyConditionProducts.filter((item) => !(item.id === id && item.type === type));
      renderDiscountBuyConditionChips();
    });
  }

  if (elDeBuyRewardProductsChips) {
    elDeBuyRewardProductsChips.addEventListener('click', (e) => {
      if (!e.target.closest('.discount-chip-remove')) return;
      const chip = e.target.closest('.discount-chip');
      if (!chip) return;
      const id = Number(chip.getAttribute('data-id') || 0);
      const type = String(chip.getAttribute('data-type') || 'product');
      state.discountBuyRewardProducts = state.discountBuyRewardProducts.filter((item) => !(item.id === id && item.type === type));
      renderDiscountBuyRewardChips();
    });
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

  if (elDePromoProductsChips) {
    elDePromoProductsChips.addEventListener('click', (e) => {
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
    logicSelectWrap.addEventListener('cs-change', () => scheduleFilterDraftCountPreview());
  }

  const filterTitleInput = $('#fe_title');
  if (filterTitleInput) {
    filterTitleInput.addEventListener('input', () => scheduleFilterDraftCountPreview());
  }

  const isChatBridgeMode = !!(document.body && document.body.classList.contains("page-chat"));
  if (!isChatBridgeMode) {
    const initialClientOpenRequest = getClientOpenRequestFromUrl();
    updateDiscountPromoUi();

  loadCustomFilters().catch(console.error);
  loadClients()
    .then(() => openClientRequestedInUrl(initialClientOpenRequest))
    .catch((err) => {
      console.error(err);
      clearClientOpenRequestFromUrl();
    });
  loadDiscounts().catch(console.error);
  scheduleCompanyChatWarmup();

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

