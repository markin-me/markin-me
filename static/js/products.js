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

  const optionGroupAddBtn = $("#optionGroupAddBtn");
  const optionItemAddBtn = $("#optionItemAddBtn");
  const optionAssignmentAddBtn = $("#optionAssignmentAddBtn");
  const optionExclusionAddBtn = $("#optionExclusionAddBtn");
  const optionOverrideAddBtn = $("#optionOverrideAddBtn");

  // right info
  const productEmpty = $("#productEmpty");
  const productInfo = $("#productInfo");
  const productInfoHeader = $("#productInfoHeader");
  const closeProductInfoBtn = $("#closeProductInfoBtn");
  const editProductBtn = $("#editProductBtn");

  const categoryEmpty = $("#categoryEmpty");
  const categoryInfo = $("#categoryInfo");
  const categoryInfoHeader = $("#categoryInfoHeader");
  const categoryTitle = $("#categoryTitle");
  const categoryMeta = $("#categoryMeta");
  const categoryStatus = $("#categoryStatus");
  const categoryVisibility = $("#categoryVisibility");
  const categoryInfoIconImg = $("#categoryInfoIconImg");
  const categoryInfoIconPlaceholder = $("#categoryInfoIconPlaceholder");
  const editCategoryBtn = $("#editCategoryBtn");
  const closeCategoryInfoBtn = $("#closeCategoryInfoBtn");

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
    selectedCategoryId: null,
    selectedProductCategories: [], // full objects
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
      body: fd
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

  // ---------------- Render: left nav ----------------

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function looksLikeUrl(s) {
    if (!s) return false;
    const v = String(s);
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("/static/") ||
      v.startsWith("/uploads/") ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(v)
    );
  }

  function categoryIconInnerHtml(icon) {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) return `<img src="${escapeHtml(v)}" alt="" />`;
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
          <span class="stage-icon">${categoryIconInnerHtml(c.icon)}</span>
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

    categoriesMainList.innerHTML = list.map((c) => {
      const active = Number(c.id) === Number(state.selectedCategoryId) ? "is-active" : "";
      return `
        <div class="order-row category-row ${active}" data-id="${c.id}" draggable="true">
          <div class="category-list-icon">${categoryIconInnerHtml(c.icon)}</div>
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

    if (categoryInfoHeader) categoryInfoHeader.classList.add("hidden");
    if (categoryInfo) categoryInfo.classList.add("hidden");
    if (categoryEmpty) categoryEmpty.classList.add("hidden");

    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
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

  function showCategoryDetails(c) {
    if (!c) return;

    productInfoHeader && productInfoHeader.classList.add("hidden");
    productInfo && productInfo.classList.add("hidden");
    productEmpty && productEmpty.classList.add("hidden");

    categoryInfoHeader && categoryInfoHeader.classList.remove("hidden");
    categoryInfo && categoryInfo.classList.remove("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");

    if (categoryTitle) categoryTitle.textContent = c.title || "Категория";
    if (categoryMeta) categoryMeta.textContent = `ID: ${c.id}`;
    if (categoryStatus) categoryStatus.textContent = c.is_active ? "Активна" : "Выключена";
    if (categoryVisibility) categoryVisibility.textContent = c.site_visibility ? "На сайте" : "Скрыта";

    if (categoryInfoIconImg && categoryInfoIconPlaceholder) {
      const iconValue = c.icon || "";
      if (looksLikeUrl(iconValue)) {
        categoryInfoIconImg.src = iconValue;
        categoryInfoIconImg.classList.remove("hidden");
        categoryInfoIconPlaceholder.classList.add("hidden");
      } else {
        categoryInfoIconImg.src = "";
        categoryInfoIconImg.classList.add("hidden");
        categoryInfoIconPlaceholder.classList.remove("hidden");
        if (iconValue) categoryInfoIconPlaceholder.innerHTML = `<i class="${escapeHtml(iconValue)}"></i>`;
        else categoryInfoIconPlaceholder.textContent = "Нет иконки";
      }
    }

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

  function clearProductSelection() {
    state.selectedProductId = null;
    state.selectedProductCategories = [];
    productInfo && productInfo.classList.add("hidden");
    if (state.mode === "products") {
      productEmpty && productEmpty.classList.remove("hidden");
    } else {
      productEmpty && productEmpty.classList.add("hidden");
    }
    if (productInfoHeader) productInfoHeader.classList.add("hidden");
    closeSheet();
    if (productsList) $$(".order-row", productsList).forEach((x) => x.classList.remove("is-active"));
  }

  function clearCategorySelection() {
    state.selectedCategoryId = null;
    categoryInfo && categoryInfo.classList.add("hidden");
    if (state.mode === "categories") {
      categoryEmpty && categoryEmpty.classList.remove("hidden");
    } else {
      categoryEmpty && categoryEmpty.classList.add("hidden");
    }
    if (categoryInfoHeader) categoryInfoHeader.classList.add("hidden");
    closeSheet();
    if (categoriesMainList) $$(".category-row", categoriesMainList).forEach((x) => x.classList.remove("is-active"));
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
    const draft = {
      icon: category?.icon ? { kind: "url", url: category.icon } : { kind: "none" },
    };

    window.AppModal.open({
      title: isEdit ? "Редактировать категорию" : "Новая категория",
      content: "#tplCategoryEditor",
      onSave: async ({ body }) => {
        const form = $("#categoryEditorForm", body);
        if (!form) return false;

        let iconValue = String(form.icon.value || "").trim();
        if (draft.icon.kind === "file") {
          iconValue = await apiUploadCategoryIcon(draft.icon.file);
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

    const iconPreview = $("#ceIconPreview", form);
    const iconFile = $("#ceIconFile", form);
    const iconUploadBtn = $("#ceIconUploadBtn", form);

    function renderIconPreview(value) {
      if (!iconPreview) return;
      iconPreview.innerHTML = "";
      if (looksLikeUrl(value)) {
        const img = document.createElement("img");
        img.src = value;
        img.alt = "";
        iconPreview.appendChild(img);
        return;
      }
      const ph = document.createElement("div");
      ph.className = "category-icon-placeholder";
      ph.textContent = "Нет иконки";
      iconPreview.appendChild(ph);
    }

    if (iconUploadBtn && iconFile) {
      iconUploadBtn.addEventListener("click", () => iconFile.click());
      iconFile.addEventListener("change", () => {
        const file = iconFile.files && iconFile.files[0];
        if (!file) return;
        const preview = URL.createObjectURL(file);
        draft.icon = { kind: "file", file, preview };
        renderIconPreview(preview);
      });
    }

    form.icon.addEventListener("input", () => {
      draft.icon = { kind: "url", url: String(form.icon.value || "").trim() };
      renderIconPreview(draft.icon.url);
    });

    if (isEdit && category) {
      form.title.value = category.title || "";
      form.code.value = category.code || "";
      form.icon.value = category.icon || "";
      form.sort_order.value = category.sort_order != null ? String(category.sort_order) : "";
      form.is_active.checked = Boolean(category.is_active);
      form.site_visibility.checked = Boolean(category.site_visibility);
    }

    renderIconPreview(form.icon.value || "");
  }

  // ---------------- Options (admin) ----------------

  async function loadAllProductsForOptions() {
    if (state.allProducts.length) return;
    const categoryId = state.allCategoryId || state.currentCategoryId || (state.categories[0] && state.categories[0].id);
    if (!categoryId) return;
    const res = await api(`/api/prod_products?tenant_id=${TENANT_ID}&category_id=${categoryId}`);
    state.allProducts = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionGroups() {
    const res = await api(`/api/option-groups?tenant_id=${TENANT_ID}`);
    state.optionGroups = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionItems(groupId) {
    if (!groupId) {
      state.optionItems = [];
      return;
    }
    const res = await api(`/api/option-groups/${groupId}/items?tenant_id=${TENANT_ID}`);
    state.optionItems = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionAssignments() {
    const res = await api(`/api/option-assignments?tenant_id=${TENANT_ID}`);
    state.optionAssignments = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionExclusions() {
    const res = await api(`/api/option-exclusions?tenant_id=${TENANT_ID}`);
    state.optionExclusions = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionOverrides() {
    const res = await api(`/api/option-overrides?tenant_id=${TENANT_ID}`);
    state.optionOverrides = Array.isArray(res.data) ? res.data : [];
  }

  function groupTitleById(id) {
    return (state.optionGroups.find((g) => Number(g.id) === Number(id)) || {}).title || `#${id}`;
  }

  function categoryTitleById(id) {
    return (state.categories.find((c) => Number(c.id) === Number(id)) || {}).title || `#${id}`;
  }

  function productTitleById(id) {
    return (state.allProducts.find((p) => Number(p.id) === Number(id)) || {}).name || `#${id}`;
  }

  function renderOptionGroups() {
    if (!optionGroupsList) return;
    if (!state.optionGroups.length) {
      optionGroupsList.innerHTML = `<div class="muted">Групп пока нет.</div>`;
      return;
    }
    optionGroupsList.innerHTML = state.optionGroups.map((g) => {
      const active = Number(state.selectedOptionGroupId) === Number(g.id) ? "is-active" : "";
      const meta = `мин ${g.min_select ?? 0} • макс ${g.max_select ?? 0} • ${g.selection_type || "single"}`;
      return `
        <div class="options-row ${active}" data-group-id="${g.id}">
          <div>
            <div class="options-row-title">${escapeHtml(g.title || "—")}</div>
            <div class="options-row-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="options-row-actions">
            <button class="btn btn-icon" type="button" data-action="edit"><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon" type="button" data-action="delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$(".options-row[data-group-id]", optionGroupsList).forEach((row) => {
      row.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-action]");
        const id = Number(row.dataset.groupId);
        if (!Number.isFinite(id)) return;
        const group = state.optionGroups.find((g) => Number(g.id) === id);

        if (action?.dataset.action === "edit") {
          e.stopPropagation();
          if (group) openOptionGroupModal({ mode: "edit", group });
          return;
        }
        if (action?.dataset.action === "delete") {
          e.stopPropagation();
          if (!window.confirm("Удалить группу?")) return;
          await api(`/api/option-groups/${id}`, { method: "DELETE" });
          await loadOptionsView();
          return;
        }

        state.selectedOptionGroupId = id;
        await loadOptionItems(id);
        renderOptionGroups();
        renderOptionItems();
      });
    });
  }

  function renderOptionItems() {
    if (!optionItemsList) return;
    if (!state.selectedOptionGroupId) {
      optionItemsList.innerHTML = `<div class="muted">Выберите группу</div>`;
      return;
    }
    if (!state.optionItems.length) {
      optionItemsList.innerHTML = `<div class="muted">Элементов пока нет.</div>`;
      return;
    }

    optionItemsList.innerHTML = state.optionItems.map((it) => {
      const meta = `${it.price_mode || "fixed"} • ${Number(it.price || 0)} ₽`;
      return `
        <div class="options-row" data-item-id="${it.id}">
          <div>
            <div class="options-row-title">${escapeHtml(it.title || "—")}</div>
            <div class="options-row-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="options-row-actions">
            <button class="btn btn-icon" type="button" data-action="edit"><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon" type="button" data-action="delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$(".options-row[data-item-id]", optionItemsList).forEach((row) => {
      row.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-action]");
        const id = Number(row.dataset.itemId);
        if (!Number.isFinite(id)) return;
        const item = state.optionItems.find((i) => Number(i.id) === id);

        if (action?.dataset.action === "edit") {
          e.stopPropagation();
          if (item) openOptionItemModal({ mode: "edit", item, groupId: state.selectedOptionGroupId });
          return;
        }
        if (action?.dataset.action === "delete") {
          e.stopPropagation();
          if (!window.confirm("Удалить элемент?")) return;
          await api(`/api/option-items/${id}`, { method: "DELETE" });
          await loadOptionItems(state.selectedOptionGroupId);
          renderOptionItems();
        }
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
      const target = a.assign_type === "category"
        ? `Категория: ${categoryTitleById(a.assign_id)}`
        : `Товар: ${productTitleById(a.assign_id)}`;
      const meta = `prio ${a.priority ?? 0} • sort ${a.sort_order ?? 0}`;
      return `
        <div class="options-row" data-assignment-id="${a.id}">
          <div>
            <div class="options-row-title">${escapeHtml(groupTitleById(a.group_id))}</div>
            <div class="options-row-meta">${escapeHtml(target)} • ${escapeHtml(meta)}</div>
          </div>
          <div class="options-row-actions">
            <button class="btn btn-icon" type="button" data-action="edit"><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon" type="button" data-action="delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$(".options-row[data-assignment-id]", optionAssignmentsList).forEach((row) => {
      row.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-action]");
        const id = Number(row.dataset.assignmentId);
        const assignment = state.optionAssignments.find((a) => Number(a.id) === id);
        if (!assignment) return;

        if (action?.dataset.action === "edit") {
          e.stopPropagation();
          openOptionAssignmentModal({ mode: "edit", assignment });
          return;
        }
        if (action?.dataset.action === "delete") {
          e.stopPropagation();
          if (!window.confirm("Удалить назначение?")) return;
          await api(`/api/option-assignments/${id}`, { method: "DELETE" });
          await loadOptionAssignments();
          renderOptionAssignments();
        }
      });
    });
  }

  function renderOptionExclusions() {
    if (!optionExclusionsList) return;
    if (!state.optionExclusions.length) {
      optionExclusionsList.innerHTML = `<div class="muted">Исключений пока нет.</div>`;
      return;
    }
    optionExclusionsList.innerHTML = state.optionExclusions.map((x) => {
      const title = `${productTitleById(x.product_id)} • ${groupTitleById(x.group_id)}`;
      return `
        <div class="options-row" data-exclusion-id="${x.id}">
          <div class="options-row-title">${escapeHtml(title)}</div>
          <div class="options-row-actions">
            <button class="btn btn-icon" type="button" data-action="delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$(".options-row[data-exclusion-id]", optionExclusionsList).forEach((row) => {
      row.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-action]");
        if (action?.dataset.action !== "delete") return;
        const id = Number(row.dataset.exclusionId);
        if (!Number.isFinite(id)) return;
        if (!window.confirm("Удалить исключение?")) return;
        await api(`/api/option-exclusions/${id}`, { method: "DELETE" });
        await loadOptionExclusions();
        renderOptionExclusions();
      });
    });
  }

  function renderOptionOverrides() {
    if (!optionOverridesList) return;
    if (!state.optionOverrides.length) {
      optionOverridesList.innerHTML = `<div class="muted">Переопределений пока нет.</div>`;
      return;
    }
    optionOverridesList.innerHTML = state.optionOverrides.map((o) => {
      const meta = `min ${o.min_select ?? "-"} • max ${o.max_select ?? "-"} • ${o.selection_type || "-"}`;
      const title = `${productTitleById(o.product_id)} • ${groupTitleById(o.group_id)}`;
      return `
        <div class="options-row" data-override-id="${o.id}">
          <div>
            <div class="options-row-title">${escapeHtml(title)}</div>
            <div class="options-row-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="options-row-actions">
            <button class="btn btn-icon" type="button" data-action="edit"><i class="fas fa-pen"></i></button>
            <button class="btn btn-icon" type="button" data-action="delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    $$(".options-row[data-override-id]", optionOverridesList).forEach((row) => {
      row.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-action]");
        const id = Number(row.dataset.overrideId);
        const override = state.optionOverrides.find((o) => Number(o.id) === id);
        if (!override) return;

        if (action?.dataset.action === "edit") {
          e.stopPropagation();
          openOptionOverrideModal({ mode: "edit", override });
          return;
        }
        if (action?.dataset.action === "delete") {
          e.stopPropagation();
          if (!window.confirm("Удалить переопределение?")) return;
          await api(`/api/option-overrides/${id}`, { method: "DELETE" });
          await loadOptionOverrides();
          renderOptionOverrides();
        }
      });
    });
  }

  async function loadOptionsView() {
    await loadOptionGroups();
    await loadAllProductsForOptions();
    await loadOptionAssignments();
    await loadOptionExclusions();
    await loadOptionOverrides();

    const hasSelected = state.optionGroups.some((g) => Number(g.id) === Number(state.selectedOptionGroupId));
    if (!hasSelected) {
      state.selectedOptionGroupId = state.optionGroups.length ? Number(state.optionGroups[0].id) : null;
    }
    await loadOptionItems(state.selectedOptionGroupId);

    renderOptionGroups();
    renderOptionItems();
    renderOptionAssignments();
    renderOptionExclusions();
    renderOptionOverrides();
  }

  function openOptionGroupModal({ mode, group }) {
    if (!window.AppModal) return;
    const isEdit = mode === "edit";

    const content = `
      <form class="form-grid" id="optionGroupForm">
        <div>
          <label class="field-label">Название *</label>
          <input class="control" name="title" type="text" />
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Тип выбора</label>
            <select class="control" name="selection_type">
              <option value="single">single</option>
              <option value="multiple">multiple</option>
            </select>
          </div>
          <div>
            <label class="field-label">Sort</label>
            <input class="control" name="sort_order" type="number" step="1" />
          </div>
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Min</label>
            <input class="control" name="min_select" type="number" step="1" />
          </div>
          <div>
            <label class="field-label">Max</label>
            <input class="control" name="max_select" type="number" step="1" />
          </div>
        </div>
        <label class="switch">
          <input class="switch-input" type="checkbox" name="is_active" checked />
          <span class="switch-ui"></span>
          <span class="switch-text">Активна</span>
        </label>
      </form>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать группу" : "Новая группа",
      content,
      onSave: async ({ body }) => {
        const form = $("#optionGroupForm", body);
        if (!form) return false;
        const payload = {
          tenant_id: TENANT_ID,
          title: String(form.title.value || "").trim(),
          selection_type: form.selection_type.value,
          min_select: form.min_select.value === "" ? 0 : Number(form.min_select.value),
          max_select: form.max_select.value === "" ? 0 : Number(form.max_select.value),
          sort_order: form.sort_order.value === "" ? 0 : Number(form.sort_order.value),
          is_active: form.is_active.checked ? 1 : 0,
        };
        if (!payload.title) return false;
        if (isEdit && group) await api(`/api/option-groups/${group.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api(`/api/option-groups`, { method: "POST", body: JSON.stringify(payload) });
        await loadOptionsView();
        return true;
      },
    });

    const form = $("#optionGroupForm", window.AppModal.body);
    if (!form) return;
    if (isEdit && group) {
      form.title.value = group.title || "";
      form.selection_type.value = group.selection_type || "single";
      form.min_select.value = group.min_select ?? 0;
      form.max_select.value = group.max_select ?? 0;
      form.sort_order.value = group.sort_order ?? 0;
      form.is_active.checked = Boolean(group.is_active);
    }
  }

  function openOptionItemModal({ mode, item, groupId }) {
    if (!window.AppModal) return;
    if (!groupId) return alert("Сначала выберите группу");
    const isEdit = mode === "edit";

    const content = `
      <form class="form-grid" id="optionItemForm">
        <div>
          <label class="field-label">Название *</label>
          <input class="control" name="title" type="text" />
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Цена</label>
            <input class="control" name="price" type="number" step="0.01" />
          </div>
          <div>
            <label class="field-label">Режим цены</label>
            <select class="control" name="price_mode">
              <option value="fixed">fixed</option>
              <option value="delta">delta</option>
              <option value="from_target">from_target</option>
            </select>
          </div>
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
        <div>
          <label class="field-label">Sort</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
        <label class="switch">
          <input class="switch-input" type="checkbox" name="is_active" checked />
          <span class="switch-ui"></span>
          <span class="switch-text">Активен</span>
        </label>
      </form>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать элемент" : "Новый элемент",
      content,
      onSave: async ({ body }) => {
        const form = $("#optionItemForm", body);
        if (!form) return false;
        const payload = {
          tenant_id: TENANT_ID,
          title: String(form.title.value || "").trim(),
          price: form.price.value === "" ? 0 : Number(form.price.value),
          price_mode: form.price_mode.value,
          target_type: form.target_type.value,
          target_id: form.target_id.value === "" ? null : Number(form.target_id.value),
          sort_order: form.sort_order.value === "" ? 0 : Number(form.sort_order.value),
          is_active: form.is_active.checked ? 1 : 0,
        };
        if (!payload.title) return false;
        if (isEdit && item) await api(`/api/option-items/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api(`/api/option-groups/${groupId}/items`, { method: "POST", body: JSON.stringify(payload) });
        await loadOptionItems(groupId);
        renderOptionItems();
        return true;
      },
    });

    const form = $("#optionItemForm", window.AppModal.body);
    if (!form) return;
    if (isEdit && item) {
      form.title.value = item.title || "";
      form.price.value = item.price ?? 0;
      form.price_mode.value = item.price_mode || "fixed";
      form.target_type.value = item.target_type || "custom";
      form.target_id.value = item.target_id ?? "";
      form.sort_order.value = item.sort_order ?? 0;
      form.is_active.checked = Boolean(item.is_active);
    }
  }

  function openOptionAssignmentModal({ mode, assignment }) {
    if (!window.AppModal) return;
    const isEdit = mode === "edit";

    const categoryOptions = state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
    const productOptions = state.allProducts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    const groupOptions = state.optionGroups.map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join("");

    const content = `
      <form class="form-grid" id="optionAssignmentForm">
        <div>
          <label class="field-label">Группа *</label>
          <select class="control" name="group_id">${groupOptions}</select>
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Тип</label>
            <select class="control" name="assign_type">
              <option value="category">category</option>
              <option value="product">product</option>
            </select>
          </div>
          <div>
            <label class="field-label">Priority</label>
            <input class="control" name="priority" type="number" step="1" />
          </div>
        </div>
        <div class="form-row-2">
          <div data-role="assign-category">
            <label class="field-label">Категория</label>
            <select class="control" name="assign_category_id">${categoryOptions}</select>
          </div>
          <div data-role="assign-product" class="hidden">
            <label class="field-label">Товар</label>
            <select class="control" name="assign_product_id">${productOptions}</select>
          </div>
        </div>
        <div>
          <label class="field-label">Sort</label>
          <input class="control" name="sort_order" type="number" step="1" />
        </div>
        <label class="switch">
          <input class="switch-input" type="checkbox" name="is_active" checked />
          <span class="switch-ui"></span>
          <span class="switch-text">Активно</span>
        </label>
      </form>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать назначение" : "Новое назначение",
      content,
      onSave: async ({ body }) => {
        const form = $("#optionAssignmentForm", body);
        if (!form) return false;
        const assignType = form.assign_type.value;
        const assignId = assignType === "category" ? Number(form.assign_category_id.value) : Number(form.assign_product_id.value);
        const payload = {
          tenant_id: TENANT_ID,
          assign_type: assignType,
          assign_id: assignId,
          group_id: Number(form.group_id.value),
          priority: form.priority.value === "" ? 0 : Number(form.priority.value),
          sort_order: form.sort_order.value === "" ? 0 : Number(form.sort_order.value),
          is_active: form.is_active.checked ? 1 : 0,
        };
        if (!payload.assign_id || !payload.group_id) return false;
        if (isEdit && assignment) await api(`/api/option-assignments/${assignment.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api(`/api/option-assignments`, { method: "POST", body: JSON.stringify(payload) });
        await loadOptionAssignments();
        renderOptionAssignments();
        return true;
      },
    });

    const form = $("#optionAssignmentForm", window.AppModal.body);
    if (!form) return;
    const catWrap = $("[data-role=\"assign-category\"]", form);
    const prodWrap = $("[data-role=\"assign-product\"]", form);

    function syncAssignType(type) {
      catWrap.classList.toggle("hidden", type !== "category");
      prodWrap.classList.toggle("hidden", type !== "product");
    }

    form.assign_type.addEventListener("change", () => syncAssignType(form.assign_type.value));

    if (isEdit && assignment) {
      form.group_id.value = assignment.group_id;
      form.assign_type.value = assignment.assign_type;
      form.priority.value = assignment.priority ?? 0;
      form.sort_order.value = assignment.sort_order ?? 0;
      form.is_active.checked = Boolean(assignment.is_active);
      if (assignment.assign_type === "category") form.assign_category_id.value = assignment.assign_id;
      if (assignment.assign_type === "product") form.assign_product_id.value = assignment.assign_id;
      syncAssignType(assignment.assign_type);
    } else {
      syncAssignType(form.assign_type.value);
    }
  }

  function openOptionExclusionModal() {
    if (!window.AppModal) return;
    const groupOptions = state.optionGroups.map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join("");
    const productOptions = state.allProducts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const content = `
      <form class="form-grid" id="optionExclusionForm">
        <div>
          <label class="field-label">Товар *</label>
          <select class="control" name="product_id">${productOptions}</select>
        </div>
        <div>
          <label class="field-label">Группа *</label>
          <select class="control" name="group_id">${groupOptions}</select>
        </div>
      </form>
    `;

    window.AppModal.open({
      title: "Новое исключение",
      content,
      onSave: async ({ body }) => {
        const form = $("#optionExclusionForm", body);
        if (!form) return false;
        const payload = {
          tenant_id: TENANT_ID,
          product_id: Number(form.product_id.value),
          group_id: Number(form.group_id.value),
        };
        if (!payload.product_id || !payload.group_id) return false;
        await api(`/api/option-exclusions`, { method: "POST", body: JSON.stringify(payload) });
        await loadOptionExclusions();
        renderOptionExclusions();
        return true;
      },
    });
  }

  function openOptionOverrideModal({ mode, override }) {
    if (!window.AppModal) return;
    const isEdit = mode === "edit";
    const groupOptions = state.optionGroups.map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join("");
    const productOptions = state.allProducts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const content = `
      <form class="form-grid" id="optionOverrideForm">
        <div class="form-row-2">
          <div>
            <label class="field-label">Товар *</label>
            <select class="control" name="product_id">${productOptions}</select>
          </div>
          <div>
            <label class="field-label">Группа *</label>
            <select class="control" name="group_id">${groupOptions}</select>
          </div>
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Тип выбора</label>
            <select class="control" name="selection_type">
              <option value="">—</option>
              <option value="single">single</option>
              <option value="multiple">multiple</option>
            </select>
          </div>
          <div>
            <label class="field-label">Sort</label>
            <input class="control" name="sort_order" type="number" step="1" />
          </div>
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label">Min</label>
            <input class="control" name="min_select" type="number" step="1" />
          </div>
          <div>
            <label class="field-label">Max</label>
            <input class="control" name="max_select" type="number" step="1" />
          </div>
        </div>
      </form>
    `;

    window.AppModal.open({
      title: isEdit ? "Редактировать переопределение" : "Новое переопределение",
      content,
      onSave: async ({ body }) => {
        const form = $("#optionOverrideForm", body);
        if (!form) return false;
        const payload = {
          tenant_id: TENANT_ID,
          product_id: Number(form.product_id.value),
          group_id: Number(form.group_id.value),
          selection_type: form.selection_type.value || null,
          min_select: form.min_select.value === "" ? null : Number(form.min_select.value),
          max_select: form.max_select.value === "" ? null : Number(form.max_select.value),
          sort_order: form.sort_order.value === "" ? null : Number(form.sort_order.value),
        };
        if (!payload.product_id || !payload.group_id) return false;
        if (isEdit && override) await api(`/api/option-overrides/${override.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api(`/api/option-overrides`, { method: "POST", body: JSON.stringify(payload) });
        await loadOptionOverrides();
        renderOptionOverrides();
        return true;
      },
    });

    const form = $("#optionOverrideForm", window.AppModal.body);
    if (!form) return;
    if (isEdit && override) {
      form.product_id.value = override.product_id;
      form.group_id.value = override.group_id;
      form.selection_type.value = override.selection_type || "";
      form.min_select.value = override.min_select ?? "";
      form.max_select.value = override.max_select ?? "";
      form.sort_order.value = override.sort_order ?? "";
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
    if (state.mode === "products") {
      await refreshProductsOnly();
    }
    if (state.mode === "options") {
      await loadOptionsView();
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
        if (state.mode === "options") return openOptionGroupModal({ mode: "create" });
      });
    }

    if (optionGroupAddBtn) {
      optionGroupAddBtn.addEventListener("click", () => openOptionGroupModal({ mode: "create" }));
    }
    if (optionItemAddBtn) {
      optionItemAddBtn.addEventListener("click", () => openOptionItemModal({ mode: "create", groupId: state.selectedOptionGroupId }));
    }
    if (optionAssignmentAddBtn) {
      optionAssignmentAddBtn.addEventListener("click", () => openOptionAssignmentModal({ mode: "create" }));
    }
    if (optionExclusionAddBtn) {
      optionExclusionAddBtn.addEventListener("click", () => openOptionExclusionModal());
    }
    if (optionOverrideAddBtn) {
      optionOverrideAddBtn.addEventListener("click", () => openOptionOverrideModal({ mode: "create" }));
    }

    // left other views
    if (productsAccordion) {
      productsAccordion.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        const view = btn.getAttribute("data-view");
        state.mode = view;
        if (view === "products") {
          setToolbarTitle(getCurrentCategory()?.title || "Товары");
          showView("products");
          clearProductSelection();
        } else if (view === "categories") {
          enterCategoriesMode();
          renderCategoriesMainList();
        } else if (view === "options") {
          setToolbarTitle("Опции товара");
          showView("options");
          clearProductSelection();
          clearCategorySelection();
          await loadOptionsView();
        } else {
          setToolbarTitle(view);
          showView(view);
          clearProductSelection();
          clearCategorySelection();
        }
      });
    }

    if (closeProductInfoBtn) closeProductInfoBtn.addEventListener("click", clearProductSelection);
    if (closeCategoryInfoBtn) closeCategoryInfoBtn.addEventListener("click", clearCategorySelection);
    if (sheetCloseBtn) {
      sheetCloseBtn.addEventListener("click", () => {
        if (state.mode === "categories") clearCategorySelection();
        else clearProductSelection();
      });
    }
    if (sheetBackdrop) {
      sheetBackdrop.addEventListener("click", () => {
        if (state.mode === "categories") clearCategorySelection();
        else clearProductSelection();
      });
    }

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
      if (!isMobile && detailsDesktopHost) {
        if (productInfo && productInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(productInfo);
          closeSheet();
        }
        if (categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(categoryInfo);
          closeSheet();
        }
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
