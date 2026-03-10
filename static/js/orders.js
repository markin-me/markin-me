(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const appVersion = String(window.__APP_VERSION__ || document.body?.dataset?.appVersion || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "_") || "dev";
  const rawWorkspaceConfig = window.OrderWorkspaceConfig && typeof window.OrderWorkspaceConfig === "object"
    ? window.OrderWorkspaceConfig
    : {};
  const workspaceMode = String(
    rawWorkspaceConfig.mode
    || (document.body?.dataset?.adminActivePage === "courier-screen" ? "courier" : "orders")
  ).trim().toLowerCase();
  const isCourierWorkspace = workspaceMode === "courier";
  const courierBucketDefs = (
    Array.isArray(rawWorkspaceConfig.courierBuckets) && rawWorkspaceConfig.courierBuckets.length
      ? rawWorkspaceConfig.courierBuckets
      : [
          { id: "available", title: "Свободные", icon: "fa-user-clock" },
          { id: "in-transit", title: "В пути", icon: "fa-truck" },
          { id: "delivered", title: "Доставлены", icon: "fa-circle-check" },
        ]
  ).map((bucket) => ({
    id: String(bucket?.id || "").trim(),
    title: String(bucket?.title || "").trim() || "—",
    icon: String(bucket?.icon || "").trim() || "fa-circle",
  })).filter((bucket) => bucket.id);
  const courierDefaultBucketId = String(
    rawWorkspaceConfig.defaultBucketId || courierBucketDefs[0]?.id || "available"
  ).trim();
  const deliveryMethodCode = String(rawWorkspaceConfig.deliveryMethodCode || "delivery").trim().toLowerCase();
  const courierTransitAliases = new Set(
    (Array.isArray(rawWorkspaceConfig.courierTransitAliases) ? rawWorkspaceConfig.courierTransitAliases : [
      "delivery",
      "delivering",
      "on_the_way",
      "in_transit",
      "courier",
      "в_пути",
    ])
      .map((value) => String(value || "")
        .trim()
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_"))
      .filter(Boolean)
  );
  const courierDeliveredAliases = new Set(
    (Array.isArray(rawWorkspaceConfig.courierDeliveredAliases) ? rawWorkspaceConfig.courierDeliveredAliases : [
      "delivered",
      "completed",
      "done",
      "delivery_done",
      "доставлен",
      "доставлена",
      "доставлено",
      "доставлены",
      "вручен",
      "вручено",
      "выполнен",
      "выполнено",
      "завершен",
      "завершено",
    ])
      .map((value) => String(value || "")
        .trim()
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_"))
      .filter(Boolean)
  );
  function toStatusIdSet(value) {
    const values = Array.isArray(value) ? value : [value];
    return new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item >= 0)
    );
  }
  function toStatusId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id >= 0 ? id : null;
  }
  const courierAvailableStatusIds = toStatusIdSet(rawWorkspaceConfig.courierAvailableStatusIds);
  const courierTransitStatusId = toStatusId(rawWorkspaceConfig.courierTransitStatusId);
  const courierDeliveredStatusId = toStatusId(rawWorkspaceConfig.courierDeliveredStatusId);
  const courierCanceledStatusIds = toStatusIdSet(rawWorkspaceConfig.courierCanceledStatusIds);
  const ordersCacheScope = String(rawWorkspaceConfig.cacheScope || workspaceMode || "orders").trim().toLowerCase() || "orders";

  async function apiJson(url, opts = {}) {
    // Получаем токен и store_id из localStorage
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const headers = {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    // Добавляем токен авторизации, если он есть
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Добавляем ID выбранной Филиалы
    headers['x-store-id'] = storeId;
    
    let res;
    try {
      res = await fetch(url, {
        method: opts.method || "GET",
        cache: opts.cache || "no-store",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      markCourierOfflineFromError(err);
      throw err;
    }
    
    // Если 401 - перенаправляем на логин
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

  // -----------------------------
  // DOM
  // -----------------------------
  const elStagesList = $("#ordersStagesList");
  const elOrdersList = $("#ordersList");
  const elEmptyHint = $("#ordersEmptyHint");
  const ordersAddBtn = $("#ordersAddBtn");
  const orderTabsHeader = $("#orderTabsHeader");
  const orderTabsHeaderCheckout = $("#orderTabsHeaderCheckout");
  const orderTabsHeaders = [orderTabsHeader, orderTabsHeaderCheckout].filter(Boolean);
  const orderTabsEls = [$("#orderTabs"), $("#orderTabsCheckout")].filter(Boolean);
  const orderInfoFooter = $("#orderInfoFooter");
  const orderInfoPaymentBtn = $("#orderInfoPaymentBtn");
  const ordersLeftPane = $("#ordersLeftPane");
  const ordersCenterPane = $("#ordersCenterPane");
  const ordersRightPane = $("#ordersRightPane");
  const ordersCheckoutLeftPane = $("#ordersCheckoutLeftPane");
  const ordersCheckoutCenterPane = $("#ordersCheckoutCenterPane");
  const ordersCheckoutRightPane = $("#ordersCheckoutRightPane");

  const infoEls = {
    empty: $$('[data-info="empty"]'),
    content: $$('[data-info="content"]'),
    title: $$('[data-info="order-title"]'),
    meta: $$('[data-info="order-meta"]'),
    status: $$('[data-info="order-status"]'),
    courierSelect: $$('[data-role="courier-select"]'),

    clientAvatar: $$('[data-info="client-avatar"]'),
    clientName: $$('[data-info="client-name"]'),
    clientPhone: $$('[data-info="client-phone"]'),
    clientExtra: $$('[data-info="client-extra"]'),

    payMethod: $$('[data-info="payment-method"]'),
    payIcon: $$('[data-info="payment-icon"]'),
    changeFrom: $$('[data-info="change-from"]'),
    changeAmount: $$('[data-info="change-amount"]'),
    changeFromRow: $$('[data-info="change-from-row"]'),
    changeAmountRow: $$('[data-info="change-amount-row"]'),
    subtotalRow: $$('[data-info="subtotal-row"]'),
    subtotal: $$('[data-info="subtotal"]'),
    discountRow: $$('[data-info="discount-row"]'),
    discountAmount: $$('[data-info="discount-amount"]'),
    discountInfoBtn: $$('[data-info="discount-info-btn"]'),
    discountBreakdown: $$('[data-info="discount-breakdown"]'),
    deliveryRow: $$('[data-info="delivery-row"]'),
    deliveryCost: $$('[data-info="delivery-cost"]'),
    total: $$('[data-info="order-total"]'),

    deliveryType: $$('[data-info="delivery-type"]'),
    deliveryDatetime: $$('[data-info="delivery-datetime"]'),
    deliveryQty: $$('[data-info="delivery-qty"]'),
    deliveryUrgent: $$('[data-info="delivery-urgent"]'),
    deliveryIntervalRow: $$('[data-info="delivery-interval-row"]'),
    deliveryInterval: $$('[data-info="delivery-interval"]'),
    deliveryAddressTitle: $$('[data-info="delivery-address-title"]'),
    deliveryAddress: $$('[data-info="delivery-address"]'),
    deliveryAddressComment: $$('[data-info="delivery-address-comment"]'),
    deliveryAddressCommentText: $$('[data-info="delivery-address-comment-text"]'),
    orderCommentBlock: $$('[data-info="order-comment-block"]'),
    orderCommentText: $$('[data-info="order-comment-text"]'),

    itemsList: $$('[data-info="items-list"]'),
  };

  const isCourierScreenPage = document.body.classList.contains("page-courier-screen");
  const sheet = $("#orderSheet");
  const backdrop = $("#sheetBackdrop");
  const closeBtn = $("#sheetClose");
  const sheetTitleEl = $(".sheet-title", sheet || document);
  const desktopClientDom = createClientDomRefs(document);
  const sheetClientDom = isCourierScreenPage && sheet ? createClientDomRefs(sheet) : null;
  const clientSurfaces = [desktopClientDom, sheetClientDom].filter((dom) => dom && dom.infoWrap);
  const {
    infoWrap: clientInfoWrap,
    photo: clientPhoto,
    photoPlaceholder: clientPhotoPlaceholder,
    infoName: clientInfoName,
    infoPhone: clientInfoPhone,
    infoBirthday: clientInfoBirthday,
    contentTabs: clientContentTabs,
    tabAddresses: clientTabAddresses,
    tabOrders: clientTabOrders,
    tabDiscounts: clientTabDiscounts,
    addressesList: clientAddressesList,
    ordersList: clientOrdersList,
    ordersListView: clientOrdersListView,
    orderDetailView: clientOrderDetailView,
    discountsList: clientDiscountsList,
    discountsEmpty: clientDiscountsEmpty,
    editNameBtn: clientEditNameBtn,
    addrToggleBtn: clientAddrToggleBtn,
    addrFormCard: clientAddrFormCard,
  } = desktopClientDom;
  const sheetOrderInfoFooter = isCourierScreenPage && sheet ? $('[data-role="order-info-footer"]', sheet) : null;
  const sheetOrderInfoPaymentBtn = isCourierScreenPage && sheet ? $('[data-role="order-info-payment-btn"]', sheet) : null;
  const sharedOrderPanel = window.SharedOrderPanel || null;
  const sharedOrderPayment = window.SharedOrderPayment || null;
  const sharedOrderInfoRenderer = sharedOrderPanel && ordersRightPane
    ? sharedOrderPanel.createInfoRenderer({
        root: ordersRightPane,
        footerEl: orderInfoFooter,
        clientInfoWrap,
        enableClientLink: true,
        helpers: {
          money,
          formatDateTime,
          formatDateTimeNumeric,
          formatScheduleText,
          totalQty,
          buildOrderDiscountSummary,
          renderOrderDiscountBreakdownHtml,
          renderOrderPaymentIcon,
          paymentIcon,
          getDisplayOrder,
          itemsToHtml,
        },
        renderInlineStatusMenus,
        afterRender() {
          setTimeout(() => {
            initOrderItemPhotos();
          }, 0);
        },
      })
    : null;
  const sheetOrderInfoRenderer = sharedOrderPanel && isCourierScreenPage && sheet
    ? sharedOrderPanel.createInfoRenderer({
        root: sheet,
        footerEl: sheetOrderInfoFooter,
        clientInfoWrap: null,
        enableClientLink: true,
        helpers: {
          money,
          formatDateTime,
          formatDateTimeNumeric,
          formatScheduleText,
          totalQty,
          buildOrderDiscountSummary,
          renderOrderDiscountBreakdownHtml,
          renderOrderPaymentIcon,
          paymentIcon,
          getDisplayOrder,
          itemsToHtml,
        },
        renderInlineStatusMenus,
        afterRender() {
          setTimeout(() => {
            initOrderItemPhotos();
          }, 0);
        },
      })
    : null;
  const sharedOrderInfoRenderers = [sharedOrderInfoRenderer, sheetOrderInfoRenderer].filter(Boolean);
  const orderInfoFooters = isCourierScreenPage
    ? [orderInfoFooter, sheetOrderInfoFooter].filter(Boolean)
    : [orderInfoFooter].filter(Boolean);
  const orderInfoPaymentButtons = isCourierScreenPage
    ? [orderInfoPaymentBtn, sheetOrderInfoPaymentBtn].filter(Boolean)
    : [orderInfoPaymentBtn].filter(Boolean);
  const courierConnectionBanner = isCourierWorkspace ? $("#courierConnectionBanner") : null;
  const courierConnectionBannerText = courierConnectionBanner
    ? $(".courier-connection-banner__text", courierConnectionBanner)
    : null;
  const courierConnectionBannerRetryBtn = courierConnectionBanner
    ? $('[data-action="courier-connection-retry"]', courierConnectionBanner)
    : null;

  const closeButtons = $$('[data-action="order-close"]');

  const dateBtn = $("#ordersDateBtn");
  const dateLabel = $("#ordersDateLabel");
  const datePopover = $("#ordersDatePopover");
  const dateGrid = $("#ordersDateGrid");
  const dateTitle = $("#ordersDateTitle");
  const datePrev = $("#ordersDatePrev");
  const dateNext = $("#ordersDateNext");
  const dateReset = $("#ordersDateReset");
  const notifyBtn = $("#ordersNotifyBtn");
  const ordersToolbarTitle = $("#ordersToolbarTitle");

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    statuses: [],
    activeStatusId: isCourierWorkspace ? courierDefaultBucketId : "all",
    orders: [],
    ordersStageIndex: { all: [], byStatus: Object.create(null) },
    activeOrderId: null,
    draggingOrderId: null,
    draggingOrderIds: [],
    selectedOrderIds: new Set(),
    lastEventId: null,
    storeTimezone: "+0",
    tenantSounds: {},
    clientsCache: new Map(),
    date: {
      start: null,
      end: null,
      viewYear: null,
      viewMonth: null,
    },
  };
  let orderDragGhostEl = null;

  const tabsState = {
    tabs: [],
    activeKey: null,
  };

  const ORDERS_CACHE_VERSION = 4;
  const ORDERS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const COURIER_OFFLINE_QUEUE_VERSION = 1;
  let ordersCachePersistTimer = null;
  const courierOfflineState = {
    queue: [],
    shadowOrders: new Map(),
    syncing: false,
    online: navigator.onLine !== false,
    syncError: "",
    transientBanner: null,
    restoredHideTimer: null,
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function parseLocalDateParts(ts) {
    if (!ts) return null;
    const raw = String(ts).trim();
    const match = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6] || 0),
      };
    }

    const fallback = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(fallback.getTime())) return null;
    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      hour: fallback.getHours(),
      minute: fallback.getMinutes(),
      second: fallback.getSeconds(),
    };
  }

  function partsToDate(parts) {
    if (!parts) return null;
    return new Date(
      Number(parts.year || 0),
      Number(parts.month || 1) - 1,
      Number(parts.day || 1),
      Number(parts.hour || 0),
      Number(parts.minute || 0),
      Number(parts.second || 0),
      0
    );
  }

  function formatTime(ts) {
    if (!ts) return '';
    const parts = parseLocalDateParts(ts);
    if (!parts) return '';
    const hours = String(parts.hour).padStart(2, '0');
    const minutes = String(parts.minute).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    const parts = parseLocalDateParts(ts);
    if (!parts) return '';

    const day = String(parts.day).padStart(2, '0');
    const month = Number(parts.month) - 1;
    const year = parts.year;
    const hours = String(parts.hour).padStart(2, '0');
    const minutes = String(parts.minute).padStart(2, '0');

    const monthNames = [
      '\u044f\u043d\u0432',
      '\u0444\u0435\u0432',
      '\u043c\u0430\u0440',
      '\u0430\u043f\u0440',
      '\u043c\u0430\u044f',
      '\u0438\u044e\u043d',
      '\u0438\u044e\u043b',
      '\u0430\u0432\u0433',
      '\u0441\u0435\u043d',
      '\u043e\u043a\u0442',
      '\u043d\u043e\u044f',
      '\u0434\u0435\u043a'
    ];
    return `${day} ${monthNames[month]} ${year}, ${hours}:${minutes}`;
  }

  function formatDateTimeNumeric(ts) {
    if (!ts) return '';
    const parts = parseLocalDateParts(ts);
    if (!parts) return '';
    const day = String(parts.day).padStart(2, '0');
    const month = String(parts.month).padStart(2, '0');
    const year = parts.year;
    const hours = String(parts.hour).padStart(2, '0');
    const minutes = String(parts.minute).padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  }

  function formatScheduleText(order, { includeTitle = true } = {}) {
    if (!order) return "";
    const title = String(order.time_option_title || "").trim();
    const scheduledAt = order.scheduled_at;
    if (!scheduledAt) return includeTitle ? title : "";

    const parts = parseLocalDateParts(scheduledAt);
    const d = partsToDate(parts);
    if (!d || Number.isNaN(d.getTime())) return includeTitle ? title : "";

    const code = String(order.time_option_code || "").trim();
    const storeNow = getStoreDateNow(state.storeTimezone || "+0");
    const isToday = toDateKey(d) === toDateKey(storeNow);
    const showDate = code === "on_date" ? true : code === "at_time" ? false : !isToday;
    const valueText = showDate ? formatDateTime(scheduledAt) : formatTime(scheduledAt);
    if (!valueText) return includeTitle ? title : "";
    if (includeTitle && title) return `${title}: ${valueText}`;
    return valueText;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function normalizeIconClass(iconValue) {
    const base = String(iconValue || "").trim();
    if (!base) return "";
    if (base.includes(" ")) return base;
    if (base.startsWith("fa-")) return `fas ${base}`;
    return `fas fa-${base}`;
  }

  function isIconUrl(iconValue) {
    const val = String(iconValue || "").trim();
    if (!val) return false;
    return /^https?:\/\//i.test(val) || val.startsWith("/") || val.startsWith("./") || val.startsWith("../");
  }

  function fallbackTimeOptionIcon(codeValue) {
    const code = String(codeValue || "").trim().toLowerCase();
    if (code === "asap" || code === "urgent") return "fas fa-bolt";
    if (code === "at_time") return "fas fa-clock";
    if (code === "on_date") return "fas fa-calendar-day";
    return "";
  }

  function resolveTimeOptionIcon(order) {
    if (!order) return "";
    const storedIcon = String(order.time_option_icon || "").trim();
    if (storedIcon) return storedIcon;
    return fallbackTimeOptionIcon(order.time_option_code);
  }

  function renderOrderTimeIcon(order) {
    const iconValue = resolveTimeOptionIcon(order);
    if (!iconValue) return "";
    const title = String(order.time_option_title || "").trim();
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    if (isIconUrl(iconValue)) {
      return `<span class="order-time-icon"${titleAttr}><img src="${escapeHtml(iconValue)}" alt="" loading="lazy"></span>`;
    }
    const iconClass = normalizeIconClass(iconValue);
    if (!iconClass) return "";
    return `<span class="order-time-icon"${titleAttr}><i class="${escapeHtml(iconClass)}"></i></span>`;
  }

  function getStatusMetaById(statusId) {
    const id = Number(statusId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return state.statuses.find((status) => Number(status?.id) === id) || null;
  }

  function resolveOrderStatusIcon(statusMeta) {
    const raw = String(statusMeta?.icon || "").trim();
    if (raw) return raw;
    return "fas fa-circle";
  }

  function renderOrderStatusIcon(statusMeta) {
    const iconValue = resolveOrderStatusIcon(statusMeta);
    return isIconUrl(iconValue)
      ? `<img src="${escapeHtml(iconValue)}" alt="" loading="lazy">`
      : `<i class="${escapeHtml(normalizeIconClass(iconValue) || "fas fa-circle")}"></i>`;
  }

  function normalizeStatusCode(statusMeta) {
    return String(statusMeta?.code || "").trim().toLowerCase();
  }

  function isDeliveredStatusMeta(statusMeta) {
    return normalizeStatusCode(statusMeta) === "delivered";
  }

  function isCanceledStatusMeta(statusMeta) {
    const code = normalizeStatusCode(statusMeta);
    return code === "canceled" || code === "cancelled";
  }

  function isFinalStatusMeta(statusMeta) {
    return Number(statusMeta?.is_final || 0) === 1 || isCanceledStatusMeta(statusMeta);
  }

  function normalizeCourierAlias(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_");
  }

  function isDeliveryOrder(order) {
    return String(order?.method_code || "").trim().toLowerCase() === deliveryMethodCode;
  }

  function getCourierOrderStatusId(order) {
    const id = Number(order?.status_id);
    return Number.isFinite(id) ? id : null;
  }

  function matchesCourierCanceledStatus(statusMeta) {
    const statusId = Number(statusMeta?.id);
    if (Number.isFinite(statusId) && courierCanceledStatusIds.has(statusId)) return true;
    return isCanceledStatusMeta(statusMeta);
  }

  function getCourierConfiguredStatusMeta(statusId, order, fallbackTitle = "") {
    if (!Number.isFinite(Number(statusId)) || Number(statusId) < 0) return null;
    const normalizedId = Number(statusId);
    const configured = getStatusMetaById(normalizedId);
    if (configured) return configured;
    if (Number(order?.status_id) === normalizedId) {
      const currentStatus = getOrderStatusMeta(order);
      return { ...currentStatus, id: normalizedId, title: currentStatus?.title || fallbackTitle };
    }
    return {
      id: normalizedId,
      code: "",
      title: fallbackTitle,
      icon: "",
      is_final: normalizedId === courierDeliveredStatusId ? 1 : 0,
    };
  }

  function matchesCourierDeliveredStatus(statusMeta) {
    if (!statusMeta) return false;
    const statusId = Number(statusMeta?.id);
    if (Number.isFinite(statusId) && courierDeliveredStatusId !== null && statusId === courierDeliveredStatusId) {
      return true;
    }
    if (normalizeStatusCode(statusMeta) === "delivered") return true;
    const statusTokens = [statusMeta?.code, statusMeta?.title]
      .map(normalizeCourierAlias)
      .filter(Boolean);
    if (statusTokens.some((token) => courierDeliveredAliases.has(token))) return true;
    return Number(statusMeta?.is_final || 0) === 1 && !matchesCourierCanceledStatus(statusMeta);
  }

  function getOrderStatusMeta(order) {
    return getStatusMetaById(order?.status_id) || {
      id: order?.status_id ?? null,
      code: order?.status_code ?? "",
      title: order?.status_title ?? "",
      icon: order?.status_icon ?? "",
      is_final: order?.status_is_final ?? 0,
    };
  }

  function getCourierBucketId(order) {
    if (!isCourierWorkspace || !isDeliveryOrder(order)) return null;

    const statusMeta = getOrderStatusMeta(order);
    const currentStatusId = getCourierOrderStatusId(order);
    if (currentStatusId !== null) {
      if (courierCanceledStatusIds.has(currentStatusId)) return null;
      if (courierDeliveredStatusId !== null && currentStatusId === courierDeliveredStatusId) return "delivered";
      if (courierTransitStatusId !== null && currentStatusId === courierTransitStatusId) return "in-transit";
      if (courierAvailableStatusIds.size) {
        return courierAvailableStatusIds.has(currentStatusId) ? "available" : null;
      }
    }
    if (matchesCourierDeliveredStatus(statusMeta)) return "delivered";

    const statusTokens = [
      order?.status_code,
      order?.status_title,
      statusMeta?.code,
      statusMeta?.title,
    ]
      .map(normalizeCourierAlias)
      .filter(Boolean);

    if (statusTokens.some((token) => courierTransitAliases.has(token))) {
      return "in-transit";
    }

    if (matchesCourierCanceledStatus(statusMeta) || isFinalStatusMeta(statusMeta)) {
      return null;
    }

    return "available";
  }

  function getCourierBucketItems() {
    return courierBucketDefs.map((bucket) => ({
      ...bucket,
      count: state.orders.reduce((acc, order) => (
        getCourierBucketId(order) === bucket.id ? acc + 1 : acc
      ), 0),
    }));
  }

  function normalizePhoneForTel(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/^8/, "+7")
      .replace(/^7/, "+7");
  }

  function getCourierTransitStatusMeta(order) {
    if (!isCourierWorkspace) return null;
    if (courierTransitStatusId !== null) {
      return getCourierConfiguredStatusMeta(courierTransitStatusId, order, "В пути");
    }
    const statuses = getSortedStatuses();
    if (!statuses.length) return null;

    const currentStatusId = Number(order?.status_id || 0);
    let fallbackStatus = null;

    for (const status of statuses) {
      const statusTokens = [status?.code, status?.title]
        .map(normalizeCourierAlias)
        .filter(Boolean);
      if (!statusTokens.some((token) => courierTransitAliases.has(token))) continue;
      if (Number(status?.id || 0) === currentStatusId) return status;
      if (!fallbackStatus) fallbackStatus = status;
    }

    return fallbackStatus;
  }

  function getCourierDeliveredStatusMeta(order) {
    if (!isCourierWorkspace) return null;
    if (courierDeliveredStatusId !== null) {
      return getCourierConfiguredStatusMeta(courierDeliveredStatusId, order, "Доставлен");
    }
    const statuses = getSortedStatuses();
    if (!statuses.length) return null;

    const currentStatusId = Number(order?.status_id || 0);
    let aliasMatch = null;
    let finalFallback = null;

    for (const status of statuses) {
      if (isCanceledStatusMeta(status)) continue;
      if (matchesCourierDeliveredStatus(status)) {
        if (Number(status?.id || 0) === currentStatusId) return status;
        if (!aliasMatch) aliasMatch = status;
      }
      if (!finalFallback && Number(status?.is_final || 0) === 1 && !isCanceledStatusMeta(status)) {
        finalFallback = status;
      }
    }

    return aliasMatch || finalFallback;
  }

  function getCourierPickupState(order) {
    const currentStatus = getOrderStatusMeta(order);
    const transitStatus = getCourierTransitStatusMeta(order);
    const deliveredStatus = getCourierDeliveredStatusMeta(order);
    const currentStatusId = getCourierOrderStatusId(order);
    const deliveredStatusId = Number(deliveredStatus?.id ?? -1);
    const transitStatusId = Number(transitStatus?.id ?? -1);
    const isEligibleOrder = isCourierWorkspace
      && isDeliveryOrder(order)
      && !matchesCourierCanceledStatus(currentStatus)
      && !matchesCourierDeliveredStatus(currentStatus);
    const isAlreadyTransit = currentStatusId !== null && transitStatusId >= 0
      ? transitStatusId === currentStatusId
      : Boolean(transitStatus && Number(transitStatus.id || 0) === Number(currentStatus?.id || 0));
    const isAlreadyDelivered = matchesCourierDeliveredStatus(currentStatus);
    const isCurrentDeliveredStatus = currentStatusId !== null && deliveredStatusId >= 0 && deliveredStatusId === currentStatusId;
    const canPickup = Boolean(isEligibleOrder && transitStatus && !isAlreadyTransit);
    const canDeliver = Boolean(
      isCourierWorkspace
      && isDeliveryOrder(order)
      && !matchesCourierCanceledStatus(currentStatus)
      && isAlreadyTransit
      && deliveredStatus
      && Number(deliveredStatus.id || 0) !== Number(currentStatusId)
    );
    let disabledReason = "";
    let actionLabel = "Забрать";
    let actionIcon = "fas fa-truck";
    let targetStatus = transitStatus;

    if (!isDeliveryOrder(order)) {
      disabledReason = "Действие доступно только для доставки";
    } else if (canDeliver) {
      actionLabel = "Доставлен";
      actionIcon = "fas fa-circle-check";
      targetStatus = deliveredStatus;
    } else if (isCurrentDeliveredStatus) {
      actionLabel = "Доставлен";
      actionIcon = "fas fa-circle-check";
      targetStatus = deliveredStatus;
      disabledReason = "Заказ уже доставлен";
    } else if (!transitStatus) {
      disabledReason = "Не найден статус «В пути»";
    } else if (isAlreadyTransit) {
      disabledReason = "Заказ уже в пути";
    } else if (isFinalStatusMeta(currentStatus) || isAlreadyDelivered || isDeliveredStatusMeta(currentStatus) || matchesCourierCanceledStatus(currentStatus)) {
      disabledReason = "Действие недоступно для финального статуса";
    }

    return {
      canPickup: canPickup || canDeliver,
      transitStatus: targetStatus,
      actionLabel,
      actionIcon,
      disabledReason,
    };
  }

  function buildCourierPickupButtonHtml(order) {
    const pickupState = getCourierPickupState(order);
    const targetStatusId = Number(pickupState?.transitStatus?.id || 0);
    const actionLabel = String(pickupState?.actionLabel || "Забрать").trim() || "Забрать";
    const actionIcon = String(pickupState?.actionIcon || "fas fa-truck").trim() || "fas fa-truck";
    const buttonTitle = pickupState.canPickup
      ? `Перевести в «${String(pickupState?.transitStatus?.title || "В пути").trim() || "В пути"}»`
      : (pickupState.disabledReason || "Действие недоступно");

    return `
      <button
        class="order-courier-action-btn order-courier-action-btn--pickup"
        type="button"
        data-action="courier-pickup"
        data-order-id="${escapeHtml(order?.id || "")}"
        ${pickupState.canPickup && targetStatusId > 0 ? `data-target-status-id="${escapeHtml(targetStatusId)}"` : ""}
        ${pickupState.canPickup ? "" : "disabled"}
        title="${escapeHtml(buttonTitle)}"
        aria-label="${escapeHtml(buttonTitle)}"
      >
        <i class="${escapeHtml(actionIcon)}" aria-hidden="true"></i>
        <span>Забрать</span>
      </button>
    `;
  }

  function buildCourierActionButtonHtml(order) {
    const pickupState = getCourierPickupState(order);
    const targetStatus = pickupState?.transitStatus || null;
    const targetStatusId = Number(targetStatus?.id || 0);
    const actionLabel = String(pickupState?.actionLabel || "Забрать").trim() || "Забрать";
    const actionIcon = String(pickupState?.actionIcon || "fas fa-truck").trim() || "fas fa-truck";
    const buttonTitle = pickupState.canPickup
      ? `Перевести в «${String(targetStatus?.title || actionLabel).trim() || actionLabel}»`
      : (pickupState.disabledReason || "Действие недоступно");

    return `
      <button
        class="order-courier-action-btn order-courier-action-btn--pickup"
        type="button"
        data-action="courier-pickup"
        data-order-id="${escapeHtml(order?.id || "")}"
        ${pickupState.canPickup && targetStatusId > 0 ? `data-target-status-id="${escapeHtml(targetStatusId)}"` : ""}
        ${pickupState.canPickup ? "" : "disabled"}
        title="${escapeHtml(buttonTitle)}"
        aria-label="${escapeHtml(buttonTitle)}"
      >
        <i class="${escapeHtml(actionIcon)}" aria-hidden="true"></i>
        <span>${escapeHtml(actionLabel)}</span>
      </button>
    `;
  }

  function buildCourierCallButtonHtml(order) {
    const phoneHref = normalizePhoneForTel(order?.customer_phone || "");
    if (!phoneHref) {
      return `
        <button
          class="order-courier-action-btn order-courier-action-btn--call"
          type="button"
          disabled
          aria-label="Телефон клиента недоступен"
          title="Телефон клиента недоступен"
        >
          <i class="fas fa-phone" aria-hidden="true"></i>
          <span>Позвонить</span>
        </button>
      `;
    }

    return `
      <a
        class="order-courier-action-btn order-courier-action-btn--call"
        href="tel:${escapeHtml(phoneHref)}"
        data-action="courier-call"
        aria-label="Позвонить клиенту"
        title="Позвонить клиенту"
      >
        <i class="fas fa-phone" aria-hidden="true"></i>
        <span>Позвонить</span>
      </a>
    `;
  }

  function isForbiddenStatusTransition(fromStatus, toStatus) {
    return isDeliveredStatusMeta(fromStatus) && isCanceledStatusMeta(toStatus);
  }

  function getNextStatusMetaForOrder(order) {
    const sortedStatuses = getSortedStatuses();
    if (!sortedStatuses.length) return null;
    const currentStatusId = Number(order?.status_id || 0);
    const currentIndex = sortedStatuses.findIndex((status) => Number(status.id) === currentStatusId);
    const currentStatus = currentIndex >= 0 ? sortedStatuses[currentIndex] : null;
    if (currentIndex < 0) return sortedStatuses[0];
    if (isFinalStatusMeta(currentStatus)) return null;
    const maxOffset = isDeliveredStatusMeta(currentStatus)
      ? Math.max(0, sortedStatuses.length - currentIndex - 1)
      : sortedStatuses.length;
    for (let offset = 1; offset <= maxOffset; offset += 1) {
      const candidate = sortedStatuses[(currentIndex + offset) % sortedStatuses.length];
      if (!candidate) continue;
      if (Number(candidate.id) === Number(currentStatus?.id || 0)) break;
      if (isForbiddenStatusTransition(currentStatus, candidate)) continue;
      return candidate;
    }
    return null;
  }

  function renderOrderStatusCycleButton(order) {
    if (!order) return "";
    const currentStatus = getStatusMetaById(order.status_id) || getSortedStatuses()[0] || null;
    const nextStatus = getNextStatusMetaForOrder(order);
    const nextStatusId = Number(nextStatus?.id || 0);
    if (!currentStatus || !Number.isFinite(nextStatusId) || nextStatusId <= 0) return "";

    const currentTitle = String(currentStatus.title || "").trim() || "Этап";
    const nextTitle = String(nextStatus.title || "").trim() || currentTitle;
    const titleAttr = escapeHtml(`${currentTitle} -> ${nextTitle}`);
    const iconValue = resolveOrderStatusIcon(currentStatus);
    const iconHtml = isIconUrl(iconValue)
      ? `<img src="${escapeHtml(iconValue)}" alt="" loading="lazy">`
      : `<i class="${escapeHtml(normalizeIconClass(iconValue) || "fas fa-circle")}"></i>`;

    return `
      <button
        class="order-stage-btn"
        type="button"
        data-action="order-row-status-next"
        data-order-id="${escapeHtml(order.id)}"
        data-next-status-id="${escapeHtml(nextStatusId)}"
        title="${titleAttr}"
        aria-label="${titleAttr}"
      >
        <span class="order-stage-btn-icon-wrap">
          ${iconHtml}
        </span>
        <span class="order-stage-btn-content">
          <span class="order-stage-btn-current">${escapeHtml(currentTitle)} <span class="order-stage-btn-arrow">-&gt;</span></span>
          <span class="order-stage-btn-next">${escapeHtml(nextTitle)}</span>
        </span>
      </button>
    `;
  }

  function renderOrderStatusHoverCycleButton(order) {
    if (!order) return "";
    const currentStatus = getStatusMetaById(order.status_id) || getSortedStatuses()[0] || null;
    const nextStatus = getNextStatusMetaForOrder(order);
    const nextStatusId = Number(nextStatus?.id || 0);
    if (!currentStatus) return "";

    const currentTitle = String(currentStatus.title || "").trim() || "Р­С‚Р°Рї";
    const isFinal = isFinalStatusMeta(currentStatus);
    const canCycle = !isFinal && Number.isFinite(nextStatusId) && nextStatusId > 0 && nextStatusId !== Number(currentStatus?.id || 0);
    const nextTitle = canCycle ? (String(nextStatus.title || "").trim() || currentTitle) : currentTitle;
    const titleText = canCycle
      ? `${currentTitle} -> ${nextTitle}`
      : "\u0424\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441";
    const nextNote = "\u0421\u043C\u0435\u043D\u0438\u0442\u044C";
    const currentIconHtml = renderOrderStatusIcon(currentStatus);
    const nextIconHtml = canCycle ? renderOrderStatusIcon(nextStatus) : "";
    if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderStageCycleButtonHtml === "function") {
      return sharedOrderPanel.buildOrderStageCycleButtonHtml({
        orderId: order.id,
        canCycle,
        currentTitle,
        nextTitle,
        titleText,
        nextNote,
        currentIconHtml,
        nextIconHtml,
        nextStatusId,
      });
    }
    const disabledAttr = canCycle ? "" : " disabled";
    const nextStatusAttr = canCycle ? ` data-next-status-id="${escapeHtml(nextStatusId)}"` : "";

    return `
      <button
        class="order-stage-btn${canCycle ? "" : " is-static"}"
        type="button"
        data-action="order-row-status-next"
        data-order-id="${escapeHtml(order.id)}"${nextStatusAttr}
        title="${escapeHtml(titleText)}"
        aria-label="${escapeHtml(titleText)}"${disabledAttr}
      >
        <span class="order-stage-btn-icon-shell" aria-hidden="true">
          <span class="order-stage-btn-icon-wrap order-stage-btn-icon-current">
            ${currentIconHtml}
          </span>
          ${canCycle ? `
          <span class="order-stage-btn-icon-wrap order-stage-btn-icon-next">
            ${nextIconHtml}
          </span>
          ` : ""}
        </span>
        <span class="order-stage-btn-content">
          <span class="order-stage-btn-panel order-stage-btn-panel-current">
            <span class="order-stage-btn-current">${escapeHtml(currentTitle)}</span>
          </span>
          ${canCycle ? `
          <span class="order-stage-btn-panel order-stage-btn-panel-next" aria-hidden="true">
            <span class="order-stage-btn-next">${escapeHtml(nextTitle)}</span>
            <span class="order-stage-btn-meta">${nextNote}</span>
          </span>
          ` : ""}
        </span>
      </button>
    `;
  }

  function normalizeApartmentToken(token) {
    const src = String(token || "").trim();
    if (!src) return "";
    const re = /\b(?:\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?\.?)\s*([\p{L}\d\-\/]+)/iu;
    const m = src.match(re);
    if (!m || !m[1]) return "";
    return `кв ${m[1]}`;
  }

  function normalizeHouseToken(token) {
    const src = String(token || "").trim();
    if (!src) return "";
    const re = /(?:\u0434(?:\u043e\u043c)?\.?)\s*([\p{L}\d\-\/]+)/iu;
    const m = src.match(re);
    if (m && m[1]) return m[1];
    if (/^\d+[\p{L}\-\/]*$/iu.test(src)) return src;
    return "";
  }

  function isMetaAddressToken(token) {
    const src = String(token || "").trim().toLowerCase();
    if (!src) return true;
    return /(?:\u043f\u043e\u0434[\u044a\u044c]\u0435\u0437\u0434|\u044d\u0442(?:\u0430\u0436)?|\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?|\u043e\u0444\u0438\u0441|\u043a\u043e\u043c\u043c\u0435\u043d\u0442|\u0434\u043e\u043c\u043e\u0444\u043e\u043d|\u043a\u043e\u0434)/iu.test(src);
  }

  function looksLikeStreetToken(token) {
    const src = String(token || "").trim();
    if (!src) return false;
    if (isMetaAddressToken(src)) return false;
    const streetRe = /(?:\u0443\u043b\.?|\u0443\u043b\u0438\u0446|\u043f\u0440\u043e\u0441\u043f|\u043f\u0440-\u0442|\u043f\u0435\u0440\u0435\u0443\u043b|\u043f\u0435\u0440\.?|\u0431\u0443\u043b\u044c\u0432\u0430\u0440|\u0431\u0443\u043b\.?|\u043d\u0430\u0431\.?|\u0448\u043e\u0441\u0441\u0435|\u043c\u043a\u0440\.?|\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d|\u043f\u043b\.?|\u043f\u043b\u043e\u0449\u0430\u0434\u044c|\u0430\u043b\u043b\u0435\u044f|\u0442\u0440\u0430\u043a\u0442|\u0434\u043e\u0440\u043e\u0433\u0430|\u043f\u0440\u043e\u0435\u0437\u0434)/iu;
    if (streetRe.test(src)) return true;
    return /\d/.test(src);
  }

  function shortAddressForList(rawAddress) {
    const raw = String(rawAddress || "").trim();
    if (!raw) return "?";
    const tokens = raw.split(",").map((v) => String(v || "").trim()).filter(Boolean);
    if (!tokens.length) return raw;

    let aptPart = "";
    for (const token of tokens) {
      const apt = normalizeApartmentToken(token);
      if (apt) {
        aptPart = apt;
        break;
      }
    }

    const explicitStreetIdx = tokens.findIndex((token) => looksLikeStreetToken(token) && !normalizeHouseToken(token));
    const houseIdx = tokens.findIndex((token) => !!normalizeHouseToken(token));
    let streetPart = explicitStreetIdx >= 0 ? (tokens[explicitStreetIdx] || "") : "";

    if (!streetPart) {
      const beforeHouse = (houseIdx >= 0 ? tokens.slice(0, houseIdx) : tokens)
        .filter((token) => !isMetaAddressToken(token) && !normalizeHouseToken(token));
      if (beforeHouse.length) streetPart = beforeHouse[beforeHouse.length - 1] || "";
    }

    if (!streetPart) {
      const fallbackStreetIdx = tokens.findIndex((token) => !isMetaAddressToken(token) && looksLikeStreetToken(token));
      if (fallbackStreetIdx >= 0) streetPart = tokens[fallbackStreetIdx] || "";
    }

    if (streetPart && !/\d/.test(streetPart)) {
      const houseToken = houseIdx >= 0 ? tokens[houseIdx] || "" : "";
      const house = normalizeHouseToken(houseToken);
      if (house) streetPart = `${streetPart} ${house}`.trim();
    }

    if (!streetPart) streetPart = raw;
    if (aptPart && !/\b(?:\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?\.?)\s*[\p{L}\d\-\/]+\b/iu.test(streetPart)) {
      return `${streetPart}, ${aptPart}`;
    }
    return streetPart;
  }

  function buildOrderTabKey(orderId) {
    return `order:${String(orderId)}`;
  }

  function buildClientTabKey(clientId) {
    return `client:${String(clientId)}`;
  }

  function buildOrderTabTitle(order) {
    const id = Number(order?.id || 0);
    if (!Number.isFinite(id) || id <= 0) return "Заказ";
    return `№${id}`;
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function formatPhoneDigitsToRU(value) {
    const raw = normalizePhoneDigits(value);
    if (raw.length !== 11) return String(value || "—");
    const digits = raw.startsWith("8") ? `7${raw.slice(1)}` : raw;
    if (!digits.startsWith("7")) return String(value || "—");
    const a = digits.slice(1, 4);
    const b = digits.slice(4, 7);
    const c = digits.slice(7, 9);
    const d = digits.slice(9, 11);
    return `+7 (${a}) ${b}-${c}-${d}`;
  }

  function buildClientTabTitle({ client = null, name = "", phone = "", id = null } = {}) {
    const fromClientName = String(client?.name || "").trim();
    if (fromClientName) return fromClientName;
    const fromName = String(name || "").trim();
    if (fromName && fromName !== "?") return fromName;
    const fromClientPhone = String(client?.phone || "").trim();
    if (fromClientPhone) return formatPhoneDigitsToRU(fromClientPhone);
    const fromPhone = String(phone || "").trim();
    if (fromPhone) return formatPhoneDigitsToRU(fromPhone);
    const clientId = Number(client?.id || id || 0);
    if (Number.isFinite(clientId) && clientId > 0) return `Клиент #${clientId}`;
    return "Клиент";
  }

  function syncActiveOrderRowState() {
    $$(".order-row.is-active").forEach((el) => el.classList.remove("is-active"));
  }

  function normalizeSelectedOrderIds() {
    if (!(state.selectedOrderIds instanceof Set)) {
      state.selectedOrderIds = new Set();
      return;
    }
    const existing = new Set((Array.isArray(state.orders) ? state.orders : []).map((row) => Number(row?.id || 0)));
    Array.from(state.selectedOrderIds).forEach((idRaw) => {
      const id = Number(idRaw || 0);
      if (!(id > 0) || !existing.has(id)) state.selectedOrderIds.delete(idRaw);
    });
  }

  function isOrderMultiSelected(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    return state.selectedOrderIds instanceof Set && state.selectedOrderIds.has(id);
  }

  function applyOrderMultiSelectionState(row, orderId) {
    if (!row) return;
    const id = Number(orderId || row?.getAttribute("data-order-id") || 0);
    const selected = isOrderMultiSelected(id);
    row.classList.toggle("is-multi-selected", selected);
    const checkbox = $('[data-role="order-multi-checkbox"]', row);
    if (checkbox) checkbox.checked = selected;
  }

  function toggleOrderMultiSelection(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    if (!(state.selectedOrderIds instanceof Set)) state.selectedOrderIds = new Set();
    if (state.selectedOrderIds.has(id)) {
      state.selectedOrderIds.delete(id);
      return false;
    }
    state.selectedOrderIds.add(id);
    return true;
  }

  function getDraggingOrderIdsFromEvent(event) {
    if (Array.isArray(state.draggingOrderIds) && state.draggingOrderIds.length) {
      return [...new Set(state.draggingOrderIds.map((id) => Number(id || 0)).filter((id) => id > 0))];
    }

    let parsed = [];
    try {
      const rawJson = event?.dataTransfer?.getData("application/x-order-ids") || "";
      if (rawJson) {
        const list = JSON.parse(rawJson);
        if (Array.isArray(list)) parsed = list;
      }
    } catch {}

    if (!parsed.length) {
      try {
        const one = Number(event?.dataTransfer?.getData("text/plain") || 0);
        if (one > 0) parsed = [one];
      } catch {}
    }

    return [...new Set(parsed.map((id) => Number(id || 0)).filter((id) => id > 0))];
  }

  function normalizeTabMode(mode) {
    const raw = String(mode || "view").toLowerCase();
    if (raw === "edit" || raw === "new") return raw;
    return "view";
  }

  function isCheckoutTab(tab) {
    return !!tab && tab.type === "order" && normalizeTabMode(tab.mode) !== "view";
  }

  function setOrdersCheckoutLayoutEnabled(enabled) {
    const checkout = Boolean(enabled);
    document.body.classList.toggle("orders-checkout-mode", checkout);
    ordersLeftPane?.classList.toggle("hidden", checkout);
    ordersCenterPane?.classList.toggle("hidden", checkout);
    ordersRightPane?.classList.toggle("hidden", checkout);
    ordersCheckoutLeftPane?.classList.toggle("hidden", !checkout);
    ordersCheckoutCenterPane?.classList.toggle("hidden", !checkout);
    ordersCheckoutRightPane?.classList.toggle("hidden", !checkout);
  }

  function getNewOrderBridge() {
    const bridge = window.NewOrderBridge;
    if (!bridge || typeof bridge !== "object") return null;
    if (typeof bridge.captureSession !== "function") return null;
    if (typeof bridge.restoreSession !== "function") return null;
    return bridge;
  }

  async function getReadyNewOrderBridge() {
    const bridge = getNewOrderBridge();
    if (!bridge) return null;
    if (typeof bridge.ready === "function") {
      try {
        await bridge.ready();
      } catch {}
    }
    return bridge;
  }

  function captureCheckoutSessionForTab(tab) {
    if (!isCheckoutTab(tab)) return;
    if (tab.checkoutSessionHydrating) return;
    const bridge = getNewOrderBridge();
    if (!bridge) return;
    try {
      const snapshot = bridge.captureSession();
      if (snapshot && typeof snapshot === "object") {
        tab.checkoutSession = snapshot;
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function ensureCheckoutSessionForTab(tab) {
    if (!isCheckoutTab(tab)) return null;
    const bridge = await getReadyNewOrderBridge();
    if (!bridge) return null;
    const mode = normalizeTabMode(tab.mode);
    const forceRebuildFromOrder = mode === "edit" && tab.checkoutSessionHydrating === true;
    if (!forceRebuildFromOrder && tab.checkoutSession && typeof tab.checkoutSession === "object") return tab.checkoutSession;

    if (mode === "edit") {
      const sourceOrder = tab.order || state.orders.find((o) => Number(o.id) === Number(tab.orderId)) || null;
      if (sourceOrder && typeof bridge.createSessionFromOrder === "function") {
        try {
          tab.checkoutSession = await bridge.createSessionFromOrder(sourceOrder, {
            title: tab.title,
            orderId: Number(sourceOrder.id || 0),
          });
          tab.checkoutSessionHydrating = false;
          return tab.checkoutSession;
        } catch (err) {
          console.error(err);
          tab.checkoutSessionHydrating = false;
        }
      }
    }

    if (typeof bridge.createBlankSession === "function") {
      tab.checkoutSession = bridge.createBlankSession({ title: tab.title });
    } else {
      tab.checkoutSession = null;
    }
    tab.checkoutSessionHydrating = false;
    return tab.checkoutSession;
  }

  async function applyTabModeLayout(tab) {
    if (!tab || tab.type !== "order") {
      setOrdersCheckoutLayoutEnabled(false);
      return;
    }

    const mode = normalizeTabMode(tab.mode);
    if (mode === "view") {
      setOrdersCheckoutLayoutEnabled(false);
      return;
    }

    setOrdersCheckoutLayoutEnabled(true);
    const bridge = await getReadyNewOrderBridge();
    if (!bridge) return;
    const session = await ensureCheckoutSessionForTab(tab);
    if (session && typeof bridge.restoreSession === "function") {
      await bridge.restoreSession(session);
      tab.checkoutSessionHydrating = false;
      try {
        const restored = bridge.captureSession && bridge.captureSession();
        const rightOrders = Array.isArray(restored?.rightOrders) ? restored.rightOrders : [];
        if (!rightOrders.length && typeof bridge.createBlankSession === "function") {
          const fallbackSession = bridge.createBlankSession({ title: tab.title });
          if (fallbackSession && typeof fallbackSession === "object") {
            tab.checkoutSession = fallbackSession;
            await bridge.restoreSession(fallbackSession);
            tab.checkoutSessionHydrating = false;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  function bindOrderTabsWheelScroll() {
    if (sharedOrderPanel) {
      sharedOrderPanel.bindTabsWheelScroll(orderTabsEls);
      return;
    }
    if (!orderTabsEls.length) return;
    orderTabsEls.forEach((tabsEl) => {
      if (!tabsEl || tabsEl.dataset.wheelBound === "1") return;
      const onWheel = (event) => {
        const maxScrollLeft = Math.max(0, tabsEl.scrollWidth - tabsEl.clientWidth);
        if (maxScrollLeft <= 0) return;

        const deltaX = Number(event.deltaX || 0);
        const deltaY = Number(event.deltaY || 0);
        const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        if (!primaryDelta) return;

        const current = tabsEl.scrollLeft || 0;
        const next = Math.max(0, Math.min(maxScrollLeft, current + primaryDelta));
        if (Math.abs(next - current) < 0.5) return;

        event.preventDefault();
        tabsEl.scrollLeft = next;
      };
      tabsEl.addEventListener("wheel", onWheel, { passive: false });
      tabsEl.dataset.wheelBound = "1";
    });
  }

  function renderOrderTabs() {
    if (sharedOrderPanel) {
      sharedOrderPanel.renderTabs({
        headers: orderTabsHeaders,
        tabsEls: orderTabsEls,
        tabs: tabsState.tabs,
        activeKey: tabsState.activeKey,
      });
      return;
    }
    if (!orderTabsEls.length) return;
    const hasTabs = tabsState.tabs.length > 0;
    orderTabsHeaders.forEach((header) => header.classList.toggle("hidden", !hasTabs));
    if (!hasTabs) {
      orderTabsEls.forEach((el) => { el.innerHTML = ""; });
      return;
    }
    const html = tabsState.tabs.map((tab) => {
      const isActive = tab.key === tabsState.activeKey;
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-order-tab-key="${escapeHtml(tab.key)}">
          <span class="product-tab-title">${escapeHtml(tab.title || (tab.type === "client" ? "Клиент" : "Заказ"))}</span>
          <button class="product-tab-close" type="button" data-order-tab-close="${escapeHtml(tab.key)}" aria-label="Закрыть">&times;</button>
        </div>
      `;
    }).join("");
    orderTabsEls.forEach((el) => { el.innerHTML = html; });
  }

  function goToOrdersHomeView() {
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    if (activeTab) captureCheckoutSessionForTab(activeTab);
    tabsState.activeKey = null;
    state.activeOrderId = null;
    setOrdersCheckoutLayoutEnabled(false);
    renderOrderTabs();
    syncActiveOrderRowState();
    setInfo(null);
    schedulePersistOrdersCache();
  }

  function setActiveOrderTab(key, { openMobile = false } = {}) {
    const prevTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey) || null;
    if (prevTab) captureCheckoutSessionForTab(prevTab);

    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    tabsState.activeKey = key;

    if (tab.type === "order") {
      tab.mode = normalizeTabMode(tab.mode);
    }

    if (tab.type === "client") {
      state.activeOrderId = null;
      renderOrderTabs();
      syncActiveOrderRowState();
      setOrdersCheckoutLayoutEnabled(false);
      activateClientTab(tab, { openMobile }).catch(console.error);
      schedulePersistOrdersCache();
      return;
    }

    if (isCheckoutTab(tab)) {
      state.activeOrderId = null;
      renderOrderTabs();
      syncActiveOrderRowState();
      applyTabModeLayout(tab)
        .then(() => {
          if (openMobile && isMobile()) openSheet();
        })
        .catch(console.error)
        .finally(() => {
          schedulePersistOrdersCache();
        });
      return;
    }

    setOrdersCheckoutLayoutEnabled(false);
    state.activeOrderId = tab.orderId ? Number(tab.orderId) : null;
    const orderFromState = tab.orderId
      ? state.orders.find((o) => Number(o.id) === Number(tab.orderId))
      : null;
    if (orderFromState) {
      tab.order = { ...tab.order, ...orderFromState };
      tab.title = buildOrderTabTitle(tab.order);
    }

    renderOrderTabs();
    syncActiveOrderRowState();
    setInfo(orderFromState || tab.order || null);

    if (!orderFromState && tab.orderId) {
      ensureFullOrderById(tab.orderId)
        .then((fullOrder) => {
          if (!fullOrder) return;
          const activeTab = tabsState.tabs.find((item) => item.key === key);
          if (!activeTab || tabsState.activeKey !== key) return;
          activeTab.order = { ...activeTab.order, ...fullOrder };
          activeTab.title = buildOrderTabTitle(activeTab.order);
          renderOrderTabs();
          setInfo(activeTab.order);
          syncActiveOrderRowState();
        })
        .catch(console.error);
    }

    if (openMobile && isMobile()) openSheet();
    schedulePersistOrdersCache();
  }

  function ensureOrderTab(order, { activate = true, openMobile = false } = {}) {
    if (!order || !Number.isFinite(Number(order.id))) return null;
    const orderId = Number(order.id);
    const key = buildOrderTabKey(orderId);
    let tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = {
        key,
        type: "order",
        mode: "view",
        orderId,
        title: buildOrderTabTitle(order),
        order: { ...order },
        checkoutSession: null,
      };
      tabsState.tabs.push(tab);
    } else {
      tab.type = "order";
      tab.order = { ...tab.order, ...order };
      tab.orderId = orderId;
      if (normalizeTabMode(tab.mode) === "view") {
        tab.title = buildOrderTabTitle(tab.order);
      }
    }

    if (activate) {
      setActiveOrderTab(key, { openMobile });
    } else {
      renderOrderTabs();
      schedulePersistOrdersCache();
    }

    return tab;
  }

  async function ensureFullOrderById(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return null;
    const fromState = state.orders.find((order) => Number(order?.id) === id) || null;
    const knownStoreId = Number(fromState?.store_id || fromState?.storeId || 0);
    if (fromState && Array.isArray(fromState.items) && fromState.items.length && knownStoreId > 0) return fromState;
    try {
      const json = await apiJson(`/api/admin/orders/${id}`);
      const fullOrder = json?.data || null;
      if (!fullOrder || !Number.isFinite(Number(fullOrder.id))) return fromState;
      const nextOrder = overlayCourierShadowOrder(fullOrder);
      const idx = state.orders.findIndex((order) => Number(order?.id) === Number(fullOrder.id));
      if (idx >= 0) state.orders[idx] = { ...state.orders[idx], ...nextOrder };
      else state.orders.unshift(nextOrder);
      rebuildOrdersStageIndex();
      renderOrders();
      return state.orders.find((order) => Number(order?.id) === Number(fullOrder.id)) || nextOrder;
    } catch (err) {
      console.error(err);
      return fromState;
    }
  }

  async function openEditOrderTab(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const baseOrder = await ensureFullOrderById(id);
    if (!baseOrder) return;

    const tab = ensureOrderTab(baseOrder, { activate: false });
    if (!tab) return;
    tab.mode = "edit";
    tab.title = `№${id}`;
    tab.order = { ...tab.order, ...baseOrder };
    tab.checkoutSession = null;
    tab.checkoutSessionHydrating = true;
    setActiveOrderTab(tab.key, { openMobile: true });
    schedulePersistOrdersCache();
  }

  async function openNewDraftTab() {
    const key = `new:${Date.now()}:${Math.floor(Math.random() * 1000)}`;
    const nextNumber = tabsState.tabs.filter((tab) => tab.type === "order" && normalizeTabMode(tab.mode) === "new").length + 1;
    const title = nextNumber === 1 ? "Новый заказ" : `Новый заказ ${nextNumber}`;
    let checkoutSession = null;
    try {
      const bridge = await getReadyNewOrderBridge();
      if (bridge && typeof bridge.createBlankSession === "function") {
        checkoutSession = bridge.createBlankSession({ title });
      }
    } catch (err) {
      console.error(err);
    }
    const tab = {
      key,
      type: "order",
      mode: "new",
      orderId: null,
      title,
      order: null,
      checkoutSession,
    };
    const activeIdx = tabsState.activeKey
      ? tabsState.tabs.findIndex((row) => row.key === tabsState.activeKey)
      : -1;
    const insertIdx = activeIdx >= 0 ? activeIdx + 1 : tabsState.tabs.length;
    tabsState.tabs.splice(insertIdx, 0, tab);
    setActiveOrderTab(key, { openMobile: true });
    schedulePersistOrdersCache();
  }

  async function findClientIdByPhone(phoneValue) {
    const digits = normalizePhoneDigits(phoneValue);
    if (!digits) return null;

    const localMatch = (state.orders || []).find((order) => normalizePhoneDigits(order?.customer_phone) === digits);
    if (localMatch) {
      const localId = Number(localMatch.customer_id || 0);
      if (Number.isFinite(localId) && localId > 0) return localId;
    }

    const cachedClientMatch = Array.from(state.clientsCache.entries()).find((entry) => {
      const clientData = entry?.[1];
      return normalizePhoneDigits(clientData?.client?.phone) === digits;
    });
    if (cachedClientMatch) {
      const cachedId = Number(cachedClientMatch[0] || 0);
      if (Number.isFinite(cachedId) && cachedId > 0) return cachedId;
    }

    const qs = new URLSearchParams();
    qs.set("limit", "1");
    qs.set("offset", "0");
    qs.set("q", digits);
    const json = await apiJson(`/api/admin/clients?${qs.toString()}`);
    const rows = Array.isArray(json.data) ? json.data : [];
    const match = rows.find((client) => normalizePhoneDigits(client.phone) === digits) || rows[0];
    const id = Number(match?.id || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function getOrderAddressForDisplay(order) {
    if (!order) return "";
    const rawAddress = String(order.address || "").trim();
    if (rawAddress) return rawAddress;
    if (order.pickup_store_address) {
      return order.pickup_store_name
        ? `${order.pickup_store_name}, ${order.pickup_store_address}`
        : String(order.pickup_store_address || "");
    }
    return "";
  }

  function buildClientFallbackSnapshot(order, fallbackName = "", fallbackPhone = "") {
    const name = String(order?.customer_name || fallbackName || "").trim();
    const phone = String(order?.customer_phone || fallbackPhone || "").trim();
    const address = getOrderAddressForDisplay(order);
    const addressComment = String(order?.address_comment || "").trim();
    const client = (name || phone)
      ? {
          name: name || "—",
          phone: phone || "—",
          birthday: null,
          photo: "",
        }
      : null;
    const addresses = address
      ? [{
          address,
          comment: addressComment,
          is_default: 1,
        }]
      : [];
    const orders = order
      ? [{
          id: Number(order.id || 0) || null,
          created_at: order.created_at || null,
          total_price: Number(order.total_price || 0) || 0,
          status_title: String(order.status_title || "").trim(),
        }]
      : [];
    return {
      client,
      addresses,
      orders,
    };
  }

  async function ensureClientTab({ clientId = null, clientPhone = "", clientName = "", activate = true, openMobile = false, fallbackOrder = null } = {}) {
    let normalizedClientId = Number(clientId || 0);
    const normalizedPhone = String(clientPhone || "").trim();
    const fallbackSnapshot = buildClientFallbackSnapshot(fallbackOrder, clientName, normalizedPhone);

    if (!Number.isFinite(normalizedClientId) || normalizedClientId <= 0) {
      if (normalizedPhone) {
        try {
          normalizedClientId = await findClientIdByPhone(normalizedPhone);
        } catch (err) {
          console.error(err);
        }
      }
    }

    const hasClientId = Number.isFinite(normalizedClientId) && normalizedClientId > 0;
    if (!hasClientId && !fallbackSnapshot.client) return null;

    const key = hasClientId
      ? buildClientTabKey(normalizedClientId)
      : `client:fallback:${normalizePhoneDigits(normalizedPhone) || Date.now()}`;
    let tab = tabsState.tabs.find((item) => item.key === key);
    if (!tab) {
      tab = {
        key,
        type: "client",
        clientId: hasClientId ? normalizedClientId : null,
        title: buildClientTabTitle({ name: clientName, phone: normalizedPhone, id: hasClientId ? normalizedClientId : null }),
        fallbackName: String(clientName || "").trim(),
        fallbackPhone: normalizedPhone,
        activeContentTab: "addresses",
        client: fallbackSnapshot.client,
        addresses: null,
        orders: null,
        discounts: null,
        fallbackAddresses: fallbackSnapshot.addresses,
        fallbackOrders: fallbackSnapshot.orders,
        isFallbackOnly: true,
        loading: false,
        error: null,
      };
      tabsState.tabs.push(tab);
    } else {
      tab.clientId = hasClientId ? normalizedClientId : (tab.clientId || null);
      tab.type = "client";
      if (!tab.fallbackName && clientName) tab.fallbackName = String(clientName || "").trim();
      if (!tab.fallbackPhone && normalizedPhone) tab.fallbackPhone = normalizedPhone;
      if (!tab.activeContentTab) tab.activeContentTab = "addresses";
      if (!Array.isArray(tab.fallbackAddresses) || !tab.fallbackAddresses.length) tab.fallbackAddresses = fallbackSnapshot.addresses;
      if (!Array.isArray(tab.fallbackOrders) || !tab.fallbackOrders.length) tab.fallbackOrders = fallbackSnapshot.orders;
      if (!tab.client && fallbackSnapshot.client) tab.client = fallbackSnapshot.client;
      const nextTitle = buildClientTabTitle({
        client: tab.client,
        name: tab.fallbackName,
        phone: tab.fallbackPhone,
        id: tab.clientId,
      });
      if (nextTitle) tab.title = nextTitle;
    }

    if (activate) {
      setActiveOrderTab(key, { openMobile });
    } else {
      renderOrderTabs();
      schedulePersistOrdersCache();
    }

    return tab;
  }

  function syncTabsWithLatestOrders() {
    if (!tabsState.tabs.length) {
      tabsState.activeKey = null;
      renderOrderTabs();
      if (!state.activeOrderId) setInfo(null);
      setOrdersCheckoutLayoutEnabled(false);
      return;
    }

    tabsState.tabs.forEach((tab) => {
      if (tab.type !== "order") return;
      tab.mode = normalizeTabMode(tab.mode);
      if (!Number.isFinite(Number(tab.orderId)) || Number(tab.orderId) <= 0) return;
      const fresh = state.orders.find((o) => Number(o.id) === Number(tab.orderId));
      if (fresh) {
        tab.order = { ...tab.order, ...fresh };
        if (tab.mode === "view") {
          tab.title = buildOrderTabTitle(tab.order);
        }
      }
    });

    if (!tabsState.activeKey || !tabsState.tabs.some((tab) => tab.key === tabsState.activeKey)) {
      tabsState.activeKey = tabsState.tabs[tabsState.tabs.length - 1]?.key || null;
    }

    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    state.activeOrderId = activeTab?.type === "order" && normalizeTabMode(activeTab.mode) === "view"
      ? activeTab.orderId
      : null;

    renderOrderTabs();
    syncActiveOrderRowState();

    if (!activeTab) {
      setInfo(null);
      setOrdersCheckoutLayoutEnabled(false);
      return;
    }

    if (activeTab.type === "client") {
      setOrdersCheckoutLayoutEnabled(false);
      activateClientTab(activeTab).catch(console.error);
      schedulePersistOrdersCache();
      return;
    }

    if (isCheckoutTab(activeTab)) {
      setInfo(null);
      // During background orders polling we must not restore checkout session again,
      // otherwise in-progress draft edits are overwritten by stale tab snapshot.
      captureCheckoutSessionForTab(activeTab);
      setOrdersCheckoutLayoutEnabled(true);
      schedulePersistOrdersCache();
      return;
    }

    const freshActive = state.orders.find((o) => Number(o.id) === Number(activeTab.orderId));
    if (freshActive) {
      activeTab.order = { ...activeTab.order, ...freshActive };
      activeTab.title = buildOrderTabTitle(activeTab.order);
      renderOrderTabs();
    }
    setInfo(freshActive || activeTab.order || null);
    schedulePersistOrdersCache();
  }

  function closeOrderTab(key) {
    const idx = tabsState.tabs.findIndex((tab) => tab.key === key);
    if (idx < 0) return;
    const tabToClose = tabsState.tabs[idx];
    captureCheckoutSessionForTab(tabToClose);
    const wasActive = tabsState.activeKey === key;
    tabsState.tabs.splice(idx, 1);

    if (!tabsState.tabs.length) {
      tabsState.activeKey = null;
      state.activeOrderId = null;
      renderOrderTabs();
      syncActiveOrderRowState();
      setInfo(null);
      setOrdersCheckoutLayoutEnabled(false);
      closeSheet();
      schedulePersistOrdersCache();
      return;
    }

    if (wasActive) {
      const next = tabsState.tabs[idx] || tabsState.tabs[idx - 1] || tabsState.tabs[0];
      if (next) {
        setActiveOrderTab(next.key);
        return;
      }
    }

    renderOrderTabs();
    syncActiveOrderRowState();
    schedulePersistOrdersCache();
  }

  function getTenantIdFromStorage() {
    try {
      const tenantRaw = localStorage.getItem("tenant");
      const tenant = tenantRaw ? JSON.parse(tenantRaw) : null;
      const id = Number(tenant?.id || 0);
      return Number.isFinite(id) && id > 0 ? id : 0;
    } catch {
      return 0;
    }
  }

  function getStoreIdFromStorage() {
    try {
      const activeStoreId = Number(localStorage.getItem("activeStoreId") || 0);
      if (Number.isFinite(activeStoreId) && activeStoreId > 0) return activeStoreId;
    } catch {}
    return 0;
  }

  function ordersCacheKey() {
    return `orders_bootstrap_v${ORDERS_CACHE_VERSION}_a${appVersion}_m${ordersCacheScope}_t${getTenantIdFromStorage()}_s${getStoreIdFromStorage()}`;
  }

  function isLikelyNetworkError(err) {
    const message = String(err?.message || err || "").trim().toLowerCase();
    if (!message) return false;
    return (
      message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("network request failed")
      || message.includes("load failed")
      || message.includes("network error")
      || message.includes("fetch failed")
    );
  }

  function courierOfflineQueueKey() {
    return `courier_offline_queue_v${COURIER_OFFLINE_QUEUE_VERSION}_t${getTenantIdFromStorage()}_s${getStoreIdFromStorage()}`;
  }

  function courierOfflineShadowKey() {
    return `courier_offline_shadow_v${COURIER_OFFLINE_QUEUE_VERSION}_t${getTenantIdFromStorage()}_s${getStoreIdFromStorage()}`;
  }

  function normalizeCourierQueueItem(raw) {
    const type = String(raw?.type || "").trim().toLowerCase();
    if (type !== "status" && type !== "payment") return null;
    const orderId = Number(raw?.orderId || 0);
    if (!(orderId > 0)) return null;
    const request = raw?.request && typeof raw.request === "object" ? raw.request : {};
    const url = String(request.url || "").trim();
    const method = String(request.method || "PUT").trim().toUpperCase() || "PUT";
    if (!url) return null;
    return {
      id: String(raw?.id || `${type}:${orderId}:${Date.now()}:${Math.random()}`).trim(),
      type,
      orderId,
      tenantId: Number(raw?.tenantId || getTenantIdFromStorage() || 0) || 0,
      storeId: Number(raw?.storeId || getStoreIdFromStorage() || 0) || 0,
      createdAt: Number(raw?.createdAt || Date.now()) || Date.now(),
      state: String(raw?.state || "pending").trim().toLowerCase() === "error" ? "error" : "pending",
      error: raw?.error ? String(raw.error) : "",
      request: {
        url,
        method,
        body: request.body && typeof request.body === "object" ? request.body : {},
      },
      optimisticOrder: raw?.optimisticOrder && typeof raw.optimisticOrder === "object"
        ? { ...raw.optimisticOrder }
        : null,
    };
  }

  function readCourierOfflineQueue() {
    try {
      const raw = localStorage.getItem(courierOfflineQueueKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed?.items) ? parsed.items : [])
        .map(normalizeCourierQueueItem)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function readCourierShadowOrders() {
    try {
      const raw = localStorage.getItem(courierOfflineShadowKey());
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed?.orders) ? parsed.orders : [];
      return new Map(
        rows
          .map((row) => {
            const orderId = Number(Array.isArray(row) ? row[0] : 0);
            const order = Array.isArray(row) ? row[1] : null;
            if (!(orderId > 0) || !order || typeof order !== "object") return null;
            return [orderId, { ...order }];
          })
          .filter(Boolean)
      );
    } catch {
      return new Map();
    }
  }

  function persistCourierOfflineState() {
    if (!isCourierWorkspace) return;
    try {
      if (courierOfflineState.queue.length) {
        localStorage.setItem(courierOfflineQueueKey(), JSON.stringify({
          items: courierOfflineState.queue.map((item) => ({
            id: item.id,
            type: item.type,
            orderId: item.orderId,
            tenantId: item.tenantId,
            storeId: item.storeId,
            createdAt: item.createdAt,
            state: item.state,
            error: item.error || "",
            request: item.request,
            optimisticOrder: item.optimisticOrder && typeof item.optimisticOrder === "object"
              ? item.optimisticOrder
              : null,
          })),
        }));
      } else {
        localStorage.removeItem(courierOfflineQueueKey());
      }
    } catch {}

    try {
      if (courierOfflineState.shadowOrders.size) {
        localStorage.setItem(courierOfflineShadowKey(), JSON.stringify({
          orders: Array.from(courierOfflineState.shadowOrders.entries()).map(([orderId, order]) => [
            Number(orderId),
            order && typeof order === "object" ? order : null,
          ]),
        }));
      } else {
        localStorage.removeItem(courierOfflineShadowKey());
      }
    } catch {}
  }

  function getCourierBannerState() {
    if (!isCourierWorkspace) return null;
    const transient = courierOfflineState.transientBanner;
    if (transient) {
      if (!transient.expiresAt || transient.expiresAt > Date.now()) {
        return transient;
      }
      courierOfflineState.transientBanner = null;
    }
    const failedItem = courierOfflineState.queue[0]?.state === "error"
      ? courierOfflineState.queue[0]
      : null;
    if (failedItem) {
      return {
        mode: "error",
        text: failedItem.error ? `Не удалось отправить изменения: ${failedItem.error}` : "Не удалось отправить изменения",
        retry: true,
      };
    }
    if (courierOfflineState.syncError) {
      return {
        mode: "error",
        text: courierOfflineState.syncError,
        retry: true,
      };
    }
    if (courierOfflineState.syncing && courierOfflineState.queue.length) {
      return {
        mode: "syncing",
        text: `Отправляем изменения: ${courierOfflineState.queue.length}`,
        retry: false,
      };
    }
    if (!courierOfflineState.online && courierOfflineState.queue.length) {
      return {
        mode: "offline",
        text: `Нет интернета. Изменения сохранены и будут отправлены: ${courierOfflineState.queue.length}`,
        retry: false,
      };
    }
    if (!courierOfflineState.online) {
      return {
        mode: "offline",
        text: "Нет подключения к интернету",
        retry: false,
      };
    }
    return null;
  }

  function refreshCourierConnectionBanner() {
    if (!isCourierWorkspace || !courierConnectionBanner || !courierConnectionBannerText) return;
    const bannerState = getCourierBannerState();
    courierConnectionBanner.classList.remove(
      "courier-connection-banner--offline",
      "courier-connection-banner--syncing",
      "courier-connection-banner--online",
      "courier-connection-banner--error"
    );
    if (!bannerState) {
      courierConnectionBanner.classList.add("hidden");
      courierConnectionBannerText.textContent = "";
      if (courierConnectionBannerRetryBtn) {
        courierConnectionBannerRetryBtn.classList.add("hidden");
      }
      return;
    }
    courierConnectionBanner.classList.remove("hidden");
    courierConnectionBanner.classList.add(`courier-connection-banner--${bannerState.mode}`);
    courierConnectionBannerText.textContent = String(bannerState.text || "").trim();
    if (courierConnectionBannerRetryBtn) {
      courierConnectionBannerRetryBtn.classList.toggle("hidden", !bannerState.retry);
    }
  }

  function showCourierTransientBanner(mode, text, { retry = false, duration = 2500 } = {}) {
    if (!isCourierWorkspace) return;
    const id = `${Date.now()}:${Math.random()}`;
    courierOfflineState.transientBanner = {
      id,
      mode,
      text,
      retry,
      expiresAt: duration > 0 ? Date.now() + duration : 0,
    };
    refreshCourierConnectionBanner();
    if (duration > 0) {
      setTimeout(() => {
        if (courierOfflineState.transientBanner?.id !== id) return;
        courierOfflineState.transientBanner = null;
        refreshCourierConnectionBanner();
      }, duration + 30);
    }
  }

  function setCourierOnlineState(nextOnline, { showRestored = false } = {}) {
    if (!isCourierWorkspace) return;
    const normalized = nextOnline !== false;
    const prev = courierOfflineState.online;
    courierOfflineState.online = normalized;
    if (!normalized) {
      courierOfflineState.syncing = false;
    }
    if (normalized && !prev && showRestored) {
      showCourierTransientBanner("online", "Подключение восстановлено");
      return;
    }
    refreshCourierConnectionBanner();
  }

  function syncCourierShadowOrdersFromQueue() {
    if (!isCourierWorkspace) return;
    const nextShadowOrders = new Map();
    courierOfflineState.queue.forEach((item) => {
      const orderId = Number(item?.orderId || 0);
      const optimisticOrder = item?.optimisticOrder && typeof item.optimisticOrder === "object"
        ? { ...item.optimisticOrder }
        : null;
      if (!(orderId > 0) || !optimisticOrder) return;
      nextShadowOrders.set(orderId, optimisticOrder);
    });
    courierOfflineState.shadowOrders = nextShadowOrders;
  }

  function getCourierShadowOrder(orderId) {
    if (!isCourierWorkspace) return null;
    return courierOfflineState.shadowOrders.get(Number(orderId || 0)) || null;
  }

  function overlayCourierShadowOrder(order) {
    if (!order || !isCourierWorkspace) return order;
    const shadow = getCourierShadowOrder(order.id);
    return shadow ? { ...order, ...shadow } : order;
  }

  function applyCourierShadowOrdersToState() {
    if (!isCourierWorkspace || !courierOfflineState.shadowOrders.size) return;
    const existingIds = new Set();
    state.orders = (Array.isArray(state.orders) ? state.orders : []).map((order) => {
      const orderId = Number(order?.id || 0);
      if (orderId > 0) existingIds.add(orderId);
      return overlayCourierShadowOrder(order);
    });
    courierOfflineState.shadowOrders.forEach((order, orderId) => {
      if (existingIds.has(Number(orderId || 0))) return;
      if (!order || typeof order !== "object") return;
      state.orders.unshift({ ...order });
    });
  }

  function hydrateCourierOfflineStateFromStorage() {
    if (!isCourierWorkspace) return;
    courierOfflineState.queue = readCourierOfflineQueue();
    courierOfflineState.shadowOrders = readCourierShadowOrders();
    courierOfflineState.syncing = false;
    courierOfflineState.syncError = "";
    courierOfflineState.online = navigator.onLine !== false;
    if (!courierOfflineState.shadowOrders.size && courierOfflineState.queue.length) {
      syncCourierShadowOrdersFromQueue();
      persistCourierOfflineState();
    }
    applyCourierShadowOrdersToState();
    refreshCourierConnectionBanner();
  }

  function resetCourierOfflineRuntimeState() {
    if (!isCourierWorkspace) return;
    courierOfflineState.queue = [];
    courierOfflineState.shadowOrders = new Map();
    courierOfflineState.syncing = false;
    courierOfflineState.syncError = "";
    courierOfflineState.transientBanner = null;
    courierOfflineState.online = navigator.onLine !== false;
    refreshCourierConnectionBanner();
  }

  function queueCourierMutation({ type, orderId, request, optimisticOrder }) {
    if (!isCourierWorkspace) return null;
    const item = normalizeCourierQueueItem({
      id: `${type}:${Number(orderId || 0)}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      type,
      orderId,
      tenantId: getTenantIdFromStorage(),
      storeId: getStoreIdFromStorage(),
      createdAt: Date.now(),
      state: "pending",
      request,
      optimisticOrder,
    });
    if (!item) return null;
    courierOfflineState.queue.push(item);
    courierOfflineState.syncError = "";
    syncCourierShadowOrdersFromQueue();
    persistCourierOfflineState();
    refreshCourierConnectionBanner();
    return item;
  }

  function updateCourierActiveOrderInfo() {
    if (!state.activeOrderId) return;
    const activeOrder = state.orders.find((row) => Number(row?.id || 0) === Number(state.activeOrderId || 0)) || null;
    if (activeOrder) setInfo(activeOrder);
  }

  async function processCourierOfflineQueue({ force = false } = {}) {
    if (!isCourierWorkspace) return;
    if (courierOfflineState.syncing) return;
    if (!courierOfflineState.queue.length) {
      courierOfflineState.syncError = "";
      syncCourierShadowOrdersFromQueue();
      persistCourierOfflineState();
      refreshCourierConnectionBanner();
      return;
    }
    if (!courierOfflineState.online) {
      refreshCourierConnectionBanner();
      return;
    }
    if (courierOfflineState.queue[0]?.state === "error" && !force) {
      refreshCourierConnectionBanner();
      return;
    }

    let processedAny = false;
    courierOfflineState.syncing = true;
    courierOfflineState.syncError = "";
    refreshCourierConnectionBanner();

    while (courierOfflineState.online && courierOfflineState.queue.length) {
      const current = courierOfflineState.queue[0];
      if (!current) break;
      current.state = "pending";
      current.error = "";
      persistCourierOfflineState();
      refreshCourierConnectionBanner();

      try {
        const json = await apiJson(current.request.url, {
          method: current.request.method || "PUT",
          body: current.request.body || {},
        });
        courierOfflineState.queue.shift();
        processedAny = true;
        if (json?.data) {
          handleOrderEvent(json.data);
        }
        syncCourierShadowOrdersFromQueue();
        applyCourierShadowOrdersToState();
        if (isCourierWorkspace) {
          ensureActiveStatusSelection();
          renderStages();
          renderOrders();
          if (tabsState.tabs.length) {
            syncTabsWithLatestOrders();
          } else {
            updateCourierActiveOrderInfo();
          }
        }
        persistCourierOfflineState();
      } catch (err) {
        courierOfflineState.syncing = false;
        if (current) {
          current.state = "pending";
        }
        if (isLikelyNetworkError(err)) {
          setCourierOnlineState(false);
          persistCourierOfflineState();
          refreshCourierConnectionBanner();
          return;
        }
        if (current) {
          current.state = "error";
          current.error = String(err?.message || "API_ERROR");
        }
        courierOfflineState.syncError = "Не удалось отправить изменения";
        persistCourierOfflineState();
        refreshCourierConnectionBanner();
        return;
      }
    }

    courierOfflineState.syncing = false;
    persistCourierOfflineState();
    if (processedAny && courierOfflineState.online) {
      showCourierTransientBanner("online", "Подключение восстановлено");
    } else {
      refreshCourierConnectionBanner();
    }
  }

  function markCourierOfflineFromError(err) {
    if (!isCourierWorkspace) return false;
    if (!isLikelyNetworkError(err)) return false;
    setCourierOnlineState(false);
    return true;
  }

  function readOrdersBootstrapCache() {
    try {
      const raw = localStorage.getItem(ordersCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      if (!(ts > 0) || Date.now() - ts > ORDERS_CACHE_MAX_AGE_MS) return null;
      return parsed?.data && typeof parsed.data === "object" ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function serializeTabForCache(tab) {
    if (!tab || typeof tab !== "object") return null;
    const type = String(tab.type || "");
    if (type !== "order" && type !== "client") return null;
    const out = {
      key: String(tab.key || ""),
      type,
      title: String(tab.title || "").trim(),
    };
    if (type === "order") {
      out.mode = normalizeTabMode(tab.mode);
      const orderId = Number(tab.orderId || 0);
      if (!(Number.isFinite(orderId) && orderId > 0)) return null;
      out.orderId = orderId;
    } else {
      const clientId = Number(tab.clientId || 0);
      out.clientId = Number.isFinite(clientId) && clientId > 0 ? clientId : null;
      out.fallbackName = String(tab.fallbackName || "").trim();
      out.fallbackPhone = String(tab.fallbackPhone || "").trim();
      out.activeContentTab = String(tab.activeContentTab || "addresses");
      if (!out.clientId && !out.fallbackName && !out.fallbackPhone) return null;
    }
    return out.key ? out : null;
  }

  function restoreTabsFromCache(payload) {
    const rows = Array.isArray(payload?.tabs) ? payload.tabs : [];
    const restored = rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const type = String(row.type || "");
        const key = String(row.key || "").trim();
        if (!key || (type !== "order" && type !== "client")) return null;
        if (type === "order") {
          return {
            key,
            type: "order",
            mode: normalizeTabMode(row.mode),
            orderId: Number.isFinite(Number(row.orderId)) && Number(row.orderId) > 0 ? Number(row.orderId) : null,
            title: String(row.title || "").trim() || "Заказ",
            order: row.order && typeof row.order === "object" ? row.order : null,
            checkoutSession: row.checkoutSession && typeof row.checkoutSession === "object" ? row.checkoutSession : null,
          };
        }
        return {
          key,
          type: "client",
          clientId: Number.isFinite(Number(row.clientId)) && Number(row.clientId) > 0 ? Number(row.clientId) : null,
          title: String(row.title || "").trim() || "Клиент",
          fallbackName: String(row.fallbackName || "").trim(),
          fallbackPhone: String(row.fallbackPhone || "").trim(),
          activeContentTab: String(row.activeContentTab || "addresses"),
          isFallbackOnly: row.isFallbackOnly === true,
          client: row.client && typeof row.client === "object" ? row.client : null,
          addresses: Array.isArray(row.addresses) ? row.addresses : null,
          orders: Array.isArray(row.orders) ? row.orders : null,
          discounts: Array.isArray(row.discounts) ? row.discounts : null,
          fallbackAddresses: Array.isArray(row.fallbackAddresses) ? row.fallbackAddresses : [],
          fallbackOrders: Array.isArray(row.fallbackOrders) ? row.fallbackOrders : [],
          loading: false,
          error: null,
        };
      })
      .filter(Boolean);

    tabsState.tabs = restored;
    const activeKey = String(payload?.activeKey || "").trim();
    tabsState.activeKey = restored.some((tab) => tab.key === activeKey)
      ? activeKey
      : (restored[restored.length - 1]?.key || null);
  }

  function restoreUiTabsFromCache(payload) {
    const rows = Array.isArray(payload?.tabs) ? payload.tabs : [];
    const restored = rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const type = String(row.type || "");
        const key = String(row.key || "").trim();
        if (!key || (type !== "order" && type !== "client")) return null;
        if (type === "order") {
          const orderId = Number(row.orderId || 0);
          if (!(Number.isFinite(orderId) && orderId > 0)) return null;
          return {
            key,
            type: "order",
            mode: normalizeTabMode(row.mode),
            orderId,
            title: String(row.title || "").trim() || buildOrderTabTitle({ id: orderId }),
            order: null,
            checkoutSession: null,
          };
        }

        const clientId = Number(row.clientId || 0);
        const fallbackName = String(row.fallbackName || "").trim();
        const fallbackPhone = String(row.fallbackPhone || "").trim();
        if (!(clientId > 0) && !fallbackName && !fallbackPhone) return null;

        return {
          key,
          type: "client",
          clientId: clientId > 0 ? clientId : null,
          title: String(row.title || "").trim() || "РљР»РёРµРЅС‚",
          fallbackName,
          fallbackPhone,
          activeContentTab: String(row.activeContentTab || "addresses"),
          isFallbackOnly: true,
          client: null,
          addresses: null,
          orders: null,
          discounts: null,
          fallbackAddresses: [],
          fallbackOrders: [],
          loading: false,
          error: null,
        };
      })
      .filter(Boolean);

    tabsState.tabs = restored;
    const activeKey = String(payload?.activeKey || "").trim();
    tabsState.activeKey = restored.some((tab) => tab.key === activeKey)
      ? activeKey
      : (restored[restored.length - 1]?.key || null);
  }

  function persistOrdersCacheNow() {
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    if (activeTab) captureCheckoutSessionForTab(activeTab);

    const payload = {
      ts: Date.now(),
      data: {
        activeStatusId: state.activeStatusId,
        storeTimezone: String(state.storeTimezone || "+0"),
        date: {
          start: state.date.start ? toDateKey(state.date.start) : null,
          end: state.date.end ? toDateKey(state.date.end) : null,
          viewYear: Number(state.date.viewYear || 0) || null,
          viewMonth: Number(state.date.viewMonth || 0) || null,
        },
        tabs: tabsState.tabs.map(serializeTabForCache).filter(Boolean),
        activeKey: tabsState.activeKey,
      },
    };

    try {
      localStorage.setItem(ordersCacheKey(), JSON.stringify(payload));
    } catch {}
  }

  function schedulePersistOrdersCache(delay = 140) {
    if (ordersCachePersistTimer) clearTimeout(ordersCachePersistTimer);
    ordersCachePersistTimer = setTimeout(() => {
      ordersCachePersistTimer = null;
      persistOrdersCacheNow();
    }, Math.max(0, Number(delay || 0)));
  }

  function isValidCalendarViewYear(value) {
    const year = Number(value);
    return Number.isInteger(year) && year >= 1970 && year <= 9999;
  }

  function isValidCalendarViewMonth(value) {
    const month = Number(value);
    return Number.isInteger(month) && month >= 0 && month <= 11;
  }

  function isValidCalendarView(year, month) {
    return isValidCalendarViewYear(year) && isValidCalendarViewMonth(month);
  }

  function resetDateStateToToday(baseDate = null) {
    const today = baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
      ? new Date(baseDate)
      : getStoreDateNow(state.storeTimezone || "+0");
    state.date.start = today;
    state.date.end = new Date(today);
    state.date.viewYear = today.getFullYear();
    state.date.viewMonth = today.getMonth();
  }

  function hydrateOrdersFromCache(cache) {
    if (!cache || typeof cache !== "object") return false;
    state.statuses = [];
    state.activeStatusId = cache.activeStatusId != null ? cache.activeStatusId : state.activeStatusId;
    state.orders = [];
    state.activeOrderId = null;
    state.lastEventId = null;
    state.clientsCache = new Map();

    const start = parseDateKey(cache?.date?.start);
    const end = parseDateKey(cache?.date?.end);
    if (start) state.date.start = start;
    if (end) state.date.end = end;
    if (isValidCalendarView(cache?.date?.viewYear, cache?.date?.viewMonth)) {
      state.date.viewYear = Number(cache.date.viewYear);
      state.date.viewMonth = Number(cache.date.viewMonth);
    } else {
      const baseDate = state.date.start || getStoreDateNow(state.storeTimezone || "+0");
      state.date.viewYear = baseDate.getFullYear();
      state.date.viewMonth = baseDate.getMonth();
    }

    restoreUiTabsFromCache(cache);
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    state.activeOrderId = activeTab?.type === "order" && normalizeTabMode(activeTab.mode) === "view"
      ? activeTab.orderId
      : null;
    return true;
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0][0] || "";
    const second = parts[1] ? parts[1][0] : "";
    return (first + second).toUpperCase();
  }

  function toDateKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Get current date in store's timezone
   * Returns a Date object that when accessed with local methods (.getFullYear(), .getDate(), etc.)
   * gives the correct date/time for the store's timezone
   */
  function getStoreDateNow(timezone) {
    const storeOffsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    // Browser offset in hours (positive for east of UTC)
    const browserOffsetHours = -now.getTimezoneOffset() / 60;
    // Difference between store and browser timezones
    const diffHours = storeOffsetHours - browserOffsetHours;
    // Adjust timestamp so that local methods return store's date/time
    return new Date(now.getTime() + diffHours * 60 * 60 * 1000);
  }

  function parseDateKey(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function totalQty(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, it) => acc + Math.max(0, Number(it.qty || it.quantity || 0)), 0);
  }

  function orderItemTotalStr(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n === 0) return '';
    return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
  }

  function roundMoney(val) {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function getOrderItemLineTotal(item) {
    const lineTotal = Number(item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(lineTotal)) return roundMoney(lineTotal);
    const unitPrice = Number(item?.price || 0);
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    return roundMoney(unitPrice * qty);
  }

  function parseOrderDiscountsJson(order) {
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

  function buildOrderDiscountSummary(order) {
    const orderTotal = roundMoney(Number(order?.total_price || 0));
    const deliveryCost = roundMoney(Number(order?.delivery_cost || 0));
    const items = Array.isArray(order?.items) ? order.items : [];
    const discountsList = parseOrderDiscountsJson(order);

    let itemsTotalAfterItemDiscounts = 0;
    let comboDiscount = 0;
    let productDiscount = 0;
    let autoAddDiscount = 0;

    items.forEach((item) => {
      const lineTotal = getOrderItemLineTotal(item);
      itemsTotalAfterItemDiscounts += lineTotal;

      let originalLineTotal = lineTotal;
      const comboOldLineTotal = Number(item?.old_line_total || 0);
      const discountOriginalLineTotal = Number(item?.discount?.original_line_total || 0);
      const oldPrice = Number(item?.old_price || 0);
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const oldPriceLineTotal = oldPrice > 0 ? roundMoney(oldPrice * qty) : 0;

      if (String(item?.type || "") === "combo" && comboOldLineTotal > lineTotal) {
        originalLineTotal = comboOldLineTotal;
      } else if (discountOriginalLineTotal > lineTotal) {
        originalLineTotal = discountOriginalLineTotal;
      } else if (oldPriceLineTotal > lineTotal) {
        originalLineTotal = oldPriceLineTotal;
      }

      const lineDiscount = roundMoney(Math.max(0, originalLineTotal - lineTotal));
      if (!(lineDiscount > 0)) return;

      if (String(item?.type || "") === "combo") {
        comboDiscount += lineDiscount;
      } else if (isAutoAddItem(item)) {
        autoAddDiscount += lineDiscount;
      } else {
        productDiscount += lineDiscount;
      }
    });

    comboDiscount = roundMoney(comboDiscount);
    productDiscount = roundMoney(productDiscount);
    autoAddDiscount = roundMoney(autoAddDiscount);

    const itemsPayableAfterAllDiscounts = roundMoney(Math.max(0, orderTotal - deliveryCost));
    const customerOrderDiscount = roundMoney(
      Math.max(0, itemsTotalAfterItemDiscounts - itemsPayableAfterAllDiscounts)
    );
    const itemLevelDiscount = roundMoney(comboDiscount + productDiscount + autoAddDiscount);
    const calculatedDiscount = roundMoney(itemLevelDiscount + customerOrderDiscount);
    const storedDiscount = roundMoney(Math.max(0, Number(order?.discount_amount || 0)));
    const totalDiscount = storedDiscount > calculatedDiscount ? storedDiscount : calculatedDiscount;
    const subtotalBeforeDiscount = roundMoney(itemsPayableAfterAllDiscounts + totalDiscount);

    const breakdown = [
      { title: "Комбо", amount: comboDiscount },
      { title: "Товарные скидки", amount: productDiscount },
      { title: "Автодобавление", amount: autoAddDiscount },
      { title: "Клиентская скидка", amount: customerOrderDiscount },
    ].filter((entry) => Number(entry.amount || 0) > 0);

    const breakdownTotal = roundMoney(
      breakdown.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );
    const otherDiscount = roundMoney(Math.max(0, totalDiscount - breakdownTotal));
    if (otherDiscount > 0) breakdown.push({ title: "Прочие скидки", amount: otherDiscount });

    const orderDiscountTitles = [];
    discountsList.forEach((entry) => {
      if (String(entry?.apply_to || "").toLowerCase() !== "order") return;
      const title = String(entry?.title || "").trim();
      if (title && !orderDiscountTitles.includes(title)) orderDiscountTitles.push(title);
    });

    return {
      subtotalBeforeDiscount,
      totalDiscount,
      breakdown,
      orderDiscountTitles,
    };
  }

  function renderOrderDiscountBreakdownHtml(summary) {
    if (!summary) return "";
    let html = "";
    const rows = Array.isArray(summary.breakdown) ? summary.breakdown : [];
    rows.forEach((entry) => {
      html += `<div class="order-summary-discount-breakdown-row">`;
      html += `<span class="order-summary-discount-breakdown-label">${escapeHtml(entry.title || "Скидка")}</span>`;
      html += `<span class="order-summary-discount-breakdown-value">-${money(entry.amount || 0)}</span>`;
      html += `</div>`;
    });

    const titles = Array.isArray(summary.orderDiscountTitles) ? summary.orderDiscountTitles : [];
    if (titles.length > 0) {
      html += `<div class="order-summary-discount-breakdown-note">Скидка клиента: ${escapeHtml(titles.join(", "))}</div>`;
    }

    return html;
  }

  function bindOrderSummaryDiscountToggles() {
    infoEls.discountInfoBtn.forEach((btn) => {
      if (!btn || btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const summaryCard = btn.closest(".order-summary");
        if (!summaryCard) return;
        const breakdown = summaryCard.querySelector('[data-info="discount-breakdown"]');
        if (!breakdown) return;
        const willOpen = !breakdown.classList.contains("is-open");
        breakdown.classList.toggle("is-open", willOpen);
        breakdown.classList.toggle("hidden", !willOpen);
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        breakdown.setAttribute("aria-hidden", willOpen ? "false" : "true");
      });
    });
  }

  /** Позиции «Приборы» и прочие auto_add — в конец списка (по флагу или по названию). */
  function isAutoAddItem(item) {
    if (Number(item?.auto_add || 0) === 1) return true;
    const name = String(item?.product_name || item?.name || '').trim().toLowerCase();
    return name === 'приборы';
  }

  function itemsToHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="muted">-</div>';

    const sorted = items.slice().sort((a, b) => {
      const aAuto = isAutoAddItem(a);
      const bAuto = isAutoAddItem(b);
      if (aAuto && !bAuto) return 1;
      if (!aAuto && bAuto) return -1;
      return 0;
    });

    const toCleanPhotos = (value) => (
      (Array.isArray(value) ? value : [])
        .map((src) => String(src || "").trim())
        .filter(Boolean)
        .slice(0, 4)
    );

    const mergeVariantUnit = (label, unit) => {
      const cleanLabel = String(label || "").trim();
      const cleanUnit = String(unit || "").trim();
      if (!cleanLabel) return cleanUnit;
      if (!cleanUnit) return cleanLabel;
      const escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const measureMatch = cleanLabel.match(new RegExp(`^\\s*([\\d.,]+\\s*${escapedUnit})(?:\\b|\\s|$)`, "i"));
      if (measureMatch && String(measureMatch[1] || "").trim()) {
        return String(measureMatch[1] || "").trim();
      }
      const labelLower = cleanLabel.toLowerCase();
      const unitLower = cleanUnit.toLowerCase();
      if (labelLower.endsWith(` ${unitLower}`) || labelLower === unitLower) return cleanLabel;
      return `${cleanLabel} ${cleanUnit}`.trim();
    };

    const normalizeVariantUnitLabel = (unitRaw) => {
      const raw = String(unitRaw || "").trim();
      if (!raw) return "";
      const key = raw.toLowerCase();
      const dict = {
        "штук": "шт",
        "штука": "шт",
        "шт": "шт",
        "грамм": "г",
        "грамма": "г",
        "гр": "г",
        "г": "г",
        "килограмм": "кг",
        "килограмма": "кг",
        "кг": "кг",
        "миллилитр": "мл",
        "миллилитра": "мл",
        "мл": "мл",
        "литр": "л",
        "литра": "л",
        "л": "л",
      };
      const safeDict = {
        "\u0448\u0442\u0443\u043a": "\u0448\u0442",
        "\u0448\u0442\u0443\u043a\u0430": "\u0448\u0442",
        "\u0448\u0442": "\u0448\u0442",
        "\u0433\u0440\u0430\u043c\u043c": "\u0433",
        "\u0433\u0440\u0430\u043c\u043c\u0430": "\u0433",
        "\u0433\u0440": "\u0433",
        "\u0433": "\u0433",
        "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c": "\u043a\u0433",
        "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c\u0430": "\u043a\u0433",
        "\u043a\u0433": "\u043a\u0433",
        "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440": "\u043c\u043b",
        "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440\u0430": "\u043c\u043b",
        "\u043c\u043b": "\u043c\u043b",
        "\u043b\u0438\u0442\u0440": "\u043b",
        "\u043b\u0438\u0442\u0440\u0430": "\u043b",
        "\u043b": "\u043b",
      };
      return safeDict[key] || dict[key] || raw;
    };

    const extractVariantUnitFromGroupTitle = (groupTitleRaw) => {
      const groupTitle = String(groupTitleRaw || "").trim();
      if (!groupTitle) return "";
      const match = groupTitle.match(/\(([^)]+)\)\s*$/);
      if (!match) return "";
      return normalizeVariantUnitLabel(String(match[1] || "").trim());
    };

    const formatQtyUnitName = (qtyRaw, unitRaw, nameRaw) => {
      const qtyNum = Number(qtyRaw);
      const qtyText = Number.isFinite(qtyNum)
        ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
        : String(qtyRaw ?? "").trim();
      const unitText = String(unitRaw || "").trim();
      const nameText = String(nameRaw || "").trim();
      return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
    };

    const renderThumbHtml = (photosRaw, altRaw) => {
      const photos = toCleanPhotos(photosRaw);
      if (!photos.length) return "";
      const alt = escapeHtml(String(altRaw || ""));
      if (photos.length === 1) {
        return `<div class="order-item-photo-small"><img src="${escapeHtml(photos[0])}" alt="${alt}" /></div>`;
      }
      const p1 = photos[0] || "";
      const p2 = photos[1] || "";
      const p3 = photos[2] || "";
      const p4 = photos[3] || "";
      const slots = [p1, p3, p4, p2];
      return `
        <div class="order-item-photo-small">
          <span class="new-order-right-cart-thumb-grid">
            ${slots.map((src) => src
              ? `<img src="${escapeHtml(src)}" alt="" />`
              : `<span class="new-order-right-cart-thumb-cell-empty"></span>`
            ).join("")}
          </span>
        </div>
      `;
    };

    const compositionPrimaryLine = (text) => `<div class="order-item-composition-item order-item-composition-item-primary">${escapeHtml(String(text || "").trim())}</div>`;
    const compositionSubLine = (text) => `<div class="order-item-composition-item order-item-composition-item-sub">&bull; ${escapeHtml(String(text || "").trim())}</div>`;

    return sorted.map((it, itemIdx) => {
      if (String(it?.type || "") === "combo") {
        const nameRaw = String(it?.name || it?.combo_title || "Combo");
        const name = escapeHtml(nameRaw);
        const qty = Math.max(1, Number(it?.qty || it?.quantity || 0));
        const lineTotal = Number(it?.line_total ?? it?.total ?? it?.total_price ?? 0);
        const oldLineTotal = Number(it?.old_line_total || 0);
        const showOldPrice = oldLineTotal > lineTotal;
        const priceHtml = showOldPrice
          ? `<span class="order-item-old-price">${money(oldLineTotal)}</span><span class="order-item-price-current">${money(lineTotal)}</span>`
          : `<span class="order-item-price-current">${money(lineTotal)}</span>`;
        const titleHtml = `${qty} x ${name}`;
        const photoHtml = renderThumbHtml(it?.photos, nameRaw);

        const selections = Array.isArray(it?.selections) ? it.selections : [];
        const compositionRows = [];
        selections.forEach((sel) => {
          const productName = String(sel?.product_name || "").trim();
          const variantHead = mergeVariantUnit(sel?.variant_label, sel?.variant_unit);
          const primaryLine = [variantHead, productName].filter(Boolean).join(" ").trim();
          if (primaryLine) compositionRows.push(compositionPrimaryLine(`1 x ${primaryLine}`));

          const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
          ingredientsDisplay.forEach((ing) => {
            const ingQty = ing?.qty ?? ing?.quantity;
            const ingNumQty = Number(ingQty);
            if (!Number.isFinite(ingNumQty) || ingNumQty <= 0) return;
            const text = formatQtyUnitName(ingQty, ing?.unit, ing?.name);
            if (text) compositionRows.push(compositionSubLine(text));
          });
        });
        const comboDetailsHtml = compositionRows.length
          ? `<div class="order-item-composition">${compositionRows.join("")}</div>`
          : "";

        return `
          <div class="order-item order-item--combo" data-item-idx="${itemIdx}">
            <div class="order-item-line">
              ${photoHtml}
              <div class="order-item-content">
                <div class="order-item-title">${titleHtml}</div>
                ${comboDetailsHtml}
                <div class="order-item-footer">
                  <div class="order-item-price">${priceHtml}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      const nameRaw = String(it?.product_name || it?.name || "Item");
      const qty = Math.max(1, Number(it?.qty || it?.quantity || 0));
      const price = Number(it?.price || 0);
      const lineTotal = Number(it?.line_total ?? it?.total ?? it?.total_price ?? price * qty ?? 0);
      const oldLineTotal = Number(it?.discount?.original_line_total || 0);
      const showOldPrice = oldLineTotal > lineTotal;
      const priceHtml = showOldPrice
        ? `<span class="order-item-old-price">${money(oldLineTotal)}</span><span class="order-item-price-current">${money(lineTotal)}</span>`
        : `<span class="order-item-price-current">${money(lineTotal)}</span>`;
      const variantLines = [];
      const variants = Array.isArray(it?.variants) ? it.variants : [];
      variants.forEach((v) => {
        const value = String(v?.label || v?.value || "").trim();
        const unit = String(
          v?.unit ||
          v?.unit_short_title ||
          v?.unitLabel ||
          v?.unit_title ||
          extractVariantUnitFromGroupTitle(v?.group_title || v?.groupTitle || "")
        ).trim();
        let line = mergeVariantUnit(value, unit);
        if (line) variantLines.push(line);
      });
      const rawFallbackVariantLabel = String(it?.variant_label || it?.variantLabel || "").trim();
      let fallbackVariantValue = rawFallbackVariantLabel;
      if (fallbackVariantValue.includes(":")) {
        const valueOnly = String(fallbackVariantValue.split(":").slice(1).join(":")).trim();
        fallbackVariantValue = valueOnly || fallbackVariantValue;
      }
      const fallbackVariantLine = mergeVariantUnit(
        fallbackVariantValue,
        it?.variant_unit ||
        it?.variantUnit ||
        extractVariantUnitFromGroupTitle(variants[0]?.group_title || variants[0]?.groupTitle || "")
      );
      if (!variantLines.length && fallbackVariantLine) {
        variantLines.push(fallbackVariantLine);
      } else if (variantLines.length && fallbackVariantLine) {
        const primaryLine = String(variantLines[0] || "").trim();
        const primaryLower = primaryLine.toLowerCase();
        const fallbackLower = fallbackVariantLine.toLowerCase();
        if (
          primaryLine &&
          fallbackLower !== primaryLower &&
          fallbackLower.startsWith(`${primaryLower} `)
        ) {
          variantLines[0] = fallbackVariantLine;
        }
      }
      const primaryVariantLine = variantLines.length ? variantLines[0] : "";
      const titleText = [primaryVariantLine, nameRaw].filter(Boolean).join(" ").trim() || nameRaw;
      const titleHtml = `${qty} x ${escapeHtml(titleText)}`;
      const photoHtml = renderThumbHtml(it?.photos, nameRaw);

      const lines = [];
      if (variantLines.length > 1) lines.push(...variantLines.slice(1));

      const ingredients = (Array.isArray(it?.ingredients) ? it.ingredients : [])
        .filter((ing) => Number(ing?.quantity ?? ing?.qty ?? 0) > 0);
      ingredients.forEach((ing) => {
        const ingQty = ing?.quantity ?? ing?.qty;
        const ingUnit = ing?.unit_label || ing?.unit || ing?.unitLabel || ing?.unit_short_title || ing?.unit_title || "";
        const ingName = ing?.name || "Ingredient";
        const line = formatQtyUnitName(ingQty, ingUnit, ingName);
        if (line) lines.push(line);
      });

      const options = (Array.isArray(it?.options) ? it.options : [])
        .filter((opt) => Number(opt?.qty ?? opt?.quantity ?? 0) > 0);
      options.forEach((opt) => {
        const variant = mergeVariantUnit(opt?.variant_label || opt?.variantLabel, opt?.variant_unit || opt?.variantUnit);
        const qtyText = Math.max(1, Number(opt?.qty || opt?.quantity || 1));
        const title = String(opt?.title || "Option").trim();
        const line = variant ? `${variant} ${title}`.trim() : `${qtyText} ${title}`.trim();
        if (line) lines.push(line);
      });

      const subHtml = lines.length
        ? `<div class="order-item-composition">${lines.map(compositionSubLine).join("")}</div>`
        : "";

      return `
        <div class="order-item" data-item-idx="${itemIdx}">
          <div class="order-item-line">
            ${photoHtml}
            <div class="order-item-content">
              <div class="order-item-title">${titleHtml}</div>
              ${subHtml}
              <div class="order-item-footer">
                <div class="order-item-price">${priceHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
  function initOrderItemPhotos() {
    if (!infoEls.itemsList || !infoEls.itemsList.length) return;
    
    infoEls.itemsList.forEach((container) => {
      if (!container) return;
      
      // Обработчики для каждого товара (проверяем, что еще не инициализирован)
      container.querySelectorAll('[data-item-photos]:not([data-photos-initialized])').forEach((photoContainer) => {
        const uniqueId = photoContainer.getAttribute('data-item-photos');
        const mainImg = photoContainer.querySelector('.order-item-photo-img');
        const thumbsContainer = photoContainer.querySelector(`[data-thumbs="${uniqueId}"]`);
        const prevBtn = photoContainer.querySelector('.order-item-photo-prev');
        const nextBtn = photoContainer.querySelector('.order-item-photo-next');
        const thumbsPrevBtn = photoContainer.querySelector('.order-item-thumbs-prev');
        const thumbsNextBtn = photoContainer.querySelector('.order-item-thumbs-next');
        
        if (!mainImg) return;
        
        // Помечаем как инициализированный
        photoContainer.setAttribute('data-photos-initialized', 'true');
        
        // Получаем все фото из миниатюр
        const thumbs = thumbsContainer ? Array.from(thumbsContainer.querySelectorAll('.order-item-photo-thumb')) : [];
        const photos = thumbs.map(thumb => {
          const img = thumb.querySelector('img');
          return img ? img.src : null;
        }).filter(Boolean);
        
        if (photos.length <= 1) return;
        
        let currentIdx = 0;
        
        function setActivePhoto(idx) {
          if (idx < 0 || idx >= photos.length) return;
          currentIdx = idx;
          mainImg.src = photos[idx];
          mainImg.setAttribute('data-photo-idx', String(idx));
          
          // Обновляем активную миниатюру
          thumbs.forEach((thumb, i) => {
            thumb.classList.toggle('is-active', i === idx);
          });
          
          // Прокручиваем миниатюры к активной
          if (thumbsContainer && thumbs[idx]) {
            const thumb = thumbs[idx];
            const containerRect = thumbsContainer.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();
            
            if (thumbRect.left < containerRect.left) {
              thumbsContainer.scrollLeft -= (containerRect.left - thumbRect.left + 10);
            } else if (thumbRect.right > containerRect.right) {
              thumbsContainer.scrollLeft += (thumbRect.right - containerRect.right + 10);
            }
          }
        }
        
        // Навигация стрелками на главном фото
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            setActivePhoto((currentIdx - 1 + photos.length) % photos.length);
          });
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            setActivePhoto((currentIdx + 1) % photos.length);
          });
        }
        
        // Клик на миниатюру
        thumbs.forEach((thumb, idx) => {
          thumb.addEventListener('click', () => {
            setActivePhoto(idx);
          });
        });
        
        // Листание миниатюр стрелками
        if (thumbsPrevBtn && thumbsContainer) {
          thumbsPrevBtn.addEventListener('click', () => {
            thumbsContainer.scrollBy({ left: -80, behavior: 'smooth' });
          });
        }
        
        if (thumbsNextBtn && thumbsContainer) {
          thumbsNextBtn.addEventListener('click', () => {
            thumbsContainer.scrollBy({ left: 80, behavior: 'smooth' });
          });
        }
      });
    });
  }

  function paymentIcon(code) {
    if (!code) return "fa-credit-card";
    const c = String(code).toLowerCase();
    if (c.includes("cash")) return "fa-money-bill-wave";
    if (c.includes("card")) return "fa-credit-card";
    if (c.includes("online")) return "fa-globe";
    return "fa-credit-card";
  }

  function getOrderNumber(order) {
    const orderId = Number(order?.id || 0);
    if (Number.isFinite(orderId) && orderId > 0) return String(orderId);
    const publicId = String(order?.public_id || "").trim();
    return publicId || "—";
  }

  function isPaidOrder(order) {
    return Number(order?.is_paid || 0) === 1;
  }

  function getOrderRefundState(order) {
    if (sharedOrderPayment?.getRefundState) return sharedOrderPayment.getRefundState(order);
    return String(order?.refund_state || "").trim().toLowerCase();
  }

  function getOrderRefundStateTitle(order) {
    if (sharedOrderPayment?.getRefundStateTitle) return sharedOrderPayment.getRefundStateTitle(order);
    const state = getOrderRefundState(order);
    if (state === "full") return "Возвращено";
    if (state === "partial") return "Частичный возврат";
    return "";
  }

  function getOrderRefundableTotal(order) {
    const explicit = Number(order?.refundable_total);
    if (Number.isFinite(explicit)) return explicit;
    if (!isPaidOrder(order)) return 0;
    return Number(order?.total_price || 0) || 0;
  }

  function hasOrderRefundableBalance(order) {
    return isPaidOrder(order) && getOrderRefundableTotal(order) > 0.001;
  }

  function isOrderFullyRefunded(order) {
    if (!isPaidOrder(order)) return false;
    const refundedTotal = Number(order?.refunded_total || 0) || 0;
    return getOrderRefundState(order) === "full" || (refundedTotal > 0 && getOrderRefundableTotal(order) <= 0.001);
  }

  function hasOrderRefunds(order) {
    const refundedTotal = Number(order?.refunded_total || 0) || 0;
    const refundsCount = Number(order?.refunds_count || 0) || 0;
    return refundedTotal > 0 || refundsCount > 0;
  }

  function getDisplayOrder(order) {
    if (!order || !hasOrderRefunds(order)) return order;
    const remainingOrder = order?.remaining_order;
    if (!remainingOrder || typeof remainingOrder !== "object") return order;
    return {
      ...order,
      ...remainingOrder,
    };
  }

  function getOrderDisplayTotal(order) {
    const displayOrder = getDisplayOrder(order) || order;
    return Number(displayOrder?.total_price || displayOrder?.total || 0) || 0;
  }

  function isOrderPrintable(order) {
    const displayOrder = getDisplayOrder(order);
    return !!displayOrder && Array.isArray(displayOrder.items) && displayOrder.items.length > 0;
  }

  function getOrderPaymentActionLabel(order) {
    if (!order || !Number(order?.id || 0)) return "Принять оплату";
    if (!isPaidOrder(order)) return "Принять оплату";
    if (isOrderFullyRefunded(order)) return "Возвращено";
    return "Оплачено / Возврат";
  }

  function resolveOrderPaymentIcon(order) {
    const stored = String(order?.payment_icon || "").trim();
    if (stored) return stored;
    return normalizeIconClass(paymentIcon(order?.payment_code));
  }

  function renderOrderPaymentIcon(order) {
    const iconValue = resolveOrderPaymentIcon(order);
    if (!iconValue) return `<i class="fas ${escapeHtml(paymentIcon(order?.payment_code))}"></i>`;
    if (isIconUrl(iconValue)) {
      return `<img src="${escapeHtml(iconValue)}" alt="" loading="lazy">`;
    }
    const iconClass = normalizeIconClass(iconValue);
    if (!iconClass) return `<i class="fas ${escapeHtml(paymentIcon(order?.payment_code))}"></i>`;
    return `<i class="${escapeHtml(iconClass)}"></i>`;
  }

  function setTextAll(list, value) {
    list.forEach((el) => {
      if (!el) return;
      el.textContent = value;
    });
  }

  function setHtmlAll(list, value) {
    list.forEach((el) => {
      if (!el) return;
      el.innerHTML = value;
    });
  }

  function setHiddenAll(list, hidden) {
    list.forEach((el) => {
      if (!el) return;
      el.classList.toggle("hidden", hidden);
    });
  }

  function setAttrAll(list, name, value) {
    list.forEach((el) => {
      if (!el) return;
      if (value === null || value === undefined) {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, value);
      }
    });
  }

  function getSortedStatuses() {
    return [...state.statuses]
      .filter((status) => Number.isFinite(Number(status?.id)) && Number(status.id) > 0)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || Number(a.id) - Number(b.id));
  }

  function createOrdersStageIndex() {
    return {
      all: [],
      byStatus: Object.create(null),
    };
  }

  function getActiveStageMeta() {
    if (state.activeStatusId === "all") {
      return { id: "all", title: "Все заказы" };
    }
    if (isCourierWorkspace) {
      return courierBucketDefs.find((bucket) => String(bucket.id) === String(state.activeStatusId)) || null;
    }
    const statusId = Number(state.activeStatusId);
    return Number.isFinite(statusId) && statusId > 0 ? (getStatusMetaById(statusId) || null) : null;
  }

  function getActiveStageTitle() {
    return String(getActiveStageMeta()?.title || (isCourierWorkspace ? "Заказы" : "Все заказы")).trim() || "Заказы";
  }

  function updateOrdersToolbarTitle() {
    if (!ordersToolbarTitle || isCourierWorkspace) return;
    ordersToolbarTitle.textContent = getActiveStageTitle();
  }

  function rebuildOrdersStageIndex() {
    const index = createOrdersStageIndex();
    const source = Array.isArray(state.orders) ? state.orders : [];
    source.forEach((order) => {
      index.all.push(order);
      const statusId = extractOrderStatusId(order);
      if (!statusId) return;
      const key = String(statusId);
      if (!Array.isArray(index.byStatus[key])) {
        index.byStatus[key] = [];
      }
      index.byStatus[key].push(order);
    });
    state.ordersStageIndex = index;
  }

  function getOrdersForActiveStage() {
    if (isCourierWorkspace) {
      return (Array.isArray(state.orders) ? state.orders : []).filter(orderMatchesFilters);
    }
    if (state.activeStatusId === "all") {
      return Array.isArray(state.ordersStageIndex?.all) ? state.ordersStageIndex.all : [];
    }
    return Array.isArray(state.ordersStageIndex?.byStatus?.[String(state.activeStatusId)])
      ? state.ordersStageIndex.byStatus[String(state.activeStatusId)]
      : [];
  }

  function reorderOrdersWithinActiveStage(draggedId, targetId) {
    const stageOrders = getOrdersForActiveStage().slice();
    const fromIndex = stageOrders.findIndex((order) => Number(order?.id || 0) === Number(draggedId || 0));
    const toIndex = stageOrders.findIndex((order) => Number(order?.id || 0) === Number(targetId || 0));
    if (fromIndex < 0 || toIndex < 0) return null;

    const [moved] = stageOrders.splice(fromIndex, 1);
    stageOrders.splice(toIndex, 0, moved);

    const stageIds = new Set(stageOrders.map((order) => Number(order?.id || 0)).filter((id) => id > 0));
    let cursor = 0;
    state.orders = (Array.isArray(state.orders) ? state.orders : []).map((order) => (
      stageIds.has(Number(order?.id || 0)) ? stageOrders[cursor++] : order
    ));
    rebuildOrdersStageIndex();
    return stageOrders;
  }

  function getActiveOrder() {
    if (!state.activeOrderId) return null;
    const orderId = Number(state.activeOrderId);
    const fromState = state.orders.find((o) => Number(o.id) === orderId);
    if (fromState) return fromState;
    const activeTab = tabsState.tabs.find((tab) => Number(tab.orderId) === orderId);
    return activeTab?.order || null;
  }

  function syncOrderPaymentFooter(order) {
    if (!orderInfoPaymentButtons.length) return;
    const hasOrder = Number(order?.id || 0) > 0;
    const label = getOrderPaymentActionLabel(order);
    orderInfoPaymentButtons.forEach((button) => {
      if (!button) return;
      button.disabled = !hasOrder || isOrderFullyRefunded(order);
      const labelEl = button.querySelector("span");
      if (labelEl) labelEl.textContent = label;
      else button.textContent = label;
    });
  }

  function buildOptimisticOrderStatusSnapshot(order, nextStatusId) {
    if (!order || !(Number(order?.id || 0) > 0) || !(Number(nextStatusId || 0) > 0)) return null;
    const targetStatusMeta = getStatusMetaById(nextStatusId) || null;
    const optimisticOrder = { ...order, status_id: Number(nextStatusId) };
    if (targetStatusMeta) {
      if (targetStatusMeta.title != null) optimisticOrder.status_title = targetStatusMeta.title;
      if (targetStatusMeta.code != null) optimisticOrder.status_code = targetStatusMeta.code;
      if (targetStatusMeta.color != null) optimisticOrder.status_color = targetStatusMeta.color;
    }
    return optimisticOrder;
  }

  function buildOptimisticOrderPaymentSnapshot(order, payload) {
    if (!order || !(Number(order?.id || 0) > 0) || !payload || typeof payload !== "object") return null;
    const optimisticOrder = { ...order, is_paid: 1 };
    const paymentCode = String(payload.payment_code || optimisticOrder.payment_code || "").trim();
    if (paymentCode) {
      optimisticOrder.payment_code = paymentCode;
      const paymentMeta = sharedOrderPayment?.getPaymentMethodMeta
        ? sharedOrderPayment.getPaymentMethodMeta(paymentCode, optimisticOrder)
        : null;
      if (paymentMeta?.title) optimisticOrder.payment_title = paymentMeta.title;
      if (paymentMeta?.icon) optimisticOrder.payment_icon = paymentMeta.icon;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "change_from")) {
      const changeFrom = Number(payload.change_from || 0);
      optimisticOrder.change_from = Number.isFinite(changeFrom) && changeFrom > 0 ? changeFrom : null;
    }
    return optimisticOrder;
  }

  function applyLocalCourierOrderSnapshot(order) {
    if (!order || !isCourierWorkspace) return null;
    handleOrderEvent(order, { localOnly: true, skipStageRefresh: true });
    return state.orders.find((row) => Number(row?.id || 0) === Number(order.id || 0)) || order;
  }

  async function openOrderPaymentDialog(order) {
    const orderId = Number(order?.id || 0);
    if (!(orderId > 0) || isOrderFullyRefunded(order)) return;
    if (isCourierWorkspace && !courierOfflineState.online && isPaidOrder(order)) {
      showCourierTransientBanner("error", "Возврат доступен только при интернете.", { duration: 3200 });
      return;
    }

    if (!sharedOrderPayment || typeof sharedOrderPayment.open !== "function") {
      if (isPaidOrder(order)) return;
      try {
        const json = await apiJson(`/api/admin/orders/${orderId}/paid`, {
          method: "PUT",
          body: { is_paid: 1 },
        });
        if (json?.data) handleOrderEvent(json.data);
      } catch (err) {
        console.error("orders payment update error:", err);
      }
      return;
    }

    const offlineCapable = isCourierWorkspace && !isPaidOrder(order);
    const useOfflineCollection = offlineCapable && !courierOfflineState.online;

    if (!offlineCapable) {
      return sharedOrderPayment.open({
        order,
        apiJson,
        money,
        formatDateTimeNumeric,
        getOrderId: (row) => Number(row?.id || 0),
        getOrderNumber,
        isPaidOrder,
        onSuccess(updatedOrder) {
          if (updatedOrder) handleOrderEvent(updatedOrder);
        },
        onError(err) {
          console.error("orders payment modal error:", err);
        },
      });
    }

    return sharedOrderPayment.open({
      order,
      apiJson,
      money,
      formatDateTimeNumeric,
      getOrderId: (row) => Number(row?.id || 0),
      getOrderNumber,
      isPaidOrder,
      cacheOnlyPaymentMethods: !courierOfflineState.online,
      submitPayload: async ({ payload }) => {
        const liveOrder = state.orders.find((row) => Number(row?.id || 0) === orderId) || order;
        const optimisticOrder = buildOptimisticOrderPaymentSnapshot(liveOrder, payload);
        if (!optimisticOrder) {
          throw new Error("PAYMENT_PAYLOAD_INVALID");
        }
        const appliedOrder = applyLocalCourierOrderSnapshot(optimisticOrder);
        const queueRequest = {
          url: `/api/admin/orders/${orderId}/paid`,
          method: "PUT",
          body: payload,
        };

        if (!courierOfflineState.online) {
          queueCourierMutation({
            type: "payment",
            orderId,
            request: queueRequest,
            optimisticOrder: appliedOrder || optimisticOrder,
          });
          refreshCourierConnectionBanner();
          return appliedOrder || optimisticOrder;
        }

        try {
          const json = await apiJson(queueRequest.url, {
            method: queueRequest.method,
            body: queueRequest.body,
          });
          if (json?.data) handleOrderEvent(json.data);
          return json?.data || appliedOrder || optimisticOrder;
        } catch (err) {
          if (markCourierOfflineFromError(err)) {
            queueCourierMutation({
              type: "payment",
              orderId,
              request: queueRequest,
              optimisticOrder: appliedOrder || optimisticOrder,
            });
            refreshCourierConnectionBanner();
            return appliedOrder || optimisticOrder;
          }
          try {
            await loadAndRenderOrders(true);
          } catch (syncErr) {
            console.error(syncErr);
          }
          throw err;
        }
      },
      onSuccess() {},
      onError(err) {
        if (String(err?.message || "") === "PAYMENT_METHODS_OFFLINE_UNAVAILABLE") {
          showCourierTransientBanner("error", "Нет интернета. Способы оплаты ещё не сохранены.", { duration: 3200 });
          return;
        }
        console.error("orders payment modal error:", err);
      },
    });

    let paymentPayload = null;
    try {
      paymentPayload = await sharedOrderPayment.open({
        order,
        apiJson,
        money,
        formatDateTimeNumeric,
        getOrderId: (row) => Number(row?.id || 0),
        getOrderNumber,
        isPaidOrder,
        collectPayloadOnly: true,
        cacheOnlyPaymentMethods: useOfflineCollection,
        onError(err) {
          if (String(err?.message || "") === "PAYMENT_METHODS_OFFLINE_UNAVAILABLE") {
            showCourierTransientBanner("error", "Нет интернета. Способы оплаты ещё не сохранены.", { duration: 3200 });
            return;
          }
          console.error("orders payment modal error:", err);
        },
      });
    } catch (err) {
      console.error("orders payment modal error:", err);
      return;
    }
    if (!paymentPayload) return;

    const optimisticOrder = buildOptimisticOrderPaymentSnapshot(order, paymentPayload);
    if (!optimisticOrder) return;
    const appliedOrder = applyLocalCourierOrderSnapshot(optimisticOrder);
    const queueRequest = {
      url: `/api/admin/orders/${orderId}/paid`,
      method: "PUT",
      body: paymentPayload,
    };

    if (!courierOfflineState.online) {
      queueCourierMutation({
        type: "payment",
        orderId,
        request: queueRequest,
        optimisticOrder: appliedOrder || optimisticOrder,
      });
      refreshCourierConnectionBanner();
      return;
    }

    try {
      const json = await apiJson(queueRequest.url, {
        method: queueRequest.method,
        body: queueRequest.body,
      });
      if (json?.data) handleOrderEvent(json.data);
    } catch (err) {
      if (markCourierOfflineFromError(err)) {
        queueCourierMutation({
          type: "payment",
          orderId,
          request: queueRequest,
          optimisticOrder: appliedOrder || optimisticOrder,
        });
        refreshCourierConnectionBanner();
        return;
      }
      try {
        await loadAndRenderOrders(true);
      } catch (syncErr) {
        console.error(syncErr);
      }
      console.error("orders payment update error:", err);
    }
  }

  function setStatusControlsDisabled(disabled) {
    $$('[data-action="order-status-next"]').forEach((btn) => {
      btn.disabled = disabled;
    });
    $$('[data-action="order-status-menu-toggle"]').forEach((btn) => {
      btn.disabled = disabled;
    });
    $$('[data-action="order-row-status-next"]').forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function closeInlineStatusMenus() {
    $$('[data-role="order-inline-status"]').forEach((wrap) => {
      wrap.classList.remove("is-open");
    });
    $$('[data-role="order-status-menu"]').forEach((dropdown) => {
      dropdown.classList.add("hidden");
    });
    $$('[data-action="order-status-menu-toggle"]').forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function renderInlineStatusMenus(order) {
    const statusMenus = $$('[data-role="order-status-menu"]');
    if (!statusMenus.length) return;

    const sortedStatuses = getSortedStatuses();
    const currentStatusId = Number(order?.status_id || 0);
    const currentStatus = getStatusMetaById(currentStatusId) || null;
    const optionsHtml = sortedStatuses.filter((status) => !isForbiddenStatusTransition(currentStatus, status)).map((status) => {
      const statusId = Number(status.id);
      const title = escapeHtml(status.title || "—");
      const isSelected = statusId === currentStatusId ? " is-selected" : "";
      return `
        <button
          class="order-status-inline-option${isSelected}"
          type="button"
          data-action="order-status-menu-select"
          data-status-id="${statusId}"
          role="option"
          aria-selected="${statusId === currentStatusId ? "true" : "false"}"
        >
          ${title}
        </button>
      `;
    }).join("");

    statusMenus.forEach((dropdown) => {
      dropdown.innerHTML = optionsHtml;
    });
    closeInlineStatusMenus();
  }

  async function updateOrderStatus(orderId, statusId) {
    const id = Number(orderId || 0);
    const nextStatusId = Number(statusId || 0);
    if (!(id > 0) || !(nextStatusId > 0)) return;

    const orderIdx = state.orders.findIndex((row) => Number(row?.id || 0) === id);
    const prevOrder = orderIdx >= 0 ? state.orders[orderIdx] : null;
    const prevStatusId = Number(prevOrder?.status_id || 0);
    const prevStatusMeta = getStatusMetaById(prevStatusId) || null;
    const optimisticOrder = buildOptimisticOrderStatusSnapshot(prevOrder, nextStatusId);
    const targetStatusMeta = getStatusMetaById(nextStatusId) || null;
    if (isForbiddenStatusTransition(prevStatusMeta, targetStatusMeta)) return;
    let optimisticApplied = false;
    let appliedOrder = null;

    if (optimisticOrder && prevStatusId !== nextStatusId) {
      state.orders[orderIdx] = optimisticOrder;
      rebuildOrdersStageIndex();
      const countersChanged = applyStageCountersDelta(prevOrder, optimisticOrder);
      if (countersChanged) renderStages();
      renderOrders();
      setStatusControlsDisabled(true);
      if (tabsState.tabs.length) {
        syncTabsWithLatestOrders();
      } else if (state.activeOrderId) {
        const activeOrder = state.orders.find((row) => Number(row?.id || 0) === Number(state.activeOrderId || 0)) || null;
        if (activeOrder) setInfo(activeOrder);
      }
      optimisticApplied = true;
      appliedOrder = state.orders[orderIdx] || optimisticOrder;
    }

    const request = {
      url: `/api/admin/orders/${id}/status`,
      method: "PUT",
      body: { status_id: nextStatusId },
    };

    if (isCourierWorkspace && optimisticApplied && !courierOfflineState.online) {
      queueCourierMutation({
        type: "status",
        orderId: id,
        request,
        optimisticOrder: appliedOrder || optimisticOrder,
      });
      refreshCourierConnectionBanner();
      return;
    }

    try {
      await apiJson(request.url, {
        method: request.method,
        body: request.body,
      });
    } catch (err) {
      if (isCourierWorkspace && optimisticApplied && markCourierOfflineFromError(err)) {
        queueCourierMutation({
          type: "status",
          orderId: id,
          request,
          optimisticOrder: appliedOrder || optimisticOrder,
        });
        refreshCourierConnectionBanner();
        return;
      }
      if (optimisticApplied && prevOrder) {
        const rollbackIdx = state.orders.findIndex((row) => Number(row?.id || 0) === id);
        if (rollbackIdx >= 0) {
          state.orders[rollbackIdx] = prevOrder;
        } else {
          state.orders.push(prevOrder);
        }
        rebuildOrdersStageIndex();
      }
      try {
        await loadStatuses();
        renderStages();
        await loadAndRenderOrders(true);
      } catch (syncErr) {
        console.error(syncErr);
      }
      throw err;
    }
  }

  async function cycleActiveOrderStatus() {
    const order = getActiveOrder();
    const orderId = Number(order?.id || state.activeOrderId || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return;

    const nextStatus = getNextStatusMetaForOrder(order);
    const nextStatusId = Number(nextStatus?.id || 0);
    if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;

    setStatusControlsDisabled(true);
    try {
      await updateOrderStatus(orderId, nextStatusId);
    } finally {
      setStatusControlsDisabled(false);
    }
  }

  async function selectActiveOrderStatus(statusId) {
    const order = getActiveOrder();
    const orderId = Number(order?.id || state.activeOrderId || 0);
    const nextStatusId = Number(statusId || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;
    if (Number(order?.status_id || 0) === nextStatusId) {
      closeInlineStatusMenus();
      return;
    }

    setStatusControlsDisabled(true);
    try {
      await updateOrderStatus(orderId, nextStatusId);
    } finally {
      setStatusControlsDisabled(false);
      closeInlineStatusMenus();
    }
  }

  bindOrderSummaryDiscountToggles();

  function hideOrderClientEditingControls() {
    clientSurfaces.forEach((dom) => {
      if (dom?.editNameBtn) dom.editNameBtn.classList.add("hidden");
      if (dom?.addrToggleBtn) dom.addrToggleBtn.classList.add("hidden");
      if (dom?.addrFormCard) dom.addrFormCard.classList.add("hidden");
    });
  }

  hideOrderClientEditingControls();

  function createClientDomRefs(root = document) {
    return {
      root,
      infoWrap: $("#clientInfoWrap", root),
      photo: $("#clientPhoto", root),
      photoPlaceholder: $("#clientPhotoPlaceholder", root),
      infoName: $("#clientInfoName", root),
      infoPhone: $("#clientInfoPhone", root),
      infoBirthday: $("#clientInfoBirthday", root),
      contentTabs: $("#clientContentTabs", root),
      tabAddresses: $("#clientTabAddresses", root),
      tabOrders: $("#clientTabOrders", root),
      tabDiscounts: $("#clientTabDiscounts", root),
      addressesList: $("#clientAddresses", root),
      ordersList: $("#clientOrdersList", root),
      ordersListView: $("#clientOrdersListView", root),
      orderDetailView: $("#clientOrderDetailView", root),
      discountsList: $("#clientDiscountsList", root),
      discountsEmpty: $("#clientDiscountsEmpty", root),
      editNameBtn: $("#clientEditNameBtn", root),
      addrToggleBtn: $("#clientAddrToggleBtn", root),
      addrFormCard: $("#clientAddrFormCard", root),
    };
  }

  function setSheetTitle(text) {
    if (!sheetTitleEl) return;
    sheetTitleEl.textContent = String(text || "Информация").trim() || "Информация";
  }

  function hideClientSurfaces() {
    clientSurfaces.forEach((dom) => {
      if (dom?.infoWrap) dom.infoWrap.classList.add("hidden");
    });
  }

  function showEmptyInfo() {
    if (sharedOrderInfoRenderers.length) {
      sharedOrderInfoRenderers.forEach((renderer) => renderer.showEmpty());
      hideClientSurfaces();
      setSheetTitle("Информация");
      return;
    }
    setHiddenAll(infoEls.empty, false);
    setHiddenAll(infoEls.content, true);
    hideClientSurfaces();
    orderInfoFooters.forEach((footer) => footer.classList.add("hidden"));
    setSheetTitle("Информация");
  }

  function showOrderInfo() {
    if (sharedOrderInfoRenderers.length) {
      sharedOrderInfoRenderers.forEach((renderer) => renderer.showOrder());
      hideClientSurfaces();
      setSheetTitle("Информация");
      return;
    }
    setHiddenAll(infoEls.empty, true);
    setHiddenAll(infoEls.content, false);
    hideClientSurfaces();
    orderInfoFooters.forEach((footer) => footer.classList.remove("hidden"));
    setSheetTitle("Информация");
  }

  function showClientInfo(surface = "desktop") {
    setHiddenAll(infoEls.empty, true);
    setHiddenAll(infoEls.content, true);
    hideClientSurfaces();
    const targetDom = surface === "sheet" ? sheetClientDom : desktopClientDom;
    if (targetDom?.infoWrap) targetDom.infoWrap.classList.remove("hidden");
    orderInfoFooters.forEach((footer) => footer.classList.add("hidden"));
    setSheetTitle(surface === "sheet" ? "Клиент" : "Информация");
  }

  function formatClientDate(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("ru-RU");
  }

  function formatClientDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setClientPhoto(photoUrl, domRefs = desktopClientDom) {
    if (!domRefs) return;
    const src = String(photoUrl || "").trim();
    if (src) {
      if (domRefs.photo) {
        domRefs.photo.src = src;
        domRefs.photo.classList.remove("hidden");
      }
      if (domRefs.photoPlaceholder) domRefs.photoPlaceholder.classList.add("hidden");
      return;
    }
    if (domRefs.photo) {
      domRefs.photo.removeAttribute("src");
      domRefs.photo.classList.add("hidden");
    }
    if (domRefs.photoPlaceholder) domRefs.photoPlaceholder.classList.remove("hidden");
  }

  function getActiveClientTab() {
    const tab = tabsState.tabs.find((item) => item.key === tabsState.activeKey);
    if (!tab || tab.type !== "client") return null;
    return tab;
  }

  function setClientContentTab(tabName, domRefs = desktopClientDom) {
    const nextTab = ["addresses", "orders", "discounts"].includes(String(tabName || ""))
      ? String(tabName)
      : "addresses";
    const activeClientTab = getActiveClientTab();
    if (activeClientTab) activeClientTab.activeContentTab = nextTab;

    if (domRefs?.contentTabs) {
      $$("[data-ctab]", domRefs.contentTabs).forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.ctab === nextTab);
      });
    }

    [domRefs?.tabAddresses, domRefs?.tabOrders, domRefs?.tabDiscounts].forEach((panel) => {
      if (!panel) return;
      panel.classList.toggle("is-active", panel.dataset.ctab === nextTab);
    });

    if (domRefs?.ordersListView) domRefs.ordersListView.classList.remove("hidden");
    if (domRefs?.orderDetailView) domRefs.orderDetailView.classList.add("hidden");
  }

  function bindClientContentTabs(domRefs = desktopClientDom) {
    if (!domRefs?.contentTabs || domRefs.contentTabs.dataset.bound === "1") return;
    domRefs.contentTabs.dataset.bound = "1";
    domRefs.contentTabs.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-ctab]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      setClientContentTab(btn.dataset.ctab, domRefs);
    });
  }

  bindClientContentTabs(desktopClientDom);
  bindClientContentTabs(sheetClientDom);

  function renderClientAddressesHtml(addresses) {
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length) return '<div class="muted" style="padding:4px 0;">Адресов пока нет.</div>';

    return list.map((address) => {
      const main = [address?.street, address?.house].map((v) => String(v || "").trim()).filter(Boolean).join(", ");
      const details = [];
      if (address?.entrance) details.push(`подъезд ${address.entrance}`);
      if (address?.floor) details.push(`этаж ${address.floor}`);
      if (address?.apartment) details.push(`кв ${address.apartment}`);
      const fullAddress = [main, details.join(", ")].filter(Boolean).join(", ") || String(address?.address || "—");
      const isDefault = Number(address?.is_default || 0) === 1;
      const commentText = String(address?.comment || "").trim();

      return `
        <div class="shop-profile-card shop-profile-card--compact">
          <div class="shop-address-card">
            <div class="shop-address-card-main">
              <div class="shop-address-card-title">
                ${escapeHtml(fullAddress)}
                ${isDefault ? '<span class="muted"> • основной</span>' : ""}
              </div>
              ${commentText ? `<div class="shop-address-card-sub">${escapeHtml(commentText)}</div>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderClientOrdersHistoryHtml(clientOrders) {
    const list = Array.isArray(clientOrders) ? clientOrders : [];
    if (!list.length) return '<div class="muted" style="padding:4px 0;">Заказов пока нет.</div>';

    return list.map((order) => {
      const orderId = Number(order?.id || 0);
      const title = Number.isFinite(orderId) && orderId > 0 ? `Заказ #${orderId}` : "Заказ";
      const statusTitle = String(order?.status_title || "").trim();
      const metaParts = [formatClientDateTime(order?.created_at)];
      if (statusTitle) metaParts.push(statusTitle);
      const openAttrs = Number.isFinite(orderId) && orderId > 0
        ? ` data-action="open-order-from-client" data-order-id="${escapeHtml(orderId)}" role="button" tabindex="0"`
        : "";

      return `
        <div class="shop-profile-card order-client-history-card"${openAttrs}>
          <div><strong>${escapeHtml(title)}</strong></div>
          <div class="muted">${escapeHtml(metaParts.join(" • "))}</div>
          <div><strong>${escapeHtml(money(order?.total_price || 0))}</strong></div>
        </div>
      `;
    }).join("");
  }

  function renderClientDiscountsHtml(discounts) {
    const list = Array.isArray(discounts) ? discounts : [];
    if (!list.length) return "";

    return list.map((discount) => {
      const valueText = discount.discount_type === "percent"
        ? `${discount.discount_value}%`
        : discount.discount_type === "fixed"
          ? `-${discount.discount_value}₽`
          : `${discount.discount_value}₽`;
      const linkTypeText = discount.link_type === "direct"
        ? "Напрямую"
        : `Категория: ${discount.category_title || "—"}`;
      const statusClass = discount.is_active ? "" : "inactive";

      return `
        <div class="discount-row">
          <div class="discount-row-icon"><i class="fas fa-percentage"></i></div>
          <div class="discount-row-info">
            <div class="discount-row-title">${escapeHtml(discount.title || "Скидка")}</div>
            <div class="discount-row-meta">${escapeHtml(linkTypeText)}</div>
          </div>
          <div class="discount-row-value">${escapeHtml(valueText)}</div>
          <div class="discount-row-status ${statusClass}"></div>
        </div>
      `;
    }).join("");
  }

  function renderClientTabState(tab, { loading = false, error = "" } = {}, domRefs = desktopClientDom) {
    if (!domRefs) return;
    const client = tab?.client || null;
    const fallbackName = String(tab?.fallbackName || "").trim();
    const fallbackPhone = String(tab?.fallbackPhone || "").trim();
    const fallbackAddresses = Array.isArray(tab?.fallbackAddresses) ? tab.fallbackAddresses : [];
    const fallbackOrders = Array.isArray(tab?.fallbackOrders) ? tab.fallbackOrders : [];

    if (domRefs.infoName) domRefs.infoName.textContent = client?.name || fallbackName || "—";
    if (domRefs.infoPhone) {
      const phoneValue = client?.phone || fallbackPhone || "—";
      domRefs.infoPhone.textContent = formatPhoneDigitsToRU(phoneValue);
    }
    if (domRefs.infoBirthday) domRefs.infoBirthday.textContent = formatClientDate(client?.birthday);
    setClientPhoto(client?.photo || "", domRefs);
    setClientContentTab(tab?.activeContentTab || "addresses", domRefs);

    if (loading) {
      if (domRefs.addressesList) domRefs.addressesList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (domRefs.ordersList) domRefs.ordersList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (domRefs.discountsList) domRefs.discountsList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (domRefs.discountsEmpty) domRefs.discountsEmpty.classList.add("hidden");
      return;
    }

    if (error) {
      const errorHtml = `<div class="muted" style="padding:4px 0 8px;">${escapeHtml(error)}</div>`;
      if (domRefs.addressesList) {
        domRefs.addressesList.innerHTML = fallbackAddresses.length
          ? `${errorHtml}${renderClientAddressesHtml(fallbackAddresses)}`
          : `<div class="muted">${escapeHtml(error)}</div>`;
      }
      if (domRefs.ordersList) {
        domRefs.ordersList.innerHTML = fallbackOrders.length
          ? `${errorHtml}${renderClientOrdersHistoryHtml(fallbackOrders)}`
          : `<div class="muted">${escapeHtml(error)}</div>`;
      }
      if (domRefs.discountsList) domRefs.discountsList.innerHTML = "";
      if (domRefs.discountsEmpty) domRefs.discountsEmpty.classList.add("hidden");
      return;
    }

    const addresses = Array.isArray(tab?.addresses) && tab.addresses.length ? tab.addresses : fallbackAddresses;
    const orders = Array.isArray(tab?.orders) && tab.orders.length ? tab.orders : fallbackOrders;
    if (domRefs.addressesList) domRefs.addressesList.innerHTML = renderClientAddressesHtml(addresses);
    if (domRefs.ordersList) domRefs.ordersList.innerHTML = renderClientOrdersHistoryHtml(orders);
    const discounts = Array.isArray(tab?.discounts) ? tab.discounts : [];
    if (domRefs.discountsList) domRefs.discountsList.innerHTML = renderClientDiscountsHtml(discounts);
    if (domRefs.discountsEmpty) domRefs.discountsEmpty.classList.toggle("hidden", discounts.length > 0);
  }

  async function loadClientTabData(tab, { forceReload = false } = {}) {
    if (!tab || tab.type !== "client") return;
    if (tab.loading) return;
    if (!forceReload && !tab.isFallbackOnly && tab.client && Array.isArray(tab.addresses) && Array.isArray(tab.orders) && Array.isArray(tab.discounts)) return;
    if (!(Number(tab.clientId || 0) > 0)) return;

    tab.loading = true;
    tab.error = null;
    const activeSurface = tabsState.activeKey === tab.key && isMobile() && sheetClientDom ? "sheet" : "desktop";
    const activeClientDom = activeSurface === "sheet" ? sheetClientDom : desktopClientDom;
    if (tabsState.activeKey === tab.key) {
      showClientInfo(activeSurface);
      renderClientTabState(tab, { loading: true }, activeClientDom);
    }

    try {
      const [clientRes, addressesRes, ordersRes, discountsRes] = await Promise.allSettled([
        apiJson(`/api/admin/clients/${tab.clientId}`),
        apiJson(`/api/admin/clients/${tab.clientId}/addresses`),
        apiJson(`/api/admin/clients/${tab.clientId}/orders`),
        apiJson(`/api/admin/clients/${tab.clientId}/discounts`),
      ]);

      if (clientRes.status !== "fulfilled") throw clientRes.reason || new Error("CLIENT_LOAD_FAILED");
      if (addressesRes.status !== "fulfilled") throw addressesRes.reason || new Error("CLIENT_ADDRESSES_LOAD_FAILED");
      if (ordersRes.status !== "fulfilled") throw ordersRes.reason || new Error("CLIENT_ORDERS_LOAD_FAILED");

      tab.client = clientRes.value?.data || null;
      tab.addresses = Array.isArray(addressesRes.value?.data) ? addressesRes.value.data : [];
      tab.orders = Array.isArray(ordersRes.value?.data) ? ordersRes.value.data : [];
      tab.discounts = discountsRes.status === "fulfilled" && Array.isArray(discountsRes.value?.data)
        ? discountsRes.value.data
        : [];
      tab.isFallbackOnly = false;
      tab.error = null;
      tab.title = buildClientTabTitle({
        client: tab.client,
        name: tab.fallbackName,
        phone: tab.fallbackPhone,
        id: tab.clientId,
      });
      state.clientsCache.set(Number(tab.clientId), {
        client: tab.client,
        addresses: tab.addresses,
        orders: tab.orders,
        discounts: tab.discounts,
      });
      renderOrderTabs();
      schedulePersistOrdersCache();
      if (tabsState.activeKey === tab.key) {
        showClientInfo(activeSurface);
        renderClientTabState(tab, {}, activeClientDom);
      }
    } catch (error) {
      console.error(error);
      tab.error = navigator.onLine === false
        ? "Нет интернета. Показываем доступные офлайн-данные."
        : "Не удалось загрузить данные клиента";
      if (tabsState.activeKey === tab.key) {
        showClientInfo(activeSurface);
        renderClientTabState(tab, { error: tab.error }, activeClientDom);
      }
    } finally {
      tab.loading = false;
    }
  }

  async function activateClientTab(tab, { openMobile = false, forceReload = false } = {}) {
    if (!tab || tab.type !== "client") return;
    const activeSurface = openMobile && isMobile() && sheetClientDom ? "sheet" : "desktop";
    const activeClientDom = activeSurface === "sheet" ? sheetClientDom : desktopClientDom;

    const cached = state.clientsCache.get(Number(tab.clientId));
    if (cached && (!tab.client || tab.isFallbackOnly)) {
      tab.client = cached.client || null;
      tab.addresses = Array.isArray(cached.addresses) ? cached.addresses : [];
      tab.orders = Array.isArray(cached.orders) ? cached.orders : [];
      tab.discounts = Array.isArray(cached.discounts) ? cached.discounts : [];
      tab.isFallbackOnly = false;
      tab.title = buildClientTabTitle({
        client: tab.client,
        name: tab.fallbackName,
        phone: tab.fallbackPhone,
        id: tab.clientId,
      });
      renderOrderTabs();
    }

    showClientInfo(activeSurface);
    renderClientTabState(tab, {
      loading: Number(tab.clientId || 0) > 0 && (tab.isFallbackOnly || !tab.client || !Array.isArray(tab.addresses) || !Array.isArray(tab.orders) || !Array.isArray(tab.discounts)),
    }, activeClientDom);
    await loadClientTabData(tab, { forceReload });

    if (openMobile && isMobile()) openSheet();
  }

  function setInfo(order) {
    syncOrderPaymentFooter(order);
    if (sharedOrderInfoRenderers.length) {
      hideClientSurfaces();
      setSheetTitle("Информация");
      sharedOrderInfoRenderers.forEach((renderer) => renderer.setOrder(order));
      return;
    }
    if (!order) {
      showEmptyInfo();
      setTextAll(infoEls.title, "Заказ не выбран");
      setTextAll(infoEls.meta, "Выберите заказ слева.");
      setHiddenAll(infoEls.meta, true);
      setTextAll(infoEls.status, "?");
      setTextAll(infoEls.clientName, "?");
      setTextAll(infoEls.clientPhone, "?");
      setTextAll(infoEls.clientAvatar, "?");
      setAttrAll(infoEls.clientPhone, "href", null);
      setAttrAll(infoEls.clientPhone, "data-action", null);
      setAttrAll(infoEls.clientPhone, "data-client-id", null);
      setAttrAll(infoEls.clientPhone, "data-client-phone", null);
      setAttrAll(infoEls.clientPhone, "data-client-name", null);
      setTextAll(infoEls.payMethod, "?");
      setTextAll(infoEls.total, "?");
      setTextAll(infoEls.deliveryType, "?");
      setTextAll(infoEls.deliveryDatetime, "?");
      setTextAll(infoEls.deliveryQty, "0 шт.");
      setTextAll(infoEls.deliveryInterval, "?");
      setTextAll(infoEls.deliveryAddressTitle, "Адрес доставки");
      setTextAll(infoEls.deliveryAddress, "?");
      setHtmlAll(infoEls.itemsList, '<div class="muted">?</div>');
      setHiddenAll(infoEls.deliveryUrgent, true);
      setHiddenAll(infoEls.deliveryIntervalRow, true);
      setHiddenAll(infoEls.deliveryAddressComment, true);
      setHiddenAll(infoEls.orderCommentBlock, true);
      setHiddenAll(infoEls.clientExtra, true);
      setHiddenAll(infoEls.discountInfoBtn, true);
      setHtmlAll(infoEls.discountBreakdown, "");
      setHiddenAll(infoEls.discountBreakdown, true);
      setAttrAll(infoEls.discountInfoBtn, "aria-expanded", "false");
      setAttrAll(infoEls.discountBreakdown, "aria-hidden", "true");
      renderInlineStatusMenus(null);
      return;
    }

    showOrderInfo();

    setTextAll(infoEls.title, `ЗАКАЗ #${order.id}`);
    setTextAll(infoEls.meta, formatDateTimeNumeric(order.created_at) || "—");
    setHiddenAll(infoEls.meta, false);
    setTextAll(infoEls.status, order.status_title || "?");
    renderInlineStatusMenus(order);

    const clientName = order.customer_name || "?";
    const clientPhone = order.customer_phone || "?";
    setTextAll(infoEls.clientName, clientName);
    setTextAll(infoEls.clientPhone, clientPhone);
    setTextAll(infoEls.clientAvatar, initials(clientName));
    const clientId = Number(order.customer_id || 0);
    const clientPhoneRaw = String(order.customer_phone || "").trim();
    const clientPhoneValue = clientPhoneRaw === "?" ? "" : clientPhoneRaw;
    const canOpenClientTab = (Number.isFinite(clientId) && clientId > 0) || !!clientPhoneValue;
    setAttrAll(infoEls.clientPhone, "href", canOpenClientTab ? "#" : null);
    setAttrAll(infoEls.clientPhone, "data-action", canOpenClientTab ? "open-client" : null);
    setAttrAll(infoEls.clientPhone, "data-client-id", canOpenClientTab && clientId > 0 ? String(clientId) : null);
    setAttrAll(infoEls.clientPhone, "data-client-phone", canOpenClientTab ? clientPhoneValue : null);
    setAttrAll(infoEls.clientPhone, "data-client-name", canOpenClientTab ? String(clientName || "").trim() : null);

    const clientExtra = order.customer_comment || order.customer_source || "";
    setTextAll(infoEls.clientExtra, clientExtra);
    setHiddenAll(infoEls.clientExtra, !clientExtra);

    const payTitle = order.payment_title || "?";
    setTextAll(infoEls.payMethod, payTitle);
    const isDelivery = order.method_code === "delivery";
    const deliveryCost = Number(order.delivery_cost || 0);
    setTextAll(infoEls.deliveryCost, money(deliveryCost));
    setHiddenAll(infoEls.deliveryRow, !isDelivery);
    setTextAll(infoEls.total, money(order.total_price || 0));
    infoEls.payIcon.forEach((el) => {
      if (!el) return;
      el.innerHTML = `<i class="fas ${paymentIcon(order.payment_code)}"></i>`;
    });

    const changeFrom = order.change_from;
    const orderTotalNum = Number(order.total_price) || 0;
    const hasChange = changeFrom && changeFrom > orderTotalNum;
    const changeAmountVal = hasChange ? changeFrom - orderTotalNum : 0;
    setTextAll(infoEls.changeFrom, money(changeFrom || 0));
    setTextAll(infoEls.changeAmount, money(changeAmountVal));
    setHiddenAll(infoEls.changeFromRow, !changeFrom);
    setHiddenAll(infoEls.changeAmountRow, !changeFrom);

    const discountSummary = buildOrderDiscountSummary(order);
    const discountAmount = Number(discountSummary.totalDiscount || 0);
    const hasDiscount = discountAmount > 0;
    setTextAll(infoEls.subtotal, money(discountSummary.subtotalBeforeDiscount || 0));
    setTextAll(infoEls.discountAmount, `-${money(discountAmount)}`);
    setHiddenAll(infoEls.subtotalRow, !hasDiscount);
    setHiddenAll(infoEls.discountRow, !hasDiscount);

    const hasBreakdown = hasDiscount && (
      (Array.isArray(discountSummary.breakdown) && discountSummary.breakdown.length > 0) ||
      (Array.isArray(discountSummary.orderDiscountTitles) && discountSummary.orderDiscountTitles.length > 0)
    );
    setHiddenAll(infoEls.discountInfoBtn, !hasBreakdown);
    setHtmlAll(
      infoEls.discountBreakdown,
      hasBreakdown ? renderOrderDiscountBreakdownHtml(discountSummary) : ""
    );
    infoEls.discountBreakdown.forEach((el) => {
      if (!el) return;
      el.classList.remove("is-open");
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    });
    infoEls.discountInfoBtn.forEach((btn) => {
      if (!btn) return;
      btn.setAttribute("aria-expanded", "false");
    });

    const qty = totalQty(order.items || []);
    setTextAll(infoEls.deliveryQty, `${qty} шт.`);

    const methodTitle = order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка");
    setTextAll(infoEls.deliveryType, methodTitle || "?");
    setTextAll(infoEls.deliveryDatetime, formatDateTime(order.created_at) || "?");

    const deliverySectionTitle = order.method_code === "pickup" ? "Адрес самовывоза" : "Адрес доставки";
    setTextAll(infoEls.deliveryAddressTitle, deliverySectionTitle);

    const intervalText = formatScheduleText(order, { includeTitle: false }) || String(order.time_option_title || "").trim();
    setTextAll(infoEls.deliveryInterval, intervalText || "—");
    setHiddenAll(infoEls.deliveryIntervalRow, !intervalText);

    const urgent = Boolean(order.is_urgent || order.urgent || order.time_option_code === "urgent");
    setHiddenAll(infoEls.deliveryUrgent, !urgent);

    // Для самовывоза показываем адрес точки, для доставки - адрес клиента
    let address = order.address;
    if (!address && order.pickup_store_address) {
      address = order.pickup_store_name
        ? `${order.pickup_store_name}, ${order.pickup_store_address}`
        : order.pickup_store_address;
    }
    setTextAll(infoEls.deliveryAddress, address || "?");

    const addressComment = order.address_comment || "";
    setTextAll(infoEls.deliveryAddressCommentText, addressComment);
    setHiddenAll(infoEls.deliveryAddressComment, !addressComment);

    const orderComment = order.comment || "";
    setTextAll(infoEls.orderCommentText, orderComment);
    setHiddenAll(infoEls.orderCommentBlock, !orderComment);

    setHtmlAll(infoEls.itemsList, itemsToHtml(order.items || []));
    
    // Инициализируем листание фото после рендеринга
    setTimeout(() => {
      initOrderItemPhotos();
    }, 0);
  }

  // -----------------------------
  // Sheet
  // -----------------------------
  function openSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.add("is-open");
    backdrop.classList.add("is-active");
    sheet.setAttribute("aria-hidden", "false");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-active");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sheet-open");
  }

  // -----------------------------
  // Render: stages
  // -----------------------------
  function stageButton({ id, title, icon, count }) {
    const btn = document.createElement("button");
    btn.className = "stage-item";
    btn.type = "button";
    btn.setAttribute("data-status-id", String(id));

    btn.innerHTML = `
      <span class="stage-icon"><i class="fas ${escapeHtml(icon)}"></i></span>
      <span class="stage-text">
        <strong>${escapeHtml(title)}</strong>
      </span>
      <span class="stage-count">${escapeHtml(count)}</span>
    `;

    btn.addEventListener("click", () => {
      state.activeStatusId = id;
      syncActiveStage();
      if (isCourierWorkspace) {
        if (!tabsState.tabs.length) {
          state.activeOrderId = null;
          setInfo(null);
        }
        renderOrders();
        schedulePersistOrdersCache();
        return;
      }
      if (!tabsState.tabs.length) {
        const activeOrder = state.activeOrderId
          ? state.orders.find((order) => Number(order?.id || 0) === Number(state.activeOrderId || 0)) || null
          : null;
        if (!activeOrder || !orderMatchesFilters(activeOrder)) {
          state.activeOrderId = null;
          setInfo(null);
        } else {
          setInfo(activeOrder);
        }
      }
      renderOrders();
      schedulePersistOrdersCache();
    });

    return btn;
  }

  function syncActiveStage() {
    if (!elStagesList) return;
    $$(".stage-item", elStagesList).forEach((b) => {
      const id = b.getAttribute("data-status-id");
      const active = String(state.activeStatusId) === String(id);
      b.classList.toggle("is-active", active);
    });
    updateOrdersToolbarTitle();
  }

  function clearStageDropover() {
    if (!elStagesList) return;
    $$(".stage-item.is-dropover", elStagesList).forEach((btn) => {
      btn.classList.remove("is-dropover");
    });
  }

  function setStageDropover(stageBtn) {
    if (!elStagesList || !stageBtn) return;
    $$(".stage-item.is-dropover", elStagesList).forEach((btn) => {
      if (btn !== stageBtn) btn.classList.remove("is-dropover");
    });
    stageBtn.classList.add("is-dropover");
  }

  function removeOrderDragGhost() {
    if (orderDragGhostEl && orderDragGhostEl.parentNode) {
      orderDragGhostEl.parentNode.removeChild(orderDragGhostEl);
    }
    orderDragGhostEl = null;
  }

  function buildOrderDragGhost(orderIds) {
    const ids = Array.isArray(orderIds)
      ? orderIds.map((id) => Number(id || 0)).filter((id) => id > 0)
      : [];
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return null;

    const cardSize = 56;
    const stackStep = 12;
    const snakeOffset = 10;

    const ghostStack = document.createElement("div");
    ghostStack.className = "order-drag-ghost-stack";

    const maxIndent = uniqueIds.length > 1 ? snakeOffset : 0;
    ghostStack.style.width = `${cardSize + maxIndent}px`;
    ghostStack.style.height = `${cardSize + stackStep * Math.max(uniqueIds.length - 1, 0)}px`;

    uniqueIds.forEach((id, index) => {
      const card = document.createElement("div");
      card.className = "order-drag-ghost";
      card.style.left = `${index % 2 === 0 ? 0 : snakeOffset}px`;
      card.style.top = `${index * stackStep}px`;
      card.style.zIndex = String(index + 1);
      card.textContent = String(id);
      ghostStack.appendChild(card);
    });

    return ghostStack;
  }

  function wireDragTargets() {
    if (!elStagesList || isCourierWorkspace) return;

    $$(".stage-item", elStagesList).forEach((stageBtn) => {
      stageBtn.addEventListener("dragover", (e) => {
        if (!Array.isArray(state.draggingOrderIds) || !state.draggingOrderIds.length) return;
        e.preventDefault();
        setStageDropover(stageBtn);
      });
      stageBtn.addEventListener("dragleave", () => {
        if (!Array.isArray(state.draggingOrderIds) || !state.draggingOrderIds.length) {
          stageBtn.classList.remove("is-dropover");
          return;
        }
        stageBtn.classList.remove("is-dropover");
      });
      stageBtn.addEventListener("drop", async (e) => {
        e.preventDefault();
        clearStageDropover();

        const statusIdRaw = stageBtn.getAttribute("data-status-id");
        const statusId = Number(statusIdRaw);

        if (!Number.isFinite(statusId) || statusId <= 0) return;

        const orderIds = getDraggingOrderIdsFromEvent(e);
        if (!orderIds.length) return;

        try {
          const targetStatusMeta = getStatusMetaById(statusId) || null;
          const requestOrderIds = [];
          let countersChanged = false;

          for (const orderId of orderIds) {
            const idNum = Number(orderId || 0);
            if (!(idNum > 0)) continue;

            const idx = state.orders.findIndex((row) => Number(row?.id || 0) === idNum);
            const current = idx >= 0 ? state.orders[idx] : null;
            if (current && Number(current?.status_id || 0) === statusId) continue;

            requestOrderIds.push(idNum);
            if (!current) continue;

            const optimisticOrder = { ...current, status_id: statusId };
            if (targetStatusMeta) {
              if (targetStatusMeta.title != null) optimisticOrder.status_title = targetStatusMeta.title;
              if (targetStatusMeta.code != null) optimisticOrder.status_code = targetStatusMeta.code;
              if (targetStatusMeta.color != null) optimisticOrder.status_color = targetStatusMeta.color;
            }

            state.orders[idx] = optimisticOrder;
            countersChanged = applyStageCountersDelta(current, optimisticOrder) || countersChanged;
          }
          if (!requestOrderIds.length) return;
          rebuildOrdersStageIndex();

          requestOrderIds.forEach((id) => state.selectedOrderIds.delete(Number(id)));

          if (countersChanged) renderStages();
          renderOrders();
          if (tabsState.tabs.length) {
            syncTabsWithLatestOrders();
          } else if (state.activeOrderId) {
            const activeOrder = state.orders.find((row) => Number(row?.id || 0) === Number(state.activeOrderId || 0)) || null;
            if (activeOrder) setInfo(activeOrder);
          }

          await Promise.all(
            requestOrderIds.map((orderId) => apiJson(`/api/admin/orders/${orderId}/status`, {
              method: "PUT",
              body: { status_id: statusId },
            }))
          );
        } catch (err) {
          console.error(err);
          try {
            await loadStatuses();
            renderStages();
            await loadAndRenderOrders(true);
          } catch (syncErr) {
            console.error(syncErr);
          }
        }
      });
    });
  }

  function renderStages() {
    if (!elStagesList) return;
    elStagesList.innerHTML = "";

    if (isCourierWorkspace) {
      getCourierBucketItems().forEach((bucket) => {
        elStagesList.appendChild(stageButton({
          id: bucket.id,
          title: bucket.title,
          icon: bucket.icon,
          count: bucket.count,
        }));
      });

      syncActiveStage();
      schedulePersistOrdersCache();
      return;
    }

    const allCount = state.statuses.reduce((acc, s) => acc + Number(s.count || 0), 0);

    elStagesList.appendChild(stageButton({
      id: "all",
      title: "Все заказы",
      icon: "fa-layer-group",
      count: allCount,
    }));

    state.statuses
      .slice()
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
      .forEach((s) => {
        elStagesList.appendChild(stageButton({
          id: s.id,
          title: s.title,
          icon: s.icon || "fa-circle",
          count: Number(s.count || 0),
        }));
      });

    syncActiveStage();
    wireDragTargets();
    schedulePersistOrdersCache();
  }

  // -----------------------------
  // Orders list
  // -----------------------------
  function orderMatchesDateRange(order) {
    if (!order) return false;

    if (state.date.start && state.date.end) {
      const dateStr = order.scheduled_at || order.created_at;
      const d = new Date(String(dateStr).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return false;

      const key = toDateKey(d);
      const startKey = toDateKey(state.date.start);
      const endKey = toDateKey(state.date.end);

      if (key < startKey || key > endKey) return false;
    }

    return true;
  }

  function shouldKeepOrderInState(order) {
    if (!order) return false;
    if (isCourierWorkspace && !isDeliveryOrder(order)) return false;
    return orderMatchesDateRange(order);
  }

  function orderMatchesFilters(order) {
    if (!shouldKeepOrderInState(order)) return false;

    if (isCourierWorkspace) {
      const bucketId = getCourierBucketId(order);
      if (!bucketId) return false;
      if (String(state.activeStatusId) !== String(bucketId)) {
        return false;
      }
    } else if (state.activeStatusId !== "all" && Number(order.status_id) !== Number(state.activeStatusId)) {
      return false;
    }

    if (state.date.start && state.date.end) {
      // Use scheduled_at if available, otherwise fall back to created_at
      const dateStr = order.scheduled_at || order.created_at;
      // Время в базе уже в timezone филиала
      const d = new Date(String(dateStr).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return false;

      // Сравниваем даты напрямую
      const key = toDateKey(d);
      const startKey = toDateKey(state.date.start);
      const endKey = toDateKey(state.date.end);

      if (key < startKey || key > endKey) return false;
    }

    return true;
  }

  function buildOrderRow(order) {
    const row = document.createElement("div");
    row.className = "order-row order-list-card js-order";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("draggable", isCourierWorkspace ? "false" : "true");
    row.setAttribute("data-order-id", String(order.id));

    updateOrderRow(row, order);

    row.addEventListener("dragstart", (e) => {
      if (isCourierWorkspace) {
        e.preventDefault();
        return;
      }
      const currentOrderId = Number(order.id) || 0;
      const selectedIds = Array.from(state.selectedOrderIds || [])
        .map((id) => Number(id || 0))
        .filter((id) => id > 0);
      const draggingIds = (selectedIds.length > 1 && selectedIds.includes(currentOrderId))
        ? [...new Set(selectedIds)]
        : [currentOrderId];
      state.draggingOrderIds = draggingIds;
      state.draggingOrderId = draggingIds[0] || null;
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(state.draggingOrderId || currentOrderId));
        e.dataTransfer.setData("application/x-order-ids", JSON.stringify(draggingIds));
        removeOrderDragGhost();
        const ghost = buildOrderDragGhost(draggingIds);
        if (ghost) {
          document.body.appendChild(ghost);
          orderDragGhostEl = ghost;
          e.dataTransfer.setDragImage(ghost, 28, 28);
          setTimeout(removeOrderDragGhost, 0);
        }
      } catch {}
      row.classList.add("is-dragging");
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      state.draggingOrderId = null;
      state.draggingOrderIds = [];
      clearStageDropover();
      removeOrderDragGhost();
    });

    row.addEventListener("dragover", (e) => {
      if (isCourierWorkspace) return;
      if (state.activeStatusId === "all") return;
      if (Array.isArray(state.draggingOrderIds) && state.draggingOrderIds.length > 1) return;
      e.preventDefault();
      row.classList.add("is-dropover");
    });

    row.addEventListener("dragleave", () => row.classList.remove("is-dropover"));

    row.addEventListener("drop", async (e) => {
      if (isCourierWorkspace) return;
      if (state.activeStatusId === "all") return;
      e.preventDefault();
      row.classList.remove("is-dropover");

      if (Array.isArray(state.draggingOrderIds) && state.draggingOrderIds.length > 1) return;
      const draggedId = state.draggingOrderId;
      const targetId = Number(row.getAttribute("data-order-id"));
      if (!draggedId || !targetId || draggedId === targetId) return;

      const stageOrders = reorderOrdersWithinActiveStage(draggedId, targetId);
      if (!stageOrders || !stageOrders.length) return;

      try {
        await apiJson(`/api/admin/orders/reorder`, {
          method: "PUT",
          body: {
            status_id: Number(state.activeStatusId),
            orderedIds: stageOrders.map((x) => Number(x.id)),
          },
        });

        renderOrders();
      } catch (err) {
        console.error(err);
      }
    });

    return row;
  }

  function updateOrderRow(row, order) {
    row.setAttribute("data-order-id", String(order.id));
    const orderId = Number(order?.id || 0);
    const multiSelected = isOrderMultiSelected(orderId);

    const timeIconHtml = sharedOrderPanel && typeof sharedOrderPanel.renderOrderTimeIcon === "function"
      ? sharedOrderPanel.renderOrderTimeIcon(order)
      : renderOrderTimeIcon(order);
    const stageCycleBtnHtml = renderOrderStatusHoverCycleButton(order);
    const addressCommentDisplay = order.address_comment || order.comment || "Нет комментария";
    const rawAddress = order.address ||
      (order.pickup_store_address
        ? (order.pickup_store_name ? `${order.pickup_store_name}, ${order.pickup_store_address}` : order.pickup_store_address)
        : "?"
      );
    const shortAddressDisplay = sharedOrderPanel && typeof sharedOrderPanel.shortAddressForList === "function"
      ? sharedOrderPanel.shortAddressForList(rawAddress)
      : shortAddressForList(rawAddress);

    const customerId = Number(order.customer_id || 0);
    const customerPhoneRaw = String(order.customer_phone || "").trim();
    const customerPhone = customerPhoneRaw === "?" ? "" : customerPhoneRaw;
    const canOpenClient = (Number.isFinite(customerId) && customerId > 0) || !!customerPhone;
    const clientPhoneLineHtml = sharedOrderPanel && typeof sharedOrderPanel.buildOrderClientPhoneHtml === "function"
      ? sharedOrderPanel.buildOrderClientPhoneHtml({
        phoneText: order.customer_phone || "?",
        canLink: canOpenClient,
        linkAttrsHtml: canOpenClient
          ? ` data-action="open-client" data-client-id="${customerId > 0 ? customerId : ""}" data-client-phone="${escapeHtml(customerPhone)}" data-client-name="${escapeHtml(order.customer_name || "")}"`
          : "",
      })
      : (canOpenClient
        ? `
          <button
            type="button"
            class="order-client-phone muted order-client-phone-link"
            data-action="open-client"
            data-client-id="${customerId > 0 ? customerId : ""}"
            data-client-phone="${escapeHtml(customerPhone)}"
            data-client-name="${escapeHtml(order.customer_name || "")}"
          >
            <i class="fas fa-phone"></i>
            <span class="order-client-phone-text">${escapeHtml(order.customer_phone || "?")}</span>
          </button>
        `
        : `
          <div class="order-client-phone muted">
            <i class="fas fa-phone"></i>
            <span class="order-client-phone-text">${escapeHtml(order.customer_phone || "?")}</span>
          </div>
        `
      );

    const payment = String(order.payment_title || "").trim();
    const totalText = money(getOrderDisplayTotal(order));
    const paymentCode = (order.payment_code || "").toLowerCase();
    const isCash = paymentCode.includes("cash");
    const isFullyRefunded = isOrderFullyRefunded(order);
    const paymentIconHtml = renderOrderPaymentIcon(order);
    const paymentStatusText = isFullyRefunded ? "Возврат" : (isPaidOrder(order) ? "Оплачено" : "Не оплачено");
    const paymentStateClass = isFullyRefunded
      ? "order-payment-refund"
      : (isPaidOrder(order) ? "order-payment-paid" : "order-payment-unpaid");
    const paymentTypeClass = isCash ? "order-payment-cash" : "order-payment-card";
    const paymentHtml = sharedOrderPanel && typeof sharedOrderPanel.buildOrderPaymentButtonHtml === "function"
      ? sharedOrderPanel.buildOrderPaymentButtonHtml({
        paymentTypeClass,
        paymentStateClass,
        paymentTitle: payment,
        paymentIconHtml,
        totalText,
        statusText: paymentStatusText,
      })
      : `
        <button class="order-payment-btn ${paymentTypeClass} ${paymentStateClass}" type="button"${payment ? ` title="${escapeHtml(payment)}"` : ""}>
          <span class="order-payment-btn-icon">${paymentIconHtml}</span>
          <span class="order-payment-btn-content">
            <span class="order-payment-btn-total">${escapeHtml(totalText)}</span>
            <span class="order-payment-btn-status">${escapeHtml(paymentStatusText)}</span>
          </span>
        </button>
      `;

    if (isCourierWorkspace) {
      const pickupButtonHtml = buildCourierActionButtonHtml(order);
      const callButtonHtml = buildCourierCallButtonHtml(order);

      row.innerHTML = `
        <div class="order-col order-id">
          <label
            class="order-id-select-hit"
            data-action="order-multi-select"
            data-order-id="${escapeHtml(order.id)}"
            title="Выбрать заказ"
          >
            <input
              type="checkbox"
              class="order-id-select-checkbox"
              data-role="order-multi-checkbox"
              aria-label="Выбрать заказ №${escapeHtml(order.id)}"
              tabindex="-1"
              ${multiSelected ? "checked" : ""}
            />
            <div class="order-id-num">${escapeHtml(order.id)}</div>
            <div class="order-id-time">${escapeHtml(formatTime(order.created_at))}</div>
          </label>
        </div>

        <div class="order-col order-indicators">
          ${timeIconHtml}
        </div>

        <div class="order-col order-client">
          <div class="order-client-name"><i class="fas fa-user"></i><span class="order-client-name-text">${escapeHtml(order.customer_name || "?")}</span></div>
          ${clientPhoneLineHtml}
        </div>

        <div class="order-col order-address">
          <div class="order-address-line"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(shortAddressDisplay)}</div>
          <div class="order-address-comment muted"><i class="far fa-comment"></i> ${escapeHtml(addressCommentDisplay)}</div>
        </div>

        <div class="order-col order-courier-controls">
          <div class="order-courier-status-row">
            <div class="order-col order-stage">
              ${stageCycleBtnHtml}
            </div>
            <div class="order-col order-total">
              ${paymentHtml}
            </div>
          </div>
          <div class="order-courier-action-row">
            ${pickupButtonHtml}
            ${callButtonHtml}
          </div>
        </div>
      `;

      row.classList.remove("is-active");
      applyOrderMultiSelectionState(row, orderId);
      return;
    }

    if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderListRowInnerHtml === "function") {
      row.innerHTML = sharedOrderPanel.buildOrderListRowInnerHtml({
        orderId,
        orderNumberText: String(order.id || ""),
        createdAtText: formatTime(order.created_at),
        showMultiSelect: true,
        multiSelected,
        customerName: order.customer_name || "?",
        customerPhoneHtml: clientPhoneLineHtml,
        timeIconHtml,
        addressText: shortAddressDisplay,
        addressCommentText: addressCommentDisplay,
        stageHtml: stageCycleBtnHtml,
        paymentHtml,
      });
      row.classList.remove("is-active");
      applyOrderMultiSelectionState(row, orderId);
      return;
    }
    row.innerHTML = `
      <div class="order-col order-id">
        <label
          class="order-id-select-hit"
          data-action="order-multi-select"
          data-order-id="${escapeHtml(order.id)}"
          title="Выбрать заказ"
        >
          <input
            type="checkbox"
            class="order-id-select-checkbox"
            data-role="order-multi-checkbox"
            aria-label="Выбрать заказ №${escapeHtml(order.id)}"
            tabindex="-1"
            ${multiSelected ? "checked" : ""}
          />
          <div class="order-id-num">${escapeHtml(order.id)}</div>
          <div class="order-id-time">${escapeHtml(formatTime(order.created_at))}</div>
        </label>
      </div>

      <div class="order-col order-indicators">
        ${timeIconHtml}
      </div>

      <div class="order-col order-client">
        <div class="order-client-name"><i class="fas fa-user"></i><span class="order-client-name-text">${escapeHtml(order.customer_name || "?")}</span></div>
        ${clientPhoneLineHtml}
      </div>

      <div class="order-col order-address">
        <div class="order-address-line"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(shortAddressDisplay)}</div>
        <div class="order-address-comment muted"><i class="far fa-comment"></i> ${escapeHtml(addressCommentDisplay)}</div>
      </div>

      <div class="order-col order-stage">
        ${stageCycleBtnHtml}
      </div>

      <div class="order-col order-total">
        <button class="order-payment-btn ${isCash ? "order-payment-cash" : "order-payment-card"} ${paymentStateClass}" type="button"${payment ? ` title="${escapeHtml(payment)}"` : ""}>
          <span class="order-payment-btn-icon">${paymentIconHtml}</span>
          <span class="order-payment-btn-content">
            <span class="order-payment-btn-total">${escapeHtml(totalText)}</span>
            <span class="order-payment-btn-status">${escapeHtml(paymentStatusText)}</span>
          </span>
        </button>
      </div>
    `;

    row.classList.remove("is-active");
    applyOrderMultiSelectionState(row, orderId);
  }

  function renderOrders() {
    if (!elOrdersList) return;
    elOrdersList.innerHTML = "";

    normalizeSelectedOrderIds();
    const filtered = getOrdersForActiveStage();
    if (!filtered.length) {
      if (elEmptyHint) elEmptyHint.classList.remove("hidden");
      if (!tabsState.tabs.length || !state.activeOrderId) {
        setInfo(null);
      }
      syncActiveOrderRowState();
      schedulePersistOrdersCache();
      return;
    }
    if (elEmptyHint) elEmptyHint.classList.add("hidden");

    filtered.forEach((o) => {
      const row = buildOrderRow(o);
      elOrdersList.appendChild(row);
    });

    if (tabsState.tabs.length) {
      syncActiveOrderRowState();
    } else if (state.activeOrderId) {
      const hasActiveInStage = filtered.some((order) => Number(order?.id || 0) === Number(state.activeOrderId || 0));
      if (!hasActiveInStage) {
        state.activeOrderId = null;
        setInfo(null);
      }
    } else if (!state.activeOrderId) {
      setInfo(null);
    }
    schedulePersistOrdersCache();
  }

  function upsertOrderRow(order) {
    if (!elOrdersList) return;
    normalizeSelectedOrderIds();
    const existingRow = $(`.order-row[data-order-id="${order.id}"]`, elOrdersList);
    const shouldRender = orderMatchesFilters(order);

    if (!shouldRender) {
      if (existingRow) existingRow.remove();
      return;
    }

    if (existingRow) {
      updateOrderRow(existingRow, order);
      return;
    }

    const row = buildOrderRow(order);
    elOrdersList.prepend(row);
  }

  function clearSelection() {
    if (tabsState.activeKey) {
      closeOrderTab(tabsState.activeKey);
      return;
    }
    state.activeOrderId = null;
    setOrdersCheckoutLayoutEnabled(false);
    syncActiveOrderRowState();
    renderOrderTabs();
    setInfo(null);
    schedulePersistOrdersCache();
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function loadStatuses() {
    const qs = new URLSearchParams();
    if (state.date.start && state.date.end) {
      qs.set("start_date", toDateKey(state.date.start));
      qs.set("end_date", toDateKey(state.date.end));
    }
    const json = await apiJson(`/api/admin/orders/statuses?${qs.toString()}`);
    state.statuses = Array.isArray(json.data) ? json.data : [];
  }

  async function loadOrders() {
    const qs = new URLSearchParams();
    if (state.date.start && state.date.end) {
      qs.set("start_date", toDateKey(state.date.start));
      qs.set("end_date", toDateKey(state.date.end));
    }
    qs.set("limit", "500");
    qs.set("offset", "0");

    const json = await apiJson(`/api/admin/orders?${qs.toString()}`);
    const rows = Array.isArray(json.data) ? json.data : [];
    state.orders = rows.filter(shouldKeepOrderInState);
    applyCourierShadowOrdersToState();
    rebuildOrdersStageIndex();
    if (!isCourierWorkspace) {
      syncStageCountsFromOrders();
    }
  }

  async function loadAndRenderOrders(keepSelection = false) {
    const prevActive = keepSelection ? state.activeOrderId : null;
    if (!keepSelection && !tabsState.tabs.length) {
      state.activeOrderId = null;
    }

    await loadOrders();
    if (isCourierWorkspace) {
      ensureActiveStatusSelection();
    }
    renderStages();
    renderOrders();

    if (tabsState.tabs.length) {
      syncTabsWithLatestOrders();
      schedulePersistOrdersCache();
      return;
    }

    if (keepSelection && prevActive) {
      const found = state.orders.find((o) => Number(o.id) === Number(prevActive));
      if (found) {
        state.activeOrderId = found.id;
        setInfo(found);
        syncActiveOrderRowState();
      } else {
        state.activeOrderId = null;
        setInfo(null);
      }
    }
    schedulePersistOrdersCache();
  }

  // -----------------------------
  // Date filter
  // -----------------------------
  function formatDateLabel(start, end) {
    if (!start || !end) return "Сегодня";
    const s = start.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
    const e = end.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
    return s === e ? s : `${s} — ${e}`;
  }

  function updateDateLabel() {
    if (dateLabel) dateLabel.textContent = formatDateLabel(state.date.start, state.date.end);
  }

  function applyDateFilter(closePopover = true) {
    updateDateLabel();
    loadStatuses()
      .then(renderStages)
      .then(() => loadAndRenderOrders(false))
      .catch(console.error);

    if (closePopover) closeDatePopover();
  }

  function openDatePopover() {
    if (!datePopover) return;
    datePopover.classList.remove("hidden");
    dateBtn?.setAttribute("aria-expanded", "true");
  }

  function closeDatePopover() {
    if (!datePopover) return;
    datePopover.classList.add("hidden");
    dateBtn?.setAttribute("aria-expanded", "false");
  }

  function renderCalendar() {
    if (!dateGrid || !dateTitle) return;

    if (!isValidCalendarView(state.date.viewYear, state.date.viewMonth)) {
      const fallbackDate = state.date.start || getStoreDateNow(state.storeTimezone || "+0");
      state.date.viewYear = fallbackDate.getFullYear();
      state.date.viewMonth = fallbackDate.getMonth();
    }

    const year = Number(state.date.viewYear);
    const month = Number(state.date.viewMonth);
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    // Используем getStoreDateNow для определения "сегодня" в часовом поясе филиала
    const todayKey = toDateKey(getStoreDateNow(state.storeTimezone));

    const monthTitle = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    dateTitle.textContent = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);

    const cells = [];
    for (let i = 0; i < offset; i += 1) {
      cells.push('<span class="date-empty"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(year, month, day);
      const key = toDateKey(d);
      const startKey = state.date.start ? toDateKey(state.date.start) : null;
      const endKey = state.date.end ? toDateKey(state.date.end) : null;

      const isStart = startKey && key === startKey;
      const isEnd = endKey && key === endKey;
      const isRange = startKey && endKey && key > startKey && key < endKey;
      const isToday = key === todayKey;

      const classes = [
        "date-cell",
        isStart ? "is-start" : "",
        isEnd ? "is-end" : "",
        isRange ? "is-in-range" : "",
        isToday ? "is-today" : "",
      ].filter(Boolean).join(" ");

      cells.push(`<button class="${classes}" type="button" data-date="${key}">${day}</button>`);
    }

    dateGrid.innerHTML = cells.join("");
  }


  let clickTimer = null;

  function onDateClick(dateKey) {
    const clicked = parseDateKey(dateKey);
    if (!clicked) return;

    // Если уже есть и start и end, сбрасываем и начинаем заново
    if (state.date.start && state.date.end) {
      state.date.start = clicked;
      state.date.end = null;
      renderCalendar();
      return;
    }

    // Первый клик - устанавливаем start
    if (!state.date.start) {
      state.date.start = clicked;
      state.date.end = null;
      renderCalendar();
      return;
    }

    // Второй клик - устанавливаем end и закрываем календарь
    if (state.date.start && !state.date.end) {
      state.date.end = clicked;
      if (state.date.end < state.date.start) {
        const tmp = state.date.start;
        state.date.start = state.date.end;
        state.date.end = tmp;
      }
      renderCalendar();
      applyDateFilter(true);
    }
  }

  function onDateDoubleClick(dateKey) {
    // Отменяем одиночный клик, если он был запланирован
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }

    const clicked = parseDateKey(dateKey);
    if (!clicked) return;

    // Двойной клик - выбираем один день (создаем новый объект Date для end)
    state.date.start = new Date(clicked);
    state.date.end = new Date(clicked);
    renderCalendar();
    applyDateFilter(true);
  }

  function resetDateFilter() {
    const today = getStoreDateNow(state.storeTimezone);
    state.date.start = today;
    state.date.end = today;
    state.date.viewYear = today.getFullYear();
    state.date.viewMonth = today.getMonth();
    renderCalendar();
    applyDateFilter(true);
  }

  // -----------------------------
  // SSE
  // -----------------------------
  let stageRefreshTimer = null;
  function scheduleStageRefresh() {
    if (stageRefreshTimer) return;
    stageRefreshTimer = setTimeout(async () => {
      stageRefreshTimer = null;
      try {
        await loadStatuses();
        renderStages();
      } catch (e) {
        console.error(e);
      }
    }, 200);
  }

  let audioUnlocked = false;

  function unlockAudioOnce() {
    if (audioUnlocked) return;
    const url = state.tenantSounds && state.tenantSounds.sound_new_order_url;
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = 0.001;
    audio.play().then(() => { audioUnlocked = true; }).catch(() => {});
  }

  function playNotificationSound(url) {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }

  function playNewOrderSound() {
    const soundUrl = state.tenantSounds && state.tenantSounds.sound_new_order_url;
    if (soundUrl) playNotificationSound(soundUrl);
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) return Promise.resolve("unsupported");
    if (Notification.permission === "granted") return Promise.resolve("granted");
    if (Notification.permission === "denied") return Promise.resolve("denied");
    return Notification.requestPermission();
  }

  function showNewOrderNotification(orders) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!orders || !orders.length) return;
    const o = orders[0];
    const title = "Новый заказ";
    const body = orders.length === 1
      ? `Заказ #${o.id} — ${money(o.total_price || 0)}`
      : `${orders.length} новых заказов`;
    try {
      const n = new Notification(title, { body });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (err) {
      console.warn("Notification failed:", err);
    }
  }

  function notifyNewOrders(orders) {
    // Глобальные уведомления/звук обрабатываются в orders-sidebar-badge.js
    // чтобы не было дублей на странице заказов.
    void orders;
  }

  function extractOrderStatusId(order) {
    if (!order || typeof order !== "object") return null;
    const raw =
      order.status_id ??
      order.statusId ??
      order.status?.id ??
      order.status?.status_id ??
      null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function applyStageCountersDelta(prevOrder, nextOrder) {
    if (!Array.isArray(state.statuses) || !state.statuses.length) return false;

    const prevStatusId = extractOrderStatusId(prevOrder);
    const nextStatusId = extractOrderStatusId(nextOrder);

    if (!nextStatusId && !prevStatusId) return false;
    if (prevStatusId && nextStatusId && prevStatusId === nextStatusId) return false;

    let changed = false;

    if (prevStatusId) {
      const prevStatus = state.statuses.find((s) => Number(s?.id) === prevStatusId);
      if (prevStatus) {
        const prevCount = Math.max(0, Number(prevStatus.count || 0));
        const nextCount = Math.max(0, prevCount - 1);
        if (nextCount !== prevCount) {
          prevStatus.count = nextCount;
          changed = true;
        }
      }
    }

    if (nextStatusId) {
      const nextStatus = state.statuses.find((s) => Number(s?.id) === nextStatusId);
      if (nextStatus) {
        const prevCount = Math.max(0, Number(nextStatus.count || 0));
        nextStatus.count = prevCount + 1;
        changed = true;
      }
    }

    return changed;
  }

  function syncStageCountsFromOrders() {
    if (!Array.isArray(state.statuses) || !state.statuses.length) return;
    state.statuses.forEach((status) => {
      status.count = 0;
    });
    (Array.isArray(state.orders) ? state.orders : []).forEach((order) => {
      const statusId = extractOrderStatusId(order);
      if (!statusId) return;
      const status = state.statuses.find((item) => Number(item?.id) === statusId);
      if (status) {
        status.count = Math.max(0, Number(status.count || 0)) + 1;
      }
    });
  }

  function handleOrderEvent(order, { localOnly = false, skipStageRefresh = false } = {}) {
    if (!order || !order.id) return;

    const idx = state.orders.findIndex((o) => Number(o.id) === Number(order.id));
    const wasExisting = idx >= 0;
    const prevOrder = wasExisting ? state.orders[idx] : null;
    const prevVisible = orderMatchesFilters(prevOrder);
    const shouldKeep = shouldKeepOrderInState(order);
    let nextOrder = null;
    let nextVisible = false;

    if (!shouldKeep) {
      if (!wasExisting) return;
      state.orders.splice(idx, 1);
      rebuildOrdersStageIndex();
      if (!tabsState.tabs.length && Number(state.activeOrderId || 0) === Number(order.id)) {
        state.activeOrderId = null;
        setInfo(null);
      }
      if (applyStageCountersDelta(prevOrder, null)) {
        renderStages();
      }
      renderOrders();
      schedulePersistOrdersCache();
      return;
    }

    nextOrder = localOnly ? { ...order } : overlayCourierShadowOrder(order);
    if (wasExisting) {
      state.orders[idx] = { ...state.orders[idx], ...nextOrder };
      nextOrder = state.orders[idx];
    } else {
      state.orders.unshift(nextOrder);
    }
    rebuildOrdersStageIndex();
    nextVisible = orderMatchesFilters(nextOrder);
    const tab = tabsState.tabs.find((t) => Number(t.orderId) === Number(order.id));
    if (tab) {
      tab.order = { ...tab.order, ...nextOrder };
      tab.title = buildOrderTabTitle(tab.order);
      if (tabsState.activeKey === tab.key) {
        state.activeOrderId = tab.orderId;
        setInfo(tab.order);
      }
      renderOrderTabs();
      syncActiveOrderRowState();
    } else if (state.activeOrderId && Number(state.activeOrderId) === Number(order.id)) {
      if (nextVisible) {
        setInfo(nextOrder);
      } else {
        state.activeOrderId = null;
        setInfo(null);
      }
    }

    if (applyStageCountersDelta(prevOrder, nextOrder)) {
      renderStages();
    }
    if (!wasExisting || prevVisible !== nextVisible) {
      renderOrders();
    } else {
      upsertOrderRow(nextOrder);
    }

    const statusCode = (nextOrder.status_code || "").toLowerCase();
    if (statusCode === "cancelled" || statusCode === "canceled") {
      const url = state.tenantSounds && state.tenantSounds.sound_order_cancelled_url;
      if (url) playNotificationSound(url);
    }
    schedulePersistOrdersCache();
  }

  async function fetchChanges() {
    if (!state.lastEventId) {
      const bootstrap = await apiJson("/api/admin/orders/changes?since=0");
      const cursor = Number(bootstrap?.cursor || 0);
      state.lastEventId = Number.isFinite(cursor) && cursor > 0 ? cursor : null;
      return;
    }

    try {
      const json = await apiJson(`/api/admin/orders/changes?since=${state.lastEventId}`);
      const cursor = Number(json?.cursor || 0);
      if (Number.isFinite(cursor) && cursor > 0) {
        state.lastEventId = Math.max(Number(state.lastEventId || 0), cursor);
      }
      const changes = Array.isArray(json.data) ? json.data : [];
      if (!changes.length) return;
      changes.forEach((evt) => {
        state.lastEventId = evt.id || state.lastEventId;
        handleOrderEvent(evt.data);
        const eventName = String(evt.event || "").toLowerCase();
        if (eventName === "order.created") {
          notifyNewOrders([evt.data]);
        }
      });
    } catch (e) {
      console.error(e);
      const prevIds = new Set(state.orders.map((o) => Number(o.id)));
      await loadAndRenderOrders(true);
      const newOrders = state.orders.filter((o) => !prevIds.has(Number(o.id)));
      if (newOrders.length) {
        notifyNewOrders(newOrders);
      }
    }
  }

  // Фоновый опрос списка заказов (резерв, когда SSE обрывается на хостинге)
  // Важно: Chrome троттлит setInterval в фоновых вкладках до 1 раза в минуту и более.
  // При возврате на вкладку вызываем pollOrdersList сразу (visibilitychange).
  const ORDERS_POLL_INTERVAL_MS = 15000; // 15 сек
  let ordersPollTimer = null;
  let ordersChangesPollTimer = null;

  async function pollOrdersList() {
    try {
      const prevIds = new Set(state.orders.map((o) => Number(o.id)));
      await loadOrders();
      const newOrders = state.orders.filter((o) => !prevIds.has(Number(o.id)));
      if (isCourierWorkspace) {
        ensureActiveStatusSelection();
        renderStages();
        if (newOrders.length) {
          notifyNewOrders(newOrders);
        }
      } else if (newOrders.length) {
        renderStages();
        notifyNewOrders(newOrders);
      } else {
        renderStages();
      }
      renderOrders();
      if (tabsState.tabs.length) {
        syncTabsWithLatestOrders();
      } else if (state.activeOrderId) {
        const order = state.orders.find((o) => Number(o.id) === Number(state.activeOrderId));
        if (order) setInfo(order);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function scheduleNextPoll() {
    if (!ordersPollTimer) return;
    ordersPollTimer = setTimeout(() => {
      pollOrdersList().finally(() => scheduleNextPoll());
    }, ORDERS_POLL_INTERVAL_MS);
  }

  function startOrdersPolling() {
    if (ordersPollTimer) return;
    ordersPollTimer = true; // маркер что polling активен
    scheduleNextPoll();
  }

  function stopOrdersPolling() {
    if (ordersPollTimer != null && typeof ordersPollTimer === "number") {
      clearTimeout(ordersPollTimer);
    }
    ordersPollTimer = null;
  }

  // Long-poll mode.
  function startOrdersPolling() {
    if (!ordersChangesPollTimer) {
      const tickChanges = async () => {
        if (!ordersChangesPollTimer) return;
        try {
          if (!state.lastEventId) {
            await fetchChanges();
          }

          const waited = await waitOrdersChanges(state.lastEventId || 0, 20000);
          if (!ordersChangesPollTimer) return;

          if (waited.changed) {
            await fetchChanges();
          } else if (Number.isFinite(waited.cursor) && waited.cursor > 0 && !state.lastEventId) {
            state.lastEventId = waited.cursor;
          }
        } catch (e) {
          console.error(e);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } finally {
          if (!ordersChangesPollTimer) return;
          setTimeout(tickChanges, 0);
        }
      };
      ordersChangesPollTimer = true;
      void tickChanges();
    }

  }

  async function waitOrdersChanges(since, timeoutMs = 20000) {
    const qs = new URLSearchParams({
      since: String(Number(since || 0)),
      timeout_ms: String(Math.max(1000, Number(timeoutMs || 20000))),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`/api/admin/orders/changes/wait?${qs.toString()}`);
    const data = json?.data || {};
    return {
      changed: data.changed === true,
      timeout: data.timeout === true,
      cursor: Number(data.cursor || 0),
    };
  }

  function stopOrdersPolling() {
    if (ordersPollTimer != null && typeof ordersPollTimer === "number") {
      clearTimeout(ordersPollTimer);
    }
    ordersPollTimer = null;

    if (ordersChangesPollTimer != null && typeof ordersChangesPollTimer === "number") {
      clearTimeout(ordersChangesPollTimer);
    }
    ordersChangesPollTimer = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ordersPollTimer) {
      pollOrdersList().catch(console.error);
    }
  });

  function applyOrdersChangesEvents(changes, { notifyCreated = true } = {}) {
    const rows = Array.isArray(changes) ? changes : [];
    const createdOrders = [];
    rows.forEach((evt) => {
      state.lastEventId = evt?.id || state.lastEventId;
      handleOrderEvent(evt?.data);
      if (notifyCreated && String(evt?.event || "").toLowerCase() === "order.created" && evt?.data) {
        createdOrders.push(evt.data);
      }
    });
    if (notifyCreated && createdOrders.length) {
      notifyNewOrders(createdOrders);
    }
  }

  async function fetchOrdersChanges(since = 0) {
    const qs = new URLSearchParams({
      since: String(Math.max(0, Number(since || 0))),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`/api/admin/orders/changes?${qs.toString()}`);
    const cursor = Number(json?.cursor || 0);
    return {
      changes: Array.isArray(json?.data) ? json.data : [],
      cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : 0,
      resetRequired: json?.reset_required === true,
      reason: String(json?.reason || "").trim() || null,
    };
  }

  async function synchronizeOrdersChanges({ notifyCreated = true } = {}) {
    const since = Number(state.lastEventId || 0);
    const payload = await fetchOrdersChanges(since);
    if (payload.resetRequired) return payload;
    if (payload.cursor > 0) {
      state.lastEventId = since > 0 ? Math.max(since, payload.cursor) : payload.cursor;
    }
    if (payload.changes.length) {
      applyOrdersChangesEvents(payload.changes, { notifyCreated });
    }
    return payload;
  }

  async function bootstrapOrdersData({ keepSelection = false } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bootstrap = await fetchOrdersChanges(0);
      const snapshotCursor = Number(bootstrap.cursor || 0);
      state.lastEventId = snapshotCursor > 0 ? snapshotCursor : null;

      await loadStatuses();
      ensureActiveStatusSelection();
      await loadAndRenderOrders(keepSelection);

      const catchup = await fetchOrdersChanges(snapshotCursor);
      if (catchup.resetRequired) {
        state.lastEventId = null;
        continue;
      }

      if (catchup.cursor > 0) {
        state.lastEventId = Math.max(Number(state.lastEventId || 0), catchup.cursor);
      }
      if (catchup.changes.length) {
        applyOrdersChangesEvents(catchup.changes, { notifyCreated: false });
      }
      return;
    }

    throw new Error("ORDERS_BOOTSTRAP_RESET_REQUIRED");
  }

  let ordersLongPollActive = false;
  let ordersLongPollToken = 0;

  async function waitOrdersChanges(since, timeoutMs = 20000) {
    const qs = new URLSearchParams({
      since: String(Number(since || 0)),
      timeout_ms: String(Math.max(1000, Number(timeoutMs || 20000))),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`/api/admin/orders/changes/wait?${qs.toString()}`);
    const data = json?.data || {};
    return {
      changed: data.changed === true,
      timeout: data.timeout === true,
      cursor: Number(data.cursor || 0),
      resetRequired: data.reset_required === true,
      reason: String(data.reason || "").trim() || null,
    };
  }

  function startOrdersPolling() {
    if (ordersLongPollActive) return;
    ordersLongPollActive = true;
    ordersLongPollToken += 1;
    const token = ordersLongPollToken;

    const tickChanges = async () => {
      while (ordersLongPollActive && token === ordersLongPollToken) {
        try {
          const waited = await waitOrdersChanges(state.lastEventId || 0, 20000);
          if (!ordersLongPollActive || token !== ordersLongPollToken) return;

          if (waited.resetRequired) {
            await bootstrapOrdersData({ keepSelection: Boolean(tabsState.tabs.length || state.activeOrderId) });
            continue;
          }

          if (Number.isFinite(waited.cursor) && waited.cursor > 0 && !state.lastEventId) {
            state.lastEventId = waited.cursor;
          }

          if (waited.changed) {
            const synced = await synchronizeOrdersChanges({ notifyCreated: true });
            if (synced.resetRequired) {
              await bootstrapOrdersData({ keepSelection: Boolean(tabsState.tabs.length || state.activeOrderId) });
            }
          }
        } catch (e) {
          console.error(e);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    void tickChanges();
  }

  function stopOrdersPolling() {
    if (ordersPollTimer != null && typeof ordersPollTimer === "number") {
      clearTimeout(ordersPollTimer);
    }
    ordersPollTimer = null;
    if (ordersChangesPollTimer != null && typeof ordersChangesPollTimer === "number") {
      clearTimeout(ordersChangesPollTimer);
    }
    ordersChangesPollTimer = null;
    ordersLongPollActive = false;
    ordersLongPollToken += 1;
  }

  document.addEventListener("orders:new-draft-tab-request", () => {
    void openNewDraftTab();
  });

  // -----------------------------
  // Click handlers
  // -----------------------------
  document.addEventListener("click", async (e) => {
    const tabCloseBtn = e.target.closest("[data-order-tab-close]");
    if (tabCloseBtn) {
      e.stopPropagation();
      const key = tabCloseBtn.getAttribute("data-order-tab-close");
      if (key) closeOrderTab(key);
      return;
    }

    const tabEl = e.target.closest("[data-order-tab-key]");
    if (tabEl) {
      const key = tabEl.getAttribute("data-order-tab-key");
      if (key) setActiveOrderTab(key, { openMobile: true });
      return;
    }

    const tabsHomeBtn = e.target.closest('[data-action="order-tabs-home"]');
    if (tabsHomeBtn) {
      e.preventDefault();
      e.stopPropagation();
      goToOrdersHomeView();
      return;
    }

    const addNewDraftBtn = e.target.closest("#ordersAddBtn");
    if (addNewDraftBtn) {
      e.preventDefault();
      e.stopPropagation();
      await openNewDraftTab();
      return;
    }

    const markPaidBtn = e.target.closest('[data-action="order-mark-paid"]');
    if (markPaidBtn) {
      e.preventDefault();
      e.stopPropagation();
      const activeOrder = getActiveOrder();
      if (activeOrder) {
        await openOrderPaymentDialog(activeOrder);
      }
      return;
    }

    const editOrderBtn = e.target.closest('[data-action="order-edit"]');
    if (editOrderBtn) {
      e.preventDefault();
      e.stopPropagation();
      const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
      const orderId = Number(activeTab?.orderId || state.activeOrderId || 0);
      if (orderId > 0) {
        await openEditOrderTab(orderId);
      }
      return;
    }

    const statusOptionBtn = e.target.closest('[data-action="order-status-menu-select"]');
    if (statusOptionBtn) {
      e.preventDefault();
      e.stopPropagation();
      const statusId = Number(statusOptionBtn.getAttribute("data-status-id"));
      if (!Number.isFinite(statusId) || statusId <= 0) {
        closeInlineStatusMenus();
        return;
      }
      selectActiveOrderStatus(statusId).catch((err) => {
        console.error(err);
      });
      return;
    }

    const statusToggleBtn = e.target.closest('[data-action="order-status-menu-toggle"]');
    if (statusToggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = statusToggleBtn.closest('[data-role="order-inline-status"]');
      if (!wrap) return;
      const shouldOpen = !wrap.classList.contains("is-open");
      closeInlineStatusMenus();
      if (shouldOpen) {
        wrap.classList.add("is-open");
        const dropdown = $('[data-role="order-status-menu"]', wrap);
        if (dropdown) dropdown.classList.remove("hidden");
        statusToggleBtn.setAttribute("aria-expanded", "true");
      }
      return;
    }

    if (!e.target.closest('[data-role="order-inline-status"]')) {
      closeInlineStatusMenus();
    }

    const rowStageBtn = e.target.closest('[data-action="order-row-status-next"]');
    if (rowStageBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (rowStageBtn.disabled) return;
      const orderId = Number(rowStageBtn.getAttribute("data-order-id") || 0);
      const nextStatusId = Number(rowStageBtn.getAttribute("data-next-status-id") || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return;
      if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;
      setStatusControlsDisabled(true);
      try {
        await updateOrderStatus(orderId, nextStatusId);
      } finally {
        setStatusControlsDisabled(false);
      }
      return;
    }

    const openOrderFromClientBtn = e.target.closest('[data-action="open-order-from-client"]');
    if (openOrderFromClientBtn) {
      e.preventDefault();
      e.stopPropagation();

      const orderId = Number(openOrderFromClientBtn.getAttribute("data-order-id") || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return;

      let order = state.orders.find((x) => Number(x.id) === orderId) || null;
      if (!order) {
        try {
          const json = await apiJson(`/api/admin/orders/${orderId}`);
          order = json?.data || null;
        } catch (err) {
          console.error(err);
        }
      }
      if (!order) return;

      ensureOrderTab(order, { activate: true, openMobile: true });
      return;
    }

    const courierPickupBtn = e.target.closest('[data-action="courier-pickup"]');
    if (courierPickupBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (courierPickupBtn.disabled) return;
      const orderId = Number(courierPickupBtn.getAttribute("data-order-id") || 0);
      const targetStatusId = Number(courierPickupBtn.getAttribute("data-target-status-id") || 0);
      if (!(orderId > 0) || !(targetStatusId > 0)) return;
      setStatusControlsDisabled(true);
      try {
        await updateOrderStatus(orderId, targetStatusId);
      } finally {
        setStatusControlsDisabled(false);
      }
      return;
    }

    const courierCallBtn = e.target.closest('[data-action="courier-call"]');
    if (courierCallBtn) {
      e.stopPropagation();
      return;
    }

    const openClientBtn = e.target.closest('[data-action="open-client"]');
    if (openClientBtn) {
      e.preventDefault();
      e.stopPropagation();

      let clientId = Number(openClientBtn.getAttribute("data-client-id") || 0);
      let clientPhone = String(openClientBtn.getAttribute("data-client-phone") || "").trim();
      let clientName = String(openClientBtn.getAttribute("data-client-name") || "").trim();

      let fallbackOrder = null;
      const row = openClientBtn.closest(".js-order");
      if (row && ((!Number.isFinite(clientId) || clientId <= 0) || !clientPhone || !clientName)) {
        const orderId = Number(row.getAttribute("data-order-id") || 0);
        const order = state.orders.find((x) => Number(x.id) === orderId);
        if (order) {
          fallbackOrder = order;
          if (!Number.isFinite(clientId) || clientId <= 0) {
            clientId = Number(order.customer_id || 0);
          }
          if (!clientPhone) {
            clientPhone = String(order.customer_phone || "").trim();
          }
          if (!clientName) {
            clientName = String(order.customer_name || "").trim();
          }
        }
      }

      if ((!Number.isFinite(clientId) || clientId <= 0) || !clientName || !clientPhone) {
        const activeOrder = getActiveOrder();
        if (activeOrder) {
          fallbackOrder = activeOrder;
          if (!Number.isFinite(clientId) || clientId <= 0) {
            clientId = Number(activeOrder.customer_id || 0);
          }
          if (!clientPhone) {
            clientPhone = String(activeOrder.customer_phone || "").trim();
          }
          if (!clientName) {
            clientName = String(activeOrder.customer_name || "").trim();
          }
        }
      }

      if (clientPhone === "?") clientPhone = "";
      if ((!Number.isFinite(clientId) || clientId <= 0) && !clientPhone) return;

      ensureClientTab({
        clientId,
        clientPhone,
        clientName,
        activate: true,
        openMobile: true,
        fallbackOrder,
      }).catch(console.error);
      return;
    }

    const action = e.target.closest("[data-action]");
    if (action && action.getAttribute("data-action") === "assign-courier") {
      e.stopPropagation();
      return;
    }
    if (action && action.getAttribute("data-action") === "order-extra") {
      e.stopPropagation();
      return;
    }

    // Не выбирать заказ при клике на кнопку оплаты
    if (e.target.closest(".order-payment-btn")) {
      e.stopPropagation();
      return;
    }

    const multiSelectToggle = e.target.closest('[data-action="order-multi-select"]');
    if (multiSelectToggle) {
      e.preventDefault();
      e.stopPropagation();
      const orderId = Number(multiSelectToggle.getAttribute("data-order-id") || 0);
      if (!(orderId > 0)) return;
      toggleOrderMultiSelection(orderId);
      const row = multiSelectToggle.closest(".js-order");
      if (row) applyOrderMultiSelectionState(row, orderId);
      return;
    }

    const row = e.target.closest(".js-order");
    if (!row) return;
    const orderId = Number(row.getAttribute("data-order-id")) || null;
    if (!orderId) return;
    const order = state.orders.find((o) => Number(o.id) === Number(orderId));
    if (!order) return;
    ensureOrderTab(order, { activate: true, openMobile: true });
  });

  document.addEventListener("neworder:right-tabs-empty", () => {
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    if (!activeTab || !isCheckoutTab(activeTab)) return;
    closeOrderTab(activeTab.key);
  });

  document.addEventListener("neworder:edit-cancel", (evt) => {
    const editOrderId = Number(evt?.detail?.orderId || 0);
    let targetTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    if (!targetTab || !isCheckoutTab(targetTab) || normalizeTabMode(targetTab.mode) !== "edit") {
      targetTab = tabsState.tabs.find((tab) => (
        tab?.type === "order"
        && normalizeTabMode(tab?.mode) === "edit"
        && Number(tab?.orderId || 0) === editOrderId
      )) || null;
    }
    if (!targetTab || !Number(targetTab?.orderId || 0)) return;
    targetTab.mode = "view";
    targetTab.checkoutSession = null;
    targetTab.checkoutSessionHydrating = false;
    const currentOrder = state.orders.find((row) => Number(row?.id || 0) === Number(targetTab.orderId || 0)) || null;
    if (currentOrder) {
      targetTab.order = { ...targetTab.order, ...currentOrder };
      targetTab.title = buildOrderTabTitle(targetTab.order);
    }
    setActiveOrderTab(targetTab.key, { openMobile: true });
  });

  document.addEventListener("neworder:order-submitted", () => {
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    if (!activeTab || !isCheckoutTab(activeTab)) return;
    closeOrderTab(activeTab.key);
    bootstrapOrdersData({ keepSelection: Boolean(tabsState.tabs.length || state.activeOrderId) }).catch(console.error);
  });

  closeButtons.forEach((btn) => btn.addEventListener("click", clearSelection));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeInlineStatusMenus();
      closeSheet();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", closeSheet);
  if (backdrop) backdrop.addEventListener("click", closeSheet);

  window.addEventListener("resize", () => {
    if (!isMobile()) closeSheet();
  });

  if (notifyBtn) {
    notifyBtn.addEventListener("click", () => {
      requestNotificationPermission().then((perm) => {
        if (perm === "granted") {
          notifyBtn.classList.add("is-enabled");
          notifyBtn.title = "Уведомления включены";
        }
      }).catch(() => {});
    });
    if ("Notification" in window && Notification.permission === "granted") {
      notifyBtn.classList.add("is-enabled");
      notifyBtn.title = "Уведомления включены";
    }
  }

  if (dateBtn && datePopover) {
    dateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (datePopover.classList.contains("hidden")) {
        openDatePopover();
      } else {
        closeDatePopover();
      }
    });

    document.addEventListener("click", (e) => {
      if (!datePopover || datePopover.classList.contains("hidden")) return;
      if (e.target.closest("#ordersDatePopover") || e.target.closest("#ordersDateBtn")) return;
      closeDatePopover();
      if (state.date.start && !state.date.end) {
        state.date.end = state.date.start;
        applyDateFilter(true);
      }
    });
  }

  if (dateGrid) {
    dateGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-date]");
      if (!btn) return;
      
      // Используем таймер, чтобы отличить одиночный клик от двойного
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        onDateClick(btn.getAttribute("data-date"));
      }, 250);
    });

    dateGrid.addEventListener("dblclick", (e) => {
      const btn = e.target.closest("[data-date]");
      if (!btn) return;
      onDateDoubleClick(btn.getAttribute("data-date"));
    });
  }

  if (datePrev) {
    datePrev.addEventListener("click", () => {
      state.date.viewMonth -= 1;
      if (state.date.viewMonth < 0) {
        state.date.viewMonth = 11;
        state.date.viewYear -= 1;
      }
      renderCalendar();
    });
  }

  if (dateNext) {
    dateNext.addEventListener("click", () => {
      state.date.viewMonth += 1;
      if (state.date.viewMonth > 11) {
        state.date.viewMonth = 0;
        state.date.viewYear += 1;
      }
      renderCalendar();
    });
  }

  if (dateReset) {
    dateReset.addEventListener("click", () => resetDateFilter());
  }

  // Переключение статуса по клику на большую пилюлю
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="order-status-next"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    cycleActiveOrderStatus().catch((err) => {
      console.error(err);
    });
  });

  // Обработчик кнопки печати
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="order-print"]');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const orderId = state.activeOrderId;
    if (!orderId) return;
    
    const order = state.orders.find((o) => Number(o.id) === Number(orderId));
    if (!order) return;
    if (!isOrderPrintable(order)) return;
    
    printOrderReceipt(order);
  });

  // Функция печати чека через системную печать браузера
  function printOrderReceipt(order) {
    if (!isOrderPrintable(order)) return;
    // Создаем HTML для чека
    const receiptHtml = generateReceiptHTML(order);
    
    // Вычисляем размеры и позицию для центрирования окна
    const width = 400;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    
    // Открываем новое окно с чеком по центру экрана
    const printWindow = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
    if (!printWindow) {
      alert('Пожалуйста, разрешите всплывающие окна для печати');
      return;
    }
    
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    
    // Ждем загрузки и вызываем печать
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
    
    // Закрываем окно после печати (после закрытия диалога печати)
    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
    });
    
    // Также закрываем окно, если пользователь закрыл его вручную
    // или если диалог печати был отменен (fallback)
    const checkClosed = setInterval(() => {
      if (printWindow.closed) {
        clearInterval(checkClosed);
      }
    }, 100);
  }

  // Функция генерации HTML для чека
  function generateReceiptHTML(order) {
    const receiptOrder = getDisplayOrder(order) || order;
    const hasRefunds = hasOrderRefunds(order);
    // Время в базе уже в timezone филиала
    const createdAtStr = String(receiptOrder.created_at).replace(' ', 'T');
    const date = new Date(createdAtStr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    const dateStr = `${day}.${month}.${year}, ${hours}:${minutes}`;

    const methodTitle = receiptOrder.method_title || (receiptOrder.method_code === "pickup" ? "Самовывоз" : "Доставка");
    const deliverySectionTitle = receiptOrder.method_code === "pickup" ? "Самовывоз:" : "Доставка:";
    let address = receiptOrder.address;
    if (!address && receiptOrder.pickup_store_address) {
      address = receiptOrder.pickup_store_name
        ? `${receiptOrder.pickup_store_name}, ${receiptOrder.pickup_store_address}`
        : receiptOrder.pickup_store_address;
    }
    const isUrgent = receiptOrder.is_urgent || receiptOrder.urgent || receiptOrder.time_option_code === "urgent";
    const total = parseFloat(receiptOrder.total_price || receiptOrder.total || 0);
    const deliveryCost = Number(receiptOrder.delivery_cost || 0);
    const changeFromRaw = receiptOrder.change_from;
    const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
    const paymentTitle = receiptOrder.payment_method_title || receiptOrder.payment_title || "";
    const paymentCode = receiptOrder.payment_code || "";
    const changeAmount = Math.max(0, changeFrom - total);
    const showChange = !hasRefunds && changeAmount > 0;
    const scheduleText = formatScheduleText(receiptOrder, { includeTitle: true });

    function receiptTotalStr(val) {
      const n = Number(val);
      if (!Number.isFinite(n)) return '';
      if (n === 0) return '';
      return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
    }

    const receiptItems = Array.isArray(receiptOrder.items) ? receiptOrder.items.slice().sort((a, b) => {
      const aAuto = isAutoAddItem(a);
      const bAuto = isAutoAddItem(b);
      if (aAuto && !bAuto) return 1;
      if (!aAuto && bAuto) return -1;
      return 0;
    }) : [];

    const comboItems = receiptItems.filter((item) => String(item?.type || "") === "combo");
    const productItems = receiptItems.filter((item) => String(item?.type || "") !== "combo");
    const itemGroups = [];
    if (comboItems.length) itemGroups.push({ key: "combo", title: "КОМБО", items: comboItems });
    if (productItems.length) itemGroups.push({ key: "product", title: "ТОВАРЫ", items: productItems });

    function mergeVariantUnit(label, unit) {
      const cleanLabel = String(label || "").trim();
      const cleanUnit = String(unit || "").trim();
      if (!cleanLabel) return cleanUnit;
      if (!cleanUnit) return cleanLabel;
      const escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const measureMatch = cleanLabel.match(new RegExp(`^\\s*([\\d.,]+\\s*${escapedUnit})(?:\\b|\\s|$)`, "i"));
      if (measureMatch && String(measureMatch[1] || "").trim()) {
        return String(measureMatch[1] || "").trim();
      }
      const labelLower = cleanLabel.toLowerCase();
      const unitLower = cleanUnit.toLowerCase();
      if (labelLower.endsWith(` ${unitLower}`) || labelLower === unitLower) return cleanLabel;
      return `${cleanLabel} ${cleanUnit}`.trim();
    }

    function normalizeVariantUnitLabel(unitRaw) {
      const raw = String(unitRaw || "").trim();
      if (!raw) return "";
      const key = raw.toLowerCase();
      const dict = {
        "штук": "шт",
        "штука": "шт",
        "шт": "шт",
        "грамм": "г",
        "грамма": "г",
        "гр": "г",
        "г": "г",
        "килограмм": "кг",
        "килограмма": "кг",
        "кг": "кг",
        "миллилитр": "мл",
        "миллилитра": "мл",
        "мл": "мл",
        "литр": "л",
        "литра": "л",
        "л": "л",
      };
      const safeDict = {
        "\u0448\u0442\u0443\u043a": "\u0448\u0442",
        "\u0448\u0442\u0443\u043a\u0430": "\u0448\u0442",
        "\u0448\u0442": "\u0448\u0442",
        "\u0433\u0440\u0430\u043c\u043c": "\u0433",
        "\u0433\u0440\u0430\u043c\u043c\u0430": "\u0433",
        "\u0433\u0440": "\u0433",
        "\u0433": "\u0433",
        "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c": "\u043a\u0433",
        "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c\u0430": "\u043a\u0433",
        "\u043a\u0433": "\u043a\u0433",
        "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440": "\u043c\u043b",
        "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440\u0430": "\u043c\u043b",
        "\u043c\u043b": "\u043c\u043b",
        "\u043b\u0438\u0442\u0440": "\u043b",
        "\u043b\u0438\u0442\u0440\u0430": "\u043b",
        "\u043b": "\u043b",
      };
      return safeDict[key] || dict[key] || raw;
    }

    function extractVariantUnitFromGroupTitle(groupTitleRaw) {
      const groupTitle = String(groupTitleRaw || "").trim();
      if (!groupTitle) return "";
      const match = groupTitle.match(/\(([^)]+)\)\s*$/);
      if (!match) return "";
      return normalizeVariantUnitLabel(String(match[1] || "").trim());
    }

    function formatQtyUnitName(qtyRaw, unitRaw, nameRaw) {
      const qtyNum = Number(qtyRaw);
      const qtyText = Number.isFinite(qtyNum)
        ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
        : String(qtyRaw ?? "").trim();
      const unitText = String(unitRaw || "").trim();
      const nameText = String(nameRaw || "").trim();
      return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
    }

    function renderLinePrice(item, fallbackTotal = 0) {
      const lineTotal = Number(item?.line_total ?? item?.total ?? item?.total_price ?? fallbackTotal);
      const oldLineTotal = Number(item?.old_line_total || item?.discount?.original_line_total || 0);
      const showOldPrice = oldLineTotal > lineTotal;
      return showOldPrice
        ? `<span class="receipt-old-price">${receiptTotalStr(oldLineTotal)}</span>${receiptTotalStr(lineTotal)}`
        : receiptTotalStr(lineTotal);
    }

    function renderComboItem(item) {
      const name = escapeHtml(item?.name || item?.combo_title || "Комбо");
      const qty = Math.max(1, Number(item?.quantity || item?.qty || 1));
      const qtyStr = `${qty} x`;
      const priceStr = renderLinePrice(item, 0);
      const selections = Array.isArray(item?.selections) ? item.selections : [];
      const compositionLines = [];

      selections.forEach((sel) => {
        const productName = String(sel?.product_name || "").trim() || "Товар";
        const variantHead = mergeVariantUnit(sel?.variant_label, sel?.variant_unit);
        const primaryLine = [variantHead, productName].filter(Boolean).join(" ").trim();
        if (primaryLine) {
          compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--group">1 x ${escapeHtml(primaryLine)}</div>`);
        }

        const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
        ingredientsDisplay.forEach((ing) => {
          const ingQty = ing?.qty ?? ing?.quantity;
          const ingNumQty = Number(ingQty);
          if (!Number.isFinite(ingNumQty) || ingNumQty <= 0) return;
          const line = formatQtyUnitName(ingQty, ing?.unit, ing?.name);
          if (!line) return;
          compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
        });
      });

      const compositionHtml = compositionLines.length
        ? `<div class="receipt-composition">${compositionLines.join("")}</div>`
        : "";

      return `
        <div class="receipt-item">
          <div class="receipt-item-row">
            <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
            <span class="receipt-item-name">${name}</span>
            ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ""}
          </div>
          ${compositionHtml}
        </div>
      `;
    }

    function renderProductItem(item) {
      const rawName = String(item?.product_name || item?.name || "Товар").trim() || "Товар";
      const qty = Math.max(1, Number(item?.quantity || item?.qty || 1));
      const basePrice = parseFloat(item?.price || 0);
      const qtyStr = `${qty} x`;
      const priceStr = renderLinePrice(item, basePrice * qty);
      const compositionLines = [];

      const variants = Array.isArray(item?.variants) ? item.variants : [];
      const variantLines = [];
      variants.forEach((v) => {
        const value = String(v?.label || v?.value || "").trim();
        const unit = String(
          v?.unit ||
          v?.unit_short_title ||
          v?.unitLabel ||
          v?.unit_title ||
          extractVariantUnitFromGroupTitle(v?.group_title || v?.groupTitle || "")
        ).trim();
        let formatted = mergeVariantUnit(value, unit);
        if (formatted) variantLines.push(formatted);
      });

      const primaryVariantLine = variantLines.length ? variantLines[0] : "";
      const titleLine = [primaryVariantLine, rawName].filter(Boolean).join(" ").trim() || rawName;
      const name = escapeHtml(titleLine);
      if (variantLines.length > 1) {
        variantLines.slice(1).forEach((line) => {
          compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
        });
      }

      const ingredients = (Array.isArray(item?.ingredients) ? item.ingredients : [])
        .filter((ing) => Number(ing?.quantity ?? ing?.qty ?? 0) > 0);
      ingredients.forEach((ing) => {
        const line = formatQtyUnitName(
          ing?.quantity ?? ing?.qty,
          ing?.unit_label || ing?.unit || ing?.unitLabel || ing?.unit_short_title || ing?.unit_title || "",
          ing?.name || "Ингредиент"
        );
        if (line) compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
      });

      const options = (Array.isArray(item?.options) ? item.options : [])
        .filter((opt) => Number(opt?.qty ?? opt?.quantity ?? 0) > 0);
      options.forEach((opt) => {
        const variant = mergeVariantUnit(opt?.variant_label || opt?.variantLabel, opt?.variant_unit || opt?.variantUnit);
        const title = String(opt?.title || "Опция").trim();
        const line = variant
          ? `${variant} ${title}`.trim()
          : `${Math.max(1, Number(opt?.qty || opt?.quantity || 1))} ${title}`.trim();
        if (line) compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
      });

      const compositionHtml = compositionLines.length
        ? `<div class="receipt-composition">${compositionLines.join("")}</div>`
        : "";

      return `
        <div class="receipt-item">
          <div class="receipt-item-row">
            <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
            <span class="receipt-item-name">${name}</span>
            ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ""}
          </div>
          ${compositionHtml}
        </div>
      `;
    }

    let itemsHtml = "";
    if (itemGroups.length) {
      itemsHtml = itemGroups.map((group, idx) => {
        const bodyHtml = group.items
          .map((item) => group.key === "combo" ? renderComboItem(item) : renderProductItem(item))
          .join("");
        return `
          <div class="receipt-items-group receipt-items-group--${group.key}">
            <div class="receipt-items-group-title">${group.title}</div>
            <div class="receipt-items-group-list">${bodyHtml}</div>
          </div>
          ${idx < itemGroups.length - 1 ? '<div class="receipt-items-type-divider"></div>' : ''}
        `;
      }).join("");
    } else {
      itemsHtml = '<div class="receipt-empty">\u0412\u0441\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u044b.</div>';
    }
    const receiptDiscountSummary = buildOrderDiscountSummary(receiptOrder);
    const discountAmount = Number(receiptDiscountSummary.totalDiscount || 0);
    const subtotal = Number(receiptDiscountSummary.subtotalBeforeDiscount || 0);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек заказа #${order.id}</title>
  <style>
    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 5mm 3mm;
        font-family: 'Courier New', monospace;
        font-size: 11pt;
        font-weight: bold;
        line-height: 1.3;
        width: 80mm;
        max-width: 80mm;
        box-sizing: border-box;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 5mm 3mm;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      font-weight: bold;
      line-height: 1.3;
      width: 80mm;
      max-width: 80mm;
      box-sizing: border-box;
      background: white;
    }
    .receipt-header {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 10px;
    }
    .receipt-date {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    .receipt-section {
      margin: 10px 0;
    }
    .receipt-section-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .receipt-items-group {
      margin: 0;
      padding: 0;
    }
    .receipt-items-group-title {
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: .2px;
      margin: 2px 0 5px;
    }
    .receipt-items-group-list {
      margin: 0;
      padding: 0 0 0 2px;
    }
    .receipt-items-type-divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .receipt-item {
      margin: 0;
      padding: 3px 0 2px;
    }
    .receipt-item + .receipt-item {
      border-top: 1px dotted #000;
      margin-top: 3px;
      padding-top: 4px;
    }
    .receipt-item-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .receipt-item-qty {
      flex-shrink: 0;
    }
    .receipt-item-name {
      flex: 1;
      min-width: 0;
      word-wrap: break-word;
    }
    .receipt-item-price {
      flex-shrink: 0;
      text-align: right;
    }
    .receipt-composition {
      margin: 2px 0 1px;
      font-size: 9pt;
    }
    .receipt-composition-item {
      margin: 1px 0;
      word-wrap: break-word;
    }
    .receipt-composition-item--group {
      margin-left: 8px;
    }
    .receipt-composition-item--sub {
      margin-left: 16px;
    }
    .receipt-total {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 15px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 10px 0;
    }
    .receipt-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
    }
    .receipt-summary-label {
      flex: 1;
    }
    .receipt-summary-value {
      flex-shrink: 0;
      text-align: right;
    }
    .receipt-urgent {
      text-align: center;
      font-weight: bold;
      color: #d00;
      margin: 10px 0;
    }
    .receipt-divider {
      border-top: 1px dashed #000;
      margin: 10px 0;
    }
    .receipt-when-block {
      font-weight: bold;
    }
    .receipt-when-text {
      font-weight: bold;
    }
    .receipt-old-price {
      text-decoration: line-through;
      margin-right: 4px;
    }
    .receipt-empty {
      text-align: center;
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #${receiptOrder.id}</div>
  <div class="receipt-date">${dateStr}</div>
  
  <div class="receipt-divider"></div>
  ${(scheduleText || isUrgent) ? `
  <div class="receipt-section receipt-when-block">
    <div class="receipt-when-text">${escapeHtml(scheduleText || (isUrgent ? "Быстрее" : ""))}</div>
  </div>
  <div class="receipt-divider"></div>
  ` : ''}
  
  <div class="receipt-section">
    ${receiptOrder.customer_name ? `<div>${escapeHtml(receiptOrder.customer_name)}</div>` : ''}
    ${receiptOrder.customer_phone ? `<div>${escapeHtml(receiptOrder.customer_phone)}</div>` : ''}
  </div>
  
  <div class="receipt-section">
    <div>${escapeHtml(methodTitle || "—")}</div>
    <div>${escapeHtml(address || "—")}</div>
  </div>
  
  ${(receiptOrder.address_comment && receiptOrder.address_comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(receiptOrder.address_comment)}</div>
  </div>
  ` : ''}
  ${(receiptOrder.comment && receiptOrder.comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(receiptOrder.comment)}</div>
  </div>
  ` : ''}
  
  <div class="receipt-divider"></div>
  
  <div class="receipt-section">
    ${itemsHtml}
  </div>
  
  <div class="receipt-divider"></div>

  <div class="receipt-section">
    ${paymentTitle ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Оплата</div><div class="receipt-summary-value">${escapeHtml(paymentTitle)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача с</div><div class="receipt-summary-value">${money(changeFrom)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача</div><div class="receipt-summary-value">${money(changeAmount)}</div></div>` : ''}
    ${discountAmount > 0 ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сумма товаров</div><div class="receipt-summary-value">${money(subtotal)}</div></div>` : ''}
    ${discountAmount > 0 ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Скидка</div><div class="receipt-summary-value">-${money(discountAmount)}</div></div>` : ''}
    <div class="receipt-summary-row"><div class="receipt-summary-label">Доставка</div><div class="receipt-summary-value">${money(deliveryCost)}</div></div>
    <div class="receipt-total">ИТОГО: ${money(total)}</div>
  </div>
  
  <div style="margin-top: 20px; text-align: center; font-size: 10pt;">
    <div>Спасибо за заказ!</div>
  </div>
</body>
</html>
    `;
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function loadStoreTimezone() {
    try {
      const response = await apiJson("/api/admin/tenant/current-time");
      if (response?.data?.storeTimezone != null) {
        state.storeTimezone = String(response.data.storeTimezone || "+0");
      }
    } catch (err) {
      console.error("Failed to load store timezone:", err);
      if (!state.storeTimezone) state.storeTimezone = "+0";
    }
  }

  function ensureDateStateInitialized() {
    if (!state.date.start || !state.date.end) {
      const storeNow = getStoreDateNow(state.storeTimezone || "+0");
      state.date.start = storeNow;
      state.date.end = storeNow;
    }
    if (!isValidCalendarView(state.date.viewYear, state.date.viewMonth)) {
      const baseDate = state.date.start || getStoreDateNow(state.storeTimezone || "+0");
      state.date.viewYear = baseDate.getFullYear();
      state.date.viewMonth = baseDate.getMonth();
    }
  }

  function ensureActiveStatusSelection() {
    if (isCourierWorkspace) {
      const hasCurrent = courierBucketDefs.some((bucket) => String(bucket.id) === String(state.activeStatusId));
      if (!hasCurrent) {
        state.activeStatusId = courierDefaultBucketId;
      }
      return;
    }

    const sortedStatuses = getSortedStatuses();
    if (!sortedStatuses.length) {
      state.activeStatusId = "all";
      return;
    }
    const activeNumeric = Number(state.activeStatusId);
    const hasCurrent = sortedStatuses.some((status) => Number(status.id) === activeNumeric);
    if (state.activeStatusId === "all" || !hasCurrent) {
      state.activeStatusId = sortedStatuses[0].id;
    }
  }

  async function init() {
    try {
      const cachedBootstrap = readOrdersBootstrapCache();
      hydrateCourierOfflineStateFromStorage();

      await loadStoreTimezone();
      resetDateStateToToday();
      hydrateOrdersFromCache(cachedBootstrap);
      ensureDateStateInitialized();
      renderCalendar();
      updateDateLabel();
      bindOrderTabsWheelScroll();

      try {
        await bootstrapOrdersData({ keepSelection: Boolean(tabsState.tabs.length || state.activeOrderId) });
        if (tabsState.activeKey) {
          setActiveOrderTab(tabsState.activeKey);
        } else {
          renderOrderTabs();
        }
      } catch (refreshErr) {
        console.error(refreshErr);
        ensureActiveStatusSelection();
        renderStages();
        renderOrders();
        renderOrderTabs();
        setOrdersCheckoutLayoutEnabled(false);
        setInfo(null);
        schedulePersistOrdersCache(0);
      }

      try {
        const tenantRes = await apiJson("/api/admin/tenant");
        if (tenantRes && tenantRes.tenant) {
          state.tenantSounds = {
            sound_new_order_url: tenantRes.tenant.sound_new_order_url || null,
            sound_order_cancelled_url: tenantRes.tenant.sound_order_cancelled_url || null,
            sound_new_message_url: tenantRes.tenant.sound_new_message_url || null
          };
        }
      } catch (err) {
        console.error(err);
      }

      if (isCourierWorkspace && sharedOrderPayment?.warmCache && courierOfflineState.online) {
        sharedOrderPayment.warmCache(apiJson, state.orders[0] || null).catch((err) => {
          console.error("courier payment methods warmup error:", err);
        });
      }

      if (isCourierWorkspace) {
        refreshCourierConnectionBanner();
        processCourierOfflineQueue().catch(console.error);
      }

      document.addEventListener("click", unlockAudioOnce, { once: true });
      document.addEventListener("keydown", unlockAudioOnce, { once: true });

      stopOrdersPolling();
      startOrdersPolling();
    } catch (e) {
      console.error(e);
    }
  }

  init();

  if (isCourierWorkspace && courierConnectionBannerRetryBtn) {
    courierConnectionBannerRetryBtn.addEventListener("click", () => {
      courierOfflineState.syncError = "";
      setCourierOnlineState(navigator.onLine !== false);
      processCourierOfflineQueue({ force: true }).catch(console.error);
    });
  }

  if (isCourierWorkspace) {
    window.addEventListener("offline", () => {
      setCourierOnlineState(false);
    });

    window.addEventListener("online", () => {
      const hasPending = courierOfflineState.queue.length > 0;
      setCourierOnlineState(true, { showRestored: !hasPending });
      processCourierOfflineQueue().catch(console.error);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      setCourierOnlineState(navigator.onLine !== false);
      if (navigator.onLine !== false) {
        processCourierOfflineQueue().catch(console.error);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    try {
      persistOrdersCacheNow();
    } catch {}
    try {
      persistCourierOfflineState();
    } catch {}
  });
  // Слушать изменение филиала: переподключить SSE к каналу нового филиала и перезагрузить заказы
  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен:', event.detail.store);
    state.clientsCache.clear();
    state.statuses = [];
    state.orders = [];
    state.ordersStageIndex = createOrdersStageIndex();
    state.selectedOrderIds = new Set();
    state.lastEventId = null;
    tabsState.tabs = [];
    tabsState.activeKey = null;
    state.activeOrderId = null;
    resetCourierOfflineRuntimeState();
    hydrateCourierOfflineStateFromStorage();
    setOrdersCheckoutLayoutEnabled(false);
    renderStages();
    renderOrders();
    renderOrderTabs();
    setInfo(null);
    closeSheet();
    loadStoreTimezone()
      .then(() => {
        resetDateStateToToday();
        ensureDateStateInitialized();
        renderCalendar();
        updateDateLabel();
        return bootstrapOrdersData({ keepSelection: false });
      })
      .then(() => {
        renderOrderTabs();
        if (isCourierWorkspace && sharedOrderPayment?.warmCache && courierOfflineState.online) {
          return sharedOrderPayment.warmCache(apiJson, state.orders[0] || null).catch(() => null);
        }
        return null;
      })
      .then(() => {
        if (isCourierWorkspace) {
          refreshCourierConnectionBanner();
          return processCourierOfflineQueue().catch(console.error);
        }
        return null;
      })
      .catch(console.error);
    stopOrdersPolling();
    startOrdersPolling();
  });
})();
