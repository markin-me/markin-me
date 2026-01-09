(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const TENANT_ID = 1;

  // left
  const categoriesNav = $("#categoriesNav");
  const addCategoryBtn = $("#addCategoryBtn");
  const productsAccordion = $("#productsAccordion");

  // center
  const toolbarText = $("#productsToolbarText");
  const addMainBtn = $("#addMainBtn");
  const productsList = $("#productsList");
  const productsEmptyHint = $("#productsEmptyHint");
  const categoriesMainList = $("#categoriesMainList");
  const categoriesEmptyHint = $("#categoriesEmptyHint");
  const optionGroupsList = $("#optionGroupsList");
  const optionItemsList = $("#optionItemsList");
  const optionAssignmentsList = $("#optionAssignmentsList");
  const optionExclusionsList = $("#optionExclusionsList");
  const optionOverridesList = $("#optionOverridesList");
  const addOptionGroupBtn = $("#addOptionGroupBtn");
  const addOptionItemBtn = $("#addOptionItemBtn");
  const addOptionAssignmentBtn = $("#addOptionAssignmentBtn");
  const addOptionExclusionBtn = $("#addOptionExclusionBtn");
  const addOptionOverrideBtn = $("#addOptionOverrideBtn");
  const optionItemsTitle = $("#optionItemsTitle");

  // right info
  const productEmpty = $("#productEmpty");
  const productInfo = $("#productInfo");
  const closeProductInfoBtn = $("#closeProductInfoBtn");
  const editProductBtn = $("#editProductBtn");
  const productInfoHeader = $("#productInfoHeader");
  const categoryInfoHeader = $("#categoryInfoHeader");
  const categoryTitle = $("#categoryTitle");
  const categoryMeta = $("#categoryMeta");
  const categoryStatus = $("#categoryStatus");
  const categoryVisibility = $("#categoryVisibility");
  const categoryIconPreview = $("#categoryIconPreview");
  const categoryIconPlaceholder = $("#categoryIconPlaceholder");
  const categoryEmpty = $("#categoryEmpty");
  const categoryInfo = $("#categoryInfo");
  const closeCategoryInfoBtn = $("#closeCategoryInfoBtn");
  const editCategoryBtn = $("#editCategoryBtn");

  const productTitle = $("#productTitle");
  const productSku = $("#productSku");
  const productPrice = $("#productPrice");
  const productOldPrice = $("#productOldPrice");
  const productCostPrice = $("#productCostPrice");
  const productStatus = $("#productStatus");
  const productDescShort = $("#productDescShort");
  const productDesc = $("#productDesc");

  const infoCategoryChips = $("#infoCategoryChips");
  const infoMainPhoto = $("#infoMainPhoto");
  const infoPhotoPlaceholder = $("#infoPhotoPlaceholder");
  const infoPhotoThumbs = $("#infoPhotoThumbs");

  // sheet (mobile)
  const sheet = $("#productSheet");
  const sheetBackdrop = $("#productSheetBackdrop");
  const sheetHost = $("#productSheetHost");
  const sheetCloseBtn = $("#productSheetCloseBtn");
  const detailsDesktopHost = $("#productInfoPanel .panel-body");

  const state = {
    mode: "products", // products | categories | ...
    categories: [],
    products: [],
    currentCategoryId: null,
    allCategoryId: null,
    selectedProductId: null,
    selectedProductCategories: [], // full objects
    selectedCategoryId: null,
    optionGroups: [],
    optionItems: [],
    optionAssignments: [],
    optionExclusions: [],
    optionOverrides: [],
    selectedOptionGroupId: null,
    allProducts: [],
  };

  // ---------------- API ----------------

  async function api(url, opts) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", "x-tenant-id": String(TENANT_ID) },
      ...opts,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || `HTTP_${res.status}`);
    }
    return data;
  }

  async function apiUploadImages(files) {
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    const res = await fetch("/api/upload/product-images", {
      method: "POST",
      headers: { "x-tenant-id": String(TENANT_ID) },
      body: fd
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `HTTP_${res.status}`);
    return data.urls || [];
  }

  async function apiUploadCategoryIcon(file) {
    const fd = new FormData();
    fd.append("icon", file);
    const res = await fetch("/api/upload/category-icon", {
      method: "POST",
      headers: { "x-tenant-id": String(TENANT_ID) },
      body: fd,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `HTTP_${res.status}`);
    return data.url;
  }

  // ---------------- Accordion (height fix) ----------------

  function bindAccordions() {
    if (!productsAccordion) return;

    // init open
    $$(".acc-item", productsAccordion).forEach((item) => {
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      if (!trigger || !panel) return;

      const open = panel.classList.contains("is-open") || trigger.classList.contains("is-open");
      trigger.classList.toggle("is-open", open);
      panel.classList.toggle("is-open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });

    productsAccordion.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-acc-trigger]");
      if (!trigger) return;

      const item = trigger.closest(".acc-item");
      const panel = item && item.querySelector("[data-acc-panel]");
      if (!panel) return;

      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      trigger.classList.toggle("is-open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });
  }

  function refreshOpenAccordions() {
    if (!productsAccordion) return;
    $$(".acc-panel.is-open", productsAccordion).forEach((panel) => {
      panel.style.maxHeight = panel.scrollHeight + "px";
    });
  }

  // ---------------- Views ----------------

  function showView(name) {
    $$(".content-view").forEach((v) => v.classList.add("hidden"));
    const target = document.querySelector(`.content-view[data-view-content="${name}"]`);
    if (target) target.classList.remove("hidden");
  }

  function setToolbarTitle(text) {
    if (toolbarText) toolbarText.textContent = text || "";
  }

  function getCurrentCategory() {
    return state.categories.find((c) => c.id === state.currentCategoryId) || null;
  }

  function enterProductsMode(categoryId) {
    state.mode = "products";
    if (categoryId) state.currentCategoryId = categoryId;
    const cat = getCurrentCategory();
    setToolbarTitle(cat ? cat.title : "Товары");
    showView("products");
    clearCategorySelection();
    clearProductSelection();
  }

  function enterCategoriesMode() {
    state.mode = "categories";
    setToolbarTitle("Категории");
    showView("categories");
    clearProductSelection();
    clearCategorySelection();
  }

  // ---------------- Load ----------------

  async function loadCategories() {
    const res = await api(`/api/prod_categories?tenant_id=${TENANT_ID}`);
    state.categories = Array.isArray(res.data) ? res.data : [];
    state.allCategoryId = (state.categories.find((c) => c.code === "all") || {}).id || null;

    if (!state.currentCategoryId) {
      state.currentCategoryId = state.allCategoryId || (state.categories[0] && state.categories[0].id) || null;
    }
  }

  async function loadProducts(categoryId) {
    const cid = categoryId || state.currentCategoryId;
    if (!cid) {
      state.products = [];
      return;
    }
    const res = await api(`/api/prod_products?tenant_id=${TENANT_ID}&category_id=${cid}`);
    state.products = Array.isArray(res.data) ? res.data : [];
  }

  async function loadAllProducts() {
    if (!state.allCategoryId) return;
    const res = await api(`/api/prod_products?tenant_id=${TENANT_ID}&category_id=${state.allCategoryId}`);
    state.allProducts = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionGroups() {
    const res = await api(`/api/prod_option_groups?tenant_id=${TENANT_ID}`);
    state.optionGroups = Array.isArray(res.data) ? res.data : [];
    const hasSelected = state.optionGroups.some((g) => Number(g.id) === Number(state.selectedOptionGroupId));
    if (!hasSelected) {
      state.selectedOptionGroupId = state.optionGroups.length ? Number(state.optionGroups[0].id) : null;
    }
  }

  async function loadOptionItems(groupId) {
    const gid = Number(groupId || state.selectedOptionGroupId);
    if (!Number.isFinite(gid) || gid <= 0) {
      state.optionItems = [];
      return;
    }
    const res = await api(`/api/prod_option_groups/${gid}/items?tenant_id=${TENANT_ID}`);
    state.optionItems = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionAssignments() {
    const res = await api(`/api/prod_option_assignments?tenant_id=${TENANT_ID}`);
    state.optionAssignments = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionExclusions() {
    const res = await api(`/api/prod_option_exclusions?tenant_id=${TENANT_ID}`);
    state.optionExclusions = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionOverrides() {
    const res = await api(`/api/prod_option_overrides?tenant_id=${TENANT_ID}`);
    state.optionOverrides = Array.isArray(res.data) ? res.data : [];
  }

  // ---------------- Render: left nav ----------------

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function looksLikeUrl(v) {
    const s = String(v || "").trim();
    return !!s && (s.startsWith("/") || s.startsWith("http://") || s.startsWith("https://"));
  }

  function renderCategoryIcon(icon) {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      return `<img class="category-icon-img" src="${escapeHtml(v)}" alt="" />`;
    }
    const cls = v || "fas fa-folder";
    return `<i class="${escapeHtml(cls)}"></i>`;
  }

  function renderCategoriesNav() {
    if (!categoriesNav) return;

    const list = state.categories
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    categoriesNav.innerHTML = list.map((c) => {
      const isActive = state.mode === "products" && c.id === state.currentCategoryId;
      return `
        <button class="stage-item ${isActive ? "is-active" : ""}" type="button" data-category-id="${c.id}">
          <span class="stage-icon">${renderCategoryIcon(c.icon)}</span>
          <span class="stage-meta stage-text"><b>${escapeHtml(c.title)}</b></span>
          <span class="acc-spacer"></span>
        </button>
      `;
    }).join("");

    // ✅ после рендера: аккордеон должен раскрыться до конца
    requestAnimationFrame(refreshOpenAccordions);
  }

  // ---------------- Products list ----------------

  function initials(name) {
    const t = String(name || "").trim();
    if (!t) return "PR";
    const parts = t.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase();
  }

  function formatMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(0)} ₽`;
  }

  function renderProductsList() {
    if (!productsList) return;

    productsList.innerHTML = state.products.map((p) => {
      const active = p.id === state.selectedProductId ? "is-active" : "";
      const sku = p.sku ? escapeHtml(p.sku) : "—";

      const hasPhoto = Array.isArray(p.photos) && p.photos.length > 0;
      const avatar = hasPhoto
        ? `<img class="product-thumb" src="${escapeHtml(p.photos[0])}" alt="" />`
        : `<div class="product-avatar">${escapeHtml(initials(p.name))}</div>`;

      return `
        <div class="order-row product-row ${active}" data-id="${p.id}" draggable="true">
          ${avatar}
          <div>
            <div class="product-title">${escapeHtml(p.name)}</div>
            <div class="muted" style="font-size:12px;">Артикул: ${sku}</div>
          </div>
          <div class="product-right">
            <div class="pill pill-strong">${formatMoney(p.price)}</div>
          </div>
        </div>
      `;
    }).join("");

    const empty = state.products.length === 0;
    if (productsEmptyHint) productsEmptyHint.style.display = empty ? "block" : "none";

    // click select
    $$(".order-row[data-id]", productsList).forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.id);
        const p = state.products.find((x) => x.id === id);
        if (!p) return;

        state.selectedProductId = id;
        $$(".order-row", productsList).forEach((x) => x.classList.toggle("is-active", Number(x.dataset.id) === id));

        // категории товара для chips справа
        const catRes = await api(`/api/prod_products/${id}/categories?tenant_id=${TENANT_ID}`);
        state.selectedProductCategories = Array.isArray(catRes.data) ? catRes.data : [];

        showProductDetails(p);
      });
    });

    // sortable persist
    makeSortable(productsList, ".order-row", async () => {
      const ordered = $$(".order-row", productsList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
      await api("/api/sort/prod_products", {
        method: "POST",
        body: JSON.stringify({ category_id: state.currentCategoryId, orderedProductIds: ordered }),
      });
    });
  }

  // ---------------- Categories main list ----------------

  function renderCategoriesMainList() {
    if (!categoriesMainList) return;

    const list = state.categories
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    categoriesMainList.innerHTML = list.map((c) => `
      <div class="order-row category-row" data-id="${c.id}" draggable="true">
        <div>
          <div class="order-num">${renderCategoryIcon(c.icon)}</div>
        </div>
        <div>
          <div class="order-line"><b>${escapeHtml(c.title)}</b></div>
        </div>
        <div class="pill">${c.is_active ? "Активна" : "Выключена"}</div>
      </div>
    `).join("");

    const empty = list.length === 0;
    if (categoriesEmptyHint) categoriesEmptyHint.style.display = empty ? "block" : "none";

    makeSortable(categoriesMainList, ".order-row", async () => {
      const ordered = $$(".order-row", categoriesMainList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
      await api("/api/sort/prod_categories", { method: "POST", body: JSON.stringify({ orderedIds: ordered }) });
      await refreshAll();
      enterCategoriesMode();
      renderCategoriesMainList();
    });

    // dblclick edit
    $$(".category-row", categoriesMainList).forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (!cat) return;
        state.selectedCategoryId = id;
        $$(".category-row", categoriesMainList).forEach((x) => x.classList.toggle("is-active", Number(x.dataset.id) === id));
        showCategoryDetails(cat);
      });
      row.addEventListener("dblclick", () => {
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (cat) openCategoryModal({ mode: "edit", category: cat });
      });
    });
  }

  // ---------------- Options ----------------

  function getGroupTitle(id) {
    return (state.optionGroups.find((g) => Number(g.id) === Number(id)) || {}).title || `#${id}`;
  }

  function getCategoryTitle(id) {
    return (state.categories.find((c) => Number(c.id) === Number(id)) || {}).title || `#${id}`;
  }

  function getProductTitle(id) {
    return (state.allProducts.find((p) => Number(p.id) === Number(id)) || {}).name || `#${id}`;
  }

  function renderOptionGroups() {
    if (!optionGroupsList) return;
    if (!state.optionGroups.length) {
      optionGroupsList.innerHTML = `<div class="muted">Групп пока нет.</div>`;
      return;
    }

    optionGroupsList.innerHTML = state.optionGroups.map((g) => `
      <div class="order-row option-row" data-id="${g.id}">
        <div>
          <div class="order-line"><b>${escapeHtml(g.title || "—")}</b></div>
          <div class="order-time">${escapeHtml(g.selection_type || "multi")} · min ${g.min_select ?? 0} / max ${g.max_select ?? "∞"}</div>
        </div>
        <div class="order-actions">
          <button class="btn btn-icon" type="button" data-edit="${g.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
          <button class="btn btn-icon" type="button" data-del="${g.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    $$(".option-row", optionGroupsList).forEach((row) => {
      const id = Number(row.dataset.id);
      row.classList.toggle("is-active", id === state.selectedOptionGroupId);
      row.addEventListener("click", async () => {
        state.selectedOptionGroupId = id;
        await loadOptionItems(id);
        renderOptionGroups();
        renderOptionItems();
      });
    });

    $$("[data-edit]", optionGroupsList).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.edit);
        const group = state.optionGroups.find((g) => Number(g.id) === id);
        if (group) openOptionGroupModal({ mode: "edit", group });
      });
    });

    $$("[data-del]", optionGroupsList).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.del);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить группу?")) return;
        await api(`/api/prod_option_groups/${id}`, { method: "DELETE" });
        await refreshOptionsView();
      });
    });
  }

  function renderOptionItems() {
    if (!optionItemsList) return;
    const activeGroup = state.optionGroups.find((g) => Number(g.id) === Number(state.selectedOptionGroupId));
    if (optionItemsTitle) optionItemsTitle.textContent = activeGroup ? `Опции: ${activeGroup.title}` : "Опции группы";

    if (!state.selectedOptionGroupId) {
      optionItemsList.innerHTML = `<div class="muted">Выберите группу.</div>`;
      return;
    }

    if (!state.optionItems.length) {
      optionItemsList.innerHTML = `<div class="muted">Опций пока нет.</div>`;
      return;
    }

    optionItemsList.innerHTML = state.optionItems.map((it) => `
      <div class="order-row option-row" data-id="${it.id}">
        <div>
          <div class="order-line"><b>${escapeHtml(it.title || "—")}</b></div>
          <div class="order-time">${escapeHtml(it.target_type || "custom")} · ${escapeHtml(it.price_mode || "fixed")} ${it.unit_price != null ? `· ${formatMoney(it.unit_price)}` : ""}</div>
        </div>
        <div class="order-actions">
          <button class="btn btn-icon" type="button" data-edit-item="${it.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
          <button class="btn btn-icon" type="button" data-del-item="${it.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    $$("[data-edit-item]", optionItemsList).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.editItem);
        const item = state.optionItems.find((x) => Number(x.id) === id);
        if (item) openOptionItemModal({ mode: "edit", item });
      });
    });

    $$("[data-del-item]", optionItemsList).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.delItem);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить опцию?")) return;
        await api(`/api/prod_option_items/${id}`, { method: "DELETE" });
        await refreshOptionsView();
      });
    });
  }

  function renderOptionAssignments() {
    if (!optionAssignmentsList) return;
    if (!state.optionAssignments.length) {
      optionAssignmentsList.innerHTML = `<div class="muted">Назначений пока нет.</div>`;
      return;
    }
    optionAssignmentsList.innerHTML = state.optionAssignments.map((a) => {
      const target = a.assign_type === "category" ? getCategoryTitle(a.assign_id) : getProductTitle(a.assign_id);
      return `
        <div class="order-row option-row" data-id="${a.id}">
          <div>
            <div class="order-line"><b>${escapeHtml(getGroupTitle(a.group_id))}</b></div>
            <div class="order-time">${escapeHtml(a.assign_type)}: ${escapeHtml(target)} · priority ${a.priority ?? 0} / sort ${a.sort_order ?? 0}</div>
          </div>
          <div class="order-actions">
            <button class="btn btn-icon" type="button" data-edit-assign="${a.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon" type="button" data-del-assign="${a.id}" title="Удалить"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$("[data-edit-assign]", optionAssignmentsList).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.editAssign);
        const assignment = state.optionAssignments.find((x) => Number(x.id) === id);
        if (assignment) openOptionAssignmentModal({ mode: "edit", assignment });
      });
    });

    $$("[data-del-assign]", optionAssignmentsList).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.delAssign);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить назначение?")) return;
        await api(`/api/prod_option_assignments/${id}`, { method: "DELETE" });
        await refreshOptionsView();
      });
    });
  }

  function renderOptionExclusions() {
    if (!optionExclusionsList) return;
    if (!state.optionExclusions.length) {
      optionExclusionsList.innerHTML = `<div class="muted">Исключений пока нет.</div>`;
      return;
    }
    optionExclusionsList.innerHTML = state.optionExclusions.map((x) => `
      <div class="order-row option-row">
        <div>
          <div class="order-line"><b>${escapeHtml(getGroupTitle(x.group_id))}</b></div>
          <div class="order-time">product: ${escapeHtml(getProductTitle(x.product_id))}</div>
        </div>
        <div class="order-actions">
          <button class="btn btn-icon" type="button" data-del-excl="${x.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    $$("[data-del-excl]", optionExclusionsList).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.delExcl);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить исключение?")) return;
        await api(`/api/prod_option_exclusions/${id}`, { method: "DELETE" });
        await refreshOptionsView();
      });
    });
  }

  function renderOptionOverrides() {
    if (!optionOverridesList) return;
    if (!state.optionOverrides.length) {
      optionOverridesList.innerHTML = `<div class="muted">Переопределений пока нет.</div>`;
      return;
    }
    optionOverridesList.innerHTML = state.optionOverrides.map((x) => `
      <div class="order-row option-row">
        <div>
          <div class="order-line"><b>${escapeHtml(getGroupTitle(x.group_id))}</b></div>
          <div class="order-time">product: ${escapeHtml(getProductTitle(x.product_id))} · ${escapeHtml(x.selection_type || "—")} · min ${x.min_select ?? "—"} / max ${x.max_select ?? "—"}</div>
        </div>
        <div class="order-actions">
          <button class="btn btn-icon" type="button" data-edit-ovr="${x.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
          <button class="btn btn-icon" type="button" data-del-ovr="${x.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join("");

    $$("[data-edit-ovr]", optionOverridesList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.editOvr);
        const override = state.optionOverrides.find((x) => Number(x.id) === id);
        if (override) openOptionOverrideModal({ mode: "edit", override });
      });
    });

    $$("[data-del-ovr]", optionOverridesList).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.delOvr);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить переопределение?")) return;
        await api(`/api/prod_option_overrides/${id}`, { method: "DELETE" });
        await refreshOptionsView();
      });
    });
  }

  async function refreshOptionsView() {
    await loadCategories();
    await loadAllProducts();
    await loadOptionGroups();
    await loadOptionItems();
    await loadOptionAssignments();
    await loadOptionExclusions();
    await loadOptionOverrides();
    renderOptionGroups();
    renderOptionItems();
    renderOptionAssignments();
    renderOptionExclusions();
    renderOptionOverrides();
  }

  // ---------------- Details (right) ----------------

  function openSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-active");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-active");
    document.body.classList.remove("sheet-open");
  }

  function renderInfoChips() {
    if (!infoCategoryChips) return;

    const cats = state.selectedProductCategories || [];
    const chips = cats
      .filter((c) => c.code !== "all")
      .map((c) => `<span class="chip">${escapeHtml(c.title)}</span>`)
      .join("");

    // "+" chip — просто открываем edit модалку (там можно выбрать категории)
    infoCategoryChips.innerHTML = `
      ${chips}
      <button type="button" class="chip chip-plus" id="infoChipPlus"><i class="fas fa-plus"></i></button>
    `;

    const plus = $("#infoChipPlus");
    if (plus) plus.addEventListener("click", () => {
      const p = state.products.find((x) => x.id === state.selectedProductId);
      if (p) openProductModal({ mode: "edit", product: p });
    });
  }

  function renderInfoPhotos(photos) {
    const arr = Array.isArray(photos) ? photos : [];
    if (!infoMainPhoto || !infoPhotoPlaceholder || !infoPhotoThumbs) return;

    infoPhotoThumbs.innerHTML = "";

    if (!arr.length) {
      infoMainPhoto.src = "";
      infoMainPhoto.classList.add("hidden");
      infoPhotoPlaceholder.classList.remove("hidden");
      return;
    }

    infoPhotoPlaceholder.classList.add("hidden");
    infoMainPhoto.classList.remove("hidden");
    infoMainPhoto.src = arr[0];

    infoPhotoThumbs.innerHTML = arr.map((url, idx) => {
      return `<button type="button" class="img-thumb ${idx === 0 ? "is-active" : ""}" data-idx="${idx}">
        <img src="${escapeHtml(url)}" alt="" />
      </button>`;
    }).join("");

    $$(".img-thumb", infoPhotoThumbs).forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.dataset.idx);
        if (!Number.isFinite(idx)) return;
        infoMainPhoto.src = arr[idx];
        $$(".img-thumb", infoPhotoThumbs).forEach((x) => x.classList.toggle("is-active", x === b));
      });
    });
  }

  function showProductDetails(p) {
    if (!p) return;

    productTitle.textContent = p.name || "—";
    productSku.textContent = `Артикул: ${p.sku || "—"}`;

    productPrice.textContent = formatMoney(p.price);
    productOldPrice.textContent = p.old_price != null ? formatMoney(p.old_price) : "—";
    productCostPrice.textContent = p.cost_price != null ? formatMoney(p.cost_price) : "—";
    productStatus.textContent = `${p.is_active ? "Активен" : "Выключен"} · ${p.site_visibility ? "на сайте" : "скрыт"}`;
    productDescShort.textContent = p.description_short || "—";
    productDesc.textContent = p.description || "—";

    renderInfoChips();
    renderInfoPhotos(p.photos);

    productEmpty && productEmpty.classList.add("hidden");
    productInfo && productInfo.classList.remove("hidden");
    productInfoHeader && productInfoHeader.classList.remove("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfoHeader && categoryInfoHeader.classList.add("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && productInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(productInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && productInfo && productInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(productInfo);
      }
      closeSheet();
    }
  }

  function clearProductSelection() {
    state.selectedProductId = null;
    state.selectedProductCategories = [];
    productInfo && productInfo.classList.add("hidden");
    productEmpty && productEmpty.classList.remove("hidden");
    productInfoHeader && productInfoHeader.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    categoryInfoHeader && categoryInfoHeader.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    closeSheet();
    if (productsList) $$(".order-row", productsList).forEach((x) => x.classList.remove("is-active"));
  }

  function showCategoryDetails(c) {
    if (!c) return;
    categoryTitle.textContent = c.title || "—";
    categoryMeta.textContent = `ID: ${c.id}`;
    categoryStatus.textContent = c.is_active ? "Активна" : "Выключена";
    categoryVisibility.textContent = c.site_visibility ? "Да" : "Нет";

    const icon = String(c.icon || "").trim();
    if (looksLikeUrl(icon)) {
      categoryIconPreview.src = icon;
      categoryIconPreview.classList.remove("hidden");
      categoryIconPlaceholder.classList.add("hidden");
    } else {
      categoryIconPreview.classList.add("hidden");
      categoryIconPlaceholder.classList.remove("hidden");
      categoryIconPlaceholder.innerHTML = icon ? `<i class="${escapeHtml(icon)}"></i>` : "Нет фото";
    }

    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfo && categoryInfo.classList.remove("hidden");
    categoryInfoHeader && categoryInfoHeader.classList.remove("hidden");
    productInfo && productInfo.classList.add("hidden");
    productEmpty && productEmpty.classList.add("hidden");
    productInfoHeader && productInfoHeader.classList.add("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && categoryInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(categoryInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(categoryInfo);
      }
      closeSheet();
    }
  }

  function clearCategorySelection() {
    state.selectedCategoryId = null;
    categoryInfo && categoryInfo.classList.add("hidden");
    categoryInfoHeader && categoryInfoHeader.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.remove("hidden");
    productInfo && productInfo.classList.add("hidden");
    productInfoHeader && productInfoHeader.classList.add("hidden");
    productEmpty && productEmpty.classList.add("hidden");
    if (categoriesMainList) $$(".category-row", categoriesMainList).forEach((x) => x.classList.remove("is-active"));
    closeSheet();
  }

  // ---------------- Modal: product (chips + photos) ----------------

  function openProductModal({ mode, product }) {
    const isEdit = mode === "edit";

    const defaultSelected = new Set();
    if (state.allCategoryId) defaultSelected.add(state.allCategoryId);
    if (!isEdit) {
      if (state.currentCategoryId && state.currentCategoryId !== state.allCategoryId) defaultSelected.add(state.currentCategoryId);
    }

    const initialPhotos = isEdit && product ? (Array.isArray(product.photos) ? product.photos.slice(0, 10) : []) : [];

    const draft = {
      categories: defaultSelected,   // Set<number>
      photos: initialPhotos.map((url) => ({ kind: "url", url })), // {kind:'url'|'file', url|file, preview}
      activePhotoIdx: 0,
    };

    // если edit — подгружаем категории товара
    const loadCatsPromise = (async () => {
      if (!isEdit || !product) return;
      const res = await api(`/api/prod_products/${product.id}/categories?tenant_id=${TENANT_ID}`);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.forEach((c) => draft.categories.add(Number(c.id)));
    })();

    window.AppModal.open({
      title: isEdit ? "Редактировать товар" : "Новый товар",
      content: "#tplProductEditor",
      onSave: async ({ body }) => {
        const form = $("#productEditorForm", body);
        if (!form) return false;

        // сначала грузим новые фото (если есть)
        const newFiles = draft.photos.filter((x) => x.kind === "file").map((x) => x.file);
        let newUrls = [];
        if (newFiles.length) {
          newUrls = await apiUploadImages(newFiles);
        }

        // финальный список URL (сохраняем порядок)
        let urlIdx = 0;
        const finalUrls = draft.photos
          .map((x) => (x.kind === "url" ? x.url : newUrls[urlIdx++]))
          .filter(Boolean)
          .slice(0, 10);

        const payload = {
          tenant_id: TENANT_ID,
          name: String(form.name.value || "").trim(),
          sku: String(form.sku.value || "").trim(),
          description_short: String(form.description_short.value || "").trim(),
          description: String(form.description.value || "").trim(),
          price: form.price.value === "" ? 0 : Number(form.price.value),
          old_price: form.old_price.value === "" ? null : Number(form.old_price.value),
          cost_price: form.cost_price.value === "" ? null : Number(form.cost_price.value),
          is_active: form.is_active.checked ? 1 : 0,
          site_visibility: form.site_visibility.checked ? 1 : 0,

          // ✅ категории из chips
          category_ids: Array.from(draft.categories).filter((id) => Number.isFinite(id)),

          // ✅ фото JSON
          photos_json: finalUrls
        };

        if (!payload.name) {
          form.name.focus();
          return false;
        }

        if (isEdit && product) {
          await api(`/api/prod_products/${product.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api("/api/prod_products", { method: "POST", body: JSON.stringify(payload) });
        }

        await refreshAll();
        return true;
      },
    });

    const body = window.AppModal.body;
    const form = $("#productEditorForm", body);
    if (!form) return;

    // prefill
    if (isEdit && product) {
      form.name.value = product.name || "";
      form.sku.value = product.sku || "";
      form.description_short.value = product.description_short || "";
      form.description.value = product.description || "";
      form.price.value = product.price != null ? String(product.price) : "";
      form.old_price.value = product.old_price != null ? String(product.old_price) : "";
      form.cost_price.value = product.cost_price != null ? String(product.cost_price) : "";
      form.is_active.checked = Boolean(product.is_active);
      form.site_visibility.checked = Boolean(product.site_visibility);
    }

    const ui = {
      chips: $("#peCategoryChips", body),
      catBackdrop: $("#peCatBackdrop", body),
      catModal: $("#peCatModal", body),
      catClose: $("#peCatClose", body),
      catList: $("#peCatList", body),

      photosInput: $("#pePhotosInput", body),
      addPhotosBtn: $("#peAddPhotosBtn", body),
      photoMain: $("#pePhotoMain", body),
      photoPlaceholder: $("#pePhotoPlaceholder", body),
      thumbs: $("#pePhotoThumbs", body),
      counter: $("#pePhotosCounter", body),
    };

    function openCatPicker() {
      ui.catBackdrop.classList.remove("hidden");
      ui.catModal.classList.remove("hidden");
    }

    function closeCatPicker() {
      ui.catBackdrop.classList.add("hidden");
      ui.catModal.classList.add("hidden");
    }

    function renderCatPicker() {
      const list = state.categories
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      ui.catList.innerHTML = list.map((c) => {
        const id = Number(c.id);
        const isAll = c.code === "all";
        const checked = draft.categories.has(id);
        const disabled = isAll ? "disabled" : "";
        const rowCls = checked ? "picker-row is-selected" : "picker-row";
        return `
          <div class="${rowCls}">
            <div class="picker-meta">
              <div class="picker-title">${escapeHtml(c.title)}</div>
            </div>

            <label class="switch">
              <input class="switch-input" type="checkbox" data-cat-id="${id}" ${checked ? "checked" : ""} ${disabled} />
              <span class="switch-ui"></span>
            </label>
          </div>
        `;
      }).join("");

      ui.catList.addEventListener("change", (e) => {
        const input = e.target && e.target.closest("input[data-cat-id]");
        if (!input) return;
        const id = Number(input.dataset.catId);
        if (!Number.isFinite(id)) return;

        if (input.checked) draft.categories.add(id);
        else draft.categories.delete(id);

        renderCategoryChips();
        renderCatPicker();
      }, { once: true });
    }

    function renderCategoryChips() {
      const selected = Array.from(draft.categories)
        .map((id) => state.categories.find((c) => Number(c.id) === Number(id)))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      const chips = selected
        .filter((c) => c.code !== "all")
        .map((c) => `<span class="chip">${escapeHtml(c.title)}</span>`)
        .join("");

      ui.chips.innerHTML = `
        ${chips}
        <button type="button" class="chip chip-plus" id="peChipPlus"><i class="fas fa-plus"></i></button>
      `;

      const plus = $("#peChipPlus", ui.chips);
      if (plus) plus.addEventListener("click", () => {
        renderCatPicker();
        openCatPicker();
      });
    }

    function renderPhotos() {
      const total = draft.photos.length;
      if (ui.counter) ui.counter.textContent = `${total}/10`;

      ui.thumbs.innerHTML = draft.photos.map((ph, idx) => {
        const src = ph.kind === "url" ? ph.url : ph.preview;
        return `
          <button type="button" class="img-thumb ${idx === draft.activePhotoIdx ? "is-active" : ""}" data-idx="${idx}">
            <img src="${escapeHtml(src)}" alt="" />
            <span class="img-del" data-del="${idx}"><i class="fas fa-times"></i></span>
          </button>
        `;
      }).join("");

      if (!total) {
        ui.photoMain.src = "";
        ui.photoMain.classList.add("hidden");
        ui.photoPlaceholder.classList.remove("hidden");
      } else {
        const active = draft.photos[draft.activePhotoIdx] || draft.photos[0];
        const src = active.kind === "url" ? active.url : active.preview;
        ui.photoPlaceholder.classList.add("hidden");
        ui.photoMain.classList.remove("hidden");
        ui.photoMain.src = src;
      }

      ui.thumbs.onclick = (e) => {
        const del = e.target.closest("[data-del]");
        if (del) {
          const idx = Number(del.dataset.del);
          if (!Number.isFinite(idx)) return;
          const removed = draft.photos.splice(idx, 1);
          if (removed[0] && removed[0].kind === "file") {
            try { URL.revokeObjectURL(removed[0].preview); } catch {}
          }
          draft.activePhotoIdx = Math.max(0, Math.min(draft.activePhotoIdx, draft.photos.length - 1));
          renderPhotos();
          return;
        }

        const btn = e.target.closest(".img-thumb[data-idx]");
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        if (!Number.isFinite(idx)) return;
        draft.activePhotoIdx = idx;
        renderPhotos();
      };
    }

    function addFiles(files) {
      const existingCount = draft.photos.length;
      const canAdd = Math.max(0, 10 - existingCount);
      const take = Array.from(files).slice(0, canAdd);

      for (const f of take) {
        const preview = URL.createObjectURL(f);
        draft.photos.push({ kind: "file", file: f, preview });
      }
      if (draft.photos.length && draft.activePhotoIdx === 0) draft.activePhotoIdx = 0;
      renderPhotos();
    }

    ui.addPhotosBtn.addEventListener("click", () => ui.photosInput.click());
    ui.photosInput.addEventListener("change", () => {
      if (ui.photosInput.files && ui.photosInput.files.length) addFiles(ui.photosInput.files);
      ui.photosInput.value = "";
    });

    ui.catClose.addEventListener("click", closeCatPicker);
    ui.catBackdrop.addEventListener("click", closeCatPicker);

    // init UI after categories loaded (for edit)
    (async () => {
      await loadCatsPromise;
      renderCategoryChips();
      renderPhotos();
      requestAnimationFrame(refreshOpenAccordions);
    })();
  }

  // ---------------- Modal: category ----------------

  function openCategoryModal({ mode, category }) {
    const isEdit = mode === "edit";

    window.AppModal.open({
      title: isEdit ? "Редактировать категорию" : "Новая категория",
      content: "#tplCategoryEditor",
      onSave: async ({ body }) => {
        const form = $("#categoryEditorForm", body);
        if (!form) return false;

        const payload = {
          tenant_id: TENANT_ID,
          title: String(form.title.value || "").trim(),
          code: String(form.code.value || "").trim(),
          icon: String(form.icon.value || "").trim(),
          sort_order: form.sort_order.value === "" ? null : Number(form.sort_order.value),
          is_active: form.is_active.checked ? 1 : 0,
          site_visibility: form.site_visibility.checked ? 1 : 0,
        };

        if (!payload.title) {
          form.title.focus();
          return false;
        }

        if (isEdit && category) {
          await api(`/api/prod_categories/${category.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api("/api/prod_categories", { method: "POST", body: JSON.stringify(payload) });
        }

        await refreshAll();
        return true;
      },
    });

    const form = $("#categoryEditorForm", window.AppModal.body);
    if (!form) return;
    const iconPreview = $("#ceIconPreview", form);
    const iconFile = $("#ce_icon_file", form);

    function renderIconPreview(value) {
      if (!iconPreview) return;
      const v = String(value || "").trim();
      if (looksLikeUrl(v)) {
        iconPreview.innerHTML = `<img src="${escapeHtml(v)}" alt="" />`;
        return;
      }
      if (v) {
        iconPreview.innerHTML = `<i class="${escapeHtml(v)}"></i>`;
        return;
      }
      iconPreview.textContent = "Нет иконки";
    }

    if (isEdit && category) {
      form.title.value = category.title || "";
      form.code.value = category.code || "";
      form.icon.value = category.icon || "";
      form.sort_order.value = category.sort_order != null ? String(category.sort_order) : "";
      form.is_active.checked = Boolean(category.is_active);
      form.site_visibility.checked = Boolean(category.site_visibility);
      renderIconPreview(category.icon || "");
    }

    if (!isEdit) {
      renderIconPreview(form.icon.value || "");
    }

    if (iconFile) {
      iconFile.addEventListener("change", async () => {
        const file = iconFile.files && iconFile.files[0];
        if (!file) return;
        iconFile.disabled = true;
        try {
          const url = await apiUploadCategoryIcon(file);
          form.icon.value = url;
          renderIconPreview(url);
        } catch (e) {
          alert("Не удалось загрузить иконку");
        } finally {
          iconFile.value = "";
          iconFile.disabled = false;
        }
      });
    }

    if (form.icon) {
      form.icon.addEventListener("input", () => renderIconPreview(form.icon.value));
    }
  }

  function buildSelectOptions(list, value, { valueKey = "id", labelKey = "title" } = {}) {
    const v = value != null ? String(value) : "";
    return list.map((item) => {
      const id = String(item[valueKey]);
      const label = escapeHtml(item[labelKey] || item.name || item.title || id);
      const selected = v === id ? "selected" : "";
      return `<option value="${escapeHtml(id)}" ${selected}>${label}</option>`;
    }).join("");
  }

  function openOptionGroupModal({ mode, group }) {
    const isEdit = mode === "edit";
    const body = document.createElement("form");
    body.className = "form-grid";
    body.innerHTML = `
      <div>
        <label class="field-label">Название *</label>
        <input class="control" name="title" type="text" required />
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Тип выбора</label>
          <select class="control" name="selection_type">
            <option value="single">single</option>
            <option value="multi">multi</option>
          </select>
        </div>
        <div>
          <label class="field-label">Sort order</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Min select</label>
          <input class="control" name="min_select" type="number" step="1" min="0" />
        </div>
        <div>
          <label class="field-label">Max select</label>
          <input class="control" name="max_select" type="number" step="1" min="0" />
        </div>
      </div>
      <label class="switch">
        <input class="switch-input" type="checkbox" name="is_active" checked />
        <span class="switch-ui" aria-hidden="true"></span>
        <span class="switch-text">Активна</span>
      </label>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать группу" : "Новая группа",
      content: body,
      onSave: async () => {
        const title = String(body.title.value || "").trim();
        if (!title) return false;
        const payload = {
          tenant_id: TENANT_ID,
          title,
          selection_type: body.selection_type.value || "multi",
          min_select: body.min_select.value === "" ? null : Number(body.min_select.value),
          max_select: body.max_select.value === "" ? null : Number(body.max_select.value),
          sort_order: body.sort_order.value === "" ? null : Number(body.sort_order.value),
          is_active: body.is_active.checked ? 1 : 0,
        };
        if (isEdit && group) {
          await api(`/api/prod_option_groups/${group.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api("/api/prod_option_groups", { method: "POST", body: JSON.stringify(payload) });
        }
        await refreshOptionsView();
        return true;
      },
    });

    if (isEdit && group) {
      body.title.value = group.title || "";
      body.selection_type.value = group.selection_type || "multi";
      body.min_select.value = group.min_select != null ? String(group.min_select) : "";
      body.max_select.value = group.max_select != null ? String(group.max_select) : "";
      body.sort_order.value = group.sort_order != null ? String(group.sort_order) : "";
      body.is_active.checked = Boolean(group.is_active);
    }
  }

  function openOptionItemModal({ mode, item }) {
    const isEdit = mode === "edit";
    const body = document.createElement("form");
    body.className = "form-grid";
    body.innerHTML = `
      <div>
        <label class="field-label">Название *</label>
        <input class="control" name="title" type="text" required />
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Тип цели</label>
          <select class="control" name="target_type">
            <option value="custom">custom</option>
            <option value="product">product</option>
            <option value="category_pick">category_pick</option>
          </select>
        </div>
        <div>
          <label class="field-label">Target ID</label>
          <input class="control" name="target_id" type="number" step="1" />
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Price mode</label>
          <select class="control" name="price_mode">
            <option value="fixed">fixed</option>
            <option value="delta">delta</option>
            <option value="from_target">from_target</option>
          </select>
        </div>
        <div>
          <label class="field-label">Цена</label>
          <input class="control" name="unit_price" type="number" step="0.01" />
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Sort order</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
        <label class="switch">
          <input class="switch-input" type="checkbox" name="is_active" checked />
          <span class="switch-ui" aria-hidden="true"></span>
          <span class="switch-text">Активна</span>
        </label>
      </div>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать опцию" : "Новая опция",
      content: body,
      onSave: async () => {
        const title = String(body.title.value || "").trim();
        if (!title) return false;
        const payload = {
          tenant_id: TENANT_ID,
          group_id: isEdit && item ? item.group_id : state.selectedOptionGroupId,
          title,
          target_type: body.target_type.value || "custom",
          target_id: body.target_id.value === "" ? null : Number(body.target_id.value),
          price_mode: body.price_mode.value || "fixed",
          unit_price: body.unit_price.value === "" ? null : Number(body.unit_price.value),
          sort_order: body.sort_order.value === "" ? null : Number(body.sort_order.value),
          is_active: body.is_active.checked ? 1 : 0,
        };
        if (isEdit && item) {
          await api(`/api/prod_option_items/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api(`/api/prod_option_groups/${state.selectedOptionGroupId}/items`, { method: "POST", body: JSON.stringify(payload) });
        }
        await refreshOptionsView();
        return true;
      },
    });

    if (isEdit && item) {
      body.title.value = item.title || "";
      body.target_type.value = item.target_type || "custom";
      body.target_id.value = item.target_id != null ? String(item.target_id) : "";
      body.price_mode.value = item.price_mode || "fixed";
      body.unit_price.value = item.unit_price != null ? String(item.unit_price) : "";
      body.sort_order.value = item.sort_order != null ? String(item.sort_order) : "";
      body.is_active.checked = Boolean(item.is_active);
    }
  }

  function openOptionAssignmentModal({ mode, assignment }) {
    const isEdit = mode === "edit";
    const body = document.createElement("form");
    body.className = "form-grid";
    body.innerHTML = `
      <div>
        <label class="field-label">Группа</label>
        <select class="control" name="group_id"></select>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Тип назначения</label>
          <select class="control" name="assign_type">
            <option value="category">category</option>
            <option value="product">product</option>
          </select>
        </div>
        <div>
          <label class="field-label">Назначение</label>
          <select class="control" name="assign_id"></select>
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Priority</label>
          <input class="control" name="priority" type="number" step="1" />
        </div>
        <div>
          <label class="field-label">Sort order</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
      </div>
      <label class="switch">
        <input class="switch-input" type="checkbox" name="is_active" checked />
        <span class="switch-ui" aria-hidden="true"></span>
        <span class="switch-text">Активно</span>
      </label>
    `;

    const groupSelect = body.querySelector('[name="group_id"]');
    const assignIdSelect = body.querySelector('[name="assign_id"]');

    function fillGroups() {
      if (!groupSelect) return;
      groupSelect.innerHTML = buildSelectOptions(state.optionGroups, assignment?.group_id);
    }

    function fillAssignTargets(type, value) {
      if (!assignIdSelect) return;
      const list = type === "product" ? state.allProducts : state.categories;
      const labelKey = type === "product" ? "name" : "title";
      assignIdSelect.innerHTML = buildSelectOptions(list, value, { labelKey });
    }

    fillGroups();
    fillAssignTargets(assignment?.assign_type || "category", assignment?.assign_id);

    body.assign_type.addEventListener("change", () => {
      fillAssignTargets(body.assign_type.value, null);
    });

    window.AppModal.open({
      title: isEdit ? "Редактировать назначение" : "Новое назначение",
      content: body,
      onSave: async () => {
        const payload = {
          tenant_id: TENANT_ID,
          assign_type: body.assign_type.value,
          assign_id: Number(body.assign_id.value),
          group_id: Number(body.group_id.value),
          priority: body.priority.value === "" ? 0 : Number(body.priority.value),
          sort_order: body.sort_order.value === "" ? 0 : Number(body.sort_order.value),
          is_active: body.is_active.checked ? 1 : 0,
        };
        if (isEdit && assignment) {
          await api(`/api/prod_option_assignments/${assignment.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api(`/api/prod_option_assignments`, { method: "POST", body: JSON.stringify(payload) });
        }
        await refreshOptionsView();
        return true;
      },
    });

    if (isEdit && assignment) {
      body.group_id.value = String(assignment.group_id);
      body.assign_type.value = assignment.assign_type;
      fillAssignTargets(assignment.assign_type, assignment.assign_id);
      body.assign_id.value = String(assignment.assign_id);
      body.priority.value = assignment.priority != null ? String(assignment.priority) : "0";
      body.sort_order.value = assignment.sort_order != null ? String(assignment.sort_order) : "0";
      body.is_active.checked = Boolean(assignment.is_active);
    }
  }

  function openOptionExclusionModal() {
    const body = document.createElement("form");
    body.className = "form-grid";
    body.innerHTML = `
      <div>
        <label class="field-label">Товар</label>
        <select class="control" name="product_id"></select>
      </div>
      <div>
        <label class="field-label">Группа</label>
        <select class="control" name="group_id"></select>
      </div>
    `;
    body.product_id.innerHTML = buildSelectOptions(state.allProducts, null, { labelKey: "name" });
    body.group_id.innerHTML = buildSelectOptions(state.optionGroups, null);

    window.AppModal.open({
      title: "Исключение группы",
      content: body,
      onSave: async () => {
        const payload = {
          tenant_id: TENANT_ID,
          product_id: Number(body.product_id.value),
          group_id: Number(body.group_id.value),
        };
        await api("/api/prod_option_exclusions", { method: "POST", body: JSON.stringify(payload) });
        await refreshOptionsView();
        return true;
      },
    });
  }

  function openOptionOverrideModal({ mode, override } = {}) {
    const isEdit = mode === "edit";
    const body = document.createElement("form");
    body.className = "form-grid";
    body.innerHTML = `
      <div>
        <label class="field-label">Товар</label>
        <select class="control" name="product_id"></select>
      </div>
      <div>
        <label class="field-label">Группа</label>
        <select class="control" name="group_id"></select>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Тип выбора</label>
          <select class="control" name="selection_type">
            <option value="">—</option>
            <option value="single">single</option>
            <option value="multi">multi</option>
          </select>
        </div>
        <div>
          <label class="field-label">Sort order</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <label class="field-label">Min select</label>
          <input class="control" name="min_select" type="number" step="1" min="0" />
        </div>
        <div>
          <label class="field-label">Max select</label>
          <input class="control" name="max_select" type="number" step="1" min="0" />
        </div>
      </div>
    `;
    body.product_id.innerHTML = buildSelectOptions(state.allProducts, override?.product_id, { labelKey: "name" });
    body.group_id.innerHTML = buildSelectOptions(state.optionGroups, override?.group_id);

    window.AppModal.open({
      title: isEdit ? "Редактировать переопределение" : "Новое переопределение",
      content: body,
      onSave: async () => {
        const payload = {
          tenant_id: TENANT_ID,
          product_id: Number(body.product_id.value),
          group_id: Number(body.group_id.value),
          selection_type: body.selection_type.value || null,
          min_select: body.min_select.value === "" ? null : Number(body.min_select.value),
          max_select: body.max_select.value === "" ? null : Number(body.max_select.value),
          sort_order: body.sort_order.value === "" ? null : Number(body.sort_order.value),
        };
        if (isEdit && override) {
          await api(`/api/prod_option_overrides/${override.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api("/api/prod_option_overrides", { method: "POST", body: JSON.stringify(payload) });
        }
        await refreshOptionsView();
        return true;
      },
    });

    if (isEdit && override) {
      body.product_id.value = String(override.product_id);
      body.group_id.value = String(override.group_id);
      body.selection_type.value = override.selection_type || "";
      body.min_select.value = override.min_select != null ? String(override.min_select) : "";
      body.max_select.value = override.max_select != null ? String(override.max_select) : "";
      body.sort_order.value = override.sort_order != null ? String(override.sort_order) : "";
    }
  }

  // ---------------- Sortable (HTML5) ----------------

  function makeSortable(container, itemSelector, onDropPersist) {
    if (!container || container.__sortableBound) return;
    container.__sortableBound = true;

    let draggingEl = null;

    function getAfterElement(y) {
      const elements = $$(itemSelector + ":not(.is-dragging)", container);
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (const el of elements) {
        const box = el.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        if (offset < 0 && offset > closest.offset) closest = { offset, element: el };
      }
      return closest.element;
    }

    container.addEventListener("dragstart", (e) => {
      const target = e.target && e.target.closest(itemSelector);
      if (!target) return;
      draggingEl = target;
      target.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    container.addEventListener("dragend", async () => {
      if (!draggingEl) return;
      draggingEl.classList.remove("is-dragging");
      draggingEl = null;

      if (typeof onDropPersist === "function") {
        try {
          await onDropPersist();
        } catch (e) {
          console.error(e);
          await refreshAll();
        }
      }
    });

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggingEl) return;
      const after = getAfterElement(e.clientY);
      if (after == null) container.appendChild(draggingEl);
      else container.insertBefore(draggingEl, after);
    });
  }

  // ---------------- Refresh ----------------

  async function refreshProductsOnly() {
    await loadProducts(state.currentCategoryId);
    renderProductsList();
    if (state.selectedProductId && !state.products.some((p) => p.id === state.selectedProductId)) {
      clearProductSelection();
    }
  }

  async function refreshAll() {
    await loadCategories();
    renderCategoriesNav();

    if (state.mode === "categories") {
      renderCategoriesMainList();
      return;
    }
    if (state.mode === "options") {
      await refreshOptionsView();
      return;
    }
    if (state.mode === "products") {
      await refreshProductsOnly();
    }
  }

  // ---------------- Events ----------------

  function bindEvents() {
    if (categoriesNav) {
      categoriesNav.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-category-id]");
        if (!btn) return;
        const id = Number(btn.dataset.categoryId);
        if (!Number.isFinite(id)) return;

        enterProductsMode(id);
        renderCategoriesNav();
        await refreshProductsOnly();
      });
    }

    if (addCategoryBtn) {
      addCategoryBtn.addEventListener("click", () => {
        enterCategoriesMode();
        renderCategoriesMainList();
      });
    }

    if (addMainBtn) {
      addMainBtn.addEventListener("click", () => {
        if (state.mode === "categories") return openCategoryModal({ mode: "create" });
        if (state.mode === "products") return openProductModal({ mode: "create" });
      });
    }

    if (addOptionGroupBtn) {
      addOptionGroupBtn.addEventListener("click", () => openOptionGroupModal({ mode: "create" }));
    }

    if (addOptionItemBtn) {
      addOptionItemBtn.addEventListener("click", () => {
        if (!state.selectedOptionGroupId) {
          alert("Сначала выберите группу");
          return;
        }
        openOptionItemModal({ mode: "create" });
      });
    }

    if (addOptionAssignmentBtn) {
      addOptionAssignmentBtn.addEventListener("click", () => openOptionAssignmentModal({ mode: "create" }));
    }

    if (addOptionExclusionBtn) {
      addOptionExclusionBtn.addEventListener("click", () => openOptionExclusionModal());
    }

    if (addOptionOverrideBtn) {
      addOptionOverrideBtn.addEventListener("click", () => openOptionOverrideModal({ mode: "create" }));
    }

    // left other views
    if (productsAccordion) {
      productsAccordion.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        const view = btn.getAttribute("data-view");
        state.mode = view;
        setToolbarTitle(view === "products" ? (getCurrentCategory()?.title || "Товары") : view === "categories" ? "Категории" : "Опции");
        showView(view);
        clearProductSelection();
        clearCategorySelection();
        if (view === "options") refreshOptionsView();
      });
    }

    if (closeProductInfoBtn) closeProductInfoBtn.addEventListener("click", clearProductSelection);
    if (sheetCloseBtn) sheetCloseBtn.addEventListener("click", () => {
      clearProductSelection();
      clearCategorySelection();
    });
    if (sheetBackdrop) sheetBackdrop.addEventListener("click", () => {
      clearProductSelection();
      clearCategorySelection();
    });
    if (closeCategoryInfoBtn) closeCategoryInfoBtn.addEventListener("click", clearCategorySelection);

    if (editProductBtn) {
      editProductBtn.addEventListener("click", () => {
        const p = state.products.find((x) => x.id === state.selectedProductId);
        if (p) openProductModal({ mode: "edit", product: p });
      });
    }

    if (editCategoryBtn) {
      editCategoryBtn.addEventListener("click", () => {
        const c = state.categories.find((x) => x.id === state.selectedCategoryId);
        if (c) openCategoryModal({ mode: "edit", category: c });
      });
    }

    window.addEventListener("resize", () => {
      refreshOpenAccordions();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile && detailsDesktopHost && productInfo && productInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(productInfo);
        closeSheet();
      }
      if (!isMobile && detailsDesktopHost && categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(categoryInfo);
        closeSheet();
      }
    });
  }

  // ---------------- Init ----------------

  document.addEventListener("DOMContentLoaded", async () => {
    bindAccordions();
    bindEvents();

    await refreshAll();
    enterProductsMode(state.currentCategoryId);
    await refreshProductsOnly();

    // ✅ гарантированно “до конца”
    requestAnimationFrame(refreshOpenAccordions);
  });
})();
