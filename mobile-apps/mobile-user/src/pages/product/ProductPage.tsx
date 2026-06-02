import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
} from '../../entities/product';
import type { ComboConfiguredProduct, ComboDraft } from '../../features/combo-builder';
import {
  buildComboConfiguredLines,
  getComboDraft,
  saveComboDraft,
} from '../../features/combo-builder';
import {
  fetchCatalogProduct,
  ensureMobileCatalogProductPassport,
  getCatalogProductPassport,
  getMemoryCatalogComboDetails,
  readCachedCatalogComboDetails,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
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
  selectedIndex: number | null;
  value: unknown;
  label: string;
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
  const photo = product?.photos?.[0] || product?.photo_thumb || product?.photo_lqip || '';
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

function isAvailable(product: CatalogProduct | null) {
  return product?.is_available === true || product?.is_available === 1 || product?.is_available == null;
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
  const photo = trimText(
    source.photo_thumb ||
    source.photo_lqip ||
    source.photo ||
    source.image_thumb ||
    source.image_url ||
    source.ingredient_photo_thumb ||
    source.ingredient_photo ||
    asArray(source.ingredient_photos)[0],
  );
  return resolveAssetUrl(photo);
}

function getOptionItemImage(item: unknown) {
  const source = asRecord(item);
  const targetProduct = asRecord(source.target_product || source.product);
  const photo = trimText(
    source.photo_thumb ||
    source.photo_lqip ||
    source.photo ||
    source.image_thumb ||
    source.image_url ||
    source.product_photo ||
    asArray(source.photos)[0] ||
    asArray(source.product_photos_json)[0] ||
    targetProduct.photo_thumb ||
    targetProduct.photo_lqip ||
    asArray(targetProduct.photos)[0],
  );
  return resolveAssetUrl(photo);
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

function getVariantUnitPrice(product: CatalogProduct | null, variants: unknown[], variantState: VariantState) {
  const basePrice = getProductBasePrice(product);
  if (!product || !variants.length || variantState.selectedIndex == null) return basePrice;

  const group = asRecord(variants[0]);
  const values = asArray(group.values);
  const selectedIndex = Number(variantState.selectedIndex);
  const value = values[selectedIndex];
  const numericValue = Number(String(value).replace(',', '.'));
  const baseQty = toFiniteNumber((product as CatalogProduct & AnyRecord).base_qty, 1) || 1;
  let unitPrice = Number.isFinite(numericValue) && numericValue > 0
    ? basePrice * (numericValue / baseQty)
    : basePrice;

  const tiers = asArray(group.discount_tiers);
  const tier = tiers.find((item) => Number(asRecord(item).sort_order) === selectedIndex);
  const discountPercent = toFiniteNumber(asRecord(tier).discount_percent, 0);
  if (discountPercent) unitPrice *= 1 - discountPercent / 100;

  return roundPrice(unitPrice);
}

function getOptionItemVariantState(item: unknown, variantGroup: unknown, index: number): OptionItemVariantState {
  const source = asRecord(item);
  const group = asRecord(variantGroup);
  const values = asArray(group.values);
  const basePrice = getOptionItemPrice(source);
  const value = values[index];
  const numericValue = Number(String(value).replace(',', '.'));
  const baseQty = toFiniteNumber(source.base_qty, 1) || 1;
  const unitPrice = Number.isFinite(numericValue) && numericValue > 0
    ? basePrice * (numericValue / baseQty)
    : basePrice;
  const unit = trimText(group.unit_short_title || group.unit_code || group.unit_title);

  return {
    unit_id: group.unit_id != null && Number.isFinite(Number(group.unit_id)) ? Number(group.unit_id) : null,
    variant_group_id: Number(group.variant_group_id || group.id || 0),
    variant_group_title: trimText(group.title || group.title_label),
    variant_label: formatVariantValue(value, unit),
    variant_price_diff: roundPrice(unitPrice - basePrice),
    variant_unit: unit,
    variant_value_index: Number.isFinite(index) ? index : null,
  };
}

function withDefaultOptionVariant(item: unknown, selection: OptionSelection) {
  const itemId = toPositiveId(asRecord(item).id);
  if (!itemId || selection.variantByItemId[String(itemId)]) return selection;

  const variantGroup = asArray(asRecord(item).variants)[0];
  const values = asArray(asRecord(variantGroup).values);
  if (!variantGroup || !values.length) return selection;

  const rawIndex = Number(asRecord(variantGroup).default_value_index ?? 0);
  const index = rawIndex >= 0 && rawIndex < values.length ? rawIndex : 0;
  return {
    ...selection,
    variantByItemId: {
      ...selection.variantByItemId,
      [String(itemId)]: getOptionItemVariantState(item, variantGroup, index),
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

function createInitialVariantState(product: CatalogProduct | null, variants: unknown[], defaultConfig: AnyRecord): VariantState {
  const group = asRecord(variants[0]);
  const values = asArray(group.values);
  const rawIndex = Number(defaultConfig.variant_value_index ?? group.default_value_index ?? 0);
  const selectedIndex = values.length ? Math.max(0, Math.min(values.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0)) : null;
  const unit = group.unit_short_title || group.unit_code || group.unit_title;
  const value = selectedIndex == null ? null : values[selectedIndex];

  return {
    groupId: Number(group.id ?? group.variant_group_id ?? defaultConfig.variant_group_id) || null,
    label: trimText(defaultConfig.variant_label) || (selectedIndex == null ? '' : formatVariantValue(value, unit)),
    selectedIndex,
    value,
  };
}

function createInitialOptionSelections(optionGroups: unknown[], defaultConfig: AnyRecord): Record<string, OptionSelection> {
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
      if (selectedItem) selection = withDefaultOptionVariant(selectedItem, selection);
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
        if (item) selection = withDefaultOptionVariant(item, selection);
      });
    } else {
      items.forEach((item) => {
        const id = toPositiveId(asRecord(item).id);
        if (!id) return;
        const itemMin = toFiniteNumber(asRecord(item).qty_min, 0);
        if (defaultIds.has(id) || itemMin > 0) {
          selection.qtyById[String(id)] = Math.max(1, itemMin || 1);
          selection = withDefaultOptionVariant(item, selection);
        }
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
      const variantDiff = selection.variantByItemId[String(id)]?.variant_price_diff || 0;
      selectedItems.push({
        ...source,
        qty,
        resolvedPrice: roundPrice(getOptionItemPrice(source) + variantDiff),
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
  const [passport, setPassport] = useState<CatalogProductPassport | null>(() => getCatalogProductPassport(productId));
  const [fallbackProduct, setFallbackProduct] = useState<CatalogProduct | null>(null);
  const [comboContextDetails, setComboContextDetails] = useState<CatalogComboDetails | null>(() =>
    comboContext ? getMemoryCatalogComboDetails(comboContext.comboId) : null,
  );
  const [errorText, setErrorText] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [variantState, setVariantState] = useState<VariantState>({ groupId: null, label: '', selectedIndex: null, value: null });
  const [ingredientState, setIngredientState] = useState<IngredientState>({});
  const [optionSelections, setOptionSelections] = useState<Record<string, OptionSelection>>({});
  const [isOptionsSheetOpen, setOptionsSheetOpen] = useState(false);
  const [isOptionsSheetMounted, setOptionsSheetMounted] = useState(false);
  const [activeOptionGroupId, setActiveOptionGroupId] = useState<number | null>(null);
  const [expandedOptionVariantKey, setExpandedOptionVariantKey] = useState('');
  const [nutritionMode, setNutritionMode] = useState<NutritionMode>('per100');
  const sheetTranslateY = useRef(new Animated.Value(420)).current;
  const sheetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetScrollY = useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function hydrateFromCache() {
      const memoryPassport = getCatalogProductPassport(productId);
      if (memoryPassport) {
        if (isMounted) setPassport(memoryPassport);
        if (Array.isArray(memoryPassport.ingredients) && Array.isArray(memoryPassport.optionGroups)) return;
      }

      await readCachedMobileCatalogSnapshot();
      const cachedPassport = getCatalogProductPassport(productId);
      if (cachedPassport) {
        if (isMounted) setPassport(cachedPassport);
        if (Array.isArray(cachedPassport.ingredients) && Array.isArray(cachedPassport.optionGroups)) return;
      }

      const warmedPassport = await ensureMobileCatalogProductPassport(productId);
      if (warmedPassport) {
        if (isMounted) setPassport(warmedPassport);
        return;
      }

      try {
        const product = await fetchCatalogProduct(productId);
        if (isMounted) setFallbackProduct(product);
      } catch (error) {
        if (isMounted) setErrorText(error instanceof Error ? error.message : 'Данные товара не найдены в кэше');
      }
    }

    void hydrateFromCache();

    return () => {
      isMounted = false;
    };
  }, [productId]);

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
  const image = useMemo(() => getImage(product), [product]);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setVariantState(createInitialVariantState(product, variants, defaultConfig));
    setIngredientState(createInitialIngredientState(ingredients));
    setOptionSelections(createInitialOptionSelections(optionGroups, defaultConfig));
  }, [defaultConfig, ingredients, optionGroups, product, variants]);

  const selectedOptionItems = useMemo(
    () => getSelectedOptionItems(optionGroups, optionSelections),
    [optionGroups, optionSelections],
  );
  const optionTotal = selectedOptionItems.reduce((sum, item) => sum + item.resolvedPrice * Math.max(1, item.qty), 0);
  const variantUnitPrice = getVariantUnitPrice(product, variants, variantState);
  const ingredientPriceDiff = getIngredientPriceDiff(ingredients, ingredientState);
  const unitBeforeDiscount = roundPrice(variantUnitPrice + optionTotal + ingredientPriceDiff);
  const discountAmount = calculateProductDiscountAmount(unitBeforeDiscount, product?.discount || null);
  const unitPrice = roundPrice(Math.max(0, unitBeforeDiscount - discountAmount));
  const comboDiscountPercent = comboContext ? Number(comboContextDetails?.discount_percent || 0) : 0;
  const comboUnitPrice = comboContext
    ? roundPrice(Math.max(0, comboDiscountPercent >= 100 ? 0 : unitBeforeDiscount * (1 - comboDiscountPercent / 100)))
    : unitPrice;
  const displayQuantity = Math.max(1, quantity);
  const totalPrice = roundPrice((comboContext ? comboUnitPrice : unitPrice) * displayQuantity);
  const totalOldByDiscount = discountAmount > 0 ? roundPrice(unitBeforeDiscount * displayQuantity) : 0;
  const oldBase = getOldPrice(product);
  const totalOldFromProduct = oldBase > unitPrice ? roundPrice((oldBase + optionTotal + ingredientPriceDiff) * displayQuantity) : 0;
  const totalOldPrice = comboContext && unitBeforeDiscount > comboUnitPrice
    ? roundPrice(unitBeforeDiscount * displayQuantity)
    : totalOldByDiscount || totalOldFromProduct;
  const available = isAvailable(product);
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
    if (!comboContext || !product || !comboContextDetails) return;
    const draft = getComboDraft(comboContextDetails);
    const selectedProduct = comboContextDetails.blocks[comboContext.blockIndex]?.products[comboContext.productIndex] || null;
    const lines = buildComboConfiguredLines(ingredients, ingredientState, selectedProduct);
    const configured: ComboConfiguredProduct = {
      lines,
      product_id: Number(product.id),
      product_name: product.name,
      product_photo: product.photos?.[0] || product.photo_thumb || product.photo_lqip || selectedProduct?.product_photo || '',
      unit_id: variantState.groupId,
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

  useEffect(() => {
    if (!isOptionsSheetMounted || !isOptionsSheetOpen) return;

    sheetTranslateY.setValue(420);
    sheetBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(sheetBackdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOptionsSheetMounted, isOptionsSheetOpen, sheetBackdropOpacity, sheetTranslateY]);

  const closeOptionsSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetBackdropOpacity, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 190,
        easing: Easing.in(Easing.cubic),
        toValue: 420,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setOptionsSheetOpen(false);
      setOptionsSheetMounted(false);
      setExpandedOptionVariantKey('');
    });
  }, [sheetBackdropOpacity, sheetTranslateY]);

  const resetSheetPosition = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      bounciness: 0,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [sheetTranslateY]);

  const handleSheetDragMove = useCallback((dy: number) => {
    if (dy > 0) sheetTranslateY.setValue(dy);
  }, [sheetTranslateY]);

  const handleSheetDragRelease = useCallback((dy: number, vy: number) => {
    if (dy > 88 || vy > 0.85) {
      closeOptionsSheet();
      return;
    }

    resetSheetPosition();
  }, [closeOptionsSheet, resetSheetPosition]);

  const headerPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dy > 4 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => handleSheetDragMove(gesture.dy),
      onPanResponderRelease: (_, gesture) => handleSheetDragRelease(gesture.dy, gesture.vy),
      onPanResponderTerminate: resetSheetPosition,
    }),
    [handleSheetDragMove, handleSheetDragRelease, resetSheetPosition],
  );

  const contentPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        sheetScrollY.current <= 0 &&
        gesture.dy > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => handleSheetDragMove(gesture.dy),
      onPanResponderRelease: (_, gesture) => handleSheetDragRelease(gesture.dy, gesture.vy),
      onPanResponderTerminate: resetSheetPosition,
    }),
    [handleSheetDragMove, handleSheetDragRelease, resetSheetPosition],
  );

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
    sheetScrollY.current = 0;
    setOptionsSheetMounted(true);
    setOptionsSheetOpen(true);
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
      const previous = current[String(groupId)] || createInitialOptionSelections([group], {})[String(groupId)];
      let next: OptionSelection = { ...previous, qtyById: { ...previous.qtyById }, selectedIds: [...previous.selectedIds], variantByItemId: { ...previous.variantByItemId } };

      if (next.type === 'single') {
        next.selectedId = itemId;
        next = withDefaultOptionVariant(item, next);
      } else if (next.type === 'multiple_group') {
        const exists = next.selectedIds.includes(itemId);
        next.selectedIds = exists
          ? next.selectedIds.filter((id) => id !== itemId)
          : [...next.selectedIds, itemId].slice(0, next.maxSelect || undefined);
        if (!exists) next = withDefaultOptionVariant(item, next);
      } else {
        const max = toFiniteNumber(item.qty_max, 99);
        const min = toFiniteNumber(item.qty_min, 0);
        const currentQty = next.qtyById[String(itemId)] || 0;
        const nextQty = Math.max(min, Math.min(max, currentQty + delta));
        if (nextQty <= 0) delete next.qtyById[String(itemId)];
        else next.qtyById[String(itemId)] = nextQty;
        if (nextQty > 0) next = withDefaultOptionVariant(item, next);
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
            [String(itemId)]: getOptionItemVariantState(itemRaw, variantGroupRaw, index),
          },
        },
      };
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
            {image ? <Image resizeMode="contain" source={{ uri: image }} style={styles.image} /> : <View style={styles.placeholder} />}
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
                      const selected = variantState.selectedIndex === index;
                      const label = formatVariantValue(value, asRecord(variants[0]).unit_short_title || asRecord(variants[0]).unit_code || asRecord(variants[0]).unit_title);
                      return (
                        <Pressable
                          key={`${label}-${index}`}
                          onPress={() => setVariantState({
                            groupId: toPositiveId(asRecord(variants[0]).id ?? asRecord(variants[0]).variant_group_id),
                            label,
                            selectedIndex: index,
                            value,
                          })}
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
                <Text style={styles.sectionTitle}>{getBlockTitle(product, 'ingredients', 'Состав (можно настроить):')}</Text>
                <View style={styles.infoCard}>
                  {ingredients.map((item) => {
                    const source = asRecord(item);
                    const id = toPositiveId(source.ingredient_id);
                    if (!id) return null;
                    const title = getIngredientTitle(source);
                    const unit = getIngredientUnit(source);
                    const ingredientImage = getIngredientImage(source);
                    const limits = getIngredientLimits(source);
                    const value = ingredientState[String(id)]?.quantity ?? limits.defaultQty;
                    return (
                      <View key={id} style={styles.ingredientRow}>
                        <View style={styles.ingredientThumb}>
                          {ingredientImage ? (
                            <Image resizeMode="contain" source={{ uri: ingredientImage }} style={styles.ingredientImage} />
                          ) : (
                            <View style={styles.ingredientImagePlaceholder} />
                          )}
                        </View>
                        <View style={styles.ingredientText}>
                          <Text style={styles.ingredientTitle}>{title}</Text>
                        </View>
                        <Stepper
                          disabled={!limits.isVariable}
                          max={limits.max}
                          min={limits.min}
                          onChange={(next) => updateIngredientQuantity(source, next)}
                          step={limits.step}
                          value={value}
                          valueLabel={`${String(value).replace('.', ',')}${unit ? ` ${unit}` : ''}`}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {optionGroups.length && isBlockEnabled(product, 'options') ? (
              <View style={styles.optionGroupsBlock}>
                {optionGroups.map((groupRaw) => {
                  const group = asRecord(groupRaw);
                  const groupId = toPositiveId(group.id);
                  if (!groupId) return null;
                  const selection = optionSelections[String(groupId)];
                  const selectedItems = getSelectedOptionItemsForGroup(group, selection);
                  const firstSelected = selectedItems[0];
                  const selectedTitle = firstSelected
                    ? selectedItems.map((item) => trimText(item.title || item.name)).filter(Boolean).join(', ')
                    : 'Выбрать';
                  const selectedMeta = firstSelected ? getOptionItemMetaText(firstSelected, selection) : '';
                  const hasSelectedVariants = selectedItems.some((item) => asArray(item.variants).length > 0);
                  const selectedImage = firstSelected ? getOptionItemImage(firstSelected) : '';

                  return (
                    <View key={groupId} style={styles.optionGroupSection}>
                      <Text style={styles.sectionTitle}>{trimText(group.title) || 'Опция'}</Text>
                      <Pressable style={styles.optionSummaryCard} onPress={() => openOptionsSheet(groupId)}>
                        <View style={styles.optionThumb}>
                          {selectedImage ? (
                            <Image resizeMode="contain" source={{ uri: selectedImage }} style={styles.optionImage} />
                          ) : (
                            <View style={styles.optionImagePlaceholder} />
                          )}
                        </View>
                        <View style={styles.optionSummaryText}>
                          <Text numberOfLines={2} style={styles.optionSummaryValue}>{selectedTitle}</Text>
                          {selectedMeta ? <Text style={styles.optionSummaryMeta}>{selectedMeta}</Text> : null}
                        </View>
                        <View style={hasSelectedVariants ? styles.optionGearButton : styles.optionChangeButton}>
                          {hasSelectedVariants ? (
                            <Ionicons name="settings-outline" color={theme.colors.accent} size={19} />
                          ) : (
                            <Text style={styles.optionChangeText}>Изменить ›</Text>
                          )}
                        </View>
                      </Pressable>
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
            <Pressable style={styles.footerQtyButton} onPress={() => setQuantity((value) => value + 1)}>
              <Ionicons name="add" color={theme.colors.text} size={18} />
            </Pressable>
          </View>
          <Pressable
            disabled={!available}
            onPress={comboContext ? applyComboProductConfig : () => setQuantity((value) => Math.max(1, value))}
            style={[styles.actionButton, !available && styles.actionButtonDisabled]}
          >
            {totalOldPrice > totalPrice ? <Text style={styles.actionOldPrice}>{formatPrice(totalOldPrice)}</Text> : null}
            <Text style={styles.actionButtonText}>{available ? formatPrice(totalPrice) : 'Нет в наличии'}</Text>
            {available ? <Text style={styles.actionButtonSubText}>{comboContext ? 'выбрать' : 'в корзину'}</Text> : null}
          </Pressable>
        </View>

        <Modal
          animationType="none"
          onRequestClose={closeOptionsSheet}
          transparent
          visible={isOptionsSheetMounted}
        >
          <View style={styles.sheetHost}>
            <Animated.View style={[styles.sheetBackdrop, { opacity: sheetBackdropOpacity }]}>
              <Pressable style={styles.sheetBackdropPressable} onPress={closeOptionsSheet} />
            </Animated.View>
            <Animated.View
              style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <View {...headerPanResponder.panHandlers}>
                <View style={styles.sheetGrabberWrap}>
                  <View style={styles.sheetGrabber} />
                </View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{trimText(asRecord(activeOptionGroup).title) || 'Опции'}</Text>
                </View>
              </View>
              <ScrollView
                alwaysBounceVertical={false}
                bounces={false}
                contentContainerStyle={styles.sheetContent}
                onScroll={(event) => {
                  sheetScrollY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                {...contentPanResponder.panHandlers}
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
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
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
  ingredientMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  ingredientRow: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  ingredientImage: {
    height: '100%',
    width: '100%',
  },
  ingredientImagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 8,
    flex: 1,
  },
  ingredientText: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  ingredientThumb: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 8,
    height: 42,
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
    width: 42,
  },
  ingredientTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
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
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheetBackdropPressable: {
    flex: 1,
  },
  sheetClose: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  sheetContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  sheetGroup: {
    marginBottom: theme.spacing.lg,
  },
  sheetGroupTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sheetHeader: {
    alignItems: 'flex-start',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  sheetHost: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetGrabber: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 5,
    width: 46,
  },
  sheetGrabberWrap: {
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
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


