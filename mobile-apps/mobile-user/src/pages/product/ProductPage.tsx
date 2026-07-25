import { AppText as Text } from '../../shared/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';

import type { RootStackParamList } from '../../app/navigation/routes';
import type {
  CatalogComboDetails,
  CatalogNutrition,
  CatalogProduct,
  CatalogProductPassport,
  UnitConversion,
} from '../../entities/product';
import { catalogPassportFromFullProductPassport } from '../../entities/product';
import {
  addCartLine,
  cartLinesToStockCheckItems,
  makeCartLineId,
  readCartLines,
  saveCartLine,
  type CartIngredient,
  type CartLine,
  type CartLineDraft,
  type CartOptionItem,
  type CartVariant,
} from '../../features/cart';
import { calculateCartStockLimit, getStockProductIdsForLines, useProductStock } from '../../features/stock';
import type { ComboConfiguredProduct, ComboDraft } from '../../features/combo-builder';
import {
  buildComboConfiguredLines,
  getComboBlockConfig,
  getComboDraft,
  saveComboDraft,
} from '../../features/combo-builder';
import {
  checkOrderStock,
  fetchCatalogProduct,
  ensureMobileCatalogProductPassport,
  getCatalogProductPassport,
  getFullProductPassport,
  getCatalogSnapshotProduct,
  getMemoryCatalogComboDetails,
  readCachedCatalogComboDetails,
  readCachedFullProductPassports,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { calculateBuyXGetYLineTotals } from '../../shared/lib/buyXGetY';
import { formatPrice } from '../../shared/lib/formatPrice';
import {
  calculateVariantUnitPrice,
  getStockLevelEntry,
  getProductAvailabilityState,
  getUnitConversionFactor,
  isProductStockAvailable,
  extractStockRowsFromCatalogPassports,
  stockLevelFromProduct,
  type ProductStockLevel,
} from '../../shared/lib/productStock';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Screen } from '../../shared/ui/Screen';

type ProductPageProps = NativeStackScreenProps<RootStackParamList, 'product'>;
type AnyRecord = Record<string, unknown>;
type OptionGroupType = 'single' | 'multiple_group' | 'multiple_item';
type NutritionMode = 'per100' | 'portion';

type OptionItemVariantState = {
  variant_group_id: number;
  variant_value_index: number | null;
  variant_label: string;
  variant_group_title: string;
  variant_unit: string;
  unit_id: number | null;
  variant_price_diff: number;
  stock_quantity?: number | null;
};

type OptionSelection = {
  type: OptionGroupType;
  selectedId: number | null;
  selectedIds: number[];
  qtyById: Record<string, number>;
  variantByItemId: Record<string, OptionItemVariantState>;
  minSelect: number;
  maxSelect: number | null;
};

type VariantState = {
  groupId: number | null;
  unitId: number | null;
  selectedIndex: number | null;
  value: unknown;
  label: string;
  quantityInBase: number | null;
  stockQuantity: number | null;
};

type IngredientState = Record<string, { quantity: number }>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? (value as AnyRecord) : {};
}

function asArray<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function roundPrice(value: number) {
  return Math.round(toFiniteNumber(value) * 100) / 100;
}

function trimText(value: unknown) {
  return String(value || '').trim();
}

function getImage(product: CatalogProduct | null) {
  const photo = product?.photos?.[0] || '';
  return resolveAssetUrl(photo);
}

function getProductBasePrice(product: CatalogProduct | null) {
  const price = Number(product?.price ?? product?.display_price ?? product?.discounted_price ?? 0);
  return Number.isFinite(price) ? price : 0;
}

function getOldPrice(product: CatalogProduct | null) {
  const price = Number(product?.old_price ?? product?.original_price ?? 0);
  return Number.isFinite(price) ? price : 0;
}

function getAvailabilityRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function normalizeAvailabilityPatch(value: unknown): Pick<CatalogProduct, 'fulfillment_mode' | 'is_available' | 'stock_qty'> | null {
  const row = getAvailabilityRecord(value);
  if (!row) return null;
  const rawAvailable = row.is_available ?? row.isAvailable;
  const stockRaw = row.stock_qty ?? row.qty;
  const fulfillmentMode = row.fulfillment_mode ?? row.fulfillmentMode;
  const stockQty = stockRaw == null ? null : Number(stockRaw);
  const availabilityText = String(rawAvailable ?? '').trim().toLowerCase();
  const isAvailableValue = rawAvailable === false || rawAvailable === 0 || rawAvailable === '0'
    || availabilityText === 'false' || availabilityText === 'no' || availabilityText === 'off'
    ? false
    : rawAvailable === true || rawAvailable === 1 || rawAvailable === '1'
      || availabilityText === 'true' || availabilityText === 'yes' || availabilityText === 'on'
      ? true
      : stockQty == null || !Number.isFinite(stockQty) || stockQty > 0;
  const patch: Pick<CatalogProduct, 'fulfillment_mode' | 'is_available' | 'stock_qty'> = {
    is_available: isAvailableValue,
    stock_qty: stockQty == null || !Number.isFinite(stockQty) ? null : stockQty,
  };
  if (fulfillmentMode !== undefined) {
    patch.fulfillment_mode = fulfillmentMode == null ? null : String(fulfillmentMode || '').trim() || null;
  }
  return patch;
}

function getNutritionValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function formatNutrition(value: unknown) {
  const number = getNutritionValue(value);
  return number == null ? '-' : String(number).replace('.', ',');
}

function getIngredientTitle(item: unknown) {
  const source = asRecord(item);
  return trimText(source.ingredient_name || source.name || source.title);
}

function getIngredientImage(item: unknown) {
  const source = asRecord(item);
  const ingredientProductId = toPositiveId(source.ingredient_id || source.product_id || source.id);
  const catalogProduct = ingredientProductId ? getCatalogSnapshotProduct(ingredientProductId) : null;
  const photo = trimText(
    catalogProduct?.photos?.[0] ||
    asArray(source.ingredient_photos)[0] ||
    source.photo_thumb ||
    source.photo_lqip ||
    source.photo ||
    source.image_thumb ||
    source.image_url ||
    source.ingredient_photo_thumb ||
    source.ingredient_photo,
  );
  return resolveAssetUrl(photo);
}

function getOptionItemImage(item: unknown) {
  const source = asRecord(item);
  const targetProductId = toPositiveId(source.target_product_id || source.product_id);
  const catalogProduct = targetProductId
    ? getCatalogSnapshotProduct(targetProductId)
      || getCatalogProductPassport(targetProductId)?.product
      || getFullProductPassport(targetProductId)?.product
    : null;
  const targetProduct = asRecord(source.target_product || source.product);
  const photo = trimText(
    catalogProduct?.photos?.[0] ||
    asArray(source.product_photos_json)[0] ||
    asArray(source.photos)[0] ||
    source.photo_thumb ||
    source.photo_lqip ||
    source.photo ||
    source.image_thumb ||
    source.image_url ||
    source.product_photo ||
    targetProduct.photo_thumb ||
    targetProduct.photo_lqip ||
    asArray(targetProduct.photos)[0],
  );
  return resolveAssetUrl(photo);
}

function getOptionItemDefaultVariant(item: unknown) {
  const source = asRecord(item);
  const variants = asArray(source.variants);
  const targetProductId = toPositiveId(source.target_product_id || source.product_id);
  const catalogProduct = targetProductId
    ? getCatalogSnapshotProduct(targetProductId)
      || getCatalogProductPassport(targetProductId)?.product
      || getFullProductPassport(targetProductId)?.product
    : null;
  const productDefault = asRecord(catalogProduct?.default_variant);
  const defaultGroupId = toPositiveId(productDefault.variant_group_id);
  const defaultIndex = Number(productDefault.variant_value_index);

  for (const variantRaw of variants) {
    const variant = asRecord(variantRaw);
    const values = asArray(variant.values);
    if (!values.length) continue;
    const groupId = toPositiveId(variant.variant_group_id || variant.id);
    if (defaultGroupId === groupId && Number.isFinite(defaultIndex) && defaultIndex >= 0 && defaultIndex < values.length) {
      return { group: variantRaw, index: defaultIndex };
    }
    const groupDefaultIndex = Number(variant.default_value_index ?? 0);
    if (Number.isFinite(groupDefaultIndex) && groupDefaultIndex >= 0 && groupDefaultIndex < values.length) {
      return { group: variantRaw, index: groupDefaultIndex };
    }
  }

  return null;
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

function normalizeSteppedQuantity(value: number, item: unknown) {
  const { max, min, step } = getIngredientLimits(item);
  let next = Math.max(min, Math.min(max, value));
  const stepsFromMin = Math.round((next - min) / step);
  next = min + stepsFromMin * step;
  return Math.round(Math.max(min, Math.min(max, next)) * 1000) / 1000;
}

function getCompositionText(product: CatalogProduct | null, passport: CatalogProductPassport | null) {
  const text = trimText(product?.client_composition);
  if (text) return text;

  const ingredients = Array.isArray(passport?.ingredients) ? passport.ingredients : [];
  return ingredients.map(getIngredientTitle).filter(Boolean).join(', ');
}

function getBlocksConfig(product: CatalogProduct | null) {
  return product?.blocks_config && typeof product.blocks_config === 'object'
    ? product.blocks_config as AnyRecord
    : {};
}

function isBlockEnabled(product: CatalogProduct | null, key: string) {
  const blocks = getBlocksConfig(product);
  return blocks[key] !== false;
}

function getBlockTitle(product: CatalogProduct | null, key: string, fallback: string) {
  const blocks = getBlocksConfig(product);
  const blockValue = blocks[key];
  if (blockValue && typeof blockValue === 'object') {
    const block = blockValue as AnyRecord;
    const title = trimText(block.title || block.label || block.name || block.heading);
    if (title) return title;
  }

  const directTitle = trimText(
    blocks[`${key}_title`] ||
    blocks[`${key}Title`] ||
    blocks[`${key}_label`] ||
    blocks[`${key}Label`],
  );
  return directTitle || fallback;
}

function getOptionItemPrice(item: unknown) {
  const source = asRecord(item);
  if (source.price_mode === 'fixed') return toFiniteNumber(source.price_value, 0);
  return toFiniteNumber(source.price ?? source.product_price, 0);
}

function getOptionItemOldPrice(item: unknown) {
  const source = asRecord(item);
  const oldPrice = toFiniteNumber(
    source.old_price ?? source.original_price ?? source.product_old_price ?? source.product_original_price,
    0,
  );
  return oldPrice > getOptionItemPrice(source) ? oldPrice : 0;
}

function getOptionGroupHint(group: unknown, selection: OptionSelection | undefined) {
  const source = asRecord(group);
  const items = asArray(source.items);
  const max = selection?.maxSelect && selection.maxSelect > 0
    ? selection.maxSelect
    : selection?.type === 'single'
      ? 1
      : items.length;
  const selected = selection?.type === 'single'
    ? (selection.selectedId ? 1 : 0)
    : selection?.type === 'multiple_group'
      ? selection.selectedIds.length
      : Object.values(selection?.qtyById || {}).filter((qty) => qty > 0).length;
  return source.is_required ? `Выбрано ${selected} из ${max} опций` : `Выберите до ${max} опций`;
}

function getOptionGroupType(group: unknown): OptionGroupType {
  const source = asRecord(group);
  if (String(source.selection_type || 'single') !== 'multiple') return 'single';

  const items = asArray(source.items);
  const hasQtyControls = items.some((item) => toFiniteNumber(asRecord(item).qty_max, 1) > 1);
  return hasQtyControls ? 'multiple_item' : 'multiple_group';
}

function formatVariantValue(value: unknown, unit: unknown) {
  const raw = trimText(value);
  const unitLabel = trimText(unit);
  if (!raw) return '';
  if (!unitLabel || /[a-zа-я]/i.test(raw)) return raw;
  return `${raw} ${unitLabel}`;
}

function getVariantUnitPrice(product: CatalogProduct | null, variants: unknown[], variantState: VariantState, unitConversions: UnitConversion[]) {
  const basePrice = getProductBasePrice(product);
  if (!product || !variants.length || variantState.selectedIndex == null) return basePrice;

  const group = asRecord(variants[0]);
  const values = asArray(group.values);
  const selectedIndex = Number(variantState.selectedIndex);
  const calculated = calculateVariantUnitPrice({
    basePrice,
    baseQty: (product as CatalogProduct & AnyRecord).base_qty,
    baseUnitId: (product as CatalogProduct & AnyRecord).base_unit_id ?? (product as CatalogProduct & AnyRecord).unit_id ?? group.unit_id,
    discountTiers: group.discount_tiers,
    selectedIndex,
    unitConversions,
    variantUnitId: group.unit_id,
    variantValue: values[selectedIndex],
  });

  return roundPrice(calculated.unitPrice);
}

function getOptionItemVariantState(item: unknown, variantGroup: unknown, index: number, unitConversions: UnitConversion[]): OptionItemVariantState {
  const source = asRecord(item);
  const group = asRecord(variantGroup);
  const values = asArray(group.values);
  const basePrice = getOptionItemPrice(source);
  const value = values[index];
  const calculated = calculateVariantUnitPrice({
    basePrice,
    baseQty: source.product_base_qty ?? source.base_qty,
    baseUnitId: source.product_base_unit_id ?? source.base_unit_id ?? source.product_unit_id ?? source.unit_id ?? group.unit_id,
    discountTiers: group.discount_tiers,
    selectedIndex: index,
    unitConversions,
    variantUnitId: group.unit_id,
    variantValue: value,
  });
  const unit = trimText(group.unit_short_title || group.unit_code || group.unit_title);

  return {
    unit_id: group.unit_id != null && Number.isFinite(Number(group.unit_id)) ? Number(group.unit_id) : null,
    variant_group_id: Number(group.variant_group_id || group.id || 0),
    variant_group_title: trimText(group.title || group.title_label),
    variant_label: formatVariantValue(value, unit),
    variant_price_diff: roundPrice(calculated.unitPrice - basePrice),
    variant_unit: unit,
    variant_value_index: Number.isFinite(index) ? index : null,
    stock_quantity: calculated.quantityInBase,
  };
}

function withDefaultOptionVariant(item: unknown, selection: OptionSelection, unitConversions: UnitConversion[]) {
  const itemId = toPositiveId(asRecord(item).id);
  if (!itemId || selection.variantByItemId[String(itemId)]) return selection;

  const defaultVariant = getOptionItemDefaultVariant(item);
  if (!defaultVariant) return selection;
  return {
    ...selection,
    variantByItemId: {
      ...selection.variantByItemId,
      [String(itemId)]: getOptionItemVariantState(item, defaultVariant.group, defaultVariant.index, unitConversions),
    },
  };
}

function createInitialIngredientState(ingredients: unknown[]): IngredientState {
  return ingredients.reduce<IngredientState>((result, item) => {
    const id = toPositiveId(asRecord(item).ingredient_id);
    if (!id) return result;
    result[String(id)] = { quantity: normalizeSteppedQuantity(getIngredientDefaultQuantity(item), item) };
    return result;
  }, {});
}

function createInitialVariantState(product: CatalogProduct | null, variants: unknown[], defaultConfig: AnyRecord, unitConversions: UnitConversion[]): VariantState {
  const group = asRecord(variants[0]);
  const values = asArray(group.values);
  const rawIndex = Number(defaultConfig.variant_value_index ?? group.default_value_index ?? 0);
  const selectedIndex = values.length ? Math.max(0, Math.min(values.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0)) : null;
  const unit = group.unit_short_title || group.unit_code || group.unit_title;
  const value = selectedIndex == null ? null : values[selectedIndex];
  const calculated = selectedIndex == null
    ? null
    : calculateVariantUnitPrice({
      basePrice: getProductBasePrice(product),
      baseQty: (product as CatalogProduct & AnyRecord).base_qty,
      baseUnitId: (product as CatalogProduct & AnyRecord).base_unit_id ?? (product as CatalogProduct & AnyRecord).unit_id ?? group.unit_id,
      discountTiers: group.discount_tiers,
      selectedIndex,
      unitConversions,
      variantUnitId: group.unit_id,
      variantValue: value,
    });

  return {
    groupId: Number(group.id ?? group.variant_group_id ?? defaultConfig.variant_group_id) || null,
    label: trimText(defaultConfig.variant_label) || (selectedIndex == null ? '' : formatVariantValue(value, unit)),
    selectedIndex,
    unitId: toPositiveId(group.unit_id),
    quantityInBase: calculated?.quantityInBase ?? null,
    stockQuantity: calculated?.quantityInBase ?? null,
    value,
  };
}

function createInitialOptionSelections(optionGroups: unknown[], defaultConfig: AnyRecord, unitConversions: UnitConversion[]): Record<string, OptionSelection> {
  const defaultIds = new Set(asArray(defaultConfig.option_item_ids).map(Number).filter(Number.isFinite));
  const result: Record<string, OptionSelection> = {};

  optionGroups.forEach((groupRaw) => {
    const group = asRecord(groupRaw);
    const groupId = toPositiveId(group.id);
    if (!groupId) return;

    const items = asArray(group.items);
    const type = getOptionGroupType(group);
    let selection: OptionSelection = {
      maxSelect: group.max_select == null ? null : toFiniteNumber(group.max_select, 0),
      minSelect: toFiniteNumber(group.min_select, 0),
      qtyById: {},
      selectedId: null,
      selectedIds: [],
      type,
      variantByItemId: {},
    };

    if (type === 'single') {
      const selected = items.find((item) => defaultIds.has(Number(asRecord(item).id)));
      const requiredFallback = group.is_required ? items[0] : null;
      selection.selectedId = toPositiveId(asRecord(selected || requiredFallback).id);
      const selectedItem = items.find((item) => Number(asRecord(item).id) === Number(selection.selectedId));
      if (selectedItem) selection = withDefaultOptionVariant(selectedItem, selection, unitConversions);
    } else if (type === 'multiple_group') {
      const selectedIds = items
        .map((item) => Number(asRecord(item).id))
        .filter((id) => defaultIds.has(id));
      if (!selectedIds.length && selection.minSelect > 0) {
        items.slice(0, selection.minSelect).forEach((item) => {
          const id = toPositiveId(asRecord(item).id);
          if (id) selectedIds.push(id);
        });
      }
      selection.selectedIds = selectedIds;
      selectedIds.forEach((id) => {
        const item = items.find((entry) => Number(asRecord(entry).id) === id);
        if (item) selection = withDefaultOptionVariant(item, selection, unitConversions);
      });
    } else {
      items.forEach((item) => {
        const id = toPositiveId(asRecord(item).id);
        if (!id) return;
        const itemMin = toFiniteNumber(asRecord(item).qty_min, 0);
        if (defaultIds.has(id) || itemMin > 0) {
          selection.qtyById[String(id)] = Math.max(1, itemMin || 1);
          selection = withDefaultOptionVariant(item, selection, unitConversions);
        }
      });
    }

    if (group.allow_variants) {
      items.forEach((item) => {
        selection = withDefaultOptionVariant(item, selection, unitConversions);
      });
    }

    result[String(groupId)] = selection;
  });

  return result;
}

function getSelectedOptionItems(optionGroups: unknown[], selections: Record<string, OptionSelection>) {
  const selectedItems: Array<AnyRecord & { qty: number; resolvedPrice: number }> = [];

  optionGroups.forEach((groupRaw) => {
    const group = asRecord(groupRaw);
    const selection = selections[String(group.id)];
    if (!selection) return;
    const items = asArray(group.items);

    const pushItem = (item: unknown, qty = 1) => {
      const source = asRecord(item);
      const id = Number(source.id);
      const variant = selection.variantByItemId[String(id)] || null;
      const variantDiff = variant?.variant_price_diff || 0;
      selectedItems.push({
        ...source,
        qty,
        resolvedPrice: roundPrice(getOptionItemPrice(source) + variantDiff),
        selectedVariant: variant,
      });
    };

    if (selection.type === 'single' && selection.selectedId) {
      const item = items.find((entry) => Number(asRecord(entry).id) === Number(selection.selectedId));
      if (item) pushItem(item, 1);
    } else if (selection.type === 'multiple_group') {
      selection.selectedIds.forEach((id) => {
        const item = items.find((entry) => Number(asRecord(entry).id) === Number(id));
        if (item) pushItem(item, 1);
      });
    } else {
      Object.entries(selection.qtyById).forEach(([id, qty]) => {
        if (qty <= 0) return;
        const item = items.find((entry) => Number(asRecord(entry).id) === Number(id));
        if (item) pushItem(item, qty);
      });
    }
  });

  return selectedItems;
}

function getSelectedOptionItemsForGroup(groupRaw: unknown, selection: OptionSelection | undefined) {
  if (!selection) return [];
  const group = asRecord(groupRaw);
  const items = asArray(group.items);
  const selected: Array<AnyRecord & { qty: number }> = [];

  const pushItem = (item: unknown, qty = 1) => {
    selected.push({ ...asRecord(item), qty });
  };

  if (selection.type === 'single' && selection.selectedId) {
    const item = items.find((entry) => Number(asRecord(entry).id) === Number(selection.selectedId));
    if (item) pushItem(item, 1);
  } else if (selection.type === 'multiple_group') {
    selection.selectedIds.forEach((id) => {
      const item = items.find((entry) => Number(asRecord(entry).id) === Number(id));
      if (item) pushItem(item, 1);
    });
  } else {
    Object.entries(selection.qtyById).forEach(([id, qty]) => {
      if (qty <= 0) return;
      const item = items.find((entry) => Number(asRecord(entry).id) === Number(id));
      if (item) pushItem(item, qty);
    });
  }

  return selected;
}

function getOptionItemMetaText(item: unknown, selection: OptionSelection | undefined) {
  const source = asRecord(item);
  const itemId = toPositiveId(source.id);
  const variant = itemId ? selection?.variantByItemId[String(itemId)] : null;
  const qty = toFiniteNumber(source.quantity ?? source.qty ?? source.product_quantity, 0);
  const unit = trimText(source.unit_short_title || source.unit_label || source.unit_title || source.unit);
  const variantLabel = trimText(variant?.variant_label);
  const parts = [
    variantLabel,
    qty > 0 ? `${String(qty).replace('.', ',')}${unit ? ` ${unit}` : ''}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function getIngredientPriceDiff(ingredients: unknown[], ingredientState: IngredientState) {
  return ingredients.reduce<number>((sum, item) => {
    const source = asRecord(item);
    const id = toPositiveId(source.ingredient_id);
    if (!id) return sum;

    const baseQty = getIngredientDefaultQuantity(source);
    const currentQty = ingredientState[String(id)]?.quantity ?? baseQty;
    const ingredientBaseQty = toFiniteNumber(source.ingredient_base_qty, 1) || 1;
    const ingredientPrice = toFiniteNumber(source.price_override ?? source.ingredient_price, 0);
    const pricePerUnit = ingredientPrice / ingredientBaseQty;
    return sum + (currentQty - baseQty) * pricePerUnit;
  }, 0);
}

function calculateProductDiscountAmount(price: number, discount: CatalogProduct['discount']) {
  const srcPrice = Number(price || 0);
  if (!(srcPrice > 0) || !discount) return 0;

  const discType = String(discount.discount_type || '').trim();
  const discValue = Number(discount.discount_value || 0);
  let discountAmount = 0;

  if (discType === 'percent') discountAmount = srcPrice * (discValue / 100);
  else if (discType === 'fixed') discountAmount = discValue;
  else if (discType === 'special_price') discountAmount = Math.max(0, srcPrice - discValue);

  const maxDiscountAmount = Number((discount as AnyRecord).max_discount_amount);
  if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
    discountAmount = maxDiscountAmount;
  }
  if (discountAmount > srcPrice) discountAmount = srcPrice;
  return roundPrice(discountAmount);
}

function getCurrentNutrition(
  product: CatalogProduct | null,
  ingredients: unknown[],
  ingredientState: IngredientState,
) {
  const activeIngredients = ingredients
    .map((item) => {
      const source = asRecord(item);
      const id = toPositiveId(source.ingredient_id);
      const qty = id ? ingredientState[String(id)]?.quantity ?? getIngredientDefaultQuantity(source) : 0;
      const nutrition = source.nutrition_per_100g && typeof source.nutrition_per_100g === 'object'
        ? asRecord(source.nutrition_per_100g)
        : {
          carbs: source.nutrition_carbs_100g,
          fat: source.nutrition_fat_100g,
          kcal: source.nutrition_kcal_100g,
          protein: source.nutrition_protein_100g,
        };
      return { nutrition, qty };
    })
    .filter((entry) => entry.qty > 0 && Object.values(entry.nutrition).some((value) => Number.isFinite(Number(value))));

  if (activeIngredients.length) {
    const portionGrams = activeIngredients.reduce((sum, entry) => sum + entry.qty, 0);
    const portion = activeIngredients.reduce<CatalogNutrition>((sum, entry) => {
      sum.kcal = toFiniteNumber(sum.kcal, 0) + toFiniteNumber(entry.nutrition.kcal, 0) * entry.qty / 100;
      sum.protein = toFiniteNumber(sum.protein, 0) + toFiniteNumber(entry.nutrition.protein, 0) * entry.qty / 100;
      sum.fat = toFiniteNumber(sum.fat, 0) + toFiniteNumber(entry.nutrition.fat, 0) * entry.qty / 100;
      sum.carbs = toFiniteNumber(sum.carbs, 0) + toFiniteNumber(entry.nutrition.carbs, 0) * entry.qty / 100;
      return sum;
    }, {});

    const per100 = portionGrams > 0
      ? {
        carbs: toFiniteNumber(portion.carbs, 0) / portionGrams * 100,
        fat: toFiniteNumber(portion.fat, 0) / portionGrams * 100,
        kcal: toFiniteNumber(portion.kcal, 0) / portionGrams * 100,
        protein: toFiniteNumber(portion.protein, 0) / portionGrams * 100,
      }
      : null;

    return { per100, portion };
  }

  return {
    per100: product?.nutrition_per_100g || null,
    portion: product?.nutrition_per_portion || null,
  };
}

function createIngredientStateFromCart(ingredients: unknown[], line: CartLine | null): IngredientState {
  const state = createInitialIngredientState(ingredients);
  if (!line?.ingredients?.length) return state;
  line.ingredients.forEach((ingredient) => {
    const id = toPositiveId(ingredient.id);
    if (id) state[String(id)] = { quantity: ingredient.quantity };
  });
  return state;
}

function createVariantStateFromCart(product: CatalogProduct | null, variants: unknown[], defaultConfig: AnyRecord, line: CartLine | null, unitConversions: UnitConversion[]): VariantState {
  if (!line?.variant) return createInitialVariantState(product, variants, defaultConfig, unitConversions);
  const variant = line.variant;
  const group = asRecord(variants[0]);
  const values = asArray(group.values);
  const valueIndex = variant.valueIndex == null ? null : Number(variant.valueIndex);
  const selectedIndex = Number.isFinite(valueIndex) && valueIndex != null && valueIndex >= 0 && valueIndex < values.length
    ? valueIndex
    : null;
  const calculated = selectedIndex == null
    ? null
    : calculateVariantUnitPrice({
      basePrice: getProductBasePrice(product),
      baseQty: (product as CatalogProduct & AnyRecord).base_qty,
      baseUnitId: (product as CatalogProduct & AnyRecord).base_unit_id ?? (product as CatalogProduct & AnyRecord).unit_id ?? group.unit_id,
      discountTiers: group.discount_tiers,
      selectedIndex,
      unitConversions,
      variantUnitId: variant.unitId ?? group.unit_id,
      variantValue: values[selectedIndex],
    });
  return {
    groupId: toPositiveId(variant.groupId ?? group.id ?? group.variant_group_id),
    label: trimText(variant.label),
    selectedIndex,
    unitId: toPositiveId(variant.unitId ?? group.unit_id),
    quantityInBase: variant.quantityInBase ?? variant.stockQuantity ?? calculated?.quantityInBase ?? null,
    stockQuantity: variant.stockQuantity ?? variant.quantityInBase ?? calculated?.quantityInBase ?? null,
    value: selectedIndex == null ? null : values[selectedIndex],
  };
}

function createOptionSelectionsFromCart(optionGroups: unknown[], defaultConfig: AnyRecord, line: CartLine | null, unitConversions: UnitConversion[]) {
  const selections = createInitialOptionSelections(optionGroups, defaultConfig, unitConversions);
  if (!line?.options?.length) return selections;

  optionGroups.forEach((groupRaw) => {
    const group = asRecord(groupRaw);
    const groupId = toPositiveId(group.id);
    if (!groupId) return;
    const items = asArray(group.items);
    const type = getOptionGroupType(group);
    const groupOptions = line.options?.filter((option) => items.some((item) => Number(asRecord(item).id) === Number(option.id))) || [];
    if (!groupOptions.length) return;
    const selection: OptionSelection = {
      maxSelect: group.max_select == null ? null : toFiniteNumber(group.max_select, 0),
      minSelect: toFiniteNumber(group.min_select, 0),
      qtyById: {},
      selectedId: null,
      selectedIds: [],
      type,
      variantByItemId: {},
    };

    groupOptions.forEach((option) => {
      const id = toPositiveId(option.id);
      if (!id) return;
      if (type === 'single') selection.selectedId = id;
      else if (type === 'multiple_group') selection.selectedIds.push(id);
      else selection.qtyById[String(id)] = Math.max(1, Number(option.quantity || 1));

      if (option.variant?.label) {
        selection.variantByItemId[String(id)] = {
          unit_id: option.variant.unitId ?? null,
          variant_group_id: option.variant.groupId || 0,
          variant_group_title: option.variant.groupTitle || '',
          variant_label: option.variant.label || '',
          variant_price_diff: Number(option.unitPrice || 0) - getOptionItemPrice(items.find((item) => Number(asRecord(item).id) === id)),
          variant_unit: option.variant.unit || '',
          variant_value_index: option.variant.valueIndex ?? null,
          stock_quantity: option.stockQuantity ?? option.variant.stockQuantity ?? option.variant.quantityInBase ?? null,
        };
      }
    });
    selections[String(groupId)] = selection;
  });

  return selections;
}

function getProductCartQuantity(lines: CartLine[], productId: number, excludeLineId = '') {
  return (Array.isArray(lines) ? lines : []).reduce((sum, line) => {
    if (line.type !== 'product') return sum;
    if (excludeLineId && line.id === excludeLineId) return sum;
    if (Number(line.sourceId || 0) !== Number(productId || 0)) return sum;
    return sum + Math.max(1, Number(line.quantity || 1));
  }, 0);
}

function createCartLineFromComboConfig(
  config: ComboConfiguredProduct | null,
  productId: number,
  ingredients: unknown[],
): CartLine | null {
  if (!config) return null;
  const title = trimText(config.product_name);
  return {
    id: 'combo-context',
    ingredients: ingredients
      .map((item): CartIngredient | null => {
        const source = asRecord(item);
        const id = toPositiveId(source.ingredient_id || source.id);
        if (!id) return null;
        const quantity = config.ingredient_quantities?.[String(id)] ?? getIngredientDefaultQuantity(source);
        const name = getIngredientTitle(source);
        if (!(quantity > 0) || !name) return null;
        return {
          id,
          name,
          quantity,
          unit: getIngredientUnit(source),
        };
      })
      .filter((item): item is CartIngredient => !!item),
    oldUnitPrice: config.unit_price_before_discount,
    options: [],
    photoUrl: resolveAssetUrl(config.product_photo || ''),
    quantity: 1,
    sourceId: productId,
    title,
    type: 'product',
    unitPrice: config.unit_price_override,
    variant: config.variant_label ? {
      groupId: config.variant_group_id ?? null,
      groupTitle: config.variant_group_title || '',
      label: config.variant_label,
      unit: config.variant_unit || '',
      valueIndex: config.variant_value_index ?? null,
    } : null,
  };
}

function buildProductCartDetailLines(
  variantLabel: string,
  ingredients: unknown[],
  ingredientState: IngredientState,
  selectedOptionItems: Array<AnyRecord & { qty: number }>,
) {
  const lines: string[] = [];
  const safeVariantLabel = trimText(variantLabel);
  if (safeVariantLabel) lines.push(safeVariantLabel);

  ingredients.forEach((item) => {
    const source = asRecord(item);
    const id = toPositiveId(source.ingredient_id);
    if (!id) return;
    const baseQty = getIngredientDefaultQuantity(source);
    const currentQty = ingredientState[String(id)]?.quantity ?? baseQty;
    if (currentQty === baseQty) return;
    const title = getIngredientTitle(source);
    if (!title) return;
    const unit = getIngredientUnit(source);
    const quantity = String(currentQty).replace('.', ',');
    lines.push(`${quantity}${unit ? ` ${unit}` : ''} ${title}`.trim());
  });

  selectedOptionItems.forEach((item) => {
    const title = trimText(item.title || item.name);
    if (!title) return;
    const qty = Math.max(1, toFiniteNumber(item.qty, 1));
    lines.push(qty > 1 ? `${qty} x ${title}` : title);
  });

  return lines;
}

function getIngredientStockQuantity(source: AnyRecord, quantity: number, unitConversions: UnitConversion[]) {
  const explicitStockQuantity = Number(source.stock_quantity ?? source.stockQuantity);
  if (Number.isFinite(explicitStockQuantity) && explicitStockQuantity > 0) return explicitStockQuantity;

  const factor = getUnitConversionFactor(
    unitConversions,
    source.unit_id ?? source.unitId ?? source.ingredient_unit_id ?? source.ingredientUnitId,
    source.ingredient_base_unit_id ?? source.ingredientBaseUnitId ?? source.base_unit_id ?? source.baseUnitId ?? source.stock_unit_id ?? source.stockUnitId,
  );
  return factor == null ? quantity : quantity * factor;
}

function buildCartIngredients(ingredients: unknown[], ingredientState: IngredientState, unitConversions: UnitConversion[]): CartIngredient[] {
  return ingredients
    .map((item): CartIngredient | null => {
      const source = asRecord(item);
      const id = toPositiveId(source.ingredient_id);
      if (!id) return null;
      const quantity = ingredientState[String(id)]?.quantity ?? getIngredientDefaultQuantity(source);
      if (!(quantity > 0)) return null;
      const name = getIngredientTitle(source);
      if (!name) return null;
      return {
        id,
        name,
        quantity,
        stockQuantity: getIngredientStockQuantity(source, quantity, unitConversions),
        unit: getIngredientUnit(source),
        unitId: toPositiveId(source.unit_id ?? source.ingredient_unit_id),
      };
    })
    .filter((item): item is CartIngredient => !!item);
}

function buildCartOptions(selectedOptionItems: Array<AnyRecord & { qty: number; resolvedPrice?: number }>): CartOptionItem[] {
  return selectedOptionItems
    .map((item): CartOptionItem | null => {
      const name = trimText(item.title || item.name);
      if (!name) return null;
      const selectedVariant = asRecord(item.selectedVariant);
      const hasVariant = !!trimText(selectedVariant.variant_label);
      return {
        id: toPositiveId(item.id),
        name,
        quantity: Math.max(1, toFiniteNumber(item.qty, 1)),
        targetProductId: toPositiveId(item.target_product_id || item.product_id),
        stockQuantity: hasVariant ? toFiniteNumber(selectedVariant.stock_quantity, 0) || null : null,
        unitPrice: toFiniteNumber(item.resolvedPrice ?? item.price, 0),
        variant: hasVariant ? {
          groupId: toPositiveId(selectedVariant.variant_group_id),
          groupTitle: trimText(selectedVariant.variant_group_title),
          label: trimText(selectedVariant.variant_label),
          quantityInBase: toFiniteNumber(selectedVariant.stock_quantity, 0) || null,
          stockQuantity: toFiniteNumber(selectedVariant.stock_quantity, 0) || null,
          unit: trimText(selectedVariant.variant_unit),
          unitId: toPositiveId(selectedVariant.unit_id),
          valueIndex: selectedVariant.variant_value_index == null ? null : Number(selectedVariant.variant_value_index),
        } : null,
      };
    })
    .filter((item): item is CartOptionItem => !!item);
}

function hasConfiguredStockCapacity({
  cartQtyBeforeAdd,
  ingredients,
  options,
  product,
  stockLevels,
}: {
  cartQtyBeforeAdd: number;
  ingredients: CartIngredient[];
  options: CartOptionItem[];
  product: CatalogProduct;
  stockLevels: Map<number, ProductStockLevel>;
}) {
  if (!getProductAvailabilityState(product, stockLevels, cartQtyBeforeAdd).availableForAdd) return false;
  const targetQty = Math.max(1, Math.floor(Number(cartQtyBeforeAdd || 0)) + 1);
  const componentRows: Array<{ productId: number | null; requiredQty: number }> = [];

  ingredients.forEach((ingredient) => {
    componentRows.push({
      productId: toPositiveId(ingredient.id),
      requiredQty: Math.max(0, toFiniteNumber(ingredient.stockQuantity ?? ingredient.quantity, 0)),
    });
  });

  options.forEach((option) => {
    componentRows.push({
      productId: toPositiveId(option.targetProductId),
      requiredQty: Math.max(0, toFiniteNumber(option.stockQuantity ?? option.variant?.stockQuantity ?? option.variant?.quantityInBase ?? option.quantity, 1)),
    });
  });

  for (const row of componentRows) {
    if (!row.productId || !(row.requiredQty > 0)) continue;
    const entry = getStockLevelEntry(stockLevels, row.productId);
    if (!entry) continue;
    if (entry.isAvailable === false || entry.canFulfill === false) return false;
    if (entry.qty === null || entry.isUnlimited === true) continue;
    const componentQty = Number(entry.qty);
    if (!Number.isFinite(componentQty)) continue;
    if (componentQty + 1e-9 < row.requiredQty * targetQty) return false;
  }

  return true;
}

function buildCartVariant(variants: unknown[], variantState: VariantState): CartVariant | null {
  if (!variants.length || variantState.selectedIndex == null || !trimText(variantState.label)) return null;
  const group = asRecord(variants[0]);
  return {
    groupId: toPositiveId(group.id ?? group.variant_group_id ?? variantState.groupId),
    groupTitle: trimText(group.title || group.title_label),
    label: trimText(variantState.label),
    quantityInBase: variantState.quantityInBase ?? variantState.stockQuantity ?? null,
    stockQuantity: variantState.stockQuantity ?? variantState.quantityInBase ?? null,
    unit: trimText(group.unit_short_title || group.unit_code || group.unit_title),
    unitId: toPositiveId(group.unit_id ?? variantState.unitId),
    valueIndex: variantState.selectedIndex,
  };
}

function getPassportStockRows(passport: CatalogProductPassport | null, unitConversions: UnitConversion[]) {
  const productId = Number(passport?.product?.id || 0);
  if (!passport || !Number.isFinite(productId) || productId <= 0) return [];
  return extractStockRowsFromCatalogPassports(new Map([[productId, passport]]), unitConversions);
}

function getCachedProductPassport(productId: number) {
  return catalogPassportFromFullProductPassport(getFullProductPassport(productId)) || getCatalogProductPassport(productId);
}

function ProductInfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={[styles.infoCard, styles.stackedInfoCard]}>
      <Text style={styles.infoTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stepper({
  disabled,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
}: {
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueLabel?: string;
}) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  return (
    <View style={styles.stepper}>
      <Pressable
        disabled={!canDecrease}
        onPress={() => onChange(Math.max(min, value - step))}
        style={[styles.stepperButton, !canDecrease && styles.stepperButtonDisabled]}
      >
        <Ionicons name="remove" color={theme.colors.primaryText} size={16} />
      </Pressable>
      <Text style={styles.stepperValue}>{valueLabel || String(value).replace('.', ',')}</Text>
      <Pressable
        disabled={!canIncrease}
        onPress={() => onChange(Math.min(max, value + step))}
        style={[styles.stepperButton, !canIncrease && styles.stepperButtonDisabled]}
      >
        <Ionicons name="add" color={theme.colors.primaryText} size={16} />
      </Pressable>
    </View>
  );
}

export function ProductPage({ navigation, route }: ProductPageProps) {
  const productId = route.params.productId;
  const initialProductImage = String(route.params.productImage || '').trim();
  const cartLineId = route.params.cartLineId || '';
  const comboContext = Number(route.params.comboId || 0) > 0 &&
    Number.isFinite(Number(route.params.comboBlockIndex)) &&
    Number.isFinite(Number(route.params.comboProductIndex))
    ? {
      blockIndex: Number(route.params.comboBlockIndex),
      comboId: Number(route.params.comboId),
      productIndex: Number(route.params.comboProductIndex),
    }
    : null;
  const comboContextId = comboContext?.comboId || 0;
  const [passport, setPassport] = useState<CatalogProductPassport | null>(() => getCachedProductPassport(productId));
  const [fallbackProduct, setFallbackProduct] = useState<CatalogProduct | null>(() => getCatalogSnapshotProduct(productId));
  const [comboContextDetails, setComboContextDetails] = useState<CatalogComboDetails | null>(() =>
    comboContext ? getMemoryCatalogComboDetails(comboContext.comboId) : null,
  );
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [errorText, setErrorText] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [variantState, setVariantState] = useState<VariantState>({ groupId: null, label: '', quantityInBase: null, selectedIndex: null, stockQuantity: null, unitId: null, value: null });
  const [ingredientState, setIngredientState] = useState<IngredientState>({});
  const [optionSelections, setOptionSelections] = useState<Record<string, OptionSelection>>({});
  const [expandedOptionGroups, setExpandedOptionGroups] = useState<Record<string, boolean>>({});
  const [isOptionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [activeOptionGroupId, setActiveOptionGroupId] = useState<number | null>(null);
  const [expandedOptionVariantKey, setExpandedOptionVariantKey] = useState('');
  const [nutritionMode, setNutritionMode] = useState<NutritionMode>('per100');
  const [existingCartQty, setExistingCartQty] = useState(0);
  const [currentCartLines, setCurrentCartLines] = useState<CartLine[]>([]);
  const { mergeStockRows, refreshMany, stockLevels, unitConversions } = useProductStock();

  const applyAvailabilityPatch = useCallback((patch: Pick<CatalogProduct, 'fulfillment_mode' | 'is_available' | 'stock_qty'> | null) => {
    if (!patch) return;
    setPassport((current) => current?.product && Number(current.product.id) === Number(productId)
      ? { ...current, product: { ...current.product, ...patch } }
      : current);
    setFallbackProduct((current) => current && Number(current.id) === Number(productId)
      ? { ...current, ...patch }
      : current);
  }, [productId]);

  useEffect(() => {
    let isMounted = true;
    const deferredTimers: ReturnType<typeof setTimeout>[] = [];

    const applyPassport = (nextPassport: CatalogProductPassport | null) => {
      if (!nextPassport) return false;
      if (isMounted) {
        setPassport(nextPassport);
        const rows = getPassportStockRows(nextPassport, unitConversions);
        if (rows.length) mergeStockRows(rows);
      }
      return true;
    };

    const applyProduct = (nextProduct: CatalogProduct | null) => {
      if (!nextProduct) return false;
      if (isMounted) {
        setFallbackProduct(nextProduct);
        const row = stockLevelFromProduct(nextProduct);
        if (row) mergeStockRows([row]);
      }
      return true;
    };

    async function readFullPassportCache() {
      await readCachedFullProductPassports().catch(() => null);
      return applyPassport(getCachedProductPassport(productId));
    }

    async function readSnapshotCache() {
      await readCachedMobileCatalogSnapshot().catch(() => null);
      const hasPassport = applyPassport(getCachedProductPassport(productId));
      const hasProduct = applyProduct(getCatalogSnapshotProduct(productId));
      return hasPassport || hasProduct;
    }

    async function warmProductData(hasCachedProductData: boolean) {
      let hasProductData = hasCachedProductData;

      const warmedPassport = await ensureMobileCatalogProductPassport(productId).catch(() => null);
      if (applyPassport(warmedPassport)) hasProductData = true;

      try {
        const product = await fetchCatalogProduct(productId);
        if (isMounted) {
          setFallbackProduct(product);
          setPassport((current) => current?.product && Number(current.product.id) === Number(productId)
            ? { ...current, product }
            : current);
          const row = stockLevelFromProduct(product);
          if (row) mergeStockRows([row]);
        }
        hasProductData = true;
      } catch (error) {
        if (hasProductData) return;
        if (isMounted) setErrorText(error instanceof Error ? error.message : 'Данные товара не найдены в кэше');
      }
    }

    async function hydrateFromCache() {
      let hasCachedProductData = false;
      const memoryPassport = getCachedProductPassport(productId);
      if (applyPassport(memoryPassport)) hasCachedProductData = true;
      const memoryProduct = getCatalogSnapshotProduct(productId);
      if (applyProduct(memoryProduct)) hasCachedProductData = true;

      if (!hasCachedProductData) {
        if (await readFullPassportCache()) hasCachedProductData = true;
        if (await readSnapshotCache()) hasCachedProductData = true;
        await warmProductData(hasCachedProductData);
        return;
      }

      deferredTimers.push(setTimeout(() => {
        void readFullPassportCache();
      }, 40));
      deferredTimers.push(setTimeout(() => {
        void warmProductData(true);
      }, 120));
    }

    void hydrateFromCache();

    return () => {
      isMounted = false;
      deferredTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [mergeStockRows, productId, unitConversions]);

  useEffect(() => {
    let isMounted = true;
    async function syncAvailability() {
      const cachedStock = getStockLevelEntry(stockLevels, productId);
      if (cachedStock) return;
      const result = await refreshMany([productId]).catch(() => null);
      if (!isMounted) return;
      const availability = result?.payload || null;
      const data = availability?.data && typeof availability.data === 'object'
        ? availability.data as Record<string, unknown>
        : {};
      applyAvailabilityPatch(normalizeAvailabilityPatch(data[String(productId)]));
    }
    void syncAvailability();
    return () => {
      isMounted = false;
    };
  }, [applyAvailabilityPatch, productId, refreshMany, stockLevels]);

  useEffect(() => {
    if (!comboContextId) return;
    let isMounted = true;

    async function hydrateComboContext() {
      const cached = getMemoryCatalogComboDetails(comboContextId) || await readCachedCatalogComboDetails(comboContextId);
      if (cached && isMounted) setComboContextDetails(cached);
    }

    void hydrateComboContext();

    return () => {
      isMounted = false;
    };
  }, [comboContextId]);

  const product = passport?.product || fallbackProduct;
  const ingredients = useMemo(() => asArray(passport?.ingredients), [passport?.ingredients]);
  const variants = useMemo(() => asArray(passport?.variants), [passport?.variants]);
  const optionGroups = useMemo(() => asArray(passport?.optionGroups), [passport?.optionGroups]);
  const defaultConfig = useMemo(() => asRecord(passport?.defaultConfig), [passport?.defaultConfig]);
  const image = useMemo(() => initialProductImage || getImage(product), [initialProductImage, product]);
  const comboContextLine = useMemo(() => {
    if (!comboContext || !comboContextDetails) return null;
    const draft = getComboDraft(comboContextDetails);
    const selectedProduct = comboContextDetails.blocks[comboContext.blockIndex]?.products[comboContext.productIndex] || null;
    const config = getComboBlockConfig(draft, comboContext.blockIndex, selectedProduct);
    return createCartLineFromComboConfig(config, productId, ingredients);
  }, [comboContext?.blockIndex, comboContext?.productIndex, comboContextDetails, ingredients, productId]);

  useEffect(() => {
    if (!cartLineId) {
      setEditingLine(null);
      return;
    }
    let isMounted = true;
    readCartLines().then((lines) => {
      if (!isMounted) return;
      setEditingLine(lines.find((line) => line.id === cartLineId && line.type === 'product') || null);
    }).catch(() => {
      if (isMounted) setEditingLine(null);
    });
    return () => {
      isMounted = false;
    };
  }, [cartLineId]);

  useEffect(() => {
    let isMounted = true;
    readCartLines().then((lines) => {
      if (!isMounted) return;
      setCurrentCartLines(lines);
      setExistingCartQty(getProductCartQuantity(lines, productId, cartLineId));
    }).catch(() => {
      if (isMounted) {
        setCurrentCartLines([]);
        setExistingCartQty(0);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [cartLineId, productId]);

  useEffect(() => {
    if (!product) return;
    const restoreLine = comboContextLine || editingLine;
    setQuantity(Math.max(1, Number(restoreLine?.quantity || 1)));
    setVariantState(createVariantStateFromCart(product, variants, defaultConfig, restoreLine, unitConversions));
    setIngredientState(createIngredientStateFromCart(ingredients, restoreLine));
    setOptionSelections(createOptionSelectionsFromCart(optionGroups, defaultConfig, restoreLine, unitConversions));
  }, [comboContextLine, defaultConfig, editingLine, ingredients, optionGroups, product, unitConversions, variants]);

  const selectedOptionItems = useMemo(
    () => getSelectedOptionItems(optionGroups, optionSelections),
    [optionGroups, optionSelections],
  );
  const currentCartIngredients = useMemo(
    () => buildCartIngredients(ingredients, ingredientState, unitConversions),
    [ingredients, ingredientState, unitConversions],
  );
  const currentCartOptions = useMemo(
    () => buildCartOptions(selectedOptionItems),
    [selectedOptionItems],
  );
  const optionTotal = selectedOptionItems.reduce((sum, item) => sum + item.resolvedPrice * Math.max(1, item.qty), 0);
  const variantUnitPrice = getVariantUnitPrice(product, variants, variantState, unitConversions);
  const ingredientPriceDiff = getIngredientPriceDiff(ingredients, ingredientState);
  const unitBeforeDiscount = roundPrice(variantUnitPrice + optionTotal + ingredientPriceDiff);
  const discountAmount = calculateProductDiscountAmount(unitBeforeDiscount, product?.discount || null);
  const unitPrice = roundPrice(Math.max(0, unitBeforeDiscount - discountAmount));
  const comboDiscountPercent = comboContext ? Number(comboContextDetails?.discount_percent || 0) : 0;
  const comboUnitPrice = comboContext
    ? roundPrice(Math.max(0, comboDiscountPercent >= 100 ? 0 : unitBeforeDiscount * (1 - comboDiscountPercent / 100)))
    : unitPrice;
  const displayQuantity = Math.max(1, quantity);
  const totalOldByDiscount = discountAmount > 0 ? roundPrice(unitBeforeDiscount * displayQuantity) : 0;
  const oldBase = getOldPrice(product);
  const totalOldFromProduct = oldBase > unitPrice ? roundPrice((oldBase + optionTotal + ingredientPriceDiff) * displayQuantity) : 0;
  const productOldUnitPrice = Math.max(
    unitBeforeDiscount > unitPrice ? unitBeforeDiscount : 0,
    oldBase > unitPrice ? oldBase + optionTotal + ingredientPriceDiff : 0,
  );
  const productBuyXGetYTotals = comboContext ? null : calculateBuyXGetYLineTotals({
    badge: product?.buy_x_get_y_badge || null,
    oldUnitPrice: productOldUnitPrice,
    quantity: displayQuantity,
    unitPrice,
  });
  const totalPrice = comboContext
    ? roundPrice(comboUnitPrice * displayQuantity)
    : productBuyXGetYTotals?.total ?? roundPrice(unitPrice * displayQuantity);
  const totalOldPrice = comboContext && unitBeforeDiscount > comboUnitPrice
    ? roundPrice(unitBeforeDiscount * displayQuantity)
    : productBuyXGetYTotals?.oldTotal ?? (totalOldByDiscount || totalOldFromProduct);
  const stockQtyForSubmit = existingCartQty + displayQuantity - 1;
  const availabilityState = product ? getProductAvailabilityState(product, stockLevels, stockQtyForSubmit) : null;
  const available = product ? isProductStockAvailable(product, stockLevels) : false;
  const configuredCartLine = useMemo(() => {
    if (!product) return null;
    const line = {
      buyXGetYBadge: product.buy_x_get_y_badge || null,
      detailLines: buildProductCartDetailLines(variantState.label, ingredients, ingredientState, selectedOptionItems),
      ingredients: currentCartIngredients,
      isUnavailable: !isProductStockAvailable(product, stockLevels),
      oldUnitPrice: productOldUnitPrice,
      options: currentCartOptions,
      photoUrl: getImage(product),
      quantity: displayQuantity,
      sourceId: product.id,
      title: trimText(product.name) || 'Товар',
      type: 'product',
      unitPrice,
      variant: buildCartVariant(variants, variantState),
    } as CartLineDraft;
    return { ...line, id: makeCartLineId(line) } as CartLine;
  }, [
    currentCartIngredients,
    currentCartOptions,
    displayQuantity,
    ingredientState,
    ingredients,
    product,
    productOldUnitPrice,
    selectedOptionItems,
    stockLevels,
    unitPrice,
    variantState,
    variants,
  ]);
  const increaseCartLine = useMemo(() => (
    configuredCartLine ? { ...configuredCartLine, quantity: displayQuantity + 1 } : null
  ), [configuredCartLine, displayQuantity]);
  const configuredFutureLines = useMemo(() => (
    configuredCartLine
      ? (cartLineId
        ? currentCartLines.map((line) => line.id === cartLineId ? configuredCartLine : line)
        : [...currentCartLines, configuredCartLine])
      : currentCartLines
  ), [cartLineId, configuredCartLine, currentCartLines]);
  const increaseFutureLines = useMemo(() => (
    increaseCartLine
      ? (cartLineId
        ? currentCartLines.map((line) => line.id === cartLineId ? increaseCartLine : line)
        : [...currentCartLines, increaseCartLine])
      : currentCartLines
  ), [cartLineId, currentCartLines, increaseCartLine]);
  const configuredStockLimit = configuredCartLine
    ? calculateCartStockLimit(configuredFutureLines, stockLevels, configuredCartLine.id)
    : null;
  const increaseStockLimit = increaseCartLine
    ? calculateCartStockLimit(increaseFutureLines, stockLevels, increaseCartLine.id)
    : null;
  const canIncreaseQuantity = Boolean(product && increaseStockLimit?.canAdd);
  const canSubmit = Boolean(product && availabilityState?.availableForAdd && configuredStockLimit?.canAdd);
  const compositionText = getCompositionText(product, passport);
  const description = trimText(product?.description || product?.description_short);
  const nutrition = getCurrentNutrition(product, ingredients, ingredientState);
  const showNutrition = isBlockEnabled(product, 'nutrition') && (nutrition.per100 || nutrition.portion);
  const currentNutrition = nutritionMode === 'portion' ? nutrition.portion : nutrition.per100;
  const selectedOptionsLabel = selectedOptionItems.length
    ? selectedOptionItems.map((item) => trimText(item.title || item.name)).filter(Boolean).slice(0, 3).join(', ')
    : 'Не выбраны';
  const activeOptionGroup = activeOptionGroupId
    ? optionGroups.find((group) => Number(asRecord(group).id) === activeOptionGroupId)
    : null;

  const applyComboProductConfig = () => {
    if (!comboContext || !product || !comboContextDetails || !canSubmit) return;
    const draft = getComboDraft(comboContextDetails);
    const selectedProduct = comboContextDetails.blocks[comboContext.blockIndex]?.products[comboContext.productIndex] || null;
    const lines = buildComboConfiguredLines(ingredients, ingredientState, selectedProduct);
    const configured: ComboConfiguredProduct = {
      lines,
      product_id: Number(product.id),
      product_name: product.name,
      product_photo: product.photos?.[0] || selectedProduct?.product_photo || '',
      unit_id: variantState.unitId,
      unit_price_before_discount: roundPrice(unitBeforeDiscount),
      unit_price_override: roundPrice(comboUnitPrice),
      variant_group_id: variantState.groupId,
      variant_group_title: trimText(asRecord(variants[0]).title || asRecord(variants[0]).title_label),
      variant_label: variantState.label,
      variant_unit: trimText(asRecord(variants[0]).unit_short_title || asRecord(variants[0]).unit_code || asRecord(variants[0]).unit_title),
      variant_value_index: variantState.selectedIndex,
    };
    const nextDraft: ComboDraft = {
      configuredByBlock: {
        ...draft.configuredByBlock,
        [String(comboContext.blockIndex)]: configured,
      },
      quantity: draft.quantity,
      selectedByBlock: {
        ...draft.selectedByBlock,
        [String(comboContext.blockIndex)]: comboContext.productIndex,
      },
    };
    saveComboDraft(comboContext.comboId, nextDraft);
    navigation.goBack();
  };

  const addProductToCart = useCallback(async () => {
    if (!product || !canSubmit) return;
    const latestStockLevels = stockLevels;
    const latestProduct = product;
    if (!getProductAvailabilityState(latestProduct, latestStockLevels, existingCartQty + displayQuantity - 1).availableForAdd) return;
    const line = {
      buyXGetYBadge: latestProduct.buy_x_get_y_badge || null,
      detailLines: buildProductCartDetailLines(variantState.label, ingredients, ingredientState, selectedOptionItems),
      ingredients: currentCartIngredients,
      isUnavailable: !isProductStockAvailable(latestProduct, latestStockLevels),
      oldUnitPrice: productOldUnitPrice,
      options: currentCartOptions,
      photoUrl: getImage(latestProduct),
      quantity: displayQuantity,
      sourceId: latestProduct.id,
      title: trimText(latestProduct.name) || 'Товар',
      type: 'product',
      unitPrice,
      variant: buildCartVariant(variants, variantState),
    } as CartLineDraft;
    const nextLine = {
      ...line,
      id: makeCartLineId(line),
    };
    const currentLines = await readCartLines();
    const nextLinesForCheck = cartLineId
      ? currentLines.map((item) => item.id === cartLineId ? nextLine : item)
      : [...currentLines, nextLine];
    const affectedProductIds = Array.from(new Set([
      product.id,
      ...getStockProductIdsForLines(nextLinesForCheck, latestStockLevels),
    ]));
    const localStockLevels = latestStockLevels;
    const localStockLimit = calculateCartStockLimit(nextLinesForCheck, localStockLevels, nextLine.id);
    if (!localStockLimit.canAdd) return;
    const syncSavedLineStock = () => {
      void refreshMany(affectedProductIds).then((result) => {
        const availability = result?.payload || null;
        const data = availability?.data && typeof availability.data === 'object'
          ? availability.data as Record<string, unknown>
          : {};
        applyAvailabilityPatch(normalizeAvailabilityPatch(data[String(product.id)]));
        return checkOrderStock(cartLinesToStockCheckItems(nextLinesForCheck));
      }).then((stockCheck) => {
        if (Array.isArray(stockCheck?.stock_levels) && stockCheck.stock_levels.length) mergeStockRows(stockCheck.stock_levels);
      }).catch(() => null);
    };
    if (cartLineId) {
      await saveCartLine(nextLine, cartLineId);
      syncSavedLineStock();
      navigation.goBack();
      return;
    }
    await addCartLine(nextLine);
    syncSavedLineStock();
    navigation.navigate('main', { screen: 'cart' });
  }, [
    applyAvailabilityPatch,
    canSubmit,
    cartLineId,
    currentCartIngredients,
    currentCartOptions,
    displayQuantity,
    existingCartQty,
    ingredientState,
    ingredients,
    navigation,
    product,
    productOldUnitPrice,
    selectedOptionItems,
    mergeStockRows,
    refreshMany,
    stockLevels,
    unitPrice,
    variantState.label,
    variantState.selectedIndex,
    variantState.unitId,
    variants,
  ]);

  const closeOptionsSheet = useCallback(() => {
    setOptionsSheetVisible(false);
    setExpandedOptionVariantKey('');
  }, []);

  const openOptionsSheet = (groupId: number) => {
    setActiveOptionGroupId(groupId);
    const group = optionGroups.find((item) => Number(asRecord(item).id) === groupId);
    const selection = optionSelections[String(groupId)];
    const selectedWithVariants = getSelectedOptionItemsForGroup(group, selection)
      .find((item) => asArray(item.variants).length > 0);
    const selectedId = toPositiveId(selectedWithVariants?.id);

    if (group && selectedWithVariants && selectedId) {
      setExpandedOptionVariantKey(`${groupId}:${selectedId}`);
      selectOptionAndOpenVariants(group, selectedWithVariants, `${groupId}:${selectedId}`);
    } else {
      setExpandedOptionVariantKey('');
    }
    setOptionsSheetVisible(true);
  };

  const updateIngredientQuantity = (item: unknown, nextValue: number) => {
    const id = toPositiveId(asRecord(item).ingredient_id);
    if (!id) return;
    setIngredientState((current) => ({
      ...current,
      [String(id)]: { quantity: normalizeSteppedQuantity(nextValue, item) },
    }));
  };

  const updateOptionSelection = (groupRaw: unknown, itemRaw: unknown, delta = 1) => {
    const group = asRecord(groupRaw);
    const item = asRecord(itemRaw);
    const groupId = toPositiveId(group.id);
    const itemId = toPositiveId(item.id);
    if (!groupId || !itemId) return;

    setOptionSelections((current) => {
      const previous = current[String(groupId)] || createInitialOptionSelections([group], {}, unitConversions)[String(groupId)];
      let next: OptionSelection = { ...previous, qtyById: { ...previous.qtyById }, selectedIds: [...previous.selectedIds], variantByItemId: { ...previous.variantByItemId } };

      if (next.type === 'single') {
        if (next.selectedId === itemId && !group.is_required) {
          next.selectedId = null;
        } else {
          next.selectedId = itemId;
          next = withDefaultOptionVariant(item, next, unitConversions);
        }
      } else if (next.type === 'multiple_group') {
        const exists = next.selectedIds.includes(itemId);
        if (exists && next.selectedIds.length <= next.minSelect) return current;
        if (!exists && next.maxSelect != null && next.selectedIds.length >= next.maxSelect) return current;
        next.selectedIds = exists ? next.selectedIds.filter((id) => id !== itemId) : [...next.selectedIds, itemId];
        if (!exists) next = withDefaultOptionVariant(item, next, unitConversions);
      } else {
        const max = toFiniteNumber(item.qty_max, 99);
        const min = toFiniteNumber(item.qty_min, 0);
        const currentQty = next.qtyById[String(itemId)] || 0;
        const nextQty = Math.max(min, Math.min(max, currentQty + delta));
        if (nextQty <= 0) delete next.qtyById[String(itemId)];
        else next.qtyById[String(itemId)] = nextQty;
        if (nextQty > 0) next = withDefaultOptionVariant(item, next, unitConversions);
      }

      return { ...current, [String(groupId)]: next };
    });
  };

  const updateOptionItemVariant = (groupRaw: unknown, itemRaw: unknown, variantGroupRaw: unknown, index: number) => {
    const groupId = toPositiveId(asRecord(groupRaw).id);
    const itemId = toPositiveId(asRecord(itemRaw).id);
    if (!groupId || !itemId) return;

    setOptionSelections((current) => {
      const previous = current[String(groupId)];
      if (!previous) return current;
      return {
        ...current,
        [String(groupId)]: {
          ...previous,
          variantByItemId: {
            ...previous.variantByItemId,
            [String(itemId)]: getOptionItemVariantState(itemRaw, variantGroupRaw, index, unitConversions),
          },
        },
      };
    });
  };

  const resetOptionItemQuantity = (groupId: number, itemId: number) => {
    setOptionSelections((current) => {
      const previous = current[String(groupId)];
      if (!previous || previous.type !== 'multiple_item' || !previous.qtyById[String(itemId)]) return current;
      const qtyById = { ...previous.qtyById };
      delete qtyById[String(itemId)];
      return { ...current, [String(groupId)]: { ...previous, qtyById } };
    });
  };

  const selectOptionAndOpenVariants = (groupRaw: unknown, itemRaw: unknown, variantKey: string) => {
    updateOptionSelection(groupRaw, itemRaw, 1);
    setExpandedOptionVariantKey(variantKey);
  };

  if (!product) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Товар не найден</Text>
          <Text style={styles.stateText}>{errorText || 'Данные товара пока не сохранены в кэше'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.root}>
        <ScrollView style={styles.page} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            {image && Platform.OS === 'web' ? (
              <Image resizeMode="contain" source={{ uri: image }} style={styles.image} />
            ) : image ? (
              <ExpoImage
                cachePolicy="memory-disk"
                contentFit="contain"
                source={{ uri: image }}
                style={styles.image}
              />
            ) : <View style={styles.placeholder} />}
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{product.name}</Text>
            {product.description_short ? <Text style={styles.subtitle}>{product.description_short}</Text> : null}

            {variants.length ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{trimText(asRecord(variants[0]).title) || 'Варианты'}</Text>
                <View style={styles.infoCard}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {asArray(asRecord(variants[0]).values).map((value, index) => {
                      const variantGroup = asRecord(variants[0]);
                      const selected = variantState.selectedIndex === index;
                      const label = formatVariantValue(value, variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title);
                      return (
                        <Pressable
                          key={`${label}-${index}`}
                          onPress={() => {
                            const calculated = calculateVariantUnitPrice({
                              basePrice: getProductBasePrice(product),
                              baseQty: (product as CatalogProduct & AnyRecord).base_qty,
                              baseUnitId: (product as CatalogProduct & AnyRecord).base_unit_id ?? (product as CatalogProduct & AnyRecord).unit_id ?? variantGroup.unit_id,
                              discountTiers: variantGroup.discount_tiers,
                              selectedIndex: index,
                              unitConversions,
                              variantUnitId: variantGroup.unit_id,
                              variantValue: value,
                            });
                            setVariantState({
                              groupId: toPositiveId(variantGroup.id ?? variantGroup.variant_group_id),
                              label,
                              quantityInBase: calculated.quantityInBase,
                              selectedIndex: index,
                              stockQuantity: calculated.quantityInBase,
                              unitId: toPositiveId(variantGroup.unit_id),
                              value,
                            });
                          }}
                          style={[styles.choiceChip, selected && styles.choiceChipActive]}
                        >
                          <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {ingredients.length && isBlockEnabled(product, 'ingredients') ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.ingredientSectionTitle}>Состав товара:</Text>
                <View style={styles.ingredientGrid}>
                  {ingredients.map((item) => {
                    const source = asRecord(item);
                    const id = toPositiveId(source.ingredient_id);
                    if (!id) return null;
                    const title = getIngredientTitle(source);
                    const unit = getIngredientUnit(source);
                    const ingredientImage = getIngredientImage(source);
                    const limits = getIngredientLimits(source);
                    const value = ingredientState[String(id)]?.quantity ?? limits.defaultQty;
                    const canDecrease = limits.isVariable && value > limits.min;
                    const canIncrease = limits.isVariable && value < limits.max;
                    const valueLabel = `${String(value).replace('.', ',')}${unit ? ` ${unit}` : ''}`;
                    return (
                      <View key={id} style={styles.ingredientCard}>
                        <View style={styles.ingredientCardPhoto}>
                          {ingredientImage ? (
                            Platform.OS === 'web' ? (
                              <Image resizeMode="cover" source={{ uri: ingredientImage }} style={styles.ingredientImage} />
                            ) : (
                              <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: ingredientImage }} style={styles.ingredientImage} />
                            )
                          ) : (
                            <View style={styles.ingredientImagePlaceholder}>
                              <Text style={styles.ingredientImagePlaceholderText}>—</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.ingredientCardInfo}>
                          <Text numberOfLines={2} style={styles.ingredientCardTitle}>{title}</Text>
                          <View style={[styles.ingredientCardControls, !limits.isVariable && styles.ingredientCardControlsFixed]}>
                            {canDecrease ? (
                              <Pressable
                                onPress={() => updateIngredientQuantity(source, value - limits.step)}
                                style={styles.ingredientCardButton}
                              >
                                <Ionicons name="remove" color={theme.colors.primaryText} size={15} />
                              </Pressable>
                            ) : limits.isVariable ? <View style={styles.ingredientCardButtonPlaceholder} /> : null}
                            <Text numberOfLines={1} style={styles.ingredientCardQuantity}>{valueLabel}</Text>
                            {canIncrease ? (
                              <Pressable
                                onPress={() => updateIngredientQuantity(source, value + limits.step)}
                                style={styles.ingredientCardButton}
                              >
                                <Ionicons name="add" color={theme.colors.primaryText} size={15} />
                              </Pressable>
                            ) : limits.isVariable ? <View style={styles.ingredientCardButtonPlaceholder} /> : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {optionGroups.length && isBlockEnabled(product, 'options') ? (
              <View style={styles.optionGroupsBlock}>
                <Text style={styles.optionsTitle}>{getBlockTitle(product, 'options', 'Опции товара:')}</Text>
                {optionGroups.map((groupRaw) => {
                  const group = asRecord(groupRaw);
                  const groupId = toPositiveId(group.id);
                  if (!groupId) return null;
                  const selection = optionSelections[String(groupId)];
                  if (!selection) return null;
                  const items = asArray(group.items);
                  const expanded = expandedOptionGroups[String(groupId)] === true;
                  const visibleItems = expanded ? items : items.slice(0, 3);

                  return (
                    <View key={groupId} style={styles.optionGroupSection}>
                      <Text style={styles.optionGroupTitle}>{trimText(group.title) || 'Опция'}</Text>
                      <Text style={styles.optionGroupHint}>{getOptionGroupHint(group, selection)}</Text>
                      <View style={styles.optionProductGrid}>
                        {visibleItems.map((itemRaw) => {
                          const item = asRecord(itemRaw);
                          const itemId = toPositiveId(item.id);
                          if (!itemId) return null;
                          const selected = selection.type === 'single'
                            ? selection.selectedId === itemId
                            : selection.type === 'multiple_group'
                              ? selection.selectedIds.includes(itemId)
                              : (selection.qtyById[String(itemId)] || 0) > 0;
                          const qty = selection.type === 'multiple_item' ? selection.qtyById[String(itemId)] || 0 : selected ? 1 : 0;
                          const variantGroup = asArray(item.variants)[0];
                          const variantValues = asArray(asRecord(variantGroup).values);
                          const variant = selection.variantByItemId[String(itemId)];
                          const variantIndex = variant?.variant_value_index ?? 0;
                          const hasVariants = Boolean(group.allow_variants && variantValues.length);
                          const image = getOptionItemImage(item);
                          const price = getOptionItemPrice(item) + (variant?.variant_price_diff || 0);
                          const oldPrice = getOptionItemOldPrice(item);
                          const discountPercent = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
                          const overlayValue = selected ? trimText(variant?.variant_label) || String(qty) : '';
                          const canVariantMinus = hasVariants && variantIndex > 0;
                          const canVariantPlus = hasVariants && variantIndex < variantValues.length - 1;

                          return (
                            <Pressable
                              key={itemId}
                              onPress={() => updateOptionSelection(group, item, 1)}
                              style={[styles.optionProductCard, selected && styles.optionProductCardSelected]}
                            >
                              <View style={styles.optionProductPhoto}>
                                {image ? (
                                  Platform.OS === 'web' ? (
                                    <Image resizeMode="cover" source={{ uri: image }} style={styles.optionProductImage} />
                                  ) : (
                                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: image }} style={styles.optionProductImage} />
                                  )
                                ) : (
                                  <View style={styles.optionProductPlaceholder}><Text style={styles.optionProductPlaceholderText}>—</Text></View>
                                )}
                                {overlayValue ? (
                                  <View style={styles.optionProductOverlay}>
                                    <Text adjustsFontSizeToFit minimumFontScale={0.45} numberOfLines={1} style={styles.optionProductOverlayText}>{overlayValue}</Text>
                                  </View>
                                ) : null}
                                {discountPercent > 0 ? (
                                  <View style={styles.optionProductDiscount}>
                                    <Text style={styles.optionProductDiscountText}>-{discountPercent}%</Text>
                                  </View>
                                ) : null}
                                {selection.type === 'multiple_item' && selected ? (
                                  <Pressable
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      resetOptionItemQuantity(groupId, itemId);
                                    }}
                                    style={styles.optionProductReset}
                                  >
                                    <Ionicons name="close" color={theme.colors.primaryText} size={15} />
                                  </Pressable>
                                ) : null}
                              </View>
                              <Text numberOfLines={2} style={styles.optionProductName}>{trimText(item.title || item.name)}</Text>
                              <View style={styles.optionProductControls}>
                                {canVariantMinus ? (
                                  <Pressable
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      if (!selected) updateOptionSelection(group, item, 1);
                                      updateOptionItemVariant(group, item, variantGroup, variantIndex - 1);
                                    }}
                                    style={styles.optionProductButton}
                                  ><Ionicons name="remove" color={theme.colors.primaryText} size={15} /></Pressable>
                                ) : <View style={styles.optionProductButtonPlaceholder} />}
                                <View style={styles.optionProductPriceBlock}>
                                  <Text numberOfLines={1} style={styles.optionProductOldPrice}>{oldPrice > price ? formatPrice(oldPrice * Math.max(qty, 1)) : ' '}</Text>
                                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.optionProductPrice}>{formatPrice(price * Math.max(qty, 1))}</Text>
                                  <Text numberOfLines={1} style={styles.optionProductVariant}>{hasVariants ? variant?.variant_label || '' : ''}</Text>
                                </View>
                                {canVariantPlus ? (
                                  <Pressable
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      if (!selected) updateOptionSelection(group, item, 1);
                                      updateOptionItemVariant(group, item, variantGroup, variantIndex + 1);
                                    }}
                                    style={styles.optionProductButton}
                                  ><Ionicons name="add" color={theme.colors.primaryText} size={15} /></Pressable>
                                ) : <View style={styles.optionProductButtonPlaceholder} />}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                      {items.length > 3 ? (
                        <Pressable
                          onPress={() => setExpandedOptionGroups((current) => ({ ...current, [String(groupId)]: !expanded }))}
                          style={styles.optionProductMore}
                        >
                          <Text style={styles.optionProductMoreText}>{expanded ? 'Показать меньше' : 'Показать все'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {showNutrition ? (
              <ProductInfoCard title="КБЖУ">
                <View style={styles.nutritionHead}>
                  <Text style={styles.nutritionHint}>
                    {nutritionMode === 'portion' ? 'Значения на порцию' : 'Значения на 100 г'}
                  </Text>
                  <View style={styles.nutritionToggle}>
                    <Pressable
                      onPress={() => setNutritionMode('per100')}
                      style={[styles.nutritionToggleButton, nutritionMode === 'per100' && styles.nutritionToggleButtonActive]}
                    >
                      <Text style={[styles.nutritionToggleText, nutritionMode === 'per100' && styles.nutritionToggleTextActive]}>100 г</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setNutritionMode('portion')}
                      style={[styles.nutritionToggleButton, nutritionMode === 'portion' && styles.nutritionToggleButtonActive]}
                    >
                      <Text style={[styles.nutritionToggleText, nutritionMode === 'portion' && styles.nutritionToggleTextActive]}>Порция</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.nutritionRow}>
                  {[
                    ['Ккал', 'kcal'],
                    ['Белки', 'protein'],
                    ['Жиры', 'fat'],
                    ['Углеводы', 'carbs'],
                  ].map(([label, key]) => (
                    <View key={key} style={styles.nutritionCell}>
                      <Text style={styles.nutritionLabel}>{label}</Text>
                      <Text style={styles.nutritionValue}>{formatNutrition((currentNutrition as AnyRecord | null)?.[key])}</Text>
                    </View>
                  ))}
                </View>
              </ProductInfoCard>
            ) : null}

            {description ? (
              <ProductInfoCard title="Описание">
                <Text style={styles.infoText}>{description}</Text>
              </ProductInfoCard>
            ) : null}

            {compositionText ? (
              <ProductInfoCard title="Состав">
                <Text style={styles.infoText}>{compositionText}</Text>
              </ProductInfoCard>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerQty}>
            <Pressable
              disabled={quantity <= 1}
              style={[styles.footerQtyButton, quantity <= 1 && styles.footerQtyButtonDisabled]}
              onPress={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Ionicons name="remove" color={theme.colors.muted} size={18} />
            </Pressable>
            <Text style={styles.footerQtyText}>{displayQuantity}</Text>
            <Pressable
              disabled={!canIncreaseQuantity}
              style={[styles.footerQtyButton, !canIncreaseQuantity && styles.footerQtyButtonDisabled]}
              onPress={() => setQuantity((value) => value + 1)}
            >
              <Ionicons name="add" color={canIncreaseQuantity ? theme.colors.text : theme.colors.muted} size={18} />
            </Pressable>
          </View>
          <Pressable
            disabled={!canSubmit}
            onPress={comboContext ? applyComboProductConfig : addProductToCart}
            style={[styles.actionButton, !canSubmit && styles.actionButtonDisabled]}
          >
            {canSubmit && totalOldPrice > totalPrice ? <Text style={styles.actionOldPrice}>{formatPrice(totalOldPrice)}</Text> : null}
            <Text style={styles.actionButtonText}>{canSubmit ? formatPrice(totalPrice) : available ? 'Больше нет' : 'Раскупили'}</Text>
            {canSubmit ? <Text style={styles.actionButtonSubText}>{comboContext ? 'выбрать' : cartLineId ? 'Сохранить' : 'в корзину'}</Text> : null}
          </Pressable>
        </View>

        <BottomSheet
          onClose={closeOptionsSheet}
          title={trimText(asRecord(activeOptionGroup).title) || 'Опции'}
          visible={isOptionsSheetVisible}
        >
                {activeOptionGroup ? (() => {
                  const group = asRecord(activeOptionGroup);
                  const groupId = toPositiveId(group.id);
                  if (!groupId) return null;
                  const selection = optionSelections[String(groupId)];
                  const items = asArray(group.items);
                  return items.map((itemRaw) => {
                    const item = asRecord(itemRaw);
                    const itemId = toPositiveId(item.id);
                    if (!itemId || !selection) return null;
                    const selected = selection.type === 'single'
                      ? selection.selectedId === itemId
                      : selection.type === 'multiple_group'
                        ? selection.selectedIds.includes(itemId)
                        : (selection.qtyById[String(itemId)] || 0) > 0;
                    const itemQty = selection.qtyById[String(itemId)] || 0;
                    const variantsForItem = asArray(item.variants);
                    const itemVariant = selection.variantByItemId[String(itemId)];
                    const optionImage = getOptionItemImage(item);
                    const variantKey = `${groupId}:${itemId}`;
                    const variantsExpanded = expandedOptionVariantKey === variantKey;
                    const metaText = getOptionItemMetaText(item, selection);
                    return (
                      <View key={itemId} style={[styles.optionItem, selected && styles.optionItemSelected]}>
                        <Pressable
                          onPress={() => {
                            if (variantsForItem.length) {
                              selectOptionAndOpenVariants(group, item, variantKey);
                              return;
                            }
                            updateOptionSelection(group, item, 1);
                          }}
                          style={styles.optionItemMain}
                        >
                          <View style={styles.optionThumb}>
                            {optionImage ? (
                              <Image resizeMode="contain" source={{ uri: optionImage }} style={styles.optionImage} />
                            ) : (
                              <View style={styles.optionImagePlaceholder} />
                            )}
                          </View>
                          <View style={styles.optionItemText}>
                            <Text style={styles.optionItemTitle}>{trimText(item.title || item.name)}</Text>
                            {metaText ? <Text style={styles.optionItemVariantText}>{metaText}</Text> : null}
                            <Text style={styles.optionItemMeta}>
                              {formatPrice(getOptionItemPrice(item) + (itemVariant?.variant_price_diff || 0))}
                            </Text>
                          </View>
                          {selection.type === 'multiple_item' ? (
                            <View style={styles.optionItemActions}>
                              <View style={styles.optionQty}>
                                <Pressable
                                  style={styles.optionQtyButton}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    updateOptionSelection(group, item, -1);
                                  }}
                                >
                                  <Ionicons name="remove" color={theme.colors.primaryText} size={14} />
                                </Pressable>
                                <Text style={styles.optionQtyText}>{itemQty}</Text>
                                <Pressable
                                  style={styles.optionQtyButton}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    updateOptionSelection(group, item, 1);
                                  }}
                                >
                                  <Ionicons name="add" color={theme.colors.primaryText} size={14} />
                                </Pressable>
                              </View>
                              {variantsForItem.length ? (
                                <Pressable
                                  style={styles.optionGearButton}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    selectOptionAndOpenVariants(group, item, variantKey);
                                  }}
                                >
                                  <Ionicons name="settings-outline" color={theme.colors.accent} size={19} />
                                </Pressable>
                              ) : null}
                            </View>
                          ) : variantsForItem.length ? (
                            <Pressable
                              style={styles.optionGearButton}
                              onPress={(event) => {
                                event.stopPropagation();
                                selectOptionAndOpenVariants(group, item, variantKey);
                              }}
                            >
                              <Ionicons name="settings-outline" color={theme.colors.accent} size={19} />
                            </Pressable>
                          ) : (
                            <Ionicons
                              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                              color={selected ? theme.colors.accent : theme.colors.muted}
                              size={22}
                            />
                          )}
                        </Pressable>

                        {selected && variantsForItem.length && variantsExpanded ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionVariantPicker}>
                            {asArray(asRecord(variantsForItem[0]).values).map((value, index) => {
                              const selectedVariant = itemVariant?.variant_value_index === index;
                              const label = formatVariantValue(value, asRecord(variantsForItem[0]).unit_short_title || asRecord(variantsForItem[0]).unit_code || asRecord(variantsForItem[0]).unit_title);
                              return (
                                <Pressable
                                  key={`${label}-${index}`}
                                  onPress={() => updateOptionItemVariant(group, item, variantsForItem[0], index)}
                                  style={[styles.optionVariantChip, selectedVariant && styles.choiceChipActive]}
                                >
                                  <Text style={[styles.choiceChipText, selectedVariant && styles.choiceChipTextActive]}>{label}</Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        ) : null}
                      </View>
                    );
                  });
                })() : null}
        </BottomSheet>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 9,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  actionButtonSubText: {
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '900',
    marginTop: -1,
  },
  actionOldPrice: {
    color: theme.colors.primaryText,
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.75,
    textDecorationLine: 'line-through',
  },
  body: {
    padding: theme.spacing.lg,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  choiceChip: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: theme.colors.accent,
  },
  choiceChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  choiceChipTextActive: {
    color: theme.colors.primaryText,
  },
  content: {
    paddingBottom: 112,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  footerQty: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    minWidth: 122,
    padding: 4,
  },
  footerQtyButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  footerQtyButtonDisabled: {
    opacity: 0.45,
  },
  footerQtyText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  hero: {
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    width: '100%',
  },
  horizontalPicker: {
    marginTop: theme.spacing.md,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: theme.spacing.md,
  },
  infoText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  infoTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  ingredientCard: {
    aspectRatio: 2 / 3.35,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    width: '30.8%',
  },
  ingredientCardButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  ingredientCardButtonPlaceholder: {
    height: 24,
    width: 24,
  },
  ingredientCardControls: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 24,
    width: '100%',
  },
  ingredientCardControlsFixed: {
    justifyContent: 'center',
  },
  ingredientCardInfo: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 7,
    paddingTop: 5,
  },
  ingredientCardPhoto: {
    aspectRatio: 1,
    backgroundColor: theme.colors.mutedBackground,
    overflow: 'hidden',
    width: '100%',
  },
  ingredientCardQuantity: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 3,
    textAlign: 'center',
  },
  ingredientCardTitle: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    height: 26,
    lineHeight: 12,
    paddingHorizontal: 5,
    textAlign: 'center',
  },
  ingredientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: theme.spacing.sm,
  },
  ingredientImage: {
    height: '100%',
    width: '100%',
  },
  ingredientImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
    justifyContent: 'center',
  },
  ingredientImagePlaceholderText: {
    color: theme.colors.muted,
    fontSize: 18,
    fontWeight: '800',
  },
  ingredientSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  nutritionCell: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.md,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: theme.spacing.sm,
  },
  nutritionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  nutritionHint: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  nutritionLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  nutritionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  nutritionSubValue: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    textAlign: 'center',
  },
  nutritionValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  nutritionToggle: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  nutritionToggleButton: {
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  nutritionToggleButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  nutritionToggleText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  nutritionToggleTextActive: {
    color: theme.colors.primaryText,
  },
  oldPrice: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  optionItem: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  optionItemMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  optionItemMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  optionItemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  optionItemSelected: {
    borderColor: theme.colors.accent,
  },
  optionItemText: {
    flex: 1,
  },
  optionItemTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  optionItemVariantText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  optionQty: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    padding: 3,
  },
  optionQtyButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  optionQtyText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 24,
    textAlign: 'center',
  },
  optionSummaryCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  optionChangeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChangeText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  optionGearButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  optionImage: {
    height: '100%',
    width: '100%',
  },
  optionImagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 8,
    flex: 1,
  },
  optionGroupsBlock: {
    marginTop: theme.spacing.md,
  },
  optionGroupSection: {
    marginTop: theme.spacing.md,
  },
  optionsTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  optionGroupTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  optionGroupHint: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  optionProductGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: theme.spacing.sm,
  },
  optionProductCard: {
    aspectRatio: 2 / 3.35,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    width: '30.8%',
  },
  optionProductCardSelected: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
  },
  optionProductPhoto: {
    aspectRatio: 1,
    backgroundColor: theme.colors.mutedBackground,
    overflow: 'hidden',
    width: '100%',
  },
  optionProductImage: {
    height: '100%',
    width: '100%',
  },
  optionProductPlaceholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  optionProductPlaceholderText: {
    color: theme.colors.muted,
    fontSize: 18,
    fontWeight: '800',
  },
  optionProductOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  optionProductOverlayText: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  optionProductReset: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    height: 22,
    justifyContent: 'center',
    left: 7,
    position: 'absolute',
    top: 7,
    width: 22,
  },
  optionProductDiscount: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  optionProductDiscountText: {
    color: theme.colors.primaryText,
    fontSize: 10,
    fontWeight: '900',
  },
  optionProductName: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '800',
    height: 29,
    lineHeight: 12,
    paddingHorizontal: 6,
    paddingTop: 5,
    textAlign: 'center',
  },
  optionProductControls: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 7,
  },
  optionProductButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  optionProductButtonPlaceholder: {
    height: 24,
    width: 24,
  },
  optionProductPriceBlock: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  optionProductOldPrice: {
    color: theme.colors.muted,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 9,
    textDecorationLine: 'line-through',
  },
  optionProductPrice: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
    width: '100%',
    textAlign: 'center',
  },
  optionProductVariant: {
    color: theme.colors.text,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 9,
    minHeight: 9,
  },
  optionProductMore: {
    alignSelf: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    minWidth: 148,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  optionProductMoreText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  optionSummaryIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  optionSummaryText: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  optionSummaryValue: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  optionSummaryMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  optionThumb: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 8,
    height: 42,
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
    width: 42,
  },
  optionVariantChip: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  optionVariantPicker: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    padding: theme.spacing.md,
  },
  page: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  placeholder: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  price: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  priceStack: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  sectionBlock: {
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: theme.spacing.sm,
  },
  stackedInfoCard: {
    marginTop: theme.spacing.md,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  stepper: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 48,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
  },
  unitPriceText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
});


