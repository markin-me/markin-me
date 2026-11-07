// Shared implementation used by the storefront and administrative order entry.
SharedProductRuntime.register(function (runtime) {
  "use strict";

async function renderProductDetailsInto(container, product, { onBack, cartKey, prefillItem, readOnly, favoriteButton, mode, onSave, cartContext } = {}) {
  if (!container) return;
  const renderGeneration = Number(container.__shopProductRenderGeneration || 0) + 1;
  container.__shopProductRenderGeneration = renderGeneration;
  const isSubscriptionMode = mode === 'subscription';
  const isAdminOrderMode = mode === 'admin-order';
  const getResolvedCart = () => cartContext ? cartContext.getItems() : runtime.cartItemsResolved();
  const productIdForRender = Number(product?.id || 0);
  if (!runtime.openProductCtx || Number(runtime.openProductCtx.productId || 0) !== productIdForRender
    || Number(container.dataset.stockSelectionProductId || 0) !== productIdForRender) {
    container.dataset.stockSelectionMode = "auto";
    container.dataset.stockSelectionProductId = String(productIdForRender || "");
  }
  const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
  const isStaticProductView = !cartKey && !prefillItem;
  const canReuseStaticProductView =
    !isMobileViewport &&
    isStaticProductView &&
    Number.isFinite(productIdForRender) &&
    productIdForRender > 0 &&
    container.__shopRenderedViewType === "product" &&
    Number(container.__shopRenderedProductId || 0) === productIdForRender;
  if (canReuseStaticProductView) return;

  if (!isStaticProductView) {
    container.__shopRenderedViewType = "";
    container.__shopRenderedProductId = "";
    container.__shopRenderedComboId = "";
    container.__shopRenderedComboMain = false;
  }

  container.innerHTML = "";

  const productDetailsConfig = await runtime.resolveProductDetailsConfig(product.id);
  if (Number(container.__shopProductRenderGeneration || 0) !== renderGeneration) return;
  let optionGroups = runtime.normalizeProductOptionGroups(productDetailsConfig?.optionGroups);
  const ingredients = runtime.getConfigurableIngredients(product, productDetailsConfig?.ingredients);
  const variants = Array.isArray(productDetailsConfig?.variants) ? productDetailsConfig.variants : [];
  const ingredientProductIds = ingredients
    .map((ing) => Number(ing?.ingredient_id || 0))
    .filter((id) => id > 0 && !runtime.state.productCache.has(id));
  const optionTargetProductIds = optionGroups
    .flatMap((group) => Array.isArray(group?.items) ? group.items : [])
    .map((item) => Number(item?.target_product_id || item?.product_id || 0))
    .filter((id) => id > 0 && !runtime.state.productCache.has(id));
  if (ingredientProductIds.length > 0) {
    await Promise.all(ingredientProductIds.map((ingredientPid) => runtime.ensureProduct(ingredientPid).catch(() => null)));
  }
  if (optionTargetProductIds.length > 0) {
    await Promise.all(optionTargetProductIds.map((optionPid) => runtime.ensureProduct(optionPid).catch(() => null)));
    optionGroups = runtime.normalizeProductOptionGroups(optionGroups);
  }
  const selectionState = new Map();
  const ingredientState = new Map();
  const variantState = {
    groupId: variants[0]?.id ?? variants[0]?.variant_group_id ?? null,
    selectedIndex: null,
    value: null,
    label: "",
  };
  
  // TODO: Интегрировать варианты в UI (отображение выбора варианта, расчет цены с учетом варианта и скидок)
  // Варианты доступны в переменной variants, но пока не отображаются в UI

  // Initialize ingredient state with proper min/max/step handling
  ingredients.forEach(ing => {
    const defaultQty = Number(ing.quantity ?? 1);
    const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
    const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
    const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
    const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
    const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
    
    // Начальное количество: ограничиваем min/max и округляем до шага (относительно min)
    let initialQty = isVariable ? defaultQty : defaultQty;
    initialQty = Math.max(min, Math.min(max, initialQty));
    
    // Округляем до шага (относительно min)
    if (step > 0) {
      const stepsFromMin = Math.round((initialQty - min) / step);
      initialQty = min + (stepsFromMin * step);
      initialQty = Math.max(min, Math.min(max, initialQty));
    }
    
    ingredientState.set(Number(ing.ingredient_id), {
      quantity: initialQty,
    });
  });

  const isReadOnlyView = readOnly === true;
  const editingItem = cartKey ? runtime.getCartItemByKey(cartKey) : null;
  const productId = Number(product?.id || 0);
  let effectiveDefaultConfig = !editingItem && !prefillItem && typeof runtime.getProductPassport === "function"
    ? runtime.getProductPassport(productId)?.defaultConfig
    : null;
  if (!editingItem && !prefillItem && !effectiveDefaultConfig && productId > 0) {
    try {
      const response = await runtime.apiJson('/api/public/products/batch/default-cart-config', {
        method: 'POST', body: { ids: [productId] },
      });
      effectiveDefaultConfig = response?.data?.[productId] || null;
    } catch (error) {
      console.error('Failed to load product default option configuration', error);
    }
  }
  const seedItem =
    editingItem && typeof editingItem === "object"
      ? editingItem
      : (prefillItem && typeof prefillItem === "object"
        ? prefillItem
        : (effectiveDefaultConfig && typeof effectiveDefaultConfig === "object" ? effectiveDefaultConfig : null));
  const editMode = !isReadOnlyView && (!!editingItem || (isAdminOrderMode && !!prefillItem));
  const stockAvailable = runtime.isProductAvailable(product);
  const remainingStockForProduct =
    Number.isFinite(productId) &&
    productId > 0 &&
    typeof runtime.getAvailableStock === "function"
      ? (cartContext ? cartContext.getRemaining(productId) : runtime.getAvailableStock(productId))
      : Infinity;
  const blockedByProductStockLimit =
    !editMode &&
    Number.isFinite(remainingStockForProduct) &&
    remainingStockForProduct <= 0;
  const blockedByIngredientRequirements =
    !editMode &&
    Number.isFinite(productId) &&
    productId > 0 &&
    typeof runtime.isProductBlockedByIngredientRequirements === "function"
      ? runtime.isProductBlockedByIngredientRequirements(productId)
      : false;
  const available = stockAvailable && !blockedByProductStockLimit && !blockedByIngredientRequirements;

  const editVariantGroupIdRaw = seedItem?.variant_group_id ?? seedItem?.variant?.variant_group_id;
  const editVariantValueIndexRaw = seedItem?.variant_value_index ?? seedItem?.variant?.variant_value_index;
  const editVariantGroupId =
    editVariantGroupIdRaw === undefined || editVariantGroupIdRaw === null || editVariantGroupIdRaw === ""
      ? null
      : Number(editVariantGroupIdRaw);
  const editVariantValueIndex =
    editVariantValueIndexRaw === undefined || editVariantValueIndexRaw === null || editVariantValueIndexRaw === ""
      ? null
      : Number(editVariantValueIndexRaw);

  if (
    seedItem &&
    Number.isFinite(editVariantGroupId) &&
    editVariantGroupId > 0 &&
    Number.isFinite(editVariantValueIndex) &&
    editVariantValueIndex >= 0
  ) {
    variantState.groupId = editVariantGroupId;
    variantState.selectedIndex = editVariantValueIndex;
    variantState.label = runtime.str(seedItem.variant_label || seedItem?.variant?.label || seedItem?.variant?.value || "");
  }

  // Restore ingredient quantities from cart if editing
  if (seedItem && Array.isArray(seedItem.ingredients)) {
    seedItem.ingredients.forEach(cartIng => {
      const ingId = Number(cartIng.ingredient_id);
      if (ingredientState.has(ingId)) {
        const ing = ingredients.find(i => Number(i.ingredient_id) === ingId);
        if (!ing) return;
        
        const defaultQty = Number(ing.quantity ?? 1);
        const isVariableIng = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
        const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
        const min = rawMin !== null ? rawMin : (isVariableIng ? 0 : defaultQty);
        const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
        const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
        
        // Берем количество из корзины, нормализуем до допустимого (кратное шагу от min)
        let qty = Number(cartIng.quantity ?? 1);
        qty = Math.max(min, Math.min(max, qty));
        
        // Округляем до шага (относительно min)
        if (step > 0) {
          const stepsFromMin = Math.round((qty - min) / step);
          qty = min + (stepsFromMin * step);
          qty = Math.max(min, Math.min(max, qty));
        }
        
        ingredientState.set(ingId, {
          quantity: qty,
        });
      }
    });
  }

  // qty: default 1, в edit — из корзины
  let qty = seedItem ? Math.max(1, Number(seedItem?.qty || seedItem?.quantity || 1)) : 1;

  // предзаполнение опций из корзины (как было)
  const editOptionIds = new Set((seedItem?.option_item_ids || []).map(Number).filter(Number.isFinite));
  const editOptionQty = new Map();
  (seedItem?.option_items || []).forEach((opt) => {
    const id = Number(opt?.id);
    if (!Number.isFinite(id)) return;
    const q = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
    editOptionQty.set(id, q);
  });

  // Варианты опций из корзины (для восстановления при редактировании)
  const editOptionVariants = new Map();
  (seedItem?.option_items || []).forEach((opt) => {
    const id = Number(opt?.id);
    if (!Number.isFinite(id)) return;
    if (opt.variant_group_id != null && opt.variant_value_index != null) {
      editOptionVariants.set(id, {
        variant_group_id: Number(opt.variant_group_id),
        variant_value_index: Number(opt.variant_value_index),
        variant_label: runtime.str(opt.variant_label || ""),
        variant_group_title: runtime.str(opt.variant_group_title || ""),
        variant_unit: runtime.str(opt.variant_unit || ""),
        unit_id:
          opt.unit_id != null && Number.isFinite(Number(opt.unit_id))
            ? Number(opt.unit_id)
            : null,
        variant_price_diff: Number(opt.variant_price_diff || 0),
      });
    }
  });

  // Устанавливает дефолтный вариант для опции с вариантами (если ещё не задан)
  function setDefaultVariantForOptionItem(item, variantByItemIdMap) {
    const itemId = Number(item.id);
    if (!Number.isFinite(itemId) || variantByItemIdMap.has(itemId)) return;
    const itemVariants = Array.isArray(item.variants) ? item.variants : [];
    if (itemVariants.length === 0 || !(itemVariants[0]?.values?.length)) return;
    const vg = itemVariants[0];
    const values = Array.isArray(vg.values) ? vg.values : [];
    const defaultIdx = vg.default_value_index != null ? Number(vg.default_value_index) : (values.length ? 0 : null);
    if (defaultIdx == null || defaultIdx < 0 || defaultIdx >= values.length) return;
    variantByItemIdMap.set(itemId, runtime.buildOptionItemVariantState(item, vg, defaultIdx, values[defaultIdx]));
  }

optionGroups.forEach((group) => {
  const type = runtime.getOptionGroupUiType(group);
  const minSelect = Math.max(0, Number(group?.min_select ?? 0));
  const isEditingSeed = !!seedItem;

  const stateEntry = {
    type,
    selectedId: null,
    selectedIds: new Set(),
    qtyById: new Map(),
    // NEW: Варианты для каждого item (itemId -> { variant_group_id, variant_value_index, label, price_diff })
    variantByItemId: new Map(),
    minSelect: group.min_select ?? 0,
    maxSelect: group.max_select ?? null,
  };

  if (type === "single") {
    const preselected = (seedItem?.option_item_ids || []).find((id) =>
      group.items.some((item) => Number(item.id) === Number(id))
    );

    const required = !!group.is_required; // NEW
    const fallback = required ? (group.items[0]?.id ?? null) : null;

    stateEntry.selectedId = preselected || fallback || null;
  } else if (type === "multiple_group") {
    group.items.forEach((item) => {
      if (editOptionIds.has(Number(item.id))) stateEntry.selectedIds.add(Number(item.id));
    });
    if (!isEditingSeed && stateEntry.selectedIds.size === 0 && minSelect > 0) {
      const toSelect = Math.min(minSelect, group.items.length);
      for (let i = 0; i < toSelect; i += 1) {
        const id = Number(group.items[i]?.id);
        if (Number.isFinite(id) && id > 0) stateEntry.selectedIds.add(id);
      }
    }
  } else if (type === "multiple_item") {
    group.items.forEach((item) => {
      const id = Number(item.id);
      const itemMin = Number(item?.qty_min ?? 0);
      // В режиме редактирования берём сохранённое значение
      const savedQty = editOptionQty.get(id) || (editOptionIds.has(id) ? Math.max(1, itemMin || 1) : 0);
      const q = savedQty > 0 ? savedQty : 0;
      if (q > 0) stateEntry.qtyById.set(id, q);
    });
    if (!isEditingSeed && stateEntry.qtyById.size === 0 && minSelect > 0) {
      const toSelect = Math.min(minSelect, group.items.length);
      for (let i = 0; i < toSelect; i += 1) {
        const item = group.items[i];
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const itemMin = Number(item?.qty_min ?? 0);
        const q = itemMin > 0 ? itemMin : 1;
        stateEntry.qtyById.set(id, q);
      }
    }
  }

  // Восстанавливаем варианты из корзины для всех items
  group.items.forEach((item) => {
    const itemId = Number(item.id);
    const savedVariant = editOptionVariants.get(itemId);
    if (savedVariant) {
      stateEntry.variantByItemId.set(itemId, savedVariant);
    }
  });

  selectionState.set(group.id, stateEntry);
});

  // Для выбранных опций с вариантами сразу выставляем дефолтный вариант, чтобы цена отображалась верно
  optionGroups.forEach((group) => {
    const stateEntry = selectionState.get(group.id);
    if (!stateEntry || !group.items?.length) return;
    if (stateEntry.type === "single" && stateEntry.selectedId) {
      const item = group.items.find((it) => Number(it.id) === Number(stateEntry.selectedId));
      if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
    } else if (stateEntry.type === "multiple_group") {
      stateEntry.selectedIds.forEach((itemId) => {
        const item = group.items.find((it) => Number(it.id) === Number(itemId));
        if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
      });
    } else if (stateEntry.type === "multiple_item") {
      stateEntry.qtyById.forEach((qty, itemId) => {
        if (qty <= 0) return;
        const item = group.items.find((it) => Number(it.id) === Number(itemId));
        if (item) setDefaultVariantForOptionItem(item, stateEntry.variantByItemId);
      });
    }
  });

  // qty pill UI
  const qtyPill = runtime.createQtyPill({
    variant: available ? "buy" : "muted",
    big: true,
    centerText: String(qty),
    minusEnabled: available && qty > 1,
    plusEnabled: available,
  });

  let qtyPlusBlockedByStock = !isSubscriptionMode && available && (cartContext ? getResolvedCart().length > 0 : runtime.cartCountTotal() > 0);
  let updateQtyUi = () => {
    if (qtyPill?.center) qtyPill.center.textContent = String(qty);
    // минус блокируем визуально на 1
    if (qtyPill?.btnMinus) {
      const minusDisabled = qty <= 1 || !available;
      qtyPill.btnMinus.classList.toggle("is-disabled", minusDisabled);
      qtyPill.btnMinus.disabled = minusDisabled;
    }
    if (qtyPill?.btnPlus) {
      const plusDisabled = !available || qtyPlusBlockedByStock;
      qtyPill.btnPlus.classList.toggle("is-disabled", plusDisabled);
      qtyPill.btnPlus.disabled = plusDisabled;
    }
  };

  let actionBtnRef = null;
  let basePriceElRef = null;
  let heroMediaRef = null;

  // Рассчитывает цену базовых ингредиентов (по ing.quantity из БД)
  const calculateBaseIngredientPrice = () => {
    let total = 0;
    ingredients.forEach(ing => {
      const baseQty = Number(ing.quantity ?? 1); // Базовое количество из БД
      
      // Рассчитываем цену за единицу с учетом base_qty
      const { currentPricePerUnit: pricePerUnit } = getIngredientUnitPricing(ing);
      
      // Конверсия базового количества в базовые единицы
      const qtyInBase = runtime.getQtyInBase(ing, baseQty);
      const ingredientTotal = qtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * qtyInBase : 0;
      total += ingredientTotal;
    });
    return total;
  };

  function getIngredientUnitPricing(ing) {
    const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
    const cachedProduct = runtime.state.productCache.get(Number(ing.ingredient_id || 0)) || null;
    const ingredientCurrentBasePrice = Number(
      cachedProduct?.price != null && Number(cachedProduct.price || 0) > 0
        ? cachedProduct.price
        : ing.ingredient_price || 0
    );
    const currentPricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0
      ? Number(ing.price_override)
      : (
          ingredientBaseQty > 0 && ingredientCurrentBasePrice > 0
            ? ingredientCurrentBasePrice / ingredientBaseQty
            : (ingredientCurrentBasePrice > 0 ? ingredientCurrentBasePrice : 0)
        );

    if (ing.price_override != null && Number(ing.price_override) >= 0) {
      return {
        currentPricePerUnit,
        originalPricePerUnit: currentPricePerUnit,
      };
    }

    const ingredientOriginalBasePrice = Number(
      cachedProduct?.original_price != null && Number(cachedProduct.original_price || 0) > 0
        ? cachedProduct.original_price
        : (
            cachedProduct?.old_price != null && Number(cachedProduct.old_price || 0) > 0
              ? cachedProduct.old_price
              : 0
          )
    );
    const originalPricePerUnit =
      ingredientBaseQty > 0 && ingredientOriginalBasePrice > 0
        ? ingredientOriginalBasePrice / ingredientBaseQty
        : (ingredientOriginalBasePrice > 0 ? ingredientOriginalBasePrice : currentPricePerUnit);

    return {
      currentPricePerUnit,
      originalPricePerUnit,
    };
  }

  function calculateIngredientPricing() {
    let currentTotal = 0;
    let baseCurrentTotal = 0;
    let originalTotal = 0;
    let baseOriginalTotal = 0;

    ingredients.forEach((ing) => {
      const state = ingredientState.get(Number(ing.ingredient_id));
      const currentQty = state ? (state.quantity ?? Number(ing.quantity ?? 1)) : Number(ing.quantity ?? 1);
      const baseQty = Number(ing.quantity ?? 1);
      const { currentPricePerUnit, originalPricePerUnit } = getIngredientUnitPricing(ing);
      const currentQtyInBase = runtime.getQtyInBase(ing, currentQty);
      const baseQtyInBase = runtime.getQtyInBase(ing, baseQty);

      const currentIngredientTotal = currentQtyInBase != null && Number.isFinite(currentPricePerUnit)
        ? currentPricePerUnit * currentQtyInBase
        : 0;
      const baseIngredientCurrentTotal = baseQtyInBase != null && Number.isFinite(currentPricePerUnit)
        ? currentPricePerUnit * baseQtyInBase
        : 0;
      const currentIngredientOriginalTotal = currentQtyInBase != null && Number.isFinite(originalPricePerUnit)
        ? originalPricePerUnit * currentQtyInBase
        : currentIngredientTotal;
      const baseIngredientOriginalTotal = baseQtyInBase != null && Number.isFinite(originalPricePerUnit)
        ? originalPricePerUnit * baseQtyInBase
        : baseIngredientCurrentTotal;

      currentTotal += currentIngredientTotal;
      baseCurrentTotal += baseIngredientCurrentTotal;
      originalTotal += currentIngredientOriginalTotal;
      baseOriginalTotal += baseIngredientOriginalTotal;
    });

    return {
      currentDiff: currentTotal - baseCurrentTotal,
      originalDiff: originalTotal - baseOriginalTotal,
    };
  }

  // Рассчитывает разницу цены ингредиентов от базового состава
  const calculateIngredientPrice = () => {
    return calculateIngredientPricing().currentDiff;
  };

  // Повторяем backend-логику расчёта скидки (без tenant-round внутри скидки):
  // 1) считаем сумму скидки
  // 2) ограничиваем max_discount_amount/ценой
  // 3) округляем скидку до 2 знаков
  const calculateProductDiscountAmount = (price, discount) => {
    const srcPrice = Number(price || 0);
    if (!(srcPrice > 0) || !discount) return 0;

    const discType = String(discount.discount_type || "").trim();
    const discValue = Number(discount.discount_value || 0);
    let discountAmount = 0;

    if (discType === "percent") {
      if (!(discValue > 0)) return 0;
      discountAmount = srcPrice * (discValue / 100);
    } else if (discType === "fixed") {
      if (!(discValue > 0)) return 0;
      discountAmount = discValue;
    } else if (discType === "special_price") {
      discountAmount = Math.max(0, srcPrice - discValue);
    } else {
      return 0;
    }

    const maxDiscountAmount = Number(discount.max_discount_amount);
    if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
      discountAmount = maxDiscountAmount;
    }
    if (discountAmount > srcPrice) discountAmount = srcPrice;

    return Math.round(discountAmount * 100) / 100;
  };

  let updateActionText = () => {
    if (!actionBtnRef) return;
    if (!available) {
      actionBtnRef.innerHTML = `<span class="shop-pd-action-label">Нет в наличии</span>`;
      actionBtnRef.disabled = true;
      if (runtime.elMobileProductPrice) runtime.elMobileProductPrice.textContent = "";
      const mobileOldPrice = runtime.elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
      if (mobileOldPrice) {
        mobileOldPrice.textContent = "";
        mobileOldPrice.classList.add("hidden");
      }
      return;
    }
    actionBtnRef.disabled = false;

    const selectedItems = runtime.collectSelectedOptionItems(optionGroups, selectionState);
    const optionPricingTotals = runtime.getSelectedOptionItemsPricingTotals(selectedItems);
    const optionTotal = Number(optionPricingTotals.currentTotal || 0);
    const optionOriginalComparableTotal = Number(optionPricingTotals.originalComparableTotal || 0);
    const variantUnitPrice = runtime.getVariantUnitPrice(product, variants, variantState);
    const basePrice = Number(variantUnitPrice || 0) + optionTotal;
    const ingredientPricing = calculateIngredientPricing();
    const ingredientsPriceDiff = Number(ingredientPricing.currentDiff || 0); // Разница от базового состава
    const ingredientsOriginalPriceDiff = Number(ingredientPricing.originalDiff || ingredientsPriceDiff);
    const unitPrice = runtime.roundPrice(basePrice + ingredientsPriceDiff);

    // Скидка считается как на бэке, tenant-round применяется к итоговой цене.
    const discountAmount = calculateProductDiscountAmount(unitPrice, product.discount);
    const discountedUnitPrice = runtime.roundPrice(Math.max(0, unitPrice - discountAmount));

    // total = unit * qty
    const totalPrice = runtime.roundPrice(discountedUnitPrice * Number(qty || 1));
    const totalBeforeDiscount = runtime.roundPrice(unitPrice * Number(qty || 1));
    
    // Зачёркнутая цена: либо скидка, либо product.old_price из БД
    const oldBase = runtime.scaleProductBasePriceForCurrentUnit(product, variantUnitPrice || Number(product.price || 0), Number(product.old_price || 0));
    const baseOriginalComparable = oldBase > Number(variantUnitPrice || 0)
      ? runtime.roundPrice(oldBase + ingredientsOriginalPriceDiff)
      : runtime.roundPrice(Number(variantUnitPrice || 0) + ingredientsOriginalPriceDiff);
    const totalOldFromDb = runtime.roundPrice((baseOriginalComparable + optionOriginalComparableTotal) * Number(qty || 1));
    
    // Приоритет: если есть скидка — показываем цену до скидки, иначе old_price
    const hasApiDiscount = discountAmount > 0;
    const optionOldDelta = Math.max(0, optionOriginalComparableTotal - optionTotal);
    const totalOld = hasApiDiscount
      ? runtime.roundPrice(totalBeforeDiscount + optionOldDelta * Number(qty || 1))
      : totalOldFromDb;
    const showOld = totalOld > 0 && totalOld > totalPrice;
    const originalUnitComparable = hasApiDiscount
      ? runtime.roundPrice(unitPrice + optionOldDelta)
      : runtime.roundPrice(baseOriginalComparable + optionOriginalComparableTotal);

    actionBtnRef.innerHTML = `
      <span class="shop-pd-action-prices">
        ${showOld ? `<span class="shop-pd-action-old">${runtime.money(totalOld)}</span>` : ""}
        <span class="shop-checkout-total shop-pd-action-price">${runtime.money(totalPrice)}</span>
      </span>
      <span class="shop-pd-action-label">${editMode ? "Сохранить" : "в корзину"}</span>
    `;
    if (isSubscriptionMode) {
      const label = actionBtnRef.querySelector('.shop-pd-action-label');
      if (label) label.textContent = 'сохранить';
    }

    if (basePriceElRef) {
      const variantLabel = runtime.str(variantState?.label || "").trim();
      if (variantLabel) {
        basePriceElRef.textContent = `${variantLabel} — ${runtime.money(variantUnitPrice)}`;
      } else {
        basePriceElRef.textContent = runtime.money(product.price || 0);
      }
    }
    if (heroMediaRef) {
      runtime.syncProductHeroBadges(heroMediaRef, product, discountedUnitPrice, showOld ? originalUnitComparable : 0);
    }
    // Синхронизация с мобильной кнопкой «В корзину»
    if (runtime.elMobileProductPrice) {
      const priceEl = actionBtnRef.querySelector(".shop-pd-action-price");
      if (priceEl) runtime.elMobileProductPrice.textContent = priceEl.textContent;
    }
    const oldPriceEl = actionBtnRef.querySelector(".shop-pd-action-old");
    const mobileOldPrice = runtime.elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
    if (mobileOldPrice) {
      if (oldPriceEl && oldPriceEl.textContent.trim()) {
        mobileOldPrice.textContent = oldPriceEl.textContent;
        mobileOldPrice.classList.remove("hidden");
      } else {
        mobileOldPrice.textContent = "";
        mobileOldPrice.classList.add("hidden");
      }
    }
  };

  let ingredientsWrapRef = null;
  let refreshVariantAvailabilityUi = () => {};
  
  const onIngredientChange = () => {
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
    // Update ingredient prices in UI
    if (!ingredientsWrapRef) return;
    
    ingredients.forEach(ing => {
      const ingId = Number(ing.ingredient_id);
      const hasIngredientProductId = Number.isFinite(ingId) && ingId > 0;
      const state = ingredientState.get(ingId);
      if (!state) return;
      
      const block = ingredientsWrapRef.querySelector(`[data-ingredient-id="${ingId}"]`);
      if (!block) return;
      
      const defaultQtyNum = Number(ing.quantity ?? 1);
      const isVariableIng = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariableIng ? 0 : defaultQtyNum);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQtyNum;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      let currentQty = state.quantity ?? Number(ing.quantity ?? 1);
      const isIngUnavailableForPlus = () => {
        if (!hasIngredientProductId) return false;
        if (currentQty >= max) return false;
        const snapshot = snapshotDraftState();
        const stateEntry = ingredientState.get(ingId);
        const nextQty = Math.min(max, currentQty + (step > 0 ? step : 1));
        const nextState = stateEntry && typeof stateEntry === "object"
          ? { ...stateEntry, quantity: nextQty }
          : { quantity: nextQty };
        ingredientState.set(ingId, nextState);
        const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
        restoreDraftState(snapshot);
        return !allowed;
      };
      // Round to step (относительно min)
      if (step > 0) {
        const stepsFromMin = Math.round((currentQty - min) / step);
        currentQty = min + (stepsFromMin * step);
      }
      currentQty = Math.max(min, Math.min(max, currentQty));
      state.quantity = currentQty;
      
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";

      const qtyDisplay = block.querySelector(".shop-pd-ingredient-qty-value");
      if (qtyDisplay) qtyDisplay.textContent = `${currentQty} ${unitLabel}`.trim();

      const controls = block.querySelector(".shop-pd-ingredient-controls");
      if (controls && isVariableIng) {
        controls.querySelector(".shop-pd-ingredient-qty-btn--minus")?.remove();
        controls.querySelector(".shop-pd-ingredient-qty-btn--plus")?.remove();
        controls.querySelector(".shop-pd-ingredient-qty-placeholder--minus")?.remove();
        controls.querySelector(".shop-pd-ingredient-qty-placeholder--plus")?.remove();
        const canMinus = currentQty > min;
        const canPlus = currentQty < max && !isIngUnavailableForPlus();
        controls.classList.remove("shop-pd-ingredient-controls--fixed");
        const createIngredientQtyPlaceholder = (side) => {
          const placeholder = document.createElement("span");
          placeholder.className = `shop-pd-ingredient-qty-placeholder shop-pd-ingredient-qty-placeholder--${side}`;
          placeholder.setAttribute("aria-hidden", "true");
          return placeholder;
        };
        let btnMinus = null;
        let btnPlus = null;

        if (canMinus) {
          btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.className = "shop-pd-ingredient-qty-btn shop-pd-ingredient-qty-btn--minus";
          btnMinus.setAttribute("data-action", "ingredient-minus");
          btnMinus.textContent = "−";
          btnMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
            let newQty = currentStateQty - step;
            if (isVariableIng && newQty <= 0) {
              newQty = 0;
            } else {
              if (step > 0) {
                const stepsFromMin = Math.round((newQty - min) / step);
                newQty = min + (stepsFromMin * step);
              }
              newQty = Math.max(min, Math.min(max, newQty));
            }
            if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
              const prevState = ingredientState?.get(ingId);
              const nextState = prevState && typeof prevState === "object"
                ? { ...prevState, quantity: newQty }
                : { quantity: newQty };
              ingredientState?.set(ingId, nextState);
              refreshNutritionCard();
              onIngredientChange();
            }
          });
        }

        if (canPlus) {
          btnPlus = document.createElement("button");
          btnPlus.type = "button";
          btnPlus.className = "shop-pd-ingredient-qty-btn shop-pd-ingredient-qty-btn--plus";
          btnPlus.setAttribute("data-action", "ingredient-plus");
          btnPlus.textContent = "+";
          btnPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isIngUnavailableForPlus()) {
              runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
              return;
            }
            const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
            let newQty = currentStateQty + step;
            if (step > 0) {
              const stepsFromMin = Math.round((newQty - min) / step);
              newQty = min + (stepsFromMin * step);
            }
            newQty = Math.max(min, Math.min(max, newQty));
            if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
              const applied = guardDraftMutation(() => {
                const prevState = ingredientState?.get(ingId);
                const nextState = prevState && typeof prevState === "object"
                  ? { ...prevState, quantity: newQty }
                  : { quantity: newQty };
                ingredientState?.set(ingId, nextState);
              }, { showToastOnOut: true });
              if (!applied) return;
              refreshNutritionCard();
              onIngredientChange();
            }
          });
        }
        if (qtyDisplay) {
          controls.insertBefore(btnMinus || createIngredientQtyPlaceholder("minus"), qtyDisplay);
          controls.appendChild(btnPlus || createIngredientQtyPlaceholder("plus"));
        }
      }
    });
  };

  function buildCurrentIngredientQuantities() {
    const ingredientQuantities = [];
    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const stateEntry = ingredientState.get(ingId);
      const quantity = (stateEntry && stateEntry.quantity !== undefined)
        ? stateEntry.quantity
        : Number(ing.quantity ?? 1);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      ingredientQuantities.push({
        ingredient_id: ingId,
        quantity,
        ingredient_name: ing.ingredient_name || "",
        unit_label: unitLabel,
      });
    });
    return ingredientQuantities;
  }

  function formatVariantValueLabelByIndex(variantIndex) {
    if (!Array.isArray(variants) || !variants.length) return "";
    const group = variants[0] || null;
    const values = Array.isArray(group?.values) ? group.values : [];
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= values.length) return "";

    const unitLabel = runtime.str(group?.unit_short_title || group?.unit_code || group?.unit_title || "").trim();
    const valueText = runtime.str(values[idx]);
    if (!valueText) return "";
    if (!unitLabel || /[a-zа-я]/i.test(valueText)) return valueText;
    return `${valueText} ${unitLabel}`;
  }

  function buildDraftStockItem(desiredQty, variantOverrides = null) {
    const selectedItems = runtime.collectSelectedOptionItems(optionGroups, selectionState);
    const optionItemIds = selectedItems.map((item) => item.id);
    const overrides = variantOverrides && typeof variantOverrides === "object" ? variantOverrides : null;
    const hasGroupOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantGroupId"));
    const hasIndexOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantIndex"));
    const hasLabelOverride = !!(overrides && Object.prototype.hasOwnProperty.call(overrides, "variantLabel"));

    const selectedVariantGroupIdRaw = hasGroupOverride ? overrides.variantGroupId : variantState.groupId;
    const selectedVariantIndexRaw = hasIndexOverride ? overrides.variantIndex : variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const selectedVariantLabel = hasLabelOverride
      ? runtime.str(overrides.variantLabel || "")
      : (
          hasIndexOverride
            ? formatVariantValueLabelByIndex(selectedVariantIndex)
            : (runtime.str(variantState.label || "") || formatVariantValueLabelByIndex(selectedVariantIndex))
        );
    const variantValue = runtime.toStockVariantValue(selectedVariantLabel || "");
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0 &&
      !!variantValue;

    return {
      cart_key: editMode && editingItem ? editingItem.key : null,
      product_id: Number(product.id),
      qty: Math.max(1, Number(desiredQty || 1)),
      option_item_ids: optionItemIds,
      option_items: selectedItems,
      ingredients: buildCurrentIngredientQuantities(),
      variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
      variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
      variant_label: hasVariantSelection ? variantValue : null,
      variants: hasVariantSelection
        ? [{
            variant_group_id: selectedVariantGroupId,
            variant_value_index: selectedVariantIndex,
            value: variantValue,
            label: variantValue,
          }]
        : undefined,
    };
  }

  function buildDraftStockItemsPayload(desiredQty, variantOverrides = null) {
    const cartPayload = runtime.buildStockCheckItemsPayloadFromResolved(getResolvedCart());
    const filtered = (editMode && editingItem)
      ? cartPayload.filter((item) => String(item?.cart_key || "") !== String(editingItem.key || ""))
      : cartPayload.slice();
    filtered.push(buildDraftStockItem(desiredQty, variantOverrides));
    return filtered;
  }

  // --- Локальный расчёт остатков для draft (без обращения к API) ---
  function canUseDraftQtyLocal(desiredQty, variantOverrides) {
    const dQty = Math.max(1, Number(desiredQty || 1));
    // Собираем потребление draft по каждому productId
    const draftConsumption = new Map();
    const addC = (pid, amount) => {
      if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(amount) || amount <= 0) return;
      draftConsumption.set(pid, (draftConsumption.get(pid) || 0) + amount);
    };

    // 1. Основной товар
    const mainPid = Number(product.id || 0);
    if (mainPid > 0) {
      const overrides = variantOverrides && typeof variantOverrides === "object" ? variantOverrides : null;
      let vLabel, vUnitId;
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, "variantIndex")) {
        const idx = Number(overrides.variantIndex);
        const group = Array.isArray(variants) && variants.length ? variants[0] : null;
        const values = group && Array.isArray(group.values) ? group.values : [];
        const unitLabel = runtime.str(group?.unit_short_title || group?.unit_code || group?.unit_title || "").trim();
        const rawVal = idx >= 0 && idx < values.length ? runtime.str(values[idx]) : "";
        const hasLetters = /[a-zа-я]/i.test(rawVal);
        vLabel = rawVal && unitLabel && !hasLetters ? rawVal + " " + unitLabel : rawVal;
        vUnitId = Number(group?.unit_id || 0);
      } else {
        vLabel = runtime.str(variantState.label || "") || formatVariantValueLabelByIndex(variantState.selectedIndex);
        const group = Array.isArray(variants) && variants.length ? variants[0] : null;
        vUnitId = Number(group?.unit_id || 0);
      }
      addC(mainPid, runtime.calcConsumedPerUnit(product, vLabel, vUnitId) * dQty);
    }

    // 2. Выбранные опции
    for (const group of optionGroups) {
      const gState = selectionState.get(group.id);
      if (!gState) continue;
      for (const item of (group.items || [])) {
        const tpid = Number(item.target_product_id || 0);
        if (tpid <= 0) continue;
        const iid = Number(item.id);
        let optQty = 0;
        if (gState.type === "single" && Number(gState.selectedId || 0) === iid) optQty = 1;
        else if (gState.type === "multiple_group" && gState.selectedIds && gState.selectedIds.has(iid)) optQty = 1;
        else if (gState.type === "multiple_item" && gState.qtyById) optQty = Number(gState.qtyById.get(iid) || 0);
        if (optQty <= 0) continue;

        const optProduct = runtime.state.productCache.get(tpid);
        const vData = gState.variantByItemId ? gState.variantByItemId.get(iid) : null;
        const optVLabel = vData ? (vData.variant_label || "") : "";
        const itemVars = Array.isArray(item.variants) ? item.variants : [];
        const optVUnitId = Number(itemVars.length ? (itemVars[0].unit_id || 0) : 0);
        addC(tpid, runtime.calcConsumedPerUnit(optProduct, optVLabel, optVUnitId) * optQty * dQty);
      }
    }

    // 3. Ингредиенты
    for (const ing of ingredients) {
      const ingPid = Number(ing.ingredient_id || 0);
      if (ingPid <= 0) continue;
      const stateEntry = ingredientState.get(ingPid);
      const ingQty = Number(stateEntry && stateEntry.quantity !== undefined ? stateEntry.quantity : (ing.quantity ?? 1));
      if (ingQty <= 0) continue;
      const ingProduct = runtime.state.productCache.get(ingPid);
      const ingUnitId = Number(ing.unit_id || 0);
      let consumed = ingQty;
      if (ingProduct && ingUnitId) {
        const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
        if (baseUnitId && ingUnitId !== baseUnitId) {
          const factor = runtime.getConversionFactor(ingUnitId, baseUnitId);
          if (factor != null) consumed = ingQty * factor;
        }
      }
      addC(ingPid, consumed * dQty);
    }

    // Проверка по каждому затронутому продукту
    for (const [pid, draftAmount] of draftConsumption) {
      const entry = runtime.getStockLevelEntry(pid);
      if (!entry || entry.qty === null || entry.qty === undefined || entry.isUnlimited) continue;
      const stockQty = Number(entry.qty);
      if (!Number.isFinite(stockQty)) continue;
      let cartConsumed = isSubscriptionMode ? 0 : (cartContext ? cartContext.getConsumed(pid) : runtime.calcProductStockConsumed(pid));
      // В режиме редактирования вычитаем потребление редактируемого элемента
      if (editMode && editingItem) {
        cartConsumed -= runtime.calcProductStockConsumed(pid, [editingItem]);
      }
      if (cartConsumed + draftAmount > stockQty) return false;
    }
    return true;
  }

  function canUseDraftQtyWithVariantLocal(variantIndex, desiredQty) {
    if (!Array.isArray(variants) || !variants.length) return true;
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0) return false;
    const qtyForCheck = Math.max(1, Number(desiredQty || qty || 1));
    return canUseDraftQtyLocal(qtyForCheck, { variantIndex: idx });
  }

  async function canUseDraftQty(
    desiredQty,
    {
      showToastOnOut = true,
      refreshOnOut = false,
      variantOverrides = null,
    } = {}
  ) {
    const payloadItems = buildDraftStockItemsPayload(desiredQty, variantOverrides);
    const check = await runtime.checkStockForItemsPayload(payloadItems, {
      showToastOnOut,
      toastMessage: "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
      refreshOnOut,
    });
    return check.available;
  }

  async function canUseDraftQtyWithVariant(
    variantIndex,
    {
      desiredQty = null,
      showToastOnOut = false,
      refreshOnOut = false,
    } = {}
  ) {
    if (!Array.isArray(variants) || !variants.length) return true;
    const group = variants[0] || null;
    const groupId = Number(group?.id || variantState.groupId || 0);
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0) return false;
    const qtyForCheck = Math.max(1, Number(desiredQty || qty || 1));

    return canUseDraftQty(qtyForCheck, {
      showToastOnOut,
      refreshOnOut,
      variantOverrides: {
        variantGroupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
        variantIndex: idx,
      },
    });
  }

  function cloneDraftValue(value) {
    if (value instanceof Map) {
      const out = new Map();
      value.forEach((v, k) => out.set(k, cloneDraftValue(v)));
      return out;
    }
    if (value instanceof Set) {
      const out = new Set();
      value.forEach((v) => out.add(cloneDraftValue(v)));
      return out;
    }
    if (Array.isArray(value)) return value.map((v) => cloneDraftValue(v));
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => {
        out[k] = cloneDraftValue(value[k]);
      });
      return out;
    }
    return value;
  }

  function snapshotDraftState() {
    return {
      selectionState: cloneDraftValue(selectionState),
      ingredientState: cloneDraftValue(ingredientState),
      variantState: cloneDraftValue(variantState),
    };
  }

  function isPlainDraftObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Set);
  }

  function restoreDraftValueInPlace(target, source) {
    if (source instanceof Map) {
      if (!(target instanceof Map)) return cloneDraftValue(source);
      const keysToDelete = [];
      target.forEach((_, key) => {
        if (!source.has(key)) keysToDelete.push(key);
      });
      keysToDelete.forEach((key) => target.delete(key));
      source.forEach((srcValue, key) => {
        if (target.has(key)) {
          const tgtValue = target.get(key);
          target.set(key, restoreDraftValueInPlace(tgtValue, srcValue));
        } else {
          target.set(key, cloneDraftValue(srcValue));
        }
      });
      return target;
    }

    if (source instanceof Set) {
      if (!(target instanceof Set)) return cloneDraftValue(source);
      target.clear();
      source.forEach((v) => target.add(cloneDraftValue(v)));
      return target;
    }

    if (Array.isArray(source)) {
      if (!Array.isArray(target)) return cloneDraftValue(source);
      target.length = 0;
      source.forEach((v) => target.push(cloneDraftValue(v)));
      return target;
    }

    if (isPlainDraftObject(source)) {
      if (!isPlainDraftObject(target)) return cloneDraftValue(source);
      Object.keys(target).forEach((k) => {
        if (!(k in source)) delete target[k];
      });
      Object.keys(source).forEach((k) => {
        target[k] = restoreDraftValueInPlace(target[k], source[k]);
      });
      return target;
    }

    return source;
  }

  function restoreDraftState(snapshot) {
    const selectionSnapshot = snapshot?.selectionState instanceof Map ? snapshot.selectionState : new Map();
    restoreDraftValueInPlace(selectionState, selectionSnapshot);

    const ingredientSnapshot = snapshot?.ingredientState instanceof Map ? snapshot.ingredientState : new Map();
    restoreDraftValueInPlace(ingredientState, ingredientSnapshot);

    const variantSnapshot = snapshot?.variantState && typeof snapshot.variantState === "object" ? snapshot.variantState : {};
    restoreDraftValueInPlace(variantState, variantSnapshot);
  }

  function guardDraftMutation(mutator, { showToastOnOut = true } = {}) {
    if (typeof mutator !== "function") return false;
    const snapshot = snapshotDraftState();
    mutator();
    const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
    if (allowed) return true;
    restoreDraftState(snapshot);
    if (showToastOnOut) runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
    return false;
  }

  function canDraftMutationApplyPreview(mutator) {
    if (typeof mutator !== "function") return true;
    const snapshot = snapshotDraftState();
    mutator();
    const allowed = canUseDraftQtyLocal(Math.max(1, Number(qty || 1)));
    restoreDraftState(snapshot);
    return allowed;
  }

  function refreshQtyPlusStockGate() {
    if (!available) {
      qtyPlusBlockedByStock = true;
      updateQtyUi();
      return false;
    }
    const desiredQty = Math.max(1, Number(qty || 1)) + 1;
    const allowed = canUseDraftQtyLocal(desiredQty);
    qtyPlusBlockedByStock = !allowed;
    updateQtyUi();
    return allowed;
  }

  const onQtyMinus = () => {
    if (!available) return;
    if (qty <= 1) return;
    qty -= 1;
    updateQtyUi();
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
  };

  const onQtyPlus = () => {
    if (!available) return;
    if (qtyPlusBlockedByStock) {
      runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }
    const desiredQty = qty + 1;
    const allowed = canUseDraftQtyLocal(desiredQty);
    if (!allowed) {
      qtyPlusBlockedByStock = true;
      updateQtyUi();
      runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }
    qty = desiredQty;
    qtyPlusBlockedByStock = false;
    updateQtyUi();
    updateActionText();
    refreshQtyPlusStockGate();
    refreshVariantAvailabilityUi();
  };

  const { wrap, actionBtn, basePriceEl, refreshVariantAvailability, refreshNutritionCard, heroMedia } = runtime.buildProductDetailsContent(
    product,
    optionGroups,
    selectionState,
    ingredients,
    ingredientState,
    variants,
    variantState,
    {
      onBack,
      mode: editMode ? "edit" : "add",
      onSelectionChange: () => {
        updateActionText();
        refreshQtyPlusStockGate();
        refreshVariantAvailabilityUi();
      },
      onIngredientChange,
      onVariantChange: () => {
        updateActionText();
        refreshQtyPlusStockGate();
        refreshVariantAvailabilityUi();
      },
      canSelectVariantIndex: canUseDraftQtyWithVariantLocal,
      canDraftMutationApply: canDraftMutationApplyPreview,
      qtyPill,
      onQtyMinus,
      onQtyPlus,
      setDefaultVariantForOptionItem,
      guardDraftMutation,
    }
  );

  actionBtnRef = actionBtn;
  basePriceElRef = basePriceEl;
  heroMediaRef = heroMedia || null;
  ingredientsWrapRef = wrap.querySelector(".shop-pd-ingredients");
  refreshVariantAvailabilityUi = () => {
    if (typeof refreshVariantAvailability !== "function") return;
    try {
      Promise
        .resolve(refreshVariantAvailability({ showToastOnOut: false }))
        .catch(() => {});
    } catch {}
  };

  updateQtyUi();
  updateActionText();
  refreshQtyPlusStockGate();
  refreshVariantAvailabilityUi();

  // На мобильных: синхронизируем кнопки с единым блоком
  const isMobile = window.matchMedia("(max-width: 768px)").matches || (document.body?.classList.contains("page-kso") && container.id === "shopDetailsPageContent");
  if (isMobile && runtime.elMobileProductActions) {
    runtime.elMobileProductActions.classList.remove("is-read-only-back");
  }
  if (isMobile && !isReadOnlyView && runtime.elMobileProductActions && runtime.elMobileQtyWrap && runtime.elMobileAddToCartBtn) {
    // Скрываем footer на мобильных
    const footer = wrap.querySelector(".shop-pd-footer");
    if (footer) footer.style.display = "none";

    // Показываем мобильные кнопки
    runtime.elMobileProductActions.classList.remove("hidden");
    if (runtime.elMobileAddressActions) {
      runtime.elMobileAddressActions.classList.add("hidden");
    }
    if (runtime.elMobileCartActions) {
      runtime.elMobileCartActions.classList.add("hidden");
      if (runtime.elMobileCartActionsCart) runtime.elMobileCartActionsCart.classList.add("hidden");
      if (runtime.elMobileCartActionsCheckout) runtime.elMobileCartActionsCheckout.classList.add("hidden");
    }
    const mobilePricesWrap = runtime.elMobileAddToCartBtn.querySelector(".shop-pd-action-prices");
    if (mobilePricesWrap) mobilePricesWrap.classList.remove("hidden");

    // Клонируем qtyPill в мобильный блок
    if (runtime.elMobileQtyWrap && qtyPill?.pill) {
      runtime.elMobileQtyWrap.innerHTML = "";
      const clonedPill = qtyPill.pill.cloneNode(true);
      runtime.elMobileQtyWrap.appendChild(clonedPill);
      
      // Подключаем обработчики
      const clonedMinus = clonedPill.querySelector(".qty-pill__btn--minus");
      const clonedPlus = clonedPill.querySelector(".qty-pill__btn--plus");
      if (clonedMinus) clonedMinus.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onQtyMinus(); });
      if (clonedPlus) clonedPlus.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onQtyPlus(); });
    }
    
    // Обновляем функцию updateActionText для синхронизации с мобильной кнопкой
    const originalUpdateActionText = updateActionText;
    updateActionText = () => {
      originalUpdateActionText();
      if (runtime.elMobileProductPrice && runtime.elMobileProductLabel) {
        if (!available) {
          runtime.elMobileProductLabel.textContent = "Нет в наличии";
          runtime.elMobileProductPrice.textContent = "";
          const mobileOldPrice = runtime.elMobileAddToCartBtn?.querySelector(".shop-pd-action-old");
          if (mobileOldPrice) {
            mobileOldPrice.textContent = "";
            mobileOldPrice.classList.add("hidden");
          }
          if (runtime.elMobileAddToCartBtn) runtime.elMobileAddToCartBtn.disabled = true;
        } else {
          if (runtime.elMobileAddToCartBtn) runtime.elMobileAddToCartBtn.disabled = false;
          const priceEl = actionBtnRef?.querySelector(".shop-pd-action-price");
          if (priceEl) {
            runtime.elMobileProductPrice.textContent = priceEl.textContent;
          }
          runtime.elMobileProductLabel.textContent = isSubscriptionMode ? "сохранить" : (editMode ? "Сохранить" : "в корзину");
        }
      }
      // Обновляем qty в клонированном pill
      if (runtime.elMobileQtyWrap) {
        const clonedCenter = runtime.elMobileQtyWrap.querySelector(".qty-pill__center");
        if (clonedCenter) clonedCenter.textContent = String(qty);
        const clonedMinus = runtime.elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
        if (clonedMinus) {
          const minusDisabled = qty <= 1 || !available;
          clonedMinus.classList.toggle("is-disabled", minusDisabled);
          clonedMinus.disabled = minusDisabled;
        }
        const clonedPlus = runtime.elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) {
          const plusDisabled = !available || qtyPlusBlockedByStock;
          clonedPlus.classList.toggle("is-disabled", plusDisabled);
          clonedPlus.disabled = plusDisabled;
        }
      }
    };
    
    // Обновляем функцию updateQtyUi для синхронизации
    const originalUpdateQtyUi = updateQtyUi;
    updateQtyUi = () => {
      originalUpdateQtyUi();
      if (runtime.elMobileQtyWrap) {
        const clonedCenter = runtime.elMobileQtyWrap.querySelector(".qty-pill__center");
        if (clonedCenter) clonedCenter.textContent = String(qty);
        const clonedMinus = runtime.elMobileQtyWrap.querySelector(".qty-pill__btn--minus");
        if (clonedMinus) {
          const minusDisabled = qty <= 1 || !available;
          clonedMinus.classList.toggle("is-disabled", minusDisabled);
          clonedMinus.disabled = minusDisabled;
        }
        const clonedPlus = runtime.elMobileQtyWrap.querySelector(".qty-pill__btn--plus");
        if (clonedPlus) {
          const plusDisabled = !available || qtyPlusBlockedByStock;
          clonedPlus.classList.toggle("is-disabled", plusDisabled);
          clonedPlus.disabled = plusDisabled;
        }
      }
    };
    
    // Подключаем обработчик к мобильной кнопке (снимаем предыдущий, чтобы не копились)
    if (runtime.mobileProductActionsState.onAddToCart) {
      runtime.elMobileAddToCartBtn.removeEventListener("click", runtime.mobileProductActionsState.onAddToCart);
    }
    runtime.mobileProductActionsState.onAddToCart = () => {
      actionBtn.click();
    };
    runtime.elMobileAddToCartBtn.addEventListener("click", runtime.mobileProductActionsState.onAddToCart);
    
    // Обновляем сразу
    updateActionText();
    updateQtyUi();
    
    // Скрываем ботомщит активного заказа при открытии карточки товара
    if (runtime.elActiveOrdersSheetCollapsed) {
      runtime.elActiveOrdersSheetCollapsed.classList.add("hidden");
    }
  }

  function composeVariantLabelValueFirst(rawLabel, rawGroupTitle) {
    if (typeof window.extractVariantValueForOrder === "function") {
      return runtime.str(window.extractVariantValueForOrder(rawLabel, rawGroupTitle)).trim();
    }
    const raw = runtime.str(rawLabel || "").trim();
    if (!raw) return "";
    const colonPos = raw.indexOf(":");
    if (colonPos >= 0) {
      const right = raw.slice(colonPos + 1).trim();
      if (right) return right;
    }
    return raw;
  }

  function buildCurrentProductFavoriteSnapshot() {
    const selectedItems = runtime.collectSelectedOptionItems(optionGroups, selectionState);
    const ingredientQuantities = buildCurrentIngredientQuantities();
    const optionItemIds = selectedItems
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const selectedVariantGroupIdRaw = variantState.groupId;
    const selectedVariantIndexRaw = variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0;
    const variantGroupTitle = runtime.str(variants?.[0]?.title || variants?.[0]?.title_label || "").trim();
    const variantUnit = runtime.str(
      variants?.[0]?.unit_short_title ||
      variants?.[0]?.unit_title ||
      variants?.[0]?.unit_code ||
      ""
    ).trim();
    const variantValueLabel = runtime.str(variantState.label || "").trim() || formatVariantValueLabelByIndex(selectedVariantIndex);
    const variantLabel = hasVariantSelection
      ? composeVariantLabelValueFirst(variantValueLabel, variantGroupTitle)
      : "";
    const variantUnitPrice = hasVariantSelection
      ? runtime.getVariantUnitPrice(product, variants, variantState)
      : Number(product.price || 0);
    const safeQty = Math.max(1, Number(qty || 1));
    const ingredientPricing = calculateIngredientPricing();
    const ingredientsPriceDiff = Number(ingredientPricing.currentDiff || 0);
    const ingredientsOriginalPriceDiff = Number(ingredientPricing.originalDiff || ingredientsPriceDiff);

    const draftResolvedItem = {
      product,
      product_id: Number(product.id || 0),
      qty: safeQty,
      option_item_ids: optionItemIds,
      option_items: selectedItems,
      ingredients: ingredientQuantities,
      ingredient_price_diff: Number(ingredientsPriceDiff || 0),
      variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
      variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
      variant_label: variantLabel,
      variant_group_title: hasVariantSelection ? variantGroupTitle : "",
      variant_unit: hasVariantSelection ? variantUnit : "",
      variant_unit_price: Number(variantUnitPrice || 0),
      unit_price_override: null,
      auto_add: 0,
      auto_add_group_id: null,
    };

    const resolvedItems = getResolvedCart();
    const totals = {
      nonAutoTotal: runtime.computeNonAutoTotal(resolvedItems),
      autoEligibleTotal: runtime.computeAutoEligibleTotal(resolvedItems),
    };
    const pricing = runtime.computeItemPricing(draftResolvedItem, totals);
    const optionPricingTotals = runtime.getSelectedOptionItemsPricingTotals(selectedItems);
    const optionCurrentTotal = Number(optionPricingTotals.currentTotal || 0);
    const optionOriginalComparableTotal = Number(optionPricingTotals.originalComparableTotal || 0);
    const oldUnitBase = runtime.scaleProductBasePriceForCurrentUnit(product, variantUnitPrice || Number(product.price || 0), Number(product.old_price || 0));
    const parts = pricing?.parts || {};
    const baseOriginalComparable = oldUnitBase > Number(variantUnitPrice || 0)
      ? runtime.roundPrice(oldUnitBase + ingredientsOriginalPriceDiff)
      : runtime.roundPrice(Number(variantUnitPrice || 0) + ingredientsOriginalPriceDiff);
    const hasDiscount = Number(pricing?.discountAmount || 0) > 0;
    const showOld =
      !pricing?.isAuto &&
      (
        hasDiscount ||
        runtime.roundPrice(baseOriginalComparable + optionOriginalComparableTotal) > Number(pricing?.unitPrice || 0)
      );
    const originalLineTotal = hasDiscount
      ? runtime.roundPrice((Number(pricing?.unitPrice || 0) + Math.max(0, optionOriginalComparableTotal - optionCurrentTotal)) * safeQty)
      : runtime.roundPrice((baseOriginalComparable + optionOriginalComparableTotal) * safeQty);

    return runtime.buildFavoriteSnapshotFromResolvedItem(draftResolvedItem, {
      pricing,
      oldLineTotal: showOld ? originalLineTotal : null,
    });
  }

  if (window.AppModal?.isOpen && window.AppModal.isOpen()) {
    runtime.setSheetHeaderMode("product", {
      onBack,
      favoriteBuildSnapshot: buildCurrentProductFavoriteSnapshot,
    });
  }

  // Привязка избранного к десктопной кнопке в хедере правой панели
  const desktopFavBtn = document.getElementById("shopCartFavBtn");
  if (desktopFavBtn) {
    const freshBtn = desktopFavBtn.cloneNode(true);
    desktopFavBtn.replaceWith(freshBtn);
    freshBtn.classList.remove("is-active", "is-busy");
    delete freshBtn.dataset.favoriteId;
    runtime.bindFavoriteButtonsForCartRow(
      [freshBtn],
      () => buildCurrentProductFavoriteSnapshot()
    );
  }

  if (favoriteButton) {
    favoriteButton.classList.remove("is-active", "is-busy");
    delete favoriteButton.dataset.favoriteId;
    runtime.bindFavoriteButtonsForCartRow(
      [favoriteButton],
      () => buildCurrentProductFavoriteSnapshot()
    );
  }

  container.appendChild(wrap);

  actionBtn.addEventListener("click", async () => {
    if (isReadOnlyView || !available) return;
    const previousCartSnapshot = runtime.cloneCartState(runtime.state.cart);
    const wasEmpty = runtime.cartCountTotal() === 0;
    const selectedItems = runtime.collectSelectedOptionItems(optionGroups, selectionState);
    const optionItemIds = selectedItems.map((item) => item.id);
    const selectedVariantGroupIdRaw = variantState.groupId;
    const selectedVariantIndexRaw = variantState.selectedIndex;
    const selectedVariantGroupId =
      selectedVariantGroupIdRaw === undefined || selectedVariantGroupIdRaw === null || selectedVariantGroupIdRaw === ""
        ? null
        : Number(selectedVariantGroupIdRaw);
    const selectedVariantIndex =
      selectedVariantIndexRaw === undefined || selectedVariantIndexRaw === null || selectedVariantIndexRaw === ""
        ? null
        : Number(selectedVariantIndexRaw);
    const hasVariantSelection =
      Array.isArray(variants) &&
      variants.length > 0 &&
      Number.isFinite(selectedVariantGroupId) &&
      selectedVariantGroupId > 0 &&
      Number.isFinite(selectedVariantIndex) &&
      selectedVariantIndex >= 0;
    const variantSelection = hasVariantSelection
      ? { group_id: selectedVariantGroupId, value_index: selectedVariantIndex }
      : null;
    const variantGroupTitle = runtime.str(variants?.[0]?.title || variants?.[0]?.title_label || "").trim();
    const variantUnit = runtime.str(
      variants?.[0]?.unit_short_title ||
      variants?.[0]?.unit_title ||
      variants?.[0]?.unit_code ||
      ""
    ).trim();
    const variantValueLabel = runtime.str(variantState.label || "").trim() || formatVariantValueLabelByIndex(selectedVariantIndex);
    const variantLabel = hasVariantSelection
      ? composeVariantLabelValueFirst(variantValueLabel, variantGroupTitle)
      : "";
    const variantUnitPrice = hasVariantSelection
      ? runtime.getVariantUnitPrice(product, variants, variantState)
      : Number(product.price || 0);

    const safeQty = Math.max(1, Number(qty || 1));

    if (!canUseDraftQtyLocal(safeQty)) {
      runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return;
    }

    // Collect ingredient quantities with names and units for display
    // ВАЖНО: сохраняем ВСЕ ингредиенты, даже если они не изменены (для отображения в админке)
    const ingredientQuantities = buildCurrentIngredientQuantities();

    const nextKey = runtime.makeCartKey(product.id, selectedItems, ingredientQuantities, variantSelection);
    
    // Рассчитываем разницу цены ингредиентов для сохранения в корзину
    const ingredientPricing = calculateIngredientPricing();
    const ingredientsPriceDiff = Number(ingredientPricing.currentDiff || 0);
    const ingredientsOriginalPriceDiff = Number(ingredientPricing.originalDiff || ingredientsPriceDiff);
    const draftResolvedItem = {
      product,
      product_id: Number(product.id || 0),
      qty: safeQty,
      option_item_ids: optionItemIds,
      option_items: selectedItems,
      ingredients: ingredientQuantities,
      ingredient_price_diff: Number(ingredientsPriceDiff || 0),
      variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
      variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
      variant_label: variantLabel,
      variant_group_title: hasVariantSelection ? variantGroupTitle : "",
      variant_unit: hasVariantSelection ? variantUnit : "",
      variant_unit_price: Number(variantUnitPrice || 0),
      unit_price_override: null,
      auto_add: 0,
      auto_add_group_id: null,
    };
    const resolvedItems = getResolvedCart();
    const pricingTotals = {
      nonAutoTotal: runtime.computeNonAutoTotal(resolvedItems),
      autoEligibleTotal: runtime.computeAutoEligibleTotal(resolvedItems),
    };
    const pricing = runtime.computeItemPricing(draftResolvedItem, pricingTotals);
    const optionPricingTotals = runtime.getSelectedOptionItemsPricingTotals(selectedItems);
    const optionCurrentTotal = Number(optionPricingTotals.currentTotal || 0);
    const optionOriginalComparableTotal = Number(optionPricingTotals.originalComparableTotal || 0);
    const oldUnitBase = runtime.scaleProductBasePriceForCurrentUnit(
      product,
      variantUnitPrice || Number(product.price || 0),
      Number(product.old_price || 0)
    );
    const pricingParts = pricing?.parts || {};
    const baseOriginalComparable = oldUnitBase > Number(variantUnitPrice || 0)
      ? runtime.roundPrice(oldUnitBase + ingredientsOriginalPriceDiff)
      : runtime.roundPrice(Number(variantUnitPrice || 0) + ingredientsOriginalPriceDiff);
    const hasDiscount = Number(pricing?.discountAmount || 0) > 0;
    const showOld =
      !pricing?.isAuto &&
      (
        hasDiscount ||
        runtime.roundPrice(baseOriginalComparable + optionOriginalComparableTotal) > Number(pricing?.unitPrice || 0)
      );
    const originalLineTotal = hasDiscount
      ? runtime.roundPrice((Number(pricing?.unitPrice || 0) + Math.max(0, optionOriginalComparableTotal - optionCurrentTotal)) * safeQty)
      : runtime.roundPrice((baseOriginalComparable + optionOriginalComparableTotal) * safeQty);
    const cartPricingSnapshot = runtime.buildFavoriteSnapshotFromResolvedItem(draftResolvedItem, {
      pricing,
      oldLineTotal: showOld ? originalLineTotal : null,
    });
    const cartOldPrice = Number(cartPricingSnapshot?.old_price || 0);
    const cartUnitPriceBeforeDiscount = showOld && safeQty > 0
      ? runtime.roundPrice(originalLineTotal / safeQty)
      : null;
    const cartDiscount = cartPricingSnapshot?.discount && typeof cartPricingSnapshot.discount === "object"
      ? {
          ...cartPricingSnapshot.discount,
          original_line_total: cartPricingSnapshot.discount?.original_line_total != null
            ? Number(cartPricingSnapshot.discount.original_line_total)
            : null,
        }
      : null;

    if (isSubscriptionMode || isAdminOrderMode) {
      if (typeof onSave === 'function') {
        onSave({
          type: 'product',
          product_id: Number(product.id || 0),
          id: Number(product.id || 0),
          title: String(product.name || product.title || '').trim(),
          photo: (Array.isArray(product.photos) ? product.photos.filter(Boolean)[0] : '') || '',
          photos: Array.isArray(product.photos) ? product.photos.filter(Boolean) : [],
          sku: String(product.sku || '').trim(),
          qty: safeQty,
          price: Number(pricing?.unitPrice || 0),
          old_price: cartOldPrice,
          unit_price_before_discount: cartUnitPriceBeforeDiscount,
          discount: cartDiscount,
          option_item_ids: optionItemIds,
          option_items: selectedItems,
          ingredients: ingredientQuantities,
          ingredient_price_diff: ingredientsPriceDiff || 0,
          variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
          variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
          variant_label: variantLabel,
          variant_group_title: hasVariantSelection ? variantGroupTitle : '',
          variant_unit: hasVariantSelection ? variantUnit : '',
          variant_unit_price: Number(variantUnitPrice || 0),
        });
      }
      return;
    }
    if (editMode && editingItem) {
      // режим редактирования: обновляем qty и конфигурацию, с merge если совпало
      const sameItem = runtime.getCartItemByKey(nextKey);

      if (sameItem && sameItem.key !== editingItem.key) {
        // merge: прибавляем qty текущей редактируемой строки в найденную
        sameItem.qty = Number(sameItem.qty || 0) + safeQty;
        sameItem.ingredients = ingredientQuantities; // Обновляем ингредиенты с названиями
        sameItem.ingredient_price_diff = ingredientsPriceDiff || 0;
        sameItem.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        sameItem.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        sameItem.variant_label = variantLabel;
        sameItem.variant_group_title = hasVariantSelection ? variantGroupTitle : "";
        sameItem.variant_unit = hasVariantSelection ? variantUnit : "";
        sameItem.variant_unit_price = Number(variantUnitPrice || 0);
        sameItem.old_price = cartOldPrice;
        sameItem.unit_price_before_discount = cartUnitPriceBeforeDiscount;
        sameItem.discount = cartDiscount;

        // удаляем старую строку
        runtime.state.cart = runtime.state.cart.filter((it) => it.key !== editingItem.key);
      } else {
        // обновляем текущую строку (сохраняем ингредиенты с названиями)
        editingItem.key = nextKey;
        editingItem.option_item_ids = optionItemIds;
        editingItem.option_items = selectedItems;
        editingItem.ingredients = ingredientQuantities; // Уже содержит названия и единицы
        editingItem.ingredient_price_diff = ingredientsPriceDiff || 0;
        editingItem.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        editingItem.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        editingItem.variant_label = variantLabel;
        editingItem.variant_group_title = hasVariantSelection ? variantGroupTitle : "";
        editingItem.variant_unit = hasVariantSelection ? variantUnit : "";
        editingItem.variant_unit_price = Number(variantUnitPrice || 0);
        editingItem.old_price = cartOldPrice;
        editingItem.unit_price_before_discount = cartUnitPriceBeforeDiscount;
        editingItem.discount = cartDiscount;
        editingItem.qty = safeQty;
        if (editingItem.auto_add == null) editingItem.auto_add = 0;
        if (editingItem.auto_add_group_id == null) editingItem.auto_add_group_id = null;
      }
    } else {
      // режим добавления: merge по конфигурации
      const existing = runtime.getCartItemByKey(nextKey);
      if (existing) {
        existing.qty = Number(existing.qty || 0) + safeQty;
        existing.ingredients = ingredientQuantities; // Уже содержит названия и единицы
        existing.ingredient_price_diff = ingredientsPriceDiff || 0;
        existing.variant_group_id = hasVariantSelection ? selectedVariantGroupId : null;
        existing.variant_value_index = hasVariantSelection ? selectedVariantIndex : null;
        existing.variant_label = variantLabel;
        existing.variant_group_title = hasVariantSelection ? variantGroupTitle : "";
        existing.variant_unit = hasVariantSelection ? variantUnit : "";
        existing.variant_unit_price = Number(variantUnitPrice || 0);
        existing.old_price = cartOldPrice;
        existing.unit_price_before_discount = cartUnitPriceBeforeDiscount;
        existing.discount = cartDiscount;
        if (existing.auto_add == null) existing.auto_add = 0;
        if (existing.auto_add_group_id == null) existing.auto_add_group_id = null;
      } else {
        runtime.state.cart.push({
          key: nextKey,
          product_id: product.id,
          qty: safeQty,
          option_item_ids: optionItemIds,
          option_items: selectedItems,
          ingredients: ingredientQuantities,
          ingredient_price_diff: ingredientsPriceDiff || 0,
          variant_group_id: hasVariantSelection ? selectedVariantGroupId : null,
          variant_value_index: hasVariantSelection ? selectedVariantIndex : null,
          variant_label: variantLabel,
          variant_group_title: hasVariantSelection ? variantGroupTitle : "",
          variant_unit: hasVariantSelection ? variantUnit : "",
          variant_unit_price: Number(variantUnitPrice || 0),
          old_price: cartOldPrice,
          unit_price_before_discount: cartUnitPriceBeforeDiscount,
          discount: cartDiscount,
          auto_add: 0,
          auto_add_group_id: null,
        });
      }
    }

    if (wasEmpty) {
      runtime.clearAllAutoAddDismissed();
    }
    runtime.applyAutoAddRules();
    runtime.clearAutoAddDismissedIfCartEmpty();
    runtime.saveCart();
    if (typeof runtime.scheduleSyncAllProductCardsFromCart === "function") runtime.scheduleSyncAllProductCardsFromCart();
    if (typeof runtime.refreshCartUiAfterMutation === "function") {
      runtime.refreshCartUiAfterMutation({
        reason: "productDetails.add",
        changedCartKeys: [nextKey],
      });
    } else {
      runtime.renderCart();
      runtime.updateCartBadge();
    }

    // обновление моб. шита корзины, если открыт
    if (typeof runtime.refreshCartUiAfterMutation !== "function" && runtime.openCartSheetCtx && runtime.openCartSheetCtx.listEl && runtime.openCartSheetCtx.totalEl) {
      const { items, total } = runtime.renderCartInto(runtime.openCartSheetCtx.listEl, runtime.openCartSheetCtx.totalEl, null);
      if (runtime.openCartSheetCtx.footerEl) runtime.openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (runtime.openCartSheetCtx.checkoutBtn) {
        runtime.openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = runtime.$(".shop-sheet-checkout-total", runtime.openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = runtime.money(total);
      }
      runtime.appendUpsellToList(runtime.openCartSheetCtx.listEl);
    }

    runtime.queueCartStockRecheck(previousCartSnapshot, {
      toastMessage: "Больше нет в наличии",
    });
    const savedItemForLimit = runtime.getCartItemByKey(nextKey);
    const savedQtyForLimit = Number(savedItemForLimit?.qty || 0);
    if (savedItemForLimit && savedQtyForLimit > 0) {
      if (typeof runtime.refreshNextRegularCartItemLimitLocal === "function") {
        runtime.refreshNextRegularCartItemLimitLocal(Number(product.id || 0), nextKey, savedQtyForLimit);
      }
    }

    // На мобильных: скрываем мобильные кнопки при закрытии карточки
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && runtime.elMobileProductActions) {
      runtime.elMobileProductActions.classList.add("hidden");
      // Обновляем ботомщит активного заказа
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge();
      }
    }

    // Закрываем карточку и показываем корзину
    if (onBack && typeof onBack === "function") {
      onBack();
    } else {
      runtime.showCartView();
    }
  });

  if (isReadOnlyView) {
    wrap.classList.add("shop-pd-read-only-gift");
    if (Array.isArray(variants) && variants.length) {
      const topVariantSection = wrap.querySelector(".shop-pd-scroll > .shop-pd-options");
      if (topVariantSection) {
        const variantNodes = Array.from(topVariantSection.querySelectorAll("[data-variant-index]"));
        const selectedNode = variantNodes.find((node) => node.classList.contains("is-selected")) || variantNodes[0] || null;
        variantNodes.forEach((node) => {
          if (node !== selectedNode) {
            node.remove();
            return;
          }
          node.classList.remove("is-clickable");
          node.style.pointerEvents = "none";
          if ("disabled" in node) node.disabled = true;
        });
      }
    }
    wrap.querySelectorAll(".shop-pd-option-edit, .shop-pd-option-gear-btn").forEach((node) => node.remove());
    wrap.querySelectorAll(".shop-pd-option-card.is-clickable, .shop-pd-option-summary, .shop-pd-option-variant-btn").forEach((node) => {
      node.classList.remove("is-clickable");
      node.style.pointerEvents = "none";
      if ("disabled" in node) node.disabled = true;
    });
    wrap.querySelectorAll(".shop-pd-ingredient-controls .qty-btn").forEach((node) => {
      node.style.display = "none";
      if ("disabled" in node) node.disabled = true;
    });
    wrap.querySelectorAll(".shop-pd-option-qty-btn").forEach((node) => {
      node.style.display = "none";
      if ("disabled" in node) node.disabled = true;
    });
    const footer = wrap.querySelector(".shop-pd-footer");
    if (footer) footer.style.display = "none";
    if (runtime.mobileProductActionsState.onAddToCart && runtime.elMobileAddToCartBtn) {
      runtime.elMobileAddToCartBtn.removeEventListener("click", runtime.mobileProductActionsState.onAddToCart);
      runtime.mobileProductActionsState.onAddToCart = null;
    }
    if (isMobile && runtime.elMobileProductActions && runtime.elMobileAddToCartBtn) {
      runtime.elMobileProductActions.classList.remove("hidden");
      runtime.elMobileProductActions.classList.add("is-read-only-back");
      if (runtime.elMobileAddressActions) {
        runtime.elMobileAddressActions.classList.add("hidden");
      }
      if (runtime.elMobileCartActions) {
        runtime.elMobileCartActions.classList.add("hidden");
        if (runtime.elMobileCartActionsCart) runtime.elMobileCartActionsCart.classList.add("hidden");
        if (runtime.elMobileCartActionsCheckout) runtime.elMobileCartActionsCheckout.classList.add("hidden");
      }
      if (runtime.elMobileQtyWrap) {
        runtime.elMobileQtyWrap.innerHTML = "";
      }
      const mobilePricesWrap = runtime.elMobileAddToCartBtn.querySelector(".shop-pd-action-prices");
      if (mobilePricesWrap) mobilePricesWrap.classList.add("hidden");
      const mobileOldPrice = runtime.elMobileAddToCartBtn.querySelector(".shop-pd-action-old");
      if (mobileOldPrice) {
        mobileOldPrice.textContent = "";
        mobileOldPrice.classList.add("hidden");
      }
      if (runtime.elMobileProductPrice) {
        runtime.elMobileProductPrice.textContent = "";
      }
      if (runtime.elMobileProductLabel) {
        runtime.elMobileProductLabel.textContent = "Вернуться в корзину";
      }
      runtime.elMobileAddToCartBtn.disabled = false;
      runtime.mobileProductActionsState.onAddToCart = () => {
        if (typeof onBack === "function") {
          onBack();
          return;
        }
        runtime.showCartView();
      };
      runtime.elMobileAddToCartBtn.addEventListener("click", runtime.mobileProductActionsState.onAddToCart);
      if (runtime.elActiveOrdersSheetCollapsed) {
        runtime.elActiveOrdersSheetCollapsed.classList.add("hidden");
      }
    } else if (runtime.elMobileProductActions) {
      runtime.elMobileProductActions.classList.add("hidden");
    }
  }

  runtime.openProductCtx = {
    productId: product.id,
    onBack: typeof onBack === "function" ? onBack : null,
    readOnly: isReadOnlyView,
    container,
    product,
    stockSelectionMode: container.dataset.stockSelectionMode || "auto",
    refreshAvailability: refreshVariantAvailability,
  };
  if (!container.dataset.stockSelectionMode) container.dataset.stockSelectionMode = "auto";
  if (container.dataset.stockSelectionBound !== "1") {
    container.dataset.stockSelectionBound = "1";
    container.addEventListener("click", (event) => {
      const control = event.target?.closest?.(
        '[data-action="ingredient-minus"], [data-action="ingredient-plus"], .shop-pd-variant-btn, [data-variant-index]'
      );
      if (!control || !container.contains(control)) return;
      container.dataset.stockSelectionMode = "manual";
      if (runtime.openProductCtx && Number(runtime.openProductCtx.productId) === Number(product.id)) {
        runtime.openProductCtx.stockSelectionMode = "manual";
      }
    }, true);
  }

  if (isStaticProductView && Number.isFinite(productIdForRender) && productIdForRender > 0) {
    container.__shopRenderedViewType = "product";
    container.__shopRenderedProductId = productIdForRender;
    container.__shopRenderedComboId = "";
    container.__shopRenderedComboMain = false;
  }
}

  return { renderProductDetailsInto };
});
