import type { CatalogComboBlockProduct, CatalogComboDetails, UnitConversion } from '../../entities/product';
import { getCatalogSnapshotProduct, resolveAssetUrl } from '../../shared/api';
import { calculateVariantUnitPrice } from '../../shared/lib/productStock';

type AnyRecord = Record<string, unknown>;

export type ComboConfiguredProduct = {
  product_id: number;
  product_name: string;
  product_photo?: string;
  lines: string[];
  ingredient_quantities?: Record<string, number>;
  unit_price_before_discount: number;
  unit_price_override: number;
  variant_group_id?: number | null;
  variant_value_index?: number | null;
  variant_label?: string;
  variant_group_title?: string;
  variant_stock_quantity?: number | null;
  variant_unit?: string;
  unit_id?: number | null;
};

export type ComboDraft = {
  quantity: number;
  selectedByBlock: Record<string, number>;
  configuredByBlock: Record<string, ComboConfiguredProduct>;
};

const comboDrafts = new Map<number, ComboDraft>();

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? (value as AnyRecord) : {};
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function trimText(value: unknown) {
  return String(value || '').trim();
}

function roundPrice(value: number) {
  return Math.round(toFiniteNumber(value) * 100) / 100;
}

function getIngredientTitle(item: unknown) {
  const source = asRecord(item);
  return trimText(source.ingredient_name || source.name || source.title);
}

function getIngredientUnit(item: unknown) {
  const source = asRecord(item);
  return trimText(source.unit_short_title || source.unit_label || source.unit_title || source.unit);
}

function getIngredientDefaultQuantity(item: unknown) {
  return toFiniteNumber(asRecord(item).quantity ?? asRecord(item).qty, 0);
}

function getIngredientLimits(item: unknown) {
  const source = asRecord(item);
  const defaultQty = getIngredientDefaultQuantity(source);
  const isVariable = source.is_variable == null ? true : Number(source.is_variable) === 1;
  const rawMin = source.quantity_min != null ? Number(source.quantity_min) : null;
  const min = rawMin != null && Number.isFinite(rawMin) ? rawMin : (isVariable ? 0 : defaultQty);
  const rawMax = source.quantity_max != null ? Number(source.quantity_max) : null;
  const max = rawMax != null && Number.isFinite(rawMax) ? rawMax : defaultQty;
  const rawStep = Number(source.quantity_step ?? 1);
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
  return { defaultQty, isVariable, max, min, step };
}

export function normalizeComboIngredientQuantity(value: number, item: unknown) {
  const { max, min, step } = getIngredientLimits(item);
  let next = Math.max(min, Math.min(max, value));
  const stepsFromMin = Math.round((next - min) / step);
  next = min + stepsFromMin * step;
  return Math.round(Math.max(min, Math.min(max, next)) * 1000) / 1000;
}

export function getComboIngredientEditorMeta(item: unknown) {
  const source = asRecord(item);
  return {
    id: toPositiveId(source.ingredient_id),
    limits: getIngredientLimits(source),
    title: getIngredientTitle(source),
    unit: getIngredientUnit(source),
  };
}

export function formatComboVariantValue(value: unknown, unit: unknown) {
  const raw = trimText(value);
  const unitLabel = trimText(unit);
  if (!raw) return '';
  if (!unitLabel || /[a-zа-я]/i.test(raw)) return raw;
  return `${raw} ${unitLabel}`;
}

export function getComboProductEditorState(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  const preview = product?.preview || null;
  const variants = Array.isArray(preview?.variants) ? preview.variants : [];
  const ingredients = Array.isArray(preview?.ingredients) ? preview.ingredients : [];
  const variantGroup = asRecord(variants[0]);
  const values = Array.isArray(variantGroup.values) ? variantGroup.values : [];
  const rawVariantIndex = config?.variant_value_index ?? preview?.variant_value_index ?? variantGroup.default_value_index ?? 0;
  const variantIndex = values.length ? Math.max(0, Math.min(values.length - 1, toFiniteNumber(rawVariantIndex, 0))) : null;
  const ingredientQuantities = ingredients.reduce<Record<string, number>>((result, item) => {
    const id = toPositiveId(asRecord(item).ingredient_id);
    if (!id) return result;
    result[String(id)] = config?.ingredient_quantities?.[String(id)] ?? getIngredientDefaultQuantity(item);
    return result;
  }, {});

  return { ingredientQuantities, ingredients, variantIndex, variants };
}

function getVariantUnitPrice(product: CatalogComboBlockProduct | null, variants: unknown[], variantIndex: number | null, unitConversions: UnitConversion[]) {
  const basePrice = toFiniteNumber(product?.price, 0);
  if (!product || !variants.length || variantIndex == null) return basePrice;

  const group = asRecord(variants[0]);
  const values = Array.isArray(group.values) ? group.values : [];
  return calculateVariantUnitPrice({
    basePrice,
    baseQty: product.base_qty,
    baseUnitId: product.base_unit_id ?? product.unit_id ?? group.unit_id,
    discountTiers: group.discount_tiers,
    selectedIndex: variantIndex,
    unitConversions,
    variantUnitId: group.unit_id,
    variantValue: values[variantIndex],
  }).unitPrice;
}

function getIngredientPriceDiff(ingredients: unknown[], ingredientQuantities: Record<string, number>) {
  return ingredients.reduce<number>((sum, item) => {
    const source = asRecord(item);
    const id = toPositiveId(source.ingredient_id);
    if (!id) return sum;

    const baseQty = getIngredientDefaultQuantity(source);
    const currentQty = ingredientQuantities[String(id)] ?? baseQty;
    const ingredientBaseQty = toFiniteNumber(source.ingredient_base_qty, 1) || 1;
    const ingredientPrice = toFiniteNumber(source.price_override ?? source.ingredient_price, 0);
    const pricePerUnit = ingredientPrice / ingredientBaseQty;
    return sum + (currentQty - baseQty) * pricePerUnit;
  }, 0);
}

function getProductTitleWithVariant(product: CatalogComboBlockProduct, variantLabel: string) {
  const title = trimText(product.product_name);
  const label = trimText(variantLabel);
  if (!label) return title;
  if (title.toLowerCase().startsWith(label.toLowerCase())) return title;
  return `${label} ${title}`.trim();
}

export function buildComboConfiguredProduct(
  product: CatalogComboBlockProduct,
  comboDiscountPercent: number,
  variantIndex: number | null,
  ingredientQuantities: Record<string, number>,
  unitConversions: UnitConversion[] = [],
): ComboConfiguredProduct {
  const preview = product.preview || null;
  const variants = Array.isArray(preview?.variants) ? preview.variants : [];
  const ingredients = Array.isArray(preview?.ingredients) ? preview.ingredients : [];
  const variantGroup = asRecord(variants[0]);
  const values = Array.isArray(variantGroup.values) ? variantGroup.values : [];
  const safeVariantIndex = variantIndex != null && values.length
    ? Math.max(0, Math.min(values.length - 1, variantIndex))
    : null;
  const variantLabel = safeVariantIndex == null
    ? ''
    : formatComboVariantValue(values[safeVariantIndex], variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title);
  const variantCalculation = safeVariantIndex == null
    ? null
    : calculateVariantUnitPrice({
      basePrice: product.price,
      baseQty: product.base_qty,
      baseUnitId: product.base_unit_id ?? product.unit_id ?? variantGroup.unit_id,
      discountTiers: variantGroup.discount_tiers,
      selectedIndex: safeVariantIndex,
      unitConversions,
      variantUnitId: variantGroup.unit_id,
      variantValue: values[safeVariantIndex],
    });
  const beforeDiscount = Math.max(0, roundPrice(
    getVariantUnitPrice(product, variants, safeVariantIndex, unitConversions) +
      getIngredientPriceDiff(ingredients, ingredientQuantities),
  ));
  const discount = Math.max(0, Number(comboDiscountPercent || 0));
  const afterDiscount = roundPrice(discount >= 100 ? 0 : beforeDiscount * (1 - discount / 100));

  return {
    ingredient_quantities: { ...ingredientQuantities },
    lines: buildComboConfiguredLines(ingredients, Object.fromEntries(
      Object.entries(ingredientQuantities).map(([id, quantity]) => [id, { quantity }]),
    ), product),
    product_id: Number(product.product_id),
    product_name: getProductTitleWithVariant(product, variantLabel),
    product_photo: product.product_photo || '',
    unit_id: variantGroup.unit_id != null ? Number(variantGroup.unit_id) : null,
    unit_price_before_discount: beforeDiscount,
    unit_price_override: afterDiscount,
    variant_group_id: variantGroup.id != null ? Number(variantGroup.id) : null,
    variant_group_title: trimText(variantGroup.title || variantGroup.title_label),
    variant_label: variantLabel,
    variant_stock_quantity: variantCalculation?.quantityInBase ?? null,
    variant_unit: trimText(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title),
    variant_value_index: safeVariantIndex,
  };
}

export function getComboProductImage(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  const productId = Number(config?.product_id || product?.product_id || 0);
  const catalogProduct = Number.isFinite(productId) && productId > 0
    ? getCatalogSnapshotProduct(productId)
    : null;
  if (catalogProduct?.photos?.[0]) return resolveAssetUrl(catalogProduct.photos[0]);
  const photosRaw = product?.product_photos_json;
  const photos = Array.isArray(photosRaw)
    ? photosRaw
    : typeof photosRaw === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(photosRaw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];
  return resolveAssetUrl(photos[0] || config?.product_photo || product?.product_photo || '');
}

export function getComboProductTitle(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  if (config?.product_name) return config.product_name;
  if (!product) return 'Товар';
  const preview = product.preview || null;
  const variantLabel = formatComboVariantValue(preview?.variant_label, preview?.variant_unit);
  return getProductTitleWithVariant(product, variantLabel) || 'Товар';
}

export function getComboProductLines(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  if (Array.isArray(config?.lines) && config.lines.length) return config.lines;
  const ingredients = Array.isArray(product?.preview?.ingredients_display)
    ? product.preview.ingredients_display
    : [];
  const lines = ingredients
    .map((item) => {
      const quantity = toFiniteNumber(item.quantity ?? item.qty, 0);
      if (!(quantity > 0)) return '';
      const qtyText = quantity > 0 ? String(quantity).replace('.', ',') : '';
      const unit = trimText(item.unit);
      const name = trimText(item.name);
      return [qtyText ? `${qtyText}${unit ? ` ${unit}` : ''}` : '', name].filter(Boolean).join(' ');
    })
    .filter(Boolean);

  if (lines.length) return lines;
  return trimText(product?.product_description_short)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getComboProductPrice(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  if (config) return toFiniteNumber(config.unit_price_override, 0);
  const price = Number(product?.preview?.unit_price_override ?? product?.price ?? 0);
  return Number.isFinite(price) ? price : 0;
}

export function getComboProductOldPrice(product: CatalogComboBlockProduct | null, config?: ComboConfiguredProduct | null) {
  const oldPrice = Number(config?.unit_price_before_discount ?? product?.preview?.unit_price_before_discount ?? 0);
  const price = getComboProductPrice(product, config);
  return Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : 0;
}

function randomShuffle<T>(list: T[]) {
  const result = list.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    const item = result[index];
    result[index] = result[nextIndex];
    result[nextIndex] = item;
  }
  return result;
}

function getComboBlockUniqKey(block: CatalogComboDetails['blocks'][number]) {
  const products = Array.isArray(block.products) ? block.products : [];
  return products
    .map((product) => Number(product.product_id || 0))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((left, right) => left - right)
    .join(',');
}

function canUseComboProduct(product: CatalogComboBlockProduct | null) {
  if (!product) return false;
  if (product.preview?.is_available === false) return false;
  if ((product as AnyRecord).is_available === false) return false;
  return true;
}

function getDefaultComboSelection(combo: CatalogComboDetails): Record<string, number> {
  return combo.blocks.reduce<Record<string, number>>((result, block, blockIndex) => {
    const products = Array.isArray(block.products) ? block.products : [];
    const defaultIndex = products.findIndex((product) => product.is_default === true || product.is_default === 1);
    result[String(blockIndex)] = defaultIndex >= 0 ? defaultIndex : 0;
    return result;
  }, {});
}

function getRandomComboSelection(combo: CatalogComboDetails): Record<string, number> {
  const selectedByBlock = getDefaultComboSelection(combo);
  const blockOrder = randomShuffle(combo.blocks.map((_block, blockIndex) => blockIndex));
  const usedByGroup = new Map<string, Set<number>>();

  blockOrder.forEach((blockIndex) => {
    const block = combo.blocks[blockIndex];
    const products = Array.isArray(block?.products) ? block.products : [];
    if (!products.length) return;

    const groupKey = getComboBlockUniqKey(block);
    const usedSet = usedByGroup.get(groupKey) || new Set<number>();
    if (!usedByGroup.has(groupKey)) usedByGroup.set(groupKey, usedSet);

    const allIndices = randomShuffle(products.map((_product, index) => index));
    const preferred = allIndices.filter((index) => {
      const productId = Number(products[index]?.product_id || 0);
      return Number.isFinite(productId) && productId > 0 && !usedSet.has(productId);
    });
    const preferredSet = new Set(preferred);
    const attempts = preferred.concat(allIndices.filter((index) => !preferredSet.has(index)));
    const chosenIndex = attempts.find((index) => canUseComboProduct(products[index]));
    const nextIndex = chosenIndex != null ? chosenIndex : selectedByBlock[String(blockIndex)] || 0;
    selectedByBlock[String(blockIndex)] = nextIndex;

    const productId = Number(products[nextIndex]?.product_id || 0);
    if (Number.isFinite(productId) && productId > 0) usedSet.add(productId);
  });

  return selectedByBlock;
}

export function getComboDraft(combo: CatalogComboDetails) {
  const comboId = Number(combo.id);
  const existing = comboDrafts.get(comboId);
  if (existing) return existing;

  const draft = {
    configuredByBlock: {},
    quantity: 1,
    selectedByBlock: getDefaultComboSelection(combo),
  };
  comboDrafts.set(comboId, draft);
  return draft;
}

export function resetComboDraft(combo: CatalogComboDetails) {
  const draft = {
    configuredByBlock: {},
    quantity: 1,
    selectedByBlock: getRandomComboSelection(combo),
  };
  comboDrafts.set(Number(combo.id), draft);
  return draft;
}

export function saveComboDraft(comboId: number, draft: ComboDraft) {
  comboDrafts.set(comboId, {
    configuredByBlock: { ...draft.configuredByBlock },
    quantity: Math.max(1, draft.quantity || 1),
    selectedByBlock: { ...draft.selectedByBlock },
  });
}

export function cloneComboDraft(draft: ComboDraft): ComboDraft {
  return {
    configuredByBlock: { ...draft.configuredByBlock },
    quantity: Math.max(1, draft.quantity || 1),
    selectedByBlock: { ...draft.selectedByBlock },
  };
}

export function getComboBlockConfig(draft: ComboDraft | null, blockIndex: number, product: CatalogComboBlockProduct | null) {
  const config = draft?.configuredByBlock?.[String(blockIndex)] || null;
  if (!config || !product || Number(config.product_id) !== Number(product.product_id)) return null;
  return config;
}

function getSelectedComboProducts(combo: CatalogComboDetails | null, draft: ComboDraft | null) {
  if (!combo || !draft) return [];
  return combo.blocks.map((block, blockIndex) => {
    const products = Array.isArray(block.products) ? block.products : [];
    const selectedIndex = draft.selectedByBlock[String(blockIndex)] ?? 0;
    return products[selectedIndex] || products[0] || null;
  });
}

export function getComboTotals(combo: CatalogComboDetails | null, draft: ComboDraft | null) {
  const selectedProducts = getSelectedComboProducts(combo, draft);
  const unitPrice = roundPrice(selectedProducts.reduce((sum, product, index) => {
    const config = getComboBlockConfig(draft, index, product);
    return sum + getComboProductPrice(product, config);
  }, 0));
  const unitOldPrice = roundPrice(selectedProducts.reduce((sum, product, index) => {
    const config = getComboBlockConfig(draft, index, product);
    return sum + getComboProductOldPrice(product, config);
  }, 0));
  const quantity = Math.max(1, draft?.quantity || 1);
  return {
    oldPrice: unitOldPrice > unitPrice ? roundPrice(unitOldPrice * quantity) : 0,
    price: roundPrice(unitPrice * quantity),
    quantity,
  };
}

export function buildComboConfiguredLines(ingredients: unknown[], ingredientState: Record<string, { quantity: number }>, fallbackProduct: CatalogComboBlockProduct | null) {
  const lines = ingredients
    .map((item) => {
      const source = asRecord(item);
      const id = toPositiveId(source.ingredient_id);
      const quantity = id ? ingredientState[String(id)]?.quantity ?? getIngredientDefaultQuantity(source) : 0;
      if (!(quantity > 0)) return '';
      const unit = getIngredientUnit(source);
      const title = getIngredientTitle(source);
      return `${String(quantity).replace('.', ',')}${unit ? ` ${unit}` : ''} ${title}`.trim();
    })
    .filter(Boolean);

  return lines.length ? lines : getComboProductLines(fallbackProduct);
}
