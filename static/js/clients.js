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
  const elSearchToggle = $("#clientsSearchToggle");
  const elSearchWrap = $("#clientsSearchWrap");
  const elToolbarTitle = $("#clientsToolbarTitle");
  const elToolbarText = $("#clientsToolbarText");
  const elSortToggle = $("#clientsSortToggle");
  const elSortDropdown = $("#clientsSortDropdown");
  const elSortWrap = $("#clientsSortWrap");
  const elAddBtn = $("#clientsAddBtn");
  const elOpenFilterCategoriesBtn = $("#openFilterCategoriesBtn");

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
    activeClientId: null,
    activeClient: null,
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
  };

  // -----------------------------
  // Tabs state (top-level: switching between clients)
  // -----------------------------
  const tabsState = {
    tabs: [],
    activeKey: null,
  };

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
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-tab-key="${tab.key}">
          <span class="product-tab-title">${escapeHtml(tab.title || "Клиент")}</span>
          <button class="product-tab-close" type="button" data-tab-close="${tab.key}" aria-label="Закрыть">&times;</button>
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
    
    // Очищаем состояние в зависимости от типа закрытого таба
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

  // Загрузить список клиентов
  async function loadCustomersList() {
    try {
      const json = await apiJson('/api/admin/clients');
      state.customersList = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error('loadCustomersList error:', e);
      state.customersList = [];
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
          const cust = state.customersList.find(c => c.id === id);
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
      // Показываем клиентов
      await loadCustomersList();
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
    
    let items = state.customersList;
    const query = state.discountPickerQuery.toLowerCase();
    if (query) {
      items = items.filter(c => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(query) || phone.includes(query);
      });
    }
    
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
    }
  }

  function updateRightPanel() {
    // Определяем что показывать по активному табу
    const activeTab = tabsState.tabs.find(t => t.key === tabsState.activeKey);
    const isClientTab = activeTab?.type === 'client';
    const isCategoryTab = activeTab?.type === 'category';
    const isDiscountTab = activeTab?.type === 'discount';
    const noTabs = !activeTab;
    
    // Скрываем/показываем элементы правой панели
    // Empty state для клиентов показываем только если нет табов и view = clients
    if (clientEmpty) clientEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'clients');
    // Info клиента показываем если активный таб = client
    if (clientInfoWrap) clientInfoWrap.classList.toggle('hidden', !isClientTab);
    // Empty state для категорий показываем если нет табов и view = filter-categories
    if (elFilterCategoryEmpty) elFilterCategoryEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'filter-categories');
    // Редактор категории показываем если активный таб = category
    if (elFilterEditorWrap) elFilterEditorWrap.classList.toggle('hidden', !isCategoryTab);
    if (elFilterEditorFooter) elFilterEditorFooter.classList.toggle('hidden', !isCategoryTab);
    
    // Empty state для скидок показываем если нет табов и view = discounts
    if (elDiscountEmpty) elDiscountEmpty.classList.toggle('hidden', !noTabs || state.currentView !== 'discounts');
    // Редактор скидки показываем если активный таб = discount и редактируем
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
  // Client discounts
  // -----------------------------
  async function loadClientDiscounts() {
    if (!state.activeClientId) return;
    if (clientDiscountsList) clientDiscountsList.innerHTML = `<div class="muted">Загрузка…</div>`;
    if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add('hidden');

    try {
      const json = await apiJson(`/api/admin/clients/${state.activeClientId}/discounts`);
      state.clientDiscounts = Array.isArray(json.data) ? json.data : [];
      renderClientDiscounts();
    } catch (err) {
      console.error(err);
      if (clientDiscountsList) clientDiscountsList.innerHTML = `<div class="muted">Ошибка загрузки скидок</div>`;
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
      type: 'client',
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
    state.totals.all = Number(a.total || 0);
  }

  async function loadClients() {
    const qs = new URLSearchParams();
    qs.set("limit", "80");
    qs.set("offset", "0");
    if (state.q) qs.set("q", state.q);
    if (state.activeFilter === "custom" && state.activeCustomFilterId) {
      qs.set("filter_id", String(state.activeCustomFilterId));
    }

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
        renderDiscountCustomerList();
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
  
  loadCustomFilters().catch(console.error);
  loadClients().catch(console.error);
  loadDiscounts().catch(console.error);

  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен (clients):', event.detail.store);
    loadCustomFilters().catch(console.error);
    loadClients().catch(console.error);
    loadDiscounts().catch(console.error);
  });
})();
