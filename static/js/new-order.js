(function () {
  const categoriesListEl = document.getElementById("newOrderCategoriesList");
  const categoriesEmptyEl = document.getElementById("newOrderCategoriesEmpty");
  const productsGridEl = document.getElementById("newOrderProductsGrid");
  const productsEmptyEl = document.getElementById("newOrderProductsEmpty");
  if (!categoriesListEl || !productsGridEl) return;

  const state = {
    categories: [],
    activeCategoryId: null,
    quantities: new Map(),
    productVariants: new Map(),
    selectedVariants: new Map(),
    currentProducts: [],
    unitConversions: [],
    productIngredients: new Map(),
    ingredientStateByProduct: new Map(),
    productOptionGroups: new Map(),
    optionGroupDetails: new Map(),
    optionSelections: new Map(),
    optionTargetProductCache: new Map(),
  };

  async function apiJson(url, opts = {}) {
    const token = localStorage.getItem("authToken");
    const storeId = localStorage.getItem("activeStoreId") || "1";
    const headers = {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-store-id": storeId,
    };
    const res = await fetch(url, { method: opts.method || "GET", headers, body: opts.body });
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) throw new Error(data?.error || `API_ERROR_${res.status}`);
    return data;
  }

  function isCheckoutVisible(category) {
    if (!category || typeof category !== "object") return false;
    if (category.checkout_visibility === undefined || category.checkout_visibility === null) return true;
    return Number(category.checkout_visibility) !== 0;
  }

  function looksLikeUrl(value) {
    return /^(https?:)?\/\//i.test(value) || /^\/(static|uploads)\//i.test(value);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toMoney(value) {
    const n = Number(value || 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(safe))} ₽`;
  }

  function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getConversionFactor(fromUnitId, toUnitId) {
    if (!fromUnitId || !toUnitId) return null;
    if (Number(fromUnitId) === Number(toUnitId)) return 1;
    const direct = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(fromUnitId) && Number(c.to_unit_id) === Number(toUnitId) && Number(c.is_active) === 1
    );
    if (direct && Number(direct.factor)) return Number(direct.factor);
    const inverse = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(toUnitId) && Number(c.to_unit_id) === Number(fromUnitId) && Number(c.is_active) === 1
    );
    if (inverse && Number(inverse.factor)) return 1 / Number(inverse.factor);
    return null;
  }

  function getVariantUnitPriceByBase(product, variants, selectedIndex, basePriceRaw) {
    if (!product) return Number(basePriceRaw || 0);
    const basePrice = Number(basePriceRaw || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const selected = Number(selectedIndex);
    if (!Number.isFinite(selected)) return basePrice;

    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;

    const value = Array.isArray(group.values) ? group.values[selected] : null;
    const numericValue = parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;

    const factor = getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return basePrice;
    const qtyInBase = numericValue * Number(factor || 0);
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;

    let unitPrice = basePrice * (qtyInBase / baseQty);
    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selected);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) unitPrice = unitPrice * (1 - discountPercent / 100);
    return unitPrice;
  }

  function getQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  function calculateIngredientPriceDiff(productId) {
    const pid = Number(productId);
    const ingredients = state.productIngredients.get(pid) || [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    let currentTotal = 0;
    let baseTotal = 0;

    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const currentQty = Number(qtyMap.get(ingId) ?? ing.quantity ?? 1);
      const baseQty = Number(ing.quantity ?? 1);
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;

      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const currentItemTotal = currentQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * currentQtyInBase : 0;
      const baseItemTotal = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      currentTotal += currentItemTotal;
      baseTotal += baseItemTotal;
    });

    return currentTotal - baseTotal;
  }

  function getOptionGroupUiType(group) {
    if (!group) return "single";
    const selectionType = group.selection_type || "single";
    if (selectionType !== "multiple") return "single";
    const items = Array.isArray(group.items) ? group.items : [];
    const hasQtyControls = items.some((item) => Number(item?.qty_max ?? 1) > 1);
    return hasQtyControls ? "multiple_item" : "multiple_group";
  }

  function getOptionItemBasePrice(item) {
    if (!item) return 0;
    if (item.price != null && Number.isFinite(Number(item.price))) return Number(item.price);
    if (item.price_mode === "fixed") return Number(item.price_value || 0);
    return Number(item.product_price || 0);
  }

  async function ensureOptionTargetProducts(items) {
    const productIds = (Array.isArray(items) ? items : [])
      .map((item) => Number(item?.target_product_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0 && !state.optionTargetProductCache.has(id));
    const unique = [...new Set(productIds)];
    if (!unique.length) return;
    await Promise.all(unique.map(async (pid) => {
      try {
        const json = await apiJson(`/api/prod_products/${pid}`);
        const product = json?.data || null;
        state.optionTargetProductCache.set(pid, product);
      } catch {
        state.optionTargetProductCache.set(pid, null);
      }
    }));
  }

  function getOptionItemVariantUnitPrice(item, selectedIndex) {
    const fallbackPrice = getOptionItemBasePrice(item);
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return fallbackPrice;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return fallbackPrice;

    const numericValue = parseVariantValueNumber(values[idx]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackPrice;

    const productId = Number(item?.target_product_id || 0);
    const product = productId > 0 ? state.optionTargetProductCache.get(productId) : null;
    let unitPrice = null;

    if (product) {
      const basePrice = Number(product.price || 0);
      const baseUnitId = Number(product.base_unit_id || product.unit_id || variantGroup?.unit_id || 0);
      const baseQty = Number(product.base_qty || 1) || 1;
      const variantUnitId = Number(variantGroup?.unit_id || baseUnitId);
      if (basePrice > 0 && baseUnitId && variantUnitId) {
        const factor = getConversionFactor(variantUnitId, baseUnitId);
        if (factor != null) {
          const qtyInBase = numericValue * Number(factor || 0);
          if (Number.isFinite(qtyInBase) && qtyInBase > 0) {
            unitPrice = basePrice * (qtyInBase / baseQty);
          }
        }
      }
    }

    if (unitPrice == null) {
      const baseValue = parseVariantValueNumber(values[0]);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fallbackPrice;
      unitPrice = fallbackPrice * (numericValue / baseValue);
    }

    const tiers = Array.isArray(variantGroup?.discount_tiers) ? variantGroup.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === idx);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

  function getOptionItemDefaultVariantIndex(item) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const vg = variants[0];
    const values = Array.isArray(vg?.values) ? vg.values : [];
    if (!values.length) return null;
    const raw = vg?.default_value_index != null ? Number(vg.default_value_index) : 0;
    if (!Number.isFinite(raw) || raw < 0 || raw >= values.length) return 0;
    return raw;
  }

  function getOptionItemVariantDiff(item, selectedIdx) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const vg = variants[0];
    if (!vg || !Array.isArray(vg.values) || !vg.values.length) return 0;
    const unit = getOptionItemVariantUnitPrice(item, selectedIdx);
    return unit - getOptionItemBasePrice(item);
  }

  function applyQuickSingleOptionSelection(productId, groupId, itemId, variantIndexRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const productGroups = state.productOptionGroups.get(pid) || [];
    const baseGroup = Array.isArray(productGroups)
      ? productGroups.find((g) => Number(g?.group_id || g?.id || 0) === gid)
      : null;
    const details = state.optionGroupDetails.get(gid) || null;
    const groupObj = details?.group || baseGroup || null;
    const selectionType = String(groupObj?.selection_type || "single");
    if (selectionType === "multiple") return false;

    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const name = String(item?.name || item?.product_name || "");
    const basePrice = getOptionItemBasePrice(item);
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    const rawIdx = Number(variantIndexRaw);
    const defaultIdx = getOptionItemDefaultVariantIndex(item);
    let variantIndex = null;
    if (values.length) {
      const fallbackIdx = Number.isFinite(Number(defaultIdx)) ? Number(defaultIdx) : 0;
      const nextIdx = Number.isFinite(rawIdx) ? rawIdx : fallbackIdx;
      variantIndex = Math.max(0, Math.min(values.length - 1, nextIdx));
    }

    const next = {
      id: iid,
      label: name,
      qty: 1,
      basePrice,
      variantDiff: variantIndex != null ? getOptionItemVariantDiff(item, variantIndex) : 0,
    };
    if (variantIndex != null) next.variantIndex = variantIndex;

    byGroup.set(gid, { type: "single", items: [next] });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickMultiOptionToggle(productId, groupId, itemId) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const details = state.optionGroupDetails.get(gid) || null;
    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);

    if (idx >= 0) {
      currentItems.splice(idx, 1);
    } else {
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const defaultIdx = getOptionItemDefaultVariantIndex(item);
      const next = { id: iid, label: name, qty: 1, basePrice, variantDiff: 0 };
      if (Number.isFinite(Number(defaultIdx))) {
        const vi = Number(defaultIdx);
        next.variantIndex = vi;
        next.variantDiff = getOptionItemVariantDiff(item, vi);
      }
      currentItems.push(next);
    }

    byGroup.set(gid, { type: "multiple_group", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickMultiOptionQtyAdjust(productId, groupId, itemId, deltaRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    const delta = Number(deltaRaw || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0 || !Number.isFinite(delta) || delta === 0) return false;

    const details = state.optionGroupDetails.get(gid) || null;
    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const groupType = getOptionGroupUiType({ ...(details?.group || {}), items: detailItems });
    if (groupType !== "multiple_item") return false;

    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);
    const qMinRaw = Number(item?.qty_min ?? 0);
    const qMin = Number.isFinite(qMinRaw) ? Math.max(0, qMinRaw) : 0;
    const qMaxRaw = Number(item?.qty_max ?? 99);
    const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;

    if (idx < 0) {
      if (delta < 0) return true;
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const defaultIdx = getOptionItemDefaultVariantIndex(item);
      let nextQty = Math.max(qMin, delta);
      nextQty = Math.max(0, Math.min(qMax, nextQty));
      if (nextQty <= 0) return true;
      const next = { id: iid, label: name, qty: nextQty, basePrice, variantDiff: 0 };
      if (Number.isFinite(Number(defaultIdx))) {
        const vi = Number(defaultIdx);
        next.variantIndex = vi;
        next.variantDiff = getOptionItemVariantDiff(item, vi);
      }
      currentItems.push(next);
    } else {
      const currentQty = Math.max(0, Number(currentItems[idx]?.qty || 0));
      let nextQty = currentQty + delta;
      nextQty = Math.max(0, Math.min(qMax, nextQty));
      if (nextQty <= 0) {
        currentItems.splice(idx, 1);
      } else {
        currentItems[idx].qty = Math.max(qMin, nextQty);
        if (!Number.isFinite(Number(currentItems[idx].basePrice))) {
          currentItems[idx].basePrice = getOptionItemBasePrice(item);
        }
      }
    }

    byGroup.set(gid, { type: "multiple_item", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickOptionVariantSelection(productId, groupId, itemId, variantIndexRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const productGroups = state.productOptionGroups.get(pid) || [];
    const baseGroup = Array.isArray(productGroups)
      ? productGroups.find((g) => Number(g?.group_id || g?.id || 0) === gid)
      : null;
    const details = state.optionGroupDetails.get(gid) || null;
    const groupObj = details?.group || baseGroup || null;
    const selectionType = String(groupObj?.selection_type || "single");
    const isMultiple = selectionType === "multiple";

    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    if (!values.length) return false;

    const rawIdx = Number(variantIndexRaw);
    const fallbackIdx = Number.isFinite(Number(getOptionItemDefaultVariantIndex(item))) ? Number(getOptionItemDefaultVariantIndex(item)) : 0;
    const nextIdx = Number.isFinite(rawIdx) ? rawIdx : fallbackIdx;
    const variantIndex = Math.max(0, Math.min(values.length - 1, nextIdx));

    if (!isMultiple) {
      return applyQuickSingleOptionSelection(pid, gid, iid, variantIndex);
    }

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);
    if (idx < 0) {
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const next = {
        id: iid,
        label: name,
        qty: 1,
        basePrice,
        variantIndex,
        variantDiff: getOptionItemVariantDiff(item, variantIndex),
      };
      currentItems.push(next);
    } else {
      currentItems[idx].variantIndex = variantIndex;
      currentItems[idx].variantDiff = getOptionItemVariantDiff(item, variantIndex);
      currentItems[idx].qty = Math.max(1, Number(currentItems[idx].qty || 0));
      if (!Number.isFinite(Number(currentItems[idx].basePrice))) {
        currentItems[idx].basePrice = getOptionItemBasePrice(item);
      }
    }

    byGroup.set(gid, { type: "multiple_group", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function calculateOptionPriceDiff(productId) {
    const pid = Number(productId || 0);
    const byGroup = state.optionSelections.get(pid);
    if (!(byGroup instanceof Map) || byGroup.size === 0) return 0;
    let total = 0;
    for (const entry of byGroup.values()) {
      const selections = Array.isArray(entry?.items) ? entry.items : [];
      for (const s of selections) {
        const qty = Math.max(0, Number(s?.qty || 0));
        const basePrice = Number(s?.basePrice || 0);
        const variantDiff = Number(s?.variantDiff || 0);
        total += (basePrice + variantDiff) * qty;
      }
    }
    return total;
  }

  function getProductPhoto(product) {
    if (Array.isArray(product?.photos) && product.photos.length) return String(product.photos[0] || "").trim();
    if (Array.isArray(product?.photos_json) && product.photos_json.length) return String(product.photos_json[0] || "").trim();
    if (typeof product?.photos_json === "string" && product.photos_json.trim()) {
      try {
        const parsed = JSON.parse(product.photos_json);
        if (Array.isArray(parsed) && parsed.length) return String(parsed[0] || "").trim();
      } catch {}
    }
    return "";
  }

  function renderCategoryIcon(icon) {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      return `<span class="stage-icon"><img src="${escapeHtml(v)}" alt="" /></span>`;
    }
    const cls = v || "fas fa-folder";
    return `<span class="stage-icon"><i class="${escapeHtml(cls)}"></i></span>`;
  }

  function renderCategories() {
    categoriesListEl.innerHTML = "";
    const rows = Array.isArray(state.categories) ? state.categories : [];
    if (!rows.length) {
      if (categoriesEmptyEl) categoriesEmptyEl.classList.remove("hidden");
      return;
    }
    if (categoriesEmptyEl) categoriesEmptyEl.classList.add("hidden");

    rows.forEach((cat) => {
      const isActive = Number(cat.id) === Number(state.activeCategoryId);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `stage-item ${isActive ? "is-active" : ""}`;
      row.setAttribute("data-category-id", String(cat.id));
      row.innerHTML = `
        ${renderCategoryIcon(cat.icon)}
        <span class="stage-meta stage-text"><b>${escapeHtml(cat.title || "Категория")}</b></span>
        <span class="acc-spacer"></span>
      `;
      categoriesListEl.appendChild(row);
    });
  }

  function renderProducts(products) {
    const prevScrollByProduct = new Map();
    Array.from(productsGridEl.querySelectorAll("[data-product-id]")).forEach((card) => {
      const pid = Number(card.getAttribute("data-product-id") || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      const snapshot = {
        optionsRow: 0,
        optionGroups: new Map(),
        optionVariants: new Map(),
      };
      const optionsRow = card.querySelector(".new-order-options");
      if (optionsRow && optionsRow.scrollWidth > optionsRow.clientWidth) {
        snapshot.optionsRow = optionsRow.scrollLeft;
      }
      card.querySelectorAll(".new-order-option-scroll[data-group-id]").forEach((row) => {
        const gid = Number(row.getAttribute("data-group-id") || 0);
        if (!Number.isFinite(gid) || gid <= 0) return;
        if (row.scrollWidth > row.clientWidth) snapshot.optionGroups.set(gid, row.scrollLeft);
      });
      card.querySelectorAll(".new-order-option-tile-variants[data-group-id][data-item-id]").forEach((row) => {
        const gid = Number(row.getAttribute("data-group-id") || 0);
        const iid = Number(row.getAttribute("data-item-id") || 0);
        if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return;
        if (row.scrollWidth > row.clientWidth) snapshot.optionVariants.set(`${gid}:${iid}`, row.scrollLeft);
      });
      prevScrollByProduct.set(pid, snapshot);
    });

    productsGridEl.innerHTML = "";
    const list = Array.isArray(products) ? products : [];

    if (!list.length) {
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Товаров в категории пока нет";
        productsEmptyEl.classList.remove("hidden");
      }
      return;
    }
    if (productsEmptyEl) productsEmptyEl.classList.add("hidden");

    const restoreQueue = [];
    list.forEach((product) => {
      const pid = Number(product?.id || 0);
      const qty = Number(state.quantities.get(pid) || 0);
      const photoUrl = getProductPhoto(product);
      const selectedIndex = Number(state.selectedVariants.get(pid));
      const variants = state.productVariants.get(pid) || [];
      const ingredientDiff = calculateIngredientPriceDiff(pid);
      const optionDiff = calculateOptionPriceDiff(pid);
      const price = getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.price || 0)) + ingredientDiff + optionDiff;
      const oldPrice = getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.old_price || 0)) + ingredientDiff + optionDiff;
      const hasOldPrice = Number.isFinite(oldPrice) && oldPrice > 0 && oldPrice > price;
      const variantChips = getVariantChipsForProduct(pid);
      const ingredientRows = getIngredientRowsForProduct(pid);
      const optionRows = getOptionRowsForProduct(pid);

      const card = document.createElement("article");
      card.className = "new-order-product-card";
      card.setAttribute("data-product-id", String(pid));
      card.innerHTML = `
        <div class="new-order-product-photo-wrap">
          ${photoUrl ? `<img class="new-order-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<div class="new-order-product-photo-placeholder"><i class="fas fa-image\"></i></div>`}
        </div>
        <div class="new-order-product-main">
          <div class="new-order-product-title" title="${escapeHtml(product?.name || "Товар")}">${escapeHtml(product?.name || "Товар")}</div>
          ${variantChips.length ? `<div class="new-order-product-variants no-scrollbar">${variantChips.map((chip) => `<button class="new-order-variant-chip${chip.isSelected ? " is-selected" : ""}" type="button" data-action="variant-select" data-variant-index="${chip.index}" title="${escapeHtml(chip.label)}">${escapeHtml(chip.label)}</button>`).join("")}</div>` : ""}
          ${ingredientRows.length ? `<div class="new-order-ingredients">${ingredientRows.join("")}</div>` : ""}
        </div>
        ${optionRows.length ? `<div class="new-order-options">${optionRows.join("")}</div>` : ""}
        <div class="new-order-product-bottom">
          <div class="qty-pill qty-pill--muted" data-qty-wrap>
            <button class="qty-pill__btn qty-pill__btn--minus" type="button" data-action="qty-minus">−</button>
            <span class="qty-pill__center" data-qty-value>${qty}</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="qty-plus">+</button>
          </div>
          <button class="new-order-add-btn" type="button" title="Добавить в заказ">
            <span class="new-order-add-old ${hasOldPrice ? "" : "hidden"}">${hasOldPrice ? escapeHtml(toMoney(oldPrice)) : ""}</span>
            <span class="new-order-add-price">${escapeHtml(toMoney(price))}</span>
            <span class="new-order-add-plus">+</span>
          </button>
        </div>
      `;
      const prev = prevScrollByProduct.get(pid);
      if (prev) restoreQueue.push({ pid, prev });
      productsGridEl.appendChild(card);
    });

    if (restoreQueue.length) {
      requestAnimationFrame(() => {
        restoreQueue.forEach(({ pid, prev }) => {
          const card = productsGridEl.querySelector(`[data-product-id="${pid}"]`);
          if (!card) return;
          const optionsRow = card.querySelector(".new-order-options");
          if (optionsRow && prev.optionsRow > 0) optionsRow.scrollLeft = prev.optionsRow;

          card.querySelectorAll(".new-order-option-scroll[data-group-id]").forEach((row) => {
            const gid = Number(row.getAttribute("data-group-id") || 0);
            if (!Number.isFinite(gid) || gid <= 0) return;
            const left = prev.optionGroups.get(gid);
            if (left != null) row.scrollLeft = left;
          });

          card.querySelectorAll(".new-order-option-tile-variants[data-group-id][data-item-id]").forEach((row) => {
            const gid = Number(row.getAttribute("data-group-id") || 0);
            const iid = Number(row.getAttribute("data-item-id") || 0);
            if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return;
            const left = prev.optionVariants.get(`${gid}:${iid}`);
            if (left != null) row.scrollLeft = left;
          });
        });
      });
    }
  }

  function getIngredientRowsForProduct(productId) {
    const pid = Number(productId);
    const ingredients = state.productIngredients.get(pid) || [];
    if (!ingredients.length) return [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();

    return ingredients.map((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      const canMinus = currentQty > min;
      const canPlus = currentQty < max;

      return `
        <div class="new-order-ingredient-row">
          <div class="new-order-ingredient-name" title="${escapeHtml(ing.ingredient_name || "")}">${escapeHtml(ing.ingredient_name || "")}</div>
          <div class="new-order-ingredient-controls">
            <button class="new-order-ingredient-btn${canMinus ? "" : " is-disabled"}" type="button" data-action="ingredient-minus" data-ingredient-id="${ingId}">−</button>
            <span class="new-order-ingredient-qty">${escapeHtml(String(currentQty))} ${escapeHtml(unitLabel)}</span>
            <button class="new-order-ingredient-btn${canPlus ? "" : " is-disabled"}" type="button" data-action="ingredient-plus" data-ingredient-id="${ingId}">+</button>
          </div>
        </div>
      `;
    });
  }

  function getOptionRowsForProduct(productId) {
    const pid = Number(productId);
    const groups = state.productOptionGroups.get(pid) || [];
    if (!Array.isArray(groups) || !groups.length) return [];
    const selectedByGroup = state.optionSelections.get(pid) || new Map();

    return groups.map((group) => {
      const groupId = Number(group?.group_id || group?.id || 0);
      const title = String(group?.title || "Опция").trim();
      const selected = selectedByGroup.get(groupId);
      const selectedItems = Array.isArray(selected?.items) ? selected.items : [];
      let selectedLabel = "";
      if (selectedItems.length === 1) selectedLabel = String(selectedItems[0]?.label || "").trim();
      else if (selectedItems.length > 1) selectedLabel = `Выбрано: ${selectedItems.length}`;
      const details = state.optionGroupDetails.get(groupId);
      const detailsGroup = details?.group || null;
      const selectionType = String(detailsGroup?.selection_type || group?.selection_type || "single");
      const isSingle = selectionType !== "multiple";
      const isMultiple = selectionType === "multiple";
      const isRequiredRaw = detailsGroup?.is_required ?? group?.is_required ?? false;
      const isRequired = Number(isRequiredRaw) === 1 || isRequiredRaw === true || String(isRequiredRaw).toLowerCase() === "true";
      const detailItems = Array.isArray(details?.items) ? details.items : [];
      const groupType = getOptionGroupUiType({ ...(detailsGroup || group || {}), items: detailItems });
      const isMultipleItem = groupType === "multiple_item";
      const selectedIds = new Set(selectedItems.map((s) => Number(s?.id || 0)).filter((x) => Number.isFinite(x) && x > 0));
      const selectedByItemId = new Map(
        selectedItems
          .map((s) => [Number(s?.id || 0), s])
          .filter(([id]) => Number.isFinite(id) && id > 0)
      );
      const shouldShowAddCard = isSingle && !isRequired && selectedItems.length === 0;
      const onlySelectedSingleOptional = isSingle && !isRequired && selectedItems.length > 0;
      const renderItems = onlySelectedSingleOptional
        ? detailItems.filter((item) => selectedIds.has(Number(item?.id || 0)))
        : detailItems;
      const tiles = shouldShowAddCard
        ? `
          <button class="new-order-option-tile new-order-option-tile--add" type="button" data-action="option-open" data-group-id="${groupId}" title="Добавить опцию">
            <span class="new-order-option-add-plus">+</span>
          </button>
        `
        : renderItems.length
        ? renderItems.map((item) => {
            const itemId = Number(item?.id || 0);
            const isSelected = selectedIds.has(itemId);
            const name = String(item?.name || item?.product_name || "Позиция");
            const selectedEntry = selectedByItemId.get(itemId) || null;
            const selectedQty = Math.max(0, Number(selectedEntry?.qty || 0));
            const variants = Array.isArray(item?.variants) ? item.variants : [];
            const variantGroup = variants[0];
            const variantValues = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
            const defaultVariantIndex = getOptionItemDefaultVariantIndex(item);
            const activeVariantIndex = Number.isFinite(Number(selectedEntry?.variantIndex))
              ? Number(selectedEntry.variantIndex)
              : defaultVariantIndex;
            const optionPrice = getOptionItemBasePrice(item)
              + (Number.isFinite(Number(activeVariantIndex)) ? getOptionItemVariantDiff(item, Number(activeVariantIndex)) : 0);
            const qMaxRaw = Number(item?.qty_max ?? 99);
            const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
            const qtyControlsHtml = isMultipleItem
              ? `<div class="new-order-option-tile-qty">
                   <button class="new-order-option-tile-qty-btn${selectedQty <= 0 ? " is-disabled" : ""}" type="button" data-action="option-quick-qty-minus" data-group-id="${groupId}" data-item-id="${itemId}">−</button>
                   <span class="new-order-option-tile-qty-value">${selectedQty}</span>
                   <button class="new-order-option-tile-qty-btn${selectedQty >= qMax ? " is-disabled" : ""}" type="button" data-action="option-quick-qty-plus" data-group-id="${groupId}" data-item-id="${itemId}">+</button>
                 </div>`
              : "";
            const variantsHtml = !isMultipleItem && variantValues.length && (isSelected || isMultiple)
              ? `<div class="new-order-option-tile-variants no-scrollbar" data-group-id="${groupId}" data-item-id="${itemId}">${variantValues
                  .map((v, idx) => `<span class="new-order-option-tile-variant ${idx === activeVariantIndex ? "is-selected" : ""}" data-action="option-quick-variant" data-group-id="${groupId}" data-item-id="${itemId}" data-variant-index="${idx}" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</span>`)
                  .join("")}</div>`
              : "";
            const tileAction = isMultiple ? (isMultipleItem ? "option-open" : "option-quick-toggle") : "option-open";
            if (isMultipleItem) {
              return `
                <div class="new-order-option-tile${isSelected ? " is-selected" : ""}" data-group-id="${groupId}" data-item-id="${itemId}" title="${escapeHtml(name)}">
                  <span class="new-order-option-tile-name">${escapeHtml(name)}</span>
                  <span class="new-order-option-tile-price">${escapeHtml(toMoney(optionPrice))}</span>
                  ${qtyControlsHtml}
                </div>
              `;
            }
            return `
              <button class="new-order-option-tile${isSelected ? " is-selected" : ""}" type="button" data-action="${tileAction}" data-group-id="${groupId}" data-item-id="${itemId}" title="${escapeHtml(name)}">
                <span class="new-order-option-tile-name">${escapeHtml(name)}</span>
                <span class="new-order-option-tile-price">${escapeHtml(toMoney(optionPrice))}</span>
                ${variantsHtml}
              </button>
            `;
          }).join("")
        : `
          <button class="new-order-option-tile is-placeholder" type="button" data-action="option-open" data-group-id="${groupId}" title="${escapeHtml(title)}">
            <span class="new-order-option-tile-name">${selectedLabel ? escapeHtml(selectedLabel) : "Выбрать"}</span>
            <span class="new-order-option-tile-edit">Изменить &gt;</span>
          </button>
        `;
      return `
        <div class="new-order-option-block">
          <div class="new-order-option-title">${escapeHtml(title)}</div>
          <div class="new-order-option-scroll no-scrollbar" data-group-id="${groupId}">${tiles}</div>
        </div>
      `;
    });
  }

  async function loadOptionGroupDetails(groupId) {
    const gid = Number(groupId || 0);
    if (!Number.isFinite(gid) || gid <= 0) return { group: null, items: [] };
    if (state.optionGroupDetails.has(gid)) return state.optionGroupDetails.get(gid);
    try {
      const json = await apiJson(`/api/public/options/groups/${gid}`);
      const data = json && typeof json.data === "object" && json.data ? json.data : { group: null, items: [] };
      const normalized = {
        group: data.group || null,
        items: Array.isArray(data.items) ? data.items : [],
      };
      state.optionGroupDetails.set(gid, normalized);
      return normalized;
    } catch {
      const fallback = { group: null, items: [] };
      state.optionGroupDetails.set(gid, fallback);
      return fallback;
    }
  }

  function getOptionOverlayElements() {
    const backdrop = document.getElementById("newOrderOptionOverlay");
    const title = document.getElementById("newOrderOptionOverlayTitle");
    const list = document.getElementById("newOrderOptionOverlayList");
    return { backdrop, title, list };
  }

  function ensureOptionOverlay() {
    if (document.getElementById("newOrderOptionOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderOptionOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="option-overlay-close"><i class="fas fa-arrow-left"></i></button>
          <div class="new-order-option-sheet-title" id="newOrderOptionOverlayTitle">Опция</div>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar" id="newOrderOptionOverlayList"></div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function closeOptionOverlay() {
    const { backdrop, list } = getOptionOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
    if (list) list.innerHTML = "";
  }

  async function openOptionOverlay(productId, groupId, fallbackTitle) {
    ensureOptionOverlay();
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0) return;
    const { backdrop, title, list } = getOptionOverlayElements();
    if (!backdrop || !title || !list) return;

    title.textContent = String(fallbackTitle || "Опция");
    list.innerHTML = `<div class="new-order-option-sheet-empty">Загрузка...</div>`;
    backdrop.classList.remove("hidden");

    const details = await loadOptionGroupDetails(gid);
    const group = details?.group || null;
    const sheetTitle = String(group?.title || fallbackTitle || "Опция");
    title.textContent = sheetTitle;
    const items = Array.isArray(details?.items) ? details.items : [];
    await ensureOptionTargetProducts(items);
    const groupType = getOptionGroupUiType({ ...(group || {}), items });

    const byGroup = state.optionSelections.get(pid) || new Map();
    const existing = byGroup.get(gid);
    const selectionItems = Array.isArray(existing?.items) ? existing.items.map((x) => ({ ...x })) : [];
    const selById = new Map(selectionItems.map((x) => [Number(x.id), x]));
    const expandedItemVariants = new Set();

    function itemVariantDiff(item, selectedIdx) {
      return getOptionItemVariantDiff(item, selectedIdx);
    }

    function ensureDefaultSelection() {
      if (groupType === "single" && (!selectionItems.length && group?.is_required) && items.length) {
        const first = items[0];
        const label = String(first?.name || first?.product_name || "");
        const next = { id: Number(first.id), label, qty: 1, basePrice: getOptionItemBasePrice(first), variantDiff: 0 };
        selectionItems.push(next);
        selById.set(next.id, next);
      }
    }
    ensureDefaultSelection();

    function syncSelectionToState() {
      const nextByGroup = state.optionSelections.get(pid) || new Map();
      nextByGroup.set(gid, {
        type: groupType,
        items: selectionItems.filter((x) => Number(x.qty || 0) > 0),
      });
      state.optionSelections.set(pid, nextByGroup);
      renderProducts(state.currentProducts);
    }

    function renderList() {
      if (!items.length) {
        list.innerHTML = `<div class="new-order-option-sheet-empty">В этой опции нет позиций</div>`;
        return;
      }
      list.innerHTML = items.map((item) => {
        const itemId = Number(item?.id || 0);
        const selected = selById.get(itemId);
        const selectedQty = Math.max(0, Number(selected?.qty || 0));
        const isSelected = selectedQty > 0;
        const photos = Array.isArray(item?.product_photos_json) ? item.product_photos_json : [];
        const photo = photos.length ? String(photos[0] || "").trim() : "";
        const name = String(item?.name || item?.product_name || "Позиция");
        const defaultVariantIndex = getOptionItemDefaultVariantIndex(item);
        const activeVariantIndex = Number.isFinite(Number(selected?.variantIndex)) ? Number(selected.variantIndex) : defaultVariantIndex;
        const basePrice = getOptionItemBasePrice(item);
        const variantDiff = Number.isFinite(Number(selected?.variantDiff))
          ? Number(selected.variantDiff)
          : (Number.isFinite(Number(activeVariantIndex)) ? itemVariantDiff(item, activeVariantIndex) : 0);
        const rowPrice = basePrice + variantDiff;
        const hasVariants = Array.isArray(item?.variants) && item.variants.length && Array.isArray(item.variants[0]?.values) && item.variants[0].values.length;
        const variantBlockOpen = expandedItemVariants.has(itemId);
        const variants = hasVariants ? item.variants[0].values : [];
        const selectedVariantIndex = Number.isFinite(Number(activeVariantIndex)) ? Number(activeVariantIndex) : 0;
        const controls = groupType === "multiple_item"
          ? `<div class="new-order-opt-qty">
               <button type="button" class="new-order-opt-qty-btn" data-action="opt-qty-minus" data-item-id="${itemId}">−</button>
               <span class="new-order-opt-qty-value">${selectedQty}</span>
               <button type="button" class="new-order-opt-qty-btn is-plus" data-action="opt-qty-plus" data-item-id="${itemId}">+</button>
             </div>`
          : (groupType === "single"
              ? ``
              : `<button type="button" class="new-order-opt-check ${isSelected ? "is-selected" : ""}" data-action="opt-toggle-item" data-item-id="${itemId}"></button>`);
        const rowAction = hasVariants ? `data-action="opt-variants-toggle" data-item-id="${itemId}"` : "";

        return `
          <div class="new-order-option-sheet-card ${isSelected ? "is-selected" : ""}">
            <div class="new-order-option-sheet-item-row" ${rowAction}>
              <span class="new-order-option-sheet-item-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : `<i class="fas fa-image"></i>`}</span>
              <span class="new-order-option-sheet-item-main">
                <span class="new-order-option-sheet-item-title">${escapeHtml(name)}</span>
                <span class="new-order-option-sheet-item-meta">${escapeHtml(toMoney(rowPrice))}</span>
              </span>
              <button type="button" class="new-order-opt-gear ${hasVariants ? "" : "is-disabled"}" data-action="opt-variants-toggle" data-item-id="${itemId}"><i class="fas fa-cog"></i></button>
              ${controls}
            </div>
            ${hasVariants && variantBlockOpen ? `<div class="new-order-opt-variants-row">${variants.map((v, idx) => `<button type="button" class="new-order-opt-variant-btn ${idx === selectedVariantIndex ? "is-selected" : ""}" data-action="opt-variant-select" data-item-id="${itemId}" data-variant-index="${idx}">${escapeHtml(String(v))}</button>`).join("")}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    renderList();

    backdrop.onclick = (e) => {
      const closeBtn = e.target.closest("[data-action='option-overlay-close']");
      if (closeBtn || e.target === backdrop) {
        closeOptionOverlay();
        return;
      }
      const targetBtn = e.target.closest("[data-action]");
      if (!targetBtn) return;
      const action = targetBtn.getAttribute("data-action");
      const itemId = Number(targetBtn.getAttribute("data-item-id") || 0);
      const item = items.find((x) => Number(x?.id || 0) === itemId);
      if (!item || !Number.isFinite(itemId) || itemId <= 0) return;
      const name = String(item?.name || item?.product_name || "Позиция");
      const entry = selById.get(itemId) || { id: itemId, label: name, qty: 0, basePrice: getOptionItemBasePrice(item), variantDiff: 0 };
      if (!Number.isFinite(Number(entry.variantIndex))) {
        const dIdx = getOptionItemDefaultVariantIndex(item);
        if (Number.isFinite(Number(dIdx))) {
          entry.variantIndex = Number(dIdx);
          entry.variantDiff = itemVariantDiff(item, Number(dIdx));
        }
      }

      if (action === "opt-variants-toggle") {
        if (targetBtn.classList.contains("is-disabled")) return;
        if (expandedItemVariants.has(itemId)) expandedItemVariants.delete(itemId);
        else expandedItemVariants.add(itemId);
        renderList();
        return;
      }
      if (action === "opt-variant-select") {
        const idx = Number(targetBtn.getAttribute("data-variant-index") || 0);
        const currentIdx = Number.isFinite(Number(entry.variantIndex)) ? Number(entry.variantIndex) : null;
        const isSecondClickSameVariant = currentIdx != null && currentIdx === idx && Number(entry.qty || 0) > 0;
        entry.variantIndex = idx;
        entry.variantDiff = itemVariantDiff(item, idx);
        entry.qty = Math.max(1, Number(entry.qty || 0));
        selById.set(itemId, entry);
        if (isSecondClickSameVariant) {
          const nextItemsBeforeClose = [];
          for (const value of selById.values()) {
            if (Number(value.qty || 0) > 0) nextItemsBeforeClose.push(value);
          }
          if (groupType === "single" && nextItemsBeforeClose.length > 1) {
            const keep = nextItemsBeforeClose[nextItemsBeforeClose.length - 1];
            selById.clear();
            selById.set(keep.id, keep);
            selectionItems.splice(0, selectionItems.length, keep);
          } else {
            selectionItems.splice(0, selectionItems.length, ...nextItemsBeforeClose);
          }
          syncSelectionToState();
          closeOptionOverlay();
          return;
        }
      } else if (action === "opt-toggle-item") {
        if (groupType === "single") {
          selById.clear();
          selectionItems.splice(0, selectionItems.length);
          entry.qty = 1;
          selById.set(itemId, entry);
        } else {
          if (Number(entry.qty || 0) > 0) entry.qty = 0;
          else entry.qty = 1;
          selById.set(itemId, entry);
        }
      } else if (action === "opt-qty-minus") {
        const qMin = Math.max(0, Number(item?.qty_min ?? 0));
        const next = Math.max(qMin, Number(entry.qty || 0) - 1);
        entry.qty = next;
        selById.set(itemId, entry);
      } else if (action === "opt-qty-plus") {
        const qMaxRaw = Number(item?.qty_max ?? 99);
        const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
        entry.qty = Math.min(qMax, Number(entry.qty || 0) + 1);
        selById.set(itemId, entry);
      } else {
        return;
      }

      const nextItems = [];
      for (const value of selById.values()) {
        if (Number(value.qty || 0) > 0) nextItems.push(value);
      }
      if (groupType === "single" && nextItems.length > 1) {
        const keep = nextItems[nextItems.length - 1];
        selById.clear();
        selById.set(keep.id, keep);
        selectionItems.splice(0, selectionItems.length, keep);
      } else {
        selectionItems.splice(0, selectionItems.length, ...nextItems);
      }
      syncSelectionToState();
      renderList();
    };
  }

  function toVariantLabel(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    if (typeof value === "object") {
      const raw = value.label ?? value.value ?? value.title ?? "";
      return String(raw).trim();
    }
    return "";
  }

  function getVariantChipsForProduct(productId) {
    const groups = state.productVariants.get(Number(productId));
    if (!Array.isArray(groups) || !groups.length) return [];

    const chips = [];
    const selectedIndex = Number(state.selectedVariants.get(Number(productId)));
    for (const group of groups) {
      const values = Array.isArray(group?.values) ? group.values : [];
      const defaultIndex = Number.isFinite(Number(group?.default_value_index)) ? Number(group.default_value_index) : -1;
      values.forEach((value, index) => {
        const label = toVariantLabel(value);
        if (!label) return;
        chips.push({
          label,
          index,
          isSelected: Number.isFinite(selectedIndex) ? index === selectedIndex : index === defaultIndex,
        });
      });
    }
    return chips.slice(0, 60);
  }

  async function loadVariantsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productVariants.has(id));
    if (!missingIds.length) return;

    await Promise.all(
      missingIds.map(async (id) => {
        try {
          const json = await apiJson(`/api/admin/products/${id}/variants`);
          const variants = Array.isArray(json?.data) ? json.data : [];
          state.productVariants.set(id, variants);
          if (!state.selectedVariants.has(id) && variants.length) {
            const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
            const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
            const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
            state.selectedVariants.set(id, safeDefault);
          }
        } catch {
          state.productVariants.set(id, []);
        }
      })
    );
  }

  async function loadIngredientsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productIngredients.has(id));
    if (!missingIds.length) return;

    try {
      const json = await apiJson("/api/public/products/batch/ingredients", {
        method: "POST",
        body: JSON.stringify({ ids: missingIds }),
      });
      const data = json && typeof json.data === "object" && json.data ? json.data : {};

      missingIds.forEach((id) => {
        const list = Array.isArray(data[String(id)]) ? data[String(id)] : [];
        state.productIngredients.set(id, list);
        if (!state.ingredientStateByProduct.has(id)) {
          const qtyMap = new Map();
          list.forEach((ing) => {
            const ingId = Number(ing?.ingredient_id || 0);
            if (!Number.isFinite(ingId) || ingId <= 0) return;
            const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
            const defaultQty = Number(ing.quantity ?? 1);
            const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
            const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
            const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
            const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
            let initialQty = Math.max(min, Math.min(max, defaultQty));
            if (step > 0) {
              const stepsFromMin = Math.round((initialQty - min) / step);
              initialQty = min + (stepsFromMin * step);
              initialQty = Math.max(min, Math.min(max, initialQty));
            }
            qtyMap.set(ingId, initialQty);
          });
          state.ingredientStateByProduct.set(id, qtyMap);
        }
      });
    } catch {
      missingIds.forEach((id) => {
        state.productIngredients.set(id, []);
      });
    }
  }

  async function loadOptionsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productOptionGroups.has(id));
    if (!missingIds.length) return;
    try {
      const json = await apiJson("/api/public/products/batch/option-assignments", {
        method: "POST",
        body: JSON.stringify({ ids: missingIds }),
      });
      const data = json && typeof json.data === "object" && json.data ? json.data : {};
      missingIds.forEach((id) => {
        const rows = Array.isArray(data[String(id)]) ? data[String(id)] : [];
        state.productOptionGroups.set(id, rows);
      });
    } catch {
      missingIds.forEach((id) => {
        state.productOptionGroups.set(id, []);
      });
    }
  }

  async function loadOptionDetailsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const groupIds = [];
    ids.forEach((pid) => {
      const groups = state.productOptionGroups.get(pid) || [];
      groups.forEach((g) => {
        const gid = Number(g?.group_id || g?.id || 0);
        if (Number.isFinite(gid) && gid > 0 && !state.optionGroupDetails.has(gid)) groupIds.push(gid);
      });
    });
    const unique = [...new Set(groupIds)];
    if (!unique.length) return;
    await Promise.all(unique.map((gid) => loadOptionGroupDetails(gid)));
  }

  async function loadUnitConversions() {
    try {
      const json = await apiJson("/api/public/unit-conversions");
      state.unitConversions = Array.isArray(json?.data) ? json.data : [];
    } catch {
      state.unitConversions = [];
    }
  }

  async function loadProductsForCategory(categoryId) {
    if (!Number.isFinite(Number(categoryId))) return;
    try {
      productsGridEl.innerHTML = "";
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Загрузка товаров...";
        productsEmptyEl.classList.remove("hidden");
      }
      const json = await apiJson(`/api/prod_products?category_id=${encodeURIComponent(String(categoryId))}&list=1`);
      const source = Array.isArray(json.data) ? json.data : [];
      const activeOnly = source.filter((p) => Number(p?.is_active || 0) === 1);
      state.currentProducts = activeOnly;
      await loadVariantsForProducts(activeOnly);
      await loadIngredientsForProducts(activeOnly);
      await loadOptionsForProducts(activeOnly);
      await loadOptionDetailsForProducts(activeOnly);
      renderProducts(activeOnly);
    } catch (e) {
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Ошибка загрузки товаров";
        productsEmptyEl.classList.remove("hidden");
      }
    }
  }

  function bindEvents() {
    function findHorizontalScrollTarget(startEl) {
      const selectors = [
        ".new-order-option-tile-variants",
        ".new-order-option-scroll",
        ".new-order-options",
        ".new-order-product-variants",
      ];
      let node = startEl instanceof Element ? startEl : null;
      while (node && node !== productsGridEl) {
        if (selectors.some((sel) => node.matches(sel)) && node.scrollWidth > node.clientWidth) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    categoriesListEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category-id]");
      if (!btn) return;
      const cid = Number(btn.getAttribute("data-category-id") || 0);
      if (!Number.isFinite(cid) || cid <= 0) return;
      state.activeCategoryId = cid;
      renderCategories();
      loadProductsForCategory(cid);
    });

    productsGridEl.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (!actionBtn) return;
      const card = e.target.closest("[data-product-id]");
      if (!card) return;
      const pid = Number(card.getAttribute("data-product-id") || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      const action = actionBtn.getAttribute("data-action") || "";
      if (action === "variant-select") {
        const variantIndex = Number(actionBtn.getAttribute("data-variant-index"));
        if (!Number.isFinite(variantIndex) || variantIndex < 0) return;
        state.selectedVariants.set(pid, variantIndex);
        renderProducts(state.currentProducts);
        return;
      }
      if (action === "option-open") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const block = actionBtn.closest(".new-order-option-block");
        const titleEl = block ? block.querySelector(".new-order-option-title") : null;
        const title = titleEl ? titleEl.textContent : "Опция";
        void openOptionOverlay(pid, groupId, title);
        return;
      }
      if (action === "option-quick-toggle") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const applied = applyQuickMultiOptionToggle(pid, groupId, itemId);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "Опция";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "option-quick-qty-minus" || action === "option-quick-qty-plus") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const delta = action === "option-quick-qty-plus" ? 1 : -1;
        const applied = applyQuickMultiOptionQtyAdjust(pid, groupId, itemId, delta);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "Опция";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "option-quick-variant") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const variantIndex = Number(actionBtn.getAttribute("data-variant-index") || 0);
        const applied = applyQuickOptionVariantSelection(pid, groupId, itemId, variantIndex);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "Опция";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "ingredient-minus" || action === "ingredient-plus") {
        const ingId = Number(actionBtn.getAttribute("data-ingredient-id") || 0);
        if (!Number.isFinite(ingId) || ingId <= 0) return;
        const ingredients = state.productIngredients.get(pid) || [];
        const ing = ingredients.find((x) => Number(x?.ingredient_id || 0) === ingId);
        if (!ing) return;

        const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
        const defaultQty = Number(ing.quantity ?? 1);
        const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
        const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
        const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
        const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;

        const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
        const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
        let nextQty = action === "ingredient-plus" ? currentQty + step : currentQty - step;
        if (step > 0) {
          const stepsFromMin = Math.round((nextQty - min) / step);
          nextQty = min + (stepsFromMin * step);
        }
        nextQty = Math.max(min, Math.min(max, nextQty));
        qtyMap.set(ingId, nextQty);
        state.ingredientStateByProduct.set(pid, qtyMap);
        renderProducts(state.currentProducts);
        return;
      }
      const currentQty = Number(state.quantities.get(pid) || 0);
      const nextQty = action === "qty-plus" ? currentQty + 1 : Math.max(0, currentQty - 1);
      state.quantities.set(pid, nextQty);
      const qtyEl = card.querySelector("[data-qty-value]");
      if (qtyEl) qtyEl.textContent = String(nextQty);
    });

    productsGridEl.addEventListener(
      "wheel",
      (e) => {
        const row = findHorizontalScrollTarget(e.target);
        if (!row || row.scrollWidth <= row.clientWidth) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        row.scrollLeft += delta * 0.45;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  async function load() {
    try {
      await loadUnitConversions();
      const json = await apiJson("/api/prod_categories");
      const source = Array.isArray(json.data) ? json.data : [];
      state.categories = source
        .filter((c) => Number(c?.is_active || 0) === 1 && isCheckoutVisible(c))
        .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));

      state.activeCategoryId = state.categories.length ? Number(state.categories[0].id) : null;
      renderCategories();

      if (state.activeCategoryId) {
        await loadProductsForCategory(state.activeCategoryId);
      } else if (productsEmptyEl) {
        productsEmptyEl.textContent = "Нет доступных категорий";
        productsEmptyEl.classList.remove("hidden");
      }
    } catch (e) {
      if (categoriesEmptyEl) {
        categoriesEmptyEl.textContent = "Ошибка загрузки категорий";
        categoriesEmptyEl.classList.remove("hidden");
      }
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Ошибка загрузки";
        productsEmptyEl.classList.remove("hidden");
      }
    }
  }

  bindEvents();
  load();
})();
