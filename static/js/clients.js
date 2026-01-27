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
    // Получаем токен и store_id из localStorage
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": storeId,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    // Добавляем токен авторизации, если он есть
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
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
  const elFilters = $("#clientsFiltersList");
  const elList = $("#clientsList");
  const elEmpty = $("#clientsEmptyHint");
  const elSearch = $("#clientsSearch");
  const elSort = $("#clientsSort");
  const elSearchClear = $("#clientsSearchClear");

  // desktop info
  const info = {
    title: $("#clientInfoTitle"),
    meta: $("#clientInfoMeta"),
    name: $("#clientInfoName"),
    phone: $("#clientInfoPhone"),
    birthday: $("#clientInfoBirthday"),
    orders: $("#clientInfoOrders"),
    spent: $("#clientInfoSpent"),
    last: $("#clientInfoLastOrder"),
    addrs: $("#clientAddresses"),
  };

  // sheet info
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

  // address form
  const addrStreet = $("#addrStreet");
  const addrHouse = $("#addrHouse");
  const addrEntrance = $("#addrEntrance");
  const addrFloor = $("#addrFloor");
  const addrApartment = $("#addrApartment");
  const addrComment = $("#addrComment");
  const addrIsDefault = $("#addrIsDefault");
  const addrAddBtn = $("#addrAddBtn");
  const reloadAddrsBtn = $("#clientReloadAddresses");

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    activeFilter: "all", // all | active | inactive
    q: "",
    sort: "last_desc",
    clients: [],
    activeClientId: null,
    activeClient: null,
    addresses: [],
    totals: { all: 0, active: 0, inactive: 0 },
  };

  // Apply client-side sorting to `state.clients` according to `state.sort`.
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
    // ожидаем 11 цифр с 7
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
      setClient(null);
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
      // apply inline grid template to force layout (avoids CSS cascade/cache issues)
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

    if (!state.activeClientId && list.length) {
      selectClient(list[0].id);
    }
  }

  // -----------------------------
  // Client info + addresses
  // -----------------------------
  function setClient(client) {
    state.activeClient = client;

    if (!client) {
      setTextAll([info.title, sheetInfo.title], "Клиент не выбран");
      setTextAll([info.meta, sheetInfo.meta], "Выбери клиента в центре");
      setTextAll([info.name, sheetInfo.name], "—");
      setTextAll([info.phone, sheetInfo.phone], "—");
      setTextAll([info.birthday, sheetInfo.birthday], "—");
      setTextAll([info.orders, sheetInfo.orders], "—");
      setTextAll([info.spent, sheetInfo.spent], "—");
      setTextAll([info.last, sheetInfo.last], "—");
      if (info.addrs) info.addrs.innerHTML = "";
      if (sheetInfo.addrs) sheetInfo.addrs.innerHTML = "";
      return;
    }

    setTextAll([info.title, sheetInfo.title], `Клиент #${client.id}`);
    setTextAll([info.meta, sheetInfo.meta], `Создан: ${fmtDateTime(client.created_at)}`);
    setTextAll([info.name, sheetInfo.name], client.name || "—");
    setTextAll([info.phone, sheetInfo.phone], formatPhoneDigitsToRU(client.phone) || "—");
    setTextAll([info.birthday, sheetInfo.birthday], client.birthday ? fmtDate(client.birthday) : "—");
    setTextAll([info.orders, sheetInfo.orders], String(Number(client.total_orders || 0)));
    setTextAll([info.spent, sheetInfo.spent], money(client.total_spent || 0));
    setTextAll([info.last, sheetInfo.last], client.last_order_date ? fmtDateTime(client.last_order_date) : "—");
  }

  function renderAddresses() {
    const targets = [info.addrs, sheetInfo.addrs].filter(Boolean);
    targets.forEach((t) => (t.innerHTML = ""));

    const list = state.addresses || [];
    if (!list.length) {
      targets.forEach((t) => {
        t.innerHTML = `<div class="empty-state" style="padding:12px; border:1px solid var(--color-border); border-radius:14px; background:var(--color-surface);">
          <div class="empty-title">Адресов нет</div>
          <div class="empty-text">Добавь адрес ниже</div>
        </div>`;
      });
      return;
    }

    list.forEach((a) => {
      const line1 = `${a.street}, ${a.house}`;
      const line2Parts = [];
      if (a.entrance) line2Parts.push(`подъезд ${a.entrance}`);
      if (a.floor) line2Parts.push(`этаж ${a.floor}`);
      if (a.apartment) line2Parts.push(`кв. ${a.apartment}`);
      const line2 = line2Parts.join(", ");

      const cardHtml = `
        <div class="cart-row" style="grid-template-columns: 1fr auto; gap:10px; align-items:start;">
          <div class="cart-mid">
            <div class="cart-title" style="display:flex; gap:8px; align-items:center;">
              <span>${escapeHtml(line1)}</span>
              ${a.is_default ? `<span class="pill pill-strong">По умолчанию</span>` : ``}
            </div>
            <div class="cart-sub">${escapeHtml(line2 || a.comment || "")}</div>
            ${a.comment ? `<div class="cart-sub">${escapeHtml(a.comment)}</div>` : ``}
          </div>

          <div style="display:grid; gap:8px; justify-items:end;">
            ${a.is_default ? `` : `<button class="btn btn-primary js-addr-default" data-id="${a.id}" type="button">Сделать</button>`}
            <button class="btn js-addr-del" data-id="${a.id}" type="button" style="border:1px solid var(--color-border); background:var(--color-surface-2);">
              Удалить
            </button>
          </div>
        </div>
      `;

      targets.forEach((t) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = cardHtml;
        t.appendChild(wrap.firstElementChild);
      });
    });

    // wire buttons (desktop container is enough; события всплывут)
  }

  async function loadAddresses() {
    if (!state.activeClientId) return;
    const json = await apiJson(`/api/admin/clients/${state.activeClientId}/addresses`);
    state.addresses = Array.isArray(json.data) ? json.data : [];
    renderAddresses();
  }

  async function selectClient(id) {
    state.activeClientId = Number(id) || null;

    // highlight list
    $$(".order-row.is-active", document).forEach((n) => n.classList.remove("is-active"));
    const row = $(`.order-row[data-client-id="${state.activeClientId}"]`, document);
    if (row) row.classList.add("is-active");

    const json = await apiJson(`/api/admin/clients/${state.activeClientId}`);
    setClient(json.data);

    await loadAddresses();

    if (isMobile()) openSheet();
  }

  // -----------------------------
  // Load clients
  // -----------------------------
  async function loadTotals() {
    // быстро получаем total для каждого фильтра
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

    // обновим totals + фильтры
    await loadTotals();
    renderFilters();

    // применим клиентскую сортировку (в UI)
    applyClientsSort();

    // если активный клиент исчез после фильтра — сбросим
    if (state.activeClientId) {
      const exists = state.clients.some((x) => Number(x.id) === Number(state.activeClientId));
      if (!exists) state.activeClientId = null;
    }

    renderClients();
  }

  // -----------------------------
  // Address actions
  // -----------------------------
  document.addEventListener("click", async (e) => {
    const btnDefault = e.target.closest(".js-addr-default");
    if (btnDefault) {
      if (!state.activeClientId) return;
      const addressId = Number(btnDefault.getAttribute("data-id"));
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

    const btnDel = e.target.closest(".js-addr-del");
    if (btnDel) {
      if (!state.activeClientId) return;
      const addressId = Number(btnDel.getAttribute("data-id"));
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

  async function addAddress() {
    if (!state.activeClientId) return;

    const body = {
      street: addrStreet ? addrStreet.value.trim() : "",
      house: addrHouse ? addrHouse.value.trim() : "",
      entrance: addrEntrance ? addrEntrance.value.trim() : "",
      floor: addrFloor ? addrFloor.value.trim() : "",
      apartment: addrApartment ? addrApartment.value.trim() : "",
      comment: addrComment ? addrComment.value.trim() : "",
      is_default: addrIsDefault ? !!addrIsDefault.checked : false,
    };

    if (!body.street) return;
    if (!body.house) return;

    await apiJson(`/api/admin/clients/${state.activeClientId}/addresses`, {
      method: "POST",
      body,
    });

    // очистим форму
    if (addrStreet) addrStreet.value = "";
    if (addrHouse) addrHouse.value = "";
    if (addrEntrance) addrEntrance.value = "";
    if (addrFloor) addrFloor.value = "";
    if (addrApartment) addrApartment.value = "";
    if (addrComment) addrComment.value = "";
    if (addrIsDefault) addrIsDefault.checked = false;

    await loadAddresses();
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
  // Wire
  // -----------------------------
  if (elSearch) elSearch.addEventListener("input", onSearch);
  if (elSearchClear) elSearchClear.addEventListener("click", () => {
    if (elSearch) elSearch.value = "";
    state.q = "";
    loadClients().catch(console.error);
  });

  if (elSort) {
    // set default value if present
    elSort.value = state.sort || 'last_desc';
    elSort.addEventListener('change', () => {
      state.sort = String(elSort.value || 'last_desc');
      applyClientsSort();
      renderClients();
    });
  }

  if (addrAddBtn) addrAddBtn.addEventListener("click", () => addAddress().catch(console.error));
  if (reloadAddrsBtn) reloadAddrsBtn.addEventListener("click", () => loadAddresses().catch(console.error));

  // -----------------------------
  // Init
  // -----------------------------
  loadClients().catch(console.error);

  // Слушать изменение точки продаж
  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Точка продаж изменена (clients):', event.detail.store);
    // Перезагрузить клиентов для новой точки
    loadClients().catch(console.error);
  });
})();
