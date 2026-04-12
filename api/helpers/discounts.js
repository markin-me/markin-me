function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function parseScheduleDays(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((day) => Number(day)).filter((day) => Number.isInteger(day));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((day) => Number(day)).filter((day) => Number.isInteger(day))
        : [];
    } catch {}
  }
  return [];
}

function normalizeMechanicType(value) {
  const raw = toText(value).toLowerCase();
  if (['simple_discount', 'buy_x_get_y', 'threshold', 'loyalty_progress'].includes(raw)) return raw;
  return 'simple_discount';
}

function getSimpleDiscountVariant(discount) {
  const config = parseJsonObject(discount?.mechanic_config_json, {});
  const fallback = toText(discount?.activation_mode).toLowerCase() === 'promo_code'
    ? 'promo_code'
    : toText(discount?.discount_type).toLowerCase();
  const raw = toText(config?.simple_variant ?? config?.variant ?? fallback).toLowerCase();
  if (['promo_code', 'percent', 'fixed', 'special_price'].includes(raw)) return raw;
  return fallback === 'promo_code' ? 'promo_code' : 'percent';
}

function isAutomaticSimpleDiscount(discount) {
  return normalizeMechanicType(discount?.mechanic_type) === 'simple_discount'
    && getSimpleDiscountVariant(discount) !== 'promo_code';
}

function isPromoSimpleDiscount(discount) {
  return normalizeMechanicType(discount?.mechanic_type) === 'simple_discount'
    && getSimpleDiscountVariant(discount) === 'promo_code';
}

function isDiscountActive(discount) {
  if (!discount || !discount.is_active) return false;
  if (Number(discount?.is_deleted || 0) === 1 || discount?.is_deleted === true) return false;

  const now = new Date();

  if (discount.starts_at && new Date(discount.starts_at) > now) return false;
  if (discount.ends_at && new Date(discount.ends_at) < now) return false;

  const days = parseScheduleDays(discount.schedule_days);
  if (days.length > 0) {
    const currentDay = now.getDay();
    if (!days.includes(currentDay)) return false;
  }

  if (discount.schedule_time_start || discount.schedule_time_end) {
    const currentTime = now.getHours() * 60 + now.getMinutes();

    if (discount.schedule_time_start) {
      const [h, m] = String(discount.schedule_time_start).split(':').map(Number);
      const startMinutes = (h * 60) + m;
      if (!Number.isFinite(startMinutes) || currentTime < startMinutes) return false;
    }

    if (discount.schedule_time_end) {
      const [h, m] = String(discount.schedule_time_end).split(':').map(Number);
      const endMinutes = (h * 60) + m;
      if (!Number.isFinite(endMinutes) || currentTime > endMinutes) return false;
    }
  }

  if (discount.usage_limit && Number(discount.usage_count || 0) >= Number(discount.usage_limit || 0)) {
    return false;
  }

  return true;
}

function calculateDiscount(price, discountType, discountValue, maxDiscountAmount = null) {
  if (!price || price <= 0 || !discountValue) return 0;

  let discountAmount = 0;

  switch (discountType) {
    case 'percent':
      discountAmount = price * (discountValue / 100);
      break;
    case 'fixed':
      discountAmount = discountValue;
      break;
    case 'special_price':
      discountAmount = Math.max(0, price - discountValue);
      break;
    default:
      return 0;
  }

  if (maxDiscountAmount && discountAmount > maxDiscountAmount) {
    discountAmount = maxDiscountAmount;
  }

  if (discountAmount > price) {
    discountAmount = price;
  }

  return Math.round(discountAmount * 100) / 100;
}

async function getCustomerCategoryIds(db, tenantId, customerId) {
  const normalizedCustomerId = Number(customerId || 0);
  if (!(normalizedCustomerId > 0)) return [];

  try {
    const [rows] = await db.query(
      `SELECT category_id
         FROM cust_customer_category_links
        WHERE tenant_id = ? AND customer_id = ?`,
      [tenantId, normalizedCustomerId]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => Number(row?.category_id || 0))
      .filter((id) => id > 0);
  } catch (err) {
    console.warn('cust_customer_category_links not available for discount runtime:', err?.code || err?.message || err);
    return [];
  }
}

function matchDiscountAudience(targetRows, customerId, customerCategoryIds = []) {
  const normalizedCustomerId = Number(customerId || 0);
  const categoryIdSet = customerCategoryIds instanceof Set
    ? customerCategoryIds
    : new Set((Array.isArray(customerCategoryIds) ? customerCategoryIds : []).map((id) => Number(id)).filter((id) => id > 0));

  let hasTargets = false;

  for (const row of Array.isArray(targetRows) ? targetRows : []) {
    const targetType = toText(row?.target_type).toLowerCase();
    const directCustomerId = Number(row?.customer_id || 0);
    const categoryId = Number(row?.customer_category_id || 0);
    const hasTargetRow = Boolean(targetType || directCustomerId > 0 || categoryId > 0);
    if (!hasTargetRow) continue;

    hasTargets = true;
    if (targetType === 'all') return true;
    if (directCustomerId > 0 && directCustomerId === normalizedCustomerId) return true;
    if (categoryId > 0 && categoryIdSet.has(categoryId)) return true;
  }

  return !hasTargets;
}

async function filterDiscountsByCustomerUsage(db, tenantId, customerId, discounts) {
  const normalizedCustomerId = Number(customerId || 0);
  if (!(normalizedCustomerId > 0)) return Array.isArray(discounts) ? discounts : [];

  const scopedDiscounts = (Array.isArray(discounts) ? discounts : []).filter((discount) => Number(discount?.usage_per_customer || 0) > 0);
  if (!scopedDiscounts.length) return Array.isArray(discounts) ? discounts : [];

  const discountIds = scopedDiscounts
    .map((discount) => Number(discount?.id || 0))
    .filter((id) => id > 0);

  if (!discountIds.length) return Array.isArray(discounts) ? discounts : [];

  const [usageRows] = await db.query(
    `SELECT discount_id, COUNT(*) AS usage_count
       FROM mkt_discount_usage
      WHERE tenant_id = ? AND customer_id = ? AND discount_id IN (?)
      GROUP BY discount_id`,
    [tenantId, normalizedCustomerId, discountIds]
  );

  const usageMap = new Map(
    (Array.isArray(usageRows) ? usageRows : []).map((row) => [
      Number(row?.discount_id || 0),
      Number(row?.usage_count || 0),
    ])
  );

  return (Array.isArray(discounts) ? discounts : []).filter((discount) => {
    const perCustomerLimit = Number(discount?.usage_per_customer || 0);
    if (!(perCustomerLimit > 0)) return true;
    return Number(usageMap.get(Number(discount?.id || 0)) || 0) < perCustomerLimit;
  });
}

async function getActiveDiscountsForCustomer(db, tenantId, storeId, customerId) {
  const customerCategoryIds = await getCustomerCategoryIds(db, tenantId, customerId);
  const [rows] = await db.query(
    `SELECT d.*,
            dc.target_type,
            dc.customer_id,
            dc.customer_category_id
       FROM mkt_discounts d
       LEFT JOIN mkt_discount_customers dc
         ON dc.discount_id = d.id
        AND dc.tenant_id = d.tenant_id
      WHERE d.tenant_id = ?
        AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL)
        AND d.is_active = 1`,
    [tenantId, storeId]
  );

  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const discountId = Number(row?.id || 0);
    if (!(discountId > 0)) continue;

    let entry = grouped.get(discountId);
    if (!entry) {
      entry = {
        discount: { ...row },
        targets: [],
      };
      grouped.set(discountId, entry);
    }
    entry.targets.push({
      target_type: row?.target_type,
      customer_id: row?.customer_id,
      customer_category_id: row?.customer_category_id,
    });
  }

  let discounts = [...grouped.values()]
    .map((entry) => entry?.discount)
    .filter((discount) => discount && isAutomaticSimpleDiscount(discount) && isDiscountActive(discount))
    .filter((discount) => {
      const targets = grouped.get(Number(discount?.id || 0))?.targets || [];
      return matchDiscountAudience(targets, customerId, customerCategoryIds);
    })
    .sort((a, b) => {
      const priorityDiff = Number(b?.priority || 0) - Number(a?.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

  discounts = await filterDiscountsByCustomerUsage(db, tenantId, customerId, discounts);
  return discounts;
}

async function getActiveDiscountsForProduct(db, tenantId, storeId, productId, categoryIds = [], customerDiscounts = null) {
  const eligibleDiscounts = Array.isArray(customerDiscounts)
    ? customerDiscounts
    : await getActiveDiscountsForCustomer(db, tenantId, storeId, null);

  const candidateIds = eligibleDiscounts
    .map((discount) => Number(discount?.id || 0))
    .filter((id) => id > 0);

  if (!candidateIds.length) return [];

  const [rows] = await db.query(
    `SELECT discount_id, target_type, product_id, category_id, combo_id, product_config_json
       FROM mkt_discount_products
      WHERE tenant_id = ? AND discount_id IN (?)`,
    [tenantId, candidateIds]
  );

  const productIdNum = Number(productId || 0);
  const categoryIdSet = new Set((Array.isArray(categoryIds) ? categoryIds : []).map((id) => Number(id)).filter((id) => id > 0));
  const rowsByDiscountId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const discountId = Number(row?.discount_id || 0);
    if (!(discountId > 0)) continue;
    if (!rowsByDiscountId.has(discountId)) rowsByDiscountId.set(discountId, []);
    rowsByDiscountId.get(discountId).push(row);
  }

  return eligibleDiscounts.filter((discount) => {
    const applyTo = toText(discount?.apply_to).toLowerCase();
    if (!['product', 'category'].includes(applyTo)) return false;

    const targetRows = rowsByDiscountId.get(Number(discount?.id || 0)) || [];
    if (!targetRows.length) return false;

    if (applyTo === 'product') {
      return targetRows.some((row) => Number(row?.product_id || 0) === productIdNum);
    }

    return targetRows.some((row) => categoryIdSet.has(Number(row?.category_id || 0)));
  }).map((discount) => ({
    ...discount,
    targetRows: rowsByDiscountId.get(Number(discount?.id || 0)) || [],
  }));
}

async function getOrderDiscounts(db, tenantId, storeId, customerId, orderTotal, customerDiscounts = null) {
  const eligibleDiscounts = Array.isArray(customerDiscounts)
    ? customerDiscounts
    : await getActiveDiscountsForCustomer(db, tenantId, storeId, customerId);

  return eligibleDiscounts.filter((discount) => {
    if (toText(discount?.apply_to).toLowerCase() !== 'order') return false;
    const minOrderAmount = Number(discount?.min_order_amount || 0);
    return !(minOrderAmount > 0) || Number(orderTotal || 0) >= minOrderAmount;
  });
}

async function recordDiscountUsage(db, tenantId, discountId, orderId, customerId, discountAmount, promoCodeId = null) {
  const normalizedTenantId = Number(tenantId || 0);
  const normalizedDiscountId = Number(discountId || 0);
  const normalizedOrderId = Number(orderId || 0);
  const normalizedCustomerId = Number(customerId || 0) || null;
  const normalizedPromoCodeId = Number(promoCodeId || 0) || null;
  const normalizedDiscountAmount = Number(discountAmount || 0);
  if (!(normalizedTenantId > 0) || !(normalizedDiscountId > 0) || !(normalizedOrderId > 0) || !(normalizedDiscountAmount > 0)) {
    return { recorded: false };
  }

  const [existingRows] = await db.query(
    `SELECT id
       FROM mkt_discount_usage
      WHERE tenant_id = ?
        AND discount_id = ?
        AND order_id = ?
        AND (
          (? IS NULL AND promo_code_id IS NULL)
          OR promo_code_id = ?
        )
      LIMIT 1`,
    [
      normalizedTenantId,
      normalizedDiscountId,
      normalizedOrderId,
      normalizedPromoCodeId,
      normalizedPromoCodeId,
    ]
  );
  if (Array.isArray(existingRows) && existingRows.length) {
    return {
      recorded: false,
      usageId: Number(existingRows[0]?.id || 0) || null,
    };
  }

  await db.query(
    `INSERT INTO mkt_discount_usage (tenant_id, discount_id, promo_code_id, order_id, customer_id, discount_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizedTenantId,
      normalizedDiscountId,
      normalizedPromoCodeId,
      normalizedOrderId,
      normalizedCustomerId,
      normalizedDiscountAmount,
    ]
  );

  await db.query(
    `UPDATE mkt_discounts
        SET usage_count = usage_count + 1
      WHERE id = ? AND tenant_id = ?`,
    [normalizedDiscountId, normalizedTenantId]
  );

  if (normalizedPromoCodeId) {
    await db.query(
      `UPDATE mkt_discount_promo_codes
          SET usage_count = usage_count + 1
        WHERE id = ? AND tenant_id = ?`,
      [normalizedPromoCodeId, normalizedTenantId]
    );
  }

  return { recorded: true };
}

function applyBestDiscounts(discounts, price) {
  if (!discounts || discounts.length === 0) {
    return { totalDiscount: 0, appliedDiscounts: [] };
  }

  let totalDiscount = 0;
  const appliedDiscounts = [];

  const stackable = discounts.filter((discount) => discount.is_stackable);
  const nonStackable = discounts.filter((discount) => !discount.is_stackable);

  let bestNonStackable = null;
  let bestNonStackableAmount = 0;
  for (const discount of nonStackable) {
    const amount = calculateDiscount(
      price,
      discount.discount_type,
      Number(discount.discount_value),
      discount.max_discount_amount ? Number(discount.max_discount_amount) : null
    );
    if (amount > bestNonStackableAmount) {
      bestNonStackableAmount = amount;
      bestNonStackable = discount;
    }
  }

  let stackableTotal = 0;
  const stackableApplied = [];
  for (const discount of stackable) {
    const amount = calculateDiscount(
      price - stackableTotal,
      discount.discount_type,
      Number(discount.discount_value),
      discount.max_discount_amount ? Number(discount.max_discount_amount) : null
    );
    stackableTotal += amount;
    stackableApplied.push({ ...discount, discountAmount: amount });
  }

  if (bestNonStackableAmount > stackableTotal) {
    totalDiscount = bestNonStackableAmount;
    appliedDiscounts.push({ ...bestNonStackable, discountAmount: bestNonStackableAmount });
  } else {
    totalDiscount = stackableTotal;
    appliedDiscounts.push(...stackableApplied);
  }

  if (totalDiscount > price) {
    totalDiscount = price;
  }

  return { totalDiscount, appliedDiscounts };
}

function getBestDiscount(discounts) {
  if (!discounts || discounts.length === 0) return null;
  return discounts[0];
}

module.exports = {
  isDiscountActive,
  calculateDiscount,
  getSimpleDiscountVariant,
  isAutomaticSimpleDiscount,
  isPromoSimpleDiscount,
  getCustomerCategoryIds,
  matchDiscountAudience,
  getActiveDiscountsForProduct,
  getActiveDiscountsForCustomer,
  getOrderDiscounts,
  recordDiscountUsage,
  applyBestDiscounts,
  getBestDiscount,
};
