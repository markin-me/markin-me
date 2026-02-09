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

  // -----------------------------
  // DOM
  // -----------------------------
  const elFilters = $("#clientsFiltersList");
  const elList = $("#clientsList");
  const elEmpty = $("#clientsEmptyHint");
  const elSearch = $("#clientsSearch");
  const elSearchClear = $("#clientsSearchClear");
  const elSearchToggle = $("#clientsSearchToggle");
  const elSearchWrap = $("#clientsSearchWrap");
  const elToolbarTitle = $("#clientsToolbarTitle");
  const elSortToggle = $("#clientsSortToggle");
  const elSortDropdown = $("#clientsSortDropdown");
  const elSortWrap = $("#clientsSortWrap");
  const elAddBtn = $("#clientsAddBtn");

  // client tabs (top-level, switching between clients)
  const clientTabsHeader = $("#clientTabsHeader");
  const clientTabs = $("#clientTabs");
  const clientEmpty = $("#clientEmpty");
  const clientInfoWrap = $("#clientInfoWrap");

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
  const clientAddressesList = $("#clientAddresses");
  const clientOrdersList = $("#clientOrdersList");
  const clientOrdersListView = $("#clientOrdersListView");
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
    activeFilter: "all",
    q: "",
    sort: "last_desc",
    clients: [],
    activeClientId: null,
    activeClient: null,
    addresses: [],
    clientOrders: [],
    totals: { all: 0, active: 0, inactive: 0 },
    activeContentTab: "addresses",
  };

  // -----------------------------
  // Tabs state (top-level: switching between clients)
  // -----------------------------
  const tabsState = {
    tabs: [],
    activeKey: null,
  };

  function buildTabKey(id) {
    return `client:${id}`;
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
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-tab-key="${tab.key}">
          <span class="product-tab-title">${escapeHtml(tab.title || "Клиент")}</span>
          <button class="product-tab-close" type="button" data-tab-close="${tab.key}" aria-label="Закрыть">&times;</button>
        </div>
      `;
    }).join("");
  }

  function showEmptyState() {
    if (clientEmpty) clientEmpty.classList.remove("hidden");
    if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
  }

  function hideEmptyState() {
    if (clientEmpty) clientEmpty.classList.add("hidden");
    if (clientInfoWrap) clientInfoWrap.classList.remove("hidden");
  }

  async function setActiveTabKey(key) {
    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    tabsState.activeKey = key;
    renderTabs();
    hideEmptyState();
    if (typeof tab.onActivate === "function") {
      await tab.onActivate();
    }
  }

  function ensureTab({ id, title, onActivate, activate = true }) {
    const key = buildTabKey(id);
    let tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = { key, id, title, onActivate };
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
    const wasActive = tabsState.activeKey === key;
    tabsState.tabs.splice(idx, 1);
    if (wasActive) {
      if (tabsState.tabs.length > 0) {
        const newIdx = Math.min(idx, tabsState.tabs.length - 1);
        await setActiveTabKey(tabsState.tabs[newIdx].key);
      } else {
        tabsState.activeKey = null;
        state.activeClientId = null;
        state.activeClient = null;
        renderTabs();
        showEmptyState();
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

  // -----------------------------
  // Content tabs (Адреса / История заказов)
  // -----------------------------
  function setContentTab(tab) {
    state.activeContentTab = tab;
    if (clientContentTabs) {
      $$("[data-ctab]", clientContentTabs).forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.ctab === tab);
      });
    }
    [clientTabAddresses, clientTabOrders].forEach((panel) => {
      if (panel) panel.classList.toggle("is-active", panel.dataset.ctab === tab);
    });
    // lazy load orders
    if (tab === "orders" && state.activeClientId) {
      loadClientOrders().catch(console.error);
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

  // -----------------------------
  // Render: filters
  // -----------------------------
  function renderFilters() {
    if (!elFilters) return;
    elFilters.innerHTML = "";
    const items = [
      { id: "all", title: "Все клиенты", subtitle: "все", count: state.totals.all },
      { id: "active", title: "Активные", subtitle: "is_active=1", count: state.totals.active },
      { id: "inactive", title: "Неактивные", subtitle: "is_active=0", count: state.totals.inactive },
    ];
    items.forEach((it) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-item";
      btn.setAttribute("data-filter", it.id);
      btn.classList.toggle("is-active", state.activeFilter === it.id);
      btn.innerHTML = `
        <span class="stage-icon"><i class="fas fa-users"></i></span>
        <span class="stage-text">
          <strong>${escapeHtml(it.title)}</strong>
          <small>${escapeHtml(it.subtitle)}</small>
        </span>
        <span class="stage-count">${escapeHtml(it.count)}</span>
      `;
      btn.addEventListener("click", () => {
        state.activeFilter = it.id;
        renderFilters();
        loadClients().catch(console.error);
      });
      elFilters.appendChild(btn);
    });
  }

  // -----------------------------
  // Render: clients list
  // -----------------------------
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
      elList.appendChild(row);
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

  async function loadAddresses() {
    if (!state.activeClientId) return;
    const json = await apiJson(`/api/admin/clients/${state.activeClientId}/addresses`);
    state.addresses = Array.isArray(json.data) ? json.data : [];
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

  async function loadClientOrders() {
    if (!state.activeClientId) return;
    showOrdersList();
    if (clientOrdersList) clientOrdersList.innerHTML = `<div class="muted">Загрузка…</div>`;

    try {
      const json = await apiJson(`/api/admin/clients/${state.activeClientId}/orders`);
      state.clientOrders = Array.isArray(json.data) ? json.data : [];
      renderClientOrders();
    } catch (err) {
      console.error(err);
      if (clientOrdersList) clientOrdersList.innerHTML = `<div class="muted">Ошибка загрузки заказов</div>`;
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
      } catch { items = []; }
      if (Array.isArray(items)) {
        items.forEach((it) => { itemsCount += Number(it.qty || it.quantity || 0) || 0; });
      }

      const card = document.createElement("div");
      card.className = "shop-profile-card";
      card.style.cursor = "pointer";
      card.innerHTML = `
        <div><strong>Заказ #${escapeHtml(o.id)}</strong> <span class="muted">• ${escapeHtml(o.status_title || "—")}</span></div>
        <div class="muted">${escapeHtml(fmtDateTime(o.created_at))}</div>
        <div><strong>${money(o.total_price || 0)}</strong> <span class="muted">• позиций: ${itemsCount}</span></div>
      `;
      card.addEventListener("click", () => openOrderDetail(o.id));
      clientOrdersList.appendChild(card);
    });
  }

  // -----------------------------
  // Order detail
  // -----------------------------
  async function openOrderDetail(orderId) {
    showOrderDetail();
    if (clientOrderDetailContent) clientOrderDetailContent.innerHTML = `<div class="muted">Загрузка…</div>`;

    try {
      const json = await apiJson(`/api/admin/orders/${orderId}`);
      const order = json.data;
      if (!order) {
        if (clientOrderDetailContent) clientOrderDetailContent.innerHTML = `<div class="muted">Не удалось загрузить заказ</div>`;
        return;
      }
      renderOrderDetail(order);
    } catch (err) {
      console.error(err);
      if (clientOrderDetailContent) clientOrderDetailContent.innerHTML = `<div class="muted">Ошибка загрузки заказа</div>`;
    }
  }

  function formatOrderItem(item) {
    const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
    const mainPhoto = photos[0] || "";
    const itemQty = Number(item.qty || item.quantity || 1);
    const itemName = escapeHtml(item.name || "Товар");

    const parts = [];

    // variants
    if (Array.isArray(item.variants)) {
      item.variants.forEach((v) => {
        const label = v.label || v.value || "";
        const group = v.group_title || "";
        if (label) parts.push(`${label} ${group}`.trim());
      });
    }

    // options
    if (Array.isArray(item.options)) {
      item.options.forEach((opt) => {
        const qty = Number(opt.qty || opt.quantity || 0);
        if (qty <= 0) return;
        const name = opt.title || opt.name || "";
        const vl = opt.variant_label || "";
        if (vl) { parts.push(`${vl} ${name}`.trim()); }
        else if (name) { parts.push(`${qty}шт ${name}`.trim()); }
      });
    }

    // ingredients
    if (Array.isArray(item.ingredients)) {
      item.ingredients.forEach((ing) => {
        const name = ing.ingredient_name || ing.name || "";
        if (!name) return;
        const qty = Number(ing.quantity ?? ing.qty ?? 1);
        if (qty <= 0) return;
        const unit = ing.unit_label || ing.unit || "";
        parts.push(`${qty}${unit} ${name}`.trim());
      });
    }

    let html = `<div class="cl-order-item">`;
    if (mainPhoto) {
      html += `<img class="cl-order-item-photo" src="${escapeHtml(mainPhoto)}" alt="" />`;
    } else {
      html += `<div class="cl-order-item-photo cl-order-item-photo--empty"></div>`;
    }
    html += `<div class="cl-order-item-mid">`;
    html += `<div class="cl-order-item-title">${itemName}</div>`;
    if (parts.length) {
      parts.forEach((p) => {
        html += `<div class="cl-order-item-sub">• ${escapeHtml(p)}</div>`;
      });
    }
    html += `</div>`;
    html += `<div class="cl-order-item-right">`;
    html += `<div class="cl-order-item-qty">× ${itemQty}</div>`;
    html += `<div class="cl-order-item-price">${money(item.line_total || item.price || 0)}</div>`;
    html += `</div>`;
    html += `</div>`;
    return html;
  }

  function renderOrderDetail(order) {
    if (!clientOrderDetailContent) return;

    let items = [];
    try {
      items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (!Array.isArray(items)) items = [];
    } catch { items = []; }

    let html = `<div class="cl-order-detail">`;

    // Header
    html += `<div class="cl-od-header">`;
    html += `<div class="cl-od-title">Заказ #${escapeHtml(order.id)}</div>`;
    html += `<div class="cl-od-status">${escapeHtml(order.status_title || "—")}</div>`;
    html += `</div>`;

    // Info rows
    html += `<div class="cl-od-info">`;
    html += `<div class="cl-od-row"><span class="cl-od-label">Дата и время</span><span class="cl-od-value">${escapeHtml(fmtDateTime(order.created_at))}</span></div>`;
    if (order.method_title) {
      html += `<div class="cl-od-row"><span class="cl-od-label">Способ доставки</span><span class="cl-od-value">${escapeHtml(order.method_title)}</span></div>`;
    }
    if (order.time_option_title) {
      html += `<div class="cl-od-row"><span class="cl-od-label">Время доставки</span><span class="cl-od-value">${escapeHtml(order.time_option_title)}</span></div>`;
    }
    html += `</div>`;

    // Address
    if (order.address) {
      html += `<div class="cl-od-section">`;
      html += `<div class="cl-od-section-title">Адрес доставки</div>`;
      html += `<div>${escapeHtml(order.address)}</div>`;
      if (order.address_comment) {
        html += `<div class="muted" style="margin-top:4px;">${escapeHtml(order.address_comment)}</div>`;
      }
      html += `</div>`;
    }

    // Pickup
    if (order.pickup_store_name) {
      html += `<div class="cl-od-section">`;
      html += `<div class="cl-od-section-title">Точка самовывоза</div>`;
      html += `<div>${escapeHtml(order.pickup_store_name)}</div>`;
      if (order.pickup_store_address) {
        html += `<div class="muted" style="margin-top:4px;">${escapeHtml(order.pickup_store_address)}</div>`;
      }
      html += `</div>`;
    }

    // Items
    if (items.length) {
      html += `<div class="cl-od-section">`;
      html += `<div class="cl-od-section-title">Товары</div>`;
      html += `<div class="cl-od-items">`;
      items.forEach((item) => { html += formatOrderItem(item); });
      html += `</div>`;
      html += `</div>`;
    }

    // Comment
    if (order.comment) {
      html += `<div class="cl-od-section">`;
      html += `<div class="cl-od-section-title">Комментарий</div>`;
      html += `<div>${escapeHtml(order.comment)}</div>`;
      html += `</div>`;
    }

    // Summary
    html += `<div class="cl-od-section cl-od-summary">`;
    html += `<div class="cl-od-summary-title">Суммы:</div>`;
    if (order.payment_title) {
      html += `<div class="cl-od-summary-row"><span class="cl-od-label">Оплата</span><span>${escapeHtml(order.payment_title)}</span></div>`;
    }
    html += `<div class="cl-od-summary-row"><span class="cl-od-label">Доставка</span><span>${money(order.delivery_cost || 0)}</span></div>`;
    html += `<div class="cl-od-summary-divider"></div>`;
    html += `<div class="cl-od-summary-total"><span>ИТОГО</span><span>${money(order.total_price || 0)}</span></div>`;
    html += `</div>`;

    html += `</div>`;

    clientOrderDetailContent.innerHTML = html;
  }

  // -----------------------------
  // Open client
  // -----------------------------
  async function openClientById(id) {
    state.activeClientId = Number(id) || null;

    // highlight list
    $$(".order-row.is-active", document).forEach((n) => n.classList.remove("is-active"));
    const row = $(`.order-row[data-client-id="${state.activeClientId}"]`, document);
    if (row) row.classList.add("is-active");

    const json = await apiJson(`/api/admin/clients/${state.activeClientId}`);
    setClient(json.data);
    hideEmptyState();

    // Reset content tab to addresses and order detail view
    showOrdersList();
    setContentTab("addresses");

    await loadAddresses();

    // Reset address form
    if (addrFormCard) addrFormCard.classList.add("hidden");
    if (addrToggleBtn) addrToggleBtn.textContent = "+ Новый адрес";
  }

  async function selectClient(id) {
    const clientId = Number(id) || null;
    if (!clientId) return;

    const clientData = state.clients.find((x) => Number(x.id) === clientId);
    const title = clientData ? (clientData.name || `#${clientId}`) : `#${clientId}`;

    ensureTab({
      id: clientId,
      title,
      onActivate: () => openClientById(clientId),
    });

    if (isMobile()) openSheet();
  }

  // -----------------------------
  // Load clients
  // -----------------------------
  async function loadTotals() {
    const q = state.q ? `&q=${encodeURIComponent(state.q)}` : "";
    const a = await apiJson(`/api/admin/clients?limit=1&offset=0${q}`);
    const b = await apiJson(`/api/admin/clients?limit=1&offset=0&is_active=1${q}`);
    const c = await apiJson(`/api/admin/clients?limit=1&offset=0&is_active=0${q}`);
    state.totals.all = Number(a.total || 0);
    state.totals.active = Number(b.total || 0);
    state.totals.inactive = Number(c.total || 0);
  }

  async function loadClients() {
    const qs = new URLSearchParams();
    qs.set("limit", "80");
    qs.set("offset", "0");
    if (state.q) qs.set("q", state.q);
    if (state.activeFilter === "active") qs.set("is_active", "1");
    if (state.activeFilter === "inactive") qs.set("is_active", "0");

    const json = await apiJson(`/api/admin/clients?${qs.toString()}`);
    state.clients = Array.isArray(json.data) ? json.data : [];

    await loadTotals();
    renderFilters();
    applyClientsSort();

    if (state.activeClientId) {
      const exists = state.clients.some((x) => Number(x.id) === Number(state.activeClientId));
      if (!exists) state.activeClientId = null;
    }

    renderClients();
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
    if (elSearchWrap) elSearchWrap.classList.remove("hidden");
    if (elToolbarTitle) elToolbarTitle.classList.add("hidden");
    if (elSearch) { elSearch.value = state.q || ""; elSearch.focus(); }
  }
  function closeSearch() {
    if (elSearchWrap) elSearchWrap.classList.add("hidden");
    if (elToolbarTitle) elToolbarTitle.classList.remove("hidden");
    if (elSearch) elSearch.value = "";
    if (state.q) {
      state.q = "";
      loadClients().catch(console.error);
    }
  }

  if (elSearchToggle) {
    elSearchToggle.addEventListener("click", () => {
      const isOpen = elSearchWrap && !elSearchWrap.classList.contains("hidden");
      if (isOpen) closeSearch();
      else openSearch();
    });
  }

  if (elSearch) elSearch.addEventListener("input", onSearch);
  if (elSearch) elSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch();
  });
  if (elSearchClear) elSearchClear.addEventListener("click", () => {
    if (elSearch) elSearch.value = "";
    state.q = "";
    loadClients().catch(console.error);
  });

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
      applyClientsSort();
      renderClients();
    });
  }

  // close sort dropdown on outside click
  document.addEventListener("click", (e) => {
    if (elSortWrap && !elSortWrap.contains(e.target)) {
      closeSortDropdown();
    }
  });

  // Add client stub
  if (elAddBtn) {
    elAddBtn.addEventListener("click", () => {
      // TODO: открыть форму добавления клиента
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  loadClients().catch(console.error);

  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен (clients):', event.detail.store);
    loadClients().catch(console.error);
  });
})();
