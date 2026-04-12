const crypto = require("crypto");

const DEFAULT_PAGE_LIMIT = 100;
let ensureClaimedRewardCountColumnPromise = null;
let claimedRewardCountColumnReady = false;

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return fallback;
}

function toPositiveInt(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : null;
}

function toNonNegativeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : null;
}

function roundMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function normalizeProgressBasis(value, fallback = "orders") {
  const raw = toText(value).toLowerCase();
  if (["orders", "items", "amount"].includes(raw)) return raw;
  return fallback;
}

function normalizeRewardKind(value, fallback = "gift") {
  const raw = toText(value).toLowerCase();
  if (["gift", "discount", "promo_code"].includes(raw)) return raw;
  return fallback;
}

function normalizePendingRewardMode(value, fallback = "stack") {
  return toText(value).toLowerCase() === "single_pending" ? "single_pending" : fallback;
}

function normalizeProductConfigMode(value, fallback = "any") {
  return toText(value).toLowerCase() === "exact"
    ? "exact"
    : (toText(fallback).toLowerCase() === "exact" ? "exact" : "any");
}

function normalizeProductConfigPayload(value, fallbackProductId = null) {
  const source = parseJsonObject(value, null);
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const productId = toPositiveInt(source.product_id || fallbackProductId);
  if (!productId) return null;
  const options = (Array.isArray(source.options) ? source.options : [])
    .map((option) => ({
      id: toPositiveInt(option?.id),
      qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
      target_product_id: toPositiveInt(option?.target_product_id || option?.product_id),
      variant_group_id: toPositiveInt(option?.variant_group_id),
      variant_value_index: toNonNegativeInt(option?.variant_value_index),
    }))
    .filter((option) => option.id)
    .sort((a, b) => (
      a.id - b.id
      || Number(a.target_product_id || 0) - Number(b.target_product_id || 0)
      || Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0)
      || Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
    ));
  const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
    .map((ingredient) => ({
      ingredient_id: toPositiveInt(ingredient?.ingredient_id || ingredient?.product_id),
      qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0),
    }))
    .filter((ingredient) => ingredient.ingredient_id)
    .sort((a, b) => a.ingredient_id - b.ingredient_id);
  return {
    type: "product",
    product_id: productId,
    variant_group_id: toPositiveInt(source.variant_group_id),
    variant_value_index: toNonNegativeInt(source.variant_value_index),
    options,
    ingredients,
  };
}

function buildProductConfigSignature(value, fallbackProductId = null) {
  const payload = normalizeProductConfigPayload(value, fallbackProductId);
  if (!payload) return null;
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildOrderItemSignaturePayload(item) {
  if (!item || typeof item !== "object") return null;
  if (toText(item.type).toLowerCase() === "combo") {
    const comboId = toPositiveInt(item.combo_id);
    if (!comboId) return null;
    const selections = (Array.isArray(item.selections) ? item.selections : []).map((selection) => {
      const ingredients = (Array.isArray(selection.ingredients_display) ? selection.ingredients_display : [])
        .map((ingredient) => ({
          ingredient_id: toPositiveInt(ingredient?.ingredient_id),
          qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0),
        }))
        .filter((ingredient) => ingredient.ingredient_id)
        .sort((a, b) => a.ingredient_id - b.ingredient_id);
      return {
        product_id: toPositiveInt(selection?.product_id),
        variant_group_id: toPositiveInt(selection?.variant_group_id),
        variant_value_index: toNonNegativeInt(selection?.variant_value_index),
        ingredients,
      };
    });
    return {
      type: "combo",
      combo_id: comboId,
      selections,
    };
  }

  const productId = toPositiveInt(item.product_id);
  if (!productId) return null;
  const options = (Array.isArray(item.option_items) ? item.option_items : [])
    .map((option) => ({
      id: toPositiveInt(option?.id),
      qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
      target_product_id: toPositiveInt(option?.target_product_id || option?.product_id),
      variant_group_id: toPositiveInt(option?.variant_group_id),
      variant_value_index: toNonNegativeInt(option?.variant_value_index),
    }))
    .filter((option) => option.id)
    .sort((a, b) => (
      a.id - b.id
      || Number(a.target_product_id || 0) - Number(b.target_product_id || 0)
      || Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0)
      || Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
    ));
  const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : [])
    .map((ingredient) => ({
      ingredient_id: toPositiveInt(ingredient?.ingredient_id || ingredient?.product_id),
      qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0),
    }))
    .filter((ingredient) => ingredient.ingredient_id)
    .sort((a, b) => a.ingredient_id - b.ingredient_id);

  return {
    type: "product",
    product_id: productId,
    variant_group_id: toPositiveInt(item.variant_group_id),
    variant_value_index: toNonNegativeInt(item.variant_value_index),
    options,
    ingredients,
  };
}

function buildOrderItemSignature(item) {
  const payload = buildOrderItemSignaturePayload(item);
  if (!payload) return null;
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function ensureClaimedRewardCountColumn(db) {
  if (claimedRewardCountColumnReady) return;
  if (!ensureClaimedRewardCountColumnPromise) {
    ensureClaimedRewardCountColumnPromise = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS \`mkt_discount_progress\` (
           \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
           \`tenant_id\` int NOT NULL DEFAULT '1',
           \`customer_id\` int NOT NULL,
           \`discount_id\` int UNSIGNED NOT NULL,
           \`progress_value\` decimal(12,2) NOT NULL DEFAULT '0.00',
           \`pending_reward_count\` int UNSIGNED NOT NULL DEFAULT '0',
           \`claimed_reward_count\` int UNSIGNED NOT NULL DEFAULT '0',
           \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
           \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (\`id\`),
           UNIQUE KEY \`uq_mkt_discount_progress_customer\` (\`tenant_id\`,\`customer_id\`,\`discount_id\`),
           KEY \`idx_mkt_discount_progress_discount\` (\`tenant_id\`,\`discount_id\`)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      await db.query(
        `CREATE TABLE IF NOT EXISTS \`mkt_discount_rewards\` (
           \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
           \`tenant_id\` int NOT NULL DEFAULT '1',
           \`customer_id\` int NOT NULL,
           \`discount_id\` int UNSIGNED NOT NULL,
           \`reward_type\` enum('gift','promo_code','discount') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gift',
           \`reward_payload_json\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
           \`status\` enum('available','used','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
           \`claimed_at\` timestamp NULL DEFAULT NULL,
           \`used_at\` timestamp NULL DEFAULT NULL,
           \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
           \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (\`id\`),
           KEY \`idx_mkt_discount_rewards_customer_status\` (\`tenant_id\`,\`customer_id\`,\`status\`),
           KEY \`idx_mkt_discount_rewards_discount\` (\`tenant_id\`,\`discount_id\`)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      try {
        await db.query(
          `ALTER TABLE mkt_discount_progress
             ADD COLUMN claimed_reward_count int UNSIGNED NOT NULL DEFAULT '0'
             AFTER pending_reward_count`
        );
      } catch (error) {
        if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
      }
      claimedRewardCountColumnReady = true;
    })().catch((error) => {
      claimedRewardCountColumnReady = false;
      throw error;
    }).finally(() => {
      ensureClaimedRewardCountColumnPromise = null;
    });
  }
  await ensureClaimedRewardCountColumnPromise;
}

function getTargetEntityType(row) {
  const explicitType = toText(row?.entity_type || row?.target_type || row?.type).toLowerCase();
  if (["product", "category", "combo"].includes(explicitType)) return explicitType;
  if (Number(row?.product_id || 0) > 0) return "product";
  if (Number(row?.category_id || 0) > 0) return "category";
  if (Number(row?.combo_id || 0) > 0) return "combo";
  return "";
}

function addExactProductSignature(map, productId, signature) {
  if (!(productId > 0) || !signature) return;
  if (!map.has(productId)) map.set(productId, new Set());
  map.get(productId).add(signature);
}

function buildTargetSets(rows) {
  const productIds = new Set();
  const anyProductIds = new Set();
  const exactProductSignaturesByProductId = new Map();
  const categoryIds = new Set();
  const comboIds = new Set();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const entityType = getTargetEntityType(row);
    const productId = Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
    const categoryId = Number(row?.category_id ?? row?.entity_id ?? row?.id ?? 0);
    const comboId = Number(row?.combo_id ?? row?.entity_id ?? row?.id ?? 0);
    if (entityType === "product" && productId > 0) {
      productIds.add(productId);
      const configMode = normalizeProductConfigMode(row?.config_mode, "any");
      const signature = configMode === "exact"
        ? buildProductConfigSignature(row?.product_config ?? row?.product_config_json, productId)
        : null;
      if (signature) {
        addExactProductSignature(exactProductSignaturesByProductId, productId, signature);
      } else if (configMode !== "exact") {
        anyProductIds.add(productId);
      }
      return;
    }
    if (entityType === "category" && categoryId > 0) {
      categoryIds.add(categoryId);
      return;
    }
    if (entityType === "combo" && comboId > 0) {
      comboIds.add(comboId);
    }
  });

  return { productIds, anyProductIds, exactProductSignaturesByProductId, categoryIds, comboIds };
}

function matchTargetProduct(targetSets, item) {
  if (!item || item.type === "combo") return false;
  const productId = Number(item?.product_id || 0);
  if (!(productId > 0)) return false;
  if (targetSets?.anyProductIds instanceof Set && targetSets.anyProductIds.has(productId)) {
    return true;
  }
  const exactSignatures = targetSets?.exactProductSignaturesByProductId instanceof Map
    ? targetSets.exactProductSignaturesByProductId.get(productId)
    : null;
  if (!exactSignatures || !exactSignatures.size) return false;
  const itemSignature = buildOrderItemSignature(item);
  return !!(itemSignature && exactSignatures.has(itemSignature));
}

function matchTargetCategory(targetSets, item, productCategoriesMap) {
  if (!item || item.type === "combo") return false;
  const productId = Number(item?.product_id || 0);
  if (!(productId > 0)) return false;
  const categoryIds = productCategoriesMap.get(productId) || [];
  return categoryIds.some((categoryId) => targetSets?.categoryIds?.has(Number(categoryId || 0)));
}

function matchTargetCombo(targetSets, item) {
  return !!(item?.type === "combo" && targetSets?.comboIds?.has(Number(item?.combo_id || 0)));
}

function matchTargetScope(targetSets, item, productCategoriesMap, scope = "product") {
  const normalizedScope = toText(scope).toLowerCase() || "product";
  if (normalizedScope === "product") return matchTargetProduct(targetSets, item);
  if (normalizedScope === "category") return matchTargetCategory(targetSets, item, productCategoriesMap);
  if (normalizedScope === "combo") return matchTargetCombo(targetSets, item);
  return matchTargetProduct(targetSets, item)
    || matchTargetCategory(targetSets, item, productCategoriesMap)
    || matchTargetCombo(targetSets, item);
}

function parseOrderItems(rawItems) {
  let items = rawItems;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") return null;
      const productId = Number(rawItem?.product_id || rawItem?.id || rawItem?.product?.id || 0);
      const qtyRaw = Number(rawItem?.qty ?? rawItem?.quantity ?? 0);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.max(1, Math.floor(qtyRaw)) : 1;
      const lineTotalRaw = Number(rawItem?.line_total ?? rawItem?.total ?? rawItem?.total_price ?? 0);
      const priceRaw = Number(rawItem?.price ?? rawItem?.unit_price ?? 0);
      const photos = Array.isArray(rawItem?.photos)
        ? rawItem.photos.map((photo) => toText(photo)).filter(Boolean)
        : [];
      const fallbackPhoto = toText(
        rawItem?.product_photo || rawItem?.photo || rawItem?.photo_url || rawItem?.product?.photo_url
      );
      const normalizedType = toText(
        rawItem?.type || (Number(rawItem?.combo_id || rawItem?.combo?.id || 0) > 0 ? "combo" : "product")
      ).toLowerCase() || "product";
      const optionItems = ([
        ...(Array.isArray(rawItem?.option_items) ? rawItem.option_items : []),
        ...(Array.isArray(rawItem?.options) ? rawItem.options : []),
      ])
        .map((option) => ({
          id: Number(option?.id || 0) || null,
          qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
          target_product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
          variant_group_id: Number(option?.variant_group_id || 0) || null,
          variant_value_index: Number.isFinite(Number(option?.variant_value_index))
            ? Number(option.variant_value_index)
            : null,
        }))
        .filter((option) => Number(option?.id || 0) > 0);
      const ingredients = (Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [])
        .map((ingredient) => ({
          ingredient_id: Number(ingredient?.ingredient_id || ingredient?.product_id || 0) || null,
          qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
        }))
        .filter((ingredient) => Number(ingredient?.ingredient_id || 0) > 0);
      const variantGroupId = Number(rawItem?.variant_group_id || 0);
      const variantValueIndex = Number(rawItem?.variant_value_index);
      return {
        type: normalizedType,
        combo_id: Number(rawItem?.combo_id || rawItem?.combo?.id || 0) || null,
        product_id: productId > 0 ? productId : null,
        qty,
        line_total: Number.isFinite(lineTotalRaw)
          ? lineTotalRaw
          : (Number.isFinite(priceRaw) ? Number(priceRaw * qty) : 0),
        auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
        title: toText(
          rawItem?.product_name || rawItem?.name || rawItem?.title || rawItem?.product?.name || rawItem?.product?.title
        ) || "\u0422\u043e\u0432\u0430\u0440",
        photo_url: photos[0] || fallbackPhoto || "",
        option_items: optionItems,
        ingredients,
        variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
        variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
          ? variantValueIndex
          : null,
      };
    })
    .filter(Boolean);
}

function collectMatchedItems(discount, items, productCategoriesMap) {
  const mechanic = parseJsonObject(discount?.mechanic_config_json, {});
  const scopeMode = toText(mechanic?.qualifying_scope_mode).toLowerCase() || "none";
  const targetSets = buildTargetSets(mechanic?.qualifying_items || []);
  const sourceItems = (Array.isArray(items) ? items : []).filter((item) => Number(item?.auto_add || 0) !== 1);
  return sourceItems.filter((item) => {
    if (scopeMode === "none") return true;
    return matchTargetScope(targetSets, item, productCategoriesMap, scopeMode);
  });
}

function normalizeSlotCount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.floor(num));
}

function getProgressDisplayValue(progressBasis, progressValue, thresholdValue, pendingRewardCount) {
  const basis = normalizeProgressBasis(progressBasis, "orders");
  const threshold = Number(thresholdValue || 0);
  const current = Number(progressValue || 0);
  const pendingCount = normalizeSlotCount(pendingRewardCount);
  if (!(threshold > 0)) return Math.max(0, current);

  if (basis === "amount") {
    if (pendingCount > 0) return threshold;
    const remainder = current % threshold;
    if (remainder === 0 && current > 0) return Math.min(current, threshold);
    return Math.max(0, Math.min(threshold, remainder || current));
  }

  const normalizedThreshold = normalizeSlotCount(threshold);
  const normalizedCurrent = normalizeSlotCount(current);
  if (!(normalizedThreshold > 0)) return normalizedCurrent;
  if (pendingCount > 0) return normalizedThreshold;
  const remainder = normalizedCurrent % normalizedThreshold;
  if (remainder === 0 && normalizedCurrent > 0) return Math.min(normalizedCurrent, normalizedThreshold);
  return Math.max(0, Math.min(normalizedThreshold, remainder || normalizedCurrent));
}

function getRewardQty(mechanic) {
  const rewardQty = Number(mechanic?.reward_qty || 0);
  if (!Number.isFinite(rewardQty) || rewardQty <= 0) return 1;
  return Math.max(1, Math.floor(rewardQty));
}

function buildProgressState(discount, progressRow) {
  const mechanic = parseJsonObject(discount?.mechanic_config_json, {});
  const progressBasis = normalizeProgressBasis(mechanic?.progress_basis, "orders");
  const thresholdValue = Number(mechanic?.threshold_value || mechanic?.buy_qty || 0);
  const progressValue = Number(progressRow?.progress_value || 0);
  const pendingRewardCount = Number(progressRow?.pending_reward_count || 0);
  const rewardKind = normalizeRewardKind(mechanic?.reward_kind, "gift");
  const rewardQty = getRewardQty(mechanic);
  const pendingRewardMode = normalizePendingRewardMode(mechanic?.pending_reward_mode, "stack");
  const rewardConfig = parseJsonObject(mechanic?.reward, {});
  const displayProgressValue = getProgressDisplayValue(
    progressBasis,
    progressValue,
    thresholdValue,
    pendingRewardCount
  );
  const progressRatio = thresholdValue > 0
    ? Math.max(0, Math.min(1, Number(displayProgressValue || 0) / thresholdValue))
    : 0;
  const rewardText = rewardKind === "promo_code"
    ? "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434"
    : rewardKind === "discount"
      ? "\u0421\u043a\u0438\u0434\u043a\u0430"
      : "\u041f\u043e\u0434\u0430\u0440\u043e\u043a";
  const progressText = progressBasis === "amount"
    ? `${Math.min(displayProgressValue, thresholdValue || displayProgressValue)} / ${thresholdValue || 0} \u20bd`
    : `${Math.min(displayProgressValue, thresholdValue || displayProgressValue)} / ${thresholdValue || 0}`;
  return {
    mechanic,
    progressBasis,
    thresholdValue,
    progressValue,
    pendingRewardCount,
    rewardKind,
    rewardQty,
    pendingRewardMode,
    rewardConfig,
    displayProgressValue,
    progressRatio,
    rewardText,
    progressText,
  };
}

async function loadProductsMap(db, tenantId, productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const [rows] = await db.query(
    `SELECT id, name, price, old_price, photos_json
       FROM prod_products
      WHERE tenant_id = ? AND id IN (?)`,
    [tenantId, ids]
  );
  const result = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    let photoUrl = null;
    try {
      const photos = JSON.parse(row?.photos_json || "[]");
      if (Array.isArray(photos) && photos.length) {
        photoUrl = toText(photos[0]) || null;
      }
    } catch {}
    result.set(Number(row?.id || 0), {
      id: Number(row?.id || 0),
      title: toText(row?.name),
      price: Number(row?.price || row?.old_price || 0),
      photo_url: photoUrl,
    });
  });
  return result;
}

async function loadProductCategoriesMap(db, tenantId, productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const [rows] = await db.query(
    `SELECT product_id, category_id
       FROM prod_product_categories
      WHERE tenant_id = ? AND product_id IN (?)`,
    [tenantId, ids]
  );
  const result = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const productId = Number(row?.product_id || 0);
    const categoryId = Number(row?.category_id || 0);
    if (!(productId > 0) || !(categoryId > 0)) return;
    if (!result.has(productId)) result.set(productId, []);
    result.get(productId).push(categoryId);
  });
  return result;
}

function collectQualifyingProductIds(discount) {
  const mechanic = parseJsonObject(discount?.mechanic_config_json, {});
  return [...new Set(
    (Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [])
      .map((row) => {
        const entityType = toText(row?.entity_type).toLowerCase();
        if (entityType && entityType !== "product") return 0;
        return Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
      })
      .filter((id) => id > 0)
  )];
}

function collectRewardProductIds(discount) {
  const mechanic = parseJsonObject(discount?.mechanic_config_json, {});
  const giftProductIds = (Array.isArray(mechanic?.reward?.gift_products) ? mechanic.reward.gift_products : [])
    .map((row) => Number(row?.entity_id ?? row?.product_id ?? row?.id ?? 0))
    .filter((id) => id > 0);
  const discountProductIds = (Array.isArray(mechanic?.reward?.discount?.products) ? mechanic.reward.discount.products : [])
    .map((row) => Number(row?.entity_id ?? row?.product_id ?? row?.id ?? 0))
    .filter((id) => id > 0);
  return [...new Set([...giftProductIds, ...discountProductIds])];
}

function normalizeVisualProductEntry(entry, productsMap) {
  if (!entry || typeof entry !== "object") return null;
  const productId = Number(entry?.product_id || 0);
  const product = productId > 0 ? (productsMap.get(productId) || null) : null;
  const title = toText(entry?.title || entry?.name || product?.title) || "\u0422\u043e\u0432\u0430\u0440";
  const photoUrl = toText(entry?.photo_url || entry?.photo || product?.photo_url);
  return {
    product_id: productId > 0 ? productId : null,
    title,
    photo_url: photoUrl || null,
  };
}

function buildFallbackUnits(discount, productsMap, count) {
  const safeCount = normalizeSlotCount(count);
  if (!(safeCount > 0)) return [];
  const mechanic = parseJsonObject(discount?.mechanic_config_json, {});
  const sourceRows = Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [];
  const baseUnits = sourceRows
    .map((row) => {
      const entityType = toText(row?.entity_type).toLowerCase();
      if (entityType && entityType !== "product") return null;
      return normalizeVisualProductEntry({
        product_id: Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0),
        title: toText(row?.title || row?.name),
        photo_url: toText(row?.photo || row?.photo_url),
      }, productsMap);
    })
    .filter(Boolean);
  if (!baseUnits.length) return [];
  return Array.from({ length: safeCount }, (_, index) => ({ ...baseUnits[index % baseUnits.length] }));
}

function buildOrderSlots(state) {
  const slotCount = normalizeSlotCount(state?.thresholdValue);
  if (!(slotCount > 0)) return null;
  const filledCount = Math.max(0, Math.min(slotCount, normalizeSlotCount(state?.displayProgressValue)));
  return {
    mode: "orders",
    slot_count: slotCount,
    filled_count: filledCount,
    slots: Array.from({ length: slotCount }, (_, index) => ({
      index: index + 1,
      kind: "order",
      is_filled: index < filledCount,
    })),
  };
}

function buildAmountVisual(state) {
  const thresholdValue = Math.max(0, Number(state?.thresholdValue || 0));
  return {
    mode: "amount",
    current_value: Math.max(0, Number(state?.displayProgressValue || 0)),
    threshold_value: thresholdValue,
    progress_ratio: thresholdValue > 0
      ? Math.max(0, Math.min(1, Number(state?.progressRatio || 0)))
      : 0,
  };
}

function buildItemsVisual({
  discount,
  state,
  orders,
  productCategoriesMap,
  productsMap,
}) {
  const slotCount = normalizeSlotCount(state?.thresholdValue);
  if (!(slotCount > 0)) return null;

  const filledCount = Math.max(0, Math.min(slotCount, normalizeSlotCount(state?.displayProgressValue)));
  const discountStoreId = Number(discount?.store_id || 0);
  const scopedOrders = discountStoreId > 0
    ? (Array.isArray(orders) ? orders : []).filter((order) => Number(order?.store_id || 0) === discountStoreId)
    : (Array.isArray(orders) ? orders : []);
  const recentUnits = [];

  scopedOrders.forEach((order) => {
    const matchedItems = collectMatchedItems(discount, Array.isArray(order?.items) ? order.items : [], productCategoriesMap);
    matchedItems.forEach((matchedItem) => {
      const normalizedUnit = normalizeVisualProductEntry(matchedItem, productsMap) || {
        product_id: Number(matchedItem?.product_id || 0) || null,
        title: toText(matchedItem?.title) || "\u0422\u043e\u0432\u0430\u0440",
        photo_url: null,
      };
      const qty = Math.max(1, Number(matchedItem?.qty || 0));
      for (let index = 0; index < qty; index += 1) {
        recentUnits.push(normalizedUnit);
        if (recentUnits.length > slotCount) recentUnits.shift();
      }
    });
  });

  const fallbackUnits = buildFallbackUnits(discount, productsMap, filledCount);
  const filledUnits = recentUnits.slice(-filledCount).map((unit) => ({ ...unit }));
  while (filledUnits.length < filledCount) {
    const fallbackUnit = fallbackUnits[filledUnits.length] || null;
    filledUnits.push(fallbackUnit ? { ...fallbackUnit } : null);
  }

  return {
    mode: "items",
    slot_count: slotCount,
    filled_count: filledCount,
    slots: Array.from({ length: slotCount }, (_, index) => {
      if (index >= filledCount) {
        return {
          index: index + 1,
          kind: "item",
          is_filled: false,
          product_id: null,
          title: "",
          photo_url: null,
        };
      }
      const unit = filledUnits[index] || null;
      return {
        index: index + 1,
        kind: "item",
        is_filled: true,
        product_id: Number(unit?.product_id || 0) || null,
        title: toText(unit?.title),
        photo_url: toText(unit?.photo_url) || null,
      };
    }),
  };
}

function buildRewardProductsPayload(items, productsMap) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const productId = Number(item?.entity_id || item?.product_id || item?.id || 0);
      if (!(productId > 0)) return null;
      const product = productsMap.get(productId) || null;
      return {
        id: productId,
        title: toText(item?.title) || toText(product?.title) || "\u0422\u043e\u0432\u0430\u0440",
        photo_url: product?.photo_url || null,
      };
    })
    .filter(Boolean);
}

function formatDiscountBadgeText(discountType, discountValue) {
  const normalizedType = toText(discountType).toLowerCase() || "percent";
  const value = Number(discountValue || 0);
  if (normalizedType === "fixed" || normalizedType === "special_price") return `-${Math.round(value)} \u20bd`;
  return `-${Math.round(value)}%`;
}

function formatApplyScopeText(applyTo) {
  const normalized = toText(applyTo).toLowerCase();
  if (normalized === "product") return "\u041d\u0430 \u0442\u043e\u0432\u0430\u0440";
  if (normalized === "category") return "\u041d\u0430 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e";
  return "\u041d\u0430 \u0432\u0435\u0441\u044c \u0437\u0430\u043a\u0430\u0437";
}

function buildGiftRewardPreview(discount, state, productsMap) {
  const products = buildRewardProductsPayload(state?.rewardConfig?.gift_products, productsMap);
  const firstProduct = products[0] || null;
  return {
    kind: "gift",
    icon_kind: "gift",
    title: toText(discount?.title) || "\u041f\u043e\u0434\u0430\u0440\u043e\u043a",
    description: toText(discount?.description) || toText(firstProduct?.title),
    badge_text: "\u041f\u043e\u0434\u0430\u0440\u043e\u043a",
    photo_url: toText(firstProduct?.photo_url) || null,
    product_count: products.length,
    products,
  };
}

function buildDiscountRewardPreview(discount, state, productsMap) {
  const rewardDiscount = parseJsonObject(state?.rewardConfig?.discount, {});
  return {
    kind: "discount",
    icon_kind: "discount",
    title: toText(discount?.title) || "\u0421\u043a\u0438\u0434\u043a\u0430",
    description: toText(discount?.description),
    badge_text: formatDiscountBadgeText(rewardDiscount?.discount_type, rewardDiscount?.discount_value) || "\u0421\u043a\u0438\u0434\u043a\u0430",
    apply_scope_text: formatApplyScopeText(rewardDiscount?.apply_to ?? discount?.apply_to),
    products: buildRewardProductsPayload(rewardDiscount?.products, productsMap),
    photo_url: null,
  };
}

function buildPromoRewardPreview(discount, state) {
  const promoSource = parseJsonObject(state?.rewardConfig?.promo_code, {});
  const sourceCodeMode = toText(promoSource?.source_code_mode).toLowerCase() === "unique" ? "unique" : "shared";
  const sourceCode = toText(promoSource?.source_code);
  const sourceTitle = toText(promoSource?.source_discount_title);
  return {
    kind: "promo_code",
    icon_kind: "promo_code",
    title: toText(discount?.title) || "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434",
    description: toText(discount?.description) || "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u0432 \u043f\u043e\u0434\u0430\u0440\u043e\u043a",
    badge_text: "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434",
    apply_scope_text: sourceCodeMode === "unique"
      ? (sourceTitle
          ? `\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ${sourceTitle}`
          : "\u0423\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u0432 \u043f\u043e\u0434\u0430\u0440\u043e\u043a")
      : (sourceCode
          ? `\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ${sourceCode}`
          : "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u0432 \u043f\u043e\u0434\u0430\u0440\u043e\u043a"),
    photo_url: null,
  };
}

function buildRewardPreview(discount, state, productsMap) {
  if (state.rewardKind === "discount") return buildDiscountRewardPreview(discount, state, productsMap);
  if (state.rewardKind === "promo_code") return buildPromoRewardPreview(discount, state);
  return buildGiftRewardPreview(discount, state, productsMap);
}

function getInteractionMode(discount, state) {
  const scopeMode = toText(state?.mechanic?.qualifying_scope_mode).toLowerCase();
  if (state?.progressBasis === "items" && ["product", "category"].includes(scopeMode)) {
    return "products_sheet";
  }
  return "info_modal";
}

function getClaimMode(state) {
  return toText(state?.rewardKind).toLowerCase() === "gift" ? "gift_sheet" : "direct";
}

function buildProgressCard(discount, progressRow, progressVisual, rewardPreview, customerId) {
  const state = buildProgressState(discount, progressRow);
  return {
    id: Number(customerId || 0),
    discount_id: Number(discount?.id || 0) || null,
    customer_id: Number(customerId || 0) || null,
    kind: "progress",
    title: toText(discount?.title) || "\u041d\u0430\u043a\u043e\u043f\u0438\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u0430\u043a\u0446\u0438\u044f",
    description: toText(discount?.description) || `\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441: ${state.progressText}`,
    badge_text: state.pendingRewardCount > 0 ? `${state.pendingRewardCount}` : state.progressText,
    apply_scope_text: state.pendingRewardCount > 0
      ? `\u041c\u043e\u0436\u043d\u043e \u0437\u0430\u0431\u0440\u0430\u0442\u044c: ${state.rewardText}`
      : `\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430: ${state.rewardText}`,
    expires_at: discount?.ends_at || null,
    is_claimable: state.pendingRewardCount > 0,
    pending_reward_count: state.pendingRewardCount,
    claimed_reward_count: Math.max(0, Number(progressRow?.claimed_reward_count || 0)),
    progress_value: state.progressValue,
    progress_display_value: state.displayProgressValue,
    threshold_value: state.thresholdValue,
    progress_basis: state.progressBasis,
    progress_ratio: state.progressRatio,
    reward_kind: state.rewardKind,
    reward_qty: state.rewardQty,
    pending_reward_mode: state.pendingRewardMode,
    claim_mode: getClaimMode(state),
    interaction_mode: getInteractionMode(discount, state),
    qualifying_scope_mode: toText(state?.mechanic?.qualifying_scope_mode).toLowerCase() || "none",
    reward_preview: rewardPreview,
    progress_visual: progressVisual,
    is_applicable: true,
  };
}

function buildRewardSlot(state, rewardPreview) {
  const preview = rewardPreview && typeof rewardPreview === "object" ? rewardPreview : {};
  const previewProducts = Array.isArray(preview?.products) ? preview.products : [];
  const firstProduct = previewProducts[0] || null;
  return {
    kind: toText(preview?.kind || state?.rewardKind).toLowerCase() || "gift",
    icon_kind: toText(preview?.icon_kind || preview?.kind || state?.rewardKind).toLowerCase() || "gift",
    title: toText(preview?.title) || toText(state?.rewardText) || "\u041d\u0430\u0433\u0440\u0430\u0434\u0430",
    badge_text: toText(preview?.badge_text) || toText(state?.rewardText) || "\u041d\u0430\u0433\u0440\u0430\u0434\u0430",
    subtitle: toText(preview?.apply_scope_text),
    photo_url: toText(preview?.photo_url || firstProduct?.photo_url) || null,
    product_count: Number(preview?.product_count || previewProducts.length || 0),
    code_preview: toText(preview?.code_preview || preview?.source_code) || null,
    is_claimable: Number(state?.pendingRewardCount || 0) > 0,
    pending_reward_count: Number(state?.pendingRewardCount || 0),
  };
}

function normalizePage(value) {
  const page = Number(value || 1);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.max(1, Math.floor(page));
}

function buildAudienceSelection(rows) {
  const targetRows = Array.isArray(rows) ? rows : [];
  const customerIds = new Set();
  const categoryIds = new Set();
  let useAll = targetRows.length < 1;

  targetRows.forEach((row) => {
    const targetType = toText(row?.target_type || row?.entity_type || row?.type).toLowerCase();
    if (targetType === "all") {
      useAll = true;
      return;
    }
    if (targetType === "customer") {
      const customerId = Number(row?.customer_id || row?.entity_id || 0);
      if (customerId > 0) customerIds.add(customerId);
      return;
    }
    if (targetType === "category") {
      const categoryId = Number(row?.customer_category_id || row?.category_id || row?.entity_id || 0);
      if (categoryId > 0) categoryIds.add(categoryId);
    }
  });

  if (!useAll && !customerIds.size && !categoryIds.size) {
    useAll = true;
  }

  return {
    useAll,
    customerIds: [...customerIds],
    categoryIds: [...categoryIds],
  };
}

function buildAudienceQueryParts(selection, tenantId, storeId, discountId) {
  const joins = [
    `LEFT JOIN mkt_discount_progress p
       ON p.tenant_id = c.tenant_id
      AND p.customer_id = c.id
      AND p.discount_id = ?`,
  ];
  const params = [discountId];
  const where = [
    `c.tenant_id = ?`,
    `c.store_id = ?`,
    `c.is_active = 1`,
  ];
  params.push(tenantId, storeId);

  if (!selection?.useAll) {
    joins.push(
      `LEFT JOIN cust_customer_category_links ccl
         ON ccl.tenant_id = c.tenant_id
        AND ccl.customer_id = c.id`
    );
    const audienceParts = [];
    if (Array.isArray(selection?.customerIds) && selection.customerIds.length) {
      audienceParts.push(`c.id IN (?)`);
      params.push(selection.customerIds);
    }
    if (Array.isArray(selection?.categoryIds) && selection.categoryIds.length) {
      audienceParts.push(`ccl.category_id IN (?)`);
      params.push(selection.categoryIds);
    }
    if (audienceParts.length) {
      where.push(`(${audienceParts.join(" OR ")})`);
    } else {
      where.push(`1 = 0`);
    }
  }

  return {
    joins,
    where,
    params,
  };
}

async function loadAudienceCustomersPage(db, {
  tenantId,
  storeId,
  discountId,
  selection,
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
}) {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = DEFAULT_PAGE_LIMIT;
  const offset = (normalizedPage - 1) * normalizedLimit;
  const queryParts = buildAudienceQueryParts(selection, tenantId, storeId, discountId);
  const joinSql = queryParts.joins.join("\n");
  const whereSql = queryParts.where.join("\n        AND ");

  const [[countRow]] = await db.query(
    `SELECT COUNT(DISTINCT c.id) AS total
       FROM cust_customers c
       ${joinSql}
      WHERE ${whereSql}`,
    queryParts.params
  );
  const total = Number(countRow?.total || 0) || 0;
  if (!(total > 0)) {
    return {
      rows: [],
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total: 0,
        has_more: false,
      },
    };
  }

      const [rows] = await db.query(
        `SELECT DISTINCT
            c.id,
            c.name,
            c.phone,
            COALESCE(p.progress_value, 0) AS progress_value,
            COALESCE(p.pending_reward_count, 0) AS pending_reward_count,
            COALESCE(p.claimed_reward_count, 0) AS claimed_reward_count,
            (COALESCE(p.pending_reward_count, 0) > 0) AS sort_has_pending,
            COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(c.phone), ''), '') AS sort_name
       FROM cust_customers c
       ${joinSql}
      WHERE ${whereSql}
      ORDER BY
        sort_has_pending DESC,
        COALESCE(p.progress_value, 0) DESC,
        sort_name ASC,
        c.id ASC
      LIMIT ? OFFSET ?`,
    [...queryParts.params, normalizedLimit, offset]
  );

  return {
    rows: Array.isArray(rows) ? rows : [],
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      has_more: offset + normalizedLimit < total,
    },
  };
}

async function loadCustomerHistoryOrdersByIds(db, tenantId, customerIds) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : [])
    .map((id) => Number(id || 0))
    .filter((id) => id > 0))];
  if (!ids.length) return new Map();

  const [rows] = await db.query(
    `SELECT id, customer_id, store_id, items
       FROM order_orders
      WHERE tenant_id = ?
        AND customer_id IN (?)
      ORDER BY customer_id ASC, created_at ASC, id ASC`,
    [tenantId, ids]
  );

  const result = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const customerId = Number(row?.customer_id || 0);
    if (!(customerId > 0)) return;
    if (!result.has(customerId)) result.set(customerId, []);
    result.get(customerId).push({
      id: Number(row?.id || 0),
      customer_id: customerId,
      store_id: Number(row?.store_id || 0),
      items: parseOrderItems(row?.items),
    });
  });
  return result;
}

async function loadClaimedRewardCountMap(db, tenantId, discountId, customerIds) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : [])
    .map((id) => Number(id || 0))
    .filter((id) => id > 0))];
  if (!ids.length) return new Map();

  const [rows] = await db.query(
    `SELECT customer_id, COUNT(*) AS claimed_count
       FROM mkt_discount_rewards
      WHERE tenant_id = ?
        AND discount_id = ?
        AND customer_id IN (?)
        AND claimed_at IS NOT NULL
      GROUP BY customer_id`,
    [tenantId, discountId, ids]
  );
  const result = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const customerId = Number(row?.customer_id || 0);
    if (customerId > 0) {
      result.set(customerId, Math.max(0, Number(row?.claimed_count || 0)));
    }
  });
  return result;
}

async function resolveDiscountRow(db, tenantId, storeId, discountId) {
  const [rows] = await db.query(
    `SELECT ${[
      "id",
      "tenant_id",
      "store_id",
      "title",
      "description",
      "apply_to",
      "ends_at",
      "mechanic_type",
      "mechanic_config_json",
      "is_deleted",
    ].join(", ")}
       FROM mkt_discounts
      WHERE tenant_id = ?
        AND id = ?
        AND (store_id = ? OR store_id = 0 OR store_id IS NULL)
      LIMIT 1`,
    [tenantId, discountId, storeId]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function loadDiscountAudienceRows(db, tenantId, discountId) {
  const [rows] = await db.query(
    `SELECT target_type, customer_id, customer_category_id
       FROM mkt_discount_customers
      WHERE tenant_id = ?
        AND discount_id = ?`,
    [tenantId, discountId]
  );
  return Array.isArray(rows) ? rows : [];
}

async function buildAdminLoyaltyProgressCustomersPage({
  db,
  tenantId,
  storeId,
  discountId,
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
}) {
  await ensureClaimedRewardCountColumn(db);
  const normalizedDiscountId = Number(discountId || 0);
  if (!(normalizedDiscountId > 0)) {
    throw Object.assign(new Error("INVALID_ID"), { statusCode: 400, code: "INVALID_ID" });
  }

  const discount = await resolveDiscountRow(db, tenantId, storeId, normalizedDiscountId);
  if (!discount) {
    throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (toText(discount?.mechanic_type) !== "loyalty_progress") {
    throw Object.assign(new Error("DISCOUNT_NOT_LOYALTY"), { statusCode: 409, code: "DISCOUNT_NOT_LOYALTY" });
  }

  const audienceRows = await loadDiscountAudienceRows(db, tenantId, normalizedDiscountId);
  const selection = buildAudienceSelection(audienceRows);
  const pageData = await loadAudienceCustomersPage(db, {
    tenantId,
    storeId,
    discountId: normalizedDiscountId,
    selection,
    page,
    limit,
  });

  const customerIds = pageData.rows
    .map((row) => Number(row?.id || 0))
    .filter((id) => id > 0);
  const claimedRewardCountMap = await loadClaimedRewardCountMap(db, tenantId, normalizedDiscountId, customerIds);
  const baseState = buildProgressState(discount, null);
  const needsOrderHistory = baseState.progressBasis === "items";
  const ordersByCustomerId = needsOrderHistory
    ? await loadCustomerHistoryOrdersByIds(db, tenantId, customerIds)
    : new Map();

  const historyProductIds = needsOrderHistory
    ? [...new Set(
        [...ordersByCustomerId.values()].flatMap((orders) => (
          (Array.isArray(orders) ? orders : []).flatMap((order) => (
            (Array.isArray(order?.items) ? order.items : [])
              .map((item) => Number(item?.product_id || 0))
              .filter((id) => id > 0)
          ))
        ))
      )]
    : [];
  const qualifyingProductIds = collectQualifyingProductIds(discount);
  const rewardProductIds = collectRewardProductIds(discount);
  const allProductIds = [...new Set([...historyProductIds, ...qualifyingProductIds, ...rewardProductIds])];
  const [productCategoriesMap, productsMap] = await Promise.all([
    historyProductIds.length ? loadProductCategoriesMap(db, tenantId, historyProductIds) : Promise.resolve(new Map()),
    allProductIds.length ? loadProductsMap(db, tenantId, allProductIds) : Promise.resolve(new Map()),
  ]);

  const customers = pageData.rows.map((row) => {
    const customerId = Number(row?.id || 0);
    const progressRow = {
      progress_value: Number(row?.progress_value || 0),
      pending_reward_count: Number(row?.pending_reward_count || 0),
      claimed_reward_count: Math.max(
        0,
        Number(row?.claimed_reward_count || 0),
        Number(claimedRewardCountMap.get(customerId) || 0)
      ),
    };
    const state = buildProgressState(discount, progressRow);
    let progressVisual = null;
    if (state.progressBasis === "amount") {
      progressVisual = buildAmountVisual(state);
    } else if (state.progressBasis === "items") {
      progressVisual = buildItemsVisual({
        discount,
        state,
        orders: ordersByCustomerId.get(customerId) || [],
        productCategoriesMap,
        productsMap,
      });
    } else {
      progressVisual = buildOrderSlots(state);
    }
    const rewardPreview = buildRewardPreview(discount, state, productsMap);
    const rewardSlot = buildRewardSlot(state, rewardPreview);
    if (progressVisual && typeof progressVisual === "object") {
      progressVisual = {
        ...progressVisual,
        reward_slot: rewardSlot,
      };
    } else {
      progressVisual = {
        mode: state.progressBasis,
        reward_slot: rewardSlot,
      };
    }
    return {
      customer: {
        id: customerId,
        name: toText(row?.name),
        phone: toText(row?.phone),
      },
      progress_card: buildProgressCard(
        discount,
        progressRow,
        progressVisual,
        rewardPreview,
        customerId
      ),
    };
  });

  return {
    customers,
    pagination: pageData.pagination,
  };
}

module.exports = {
  DEFAULT_PAGE_LIMIT,
  buildAdminLoyaltyProgressCustomersPage,
};
