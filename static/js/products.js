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
  const optionsGroupsList = $("#optionsGroupsList");
  const optionsGroupsEmpty = $("#optionsGroupsEmpty");

  // right info
  const productEmpty = $("#productEmpty");
  const productInfo = $("#productInfo");
  const categoryEmpty = $("#categoryEmpty");
  const categoryInfo = $("#categoryInfo");
  const optionEmpty = $("#optionEmpty");
  const optionGroupInfo = $("#optionGroupInfo");
  const productInfoHeader = $("#productInfoHeader");
  const productHeaderActions = $("#productHeaderActions");
  const optionHeaderActions = $("#optionHeaderActions");
  const optionHeaderBackBtn = $("#optionHeaderBackBtn");
  const optionHeaderPrimaryBtn = $("#optionHeaderPrimaryBtn");
  const optionHeaderDeleteBtn = $("#optionHeaderDeleteBtn");
  const optionHeaderCloseBtn = $("#optionHeaderCloseBtn");
  const closeProductInfoBtn = $("#closeProductInfoBtn");
  const editProductBtn = $("#editProductBtn");

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

  const categoryIconImg = $("#categoryIconImg");
  const categoryIconPlaceholder = $("#categoryIconPlaceholder");
  const categoryStatus = $("#categoryStatus");
  const categoryVisibility = $("#categoryVisibility");

  const optionLevelGroup = $("#optionLevelGroup");
  const optionLevelPicker = $("#optionLevelPicker");
  const optionGroupForm = $("#optionGroupForm");
  const optionGroupTitleInput = $("#optionGroupTitle");
  const optionGroupSelectionInput = $("#optionGroupSelectionType");
  const optionGroupLimitsRow = $("#optionGroupLimitsRow");
  const optionGroupMinInput = $("#optionGroupMinSelect");
  const optionGroupMaxInput = $("#optionGroupMaxSelect");
  const optionGroupSortInput = $("#optionGroupSortOrder");
  const optionItemsList = $("#optionItemsList");
  const optionItemsCount = $("#optionItemsCount");
  const optionItemsAddBtn = $("#optionItemsAddBtn");
  const optionAssignmentsList = $("#optionAssignmentsList");
  const optionAssignmentsCount = $("#optionAssignmentsCount");
  const optionAssignmentsAddBtn = $("#optionAssignmentsAddBtn");
  const optionPickerTabs = $("#optionPickerTabs");
  const optionPickerSearch = $("#optionPickerSearch");
  const optionPickerSelectAll = $("#optionPickerSelectAll");
  const optionPickerSelectAllLabel = $("#optionPickerSelectAllLabel");
  const optionPickerList = $("#optionPickerList");
  const productOptionsAccordion = $("#productOptionsAccordion");

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
    selectedCategoryId: null,
    selectedProductCategories: [], // full objects
    optionGroups: [],
    selectedOptionGroupId: null,
    optionGroupDetails: null,
    optionGroupCache: new Map(),
    selectedProductOptionAssignments: [],
    catalogCategories: [],
    optionPanel: {
      level: "empty", // empty | group | picker
      mode: "view", // view | edit | create
      pickerMode: "items", // items | assignments
      pickerSelection: new Set(),
      pickerCategoryId: null,
      pickerProducts: [],
      pickerQuery: "",
      pickerTabsScrollLeft: 0,
      pickerInitialSelection: new Set(),
      returnTo: null,
      formSnapshot: null,
      snapshotMode: null,
      snapshotData: null,
      itemsDirty: false,
      activeToggleBusy: false,
    },
    optionDraft: null,
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
    return data.url || "";
  }

  async function apiGetOptionGroups() {
    return api("/api/admin/options/groups");
  }

  async function apiGetOptionGroup(id) {
    return api(`/api/admin/options/groups/${id}`);
  }

  async function apiCreateOptionGroup(payload) {
    return api("/api/admin/options/group-bundle", { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiPatchOptionGroup(id, payload) {
    return api(`/api/admin/options/groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteOptionGroup(id) {
    return api(`/api/admin/options/groups/${id}`, { method: "DELETE" });
  }

  async function apiAddGroupItems(groupId, items) {
    return api(`/api/admin/options/groups/${groupId}/items`, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  async function apiAddGroupAssignments(groupId, assignIds) {
    return api(`/api/admin/options/groups/${groupId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ assign_ids: assignIds }),
    });
  }

  async function apiPatchItem(id, payload) {
    return api(`/api/admin/options/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteItem(id) {
    return api(`/api/admin/options/items/${id}`, { method: "DELETE" });
  }

  async function apiPatchAssignment(id, payload) {
    return api(`/api/admin/options/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteAssignment(id) {
    return api(`/api/admin/options/assignments/${id}`, { method: "DELETE" });
  }

  async function apiGetCatalogCategories() {
    return api("/api/admin/catalog/categories");
  }

  async function apiGetCatalogProducts({ categoryId, query }) {
    const params = new URLSearchParams();
    if (categoryId) params.set("category_id", String(categoryId));
    if (query) params.set("q", query);
    const qs = params.toString();
    return api(`/api/admin/catalog/products${qs ? `?${qs}` : ""}`);
  }

  async function apiGetProductOptionAssignments(productId) {
    return api(`/api/admin/products/${productId}/option-assignments`);
  }

  async function apiAddProductOptionAssignments(productId, groupIds) {
    return api(`/api/admin/products/${productId}/option-assignments`, {
      method: "POST",
      body: JSON.stringify({ group_ids: groupIds }),
    });
  }

  async function apiDisableProductOptionAssignment(productId, groupId) {
    return api(`/api/admin/products/${productId}/option-assignments/${groupId}`, { method: "PATCH" });
  }

  // ---------------- Accordion (height fix) ----------------

  const accordionContainers = new Set();

  function initAccordionItems(container) {
    if (!container) return;
    $$(".acc-item", container).forEach((item) => {
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      if (!trigger || !panel) return;

      const open = panel.classList.contains("is-open") || trigger.classList.contains("is-open");
      trigger.classList.toggle("is-open", open);
      panel.classList.toggle("is-open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });
  }

  function bindAccordionContainer(container) {
    if (!container) return;
    initAccordionItems(container);
    if (container.__accordionBound) return;
    container.__accordionBound = true;
    accordionContainers.add(container);

    container.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-acc-trigger]");
      if (!trigger || !container.contains(trigger)) return;

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
    accordionContainers.forEach((container) => {
      $$(".acc-panel.is-open", container).forEach((panel) => {
        panel.style.maxHeight = panel.scrollHeight + "px";
      });
    });
  }

  // ---------------- Horizontal scroll helpers ----------------

  function bindHorizontalScroll(container) {
    if (!container || container.__horizontalScrollBound) return;
    container.__horizontalScrollBound = true;

    container.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      container.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDown = true;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      container.classList.add("is-dragging");
    });

    container.addEventListener("mouseleave", () => {
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mouseup", () => {
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      container.scrollLeft = scrollLeft - walk;
    });

    container.addEventListener("scroll", () => {
      state.optionPanel.pickerTabsScrollLeft = container.scrollLeft;
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
    showDetailsEmpty();
  }

  function enterCategoriesMode() {
    state.mode = "categories";
    setToolbarTitle("Категории");
    showView("categories");
    clearProductSelection();
    showDetailsEmpty();
  }

  function enterOptionsMode() {
    state.mode = "options";
    state.optionPanel.returnTo = null;
    setToolbarTitle("Опции товара");
    showView("options");
    clearProductSelection();
    showDetailsEmpty();
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

  async function loadOptionGroups() {
    const res = await apiGetOptionGroups();
    state.optionGroups = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionGroupDetails(id) {
    const res = await apiGetOptionGroup(id);
    state.optionGroupDetails = res.data || null;
  }

  async function loadProductOptionAssignments(productId) {
    const res = await apiGetProductOptionAssignments(productId);
    state.selectedProductOptionAssignments = Array.isArray(res.data) ? res.data : [];
  }

  async function ensureOptionGroupDetails(groupId) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return null;
    if (state.optionGroupCache.has(id)) return state.optionGroupCache.get(id);
    const res = await apiGetOptionGroup(id);
    const details = res.data || null;
    if (details) state.optionGroupCache.set(id, details);
    return details;
  }

  async function loadCatalogCategories() {
    const res = await apiGetCatalogCategories();
    state.catalogCategories = Array.isArray(res.data) ? res.data : [];
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
    return (
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("blob:") ||
      s.startsWith("data:") ||
      s.startsWith("/static/") ||
      s.startsWith("/uploads/")
    );
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getSelectionLabel(type) {
    if (type === "multiple_group") return "Несколько (лимит группы)";
    if (type === "multiple_item") return "Несколько (лимит на товар)";
    return type === "multiple" ? "Несколько" : "Один";
  }

  function getSelectionUiTypeFromItems(items = []) {
    const hasItemLimits = items.some((item) => {
      const min = item.qty_min ?? 1;
      const max = item.qty_max ?? 1;
      return min !== 1 || max !== 1;
    });
    return hasItemLimits ? "multiple_item" : "multiple_group";
  }

  function getSelectionUiTypeFromGroup(group, items = []) {
    if (!group || group.selection_type !== "multiple") return "single";
    return getSelectionUiTypeFromItems(items);
  }

  function getSelectionPayloadType(selectionUi) {
    return selectionUi === "single" ? "single" : "multiple";
  }

function getOptionGroupUiValues(group, items = []) {
  if (!group) return null;
  return {
    title: group.title || "",
    selection_type: getSelectionUiTypeFromGroup(group, items),
    min_select: group.min_select ?? 0,
    max_select: group.max_select == null ? null : Number(group.max_select),
    is_active: group.is_active ? 1 : 0,
    is_required: (group.selection_type === "single" ? (group.is_required ? 1 : 0) : 0),
    sort_order: group.sort_order ?? 0,
  };
}

function buildOptionGroupPayload(formValues) {
  const selectionUi = formValues.selection_type;

  const payloadType = getSelectionPayloadType(selectionUi); // single | multiple

  return {
    ...formValues,
    selection_type: payloadType,
    min_select: selectionUi === "multiple_group" ? formValues.min_select : 0,
    max_select: selectionUi === "multiple_group" ? formValues.max_select : null,

    // ✅ только single
    is_required: payloadType === "single" ? (formValues.is_required ? 1 : 0) : 0,
  };
}

  function renderCategoryIcon(icon, className = "stage-icon") {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      return `<span class="${className}"><img src="${escapeHtml(v)}" alt="" /></span>`;
    }
    const cls = v || "fas fa-folder";
    return `<span class="${className}"><i class="${escapeHtml(cls)}"></i></span>`;
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
          ${renderCategoryIcon(c.icon, "stage-icon")}
          <span class="stage-meta stage-text"><b>${escapeHtml(c.title)}</b></span>
          <span class="acc-spacer"></span>
        </button>
      `;
    }).join("");

    // ✅ после рендера: аккордеон должен раскрыться до конца
    requestAnimationFrame(refreshOpenAccordions);
  }

  function renderOptionGroupsList() {
    if (!optionsGroupsList || !optionsGroupsEmpty) return;
    const list = state.optionGroups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    if (!list.length) {
      optionsGroupsList.innerHTML = "";
      optionsGroupsEmpty.classList.remove("hidden");
      return;
    }

    optionsGroupsEmpty.classList.add("hidden");
    optionsGroupsList.innerHTML = list.map((group) => {
      const maxLabel = group.max_select == null ? "∞" : group.max_select;
      const isActive = group.id === state.selectedOptionGroupId;
      const disableSwitch = state.optionPanel.mode !== "view" || state.optionPanel.activeToggleBusy;
      return `
        <div class="options-row ${isActive ? "is-active" : ""}" data-option-group-id="${group.id}">
          <div>
            <div class="options-row-title">${escapeHtml(group.title || "")}</div>
            <div class="options-row-meta">Тип: ${escapeHtml(getSelectionLabel(group.selection_type))}</div>
          </div>
          <div class="options-row-meta">Лимит: ${escapeHtml(maxLabel)}</div>
          <div class="options-row-meta">Пункты: ${group.items_count ?? 0}</div>
          <div class="options-row-meta">Назначения: ${group.assignments_count ?? 0}</div>
          <div class="options-row-meta">
            <label class="switch switch-compact options-row-active">
              <input class="switch-input" type="checkbox" data-option-active-id="${group.id}" ${group.is_active ? "checked" : ""} ${disableSwitch ? "disabled" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span class="switch-text">Активна</span>
            </label>
          </div>
        </div>
      `;
    }).join("");

    optionsGroupsList.querySelectorAll("[data-option-group-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.optionGroupId);
        if (!Number.isFinite(id)) return;
        state.selectedOptionGroupId = id;
        state.optionPanel.returnTo = null;
        await loadOptionGroupDetails(id);
        renderOptionGroupsList();
        showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
      });
    });

    optionsGroupsList.querySelectorAll("[data-option-active-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const id = Number(input.dataset.optionActiveId);
        if (!Number.isFinite(id)) return;
        handleOptionListActiveToggle(id, input.checked);
      });
    });
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

  function formatPriceInteger(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    // format price as integer in UI
    return n.toFixed(0);
  }

  function setHeaderMode(mode) {
    if (productHeaderActions) productHeaderActions.classList.toggle("hidden", mode !== "product");
    if (optionHeaderActions) optionHeaderActions.classList.toggle("hidden", mode !== "option");
  }

  function formatOptionLimits(min, max) {
    const minLabel = min == null ? 0 : min;
    const maxLabel = max == null ? "∞" : max;
    return `Мин: ${minLabel} · Макс: ${maxLabel}`;
  }

  function renderOptionItemsSummary(items) {
    if (!items.length) {
      return `<div class="empty-hint">Пока нет пунктов...</div>`;
    }
    return `
      <div class="option-summary-list">
        ${items.map((item) => {
          const basePrice = item.product_price != null ? formatMoney(item.product_price) : "—";
          const hasOverride = item.price_mode === "fixed" && item.price_value != null;
          const overridePrice = hasOverride ? formatMoney(item.price_value) : "";
          const qtyMin = item.qty_min ?? 1;
          const qtyMax = item.qty_max ?? 1;
          const limitLabel = `Лимиты: ${qtyMin}–${qtyMax}`;
          return `
            <div class="option-summary-row">
              <div>
                <div class="option-summary-title">${escapeHtml(item.product_name || item.name || "")}</div>
                <div class="option-summary-meta">${limitLabel}</div>
              </div>
              <div class="option-summary-price">
                ${hasOverride ? `<s>${basePrice}</s>` : `<span>${basePrice}</span>`}
                ${hasOverride ? `<span>${overridePrice}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
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
        await loadProductOptionAssignments(id);

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

    categoriesMainList.innerHTML = list.map((c) => {
      const active = c.id === state.selectedCategoryId ? "is-active" : "";
      return `
        <div class="order-row category-row ${active}" data-id="${c.id}" draggable="true">
          <div>
            ${renderCategoryIcon(c.icon, "category-icon")}
          </div>
          <div>
            <div class="order-line"><b>${escapeHtml(c.title)}</b></div>
          </div>
          <div class="pill">${c.is_active ? "Активна" : "Выключена"}</div>
        </div>
      `;
    }).join("");

    const empty = list.length === 0;
    if (categoriesEmptyHint) categoriesEmptyHint.style.display = empty ? "block" : "none";

    makeSortable(categoriesMainList, ".order-row", async () => {
      const ordered = $$(".order-row", categoriesMainList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
      await api("/api/sort/prod_categories", { method: "POST", body: JSON.stringify({ orderedIds: ordered }) });
      await refreshAll();
      enterCategoriesMode();
      renderCategoriesMainList();
    });

    // click select
    $$(".category-row", categoriesMainList).forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (!cat) return;
        state.selectedCategoryId = id;
        $$(".category-row", categoriesMainList).forEach((x) => x.classList.toggle("is-active", Number(x.dataset.id) === id));
        showCategoryDetails(cat);
      });

      // dblclick edit
      row.addEventListener("dblclick", () => {
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (cat) openCategoryModal({ mode: "edit", category: cat });
      });
    });
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

  function renderProductOptionsAccordion() {
    if (!productOptionsAccordion) return;
    const assignments = state.selectedProductOptionAssignments.filter((a) => a.is_active);
    if (!assignments.length) {
      productOptionsAccordion.innerHTML = `<div class="empty-hint">Опции не назначены...</div>`;
      return;
    }

    productOptionsAccordion.innerHTML = assignments.map((assignment) => {
      const groupId = Number(assignment.group_id);
      const details = state.optionGroupCache.get(groupId);
      const typeLabel = getSelectionLabel(assignment.selection_type);
      const limitsLabel = formatOptionLimits(assignment.min_select, assignment.max_select);
      const itemsHtml = details ? renderOptionItemsSummary(details.items || []) : `<div class="muted">Раскройте, чтобы загрузить пункты.</div>`;
      return `
        <div class="acc-item" data-option-group="${groupId}">
          <button class="stage-item acc-trigger" type="button" data-acc-trigger>
            <span class="stage-meta stage-text">
              <b>${escapeHtml(assignment.title || "")}</b>
              <small>${escapeHtml(typeLabel)} · ${escapeHtml(limitsLabel)}</small>
            </span>
            <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
          </button>
          <div class="acc-panel" data-acc-panel>
            <div class="acc-panel-inner">
              ${itemsHtml}
              <div class="option-actions" style="margin-top:10px;">
                <button class="btn btn-sm" type="button" data-open-group="${groupId}">Открыть</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    bindAccordionContainer(productOptionsAccordion);
    productOptionsAccordion.querySelectorAll("[data-open-group]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.openGroup);
        if (!Number.isFinite(id)) return;
        await openOptionGroupFromProduct(id);
      });
    });

    productOptionsAccordion.querySelectorAll(".acc-item").forEach((item) => {
      const groupId = Number(item.dataset.optionGroup);
      if (!Number.isFinite(groupId)) return;
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      if (!trigger || !panel) return;
      trigger.addEventListener("click", async () => {
        if (state.optionGroupCache.has(groupId)) return;
        const details = await ensureOptionGroupDetails(groupId);
        if (!details) return;
        const inner = panel.querySelector(".acc-panel-inner");
        if (inner) {
          inner.innerHTML = `
            ${renderOptionItemsSummary(details.items || [])}
            <div class="option-actions" style="margin-top:10px;">
              <button class="btn btn-sm" type="button" data-open-group="${groupId}">Открыть</button>
            </div>
          `;
          inner.querySelectorAll("[data-open-group]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const id = Number(btn.dataset.openGroup);
              if (!Number.isFinite(id)) return;
              await openOptionGroupFromProduct(id);
            });
          });
        }
        refreshOpenAccordions();
      }, { once: true });
    });

    refreshOpenAccordions();
  }

  function showProductDetails(p) {
    if (!p) return;

    state.optionPanel.returnTo = null;
    productTitle.textContent = p.name || "—";
    productSku.textContent = `Артикул: ${p.sku || "—"}`;
    if (editProductBtn) {
      editProductBtn.classList.remove("hidden");
      editProductBtn.title = "Редактировать товар";
      editProductBtn.setAttribute("aria-label", "Редактировать товар");
    }

    productPrice.textContent = formatMoney(p.price);
    productOldPrice.textContent = p.old_price != null ? formatMoney(p.old_price) : "—";
    productCostPrice.textContent = p.cost_price != null ? formatMoney(p.cost_price) : "—";
    productStatus.textContent = `${p.is_active ? "Активен" : "Выключен"} · ${p.site_visibility ? "на сайте" : "скрыт"}`;
    productDescShort.textContent = p.description_short || "—";
    productDesc.textContent = p.description || "—";

    renderInfoChips();
    renderInfoPhotos(p.photos);
    renderProductOptionsAccordion();

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    productInfo && productInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("product");

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

  function renderCategoryPreview(icon) {
    if (!categoryIconImg || !categoryIconPlaceholder) return;
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      categoryIconImg.src = v;
      categoryIconImg.classList.remove("hidden");
      categoryIconPlaceholder.classList.add("hidden");
      categoryIconPlaceholder.textContent = "Нет изображения";
      return;
    }
    categoryIconImg.src = "";
    categoryIconImg.classList.add("hidden");
    categoryIconPlaceholder.classList.remove("hidden");
    categoryIconPlaceholder.innerHTML = v ? `<i class="${escapeHtml(v)}"></i>` : "Нет изображения";
  }

  function showCategoryDetails(cat) {
    if (!cat) return;

    state.optionPanel.returnTo = null;
    productTitle.textContent = cat.title || "—";
    productSku.textContent = "Категория";
    if (editProductBtn) {
      editProductBtn.classList.remove("hidden");
      editProductBtn.title = "Редактировать категорию";
      editProductBtn.setAttribute("aria-label", "Редактировать категорию");
    }

    if (categoryStatus) categoryStatus.textContent = cat.is_active ? "Активна" : "Выключена";
    if (categoryVisibility) categoryVisibility.textContent = cat.site_visibility ? "Показывается" : "Скрыта";
    renderCategoryPreview(cat.icon);

    productEmpty && productEmpty.classList.add("hidden");
    productInfo && productInfo.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfo && categoryInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("product");

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

  function getOptionGroupSelectionType() {
    if (optionGroupSelectionInput?.value) return optionGroupSelectionInput.value;
    if ((state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") && state.optionDraft?.group) {
      return state.optionDraft.group.selection_type || "single";
    }
    if (state.optionGroupDetails?.group) {
      return getSelectionUiTypeFromGroup(state.optionGroupDetails.group, state.optionGroupDetails.items || []);
    }
    return "single";
  }

  function isOptionEditable() {
    return state.optionPanel.mode === "edit" || state.optionPanel.mode === "create";
  }

  function getOptionItemsSource() {
    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") return state.optionDraft?.items || [];
    return state.optionGroupDetails?.items || [];
  }

  function getOptionAssignmentsSource() {
    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") return state.optionDraft?.assignments || [];
    return state.optionGroupDetails?.assignments || [];
  }

function getOptionGroupFormValues() {
  const selectionUi = getOptionGroupSelectionType();

  // берём текущее (на случай если свича нет)
  const fallbackActive = state.optionDraft?.group?.is_active ?? state.optionGroupDetails?.group?.is_active ?? 1;
  const fallbackRequired = state.optionDraft?.group?.is_required ?? state.optionGroupDetails?.group?.is_required ?? 1;

  const activeEl = document.getElementById("optionGroupIsActive");
  const requiredEl = document.getElementById("optionGroupIsRequired");

  const isActive =
    activeEl && activeEl.type === "checkbox"
      ? (activeEl.checked ? 1 : 0)
      : (fallbackActive ? 1 : 0);

  // ✅ required только для single
  const isRequired =
    selectionUi === "single"
      ? (
          requiredEl && requiredEl.type === "checkbox"
            ? (requiredEl.checked ? 1 : 0)
            : (fallbackRequired ? 1 : 0)
        )
      : 0;

  return {
    title: String(optionGroupTitleInput?.value || "").trim(),
    selection_type: selectionUi,
    min_select: optionGroupMinInput?.value === "" ? 0 : Number(optionGroupMinInput?.value),
    max_select: optionGroupMaxInput?.value === "" ? null : Number(optionGroupMaxInput?.value),
    is_active: isActive,
    is_required: isRequired,
    sort_order: optionGroupSortInput?.value === "" ? 0 : Number(optionGroupSortInput?.value),
  };
}

  function isOptionGroupDirty() {
    if (state.optionPanel.mode !== "edit") return true;
    if (!state.optionPanel.snapshotData) return true;
    const snapshot = state.optionPanel.snapshotData;
    const current = {
      group: getOptionGroupFormValues(),
      items: getOptionItemsSource(),
      assignments: getOptionAssignmentsSource(),
    };
    const baseline = {
      group: getOptionGroupUiValues(snapshot.group, snapshot.items || []),
      items: snapshot.items || [],
      assignments: snapshot.assignments || [],
    };
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }

  function syncOptionDraftGroupFromForm() {
    if ((state.optionPanel.mode !== "create" && state.optionPanel.mode !== "edit") || !state.optionDraft) return;
    state.optionDraft.group = getOptionGroupFormValues();
  }

  function setOptionGroupFormDisabled(disabled) {
    if (!optionGroupForm) return;
    $$("input, select, textarea", optionGroupForm).forEach((el) => {
      el.disabled = disabled;
    });
  }

function fillOptionGroupForm(group, items = []) {
  if (!group) return;

  if (optionGroupTitleInput) optionGroupTitleInput.value = group.title || "";

  if (optionGroupSelectionInput) {
    if (group.selection_type === "multiple") {
      optionGroupSelectionInput.value = getSelectionUiTypeFromGroup(group, items);
    } else if (group.selection_type === "multiple_group" || group.selection_type === "multiple_item") {
      optionGroupSelectionInput.value = group.selection_type;
    } else {
      optionGroupSelectionInput.value = "single";
    }
  }

  if (optionGroupMinInput) optionGroupMinInput.value = group.min_select ?? 0;
  if (optionGroupMaxInput) optionGroupMaxInput.value = group.max_select == null ? "" : String(group.max_select);
  if (optionGroupSortInput) optionGroupSortInput.value = group.sort_order ?? 0;

  // ✅ свич "Активна"
  const activeEl = document.getElementById("optionGroupIsActive");
  if (activeEl && activeEl.type === "checkbox") {
    activeEl.checked = Boolean(group.is_active);
  }

  // ✅ свич "Обязательная" (только single)
  const requiredEl = document.getElementById("optionGroupIsRequired");
  if (requiredEl && requiredEl.type === "checkbox") {
    requiredEl.checked = group.selection_type === "single" ? Boolean(group.is_required ?? 1) : false;
  }
}

function updateOptionGroupSelectionUi() {
  const selectionType = getOptionGroupSelectionType();

  if (optionGroupLimitsRow) {
    optionGroupLimitsRow.classList.toggle("hidden", selectionType !== "multiple_group");
  }

  // ✅ "Обязательная" показываем только при single
  const requiredWrap = document.getElementById("optionGroupIsRequiredWrap");
  if (requiredWrap) {
    requiredWrap.classList.toggle("hidden", selectionType !== "single");
  } else {
    // если у тебя нет wrap-обёртки — хотя бы сам чекбокс скрываем
    const requiredEl = document.getElementById("optionGroupIsRequired");
    if (requiredEl) requiredEl.closest("label")?.classList.toggle("hidden", selectionType !== "single");
  }

  // если переключили на multiple — сбрасываем чекбокс required
  if (selectionType !== "single") {
    const requiredEl = document.getElementById("optionGroupIsRequired");
    if (requiredEl && requiredEl.type === "checkbox") requiredEl.checked = false;
  }
}

  function showToast(message, type = "error") {
    const existing = document.querySelector(".app-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = `app-toast ${type === "error" ? "is-error" : ""}`.trim();
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  async function handleOptionListActiveToggle(groupId, nextChecked) {
    if (state.optionPanel.activeToggleBusy) return;
    const group = state.optionGroups.find((g) => Number(g.id) === Number(groupId));
    if (!group) return;
    const prev = Boolean(group.is_active);
    group.is_active = nextChecked ? 1 : 0;
    if (state.optionGroupDetails?.group && Number(state.optionGroupDetails.group.id) === Number(groupId)) {
      state.optionGroupDetails.group.is_active = group.is_active;
      if (state.optionDraft?.group) state.optionDraft.group.is_active = group.is_active;
    }
    renderOptionGroupsList();
    state.optionPanel.activeToggleBusy = true;
    try {
      await apiPatchOptionGroup(groupId, { is_active: nextChecked ? 1 : 0 });
      await loadOptionGroups();
      renderOptionGroupsList();
    } catch (e) {
      group.is_active = prev ? 1 : 0;
      if (state.optionGroupDetails?.group && Number(state.optionGroupDetails.group.id) === Number(groupId)) {
        state.optionGroupDetails.group.is_active = group.is_active;
        if (state.optionDraft?.group) state.optionDraft.group.is_active = group.is_active;
      }
      renderOptionGroupsList();
      showToast("Не удалось обновить статус опции.");
    } finally {
      state.optionPanel.activeToggleBusy = false;
    }
  }

  function renderOptionHeader() {
    if (state.optionPanel.level === "empty") {
      if (productInfoHeader) productInfoHeader.classList.add("hidden");
      return;
    }

    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    const mode = state.optionPanel.mode;
    const level = state.optionPanel.level;
    const isPicker = level === "picker";
    const groupTitle = state.optionGroupDetails?.group?.title || "Новая группа";
    if (productTitle) {
      productTitle.textContent = isPicker
        ? (state.optionPanel.pickerMode === "assignments" ? "Выбор товаров для назначений" : "Выбор товаров для пунктов")
        : groupTitle;
    }
    if (productSku) {
      if (isPicker) {
        productSku.textContent = `Выбрано: ${state.optionPanel.pickerSelection.size}`;
      } else if (mode === "create") {
        productSku.textContent = "Создание группы опций";
      } else {
        const selectionLabel = getSelectionLabel(getOptionGroupSelectionType());
        productSku.textContent = `Тип: ${selectionLabel}`;
      }
    }

    if (optionHeaderBackBtn) {
      optionHeaderBackBtn.classList.toggle("hidden", !isPicker);
    }
    if (optionHeaderDeleteBtn) {
      optionHeaderDeleteBtn.classList.toggle("hidden", mode !== "edit" || isPicker);
    }
    if (optionHeaderPrimaryBtn) {
      const icon = optionHeaderPrimaryBtn.querySelector("i");
      if (isPicker) {
        const count = state.optionPanel.pickerSelection.size;
        const label = count ? `Добавить (${count})` : "Готово";
        optionHeaderPrimaryBtn.title = label;
        optionHeaderPrimaryBtn.setAttribute("aria-label", label);
        if (icon) icon.className = "fas fa-check";
        optionHeaderPrimaryBtn.disabled = false;
      } else if (mode === "view") {
        optionHeaderPrimaryBtn.title = "Редактировать";
        optionHeaderPrimaryBtn.setAttribute("aria-label", "Редактировать");
        if (icon) icon.className = "fas fa-pen";
        optionHeaderPrimaryBtn.disabled = false;
      } else {
        optionHeaderPrimaryBtn.title = "Сохранить";
        optionHeaderPrimaryBtn.setAttribute("aria-label", "Сохранить");
        if (icon) icon.className = "fas fa-check";
        const formValid = optionGroupForm ? optionGroupForm.checkValidity() : true;
        const itemLimitsValid = optionItemsList ? !optionItemsList.querySelector(".is-invalid") : true;
        optionHeaderPrimaryBtn.disabled = !formValid || !itemLimitsValid;
      }
    }

    if (optionHeaderCloseBtn) {
      const label = mode === "view" ? "Закрыть" : "Отмена изменений";
      optionHeaderCloseBtn.title = label;
      optionHeaderCloseBtn.setAttribute("aria-label", label);
    }
  }

  function validateItemQtyBounds(row) {
    const minInput = row.querySelector('input[data-item-field="qty_min"]');
    const maxInput = row.querySelector('input[data-item-field="qty_max"]');
    if (!minInput || !maxInput) return;
    const min = minInput.value === "" ? 0 : Number(minInput.value);
    const max = maxInput.value === "" ? 0 : Number(maxInput.value);
    const invalid = Number.isFinite(min) && Number.isFinite(max) && min > max;
    const message = invalid ? "Минимум не может быть больше максимума." : "";
    [minInput, maxInput].forEach((input) => {
      input.setCustomValidity(message);
      input.classList.toggle("is-invalid", invalid);
    });
  }

  function renderOptionItems(items) {
    if (!optionItemsList) return;
    const editable = isOptionEditable();
    if (optionItemsCount) optionItemsCount.textContent = `(${items.length})`;
    if (!items.length) {
      optionItemsList.innerHTML = `<div class="empty-hint">Пока нет пунктов...</div>`;
      return;
    }

    const selectionType = getOptionGroupSelectionType();
    const showItemLimits = selectionType === "multiple_item";
    const isDraft = state.optionPanel.mode === "create";
    optionItemsList.innerHTML = items.map((item) => {
      const itemKey = item.tempId ?? item.id ?? item.target_product_id;
      const catalogPrice = item.product_price != null ? formatPriceInteger(item.product_price) : "—";
      const overrideValue = isDraft ? item.newPrice : item.price_value;
      const hasOverride = isDraft
        ? overrideValue !== "" && overrideValue != null
        : item.price_mode === "fixed" && item.price_value != null;
      const priceValue = hasOverride ? formatPriceInteger(overrideValue) : "";
      const qtyMin = item.qty_min ?? 1;
      const qtyMax = item.qty_max ?? 1;
      const qtyControls = showItemLimits
        ? `
          <div class="option-item-qty">
            <label class="option-item-qty-field">
              <span class="option-item-qty-label">мин</span>
              <input class="control" type="number" min="1" aria-label="Минимум, шт." data-item-field="qty_min" data-item-id="${itemKey}" value="${qtyMin}" ${editable ? "" : "disabled"} />
            </label>
            <label class="option-item-qty-field">
              <span class="option-item-qty-label">макс</span>
              <input class="control" type="number" min="1" aria-label="Максимум, шт." data-item-field="qty_max" data-item-id="${itemKey}" value="${qtyMax}" ${editable ? "" : "disabled"} />
            </label>
          </div>
        `
        : "";

      return `
        <div class="option-item-row">
          <div class="option-item-title">
            <div class="options-row-title">${escapeHtml(item.product_name || item.name || "")}</div>
          </div>
          ${qtyControls}
          <div class="option-item-price">
            ${!editable
              ? `
                ${hasOverride
                  ? `<span class="option-item-price-value is-muted">${catalogPrice}</span>
                     <span class="option-item-price-value is-accent">${priceValue}</span>`
                  : `<span class="option-item-price-value is-accent">${catalogPrice}</span>`}
              `
              : `
                <span class="option-item-price-value ${hasOverride ? "is-muted" : "is-accent"}">${catalogPrice}</span>
                <input class="control" type="number" step="1" min="0" aria-label="Новая цена" data-item-field="price" data-item-id="${itemKey}" value="${priceValue}" />
              `}
          </div>
          ${editable ? `
            <button class="option-row-remove" type="button" data-item-remove="${itemKey}" title="Удалить" aria-label="Удалить пункт"><i class="fas fa-times"></i></button>
          ` : ""}
        </div>
      `;
    }).join("");

    if (editable && showItemLimits) {
      // ensure min/max are valid on initial render
      optionItemsList.querySelectorAll(".option-item-row").forEach((row) => validateItemQtyBounds(row));
    }

    if (!editable) {
      refreshOpenAccordions();
      return;
    }

    optionItemsList.querySelectorAll("[data-item-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.itemRemove;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          state.optionDraft.items = state.optionDraft.items.filter(
            (x) => String(x.tempId ?? x.id ?? x.target_product_id) !== String(id)
          );
          state.optionPanel.itemsDirty = true;
          renderOptionItems(getOptionItemsSource());
          renderOptionHeader();
        }
      });
    });

    optionItemsList.querySelectorAll("input[data-item-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.itemField;
        const id = input.dataset.itemId;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          const item = state.optionDraft.items.find(
            (x) => String(x.tempId ?? x.id ?? x.target_product_id) === String(id)
          );
          if (!item || !field) return;
          if (field === "price") {
            if (state.optionPanel.mode === "create") {
              item.newPrice = input.value === "" ? "" : Number(input.value);
            } else {
              const hasPrice = input.value !== "";
              item.price_mode = hasPrice ? "fixed" : "from_target";
              item.price_value = hasPrice ? Number(input.value) : null;
            }
          } else if (field === "qty_min") {
            item.qty_min = input.value === "" ? 1 : Number(input.value);
          } else if (field === "qty_max") {
            item.qty_max = input.value === "" ? 1 : Number(input.value);
          }
          state.optionPanel.itemsDirty = true;
          if (field === "qty_min" || field === "qty_max") {
            validateItemQtyBounds(input.closest(".option-item-row"));
            renderOptionHeader();
          }
          return;
        }
      });
    });
    refreshOpenAccordions();
  }

  function renderOptionAssignments(assignments) {
    if (!optionAssignmentsList) return;
    const editable = isOptionEditable();
    if (optionAssignmentsCount) optionAssignmentsCount.textContent = `(${assignments.length})`;
    if (!assignments.length) {
      optionAssignmentsList.innerHTML = `<div class="empty-hint">Пока нет назначений...</div>`;
      return;
    }

    optionAssignmentsList.innerHTML = assignments.map((assignment) => {
      const assignmentKey = assignment.tempId ?? assignment.id;
      return `
        <div class="option-assignment-row">
          <div class="option-assignment-title">
            <div class="options-row-title">${escapeHtml(assignment.product_name || assignment.name || "")}</div>
          </div>
          ${editable ? `<button class="option-row-remove" type="button" data-assignment-remove="${assignmentKey}" title="Удалить" aria-label="Удалить назначение"><i class="fas fa-times"></i></button>` : ""}
        </div>
      `;
    }).join("");

    if (!editable) {
      refreshOpenAccordions();
      return;
    }

    optionAssignmentsList.querySelectorAll("[data-assignment-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.assignmentRemove;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          state.optionDraft.assignments = state.optionDraft.assignments.filter(
            (x) => String(x.tempId ?? x.id ?? x.assign_id) !== String(id)
          );
          state.optionPanel.itemsDirty = true;
          renderOptionAssignments(getOptionAssignmentsSource());
          renderOptionHeader();
        }
      });
    });
    refreshOpenAccordions();
  }

  function renderOptionGroupLevel() {
    if (!optionLevelGroup) return;
    const editable = isOptionEditable();
    optionLevelGroup.classList.remove("hidden");
    if (optionLevelPicker) optionLevelPicker.classList.add("hidden");

    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
      fillOptionGroupForm(state.optionDraft.group, state.optionDraft.items || []);
    } else if (state.optionGroupDetails?.group) {
      fillOptionGroupForm(state.optionGroupDetails.group, state.optionGroupDetails.items || []);
    }

    if (state.optionPanel.mode === "view") {
      state.optionPanel.formSnapshot = null;
      state.optionPanel.snapshotMode = null;
      state.optionPanel.snapshotData = null;
      state.optionPanel.itemsDirty = false;
    } else if (state.optionPanel.snapshotMode !== state.optionPanel.mode) {
      state.optionPanel.formSnapshot = getOptionGroupFormValues();
      state.optionPanel.snapshotMode = state.optionPanel.mode;
    }

    setOptionGroupFormDisabled(!editable);
    if (optionItemsAddBtn) optionItemsAddBtn.classList.toggle("hidden", !editable);
    if (optionAssignmentsAddBtn) optionAssignmentsAddBtn.classList.toggle("hidden", !editable);

    updateOptionGroupSelectionUi();
    // fix: re-render items after picker apply; missing call kept list empty.
    renderOptionItems(getOptionItemsSource());
    renderOptionAssignments(getOptionAssignmentsSource());
    renderOptionHeader();
  }

  async function openOptionGroupFromProduct(groupId, { closeModal } = {}) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return;
    state.selectedOptionGroupId = id;
    state.optionPanel.returnTo = state.selectedProductId ? { type: "product", id: state.selectedProductId } : null;
    await loadOptionGroupDetails(id);
    showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
    if (closeModal && window.AppModal) {
      window.AppModal.close("navigate");
    }
  }

  function renderOptionPickerTabs() {
    if (!optionPickerTabs) return;
    const lastScroll = Number.isFinite(state.optionPanel.pickerTabsScrollLeft)
      ? state.optionPanel.pickerTabsScrollLeft
      : optionPickerTabs.scrollLeft;
    optionPickerTabs.innerHTML = state.catalogCategories.map((cat) => {
      const active = Number(cat.id) === Number(state.optionPanel.pickerCategoryId);
      return `
        <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
          ${escapeHtml(cat.title || "")}
        </button>
      `;
    }).join("");

    bindHorizontalScroll(optionPickerTabs);
    requestAnimationFrame(() => {
      optionPickerTabs.scrollLeft = lastScroll;
    });

    optionPickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.optionPanel.pickerCategoryId = Number(btn.dataset.catId);
        renderOptionPickerTabs();
        await refreshOptionPickerProducts();
      });
    });
  }

  function renderOptionPickerList() {
    if (!optionPickerList) return;
    optionPickerList.innerHTML = state.optionPanel.pickerProducts.map((product) => {
      const checked = state.optionPanel.pickerSelection.has(product.id);
      return `
        <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${product.id}">
          <div class="option-picker-title">${escapeHtml(product.name || "")}</div>
          <div class="option-picker-price">Цена: ${product.price != null ? formatPriceInteger(product.price) : "—"}</div>
          <input class="option-picker-checkbox" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
        </div>
      `;
    }).join("");

    optionPickerList.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.productId);
        if (!Number.isFinite(id)) return;
        if (state.optionPanel.pickerSelection.has(id)) {
          state.optionPanel.pickerSelection.delete(id);
        } else {
          state.optionPanel.pickerSelection.add(id);
        }
        renderOptionPickerList();
        renderOptionHeader();
      });
    });

    updateOptionPickerSelectAllState();
  }

  function updateOptionPickerSelectAllState() {
    if (!optionPickerSelectAll || !optionPickerSelectAllLabel) return;
    const products = state.optionPanel.pickerProducts || [];
    const ids = products.map((product) => product.id);
    const selectedCount = ids.filter((id) => state.optionPanel.pickerSelection.has(id)).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const noneSelected = selectedCount === 0;
    optionPickerSelectAll.checked = allSelected;
    optionPickerSelectAll.indeterminate = !allSelected && !noneSelected;
    optionPickerSelectAll.disabled = ids.length === 0;
    const label = allSelected ? "Сбросить все" : "Выделить все";
    optionPickerSelectAllLabel.textContent = label;
    optionPickerSelectAll.setAttribute("aria-label", label);
  }

  async function refreshOptionPickerProducts() {
    const res = await apiGetCatalogProducts({
      categoryId: state.optionPanel.pickerCategoryId,
      query: state.optionPanel.pickerQuery,
    });
    state.optionPanel.pickerProducts = Array.isArray(res.data) ? res.data : [];
    renderOptionPickerList();
  }

  async function openOptionPicker(mode) {
    syncOptionDraftGroupFromForm();
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }
    state.optionPanel.level = "picker";
    state.optionPanel.pickerMode = mode;
    const existingSelection = new Set();
    if (mode === "items") {
      getOptionItemsSource().forEach((item) => {
        const id = Number(item.target_product_id ?? item.id);
        if (Number.isFinite(id)) existingSelection.add(id);
      });
    } else {
      getOptionAssignmentsSource().forEach((assignment) => {
        const id = Number(assignment.assign_id ?? assignment.id);
        if (Number.isFinite(id)) existingSelection.add(id);
      });
    }
    // keep selection on reopen
    state.optionPanel.pickerSelection = existingSelection;
    state.optionPanel.pickerInitialSelection = new Set(existingSelection);
    state.optionPanel.pickerCategoryId = state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null;
    state.optionPanel.pickerQuery = "";
    if (optionPickerSearch) optionPickerSearch.value = "";
    await refreshOptionPickerProducts();
    renderOptionPickerLevel();
  }

  function isSameSelection(a, b) {
    if (a.size !== b.size) return false;
    for (const id of a) {
      if (!b.has(id)) return false;
    }
    return true;
  }

  async function applyOptionPickerSelection() {
    if (isSameSelection(state.optionPanel.pickerSelection, state.optionPanel.pickerInitialSelection)) {
      // close picker silently if nothing changed
      state.optionPanel.level = "group";
      renderOptionGroupLevel();
      return;
    }
    const selectedIds = Array.from(state.optionPanel.pickerSelection);
    if (!selectedIds.length) {
      state.optionPanel.level = "group";
      renderOptionGroupLevel();
      return;
    }

    if (state.optionPanel.pickerMode === "items") {
      if (state.optionPanel.mode === "create") {
        const existing = new Set(state.optionDraft.items.map((x) => x.id));
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.items.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            id: product.id,
            name: product.name,
            product_name: product.name,
            product_price: product.price,
            newPrice: "",
            qty_min: 1,
            qty_max: 1,
          });
        });
        state.optionPanel.itemsDirty = true;
      } else if (state.optionPanel.mode === "edit") {
        const existing = new Set(
          state.optionDraft.items.map((x) => Number(x.target_product_id ?? x.id)).filter(Number.isFinite)
        );
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.items.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            target_product_id: product.id,
            name: product.name,
            product_name: product.name,
            product_price: product.price,
            price_mode: "from_target",
            price_value: null,
            qty_min: 1,
            qty_max: 1,
            isNew: true,
          });
        });
        state.optionPanel.itemsDirty = true;
      }
    } else {
      if (state.optionPanel.mode === "create") {
        const existing = new Set(state.optionDraft.assignments.map((x) => x.id));
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.assignments.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            id: product.id,
            name: product.name,
            product_name: product.name,
            priority: 0,
            sort_order: 0,
          });
        });
        state.optionPanel.itemsDirty = true;
      } else if (state.optionPanel.mode === "edit") {
        const existing = new Set(
          state.optionDraft.assignments.map((x) => Number(x.assign_id ?? x.id)).filter(Number.isFinite)
        );
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.assignments.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            assign_id: product.id,
            name: product.name,
            product_name: product.name,
            priority: 0,
            sort_order: 0,
            isNew: true,
          });
        });
        state.optionPanel.itemsDirty = true;
      }
    }

    state.optionPanel.level = "group";
    renderOptionGroupLevel();
  }

  function renderOptionPickerLevel() {
    if (!optionLevelPicker) return;
    if (optionLevelGroup) optionLevelGroup.classList.add("hidden");
    optionLevelPicker.classList.remove("hidden");
    renderOptionPickerTabs();
    renderOptionPickerList();
    renderOptionHeader();
  }

  function showOptionGroupDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.optionPanel.level = "group";
    state.optionPanel.mode = mode || "view";
    state.optionPanel.itemsDirty = false;
    state.optionPanel.pickerSelection = new Set();
    if (state.optionPanel.mode === "view") {
      state.optionDraft = null;
      state.optionPanel.snapshotData = null;
    }
    if (productTitle) productTitle.textContent = details?.group?.title || "—";
    if (productSku) productSku.textContent = "Опции товара";
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    if (editProductBtn) editProductBtn.classList.add("hidden");

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && optionGroupInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(optionGroupInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && optionGroupInfo && optionGroupInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(optionGroupInfo);
      }
      closeSheet();
    }

    renderOptionGroupLevel();
  }

  function startOptionCreate() {
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.optionDraft = {
      group: {
        title: "",
        selection_type: "single",
        min_select: 0,
        max_select: null,
        sort_order: 0,
        is_active: 1,
      },
      items: [],
      assignments: [],
    };
    state.optionPanel.itemsDirty = false;
    renderOptionGroupsList();
    showOptionGroupDetails({ group: state.optionDraft.group }, { mode: "create" });
  }

  function startOptionEdit() {
    if (!state.optionGroupDetails?.group) return;
    state.optionPanel.snapshotData = deepClone({
      group: state.optionGroupDetails.group,
      items: state.optionGroupDetails.items || [],
      assignments: state.optionGroupDetails.assignments || [],
    });
    state.optionDraft = deepClone({
      group: state.optionGroupDetails.group,
      items: state.optionGroupDetails.items || [],
      assignments: state.optionGroupDetails.assignments || [],
    });
    state.optionPanel.mode = "edit";
    renderOptionGroupLevel();
  }

  function cancelOptionEdit() {
    if (state.optionPanel.mode === "edit") {
      // return to view without closing the panel
      state.optionPanel.mode = "view";
      state.optionPanel.itemsDirty = false;
      state.optionDraft = null;
      state.optionPanel.snapshotData = null;
      renderOptionGroupLevel();
      return;
    }
    if (state.optionPanel.mode === "create") {
      closeOptionDetails();
    }
  }

  async function saveOptionGroup() {
    if (!optionGroupForm) return;
    const formValues = getOptionGroupFormValues();
    const selectionUi = formValues.selection_type;
    const payload = buildOptionGroupPayload(formValues);

    if (!payload.title) {
      optionGroupTitleInput?.focus();
      return;
    }

    if (state.optionPanel.mode === "create") {
      const itemsPayload = state.optionDraft.items.map((item, idx) => {
        const isFixed = item.newPrice !== "" && item.newPrice != null;
        return {
          target_product_id: item.id,
          price_mode: isFixed ? "fixed" : "from_target",
          price_value: isFixed ? Number(item.newPrice) : null,
          qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
          qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
          sort_order: idx * 10,
        };
      });

      const assignmentsPayload = state.optionDraft.assignments.map((item, idx) => ({
        assign_id: item.id,
        priority: item.priority ?? 0,
        sort_order: item.sort_order ?? idx * 10,
      }));

      const res = await apiCreateOptionGroup({
        group: payload,
        items: itemsPayload,
        assignments: assignmentsPayload,
      });
      state.selectedOptionGroupId = res.id;
      await loadOptionGroups();
      await loadOptionGroupDetails(res.id);
      renderOptionGroupsList();
      state.optionDraft = null;
      state.optionPanel.itemsDirty = false;
      showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
      return;
    }

    if (state.selectedOptionGroupId) {
      if (!isOptionGroupDirty()) {
        state.optionPanel.mode = "view";
        state.optionPanel.itemsDirty = false;
        state.optionDraft = null;
        state.optionPanel.snapshotData = null;
        renderOptionGroupLevel();
        return;
      }

      const snapshot = state.optionPanel.snapshotData;
      const snapshotGroup = getOptionGroupUiValues(snapshot?.group, snapshot?.items || []);
      const groupChanged = JSON.stringify(formValues) !== JSON.stringify(snapshotGroup);

      const draftItems = state.optionDraft?.items || [];
      const draftAssignments = state.optionDraft?.assignments || [];
      const snapshotItems = snapshot?.items || [];
      const snapshotAssignments = snapshot?.assignments || [];

      const normalizeItem = (item) => ({
        price_mode: item.price_mode ?? "from_target",
        price_value: item.price_value ?? null,
        qty_min: item.qty_min ?? 1,
        qty_max: item.qty_max ?? 1,
      });

      const snapshotItemMap = new Map(snapshotItems.filter((item) => item.id).map((item) => [String(item.id), item]));
      const draftItemMap = new Map(draftItems.filter((item) => item.id && !item.isNew).map((item) => [String(item.id), item]));

      const removedItems = snapshotItems.filter((item) => item.id && !draftItemMap.has(String(item.id)));
      const addedItems = draftItems.filter((item) => item.isNew || !item.id);
      const updatedItems = [];
      draftItemMap.forEach((item, key) => {
        const prev = snapshotItemMap.get(key);
        if (!prev) return;
        if (JSON.stringify(normalizeItem(item)) !== JSON.stringify(normalizeItem(prev))) {
          updatedItems.push(item);
        }
      });

      const snapshotAssignmentMap = new Map(
        snapshotAssignments.filter((assignment) => assignment.id).map((assignment) => [String(assignment.id), assignment])
      );
      const draftAssignmentMap = new Map(
        draftAssignments.filter((assignment) => assignment.id && !assignment.isNew).map((assignment) => [String(assignment.id), assignment])
      );

      const removedAssignments = snapshotAssignments.filter(
        (assignment) => assignment.id && !draftAssignmentMap.has(String(assignment.id))
      );
      const addedAssignments = draftAssignments.filter((assignment) => assignment.isNew || !assignment.id);

      try {
        if (groupChanged) {
          await apiPatchOptionGroup(state.selectedOptionGroupId, payload);
        }

        if (addedItems.length) {
          const itemsPayload = addedItems.map((item, idx) => ({
            target_product_id: item.target_product_id ?? item.id,
            price_mode: item.price_mode ?? "from_target",
            price_value: item.price_value ?? null,
            qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
            qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
            sort_order: idx * 10,
          }));
          await apiAddGroupItems(state.selectedOptionGroupId, itemsPayload);
        }

        for (const item of updatedItems) {
          await apiPatchItem(item.id, {
            price_mode: item.price_mode ?? "from_target",
            price_value: item.price_value ?? null,
            qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
            qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
          });
        }

        for (const item of removedItems) {
          await apiDeleteItem(item.id);
        }

        if (addedAssignments.length) {
          const assignIds = addedAssignments
            .map((assignment) => Number(assignment.assign_id ?? assignment.id))
            .filter(Number.isFinite);
          if (assignIds.length) {
            await apiAddGroupAssignments(state.selectedOptionGroupId, assignIds);
          }
        }

        for (const assignment of removedAssignments) {
          await apiDeleteAssignment(assignment.id);
        }

        await loadOptionGroups();
        await loadOptionGroupDetails(state.selectedOptionGroupId);
        renderOptionGroupsList();
        state.optionPanel.mode = "view";
        state.optionPanel.itemsDirty = false;
        state.optionDraft = null;
        state.optionPanel.snapshotData = null;
        renderOptionGroupLevel();
      } catch (e) {
        const message = e && e.message ? e.message : "Не удалось сохранить изменения.";
        showToast(message);
      }
    }
  }

  function confirmOptionGroupDelete() {
    if (!state.selectedOptionGroupId || !window.AppModal) return;
    const groupId = state.selectedOptionGroupId;
    window.AppModal.open({
      title: "Удалить опцию?",
      content: `<div class="modal-text">Опция будет удалена без возможности восстановления.</div>`,
      saveText: "Удалить",
      cancelText: "Отмена",
      onSave: async () => {
        try {
          await apiDeleteOptionGroup(groupId);
          state.optionGroupCache.delete(groupId);
          await loadOptionGroups();
          closeOptionDetails();
          return true;
        } catch (e) {
          const message = e && e.message ? e.message : "Не удалось удалить опцию.";
          alert(message);
          return false;
        }
      },
    });
  }

  function closeOptionPicker() {
    state.optionPanel.level = "group";
    state.optionPanel.pickerSelection = new Set();
    renderOptionGroupLevel();
  }

  function closeOptionDetails() {
    const returnTo = state.optionPanel.returnTo;
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.optionDraft = null;
    state.optionPanel.level = "empty";
    state.optionPanel.mode = "view";
    state.optionPanel.returnTo = null;
    state.optionPanel.formSnapshot = null;
    state.optionPanel.snapshotMode = null;
    state.optionPanel.snapshotData = null;
    state.optionPanel.itemsDirty = false;
    renderOptionGroupsList();
    if (returnTo && returnTo.type === "product") {
      const p = state.products.find((x) => x.id === returnTo.id);
      if (p) {
        showProductDetails(p);
        return;
      }
    }
    showDetailsEmpty();
  }

  function showDetailsEmpty() {
    const showCategory = state.mode === "categories";
    const showOption = state.mode === "options";
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.add("hidden");
    if (productInfoHeader) productInfoHeader.classList.add("hidden");
    setHeaderMode("product");
    if (productEmpty) productEmpty.classList.toggle("hidden", showCategory || showOption);
    if (categoryEmpty) categoryEmpty.classList.toggle("hidden", !showCategory);
    if (optionEmpty) optionEmpty.classList.toggle("hidden", !showOption);
    if (editProductBtn && showOption) editProductBtn.classList.add("hidden");
    closeSheet();
  }

  function clearProductSelection() {
    state.selectedProductId = null;
    state.selectedCategoryId = null;
    state.selectedProductCategories = [];
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.selectedProductOptionAssignments = [];
    state.optionPanel.level = "empty";
    state.optionPanel.mode = "view";
    state.optionPanel.pickerSelection = new Set();
    state.optionPanel.returnTo = null;
    state.optionPanel.snapshotData = null;
    state.optionDraft = null;
    showDetailsEmpty();
    if (productsList) $$(".order-row", productsList).forEach((x) => x.classList.remove("is-active"));
    if (categoriesMainList) $$(".order-row", categoriesMainList).forEach((x) => x.classList.remove("is-active"));
    if (optionsGroupsList) $$(".options-row", optionsGroupsList).forEach((x) => x.classList.remove("is-active"));
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
      optionGroups: new Set(),
      initialOptionGroups: new Set(),
    };

    // если edit — подгружаем категории товара
    const loadCatsPromise = (async () => {
      if (!isEdit || !product) return;
      const res = await api(`/api/prod_products/${product.id}/categories?tenant_id=${TENANT_ID}`);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.forEach((c) => draft.categories.add(Number(c.id)));
    })();

    const loadOptionsPromise = (async () => {
      await loadOptionGroups();
      if (!isEdit || !product) return;
      const res = await apiGetProductOptionAssignments(product.id);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.filter((a) => a.is_active).forEach((a) => {
        draft.optionGroups.add(Number(a.group_id));
        draft.initialOptionGroups.add(Number(a.group_id));
      });
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

        let productId = product && product.id;
        if (isEdit && product) {
          await api(`/api/prod_products/${product.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          const created = await api("/api/prod_products", { method: "POST", body: JSON.stringify(payload) });
          productId = created && created.id;
        }

        if (productId) {
          const selected = new Set(Array.from(draft.optionGroups).filter((x) => Number.isFinite(x)));
          if (isEdit) {
            const toAdd = Array.from(selected).filter((id) => !draft.initialOptionGroups.has(id));
            const toRemove = Array.from(draft.initialOptionGroups).filter((id) => !selected.has(id));
            if (toAdd.length) {
              await apiAddProductOptionAssignments(productId, toAdd);
            }
            for (const gid of toRemove) {
              await apiDisableProductOptionAssignment(productId, gid);
            }
          } else if (selected.size) {
            await apiAddProductOptionAssignments(productId, Array.from(selected));
          }
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
      optionAccordion: $("#peOptionAccordion", body),
      optionManageBtn: $("#peOptionManageBtn", body),
      optionBackdrop: $("#peOptionBackdrop", body),
      optionModal: $("#peOptionModal", body),
      optionClose: $("#peOptionClose", body),
      optionList: $("#peOptionList", body),
      optionSearch: $("#peOptionSearch", body),
      optionCancel: $("#peOptionCancel", body),
      optionApply: $("#peOptionApply", body),

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
              <div class="muted" style="font-size:12px;">${escapeHtml(c.code || "")}</div>
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
        .map((c) => `
          <span class="chip">
            ${escapeHtml(c.title)}
            <button class="chip-remove" type="button" data-cat-remove="${c.id}">
              <i class="fas fa-times"></i>
            </button>
          </span>
        `)
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

      ui.chips.querySelectorAll("[data-cat-remove]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.catRemove);
          if (!Number.isFinite(id)) return;
          draft.categories.delete(id);
          renderCategoryChips();
          renderCatPicker();
        });
      });
    }

    function openOptionPicker() {
      if (!ui.optionBackdrop || !ui.optionModal) return;
      ui.optionBackdrop.classList.remove("hidden");
      ui.optionModal.classList.remove("hidden");
    }

    function closeOptionPicker() {
      if (!ui.optionBackdrop || !ui.optionModal) return;
      ui.optionBackdrop.classList.add("hidden");
      ui.optionModal.classList.add("hidden");
      if (ui.optionSearch) ui.optionSearch.value = "";
      optionPickerSelection = null;
    }

    let optionPickerSelection = null;
    const optionDetailsCache = new Map();

    if (ui.optionManageBtn) {
      ui.optionManageBtn.addEventListener("click", () => {
        optionPickerSelection = new Set(draft.optionGroups);
        renderOptionPickerList(optionPickerSelection);
        if (ui.optionApply) ui.optionApply.textContent = `Добавить (${optionPickerSelection.size})`;
        openOptionPicker();

        if (ui.optionApply) {
          ui.optionApply.onclick = () => {
            draft.optionGroups = new Set(optionPickerSelection || []);
            renderOptionAccordion();
            closeOptionPicker();
          };
        }
      });
    }

    function renderOptionPickerList(pickerSelection) {
      if (!ui.optionList) return;
      const query = String(ui.optionSearch.value || "").trim().toLowerCase();
      const groups = state.optionGroups
        .filter((g) => g.is_active)
        .filter((g) => !query || String(g.title || "").toLowerCase().includes(query))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      ui.optionList.innerHTML = groups.map((g) => {
        const checked = pickerSelection.has(g.id);
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}" data-option-id="${g.id}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(g.title || "")}</div>
              <div class="options-row-meta">${escapeHtml(getSelectionLabel(g.selection_type))}</div>
            </div>
            <input class="option-picker-checkbox" type="checkbox" data-option-id="${g.id}" ${checked ? "checked" : ""} />
          </div>
        `;
      }).join("");

      ui.optionList.querySelectorAll(".option-picker-row[data-option-id]").forEach((row) => {
        row.addEventListener("click", () => {
          const id = Number(row.dataset.optionId);
          if (!Number.isFinite(id)) return;
          if (pickerSelection.has(id)) pickerSelection.delete(id);
          else pickerSelection.add(id);
          renderOptionPickerList(pickerSelection);
          if (ui.optionApply) ui.optionApply.textContent = `Добавить (${pickerSelection.size})`;
        });
      });
    }

    async function renderOptionAccordion() {
      if (!ui.optionAccordion) return;
      const selected = Array.from(draft.optionGroups)
        .map((id) => state.optionGroups.find((g) => Number(g.id) === Number(id)))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      if (!selected.length) {
        ui.optionAccordion.innerHTML = `<div class="empty-hint">Опции не выбраны...</div>`;
        return;
      }

      ui.optionAccordion.innerHTML = selected.map((g) => {
        const details = optionDetailsCache.get(g.id);
        const limitsLabel = formatOptionLimits(g.min_select, g.max_select);
        const itemsHtml = details ? renderOptionItemsSummary(details.items || []) : `<div class="muted">Раскройте, чтобы загрузить пункты.</div>`;
        return `
          <div class="acc-item" data-option-group="${g.id}">
            <button class="stage-item acc-trigger" type="button" data-acc-trigger>
              <span class="stage-meta stage-text">
                <b>${escapeHtml(g.title || "")}</b>
                <small>${escapeHtml(getSelectionLabel(g.selection_type))} · ${escapeHtml(limitsLabel)}</small>
              </span>
              <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
            </button>
            <div class="acc-panel" data-acc-panel>
              <div class="acc-panel-inner">
                ${itemsHtml}
                <div class="option-actions" style="margin-top:10px;">
                  <button class="btn btn-sm" type="button" data-open-group="${g.id}">Открыть</button>
                  <button class="btn btn-sm" type="button" data-option-remove="${g.id}">Убрать</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      bindAccordionContainer(ui.optionAccordion);

      ui.optionAccordion.querySelectorAll("[data-option-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.optionRemove);
          if (!Number.isFinite(id)) return;
          draft.optionGroups.delete(id);
          optionDetailsCache.delete(id);
          renderOptionAccordion();
        });
      });

      ui.optionAccordion.querySelectorAll("[data-open-group]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.openGroup);
          if (!Number.isFinite(id)) return;
          await openOptionGroupFromProduct(id, { closeModal: true });
        });
      });

      ui.optionAccordion.querySelectorAll(".acc-item").forEach((item) => {
        const groupId = Number(item.dataset.optionGroup);
        if (!Number.isFinite(groupId)) return;
        const trigger = item.querySelector("[data-acc-trigger]");
        const panel = item.querySelector("[data-acc-panel]");
        if (!trigger || !panel) return;
        trigger.addEventListener("click", async () => {
          if (optionDetailsCache.has(groupId)) return;
          const details = await ensureOptionGroupDetails(groupId);
          if (details) optionDetailsCache.set(groupId, details);
          const inner = panel.querySelector(".acc-panel-inner");
          if (inner) {
            inner.innerHTML = `
              ${renderOptionItemsSummary(details?.items || [])}
              <div class="option-actions" style="margin-top:10px;">
                <button class="btn btn-sm" type="button" data-open-group="${groupId}">Открыть</button>
                <button class="btn btn-sm" type="button" data-option-remove="${groupId}">Убрать</button>
              </div>
            `;
            inner.querySelectorAll("[data-open-group]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const id = Number(btn.dataset.openGroup);
                if (!Number.isFinite(id)) return;
                await openOptionGroupFromProduct(id, { closeModal: true });
              });
            });
            inner.querySelectorAll("[data-option-remove]").forEach((btn) => {
              btn.addEventListener("click", () => {
                const id = Number(btn.dataset.optionRemove);
                if (!Number.isFinite(id)) return;
                draft.optionGroups.delete(id);
                optionDetailsCache.delete(id);
                renderOptionAccordion();
              });
            });
          }
          refreshOpenAccordions();
        }, { once: true });
      });

      refreshOpenAccordions();
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
    if (ui.optionClose) ui.optionClose.addEventListener("click", closeOptionPicker);
    if (ui.optionCancel) ui.optionCancel.addEventListener("click", closeOptionPicker);
    if (ui.optionBackdrop) ui.optionBackdrop.addEventListener("click", closeOptionPicker);
    if (ui.optionSearch) {
      ui.optionSearch.addEventListener("input", () => {
        renderOptionPickerList(optionPickerSelection || new Set(draft.optionGroups));
      });
    }

    // init UI after categories loaded (for edit)
    (async () => {
      await loadCatsPromise;
      await loadOptionsPromise;
      renderCategoryChips();
      renderOptionAccordion();
      renderPhotos();
      requestAnimationFrame(refreshOpenAccordions);
    })();
  }

  // ---------------- Modal: category ----------------

  function openCategoryModal({ mode, category }) {
    const isEdit = mode === "edit";
    const draft = {
      iconFile: null,
      iconPreview: "",
    };

    window.AppModal.open({
      title: isEdit ? "Редактировать категорию" : "Новая категория",
      content: "#tplCategoryEditor",
      onSave: async ({ body }) => {
        const form = $("#categoryEditorForm", body);
        if (!form) return false;

        let iconValue = String(form.icon.value || "").trim();
        if (draft.iconFile) {
          iconValue = await apiUploadCategoryIcon(draft.iconFile);
        }

        const payload = {
          tenant_id: TENANT_ID,
          title: String(form.title.value || "").trim(),
          code: String(form.code.value || "").trim(),
          icon: iconValue,
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

    const ui = {
      iconPreview: $("#ceIconPreview", window.AppModal.body),
      iconPlaceholder: $("#ceIconPlaceholder", window.AppModal.body),
      iconFileInput: $("#ceIconFile", window.AppModal.body),
      iconUploadBtn: $("#ceIconUploadBtn", window.AppModal.body),
      iconDeleteBtn: $("#ceIconDeleteBtn", window.AppModal.body),
    };

    if (isEdit && category) {
      form.title.value = category.title || "";
      form.code.value = category.code || "";
      form.icon.value = category.icon || "";
      form.sort_order.value = category.sort_order != null ? String(category.sort_order) : "";
      form.is_active.checked = Boolean(category.is_active);
      form.site_visibility.checked = Boolean(category.site_visibility);
    }

    function renderIconPreview(value) {
      if (!ui.iconPreview || !ui.iconPlaceholder) return;
      const v = String(value || "").trim();
      if (looksLikeUrl(v)) {
        ui.iconPreview.src = v;
        ui.iconPreview.classList.remove("hidden");
        ui.iconPlaceholder.classList.add("hidden");
        ui.iconPlaceholder.textContent = "Нет изображения";
        if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.remove("hidden");
        return;
      }
      ui.iconPreview.src = "";
      ui.iconPreview.classList.add("hidden");
      ui.iconPlaceholder.classList.remove("hidden");
      ui.iconPlaceholder.innerHTML = v ? `<i class="${escapeHtml(v)}"></i>` : "Нет изображения";
      if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.add("hidden");
    }

    renderIconPreview(form.icon.value);

    if (ui.iconUploadBtn && ui.iconFileInput) {
      ui.iconUploadBtn.addEventListener("click", () => ui.iconFileInput.click());
      ui.iconFileInput.addEventListener("change", () => {
        const file = ui.iconFileInput.files && ui.iconFileInput.files[0];
        ui.iconFileInput.value = "";
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
          alert("Можно загрузить только JPG, PNG или WEBP");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          alert("Размер файла не должен превышать 5MB");
          return;
        }
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconFile = file;
        draft.iconPreview = URL.createObjectURL(file);
        renderIconPreview(draft.iconPreview);
      });
    }

    if (ui.iconDeleteBtn) {
      ui.iconDeleteBtn.addEventListener("click", () => {
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconPreview = "";
        draft.iconFile = null;
        form.icon.value = "";
        renderIconPreview("");
      });
    }

    form.icon.addEventListener("input", () => {
      if (draft.iconPreview) {
        try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        draft.iconPreview = "";
        draft.iconFile = null;
      }
      renderIconPreview(form.icon.value);
    });
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

    if (state.selectedCategoryId && !state.categories.some((c) => c.id === state.selectedCategoryId)) {
      state.selectedCategoryId = null;
      showDetailsEmpty();
    }

    if (state.mode === "categories") {
      renderCategoriesMainList();
      return;
    }
    if (state.mode === "options") {
      await loadOptionGroups();
      renderOptionGroupsList();
      if (state.selectedOptionGroupId && !state.optionGroups.some((g) => g.id === state.selectedOptionGroupId)) {
        state.selectedOptionGroupId = null;
        state.optionGroupDetails = null;
        state.optionPanel.level = "empty";
        showDetailsEmpty();
      } else if (state.selectedOptionGroupId && state.optionPanel.mode !== "create") {
        await loadOptionGroupDetails(state.selectedOptionGroupId);
        if (state.optionPanel.level !== "empty") {
          showOptionGroupDetails(state.optionGroupDetails, { mode: state.optionPanel.mode });
        }
      }
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
        if (state.mode === "options") return startOptionCreate();
      });
    }

    // left other views
    if (productsAccordion) {
      productsAccordion.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        const view = btn.getAttribute("data-view");
        if (view === "options") {
          enterOptionsMode();
          loadOptionGroups().then(renderOptionGroupsList);
          return;
        }
        state.mode = view;
        setToolbarTitle(view === "products" ? (getCurrentCategory()?.title || "Товары") : view);
        showView(view);
        clearProductSelection();
      });
    }

    if (closeProductInfoBtn) closeProductInfoBtn.addEventListener("click", clearProductSelection);
    if (sheetCloseBtn) sheetCloseBtn.addEventListener("click", clearProductSelection);
    if (sheetBackdrop) sheetBackdrop.addEventListener("click", clearProductSelection);

    if (editProductBtn) {
      editProductBtn.addEventListener("click", () => {
        if (state.mode === "categories") {
          const cat = state.categories.find((x) => x.id === state.selectedCategoryId);
          if (cat) openCategoryModal({ mode: "edit", category: cat });
          return;
        }
        const p = state.products.find((x) => x.id === state.selectedProductId);
        if (p) openProductModal({ mode: "edit", product: p });
      });
    }

    if (optionItemsAddBtn) {
      optionItemsAddBtn.addEventListener("click", () => {
        if (state.optionPanel.mode === "create" || state.selectedOptionGroupId) {
          openOptionPicker("items");
        }
      });
    }

    if (optionAssignmentsAddBtn) {
      optionAssignmentsAddBtn.addEventListener("click", () => {
        if (state.optionPanel.mode === "create" || state.selectedOptionGroupId) {
          openOptionPicker("assignments");
        }
      });
    }

    if (optionGroupForm) {
      optionGroupForm.addEventListener("input", () => {
        syncOptionDraftGroupFromForm();
        renderOptionHeader();
      });
      optionGroupForm.addEventListener("change", () => {
        syncOptionDraftGroupFromForm();
        renderOptionHeader();
      });
    }

    if (optionGroupSelectionInput) {
      optionGroupSelectionInput.addEventListener("change", () => {
        updateOptionGroupSelectionUi();
        // show qty controls immediately for selection type switch
        renderOptionItems(getOptionItemsSource());
        renderOptionHeader();
      });
    }

    if (optionPickerSearch) {
      optionPickerSearch.addEventListener("input", async () => {
        state.optionPanel.pickerQuery = optionPickerSearch.value;
        await refreshOptionPickerProducts();
      });
    }

    if (optionPickerSelectAll) {
      optionPickerSelectAll.addEventListener("change", () => {
        const products = state.optionPanel.pickerProducts || [];
        const ids = products.map((product) => product.id);
        const selectedCount = ids.filter((id) => state.optionPanel.pickerSelection.has(id)).length;
        const allSelected = ids.length > 0 && selectedCount === ids.length;
        if (allSelected) {
          ids.forEach((id) => state.optionPanel.pickerSelection.delete(id));
        } else {
          ids.forEach((id) => state.optionPanel.pickerSelection.add(id));
        }
        renderOptionPickerList();
        renderOptionHeader();
      });
    }

    if (optionHeaderPrimaryBtn) {
      optionHeaderPrimaryBtn.addEventListener("click", async () => {
        if (state.optionPanel.level === "picker") {
          await applyOptionPickerSelection();
          return;
        }
        if (state.optionPanel.mode === "view") {
          startOptionEdit();
          return;
        }
        await saveOptionGroup();
      });
    }

    if (optionHeaderBackBtn) {
      optionHeaderBackBtn.addEventListener("click", () => {
        if (state.optionPanel.level === "picker") {
          closeOptionPicker();
          return;
        }
        closeOptionDetails();
      });
    }

    if (optionHeaderDeleteBtn) {
      optionHeaderDeleteBtn.addEventListener("click", () => {
        if (state.optionPanel.mode !== "edit") return;
        confirmOptionGroupDelete();
      });
    }

    if (optionHeaderCloseBtn) {
      optionHeaderCloseBtn.addEventListener("click", () => {
        if (state.optionPanel.level === "picker") {
          closeOptionPicker();
          return;
        }
        if (state.optionPanel.mode !== "view") {
          cancelOptionEdit();
          return;
        }
        closeOptionDetails();
      });
    }

    window.addEventListener("resize", () => {
      refreshOpenAccordions();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile && detailsDesktopHost) {
        if (productInfo && productInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(productInfo);
        }
        if (categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(categoryInfo);
        }
        if (optionGroupInfo && optionGroupInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(optionGroupInfo);
        }
        closeSheet();
      }
    });
  }

  // ---------------- Init ----------------

  document.addEventListener("DOMContentLoaded", async () => {
    bindAccordionContainer(productsAccordion);
    bindAccordionContainer(optionGroupInfo);
    bindEvents();

    await refreshAll();
    enterProductsMode(state.currentCategoryId);
    await refreshProductsOnly();

    // ✅ гарантированно “до конца”
    requestAnimationFrame(refreshOpenAccordions);
  });
})();
