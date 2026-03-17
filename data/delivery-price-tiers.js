const DELIVERY_PRICE_TIER_LIMIT = 20;

function normalizeDeliveryMoney(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Number(numeric.toFixed(2)));
}

function normalizeDeliveryEtaMinutes(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric));
}

function normalizeDeliveryPriceTier(rawTier) {
  const source = rawTier && typeof rawTier === 'object' ? rawTier : {};
  const minOrderAmount = normalizeDeliveryMoney(source.min_order_amount);
  const deliveryCost = normalizeDeliveryMoney(source.delivery_cost);
  if (minOrderAmount === null || deliveryCost === null) return null;
  return {
    min_order_amount: minOrderAmount,
    delivery_cost: deliveryCost,
  };
}

function sortDeliveryPriceTiers(tiers) {
  return (Array.isArray(tiers) ? tiers : []).sort((left, right) => {
    if (left.min_order_amount !== right.min_order_amount) {
      return left.min_order_amount - right.min_order_amount;
    }
    if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    }
    return left.delivery_cost - right.delivery_cost;
  });
}

function sanitizeDeliveryPriceTiers(rawTiers, options = {}) {
  const requiredError = String(options.requiredError || 'DELIVERY_PRICE_TIERS_REQUIRED');
  const limitError = String(options.limitError || 'DELIVERY_PRICE_TIERS_LIMIT');
  const list = Array.isArray(rawTiers) ? rawTiers : [];
  const normalized = [];
  for (const tier of list) {
    const nextTier = normalizeDeliveryPriceTier(tier);
    if (!nextTier) continue;
    normalized.push(nextTier);
  }
  if (!normalized.length) {
    return { ok: false, error: requiredError };
  }
  if (normalized.length > DELIVERY_PRICE_TIER_LIMIT) {
    return { ok: false, error: limitError };
  }
  sortDeliveryPriceTiers(normalized);
  return {
    ok: true,
    items: normalized.map((tier, index) => ({
      ...tier,
      sort_order: index,
    })),
  };
}

function normalizeDeliveryPriceTiersForOutput(rawTiers) {
  const list = Array.isArray(rawTiers) ? rawTiers : [];
  const normalized = list.map((tier, index) => ({
    min_order_amount: normalizeDeliveryMoney(tier && tier.min_order_amount) ?? 0,
    delivery_cost: normalizeDeliveryMoney(tier && tier.delivery_cost) ?? 0,
    sort_order: tier && tier.sort_order != null ? Number(tier.sort_order) : index,
  }));
  return sortDeliveryPriceTiers(normalized);
}

function summarizeDeliveryPriceTiers(rawTiers, subtotal) {
  const amount = Math.max(0, Number(subtotal || 0) || 0);
  const tiers = normalizeDeliveryPriceTiersForOutput(rawTiers);
  if (!tiers.length) {
    return {
      min_order_amount: 0,
      delivery_cost: 0,
      free_delivery_from: null,
      matched_tier: null,
    };
  }

  const firstTier = tiers[0] || {};
  let matchedTier = firstTier;
  tiers.forEach((tier) => {
    const minOrderAmount = Number(tier && tier.min_order_amount || 0);
    if (amount >= minOrderAmount) {
      matchedTier = tier;
    }
  });

  const freeTier = tiers.find((tier) => Number(tier && tier.delivery_cost || 0) <= 0);
  return {
    min_order_amount: Number(firstTier.min_order_amount || 0),
    delivery_cost: Number(matchedTier && matchedTier.delivery_cost || 0),
    free_delivery_from: freeTier ? Number(freeTier.min_order_amount || 0) : null,
    matched_tier: matchedTier || null,
  };
}

function buildLegacyDeliveryPriceTiers(source) {
  const deliveryCost = normalizeDeliveryMoney(source && source.delivery_cost);
  const minOrderAmount = normalizeDeliveryMoney(source && source.min_order_amount);
  const freeDeliveryFrom = normalizeDeliveryMoney(source && source.free_delivery_from);
  const tiers = [{
    min_order_amount: minOrderAmount ?? 0,
    delivery_cost: deliveryCost ?? 0,
    sort_order: 0,
  }];
  if (freeDeliveryFrom != null) {
    tiers.push({
      min_order_amount: freeDeliveryFrom,
      delivery_cost: 0,
      sort_order: 1,
    });
  }
  return normalizeDeliveryPriceTiersForOutput(tiers);
}

function deriveLegacyDeliveryFieldsFromTiers(rawTiers) {
  const summary = summarizeDeliveryPriceTiers(rawTiers, 0);
  return {
    delivery_cost: Number(summary.delivery_cost || 0),
    min_order_amount: Number(summary.min_order_amount || 0),
    free_delivery_from: summary.free_delivery_from != null ? Number(summary.free_delivery_from) : null,
  };
}

module.exports = {
  DELIVERY_PRICE_TIER_LIMIT,
  buildLegacyDeliveryPriceTiers,
  deriveLegacyDeliveryFieldsFromTiers,
  normalizeDeliveryEtaMinutes,
  normalizeDeliveryMoney,
  normalizeDeliveryPriceTier,
  normalizeDeliveryPriceTiersForOutput,
  sanitizeDeliveryPriceTiers,
  summarizeDeliveryPriceTiers,
};
