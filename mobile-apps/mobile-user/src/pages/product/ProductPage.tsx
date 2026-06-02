import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';

import type { RootStackParamList } from '../../app/navigation/routes';
import type { CatalogNutrition, CatalogProduct, CatalogProductPassport } from '../../entities/product';
import {
  fetchCatalogProduct,
  ensureMobileCatalogProductPassport,
  getCatalogProductPassport,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { Screen } from '../../shared/ui/Screen';

type ProductPageProps = NativeStackScreenProps<RootStackParamList, 'product'>;
type AnyRecord = Record<string, unknown>;
type OptionGroupType = 'single' | 'multiple_group' | 'multiple_item';

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
    <View style={styles.infoCard}>
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
}: {
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
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
      <Text style={styles.stepperValue}>{String(value).replace('.', ',')}</Text>
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

export function ProductPage({ route }: ProductPageProps) {
  const productId = route.params.productId;
  const [passport, setPassport] = useState<CatalogProductPassport | null>(() => getCatalogProductPassport(productId));
  const [fallbackProduct, setFallbackProduct] = useState<CatalogProduct | null>(null);
  const [errorText, setErrorText] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [variantState, setVariantState] = useState<VariantState>({ groupId: null, label: '', selectedIndex: null, value: null });
  const [ingredientState, setIngredientState] = useState<IngredientState>({});
  const [optionSelections, setOptionSelections] = useState<Record<string, OptionSelection>>({});
  const [isOptionsSheetOpen, setOptionsSheetOpen] = useState(false);

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

  const product = passport?.product || fallbackProduct;
  const ingredients = useMemo(() => asArray(passport?.ingredients), [passport?.ingredients]);
  const variants = useMemo(() => asArray(passport?.variants), [passport?.variants]);
  const optionGroups = useMemo(() => asArray(passport?.optionGroups), [passport?.optionGroups]);
  const defaultConfig = useMemo(() => asRecord(passport?.defaultConfig), [passport?.defaultConfig]);
  const image = useMemo(() => getImage(product), [product]);

  useEffect(() => {
    if (!product) return;
    setQuantity(0);
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
  const displayQuantity = Math.max(1, quantity);
  const totalPrice = roundPrice(unitPrice * displayQuantity);
  const totalOldByDiscount = discountAmount > 0 ? roundPrice(unitBeforeDiscount * displayQuantity) : 0;
  const oldBase = getOldPrice(product);
  const totalOldFromProduct = oldBase > unitPrice ? roundPrice((oldBase + optionTotal + ingredientPriceDiff) * displayQuantity) : 0;
  const totalOldPrice = totalOldByDiscount || totalOldFromProduct;
  const available = isAvailable(product);
  const compositionText = getCompositionText(product, passport);
  const description = trimText(product?.description || product?.description_short);
  const nutrition = getCurrentNutrition(product, ingredients, ingredientState);
  const showNutrition = isBlockEnabled(product, 'nutrition') && (nutrition.per100 || nutrition.portion);
  const selectedOptionsLabel = selectedOptionItems.length
    ? selectedOptionItems.map((item) => trimText(item.title || item.name)).filter(Boolean).slice(0, 3).join(', ')
    : 'Не выбраны';

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
              <ProductInfoCard title={trimText(asRecord(variants[0]).title) || 'Варианты'}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
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
              </ProductInfoCard>
            ) : null}

            {ingredients.length && isBlockEnabled(product, 'ingredients') ? (
              <ProductInfoCard title="Изменить состав">
                {ingredients.map((item) => {
                  const source = asRecord(item);
                  const id = toPositiveId(source.ingredient_id);
                  if (!id) return null;
                  const title = getIngredientTitle(source);
                  const unit = getIngredientUnit(source);
                  const limits = getIngredientLimits(source);
                  const value = ingredientState[String(id)]?.quantity ?? limits.defaultQty;
                  return (
                    <View key={id} style={styles.ingredientRow}>
                      <View style={styles.ingredientText}>
                        <Text style={styles.ingredientTitle}>{title}</Text>
                        <Text style={styles.ingredientMeta}>
                          Базово {String(limits.defaultQty).replace('.', ',')}{unit ? ` ${unit}` : ''}
                        </Text>
                      </View>
                      <Stepper
                        disabled={!limits.isVariable}
                        max={limits.max}
                        min={limits.min}
                        onChange={(next) => updateIngredientQuantity(source, next)}
                        step={limits.step}
                        value={value}
                      />
                    </View>
                  );
                })}
              </ProductInfoCard>
            ) : null}

            {optionGroups.length && isBlockEnabled(product, 'options') ? (
              <Pressable style={styles.optionSummaryCard} onPress={() => setOptionsSheetOpen(true)}>
                <View style={styles.optionSummaryText}>
                  <Text style={styles.infoTitle}>Опции</Text>
                  <Text numberOfLines={2} style={styles.optionSummaryValue}>{selectedOptionsLabel}</Text>
                </View>
                <View style={styles.optionSummaryIcon}>
                  <Ionicons name="chevron-up" color={theme.colors.text} size={18} />
                </View>
              </Pressable>
            ) : null}

            {showNutrition ? (
              <ProductInfoCard title="КБЖУ">
                <View style={styles.nutritionRow}>
                  {[
                    ['Ккал', 'kcal'],
                    ['Белки', 'protein'],
                    ['Жиры', 'fat'],
                    ['Углеводы', 'carbs'],
                  ].map(([label, key]) => (
                    <View key={key} style={styles.nutritionCell}>
                      <Text style={styles.nutritionLabel}>{label}</Text>
                      <Text style={styles.nutritionValue}>{formatNutrition((nutrition.per100 as AnyRecord | null)?.[key])}</Text>
                      <Text style={styles.nutritionSubValue}>{formatNutrition((nutrition.portion as AnyRecord | null)?.[key])} порц.</Text>
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
          <View style={styles.priceStack}>
            {totalOldPrice > totalPrice ? <Text style={styles.oldPrice}>{formatPrice(totalOldPrice)}</Text> : null}
            <Text style={styles.price}>{formatPrice(totalPrice)}</Text>
            {quantity > 1 ? <Text style={styles.unitPriceText}>{formatPrice(unitPrice)} за 1 шт.</Text> : null}
          </View>
          {quantity > 0 ? (
            <View style={styles.footerQty}>
              <Pressable style={styles.footerQtyButton} onPress={() => setQuantity((value) => Math.max(0, value - 1))}>
                <Ionicons name={quantity > 1 ? 'remove' : 'trash'} color={theme.colors.primaryText} size={18} />
              </Pressable>
              <Text style={styles.footerQtyText}>{quantity}</Text>
              <Pressable style={styles.footerQtyButton} onPress={() => setQuantity((value) => value + 1)}>
                <Ionicons name="add" color={theme.colors.primaryText} size={18} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={!available}
              onPress={() => setQuantity(1)}
              style={[styles.actionButton, !available && styles.actionButtonDisabled]}
            >
              <Text style={styles.actionButtonText}>{available ? 'Добавить' : 'Нет в наличии'}</Text>
            </Pressable>
          )}
        </View>

        <Modal
          animationType="slide"
          onRequestClose={() => setOptionsSheetOpen(false)}
          transparent
          visible={isOptionsSheetOpen}
        >
          <View style={styles.sheetHost}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setOptionsSheetOpen(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Опции</Text>
                <Pressable style={styles.sheetClose} onPress={() => setOptionsSheetOpen(false)}>
                  <Ionicons name="close" color={theme.colors.text} size={22} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent}>
                {optionGroups.map((groupRaw) => {
                  const group = asRecord(groupRaw);
                  const groupId = toPositiveId(group.id);
                  if (!groupId) return null;
                  const selection = optionSelections[String(groupId)];
                  const items = asArray(group.items);
                  return (
                    <View key={groupId} style={styles.sheetGroup}>
                      <Text style={styles.sheetGroupTitle}>{trimText(group.title) || 'Опция'}</Text>
                      {items.map((itemRaw) => {
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
                        return (
                          <View key={itemId} style={[styles.optionItem, selected && styles.optionItemSelected]}>
                            <Pressable
                              onPress={() => updateOptionSelection(group, item, 1)}
                              style={styles.optionItemMain}
                            >
                              <View style={styles.optionItemText}>
                                <Text style={styles.optionItemTitle}>{trimText(item.title || item.name)}</Text>
                                <Text style={styles.optionItemMeta}>
                                  {formatPrice(getOptionItemPrice(item) + (itemVariant?.variant_price_diff || 0))}
                                </Text>
                              </View>
                              {selection.type === 'multiple_item' ? (
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
                              ) : (
                                <Ionicons
                                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                  color={selected ? theme.colors.accent : theme.colors.muted}
                                  size={22}
                                />
                              )}
                            </Pressable>

                            {selected && variantsForItem.length ? (
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
                      })}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
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
    borderRadius: 16,
    minWidth: 148,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
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
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  footerQty: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 16,
    flexDirection: 'row',
    minWidth: 148,
    padding: 4,
  },
  footerQtyButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  footerQtyText: {
    color: theme.colors.primaryText,
    flex: 1,
    fontSize: 18,
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
    marginTop: theme.spacing.md,
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
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  ingredientText: {
    flex: 1,
    paddingRight: theme.spacing.md,
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
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
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
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
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
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  sheetBackdrop: {
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
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  sheetHost: {
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    padding: 3,
  },
  stepperButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 34,
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
