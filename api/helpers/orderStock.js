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

function normalizeProductFulfillmentMode(value) {
  return String(value || '').trim() === 'made_to_order' ? 'made_to_order' : 'stock';
}

async function loadProductData(db, tenantId, productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, name, unit_id, base_unit_id, base_qty, cost_price, price, fulfillment_mode
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

async function loadIngredientUnits(db, tenantId, parentProductIds, ingredientIds, context = null) {
  if (!parentProductIds.length || !ingredientIds.length) return new Map();
  if (context) {
    const byParent = await context.load('ingredientUnits', parentProductIds, async (ids) => {
      const [rows] = await db.query(
        `SELECT product_id, ingredient_id, unit_id FROM prod_product_ingredients
         WHERE tenant_id=? AND product_id IN (${ids.map(() => '?').join(',')})`,
        [tenantId, ...ids]
      );
      const grouped = new Map();
      rows.forEach(row => {
        const id = Number(row.product_id);
        if (!grouped.has(id)) grouped.set(id, []);
        grouped.get(id).push(row);
      });
      return grouped;
    });
    const wanted = new Set(ingredientIds.map(Number));
    const units = new Map();
    byParent.forEach(rows => rows.forEach(row => {
      if (wanted.has(Number(row.ingredient_id))) units.set(`${Number(row.product_id)}_${Number(row.ingredient_id)}`, Number(row.unit_id || 0));
    }));
    return units;
  }
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

// A preview may try many configurations. Reuse reads only within that preview;
// final order writes deliberately do not supply this context.
function createStockAvailabilityContext({ db, tenantId, storeId }) {
  const records = new Map();
  return {
    db, tenantId: Number(tenantId), storeId: Number(storeId),
    resolveUnitFactor: createUnitFactorResolver(db, tenantId),
    async load(name, ids, loader) {
      if (!records.has(name)) records.set(name, new Map());
      const cache = records.get(name);
      const requested = [...new Set(ids.map(Number))];
      const missing = requested.filter(id => !cache.has(id));
      if (missing.length) {
        const loaded = await loader(missing);
        missing.forEach(id => cache.set(id, loaded.has(id) ? loaded.get(id) : null));
      }
      return new Map(requested.filter(id => cache.get(id) != null).map(id => [id, cache.get(id)]));
    },
  };
}

async function resolveOrderPackaging(db, tenantId, items) {
  const groupsByProduct = new Map();

  async function resolveOptions(productId, selection, includePackaging, depth = 0) {
    if (!productId || depth > 4) return [];
    if (!groupsByProduct.has(productId)) {
      const [rows] = await db.query(
        `SELECT oi.id, oi.group_id, oi.target_product_id, oi.qty_min, oi.default_variant_group_id,
                oi.default_variant_value_index,
                CASE WHEN g.is_packaging=1 THEN oi.configuration_json ELSE COALESCE(s.configuration_json, oi.configuration_json) END AS configuration_json,
                vg.unit_id, vg.values,
                target.name AS target_name,
                g.is_packaging, COALESCE(a.is_component, g.is_component_default) AS is_component_default
         FROM prod_option_assignments a
         JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id AND g.is_active=1
         JOIN prod_option_items oi ON oi.tenant_id=g.tenant_id AND oi.group_id=g.id AND oi.is_active=1
         LEFT JOIN prod_option_item_product_settings s ON s.tenant_id=oi.tenant_id AND s.group_id=oi.group_id AND s.option_item_id=oi.id AND s.product_id=a.assign_id
         LEFT JOIN prod_products target ON target.tenant_id=oi.tenant_id AND target.id=oi.target_product_id
         LEFT JOIN prod_variant_groups vg ON vg.tenant_id=oi.tenant_id AND vg.id=oi.default_variant_group_id
         WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=? AND a.is_active=1
         ORDER BY a.created_at DESC, a.id DESC`,
        [tenantId, productId]
      );
      const packagingGroup = rows.find(row => Number(row.is_packaging) === 1);
      groupsByProduct.set(productId, new Map(rows.filter(row => Number(row.is_packaging) !== 1 ||
        row.group_id === packagingGroup?.group_id).map(row => [Number(row.id), row])));
    }
    const catalog = groupsByProduct.get(productId);
    const selected = selection.options || selection.option_items || [];
    const optionsById = new Map(selected.map((option, index) => [
      Number(option.id || option.option_item_id) || -(index + 1), option,
    ]));
    for (const id of selection.option_item_ids || []) {
      if (!optionsById.has(Number(id))) optionsById.set(Number(id), { id, qty: 1 });
    }
    const resolved = [];
    for (const [id, option] of optionsById) {
      const row = catalog.get(id);
      if (Number(row?.is_packaging) === 1) continue;
      const targetId = Number(row?.target_product_id || option.target_product_id || option.product_id || 0);
      const qty = toRequestedQty(option.qty ?? option.quantity, 1);
      resolved.push({ ...option, qty });
      if (!targetId || qty <= 0 || !row) continue;
      const fixed = typeof row.configuration_json === 'string' ? JSON.parse(row.configuration_json) : row.configuration_json;
      const nested = await resolveOptions(targetId, fixed?.option_items ? fixed : option,
        Number(row.is_component_default) !== 1, depth + 1);
      nested.forEach(entry => resolved.push({ ...entry, qty: entry.qty * qty, packaging_for_option_id: id }));
    }
    if (includePackaging) {
      for (const row of catalog.values()) {
        if (Number(row.is_packaging) !== 1) continue;
        const values = typeof row.values === 'string' ? JSON.parse(row.values) : row.values;
        const fixed = typeof row.configuration_json === 'string' ? JSON.parse(row.configuration_json) : row.configuration_json;
        const variant = values?.[row.default_variant_value_index];
        resolved.push({
          id: row.id,
          is_packaging: true,
          title: row.target_name,
          target_product_id: row.target_product_id,
          qty: Math.max(1, Number(row.qty_min || 1)),
          variant_group_id: row.default_variant_group_id,
          variant_value: typeof variant === 'object' ? variant?.value ?? variant?.label : variant,
          unit_id: row.unit_id,
          ingredients: fixed?.ingredients,
        });
      }
    }
    return resolved;
  }

  const resolvedItems = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === 'combo') {
      resolvedItems.push(item);
      for (const selection of item.selections || []) {
        const options = await resolveOptions(Number(selection.product_id), selection, true);
        if (options.length) resolvedItems.push({ qty: item.qty ?? item.quantity, options });
      }
    } else {
      const options = await resolveOptions(Number(item.product_id), item, true);
      resolvedItems.push({ ...item, options, option_item_ids: [] });
    }
  }
  return resolvedItems;
}

async function buildDeductions({ db, tenantId, items, context = null }) {
  const productIdsSet = new Set();
  const variantGroupIdsSet = new Set();
  const parentProductIdsForIngredientSet = new Set();
  const ingredientIdsSet = new Set();
  const optionItemIdsSet = new Set();
  const parentProductIdsNeedingDefaultIngredientsSet = new Set();

  const normalizedItems = await resolveOrderPackaging(db, tenantId, Array.isArray(items) ? items : []);

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

        if (selectionPid > 0) {
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
      const optionIngredients = Array.isArray(option?.ingredients_display)
        ? option.ingredients_display
        : (Array.isArray(option?.ingredients) ? option.ingredients : []);
      if (optionPid > 0) {
        parentProductIdsNeedingDefaultIngredientsSet.add(optionPid);
      }
      optionIngredients.forEach((ingredient) => {
        const ingredientId = Number(ingredient?.ingredient_id || ingredient?.product_id || 0);
        if (ingredientId > 0) {
          productIdsSet.add(ingredientId);
          ingredientIdsSet.add(ingredientId);
        }
        if (optionPid > 0) parentProductIdsForIngredientSet.add(optionPid);
      });
    }
    const optionItemIds = Array.isArray(item.option_item_ids) ? item.option_item_ids : [];
    for (const optionItemIdRaw of optionItemIds) {
      const optionItemId = Number(optionItemIdRaw || 0);
      if (optionItemId > 0) optionItemIdsSet.add(optionItemId);
    }

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    if (pid > 0) {
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
  const optionTargetProductsByItemId = await (context ? context.load('options', optionItemIds, ids => loadOptionTargetProducts(db, tenantId, ids)) : loadOptionTargetProducts(db, tenantId, optionItemIds));
  for (const targetProductId of optionTargetProductsByItemId.values()) {
    if (targetProductId > 0) productIdsSet.add(Number(targetProductId));
  }

  const productsById = new Map();
  const defaultIngredientsByParentProduct = new Map();
  const loadedDefaultIngredientsForParentIds = new Set();

  while (true) {
    const productIdsToLoad = [...productIdsSet].filter((id) => !productsById.has(Number(id)));
    if (productIdsToLoad.length) {
      const loadedProducts = await (context ? context.load('products', productIdsToLoad, ids => loadProductData(db, tenantId, ids)) : loadProductData(db, tenantId, productIdsToLoad));
      loadedProducts.forEach((row, id) => productsById.set(Number(id), row));
    }

    const parentIdsToLoad = [
      ...new Set([
        ...[...parentProductIdsNeedingDefaultIngredientsSet],
        ...[...productsById.entries()]
          .filter(([, product]) => normalizeProductFulfillmentMode(product?.fulfillment_mode) === 'made_to_order')
          .map(([id]) => Number(id)),
      ]),
    ].filter((id) => Number(id) > 0 && !loadedDefaultIngredientsForParentIds.has(Number(id)));

    if (!parentIdsToLoad.length) break;
    parentIdsToLoad.forEach((id) => loadedDefaultIngredientsForParentIds.add(Number(id)));

    const loadedIngredients = await (context ? context.load('ingredients', parentIdsToLoad, ids => loadDefaultIngredientsByParentProducts(db, tenantId, ids)) : loadDefaultIngredientsByParentProducts(db, tenantId, parentIdsToLoad));
    loadedIngredients.forEach((ingredientsList, parentProductId) => {
      const pid = Number(parentProductId || 0);
      if (pid <= 0) return;
      defaultIngredientsByParentProduct.set(pid, ingredientsList);
      parentProductIdsForIngredientSet.add(pid);
      (Array.isArray(ingredientsList) ? ingredientsList : []).forEach((ing) => {
        const ingPid = Number(ing?.ingredientId || 0);
        if (ingPid > 0) {
          productIdsSet.add(ingPid);
          ingredientIdsSet.add(ingPid);
        }
      });
    });
  }

  const variantGroupIds = [...variantGroupIdsSet];
  const parentProductIdsForIngredient = [...parentProductIdsForIngredientSet];
  const ingredientIds = [...ingredientIdsSet];

  const [variantGroupUnits, ingredientUnits] = await Promise.all([
    context ? context.load('variants', variantGroupIds, ids => loadVariantGroupUnits(db, tenantId, ids)) : loadVariantGroupUnits(db, tenantId, variantGroupIds),
    loadIngredientUnits(db, tenantId, parentProductIdsForIngredient, ingredientIds, context),
  ]);

  const resolveUnitFactor = context?.resolveUnitFactor || createUnitFactorResolver(db, tenantId);
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

  async function consumeProductIngredients(parentProductId, unitsCount, explicitIngredients = null, stack = new Set()) {
    const parentId = Number(parentProductId || 0);
    const multiplier = Number(unitsCount || 0);
    if (!(parentId > 0) || !Number.isFinite(multiplier) || multiplier <= 0 || stack.has(parentId)) return;

    const defaultRows = (defaultIngredientsByParentProduct.get(parentId) || []).map((ing) => ({
      ingredient_id: ing.ingredientId,
      quantity: ing.quantity,
      unit_id: ing.unitId || null,
    }));
    const explicitRows = Array.isArray(explicitIngredients) ? explicitIngredients : [];
    const explicitByIngredientId = new Map(
      explicitRows
        .map((row) => [Number(row?.ingredient_id || row?.product_id || 0), row])
        .filter(([ingredientId]) => ingredientId > 0)
    );
    const rows = defaultRows.map((row) => (
      explicitByIngredientId.get(Number(row.ingredient_id)) || row
    ));
    explicitRows.forEach((row) => {
      const ingredientId = Number(row?.ingredient_id || row?.product_id || 0);
      if (ingredientId > 0 && !defaultRows.some((item) => Number(item.ingredient_id) === ingredientId)) {
        rows.push(row);
      }
    });
    if (!rows.length) return;

    stack.add(parentId);
    for (const ing of rows) {
      const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
      if (!ingPid) continue;

      const ingredientProduct = productsById.get(ingPid);
      if (!ingredientProduct) continue;

      const ingQty = toPositiveNumber(ing?.quantity ?? ing?.qty ?? 0, 0);
      if (!ingQty) continue;

      let ingredientUnitId = Number(ing?.unit_id || 0);
      if (!ingredientUnitId) {
        ingredientUnitId = Number(ingredientUnits.get(`${parentId}_${ingPid}`) || 0);
      }

      const ingTotalQty = ingQty * multiplier;
      const ingQtyInBase = ingredientUnitId
        ? await getQtyInBaseForProduct(ingredientProduct, ingTotalQty, ingredientUnitId)
        : ingTotalQty;

      await consumeProduct(ingPid, ingQtyInBase, null, stack);
    }
    stack.delete(parentId);
  }

  async function consumeProduct(productId, quantityInBase, explicitIngredients = null, stack = new Set()) {
    const pid = Number(productId || 0);
    const qty = roundQty(quantityInBase);
    if (!(pid > 0) || qty <= 0) return;

    const product = productsById.get(pid);
    if (!product) return;

    if (normalizeProductFulfillmentMode(product.fulfillment_mode) !== 'made_to_order') {
      addDeduction(pid, qty);
      return;
    }

    const baseQty = toPositiveNumber(product.base_qty, 1);
    await consumeProductIngredients(pid, qty / baseQty, explicitIngredients, stack);
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

          await consumeProduct(selectionPid, consumedPerUnit * comboQty, selectionIngredients);
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

      const itemIngredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      await consumeProduct(pid, consumedPerUnit * parentItemQty, itemIngredients);
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

      const optionIngredients = Array.isArray(option?.ingredients_display)
        ? option.ingredients_display
        : (Array.isArray(option?.ingredients) ? option.ingredients : []);
      await consumeProduct(optionPid, consumedPerOption * optionUnitsCount, optionIngredients);
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
  context = null,
}) {
  if (context && (context.db !== db || context.tenantId !== Number(tenantId) || context.storeId !== Number(storeId))) {
    throw new Error('STOCK_CONTEXT_SCOPE_MISMATCH');
  }
  const { normalizedDeductions, productsById } = await buildDeductions({
    db,
    tenantId,
    items,
    context,
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
  const loadStocks = async (ids) => {
    const [rows] = await db.query(
      `SELECT product_id, qty FROM prod_product_stocks
       WHERE tenant_id=? AND store_id=? AND product_id IN (${ids.map(() => '?').join(',')})`,
      [tenantId, storeId, ...ids]
    );
    return new Map(rows.map(row => [Number(row.product_id), row]));
  };
  const stockByProductId = context
    ? await context.load('stocks', productIds, loadStocks)
    : await loadStocks(productIds);

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

function buildAvailabilityFromStockLevels(productId, stockLevels) {
  const levels = Array.isArray(stockLevels) ? stockLevels : [];
  let maxQty = null;
  let remainingQty = null;
  let hasFiniteRequirement = false;
  let hasUnfulfilled = false;

  const requirements = levels.map((level) => {
    const requiredQty = roundQty(level?.requiredQty);
    const availableQty = level?.qty == null ? null : roundQty(level.qty);
    const isUnlimited = level?.isUnlimited === true || availableQty == null;
    const canFulfill = level?.canFulfill !== false;

    if (!isUnlimited && requiredQty > 0) {
      hasFiniteRequirement = true;
      const maxForRequirement = Math.floor(Math.max(0, Number(availableQty || 0)) / requiredQty);
      maxQty = maxQty == null ? maxForRequirement : Math.min(maxQty, maxForRequirement);
      const remainingForRequirement = roundQty(Number(availableQty || 0) - requiredQty);
      remainingQty = remainingQty == null ? remainingForRequirement : Math.min(remainingQty, remainingForRequirement);
    }
    if (!canFulfill) hasUnfulfilled = true;

    return {
      product_id: Number(level?.productId || 0),
      productId: Number(level?.productId || 0),
      product_name: String(level?.productName || ''),
      productName: String(level?.productName || ''),
      required_qty: requiredQty,
      requiredQty,
      available_qty: availableQty,
      availableQty,
      remaining_qty: level?.remainingQty == null ? null : roundQty(level.remainingQty),
      remainingQty: level?.remainingQty == null ? null : roundQty(level.remainingQty),
      is_unlimited: isUnlimited,
      isUnlimited,
      can_fulfill: canFulfill,
      canFulfill,
    };
  });

  const isUnlimited = !hasFiniteRequirement;
  const safeMaxQty = hasFiniteRequirement ? Math.max(0, Number(maxQty || 0)) : null;
  const isAvailable = !hasUnfulfilled && (safeMaxQty == null || safeMaxQty > 0);

  return {
    product_id: Number(productId || 0),
    productId: Number(productId || 0),
    is_available: isAvailable,
    isAvailable,
    is_unlimited: isUnlimited,
    isUnlimited,
    max_qty: safeMaxQty,
    maxQty: safeMaxQty,
    remaining_qty: isUnlimited ? null : Math.max(0, Number(remainingQty || 0)),
    remainingQty: isUnlimited ? null : Math.max(0, Number(remainingQty || 0)),
    requirements,
  };
}

async function buildStockAvailabilityForOrderItems({
  db,
  tenantId,
  storeId,
  items,
}) {
  const check = await checkStockAvailabilityForOrderItems({
    db,
    tenantId,
    storeId,
    items,
  });
  const firstItem = Array.isArray(items) ? items[0] : null;
  return {
    ...buildAvailabilityFromStockLevels(Number(firstItem?.product_id || 0), check.stockLevels),
    stock_levels: check.stockLevels,
    shortages: check.shortages,
    available: check.available,
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

function collectOrderPackagingItems(item) {
  const grouped = new Map();
  const add = (packaging, multiplier) => {
    const qty = Number(packaging.qty ?? packaging.quantity ?? 1) * multiplier;
    if (!(qty > 0)) return;
    const key = JSON.stringify([packaging.target_product_id || packaging.product_id || packaging.id, packaging.variant_label || '']);
    const existing = grouped.get(key);
    if (existing) existing.qty += qty;
    else grouped.set(key, { qty, title: packaging.title || packaging.name || '' });
  };
  const quantity = Number(item.qty ?? item.quantity ?? 1);
  for (const option of item.options || item.option_items || []) {
    if (Number(option.is_packaging) === 1) add(option, quantity);
    else for (const packaging of option.packaging_items || []) add(packaging, quantity * Number(option.qty ?? option.quantity ?? 1));
  }
  return [...grouped.values()];
}

async function annotateOrderPackaging(db, tenantId, items) {
  const options = [];
  const visit = item => {
    options.push(...(Array.isArray(item.options) ? item.options : item.option_items || []));
    for (const selection of item.selections || []) visit(selection);
  };
  (items || []).forEach(visit);
  const ids = [...new Set(options.filter(option => option.is_packaging == null)
    .map(option => Number(option.id || option.option_item_id)).filter(id => id > 0))];
  if (!ids.length) return;
  const [rows] = await db.query(
    `SELECT i.id, g.is_packaging FROM prod_option_items i
     JOIN prod_option_groups g ON g.tenant_id=i.tenant_id AND g.id=i.group_id
     WHERE i.tenant_id=? AND i.id IN (?)`, [tenantId, ids]
  );
  const flags = new Map(rows.map(row => [Number(row.id), Number(row.is_packaging) === 1]));
  for (const option of options) {
    const id = Number(option.id || option.option_item_id);
    if (option.is_packaging == null && flags.has(id)) option.is_packaging = flags.get(id);
  }
}

module.exports = {
  annotateOrderPackaging,
  collectOrderPackagingItems,
  resolveOrderPackaging,
  createStockAvailabilityContext,
  applyStockDeductionForOrderItems,
  buildStockAvailabilityForOrderItems,
  checkStockAvailabilityForOrderItems,
};
