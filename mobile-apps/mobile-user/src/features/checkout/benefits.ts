import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CartLine } from '../cart';
import { readCartLines } from '../cart';
import { readFulfillmentSelection, readCheckoutBenefitsSelection, saveCheckoutBenefitsSelection, type CheckoutBenefitsSelection, type FulfillmentSelection } from './model';
import {
  attachCheckoutPromo,
  fetchCheckoutBenefitsPreview,
  fetchCustomerBenefits,
  readCachedCustomerBenefits,
  readCachedCustomerPassport,
  readCachedMobileCatalogSnapshot,
  saveCustomerBenefits,
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

function getCheckoutBenefitsCounts(preview: CheckoutBenefitsPreviewData | null, benefits: CustomerBenefits | null) {
  const source = preview || benefits || {
    completed: [],
    discounts: [],
    gifts: [],
    progress: [],
    promo_codes: [],
  };
  return {
    discounts: Array.isArray(source.discounts) ? source.discounts.length : 0,
    gifts: Array.isArray(source.gifts) ? source.gifts.length : 0,
    progress: Array.isArray(source.progress) ? source.progress.length : 0,
    promocodes: Array.isArray(source.promo_codes) ? source.promo_codes.length : 0,
    total: (
      (Array.isArray(source.discounts) ? source.discounts.length : 0)
      + (Array.isArray(source.gifts) ? source.gifts.length : 0)
      + (Array.isArray(source.progress) ? source.progress.length : 0)
      + (Array.isArray(source.promo_codes) ? source.promo_codes.length : 0)
    ),
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

async function readCachedCheckoutBenefits(token: string, request: CheckoutBenefitsPreviewRequest) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
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
    preview: value.preview || null,
    sourceBenefits: value.sourceBenefits || null,
    updatedAt: asText(value.updatedAt) || new Date().toISOString(),
  };
  checkoutBenefitsMemory.set(key, normalized);
  await AsyncStorage.setItem(key, JSON.stringify(normalized));
  return normalized;
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
  cachedBenefits: CustomerBenefits | null,
) {
  const basePreview = cachedState?.basePreview || cachedState?.preview || null;
  const preview = derivePreviewFromSelection(basePreview, resolved.selection);
  const sourceBenefits = cachedState?.sourceBenefits || cachedBenefits || null;
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
  await saveCheckoutBenefitsSelection(nextSelection);
  if (!resolved.token) {
    return {
      counts: getCheckoutBenefitsCounts(null, null),
      currentSelection: nextSelection,
      preview: null,
      request: resolved.request,
      sourceBenefits: null,
    } satisfies CheckoutBenefitsState;
  }

  const [cachedState, cachedBenefits] = await Promise.all([
    readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null),
    readCachedCustomerBenefits(resolved.token).catch(() => null),
  ]);
  const basePreview = cachedState?.basePreview || cachedState?.preview || null;
  const preview = derivePreviewFromSelection(basePreview, nextSelection);
  const sourceBenefits = cachedState?.sourceBenefits || cachedBenefits || null;
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
  const cachedBenefits = resolved.token ? await readCachedCustomerBenefits(resolved.token).catch(() => null) : null;
  const cachedState = resolved.token ? await readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null) : null;
  return buildCheckoutBenefitsStateFromCache(resolved, cachedState, cachedBenefits);
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

  const [cachedState, cachedBenefits] = await Promise.all([
    readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null),
    readCachedCustomerBenefits(resolved.token).catch(() => null),
  ]);
  const [benefitsResult, previewResult] = await Promise.all([
    fetchCustomerBenefits(resolved.token)
      .then((value) => ({ fresh: true, value }))
      .catch(() => ({ fresh: false, value: cachedState?.sourceBenefits || cachedBenefits || null })),
    fetchCheckoutBenefitsPreview(resolved.token, {
      ...resolved.request,
      promo_code: null,
      selected_discount_id: null,
      selected_discount_source: null,
      selected_promo_reward_id: null,
      selected_promo_source: null,
    })
      .then((value) => ({ fresh: true, value }))
      .catch(() => ({ fresh: false, value: cachedState?.basePreview || cachedState?.preview || null })),
  ]);
  const benefits = benefitsResult.value || null;
  const basePreview = previewResult.value || null;

  const derivedPreview = derivePreviewFromSelection(basePreview, resolved.selection);
  const cachedValue: CheckoutBenefitsCache = {
    basePreview,
    currentSelection: resolved.selection,
    preview: derivedPreview,
    sourceBenefits: benefits || null,
    updatedAt: benefitsResult.fresh || previewResult.fresh
      ? new Date().toISOString()
      : cachedState?.updatedAt || new Date().toISOString(),
  };
  await saveCachedCheckoutBenefits(resolved.token, resolved.request, cachedValue);
  if (benefits) {
    await saveCustomerBenefits(resolved.token, benefits);
  }
  return {
    counts: getCheckoutBenefitsCounts(derivedPreview, benefits),
    currentSelection: resolved.selection,
    preview: derivedPreview,
    request: resolved.request,
    sourceBenefits: benefits || null,
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

  const [cachedState, cachedBenefits] = await Promise.all([
    readCachedCheckoutBenefits(resolved.token, resolved.request).catch(() => null),
    readCachedCustomerBenefits(resolved.token).catch(() => null),
  ]);
  const cachedView = buildCheckoutBenefitsStateFromCache(resolved, cachedState, cachedBenefits);
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
  await saveCheckoutBenefitsSelection(nextSelection);
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
