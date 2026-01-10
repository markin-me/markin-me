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

  const optionGroupSelection = $("#optionGroupSelection");
  const optionGroupLimits = $("#optionGroupLimits");
  const optionItemsList = $("#optionItemsList");
  const optionAssignmentsList = $("#optionAssignmentsList");
  const optionAssignmentsAddBtn = $("#optionAssignmentsAddBtn");
  const optionAssignmentsShowInactive = $("#optionAssignmentsShowInactive");

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
    catalogCategories: [],
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

  async function apiAddGroupAssignments(groupId, assignIds) {
    return api(`/api/admin/options/groups/${groupId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ assign_ids: assignIds }),
    });
  }

  async function apiPatchAssignment(id, payload) {
    return api(`/api/admin/options/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
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
      return `
        <div class="options-row ${isActive ? "is-active" : ""}" data-option-group-id="${group.id}">
          <div>
            <div class="options-row-title">${escapeHtml(group.title || "")}</div>
            <div class="options-row-meta">Тип: ${escapeHtml(group.selection_type || "")}</div>
          </div>
          <div class="options-row-meta">Max: ${escapeHtml(maxLabel)}</div>
          <div class="options-row-meta">Items: ${group.items_count ?? 0}</div>
          <div class="options-row-meta">Assignments: ${group.assignments_count ?? 0}</div>
          <div class="options-row-meta">${group.is_active ? "Активна" : "Выключена"}</div>
        </div>
      `;
    }).join("");

    optionsGroupsList.querySelectorAll("[data-option-group-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.optionGroupId);
        if (!Number.isFinite(id)) return;
        state.selectedOptionGroupId = id;
        await loadOptionGroupDetails(id);
        renderOptionGroupsList();
        showOptionGroupDetails(state.optionGroupDetails);
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

  function showProductDetails(p) {
    if (!p) return;

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

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    productInfo && productInfo.classList.remove("hidden");

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

  function renderOptionItems(items) {
    if (!optionItemsList) return;
    if (!items.length) {
      optionItemsList.innerHTML = `<div class="empty-hint">Пока нет items...</div>`;
      return;
    }

    optionItemsList.innerHTML = items.map((item) => {
      const catalogPrice = item.product_price != null ? Number(item.product_price).toFixed(2) : "—";
      const priceLabel = item.price_mode === "fixed" && item.price_value != null
        ? `Фикс: ${Number(item.price_value).toFixed(2)}`
        : "По каталогу";
      const qtyLabel = `${item.qty_min ?? 1} — ${item.qty_max ?? 1}`;
      return `
        <div class="option-item-row">
          <div>
            <div class="options-row-title">${escapeHtml(item.product_name || "")}</div>
            <div class="muted">Каталог: ${catalogPrice}</div>
          </div>
          <div class="muted">${priceLabel}</div>
          <div class="muted">Кол-во: ${qtyLabel}</div>
          <div></div>
          <div></div>
        </div>
      `;
    }).join("");
  }

  function renderOptionAssignments(assignments) {
    if (!optionAssignmentsList) return;
    const showInactive = optionAssignmentsShowInactive && optionAssignmentsShowInactive.checked;
    const filtered = assignments.filter((a) => showInactive || a.is_active);
    if (!filtered.length) {
      optionAssignmentsList.innerHTML = `<div class="empty-hint">Пока нет привязок...</div>`;
      return;
    }

    optionAssignmentsList.innerHTML = filtered.map((assignment) => {
      const disabled = assignment.is_active ? "" : "is-disabled";
      return `
        <div class="option-assignment-row ${disabled}">
          <div>
            <div class="options-row-title">${escapeHtml(assignment.product_name || "")}</div>
            ${assignment.is_active ? "" : `<div class="muted">Отключено</div>`}
          </div>
          <input class="control" type="number" min="0" value="${assignment.priority ?? 0}" data-assignment-field="priority" data-assignment-id="${assignment.id}" ${assignment.is_active ? "" : "disabled"} />
          <input class="control" type="number" min="0" value="${assignment.sort_order ?? 0}" data-assignment-field="sort_order" data-assignment-id="${assignment.id}" ${assignment.is_active ? "" : "disabled"} />
          <button class="btn btn-icon" type="button" data-assignment-remove="${assignment.id}" title="Удалить"><i class="fas fa-times"></i></button>
        </div>
      `;
    }).join("");

    optionAssignmentsList.querySelectorAll("[data-assignment-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.assignmentRemove);
        if (!Number.isFinite(id)) return;
        await apiPatchAssignment(id, { is_active: 0 });
        if (state.optionGroupDetails) {
          state.optionGroupDetails.assignments = state.optionGroupDetails.assignments.map((a) =>
            a.id === id ? { ...a, is_active: 0 } : a
          );
          renderOptionAssignments(state.optionGroupDetails.assignments);
        }
      });
    });

    const debounceMap = new Map();
    optionAssignmentsList.querySelectorAll("input[data-assignment-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = Number(input.dataset.assignmentId);
        const field = input.dataset.assignmentField;
        if (!Number.isFinite(id) || !field) return;
        const value = input.value === "" ? 0 : Number(input.value);
        const current = debounceMap.get(id);
        if (current) clearTimeout(current);
        const timer = setTimeout(async () => {
          await apiPatchAssignment(id, { [field]: value });
        }, 400);
        debounceMap.set(id, timer);
      });
    });
  }

  function showOptionGroupDetails(details) {
    if (!details || !details.group) return;
    const group = details.group;
    productTitle.textContent = group.title || "—";
    productSku.textContent = "Опция товара";
    if (editProductBtn) editProductBtn.classList.add("hidden");

    if (optionGroupSelection) {
      optionGroupSelection.textContent = group.selection_type || "—";
    }
    if (optionGroupLimits) {
      const maxLabel = group.max_select == null ? "∞" : group.max_select;
      optionGroupLimits.textContent = `${group.min_select ?? 0} — ${maxLabel}`;
    }

    renderOptionItems(details.items || []);
    renderOptionAssignments(details.assignments || []);

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.remove("hidden");

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
  }

  function showDetailsEmpty() {
    const showCategory = state.mode === "categories";
    const showOption = state.mode === "options";
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.add("hidden");
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
      optionChips: $("#peOptionChips", body),
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
          <div class="option-picker-row ${checked ? "is-selected" : ""}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(g.title || "")}</div>
              <div class="options-row-meta">${escapeHtml(g.selection_type || "")}</div>
            </div>
            <label class="switch">
              <input class="switch-input" type="checkbox" data-option-id="${g.id}" ${checked ? "checked" : ""} />
              <span class="switch-ui"></span>
            </label>
          </div>
        `;
      }).join("");

      ui.optionList.querySelectorAll("input[data-option-id]").forEach((input) => {
        input.addEventListener("change", () => {
          const id = Number(input.dataset.optionId);
          if (!Number.isFinite(id)) return;
          if (input.checked) pickerSelection.add(id);
          else pickerSelection.delete(id);
          renderOptionPickerList(pickerSelection);
          if (ui.optionApply) ui.optionApply.textContent = `Добавить (${pickerSelection.size})`;
        });
      });
    }

    function renderOptionChips() {
      if (!ui.optionChips) return;
      const selected = Array.from(draft.optionGroups)
        .map((id) => state.optionGroups.find((g) => Number(g.id) === Number(id)))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      const chips = selected.map((g) => `
        <span class="chip">
          ${escapeHtml(g.title || "")}
          <button class="btn btn-icon" type="button" data-option-remove="${g.id}">
            <i class="fas fa-times"></i>
          </button>
        </span>
      `).join("");

      ui.optionChips.innerHTML = `
        ${chips}
        <button type="button" class="chip chip-plus" id="peOptionPlus"><i class="fas fa-plus"></i></button>
      `;

      const plus = $("#peOptionPlus", ui.optionChips);
      if (plus) {
        plus.addEventListener("click", () => {
          optionPickerSelection = new Set(draft.optionGroups);
          renderOptionPickerList(optionPickerSelection);
          if (ui.optionApply) ui.optionApply.textContent = `Добавить (${optionPickerSelection.size})`;
          openOptionPicker();

          if (ui.optionApply) {
            ui.optionApply.onclick = () => {
              draft.optionGroups = new Set(optionPickerSelection || []);
              renderOptionChips();
              closeOptionPicker();
            };
          }
        });
      }

      ui.optionChips.querySelectorAll("[data-option-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.optionRemove);
          if (!Number.isFinite(id)) return;
          draft.optionGroups.delete(id);
          renderOptionChips();
        });
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
      renderOptionChips();
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

  // ---------------- Modal: option group ----------------

  function openOptionGroupModal() {
    const draft = {
      items: [],
      assignments: [],
    };

    window.AppModal.open({
      title: "Новая опция",
      content: "#tplOptionGroupEditor",
      onSave: async ({ body }) => {
        const form = $("#optionGroupForm", body);
        if (!form) return false;

        const groupPayload = {
          title: String(form.title.value || "").trim(),
          selection_type: form.selection_type.value === "multiple" ? "multiple" : "single",
          min_select: form.min_select.value === "" ? 0 : Number(form.min_select.value),
          max_select: form.max_select.value === "" ? null : Number(form.max_select.value),
          is_active: form.is_active.checked ? 1 : 0,
          sort_order: form.sort_order.value === "" ? 0 : Number(form.sort_order.value),
        };

        if (!groupPayload.title) {
          form.title.focus();
          return false;
        }

        const itemsPayload = draft.items.map((item, idx) => {
          const isFixed = item.newPrice !== "" && item.newPrice != null;
          return {
            target_product_id: item.id,
            price_mode: isFixed ? "fixed" : "from_target",
            price_value: isFixed ? Number(item.newPrice) : null,
            qty_min: groupPayload.selection_type === "single" ? 1 : (item.qty_min ?? 1),
            qty_max: groupPayload.selection_type === "single" ? 1 : (item.qty_max ?? 1),
            sort_order: idx * 10,
            is_active: 1,
          };
        });

        const assignmentsPayload = draft.assignments.map((item, idx) => ({
          assign_id: item.id,
          priority: 0,
          sort_order: idx * 10,
          is_active: 1,
        }));

        await apiCreateOptionGroup({
          group: groupPayload,
          items: itemsPayload,
          assignments: assignmentsPayload,
        });

        await refreshAll();
        return true;
      },
    });

    const body = window.AppModal.body;
    if (!body) return;

    const ui = {
      selectionType: $("#og_selection", body),
      itemsTable: $("#ogItemsTable", body),
      assignmentsTable: $("#ogAssignmentsTable", body),
      addItemsBtn: $("#ogAddItemsBtn", body),
      addAssignmentsBtn: $("#ogAddAssignmentsBtn", body),
      pickerBackdrop: $("#ogPickerBackdrop", body),
      pickerModal: $("#ogPickerModal", body),
      pickerTitle: $("#ogPickerTitle", body),
      pickerTabs: $("#ogPickerTabs", body),
      pickerSearch: $("#ogPickerSearch", body),
      pickerList: $("#ogPickerList", body),
      pickerClose: $("#ogPickerClose", body),
      pickerCancel: $("#ogPickerCancel", body),
      pickerApply: $("#ogPickerApply", body),
    };

    let pickerMode = "items";
    let pickerSelection = new Set();
    let pickerCategoryId = null;
    let pickerProducts = [];

    function renderItemsTable() {
      if (!ui.itemsTable) return;
      if (!draft.items.length) {
        ui.itemsTable.innerHTML = `<div class="empty-hint">Выберите товары для items...</div>`;
        return;
      }

      const isSingle = ui.selectionType && ui.selectionType.value === "single";

      ui.itemsTable.innerHTML = draft.items.map((item) => {
        const catalogPrice = item.price != null ? Number(item.price).toFixed(2) : "—";
        return `
          <div class="option-item-row">
            <div>
              <div class="options-row-title">${escapeHtml(item.name || "")}</div>
              <div class="muted">Каталог: ${catalogPrice}</div>
            </div>
            <input class="control" type="number" step="0.01" min="0" placeholder="Новая цена" data-item-field="price" data-item-id="${item.id}" value="${item.newPrice ?? ""}" />
            <input class="control" type="number" min="1" ${isSingle ? "disabled" : ""} data-item-field="qty_min" data-item-id="${item.id}" value="${item.qty_min ?? 1}" />
            <input class="control" type="number" min="1" ${isSingle ? "disabled" : ""} data-item-field="qty_max" data-item-id="${item.id}" value="${item.qty_max ?? 1}" />
            <button class="btn btn-icon" type="button" data-item-remove="${item.id}"><i class="fas fa-times"></i></button>
          </div>
        `;
      }).join("");

      ui.itemsTable.querySelectorAll("[data-item-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.itemRemove);
          if (!Number.isFinite(id)) return;
          draft.items = draft.items.filter((x) => x.id !== id);
          renderItemsTable();
        });
      });

      ui.itemsTable.querySelectorAll("input[data-item-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const id = Number(input.dataset.itemId);
          const field = input.dataset.itemField;
          const item = draft.items.find((x) => x.id === id);
          if (!item || !field) return;
          if (field === "price") {
            item.newPrice = input.value === "" ? "" : Number(input.value);
          } else if (field === "qty_min") {
            item.qty_min = input.value === "" ? 1 : Number(input.value);
          } else if (field === "qty_max") {
            item.qty_max = input.value === "" ? 1 : Number(input.value);
          }
        });
      });
    }

    function renderAssignmentsTable() {
      if (!ui.assignmentsTable) return;
      if (!draft.assignments.length) {
        ui.assignmentsTable.innerHTML = `<div class="empty-hint">Выберите товары для assignments...</div>`;
        return;
      }

      ui.assignmentsTable.innerHTML = draft.assignments.map((item) => `
        <div class="option-assignment-row">
          <div class="options-row-title">${escapeHtml(item.name || "")}</div>
          <div class="muted">priority=0</div>
          <div class="muted">sort=0</div>
          <button class="btn btn-icon" type="button" data-assign-remove="${item.id}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join("");

      ui.assignmentsTable.querySelectorAll("[data-assign-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.assignRemove);
          if (!Number.isFinite(id)) return;
          draft.assignments = draft.assignments.filter((x) => x.id !== id);
          renderAssignmentsTable();
        });
      });
    }

    function closePicker() {
      if (ui.pickerBackdrop) ui.pickerBackdrop.classList.add("hidden");
      if (ui.pickerModal) ui.pickerModal.classList.add("hidden");
      if (ui.pickerSearch) ui.pickerSearch.value = "";
      pickerSelection = new Set();
    }

    function renderPickerTabs() {
      if (!ui.pickerTabs) return;
      ui.pickerTabs.innerHTML = state.catalogCategories.map((cat) => {
        const active = Number(cat.id) === Number(pickerCategoryId);
        return `
          <button class="option-picker-tab ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
            ${escapeHtml(cat.title || "")}
          </button>
        `;
      }).join("");

      ui.pickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          pickerCategoryId = Number(btn.dataset.catId);
          await refreshPickerProducts();
        });
      });
    }

    async function refreshPickerProducts() {
      const res = await apiGetCatalogProducts({ categoryId: pickerCategoryId, query: ui.pickerSearch.value });
      pickerProducts = Array.isArray(res.data) ? res.data : [];
      renderPickerList();
    }

    function renderPickerList() {
      if (!ui.pickerList) return;
      ui.pickerList.innerHTML = pickerProducts.map((product) => {
        const checked = pickerSelection.has(product.id);
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(product.name || "")}</div>
              <div class="options-row-meta">Цена: ${product.price != null ? Number(product.price).toFixed(2) : "—"}</div>
            </div>
            <label class="switch">
              <input class="switch-input" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
              <span class="switch-ui"></span>
            </label>
          </div>
        `;
      }).join("");

      ui.pickerList.querySelectorAll("input[data-product-id]").forEach((input) => {
        input.addEventListener("change", () => {
          const id = Number(input.dataset.productId);
          if (!Number.isFinite(id)) return;
          if (input.checked) pickerSelection.add(id);
          else pickerSelection.delete(id);
          if (ui.pickerApply) ui.pickerApply.textContent = `Добавить (${pickerSelection.size})`;
        });
      });
    }

    async function openPicker(mode) {
      pickerMode = mode;
      if (!state.catalogCategories.length) {
        await loadCatalogCategories();
      }
      pickerCategoryId = state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null;
      pickerSelection = new Set();
      renderPickerTabs();
      await refreshPickerProducts();
      if (ui.pickerApply) ui.pickerApply.textContent = `Добавить (${pickerSelection.size})`;
      if (ui.pickerTitle) ui.pickerTitle.textContent = mode === "items" ? "Добавить товары (items)" : "Добавить товары (assignments)";
      if (ui.pickerBackdrop) ui.pickerBackdrop.classList.remove("hidden");
      if (ui.pickerModal) ui.pickerModal.classList.remove("hidden");
    }

    if (ui.addItemsBtn) ui.addItemsBtn.addEventListener("click", () => openPicker("items"));
    if (ui.addAssignmentsBtn) ui.addAssignmentsBtn.addEventListener("click", () => openPicker("assignments"));
    if (ui.pickerClose) ui.pickerClose.addEventListener("click", closePicker);
    if (ui.pickerCancel) ui.pickerCancel.addEventListener("click", closePicker);
    if (ui.pickerBackdrop) ui.pickerBackdrop.addEventListener("click", closePicker);
    if (ui.pickerSearch) ui.pickerSearch.addEventListener("input", refreshPickerProducts);
    if (ui.selectionType) ui.selectionType.addEventListener("change", renderItemsTable);

    if (ui.pickerApply) {
      ui.pickerApply.addEventListener("click", () => {
        const selectedProducts = pickerProducts.filter((p) => pickerSelection.has(p.id));
        if (pickerMode === "items") {
          for (const product of selectedProducts) {
            if (draft.items.some((x) => x.id === product.id)) continue;
            draft.items.push({ id: product.id, name: product.name, price: product.price, newPrice: "", qty_min: 1, qty_max: 1 });
          }
          renderItemsTable();
        } else {
          for (const product of selectedProducts) {
            if (draft.assignments.some((x) => x.id === product.id)) continue;
            draft.assignments.push({ id: product.id, name: product.name });
          }
          renderAssignmentsTable();
        }
        closePicker();
      });
    }

    renderItemsTable();
    renderAssignmentsTable();
  }

  async function openAssignmentsPickerForGroup(groupId) {
    if (!window.AppModal) return;
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }

    const pickerState = {
      categoryId: state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null,
      selected: new Set(),
      products: [],
      query: "",
    };

    window.AppModal.open({
      title: "Добавить товары",
      content: `
        <div class="option-group-section">
          <div class="option-picker-tabs" id="agPickerTabs"></div>
          <div class="option-picker-search">
            <input class="control" id="agPickerSearch" type="search" placeholder="Поиск по названию" />
          </div>
          <div class="option-picker-list" id="agPickerList"></div>
        </div>
      `,
      saveText: "Добавить",
      onSave: async () => {
        const ids = Array.from(pickerState.selected);
        if (!ids.length) return true;
        const res = await apiAddGroupAssignments(groupId, ids);
        if (res.skipped && res.skipped.length) {
          alert("Некоторые товары уже добавлены.");
        }
        await loadOptionGroupDetails(groupId);
        renderOptionGroupsList();
        showOptionGroupDetails(state.optionGroupDetails);
        return true;
      },
    });

    const body = window.AppModal.body;
    const tabsEl = $("#agPickerTabs", body);
    const searchEl = $("#agPickerSearch", body);
    const listEl = $("#agPickerList", body);

    function renderTabs() {
      if (!tabsEl) return;
      tabsEl.innerHTML = state.catalogCategories.map((cat) => {
        const active = Number(cat.id) === Number(pickerState.categoryId);
        return `
          <button class="option-picker-tab ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
            ${escapeHtml(cat.title || "")}
          </button>
        `;
      }).join("");
      tabsEl.querySelectorAll("[data-cat-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          pickerState.categoryId = Number(btn.dataset.catId);
          await refreshProducts();
        });
      });
    }

    async function refreshProducts() {
      const res = await apiGetCatalogProducts({ categoryId: pickerState.categoryId, query: pickerState.query });
      pickerState.products = Array.isArray(res.data) ? res.data : [];
      renderList();
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = pickerState.products.map((product) => {
        const checked = pickerState.selected.has(product.id);
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(product.name || "")}</div>
              <div class="options-row-meta">Цена: ${product.price != null ? Number(product.price).toFixed(2) : "—"}</div>
            </div>
            <label class="switch">
              <input class="switch-input" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
              <span class="switch-ui"></span>
            </label>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll("input[data-product-id]").forEach((input) => {
        input.addEventListener("change", () => {
          const id = Number(input.dataset.productId);
          if (!Number.isFinite(id)) return;
          if (input.checked) pickerState.selected.add(id);
          else pickerState.selected.delete(id);
        });
      });
    }

    if (searchEl) {
      searchEl.addEventListener("input", async () => {
        pickerState.query = searchEl.value;
        await refreshProducts();
      });
    }

    renderTabs();
    await refreshProducts();
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
        showDetailsEmpty();
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
        if (state.mode === "options") return openOptionGroupModal();
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

    if (optionAssignmentsAddBtn) {
      optionAssignmentsAddBtn.addEventListener("click", () => {
        if (!state.selectedOptionGroupId) return;
        openAssignmentsPickerForGroup(state.selectedOptionGroupId);
      });
    }

    if (optionAssignmentsShowInactive) {
      optionAssignmentsShowInactive.addEventListener("change", () => {
        if (state.optionGroupDetails) {
          renderOptionAssignments(state.optionGroupDetails.assignments || []);
        }
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
    bindAccordions();
    bindEvents();

    await refreshAll();
    enterProductsMode(state.currentCategoryId);
    await refreshProductsOnly();

    // ✅ гарантированно “до конца”
    requestAnimationFrame(refreshOpenAccordions);
  });
})();
