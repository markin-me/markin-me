// Shared implementation used by the storefront and administrative order entry.
SharedProductRuntime.register(function (runtime) {
  "use strict";

function getOptionItemPrice(item) {
    if (!item) return 0;
    if (item.price_mode === "fixed") return Number(item.price_value || 0);
    return Number(item.product_price || 0);
  }

function getOptionItemResolvedDisplayBasePrice(item, product = null) {
    if (item?.price_mode === "fixed") {
      return runtime.roundPrice(Number(item?.price_value || 0));
    }
    const productDefaultVariantPrice = Number(product?.default_variant?.variant_unit_price || 0);
    if (productDefaultVariantPrice > 0) return runtime.roundPrice(productDefaultVariantPrice);
    const defaultVariant = runtime.getOptionItemDefaultVariantMeta(item, product);
    if (defaultVariant?.group && Number.isFinite(defaultVariant.index)) {
      const resolvedDefaultVariantPrice = Number(
        runtime.getOptionItemVariantUnitPrice(item, defaultVariant.group, defaultVariant.index) || 0
      );
      if (resolvedDefaultVariantPrice > 0) return runtime.roundPrice(resolvedDefaultVariantPrice);
    }
    const productDisplayPrice = Number(product?.display_price || product?.discounted_price || 0);
    if (productDisplayPrice > 0) return runtime.roundPrice(productDisplayPrice);
    const productBasePrice = Number(product?.price || 0);
    if (productBasePrice > 0) return runtime.roundPrice(productBasePrice);
    const itemDisplayPrice = Number(item?.product_price || item?.price || item?.discounted_price || 0);
    if (itemDisplayPrice > 0) return runtime.roundPrice(itemDisplayPrice);
    return 0;
  }

function getOptionItemVariantUnitPrice(optionItem, variantGroup, selectedIndex) {
    const fallbackPrice = Number(optionItem?.price || 0);
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return fallbackPrice;
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return fallbackPrice;

    const numericValue = runtime.parseVariantValueNumber(values[idx]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackPrice;

    const productId = Number(optionItem?.target_product_id || 0);
    const product = productId > 0 ? runtime.state.productCache.get(productId) : null;

    let unitPrice = null;

    if (product) {
      const basePrice = Number(product.price || 0);
      const baseUnitId = Number(product.base_unit_id || product.unit_id || variantGroup?.unit_id || 0);
      const baseQty = Number(product.base_qty || 1) || 1;
      const variantUnitId = Number(variantGroup?.unit_id || baseUnitId);

      if (basePrice > 0 && baseUnitId && variantUnitId) {
        const factor = runtime.getConversionFactor(variantUnitId, baseUnitId);
        if (factor != null) {
          const qtyInBase = numericValue * Number(factor || 0);
          if (Number.isFinite(qtyInBase) && qtyInBase > 0) {
            unitPrice = basePrice * (qtyInBase / baseQty);
          }
        }
      }
    }

    // ???? ?В корзине пусто???? ????? ?????/??????????? ? ?????????В корзине пусто???? ?? ???? ?????
    if (unitPrice == null) {
      const baseValue = runtime.parseVariantValueNumber(values[0]);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fallbackPrice;
      unitPrice = fallbackPrice * (numericValue / baseValue);
    }

    const tiers = Array.isArray(variantGroup?.discount_tiers) ? variantGroup.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === idx);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    const baseValue = runtime.parseVariantValueNumber(values[0]);
    const shouldApplyTier =
      Number.isFinite(baseValue) &&
      baseValue > 0 &&
      Math.abs(numericValue - baseValue) > 0.000001;
    if (shouldApplyTier && discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

function getOptionItemDefaultVariantMeta(item, product = null) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const productDefaultGroupId = Number(product?.default_variant?.variant_group_id || 0);
    const productDefaultIndex = Number(product?.default_variant?.variant_value_index);

    for (const group of variants) {
      const values = Array.isArray(group?.values) ? group.values : [];
      if (!values.length) continue;
      const groupId = Number(group?.variant_group_id || group?.id || 0);
      if (
        groupId > 0 &&
        productDefaultGroupId > 0 &&
        groupId === productDefaultGroupId &&
        Number.isFinite(productDefaultIndex) &&
        productDefaultIndex >= 0 &&
        productDefaultIndex < values.length
      ) {
        return { group, index: productDefaultIndex };
      }
      const defaultIndex = group?.default_value_index != null ? Number(group.default_value_index) : 0;
      if (Number.isFinite(defaultIndex) && defaultIndex >= 0 && defaultIndex < values.length) {
        return { group, index: defaultIndex };
      }
    }
    return null;
  }

function roundPrice(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const { mode, precision } = runtime.getPriceRoundingSettings();
    if (!mode || mode === "none") return n;
    const factor = precision > 0 ? Math.pow(10, precision) : 1;
    if (mode === "up") return Math.ceil(n * factor) / factor;
    if (mode === "down") return Math.floor(n * factor) / factor;
    return Math.round(n * factor) / factor;
  }

function getPriceRoundingSettings() {
    return { ...runtime.priceRoundingRuntime };
  }

function getOptionItemTargetProduct(item) {
    const targetProductId = Number(item?.target_product_id || item?.product_id || 0);
    return Number.isFinite(targetProductId) && targetProductId > 0
      ? runtime.state.productCache.get(targetProductId) || null
      : null;
  }

function scaleProductBasePriceForCurrentUnit(product, currentUnitPrice, basePriceRaw) {
    const basePrice = Number(basePriceRaw || 0);
    if (!(basePrice > 0)) return 0;
    const currentUnit = Number(currentUnitPrice || 0);
    const productBasePrice = Number(product?.price || 0);
    if (currentUnit > 0 && productBasePrice > 0) {
      return runtime.roundPrice(basePrice * (currentUnit / productBasePrice));
    }
    return runtime.roundPrice(basePrice);
  }

function computeItemPricing(item, totals) {
    const qty = Math.max(0, Number(item?.qty || 0));
    const rule = runtime.getAutoRuleByProductId(item?.product?.id || item?.product_id);
    const isAuto = Number(item?.auto_add || 0) === 1;
    const parts = runtime.getItemUnitParts(item);
    let unitPrice = parts.baseUnit;
    let paidQty = qty;
    let freeQty = 0;
    let isAutoItem = false;
    let discountAmount = 0;
    let discountInfo = null;

    if (rule && isAuto) {
      const group = rule.group || null;
      const nonAutoTotal = totals?.nonAutoTotal ?? 0;
      const autoEligibleTotal = totals?.autoEligibleTotal ?? nonAutoTotal;
      const baseTotal = group && Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      unitPrice = priceOverride + parts.optionTotal + parts.ingredientDiff;
      freeQty = runtime.calcAutoFreeQty(rule, baseTotal);
      paidQty = Math.max(0, qty - freeQty);
      isAutoItem = true;
    }

    unitPrice = runtime.roundPrice(unitPrice);
    let lineTotal = runtime.roundPrice(unitPrice * paidQty);

    function calculateProductDiscountAmount(price, discount) {
      const srcPrice = Number(price || 0);
      if (!(srcPrice > 0) || !discount) return 0;

      const discType = String(discount.discount_type || "").trim();
      const discValue = Number(discount.discount_value || 0);
      if (!(discValue > 0)) return 0;

      let amount = 0;
      if (discType === "percent") {
        amount = srcPrice * (discValue / 100);
      } else if (discType === "fixed") {
        amount = discValue;
      } else if (discType === "special_price") {
        amount = Math.max(0, srcPrice - discValue);
      } else {
        return 0;
      }

      const maxDiscountAmount = Number(discount.max_discount_amount);
      if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && amount > maxDiscountAmount) {
        amount = maxDiscountAmount;
      }
      if (amount > srcPrice) amount = srcPrice;
      return Math.round(amount * 100) / 100;
    }

    // Применяем скидку если есть
    const product = item?.product;
    const buyXGetYRule = !isAutoItem ? runtime.getCatalogBuyXGetYRule(product) : null;
    const buyXGetYApplication = runtime.calculateCatalogBuyXGetYApplication(paidQty, buyXGetYRule);
    const buyXGetYFreeQty = buyXGetYApplication.freeQty;
    let benefitsExcludedLineTotal = 0;
    if (buyXGetYFreeQty > 0) {
      const buyXGetYDiscountAmount = runtime.roundPrice(unitPrice * buyXGetYFreeQty);
      if (buyXGetYDiscountAmount > 0) {
        discountAmount = runtime.roundPrice(discountAmount + buyXGetYDiscountAmount);
        discountInfo = {
          id: buyXGetYRule.id,
          title: buyXGetYRule.title,
          discount_type: "buy_x_get_y",
          discount_value: buyXGetYRule.rewardQty,
          discount_amount: buyXGetYDiscountAmount,
        };
        lineTotal = runtime.roundPrice(Math.max(0, lineTotal - buyXGetYDiscountAmount));
      }
      if (buyXGetYRule && !buyXGetYRule.isStackable) {
        benefitsExcludedLineTotal = runtime.roundPrice(unitPrice * Math.max(0, Number(buyXGetYApplication.paidParticipatingQty || 0)));
      }
    }
    if (product?.discount && product.discount.discount_amount > 0 && !isAutoItem) {
      discountInfo = discountInfo || product.discount;
      // Рассчитываем скидку на lineTotal
      const simpleDiscountBase = benefitsExcludedLineTotal > 0
        ? runtime.roundPrice(unitPrice * Math.max(0, paidQty - Number(buyXGetYApplication.participatingQty || 0)))
        : lineTotal;
      const simpleDiscountAmount = calculateProductDiscountAmount(simpleDiscountBase, product.discount);
      discountAmount = runtime.roundPrice(discountAmount + simpleDiscountAmount);
      lineTotal = runtime.roundPrice(lineTotal - simpleDiscountAmount);
    }

    benefitsExcludedLineTotal = runtime.roundPrice(Math.min(lineTotal, Math.max(0, benefitsExcludedLineTotal)));
    return { lineTotal, unitPrice, paidQty, freeQty, isAuto: isAutoItem, parts, discountAmount, discountInfo, benefitsExcludedLineTotal };
  }

function calculateCatalogBuyXGetYApplication(qty, rule) {
    const itemQty = Math.max(0, Math.floor(Number(qty || 0)));
    if (!rule) {
      return {
        applications: 0,
        freeQty: 0,
        participatingQty: 0,
        paidParticipatingQty: 0,
      };
    }
    const buyQty = Math.max(1, Math.floor(Number(rule?.buyQty || 0)) || 1);
    const rewardQty = Math.max(1, Math.floor(Number(rule?.rewardQty || 0)) || 1);
    const groupQty = buyQty + rewardQty;
    if (!(itemQty >= groupQty)) {
      return {
        applications: 0,
        freeQty: 0,
        participatingQty: 0,
        paidParticipatingQty: 0,
      };
    }
    const applications = rule?.repeatMode === "repeat" ? Math.floor(itemQty / groupQty) : 1;
    const freeQty = Math.min(itemQty, applications * rewardQty);
    const participatingQty = Math.min(itemQty, applications * groupQty);
    return {
      applications,
      freeQty,
      participatingQty,
      paidParticipatingQty: Math.max(0, participatingQty - freeQty),
    };
  }

function getCatalogBuyXGetYRule(product) {
    const source = product?.buy_x_get_y_badge;
    if (!source || typeof source !== "object") return null;
    const badgeText = runtime.str(source.badge_text || "").trim();
    const plusMatch = badgeText.match(/^(\d+)\s*\+\s*(\d+)$/);
    const equalsMatch = badgeText.match(/^(\d+)\s*=\s*(\d+)$/);
    const hasQty = source.buy_qty != null || source.reward_qty != null || !!plusMatch || !!equalsMatch;
    if (!hasQty) return null;
    const buyQty = Math.max(1, Math.floor(Number(source.buy_qty ?? plusMatch?.[1] ?? equalsMatch?.[2] ?? 0)) || 1);
    const rewardQtyFromEquals = equalsMatch ? Math.max(1, Number(equalsMatch[1] || 0) - Number(equalsMatch[2] || 0)) : 0;
    const rewardQty = Math.max(1, Math.floor(Number(source.reward_qty ?? plusMatch?.[2] ?? rewardQtyFromEquals ?? 0)) || 1);
    const repeatMode = runtime.str(source.repeat_mode || "").trim().toLowerCase() === "repeat" ? "repeat" : "single";
    return {
      id: Number(source.id || 0) || null,
      title: runtime.str(source.title || source.badge_text || "1+1").trim() || "1+1",
      buyQty,
      rewardQty,
      repeatMode,
      isStackable: Number(source.is_stackable || 0) === 1 || source.is_stackable === true,
    };
  }

function calcAutoFreeQty(rule, baseTotal) {
    if (!rule) return 0;
    let freeQty = Math.max(0, runtime.parseRuleAmount(rule.free_first_qty));
    const amountStep = runtime.parseRuleAmount(rule.free_per_amount);
    const stepQty = Math.max(0, runtime.parseRuleAmount(rule.free_per_amount_qty));
    if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
      freeQty += Math.floor(baseTotal / amountStep) * stepQty;
    }
    const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
    if (maxFree != null && Number.isFinite(maxFree)) {
      freeQty = Math.min(freeQty, Math.max(0, maxFree));
    }
    return freeQty;
  }

function parseRuleAmount(val) {
    if (val == null || val === "") return 0;
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const s = String(val).trim().replace(",", ".");
    const n2 = Number(s);
    return Number.isFinite(n2) ? n2 : 0;
  }

function getItemUnitParts(item) {
    // ????? ????: unit_price_override ??? ????????? variant_unit_price; ????? ? ???? ???????? (????? ??? ?????????????? ? variant_unit_price: 0)
    const ov = item?.unit_price_override != null ? Number(item.unit_price_override) : null;
    const vp = item?.variant_unit_price != null ? Number(item.variant_unit_price) : null;
    const baseProductUnit = Number(
      (ov != null ? ov : (vp != null && vp !== 0 ? vp : null)) ?? item?.product?.price ?? 0
    );
    const optionTotal = runtime.optionItemsTotal(item?.option_items || []);
    const ingredientDiff = Number(item?.ingredient_price_diff || 0);
    const baseUnit = baseProductUnit + optionTotal + ingredientDiff;
    return { baseProductUnit, optionTotal, ingredientDiff, baseUnit };
  }

function optionItemsTotal(optionItems) {
    return (Array.isArray(optionItems) ? optionItems : []).reduce((sum, opt) => {
      const qty = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
      return sum + Number(opt?.price || 0) * qty;
    }, 0);
  }

function getAutoRuleByProductId(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return null;
    const rule = runtime.state.autoAdd?.byProductId?.get(pid) || null;
    if (rule && !rule.group && runtime.state.autoAdd?.byGroupId) {
      rule.group = runtime.state.autoAdd.byGroupId.get(Number(rule.group_id)) || null;
    }
    return rule;
  }

function computeAutoEligibleTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const isAuto = Number(item?.auto_add || 0) === 1;
      if (!isAuto) {
        const parts = runtime.getItemUnitParts(item);
        const unitPrice = runtime.roundPrice(parts.baseUnit);
        const lineTotal = runtime.roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      const rule = runtime.getAutoRuleByProductId(item?.product?.id || item?.product_id);
      const parts = runtime.getItemUnitParts(item);
      if (!rule) {
        const unitPrice = runtime.roundPrice(parts.baseUnit);
        const lineTotal = runtime.roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      const unitPrice = runtime.roundPrice(priceOverride + parts.optionTotal + parts.ingredientDiff);
      const lineTotal = runtime.roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

function computeNonAutoTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      if (Number(item?.auto_add || 0) === 1) return sum;
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const { baseUnit } = runtime.getItemUnitParts(item);
      const unitPrice = runtime.roundPrice(baseUnit);
      const lineTotal = runtime.roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

function getOptionItemDisplayPricing(item, variantData = null) {
    const product = runtime.getOptionItemTargetProduct(item);
    const currentPrice = runtime.getOptionItemCurrentDisplayPrice(item, variantData, product);
    const baseOriginalPrice = runtime.getOptionItemResolvedOriginalBasePrice(item, product);
    const priceScaleRatio = runtime.getOptionItemPriceScaleRatio(item, variantData, product);
    const originalPrice = baseOriginalPrice > 0
      ? runtime.roundPrice(baseOriginalPrice * priceScaleRatio)
      : 0;
    const showOld = originalPrice > currentPrice;
    const badgeText = showOld ? runtime.getDiscountBadgeTextForPricePair(currentPrice, originalPrice) : "";
    return {
      currentPrice,
      originalPrice: showOld ? originalPrice : 0,
      showOld,
      badgeText,
    };
  }

function getDiscountBadgeTextForPricePair(currentPrice, originalPrice) {
    const current = runtime.roundPrice(Number(currentPrice || 0));
    const original = runtime.roundPrice(Number(originalPrice || 0));
    if (!(original > current && current >= 0)) return "";
    const percent = Math.round(((original - current) / original) * 100);
    if (percent > 0) return `-${percent}%`;
    const amountDiff = runtime.roundPrice(original - current);
    return amountDiff > 0 ? `-${runtime.moneyNoSign(amountDiff)} ₽` : "";
  }

function getOptionItemPriceScaleRatio(item, variantData = null, product = null) {
    const targetProduct = product || runtime.getOptionItemTargetProduct(item);
    const baseDisplayPrice = runtime.getOptionItemResolvedDisplayBasePrice(item, targetProduct);
    if (!(baseDisplayPrice > 0) || item?.price_mode === "fixed") {
      return 1;
    }

    const variantGroups = Array.isArray(item?.variants) ? item.variants : [];
    const explicitVariantGroupId = Number(variantData?.variant_group_id || 0);
    const explicitVariantIndex = Number(variantData?.variant_value_index);
    const explicitGroup = explicitVariantGroupId > 0
      ? variantGroups.find((group) => Number(group?.variant_group_id || group?.id || 0) === explicitVariantGroupId) || null
      : null;

    const resolvedVariant = explicitGroup && Number.isFinite(explicitVariantIndex) && explicitVariantIndex >= 0
      ? { group: explicitGroup, index: explicitVariantIndex }
      : runtime.getOptionItemDefaultVariantMeta(item, targetProduct);

    if (!resolvedVariant?.group || !Number.isFinite(resolvedVariant.index)) {
      return 1;
    }

    const rawSelectedPrice = Number(runtime.getOptionItemVariantUnitPrice(item, resolvedVariant.group, resolvedVariant.index) || 0);
    if (!(rawSelectedPrice > 0)) {
      return 1;
    }

    const defaultVariant = runtime.getOptionItemDefaultVariantMeta(item, targetProduct);
    const rawDefaultPrice = defaultVariant?.group
      ? Number(runtime.getOptionItemVariantUnitPrice(item, defaultVariant.group, defaultVariant.index) || 0)
      : baseDisplayPrice;
    if (!(rawDefaultPrice > 0)) {
      return 1;
    }

    const ratio = rawSelectedPrice / rawDefaultPrice;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }

function getOptionItemResolvedOriginalBasePrice(item, product = null) {
    if (item?.price_mode === "fixed") return 0;
    const discountOriginalPrice = Number(product?.original_price ?? item?.original_price ?? 0);
    if (discountOriginalPrice > 0) return runtime.roundPrice(discountOriginalPrice);
    const adminOldPrice = Number(product?.old_price ?? item?.old_price ?? 0);
    if (adminOldPrice > 0) {
      const defaultCurrentPrice = runtime.getOptionItemResolvedDisplayBasePrice(item, product);
      if (
        defaultCurrentPrice > 0 &&
        typeof runtime.scaleProductBasePriceForCurrentUnit === "function" &&
        product
      ) {
        const scaledOldPrice = runtime.scaleProductBasePriceForCurrentUnit(product, defaultCurrentPrice, adminOldPrice);
        if (scaledOldPrice > 0) return runtime.roundPrice(scaledOldPrice);
      }
      return runtime.roundPrice(adminOldPrice);
    }
    return 0;
  }

function getOptionItemCurrentDisplayPrice(item, variantData = null, product = null) {
    const targetProduct = product || runtime.getOptionItemTargetProduct(item);
    const baseDisplayPrice = runtime.getOptionItemResolvedDisplayBasePrice(item, targetProduct);
    if (item?.price_mode === "fixed") {
      return runtime.roundPrice(baseDisplayPrice + Number(variantData?.variant_price_diff || 0));
    }
    const ratio = runtime.getOptionItemPriceScaleRatio(item, variantData, targetProduct);
    return runtime.roundPrice(baseDisplayPrice * ratio);
  }

function calcConsumedPerUnit(product, variantLabel, variantUnitId) {
    if (!product) return 1;
    // Пробуем распарсить числовое значение из варианта
    if (variantLabel != null && variantLabel !== "") {
      const numericValue = runtime.parseVariantValueNumber(variantLabel);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        const baseUnitId = Number(product.base_unit_id || product.unit_id || 0);
        const fromUnitId = Number(variantUnitId || 0);
        if (fromUnitId > 0 && baseUnitId > 0) {
          if (fromUnitId === baseUnitId) return numericValue;
          const factor = runtime.getConversionFactor(fromUnitId, baseUnitId);
          if (factor != null) {
            const inBase = numericValue * factor;
            if (Number.isFinite(inBase) && inBase > 0) return inBase;
          }
        }
        // Если нет конверсии но есть числовое значение — возвращаем как есть
        return numericValue;
      }
    }
    // Фолбэк: base_qty продукта (по умолчанию 1)
    const bq = Number(product.base_qty || 1);
    return Number.isFinite(bq) && bq > 0 ? bq : 1;
  }

function toStockVariantValue(rawLabel) {
    const text = runtime.str(rawLabel || "").trim();
    if (!text) return "";
    const colonPos = text.indexOf(":");
    if (colonPos >= 0) {
      const right = text.slice(colonPos + 1).trim();
      return right || text;
    }
    return text;
  }

function getVariantUnitPrice(product, variants, variantState) {
    if (!product) return 0;
    const basePrice = Number(product.price || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const selectedIndex = Number(variantState?.selectedIndex);
    if (!Number.isFinite(selectedIndex)) return basePrice;

    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;

    const value = Array.isArray(group.values) ? group.values[selectedIndex] : null;
    const numericValue = runtime.parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;

    const factor = runtime.getConversionFactor(variantUnitId, baseUnitId);
    const effectiveFactor = factor != null ? Number(factor || 0) : 1;
    const qtyInBase = numericValue * effectiveFactor;
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;

    let unitPrice = basePrice * (qtyInBase / baseQty);

    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selectedIndex);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    const shouldApplyTier = Math.abs(qtyInBase - baseQty) > 0.000001;
    if (shouldApplyTier && discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

function getSelectedOptionItemsPricingTotals(optionItems) {
    return (Array.isArray(optionItems) ? optionItems : []).reduce((totals, item) => {
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 1)) || 1;
      const pricing = runtime.getOptionItemDisplayPricing(item, runtime.getSelectedOptionItemVariantData(item));
      const currentLine = runtime.roundPrice(Number(pricing.currentPrice || 0) * qty);
      const originalComparableUnit = pricing.showOld
        ? Number(pricing.originalPrice || 0)
        : Number(pricing.currentPrice || 0);
      const originalComparableLine = runtime.roundPrice(originalComparableUnit * qty);
      totals.currentTotal = runtime.roundPrice(Number(totals.currentTotal || 0) + currentLine);
      totals.originalComparableTotal = runtime.roundPrice(Number(totals.originalComparableTotal || 0) + originalComparableLine);
      return totals;
    }, {
      currentTotal: 0,
      originalComparableTotal: 0,
    });
  }

function getSelectedOptionItemVariantData(item) {
    if (!item || typeof item !== "object") return null;
    const groupId = Number(item?.variant_group_id || 0);
    const valueIndex = Number(item?.variant_value_index);
    if (!(groupId > 0) || !Number.isFinite(valueIndex) || valueIndex < 0) return null;
    return {
      variant_group_id: groupId,
      variant_value_index: valueIndex,
      variant_label: runtime.str(item?.variant_label || "").trim(),
      variant_group_title: runtime.str(item?.variant_group_title || "").trim(),
      variant_unit: runtime.str(item?.variant_unit || "").trim(),
      unit_id:
        item?.unit_id != null && Number.isFinite(Number(item.unit_id))
          ? Number(item.unit_id)
          : null,
      variant_price_diff: Number(item?.variant_price_diff || 0),
    };
  }

function getQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    
    // ??? ????????? ????? pcs ?????????? ingredient_pcs_factor ???? ????
    // ????????? ????? ??? ???????, ??? ??? ??? ??????? ? ?????? ?????? ? ??????
    // ?????? ????? ?????????? ????? ????????? ????? getConversionFactor
    
    const factor = runtime.getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  return { getOptionItemPrice, getOptionItemResolvedDisplayBasePrice, getOptionItemVariantUnitPrice, parseVariantValueNumber, getOptionItemDefaultVariantMeta, roundPrice, getPriceRoundingSettings, getOptionItemTargetProduct, scaleProductBasePriceForCurrentUnit, computeItemPricing, calculateCatalogBuyXGetYApplication, getCatalogBuyXGetYRule, calcAutoFreeQty, parseRuleAmount, getItemUnitParts, optionItemsTotal, getAutoRuleByProductId, computeAutoEligibleTotal, computeNonAutoTotal, getOptionItemDisplayPricing, getDiscountBadgeTextForPricePair, getOptionItemPriceScaleRatio, getOptionItemResolvedOriginalBasePrice, getOptionItemCurrentDisplayPrice, calcConsumedPerUnit, toStockVariantValue, getVariantUnitPrice, getSelectedOptionItemsPricingTotals, getSelectedOptionItemVariantData, getQtyInBase };
});

SharedProductRuntime.register(function (runtime) {
  "use strict";
function formatIngredientLineForOrder(ing) {
    const rawQty = ing?.qty ?? ing?.quantity;
    const numQty = Number(rawQty);
    if (!Number.isFinite(numQty) || numQty <= 0) return "";
    const unitText = runtime.str(
      ing?.unit ||
      ing?.unit_label ||
      ing?.unitLabel ||
      ing?.unit_short_title ||
      ing?.unit_title ||
      ""
    ).trim();
    const nameText = runtime.str(ing?.name || ing?.ingredient_name || ing?.ingredientName || "").trim();
    return runtime.formatQtyUnitNameForOrder(rawQty, unitText, nameText);
  }

function formatQtyUnitNameForOrder(qtyRaw, unitRaw, nameRaw) {
    const qtyNum = Number(qtyRaw);
    const qtyText = Number.isFinite(qtyNum)
      ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
      : runtime.str(qtyRaw ?? "").trim();
    const unitText = runtime.str(unitRaw || "").trim();
    const nameText = runtime.str(nameRaw || "").trim();
    return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
  }

async function calculateDefaultPrice(product) {
    const productId = product.id;

    if (product.display_price != null && Number.isFinite(Number(product.display_price))) {
      return Number(product.display_price);
    }
    
    // ????????? ???
    if (runtime.defaultPriceCache.has(productId)) {
      return runtime.defaultPriceCache.get(productId);
    }

    let price = Number(product.price || 0);

    try {
      // ????????? ????????
      const variants = await runtime.resolveProductVariants(productId);
      
      // ???? ???? ????????, ????? ???? ???????? ?? ????????? (?????????????? ??? ?????????)
      if (variants.length > 0 && variants[0].values?.length > 0) {
        const variant = variants[0];
        // ?????????? default_value_index (?????????????? ??? ?????????), ???? ?????, ????? 0
        const defaultIndex = variant.default_value_index != null 
          ? Number(variant.default_value_index) 
          : 0;
        // ????????? ??? ?????? ????????
        const validIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
        const variantState = {
          selectedIndex: validIndex,
          value: variant.values[validIndex],
          label: String(variant.values[validIndex]),
        };
        price = runtime.getVariantUnitPrice(product, variants, variantState);
      }

      // ????????? ?????
      const optionGroups = await runtime.resolveProductOptionGroups(productId);
      
      // ????????? ????????? ???????????? ????? ?? ?????????
      for (const group of optionGroups) {
        const groupType = runtime.getOptionGroupUiType(group);
        
        if (groupType === "single" && group.is_required && group.items?.length > 0) {
          // ??? single ? is_required ? ????? ?????? ??????? ??? ?????????
          const defaultItem = group.items[0];
          const defaultItemPrice = runtime.getOptionItemResolvedDefaultPrice(defaultItem);
          if (Number.isFinite(defaultItemPrice)) {
            price += defaultItemPrice;
          }
        } else if (groupType === "multiple_item" || groupType === "multiple_group") {
          const minSelect = Math.max(0, Number(group?.min_select ?? 0));
          if (minSelect <= 0) continue;

          let selectedCount = 0;
          for (const item of (group.items || [])) {
            if (selectedCount >= minSelect) break;
            const qtyMin = Number(item?.qty_min ?? 0);
            const defaultQty = qtyMin > 0 ? qtyMin : 1;
            if (item.price) {
              price += Number(item.price || 0) * defaultQty;
            }
            selectedCount += 1;
          }
        }
      }
    } catch (e) {
      console.error("Error calculating default price:", e);
    }

    // ????????? ? ???
    price = runtime.roundPrice(price);
    runtime.defaultPriceCache.set(productId, price);
    return price;
  }

function getOptionItemResolvedDefaultPrice(optionItem) {
    const basePrice = Number(optionItem?.price || 0);
    if (!Number.isFinite(basePrice)) return 0;
    const variants = Array.isArray(optionItem?.variants) ? optionItem.variants : [];
    const variantGroup = variants[0];
    const defaultVariantIndex = runtime.getOptionItemDefaultVariantIndex(optionItem);
    if (!variantGroup || !Number.isFinite(Number(defaultVariantIndex))) {
      return basePrice;
    }
    return basePrice + runtime.getOptionItemVariantPriceDiff(optionItem, variantGroup, Number(defaultVariantIndex));
  }

function getOptionItemVariantPriceDiff(optionItem, variantGroup, selectedIndex) {
    const unitPrice = Number(runtime.getOptionItemVariantUnitPrice(optionItem, variantGroup, selectedIndex) || 0);
    const productId = Number(optionItem?.target_product_id || 0);
    const targetProduct = productId > 0 ? runtime.state.productCache.get(productId) : null;
    const basePrice = targetProduct
      ? Number(targetProduct.price || 0)
      : Number(optionItem?.price || 0);
    if (!Number.isFinite(unitPrice) || !Number.isFinite(basePrice)) return 0;
    return unitPrice - basePrice;
  }

function getOptionItemDefaultVariantIndex(optionItem) {
    const variants = Array.isArray(optionItem?.variants) ? optionItem.variants : [];
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return null;
    const rawIndex = variantGroup?.default_value_index != null ? Number(variantGroup.default_value_index) : 0;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= values.length) return 0;
    return rawIndex;
  }
  return { formatIngredientLineForOrder, formatQtyUnitNameForOrder, calculateDefaultPrice, getOptionItemResolvedDefaultPrice, getOptionItemVariantPriceDiff, getOptionItemDefaultVariantIndex };
});
