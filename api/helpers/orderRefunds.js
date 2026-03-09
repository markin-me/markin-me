function roundMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function clampNonNegative(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function parseRefundQty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (!Number.isInteger(numeric)) return NaN;
  return numeric;
}

function toCents(value) {
  return Math.round(roundMoney(value) * 100);
}

function clonePlainObject(value) {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

function parseDiscountsJson(value) {
  if (Array.isArray(value)) return value;
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getItemQty(item) {
  return Math.max(0, Number(item?.qty ?? item?.quantity ?? 0));
}

function getItemLineTotal(item) {
  return roundMoney(
    Number(
      item?.line_total
      ?? item?.total
      ?? item?.total_price
      ?? item?.lineAmount
      ?? 0
    )
  );
}

function getItemOriginalLineTotal(item) {
  const lineTotal = getItemLineTotal(item);
  const qty = getItemQty(item);
  const oldLineTotal = roundMoney(
    item?.old_line_total
    ?? item?.discount?.original_line_total
    ?? 0
  );
  const oldPrice = Number(item?.old_price || 0);
  const oldPriceLineTotal = oldPrice > 0 && qty > 0
    ? roundMoney(oldPrice * qty)
    : 0;
  return Math.max(lineTotal, oldLineTotal, oldPriceLineTotal);
}

function getItemTitle(item) {
  return String(
    item?.name
    || item?.product_name
    || item?.combo_title
    || item?.title
    || "Позиция"
  ).trim() || "Позиция";
}

function getRefundStateTitle(state) {
  const normalized = String(state || "").trim().toLowerCase();
  if (normalized === "full") return "Возвращено";
  if (normalized === "partial") return "Частичный возврат";
  return "";
}

function normalizeRefundRecords(refunds) {
  return (Array.isArray(refunds) ? refunds : []).map((refund) => {
    const items = (Array.isArray(refund?.items) ? refund.items : []).map((item) => ({
      id: Number(item?.id || 0) || null,
      source_item_index: Number(item?.source_item_index || 0),
      refunded_qty: clampNonNegative(item?.refunded_qty),
      unit_price: roundMoney(item?.unit_price || 0),
      line_amount: roundMoney(item?.line_amount || 0),
      item_snapshot: item?.item_snapshot && typeof item.item_snapshot === "object"
        ? item.item_snapshot
        : {},
    }));
    const itemsTotal = roundMoney(
      refund?.items_total != null
        ? refund.items_total
        : items.reduce((sum, item) => sum + Number(item?.line_amount || 0), 0)
    );
    const deliveryAmount = roundMoney(refund?.delivery_amount || 0);
    const totalAmount = roundMoney(
      refund?.total_amount != null
        ? refund.total_amount
        : itemsTotal + deliveryAmount
    );
    return {
      id: Number(refund?.id || 0) || null,
      order_id: Number(refund?.order_id || 0) || null,
      payment_id: Number(refund?.payment_id || 0) || null,
      payment_code: String(refund?.payment_code || "").trim() || null,
      payment_title: String(refund?.payment_title || "").trim() || null,
      payment_icon: String(refund?.payment_icon || "").trim() || null,
      comment: String(refund?.comment || "").trim() || null,
      created_at: refund?.created_at || null,
      created_by_user_id: Number(refund?.created_by_user_id || 0) || null,
      created_by_name: String(refund?.created_by_name || "").trim() || null,
      created_by_email: String(refund?.created_by_email || "").trim() || null,
      is_full: Number(refund?.is_full || 0) === 1 ? 1 : 0,
      items_total: itemsTotal,
      delivery_amount: deliveryAmount,
      total_amount: totalAmount,
      items,
    };
  });
}

function allocateProportionalAmounts(totalAmount, weights) {
  const normalizedWeights = (Array.isArray(weights) ? weights : []).map((value) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  });
  const allocations = normalizedWeights.map(() => 0);
  const totalCents = Math.max(0, toCents(totalAmount));
  const totalWeight = normalizedWeights.reduce((sum, value) => sum + value, 0);
  if (!(totalCents > 0) || !(totalWeight > 0) || !normalizedWeights.length) {
    return allocations;
  }

  const shares = normalizedWeights.map((weight, index) => {
    const raw = (totalCents * weight) / totalWeight;
    const floor = Math.floor(raw);
    return {
      index,
      floor,
      fraction: raw - floor,
      weight,
    };
  });

  let distributed = shares.reduce((sum, item) => sum + item.floor, 0);
  shares
    .slice()
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      if (right.weight !== left.weight) return right.weight - left.weight;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (distributed >= totalCents) return;
      item.floor += 1;
      distributed += 1;
    });

  shares.forEach((item) => {
    allocations[item.index] = roundMoney(item.floor / 100);
  });
  return allocations;
}

function buildRemainingOrderItem(item, opts) {
  const next = clonePlainObject(item);
  const remainingQty = clampNonNegative(opts?.remainingQty);
  const remainingLineTotal = roundMoney(opts?.remainingLineTotal || 0);
  const remainingOldLineTotal = roundMoney(opts?.remainingOldLineTotal || 0);
  const unitPrice = remainingQty > 0 ? roundMoney(remainingLineTotal / remainingQty) : 0;
  const oldUnitPrice = remainingQty > 0 ? roundMoney(remainingOldLineTotal / remainingQty) : 0;

  next.qty = remainingQty;
  next.quantity = remainingQty;
  next.line_total = remainingLineTotal;
  next.total = remainingLineTotal;
  next.total_price = remainingLineTotal;
  next.sum = remainingLineTotal;
  next.price = unitPrice;

  if (remainingOldLineTotal > remainingLineTotal) {
    next.old_line_total = remainingOldLineTotal;
    next.old_price = oldUnitPrice > 0 ? oldUnitPrice : roundMoney(Number(next.old_price || 0));
    const existingDiscount = next.discount && typeof next.discount === "object"
      ? { ...next.discount }
      : {};
    next.discount = {
      ...existingDiscount,
      original_line_total: remainingOldLineTotal,
    };
  } else {
    next.old_line_total = 0;
    if (Object.prototype.hasOwnProperty.call(next, "old_price")) delete next.old_price;
    if (next.discount && typeof next.discount === "object") {
      const existingDiscount = { ...next.discount };
      delete existingDiscount.original_line_total;
      if (Object.keys(existingDiscount).length) next.discount = existingDiscount;
      else delete next.discount;
    }
  }

  return next;
}

function buildOrderRefundState(order, refunds) {
  const normalizedRefunds = normalizeRefundRecords(refunds);
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const orderTotal = roundMoney(order?.total_price || 0);
  const deliveryCost = roundMoney(order?.delivery_cost || 0);
  const refundedByItemIndex = new Map();

  normalizedRefunds.forEach((refund) => {
    refund.items.forEach((item) => {
      const key = Number(item?.source_item_index || 0);
      const prev = refundedByItemIndex.get(key) || { qty: 0, amount: 0 };
      refundedByItemIndex.set(key, {
        qty: clampNonNegative(prev.qty + Number(item?.refunded_qty || 0)),
        amount: roundMoney(prev.amount + Number(item?.line_amount || 0)),
      });
    });
  });

  const originalItemsTotal = roundMoney(
    orderItems.reduce((sum, item) => sum + getItemLineTotal(item), 0)
  );
  const originalItemsPayableTotal = roundMoney(Math.max(0, orderTotal - deliveryCost));
  const originalOrderLevelDiscount = roundMoney(
    Math.max(0, originalItemsTotal - originalItemsPayableTotal)
  );
  const orderLevelDiscountAllocations = allocateProportionalAmounts(
    originalOrderLevelDiscount,
    orderItems.map((item) => getItemLineTotal(item))
  );

  const refundableItems = [];
  const remainingItems = [];

  orderItems.forEach((item, index) => {
    const originalQty = clampNonNegative(getItemQty(item));
    const originalLineTotalBeforeOrderDiscount = roundMoney(getItemLineTotal(item));
    const originalOldLineTotal = roundMoney(getItemOriginalLineTotal(item));
    const orderLevelDiscountAmount = roundMoney(orderLevelDiscountAllocations[index] || 0);
    const originalPayableLineTotal = Math.max(
      0,
      roundMoney(originalLineTotalBeforeOrderDiscount - orderLevelDiscountAmount)
    );
    const refundedState = refundedByItemIndex.get(index) || { qty: 0, amount: 0 };
    const refundedQty = Math.min(originalQty, clampNonNegative(refundedState.qty));
    const refundedLineTotal = Math.min(
      originalPayableLineTotal,
      roundMoney(refundedState.amount || 0)
    );
    const remainingQty = Math.max(0, roundMoney(originalQty - refundedQty));
    const remainingLineTotal = Math.max(
      0,
      roundMoney(originalPayableLineTotal - refundedLineTotal)
    );
    const remainingOldLineTotal = originalQty > 0
      ? roundMoney((originalOldLineTotal * remainingQty) / originalQty)
      : 0;
    const unitPrice = originalQty > 0
      ? roundMoney(originalPayableLineTotal / originalQty)
      : 0;

    refundableItems.push({
      source_item_index: index,
      title: getItemTitle(item),
      original_qty: originalQty,
      refunded_qty: refundedQty,
      remaining_qty: remainingQty,
      original_line_total: originalPayableLineTotal,
      refunded_line_total: refundedLineTotal,
      remaining_line_total: remainingLineTotal,
      unit_price: unitPrice,
      item_snapshot: item,
    });

    if (remainingQty > 0) {
      remainingItems.push(
        buildRemainingOrderItem(item, {
          remainingQty,
          remainingLineTotal,
          remainingOldLineTotal,
        })
      );
    }
  });

  const refundedItemsTotal = roundMoney(
    normalizedRefunds.reduce((sum, refund) => sum + Number(refund?.items_total || 0), 0)
  );
  const refundedDeliveryTotal = roundMoney(
    normalizedRefunds.reduce((sum, refund) => sum + Number(refund?.delivery_amount || 0), 0)
  );
  const refundedTotal = roundMoney(
    normalizedRefunds.reduce((sum, refund) => sum + Number(refund?.total_amount || 0), 0)
  );
  const refundableTotal = Math.max(0, roundMoney(orderTotal - refundedTotal));
  const deliveryRefundableTotal = Math.max(0, roundMoney(deliveryCost - refundedDeliveryTotal));
  const netPaidTotal = Number(order?.is_paid || 0) === 1
    ? Math.max(0, roundMoney(orderTotal - refundedTotal))
    : 0;
  const refundState = refundedTotal <= 0
    ? "none"
    : refundableTotal <= 0
      ? "full"
      : "partial";
  const remainingItemsTotal = roundMoney(
    remainingItems.reduce((sum, item) => sum + getItemLineTotal(item), 0)
  );
  const remainingOldItemsTotal = roundMoney(
    remainingItems.reduce((sum, item) => sum + getItemOriginalLineTotal(item), 0)
  );
  const remainingDiscountAmount = roundMoney(
    Math.max(0, remainingOldItemsTotal - remainingItemsTotal)
  );
  const remainingDeliveryCost = Math.max(
    0,
    roundMoney(deliveryCost - refundedDeliveryTotal)
  );
  const remainingTotalPrice = roundMoney(remainingItemsTotal + remainingDeliveryCost);

  return {
    refunds: normalizedRefunds,
    refunds_count: normalizedRefunds.length,
    refunded_items_total: refundedItemsTotal,
    refunded_delivery_total: refundedDeliveryTotal,
    refunded_total: refundedTotal,
    refundable_total: refundableTotal,
    delivery_refundable_total: deliveryRefundableTotal,
    net_paid_total: netPaidTotal,
    refund_state: refundState,
    refund_state_title: getRefundStateTitle(refundState),
    refundable_items: refundableItems,
    remaining_order: {
      items: remainingItems,
      items_total: remainingItemsTotal,
      delivery_cost: remainingDeliveryCost,
      total_price: remainingTotalPrice,
      discount_amount: remainingDiscountAmount,
      discounts_json: parseDiscountsJson(order?.discounts_json),
    },
  };
}

function buildRefundPlan(order, refunds, requestedItems) {
  const refundState = buildOrderRefundState(order, refunds);
  if (Number(order?.is_paid || 0) !== 1) {
    return { ok: false, error: "ORDER_NOT_PAID", refundState };
  }
  if (!(Number(refundState.refundable_total || 0) > 0)) {
    return { ok: false, error: "NOT_REFUNDABLE", refundState };
  }

  const refundableByIndex = new Map();
  refundState.refundable_items.forEach((item) => {
    refundableByIndex.set(Number(item.source_item_index), item);
  });

  const selectedByIndex = new Map();
  for (const rawItem of (Array.isArray(requestedItems) ? requestedItems : [])) {
    const sourceItemIndex = Number(rawItem?.source_item_index);
    const qty = parseRefundQty(rawItem?.qty ?? rawItem?.quantity ?? rawItem?.refunded_qty);
    if (!Number.isInteger(sourceItemIndex) || sourceItemIndex < 0) {
      return { ok: false, error: "BAD_REFUND_ITEMS", refundState };
    }
    if (Number.isNaN(qty)) {
      return { ok: false, error: "BAD_REFUND_ITEMS", refundState };
    }
    if (!(qty > 0)) continue;
    selectedByIndex.set(sourceItemIndex, Number(selectedByIndex.get(sourceItemIndex) || 0) + qty);
  }

  if (!selectedByIndex.size) {
    return { ok: false, error: "BAD_REFUND_ITEMS", refundState };
  }

  const plannedItems = [];
  let selectedAllRemaining = true;

  for (const refundableItem of refundState.refundable_items) {
    if (!(Number(refundableItem?.remaining_qty || 0) > 0)) continue;
    const requestedQty = clampNonNegative(selectedByIndex.get(Number(refundableItem.source_item_index)) || 0);
    if (requestedQty !== Number(refundableItem.remaining_qty || 0)) {
      selectedAllRemaining = false;
    }
  }

  for (const [sourceItemIndex, qty] of selectedByIndex.entries()) {
    const source = refundableByIndex.get(Number(sourceItemIndex));
    if (!source || !(Number(source.remaining_qty || 0) > 0)) {
      return { ok: false, error: "BAD_REFUND_ITEMS", refundState };
    }
    if (qty > Number(source.remaining_qty || 0)) {
      return { ok: false, error: "OVER_REFUND", refundState };
    }

    let lineAmount = 0;
    if (qty >= Number(source.remaining_qty || 0)) {
      lineAmount = roundMoney(source.remaining_line_total || 0);
    } else if (Number(source.original_qty || 0) > 0) {
      lineAmount = roundMoney(
        (Number(source.original_line_total || 0) * qty) / Number(source.original_qty || 0)
      );
      if (lineAmount > Number(source.remaining_line_total || 0)) {
        lineAmount = roundMoney(source.remaining_line_total || 0);
      }
    }

    plannedItems.push({
      source_item_index: Number(sourceItemIndex),
      refunded_qty: qty,
      unit_price: qty > 0 ? roundMoney(lineAmount / qty) : 0,
      line_amount: roundMoney(lineAmount),
      item_snapshot: source.item_snapshot && typeof source.item_snapshot === "object"
        ? source.item_snapshot
        : {},
    });
  }

  if (!plannedItems.length) {
    return { ok: false, error: "BAD_REFUND_ITEMS", refundState };
  }

  const itemsTotal = roundMoney(
    plannedItems.reduce((sum, item) => sum + Number(item?.line_amount || 0), 0)
  );
  const deliveryAmount = selectedAllRemaining
    ? roundMoney(refundState.delivery_refundable_total || 0)
    : 0;
  const totalAmount = roundMoney(itemsTotal + deliveryAmount);

  if (!(totalAmount > 0)) {
    return { ok: false, error: "NOT_REFUNDABLE", refundState };
  }
  if (totalAmount > Number(refundState.refundable_total || 0) + 0.001) {
    return { ok: false, error: "OVER_REFUND", refundState };
  }

  return {
    ok: true,
    refundState,
    items: plannedItems,
    items_total: itemsTotal,
    delivery_amount: deliveryAmount,
    total_amount: totalAmount,
    is_full: roundMoney(Number(refundState.refundable_total || 0) - totalAmount) <= 0 ? 1 : 0,
  };
}

module.exports = {
  roundMoney,
  getRefundStateTitle,
  buildOrderRefundState,
  buildRefundPlan,
};
