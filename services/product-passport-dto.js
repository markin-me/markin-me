'use strict';

// Shared pure assembler, moved verbatim from the legacy full builder. This does
// not derive prices/nutrition/availability or certify a captured raw graph.
function buildPublicFullProductPassport(product, details, support, availabilityByProductId) {
  const productId = Number(product?.id || 0);
  const stock = support.stockByProductId?.[productId] || {
    product_id: productId,
    store_id: null,
    stock_qty: product?.stock_qty != null ? Number(product.stock_qty) : null,
    qty: product?.stock_qty != null ? Number(product.stock_qty) : null,
    is_unlimited: product?.stock_qty == null,
    updated_at: null,
  };
  const availability = availabilityByProductId?.get(productId) || null;
  const isAvailable = availability
    ? availability.isAvailable !== false && availability.is_available !== false
    : (product?.is_available === true || Number(product?.is_available || 0) === 1);
  return {
    product,
    units: support.unitsById || {},
    unitConversions: support.unitConversions || [],
    productUnitLinks: support.productUnitLinksByProductId?.[productId] || [],
    stock,
    availability: availability || {
      product_id: productId,
      productId,
      stock_qty: stock.stock_qty,
      qty: stock.qty,
      is_unlimited: stock.is_unlimited,
      isUnlimited: stock.is_unlimited,
      is_available: isAvailable,
      isAvailable,
      max_qty: stock.stock_qty == null ? null : Number(stock.stock_qty),
      maxQty: stock.stock_qty == null ? null : Number(stock.stock_qty),
      remaining_qty: stock.stock_qty == null ? null : Number(stock.stock_qty),
      remainingQty: stock.stock_qty == null ? null : Number(stock.stock_qty),
      requirements: [],
    },
    ingredients: support.ingredientsByProductId?.[productId] || [],
    nestedIngredients: support.nestedIngredientsByProductId || {},
    variants: Array.isArray(details.variants?.[productId]) ? details.variants[productId] : [],
    options: Array.isArray(details.optionGroupsByProduct?.[productId]) ? details.optionGroupsByProduct[productId] : [],
    optionAssignments: Array.isArray(details.assignments?.[productId]) ? details.assignments[productId] : [],
    defaultConfig: details.defaultConfigs?.[productId] || null,
    comboRefs: support.comboRefsByProductId?.[productId] || [],
    editor: {
      schema_version: 'product-editor-v1',
      categories: (Array.isArray(product?.category_ids) ? product.category_ids : [])
        .map((id) => ({ id: Number(id) }))
        .filter((item) => item.id > 0),
      discounts: support.discountsByProductId?.[productId] || [],
      relatedProductUnitLinks: support.productUnitLinksByProductId || {},
    },
    benefits: {
      discount: product?.discount || null,
      buy_x_get_y_badge: product?.buy_x_get_y_badge || null,
    },
    texts: {
      description_short: product?.description_short || null,
      description: product?.description || null,
      client_composition: product?.client_composition || null,
      tech_process: product?.tech_process || null,
      show_description_short: product?.show_description_short,
      show_description: product?.show_description,
      show_client_composition: product?.show_client_composition,
      show_tech_process: product?.show_tech_process,
    },
    visibility: {
      is_active: Number(product?.is_active || 0) === 1,
      site_visibility: Number(product?.site_visibility || 0) === 1,
      is_available: isAvailable,
    },
    nutrition: {
      nutrition_per_100g: product?.nutrition_per_100g || null,
      nutrition_per_portion: product?.nutrition_per_portion || null,
      nutrition_portion_grams: product?.nutrition_portion_grams ?? null,
      nutrition_incomplete: Boolean(product?.nutrition_incomplete),
    },
    revision: {
      updated_at: product?.updated_at || product?.updatedAt || null,
      revision: product?.updated_at || product?.updatedAt || null,
      data_version: 'full-product-passport-v1',
    },
  };
}

module.exports = buildPublicFullProductPassport;
