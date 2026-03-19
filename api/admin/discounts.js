const express = require('express');

const DISCOUNT_COLUMNS = `
  id, title, description, discount_type, discount_value,
  apply_to, min_order_amount, max_discount_amount,
  starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
  usage_limit, usage_per_customer, usage_count,
  priority, is_stackable, is_active, hide_in_benefits,
  activation_mode, reward_type, promo_code_mode, unique_code_usage_limit,
  mechanic_type, mechanic_config_json,
  created_at, updated_at
`;

const PROMO_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SIMPLE_DISCOUNT_TYPES = new Set(['percent', 'fixed', 'special_price']);
const SIMPLE_DISCOUNT_VARIANTS = new Set(['promo_code', 'percent', 'fixed', 'special_price']);
const PROMO_REWARD_TYPES = new Set(['discount', 'product']);
const PROMO_PRODUCT_REWARD_TYPES = new Set(['gift', 'product_discount']);
const APPLY_TO_TYPES = new Set(['order', 'product', 'category', 'combo']);
const MECHANIC_TYPES = new Set(['simple_discount', 'buy_x_get_y', 'threshold', 'loyalty_progress']);
const REWARD_TYPES = new Set(['discount', 'bonus', 'gift', 'product_discount', 'mixed']);
const LOYALTY_PROGRESS_BASES = new Set(['orders', 'items', 'amount']);
const LOYALTY_STATUS_FILTERS = new Set(['any', 'paid', 'completed']);
const LOYALTY_SCOPE_MODES = new Set(['none', 'product', 'product_list', 'category']);
const LOYALTY_REWARD_KINDS = new Set(['gift', 'discount', 'promo_code']);
const LOYALTY_ISSUE_MODES = new Set(['automatic', 'manual', 'code']);
const LOYALTY_PENDING_REWARD_MODES = new Set(['stack', 'single_pending']);
const LOYALTY_REDEMPTION_MODES = new Set(['reset', 'subtract_threshold', 'keep_progress']);
const PRODUCT_CONFIG_MODES = new Set(['any', 'exact']);
const DISCOUNT_MUTATION_ERROR_CODES = new Set([
  'TITLE_REQUIRED',
  'INVALID_CUSTOMERS',
  'INVALID_PRODUCTS',
  'INVALID_DATE_RANGE',
  'PERIOD_BOUNDS_REQUIRED',
  'WEEKDAYS_REQUIRED',
  'TIME_BOUNDS_REQUIRED',
  'INVALID_TIME_RANGE',
  'PRODUCTS_REQUIRED',
  'PRODUCTS_NOT_ALLOWED',
  'PROMO_NOT_AVAILABLE',
  'PROMO_CODE_TAKEN',
  'PROMO_CODE_REQUIRED',
  'PROMO_REWARD_PRODUCTS_REQUIRED',
  'INVALID_DISCOUNT_VALUE',
  'SPECIAL_PRICE_PRODUCT_ONLY',
  'INVALID_MECHANIC_CONFIG',
  'QUALIFYING_ITEMS_REQUIRED',
  'INVALID_QUALIFYING_ITEMS',
  'REWARD_PRODUCTS_REQUIRED',
  'INVALID_REWARD_DISCOUNT',
  'THRESHOLD_TIERS_REQUIRED',
  'INVALID_THRESHOLD_TIER',
  'THRESHOLD_DISCOUNT_SOURCE_REQUIRED',
  'THRESHOLD_PROMO_SOURCE_REQUIRED',
  'INVALID_THRESHOLD_DISCOUNT_SOURCE',
  'INVALID_THRESHOLD_PROMO_SOURCE',
  'INVALID_PROGRESS_THRESHOLD',
  'LOYALTY_QUALIFYING_ITEMS_REQUIRED',
  'INVALID_PROGRESS_SCOPE_ITEMS',
  'LOYALTY_REWARD_PRODUCTS_REQUIRED',
  'LOYALTY_PROMO_SOURCE_REQUIRED',
  'INVALID_ISSUE_MODE',
]);

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value) {
  const text = toText(value);
  return text || null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toIntOrNull(value) {
  const num = toNumberOrNull(value);
  if (num === null) return null;
  return Math.max(0, Math.trunc(num));
}

function normalizeCountField(source, fallback, fieldName, defaultValue = 1) {
  const hasOwn = source && Object.prototype.hasOwnProperty.call(source, fieldName);
  if (hasOwn) {
    const parsed = toIntOrNull(source[fieldName]);
    return parsed && parsed > 0 ? parsed : 0;
  }
  const parsedFallback = toIntOrNull(fallback?.[fieldName]);
  return parsedFallback && parsedFallback > 0 ? parsedFallback : defaultValue;
}

function toBoolFlag(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = toText(value).toLowerCase();
  if (!text) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function normalizePromoCode(value) {
  const text = toText(value).replace(/\s+/g, '').toUpperCase();
  return text || null;
}

function parseScheduleDays(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const unique = [...new Set(value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6))];
    return unique.length ? unique : null;
  }
  if (typeof value === 'string') {
    try {
      return parseScheduleDays(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

function serializeScheduleDays(value) {
  const days = parseScheduleDays(value);
  return days ? JSON.stringify(days) : null;
}

function normalizeDiscountRow(row) {
  if (!row || typeof row !== 'object') return row;
  const normalized = { ...row };
  normalized.hide_in_benefits = Number(normalized.hide_in_benefits || 0) === 1;
  if (typeof normalized.schedule_days === 'string') {
    try {
      normalized.schedule_days = JSON.parse(normalized.schedule_days);
    } catch {}
  }
  if (typeof normalized.mechanic_config_json === 'string') {
    try {
      normalized.mechanic_config_json = JSON.parse(normalized.mechanic_config_json);
    } catch {}
  }
  return normalized;
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return fallback;
}

function normalizeProductConfigMode(value, fallback = 'any') {
  const raw = toText(value).toLowerCase();
  if (PRODUCT_CONFIG_MODES.has(raw)) return raw;
  return PRODUCT_CONFIG_MODES.has(fallback) ? fallback : 'any';
}

function normalizeProductConfigPayload(value, fallbackProductId = null) {
  const source = parseJsonObject(value, null);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const productId = Number(source.product_id || fallbackProductId || 0);
  if (!(productId > 0)) return null;
  const variantGroupId = Number(source.variant_group_id || 0);
  const variantValueIndex = Number(source.variant_value_index);
  const options = (Array.isArray(source.options) ? source.options : [])
    .map((option) => ({
      id: Number(option?.id || 0),
      qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
      target_product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
      variant_group_id: Number(option?.variant_group_id || 0) || null,
      variant_value_index: Number.isFinite(Number(option?.variant_value_index))
        ? Number(option.variant_value_index)
        : null,
    }))
    .filter((option) => option.id > 0)
    .sort((a, b) => (
      a.id - b.id
      || Number(a.target_product_id || 0) - Number(b.target_product_id || 0)
      || Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0)
      || Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
    ));
  const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
    .map((ingredient) => ({
      ingredient_id: Number(ingredient?.ingredient_id || ingredient?.product_id || 0),
      qty: Math.round((Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0) * 1000) / 1000,
    }))
    .filter((ingredient) => ingredient.ingredient_id > 0)
    .sort((a, b) => a.ingredient_id - b.ingredient_id);
  return {
    product_id: productId,
    variant_group_id: variantGroupId > 0 ? variantGroupId : null,
    variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
    options,
    ingredients,
  };
}

function normalizeDiscountType(value, fallback = 'percent') {
  const raw = toText(value).toLowerCase();
  if (SIMPLE_DISCOUNT_TYPES.has(raw)) return raw;
  return SIMPLE_DISCOUNT_TYPES.has(fallback) ? fallback : 'percent';
}

function normalizePromoRewardType(value, fallback = 'discount') {
  const raw = toText(value).toLowerCase();
  if (PROMO_REWARD_TYPES.has(raw)) return raw;
  return PROMO_REWARD_TYPES.has(fallback) ? fallback : 'discount';
}

function normalizePromoProductRewardType(value, fallback = 'gift') {
  const raw = toText(value).toLowerCase();
  if (PROMO_PRODUCT_REWARD_TYPES.has(raw)) return raw;
  return PROMO_PRODUCT_REWARD_TYPES.has(fallback) ? fallback : 'gift';
}

function normalizePromoDiscountType(value, fallback = 'percent') {
  const raw = toText(value).toLowerCase();
  if (raw === 'percent' || raw === 'fixed' || raw === 'special_price') return raw;
  return ['fixed', 'special_price'].includes(fallback) ? fallback : 'percent';
}

function normalizeSimpleVariant(value, fallback = 'percent') {
  const raw = toText(value).toLowerCase();
  if (SIMPLE_DISCOUNT_VARIANTS.has(raw)) return raw;
  return SIMPLE_DISCOUNT_VARIANTS.has(fallback) ? fallback : 'percent';
}

function normalizeLoyaltyProgressBasis(value, fallback = 'orders') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_PROGRESS_BASES.has(raw)) return raw;
  return LOYALTY_PROGRESS_BASES.has(fallback) ? fallback : 'orders';
}

function normalizeLoyaltyStatusFilter(value, fallback = 'any') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_STATUS_FILTERS.has(raw)) return raw;
  return LOYALTY_STATUS_FILTERS.has(fallback) ? fallback : 'any';
}

function normalizeLoyaltyScopeMode(value, fallback = 'none') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_SCOPE_MODES.has(raw)) return raw;
  return LOYALTY_SCOPE_MODES.has(fallback) ? fallback : 'none';
}

function normalizeLoyaltyRewardKind(value, fallback = 'gift') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_REWARD_KINDS.has(raw)) return raw;
  return LOYALTY_REWARD_KINDS.has(fallback) ? fallback : 'gift';
}

function normalizeLoyaltyIssueMode(value, fallback = 'automatic') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_ISSUE_MODES.has(raw)) return raw;
  return LOYALTY_ISSUE_MODES.has(fallback) ? fallback : 'automatic';
}

function normalizeLoyaltyPendingRewardMode(value, fallback = 'stack') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_PENDING_REWARD_MODES.has(raw)) return raw;
  return LOYALTY_PENDING_REWARD_MODES.has(fallback) ? fallback : 'stack';
}

function normalizeLoyaltyRedemptionMode(value, fallback = 'reset') {
  const raw = toText(value).toLowerCase();
  if (LOYALTY_REDEMPTION_MODES.has(raw)) return raw;
  return LOYALTY_REDEMPTION_MODES.has(fallback) ? fallback : 'reset';
}

function normalizeApplyTo(value, fallback = 'order') {
  const raw = toText(value).toLowerCase();
  if (APPLY_TO_TYPES.has(raw)) return raw;
  return APPLY_TO_TYPES.has(fallback) ? fallback : 'order';
}

function normalizeMechanicType(value, fallback = 'simple_discount') {
  const raw = toText(value).toLowerCase();
  if (MECHANIC_TYPES.has(raw)) return raw;
  return MECHANIC_TYPES.has(fallback) ? fallback : 'simple_discount';
}

function normalizeRewardTypeValue(value, fallback = 'discount') {
  const raw = toText(value).toLowerCase();
  if (REWARD_TYPES.has(raw)) return raw;
  return REWARD_TYPES.has(fallback) ? fallback : 'discount';
}

function normalizeEntityList(items, allowedTypes = null) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  const seen = new Set();

  items.forEach((item) => {
    const entityType = toText(item?.entity_type || item?.target_type || item?.type).toLowerCase() || 'product';
    const entityId = Number(item?.entity_id || item?.id || 0);
    if (!Number.isInteger(entityId) || entityId <= 0) return;
    if (Array.isArray(allowedTypes) && !allowedTypes.includes(entityType)) return;
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      entity_type: entityType,
      entity_id: entityId,
      title: toText(item?.title) || null,
      product_config: entityType === 'product'
        ? normalizeProductConfigPayload(item?.product_config, entityId)
        : null,
    });
  });

  return normalized;
}

function createValidationError(code, statusCode = 400) {
  const err = new Error(code);
  err.statusCode = statusCode;
  return err;
}

function getBodyField(body, fieldName, fallbackValue = null) {
  if (body && Object.prototype.hasOwnProperty.call(body, fieldName)) {
    return body[fieldName];
  }
  return fallbackValue;
}

function validateEntityTargets(items, allowedTypes, errorCode) {
  if (items == null) return [];
  if (!Array.isArray(items)) {
    throw createValidationError(errorCode);
  }

  const normalized = [];
  const seen = new Set();

  items.forEach((item) => {
    const entityType = toText(item?.entity_type || item?.target_type || item?.type).toLowerCase();
    const entityId = Number(item?.entity_id || item?.id || 0);
    if (!allowedTypes.includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
      throw createValidationError(errorCode);
    }
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      entity_type: entityType,
      entity_id: entityId,
      title: toText(item?.title) || null,
      product_config: entityType === 'product'
        ? normalizeProductConfigPayload(item?.product_config, entityId)
        : null,
    });
  });

  return normalized;
}

function assertValidDateRange(body, existing = null) {
  const startsAt = toNullableText(getBodyField(body, 'starts_at', existing?.starts_at));
  const endsAt = toNullableText(getBodyField(body, 'ends_at', existing?.ends_at));
  if (!startsAt || !endsAt) return;

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    throw createValidationError('INVALID_DATE_RANGE');
  }
}

function assertValidRestrictionSchedule(body, existing = null) {
  const startsAt = toNullableText(getBodyField(body, 'starts_at', existing?.starts_at));
  const endsAt = toNullableText(getBodyField(body, 'ends_at', existing?.ends_at));
  if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
    throw createValidationError('PERIOD_BOUNDS_REQUIRED');
  }

  const rawScheduleDays = getBodyField(body, 'schedule_days', existing?.schedule_days);
  if (rawScheduleDays !== null && rawScheduleDays !== undefined) {
    const days = parseScheduleDays(rawScheduleDays);
    if (!days || !days.length) {
      throw createValidationError('WEEKDAYS_REQUIRED');
    }
  }

  const timeStart = toNullableText(getBodyField(body, 'schedule_time_start', existing?.schedule_time_start));
  const timeEnd = toNullableText(getBodyField(body, 'schedule_time_end', existing?.schedule_time_end));
  if ((timeStart && !timeEnd) || (!timeStart && timeEnd)) {
    throw createValidationError('TIME_BOUNDS_REQUIRED');
  }
  if (!timeStart || !timeEnd) return;

  const parseTimeToMinutes = (value) => {
    const parts = String(value || '').split(':').map((part) => Number(part));
    if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
    return (parts[0] * 60) + parts[1];
  };

  const startMinutes = parseTimeToMinutes(timeStart);
  const endMinutes = parseTimeToMinutes(timeEnd);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    throw createValidationError('INVALID_TIME_RANGE');
  }
}

function normalizeSimpleDiscountMechanic(source = {}, discountRow = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(discountRow?.mechanic_config_json, {});
  const fallbackVariant = toText(discountRow.activation_mode).toLowerCase() === 'promo_code'
    ? 'promo_code'
    : normalizeDiscountType(src?.discount_type ?? discountRow?.discount_type, normalizeDiscountType(discountRow?.discount_type));
  const simpleVariant = normalizeSimpleVariant(src?.simple_variant ?? src?.variant, fallbackVariant);
  const baseDiscountType = normalizeDiscountType(src?.discount_type ?? discountRow?.discount_type, normalizeDiscountType(discountRow?.discount_type));
  const baseDiscountValue = toNumberOrNull(src?.discount_value ?? discountRow?.discount_value);
  const baseApplyTo = normalizeApplyTo(src?.apply_to ?? discountRow?.apply_to, normalizeApplyTo(discountRow?.apply_to));
  const promoRewardSource = parseJsonObject(src?.promo_reward, {});
  const promoRewardType = normalizePromoRewardType(
    promoRewardSource?.reward_type ?? (
      ['gift', 'product_discount'].includes(toText(promoRewardSource?.reward_kind).toLowerCase())
        ? 'product'
        : 'discount'
    ),
    'discount'
  );
  const promoProductRewardType = normalizePromoProductRewardType(
    promoRewardSource?.product_reward_type ?? promoRewardSource?.reward_kind,
    'gift'
  );
  const promoReward = {
    reward_type: promoRewardType,
    product_reward_type: promoProductRewardType,
    reward_kind: promoRewardType === 'product' ? promoProductRewardType : 'discount',
    discount_type: normalizePromoDiscountType(
      promoRewardSource?.discount_type ?? src?.discount_type ?? discountRow?.discount_type,
      normalizePromoDiscountType(discountRow?.discount_type, 'percent')
    ),
    discount_value: promoRewardType === 'product' && promoProductRewardType === 'gift'
      ? null
      : toNumberOrNull(
          promoRewardSource?.discount_value ?? src?.discount_value ?? discountRow?.discount_value
        ),
    apply_to: promoRewardType === 'discount'
      ? normalizeApplyTo(
          promoRewardSource?.apply_to ?? src?.apply_to ?? discountRow?.apply_to,
          normalizeApplyTo(discountRow?.apply_to)
        )
      : 'product',
  };
  return {
    type: 'simple_discount',
    simple_variant: simpleVariant,
    products_config_mode: normalizeProductConfigMode(src?.products_config_mode ?? base?.products_config_mode, 'any'),
    discount_type: simpleVariant === 'promo_code' ? promoReward.discount_type : baseDiscountType,
    discount_value: simpleVariant === 'promo_code' ? promoReward.discount_value : baseDiscountValue,
    apply_to: simpleVariant === 'promo_code' ? promoReward.apply_to : baseApplyTo,
    promo_reward: promoReward,
  };
}

function normalizeBuyXGetYMechanic(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  const rewardDiscount = parseJsonObject(src.reward_discount, parseJsonObject(base.reward_discount, {}));

  return {
    type: 'buy_x_get_y',
    buy_qty: Math.max(1, toIntOrNull(src.buy_qty ?? base.buy_qty) || 5),
    reward_qty: Math.max(1, toIntOrNull(src.reward_qty ?? base.reward_qty) || 1),
    qualifying_mode: ['same_sku', 'pool'].includes(toText(src.qualifying_mode || base.qualifying_mode).toLowerCase())
      ? toText(src.qualifying_mode || base.qualifying_mode).toLowerCase()
      : 'same_sku',
    repeat_mode: ['single', 'repeat'].includes(toText(src.repeat_mode || base.repeat_mode).toLowerCase())
      ? toText(src.repeat_mode || base.repeat_mode).toLowerCase()
      : 'single',
    reward_source: ['same_pool', 'reward_list'].includes(toText(src.reward_source || base.reward_source).toLowerCase())
      ? toText(src.reward_source || base.reward_source).toLowerCase()
      : 'same_pool',
    reward_kind: ['gift', 'product_discount'].includes(toText(src.reward_kind || base.reward_kind).toLowerCase())
      ? toText(src.reward_kind || base.reward_kind).toLowerCase()
      : 'gift',
    qualifying_items_config_mode: normalizeProductConfigMode(src.qualifying_items_config_mode ?? base.qualifying_items_config_mode, 'any'),
    reward_products_config_mode: normalizeProductConfigMode(src.reward_products_config_mode ?? base.reward_products_config_mode, 'any'),
    reward_selection_mode: 'customer_choice',
    reward_item_addition: 'line_item',
    qualifying_items: normalizeEntityList(src.qualifying_items ?? base.qualifying_items, ['product', 'category', 'combo']),
    reward_products: normalizeEntityList(src.reward_products ?? base.reward_products, ['product']),
    reward_discount: {
      discount_type: normalizeDiscountType(rewardDiscount.discount_type, 'percent'),
      discount_value: toNumberOrNull(rewardDiscount.discount_value),
    },
  };
}

function normalizeThresholdTier(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  const normalizeThresholdDiscountSource = (value = {}, baseValue = {}) => {
    const source = parseJsonObject(value, {});
    const fallbackSource = parseJsonObject(baseValue, {});
    return {
      discount_id: toIntOrNull(source.discount_id ?? source.source_discount_id ?? fallbackSource.discount_id ?? fallbackSource.source_discount_id),
    };
  };
  const normalizeThresholdRewardKind = (value, fallbackKind = 'product') => {
    const raw = toText(value).toLowerCase();
    if (['product', 'product_list', 'discount_ref', 'promo_code_ref'].includes(raw)) return raw;
    if (raw === 'gift') return fallbackKind;
    if (raw === 'product_discount' || raw === 'order_discount') return 'discount_ref';
    return fallbackKind;
  };
  const rewardProducts = normalizeEntityList(src.reward_products ?? base.reward_products, ['product']);
  const rewardKind = normalizeThresholdRewardKind(
    src.reward_kind ?? base.reward_kind,
    rewardProducts.length > 1 ? 'product_list' : 'product'
  );
  const rewardDiscount = parseJsonObject(src.reward_discount, parseJsonObject(base.reward_discount, {}));
  const rewardDiscountSource = normalizeThresholdDiscountSource(src.reward_discount_source, base.reward_discount_source);
  const rewardPromoSource = normalizeLoyaltyPromoSource(src.reward_promo_source, base.reward_promo_source);

  return {
    id: toNullableText(src.id || base.id),
    min_amount: toNumberOrNull(src.min_amount ?? base.min_amount),
    buy_qty: normalizeCountField(src, base, 'buy_qty', 1),
    reward_qty: normalizeCountField(src, base, 'reward_qty', 1),
    reward_products_config_mode: normalizeProductConfigMode(src.reward_products_config_mode ?? base.reward_products_config_mode, 'any'),
    reward_kind: rewardKind,
    reward_selection_mode: ['discount_ref', 'promo_code_ref'].includes(rewardKind) ? 'reference' : 'customer_choice',
    reward_item_addition: ['discount_ref', 'promo_code_ref'].includes(rewardKind) ? null : 'line_item',
    reward_products: rewardKind === 'product'
      ? rewardProducts.slice(0, 1)
      : (rewardKind === 'product_list' ? rewardProducts : []),
    reward_discount_source: rewardKind === 'discount_ref'
      ? rewardDiscountSource
      : { discount_id: null },
    reward_promo_source: rewardKind === 'promo_code_ref'
      ? rewardPromoSource
      : {
          source_promo_code_id: null,
          source_discount_id: null,
          source_code: '',
        },
    reward_discount: {
      discount_type: normalizeDiscountType(rewardDiscount.discount_type, 'percent'),
      discount_value: toNumberOrNull(rewardDiscount.discount_value),
    },
  };
}

function normalizeThresholdMechanic(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  const tiersRaw = Array.isArray(src.tiers) ? src.tiers : (Array.isArray(base.tiers) ? base.tiers : []);
  const tiers = tiersRaw
    .map((tier, index) => normalizeThresholdTier(tier, Array.isArray(base.tiers) ? base.tiers[index] : {}))
    .filter((tier) => (
      tier.min_amount != null
      || tier.reward_products.length
      || Number(tier?.reward_discount_source?.discount_id || 0) > 0
      || Number(tier?.reward_promo_source?.source_promo_code_id || 0) > 0
      || tier.reward_discount.discount_value != null
    ));

  return {
    type: 'threshold',
    threshold_basis: ['before_discounts', 'after_discounts'].includes(toText(src.threshold_basis || base.threshold_basis).toLowerCase())
      ? toText(src.threshold_basis || base.threshold_basis).toLowerCase()
      : 'before_discounts',
    threshold_apply_mode: ['best_only', 'cumulative'].includes(toText(src.threshold_apply_mode || base.threshold_apply_mode).toLowerCase())
      ? toText(src.threshold_apply_mode || base.threshold_apply_mode).toLowerCase()
      : 'best_only',
    tiers,
  };
}

function normalizeLoyaltyDiscountReward(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  const applyTo = normalizeApplyTo(src.apply_to ?? base.apply_to, normalizeApplyTo(base.apply_to, 'order'));
  const products = applyTo === 'order'
    ? []
    : normalizeEntityList(src.products ?? base.products, ['product', 'category']);

  return {
    apply_to: ['order', 'product', 'category'].includes(applyTo) ? applyTo : 'order',
    discount_type: normalizeDiscountType(src.discount_type ?? base.discount_type, normalizeDiscountType(base.discount_type, 'percent')),
    discount_value: toNumberOrNull(src.discount_value ?? base.discount_value),
    products,
  };
}

function normalizeLoyaltyPromoSource(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  return {
    source_promo_code_id: toIntOrNull(src.source_promo_code_id ?? base.source_promo_code_id),
    source_discount_id: toIntOrNull(src.source_discount_id ?? base.source_discount_id),
    source_code: normalizePromoCode(src.source_code ?? base.source_code),
  };
}

function normalizeLoyaltyProgressMechanic(source = {}, fallback = {}) {
  const src = parseJsonObject(source, {});
  const base = parseJsonObject(fallback, {});
  const progressBasis = normalizeLoyaltyProgressBasis(src.progress_basis ?? base.progress_basis, 'orders');
  const rawScopeMode = normalizeLoyaltyScopeMode(
    src.qualifying_scope_mode ?? base.qualifying_scope_mode,
    progressBasis === 'items' ? 'product' : 'none'
  );
  const qualifyingScopeMode = progressBasis === 'items' ? rawScopeMode : 'none';
  const rawQualifyingItems = normalizeEntityList(src.qualifying_items ?? base.qualifying_items, ['product', 'category']);
  const qualifyingItems = qualifyingScopeMode === 'none'
    ? []
    : rawQualifyingItems.filter((item) => (
        qualifyingScopeMode === 'category'
          ? item.entity_type === 'category'
          : item.entity_type === 'product'
      ));
  const reward = parseJsonObject(src.reward, parseJsonObject(base.reward, {}));
  const rewardDiscount = parseJsonObject(reward.discount, parseJsonObject(base.reward?.discount, {}));
  const rewardKind = normalizeLoyaltyRewardKind(src.reward_kind ?? reward.reward_kind ?? base.reward_kind, 'gift');
  const giftProductsConfigMode = normalizeProductConfigMode(
    src.gift_products_config_mode
      ?? reward.gift_products_config_mode
      ?? base.gift_products_config_mode
      ?? base.reward?.gift_products_config_mode,
    'any'
  );
  const rewardProductsConfigMode = normalizeProductConfigMode(
    src.reward_products_config_mode
      ?? reward.reward_products_config_mode
      ?? rewardDiscount.products_config_mode
      ?? base.reward_products_config_mode
      ?? base.reward?.reward_products_config_mode
      ?? base.reward?.discount?.products_config_mode,
    'any'
  );

  return {
    type: 'loyalty_progress',
    buy_qty: normalizeCountField(src, base, 'buy_qty', 1),
    reward_qty: normalizeCountField(src, base, 'reward_qty', 1),
    progress_basis: progressBasis,
    threshold_value: toNumberOrNull(src.threshold_value ?? base.threshold_value),
    status_filter: 'completed',
    qualifying_scope_mode: qualifyingScopeMode,
    qualifying_items_config_mode: normalizeProductConfigMode(src.qualifying_items_config_mode ?? base.qualifying_items_config_mode, 'any'),
    qualifying_items: qualifyingItems,
    reward_kind: rewardKind,
    issue_mode: 'automatic',
    pending_reward_mode: normalizeLoyaltyPendingRewardMode(src.pending_reward_mode ?? base.pending_reward_mode, 'stack'),
    redemption_mode: 'reset',
    gift_products_config_mode: giftProductsConfigMode,
    reward_products_config_mode: rewardProductsConfigMode,
    reward: {
      gift_products: rewardKind === 'gift'
        ? normalizeEntityList(reward.gift_products, ['product'])
        : [],
      discount: normalizeLoyaltyDiscountReward(reward.discount, base.reward?.discount),
      promo_code: normalizeLoyaltyPromoSource(reward.promo_code, base.reward?.promo_code),
    },
  };
}

function normalizeMechanicFromDiscount(discount) {
  const row = normalizeDiscountRow(discount || {});
  const mechanicType = normalizeMechanicType(row.mechanic_type, 'simple_discount');
  const config = parseJsonObject(row.mechanic_config_json, {});
  if (mechanicType === 'buy_x_get_y') {
    return normalizeBuyXGetYMechanic(config, {});
  }
  if (mechanicType === 'threshold') {
    return normalizeThresholdMechanic(config, {});
  }
  if (mechanicType === 'loyalty_progress') {
    return normalizeLoyaltyProgressMechanic(config, {});
  }
  return normalizeSimpleDiscountMechanic(config, row);
}

function deriveRewardType(mechanicType, mechanic, fallback = 'discount') {
  if (mechanicType === 'simple_discount') {
    if (normalizeSimpleVariant(mechanic?.simple_variant, 'percent') === 'promo_code') {
      const rewardKind = toText(mechanic?.promo_reward?.reward_kind).toLowerCase();
      if (rewardKind === 'gift') return 'gift';
      if (rewardKind === 'product_discount') return 'product_discount';
    }
    return 'discount';
  }
  if (mechanicType === 'buy_x_get_y') {
    return mechanic?.reward_kind === 'product_discount' ? 'product_discount' : 'gift';
  }
  if (mechanicType === 'threshold') {
    const kinds = Array.isArray(mechanic?.tiers)
      ? [...new Set(mechanic.tiers.map((tier) => {
          const raw = String(tier?.reward_kind || '').toLowerCase();
          if (raw === 'product' || raw === 'product_list' || raw === 'gift') return 'gift';
          if (raw === 'promo_code_ref') return 'bonus';
          if (raw === 'discount_ref' || raw === 'product_discount' || raw === 'order_discount') return 'discount';
          return raw;
        }).filter(Boolean))]
      : [];
    if (kinds.length <= 1) {
      if (kinds[0] === 'gift') return 'gift';
      if (kinds[0] === 'bonus') return 'bonus';
      if (kinds[0] === 'discount') return 'discount';
      return normalizeRewardTypeValue(fallback, 'discount');
    }
    return 'mixed';
  }
  if (mechanicType === 'loyalty_progress') {
    if (mechanic?.reward_kind === 'gift') return 'gift';
    if (mechanic?.reward_kind === 'promo_code') return 'bonus';
    return 'discount';
  }
  return 'discount';
}

function isPromoSimpleDiscountMechanic(mechanicType, mechanic) {
  return mechanicType === 'simple_discount' && normalizeSimpleVariant(mechanic?.simple_variant, 'percent') === 'promo_code';
}

function isPlainSimpleDiscountMechanic(mechanicType, mechanic) {
  return mechanicType === 'simple_discount' && !isPromoSimpleDiscountMechanic(mechanicType, mechanic);
}

async function assertThresholdRewardSourcesExist(conn, tenantId, storeId, mechanic, { currentDiscountId = null } = {}) {
  const tiers = Array.isArray(mechanic?.tiers) ? mechanic.tiers : [];
  if (!tiers.length) return;

  const discountIds = [...new Set(
    tiers
      .map((tier) => toIntOrNull(tier?.reward_discount_source?.discount_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (discountIds.length) {
    const [rows] = await conn.query(
      `SELECT id, title, discount_type, discount_value, apply_to,
              is_active, activation_mode, mechanic_type, mechanic_config_json
         FROM mkt_discounts
        WHERE tenant_id = ? AND store_id = ? AND id IN (?)`,
      [tenantId, storeId, discountIds]
    );

    const validDiscountIds = new Set(
      rows
        .filter((row) => {
          const discountId = Number(row?.id || 0);
          if (!(discountId > 0)) return false;
          if (currentDiscountId && discountId === Number(currentDiscountId)) return false;
          const linkedMechanicType = normalizeMechanicType(row.mechanic_type, 'simple_discount');
          const linkedMechanic = normalizeMechanicFromDiscount(row);
          return isPlainSimpleDiscountMechanic(linkedMechanicType, linkedMechanic);
        })
        .map((row) => Number(row.id || 0))
    );

    if (discountIds.some((id) => !validDiscountIds.has(id))) {
      throw createValidationError('INVALID_THRESHOLD_DISCOUNT_SOURCE');
    }
  }

  const promoCodeIds = [...new Set(
    tiers
      .map((tier) => toIntOrNull(tier?.reward_promo_source?.source_promo_code_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (promoCodeIds.length) {
    const [rows] = await conn.query(
      `SELECT pc.id AS promo_code_id,
              pc.discount_id,
              pc.code_mode,
              pc.code,
              d.activation_mode,
              d.mechanic_type,
              d.mechanic_config_json
         FROM mkt_discount_promo_codes pc
         INNER JOIN mkt_discounts d
           ON d.id = pc.discount_id
          AND d.tenant_id = pc.tenant_id
          AND d.store_id = pc.store_id
        WHERE pc.tenant_id = ? AND pc.store_id = ? AND pc.id IN (?)`,
      [tenantId, storeId, promoCodeIds]
    );

    const validPromoCodeIds = new Set(
      rows
        .filter((row) => {
          const promoCodeId = Number(row?.promo_code_id || 0);
          if (!(promoCodeId > 0)) return false;
          if (toText(row?.code_mode).toLowerCase() !== 'shared') return false;
          const linkedMechanicType = normalizeMechanicType(row.mechanic_type, 'simple_discount');
          const linkedMechanic = normalizeMechanicFromDiscount(row);
          return isPromoSimpleDiscountMechanic(linkedMechanicType, linkedMechanic);
        })
        .map((row) => Number(row.promo_code_id || 0))
    );

    if (promoCodeIds.some((id) => !validPromoCodeIds.has(id))) {
      throw createValidationError('INVALID_THRESHOLD_PROMO_SOURCE');
    }
  }
}

function buildMechanicStoragePayload(body, existing = null) {
  const existingMechanic = existing ? normalizeMechanicFromDiscount(existing) : null;
  const mechanicType = normalizeMechanicType(body?.mechanic_type || existing?.mechanic_type, 'simple_discount');
  const mechanicSource = parseJsonObject(body?.mechanic, {});

  if (mechanicType === 'buy_x_get_y') {
    const mechanic = normalizeBuyXGetYMechanic(mechanicSource, existingMechanic?.type === 'buy_x_get_y' ? existingMechanic : {});
    return {
      mechanicType,
      mechanic,
      mechanicConfigJson: JSON.stringify(mechanic),
      rewardType: deriveRewardType(mechanicType, mechanic, existing?.reward_type),
      discountType: 'percent',
      discountValue: 0,
      applyTo: 'order',
    };
  }

  if (mechanicType === 'threshold') {
    const mechanic = normalizeThresholdMechanic(mechanicSource, existingMechanic?.type === 'threshold' ? existingMechanic : {});
    return {
      mechanicType,
      mechanic,
      mechanicConfigJson: JSON.stringify(mechanic),
      rewardType: deriveRewardType(mechanicType, mechanic, existing?.reward_type),
      discountType: 'percent',
      discountValue: 0,
      applyTo: 'order',
    };
  }

  if (mechanicType === 'loyalty_progress') {
    const mechanic = normalizeLoyaltyProgressMechanic(mechanicSource, existingMechanic?.type === 'loyalty_progress' ? existingMechanic : {});
    const rewardDiscount = mechanic.reward?.discount || {};
    return {
      mechanicType,
      mechanic,
      mechanicConfigJson: JSON.stringify(mechanic),
      rewardType: deriveRewardType(mechanicType, mechanic, existing?.reward_type),
      discountType: mechanic.reward_kind === 'discount' ? rewardDiscount.discount_type : 'percent',
      discountValue: mechanic.reward_kind === 'discount' ? (rewardDiscount.discount_value ?? 0) : 0,
      applyTo: mechanic.reward_kind === 'discount' ? (rewardDiscount.apply_to || 'order') : 'order',
    };
  }

  const existingSimpleMechanic = existingMechanic?.type === 'simple_discount' ? existingMechanic : normalizeSimpleDiscountMechanic({}, existing || {});
  const simpleVariant = normalizeSimpleVariant(
    mechanicSource?.simple_variant ?? (toBoolFlag(body?.promo?.enabled) ? 'promo_code' : body?.discount_type),
    existingSimpleMechanic?.simple_variant || 'percent'
  );
  const simpleSource = simpleVariant === 'promo_code'
    ? {
        simple_variant: 'promo_code',
        products_config_mode: mechanicSource?.products_config_mode ?? existingSimpleMechanic?.products_config_mode ?? 'any',
        promo_reward: {
          reward_type: mechanicSource?.promo_reward?.reward_type ?? existingSimpleMechanic?.promo_reward?.reward_type ?? 'discount',
          product_reward_type: mechanicSource?.promo_reward?.product_reward_type ?? existingSimpleMechanic?.promo_reward?.product_reward_type ?? existingSimpleMechanic?.promo_reward?.reward_kind ?? 'gift',
          reward_kind: mechanicSource?.promo_reward?.reward_kind ?? existingSimpleMechanic?.promo_reward?.reward_kind ?? 'discount',
          discount_type: mechanicSource?.promo_reward?.discount_type ?? existingSimpleMechanic?.promo_reward?.discount_type ?? existing?.discount_type,
          discount_value: mechanicSource?.promo_reward?.discount_value ?? existingSimpleMechanic?.promo_reward?.discount_value ?? existing?.discount_value,
          apply_to: mechanicSource?.promo_reward?.apply_to ?? existingSimpleMechanic?.promo_reward?.apply_to ?? existing?.apply_to,
        },
      }
    : {
        simple_variant: simpleVariant,
        products_config_mode: mechanicSource?.products_config_mode ?? existingSimpleMechanic?.products_config_mode ?? 'any',
        discount_type: body?.discount_type ?? mechanicSource?.discount_type ?? simpleVariant,
        discount_value: body?.discount_value ?? mechanicSource?.discount_value,
        apply_to: body?.apply_to ?? mechanicSource?.apply_to,
      };
  const mechanic = normalizeSimpleDiscountMechanic(simpleSource, existing || {});
  return {
    mechanicType: 'simple_discount',
    mechanic,
    mechanicConfigJson: JSON.stringify(mechanic),
    rewardType: deriveRewardType('simple_discount', mechanic, existing?.reward_type),
    discountType: mechanic.discount_type,
    discountValue: mechanic.discount_value ?? 0,
    applyTo: mechanic.apply_to,
  };
}

function assertMechanicIsValid(mechanicType, mechanic, { products = [] } = {}) {
  if (mechanicType === 'simple_discount') {
    const isPromo = normalizeSimpleVariant(mechanic?.simple_variant, 'percent') === 'promo_code';
    const reward = isPromo ? mechanic?.promo_reward : mechanic;
    const promoRewardType = isPromo ? normalizePromoRewardType(reward?.reward_type, 'discount') : 'discount';
    const promoProductRewardType = isPromo ? normalizePromoProductRewardType(reward?.product_reward_type ?? reward?.reward_kind, 'gift') : 'gift';
    const applyTo = normalizeApplyTo(reward?.apply_to, 'order');
    if (applyTo !== 'order' && !products.length) {
      throw createValidationError('PRODUCTS_REQUIRED');
    }
    if (isPromo && promoRewardType === 'product' && promoProductRewardType === 'gift') {
      if (!products.length) {
        throw createValidationError('PROMO_REWARD_PRODUCTS_REQUIRED');
      }
      return;
    }
    if (toText(reward?.discount_type).toLowerCase() === 'special_price' && applyTo !== 'product') {
      throw createValidationError('SPECIAL_PRICE_PRODUCT_ONLY');
    }
    if (!(Number(reward?.discount_value) > 0)) {
      throw createValidationError('INVALID_DISCOUNT_VALUE');
    }
    return;
  }

  if (mechanicType === 'buy_x_get_y') {
    if (!(Number(mechanic?.buy_qty) > 0) || !(Number(mechanic?.reward_qty) > 0)) {
      throw createValidationError('INVALID_MECHANIC_CONFIG');
    }
    if (mechanic.qualifying_mode === 'pool' && !mechanic.qualifying_items.length) {
      throw createValidationError('QUALIFYING_ITEMS_REQUIRED');
    }
    if (mechanic.qualifying_mode === 'pool') {
      const typeSet = new Set(
        (Array.isArray(mechanic.qualifying_items) ? mechanic.qualifying_items : [])
          .map((item) => toText(item?.entity_type || item?.type).toLowerCase())
          .filter(Boolean)
      );
      if (typeSet.has('product') && typeSet.has('category')) {
        throw createValidationError('INVALID_QUALIFYING_ITEMS');
      }
    }
    if (mechanic.reward_source === 'reward_list' && !mechanic.reward_products.length) {
      throw createValidationError('REWARD_PRODUCTS_REQUIRED');
    }
    if (mechanic.reward_kind === 'product_discount' && !(Number(mechanic?.reward_discount?.discount_value) > 0)) {
      throw createValidationError('INVALID_REWARD_DISCOUNT');
    }
    return;
  }

  if (mechanicType === 'loyalty_progress') {
    if (!(Number(mechanic?.buy_qty) > 0) || !(Number(mechanic?.reward_qty) > 0)) {
      throw createValidationError('INVALID_MECHANIC_CONFIG');
    }
    if (!(Number(mechanic?.threshold_value) > 0)) {
      throw createValidationError('INVALID_PROGRESS_THRESHOLD');
    }

    const progressBasis = normalizeLoyaltyProgressBasis(mechanic?.progress_basis, 'orders');
    const scopeMode = progressBasis === 'items'
      ? normalizeLoyaltyScopeMode(mechanic?.qualifying_scope_mode, 'product')
      : 'none';
    const qualifyingItems = Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [];
    const rewardKind = normalizeLoyaltyRewardKind(mechanic?.reward_kind, 'gift');

    if (progressBasis !== 'items') {
      if (qualifyingItems.length) {
        throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
      }
    } else {
      if (!qualifyingItems.length) {
        throw createValidationError('LOYALTY_QUALIFYING_ITEMS_REQUIRED');
      }
      const typeSet = new Set(
        qualifyingItems
          .map((item) => toText(item?.entity_type || item?.type).toLowerCase())
          .filter(Boolean)
      );
      if (scopeMode === 'category') {
        if (typeSet.size !== 1 || !typeSet.has('category')) {
          throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
        }
      } else {
        if (typeSet.size !== 1 || !typeSet.has('product')) {
          throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
        }
        if (scopeMode === 'product' && qualifyingItems.length !== 1) {
          throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
        }
      }
    }

    if (rewardKind === 'promo_code') {
      if (!(Number(mechanic?.reward?.promo_code?.source_promo_code_id) > 0) || !toText(mechanic?.reward?.promo_code?.source_code)) {
        throw createValidationError('LOYALTY_PROMO_SOURCE_REQUIRED');
      }
      return;
    }

    if (rewardKind === 'gift') {
      if (!Array.isArray(mechanic?.reward?.gift_products) || !mechanic.reward.gift_products.length) {
        throw createValidationError('LOYALTY_REWARD_PRODUCTS_REQUIRED');
      }
      return;
    }

    const discountReward = parseJsonObject(mechanic?.reward?.discount, {});
    const applyTo = normalizeApplyTo(discountReward.apply_to, 'order');
    const rewardProducts = normalizeEntityList(discountReward.products, ['product', 'category']);
    if (!['order', 'product', 'category'].includes(applyTo)) {
      throw createValidationError('INVALID_MECHANIC_CONFIG');
    }
    if (toText(discountReward.discount_type).toLowerCase() === 'special_price' && applyTo !== 'product') {
      throw createValidationError('SPECIAL_PRICE_PRODUCT_ONLY');
    }
    if (!(Number(discountReward.discount_value) > 0)) {
      throw createValidationError('INVALID_DISCOUNT_VALUE');
    }
    if (applyTo !== 'order' && !rewardProducts.length) {
      throw createValidationError('LOYALTY_REWARD_PRODUCTS_REQUIRED');
    }
    if (applyTo === 'product' && rewardProducts.some((item) => item.entity_type !== 'product')) {
      throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
    }
    if (applyTo === 'category' && rewardProducts.some((item) => item.entity_type !== 'category')) {
      throw createValidationError('INVALID_PROGRESS_SCOPE_ITEMS');
    }
    return;
  }

  const tiers = Array.isArray(mechanic?.tiers) ? mechanic.tiers : [];
  if (!tiers.length) {
    throw createValidationError('THRESHOLD_TIERS_REQUIRED');
  }
  for (const tier of tiers) {
    if (!(Number(tier?.min_amount) > 0)) {
      throw createValidationError('INVALID_THRESHOLD_TIER');
    }
    if (!(Number(tier?.buy_qty) > 0) || !(Number(tier?.reward_qty) > 0)) {
      throw createValidationError('INVALID_THRESHOLD_TIER');
    }
    if (!['product', 'product_list', 'discount_ref', 'promo_code_ref'].includes(String(tier?.reward_kind || '').toLowerCase())) {
      throw createValidationError('INVALID_THRESHOLD_TIER');
    }
    if ((tier.reward_kind === 'product' || tier.reward_kind === 'product_list')
      && (!Array.isArray(tier.reward_products) || !tier.reward_products.length)) {
      throw createValidationError('REWARD_PRODUCTS_REQUIRED');
    }
    if (tier.reward_kind === 'product' && tier.reward_products.length !== 1) {
      throw createValidationError('INVALID_THRESHOLD_TIER');
    }
    if (tier.reward_kind === 'discount_ref' && !(Number(tier?.reward_discount_source?.discount_id || 0) > 0)) {
      throw createValidationError('THRESHOLD_DISCOUNT_SOURCE_REQUIRED');
    }
    if (tier.reward_kind === 'promo_code_ref' && !(Number(tier?.reward_promo_source?.source_promo_code_id || 0) > 0)) {
      throw createValidationError('THRESHOLD_PROMO_SOURCE_REQUIRED');
    }
  }
}

function buildPromoPayload(discount, promoCodes = []) {
  const discountRow = normalizeDiscountRow(discount || {});
  const mechanic = normalizeMechanicFromDiscount(discountRow);
  const rows = Array.isArray(promoCodes) ? promoCodes : [];
  const sharedRow = rows.find((row) => String(row?.code_mode || '') === 'shared') || null;
  const uniqueRows = rows.filter((row) => String(row?.code_mode || '') === 'unique');
  const codeMode = toText(discountRow.promo_code_mode) || (sharedRow ? 'shared' : 'unique');
  const uniqueCodeUsageLimit = toIntOrNull(discountRow.unique_code_usage_limit);
  const enabled = isPromoSimpleDiscountMechanic(mechanic.type, mechanic);

  return {
    enabled,
    code_mode: codeMode || 'shared',
    shared_code_id: sharedRow ? Number(sharedRow.id || 0) : null,
    shared_code: sharedRow ? String(sharedRow.code || '') : '',
    shared_code_usage_limit: sharedRow && sharedRow.usage_limit != null ? Number(sharedRow.usage_limit) : null,
    shared_code_usage_count: sharedRow ? Number(sharedRow.usage_count || 0) : 0,
    unique_code_usage_limit: uniqueCodeUsageLimit != null ? uniqueCodeUsageLimit : 1,
    unique_codes_count: uniqueRows.length,
    unique_codes_active_count: uniqueRows.filter((row) => Number(row?.is_active || 0) === 1).length,
    unique_codes_used_count: uniqueRows.filter((row) => Number(row?.usage_count || 0) > 0).length,
  };
}

function normalizePromoCodeRow(row) {
  return {
    ...row,
    id: Number(row.id || 0),
    discount_id: Number(row.discount_id || 0),
    is_active: Number(row.is_active || 0) === 1 ? 1 : 0,
    usage_limit: row.usage_limit == null ? null : Number(row.usage_limit || 0),
    usage_count: Number(row.usage_count || 0),
    assigned_customer_id: row.assigned_customer_id == null ? null : Number(row.assigned_customer_id || 0),
  };
}

function mapDiscountCustomerRow(row) {
  if (row.customer_id) {
    return {
      entity_type: 'customer',
      entity_id: Number(row.customer_id || 0),
      title: row.customer_name || row.customer_phone || `Клиент #${row.customer_id}`,
      phone: row.customer_phone || '',
    };
  }
  if (row.customer_category_id) {
    return {
      entity_type: 'category',
      entity_id: Number(row.customer_category_id || 0),
      title: row.category_title || `Категория #${row.customer_category_id}`,
    };
  }
  return null;
}

function mapDiscountProductRow(row) {
  if (row.product_id) {
    const productId = Number(row.product_id || 0);
    return {
      entity_type: 'product',
      entity_id: productId,
      title: row.product_title || `\u0422\u043e\u0432\u0430\u0440 #${productId}`,
      image_url: row.product_image_url || null,
      product_config: normalizeProductConfigPayload(row.product_config_json, productId),
    };
  }
  if (row.product_id) {
    return {
      entity_type: 'product',
      entity_id: Number(row.product_id || 0),
      title: row.product_title || `Товар #${row.product_id}`,
    };
  }
  if (row.category_id) {
    return {
      entity_type: 'category',
      entity_id: Number(row.category_id || 0),
      title: row.category_title || `Категория #${row.category_id}`,
    };
  }
  if (row.combo_id) {
    return {
      entity_type: 'combo',
      entity_id: Number(row.combo_id || 0),
      title: row.combo_title || `Комбо #${row.combo_id}`,
    };
  }
  return null;
}

function groupDiscountRelationRows(rows, mapper) {
  const result = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const discountId = Number(row?.discount_id || 0);
    const entity = mapper(row);
    if (!(discountId > 0) || !entity) return;
    if (!result.has(discountId)) {
      result.set(discountId, []);
    }
    result.get(discountId).push(entity);
  });
  return result;
}

function collectMechanicEntityRefs(mechanic, refs = null) {
  const result = refs || {
    productIds: new Set(),
    categoryIds: new Set(),
    comboIds: new Set(),
  };

  const collectItem = (item) => {
    const entityType = toText(item?.entity_type || item?.target_type || item?.type).toLowerCase();
    const entityId = Number(item?.entity_id || item?.id || 0);
    if (!Number.isInteger(entityId) || entityId <= 0) return;
    if (entityType === 'product') {
      result.productIds.add(entityId);
      return;
    }
    if (entityType === 'category') {
      result.categoryIds.add(entityId);
      return;
    }
    if (entityType === 'combo') {
      result.comboIds.add(entityId);
    }
  };

  if (!mechanic || typeof mechanic !== 'object') {
    return result;
  }

  if (mechanic.type === 'buy_x_get_y') {
    (Array.isArray(mechanic.qualifying_items) ? mechanic.qualifying_items : []).forEach(collectItem);
    (Array.isArray(mechanic.reward_products) ? mechanic.reward_products : []).forEach(collectItem);
    return result;
  }

  if (mechanic.type === 'loyalty_progress') {
    (Array.isArray(mechanic.qualifying_items) ? mechanic.qualifying_items : []).forEach(collectItem);
    (Array.isArray(mechanic?.reward?.gift_products) ? mechanic.reward.gift_products : []).forEach(collectItem);
    (Array.isArray(mechanic?.reward?.discount?.products) ? mechanic.reward.discount.products : []).forEach(collectItem);
    return result;
  }

  if (mechanic.type === 'threshold') {
    (Array.isArray(mechanic.tiers) ? mechanic.tiers : []).forEach((tier) => {
      (Array.isArray(tier?.reward_products) ? tier.reward_products : []).forEach(collectItem);
    });
  }

  return result;
}

function createMechanicEntityLookup() {
  return {
    products: new Map(),
    categories: new Map(),
    combos: new Map(),
  };
}

function mapMechanicProductLookupRow(row) {
  let imageUrl = null;
  try {
    const photos = JSON.parse(row.product_photos_json || '[]');
    imageUrl = Array.isArray(photos) && photos.length
      ? String(photos[0] || '').trim() || null
      : null;
  } catch {}
  return {
    title: toText(row.product_title) || `Товар #${row.id}`,
    image_url: imageUrl,
  };
}

async function loadMechanicEntityLookup(dbConn, tenantId, refs) {
  const lookup = createMechanicEntityLookup();
  const productIds = [...(refs?.productIds || new Set())];
  const categoryIds = [...(refs?.categoryIds || new Set())];
  const comboIds = [...(refs?.comboIds || new Set())];

  const queries = [];
  if (productIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, name AS product_title, photos_json AS product_photos_json
         FROM prod_products
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, productIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  if (categoryIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, title AS category_title
         FROM prod_categories
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, categoryIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  if (comboIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, title AS combo_title
         FROM prod_combos
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, comboIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  const [[productRows], [categoryRows], [comboRows]] = await Promise.all(queries);

  (Array.isArray(productRows) ? productRows : []).forEach((row) => {
    lookup.products.set(Number(row.id || 0), mapMechanicProductLookupRow(row));
  });
  (Array.isArray(categoryRows) ? categoryRows : []).forEach((row) => {
    lookup.categories.set(Number(row.id || 0), {
      title: toText(row.category_title) || `Категория #${row.id}`,
    });
  });
  (Array.isArray(comboRows) ? comboRows : []).forEach((row) => {
    lookup.combos.set(Number(row.id || 0), {
      title: toText(row.combo_title) || `Комбо #${row.id}`,
    });
  });

  return lookup;
}

function enrichMechanicEntityList(items, lookup) {
  if (!Array.isArray(items) || !items.length) return [];
  return items
    .map((item) => {
      const entityType = toText(item?.entity_type || item?.target_type || item?.type).toLowerCase();
      const entityId = Number(item?.entity_id || item?.id || 0);
      if (!Number.isInteger(entityId) || entityId <= 0) return null;
      const base = {
        entity_type: entityType,
        entity_id: entityId,
      };

      if (entityType === 'product') {
        const match = lookup?.products?.get(entityId);
        const productConfig = normalizeProductConfigPayload(item?.product_config, entityId);
        if (productConfig) {
          return {
            ...base,
            title: toText(item?.title) || match?.title || `\u0422\u043e\u0432\u0430\u0440 #${entityId}`,
            image_url: toText(item?.image_url) || match?.image_url || null,
            product_config: productConfig,
          };
        }
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Товар #${entityId}`,
          image_url: toText(item?.image_url) || match?.image_url || null,
        };
      }
      if (entityType === 'category') {
        const match = lookup?.categories?.get(entityId);
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Категория #${entityId}`,
        };
      }
      if (entityType === 'combo') {
        const match = lookup?.combos?.get(entityId);
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Комбо #${entityId}`,
        };
      }
      return {
        ...base,
        title: toText(item?.title) || null,
      };
    })
    .filter(Boolean);
}

function enrichMechanicForResponse(mechanic, lookup) {
  if (!mechanic || typeof mechanic !== 'object') return mechanic;

  if (mechanic.type === 'buy_x_get_y') {
    return {
      ...mechanic,
      qualifying_items: enrichMechanicEntityList(mechanic.qualifying_items, lookup),
      reward_products: enrichMechanicEntityList(mechanic.reward_products, lookup),
    };
  }

  if (mechanic.type === 'loyalty_progress') {
    return {
      ...mechanic,
      qualifying_items: enrichMechanicEntityList(mechanic.qualifying_items, lookup),
      reward: {
        ...parseJsonObject(mechanic.reward, {}),
        gift_products: enrichMechanicEntityList(mechanic?.reward?.gift_products, lookup),
        discount: {
          ...parseJsonObject(mechanic?.reward?.discount, {}),
          products: enrichMechanicEntityList(mechanic?.reward?.discount?.products, lookup),
        },
      },
    };
  }

  if (mechanic.type === 'threshold') {
    return {
      ...mechanic,
      tiers: (Array.isArray(mechanic.tiers) ? mechanic.tiers : []).map((tier) => ({
        ...tier,
        reward_products: enrichMechanicEntityList(tier?.reward_products, lookup),
      })),
    };
  }

  return mechanic;
}

function mapMechanicProductLookupRow(row) {
  let imageUrl = null;
  try {
    const photos = JSON.parse(row.product_photos_json || '[]');
    imageUrl = Array.isArray(photos) && photos.length
      ? String(photos[0] || '').trim() || null
      : null;
  } catch {}
  return {
    title: toText(row.product_title) || `Товар #${row.id}`,
    image_url: imageUrl,
  };
}

async function loadMechanicEntityLookup(dbConn, tenantId, refs) {
  const lookup = createMechanicEntityLookup();
  const productIds = [...(refs?.productIds || new Set())];
  const categoryIds = [...(refs?.categoryIds || new Set())];
  const comboIds = [...(refs?.comboIds || new Set())];

  const queries = [];
  if (productIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, name AS product_title, photos_json AS product_photos_json
         FROM prod_products
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, productIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  if (categoryIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, title AS category_title
         FROM prod_categories
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, categoryIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  if (comboIds.length) {
    queries.push(
      dbConn.query(
        `SELECT id, title AS combo_title
         FROM prod_combos
         WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, comboIds]
      )
    );
  } else {
    queries.push(Promise.resolve([[]]));
  }

  const [[productRows], [categoryRows], [comboRows]] = await Promise.all(queries);

  (Array.isArray(productRows) ? productRows : []).forEach((row) => {
    lookup.products.set(Number(row.id || 0), mapMechanicProductLookupRow(row));
  });
  (Array.isArray(categoryRows) ? categoryRows : []).forEach((row) => {
    lookup.categories.set(Number(row.id || 0), {
      title: toText(row.category_title) || `Категория #${row.id}`,
    });
  });
  (Array.isArray(comboRows) ? comboRows : []).forEach((row) => {
    lookup.combos.set(Number(row.id || 0), {
      title: toText(row.combo_title) || `Комбо #${row.id}`,
    });
  });

  return lookup;
}

function enrichMechanicEntityList(items, lookup) {
  if (!Array.isArray(items) || !items.length) return [];
  return items
    .map((item) => {
      const entityType = toText(item?.entity_type || item?.target_type || item?.type).toLowerCase();
      const entityId = Number(item?.entity_id || item?.id || 0);
      if (!Number.isInteger(entityId) || entityId <= 0) return null;
      const base = {
        entity_type: entityType,
        entity_id: entityId,
      };

      if (entityType === 'product') {
        const match = lookup?.products?.get(entityId);
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Товар #${entityId}`,
          image_url: toText(item?.image_url) || match?.image_url || null,
        };
      }
      if (entityType === 'category') {
        const match = lookup?.categories?.get(entityId);
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Категория #${entityId}`,
        };
      }
      if (entityType === 'combo') {
        const match = lookup?.combos?.get(entityId);
        return {
          ...base,
          title: toText(item?.title) || match?.title || `Комбо #${entityId}`,
        };
      }
      return {
        ...base,
        title: toText(item?.title) || null,
      };
    })
    .filter(Boolean);
}

function formatDiscountResponse(discount, { customers = [], products = [], promoCodes = [] } = {}) {
  const normalized = normalizeDiscountRow(discount || {});
  try {
    const mechanicType = normalizeMechanicType(normalized.mechanic_type, 'simple_discount');
    const mechanic = normalizeMechanicFromDiscount(normalized);
    return {
      ...normalized,
      mechanic_type: mechanicType,
      mechanic,
      reward_type: deriveRewardType(mechanicType, mechanic, normalized.reward_type),
      customers,
      products,
      promo: buildPromoPayload(normalized, promoCodes),
    };
  } catch (err) {
    console.error('formatDiscountResponse error:', Number(normalized?.id || 0), err);
    const fallbackMechanic = normalizeSimpleDiscountMechanic({}, normalized);
    return {
      ...normalized,
      mechanic_type: 'simple_discount',
      mechanic: fallbackMechanic,
      reward_type: normalizeRewardTypeValue(normalized.reward_type, 'discount'),
      customers: Array.isArray(customers) ? customers : [],
      products: Array.isArray(products) ? products : [],
      promo: {
        enabled: false,
        code_mode: 'shared',
        shared_code_id: null,
        shared_code: '',
        shared_code_usage_limit: null,
        shared_code_usage_count: 0,
        unique_code_usage_limit: 1,
        unique_codes_count: 0,
        unique_codes_active_count: 0,
        unique_codes_used_count: 0,
      },
    };
  }
}

function getActivationMode(body, existing = null, mechanicPayload = null) {
  if (isPromoSimpleDiscountMechanic(mechanicPayload?.mechanicType, mechanicPayload?.mechanic)) {
    return 'promo_code';
  }
  return 'auto';
}

function getPromoCodeMode(body, existing = null, mechanicPayload = null) {
  if (!isPromoSimpleDiscountMechanic(mechanicPayload?.mechanicType, mechanicPayload?.mechanic)) {
    return null;
  }
  const raw = toText(body?.promo?.code_mode || body?.promo_code_mode || existing?.promo_code_mode || 'shared').toLowerCase();
  return raw === 'unique' ? 'unique' : 'shared';
}

function getUniqueCodeUsageLimit(body, existing = null, codeMode = 'shared', mechanicPayload = null) {
  if (!isPromoSimpleDiscountMechanic(mechanicPayload?.mechanicType, mechanicPayload?.mechanic)) {
    return null;
  }
  const rawValue = body?.promo?.unique_code_usage_limit ?? body?.unique_code_usage_limit ?? existing?.unique_code_usage_limit;
  const parsed = toIntOrNull(rawValue);
  if (codeMode === 'unique') {
    return parsed && parsed > 0 ? parsed : 1;
  }
  return parsed;
}

function getSharedCodePayload(body) {
  return {
    code: normalizePromoCode(body?.promo?.shared_code ?? body?.shared_code),
    usageLimit: toIntOrNull(body?.promo?.shared_code_usage_limit ?? body?.shared_code_usage_limit),
  };
}

function generatePromoCode(length = 8) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * PROMO_CODE_ALPHABET.length);
    result += PROMO_CODE_ALPHABET[index];
  }
  return result;
}

async function getPromoCodeRows(db, tenantId, storeId, discountId) {
  const [rows] = await db.query(
    `SELECT id, tenant_id, store_id, discount_id, code, code_mode, is_active, usage_limit, usage_count,
            assigned_customer_id, created_at, updated_at
     FROM mkt_discount_promo_codes
     WHERE tenant_id = ? AND store_id = ? AND discount_id = ?
     ORDER BY FIELD(code_mode, 'shared', 'unique'), created_at ASC, id ASC`,
    [tenantId, storeId, discountId]
  );
  return rows.map(normalizePromoCodeRow);
}

async function deletePromoCodes(conn, { tenantId, storeId, discountId, codeMode = null }) {
  if (codeMode) {
    await conn.query(
      `DELETE FROM mkt_discount_promo_codes
       WHERE tenant_id = ? AND store_id = ? AND discount_id = ? AND code_mode = ?`,
      [tenantId, storeId, discountId, codeMode]
    );
    return;
  }
  await conn.query(
    `DELETE FROM mkt_discount_promo_codes
     WHERE tenant_id = ? AND store_id = ? AND discount_id = ?`,
    [tenantId, storeId, discountId]
  );
}

function hasPromoRequest(body) {
  const promo = parseJsonObject(body?.promo, {});
  return toBoolFlag(promo.enabled);
}

async function findDuplicatePromoCode(db, tenantId, storeId, code, excludeId = null) {
  if (!code) return null;
  const params = [tenantId, storeId, code];
  let sql = `
    SELECT id, discount_id
    FROM mkt_discount_promo_codes
    WHERE tenant_id = ?
      AND store_id = ?
      AND UPPER(TRIM(code)) = ?
  `;
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const [[row]] = await db.query(sql, params);
  return row || null;
}

async function saveDiscountCustomers(conn, tenantId, discountId, customers, replaceExisting) {
  if (!replaceExisting && (!Array.isArray(customers) || !customers.length)) return;
  if (replaceExisting) {
    await conn.query(`DELETE FROM mkt_discount_customers WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
  }
  if (!Array.isArray(customers) || !customers.length) return;

  for (const customer of customers) {
    const targetType = toText(customer?.entity_type || customer?.target_type).toLowerCase();
    const customerId = targetType === 'customer' ? Number(customer?.entity_id || customer?.customer_id || 0) || null : null;
    const categoryId = targetType === 'category' ? Number(customer?.entity_id || customer?.customer_category_id || 0) || null : null;
    await conn.query(
      `INSERT INTO mkt_discount_customers (tenant_id, discount_id, target_type, customer_id, customer_category_id)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, discountId, targetType, customerId, categoryId]
    );
  }
}

async function saveDiscountProducts(conn, tenantId, discountId, products, replaceExisting) {
  if (!replaceExisting && (!Array.isArray(products) || !products.length)) return;
  if (replaceExisting) {
    await conn.query(`DELETE FROM mkt_discount_products WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
  }
  if (!Array.isArray(products) || !products.length) return;

  for (const product of products) {
    const targetType = toText(product?.entity_type || product?.target_type).toLowerCase();
    const productId = targetType === 'product' ? Number(product?.entity_id || product?.product_id || 0) || null : null;
    const categoryId = targetType === 'category' ? Number(product?.entity_id || product?.category_id || 0) || null : null;
    const comboId = targetType === 'combo' ? Number(product?.entity_id || product?.combo_id || 0) || null : null;
    const normalizedProductConfig = targetType === 'product'
      ? normalizeProductConfigPayload(product?.product_config, productId)
      : null;
    const productConfigJson = normalizedProductConfig ? JSON.stringify(normalizedProductConfig) : null;
    await conn.query(
      `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id, product_config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, discountId, targetType, productId, categoryId, comboId, productConfigJson]
    );
  }
}

async function upsertSharedPromoCode(conn, { tenantId, storeId, discountId, code, usageLimit }) {
  const [existingRows] = await conn.query(
    `SELECT id
     FROM mkt_discount_promo_codes
     WHERE tenant_id = ? AND store_id = ? AND discount_id = ? AND code_mode = 'shared'
     ORDER BY id ASC`,
    [tenantId, storeId, discountId]
  );

  const sharedRow = existingRows[0] || null;
  const duplicate = await findDuplicatePromoCode(conn, tenantId, storeId, code, sharedRow ? Number(sharedRow.id) : null);
  if (duplicate) {
    const err = new Error('PROMO_CODE_TAKEN');
    err.statusCode = 400;
    throw err;
  }

  if (sharedRow) {
    await conn.query(
      `UPDATE mkt_discount_promo_codes
       SET code = ?, usage_limit = ?, is_active = 1
       WHERE id = ? AND tenant_id = ?`,
      [code, usageLimit, sharedRow.id, tenantId]
    );
    return Number(sharedRow.id);
  }

  const [result] = await conn.query(
    `INSERT INTO mkt_discount_promo_codes
     (tenant_id, store_id, discount_id, code, code_mode, is_active, usage_limit, usage_count, assigned_customer_id)
     VALUES (?, ?, ?, ?, 'shared', 1, ?, 0, NULL)`,
    [tenantId, storeId, discountId, code, usageLimit]
  );

  return Number(result.insertId || 0);
}

async function generateUniquePromoCodes(conn, { tenantId, storeId, discountId, count, usageLimit }) {
  const created = [];
  const maxAttempts = Math.max(50, count * 25);
  let attempts = 0;

  while (created.length < count && attempts < maxAttempts) {
    attempts += 1;
    const code = generatePromoCode(8);
    try {
      const [result] = await conn.query(
        `INSERT INTO mkt_discount_promo_codes
         (tenant_id, store_id, discount_id, code, code_mode, is_active, usage_limit, usage_count, assigned_customer_id)
         VALUES (?, ?, ?, ?, 'unique', 1, ?, 0, NULL)`,
        [tenantId, storeId, discountId, code, usageLimit]
      );
      created.push({
        id: Number(result.insertId || 0),
        discount_id: discountId,
        code,
        code_mode: 'unique',
        is_active: 1,
        usage_limit: usageLimit,
        usage_count: 0,
      });
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        continue;
      }
      throw err;
    }
  }

  if (created.length !== count) {
    const err = new Error('PROMO_CODE_GENERATION_FAILED');
    err.statusCode = 500;
    throw err;
  }

  return created;
}

module.exports = function makeAdminDiscountsRouter({ db, helpers }) {
  const router = express.Router();
  let discountProductConfigColumnReady = false;
  let ensureDiscountProductConfigColumnPromise = null;
  let discountHideInBenefitsColumnReady = false;
  let ensureDiscountHideInBenefitsColumnPromise = null;

  async function ensureDiscountHideInBenefitsColumn() {
    if (discountHideInBenefitsColumnReady) return true;
    if (ensureDiscountHideInBenefitsColumnPromise) return ensureDiscountHideInBenefitsColumnPromise;

    ensureDiscountHideInBenefitsColumnPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM mkt_discounts');
      const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      if (!existing.has('hide_in_benefits')) {
        try {
          await db.query('ALTER TABLE mkt_discounts ADD COLUMN `hide_in_benefits` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`');
          existing.add('hide_in_benefits');
        } catch (err) {
          if (String(err?.code || '') !== 'ER_DUP_FIELDNAME') throw err;
          existing.add('hide_in_benefits');
        }
      }
      discountHideInBenefitsColumnReady = existing.has('hide_in_benefits');
      return discountHideInBenefitsColumnReady;
    })()
      .catch((err) => {
        ensureDiscountHideInBenefitsColumnPromise = null;
        throw err;
      })
      .finally(() => {
        if (discountHideInBenefitsColumnReady) {
          ensureDiscountHideInBenefitsColumnPromise = null;
        }
      });

    return ensureDiscountHideInBenefitsColumnPromise;
  }

  async function ensureDiscountProductConfigColumn() {
    if (discountProductConfigColumnReady) return true;
    if (ensureDiscountProductConfigColumnPromise) return ensureDiscountProductConfigColumnPromise;

    ensureDiscountProductConfigColumnPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM mkt_discount_products');
      const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      if (!existing.has('product_config_json')) {
        try {
          await db.query('ALTER TABLE mkt_discount_products ADD COLUMN `product_config_json` LONGTEXT NULL AFTER `combo_id`');
          existing.add('product_config_json');
        } catch (err) {
          if (String(err?.code || '') !== 'ER_DUP_FIELDNAME') throw err;
          existing.add('product_config_json');
        }
      }
      discountProductConfigColumnReady = existing.has('product_config_json');
      return discountProductConfigColumnReady;
    })()
      .catch((err) => {
        ensureDiscountProductConfigColumnPromise = null;
        throw err;
      })
      .finally(() => {
        if (discountProductConfigColumnReady) {
          ensureDiscountProductConfigColumnPromise = null;
        }
      });

    return ensureDiscountProductConfigColumnPromise;
  }

  /**
   * GET /api/admin/discounts
   * Получить список всех скидок
   */
  async function listDiscounts(req, res) {
    try {
      await ensureDiscountHideInBenefitsColumn();
      await ensureDiscountProductConfigColumn();
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [discounts] = await db.query(
        `SELECT ${DISCOUNT_COLUMNS}
         FROM mkt_discounts
         WHERE tenant_id = ? AND store_id = ?
         ORDER BY priority DESC, created_at DESC`,
        [tenantId, storeId]
      );

      const discountIds = discounts
        .map((discount) => Number(discount?.id || 0))
        .filter((discountId) => discountId > 0);
      let customersByDiscountId = new Map();
      let productsByDiscountId = new Map();
      let promoCodesByDiscountId = new Map();

      if (discountIds.length) {
        const [customerRows, productRows, promoRows] = await Promise.all([
          db.query(
            `SELECT dc.discount_id,
                    dc.customer_id,
                    dc.customer_category_id,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    cc.title AS category_title
             FROM mkt_discount_customers dc
             LEFT JOIN cust_customers c ON c.id = dc.customer_id
             LEFT JOIN cust_categories cc ON cc.id = dc.customer_category_id
             WHERE dc.tenant_id = ? AND dc.discount_id IN (?)`,
            [tenantId, discountIds]
          ),
          db.query(
            `SELECT dp.discount_id,
                    dp.product_id,
                    dp.category_id,
                    dp.combo_id,
                    dp.product_config_json,
                    p.name AS product_title,
                    JSON_UNQUOTE(JSON_EXTRACT(p.photos_json, '$[0]')) AS product_image_url,
                    pc.title AS category_title,
                    cb.title AS combo_title
             FROM mkt_discount_products dp
             LEFT JOIN prod_products p ON p.id = dp.product_id
             LEFT JOIN prod_categories pc ON pc.id = dp.category_id
             LEFT JOIN prod_combos cb ON cb.id = dp.combo_id
             WHERE dp.tenant_id = ? AND dp.discount_id IN (?)`,
            [tenantId, discountIds]
          ),
          db.query(
            `SELECT id, tenant_id, store_id, discount_id, code, code_mode, is_active, usage_limit, usage_count,
                    assigned_customer_id, created_at, updated_at
             FROM mkt_discount_promo_codes
             WHERE tenant_id = ? AND store_id = ? AND discount_id IN (?)
             ORDER BY FIELD(code_mode, 'shared', 'unique'), created_at ASC, id ASC`,
            [tenantId, storeId, discountIds]
          ),
        ]);

        customersByDiscountId = groupDiscountRelationRows(customerRows[0], mapDiscountCustomerRow);
        productsByDiscountId = groupDiscountRelationRows(productRows[0], mapDiscountProductRow);
        promoCodesByDiscountId = groupDiscountRelationRows(promoRows[0], normalizePromoCodeRow);
      }

      return res.json({
        ok: true,
        discounts: discounts.map((discount) => {
          const discountId = Number(discount?.id || 0);
          return formatDiscountResponse(discount, {
            customers: customersByDiscountId.get(discountId) || [],
            products: productsByDiscountId.get(discountId) || [],
            promoCodes: promoCodesByDiscountId.get(discountId) || [],
          });
        }),
      });
    } catch (err) {
      console.error('GET /api/admin/discounts error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  }

  router.get('/', listDiscounts);

  /**
   * GET /api/admin/discounts/all
   * Получить все скидки (включая неактивные)
   */
  router.get('/all', listDiscounts);

  /**
   * GET /api/admin/discounts/stats
   * Статистика использования скидок
   */
  router.get('/stats', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [stats] = await db.query(
        `SELECT 
          d.id, d.title, d.usage_count,
          COALESCE(SUM(u.discount_amount), 0) AS total_discount_amount,
          COUNT(u.id) AS usage_records
        FROM mkt_discounts d
        LEFT JOIN mkt_discount_usage u ON u.discount_id = d.id
        WHERE d.tenant_id = ? AND d.store_id = ?
        GROUP BY d.id
        ORDER BY total_discount_amount DESC`,
        [tenantId, storeId]
      );

      return res.json({ ok: true, stats });
    } catch (err) {
      console.error('GET /api/admin/discounts/stats error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/shared-promo-sources', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [rows] = await db.query(
        `SELECT d.id AS discount_id,
                d.title,
                d.is_active,
                d.mechanic_type,
                d.mechanic_config_json,
                d.activation_mode,
                d.promo_code_mode,
                pc.id AS promo_code_id,
                pc.code,
                pc.usage_limit,
                pc.usage_count,
                pc.is_active AS promo_code_is_active
         FROM mkt_discounts d
         INNER JOIN mkt_discount_promo_codes pc
           ON pc.discount_id = d.id
          AND pc.tenant_id = d.tenant_id
          AND pc.store_id = d.store_id
          AND pc.code_mode = 'shared'
         WHERE d.tenant_id = ? AND d.store_id = ?
         ORDER BY d.is_active DESC, d.title ASC, d.id DESC`,
        [tenantId, storeId]
      );

      const sources = rows
        .map((row) => {
          const mechanicType = normalizeMechanicType(row.mechanic_type, 'simple_discount');
          const mechanic = normalizeMechanicFromDiscount(row);
          if (!isPromoSimpleDiscountMechanic(mechanicType, mechanic)) {
            return null;
          }
          return {
            source_discount_id: Number(row.discount_id || 0),
            source_discount_title: toText(row.title) || `Акция #${row.discount_id}`,
            source_promo_code_id: Number(row.promo_code_id || 0),
            source_code: toText(row.code) || null,
            usage_limit: row.usage_limit == null ? null : Number(row.usage_limit || 0),
            usage_count: Number(row.usage_count || 0),
            is_active: Number(row.is_active || 0) === 1,
            promo_code_is_active: Number(row.promo_code_is_active || 0) === 1,
          };
        })
        .filter((row) => row && row.source_discount_id > 0 && row.source_promo_code_id > 0 && row.source_code);

      return res.json({ ok: true, sources });
    } catch (err) {
      console.error('GET /api/admin/discounts/shared-promo-sources error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/simple-discount-sources', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [rows] = await db.query(
        `SELECT id AS discount_id,
                title,
                discount_type,
                discount_value,
                apply_to,
                is_active,
                activation_mode,
                mechanic_type,
                mechanic_config_json
           FROM mkt_discounts
          WHERE tenant_id = ? AND store_id = ?
          ORDER BY is_active DESC, title ASC, id DESC`,
        [tenantId, storeId]
      );

      const sources = rows
        .map((row) => {
          const mechanicType = normalizeMechanicType(row.mechanic_type, 'simple_discount');
          const mechanic = normalizeMechanicFromDiscount(row);
          if (!isPlainSimpleDiscountMechanic(mechanicType, mechanic)) {
            return null;
          }
          return {
            discount_id: Number(row.discount_id || 0),
            title: toText(row.title) || `Скидка #${row.discount_id}`,
            discount_type: normalizeDiscountType(mechanic.discount_type ?? row.discount_type, 'percent'),
            discount_value: toNumberOrNull(mechanic.discount_value ?? row.discount_value),
            apply_to: normalizeApplyTo(mechanic.apply_to ?? row.apply_to, 'order'),
            is_active: Number(row.is_active || 0) === 1,
          };
        })
        .filter((row) => row && row.discount_id > 0);

      return res.json({ ok: true, sources });
    } catch (err) {
      console.error('GET /api/admin/discounts/simple-discount-sources error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.get('/:id/promo-codes', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);

      if (!(discountId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[discount]] = await db.query(
        `SELECT id, mechanic_type, activation_mode, promo_code_mode, mechanic_config_json
         FROM mkt_discounts
         WHERE tenant_id = ? AND store_id = ? AND id = ?
         LIMIT 1`,
        [tenantId, storeId, discountId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      if (!isPromoSimpleDiscountMechanic(normalizeMechanicType(discount.mechanic_type, 'simple_discount'), normalizeMechanicFromDiscount(discount))) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      const promoCodes = await getPromoCodeRows(db, tenantId, storeId, discountId);
      return res.json({ ok: true, promo_codes: promoCodes });
    } catch (err) {
      console.error('GET /api/admin/discounts/:id/promo-codes error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.post('/:id/promo-codes/generate', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);
      const count = Math.max(1, Math.min(500, Number(req.body?.count || 0)));

      if (!(discountId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }
      if (!(count > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_COUNT' });
      }

      const [[discount]] = await db.query(
        `SELECT id, mechanic_type, activation_mode, promo_code_mode, unique_code_usage_limit, mechanic_config_json
         FROM mkt_discounts
         WHERE tenant_id = ? AND store_id = ? AND id = ?
         LIMIT 1`,
        [tenantId, storeId, discountId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      if (!isPromoSimpleDiscountMechanic(normalizeMechanicType(discount.mechanic_type, 'simple_discount'), normalizeMechanicFromDiscount(discount))) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      if (String(discount.promo_code_mode || '') !== 'unique') {
        return res.status(409).json({ ok: false, error: 'PROMO_CODE_MODE_MISMATCH' });
      }

      const usageLimit = toIntOrNull(discount.unique_code_usage_limit) || 1;
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const created = await generateUniquePromoCodes(conn, {
          tenantId,
          storeId,
          discountId,
          count,
          usageLimit,
        });
        await conn.commit();
        return res.json({ ok: true, promo_codes: created });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('POST /api/admin/discounts/:id/promo-codes/generate error:', err);
      const errorCode = err?.message === 'PROMO_CODE_GENERATION_FAILED' ? 'PROMO_CODE_GENERATION_FAILED' : 'SERVER_ERROR';
      return res.status(err?.statusCode || 500).json({ ok: false, error: errorCode });
    }
  });

  router.post('/:id/promo-codes/:codeId/toggle', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);
      const codeId = Number(req.params.codeId || 0);

      if (!(discountId > 0) || !(codeId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[promoCode]] = await db.query(
        `SELECT pc.id, pc.is_active, d.mechanic_type, d.mechanic_config_json, d.activation_mode
         FROM mkt_discount_promo_codes pc
         INNER JOIN mkt_discounts d ON d.id = pc.discount_id AND d.tenant_id = pc.tenant_id AND d.store_id = pc.store_id
         WHERE pc.tenant_id = ? AND pc.store_id = ? AND pc.discount_id = ? AND pc.id = ?
         LIMIT 1`,
        [tenantId, storeId, discountId, codeId]
      );

      if (!promoCode) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      if (!isPromoSimpleDiscountMechanic(normalizeMechanicType(promoCode.mechanic_type, 'simple_discount'), normalizeMechanicFromDiscount(promoCode))) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      const nextStatus = Number(promoCode.is_active || 0) === 1 ? 0 : 1;
      await db.query(
        `UPDATE mkt_discount_promo_codes
         SET is_active = ?
         WHERE tenant_id = ? AND store_id = ? AND discount_id = ? AND id = ?`,
        [nextStatus, tenantId, storeId, discountId, codeId]
      );

      return res.json({ ok: true, is_active: nextStatus === 1 });
    } catch (err) {
      console.error('POST /api/admin/discounts/:id/promo-codes/:codeId/toggle error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/:id
   * Получить скидку по ID с привязками
   */
  router.get('/:id', async (req, res) => {
    try {
      await ensureDiscountHideInBenefitsColumn();
      await ensureDiscountProductConfigColumn();
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);

      if (!(discountId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[discount]] = await db.query(
        `SELECT * FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Получить привязки к клиентам с названиями
      const [customerRows] = await db.query(
        `SELECT dc.*, 
                c.name AS customer_name, c.phone AS customer_phone,
                cc.title AS category_title
         FROM mkt_discount_customers dc
         LEFT JOIN cust_customers c ON c.id = dc.customer_id
         LEFT JOIN cust_categories cc ON cc.id = dc.customer_category_id
         WHERE dc.discount_id = ? AND dc.tenant_id = ?`,
        [discountId, tenantId]
      );

      // Получить привязки к товарам с названиями
      const [productRows] = await db.query(
        `SELECT dp.*, 
                p.name AS product_title,
                p.photos_json AS product_photos_json,
                JSON_UNQUOTE(JSON_EXTRACT(p.photos_json, '$[0]')) AS product_image_url,
                pc.title AS category_title,
                cb.title AS combo_title
         FROM mkt_discount_products dp
         LEFT JOIN prod_products p ON p.id = dp.product_id
         LEFT JOIN prod_categories pc ON pc.id = dp.category_id
         LEFT JOIN prod_combos cb ON cb.id = dp.combo_id
         WHERE dp.discount_id = ? AND dp.tenant_id = ?`,
        [discountId, tenantId]
      );

      // Преобразуем в формат {entity_type, entity_id, title}
      const customers = customerRows.map(row => {
        if (row.customer_id) {
          return {
            entity_type: 'customer',
            entity_id: row.customer_id,
            title: row.customer_name || row.customer_phone || `Клиент #${row.customer_id}`,
            phone: row.customer_phone || '',
          };
        }
        if (row.customer_category_id) {
          return { entity_type: 'category', entity_id: row.customer_category_id, title: row.category_title || `Категория #${row.customer_category_id}` };
        }
        return null;
      }).filter(Boolean);

      const productsLegacy = productRows.map(row => {
        if (row.product_id) {
          let imageUrl = null;
          try {
            const photos = JSON.parse(row.product_photos_json || '[]');
            imageUrl = Array.isArray(photos) && photos.length ? String(photos[0] || '').trim() || null : null;
          } catch {}
          return {
            entity_type: 'product',
            entity_id: row.product_id,
            title: row.product_title || `Товар #${row.product_id}`,
            image_url: imageUrl,
          };
        }
        if (row.category_id) {
          return { entity_type: 'category', entity_id: row.category_id, title: row.category_title || `Категория #${row.category_id}` };
        }
        if (row.combo_id) {
          return { entity_type: 'combo', entity_id: row.combo_id, title: row.combo_title || `Комбо #${row.combo_id}` };
        }
        return null;
      }).filter(Boolean);
      const products = productRows.map((row) => mapDiscountProductRow(row)).filter(Boolean);

      const normalizedDiscount = normalizeDiscountRow(discount);
      const normalizedMechanic = normalizeMechanicFromDiscount(normalizedDiscount);
      const mechanicRefs = collectMechanicEntityRefs(normalizedMechanic);
      const mechanicLookup = await loadMechanicEntityLookup(db, tenantId, mechanicRefs);
      const enrichedMechanic = enrichMechanicForResponse(normalizedMechanic, mechanicLookup);
      const promoCodes = await getPromoCodeRows(db, tenantId, storeId, discountId);

      return res.json({
        ok: true,
        discount: formatDiscountResponse({
          ...discount,
          mechanic_config_json: enrichedMechanic,
        }, {
          customers,
          products,
          promoCodes,
        }),
      });
    } catch (err) {
      console.error('GET /api/admin/discounts/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * POST /api/admin/discounts
   * Создать новую скидку
   */
  router.post('/', async (req, res) => {
    const tenantId = req.tenantId || 1;
    const storeId = req.storeId || 1;
    await ensureDiscountHideInBenefitsColumn();
    await ensureDiscountProductConfigColumn();
    const conn = await db.getConnection();
    let inTransaction = false;
    try {
      const title = toText(req.body?.title);
      const mechanicPayload = buildMechanicStoragePayload(req.body);
      const activationMode = getActivationMode(req.body, null, mechanicPayload);
      const promoCodeMode = getPromoCodeMode(req.body, null, mechanicPayload);
      const uniqueCodeUsageLimit = getUniqueCodeUsageLimit(req.body, null, promoCodeMode, mechanicPayload);
      const sharedPromo = getSharedCodePayload(req.body);
      const customers = validateEntityTargets(req.body?.customers, ['customer', 'category'], 'INVALID_CUSTOMERS');
      const hasExplicitProducts = req.body?.products !== undefined && req.body?.products !== null;
      const products = mechanicPayload.mechanicType === 'simple_discount'
        ? validateEntityTargets(req.body?.products, ['product', 'category', 'combo'], 'INVALID_PRODUCTS')
        : [];
      const promoEnabled = isPromoSimpleDiscountMechanic(mechanicPayload.mechanicType, mechanicPayload.mechanic);
      const promoRewardProducts = promoEnabled ? normalizeEntityList(products, ['product', 'category', 'combo']) : [];

      if (!title) {
        return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      }
      assertValidDateRange(req.body);
      assertValidRestrictionSchedule(req.body);
      if (mechanicPayload.mechanicType !== 'simple_discount' && hasExplicitProducts && products.length) {
        return res.status(400).json({ ok: false, error: 'PRODUCTS_NOT_ALLOWED' });
      }
      if (!promoEnabled && hasPromoRequest(req.body)) {
        return res.status(400).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      assertMechanicIsValid(mechanicPayload.mechanicType, mechanicPayload.mechanic, { products });
      if (mechanicPayload.mechanicType === 'threshold') {
        await assertThresholdRewardSourcesExist(conn, tenantId, storeId, mechanicPayload.mechanic);
      }
      if (promoEnabled && normalizePromoRewardType(mechanicPayload.mechanic?.promo_reward?.reward_type, 'discount') === 'product' && !promoRewardProducts.length) {
        return res.status(400).json({ ok: false, error: 'PROMO_REWARD_PRODUCTS_REQUIRED' });
      }
      if (promoEnabled && promoCodeMode === 'shared' && !sharedPromo.code) {
        return res.status(400).json({ ok: false, error: 'PROMO_CODE_REQUIRED' });
      }

      await conn.beginTransaction();
      inTransaction = true;

      const [result] = await conn.query(
        `INSERT INTO mkt_discounts (
          tenant_id, store_id, title, description, discount_type, discount_value,
          apply_to, min_order_amount, max_discount_amount,
          starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
          usage_limit, usage_per_customer, priority, is_stackable, is_active, hide_in_benefits,
          activation_mode, reward_type, promo_code_mode, unique_code_usage_limit,
          mechanic_type, mechanic_config_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          storeId,
          title,
          toNullableText(req.body?.description),
          mechanicPayload.discountType,
          mechanicPayload.discountValue,
          mechanicPayload.applyTo,
          toNumberOrNull(req.body?.min_order_amount),
          toNumberOrNull(req.body?.max_discount_amount),
          toNullableText(req.body?.starts_at),
          toNullableText(req.body?.ends_at),
          serializeScheduleDays(req.body?.schedule_days),
          toNullableText(req.body?.schedule_time_start),
          toNullableText(req.body?.schedule_time_end),
          toIntOrNull(req.body?.usage_limit),
          toIntOrNull(req.body?.usage_per_customer),
          toIntOrNull(req.body?.priority) || 0,
          toBoolFlag(req.body?.is_stackable) ? 1 : 0,
          toBoolFlag(req.body?.is_active, true) ? 1 : 0,
          toBoolFlag(req.body?.hide_in_benefits) ? 1 : 0,
          activationMode,
          mechanicPayload.rewardType,
          promoCodeMode,
          uniqueCodeUsageLimit,
          mechanicPayload.mechanicType,
          mechanicPayload.mechanicConfigJson,
        ]
      );

      const discountId = Number(result.insertId || 0);
      await saveDiscountCustomers(conn, tenantId, discountId, customers, false);
      await saveDiscountProducts(conn, tenantId, discountId, products, false);

      // Сохранить привязки к клиентам
      if (false && customers && Array.isArray(customers) && customers.length > 0) {
        for (const c of customers) {
          // Поддержка нового формата {entity_type, entity_id}
          const targetType = c.entity_type || c.target_type || 'all';
          const customerId = targetType === 'customer' ? (c.entity_id || c.customer_id) : (c.customer_id || null);
          const categoryId = targetType === 'category' ? (c.entity_id || c.customer_category_id) : (c.customer_category_id || null);
          await conn.query(
            `INSERT INTO mkt_discount_customers (tenant_id, discount_id, target_type, customer_id, customer_category_id)
             VALUES (?, ?, ?, ?, ?)`,
            [tenantId, discountId, targetType, customerId, categoryId]
          );
        }
      }

      // Сохранить привязки к товарам
      if (false && products && Array.isArray(products) && products.length > 0) {
        for (const p of products) {
          // Поддержка нового формата {entity_type, entity_id}
          const targetType = p.entity_type || p.target_type || 'all';
          const productId = targetType === 'product' ? (p.entity_id || p.product_id) : (p.product_id || null);
          const categoryId = targetType === 'category' ? (p.entity_id || p.category_id) : (p.category_id || null);
          const comboId = targetType === 'combo' ? (p.entity_id || p.combo_id) : (p.combo_id || null);
          await conn.query(
            `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenantId, discountId, targetType, productId, categoryId, comboId]
          );
        }
      }

      if (promoEnabled && promoCodeMode === 'shared' && sharedPromo.code) {
        await upsertSharedPromoCode(conn, {
          tenantId,
          storeId,
          discountId,
          code: sharedPromo.code,
          usageLimit: sharedPromo.usageLimit,
        });
      }

      await conn.commit();
      inTransaction = false;
      return res.json({ ok: true, id: discountId });
    } catch (err) {
      if (inTransaction) {
        await conn.rollback();
      }
      console.error('POST /api/admin/discounts error:', err);
      const errorCode = DISCOUNT_MUTATION_ERROR_CODES.has(err?.message)
        ? err.message
        : 'SERVER_ERROR';
      return res.status(err?.statusCode || 500).json({ ok: false, error: errorCode });
    } finally {
      conn.release();
    }
  });

  /**
   * PUT /api/admin/discounts/:id
   * Обновить скидку
   */
  router.put('/:id', async (req, res) => {
    const tenantId = req.tenantId || 1;
    const storeId = req.storeId || 1;
    const discountId = Number(req.params.id || 0);
    await ensureDiscountHideInBenefitsColumn();
    await ensureDiscountProductConfigColumn();

    if (!(discountId > 0)) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const conn = await db.getConnection();
    let inTransaction = false;
    try {

      const title = toText(req.body?.title);

      // Проверить существование
      const [[existing]] = await conn.query(
        `SELECT *
         FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!existing) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const mechanicPayload = buildMechanicStoragePayload(req.body, existing);
      const activationModeResolved = getActivationMode(req.body, existing, mechanicPayload);
      const promoCodeMode = getPromoCodeMode(req.body, existing, mechanicPayload);
      const uniqueCodeUsageLimit = getUniqueCodeUsageLimit(req.body, existing, promoCodeMode, mechanicPayload);
      const sharedPromo = getSharedCodePayload(req.body);
      const customers = validateEntityTargets(req.body?.customers, ['customer', 'category'], 'INVALID_CUSTOMERS');
      const hasExplicitProducts = req.body?.products !== undefined && req.body?.products !== null;
      const products = mechanicPayload.mechanicType === 'simple_discount'
        ? validateEntityTargets(req.body?.products, ['product', 'category', 'combo'], 'INVALID_PRODUCTS')
        : [];
      const promoEnabled = isPromoSimpleDiscountMechanic(mechanicPayload.mechanicType, mechanicPayload.mechanic);
      const promoRewardProducts = promoEnabled ? normalizeEntityList(products, ['product', 'category', 'combo']) : [];

      if (!(title || toText(existing.title))) {
        return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      }
      assertValidDateRange(req.body, existing);
      assertValidRestrictionSchedule(req.body, existing);
      if (mechanicPayload.mechanicType !== 'simple_discount' && hasExplicitProducts && products.length) {
        return res.status(400).json({ ok: false, error: 'PRODUCTS_NOT_ALLOWED' });
      }
      if (!promoEnabled && hasPromoRequest(req.body)) {
        return res.status(400).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      assertMechanicIsValid(mechanicPayload.mechanicType, mechanicPayload.mechanic, { products });
      if (mechanicPayload.mechanicType === 'threshold') {
        await assertThresholdRewardSourcesExist(conn, tenantId, storeId, mechanicPayload.mechanic, { currentDiscountId: discountId });
      }
      if (promoEnabled && normalizePromoRewardType(mechanicPayload.mechanic?.promo_reward?.reward_type, 'discount') === 'product' && !promoRewardProducts.length) {
        return res.status(400).json({ ok: false, error: 'PROMO_REWARD_PRODUCTS_REQUIRED' });
      }
      if (promoEnabled && promoCodeMode === 'shared' && !sharedPromo.code) {
        return res.status(400).json({ ok: false, error: 'PROMO_CODE_REQUIRED' });
      }

      await conn.beginTransaction();
      inTransaction = true;

      const priorityValue = Object.prototype.hasOwnProperty.call(req.body || {}, 'priority')
        ? (toIntOrNull(req.body?.priority) || 0)
        : (toIntOrNull(existing?.priority) || 0);

      await conn.query(
        `UPDATE mkt_discounts SET
          title = ?, description = ?, discount_type = ?, discount_value = ?,
          apply_to = ?, min_order_amount = ?, max_discount_amount = ?,
          starts_at = ?, ends_at = ?, schedule_days = ?, schedule_time_start = ?, schedule_time_end = ?,
          usage_limit = ?, usage_per_customer = ?, priority = ?, is_stackable = ?, is_active = ?, hide_in_benefits = ?,
          activation_mode = ?, reward_type = ?, promo_code_mode = ?, unique_code_usage_limit = ?,
          mechanic_type = ?, mechanic_config_json = ?
        WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [
          title || toText(existing.title),
          toNullableText(req.body?.description),
          mechanicPayload.discountType,
          mechanicPayload.discountValue,
          mechanicPayload.applyTo,
          toNumberOrNull(req.body?.min_order_amount),
          toNumberOrNull(req.body?.max_discount_amount),
          toNullableText(req.body?.starts_at),
          toNullableText(req.body?.ends_at),
          serializeScheduleDays(req.body?.schedule_days),
          toNullableText(req.body?.schedule_time_start),
          toNullableText(req.body?.schedule_time_end),
          toIntOrNull(req.body?.usage_limit),
          toIntOrNull(req.body?.usage_per_customer),
          priorityValue,
          toBoolFlag(req.body?.is_stackable) ? 1 : 0,
          toBoolFlag(req.body?.is_active, true) ? 1 : 0,
          Object.prototype.hasOwnProperty.call(req.body || {}, 'hide_in_benefits')
            ? (toBoolFlag(req.body?.hide_in_benefits) ? 1 : 0)
            : (toBoolFlag(existing?.hide_in_benefits) ? 1 : 0),
          activationModeResolved,
          mechanicPayload.rewardType,
          promoCodeMode,
          uniqueCodeUsageLimit,
          mechanicPayload.mechanicType,
          mechanicPayload.mechanicConfigJson,
          discountId,
          tenantId,
          storeId,
        ]
      );

      // Обновить привязки к клиентам
      if (customers !== undefined) {
        await saveDiscountCustomers(conn, tenantId, discountId, customers, true);
      }

      if (products !== undefined) {
        await saveDiscountProducts(conn, tenantId, discountId, products, true);
      }

      if (false && customers !== undefined) {
        await conn.query(`DELETE FROM mkt_discount_customers WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
        if (Array.isArray(customers) && customers.length > 0) {
          for (const c of customers) {
            // Поддержка нового формата {entity_type, entity_id}
            const targetType = c.entity_type || c.target_type || 'all';
            const customerId = targetType === 'customer' ? (c.entity_id || c.customer_id) : (c.customer_id || null);
            const categoryId = targetType === 'category' ? (c.entity_id || c.customer_category_id) : (c.customer_category_id || null);
            await conn.query(
              `INSERT INTO mkt_discount_customers (tenant_id, discount_id, target_type, customer_id, customer_category_id)
               VALUES (?, ?, ?, ?, ?)`,
              [tenantId, discountId, targetType, customerId, categoryId]
            );
          }
        }
      }

      // Обновить привязки к товарам
      if (false && products !== undefined) {
        await conn.query(`DELETE FROM mkt_discount_products WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
        if (Array.isArray(products) && products.length > 0) {
          for (const p of products) {
            // Поддержка нового формата {entity_type, entity_id}
            const targetType = p.entity_type || p.target_type || 'all';
            const productId = targetType === 'product' ? (p.entity_id || p.product_id) : (p.product_id || null);
            const categoryId = targetType === 'category' ? (p.entity_id || p.category_id) : (p.category_id || null);
            const comboId = targetType === 'combo' ? (p.entity_id || p.combo_id) : (p.combo_id || null);
            await conn.query(
              `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [tenantId, discountId, targetType, productId, categoryId, comboId]
            );
          }
        }
      }

      if (promoEnabled && promoCodeMode === 'unique') {
        await deletePromoCodes(conn, { tenantId, storeId, discountId, codeMode: 'shared' });
        await conn.query(
          `UPDATE mkt_discount_promo_codes
           SET usage_limit = ?
           WHERE tenant_id = ? AND store_id = ? AND discount_id = ? AND code_mode = 'unique'`,
          [uniqueCodeUsageLimit, tenantId, storeId, discountId]
        );
      }

      if (promoEnabled && promoCodeMode === 'shared' && sharedPromo.code) {
        await deletePromoCodes(conn, { tenantId, storeId, discountId, codeMode: 'unique' });
        await upsertSharedPromoCode(conn, {
          tenantId,
          storeId,
          discountId,
          code: sharedPromo.code,
          usageLimit: sharedPromo.usageLimit,
        });
      } else if (!promoEnabled) {
        await deletePromoCodes(conn, { tenantId, storeId, discountId });
      }

      await conn.commit();
      inTransaction = false;
      return res.json({ ok: true });
    } catch (err) {
      if (inTransaction) {
        await conn.rollback();
      }
      console.error('PUT /api/admin/discounts/:id error:', err);
      const errorCode = DISCOUNT_MUTATION_ERROR_CODES.has(err?.message)
        ? err.message
        : 'SERVER_ERROR';
      return res.status(err?.statusCode || 500).json({ ok: false, error: errorCode });
    } finally {
      conn.release();
    }
  });

  /**
   * DELETE /api/admin/discounts/:id
   * Удалить скидку
   */
  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);

      if (!(discountId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `DELETE FROM mkt_discount_usage
           WHERE tenant_id = ? AND discount_id = ?`,
          [tenantId, discountId]
        );
        await conn.query(
          `DELETE FROM mkt_discount_customers
           WHERE tenant_id = ? AND discount_id = ?`,
          [tenantId, discountId]
        );
        await conn.query(
          `DELETE FROM mkt_discount_products
           WHERE tenant_id = ? AND discount_id = ?`,
          [tenantId, discountId]
        );
        await conn.query(
          `DELETE FROM mkt_discount_promo_codes
           WHERE tenant_id = ? AND store_id = ? AND discount_id = ?`,
          [tenantId, storeId, discountId]
        );
        const [result] = await conn.query(
          `DELETE FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
          [discountId, tenantId, storeId]
        );

        if (result.affectedRows === 0) {
          await conn.rollback();
          conn.release();
          return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        }

        await conn.commit();
        conn.release();
        return res.json({ ok: true });
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        throw txErr;
      }
    } catch (err) {
      console.error('DELETE /api/admin/discounts/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * POST /api/admin/discounts/:id/toggle
   * Переключить активность скидки
   */
  router.post('/:id/toggle', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = Number(req.params.id || 0);

      if (!(discountId > 0)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[discount]] = await db.query(
        `SELECT is_active FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const newStatus = Number(discount.is_active || 0) === 1 ? 0 : 1;

      await db.query(
        `UPDATE mkt_discounts SET is_active = ? WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [newStatus, discountId, tenantId, storeId]
      );

      return res.json({ ok: true, is_active: newStatus === 1 });
    } catch (err) {
      console.error('POST /api/admin/discounts/:id/toggle error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/:id/orders
   * Получить заказы, в которых использовалась скидка
   */
  router.get('/:id/orders', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      // Получаем заказы из истории использования скидки
      const [orders] = await db.query(
        `SELECT 
          u.id AS usage_id,
          u.order_id,
          u.customer_id,
          u.discount_amount,
          u.used_at,
          o.public_id,
          o.customer_name,
          o.customer_phone,
          o.total_price,
          o.created_at AS order_created_at,
          o.status_id
        FROM mkt_discount_usage u
        LEFT JOIN order_orders o ON o.id = u.order_id
        WHERE u.discount_id = ? AND u.tenant_id = ?
        ORDER BY u.used_at DESC
        LIMIT 100`,
        [discountId, tenantId]
      );

      return res.json({ ok: true, orders });
    } catch (err) {
      console.error('GET /api/admin/discounts/:id/orders error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  return router;
};
