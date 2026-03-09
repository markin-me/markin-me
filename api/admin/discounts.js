const express = require('express');

const DISCOUNT_COLUMNS = `
  id, title, description, discount_type, discount_value,
  apply_to, min_order_amount, max_discount_amount,
  starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
  usage_limit, usage_per_customer, usage_count,
  priority, is_stackable, is_active,
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
const MECHANIC_TYPES = new Set(['simple_discount', 'buy_x_get_y', 'threshold']);
const REWARD_TYPES = new Set(['discount', 'bonus', 'gift', 'product_discount', 'mixed']);

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
  if (raw === 'fixed' || raw === 'special_price') return 'fixed';
  if (raw === 'percent') return 'percent';
  return fallback === 'fixed' ? 'fixed' : 'percent';
}

function normalizeSimpleVariant(value, fallback = 'percent') {
  const raw = toText(value).toLowerCase();
  if (SIMPLE_DISCOUNT_VARIANTS.has(raw)) return raw;
  return SIMPLE_DISCOUNT_VARIANTS.has(fallback) ? fallback : 'percent';
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
    });
  });

  return normalized;
}

function normalizeSimpleDiscountMechanic(source = {}, discountRow = {}) {
  const src = parseJsonObject(source, {});
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
  const rewardKind = ['gift', 'product_discount', 'order_discount'].includes(toText(src.reward_kind || base.reward_kind).toLowerCase())
    ? toText(src.reward_kind || base.reward_kind).toLowerCase()
    : 'gift';
  const rewardDiscount = parseJsonObject(src.reward_discount, parseJsonObject(base.reward_discount, {}));

  return {
    id: toNullableText(src.id || base.id),
    min_amount: toNumberOrNull(src.min_amount ?? base.min_amount),
    reward_kind: rewardKind,
    reward_selection_mode: rewardKind === 'order_discount' ? null : 'customer_choice',
    reward_item_addition: rewardKind === 'order_discount' ? null : 'line_item',
    reward_products: rewardKind === 'order_discount'
      ? []
      : normalizeEntityList(src.reward_products ?? base.reward_products, ['product']),
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
    .filter((tier) => tier.min_amount != null || tier.reward_products.length || tier.reward_discount.discount_value != null);

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
      ? [...new Set(mechanic.tiers.map((tier) => String(tier?.reward_kind || '').toLowerCase()).filter(Boolean))]
      : [];
    if (kinds.length <= 1) {
      if (kinds[0] === 'gift') return 'gift';
      if (kinds[0] === 'product_discount') return 'product_discount';
      if (kinds[0] === 'order_discount') return 'discount';
      return normalizeRewardTypeValue(fallback, 'discount');
    }
    return 'mixed';
  }
  return 'discount';
}

function isPromoSimpleDiscountMechanic(mechanicType, mechanic) {
  return mechanicType === 'simple_discount' && normalizeSimpleVariant(mechanic?.simple_variant, 'percent') === 'promo_code';
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

  const existingSimpleMechanic = existingMechanic?.type === 'simple_discount' ? existingMechanic : normalizeSimpleDiscountMechanic({}, existing || {});
  const simpleVariant = normalizeSimpleVariant(
    mechanicSource?.simple_variant ?? (toBoolFlag(body?.promo?.enabled) ? 'promo_code' : body?.discount_type),
    existingSimpleMechanic?.simple_variant || 'percent'
  );
  const simpleSource = simpleVariant === 'promo_code'
    ? {
        simple_variant: 'promo_code',
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

function assertMechanicIsValid(mechanicType, mechanic) {
  if (mechanicType === 'simple_discount') {
    const isPromo = normalizeSimpleVariant(mechanic?.simple_variant, 'percent') === 'promo_code';
    const reward = isPromo ? mechanic?.promo_reward : mechanic;
    const promoRewardType = isPromo ? normalizePromoRewardType(reward?.reward_type, 'discount') : 'discount';
    const promoProductRewardType = isPromo ? normalizePromoProductRewardType(reward?.product_reward_type ?? reward?.reward_kind, 'gift') : 'gift';
    if (isPromo && promoRewardType === 'product' && promoProductRewardType === 'gift') {
      return;
    }
    if (!(Number(reward?.discount_value) > 0)) {
      const err = new Error('INVALID_DISCOUNT_VALUE');
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  if (mechanicType === 'buy_x_get_y') {
    if (!(Number(mechanic?.buy_qty) > 0) || !(Number(mechanic?.reward_qty) > 0)) {
      const err = new Error('INVALID_MECHANIC_CONFIG');
      err.statusCode = 400;
      throw err;
    }
    if (mechanic.qualifying_mode === 'pool' && !mechanic.qualifying_items.length) {
      const err = new Error('QUALIFYING_ITEMS_REQUIRED');
      err.statusCode = 400;
      throw err;
    }
    if (mechanic.reward_source === 'reward_list' && !mechanic.reward_products.length) {
      const err = new Error('REWARD_PRODUCTS_REQUIRED');
      err.statusCode = 400;
      throw err;
    }
    if (mechanic.reward_kind === 'product_discount' && !(Number(mechanic?.reward_discount?.discount_value) > 0)) {
      const err = new Error('INVALID_REWARD_DISCOUNT');
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  const tiers = Array.isArray(mechanic?.tiers) ? mechanic.tiers : [];
  if (!tiers.length) {
    const err = new Error('THRESHOLD_TIERS_REQUIRED');
    err.statusCode = 400;
    throw err;
  }
  for (const tier of tiers) {
    if (!(Number(tier?.min_amount) > 0)) {
      const err = new Error('INVALID_THRESHOLD_TIER');
      err.statusCode = 400;
      throw err;
    }
    if ((tier.reward_kind === 'gift' || tier.reward_kind === 'product_discount')
      && (!Array.isArray(tier.reward_products) || !tier.reward_products.length)) {
      const err = new Error('REWARD_PRODUCTS_REQUIRED');
      err.statusCode = 400;
      throw err;
    }
    if ((tier.reward_kind === 'product_discount' || tier.reward_kind === 'order_discount')
      && !(Number(tier?.reward_discount?.discount_value) > 0)) {
      const err = new Error('INVALID_REWARD_DISCOUNT');
      err.statusCode = 400;
      throw err;
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

function formatDiscountResponse(discount, { customers = [], products = [], promoCodes = [] } = {}) {
  const normalized = normalizeDiscountRow(discount || {});
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
    const targetType = toText(customer?.entity_type || customer?.target_type || 'all') || 'all';
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
    const targetType = toText(product?.entity_type || product?.target_type || 'all') || 'all';
    const productId = targetType === 'product' ? Number(product?.entity_id || product?.product_id || 0) || null : null;
    const categoryId = targetType === 'category' ? Number(product?.entity_id || product?.category_id || 0) || null : null;
    const comboId = targetType === 'combo' ? Number(product?.entity_id || product?.combo_id || 0) || null : null;
    await conn.query(
      `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, discountId, targetType, productId, categoryId, comboId]
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

  /**
   * GET /api/admin/discounts
   * Получить список всех скидок
   */
  async function listDiscounts(req, res) {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [discounts] = await db.query(
        `SELECT ${DISCOUNT_COLUMNS}
         FROM mkt_discounts
         WHERE tenant_id = ? AND store_id = ?
         ORDER BY priority DESC, created_at DESC`,
        [tenantId, storeId]
      );

      return res.json({
        ok: true,
        discounts: discounts.map((discount) => formatDiscountResponse(discount)),
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
          return { entity_type: 'customer', entity_id: row.customer_id, title: row.customer_name || row.customer_phone || `Клиент #${row.customer_id}` };
        }
        if (row.customer_category_id) {
          return { entity_type: 'category', entity_id: row.customer_category_id, title: row.category_title || `Категория #${row.customer_category_id}` };
        }
        return null;
      }).filter(Boolean);

      const products = productRows.map(row => {
        if (row.product_id) {
          return { entity_type: 'product', entity_id: row.product_id, title: row.product_title || `Товар #${row.product_id}` };
        }
        if (row.category_id) {
          return { entity_type: 'category', entity_id: row.category_id, title: row.category_title || `Категория #${row.category_id}` };
        }
        if (row.combo_id) {
          return { entity_type: 'combo', entity_id: row.combo_id, title: row.combo_title || `Комбо #${row.combo_id}` };
        }
        return null;
      }).filter(Boolean);

      const promoCodes = await getPromoCodeRows(db, tenantId, storeId, discountId);

      return res.json({
        ok: true,
        discount: formatDiscountResponse(discount, {
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
    const conn = await db.getConnection();
    let inTransaction = false;
    try {
      const title = toText(req.body?.title);
      const mechanicPayload = buildMechanicStoragePayload(req.body);
      const activationMode = getActivationMode(req.body, null, mechanicPayload);
      const promoCodeMode = getPromoCodeMode(req.body, null, mechanicPayload);
      const uniqueCodeUsageLimit = getUniqueCodeUsageLimit(req.body, null, promoCodeMode, mechanicPayload);
      const sharedPromo = getSharedCodePayload(req.body);
      const customers = req.body?.customers;
      const products = mechanicPayload.mechanicType === 'simple_discount' ? req.body?.products : [];
      const promoEnabled = isPromoSimpleDiscountMechanic(mechanicPayload.mechanicType, mechanicPayload.mechanic);
      const promoRewardProducts = promoEnabled ? normalizeEntityList(products, ['product', 'category', 'combo']) : [];

      if (!title) {
        return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      }

      if (!promoEnabled && hasPromoRequest(req.body)) {
        return res.status(400).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      assertMechanicIsValid(mechanicPayload.mechanicType, mechanicPayload.mechanic);
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
          usage_limit, usage_per_customer, priority, is_stackable, is_active,
          activation_mode, reward_type, promo_code_mode, unique_code_usage_limit,
          mechanic_type, mechanic_config_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const errorCode = [
        'PROMO_NOT_AVAILABLE',
        'PROMO_CODE_TAKEN',
        'PROMO_CODE_REQUIRED',
        'PROMO_REWARD_PRODUCTS_REQUIRED',
        'INVALID_DISCOUNT_VALUE',
        'INVALID_MECHANIC_CONFIG',
        'QUALIFYING_ITEMS_REQUIRED',
        'REWARD_PRODUCTS_REQUIRED',
        'INVALID_REWARD_DISCOUNT',
        'THRESHOLD_TIERS_REQUIRED',
        'INVALID_THRESHOLD_TIER',
      ].includes(err?.message)
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

    if (!(discountId > 0)) {
      return res.status(400).json({ ok: false, error: 'INVALID_ID' });
    }

    const conn = await db.getConnection();
    let inTransaction = false;
    try {

      const title = toText(req.body?.title);
      const customers = req.body?.customers;

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
      const products = mechanicPayload.mechanicType === 'simple_discount' ? req.body?.products : [];
      const promoEnabled = isPromoSimpleDiscountMechanic(mechanicPayload.mechanicType, mechanicPayload.mechanic);
      const promoRewardProducts = promoEnabled ? normalizeEntityList(products, ['product', 'category', 'combo']) : [];

      if (!(title || toText(existing.title))) {
        return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      }
      if (!promoEnabled && hasPromoRequest(req.body)) {
        return res.status(400).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      assertMechanicIsValid(mechanicPayload.mechanicType, mechanicPayload.mechanic);
      if (promoEnabled && normalizePromoRewardType(mechanicPayload.mechanic?.promo_reward?.reward_type, 'discount') === 'product' && !promoRewardProducts.length) {
        return res.status(400).json({ ok: false, error: 'PROMO_REWARD_PRODUCTS_REQUIRED' });
      }
      if (promoEnabled && promoCodeMode === 'shared' && !sharedPromo.code) {
        return res.status(400).json({ ok: false, error: 'PROMO_CODE_REQUIRED' });
      }

      await conn.beginTransaction();
      inTransaction = true;

      await conn.query(
        `UPDATE mkt_discounts SET
          title = ?, description = ?, discount_type = ?, discount_value = ?,
          apply_to = ?, min_order_amount = ?, max_discount_amount = ?,
          starts_at = ?, ends_at = ?, schedule_days = ?, schedule_time_start = ?, schedule_time_end = ?,
          usage_limit = ?, usage_per_customer = ?, priority = ?, is_stackable = ?, is_active = ?,
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
          toIntOrNull(req.body?.priority) || 0,
          toBoolFlag(req.body?.is_stackable) ? 1 : 0,
          toBoolFlag(req.body?.is_active, true) ? 1 : 0,
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
      const errorCode = [
        'PROMO_NOT_AVAILABLE',
        'PROMO_CODE_TAKEN',
        'PROMO_CODE_REQUIRED',
        'PROMO_REWARD_PRODUCTS_REQUIRED',
        'INVALID_DISCOUNT_VALUE',
        'INVALID_MECHANIC_CONFIG',
        'QUALIFYING_ITEMS_REQUIRED',
        'REWARD_PRODUCTS_REQUIRED',
        'INVALID_REWARD_DISCOUNT',
        'THRESHOLD_TIERS_REQUIRED',
        'INVALID_THRESHOLD_TIER',
      ].includes(err?.message)
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
