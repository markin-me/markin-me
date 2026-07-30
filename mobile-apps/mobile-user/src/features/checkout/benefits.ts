import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CartLine } from '../cart';
import { readCartLines } from '../cart';
import { readFulfillmentSelection, readCheckoutBenefitsSelection, saveCheckoutBenefitsSelection, type CheckoutBenefitsSelection, type FulfillmentSelection } from './model';
import {
  attachCheckoutPromo,
  fetchCheckoutBenefitsPreview,
  isCustomerCacheTokenActive,
  readCachedCustomerPassport,
  readCachedMobileCatalogSnapshot,
  type CheckoutBenefitsPreviewData,
  type CheckoutBenefitsPreviewRequest,
  type CustomerBenefitCard,
  type CustomerBenefits,
} from '../../shared/api';
import type { MobileCatalogSnapshot } from '../../entities/product';
import { apiConfig } from '../../shared/api/config';
import { calculateBuyXGetYLineTotals } from '../../shared/lib/buyXGetY';

export type CheckoutBenefitsCounts = {
  discounts: number;
  gifts: number;
  progress: number;
  promocodes: number;
  total: number;
};

type CheckoutBenefitsCache = {
  basePreview: CheckoutBenefitsPreviewData | null;
  currentSelection: CheckoutBenefitsSelection;
  preview: CheckoutBenefitsPreviewData | null;
  sourceBenefits: CustomerBenefits | null;
  updatedAt: string;
};

type LocalCheckoutBenefitsPreviewItem = Record<string, unknown> & {
  auto_add?: number;
  benefits_excluded_line_total?: number;
  cart_key?: string;
  combo_id?: number | null;
  discount?: Record<string, unknown> | null;
  ingredients?: Array<Record<string, unknown>>;
  line_total?: number;
  option_items?: Array<Record<string, unknown>>;
  product_config?: Record<string, unknown> | null;
  product_id?: number | null;
  qty?: number;
  type?: string;
};

type LocalCheckoutBenefitsOutcome = {
  disabledReason?: string;
  disabledReasonCode?: string;
  discountAmount: number;
  errorCode?: string;
  isApplicable: boolean;
  items: LocalCheckoutBenefitsPreviewItem[];
  itemsTotalAfterDiscount?: number;
  itemsTotalAfterPromo?: number;
};

type LocalCheckoutBenefitsTargetSets = {
  anyProductIds: Set<number>;
  categoryIds: Set<number>;
  comboIds: Set<number>;
  exactProductConfigKeysByProductId: Map<number, Set<string>>;
};

export type CheckoutBenefitsState = {
  counts: CheckoutBenefitsCounts;
  currentSelection: CheckoutBenefitsSelection;
  preview: CheckoutBenefitsPreviewData | null;
  request: CheckoutBenefitsPreviewRequest;
  sourceBenefits: CustomerBenefits | null;
};

export type CheckoutBenefitsContext = {
  cartLines?: CartLine[] | null;
  catalogSnapshot?: MobileCatalogSnapshot | null;
  fulfillmentSelection?: FulfillmentSelection | null;
  selection?: CheckoutBenefitsSelection | null;
};

const emptySelection: CheckoutBenefitsSelection = {
  discountId: null,
  discountSource: null,
  promoCode: '',
  promoRewardId: null,
  promoSource: null,
};

const CHECKOUT_BENEFITS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const checkoutBenefitsMemory = new Map<string, CheckoutBenefitsCache>();
const checkoutBenefitsRefreshInflight = new Map<string, Promise<CheckoutBenefitsState>>();

function asText(value: unknown) {
  return String(value || '').trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function getCheckoutBenefitsStorageKey(token: string, request: CheckoutBenefitsPreviewRequest) {
  return `mobile_checkout_benefits_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}_u${hashText(String(token || '').trim())}_k${hashText(stableStringify(request || {}))}`;
}

function getCheckoutBenefitsStoragePrefix(token = '') {
  const base = `mobile_checkout_benefits_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
  const safeToken = String(token || '').trim();
  return safeToken ? `${base}_u${hashText(safeToken)}_` : base;
}

function isStorageFullError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /SQLITE_FULL|database or disk is full|code\s*13/i.test(message);
}

function isFreshUpdatedAt(updatedAt: unknown) {
  const updatedAtMs = Date.parse(asText(updatedAt));
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < CHECKOUT_BENEFITS_CACHE_TTL_MS;
}

function hasCachedCheckoutBenefitsPayload(cache: CheckoutBenefitsCache | null) {
  return !!(cache?.basePreview || cache?.preview || cache?.sourceBenefits);
}

function isFreshCheckoutBenefitsCache(cache: CheckoutBenefitsCache | null) {
  return hasCachedCheckoutBenefitsPayload(cache) && isFreshUpdatedAt(cache?.updatedAt);
}

function roundPrice(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function normalizePromoCode(value: unknown) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeSelection(value: unknown): CheckoutBenefitsSelection {
  const source = value && typeof value === 'object' ? value as Partial<CheckoutBenefitsSelection> : {};
  const discountId = Number(source.discountId || 0);
  const promoRewardId = Number(source.promoRewardId || 0);
  const promoCode = normalizePromoCode(source.promoCode);
  const discountSource = source.discountSource === 'reward_discount'
    ? 'reward_discount'
    : source.discountSource === 'discount'
      ? 'discount'
      : null;
  const promoSource = source.promoSource === 'reward_promo'
    ? 'reward_promo'
    : source.promoSource === 'promo_code'
      ? 'promo_code'
      : null;

  return {
    discountId: discountId > 0 ? discountId : null,
    discountSource: discountId > 0 ? discountSource || 'discount' : null,
    promoCode,
    promoRewardId: promoRewardId > 0 ? promoRewardId : null,
    promoSource: promoCode || promoRewardId > 0 ? promoSource || 'promo_code' : null,
  };
}

function areCheckoutBenefitsSelectionsEqual(left: CheckoutBenefitsSelection | null | undefined, right: CheckoutBenefitsSelection | null | undefined) {
  return normalizeSelection(left).discountId === normalizeSelection(right).discountId
    && normalizeSelection(left).discountSource === normalizeSelection(right).discountSource
    && normalizeSelection(left).promoCode === normalizeSelection(right).promoCode
    && normalizeSelection(left).promoRewardId === normalizeSelection(right).promoRewardId
    && normalizeSelection(left).promoSource === normalizeSelection(right).promoSource;
}

function getCartLineBuyXGetYBadge(line: CartLine, snapshot: MobileCatalogSnapshot | null) {
  if (line.type !== 'product') return null;
  if (line.buyXGetYBadge) return line.buyXGetYBadge;
  const productId = Number(line.sourceId || 0);
  if (!(productId > 0) || !snapshot) return null;
  const passportProduct = snapshot.productPassports?.[String(productId)]?.product;
  return passportProduct?.buy_x_get_y_badge || null;
}

function getLineTotals(line: CartLine, snapshot: MobileCatalogSnapshot | null = null) {
  return calculateBuyXGetYLineTotals({
    badge: getCartLineBuyXGetYBadge(line, snapshot),
    oldUnitPrice: Number(line.oldUnitPrice || 0),
    quantity: Math.max(1, Number(line.quantity || 1)),
    unitPrice: Math.max(0, Number(line.unitPrice || 0)),
  });
}

function buildCheckoutPreviewItems(lines: CartLine[], snapshot: MobileCatalogSnapshot | null) {
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => line?.isUnavailable !== true)
    .map((line) => {
      const quantity = Math.max(1, Number(line.quantity || 1));
      const totals = getLineTotals(line, snapshot);
      const lineTotal = roundPrice(totals.total);
      const oldLineTotal = roundPrice(Math.max(lineTotal, totals.oldTotal));
      const benefitsExcludedLineTotal = 0;
      const variantGroupId = Number(line.variant?.groupId || 0);
      const variantValueIndex = Number(line.variant?.valueIndex);
      const baseItem: Record<string, unknown> = {
        cart_key: line.id,
        benefits_excluded_line_total: benefitsExcludedLineTotal,
        discount: oldLineTotal > lineTotal ? { original_line_total: oldLineTotal } : null,
        original_line_total: oldLineTotal,
        line_total: lineTotal,
        old_line_total: oldLineTotal,
        qty: quantity,
        type: line.type,
      };

      if (line.type === 'combo') {
        return {
          ...baseItem,
          combo_id: Number(line.sourceId || 0) || null,
          combo_title: line.title,
          auto_add: 0,
        };
      }

      const optionItems = (Array.isArray(line.options) ? line.options : [])
        .map((option) => {
          const optionVariantGroupId = Number(option.variant?.groupId || 0);
          const optionVariantValueIndex = Number(option.variant?.valueIndex);
          return {
            id: Number(option.id || 0) || null,
            qty: Math.max(1, Number(option.quantity || 1)),
            variant_group_id: optionVariantGroupId > 0 ? optionVariantGroupId : null,
            variant_value_index: Number.isFinite(optionVariantValueIndex) && optionVariantValueIndex >= 0
              ? optionVariantValueIndex
              : null,
          };
        })
        .filter((option) => Number(option.id || 0) > 0);
      const ingredients = (Array.isArray(line.ingredients) ? line.ingredients : [])
        .map((ingredient) => ({
          ingredient_id: Number(ingredient.id || 0) || null,
          qty: Number(ingredient.quantity || 0) || 0,
        }))
        .filter((ingredient) => Number(ingredient.ingredient_id || 0) > 0);

      return {
        ...baseItem,
        auto_add: 0,
        ingredients,
        option_items: optionItems,
        product_config: {
          ingredients,
          options: optionItems,
          product_id: Number(line.sourceId || 0) || null,
          variant_group_id: variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
            ? variantValueIndex
            : null,
        },
        product_id: Number(line.sourceId || 0) || null,
        product_name: line.title,
        variant_group_id: variantGroupId > 0 ? variantGroupId : null,
        variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
          ? variantValueIndex
          : null,
      };
    });
}

function buildCheckoutBenefitsPreviewRequestFromContext(context: CheckoutBenefitsContext) {
  const lines = Array.isArray(context.cartLines) ? context.cartLines : [];
  const snapshot = context.catalogSnapshot || null;
  const fulfillment = context.fulfillmentSelection || null;
  return {
    items: buildCheckoutPreviewItems(lines, snapshot),
    method_code: fulfillment?.mode === 'pickup' ? 'takeaway' : 'delivery',
    promo_code: null,
    selected_discount_id: null,
    selected_discount_source: null,
    selected_promo_reward_id: null,
    selected_promo_source: null,
  } satisfies CheckoutBenefitsPreviewRequest;
}

function buildSelectionKeyFromDiscount(item: CustomerBenefitCard | null | undefined) {
  if (!item) return '';
  const source = asText(item.source).toLowerCase() === 'reward_discount' ? 'reward_discount' : 'discount';
  const id = source === 'reward_discount' ? Number(item.reward_id || item.id || 0) : Number(item.id || 0);
  return source && id > 0 ? `${source}:${id}` : '';
}

function buildSelectionKeyFromPromo(item: CustomerBenefitCard | null | undefined) {
  if (!item) return '';
  const source = asText(item.source).toLowerCase() === 'reward_promo' ? 'reward_promo' : 'promo_code';
  const id = source === 'reward_promo' ? Number(item.reward_id || item.id || 0) : Number(item.id || 0);
  return source && id > 0 ? `${source}:${id}` : '';
}

function buildSelectedPromoKey(selection: CheckoutBenefitsSelection, preview: CheckoutBenefitsPreviewData | null) {
  if (selection.promoSource === 'reward_promo') {
    return selection.promoRewardId ? `reward_promo:${selection.promoRewardId}` : '';
  }
  const code = normalizePromoCode(selection.promoCode);
  if (!code) return '';
  const promoIndex = preview?.client_calculation?.promo_code_index && typeof preview.client_calculation.promo_code_index === 'object'
    ? preview.client_calculation.promo_code_index as Record<string, unknown>
    : null;
  const indexedKey = asText(promoIndex?.[code]);
  if (indexedKey) return indexedKey;
  const promoCard = Array.isArray(preview?.promo_codes)
    ? preview.promo_codes.find((entry) => normalizePromoCode(entry?.code) === code)
    : null;
  return buildSelectionKeyFromPromo(promoCard);
}

function normalizeLocalCheckoutBenefitProductConfig(value: unknown, fallbackProductId: number | null = null) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const productId = Number(source.product_id || fallbackProductId || 0);
  if (!(productId > 0)) return null;
  const variantGroupId = Number(source.variant_group_id || 0);
  const variantValueIndex = Number(source.variant_value_index);
  const optionSource = Array.isArray(source.options)
    ? source.options
    : Array.isArray(source.option_items)
      ? source.option_items
      : [];
  const ingredientSource = Array.isArray(source.ingredients) ? source.ingredients : [];
  const options = optionSource
    .flatMap((option) => {
      const entry = option && typeof option === 'object' ? option as Record<string, unknown> : {};
      const id = Number(entry.id || entry.option_item_id || 0);
      if (!(id > 0)) return [];
      const optionVariantGroupId = Number(entry.variant_group_id || 0);
      const optionVariantValueIndex = Number(entry.variant_value_index);
      return [{
        id,
        qty: Math.max(1, Number(entry.qty ?? entry.quantity ?? 1) || 1),
        target_product_id: Number(entry.target_product_id || entry.product_id || 0) || null,
        variant_group_id: optionVariantGroupId > 0 ? optionVariantGroupId : null,
        variant_value_index: Number.isFinite(optionVariantValueIndex) && optionVariantValueIndex >= 0
          ? optionVariantValueIndex
          : null,
      }];
    })
    .sort((left, right) => (
      Number(left.id || 0) - Number(right.id || 0)
      || Number(left.variant_group_id || 0) - Number(right.variant_group_id || 0)
      || Number(left.variant_value_index || 0) - Number(right.variant_value_index || 0)
    ));
  const ingredients = ingredientSource
    .flatMap((ingredient) => {
      const entry = ingredient && typeof ingredient === 'object' ? ingredient as Record<string, unknown> : {};
      const ingredientId = Number(entry.ingredient_id || entry.product_id || 0);
      if (!(ingredientId > 0)) return [];
      return [{
        ingredient_id: ingredientId,
        qty: Number(entry.qty ?? entry.quantity ?? 0) || 0,
      }];
    })
    .sort((left, right) => Number(left.ingredient_id || 0) - Number(right.ingredient_id || 0));
  return {
    ingredients,
    options,
    product_id: productId,
    variant_group_id: variantGroupId > 0 ? variantGroupId : null,
    variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
  };
}

function buildLocalCheckoutBenefitProductConfigKey(value: unknown, fallbackProductId: number | null = null) {
  const normalized = normalizeLocalCheckoutBenefitProductConfig(value, fallbackProductId);
  if (!normalized) return '';
  try {
    return JSON.stringify(normalized);
  } catch {
    return '';
  }
}

function buildLocalCheckoutBenefitsPreviewItems(request: CheckoutBenefitsPreviewRequest): LocalCheckoutBenefitsPreviewItem[] {
  return (Array.isArray(request.items) ? request.items : [])
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object') return null;
      const source = rawItem as Record<string, unknown>;
      const type = asText(source.type).toLowerCase() || 'product';
      const qty = Math.max(1, Number(source.qty || 1) || 1);
      const lineTotal = roundPrice(Math.max(0, Number(source.line_total || 0) || 0));
      const benefitsExcludedLineTotal = roundPrice(Math.min(
        lineTotal,
        Math.max(0, Number(source.benefits_excluded_line_total ?? source.discount_excluded_line_total ?? 0) || 0),
      ));
      const originalLineTotal = roundPrice(Math.max(
        lineTotal,
        Number(source.original_line_total ?? source.old_line_total ?? (source.discount as Record<string, unknown> | undefined)?.original_line_total ?? lineTotal) || lineTotal,
      ));
      if (type === 'combo') {
        const comboId = Number(source.combo_id || 0) || null;
        if (!comboId) return null;
        const comboItem: LocalCheckoutBenefitsPreviewItem = {
          auto_add: Number(source.auto_add || 0) === 1 ? 1 : 0,
          cart_key: asText(source.cart_key),
          combo_id: comboId,
          line_total: lineTotal,
          qty,
          type: 'combo',
        };
        if (originalLineTotal > lineTotal) comboItem.discount = { original_line_total: originalLineTotal };
        if (benefitsExcludedLineTotal > 0) comboItem.benefits_excluded_line_total = benefitsExcludedLineTotal;
        return comboItem;
      }
      const productId = Number(source.product_id || 0) || null;
      if (!productId) return null;
      const variantGroupId = Number(source.variant_group_id || 0);
      const variantValueIndex = Number(source.variant_value_index);
      const optionItems = (Array.isArray(source.option_items) ? source.option_items : [])
        .flatMap((option) => {
          const entry = option && typeof option === 'object' ? option as Record<string, unknown> : {};
          const id = Number(entry.id || entry.option_item_id || 0);
          if (!(id > 0)) return [];
          const optionVariantGroupId = Number(entry.variant_group_id || 0);
          const optionVariantValueIndex = Number(entry.variant_value_index);
          return [{
            id,
            qty: Math.max(1, Number(entry.qty ?? entry.quantity ?? 1) || 1),
            target_product_id: Number(entry.target_product_id || entry.product_id || 0) || null,
            variant_group_id: optionVariantGroupId > 0 ? optionVariantGroupId : null,
            variant_value_index: Number.isFinite(optionVariantValueIndex) && optionVariantValueIndex >= 0
              ? optionVariantValueIndex
              : null,
          }];
        });
      const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
        .flatMap((ingredient) => {
          const entry = ingredient && typeof ingredient === 'object' ? ingredient as Record<string, unknown> : {};
          const ingredientId = Number(entry.ingredient_id || entry.product_id || 0);
          if (!(ingredientId > 0)) return [];
          return [{
            ingredient_id: ingredientId,
            qty: Number(entry.qty ?? entry.quantity ?? 0) || 0,
          }];
        });
      const productItem: LocalCheckoutBenefitsPreviewItem = {
        auto_add: Number(source.auto_add || 0) === 1 ? 1 : 0,
        cart_key: asText(source.cart_key),
        ingredients,
        line_total: lineTotal,
        option_items: optionItems,
        product_config: normalizeLocalCheckoutBenefitProductConfig(source.product_config || {
          ingredients,
          options: optionItems,
          product_id: productId,
          variant_group_id: variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
        }, productId),
        product_id: productId,
        qty,
        type: 'product',
        variant_group_id: variantGroupId > 0 ? variantGroupId : null,
        variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
      };
      if (originalLineTotal > lineTotal) productItem.discount = { original_line_total: originalLineTotal };
      if (benefitsExcludedLineTotal > 0) productItem.benefits_excluded_line_total = benefitsExcludedLineTotal;
      return productItem;
    })
    .filter((entry): entry is LocalCheckoutBenefitsPreviewItem => !!entry);
}

function addLocalCheckoutBenefitProductCategory(result: Map<number, Set<number>>, productId: unknown, categoryId: unknown) {
  const normalizedProductId = Number(productId || 0);
  const normalizedCategoryId = Number(categoryId || 0);
  if (!(normalizedProductId > 0) || !(normalizedCategoryId > 0)) return;
  if (!result.has(normalizedProductId)) result.set(normalizedProductId, new Set());
  result.get(normalizedProductId)?.add(normalizedCategoryId);
}

function addLocalCheckoutBenefitProductCategories(result: Map<number, Set<number>>, product: unknown) {
  if (!product || typeof product !== 'object') return;
  const source = product as Record<string, unknown>;
  const productId = Number(source.id || source.product_id || 0);
  if (!(productId > 0)) return;
  addLocalCheckoutBenefitProductCategory(result, productId, source.category_id);
  addLocalCheckoutBenefitProductCategory(result, productId, source.categoryId);
  (Array.isArray(source.category_ids) ? source.category_ids : []).forEach((categoryId) => {
    addLocalCheckoutBenefitProductCategory(result, productId, categoryId);
  });
  (Array.isArray(source.categories) ? source.categories : []).forEach((category) => {
    if (category && typeof category === 'object') {
      addLocalCheckoutBenefitProductCategory(result, productId, (category as Record<string, unknown>).id || (category as Record<string, unknown>).category_id);
      return;
    }
    addLocalCheckoutBenefitProductCategory(result, productId, category);
  });
}

function buildLocalCheckoutBenefitsProductCategoriesMap(snapshot: MobileCatalogSnapshot | null) {
  const result = new Map<number, Set<number>>();
  Object.entries(snapshot?.productsByCategory || {}).forEach(([rawCategoryId, products]) => {
    const categoryId = Number(rawCategoryId || 0);
    if (!(categoryId > 0) || !Array.isArray(products)) return;
    products.forEach((product) => {
      addLocalCheckoutBenefitProductCategory(result, (product as Record<string, unknown>)?.id, categoryId);
      addLocalCheckoutBenefitProductCategories(result, product);
    });
  });
  Object.values(snapshot?.productPassports || {}).forEach((passport) => {
    const product = passport && typeof passport === 'object'
      ? (passport as Record<string, unknown>).product
      : null;
    addLocalCheckoutBenefitProductCategories(result, product);
  });
  return new Map(Array.from(result.entries()).map(([productId, categoryIds]) => [productId, Array.from(categoryIds.values())]));
}

function buildLocalCheckoutBenefitsTargetSets(targetSets: unknown): LocalCheckoutBenefitsTargetSets {
  const source = targetSets && typeof targetSets === 'object' ? targetSets as Record<string, unknown> : {};
  const exactProductConfigKeysByProductId = new Map<number, Set<string>>();
  const exactConfigs = source.exact_product_configs_by_product_id && typeof source.exact_product_configs_by_product_id === 'object'
    ? source.exact_product_configs_by_product_id as Record<string, unknown>
    : {};
  Object.entries(exactConfigs).forEach(([rawProductId, configs]) => {
    const productId = Number(rawProductId || 0);
    if (!(productId > 0)) return;
    const keys = new Set(
      (Array.isArray(configs) ? configs : [])
        .map((config) => buildLocalCheckoutBenefitProductConfigKey(config, productId))
        .filter(Boolean),
    );
    if (keys.size) exactProductConfigKeysByProductId.set(productId, keys);
  });
  return {
    anyProductIds: new Set((Array.isArray(source.any_product_ids) ? source.any_product_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
    categoryIds: new Set((Array.isArray(source.category_ids) ? source.category_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
    comboIds: new Set((Array.isArray(source.combo_ids) ? source.combo_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
    exactProductConfigKeysByProductId,
  };
}

function matchLocalCheckoutBenefitsTargetScope(
  targetSets: LocalCheckoutBenefitsTargetSets,
  item: LocalCheckoutBenefitsPreviewItem,
  productCategoriesMap: Map<number, number[]>,
  scope: string,
) {
  const normalizedScope = asText(scope).toLowerCase() || 'product';
  const productId = Number(item.product_id || 0);
  const matchesProduct = item.type !== 'combo' && productId > 0 && (() => {
    if (targetSets.anyProductIds.has(productId)) return true;
    const exactConfigs = targetSets.exactProductConfigKeysByProductId.get(productId);
    if (!exactConfigs?.size) return false;
    const itemConfigKey = buildLocalCheckoutBenefitProductConfigKey(item.product_config || item, productId);
    return !!(itemConfigKey && exactConfigs.has(itemConfigKey));
  })();
  const matchesCategory = item.type !== 'combo'
    && productId > 0
    && (productCategoriesMap.get(productId) || []).some((categoryId) => targetSets.categoryIds.has(Number(categoryId || 0)));
  const matchesCombo = item.type === 'combo' && targetSets.comboIds.has(Number(item.combo_id || 0));
  if (normalizedScope === 'product') return matchesProduct;
  if (normalizedScope === 'category') return matchesCategory;
  if (normalizedScope === 'combo') return matchesCombo;
  return matchesProduct || matchesCategory || matchesCombo;
}

function calculateLocalCheckoutBenefitsDiscountAmount(price: unknown, discountType: unknown, discountValue: unknown, maxDiscountAmount: unknown = null) {
  const sourcePrice = Number(price || 0);
  if (!(sourcePrice > 0)) return 0;
  const normalizedType = asText(discountType).toLowerCase();
  const normalizedValue = Number(discountValue || 0);
  let amount = 0;
  if (normalizedType === 'percent') {
    if (!(normalizedValue > 0)) return 0;
    amount = sourcePrice * normalizedValue / 100;
  } else if (normalizedType === 'fixed') {
    if (!(normalizedValue > 0)) return 0;
    amount = normalizedValue;
  } else if (normalizedType === 'special_price') {
    amount = Math.max(0, sourcePrice - normalizedValue);
  } else {
    return 0;
  }
  const maxDiscount = maxDiscountAmount != null ? Number(maxDiscountAmount || 0) : null;
  if (Number.isFinite(maxDiscount) && Number(maxDiscount) > 0) amount = Math.min(amount, Number(maxDiscount));
  return roundPrice(Math.min(amount, sourcePrice));
}

function getLocalCheckoutBenefitsExcludedLineTotal(item: LocalCheckoutBenefitsPreviewItem) {
  const lineTotal = roundPrice(Math.max(0, Number(item.line_total || 0)));
  const excluded = roundPrice(Math.max(0, Number(item.benefits_excluded_line_total ?? item.discount_excluded_line_total ?? 0) || 0));
  return roundPrice(Math.min(lineTotal, excluded));
}

function getLocalCheckoutBenefitsEligibleLineTotal(item: LocalCheckoutBenefitsPreviewItem) {
  const lineTotal = roundPrice(Math.max(0, Number(item.line_total || 0)));
  return roundPrice(Math.max(0, lineTotal - getLocalCheckoutBenefitsExcludedLineTotal(item)));
}

function getLocalCheckoutBenefitsEligibleItemsTotal(items: LocalCheckoutBenefitsPreviewItem[]) {
  return roundPrice(items.reduce((sum, item) => sum + getLocalCheckoutBenefitsEligibleLineTotal(item), 0));
}

function toLocalCheckoutPriceUnits(value: unknown) {
  return Math.max(0, Math.round(roundPrice(Math.max(0, Number(value || 0))) * 100));
}

function fromLocalCheckoutPriceUnits(units: unknown) {
  return roundPrice(Math.max(0, Number(units || 0)) / 100);
}

function cloneLocalCheckoutBenefitsItems(items: LocalCheckoutBenefitsPreviewItem[]) {
  return items.map((item) => ({
    ...item,
    discount: item.discount ? { ...item.discount } : item.discount,
  }));
}

function applyLocalOrderDiscountAcrossItemsNoRemainder(items: LocalCheckoutBenefitsPreviewItem[], discountAmount: unknown) {
  const workingItems = cloneLocalCheckoutBenefitsItems(items);
  const eligible: Array<{ eligibleLineUnits: number; index: number; lineTotalUnits: number; position: number; shareUnits: number; fractionalRemainder: number }> = [];
  let baseItemsTotalUnits = 0;
  let fullItemsTotalUnits = 0;
  workingItems.forEach((item, index) => {
    const lineTotalUnits = toLocalCheckoutPriceUnits(item.line_total);
    const eligibleLineUnits = Math.min(lineTotalUnits, toLocalCheckoutPriceUnits(getLocalCheckoutBenefitsEligibleLineTotal(item)));
    item.line_total = fromLocalCheckoutPriceUnits(lineTotalUnits);
    fullItemsTotalUnits += lineTotalUnits;
    if (!(eligibleLineUnits > 0)) return;
    eligible.push({
      eligibleLineUnits,
      fractionalRemainder: 0,
      index,
      lineTotalUnits,
      position: eligible.length,
      shareUnits: 0,
    });
    baseItemsTotalUnits += eligibleLineUnits;
  });
  const fullItemsTotal = fromLocalCheckoutPriceUnits(fullItemsTotalUnits);
  if (!(baseItemsTotalUnits > 0) || !eligible.length) {
    return { discountAmount: 0, items: workingItems, itemsTotalAfterDiscount: fullItemsTotal };
  }
  const targetDiscountUnits = Math.min(toLocalCheckoutPriceUnits(discountAmount), baseItemsTotalUnits);
  if (!(targetDiscountUnits > 0)) {
    return { discountAmount: 0, items: workingItems, itemsTotalAfterDiscount: fullItemsTotal };
  }
  eligible.forEach((entry) => {
    const proportionalUnits = targetDiscountUnits * entry.eligibleLineUnits / baseItemsTotalUnits;
    const roundedDownUnits = Math.floor(proportionalUnits);
    entry.shareUnits = Math.min(entry.eligibleLineUnits, Math.max(0, roundedDownUnits));
    entry.fractionalRemainder = proportionalUnits - roundedDownUnits;
  });
  let appliedDiscountUnits = eligible.reduce((sum, entry) => sum + entry.shareUnits, 0);
  let remainingDiscountUnits = Math.max(0, targetDiscountUnits - appliedDiscountUnits);
  if (remainingDiscountUnits > 0) {
    const sorted = eligible.slice().sort((left, right) => (
      right.fractionalRemainder - left.fractionalRemainder
      || right.eligibleLineUnits - left.eligibleLineUnits
      || left.position - right.position
    ));
    while (remainingDiscountUnits > 0) {
      let progressed = false;
      for (const entry of sorted) {
        const capUnits = Math.max(0, entry.eligibleLineUnits - entry.shareUnits);
        if (!(capUnits > 0)) continue;
        entry.shareUnits += 1;
        remainingDiscountUnits -= 1;
        appliedDiscountUnits += 1;
        progressed = true;
        if (!(remainingDiscountUnits > 0)) break;
      }
      if (!progressed) break;
    }
  }
  eligible.forEach((entry) => {
    const nextLineUnits = Math.max(0, entry.lineTotalUnits - Math.min(entry.eligibleLineUnits, entry.shareUnits));
    workingItems[entry.index].line_total = fromLocalCheckoutPriceUnits(nextLineUnits);
  });
  return {
    discountAmount: fromLocalCheckoutPriceUnits(appliedDiscountUnits),
    items: workingItems,
    itemsTotalAfterDiscount: roundPrice(workingItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0)),
  };
}

function buildLocalCheckoutBenefitsPromoNotApplicableOutcome(
  previewItems: LocalCheckoutBenefitsPreviewItem[],
  itemsTotalBeforePromo: unknown,
  disabledReasonCode = 'PROMO_NOT_APPLICABLE',
): LocalCheckoutBenefitsOutcome {
  return {
    disabledReasonCode,
    discountAmount: 0,
    isApplicable: false,
    items: cloneLocalCheckoutBenefitsItems(previewItems),
    itemsTotalAfterPromo: roundPrice(Number(itemsTotalBeforePromo || 0)),
  };
}

function computeLocalCheckoutBenefitsDiscountOutcome(
  rule: Record<string, unknown> | null,
  previewItems: LocalCheckoutBenefitsPreviewItem[],
  productCategoriesMap: Map<number, number[]>,
): LocalCheckoutBenefitsOutcome {
  const items = cloneLocalCheckoutBenefitsItems(previewItems);
  const baseItemsTotal = roundPrice(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const eligibleItemsTotal = getLocalCheckoutBenefitsEligibleItemsTotal(items);
  if (!rule) {
    return { discountAmount: 0, errorCode: 'DISCOUNT_INVALID', isApplicable: false, items, itemsTotalAfterDiscount: baseItemsTotal };
  }
  if (rule.server_locked === true || Number(rule.server_locked || 0) === 1) {
    const errorCode = asText(rule.server_disabled_reason_code).toUpperCase() || 'DISCOUNT_NOT_AVAILABLE';
    return { discountAmount: 0, disabledReason: asText(rule.server_disabled_reason), errorCode, isApplicable: false, items, itemsTotalAfterDiscount: baseItemsTotal };
  }
  const applyTo = asText(rule.apply_to).toLowerCase() || 'order';
  const minOrderAmount = rule.min_order_amount != null ? Number(rule.min_order_amount || 0) : 0;
  if (applyTo === 'order') {
    if (minOrderAmount > 0 && eligibleItemsTotal < minOrderAmount) {
      return { discountAmount: 0, errorCode: 'DISCOUNT_NOT_APPLICABLE', isApplicable: false, items, itemsTotalAfterDiscount: baseItemsTotal };
    }
    const orderDiscountAmount = calculateLocalCheckoutBenefitsDiscountAmount(
      eligibleItemsTotal,
      rule.discount_type,
      rule.discount_value,
      rule.max_discount_amount,
    );
    const applied = applyLocalOrderDiscountAcrossItemsNoRemainder(items, orderDiscountAmount);
    if (!(Number(applied.discountAmount || 0) > 0)) {
      return { discountAmount: 0, errorCode: 'DISCOUNT_NOT_APPLICABLE', isApplicable: false, items, itemsTotalAfterDiscount: baseItemsTotal };
    }
    return {
      discountAmount: roundPrice(applied.discountAmount),
      isApplicable: true,
      items: applied.items,
      itemsTotalAfterDiscount: roundPrice(applied.itemsTotalAfterDiscount),
    };
  }
  const targetSets = buildLocalCheckoutBenefitsTargetSets(rule.target_sets);
  let itemsDiscount = 0;
  items.forEach((item) => {
    if (!matchLocalCheckoutBenefitsTargetScope(targetSets, item, productCategoriesMap, applyTo === 'combo' ? 'combo' : applyTo || 'any')) return;
    const itemDiscount = calculateLocalCheckoutBenefitsDiscountAmount(
      getLocalCheckoutBenefitsEligibleLineTotal(item),
      rule.discount_type,
      rule.discount_value,
      rule.max_discount_amount,
    );
    if (!(itemDiscount > 0)) return;
    item.line_total = roundPrice(Math.max(0, Number(item.line_total || 0) - itemDiscount));
    itemsDiscount += itemDiscount;
  });
  if (!(itemsDiscount > 0)) {
    return { discountAmount: 0, errorCode: 'DISCOUNT_NOT_APPLICABLE', isApplicable: false, items, itemsTotalAfterDiscount: baseItemsTotal };
  }
  return {
    discountAmount: roundPrice(itemsDiscount),
    isApplicable: true,
    items,
    itemsTotalAfterDiscount: roundPrice(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)),
  };
}

function computeLocalCheckoutBenefitsPromoOutcome(
  rule: Record<string, unknown> | null,
  previewItems: LocalCheckoutBenefitsPreviewItem[],
  itemsTotalBeforePromo: unknown,
  productCategoriesMap: Map<number, number[]>,
): LocalCheckoutBenefitsOutcome {
  const items = cloneLocalCheckoutBenefitsItems(previewItems);
  const baseItemsTotal = roundPrice(Number(itemsTotalBeforePromo != null
    ? itemsTotalBeforePromo
    : items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)));
  const eligibleItemsTotal = getLocalCheckoutBenefitsEligibleItemsTotal(items);
  if (!rule) return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal, 'PROMO_INVALID');
  if (rule.server_locked === true || Number(rule.server_locked || 0) === 1) {
    return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(
      items,
      baseItemsTotal,
      asText(rule.server_disabled_reason_code).toUpperCase() || 'PROMO_NOT_AVAILABLE',
    );
  }
  const runtimeConfig = rule.runtime_config && typeof rule.runtime_config === 'object'
    ? rule.runtime_config as Record<string, unknown>
    : {};
  const rewardType = asText(runtimeConfig.reward_type || 'discount').toLowerCase() || 'discount';
  const productRewardType = asText(runtimeConfig.product_reward_type || 'gift').toLowerCase() || 'gift';
  const applyTo = asText(runtimeConfig.apply_to || 'order').toLowerCase() || 'order';
  const minOrderAmount = runtimeConfig.min_order_amount != null
    ? Number(runtimeConfig.min_order_amount || 0)
    : (rule.min_order_amount != null ? Number(rule.min_order_amount || 0) : 0);
  if (minOrderAmount > 0 && eligibleItemsTotal < minOrderAmount) {
    return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
  }
  const targetSets = buildLocalCheckoutBenefitsTargetSets(rule.target_sets);
  if (rewardType === 'discount') {
    if (applyTo === 'order') {
      const promoDiscountAmount = calculateLocalCheckoutBenefitsDiscountAmount(
        eligibleItemsTotal,
        runtimeConfig.discount_type,
        runtimeConfig.discount_value,
        runtimeConfig.max_discount_amount,
      );
      const applied = applyLocalOrderDiscountAcrossItemsNoRemainder(items, promoDiscountAmount);
      if (!(Number(applied.discountAmount || 0) > 0)) return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
      return {
        disabledReasonCode: '',
        discountAmount: roundPrice(applied.discountAmount),
        isApplicable: true,
        items: applied.items,
        itemsTotalAfterPromo: roundPrice(applied.itemsTotalAfterDiscount),
      };
    }
    let promoItemsDiscount = 0;
    items.forEach((item) => {
      if (!matchLocalCheckoutBenefitsTargetScope(targetSets, item, productCategoriesMap, applyTo || 'any')) return;
      const itemDiscount = calculateLocalCheckoutBenefitsDiscountAmount(
        getLocalCheckoutBenefitsEligibleLineTotal(item),
        runtimeConfig.discount_type,
        runtimeConfig.discount_value,
        runtimeConfig.max_discount_amount,
      );
      if (!(itemDiscount > 0)) return;
      item.line_total = roundPrice(Math.max(0, Number(item.line_total || 0) - itemDiscount));
      promoItemsDiscount += itemDiscount;
    });
    if (!(promoItemsDiscount > 0)) return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
    return {
      disabledReasonCode: '',
      discountAmount: roundPrice(promoItemsDiscount),
      isApplicable: true,
      items,
      itemsTotalAfterPromo: roundPrice(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)),
    };
  }
  if (productRewardType === 'gift') {
    const hasTargets = targetSets.anyProductIds.size > 0
      || targetSets.categoryIds.size > 0
      || targetSets.comboIds.size > 0
      || targetSets.exactProductConfigKeysByProductId.size > 0;
    return hasTargets
      ? { disabledReasonCode: '', discountAmount: 0, isApplicable: true, items, itemsTotalAfterPromo: baseItemsTotal }
      : buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
  }
  let rewardItemsDiscount = 0;
  items.forEach((item) => {
    if (!matchLocalCheckoutBenefitsTargetScope(targetSets, item, productCategoriesMap, 'any')) return;
    const itemDiscount = calculateLocalCheckoutBenefitsDiscountAmount(
      getLocalCheckoutBenefitsEligibleLineTotal(item),
      runtimeConfig.discount_type,
      runtimeConfig.discount_value,
      runtimeConfig.max_discount_amount,
    );
    if (!(itemDiscount > 0)) return;
    item.line_total = roundPrice(Math.max(0, Number(item.line_total || 0) - itemDiscount));
    rewardItemsDiscount += itemDiscount;
  });
  if (!(rewardItemsDiscount > 0)) return buildLocalCheckoutBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
  return {
    disabledReasonCode: '',
    discountAmount: roundPrice(rewardItemsDiscount),
    isApplicable: true,
    items,
    itemsTotalAfterPromo: roundPrice(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)),
  };
}

function buildLocalCheckoutBenefitsLineTotalsByCartKey(items: LocalCheckoutBenefitsPreviewItem[]) {
  return items.reduce((acc, item) => {
    const cartKey = asText(item.cart_key);
    if (!cartKey) return acc;
    acc[cartKey] = roundPrice(item.line_total);
    return acc;
  }, {} as Record<string, number>);
}

function buildLocalCheckoutBenefitsSummarySnapshot(
  preview: CheckoutBenefitsPreviewData,
  subtotalBeforeDiscount: unknown,
  itemsTotalAfterBenefits: unknown,
  discountBreakdown: Array<Record<string, unknown>>,
) {
  const subtotal = roundPrice(subtotalBeforeDiscount);
  const itemsTotal = roundPrice(itemsTotalAfterBenefits);
  const delivery = roundPrice(preview.summary?.delivery);
  return {
    delivery,
    discount_breakdown: discountBreakdown
      .filter((entry) => Number(entry.amount || 0) > 0)
      .map((entry) => ({
        amount: roundPrice(entry.amount),
        key: asText(entry.key),
        promo_code: entry.promo_code ? normalizePromoCode(entry.promo_code) : null,
        source_kind: asText(entry.source_kind).toLowerCase() || null,
        title: asText(entry.title) || 'Discount',
      })),
    discount_total: roundPrice(Math.max(0, subtotal - itemsTotal)),
    items_total: itemsTotal,
    subtotal,
    total: roundPrice(itemsTotal + delivery),
  };
}

function buildLocalCheckoutBenefitsPreviewData(
  preview: CheckoutBenefitsPreviewData | null,
  request: CheckoutBenefitsPreviewRequest,
  selection: CheckoutBenefitsSelection,
  snapshot: MobileCatalogSnapshot | null,
) {
  if (!preview) return null;
  const clientCalculation = preview.client_calculation && typeof preview.client_calculation === 'object'
    ? preview.client_calculation as Record<string, unknown>
    : null;
  const discountRules = Array.isArray(clientCalculation?.discount_rules)
    ? clientCalculation.discount_rules.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    : [];
  const promoRules = Array.isArray(clientCalculation?.promo_rules)
    ? clientCalculation.promo_rules.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    : [];
  if (!(Number(clientCalculation?.version || 0) >= 2) || (!discountRules.length && !promoRules.length)) return null;

  const discountKey = selection.discountId && selection.discountSource
    ? `${selection.discountSource}:${selection.discountId}`
    : '';
  const promoKey = buildSelectedPromoKey(selection, preview);
  const baseItems = buildLocalCheckoutBenefitsPreviewItems(request);
  const baseItemsTotal = roundPrice(baseItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const subtotalBeforeDiscount = roundPrice(baseItems.reduce((sum, item) => {
    const originalLineTotal = Number(item.discount?.original_line_total || item.line_total || 0);
    return sum + Math.max(Number(item.line_total || 0), originalLineTotal);
  }, 0));
  const productCategoriesMap = buildLocalCheckoutBenefitsProductCategoriesMap(snapshot);
  const discountRuleOutcomes = new Map(
    discountRules
      .map((rule) => [asText(rule.selection_key), computeLocalCheckoutBenefitsDiscountOutcome(rule, baseItems, productCategoriesMap)] as const)
      .filter(([selectionKey]) => !!selectionKey),
  );
  const selectedDiscountRule = discountRules.find((rule) => asText(rule.selection_key) === discountKey) || null;
  const selectedDiscountOutcome = discountKey ? (discountRuleOutcomes.get(discountKey) || null) : null;
  const hasSelectedDiscount = selectedDiscountOutcome?.isApplicable === true;
  const promoSourceItems = hasSelectedDiscount
    ? selectedDiscountOutcome.items
    : baseItems;
  const promoSourceItemsTotal = hasSelectedDiscount
    ? Number(selectedDiscountOutcome.itemsTotalAfterDiscount || baseItemsTotal)
    : baseItemsTotal;
  const promoRuleOutcomes = new Map(
    promoRules
      .map((rule) => [asText(rule.selection_key), computeLocalCheckoutBenefitsPromoOutcome(rule, promoSourceItems, promoSourceItemsTotal, productCategoriesMap)] as const)
      .filter(([selectionKey]) => !!selectionKey),
  );
  const selectedPromoRule = promoRules.find((rule) => asText(rule.selection_key) === promoKey) || null;
  const selectedPromoOutcome = promoKey ? (promoRuleOutcomes.get(promoKey) || null) : null;
  const canCombineSelectedBenefits = !hasSelectedDiscount || !selectedPromoRule || !selectedDiscountRule
    ? true
    : (isCheckoutBenefitsStackable(selectedDiscountRule) && isCheckoutBenefitsStackable(selectedPromoRule));
  const hasSelectedPromo = selectedPromoOutcome?.isApplicable === true && canCombineSelectedBenefits;
  const finalItems = hasSelectedPromo
    ? selectedPromoOutcome.items
    : (hasSelectedDiscount ? promoSourceItems : baseItems);
  const finalItemsTotal = hasSelectedPromo
    ? Number(selectedPromoOutcome.itemsTotalAfterPromo || promoSourceItemsTotal)
    : (hasSelectedDiscount ? promoSourceItemsTotal : baseItemsTotal);

  const discountCards = Array.isArray(preview.discounts)
    ? preview.discounts.map((entry) => {
      const selectionKey = buildSelectionKeyFromDiscount(entry);
      const outcome = selectionKey ? (discountRuleOutcomes.get(selectionKey) || null) : null;
      const isApplicable = outcome ? outcome.isApplicable === true : entry?.is_applicable !== false;
      const disabledReasonCode = outcome?.errorCode
        ? asText(outcome.errorCode).toUpperCase()
        : asText(entry?.disabled_reason_code).toUpperCase();
      return {
        ...entry,
        disabled_reason: isApplicable ? '' : (asText(outcome?.disabledReason) || asText(entry?.disabled_reason)),
        disabled_reason_code: isApplicable ? '' : disabledReasonCode,
        is_applicable: isApplicable,
        is_selected: isApplicable && selectionKey === discountKey,
      };
    })
    : [];
  const promoCards = Array.isArray(preview.promo_codes)
    ? preview.promo_codes.map((entry) => {
      const selectionKey = buildSelectionKeyFromPromo(entry);
      const outcome = selectionKey ? (promoRuleOutcomes.get(selectionKey) || null) : null;
      const isApplicable = outcome ? outcome.isApplicable === true : entry?.is_applicable !== false;
      const disabledReasonCode = outcome?.disabledReasonCode
        ? asText(outcome.disabledReasonCode).toUpperCase()
        : asText(entry?.disabled_reason_code).toUpperCase();
      return {
        ...entry,
        disabled_reason: isApplicable ? '' : (asText(outcome?.disabledReason) || asText(entry?.disabled_reason)),
        disabled_reason_code: isApplicable ? '' : disabledReasonCode,
        is_applicable: isApplicable,
        is_selected: isApplicable && canCombineSelectedBenefits && selectionKey === promoKey,
      };
    })
    : [];

  const discountBreakdown: Array<Record<string, unknown>> = [];
  if (hasSelectedDiscount && Number(selectedDiscountOutcome?.discountAmount || 0) > 0) {
    const selectedCard = discountCards.find((entry) => entry?.is_selected) || null;
    discountBreakdown.push({
      amount: roundPrice(selectedDiscountOutcome.discountAmount),
      key: `discount_${Number(selectedDiscountRule?.source_discount_id || selectedDiscountRule?.selection_id || 0) || 'selected'}`,
      promo_code: null,
      source_kind: asText(selectedDiscountRule?.source || 'discount').toLowerCase() || 'discount',
      title: asText(selectedCard?.title) || 'Discount',
    });
  }
  if (hasSelectedPromo && Number(selectedPromoOutcome?.discountAmount || 0) > 0) {
    const selectedCard = promoCards.find((entry) => entry?.is_selected) || null;
    discountBreakdown.push({
      amount: roundPrice(selectedPromoOutcome.discountAmount),
      key: `promo_${Number(selectedPromoRule?.selection_id || 0) || 'selected'}`,
      promo_code: normalizePromoCode(selectedCard?.code || selection.promoCode),
      source_kind: asText(selectedPromoRule?.source || 'promo_code').toLowerCase() || 'promo_code',
      title: asText(selectedCard?.title || selectedCard?.code) || 'Promo',
    });
  }

  return {
    ...preview,
    discounts: discountCards,
    local_line_totals_by_cart_key: buildLocalCheckoutBenefitsLineTotalsByCartKey(finalItems),
    promo_codes: promoCards,
    summary: buildLocalCheckoutBenefitsSummarySnapshot(preview, subtotalBeforeDiscount, finalItemsTotal, discountBreakdown),
  } satisfies CheckoutBenefitsPreviewData;
}

function getPreviewSummaryState(preview: CheckoutBenefitsPreviewData | null, selection: CheckoutBenefitsSelection) {
  const summaryStates = preview?.client_calculation?.summary_states && typeof preview.client_calculation.summary_states === 'object'
    ? preview.client_calculation.summary_states as Record<string, unknown>
    : null;
  if (!summaryStates) return null;
  const discountKey = selection.discountId && selection.discountSource
    ? `${selection.discountSource}:${selection.discountId}`
    : '';
  const promoKey = buildSelectedPromoKey(selection, preview);
  const stateKey = discountKey && promoKey
    ? `${discountKey}|${promoKey}`
    : discountKey || promoKey || '__base__';
  const summary = summaryStates[stateKey]
    || (discountKey ? summaryStates[discountKey] : null)
    || (promoKey ? summaryStates[promoKey] : null)
    || summaryStates.__base__
    || null;
  return summary && typeof summary === 'object' ? summary as Record<string, unknown> : null;
}

function clonePreviewSummary(summary: Record<string, unknown> | null) {
  if (!summary) return null;
  return {
    delivery: Number(summary.delivery || 0),
    discount_breakdown: Array.isArray(summary.discount_breakdown)
      ? summary.discount_breakdown.map((entry) => ({ ...(entry as Record<string, unknown>) }))
      : [],
    discount_total: Number(summary.discount_total || 0),
    items_total: Number(summary.items_total || 0),
    subtotal: Number(summary.subtotal || 0),
    total: Number(summary.total || 0),
  };
}

function derivePreviewFromSelection(preview: CheckoutBenefitsPreviewData | null, selection: CheckoutBenefitsSelection) {
  if (!preview) return null;
  const discountKey = selection.discountId && selection.discountSource
    ? `${selection.discountSource}:${selection.discountId}`
    : '';
  const promoKey = buildSelectedPromoKey(selection, preview);
  const summary = getPreviewSummaryState(preview, selection);
  return {
    ...preview,
    discounts: Array.isArray(preview.discounts)
      ? preview.discounts.map((entry) => ({
        ...entry,
        is_selected: entry?.is_applicable !== false
          && !asText(entry?.disabled_reason_code)
          && buildSelectionKeyFromDiscount(entry) === discountKey,
      }))
      : [],
    promo_codes: Array.isArray(preview.promo_codes)
      ? preview.promo_codes.map((entry) => ({
        ...entry,
        is_selected: entry?.is_applicable !== false
          && !asText(entry?.disabled_reason_code)
          && buildSelectionKeyFromPromo(entry) === promoKey,
      }))
      : [],
    summary: summary ? clonePreviewSummary(summary) : preview.summary || null,
  } satisfies CheckoutBenefitsPreviewData;
}

function findPromoCardByCode(preview: CheckoutBenefitsPreviewData | null, code: string) {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode || !Array.isArray(preview?.promo_codes)) return null;
  return preview.promo_codes.find((item) => normalizePromoCode(item?.code) === normalizedCode) || null;
}

function toBenefitArray(value: unknown): CustomerBenefitCard[] {
  return Array.isArray(value) ? value as CustomerBenefitCard[] : [];
}

function buildCustomerBenefitsFromPreview(preview: CheckoutBenefitsPreviewData | null): CustomerBenefits | null {
  if (!preview) return null;
  return {
    completed: toBenefitArray(preview.completed),
    discounts: toBenefitArray(preview.discounts),
    gifts: toBenefitArray(preview.gifts),
    progress: toBenefitArray(preview.progress),
    promo_codes: toBenefitArray(preview.promo_codes),
  };
}

function getBenefitCardIdentity(kind: string, item: CustomerBenefitCard, index: number) {
  if (kind === 'discounts') {
    const selectionKey = buildSelectionKeyFromDiscount(item);
    if (selectionKey) return selectionKey;
  }
  if (kind === 'promo_codes') {
    const selectionKey = buildSelectionKeyFromPromo(item);
    if (selectionKey) return selectionKey;
    const code = normalizePromoCode(item.code);
    if (code) return `promo_code:${code}`;
  }

  const id = asText(item.id);
  if (id) return `${kind}:id:${id}`;
  const rewardId = asText(item.reward_id);
  if (rewardId) return `${kind}:reward:${rewardId}`;
  const discountId = asText(item.discount_id);
  if (discountId) return `${kind}:discount:${discountId}`;
  const title = asText(item.title);
  return title ? `${kind}:title:${title}` : `${kind}:index:${index}`;
}

function mergeBenefitCards(
  kind: string,
  primary: CustomerBenefitCard[] | undefined,
  secondary: CustomerBenefitCard[] | undefined,
) {
  const result = new Map<string, CustomerBenefitCard>();
  [...toBenefitArray(primary), ...toBenefitArray(secondary)].forEach((item, index) => {
    const key = getBenefitCardIdentity(kind, item, index);
    if (!result.has(key)) result.set(key, item);
  });
  return Array.from(result.values());
}

function getCheckoutBenefitsCounts(preview: CheckoutBenefitsPreviewData | null, benefits: CustomerBenefits | null) {
  const previewBenefits = buildCustomerBenefitsFromPreview(preview);
  const discounts = mergeBenefitCards('discounts', previewBenefits?.discounts, benefits?.discounts);
  const gifts = mergeBenefitCards('gifts', previewBenefits?.gifts, benefits?.gifts);
  const progress = mergeBenefitCards('progress', previewBenefits?.progress, benefits?.progress);
  const promoCodes = mergeBenefitCards('promo_codes', previewBenefits?.promo_codes, benefits?.promo_codes);
  return {
    discounts: discounts.length,
    gifts: gifts.length,
    progress: progress.length,
    promocodes: promoCodes.length,
    total: discounts.length + gifts.length + progress.length + promoCodes.length,
  };
}

function normalizeCachedBenefits(value: unknown): CheckoutBenefitsCache | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CheckoutBenefitsCache>;
  return {
    basePreview: source.basePreview && typeof source.basePreview === 'object' ? source.basePreview as CheckoutBenefitsPreviewData : null,
    currentSelection: normalizeSelection(source.currentSelection),
    preview: source.preview && typeof source.preview === 'object' ? source.preview as CheckoutBenefitsPreviewData : null,
    sourceBenefits: source.sourceBenefits && typeof source.sourceBenefits === 'object' ? source.sourceBenefits as CustomerBenefits : null,
    updatedAt: asText(source.updatedAt),
  };
}

async function pruneCheckoutBenefitsStorage(token = '', keepKey = '') {
  const prefix = getCheckoutBenefitsStoragePrefix(token);
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const removable = Array.from(keys)
    .filter((key) => key.startsWith(prefix) && key !== keepKey);
  if (!removable.length) return;
  removable.forEach((key) => {
    checkoutBenefitsMemory.delete(key);
  });
  await AsyncStorage.multiRemove(removable).catch(() => undefined);
}

export async function clearCheckoutBenefitsCacheForToken(token: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return;
  const prefix = getCheckoutBenefitsStoragePrefix(safeToken);
  for (const key of checkoutBenefitsMemory.keys()) {
    if (key.startsWith(prefix)) checkoutBenefitsMemory.delete(key);
  }
  for (const key of checkoutBenefitsRefreshInflight.keys()) {
    if (key.startsWith(prefix)) checkoutBenefitsRefreshInflight.delete(key);
  }
  await pruneCheckoutBenefitsStorage(safeToken);
}

async function readCachedCheckoutBenefits(token: string, request: CheckoutBenefitsPreviewRequest) {
  const safeToken = String(token || '').trim();
  if (!isCustomerCacheTokenActive(safeToken)) return null;
  const key = getCheckoutBenefitsStorageKey(safeToken, request);
  const memory = checkoutBenefitsMemory.get(key);
  if (memory) return memory;
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return null;
  let cached: CheckoutBenefitsCache | null = null;
  try {
    cached = normalizeCachedBenefits(JSON.parse(raw));
  } catch {
    cached = null;
  }
  if (cached) checkoutBenefitsMemory.set(key, cached);
  return cached;
}

async function saveCachedCheckoutBenefits(token: string, request: CheckoutBenefitsPreviewRequest, value: CheckoutBenefitsCache) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return value;
  const key = getCheckoutBenefitsStorageKey(safeToken, request);
  const normalized: CheckoutBenefitsCache = {
    basePreview: value.basePreview || null,
    currentSelection: normalizeSelection(value.currentSelection),
    preview: null,
    sourceBenefits: value.basePreview || value.preview ? null : value.sourceBenefits || null,
    updatedAt: asText(value.updatedAt) || new Date().toISOString(),
  };
  const memoryValue: CheckoutBenefitsCache = {
    ...normalized,
    preview: value.preview || normalized.basePreview,
    sourceBenefits: value.sourceBenefits || buildCustomerBenefitsFromPreview(value.preview || normalized.basePreview) || null,
  };
  if (!isCustomerCacheTokenActive(safeToken)) return normalized;
  checkoutBenefitsMemory.set(key, memoryValue);
  await pruneCheckoutBenefitsStorage(safeToken, key).catch(() => undefined);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(normalized));
  } catch (error) {
    if (!isStorageFullError(error)) throw error;
    await pruneCheckoutBenefitsStorage().catch(() => undefined);
    checkoutBenefitsMemory.set(key, memoryValue);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(normalized));
    } catch (retryError) {
      if (!isStorageFullError(retryError)) throw retryError;
    }
  }
  return normalized;
}

async function saveCheckoutBenefitsSelectionSafely(selection: CheckoutBenefitsSelection, token = '') {
  try {
    await saveCheckoutBenefitsSelection(selection);
    return true;
  } catch (error) {
    if (!isStorageFullError(error)) throw error;
    await pruneCheckoutBenefitsStorage(token).catch(() => undefined);
    await pruneCheckoutBenefitsStorage().catch(() => undefined);
    try {
      await saveCheckoutBenefitsSelection(selection);
      return true;
    } catch (retryError) {
      if (!isStorageFullError(retryError)) throw retryError;
      return false;
    }
  }
}

async function resolveCheckoutBenefitsContext(context: CheckoutBenefitsContext = {}) {
  const passport = await readCachedCustomerPassport();
  const token = passport?.token || '';
  const selection = normalizeSelection(context.selection || await readCheckoutBenefitsSelection().catch(() => emptySelection));
  const fulfillmentSelection = context.fulfillmentSelection || await readFulfillmentSelection().catch(() => null);
  const cartLines = Array.isArray(context.cartLines) ? context.cartLines : await readCartLines().catch(() => []);
  const catalogSnapshot = context.catalogSnapshot || await readCachedMobileCatalogSnapshot().catch(() => null);
  const request = buildCheckoutBenefitsPreviewRequestFromContext({
    cartLines,
    catalogSnapshot,
    fulfillmentSelection,
  });
  return {
    cartLines,
    catalogSnapshot,
    fulfillmentSelection,
    passport,
    request,
    selection,
    token,
  };
}

function buildCheckoutBenefitsStateFromCache(
  resolved: Awaited<ReturnType<typeof resolveCheckoutBenefitsContext>>,
  cachedState: CheckoutBenefitsCache | null,
) {
  const sourcePreview = cachedState?.basePreview || cachedState?.preview || null;
  const preview = buildLocalCheckoutBenefitsPreviewData(sourcePreview || null, resolved.request, resolved.selection, resolved.catalogSnapshot)
    || (cachedState && areCheckoutBenefitsSelectionsEqual(cachedState.currentSelection, resolved.selection)
      ? cachedState.preview || sourcePreview
      : derivePreviewFromSelection(sourcePreview, resolved.selection));
  const sourceBenefits = cachedState?.sourceBenefits || buildCustomerBenefitsFromPreview(sourcePreview || preview) || null;
  return {
    counts: getCheckoutBenefitsCounts(preview, sourceBenefits),
    currentSelection: resolved.selection,
    preview,
    request: resolved.request,
    sourceBenefits,
  } satisfies CheckoutBenefitsState;
}

async function saveLocalCheckoutBenefitsSelection(
  resolved: Awaited<ReturnType<typeof resolveCheckoutBenefitsContext>>,
  selection: CheckoutBenefitsSelection,
) {
  const nextSelection = normalizeSelection(selection);
  await saveCheckoutBenefitsSelectionSafely(nextSelection, resolved.token);
  if (!resolved.token) {
    return {
      counts: getCheckoutBenefitsCounts(null, null),
      currentSelection: nextSelection,
      preview: null,
      request: resolved.request,
      sourceBenefits: null,
    } satisfies CheckoutBenefitsState;
  }

  const cachedState = await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null);
  const sourcePreview = cachedState?.preview || cachedState?.basePreview || null;
  const basePreview = buildLocalCheckoutBenefitsPreviewData(sourcePreview || null, resolved.request, emptySelection, resolved.catalogSnapshot)
    || sourcePreview
    || null;
  const preview = buildLocalCheckoutBenefitsPreviewData(sourcePreview || basePreview, resolved.request, nextSelection, resolved.catalogSnapshot)
    || derivePreviewFromSelection(basePreview, nextSelection);
  const sourceBenefits = cachedState?.sourceBenefits || buildCustomerBenefitsFromPreview(preview || basePreview) || null;
  const cachedValue: CheckoutBenefitsCache = {
    basePreview,
    currentSelection: nextSelection,
    preview,
    sourceBenefits,
    updatedAt: cachedState?.updatedAt || new Date().toISOString(),
  };
  await saveCachedCheckoutBenefits(resolved.token, resolved.request, cachedValue);
  return {
    counts: getCheckoutBenefitsCounts(preview, sourceBenefits),
    currentSelection: nextSelection,
    preview,
    request: resolved.request,
    sourceBenefits,
  } satisfies CheckoutBenefitsState;
}

export function buildCheckoutBenefitsPreviewRequestForLines(
  cartLines: CartLine[],
  fulfillmentSelection: FulfillmentSelection | null,
  catalogSnapshot: MobileCatalogSnapshot | null = null,
) {
  return buildCheckoutBenefitsPreviewRequestFromContext({
    cartLines,
    catalogSnapshot,
    fulfillmentSelection,
  });
}

export async function cacheCheckoutBenefitsPreviewForLines(
  preview: CheckoutBenefitsPreviewData | null,
  context: CheckoutBenefitsContext = {},
) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  if (!resolved.token || !preview) return null;
  const nextSelection = normalizeSelection(resolved.selection);
  const sourcePreview = preview;
  const basePreview = buildLocalCheckoutBenefitsPreviewData(sourcePreview, resolved.request, emptySelection, resolved.catalogSnapshot)
    || sourcePreview
    || null;
  const derivedPreview = buildLocalCheckoutBenefitsPreviewData(sourcePreview || basePreview, resolved.request, nextSelection, resolved.catalogSnapshot)
    || derivePreviewFromSelection(basePreview, nextSelection)
    || sourcePreview;
  const cachedState = await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null);
  const sourceBenefits = cachedState?.sourceBenefits || buildCustomerBenefitsFromPreview(derivedPreview || basePreview) || null;
  const cachedValue: CheckoutBenefitsCache = {
    basePreview,
    currentSelection: nextSelection,
    preview: derivedPreview,
    sourceBenefits,
    updatedAt: cachedState?.updatedAt || new Date().toISOString(),
  };
  await saveCheckoutBenefitsSelectionSafely(nextSelection, resolved.token);
  await saveCachedCheckoutBenefits(resolved.token, resolved.request, cachedValue);
  return derivedPreview;
}

export function deriveCheckoutBenefitsPreviewForLines(
  preview: CheckoutBenefitsPreviewData | null,
  selection: CheckoutBenefitsSelection,
  cartLines: CartLine[],
  fulfillmentSelection: FulfillmentSelection | null,
  catalogSnapshot: MobileCatalogSnapshot | null = null,
) {
  if (!preview) return null;
  const normalizedSelection = normalizeSelection(selection);
  const request = buildCheckoutBenefitsPreviewRequestFromContext({
    cartLines,
    catalogSnapshot,
    fulfillmentSelection,
  });
  return buildLocalCheckoutBenefitsPreviewData(preview, request, normalizedSelection, catalogSnapshot);
}

export function getCheckoutBenefitsSelectionKeyFromDiscount(item: CustomerBenefitCard) {
  return buildSelectionKeyFromDiscount(item);
}

export function getCheckoutBenefitsSelectionKeyFromPromo(item: CustomerBenefitCard) {
  return buildSelectionKeyFromPromo(item);
}

export function isCheckoutBenefitsStackable(item: CustomerBenefitCard | null | undefined) {
  return item?.is_stackable === true || Number(item?.is_stackable || 0) === 1;
}

export function findSelectedCheckoutBenefitDiscount(preview: CheckoutBenefitsPreviewData | null) {
  return Array.isArray(preview?.discounts)
    ? preview.discounts.find((item) => item?.is_selected === true) || null
    : null;
}

export function findSelectedCheckoutBenefitPromo(preview: CheckoutBenefitsPreviewData | null) {
  return Array.isArray(preview?.promo_codes)
    ? preview.promo_codes.find((item) => item?.is_selected === true) || null
    : null;
}

export async function readCheckoutBenefitsState(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const cachedState = resolved.token ? await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null) : null;
  return buildCheckoutBenefitsStateFromCache(resolved, cachedState);
}

export async function refreshCheckoutBenefitsState(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  if (!resolved.token) {
    return {
      counts: getCheckoutBenefitsCounts(null, null),
      currentSelection: resolved.selection,
      preview: null,
      request: resolved.request,
      sourceBenefits: null,
    } satisfies CheckoutBenefitsState;
  }

  const cachedState = await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null);
  const previewResult = await fetchCheckoutBenefitsPreview(resolved.token, {
    ...resolved.request,
    promo_code: null,
    selected_discount_id: null,
    selected_discount_source: null,
    selected_promo_reward_id: null,
    selected_promo_source: null,
  })
    .then((value) => ({ fresh: true, value }))
    .catch(() => ({ fresh: false, value: cachedState?.basePreview || cachedState?.preview || null }));
  const basePreview = previewResult.value || null;

  const derivedPreview = derivePreviewFromSelection(basePreview, resolved.selection);
  const sourceBenefits = buildCustomerBenefitsFromPreview(derivedPreview || basePreview)
    || cachedState?.sourceBenefits
    || null;
  const cachedValue: CheckoutBenefitsCache = {
    basePreview,
    currentSelection: resolved.selection,
    preview: derivedPreview,
    sourceBenefits,
    updatedAt: previewResult.fresh
      ? new Date().toISOString()
      : cachedState?.updatedAt || new Date().toISOString(),
  };
  await saveCachedCheckoutBenefits(resolved.token, resolved.request, cachedValue);
  return {
    counts: getCheckoutBenefitsCounts(derivedPreview, sourceBenefits),
    currentSelection: resolved.selection,
    preview: derivedPreview,
    request: resolved.request,
    sourceBenefits,
  } satisfies CheckoutBenefitsState;
}

export async function ensureCheckoutBenefitsState(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  if (!resolved.token) {
    return {
      counts: getCheckoutBenefitsCounts(null, null),
      currentSelection: resolved.selection,
      preview: null,
      request: resolved.request,
      sourceBenefits: null,
    } satisfies CheckoutBenefitsState;
  }

  const cachedState = await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null);
  const cachedView = buildCheckoutBenefitsStateFromCache(resolved, cachedState);
  if (isFreshCheckoutBenefitsCache(cachedState)) return cachedView;

  const refreshKey = getCheckoutBenefitsStorageKey(resolved.token, resolved.request);
  const inflight = checkoutBenefitsRefreshInflight.get(refreshKey);
  if (inflight) return inflight;
  const refreshPromise = refreshCheckoutBenefitsState({
    ...context,
    selection: resolved.selection,
  }).finally(() => {
    checkoutBenefitsRefreshInflight.delete(refreshKey);
  });
  checkoutBenefitsRefreshInflight.set(refreshKey, refreshPromise);
  return refreshPromise;
}

export async function applyCheckoutDiscountSelection(item: CustomerBenefitCard, context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const currentState = await readCheckoutBenefitsState({
    ...context,
    selection: resolved.selection,
  }).catch(() => null);
  const discountId = Number((asText(item.source).toLowerCase() === 'reward_discount' ? item.reward_id || item.id : item.id) || 0);
  if (!(discountId > 0)) {
    return readCheckoutBenefitsState(context);
  }
  const discountSource = asText(item.source).toLowerCase() === 'reward_discount' ? 'reward_discount' : 'discount';
  const nextSelection = normalizeSelection({
    ...resolved.selection,
    discountId,
    discountSource,
  });
  const selectedPromo = findSelectedCheckoutBenefitPromo(currentState?.preview || null);
  if (selectedPromo && !(isCheckoutBenefitsStackable(item) && isCheckoutBenefitsStackable(selectedPromo))) {
    nextSelection.promoCode = '';
    nextSelection.promoRewardId = null;
    nextSelection.promoSource = null;
  }
  return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
}

export async function applyCheckoutPromoCode(code: string, context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const safeCode = normalizePromoCode(code);
  if (!safeCode) {
    const nextSelection = normalizeSelection({
      ...resolved.selection,
      promoCode: '',
      promoRewardId: null,
      promoSource: null,
    });
    return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
  }
  const passport = resolved.passport;
  if (!passport?.token) {
    throw new Error('UNAUTHORIZED');
  }

  const currentState = await readCheckoutBenefitsState({
    ...context,
    selection: resolved.selection,
  }).catch(() => null);
  const cachedPromo = findPromoCardByCode(currentState?.preview || null, safeCode);
  if (cachedPromo) {
    if (cachedPromo.is_applicable === false || asText(cachedPromo.disabled_reason_code)) {
      throw new Error(asText(cachedPromo.disabled_reason_code) || 'PROMO_NOT_APPLICABLE');
    }
    const nextSelection = normalizeSelection({
      ...resolved.selection,
      promoCode: safeCode,
      promoRewardId: null,
      promoSource: 'promo_code',
    });
    const selectedDiscount = findSelectedCheckoutBenefitDiscount(currentState?.preview || null);
    if (selectedDiscount && !(isCheckoutBenefitsStackable(cachedPromo) && isCheckoutBenefitsStackable(selectedDiscount))) {
      nextSelection.discountId = null;
      nextSelection.discountSource = null;
    }
    return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
  }

  await attachCheckoutPromo(passport.token, safeCode);
  const nextSelection = normalizeSelection({
    ...resolved.selection,
    promoCode: safeCode,
    promoRewardId: null,
    promoSource: 'promo_code',
  });
  await saveCheckoutBenefitsSelectionSafely(nextSelection, passport.token);
  const nextState = await refreshCheckoutBenefitsState({
    ...context,
    selection: nextSelection,
  });
  const selectedDiscount = findSelectedCheckoutBenefitDiscount(nextState.preview || null);
  const selectedPromo = findSelectedCheckoutBenefitPromo(nextState.preview || null);
  if (selectedDiscount && selectedPromo && !(isCheckoutBenefitsStackable(selectedDiscount) && isCheckoutBenefitsStackable(selectedPromo))) {
    const clearedSelection = normalizeSelection({
      ...nextSelection,
      discountId: null,
      discountSource: null,
    });
    return saveLocalCheckoutBenefitsSelection(resolved, clearedSelection);
  }
  return nextState;
}

export async function applyCheckoutPromoCardSelection(item: CustomerBenefitCard, context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const currentState = await readCheckoutBenefitsState({
    ...context,
    selection: resolved.selection,
  }).catch(() => null);
  const promoSource = asText(item.source).toLowerCase() === 'reward_promo' ? 'reward_promo' : 'promo_code';
  const promoRewardId = promoSource === 'reward_promo'
    ? Number(item.reward_id || item.id || 0)
    : null;
  const promoCode = promoSource === 'promo_code' ? normalizePromoCode(item.code) : '';
  if (promoSource === 'reward_promo' && !(Number(promoRewardId || 0) > 0)) {
    return readCheckoutBenefitsState(context);
  }
  if (promoSource === 'promo_code' && !promoCode) {
    return readCheckoutBenefitsState(context);
  }

  const nextSelection = normalizeSelection({
    ...resolved.selection,
    promoCode,
    promoRewardId: promoRewardId || null,
    promoSource,
  });
  const selectedDiscount = findSelectedCheckoutBenefitDiscount(currentState?.preview || null);
  if (selectedDiscount && !(isCheckoutBenefitsStackable(item) && isCheckoutBenefitsStackable(selectedDiscount))) {
    nextSelection.discountId = null;
    nextSelection.discountSource = null;
  }
  return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
}

export async function clearCheckoutDiscountSelection(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const nextSelection = normalizeSelection({
    ...resolved.selection,
    discountId: null,
    discountSource: null,
  });
  return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
}

export async function clearCheckoutPromoSelection(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const nextSelection = normalizeSelection({
    ...resolved.selection,
    promoCode: '',
    promoRewardId: null,
    promoSource: null,
  });
  return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
}

export async function clearCheckoutBenefitsSelection(context: CheckoutBenefitsContext = {}) {
  const resolved = await resolveCheckoutBenefitsContext(context);
  const nextSelection = normalizeSelection(emptySelection);
  return saveLocalCheckoutBenefitsSelection(resolved, nextSelection);
}
