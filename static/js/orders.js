(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

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
    
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    
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
  const orderTabsHeader = $("#orderTabsHeader");
  const orderTabs = $("#orderTabs");
  const orderInfoFooter = $("#orderInfoFooter");

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

  const clientInfoWrap = $("#clientInfoWrap");
  const clientPhoto = $("#clientPhoto");
  const clientPhotoPlaceholder = $("#clientPhotoPlaceholder");
  const clientInfoName = $("#clientInfoName");
  const clientInfoPhone = $("#clientInfoPhone");
  const clientInfoBirthday = $("#clientInfoBirthday");
  const clientContentTabs = $("#clientContentTabs");
  const clientTabAddresses = $("#clientTabAddresses");
  const clientTabOrders = $("#clientTabOrders");
  const clientTabDiscounts = $("#clientTabDiscounts");
  const clientAddressesList = $("#clientAddresses");
  const clientOrdersList = $("#clientOrdersList");
  const clientOrdersListView = $("#clientOrdersListView");
  const clientOrderDetailView = $("#clientOrderDetailView");
  const clientDiscountsList = $("#clientDiscountsList");
  const clientDiscountsEmpty = $("#clientDiscountsEmpty");
  const clientEditNameBtn = $("#clientEditNameBtn");
  const clientAddrToggleBtn = $("#clientAddrToggleBtn");
  const clientAddrFormCard = $("#clientAddrFormCard");

  const closeButtons = $$('[data-action="order-close"]');

  const sheet = $("#orderSheet");
  const backdrop = $("#sheetBackdrop");
  const closeBtn = $("#sheetClose");

  const dateBtn = $("#ordersDateBtn");
  const dateLabel = $("#ordersDateLabel");
  const datePopover = $("#ordersDatePopover");
  const dateGrid = $("#ordersDateGrid");
  const dateTitle = $("#ordersDateTitle");
  const datePrev = $("#ordersDatePrev");
  const dateNext = $("#ordersDateNext");
  const dateReset = $("#ordersDateReset");
  const notifyBtn = $("#ordersNotifyBtn");

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    statuses: [],
    activeStatusId: "all",
    orders: [],
    activeOrderId: null,
    draggingOrderId: null,
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

  const tabsState = {
    tabs: [],
    activeKey: null,
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

  function getNextStatusMetaForOrder(order) {
    const sortedStatuses = getSortedStatuses();
    if (!sortedStatuses.length) return null;
    const currentStatusId = Number(order?.status_id || 0);
    const currentIndex = sortedStatuses.findIndex((status) => Number(status.id) === currentStatusId);
    if (currentIndex < 0) return sortedStatuses[0];
    return sortedStatuses[(currentIndex + 1) % sortedStatuses.length];
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
        ${iconHtml}
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

    let streetIdx = tokens.findIndex((token) => looksLikeStreetToken(token));
    if (streetIdx < 0) streetIdx = 0;
    let streetPart = tokens[streetIdx] || "";

    if (streetPart && !/\d/.test(streetPart)) {
      const next = tokens[streetIdx + 1] || "";
      const house = normalizeHouseToken(next);
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
    if (!elOrdersList || !state.activeOrderId) return;
    const row = $(`.order-row[data-order-id="${state.activeOrderId}"]`, elOrdersList);
    if (row) row.classList.add("is-active");
  }

  function renderOrderTabs() {
    if (!orderTabsHeader || !orderTabs) return;
    const hasTabs = tabsState.tabs.length > 0;
    orderTabsHeader.classList.toggle("hidden", !hasTabs);
    if (!hasTabs) {
      orderTabs.innerHTML = "";
      return;
    }
    orderTabs.innerHTML = tabsState.tabs.map((tab) => {
      const isActive = tab.key === tabsState.activeKey;
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-order-tab-key="${escapeHtml(tab.key)}">
          <span class="product-tab-title">${escapeHtml(tab.title || (tab.type === "client" ? "Клиент" : "Заказ"))}</span>
          <button class="product-tab-close" type="button" data-order-tab-close="${escapeHtml(tab.key)}" aria-label="Закрыть">&times;</button>
        </div>
      `;
    }).join("");
  }

  function setActiveOrderTab(key, { openMobile = false } = {}) {
    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    tabsState.activeKey = key;

    if (tab.type === "client") {
      state.activeOrderId = null;
      renderOrderTabs();
      syncActiveOrderRowState();
      activateClientTab(tab, { openMobile }).catch(console.error);
      return;
    }

    state.activeOrderId = tab.orderId;
    const orderFromState = state.orders.find((o) => Number(o.id) === Number(tab.orderId));
    if (orderFromState) {
      tab.order = { ...tab.order, ...orderFromState };
      tab.title = buildOrderTabTitle(tab.order);
    }

    renderOrderTabs();
    syncActiveOrderRowState();
    setInfo(orderFromState || tab.order || null);

    if (openMobile && isMobile()) openSheet();
  }

  function ensureOrderTab(order, { activate = true, openMobile = false } = {}) {
    if (!order || !Number.isFinite(Number(order.id))) return null;
    const orderId = Number(order.id);
    const key = buildOrderTabKey(orderId);
    let tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = { key, type: "order", orderId, title: buildOrderTabTitle(order), order: { ...order } };
      tabsState.tabs.push(tab);
    } else {
      tab.type = "order";
      tab.order = { ...tab.order, ...order };
      tab.title = buildOrderTabTitle(tab.order);
    }

    if (activate) {
      setActiveOrderTab(key, { openMobile });
    } else {
      renderOrderTabs();
    }

    return tab;
  }

  async function findClientIdByPhone(phoneValue) {
    const digits = normalizePhoneDigits(phoneValue);
    if (!digits) return null;

    const localMatch = (state.orders || []).find((order) => normalizePhoneDigits(order?.customer_phone) === digits);
    if (localMatch) {
      const localId = Number(localMatch.customer_id || 0);
      if (Number.isFinite(localId) && localId > 0) return localId;
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

  async function ensureClientTab({ clientId = null, clientPhone = "", clientName = "", activate = true, openMobile = false } = {}) {
    let normalizedClientId = Number(clientId || 0);
    const normalizedPhone = String(clientPhone || "").trim();

    if (!Number.isFinite(normalizedClientId) || normalizedClientId <= 0) {
      if (!normalizedPhone) return null;
      normalizedClientId = await findClientIdByPhone(normalizedPhone);
    }
    if (!Number.isFinite(normalizedClientId) || normalizedClientId <= 0) return null;

    const key = buildClientTabKey(normalizedClientId);
    let tab = tabsState.tabs.find((item) => item.key === key);
    if (!tab) {
      tab = {
        key,
        type: "client",
        clientId: normalizedClientId,
        title: buildClientTabTitle({ name: clientName, phone: normalizedPhone, id: normalizedClientId }),
        fallbackName: String(clientName || "").trim(),
        fallbackPhone: normalizedPhone,
        activeContentTab: "addresses",
        client: null,
        addresses: null,
        orders: null,
        discounts: null,
        loading: false,
        error: null,
      };
      tabsState.tabs.push(tab);
    } else {
      tab.type = "client";
      if (!tab.fallbackName && clientName) tab.fallbackName = String(clientName || "").trim();
      if (!tab.fallbackPhone && normalizedPhone) tab.fallbackPhone = normalizedPhone;
      if (!tab.activeContentTab) tab.activeContentTab = "addresses";
      const nextTitle = buildClientTabTitle({
        client: tab.client,
        name: tab.fallbackName,
        phone: tab.fallbackPhone,
        id: normalizedClientId,
      });
      if (nextTitle) tab.title = nextTitle;
    }

    if (activate) {
      setActiveOrderTab(key, { openMobile });
    } else {
      renderOrderTabs();
    }

    return tab;
  }

  function syncTabsWithLatestOrders() {
    if (!tabsState.tabs.length) {
      tabsState.activeKey = null;
      renderOrderTabs();
      if (!state.activeOrderId) setInfo(null);
      return;
    }

    tabsState.tabs.forEach((tab) => {
      if (tab.type !== "order") return;
      const fresh = state.orders.find((o) => Number(o.id) === Number(tab.orderId));
      if (fresh) {
        tab.order = { ...tab.order, ...fresh };
        tab.title = buildOrderTabTitle(tab.order);
      }
    });

    if (!tabsState.activeKey || !tabsState.tabs.some((tab) => tab.key === tabsState.activeKey)) {
      tabsState.activeKey = tabsState.tabs[tabsState.tabs.length - 1]?.key || null;
    }

    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey) || null;
    state.activeOrderId = activeTab?.type === "order" ? activeTab.orderId : null;

    renderOrderTabs();
    syncActiveOrderRowState();

    if (!activeTab) {
      setInfo(null);
      return;
    }

    if (activeTab.type === "client") {
      activateClientTab(activeTab).catch(console.error);
      return;
    }

    const freshActive = state.orders.find((o) => Number(o.id) === Number(activeTab.orderId));
    if (freshActive) {
      activeTab.order = { ...activeTab.order, ...freshActive };
      activeTab.title = buildOrderTabTitle(activeTab.order);
      renderOrderTabs();
    }
    setInfo(freshActive || activeTab.order || null);
  }

  function closeOrderTab(key) {
    const idx = tabsState.tabs.findIndex((tab) => tab.key === key);
    if (idx < 0) return;
    const wasActive = tabsState.activeKey === key;
    tabsState.tabs.splice(idx, 1);

    if (!tabsState.tabs.length) {
      tabsState.activeKey = null;
      state.activeOrderId = null;
      renderOrderTabs();
      syncActiveOrderRowState();
      setInfo(null);
      closeSheet();
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
    if (!Array.isArray(items) || !items.length) return '<div class="muted">?</div>';

    const sorted = items.slice().sort((a, b) => {
      const aAuto = isAutoAddItem(a);
      const bAuto = isAutoAddItem(b);
      if (aAuto && !bAuto) return 1;
      if (!aAuto && bAuto) return -1;
      return 0;
    });

    return sorted
      .map((it, itemIdx) => {
        // Комбо: как в корзине — название комбо и вложенный состав (селекции с вариантами и ингредиентами)
        if (it.type === "combo") {
          const name = escapeHtml(it.name || it.combo_title || "Комбо");
          const qty = Math.max(1, Number(it.qty || it.quantity || 0));
          const lineTotal = Number(it.line_total ?? it.total ?? it.total_price ?? 0);
          const oldLineTotal = Number(it.old_line_total) || 0;
          const showOldPrice = oldLineTotal > lineTotal;
          const priceHtml = showOldPrice
            ? `<span class="order-item-old-price">${money(oldLineTotal)}</span><span class="order-item-price-current">${money(lineTotal)}</span>`
            : `<span class="order-item-price-current">${money(lineTotal)}</span>`;
          const titleHtml = `${name} × ${qty}`;
          const bulletPrefix = "• ";

          const photos = Array.isArray(it.photos) ? it.photos.filter(Boolean) : [];
          const hasPhotos = photos.length > 0;
          const uniqueId = `order-item-${itemIdx}-${Date.now()}`;
          let photosHtml = "";
          if (hasPhotos) {
            photosHtml = `
              <div class="order-item-photos" data-item-photos="${uniqueId}">
                <div class="order-item-photo-main">
                  <img class="order-item-photo-img" src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" data-photo-idx="0" />
                  ${photos.length > 1 ? `
                    <button class="order-item-photo-nav order-item-photo-prev" type="button" aria-label="Предыдущее фото"><i class="fas fa-chevron-left"></i></button>
                    <button class="order-item-photo-nav order-item-photo-next" type="button" aria-label="Следующее фото"><i class="fas fa-chevron-right"></i></button>
                  ` : ""}
                </div>
                ${photos.length > 1 ? `
                  <div class="order-item-photo-thumbs-wrapper">
                    <button class="order-item-thumbs-nav order-item-thumbs-prev" type="button" aria-label="Листать влево"><i class="fas fa-chevron-left"></i></button>
                    <div class="order-item-photo-thumbs" data-thumbs="${uniqueId}">
                      ${photos.map((photo, idx) => `
                        <button class="order-item-photo-thumb ${idx === 0 ? "is-active" : ""}" type="button" data-thumb-idx="${idx}">
                          <img src="${escapeHtml(photo)}" alt="" />
                        </button>
                      `).join("")}
                    </div>
                    <button class="order-item-thumbs-nav order-item-thumbs-next" type="button" aria-label="Листать вправо"><i class="fas fa-chevron-right"></i></button>
                  </div>
                ` : ""}
              </div>
            `;
          }
          const photoHtml = hasPhotos
            ? `<div class="order-item-photo-small"><img src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" /></div>`
            : "";

          const selections = Array.isArray(it.selections) ? it.selections : [];
          const comboDetailsHtml = selections.length
            ? `<div class="order-item-composition">
                ${selections.map((sel) => {
                  const productName = escapeHtml(sel.product_name || "—");
                  const nameLine = `<div class="order-item-composition-item order-item-composition-item-primary">1 × ${productName}</div>`;
                  const vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
                  const variantLine = vParts.length
                    ? `<div class="order-item-composition-item">${bulletPrefix}${escapeHtml(vParts.join(" "))}</div>`
                    : "";
                  const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
                  const ingLines = ingredientsDisplay
                    .map((ing) => {
                      const ingName = escapeHtml(ing.name || "");
                      const rawQty = ing.qty ?? ing.quantity;
                      const numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
                      if (Number(numQty) <= 0) return ""; // не показываем позиции с количеством 0
                      if (!ingName && (rawQty == null || rawQty === "")) return "";
                      const unit = String(ing.unit || "").trim();
                      const parts = [];
                      if (rawQty != null && rawQty !== "") parts.push(String(rawQty));
                      if (unit) parts.push(unit);
                      if (ingName) parts.push(ingName);
                      return `<div class="order-item-composition-item">${bulletPrefix}${escapeHtml(parts.join(" "))}</div>`;
                    })
                    .filter(Boolean)
                    .join("");
                  return nameLine + variantLine + ingLines;
                }).join("")}
              </div>`
            : "";

          const base = `
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
          `;
          return `<div class="order-item order-item--combo" data-item-idx="${itemIdx}">${base}</div>`;
        }

        const name = escapeHtml(it.product_name || it.name || "Товар");
        const qty = Math.max(1, Number(it.qty || it.quantity || 0));
        const price = Number(it.price || 0);
        const lineTotal = Number(it.line_total ?? it.total ?? it.total_price ?? price * qty ?? 0);
        const discountOriginal = it.discount?.original_line_total;
        const oldLineTotal = discountOriginal || 0;
        const showOldPrice = oldLineTotal > lineTotal;
        const priceHtml = showOldPrice
          ? `<span class="order-item-old-price">${money(oldLineTotal)}</span><span class="order-item-price-current">${money(lineTotal)}</span>`
          : `<span class="order-item-price-current">${money(lineTotal)}</span>`;
        const titleHtml = `${name} × ${qty}`;
        const bulletPrefix = "• ";

        const photos = Array.isArray(it.photos) ? it.photos.filter(Boolean) : [];
        const hasPhotos = photos.length > 0;
        const uniqueId = `order-item-${itemIdx}-${Date.now()}`;

        let photosHtml = "";
        if (hasPhotos) {
          photosHtml = `
            <div class="order-item-photos" data-item-photos="${uniqueId}">
              <div class="order-item-photo-main">
                <img class="order-item-photo-img" src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" data-photo-idx="0" />
                ${photos.length > 1 ? `
                  <button class="order-item-photo-nav order-item-photo-prev" type="button" aria-label="Предыдущее фото">
                    <i class="fas fa-chevron-left"></i>
                  </button>
                  <button class="order-item-photo-nav order-item-photo-next" type="button" aria-label="Следующее фото">
                    <i class="fas fa-chevron-right"></i>
                  </button>
                ` : ""}
              </div>
              ${photos.length > 1 ? `
                <div class="order-item-photo-thumbs-wrapper">
                  <button class="order-item-thumbs-nav order-item-thumbs-prev" type="button" aria-label="Листать миниатюры влево">
                    <i class="fas fa-chevron-left"></i>
                  </button>
                  <div class="order-item-photo-thumbs" data-thumbs="${uniqueId}">
                    ${photos.map((photo, idx) => `
                      <button class="order-item-photo-thumb ${idx === 0 ? "is-active" : ""}" type="button" data-thumb-idx="${idx}">
                        <img src="${escapeHtml(photo)}" alt="" />
                      </button>
                    `).join("")}
                  </div>
                  <button class="order-item-thumbs-nav order-item-thumbs-next" type="button" aria-label="Листать миниатюры вправо">
                    <i class="fas fa-chevron-right"></i>
                  </button>
                </div>
              ` : ""}
            </div>
          `;
        }

        const photoHtml = hasPhotos
          ? `<div class="order-item-photo-small"><img src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" /></div>`
          : "";

        const variants = Array.isArray(it.variants) ? it.variants : [];
        const variantsHtml = variants.length
          ? `<div class="order-item-composition">
              ${variants.map((v) => {
                const groupTitle = escapeHtml(v.group_title || "Вариант");
                const variantValue = escapeHtml(v.label || v.value || "");
                const variantValueTrimmed = variantValue.trim();
                const groupTitleTrimmed = groupTitle.trim();
                let formatted;
                if (variantValueTrimmed && groupTitleTrimmed) {
                  const variantLower = variantValueTrimmed.toLowerCase();
                  const groupLower = groupTitleTrimmed.toLowerCase();
                  if (variantLower.endsWith(" " + groupLower) || variantLower.endsWith(groupLower)) {
                    formatted = variantValue;
                  } else {
                    formatted = `${variantValue} ${groupTitle}`.trim();
                  }
                } else {
                  formatted = `${variantValue} ${groupTitle}`.trim();
                }
                return `<div class="order-item-composition-item">${bulletPrefix}${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        const ingredients = Array.isArray(it.ingredients) ? it.ingredients : [];
        const ingredientsFiltered = ingredients.filter((ing) => Number(ing.quantity ?? ing.qty ?? 0) > 0);
        const ingredientsHtml = ingredientsFiltered.length
          ? `<div class="order-item-composition">
              ${ingredientsFiltered.map((ing) => {
                const ingName = escapeHtml(ing.name || "Ингредиент");
                const ingQty = Number(ing.quantity ?? ing.qty ?? 0);
                let ingUnit = escapeHtml(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
                if (!ingUnit) ingUnit = ingQty > 10 ? "г" : "шт";
                const formatted = `${ingQty}${ingUnit} ${ingName}`;
                return `<div class="order-item-composition-item">${bulletPrefix}${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        const options = Array.isArray(it.options) ? it.options : [];
        const optionsFiltered = options.filter((opt) => Number(opt.qty ?? opt.quantity ?? 0) > 0);
        const optionsHtml = optionsFiltered.length
          ? `<div class="order-item-composition">
              ${optionsFiltered.map((opt) => {
                const optName = escapeHtml(opt.title || "Опция");
                const variantLabel = escapeHtml((opt.variant_label || opt.variantLabel || "").trim());
                let formatted;
                if (variantLabel) {
                  formatted = `${variantLabel} ${optName}`;
                } else {
                  const optQty = Math.max(1, Number(opt.qty || 1));
                  formatted = `${optQty}шт ${optName}`;
                }
                return `<div class="order-item-composition-item">${bulletPrefix}${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        const subHtml = variantsHtml + ingredientsHtml + optionsHtml;

        const base = `
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
        `;

        return `<div class="order-item" data-item-idx="${itemIdx}">${base}</div>`;
      })
      .join("");
  }

  // Инициализация листания фото для товаров в заказе
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

  function getActiveOrder() {
    if (!state.activeOrderId) return null;
    const orderId = Number(state.activeOrderId);
    const fromState = state.orders.find((o) => Number(o.id) === orderId);
    if (fromState) return fromState;
    const activeTab = tabsState.tabs.find((tab) => Number(tab.orderId) === orderId);
    return activeTab?.order || null;
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
    const optionsHtml = sortedStatuses.map((status) => {
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
    await apiJson(`/api/admin/orders/${orderId}/status`, {
      method: "PUT",
      body: { status_id: statusId },
    });
    await loadStatuses();
    renderStages();
    await loadAndRenderOrders(true);
  }

  async function cycleActiveOrderStatus() {
    const order = getActiveOrder();
    const orderId = Number(order?.id || state.activeOrderId || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return;

    const sortedStatuses = getSortedStatuses();
    if (!sortedStatuses.length) return;

    const currentStatusId = Number(order?.status_id || 0);
    const currentIndex = sortedStatuses.findIndex((status) => Number(status.id) === currentStatusId);
    const nextStatus = currentIndex >= 0
      ? sortedStatuses[(currentIndex + 1) % sortedStatuses.length]
      : sortedStatuses[0];
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
    if (clientEditNameBtn) clientEditNameBtn.classList.add("hidden");
    if (clientAddrToggleBtn) clientAddrToggleBtn.classList.add("hidden");
    if (clientAddrFormCard) clientAddrFormCard.classList.add("hidden");
  }

  hideOrderClientEditingControls();

  function showEmptyInfo() {
    setHiddenAll(infoEls.empty, false);
    setHiddenAll(infoEls.content, true);
    if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
    if (orderInfoFooter) orderInfoFooter.classList.add("hidden");
  }

  function showOrderInfo() {
    setHiddenAll(infoEls.empty, true);
    setHiddenAll(infoEls.content, false);
    if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
    if (orderInfoFooter) orderInfoFooter.classList.remove("hidden");
  }

  function showClientInfo() {
    setHiddenAll(infoEls.empty, true);
    setHiddenAll(infoEls.content, true);
    if (clientInfoWrap) clientInfoWrap.classList.remove("hidden");
    if (orderInfoFooter) orderInfoFooter.classList.add("hidden");
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

  function setClientPhoto(photoUrl) {
    const src = String(photoUrl || "").trim();
    if (src) {
      if (clientPhoto) {
        clientPhoto.src = src;
        clientPhoto.classList.remove("hidden");
      }
      if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.add("hidden");
      return;
    }
    if (clientPhoto) {
      clientPhoto.removeAttribute("src");
      clientPhoto.classList.add("hidden");
    }
    if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.remove("hidden");
  }

  function getActiveClientTab() {
    const tab = tabsState.tabs.find((item) => item.key === tabsState.activeKey);
    if (!tab || tab.type !== "client") return null;
    return tab;
  }

  function setClientContentTab(tabName) {
    const nextTab = ["addresses", "orders", "discounts"].includes(String(tabName || ""))
      ? String(tabName)
      : "addresses";
    const activeClientTab = getActiveClientTab();
    if (activeClientTab) activeClientTab.activeContentTab = nextTab;

    if (clientContentTabs) {
      $$("[data-ctab]", clientContentTabs).forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.ctab === nextTab);
      });
    }

    [clientTabAddresses, clientTabOrders, clientTabDiscounts].forEach((panel) => {
      if (!panel) return;
      panel.classList.toggle("is-active", panel.dataset.ctab === nextTab);
    });

    if (clientOrdersListView) clientOrdersListView.classList.remove("hidden");
    if (clientOrderDetailView) clientOrderDetailView.classList.add("hidden");
  }

  if (clientContentTabs && clientContentTabs.dataset.bound !== "1") {
    clientContentTabs.dataset.bound = "1";
    clientContentTabs.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-ctab]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      setClientContentTab(btn.dataset.ctab);
    });
  }

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

  function renderClientTabState(tab, { loading = false, error = "" } = {}) {
    const client = tab?.client || null;
    const fallbackName = String(tab?.fallbackName || "").trim();
    const fallbackPhone = String(tab?.fallbackPhone || "").trim();

    if (clientInfoName) clientInfoName.textContent = client?.name || fallbackName || "—";
    if (clientInfoPhone) {
      const phoneValue = client?.phone || fallbackPhone || "—";
      clientInfoPhone.textContent = formatPhoneDigitsToRU(phoneValue);
    }
    if (clientInfoBirthday) clientInfoBirthday.textContent = formatClientDate(client?.birthday);
    setClientPhoto(client?.photo || "");
    setClientContentTab(tab?.activeContentTab || "addresses");

    if (loading) {
      if (clientAddressesList) clientAddressesList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (clientOrdersList) clientOrdersList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (clientDiscountsList) clientDiscountsList.innerHTML = '<div class="muted">Загрузка…</div>';
      if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add("hidden");
      return;
    }

    if (error) {
      if (clientAddressesList) clientAddressesList.innerHTML = `<div class="muted">${escapeHtml(error)}</div>`;
      if (clientOrdersList) clientOrdersList.innerHTML = "";
      if (clientDiscountsList) clientDiscountsList.innerHTML = "";
      if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add("hidden");
      return;
    }

    if (clientAddressesList) clientAddressesList.innerHTML = renderClientAddressesHtml(tab?.addresses);
    if (clientOrdersList) clientOrdersList.innerHTML = renderClientOrdersHistoryHtml(tab?.orders);
    const discounts = Array.isArray(tab?.discounts) ? tab.discounts : [];
    if (clientDiscountsList) clientDiscountsList.innerHTML = renderClientDiscountsHtml(discounts);
    if (clientDiscountsEmpty) clientDiscountsEmpty.classList.toggle("hidden", discounts.length > 0);
  }

  async function loadClientTabData(tab, { forceReload = false } = {}) {
    if (!tab || tab.type !== "client") return;
    if (tab.loading) return;
    if (!forceReload && tab.client && Array.isArray(tab.addresses) && Array.isArray(tab.orders) && Array.isArray(tab.discounts)) return;

    tab.loading = true;
    tab.error = null;
    if (tabsState.activeKey === tab.key) {
      showClientInfo();
      renderClientTabState(tab, { loading: true });
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
      if (tabsState.activeKey === tab.key) {
        showClientInfo();
        renderClientTabState(tab);
      }
    } catch (error) {
      console.error(error);
      tab.error = "Не удалось загрузить данные клиента";
      if (tabsState.activeKey === tab.key) {
        showClientInfo();
        renderClientTabState(tab, { error: tab.error });
      }
    } finally {
      tab.loading = false;
    }
  }

  async function activateClientTab(tab, { openMobile = false, forceReload = false } = {}) {
    if (!tab || tab.type !== "client") return;

    const cached = state.clientsCache.get(Number(tab.clientId));
    if (cached && !tab.client) {
      tab.client = cached.client || null;
      tab.addresses = Array.isArray(cached.addresses) ? cached.addresses : [];
      tab.orders = Array.isArray(cached.orders) ? cached.orders : [];
      tab.discounts = Array.isArray(cached.discounts) ? cached.discounts : [];
      tab.title = buildClientTabTitle({
        client: tab.client,
        name: tab.fallbackName,
        phone: tab.fallbackPhone,
        id: tab.clientId,
      });
      renderOrderTabs();
    }

    showClientInfo();
    renderClientTabState(tab, {
      loading: !tab.client || !Array.isArray(tab.addresses) || !Array.isArray(tab.orders) || !Array.isArray(tab.discounts),
    });
    await loadClientTabData(tab, { forceReload });

    if (openMobile && isMobile()) openSheet();
  }

  function setInfo(order) {
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
      loadAndRenderOrders(false).catch(console.error);
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
  }

  function wireDragTargets() {
    if (!elStagesList) return;

    $$(".stage-item", elStagesList).forEach((stageBtn) => {
      stageBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        stageBtn.classList.add("is-dropover");
      });
      stageBtn.addEventListener("dragleave", () => {
        stageBtn.classList.remove("is-dropover");
      });
      stageBtn.addEventListener("drop", async (e) => {
        e.preventDefault();
        stageBtn.classList.remove("is-dropover");

        const statusIdRaw = stageBtn.getAttribute("data-status-id");
        const statusId = Number(statusIdRaw);

        if (!Number.isFinite(statusId) || statusId <= 0) return;

        let orderId = null;
        try { orderId = Number(e.dataTransfer.getData("text/plain")); } catch {}
        if (!Number.isFinite(orderId) || orderId <= 0) return;

        try {
          await apiJson(`/api/admin/orders/${orderId}/status`, {
            method: "PUT",
            body: { status_id: statusId },
          });

          await loadStatuses();
          renderStages();
          await loadAndRenderOrders(true);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  function renderStages() {
    if (!elStagesList) return;
    elStagesList.innerHTML = "";

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
  }

  // -----------------------------
  // Orders list
  // -----------------------------
  function orderMatchesFilters(order) {
    if (!order) return false;

    if (state.activeStatusId !== "all" && Number(order.status_id) !== Number(state.activeStatusId)) {
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
    row.className = "order-row js-order";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("draggable", "true");
    row.setAttribute("data-order-id", String(order.id));

    updateOrderRow(row, order);

    row.addEventListener("dragstart", (e) => {
      state.draggingOrderId = Number(order.id) || null;
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(order.id));
      } catch {}
      row.classList.add("is-dragging");
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      state.draggingOrderId = null;
    });

    row.addEventListener("dragover", (e) => {
      if (state.activeStatusId === "all") return;
      e.preventDefault();
      row.classList.add("is-dropover");
    });

    row.addEventListener("dragleave", () => row.classList.remove("is-dropover"));

    row.addEventListener("drop", async (e) => {
      if (state.activeStatusId === "all") return;
      e.preventDefault();
      row.classList.remove("is-dropover");

      const draggedId = state.draggingOrderId;
      const targetId = Number(row.getAttribute("data-order-id"));
      if (!draggedId || !targetId || draggedId === targetId) return;

      const idxFrom = state.orders.findIndex((x) => Number(x.id) === Number(draggedId));
      const idxTo = state.orders.findIndex((x) => Number(x.id) === Number(targetId));
      if (idxFrom < 0 || idxTo < 0) return;

      const moved = state.orders.splice(idxFrom, 1)[0];
      state.orders.splice(idxTo, 0, moved);

      try {
        await apiJson(`/api/admin/orders/reorder`, {
          method: "PUT",
          body: {
            status_id: Number(state.activeStatusId),
            orderedIds: state.orders.map((x) => Number(x.id)),
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

    const timeIconHtml = renderOrderTimeIcon(order);
    const stageCycleBtnHtml = renderOrderStatusCycleButton(order);
    const addressCommentDisplay = order.comment || "Нет комментария";
    const rawAddress = order.address ||
      (order.pickup_store_address
        ? (order.pickup_store_name ? `${order.pickup_store_name}, ${order.pickup_store_address}` : order.pickup_store_address)
        : "?"
      );
    const shortAddressDisplay = shortAddressForList(rawAddress);

    const customerId = Number(order.customer_id || 0);
    const customerPhoneRaw = String(order.customer_phone || "").trim();
    const customerPhone = customerPhoneRaw === "?" ? "" : customerPhoneRaw;
    const canOpenClient = (Number.isFinite(customerId) && customerId > 0) || !!customerPhone;
    const clientPhoneLineHtml = canOpenClient
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
      `;

    const payment = order.payment_title || "";
    const totalText = money(order.total_price || 0);
    const paymentCode = (order.payment_code || "").toLowerCase();
    const isCash = paymentCode.includes("cash");
    const isCard = paymentCode.includes("card") || (!isCash && paymentCode);

    row.innerHTML = `
      <div class="order-col order-id">
        <div class="order-id-num">${escapeHtml(order.id)}</div>
        <div class="order-id-time">${escapeHtml(formatTime(order.created_at))}</div>
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
        <button class="order-payment-btn ${isCash ? "order-payment-cash" : "order-payment-card"}" type="button">
          <i class="fas ${paymentIcon(order.payment_code)}"></i> ${escapeHtml(totalText)}
        </button>
      </div>
    `;

    if (state.activeOrderId && Number(state.activeOrderId) === Number(order.id)) {
      row.classList.add("is-active");
    } else {
      row.classList.remove("is-active");
    }
  }

  function renderOrders() {
    if (!elOrdersList) return;
    elOrdersList.innerHTML = "";

    const list = state.orders || [];
    const filtered = list.filter(orderMatchesFilters);
    if (!filtered.length) {
      if (elEmptyHint) elEmptyHint.classList.remove("hidden");
      if (!tabsState.tabs.length) {
        setInfo(null);
      }
      syncActiveOrderRowState();
      return;
    }
    if (elEmptyHint) elEmptyHint.classList.add("hidden");

    filtered.forEach((o) => {
      const row = buildOrderRow(o);
      elOrdersList.appendChild(row);
    });

    if (tabsState.tabs.length) {
      syncActiveOrderRowState();
    } else if (!state.activeOrderId) {
      setInfo(null);
    }
  }

  function upsertOrderRow(order) {
    if (!elOrdersList) return;
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
    syncActiveOrderRowState();
    renderOrderTabs();
    setInfo(null);
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
    if (state.activeStatusId !== "all") qs.set("status_id", String(state.activeStatusId));
    if (state.date.start && state.date.end) {
      qs.set("start_date", toDateKey(state.date.start));
      qs.set("end_date", toDateKey(state.date.end));
    }
    qs.set("limit", "500");
    qs.set("offset", "0");

    const json = await apiJson(`/api/admin/orders?${qs.toString()}`);
    state.orders = Array.isArray(json.data) ? json.data : [];
  }

  async function loadAndRenderOrders(keepSelection = false) {
    const prevActive = keepSelection ? state.activeOrderId : null;
    if (!keepSelection && !tabsState.tabs.length) {
      state.activeOrderId = null;
    }

    await loadOrders();
    renderOrders();

    if (tabsState.tabs.length) {
      syncTabsWithLatestOrders();
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

    const year = state.date.viewYear;
    const month = state.date.viewMonth;
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
    if (prevStatusId && !nextStatusId) return false;
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

  function handleOrderEvent(order) {
    if (!order || !order.id) return;

    const idx = state.orders.findIndex((o) => Number(o.id) === Number(order.id));
    const wasExisting = idx >= 0;
    const prevOrder = wasExisting ? state.orders[idx] : null;
    if (wasExisting) {
      state.orders[idx] = { ...state.orders[idx], ...order };
    } else {
      state.orders.unshift(order);
    }

    upsertOrderRow(order);
    const tab = tabsState.tabs.find((t) => Number(t.orderId) === Number(order.id));
    if (tab) {
      tab.order = { ...tab.order, ...order };
      tab.title = buildOrderTabTitle(tab.order);
      if (tabsState.activeKey === tab.key) {
        state.activeOrderId = tab.orderId;
        setInfo(tab.order);
      }
      renderOrderTabs();
      syncActiveOrderRowState();
    } else if (state.activeOrderId && Number(state.activeOrderId) === Number(order.id)) {
      setInfo(order);
    }

    if (applyStageCountersDelta(prevOrder, order)) {
      renderStages();
    }
    scheduleStageRefresh();

    const statusCode = (order.status_code || "").toLowerCase();
    if (statusCode === "cancelled" || statusCode === "canceled") {
      const url = state.tenantSounds && state.tenantSounds.sound_order_cancelled_url;
      if (url) playNotificationSound(url);
    }
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
      if (newOrders.length) {
        for (const nextOrder of newOrders) {
          applyStageCountersDelta(null, nextOrder);
        }
        renderStages();
        scheduleStageRefresh();
        notifyNewOrders(newOrders);
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

    if (ordersPollTimer) return;
    ordersPollTimer = true;
    scheduleNextPoll();
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

    const openClientBtn = e.target.closest('[data-action="open-client"]');
    if (openClientBtn) {
      e.preventDefault();
      e.stopPropagation();

      let clientId = Number(openClientBtn.getAttribute("data-client-id") || 0);
      let clientPhone = String(openClientBtn.getAttribute("data-client-phone") || "").trim();
      let clientName = String(openClientBtn.getAttribute("data-client-name") || "").trim();

      const row = openClientBtn.closest(".js-order");
      if (row && ((!Number.isFinite(clientId) || clientId <= 0) || !clientPhone || !clientName)) {
        const orderId = Number(row.getAttribute("data-order-id") || 0);
        const order = state.orders.find((x) => Number(x.id) === orderId);
        if (order) {
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

    const row = e.target.closest(".js-order");
    if (!row) return;
    const orderId = Number(row.getAttribute("data-order-id")) || null;
    if (!orderId) return;
    const order = state.orders.find((o) => Number(o.id) === Number(orderId));
    if (!order) return;
    ensureOrderTab(order, { activate: true, openMobile: true });
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
    
    printOrderReceipt(order);
  });

  // Функция печати чека через системную печать браузера
  function printOrderReceipt(order) {
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
    // Время в базе уже в timezone филиала
    const createdAtStr = String(order.created_at).replace(' ', 'T');
    const date = new Date(createdAtStr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    const dateStr = `${day}.${month}.${year}, ${hours}:${minutes}`;

    const methodTitle = order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка");
    const deliverySectionTitle = order.method_code === "pickup" ? "Самовывоз:" : "Доставка:";
    let address = order.address;
    if (!address && order.pickup_store_address) {
      address = order.pickup_store_name
        ? `${order.pickup_store_name}, ${order.pickup_store_address}`
        : order.pickup_store_address;
    }
    const isUrgent = order.is_urgent || order.urgent || order.time_option_code === "urgent";
    const total = parseFloat(order.total_price || order.total || 0);
    const deliveryCost = Number(order.delivery_cost || 0);
    const changeFromRaw = order.change_from;
    const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
    const paymentTitle = order.payment_method_title || order.payment_title || "";
    const paymentCode = order.payment_code || "";
    const changeAmount = Math.max(0, changeFrom - total);
    const showChange = changeAmount > 0;
    const scheduleText = formatScheduleText(order, { includeTitle: true });

    function receiptTotalStr(val) {
      const n = Number(val);
      if (!Number.isFinite(n)) return '';
      if (n === 0) return '';
      return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
    }

    const receiptItems = Array.isArray(order.items) ? order.items.slice().sort((a, b) => {
      const aAuto = isAutoAddItem(a);
      const bAuto = isAutoAddItem(b);
      if (aAuto && !bAuto) return 1;
      if (!aAuto && bAuto) return -1;
      return 0;
    }) : [];

    let itemsHtml = '';
    if (receiptItems.length) {
      receiptItems.forEach(item => {
        // Комбо: тот же состав, что в админке и у клиента; позиции с количеством 0 не показываем
        if (item.type === 'combo') {
          const name = escapeHtml(item.name || item.combo_title || 'Комбо');
          const qty = Math.max(1, Number(item.quantity || item.qty || 1));
          const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? 0);
          const oldLineTotal = Number(item.old_line_total) || 0;
          const showOldPrice = oldLineTotal > lineTotal;
          const priceStr = showOldPrice
            ? `<span class="receipt-old-price">${receiptTotalStr(oldLineTotal)}</span>${receiptTotalStr(lineTotal)}`
            : receiptTotalStr(lineTotal);
          const qtyStr = `${qty} Х`;
          const bulletPrefix = '• ';
          let compositionHtml = '';
          const selections = Array.isArray(item.selections) ? item.selections : [];
          selections.forEach((sel) => {
            const productName = escapeHtml(sel.product_name || '—');
            compositionHtml += `<div class="receipt-composition-item" style="font-weight: bold;">1 × ${productName}</div>`;
            const vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
            if (vParts.length) {
              compositionHtml += `<div class="receipt-composition-item">${bulletPrefix}${escapeHtml(vParts.join(' '))}</div>`;
            }
            const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
            ingredientsDisplay.forEach((ing) => {
              const rawQty = ing.qty ?? ing.quantity;
              const numQty = typeof rawQty === 'number' ? rawQty : parseFloat(rawQty);
              if (!Number.isFinite(numQty) || numQty <= 0) return;
              const ingName = escapeHtml(ing.name || '');
              const unit = escapeHtml(String(ing.unit || '').trim());
              const parts = [];
              if (rawQty != null && rawQty !== '') parts.push(String(rawQty));
              if (unit) parts.push(unit);
              if (ingName) parts.push(ingName);
              compositionHtml += `<div class="receipt-composition-item">${bulletPrefix}${escapeHtml(parts.join(' '))}</div>`;
            });
          });
          itemsHtml += `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${name}</span>
              ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ''}
            </div>
            ${compositionHtml ? '<div class="receipt-composition">' + compositionHtml + '</div>' : ''}
          </div>
        `;
          return;
        }

        const name = escapeHtml(item.product_name || item.name || 'Товар');
        const qty = Math.max(1, Number(item.quantity || item.qty || 1));
        const basePrice = parseFloat(item.price || 0);
        const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? (basePrice * qty) ?? 0);
        const discountOriginal = item.discount?.original_line_total;
        const oldLineTotal = discountOriginal || 0;
        const showOldPrice = oldLineTotal > lineTotal;
        const priceStr = showOldPrice
          ? `<span class="receipt-old-price">${receiptTotalStr(oldLineTotal)}</span>${receiptTotalStr(lineTotal)}`
          : receiptTotalStr(lineTotal);
        const qtyStr = `${qty} Х`;
        const bulletPrefix = '• ';

        // Варианты товара (первыми)
        const variants = Array.isArray(item.variants) ? item.variants : [];
        let variantsHtml = '';
        if (variants.length) {
          variantsHtml = '<div class="receipt-composition">';
          variants.forEach((v) => {
            const groupTitle = escapeHtml(v.group_title || "Вариант");
            const variantValue = escapeHtml(v.label || v.value || "");
            const variantValueTrimmed = variantValue.trim();
            const groupTitleTrimmed = groupTitle.trim();
            let formatted;
            if (variantValueTrimmed && groupTitleTrimmed) {
              const variantLower = variantValueTrimmed.toLowerCase();
              const groupLower = groupTitleTrimmed.toLowerCase();
              if (variantLower.endsWith(" " + groupLower) || variantLower.endsWith(groupLower)) {
                formatted = variantValue;
              } else {
                formatted = `${variantValue} ${groupTitle}`.trim();
              }
            } else {
              formatted = `${variantValue} ${groupTitle}`.trim();
            }
            variantsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
          });
          variantsHtml += '</div>';
        }

        // Ингредиенты товара (вторыми) — не показываем с количеством 0
        const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
        const ingredientsFilteredReceipt = ingredients.filter((ing) => Number(ing.quantity ?? ing.qty ?? 0) > 0);
        let ingredientsHtml = '';
        if (ingredientsFilteredReceipt.length) {
          ingredientsHtml = '<div class="receipt-composition">';
          ingredientsFilteredReceipt.forEach((ing) => {
            const ingName = escapeHtml(ing.name || "Ингредиент");
            const ingQty = Number(ing.quantity ?? ing.qty ?? 0);
            let ingUnit = escapeHtml(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
            if (!ingUnit) {
              ingUnit = ingQty > 10 ? "г" : "шт";
            }
            const formatted = `${ingQty}${ingUnit} ${ingName}`;
            ingredientsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
          });
          ingredientsHtml += '</div>';
        }

        // Опции товара (третьими) — не показываем с количеством 0
        const options = Array.isArray(item.options) ? item.options : [];
        const optionsFilteredReceipt = options.filter((opt) => Number(opt.qty ?? opt.quantity ?? 0) > 0);
        let optionsHtml = '';
        if (optionsFilteredReceipt.length) {
          optionsHtml = '<div class="receipt-composition">';
          optionsFilteredReceipt.forEach((opt) => {
            const optName = escapeHtml(opt.title || "Опция");
            const variantLabel = escapeHtml((opt.variant_label || opt.variantLabel || "").trim());
            let formatted;
            if (variantLabel) {
              formatted = `${variantLabel} ${optName}`;
            } else {
              const optQty = Math.max(1, Number(opt.qty || 1));
              formatted = `${optQty}шт ${optName}`;
            }
            optionsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
          });
          optionsHtml += '</div>';
        }

        itemsHtml += `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${name}</span>
              ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ''}
            </div>
            ${variantsHtml}
            ${ingredientsHtml}
            ${optionsHtml}
          </div>
        `;
      });
    }

    const receiptDiscountSummary = buildOrderDiscountSummary(order);
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
    .receipt-item {
      margin: 5px 0;
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
      margin: 3px 0 3px 15px;
      font-size: 9pt;
    }
    .receipt-composition-item {
      margin: 2px 0;
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
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #${order.id}</div>
  <div class="receipt-date">${dateStr}</div>
  
  <div class="receipt-divider"></div>
  ${(scheduleText || isUrgent) ? `
  <div class="receipt-section receipt-when-block">
    <div class="receipt-when-text">${escapeHtml(scheduleText || (isUrgent ? "Быстрее" : ""))}</div>
  </div>
  <div class="receipt-divider"></div>
  ` : ''}
  
  <div class="receipt-section">
    ${order.customer_name ? `<div>${escapeHtml(order.customer_name)}</div>` : ''}
    ${order.customer_phone ? `<div>${escapeHtml(order.customer_phone)}</div>` : ''}
  </div>
  
  <div class="receipt-section">
    <div>${escapeHtml(methodTitle || "—")}</div>
    <div>${escapeHtml(address || "—")}</div>
  </div>
  
  ${(order.address_comment && order.address_comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(order.address_comment)}</div>
  </div>
  ` : ''}
  ${(order.comment && order.comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(order.comment)}</div>
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
  async function init() {
    try {
      // Load store timezone from API (not from localStorage)
      try {
        const response = await apiJson('/api/admin/tenant/current-time');
        if (response.ok && response.data) {
          state.storeTimezone = response.data.storeTimezone || "+0";
        } else {
          state.storeTimezone = "+0";
        }
      } catch (err) {
        console.error("Failed to load store timezone:", err);
        state.storeTimezone = "+0";
      }

      // Initialize date filter with store's current date
      const storeNow = getStoreDateNow(state.storeTimezone);
      state.date.start = storeNow;
      state.date.end = storeNow;
      state.date.viewYear = storeNow.getFullYear();
      state.date.viewMonth = storeNow.getMonth();

      renderCalendar();
      updateDateLabel();

      await loadStatuses();
      // По умолчанию выбран этап "Новые" (первый статус по сортировке)
      const sortedStatuses = [...state.statuses].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
      if (sortedStatuses.length) {
        state.activeStatusId = sortedStatuses[0].id;
      }
      renderStages();
      await loadAndRenderOrders(false);

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

      document.addEventListener("click", unlockAudioOnce, { once: true });
      document.addEventListener("keydown", unlockAudioOnce, { once: true });

      stopOrdersPolling();
      startOrdersPolling();
    } catch (e) {
      console.error(e);
    }
  }

  init();

  // Слушать изменение филиала: переподключить SSE к каналу нового филиала и перезагрузить заказы
  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен:', event.detail.store);
    state.clientsCache.clear();
    state.lastEventId = null;
    loadAndRenderOrders(false);
    stopOrdersPolling();
    startOrdersPolling();
  });
})();

