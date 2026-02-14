function parseVariantValueNumber(value) {
  const s = String(value ?? '').replace(',', '.');
  const match = s.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function toPositiveNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function toRequestedQty(value, defaultValue = 0) {
  if (value == null || value === '') return defaultValue;
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  return n;
}

function roundQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
}

function nowUtcSqlString() {
  return new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function toUnitPricePerBase(rawPrice, baseQty) {
  if (rawPrice == null) return null;
  const price = Number(rawPrice);
  if (!Number.isFinite(price)) return null;
  const qty = Number(baseQty);
  const divisor = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const value = price / divisor;
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000000) / 1000000;
}

async function loadProductData(db, tenantId, productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, name, unit_id, base_unit_id, base_qty, cost_price, price
     FROM prod_products
     WHERE tenant_id=? AND id IN (${placeholders})`,
    [tenantId, ...productIds]
  );
  return new Map(rows.map((row) => [Number(row.id), row]));
}

async function loadVariantGroupUnits(db, tenantId, groupIds) {
  if (!groupIds.length) return new Map();
  const placeholders = groupIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, unit_id
     FROM prod_variant_groups
     WHERE tenant_id=? AND id IN (${placeholders})`,
    [tenantId, ...groupIds]
  );
  return new Map(rows.map((row) => [Number(row.id), Number(row.unit_id || 0)]));
}

async function loadIngredientUnits(db, tenantId, parentProductIds, ingredientIds) {
  if (!parentProductIds.length || !ingredientIds.length) return new Map();
  const parentPlaceholders = parentProductIds.map(() => '?').join(',');
  const ingredientPlaceholders = ingredientIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT product_id, ingredient_id, unit_id
     FROM prod_product_ingredients
     WHERE tenant_id=?
       AND product_id IN (${parentPlaceholders})
       AND ingredient_id IN (${ingredientPlaceholders})`,
    [tenantId, ...parentProductIds, ...ingredientIds]
  );

  const map = new Map();
  rows.forEach((row) => {
    map.set(`${Number(row.product_id)}_${Number(row.ingredient_id)}`, Number(row.unit_id || 0));
  });
  return map;
}

async function loadDefaultIngredientsByParentProducts(db, tenantId, parentProductIds) {
  if (!Array.isArray(parentProductIds) || !parentProductIds.length) return new Map();
  const placeholders = parentProductIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT product_id, ingredient_id, quantity, unit_id
     FROM prod_product_ingredients
     WHERE tenant_id=?
       AND product_id IN (${placeholders})
       AND quantity IS NOT NULL
       AND quantity > 0`,
    [tenantId, ...parentProductIds]
  );

  const map = new Map();
  rows.forEach((row) => {
    const parentProductId = Number(row.product_id || 0);
    const ingredientId = Number(row.ingredient_id || 0);
    const quantity = Number(row.quantity || 0);
    const unitId = Number(row.unit_id || 0);
    if (parentProductId <= 0 || ingredientId <= 0 || !Number.isFinite(quantity) || quantity <= 0) return;
    if (!map.has(parentProductId)) map.set(parentProductId, []);
    map.get(parentProductId).push({
      ingredientId,
      quantity,
      unitId: unitId > 0 ? unitId : 0,
    });
  });
  return map;
}

async function loadOptionTargetProducts(db, tenantId, optionItemIds) {
  if (!optionItemIds.length) return new Map();
  const placeholders = optionItemIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, target_product_id
     FROM prod_option_items
     WHERE tenant_id=? AND id IN (${placeholders})`,
    [tenantId, ...optionItemIds]
  );
  return new Map(
    rows
      .map((row) => [Number(row.id), Number(row.target_product_id || 0)])
      .filter(([optionItemId, productId]) => optionItemId > 0 && productId > 0)
  );
}

function createUnitFactorResolver(db, tenantId) {
  const unitConvCache = new Map();
  const productUnitCache = new Map();

  async function getGeneralConversion(fromUnitId, toUnitId) {
    if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
    const key = `${Number(fromUnitId)}_${Number(toUnitId)}`;
    if (unitConvCache.has(key)) return unitConvCache.get(key);

    const [direct] = await db.query(
      `SELECT factor
       FROM prod_unit_conversions
       WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1
       LIMIT 1`,
      [tenantId, fromUnitId, toUnitId]
    );
    if (direct.length && direct[0].factor) {
      const factor = Number(direct[0].factor);
      unitConvCache.set(key, factor);
      return factor;
    }

    const [inverse] = await db.query(
      `SELECT factor
       FROM prod_unit_conversions
       WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1
       LIMIT 1`,
      [tenantId, toUnitId, fromUnitId]
    );
    if (inverse.length && inverse[0].factor) {
      const factor = 1 / Number(inverse[0].factor);
      unitConvCache.set(key, factor);
      return factor;
    }

    unitConvCache.set(key, null);
    return null;
  }

  async function getProductConversion(productId, fromUnitId, toUnitId) {
    if (!productId || !fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
    const key = `${Number(productId)}_${Number(fromUnitId)}_${Number(toUnitId)}`;
    if (productUnitCache.has(key)) return productUnitCache.get(key);

    const [rows] = await db.query(
      `SELECT unit_id, base_unit_id, factor
       FROM prod_product_unit_links
       WHERE tenant_id=?
         AND product_id=?
         AND (
           (unit_id=? AND base_unit_id=?)
           OR
           (unit_id=? AND base_unit_id=?)
         )
       LIMIT 1`,
      [tenantId, productId, fromUnitId, toUnitId, toUnitId, fromUnitId]
    );

    if (!rows.length || !rows[0].factor) {
      productUnitCache.set(key, null);
      return null;
    }

    const row = rows[0];
    let factor = Number(row.factor);
    if (Number(row.unit_id) === Number(toUnitId) && Number(row.base_unit_id) === Number(fromUnitId)) {
      factor = factor !== 0 ? 1 / factor : null;
    }

    factor = factor && Number.isFinite(factor) ? factor : null;
    productUnitCache.set(key, factor);
    return factor;
  }

  return async function resolveUnitFactor(fromUnitId, toUnitId, productId = null) {
    if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;

    const general = await getGeneralConversion(fromUnitId, toUnitId);
    if (general != null) return general;

    if (!productId) return null;
    return getProductConversion(productId, fromUnitId, toUnitId);
  };
}

async function buildDeductions({ db, tenantId, items }) {
  const productIdsSet = new Set();
  const variantGroupIdsSet = new Set();
  const parentProductIdsForIngredientSet = new Set();
  const ingredientIdsSet = new Set();
  const optionItemIdsSet = new Set();
  const parentProductIdsNeedingDefaultIngredientsSet = new Set();

  const normalizedItems = Array.isArray(items) ? items : [];

  for (const item of normalizedItems) {
    if (!item) continue;

    if (item.type === 'combo') {
      const selections = Array.isArray(item.selections) ? item.selections : [];
      for (const selection of selections) {
        const selectionPid = Number(selection?.product_id || 0);
        if (selectionPid > 0) {
          productIdsSet.add(selectionPid);
        }

        const selectionVariantGroupId = Number(selection?.variant_group_id || 0);
        if (selectionVariantGroupId > 0) {
          variantGroupIdsSet.add(selectionVariantGroupId);
        }

        const selectionIngredients = Array.isArray(selection?.ingredients_display)
          ? selection.ingredients_display
          : (Array.isArray(selection?.ingredients) ? selection.ingredients : []);

        if (!selectionIngredients.length && selectionPid > 0) {
          parentProductIdsNeedingDefaultIngredientsSet.add(selectionPid);
        }

        for (const ing of selectionIngredients) {
          const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
          if (ingPid > 0) {
            productIdsSet.add(ingPid);
            ingredientIdsSet.add(ingPid);
          }
          if (selectionPid > 0) parentProductIdsForIngredientSet.add(selectionPid);
        }
      }
      continue;
    }

    const pid = Number(item.product_id || 0);
    if (pid > 0) productIdsSet.add(pid);

    const itemVariants = Array.isArray(item.variants) ? item.variants : [];
    if (itemVariants.length) {
      const groupId = Number(itemVariants[0]?.variant_group_id || 0);
      if (groupId > 0) variantGroupIdsSet.add(groupId);
    }

    const options = Array.isArray(item.options)
      ? item.options
      : (Array.isArray(item.option_items) ? item.option_items : []);
    for (const option of options) {
      const optionPid = Number(option?.target_product_id || option?.product_id || 0);
      if (optionPid > 0) productIdsSet.add(optionPid);
      const optionItemId = Number(option?.id || option?.option_item_id || 0);
      if (optionItemId > 0) optionItemIdsSet.add(optionItemId);
      const groupId = Number(option?.variant_group_id || 0);
      if (groupId > 0) variantGroupIdsSet.add(groupId);
    }
    const optionItemIds = Array.isArray(item.option_item_ids) ? item.option_item_ids : [];
    for (const optionItemIdRaw of optionItemIds) {
      const optionItemId = Number(optionItemIdRaw || 0);
      if (optionItemId > 0) optionItemIdsSet.add(optionItemId);
    }

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    if (!ingredients.length && pid > 0) {
      parentProductIdsNeedingDefaultIngredientsSet.add(pid);
    }
    for (const ing of ingredients) {
      const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
      if (ingPid > 0) {
        productIdsSet.add(ingPid);
        ingredientIdsSet.add(ingPid);
      }
      if (pid > 0) parentProductIdsForIngredientSet.add(pid);
    }
  }

  const optionItemIds = [...optionItemIdsSet];
  const optionTargetProductsByItemId = await loadOptionTargetProducts(db, tenantId, optionItemIds);
  for (const targetProductId of optionTargetProductsByItemId.values()) {
    if (targetProductId > 0) productIdsSet.add(Number(targetProductId));
  }

  const defaultIngredientsByParentProduct = await loadDefaultIngredientsByParentProducts(
    db,
    tenantId,
    [...parentProductIdsNeedingDefaultIngredientsSet]
  );
  defaultIngredientsByParentProduct.forEach((ingredientsList, parentProductId) => {
    if (Number(parentProductId) > 0) parentProductIdsForIngredientSet.add(Number(parentProductId));
    (Array.isArray(ingredientsList) ? ingredientsList : []).forEach((ing) => {
      const ingPid = Number(ing?.ingredientId || 0);
      if (ingPid > 0) {
        productIdsSet.add(ingPid);
        ingredientIdsSet.add(ingPid);
      }
    });
  });

  const productIds = [...productIdsSet];
  const variantGroupIds = [...variantGroupIdsSet];
  const parentProductIdsForIngredient = [...parentProductIdsForIngredientSet];
  const ingredientIds = [...ingredientIdsSet];

  const [productsById, variantGroupUnits, ingredientUnits] = await Promise.all([
    loadProductData(db, tenantId, productIds),
    loadVariantGroupUnits(db, tenantId, variantGroupIds),
    loadIngredientUnits(db, tenantId, parentProductIdsForIngredient, ingredientIds),
  ]);

  const resolveUnitFactor = createUnitFactorResolver(db, tenantId);
  const deductions = new Map();

  function addDeduction(productId, qty) {
    const q = roundQty(qty);
    if (!Number.isFinite(productId) || productId <= 0 || q <= 0) return;
    const prev = Number(deductions.get(productId) || 0);
    deductions.set(productId, roundQty(prev + q));
  }

  async function getQtyInBaseForProduct(product, rawQty, fromUnitId) {
    const quantity = Number(rawQty || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return 0;

    const baseUnitId = Number(product?.base_unit_id || 0);
    if (!baseUnitId || !fromUnitId || Number(baseUnitId) === Number(fromUnitId)) {
      return quantity;
    }

    const factor = await resolveUnitFactor(fromUnitId, baseUnitId, Number(product?.id || 0));
    if (factor == null || !Number.isFinite(Number(factor)) || Number(factor) <= 0) {
      return quantity;
    }

    return quantity * Number(factor);
  }

  for (const item of normalizedItems) {
    if (!item) continue;

    if (item.type === 'combo') {
      const comboQtyRaw = toRequestedQty(item.qty ?? item.quantity, 1);
      const comboQty = comboQtyRaw > 0 ? comboQtyRaw : 0;
      if (!comboQty) continue;
      const selections = Array.isArray(item.selections) ? item.selections : [];

      for (const selection of selections) {
        const selectionPid = Number(selection?.product_id || 0);
        const selectionProduct = productsById.get(selectionPid);
        if (selectionProduct) {
          let consumedPerUnit = null;

          const selectionVariantValue = parseVariantValueNumber(
            selection?.variant_value ?? selection?.variant_label
          );
          if (Number.isFinite(selectionVariantValue) && selectionVariantValue > 0) {
            const selectionVariantGroupId = Number(selection?.variant_group_id || 0);
            const selectionVariantUnitId = Number(
              selection?.unit_id || variantGroupUnits.get(selectionVariantGroupId) || 0
            );
            if (selectionVariantUnitId > 0) {
              const inBase = await getQtyInBaseForProduct(
                selectionProduct,
                selectionVariantValue,
                selectionVariantUnitId
              );
              if (inBase > 0) consumedPerUnit = inBase;
            }
          }

          if (consumedPerUnit == null) {
            consumedPerUnit = toPositiveNumber(selectionProduct.base_qty, 1);
          }

          addDeduction(selectionPid, consumedPerUnit * comboQty);
        }

        let selectionIngredients = Array.isArray(selection?.ingredients_display)
          ? selection.ingredients_display
          : (Array.isArray(selection?.ingredients) ? selection.ingredients : []);
        if ((!Array.isArray(selectionIngredients) || !selectionIngredients.length) && selectionPid > 0) {
          selectionIngredients = (defaultIngredientsByParentProduct.get(selectionPid) || []).map((ing) => ({
            ingredient_id: ing.ingredientId,
            quantity: ing.quantity,
            unit_id: ing.unitId || null,
          }));
        }

        for (const ing of selectionIngredients) {
          const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
          if (!ingPid) continue;

          const ingredientProduct = productsById.get(ingPid);
          if (!ingredientProduct) continue;

          const ingQty = toPositiveNumber(ing?.quantity ?? ing?.qty ?? 0, 0);
          if (!ingQty) continue;

          let ingredientUnitId = Number(ing?.unit_id || 0);
          if (!ingredientUnitId && selectionPid > 0) {
            ingredientUnitId = Number(ingredientUnits.get(`${selectionPid}_${ingPid}`) || 0);
          }

          const ingTotalQty = ingQty * comboQty;
          const ingQtyInBase = ingredientUnitId
            ? await getQtyInBaseForProduct(ingredientProduct, ingTotalQty, ingredientUnitId)
            : ingTotalQty;

          addDeduction(ingPid, ingQtyInBase);
        }
      }
      continue;
    }

    const parentItemQtyRaw = toRequestedQty(item.qty ?? item.quantity, 1);
    const parentItemQty = parentItemQtyRaw > 0 ? parentItemQtyRaw : 0;
    if (!parentItemQty) continue;
    const pid = Number(item.product_id || 0);
    const product = productsById.get(pid);

    if (product) {
      const variant = Array.isArray(item.variants) ? item.variants[0] : null;
      let consumedPerUnit = null;

      if (variant) {
        const variantValue = parseVariantValueNumber(variant.value ?? variant.label);
        if (Number.isFinite(variantValue) && variantValue > 0) {
          const variantGroupId = Number(variant.variant_group_id || 0);
          const variantUnitId = Number(variant.unit_id || variantGroupUnits.get(variantGroupId) || 0);
          if (variantUnitId > 0) {
            const inBase = await getQtyInBaseForProduct(product, variantValue, variantUnitId);
            if (inBase > 0) consumedPerUnit = inBase;
          }
        }
      }

      if (consumedPerUnit == null) {
        const baseQty = toPositiveNumber(product.base_qty, 1);
        consumedPerUnit = baseQty;
      }

      addDeduction(pid, consumedPerUnit * parentItemQty);
    }

    const optionsRaw = Array.isArray(item.options)
      ? item.options
      : (Array.isArray(item.option_items) ? item.option_items : []);
    const optionItemIdsFallback = Array.isArray(item.option_item_ids) ? item.option_item_ids : [];
    const options = optionsRaw.length
      ? optionsRaw
      : optionItemIdsFallback.map((optionItemId) => ({ id: optionItemId, qty: 1 }));
    for (const option of options) {
      let optionPid = Number(option?.target_product_id || option?.product_id || 0);
      if (!optionPid) {
        const optionItemId = Number(option?.id || option?.option_item_id || 0);
        if (optionItemId > 0) {
          optionPid = Number(optionTargetProductsByItemId.get(optionItemId) || 0);
        }
      }
      if (!optionPid) continue;

      const optionProduct = productsById.get(optionPid);
      if (!optionProduct) continue;

      const optionQtyRaw = toRequestedQty(option?.qty ?? option?.quantity, 1);
      const optionQty = optionQtyRaw > 0 ? optionQtyRaw : 0;
      if (!optionQty) continue;
      const optionUnitsCount = optionQty * parentItemQty;
      let consumedPerOption = null;

      const optionVariantValue = parseVariantValueNumber(option?.variant_value ?? option?.variant_label);
      if (Number.isFinite(optionVariantValue) && optionVariantValue > 0) {
        const optionGroupId = Number(option?.variant_group_id || 0);
        const optionUnitId = Number(option?.unit_id || variantGroupUnits.get(optionGroupId) || 0);
        if (optionUnitId > 0) {
          const inBase = await getQtyInBaseForProduct(optionProduct, optionVariantValue, optionUnitId);
          if (inBase > 0) consumedPerOption = inBase;
        }
      }

      if (consumedPerOption == null) {
        consumedPerOption = toPositiveNumber(optionProduct.base_qty, 1);
      }

      addDeduction(optionPid, consumedPerOption * optionUnitsCount);
    }

    let ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    if ((!Array.isArray(ingredients) || !ingredients.length) && pid > 0) {
      ingredients = (defaultIngredientsByParentProduct.get(pid) || []).map((ing) => ({
        ingredient_id: ing.ingredientId,
        quantity: ing.quantity,
        unit_id: ing.unitId || null,
      }));
    }
    for (const ing of ingredients) {
      const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
      if (!ingPid) continue;

      const ingredientProduct = productsById.get(ingPid);
      if (!ingredientProduct) continue;

      const ingQty = toPositiveNumber(ing?.quantity ?? ing?.qty ?? 0, 0);
      if (!ingQty) continue;

      let ingredientUnitId = Number(ing?.unit_id || 0);
      if (!ingredientUnitId && pid > 0) {
        ingredientUnitId = Number(ingredientUnits.get(`${pid}_${ingPid}`) || 0);
      }

      const ingTotalQty = ingQty * parentItemQty;
      const ingQtyInBase = ingredientUnitId
        ? await getQtyInBaseForProduct(ingredientProduct, ingTotalQty, ingredientUnitId)
        : ingTotalQty;

      addDeduction(ingPid, ingQtyInBase);
    }
  }

  const normalizedDeductions = [...deductions.entries()]
    .map(([productId, qty]) => ({
      productId: Number(productId),
      qty: roundQty(qty),
    }))
    .filter((item) => item.productId > 0 && item.qty > 0);

  return { normalizedDeductions, productsById };
}

async function checkStockAvailabilityForOrderItems({
  db,
  tenantId,
  storeId,
  items,
}) {
  const { normalizedDeductions, productsById } = await buildDeductions({
    db,
    tenantId,
    items,
  });

  if (!normalizedDeductions.length) {
    return {
      available: true,
      shortages: [],
      deductions: [],
      stockLevels: [],
      productsById,
    };
  }

  const productIds = normalizedDeductions.map((item) => Number(item.productId)).filter((id) => id > 0);
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT product_id, qty
     FROM prod_product_stocks
     WHERE tenant_id=? AND store_id=? AND product_id IN (${placeholders})`,
    [tenantId, storeId, ...productIds]
  );
  const stockByProductId = new Map(rows.map((row) => [Number(row.product_id), row]));

  const stockLevels = normalizedDeductions.map((deduction) => {
    const productId = Number(deduction.productId);
    const requiredQty = roundQty(deduction.qty);
    const stockRow = stockByProductId.get(productId);
    const productName = String(productsById.get(productId)?.name || '');

    if (!stockRow || stockRow.qty === null) {
      return {
        productId,
        productName,
        qty: null,
        requiredQty,
        remainingQty: null,
        isUnlimited: true,
        isAvailable: true,
        canFulfill: true,
      };
    }

    const availableQty = roundQty(stockRow.qty);
    const remainingQty = roundQty(availableQty - requiredQty);
    const canFulfill = availableQty + 1e-9 >= requiredQty;

    return {
      productId,
      productName,
      qty: availableQty,
      requiredQty,
      remainingQty,
      isUnlimited: false,
      isAvailable: availableQty > 0,
      canFulfill,
    };
  });

  const shortages = [];
  for (const deduction of normalizedDeductions) {
    const productId = Number(deduction.productId);
    const requiredQty = roundQty(deduction.qty);
    const stockRow = stockByProductId.get(productId);

    if (!stockRow || stockRow.qty === null) continue;

    const availableQty = roundQty(stockRow.qty);
    if (availableQty + 1e-9 >= requiredQty) continue;

    shortages.push({
      productId,
      requiredQty,
      availableQty,
      productName: String(productsById.get(productId)?.name || ''),
    });
  }

  return {
    available: shortages.length === 0,
    shortages,
    deductions: normalizedDeductions,
    stockLevels,
    productsById,
  };
}

async function applyStockUpdates({ db, tenantId, storeId, deductions }) {
  for (const item of deductions) {
    const productId = Number(item.productId);
    const deductQty = roundQty(item.qty);
    if (!productId || !deductQty) continue;

    const [updateResult] = await db.query(
      `UPDATE prod_product_stocks
       SET qty = qty - ?
       WHERE tenant_id=? AND store_id=? AND product_id=?
         AND qty IS NOT NULL AND qty >= ?`,
      [deductQty, tenantId, storeId, productId, deductQty]
    );

    if (Number(updateResult?.affectedRows || 0) > 0) continue;

    const [rows] = await db.query(
      `SELECT qty
       FROM prod_product_stocks
       WHERE tenant_id=? AND store_id=? AND product_id=?
       LIMIT 1`,
      [tenantId, storeId, productId]
    );

    if (!rows.length || rows[0].qty === null) {
      continue;
    }

    const error = new Error('OUT_OF_STOCK');
    error.code = 'OUT_OF_STOCK';
    error.productId = productId;
    throw error;
  }
}

async function createStockOutDocument({
  db,
  tenantId,
  storeId,
  orderId,
  publicId,
  createdBy,
  deductions,
  productsById,
}) {
  if (!deductions.length) return null;

  const number = orderId ? `ORD-${orderId}` : null;
  const comment = orderId
    ? `Автосписание по заказу #${orderId}${publicId ? ` (${publicId})` : ''}`
    : `Автосписание по заказу${publicId ? ` (${publicId})` : ''}`;

  const [docResult] = await db.query(
    `INSERT INTO prod_stock_documents
        (tenant_id, store_id, type, status, number, comment, posted_at, created_by)
      VALUES (?, ?, 'order', 'posted', ?, ?, NOW(), ?)`,
    [tenantId, storeId, number, comment, createdBy || null]
  );

  const documentId = Number(docResult?.insertId || 0) || null;
  if (!documentId) return null;

  const rows = [];
  for (const item of deductions) {
    const product = productsById.get(Number(item.productId)) || null;
    const unitCostPrice = toUnitPricePerBase(product?.cost_price, product?.base_qty);
    const unitSalePrice = toUnitPricePerBase(product?.price, product?.base_qty);
    rows.push([
      tenantId,
      documentId,
      Number(item.productId),
      roundQty(item.qty),
      product?.base_unit_id != null ? Number(product.base_unit_id) : null,
      unitCostPrice,
      unitSalePrice,
    ]);
  }

  if (rows.length) {
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?)').join(',');
    await db.query(
      `INSERT INTO prod_stock_document_items
         (tenant_id, document_id, product_id, qty, unit_id, cost_price, price)
       VALUES ${placeholders}`,
      rows.flat()
    );
  }

  return documentId;
}

async function applyStockDeductionForOrderItems({
  db,
  tenantId,
  storeId,
  items,
  orderId = null,
  publicId = null,
  createdBy = null,
}) {
  const { normalizedDeductions, productsById } = await buildDeductions({
    db,
    tenantId,
    items,
  });

  if (!normalizedDeductions.length) {
    return {
      stockDocumentId: null,
      stockDeductedAt: null,
      deductions: [],
    };
  }

  await applyStockUpdates({
    db,
    tenantId,
    storeId,
    deductions: normalizedDeductions,
  });

  const stockDocumentId = await createStockOutDocument({
    db,
    tenantId,
    storeId,
    orderId,
    publicId,
    createdBy,
    deductions: normalizedDeductions,
    productsById,
  });

  return {
    stockDocumentId,
    stockDeductedAt: nowUtcSqlString(),
    deductions: normalizedDeductions,
  };
}

module.exports = {
  applyStockDeductionForOrderItems,
  checkStockAvailabilityForOrderItems,
};
