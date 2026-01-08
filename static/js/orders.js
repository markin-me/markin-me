(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

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

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        "x-tenant-id": String(tenantId),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
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

  const els = {
    title: $("#infoOrderTitle"),
    meta: $("#infoOrderMeta"),
    name: $("#infoClientName"),
    phone: $("#infoClientPhone"),
    pay: $("#infoPayMethod"),
    total: $("#infoTotal"),
    items: $("#infoItems"),
  };

  const sheet = $("#orderSheet");
  const backdrop = $("#sheetBackdrop");
  const closeBtn = $("#sheetClose");

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    statuses: [],
    activeStatusId: "all", // "all" | number
    orders: [],
    activeOrderId: null,

    // drag внутри списка
    draggingOrderId: null,
  };

  // -----------------------------
  // Helpers (format)
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDateTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function itemsToHtml(items) {
    if (!Array.isArray(items) || !items.length) return "—";
    return items
      .map((it) => {
        const name = escapeHtml(it.name || "Товар");
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);
        return `${name} × ${qty} — ${money(price * qty)}`;
      })
      .join("<br/>");
  }

  function setInfoFromDataset(ds) {
    if (!els.title) return;
    els.title.textContent = ds.orderTitle || 'Заказ';
    els.meta.textContent = ds.orderMeta || '';
    els.name.textContent = ds.clientName || '—';
    els.phone.textContent = ds.clientPhone || '—';
    els.pay.textContent = ds.payMethod || '—';
    els.total.textContent = ds.total || '—';
    els.items.innerHTML = ds.items || '—';
  }

  function setInfo(order) {
    if (!els.title) return;

    if (!order) {
      els.title.textContent = "Заказ не выбран";
      els.meta.textContent = "Выбери заказ в центре.";
      els.name.textContent = "—";
      els.phone.textContent = "—";
      els.pay.textContent = "—";
      els.total.textContent = "—";
      els.items.innerHTML = "—";
      return;
    }

    els.title.textContent = `Заказ #${order.id}`;
    els.meta.textContent = formatDateTime(order.created_at);
    els.name.textContent = order.customer_name || "—";
    els.phone.textContent = order.customer_phone || "—";
    els.pay.textContent = order.payment_title || "—";
    els.total.textContent = money(order.total_price || 0);
    els.items.innerHTML = itemsToHtml(order.items || []);
  }

  // -----------------------------
  // Sheet
  // -----------------------------
  function openSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.add('is-open');
    backdrop.classList.add('is-active');
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
  }

  function closeSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-active');
    sheet.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
  }

  // -----------------------------
  // Render: stages
  // -----------------------------
  function stageButton({ id, title, subtitle, icon, count }) {
    const btn = document.createElement("button");
    btn.className = "stage-item";
    btn.type = "button";
    btn.setAttribute("data-status-id", String(id));

    btn.innerHTML = `
      <span class="stage-icon"><i class="fas ${escapeHtml(icon)}"></i></span>
      <span class="stage-text">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(subtitle)}</small>
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

        // "all" — не статус
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

          // перезагрузим список, сохраняя выделение если возможно
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
      subtitle: "все статусы",
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
          subtitle: s.subtitle || "",
          icon: s.icon || "fa-circle",
          count: Number(s.count || 0),
        }));
      });

    syncActiveStage();
    wireDragTargets();
  }

  // -----------------------------
  // Render: orders
  // -----------------------------
  function renderOrders() {
    if (!elOrdersList) return;
    elOrdersList.innerHTML = "";

    const list = state.orders || [];
    if (!list.length) {
      if (elEmptyHint) elEmptyHint.classList.remove("hidden");
      setInfo(null);
      return;
    }
    if (elEmptyHint) elEmptyHint.classList.add("hidden");

    list.forEach((o) => {
      const row = document.createElement("div");
      row.className = "order-row js-order";
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("draggable", "true");
      row.setAttribute("data-order-id", String(o.id));

      row.dataset.orderId = String(o.id);
      row.dataset.orderTitle = `Заказ #${o.id}`;
      row.dataset.orderMeta = formatDateTime(o.created_at);
      row.dataset.clientName = o.customer_name || "—";
      row.dataset.clientPhone = o.customer_phone || "—";
      row.dataset.payMethod = o.payment_title || "—";
      row.dataset.total = money(o.total_price || 0);
      row.dataset.items = itemsToHtml(o.items || []);

      row.innerHTML = `
        <div class="order-main">
          <div class="order-num">${escapeHtml(o.id)}</div>
          <div class="order-time">${escapeHtml(formatTime(o.created_at))}</div>
        </div>

        <div class="order-mid">
          <div class="order-line"><strong>${escapeHtml(o.customer_name || "—")}</strong></div>
          <div class="order-line muted"><i class="fas fa-phone"></i> ${escapeHtml(o.customer_phone || "—")}</div>
        </div>

        <div class="order-actions">
          <div class="pill pill-strong">${escapeHtml(money(o.total_price || 0))}</div>
        </div>
      `;

      if (state.activeOrderId && Number(state.activeOrderId) === Number(o.id)) {
        row.classList.add("is-active");
      }

      // drag start/end
      row.addEventListener("dragstart", (e) => {
        state.draggingOrderId = Number(o.id) || null;
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(o.id));
        } catch {}
        row.classList.add("is-dragging");
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging");
        state.draggingOrderId = null;
      });

      // drop внутри списка (сортировка внутри статуса)
      row.addEventListener("dragover", (e) => {
        // сортировку разрешаем только когда выбран конкретный статус
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

        // переставим в state.orders
        const idxFrom = state.orders.findIndex(x => Number(x.id) === Number(draggedId));
        const idxTo = state.orders.findIndex(x => Number(x.id) === Number(targetId));
        if (idxFrom < 0 || idxTo < 0) return;

        const moved = state.orders.splice(idxFrom, 1)[0];
        state.orders.splice(idxTo, 0, moved);

        // отправим порядок на сервер
        try {
          await apiJson(`/api/admin/orders/reorder`, {
            method: "PUT",
            body: {
              status_id: Number(state.activeStatusId),
              orderedIds: state.orders.map(x => Number(x.id)),
            },
          });

          // перерендерим список
          renderOrders();

          // бейджи не меняются — но можно оставить как есть
        } catch (err) {
          console.error(err);
        }
      });

      elOrdersList.appendChild(row);
    });

    if (!state.activeOrderId && list.length) {
      state.activeOrderId = list[0].id;
      setInfo(list[0]);
      const firstRow = $(`.order-row[data-order-id="${list[0].id}"]`, elOrdersList);
      if (firstRow) firstRow.classList.add("is-active");
    }
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function loadStatuses() {
    const json = await apiJson("/api/admin/orders/statuses");
    state.statuses = Array.isArray(json.data) ? json.data : [];
  }

  async function loadOrders() {
    const qs = new URLSearchParams();
    if (state.activeStatusId !== "all") qs.set("status_id", String(state.activeStatusId));
    qs.set("limit", "500");
    qs.set("offset", "0");

    const json = await apiJson(`/api/admin/orders?${qs.toString()}`);
    state.orders = Array.isArray(json.data) ? json.data : [];
  }

  async function loadAndRenderOrders(keepSelection = false) {
    const prevActive = keepSelection ? state.activeOrderId : null;

    await loadOrders();
    renderOrders();

    if (keepSelection && prevActive) {
      const found = state.orders.find(o => Number(o.id) === Number(prevActive));
      if (found) {
        state.activeOrderId = found.id;
        setInfo(found);
        $$(".order-row.is-active", document).forEach(el => el.classList.remove("is-active"));
        const row = $(`.order-row[data-order-id="${found.id}"]`, elOrdersList);
        if (row) row.classList.add("is-active");
      } else {
        state.activeOrderId = null;
      }
    }
  }

  // -----------------------------
  // Click orders (delegation)
  // -----------------------------
  document.addEventListener('click', (e) => {
    const row = e.target.closest('.js-order');
    if (!row) return;

    $$('.order-row.is-active').forEach(el => el.classList.remove('is-active'));
    row.classList.add('is-active');

    state.activeOrderId = Number(row.dataset.orderId) || null;
    setInfoFromDataset(row.dataset);

    if (isMobile()) openSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeSheet);
  if (backdrop) backdrop.addEventListener('click', closeSheet);

  window.addEventListener('resize', () => {
    if (!isMobile()) closeSheet();
  });

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    try {
      await loadStatuses();
      renderStages();
      await loadAndRenderOrders(false);
    } catch (e) {
      console.error(e);
    }
  }

  init();
})();
