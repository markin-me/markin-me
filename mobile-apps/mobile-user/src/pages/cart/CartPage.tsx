import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import {
  cartLinesToStockCheckItems,
  clearCartLines,
  formatCartIngredientLine,
  formatCartOptionLine,
  formatCartVariantLine,
  getCartLineStockProductIds,
  readCartLines,
  removeCartLine,
  saveCartLines,
  updateCartLineQuantity,
  type CartLine,
} from '../../features/cart';
import { calculateCartStockLimit, getStockProductIdsForLines, useProductStock } from '../../features/stock';
import {
  applyCheckoutPromoCode as applyCheckoutPromoCodeSelection,
  cacheCheckoutBenefitsPreviewForLines,
  saveCheckoutCartSummary,
  readCheckoutBenefitsSelection,
  readCheckoutBenefitsState,
  readFulfillmentSelection,
  saveCheckoutBenefitsSelection,
  saveFulfillmentSelection,
  ensureCheckoutBenefitsState,
  deriveCheckoutBenefitsPreviewForLines,
  type CheckoutBenefitsSelection,
  type CheckoutCartSummary,
  type FulfillmentMode,
  type FulfillmentSelection,
} from '../../features/checkout';
import {
  fetchCustomerAddresses,
  fetchBonusConfig,
  fetchBonusFavoriteCategories,
  checkOrderStock,
  buildCustomerAddressCacheKey,
  ensureCustomerAddressDeliveryQuote,
  fetchPublicOrderConfig,
  fetchTenantStores,
  getCatalogSnapshotProduct,
  isSameCachedValue,
  isFreshDeliveryQuoteForAddress,
  readCachedCustomerAddresses,
  readCachedCustomerPassport,
  readCachedMobileCatalogSnapshot,
  readCachedPublicOrderConfig,
  readCachedTenantStores,
  resolveAssetUrl,
  saveCustomerPassport,
  summarizeDeliveryQuoteForSubtotal,
  joinBonusProgram,
  warmFullProductPassports,
  type BonusConfig,
  type BonusFavoriteCategories,
  type CustomerAddress,
  type CustomerBenefitCard,
  type CustomerPassport,
  type CustomerBenefits,
  type CheckoutBenefitsPreviewData,
  type PublicOrderConfig,
  type TenantStore,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { calculateBuyXGetYLineTotals, getBuyXGetYBadgeText } from '../../shared/lib/buyXGetY';
import { formatPrice } from '../../shared/lib/formatPrice';
import { AppText as Text, AppTextInput, BottomSheet, ProductBadge, ProductQuantityButton } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';

type CartNavigation = NativeStackNavigationProp<RootStackParamList>;
type DeliveryMeta = {
  cost: number | null;
  etaMinutes: number | null;
  freeFrom: number | null;
  hoursText: string;
};
type DeliveryProgressState = {
  free: boolean;
  label: string;
  value: number;
};
type CartBenefitsCounts = {
  discounts: number;
  gifts: number;
  progress: number;
  promocodes: number;
};
type CartBonusState = {
  accrualAmount: number;
  allowRedeemAndAccrue: boolean;
  balance: number;
  coinName: string;
  coinLogoUrl: string;
  isJoined: boolean;
  isProgramEnabled: boolean;
  joinCashbackText: string;
  joinRedeemText: string;
  joinRewardAmount: number;
  level: Record<string, unknown> | null;
  redeemAvailableAmount: number;
};
type CartSummaryState = CheckoutCartSummary;
type CartDiscountDetailDisplayItem = {
  key: string;
  title: string;
  type: 'bonus' | 'money';
  value: number;
};

const emptyBenefitsCounts: CartBenefitsCounts = {
  discounts: 0,
  gifts: 0,
  progress: 0,
  promocodes: 0,
};

function toCartBenefitsCounts(counts: Partial<CartBenefitsCounts> | null | undefined): CartBenefitsCounts {
  return {
    discounts: Math.max(0, Number(counts?.discounts || 0)),
    gifts: Math.max(0, Number(counts?.gifts || 0)),
    progress: Math.max(0, Number(counts?.progress || 0)),
    promocodes: Math.max(0, Number(counts?.promocodes || 0)),
  };
}

const emptyBonusState: CartBonusState = {
  accrualAmount: 0,
  allowRedeemAndAccrue: false,
  balance: 0,
  coinName: 'Бонусы',
  coinLogoUrl: '',
  isJoined: false,
  isProgramEnabled: false,
  joinCashbackText: '0%',
  joinRedeemText: '0%',
  joinRewardAmount: 0,
  level: null,
  redeemAvailableAmount: 0,
};

function normalizePromoCodeInput(value: unknown) {
  return String(value || '').toUpperCase();
}

function normalizePromoCode(value: unknown) {
  return normalizePromoCodeInput(value).trim();
}

function getPromoErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error || '');
  switch (code) {
    case 'PROMO_CODE_REQUIRED':
      return 'Введите промокод';
    case 'PROMO_INVALID':
      return 'Промокод не найден или недействителен';
    case 'PROMO_NOT_AVAILABLE':
      return 'Этот промокод сейчас недоступен';
    case 'PROMO_LIMIT_REACHED':
      return 'Лимит использования промокода исчерпан';
    case 'PROMO_CUSTOMER_LIMIT_REACHED':
      return 'Вы уже использовали этот промокод';
    case 'PROMO_RESERVED':
      return 'Промокод уже зарезервирован в активном заказе';
    case 'PROMO_NOT_APPLICABLE':
      return 'Промокод не подходит к текущему заказу';
    case 'FIRST_ORDER_LIMIT_REACHED':
      return 'Промокод доступен только для первого заказа';
    case 'UNAUTHORIZED':
      return 'Войдите в профиль, чтобы применить промокод';
    default:
      return 'Не удалось применить промокод';
  }
}

function findSelectedPromoCard(preview: CheckoutBenefitsPreviewData | null) {
  return Array.isArray(preview?.promo_codes)
    ? preview.promo_codes.find((item) => item?.is_selected === true) || null
    : null;
}

function findPromoCardByCode(preview: CheckoutBenefitsPreviewData | null, code: string) {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode || !Array.isArray(preview?.promo_codes)) return null;
  return preview.promo_codes.find((item) => normalizePromoCode(item?.code) === normalizedCode) || null;
}

function findSelectedDiscountCard(preview: CheckoutBenefitsPreviewData | null) {
  return Array.isArray(preview?.discounts)
    ? preview.discounts.find((item) => item?.is_selected === true) || null
    : null;
}

function isBenefitStackable(item: CustomerBenefitCard | null | undefined) {
  return item?.is_stackable === true || Number(item?.is_stackable || 0) === 1;
}

const CART_HEADER_TOGGLE_HEIGHT = 44;
const CART_HEADER_META_HEIGHT = 76;
const CART_HEADER_TOGGLE_SCROLL = 54;
const CART_HEADER_FULL_HEIGHT = 217;
const CART_HEADER_WITHOUT_PROGRESS_HEIGHT = CART_HEADER_FULL_HEIGHT - 24 - theme.spacing.md;
const CART_HEADER_COMPACT_HEIGHT = 77;
const CART_HEADER_META_SCROLL = CART_HEADER_FULL_HEIGHT - CART_HEADER_COMPACT_HEIGHT;
const cartQuantityTapSlop = { bottom: 10, left: 10, right: 10, top: 10 };
const cartSummaryInfoTapSlop = { bottom: 12, left: 12, right: 12, top: 12 };

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function formatAddressLine(address: CustomerAddress | null) {
  if (!address) return '';
  const normalized = String(address.address_normalized_display || '').trim();
  if (normalized) return normalized;
  return [address.city, address.street, address.house, address.apartment ? `кв. ${address.apartment}` : '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function getLocalDayIndex(timezone: unknown) {
  const offset = Number(timezone);
  if (!Number.isFinite(offset)) return new Date().getDay();
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + offset * 60 * 60 * 1000).getDay();
}

function formatHoursRange(hours: Array<Record<string, unknown>> | undefined, timezone?: unknown) {
  if (!Array.isArray(hours) || !hours.length) return '';
  const today = getLocalDayIndex(timezone);
  const row = hours.find((item) => Number(item.day_of_week || 0) === today);
  if (!row || row.is_closed === true || row.is_closed === 1) return '';
  const opens = String(row.opens_at || '').slice(0, 5);
  const closes = String(row.closes_at || '').slice(0, 5);
  return opens && closes ? `${opens} - ${closes}` : '';
}

function formatStoreHours(store: TenantStore | null) {
  return formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : [], store?.timezone);
}

function getConfigHours(config: PublicOrderConfig | null, key: string) {
  const value = config?.[key];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function getConfigNumber(config: PublicOrderConfig | null, key: string) {
  const value = Number(config?.[key]);
  return Number.isFinite(value) ? value : null;
}

function findDeliveryStore(stores: TenantStore[], address: CustomerAddress | null) {
  const candidateIds = [
    Number(address?.delivery_store_id || 0),
    Number(address?.store_id || 0),
  ].filter((id) => Number.isFinite(id) && id > 0);
  for (const id of candidateIds) {
    const store = stores.find((item) => Number(item.id || 0) === id);
    if (store) return store;
  }
  const city = String(address?.city || '').trim().toLowerCase();
  if (!city) return stores[0] || null;
  const cityStores = stores.filter((store) => String(store.city || '').trim().toLowerCase() === city);
  return cityStores[0] || stores[0] || null;
}

function formatDeliveryHours(config: PublicOrderConfig | null, store: TenantStore | null) {
  const storeDeliveryHours = Array.isArray(store?.delivery_hours) ? store.delivery_hours : [];
  const range = formatHoursRange(storeDeliveryHours, store?.timezone)
    || formatHoursRange(getConfigHours(config, 'storeDeliveryHours'), config?.storeTimezone)
    || formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : [], store?.timezone)
    || formatHoursRange(getConfigHours(config, 'storeHours'), config?.storeTimezone);
  return range ? `Доставка с ${range}` : '';
}

function formatEta(minutes: number | null) {
  if (minutes != null && minutes > 0) return `За ${Math.round(minutes)} минут`;
  return 'За 40-80 минут';
}

function buildDeliveryProgress(subtotal: number, meta: DeliveryMeta | null): DeliveryProgressState | null {
  if (!meta) return null;
  const freeFrom = Number(meta.freeFrom || 0);
  const cost = Number(meta.cost || 0);
  if (!(freeFrom > 0)) {
    return {
      free: cost <= 0,
      label: cost > 0 ? `Доставка ${formatPrice(cost)}` : 'Бесплатная доставка',
      value: cost > 0 ? 0 : 100,
    };
  }
  const value = Math.max(0, Math.min(100, subtotal / freeFrom * 100));
  if (value >= 100) {
    return { free: true, label: 'Бесплатная доставка', value: 100 };
  }
  const left = Math.max(0, Math.ceil(freeFrom - subtotal));
  return {
    free: false,
    label: `${cost > 0 ? `Доставка ${formatPrice(cost)}. ` : ''}Еще ${formatPrice(left)}`,
    value,
  };
}

function findSelectedAddress(addresses: CustomerAddress[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.addressId);
  if (selectedId) {
    const selected = addresses.find((address) => toPositiveId(address.id) === selectedId);
    if (selected) return selected;
  }
  return addresses.find((address) => address.is_default === true || address.is_default === 1 || address.is_default === '1')
    || addresses[0]
    || null;
}

function findSelectedStore(stores: TenantStore[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.pickupStoreId);
  if (selectedId) {
    const selected = stores.find((store) => toPositiveId(store.id) === selectedId);
    if (selected) return selected;
  }
  const city = String(selection.pickupCity || '').trim();
  const cityStores = city
    ? stores.filter((store) => String(store.city || '').trim() === city)
    : stores;
  return cityStores[0] || stores[0] || null;
}

function getCartLineCatalogProduct(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  if (line.type !== 'product') return null;
  const productId = Number(line.sourceId || 0);
  if (!(productId > 0)) return null;
  const sharedProduct = getCatalogSnapshotProduct(productId);
  if (sharedProduct) return sharedProduct;
  if (!snapshot) return null;
  const passportProduct = snapshot.productPassports?.[String(productId)]?.product;
  if (passportProduct) return passportProduct;
  return Object.values(snapshot.productsByCategory || {})
    .flatMap((products) => Array.isArray(products) ? products : [])
    .find((item) => Number(item?.id || 0) === productId)
    || null;
}

function getCartLineCatalogPhotoUrl(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  const product = getCartLineCatalogProduct(line, snapshot);
  const photo = Array.isArray(product?.photos) ? product.photos[0] : '';
  return photo ? resolveAssetUrl(String(photo)) : '';
}

function syncCartLineCatalogPhoto(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  if (line.type === 'combo') {
    const photoUrls = (Array.isArray(line.comboSelections) ? line.comboSelections : [])
      .map((selection, index) => {
        const productId = Number(selection.productId || 0);
        const catalogPhoto = productId > 0 ? getCatalogSnapshotProduct(productId)?.photos?.[0] : '';
        return resolveAssetUrl(catalogPhoto || selection.productPhoto || line.photoUrls?.[index] || '');
      })
      .filter(Boolean)
      .slice(0, 4);
    return photoUrls.length && photoUrls.some((url, index) => url !== line.photoUrls?.[index])
      ? { ...line, photoUrls }
      : line;
  }
  const photoUrl = getCartLineCatalogPhotoUrl(line, snapshot);
  return photoUrl && photoUrl !== line.photoUrl ? { ...line, photoUrl } : line;
}

function getCartLineBuyXGetYBadge(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  if (line.type !== 'product') return null;
  return line.buyXGetYBadge || getCartLineCatalogProduct(line, snapshot)?.buy_x_get_y_badge || null;
}

function getLineTotals(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null = null) {
  return calculateBuyXGetYLineTotals({
    badge: getCartLineBuyXGetYBadge(line, snapshot),
    oldUnitPrice: Number(line.oldUnitPrice || 0),
    quantity: Math.max(1, Number(line.quantity || 1)),
    unitPrice: Math.max(0, Number(line.unitPrice || 0)),
  });
}

function getLineTotal(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null = null) {
  return getLineTotals(line, snapshot).total;
}

function getPreviewLineTotal(
  preview: CheckoutBenefitsPreviewData | null,
  line: CartLine,
  fallbackTotal: number,
) {
  const lineTotals = preview?.local_line_totals_by_cart_key && typeof preview.local_line_totals_by_cart_key === 'object'
    ? preview.local_line_totals_by_cart_key as Record<string, unknown>
    : null;
  const value = lineTotals ? Number(lineTotals[line.id]) : NaN;
  return Number.isFinite(value) && value >= 0 ? roundPrice(value) : fallbackTotal;
}

function clearCheckoutPreviewMoneyState(preview: CheckoutBenefitsPreviewData | null) {
  if (!preview) return null;
  return {
    ...preview,
    local_line_totals_by_cart_key: {},
    summary: null,
  } satisfies CheckoutBenefitsPreviewData;
}

function getLineOldTotal(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null = null) {
  return getLineTotals(line, snapshot).oldTotal;
}

function getActiveCartLines(lines: CartLine[]) {
  return lines.filter((line) => line.isUnavailable !== true);
}

function replaceCartLine(lines: CartLine[], nextLine: CartLine) {
  return lines.map((line) => line.id === nextLine.id ? nextLine : line);
}

type RefreshManyStock = (ids: number[]) => Promise<unknown>;

function collectCartStockProductIds(lines: CartLine[]) {
  return Array.from(new Set(lines.flatMap((line) => getCartLineStockProductIds(line))));
}

function collectKnownCartStockProductIds(lines: CartLine[], stockLevels: ReturnType<typeof useProductStock>['stockLevels']) {
  return Array.from(new Set([
    ...collectCartStockProductIds(lines),
    ...getStockProductIdsForLines(lines, stockLevels),
  ]));
}

function getRefreshStockLevels(result: unknown, fallback: ReturnType<typeof useProductStock>['stockLevels']) {
  const source = result && typeof result === 'object' ? result as { stockLevels?: ReturnType<typeof useProductStock>['stockLevels'] } : null;
  return source?.stockLevels instanceof Map ? source.stockLevels : fallback;
}

async function evaluateCartStockState(
  lines: CartLine[],
  stockLevels: ReturnType<typeof useProductStock>['stockLevels'],
  refreshMany?: RefreshManyStock,
) {
  if (!lines.length) return { blockedLineIds: new Set<string>(), lines };

  const affectedProductIds = collectKnownCartStockProductIds(lines, stockLevels);
  const refreshResult = affectedProductIds.length ? await refreshMany?.(affectedProductIds).catch(() => null) : null;
  const latestStockLevels = getRefreshStockLevels(refreshResult, stockLevels);
  let changed = false;
  const nextLines = lines.map((line) => {
    const currentLimit = calculateCartStockLimit(lines, latestStockLevels, line.id);
    const isUnavailable = !currentLimit.canAdd && currentLimit.reason !== 'unknown_stock';
    if (line.isUnavailable === isUnavailable) return line;
    changed = true;
    return { ...line, isUnavailable };
  });

  const blockedLineIds = new Set<string>();
  for (const line of nextLines) {
    if (line.isUnavailable === true) {
      blockedLineIds.add(line.id);
      continue;
    }
    const plusLine = { ...line, quantity: Math.max(1, Number(line.quantity || 1)) + 1 };
    const plusLimit = calculateCartStockLimit(replaceCartLine(nextLines, plusLine), latestStockLevels, line.id);
    if (!plusLimit.canAdd) blockedLineIds.add(line.id);
  }

  const savedLines = changed ? await saveCartLines(nextLines) : nextLines;
  return { blockedLineIds, lines: savedLines };
}

function getDiscountPercent(total: number, oldTotal: number) {
  if (!(oldTotal > total) || !(oldTotal > 0)) return 0;
  return Math.round((1 - total / oldTotal) * 100);
}

function asText(value: unknown) {
  return String(value || '').trim();
}

function isVisiblePromo(item: CustomerBenefitCard) {
  const usageLimit = Number(item.usage_limit || 0);
  const usageCount = Number(item.usage_count || 0);
  return usageLimit <= 0 || usageCount < usageLimit;
}

function mergeDiscounts(primary: CustomerBenefitCard[], secondary: CustomerBenefitCard[]) {
  const result = new Map<string, CustomerBenefitCard>();
  [...primary, ...secondary].forEach((item, index) => {
    const id = asText(item.id);
    const key = id || `${asText(item.title)}:${asText(item.discount_type)}:${asText(item.discount_value)}:${index}`;
    if (!result.has(key)) result.set(key, item);
  });
  return Array.from(result.values());
}

function getCartBenefitsCounts(
  benefits: CustomerBenefits | null,
  discounts: CustomerBenefitCard[],
  preview: CheckoutBenefitsPreviewData | null = null,
) {
  const sourceBenefits = benefits || {
    completed: [],
    discounts: [],
    gifts: [],
    progress: [],
    promo_codes: [],
  };
  const previewDiscounts = Array.isArray(preview?.discounts) ? preview.discounts : [];
  const previewPromocodes = Array.isArray(preview?.promo_codes) ? preview.promo_codes : [];
  const previewGifts = Array.isArray(preview?.gifts) ? preview.gifts : [];
  const previewProgress = Array.isArray(preview?.progress) ? preview.progress : [];
  const discountItems = mergeDiscounts(previewDiscounts, mergeDiscounts(discounts, Array.isArray(sourceBenefits.discounts) ? sourceBenefits.discounts : []));
  const promocodeSource = previewPromocodes.length ? previewPromocodes : (Array.isArray(sourceBenefits.promo_codes) ? sourceBenefits.promo_codes : []);
  const giftSource = previewGifts.length ? previewGifts : (Array.isArray(sourceBenefits.gifts) ? sourceBenefits.gifts : []);
  const progressSource = previewProgress.length
    ? previewProgress
    : (Array.isArray(sourceBenefits.progress) ? sourceBenefits.progress : []);
  const promocodeItems = promocodeSource.filter(isVisiblePromo);
  return {
    discounts: discountItems.length,
    gifts: giftSource.length,
    progress: progressSource.length,
    promocodes: promocodeItems.length,
  };
}

function mergeCartBenefitsCounts(base: CartBenefitsCounts, next: CartBenefitsCounts) {
  return {
    discounts: Math.max(base.discounts, next.discounts),
    gifts: Math.max(base.gifts, next.gifts),
    progress: Math.max(base.progress, next.progress),
    promocodes: Math.max(base.promocodes, next.promocodes),
  };
}

function roundPrice(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeDiscountDetailItems(preview: CheckoutBenefitsPreviewData | null): Array<Record<string, unknown>> {
  const breakdown = preview?.summary?.discount_breakdown;
  return Array.isArray(breakdown)
    ? breakdown.map((entry, index) => {
      const amount = roundPrice(entry?.amount);
      if (!(amount > 0)) return null;
      return {
        amount,
        discount_id: Number(entry?.discount_id || 0) || null,
        key: asText(entry?.key) || asText(entry?.title) || `discount_${index}`,
        promo_code: asText(entry?.promo_code) || null,
        promo_code_id: Number(entry?.promo_code_id || 0) || null,
        reward_id: Number(entry?.reward_id || 0) || null,
        source_kind: asText(entry?.source_kind) || null,
        title: asText(entry?.title) || 'Скидка',
      };
    }).filter((entry) => !!entry) as Array<Record<string, unknown>>
    : [];
}

function formatCartDiscountDetailTitle(entry: Record<string, unknown>) {
  const title = asText(entry.title) || 'РЎРєРёРґРєР°';
  const promoCode = normalizePromoCode(entry.promoCode || entry.promo_code);
  return promoCode ? `${title} (${promoCode})` : title;
}

function buildFallbackDiscountDetailItems(
  lines: CartLine[],
  snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null,
  targetAmount: number,
) {
  const activeLines = getActiveCartLines(lines);
  let comboDiscount = 0;
  let productDiscount = 0;
  activeLines.forEach((line) => {
    const total = roundPrice(getLineTotal(line, snapshot));
    const oldTotal = roundPrice(getLineOldTotal(line, snapshot));
    const amount = roundPrice(Math.max(0, oldTotal - total));
    if (!(amount > 0)) return;
    if (line.type === 'combo') {
      comboDiscount += amount;
      return;
    }
    productDiscount += amount;
  });

  let remaining = roundPrice(Math.max(0, targetAmount));
  const items: Array<Record<string, unknown>> = [];
  [
    { amount: comboDiscount, key: 'combo', title: 'Комбо' },
    { amount: productDiscount, key: 'product', title: 'Товарные скидки' },
  ].forEach((entry) => {
    if (!(remaining > 0)) return;
    const amount = roundPrice(Math.min(Math.max(0, Number(entry.amount || 0)), remaining));
    if (!(amount > 0)) return;
    items.push({ amount, key: entry.key, title: entry.title });
    remaining = roundPrice(Math.max(0, remaining - amount));
  });
  if (remaining > 0) {
    items.push({ amount: remaining, key: 'other', title: 'Прочие скидки' });
  }
  return items;
}

function buildDiscountDetailItems(
  lines: CartLine[],
  snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null,
  benefitsPreview: CheckoutBenefitsPreviewData | null,
  itemDiscountAmount: number,
) {
  const previewItems = normalizeDiscountDetailItems(benefitsPreview);
  const previewTotal = roundPrice(previewItems.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const missingAmount = roundPrice(Math.max(0, Number(itemDiscountAmount || 0) - previewTotal));
  if (previewItems.length) {
    return [
      ...previewItems,
      ...buildFallbackDiscountDetailItems(lines, snapshot, missingAmount),
    ];
  }
  return buildFallbackDiscountDetailItems(lines, snapshot, itemDiscountAmount);
}

function buildCheckoutPreviewItems(lines: CartLine[], snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  return getActiveCartLines(lines).map((line) => {
    const quantity = Math.max(1, Number(line.quantity || 1));
    const lineTotal = roundPrice(getLineTotal(line, snapshot));
    const oldLineTotal = roundPrice(Math.max(lineTotal, getLineOldTotal(line, snapshot)));
    const buyXGetYBadge = getCartLineBuyXGetYBadge(line, snapshot);
    const variantGroupId = Number(line.variant?.groupId || 0);
    const variantValueIndex = Number(line.variant?.valueIndex);
    const baseItem: Record<string, unknown> = {
      buy_x_get_y_badge: line.type === 'product' && buyXGetYBadge ? buyXGetYBadge : null,
      cart_key: line.id,
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
      };
    }

    return {
      ...baseItem,
      ingredients: (Array.isArray(line.ingredients) ? line.ingredients : []).map((ingredient) => ({
        ingredient_id: Number(ingredient.id || 0) || null,
        qty: Number(ingredient.quantity || 0) || 0,
      })).filter((ingredient) => Number(ingredient.ingredient_id || 0) > 0),
      option_items: (Array.isArray(line.options) ? line.options : []).map((option) => {
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
      }).filter((option) => Number(option.id || 0) > 0),
      product_id: Number(line.sourceId || 0) || null,
      product_name: line.title,
      variant_group_id: variantGroupId > 0 ? variantGroupId : null,
      variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
    };
  });
}

function formatPercent(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '0%';
  return `${Number(number.toFixed(2)).toLocaleString('ru-RU')}%`;
}

function getBonusSettings(config: BonusConfig | null) {
  return config?.settings && typeof config.settings === 'object' ? config.settings as Record<string, unknown> : {};
}

function getBonusAccount(config: BonusConfig | null) {
  return config?.account && typeof config.account === 'object' ? config.account as Record<string, unknown> : null;
}

function getBonusLevels(config: BonusConfig | null) {
  return Array.isArray(config?.levels) ? config.levels.filter((level): level is Record<string, unknown> => !!level && typeof level === 'object') : [];
}

function getCartBonusActiveLevel(config: BonusConfig | null) {
  const account = getBonusAccount(config);
  if (!account?.joined_at || !(Number(account.id || 0) > 0)) return null;
  const levelId = Number(account.level_id || account.bonus_level_id || 0);
  const levels = getBonusLevels(config);
  if (levelId > 0) {
    const level = levels.find((item) => Number(item.id || 0) === levelId);
    if (level) return level;
  }
  return levels.find((item) => asText(item.title)) || null;
}

function getCartBonusJoinLevel(config: BonusConfig | null) {
  const levels = getBonusLevels(config);
  return levels.find((item) => asText(item.access_type) === 'join') || levels[0] || null;
}

function getCartBonusCurrentLevelId(config: BonusConfig | null) {
  const level = getCartBonusActiveLevel(config) || getCartBonusJoinLevel(config);
  const id = Number(level?.id || 0);
  return id > 0 ? id : 0;
}

function getFavoriteCategoryPercents(favorites: BonusFavoriteCategories | null) {
  const selectedIds = new Set(
    (Array.isArray(favorites?.selected_ids) ? favorites.selected_ids : [])
      .map((id) => Number(id || 0))
      .filter((id) => id > 0),
  );
  const percents = new Map<number, number>();
  (Array.isArray(favorites?.categories) ? favorites.categories : []).forEach((category) => {
    const id = Number(category?.id || 0);
    if (!(id > 0) || !selectedIds.has(id)) return;
    const percent = Math.max(0, Number(category?.bonus_percent || favorites?.bonus_percent || 0));
    if (percent > 0) percents.set(id, percent);
  });
  return percents;
}

function getCartLineCategoryIds(line: CartLine, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  const ids = new Set<number>();
  if (!snapshot) return ids;

  if (line.type === 'combo') {
    const comboId = Number(line.sourceId || 0);
    Object.entries(snapshot.combosByCategory || {}).forEach(([categoryId, combos]) => {
      const numericCategoryId = Number(categoryId || 0);
      if (!(numericCategoryId > 0) || !Array.isArray(combos)) return;
      if (combos.some((combo) => Number(combo?.id || 0) === comboId)) ids.add(numericCategoryId);
    });
    Object.values(snapshot.combosByCategory || {}).forEach((combos) => {
      (Array.isArray(combos) ? combos : []).forEach((combo) => {
        if (Number(combo?.id || 0) !== comboId) return;
        const categoryId = Number(combo?.category_id || 0);
        if (categoryId > 0) ids.add(categoryId);
      });
    });
    return ids;
  }

  const productId = Number(line.sourceId || 0);
  const passportProduct = snapshot.productPassports?.[String(productId)]?.product;
  const product = passportProduct || Object.values(snapshot.productsByCategory || {})
    .flatMap((products) => Array.isArray(products) ? products : [])
    .find((item) => Number(item?.id || 0) === productId);
  (Array.isArray(product?.category_ids) ? product.category_ids : []).forEach((id) => {
    const numericId = Number(id || 0);
    if (numericId > 0) ids.add(numericId);
  });
  Object.entries(snapshot.productsByCategory || {}).forEach(([categoryId, products]) => {
    const numericCategoryId = Number(categoryId || 0);
    if (!(numericCategoryId > 0) || !Array.isArray(products)) return;
    if (products.some((item) => Number(item?.id || 0) === productId)) ids.add(numericCategoryId);
  });
  return ids;
}

function calculateCartBonusAccrual(lines: CartLine[], itemsTotal: number, level: Record<string, unknown>, favorites: BonusFavoriteCategories | null, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null) {
  const orderRangePercent = (Array.isArray(level.order_bonus_ranges) ? level.order_bonus_ranges : [])
    .map((row) => row && typeof row === 'object' ? row as Record<string, unknown> : null)
    .filter((row): row is Record<string, unknown> => !!row)
    .map((row) => ({
      amount: Math.max(0, Number(row.amount || 0)),
      percent: Math.max(0, Number(row.percent || 0)),
    }))
    .filter((row) => row.amount > 0 && row.percent > 0 && itemsTotal >= row.amount)
    .sort((left, right) => right.amount - left.amount)[0]?.percent || 0;
  const cashbackPercent = Math.max(0, Number(level.cashback_percent || 0)) + orderRangePercent;
  const favoritePercents = getFavoriteCategoryPercents(favorites);
  let rawBonus = 0;

  lines.forEach((line) => {
    const lineTotal = roundPrice(getLineTotal(line, snapshot));
    if (!(lineTotal > 0)) return;
    const categoryIds = getCartLineCategoryIds(line, snapshot);
    const favoritePercent = Array.from(categoryIds).reduce((max, id) => Math.max(max, Number(favoritePercents.get(id) || 0)), 0);
    const percent = cashbackPercent + favoritePercent;
    if (percent > 0) rawBonus += lineTotal * percent / 100;
  });

  return Math.floor(Math.max(0, rawBonus));
}

function calculateCartBonusRedeemAmount(itemsTotal: number, config: BonusConfig | null, level: Record<string, unknown> | null) {
  const account = getBonusAccount(config);
  const balance = Math.floor(Math.max(0, Number(account?.balance || 0)));
  const redeemPercent = Math.max(0, Number(level?.redeem_percent || 0));
  if (!(balance > 0) || !(redeemPercent > 0)) return 0;
  const limit = Math.floor(Math.max(0, itemsTotal) * redeemPercent / 100);
  return Math.max(0, Math.min(balance, limit));
}

function buildCartBonusState(lines: CartLine[], config: BonusConfig | null, favorites: BonusFavoriteCategories | null, snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null): CartBonusState {
  const activeLines = getActiveCartLines(lines);
  const settings = getBonusSettings(config);
  const account = getBonusAccount(config);
  const level = getCartBonusActiveLevel(config);
  const joinLevel = getCartBonusJoinLevel(config);
  const itemsTotal = activeLines.reduce((sum, line) => sum + getLineTotal(line, snapshot), 0);
  const balance = Math.floor(Math.max(0, Number(account?.balance || 0)));
  const coinName = asText(settings.bonus_coin_name) || 'Бонусы';
  const coinLogoUrl = resolveAssetUrl(asText(settings.bonus_coin_logo));
  const isProgramEnabled = settings.bonus_program_enabled === true || Number(settings.bonus_program_enabled || 0) === 1;
  const isJoined = Boolean(level);
  return {
    accrualAmount: level ? calculateCartBonusAccrual(activeLines, itemsTotal, level, favorites, snapshot) : 0,
    allowRedeemAndAccrue: Number(settings.allow_redeem_and_accrue || 0) === 1,
    balance,
    coinName,
    coinLogoUrl,
    isJoined,
    isProgramEnabled,
    joinCashbackText: formatPercent(joinLevel?.cashback_percent),
    joinRedeemText: formatPercent(joinLevel?.redeem_percent),
    joinRewardAmount: Math.floor(Math.max(0, Number(joinLevel?.reward_bonus_amount || 0))),
    level,
    redeemAvailableAmount: level ? calculateCartBonusRedeemAmount(itemsTotal, config, level) : 0,
  };
}

function buildCartBonusRedeemDisplayLineStates(
  lineStates: Array<Record<string, unknown>>,
  bonusRedeemAmount: number,
) {
  const states = Array.isArray(lineStates)
    ? lineStates.map((entry) => ({ ...entry }))
    : [];
  const totalRedeem = roundPrice(Math.max(0, Number(bonusRedeemAmount || 0)));
  if (!(totalRedeem > 0) || !states.length) return states;

  const eligible = states
    .map((entry, index) => ({
      index,
      currentTotal: roundPrice(Math.max(0, Number(entry?.currentTotal || 0))),
    }))
    .filter((entry) => entry.currentTotal > 0);
  const eligibleTotal = roundPrice(
    eligible.reduce((sum, entry) => sum + Number(entry.currentTotal || 0), 0)
  );
  const appliedTotal = roundPrice(Math.min(totalRedeem, eligibleTotal));
  if (!(appliedTotal > 0)) return states;

  let distributed = 0;
  eligible.forEach((entry, entryIndex) => {
    const remaining = roundPrice(appliedTotal - distributed);
    if (!(remaining > 0)) return;
    const rawShare = entryIndex === eligible.length - 1
      ? remaining
      : roundPrice(appliedTotal * (entry.currentTotal / eligibleTotal));
    const share = roundPrice(Math.min(remaining, entry.currentTotal, rawShare));
    if (!(share > 0)) return;

    const stateEntry = states[entry.index];
    const currentTotal = roundPrice(Math.max(0, entry.currentTotal - share));
    const originalTotal = roundPrice(Math.max(
      Number(stateEntry?.originalTotal || 0),
      Number(entry.currentTotal || 0),
      currentTotal,
    ));
    let discountPercent = 0;
    if (originalTotal > currentTotal && originalTotal > 0) {
      discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
    }
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;

    stateEntry.currentTotal = currentTotal;
    stateEntry.originalTotal = originalTotal > currentTotal ? originalTotal : currentTotal;
    stateEntry.discountPercent = discountPercent;
    stateEntry.discountAmount = roundPrice(Math.max(0,
      Number(stateEntry.originalTotal || 0) - Number(stateEntry.currentTotal || 0)
    ));
    distributed = roundPrice(distributed + share);
  });

  return states;
}

function buildCartSummaryState(
  lines: CartLine[],
  deliveryCost: number,
  bonusState: CartBonusState,
  redeemActive: boolean,
  benefitsPreview: CheckoutBenefitsPreviewData | null,
  snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null,
): CartSummaryState {
  const activeLines = getActiveCartLines(lines);
  const previewSummary = benefitsPreview?.summary && typeof benefitsPreview.summary === 'object' ? benefitsPreview.summary : null;
  const fallbackItemsTotal = roundPrice(activeLines.reduce((sum, line) => sum + getLineTotal(line, snapshot), 0));
  const fallbackSubtotalBeforeDiscount = roundPrice(activeLines.reduce((sum, line) => {
    const total = getLineTotal(line, snapshot);
    const oldTotal = getLineOldTotal(line, snapshot);
    return sum + Math.max(total, oldTotal);
  }, 0));
  const previewItemsTotal = roundPrice(previewSummary?.items_total);
  const previewSubtotalBeforeDiscount = roundPrice(previewSummary?.subtotal);
  const itemsTotal = previewItemsTotal > 0 ? previewItemsTotal : fallbackItemsTotal;
  const subtotalBeforeDiscount = previewSubtotalBeforeDiscount > 0 ? previewSubtotalBeforeDiscount : fallbackSubtotalBeforeDiscount;
  const itemDiscountAmount = roundPrice(Math.max(0, subtotalBeforeDiscount - itemsTotal));
  const bonusRedeemAmount = redeemActive ? roundPrice(Math.min(itemsTotal, bonusState.redeemAvailableAmount)) : 0;
  const discountAmount = roundPrice(itemDiscountAmount + bonusRedeemAmount);
  const total = roundPrice(Math.max(0, itemsTotal - bonusRedeemAmount) + Math.max(0, Number(deliveryCost || 0)));
  const baseLineStates = activeLines.map((line) => {
    const baseTotal = roundPrice(getPreviewLineTotal(benefitsPreview, line, getLineTotal(line, snapshot)));
    const originalTotal = roundPrice(Math.max(
      getLineOldTotal(line, snapshot),
      getLineTotal(line, snapshot),
      baseTotal,
    ));
    return {
      key: line.id,
      currentTotal: baseTotal,
      originalTotal,
    };
  });
  const lineStates = buildCartBonusRedeemDisplayLineStates(baseLineStates, bonusRedeemAmount);
  return {
    bonusAccrualAmount: Math.floor(Math.max(0, Number(bonusState.accrualAmount || 0))),
    bonusAccrualBlockedByRedeem: redeemActive && !bonusState.allowRedeemAndAccrue && Number(bonusState.accrualAmount || 0) > 0,
    bonusRedeemAmount,
    deliveryCost: roundPrice(Math.max(0, Number(deliveryCost || 0))),
    discountDetailItems: buildDiscountDetailItems(lines, snapshot, benefitsPreview, itemDiscountAmount),
    discountAmount,
    itemDiscountAmount,
    itemsTotal,
    lineStates,
    subtotalBeforeDiscount,
    total,
  };
}

function getCartLineTitle(line: CartLine) {
  const variantLine = formatCartVariantLine(line.variant);
  return [variantLine, line.title].filter(Boolean).join(' ').trim() || line.title;
}

function getCartLineDetails(line: CartLine) {
  if (line.type === 'combo' && line.comboSelections?.length) {
    return line.comboSelections.flatMap((selection) => {
      const ingredients = Array.isArray(selection.ingredients)
        ? selection.ingredients.map(formatCartIngredientLine).filter(Boolean)
        : [];
      return [`1 x ${selection.productName}`, ...ingredients];
    });
  }
  if (line.type === 'combo' && line.detailLines?.length) return line.detailLines;
  const structuredLines = [
    ...(Array.isArray(line.ingredients) ? line.ingredients.map(formatCartIngredientLine) : []),
    ...(Array.isArray(line.options) ? line.options.map(formatCartOptionLine) : []),
  ].filter(Boolean);
  return structuredLines.length ? structuredLines : line.detailLines || [];
}

function BonusAmount({ amount, color, emphasis = false, logoUrl, prefix = '', size = 'md', suffix }: {
  amount: number;
  color?: string;
  emphasis?: boolean;
  logoUrl?: string;
  prefix?: string;
  size?: 'sm' | 'md' | 'lg';
  suffix?: string;
}) {
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 14 : 16;
  return (
    <View style={styles.bonusAmount}>
      <Text style={[
        styles.bonusAmountText,
        size === 'lg' && styles.bonusAmountTextLarge,
        size === 'sm' && styles.bonusAmountTextSmall,
        emphasis && styles.bonusAmountTextEmphasis,
        color ? { color } : null,
      ]}>
        {prefix}{Math.floor(Math.max(0, Number(amount || 0))).toLocaleString('ru-RU')}
      </Text>
      {logoUrl ? (
        <Image resizeMode="contain" source={{ uri: logoUrl }} style={[styles.bonusAmountIcon, { height: iconSize, width: iconSize }]} />
      ) : suffix ? (
        <Text style={[
          styles.bonusAmountSuffix,
          size === 'lg' && styles.bonusAmountSuffixLarge,
          size === 'sm' && styles.bonusAmountSuffixSmall,
          color ? { color } : null,
        ]}>{suffix}</Text>
      ) : null}
    </View>
  );
}

function AccentGradientSurface({ shape = 'pill' }: { shape?: 'pill' | 'rounded' }) {
  const gradientId = `cartAccentGradient${useId().replace(/:/g, '')}`;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.accentGradientSurface,
        shape === 'rounded' && styles.accentGradientSurfaceRounded,
      ]}
    >
      <Svg height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject} viewBox="0 0 100 64" width="100%">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor={theme.colors.accent} />
            <Stop offset="100%" stopColor="#ffb15a" />
          </SvgLinearGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="64" width="100" />
      </Svg>
    </View>
  );
}

export function CartPage() {
  const navigation = useNavigation<CartNavigation>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const headerScrollY = useRef(new Animated.Value(0)).current;
  const checkoutButtonRef = useRef<View>(null);
  const checkoutVisibilityFrameRef = useRef<number | null>(null);
  const inlineCheckoutVisibleRef = useRef(false);
  const { mergeStockRows, refreshMany, stockLevels } = useProductStock();
  const cartHydratedRef = useRef(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [stores, setStores] = useState<TenantStore[]>([]);
  const [orderConfig, setOrderConfig] = useState<PublicOrderConfig | null>(null);
  const [customerPassport, setCustomerPassport] = useState<CustomerPassport | null>(null);
  const [selection, setSelection] = useState<FulfillmentSelection>({
    addressId: null,
    mode: 'delivery',
    pickupCity: null,
    pickupStoreId: null,
  });
  const [benefitsCounts, setBenefitsCounts] = useState<CartBenefitsCounts>(emptyBenefitsCounts);
  const [benefitsPreview, setBenefitsPreview] = useState<CheckoutBenefitsPreviewData | null>(null);
  const [bonusConfig, setBonusConfig] = useState<BonusConfig | null>(null);
  const [bonusFavoriteCategories, setBonusFavoriteCategories] = useState<BonusFavoriteCategories | null>(null);
  const [catalogSnapshot, setCatalogSnapshot] = useState<Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null>(null);
  const [bonusRedeemEnabled, setBonusRedeemEnabled] = useState(false);
  const [discountDetailsVisible, setDiscountDetailsVisible] = useState(false);
  const [bonusDetailsVisible, setBonusDetailsVisible] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [selectedDiscountId, setSelectedDiscountId] = useState<number | null>(null);
  const [selectedDiscountSource, setSelectedDiscountSource] = useState<'discount' | 'reward_discount' | null>(null);
  const [selectedPromoSource, setSelectedPromoSource] = useState<'promo_code' | 'reward_promo' | null>(null);
  const [selectedPromoRewardId, setSelectedPromoRewardId] = useState<number | null>(null);
  const [isApplyingPromo, setApplyingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [inlineCheckoutVisible, setInlineCheckoutVisible] = useState(false);
  const [stockBlockedLineIds, setStockBlockedLineIds] = useState<Set<string>>(() => new Set());
  const benefitsPreviewSeqRef = useRef(0);
  const benefitsPreviewRef = useRef<CheckoutBenefitsPreviewData | null>(null);
  const cartMutationSeqRef = useRef(0);
  const cartMutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const linesRef = useRef<CartLine[]>([]);
  const pendingLineQuantitiesRef = useRef<Map<string, number>>(new Map());
  const syncCartFromCacheRef = useRef<(() => Promise<unknown>) | null>(null);
  const deliveryQuoteRequestKeyRef = useRef<string | null>(null);

  const syncInlineCheckoutVisibility = useCallback(() => {
    if (checkoutVisibilityFrameRef.current != null) return;
    checkoutVisibilityFrameRef.current = requestAnimationFrame(() => {
      checkoutVisibilityFrameRef.current = null;
      checkoutButtonRef.current?.measureInWindow((_x, y, _width, height) => {
        const navTop = windowHeight - theme.sizes.tabBarHeight - Math.max(0, insets.bottom);
        const visible = y >= 0 && y + height <= navTop;
        if (inlineCheckoutVisibleRef.current === visible) return;
        inlineCheckoutVisibleRef.current = visible;
        setInlineCheckoutVisible(visible);
      });
    });
  }, [insets.bottom, windowHeight]);

  useEffect(() => () => {
    if (checkoutVisibilityFrameRef.current != null) cancelAnimationFrame(checkoutVisibilityFrameRef.current);
  }, []);

  const setBenefitsPreviewValue = useCallback((preview: CheckoutBenefitsPreviewData | null) => {
    benefitsPreviewRef.current = preview;
    setBenefitsPreview(preview);
  }, []);

  const enqueueCartMutation = useCallback((task: () => Promise<CartLine[]>) => {
    const nextTask = cartMutationQueueRef.current.then(task, task);
    cartMutationQueueRef.current = nextTask.then(() => undefined, () => undefined);
    return nextTask;
  }, []);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const activeLines = useMemo(() => getActiveCartLines(lines), [lines]);
  const hasActiveLines = activeLines.length > 0;
  const hasProblemLines = lines.some((line) => line.isUnavailable === true);
  const subtotal = useMemo(() => activeLines.reduce((sum, line) => sum + getLineTotal(line, catalogSnapshot), 0), [activeLines, catalogSnapshot]);
  const selectedAddress = useMemo(() => findSelectedAddress(addresses, selection), [addresses, selection]);
  const selectedStore = useMemo(() => findSelectedStore(stores, selection), [selection, stores]);
  const selectedDeliveryStore = useMemo(() => findDeliveryStore(stores, selectedAddress), [selectedAddress, stores]);
  const isDelivery = selection.mode === 'delivery';
  const toggleOpacity = headerScrollY.interpolate({
    inputRange: [0, CART_HEADER_TOGGLE_SCROLL],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const toggleHeight = headerScrollY.interpolate({
    inputRange: [0, CART_HEADER_TOGGLE_SCROLL],
    outputRange: [CART_HEADER_TOGGLE_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const toggleTranslateY = headerScrollY.interpolate({
    inputRange: [0, CART_HEADER_TOGGLE_SCROLL],
    outputRange: [0, -12],
    extrapolate: 'clamp',
  });
  const addressMarginTop = headerScrollY.interpolate({
    inputRange: [0, CART_HEADER_TOGGLE_SCROLL],
    outputRange: [theme.spacing.md, 0],
    extrapolate: 'clamp',
  });
  const metaOpacity = headerScrollY.interpolate({
    inputRange: [CART_HEADER_TOGGLE_SCROLL, CART_HEADER_META_SCROLL],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const metaHeight = headerScrollY.interpolate({
    inputRange: [CART_HEADER_TOGGLE_SCROLL, CART_HEADER_META_SCROLL],
    outputRange: [CART_HEADER_META_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const metaTranslateY = headerScrollY.interpolate({
    inputRange: [CART_HEADER_TOGGLE_SCROLL, CART_HEADER_META_SCROLL],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });
  const progressMarginTop = headerScrollY.interpolate({
    inputRange: [CART_HEADER_TOGGLE_SCROLL, CART_HEADER_META_SCROLL],
    outputRange: [theme.spacing.md, theme.spacing.xs],
    extrapolate: 'clamp',
  });
  const bonusState = useMemo(
    () => buildCartBonusState(activeLines, bonusConfig, bonusFavoriteCategories, catalogSnapshot),
    [activeLines, bonusConfig, bonusFavoriteCategories, catalogSnapshot],
  );
  const redeemActive = bonusRedeemEnabled && bonusState.balance > 0 && bonusState.redeemAvailableAmount > 0;
  const normalizedPromoCode = normalizePromoCode(promoCode);
  const promoIsCurrent = !!normalizedPromoCode && normalizedPromoCode === appliedPromoCode;
  const promoApplyDisabled = !normalizedPromoCode || promoIsCurrent || isApplyingPromo;
  const deliverySubtotalForMeta = useMemo(() => {
    const previewSummary = benefitsPreview?.summary && typeof benefitsPreview.summary === 'object' ? benefitsPreview.summary : null;
    const previewItemsTotal = roundPrice(previewSummary?.items_total);
    const fallbackItemsTotal = roundPrice(activeLines.reduce((sum, line) => sum + getLineTotal(line, catalogSnapshot), 0));
    const itemsTotal = previewItemsTotal > 0 ? previewItemsTotal : fallbackItemsTotal;
    const bonusRedeemAmount = redeemActive ? roundPrice(Math.min(itemsTotal, bonusState.redeemAvailableAmount)) : 0;
    return Math.max(0, itemsTotal - bonusRedeemAmount);
  }, [activeLines, benefitsPreview, bonusState.redeemAvailableAmount, catalogSnapshot, redeemActive]);
  const deliveryMeta = useMemo<DeliveryMeta | null>(() => {
    if (!isDelivery) return null;
    const quote = selectedAddress?.delivery_quote || null;
    const quoteSummary = quote ? summarizeDeliveryQuoteForSubtotal(quote, deliverySubtotalForMeta) : null;
    const fallbackCost = getConfigNumber(orderConfig, 'delivery_cost');
    const fallbackFreeFrom = getConfigNumber(orderConfig, 'free_delivery_from');
    const fallbackEta = getConfigNumber(orderConfig, 'eta_minutes');
    if (!quoteSummary && fallbackCost == null && fallbackFreeFrom == null && fallbackEta == null) {
      return null;
    }
    const etaMinutes = quote?.eta_minutes != null
      ? Number(quote.eta_minutes)
      : fallbackEta;
    return {
      cost: quoteSummary?.delivery_cost ?? fallbackCost,
      etaMinutes: Number.isFinite(Number(etaMinutes)) ? Number(etaMinutes) : null,
      freeFrom: quoteSummary?.free_delivery_from ?? fallbackFreeFrom,
      hoursText: formatDeliveryHours(orderConfig, selectedDeliveryStore),
    };
  }, [deliverySubtotalForMeta, isDelivery, orderConfig, selectedAddress?.delivery_quote, selectedDeliveryStore]);
  const cartSummary = useMemo(
    () => buildCartSummaryState(activeLines, isDelivery && hasActiveLines ? Number(deliveryMeta?.cost || 0) : 0, bonusState, redeemActive, benefitsPreview, catalogSnapshot),
    [activeLines, benefitsPreview, bonusState, catalogSnapshot, deliveryMeta?.cost, hasActiveLines, isDelivery, redeemActive],
  );
  const cartSummaryLineStatesById = useMemo(() => {
    const entries = Array.isArray(cartSummary.lineStates) ? cartSummary.lineStates : [];
    return new Map(
      entries
        .map((entry) => [String(entry?.key || '').trim(), entry] as const)
        .filter(([key]) => !!key)
    );
  }, [cartSummary.lineStates]);
  const deliveryProgressSubtotal = Math.max(0, cartSummary.itemsTotal - cartSummary.bonusRedeemAmount);
  const visibleDeliveryProgress = isDelivery ? buildDeliveryProgress(deliveryProgressSubtotal, deliveryMeta) : null;
  const discountDetails = useMemo<CartDiscountDetailDisplayItem[]>(() => {
    const detailItems = Array.isArray(cartSummary.discountDetailItems)
      ? cartSummary.discountDetailItems
        .flatMap((entry, index): CartDiscountDetailDisplayItem[] => {
          const value = roundPrice(entry.amount);
          if (!(value > 0)) return [];
          return [{
            key: asText(entry.key) || `discount_${index}`,
            title: formatCartDiscountDetailTitle(entry),
            type: 'money' as const,
            value,
          }];
        })
      : [];
    const fallbackItems = detailItems.length || !(cartSummary.itemDiscountAmount > 0)
      ? []
      : [{
        key: 'items',
        title: 'Скидка товаров',
        type: 'money' as const,
        value: cartSummary.itemDiscountAmount,
      }];
    const bonusItems = cartSummary.bonusRedeemAmount > 0
      ? [{
        key: 'bonus',
        title: bonusState.coinName,
        type: 'bonus' as const,
        value: cartSummary.bonusRedeemAmount,
      }]
      : [];
    return [...detailItems, ...fallbackItems, ...bonusItems];
  }, [
    bonusState.coinName,
    cartSummary.bonusRedeemAmount,
    cartSummary.discountDetailItems,
    cartSummary.itemDiscountAmount,
  ]);
  const invalidateBenefitsPreview = useCallback(() => {
    benefitsPreviewSeqRef.current += 1;
    setBenefitsPreviewValue(null);
  }, [setBenefitsPreviewValue]);

  const applyLocalBenefitsPreviewForLines = useCallback((nextLines: CartLine[]) => {
    const activeCartLines = getActiveCartLines(nextLines);
    benefitsPreviewSeqRef.current += 1;
    if (!activeCartLines.length) {
      setBenefitsPreviewValue(null);
      setBenefitsCounts(emptyBenefitsCounts);
      return;
    }
    const currentSelection: CheckoutBenefitsSelection = {
      discountId: selectedDiscountId,
      discountSource: selectedDiscountSource,
      promoCode: appliedPromoCode,
      promoRewardId: selectedPromoRewardId,
      promoSource: selectedPromoSource,
    };
    const sourcePreview = benefitsPreviewRef.current;
    const nextPreview = deriveCheckoutBenefitsPreviewForLines(
      sourcePreview,
      currentSelection,
      activeCartLines,
      selection,
      catalogSnapshot,
    );
    if (nextPreview) {
      setBenefitsPreviewValue(nextPreview);
      void cacheCheckoutBenefitsPreviewForLines(nextPreview, {
        cartLines: activeCartLines,
        catalogSnapshot,
        fulfillmentSelection: selection,
        selection: currentSelection,
      }).catch(() => null);
      return;
    }
    setBenefitsPreviewValue(clearCheckoutPreviewMoneyState(sourcePreview));
  }, [
    appliedPromoCode,
    catalogSnapshot,
    selectedDiscountId,
    selectedDiscountSource,
    selectedPromoRewardId,
    selectedPromoSource,
    selection,
    setBenefitsPreviewValue,
  ]);

  const refreshBenefitsPreview = useCallback(async ({
    cartLines = lines,
    discountId = selectedDiscountId,
    discountSource = selectedDiscountSource,
    promo = appliedPromoCode,
    promoRewardId = selectedPromoRewardId,
    promoSource = selectedPromoSource,
    selectedFulfillment = selection,
    snapshot = catalogSnapshot,
  }: {
    cartLines?: CartLine[];
    discountId?: number | null;
    discountSource?: 'discount' | 'reward_discount' | null;
    promo?: string;
    promoRewardId?: number | null;
    promoSource?: 'promo_code' | 'reward_promo' | null;
    selectedFulfillment?: FulfillmentSelection;
    snapshot?: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null;
  } = {}) => {
    const safePromo = normalizePromoCode(promo);
    const activeCartLines = getActiveCartLines(cartLines);
    const seq = ++benefitsPreviewSeqRef.current;
    const mutationSeq = cartMutationSeqRef.current;
    const currentSelection: CheckoutBenefitsSelection = {
      discountId: discountId || null,
      discountSource: discountId ? (discountSource || 'discount') : null,
      promoCode: safePromo,
      promoRewardId: promoRewardId || null,
      promoSource: safePromo
        ? (promoSource || 'promo_code')
        : (promoRewardId ? (promoSource || 'reward_promo') : null),
    };
    if (!activeCartLines.length) {
      setBenefitsPreviewValue(null);
      setBenefitsCounts(emptyBenefitsCounts);
      return null;
    }
    const state = await ensureCheckoutBenefitsState({
      cartLines: activeCartLines,
      catalogSnapshot: snapshot || null,
      fulfillmentSelection: selectedFulfillment,
      selection: currentSelection,
    }).catch(() => null);
    if (seq === benefitsPreviewSeqRef.current && mutationSeq === cartMutationSeqRef.current) {
      setBenefitsPreviewValue(state?.preview || null);
      setBenefitsCounts(toCartBenefitsCounts(state?.counts || null));
      if (state?.currentSelection) {
        setSelectedDiscountId(state.currentSelection.discountId);
        setSelectedDiscountSource(state.currentSelection.discountSource);
        setSelectedPromoSource(state.currentSelection.promoSource);
        setSelectedPromoRewardId(state.currentSelection.promoRewardId);
        setAppliedPromoCode(state.currentSelection.promoCode);
      }
    }
    return state?.preview || null;
  }, [appliedPromoCode, catalogSnapshot, lines, selectedDiscountId, selectedDiscountSource, selectedPromoRewardId, selectedPromoSource, selection, setBenefitsPreviewValue]);

  const syncCartFromCache = useCallback(async () => {
    const mutationSeq = cartMutationSeqRef.current;
    const [nextLines, nextSelection, passport, cachedStores, cachedOrderConfig, cachedCatalogSnapshot] = await Promise.all([
      readCartLines(),
      readFulfillmentSelection(),
      readCachedCustomerPassport(),
      readCachedTenantStores(),
      readCachedPublicOrderConfig(),
      readCachedMobileCatalogSnapshot(),
    ]);
    const savedBenefitsSelection = await readCheckoutBenefitsSelection().catch(() => ({
      discountId: null,
      discountSource: null,
      promoCode: '',
      promoRewardId: null,
      promoSource: null,
    }));
    const cachedAddresses = passport?.token
      ? await readCachedCustomerAddresses(passport.token)
      : passport?.addresses || [];
    const catalogSyncedLines = nextLines.map((line) => syncCartLineCatalogPhoto(line, cachedCatalogSnapshot));
    const hasCatalogLineChanges = catalogSyncedLines.some((line, index) => line !== nextLines[index]);
    const stockState = await evaluateCartStockState(catalogSyncedLines, stockLevels);
    const syncedLines = stockState.lines;
    if (mutationSeq !== cartMutationSeqRef.current) {
      return {
        cachedAddresses,
        cachedCatalogSnapshot,
        cachedOrderConfig,
        cachedStores: cachedStores || [],
        nextSelection,
        passport,
        savedBenefitsSelection,
        syncedLines: linesRef.current.length ? linesRef.current : syncedLines,
      };
    }
    if (hasCatalogLineChanges) void saveCartLines(catalogSyncedLines).catch(() => null);

    linesRef.current = syncedLines;
    setLines(syncedLines);
    setStockBlockedLineIds(stockState.blockedLineIds);
    setSelection(nextSelection);
    setAddresses(cachedAddresses);
    setStores(cachedStores || []);
    setOrderConfig(cachedOrderConfig);
    setCustomerPassport(passport);
    setBonusConfig(passport?.bonusConfig || null);
    setBonusFavoriteCategories(passport?.bonusFavoriteCategories || null);
    setCatalogSnapshot(cachedCatalogSnapshot);
    setPromoCode(savedBenefitsSelection.promoCode || '');
    setAppliedPromoCode(savedBenefitsSelection.promoCode || '');
    setSelectedPromoSource(savedBenefitsSelection.promoSource);
    setSelectedPromoRewardId(savedBenefitsSelection.promoRewardId);
    setSelectedDiscountId(savedBenefitsSelection.discountId);
    setSelectedDiscountSource(savedBenefitsSelection.discountSource);

    if (passport?.token) {
      const cachedState = await readCheckoutBenefitsState({
        cartLines: syncedLines,
        catalogSnapshot: cachedCatalogSnapshot,
        fulfillmentSelection: nextSelection,
        selection: savedBenefitsSelection,
      }).catch(() => null);
      setBenefitsPreviewValue(cachedState?.preview || null);
      setBenefitsCounts(toCartBenefitsCounts(cachedState?.counts || null));
      void refreshBenefitsPreview({
        cartLines: syncedLines,
        discountId: savedBenefitsSelection.discountId,
        discountSource: savedBenefitsSelection.discountSource,
        promo: savedBenefitsSelection.promoCode,
        promoRewardId: savedBenefitsSelection.promoRewardId,
        promoSource: savedBenefitsSelection.promoSource,
        selectedFulfillment: nextSelection,
        snapshot: cachedCatalogSnapshot,
      }).catch(() => null);
    } else {
      setBenefitsCounts(emptyBenefitsCounts);
      setBenefitsPreviewValue(null);
      invalidateBenefitsPreview();
    }

    return {
      cachedAddresses,
      cachedCatalogSnapshot,
      cachedOrderConfig,
      cachedStores: cachedStores || [],
      nextSelection,
      passport,
      savedBenefitsSelection,
      syncedLines,
    };
  }, [invalidateBenefitsPreview, refreshBenefitsPreview, setBenefitsPreviewValue, stockLevels]);

  useEffect(() => {
    syncCartFromCacheRef.current = syncCartFromCache;
  }, [syncCartFromCache]);

  const loadCart = useCallback(async (refreshFromServer = false) => {
    const cachedState = await syncCartFromCache();
    const mutationSeq = cartMutationSeqRef.current;
    cartHydratedRef.current = true;
    setLoading(false);
    void warmFullProductPassports(collectCartStockProductIds(cachedState.syncedLines)).catch(() => null);
    if (!refreshFromServer) return;

    await (async () => {
      const { passport, cachedAddresses, cachedStores, cachedOrderConfig, syncedLines } = cachedState;
      const levelId = getCartBonusCurrentLevelId(passport?.bonusConfig || null);
      const [freshStores, freshOrderConfig, freshAddresses, freshBonusConfig] = await Promise.all([
        fetchTenantStores().catch(() => cachedStores),
        fetchPublicOrderConfig().catch(() => cachedOrderConfig),
        passport?.token ? fetchCustomerAddresses(passport.token).catch(() => cachedAddresses) : Promise.resolve(cachedAddresses),
        passport?.token ? fetchBonusConfig(passport.token).catch(() => passport.bonusConfig || null) : Promise.resolve(null),
      ]);
      const freshLevelId = getCartBonusCurrentLevelId(freshBonusConfig);
      const favoriteLevelId = freshLevelId || levelId;
      const freshBonusFavoriteCategories = passport?.token && favoriteLevelId > 0
        ? await fetchBonusFavoriteCategories(passport.token, favoriteLevelId).catch(() => passport.bonusFavoriteCategories || null)
        : passport?.bonusFavoriteCategories || null;
      if (!isSameCachedValue(freshStores, cachedStores)) setStores(freshStores);
      if (!isSameCachedValue(freshOrderConfig, cachedOrderConfig)) setOrderConfig(freshOrderConfig);
      if (!isSameCachedValue(freshAddresses, cachedAddresses)) setAddresses(freshAddresses);
      if (passport?.token) {
        setBonusConfig(freshBonusConfig);
        setBonusFavoriteCategories(freshBonusFavoriteCategories);
        const nextPassport = {
          ...(passport as CustomerPassport),
          addresses: freshAddresses,
          bonusConfig: freshBonusConfig,
          bonusFavoriteCategories: freshBonusFavoriteCategories,
          updatedAt: new Date().toISOString(),
        };
        setCustomerPassport(nextPassport);
        await saveCustomerPassport(nextPassport);
      }
      void evaluateCartStockState(syncedLines, stockLevels, refreshMany).then((stockState) => {
        if (mutationSeq !== cartMutationSeqRef.current) return;
        linesRef.current = stockState.lines;
        setLines(stockState.lines);
        setStockBlockedLineIds(stockState.blockedLineIds);
      }).catch(() => null);
    })().catch(() => null);
  }, [refreshMany, stockLevels, syncCartFromCache]);

  const refreshCart = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadCart(true).catch(() => null);
    } finally {
      setRefreshing(false);
    }
  }, [loadCart, refreshing]);

  useEffect(() => {
    void loadCart(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!cartHydratedRef.current) return;
      const sync = syncCartFromCacheRef.current;
      if (!sync) return;
      void sync().catch(() => null);
    }, []),
  );

  useEffect(() => {
    const token = String(customerPassport?.token || '').trim();
    if (!isDelivery || !selectedAddress || !token) {
      deliveryQuoteRequestKeyRef.current = null;
      return undefined;
    }
    const addressCacheKey = buildCustomerAddressCacheKey(selectedAddress);
    if (isFreshDeliveryQuoteForAddress(selectedAddress)) {
      if (deliveryQuoteRequestKeyRef.current === addressCacheKey) deliveryQuoteRequestKeyRef.current = null;
      return undefined;
    }
    if (deliveryQuoteRequestKeyRef.current === addressCacheKey) return undefined;
    deliveryQuoteRequestKeyRef.current = addressCacheKey;
    let cancelled = false;
    void ensureCustomerAddressDeliveryQuote(token, selectedAddress, deliverySubtotalForMeta)
      .then((quotedAddress) => {
        if (cancelled || !quotedAddress) return;
        setAddresses((current) => current.map((address) => (
          toPositiveId(address.id) === toPositiveId(quotedAddress.id) ? quotedAddress : address
        )));
      })
      .catch(() => null)
      .finally(() => {
        if (deliveryQuoteRequestKeyRef.current === addressCacheKey) {
          deliveryQuoteRequestKeyRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerPassport?.token, deliverySubtotalForMeta, isDelivery, selectedAddress]);

  const changeMode = useCallback(async (mode: FulfillmentMode) => {
    const pickupStoreId = mode === 'pickup'
      ? selection.pickupStoreId || toPositiveId(selectedStore?.id)
      : null;
    const addressId = mode === 'delivery'
      ? selection.addressId || toPositiveId(selectedAddress?.id)
      : null;
    const nextSelection = await saveFulfillmentSelection({
      ...selection,
      addressId,
      mode,
      pickupStoreId,
    });
    setSelection(nextSelection);
  }, [selectedAddress?.id, selectedStore?.id, selection]);

  const changeQuantity = useCallback(async (line: CartLine, delta: number) => {
    const mutationSeq = ++cartMutationSeqRef.current;
    const currentLines = linesRef.current.length ? linesRef.current : lines;
    const currentLine = currentLines.find((item) => item.id === line.id) || line;
    const baseQuantity = pendingLineQuantitiesRef.current.get(line.id) ?? Math.max(1, Number(currentLine.quantity || line.quantity || 1));
    const nextQuantity = Math.max(1, baseQuantity + delta);
    const nextLine = { ...currentLine, quantity: nextQuantity };
    const optimisticLines = replaceCartLine(currentLines, nextLine);
    if (delta > 0) {
      const localStockLimit = calculateCartStockLimit(optimisticLines, stockLevels, line.id);
      if (!localStockLimit.canAdd) {
        setStockBlockedLineIds((current) => new Set(current).add(line.id));
        return;
      }
    }
    pendingLineQuantitiesRef.current.set(line.id, nextQuantity);
    linesRef.current = optimisticLines;
    applyLocalBenefitsPreviewForLines(optimisticLines);
    setLines(optimisticLines);
    setStockBlockedLineIds((current) => {
      const next = new Set(current);
      const plusLine = { ...nextLine, quantity: Math.max(1, Number(nextLine.quantity || 1)) + 1 };
      const plusLimit = calculateCartStockLimit(replaceCartLine(optimisticLines, plusLine), stockLevels, line.id);
      if (!plusLimit.canAdd) {
        next.add(line.id);
      } else {
        next.delete(line.id);
      }
      return next;
    });
    const savedLines = await enqueueCartMutation(() => updateCartLineQuantity(line.id, nextQuantity));
    if (mutationSeq !== cartMutationSeqRef.current) return;
    pendingLineQuantitiesRef.current.delete(line.id);
    if (!isSameCachedValue(savedLines, optimisticLines)) {
      linesRef.current = savedLines;
      applyLocalBenefitsPreviewForLines(savedLines);
      setLines(savedLines);
    }
  }, [applyLocalBenefitsPreviewForLines, enqueueCartMutation, lines, stockLevels]);

  const removeLine = useCallback(async (line: CartLine) => {
    const mutationSeq = ++cartMutationSeqRef.current;
    const currentLines = linesRef.current.length ? linesRef.current : lines;
    const optimisticLines = currentLines.filter((item) => item.id !== line.id);
    pendingLineQuantitiesRef.current.delete(line.id);
    linesRef.current = optimisticLines;
    applyLocalBenefitsPreviewForLines(optimisticLines);
    setLines(optimisticLines);
    const nextLines = await enqueueCartMutation(() => removeCartLine(line.id));
    if (mutationSeq !== cartMutationSeqRef.current) return;
    if (!isSameCachedValue(nextLines, optimisticLines)) {
      linesRef.current = nextLines;
      applyLocalBenefitsPreviewForLines(nextLines);
      setLines(nextLines);
    }
    void evaluateCartStockState(nextLines, stockLevels, refreshMany).then((stockState) => {
      if (mutationSeq !== cartMutationSeqRef.current) return;
      if (!isSameCachedValue(stockState.lines, nextLines)) {
        linesRef.current = stockState.lines;
        applyLocalBenefitsPreviewForLines(stockState.lines);
        setLines(stockState.lines);
      }
      setStockBlockedLineIds(stockState.blockedLineIds);
    }).catch(() => null);
  }, [applyLocalBenefitsPreviewForLines, enqueueCartMutation, lines, refreshMany, stockLevels]);

  const clearCart = useCallback(async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    const mutationSeq = ++cartMutationSeqRef.current;
    const nextLines = await enqueueCartMutation(() => clearCartLines());
    if (mutationSeq !== cartMutationSeqRef.current) return;
    pendingLineQuantitiesRef.current.clear();
    linesRef.current = nextLines;
    invalidateBenefitsPreview();
    setLines(nextLines);
    setPromoCode('');
    setAppliedPromoCode('');
    setSelectedDiscountId(null);
    setSelectedDiscountSource(null);
    setSelectedPromoSource(null);
    setSelectedPromoRewardId(null);
    setBenefitsCounts(emptyBenefitsCounts);
    setPromoError('');
    setStockBlockedLineIds(new Set());
    setClearConfirm(false);
    await saveCheckoutBenefitsSelection({
      discountId: null,
      discountSource: null,
      promoCode: '',
      promoRewardId: null,
      promoSource: null,
    });
  }, [clearConfirm, enqueueCartMutation, invalidateBenefitsPreview]);

  useEffect(() => {
    if (!clearConfirm) return undefined;
    const timer = setTimeout(() => setClearConfirm(false), 6500);
    return () => clearTimeout(timer);
  }, [clearConfirm]);

  useEffect(() => {
    if (bonusState.balance > 0 && bonusState.redeemAvailableAmount > 0) return;
    setBonusRedeemEnabled(false);
  }, [bonusState.balance, bonusState.redeemAvailableAmount]);

  const changePromoCode = useCallback((value: string) => {
    setPromoCode(normalizePromoCodeInput(value));
    setPromoError('');
  }, []);

  const applyPromoCode = useCallback(async () => {
    const safePromo = normalizePromoCode(promoCode);
    if (!safePromo || promoApplyDisabled) return;
    const previousSelection: CheckoutBenefitsSelection = {
      discountId: selectedDiscountId,
      discountSource: selectedDiscountSource,
      promoCode: appliedPromoCode,
      promoRewardId: selectedPromoRewardId,
      promoSource: selectedPromoSource,
    };
    setApplyingPromo(true);
    setPromoError('');
    try {
      const state = await applyCheckoutPromoCodeSelection(safePromo, {
        cartLines: lines,
        catalogSnapshot,
        fulfillmentSelection: selection,
        selection: {
          discountId: selectedDiscountId,
          discountSource: selectedDiscountSource,
          promoCode: appliedPromoCode,
          promoRewardId: selectedPromoRewardId,
          promoSource: selectedPromoSource,
        },
      });
      const preview = state.preview;
      const selectedCard = findSelectedPromoCard(preview);
      const requestedCard = findPromoCardByCode(preview, safePromo);
      if (!selectedCard || normalizePromoCode(selectedCard.code) !== safePromo) {
        const code = asText(requestedCard?.disabled_reason_code) || 'PROMO_NOT_APPLICABLE';
        throw new Error(code);
      }
      setAppliedPromoCode(safePromo);
      setSelectedPromoSource(state.currentSelection.promoSource);
      setSelectedPromoRewardId(state.currentSelection.promoRewardId);
      setSelectedDiscountId(state.currentSelection.discountId);
      setSelectedDiscountSource(state.currentSelection.discountSource);
      setPromoCode(safePromo);
      setBenefitsPreviewValue(preview);
      setBenefitsCounts(toCartBenefitsCounts(state.counts));
    } catch (error) {
      await saveCheckoutBenefitsSelection(previousSelection);
      setAppliedPromoCode(previousSelection.promoCode);
      setSelectedPromoSource(previousSelection.promoSource);
      setSelectedPromoRewardId(previousSelection.promoRewardId);
      setSelectedDiscountId(previousSelection.discountId);
      setSelectedDiscountSource(previousSelection.discountSource);
      setPromoCode(previousSelection.promoCode);
      setPromoError(getPromoErrorMessage(error));
    } finally {
      setApplyingPromo(false);
    }
  }, [appliedPromoCode, catalogSnapshot, lines, promoApplyDisabled, promoCode, selectedDiscountId, selectedDiscountSource, selectedPromoRewardId, selectedPromoSource, selection, setBenefitsPreviewValue]);

  const openAddresses = useCallback(async () => {
    await saveFulfillmentSelection(selection);
    navigation.navigate(routes.addresses);
  }, [navigation, selection]);

  const openCheckout = useCallback(async () => {
    if (!hasActiveLines || hasProblemLines) return;
    let stockState = await evaluateCartStockState(lines, stockLevels, refreshMany);
    linesRef.current = stockState.lines;
    setLines(stockState.lines);
    setStockBlockedLineIds(stockState.blockedLineIds);
    if (stockState.lines.some((line) => line.isUnavailable === true)) return;
    const stockCheckLines = stockState.lines.filter((line) => line.isUnavailable !== true);
    const stockCheck = await checkOrderStock(cartLinesToStockCheckItems(stockCheckLines)).catch(() => null);
    if (Array.isArray(stockCheck?.stock_levels) && stockCheck.stock_levels.length) {
      const checkedStockLevels = mergeStockRows(stockCheck.stock_levels);
      stockState = await evaluateCartStockState(stockState.lines, checkedStockLevels, refreshMany);
      linesRef.current = stockState.lines;
      setLines(stockState.lines);
      setStockBlockedLineIds(stockState.blockedLineIds);
      if (stockState.lines.some((line) => line.isUnavailable === true)) return;
    }
    if (stockCheck && stockCheck.available === false) return;
    await Promise.all([
      saveFulfillmentSelection(selection),
      saveCheckoutCartSummary(cartSummary),
    ]);
    navigation.navigate(routes.checkout);
  }, [cartSummary, hasActiveLines, hasProblemLines, lines, mergeStockRows, navigation, refreshMany, selection, stockLevels]);

  const openBenefitPage = useCallback((page: keyof CartBenefitsCounts) => {
    if (page === 'discounts') {
      navigation.navigate(routes.discounts);
      return;
    }
    if (page === 'promocodes') {
      navigation.navigate(routes.promocodes);
      return;
    }
    if (page === 'gifts') {
      navigation.navigate(routes.gifts);
      return;
    }
    navigation.navigate(routes.tasks);
  }, [navigation]);

  const benefitIconItems = useMemo(() => {
    const sourceItems = Array.isArray(bonusConfig?.site_menu_items) ? bonusConfig.site_menu_items : [];
    const byKey = new Map<string, Record<string, unknown>>();
    sourceItems.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const key = String(item.key || '').trim();
      if (key) byKey.set(key, item);
    });
    const buildItem = (
      key: 'discounts' | 'gifts' | 'progress' | 'promocodes',
      menuKey: string,
      fallbackIcon: string,
      fallbackLabel: string,
    ) => {
      const item = byKey.get(menuKey) || {};
      return {
        count: key === 'discounts'
          ? benefitsCounts.discounts
          : key === 'gifts'
            ? benefitsCounts.gifts
            : key === 'progress'
              ? benefitsCounts.progress
              : benefitsCounts.promocodes,
        icon: fallbackIcon,
        iconUrl: resolveAssetUrl(String(item.icon_url || '').trim()),
        key,
        label: String(item.title || fallbackLabel).trim() || fallbackLabel,
      };
    };
    return [
      buildItem('discounts', 'discounts', 'pricetag-outline', 'Скидки'),
      buildItem('gifts', 'gifts', 'gift-outline', 'Подарки'),
      buildItem('progress', 'tasks', 'checkbox-outline', 'Задания'),
      buildItem('promocodes', 'promocodes', 'ticket-outline', 'Промокоды'),
    ];
  }, [bonusConfig?.site_menu_items, benefitsCounts.discounts, benefitsCounts.gifts, benefitsCounts.progress, benefitsCounts.promocodes]);

  const selectBonusAccrual = useCallback(() => {
    setBonusRedeemEnabled(false);
  }, []);

  const selectBonusRedeem = useCallback(() => {
    if (!(bonusState.balance > 0) || !(bonusState.redeemAvailableAmount > 0)) return;
    setBonusRedeemEnabled(true);
  }, [bonusState.balance, bonusState.redeemAvailableAmount]);

  const joinBonus = useCallback(async () => {
    const passport = await readCachedCustomerPassport();
    if (!passport?.token) return;
    await joinBonusProgram(passport.token);
    const freshConfig = await fetchBonusConfig(passport.token);
    const levelId = getCartBonusCurrentLevelId(freshConfig);
    const freshFavorites = levelId > 0
      ? await fetchBonusFavoriteCategories(passport.token, levelId).catch(() => null)
      : null;
    setBonusConfig(freshConfig);
    setBonusFavoriteCategories(freshFavorites);
    await saveCustomerPassport({
      ...passport,
      bonusConfig: freshConfig,
      bonusFavoriteCategories: freshFavorites,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const openLine = useCallback((line: CartLine) => {
    if (line.type === 'combo') {
      navigation.navigate(routes.combo, { cartLineId: line.id, comboId: line.sourceId });
      return;
    }
    navigation.navigate(routes.product, { cartLineId: line.id, productId: line.sourceId });
  }, [navigation]);

  const renderLine = (line: CartLine) => {
    const baseTotal = getLineTotal(line, catalogSnapshot);
    const previewTotal = getPreviewLineTotal(benefitsPreview, line, baseTotal);
    const summaryLineState = cartSummaryLineStatesById.get(line.id);
    const total = summaryLineState && Number.isFinite(Number(summaryLineState.currentTotal))
      ? roundPrice(Number(summaryLineState.currentTotal))
      : previewTotal;
    const oldTotal = summaryLineState && Number.isFinite(Number(summaryLineState.originalTotal))
      ? roundPrice(Math.max(Number(summaryLineState.originalTotal), baseTotal, total))
      : Math.max(getLineOldTotal(line, catalogSnapshot), baseTotal, total);
    const discountPercent = summaryLineState && Number.isFinite(Number(summaryLineState.discountPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(summaryLineState.discountPercent))))
      : getDiscountPercent(total, oldTotal);
    const promoBadgeText = getBuyXGetYBadgeText(getCartLineBuyXGetYBadge(line, catalogSnapshot));
    const unavailable = line.isUnavailable === true;
    const plusBlocked = unavailable || stockBlockedLineIds.has(line.id);
    const title = getCartLineTitle(line);
    const detailLines = getCartLineDetails(line);
    const itemPhotoUrl = line.type === 'product'
      ? getCartLineCatalogPhotoUrl(line, catalogSnapshot) || line.photoUrl || ''
      : line.photoUrl || '';
    const comboPhotos = line.type === 'combo' && Array.isArray(line.comboSelections)
      ? line.comboSelections.map((selection, index) => {
        const productId = Number(selection.productId || 0);
        const catalogPhoto = productId > 0 ? getCatalogSnapshotProduct(productId)?.photos?.[0] : '';
        return resolveAssetUrl(catalogPhoto || selection.productPhoto || line.photoUrls?.[index] || '');
      }).filter(Boolean).slice(0, 4)
      : [];
    const lineBadges = [
      discountPercent > 0 ? { key: 'discount', text: `-${discountPercent}%`, tone: 'discount' as const } : null,
      promoBadgeText ? { key: 'promo', text: promoBadgeText, tone: 'promo' as const } : null,
    ].filter((item): item is { key: string; text: string; tone: 'discount' | 'promo' } => !!item);
    return (
      <Pressable key={line.id} onPress={() => openLine(line)} style={[styles.itemCard, line.isUnavailable ? styles.itemUnavailable : null]}>
        <View style={styles.itemTop}>
          {comboPhotos.length ? (
            <View style={styles.comboImageGrid}>
              {[0, 1, 2, 3].map((index) => {
                const uri = comboPhotos[index];
                return (
                  <View key={index} style={styles.comboImageCell}>
                    {uri ? Platform.OS === 'web' ? (
                      <Image resizeMode="cover" source={{ uri }} style={styles.comboImage} />
                    ) : (
                      <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri }} style={styles.comboImage} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.itemImageWrap}>
              {itemPhotoUrl ? (
                Platform.OS === 'web' ? (
                  <Image resizeMode="cover" source={{ uri: itemPhotoUrl }} style={styles.itemImage} />
                ) : (
                  <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: itemPhotoUrl }} style={styles.itemImage} />
                )
              ) : (
                <View style={styles.itemImagePlaceholder}>
                  <Ionicons name={line.type === 'combo' ? 'grid-outline' : 'restaurant-outline'} color={theme.colors.accent} size={26} />
                </View>
              )}
            </View>
          )}
          <View style={styles.itemMain}>
            <Text numberOfLines={2} style={styles.itemTitle}>{line.quantity} x {title}</Text>
            {unavailable ? <Text style={styles.itemUnavailableText}>Больше нет</Text> : null}
            {plusBlocked && !unavailable ? <Text style={styles.itemUnavailableText}>Больше нет</Text> : null}
            {detailLines.length ? (
              <View style={styles.itemDetails}>
                {detailLines.map((detail, index) => {
                  const prefix = detail.trim().startsWith('1 x ') ? '' : '• ';
                  return (
                    <Text key={`${index}:${detail}`} numberOfLines={1} style={styles.itemDetail}>{prefix}{detail}</Text>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.itemBottom}>
          <View style={styles.itemBadgeRail}>
            {lineBadges.length ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.itemBadgeRailContent}
                horizontal
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
              >
                {lineBadges.map((badge) => (
                  <ProductBadge key={badge.key} text={badge.text} tone={badge.tone} />
                ))}
              </ScrollView>
            ) : null}
          </View>
          <View style={styles.quantityStepper}>
            <ProductQuantityButton
              hitSlop={cartQuantityTapSlop}
              onPress={(event) => {
                event.stopPropagation();
                return line.quantity <= 1 ? removeLine(line) : changeQuantity(line, -1);
              }}
            >
              <Ionicons name={line.quantity <= 1 ? 'trash' : 'remove'} color={theme.colors.primaryText} size={line.quantity <= 1 ? 15 : 14} />
            </ProductQuantityButton>
            <View style={styles.quantityPriceCenter}>
              <Text
                numberOfLines={1}
                style={[styles.itemOldPrice, oldTotal > total ? null : styles.itemOldPriceHidden]}
              >
                {oldTotal > total ? formatPrice(oldTotal) : formatPrice(total)}
              </Text>
              <Text numberOfLines={1} style={[styles.itemPrice, styles.quantityPrice]}>{formatPrice(total)}</Text>
              <Text numberOfLines={1} style={styles.qtyText}>{line.quantity} шт</Text>
            </View>
            <ProductQuantityButton
              disabled={plusBlocked}
              hitSlop={cartQuantityTapSlop}
              onPress={(event) => {
                event.stopPropagation();
                if (plusBlocked) return undefined;
                return changeQuantity(line, 1);
              }}
            >
              <Ionicons name="add" color={theme.colors.primaryText} size={16} />
            </ProductQuantityButton>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <>
            <Animated.View style={styles.modeCard}>
              <Animated.View
                style={[
                  styles.toggleClip,
                  { height: toggleHeight, opacity: toggleOpacity, transform: [{ translateY: toggleTranslateY }] },
                ]}
              >
              <View style={styles.toggle}>
                {(['delivery', 'pickup'] as FulfillmentMode[]).map((mode) => {
                  const active = selection.mode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => changeMode(mode)}
                      style={[styles.toggleButton, active && styles.toggleButtonActive]}
                    >
                      {active ? <AccentGradientSurface /> : null}
                      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                        {mode === 'delivery' ? 'Доставка' : 'Самовывоз'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              </Animated.View>

              <Animated.View style={{ marginTop: addressMarginTop }}>
              <Pressable onPress={openAddresses} style={styles.addressRow}>
                <View style={styles.deliveryMetaIcon}>
                  <AccentGradientSurface shape="rounded" />
                  <Ionicons name={isDelivery ? 'location' : 'storefront'} color={theme.colors.primaryText} size={16} />
                </View>
                <Text numberOfLines={1} style={styles.addressText}>
                  {isDelivery
                    ? formatAddressLine(selectedAddress) || 'Укажите адрес'
                    : String(selectedStore?.address || selectedStore?.name || 'Выберите точку самовывоза')}
                </Text>
                <Ionicons name="chevron-forward" color={theme.colors.text} size={20} />
              </Pressable>
              </Animated.View>

              <Animated.View
                style={[
                  styles.metaClip,
                  { height: metaHeight, opacity: metaOpacity, transform: [{ translateY: metaTranslateY }] },
                ]}
              >
              <View style={styles.metaWrap}>
                <View style={styles.metaRow}>
                  <View style={styles.deliveryMetaIcon}>
                    <AccentGradientSurface shape="rounded" />
                    <Ionicons name={isDelivery ? 'car' : 'bag-handle'} color={theme.colors.primaryText} size={16} />
                  </View>
                  <Text style={styles.metaText}>
                    {isDelivery ? formatEta(deliveryMeta?.etaMinutes ?? null) : 'Самовывоз из выбранной точки'}
                  </Text>
                  {isDelivery && deliveryMeta?.freeFrom ? (
                    <Text style={styles.metaSide}>Бесплатно от {formatPrice(deliveryMeta.freeFrom)}</Text>
                  ) : isDelivery && deliveryMeta?.cost != null ? (
                    <Text style={styles.metaSide}>Доставка {formatPrice(deliveryMeta.cost)}</Text>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.deliveryMetaIcon}>
                    <AccentGradientSurface shape="rounded" />
                    <Ionicons name="time" color={theme.colors.primaryText} size={16} />
                  </View>
                  <Text style={styles.metaText}>
                    {isDelivery
                      ? deliveryMeta?.hoursText || 'Время доставки уточняется'
                      : formatStoreHours(selectedStore) || 'Время работы уточняется'}
                  </Text>
                </View>
              </View>
              </Animated.View>

              {visibleDeliveryProgress ? (
                <Animated.View style={[styles.progressSurface, { marginTop: progressMarginTop }]}>
                  <View style={[styles.progressFill, { width: `${visibleDeliveryProgress.value}%` }]}>
                    <AccentGradientSurface />
                  </View>
                  <Text style={[styles.progressLabel, visibleDeliveryProgress.free && styles.progressLabelFree]}>
                    {visibleDeliveryProgress.label}
                  </Text>
                </Animated.View>
              ) : null}
            </Animated.View>

            <Animated.ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.content,
                visibleDeliveryProgress ? styles.contentWithHeader : styles.contentWithHeaderWithoutProgress,
              ]}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: headerScrollY } } }],
                { listener: syncInlineCheckoutVisibility, useNativeDriver: false },
              )}
              refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.accent} onRefresh={refreshCart} />}
              scrollEventThrottle={16}
            >
            <View style={styles.itemsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Товары</Text>
                {lines.length ? (
                  <Pressable onPress={clearCart} style={[styles.clearButton, clearConfirm && styles.clearButtonConfirm]}>
                    {clearConfirm ? (
                      <Text numberOfLines={1} style={styles.clearConfirmText}>Очистить корзину?</Text>
                    ) : (
                      <Ionicons name="trash-outline" color={theme.colors.text} size={20} />
                    )}
                  </Pressable>
                ) : null}
              </View>
              {lines.length ? (
                <View style={styles.itemsList}>
                  {lines.map(renderLine)}
                </View>
              ) : (
                <View style={styles.emptyCart}>
                  <Ionicons name="cart-outline" color={theme.colors.muted} size={34} />
                  <Text style={styles.emptyTitle}>Корзина пуста</Text>
                  <Text style={styles.emptyText}>Добавьте товары из каталога</Text>
                </View>
              )}
            </View>

            {hasActiveLines && customerPassport?.token ? (
              <View style={styles.benefitsCard}>
                <View style={styles.benefitIconRow}>
                  {benefitIconItems.map((item) => {
                    const active = item.count > 0;
                    return (
                      <Pressable
                        accessibilityLabel={item.label}
                        key={item.key}
                        onPress={() => openBenefitPage(item.key)}
                        style={styles.benefitIconItem}
                      >
                        <View style={[styles.benefitIconButton, active && styles.benefitIconButtonActive]}>
                          {item.iconUrl ? (
                            <Image
                              resizeMode="contain"
                              source={{ uri: item.iconUrl }}
                              style={[styles.benefitIconImage, !active && styles.benefitIconImageInactive]}
                            />
                          ) : (
                            <Ionicons
                              name={item.icon as keyof typeof Ionicons.glyphMap}
                              color={active ? theme.colors.accent : theme.colors.muted}
                              size={24}
                            />
                          )}
                          <View pointerEvents="none" style={styles.benefitIconLabelOverlay}>
                            <Text numberOfLines={2} style={styles.benefitIconLabel}>{item.label}</Text>
                          </View>
                          {active ? (
                            <ProductBadge style={styles.benefitIconBadge} text={String(item.count)} tone="promo" />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.promoBlock}>
                  <View style={styles.promoInputRow}>
                    <View style={styles.promoInputSurface}>
                      <AppTextInput
                        autoCapitalize="characters"
                        autoCorrect={false}
                        onChangeText={changePromoCode}
                        placeholder="ВВЕДИТЕ ПРОМОКОД"
                        placeholderTextColor={theme.colors.muted}
                        style={styles.promoInput}
                        value={promoCode}
                      />
                    </View>
                    <Pressable disabled={promoApplyDisabled} onPress={applyPromoCode} style={[styles.promoApplyButton, promoApplyDisabled && styles.promoApplyButtonDisabled, promoIsCurrent && styles.promoApplyButtonCurrent]}>
                      <Text style={[styles.promoApplyText, promoApplyDisabled && styles.promoApplyTextDisabled, promoIsCurrent && styles.promoApplyTextCurrent]}>
                        {isApplyingPromo ? 'Проверяем' : promoIsCurrent ? 'Активен' : 'Применить'}
                      </Text>
                    </Pressable>
                  </View>
                  {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}
                </View>
              </View>
            ) : null}

            {hasActiveLines && bonusState.isProgramEnabled ? (
              bonusState.isJoined ? (
                <View style={styles.bonusCard}>
                  <View style={styles.bonusActions}>
                    <View style={styles.bonusInfoPanel}>
                      <View style={styles.bonusInfoRow}>
                        <Text style={styles.bonusInfoLabel}>Баланс</Text>
                        <View style={styles.bonusBalanceCapsule}>
                          <BonusAmount amount={bonusState.balance} emphasis logoUrl={bonusState.coinLogoUrl} size="sm" suffix={bonusState.coinName} />
                        </View>
                      </View>
                    </View>
                    <View style={styles.bonusActionColumn}>
                      <Text numberOfLines={1} style={styles.bonusActionLabel}>Начислить</Text>
                      <Pressable
                        onPress={selectBonusAccrual}
                        style={[styles.bonusActionButton, !redeemActive && styles.bonusActionButtonActive]}
                      >
                        {!redeemActive ? <AccentGradientSurface /> : null}
                        <BonusAmount
                          amount={bonusState.accrualAmount}
                          color={!redeemActive ? theme.colors.primaryText : theme.colors.text}
                          emphasis
                          logoUrl={bonusState.coinLogoUrl}
                          prefix="+"
                          size="sm"
                          suffix={bonusState.coinName}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.bonusActionColumn}>
                      <Text numberOfLines={1} style={styles.bonusActionLabel}>Списать</Text>
                      <Pressable
                        disabled={!(bonusState.balance > 0 && bonusState.redeemAvailableAmount > 0)}
                        onPress={selectBonusRedeem}
                        style={[
                          styles.bonusActionButton,
                          redeemActive && styles.bonusActionButtonActive,
                          !(bonusState.balance > 0 && bonusState.redeemAvailableAmount > 0) && styles.bonusActionButtonDisabled,
                        ]}
                      >
                        {redeemActive ? <AccentGradientSurface /> : null}
                        <View style={styles.bonusActionAmountGroup}>
                          <BonusAmount
                            amount={bonusState.redeemAvailableAmount}
                            color={redeemActive ? theme.colors.primaryText : theme.colors.text}
                            emphasis
                            logoUrl={bonusState.coinLogoUrl}
                            prefix="-"
                            size="sm"
                            suffix={bonusState.coinName}
                          />
                          {bonusState.allowRedeemAndAccrue && bonusState.accrualAmount > 0 ? (
                            <BonusAmount
                              amount={bonusState.accrualAmount}
                              color={redeemActive ? theme.colors.primaryText : theme.colors.text}
                              emphasis
                              logoUrl={bonusState.coinLogoUrl}
                              prefix="+"
                              size="sm"
                              suffix={bonusState.coinName}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.bonusCard}>
                  <View style={styles.bonusJoinCopy}>
                    <Text style={styles.bonusJoinTitle}>Присоединитесь к бонусной программе</Text>
                    <Text style={styles.bonusJoinText}>и получайте бонусы за заказы</Text>
                  </View>
                  <View style={styles.bonusJoinStats}>
                    <View style={styles.bonusJoinReward}>
                      <BonusAmount amount={bonusState.joinRewardAmount} logoUrl={bonusState.coinLogoUrl} suffix={bonusState.coinName} />
                      <Text style={styles.bonusJoinRewardNote}>за вступление</Text>
                    </View>
                    <View style={styles.bonusJoinPercents}>
                      <Text style={styles.bonusJoinPercentText}>Кэшбэк: {bonusState.joinCashbackText}</Text>
                      <Text style={styles.bonusJoinPercentText}>Списание: до {bonusState.joinRedeemText}</Text>
                    </View>
                  </View>
                  <Pressable onPress={joinBonus} style={styles.bonusJoinButton}>
                    <Text style={styles.bonusJoinButtonText}>Присоединиться</Text>
                  </Pressable>
                </View>
              )
            ) : null}

            {hasActiveLines ? (
              <View style={styles.summaryCard}>
                {isDelivery ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Стоимость доставки</Text>
                    <Text style={styles.summaryValue}>{formatPrice(cartSummary.deliveryCost)}</Text>
                  </View>
                ) : null}

                {visibleDeliveryProgress?.label ? (
                  <Text style={styles.summaryNote}>{visibleDeliveryProgress.label}</Text>
                ) : null}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Сумма товаров</Text>
                  <Text style={styles.summaryValue}>{formatPrice(cartSummary.subtotalBeforeDiscount)}</Text>
                </View>

                {cartSummary.discountAmount > 0 ? (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryLabelWrap}>
                      <Text style={styles.summaryLabel}>Скидка</Text>
                      {discountDetails.length ? (
                        <Pressable hitSlop={cartSummaryInfoTapSlop} onPress={() => setDiscountDetailsVisible(true)} style={styles.summaryInfoButton}>
                          <Ionicons name="information" color={theme.colors.muted} size={11} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={styles.summaryDiscountValue}>-{formatPrice(cartSummary.discountAmount)}</Text>
                  </View>
                ) : null}

                {cartSummary.bonusAccrualAmount > 0 ? (
                  <View style={[styles.summaryRow, styles.summaryBonusRow]}>
                    <View style={styles.summaryLabelWrap}>
                      <Text style={styles.summaryLabel}>{bonusState.coinName}</Text>
                      {cartSummary.bonusAccrualBlockedByRedeem ? (
                        <Pressable hitSlop={cartSummaryInfoTapSlop} onPress={() => setBonusDetailsVisible(true)} style={styles.summaryInfoButton}>
                          <Ionicons name="information" color={theme.colors.muted} size={11} />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={cartSummary.bonusAccrualBlockedByRedeem ? styles.summaryBonusBlocked : null}>
                      <BonusAmount
                        amount={cartSummary.bonusAccrualAmount}
                        color={theme.colors.accent}
                        logoUrl={bonusState.coinLogoUrl}
                        prefix="+"
                        size="sm"
                        suffix={bonusState.coinName}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.summaryDivider} />
                <View style={styles.summaryTotalRow}>
                  <Text style={styles.summaryTotalLabel}>Итого</Text>
                  <Text style={styles.summaryTotalValue}>{formatPrice(cartSummary.total)}</Text>
                </View>
                <Pressable
                  ref={checkoutButtonRef}
                  disabled={hasProblemLines}
                  onLayout={syncInlineCheckoutVisibility}
                  onPress={openCheckout}
                  style={[styles.checkoutButton, hasProblemLines && styles.checkoutButtonDisabled]}
                >
                  <AccentGradientSurface />
                  <Text style={styles.checkoutButtonText}>Оформить</Text>
                  <Text style={styles.checkoutButtonText}>· {formatPrice(cartSummary.total)}</Text>
                </Pressable>
              </View>
            ) : null}
            </Animated.ScrollView>
            {lines.length > 0 && !inlineCheckoutVisible ? (
              <View
                pointerEvents="box-none"
                style={[
                  styles.floatingCheckoutWrap,
                  {
                    bottom: theme.sizes.tabBarHeight + Math.max(0, insets.bottom) + theme.spacing.sm,
                  },
                ]}
              >
                <Pressable
                  disabled={hasProblemLines}
                  onPress={openCheckout}
                  style={[styles.checkoutButton, styles.floatingCheckoutButton, hasProblemLines && styles.checkoutButtonDisabled]}
                >
                  <AccentGradientSurface />
                  <Text style={styles.checkoutButtonText}>Оформить</Text>
                  <Text style={styles.checkoutButtonText}>· {formatPrice(cartSummary.total)}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
        <BottomSheet
          onClose={() => setDiscountDetailsVisible(false)}
          title="Детали скидки"
          visible={discountDetailsVisible}
        >
          <View style={styles.discountDetailsSheet}>
            {discountDetails.map((detail) => (
              <View key={detail.key} style={styles.discountDetailsRow}>
                <Text style={styles.discountDetailsLabel}>{detail.title}</Text>
                {detail.type === 'bonus' ? (
                  <View style={styles.discountDetailsBonusValue}>
                    <Text style={styles.discountDetailsValue}>-</Text>
                    <BonusAmount
                      amount={detail.value}
                      color={theme.colors.accent}
                      logoUrl={bonusState.coinLogoUrl}
                      size="sm"
                      suffix={bonusState.coinName}
                    />
                  </View>
                ) : (
                  <Text style={styles.discountDetailsValue}>-{formatPrice(detail.value)}</Text>
                )}
              </View>
            ))}
          </View>
        </BottomSheet>
        <BottomSheet
          onClose={() => setBonusDetailsVisible(false)}
          title="Детали бонусов"
          visible={bonusDetailsVisible}
        >
          <View style={styles.discountDetailsSheet}>
            <View style={styles.discountDetailsRow}>
              <Text style={styles.discountDetailsLabel}>Начисление</Text>
              <View style={styles.discountDetailsBonusValue}>
                <BonusAmount
                  amount={cartSummary.bonusAccrualAmount}
                  color={theme.colors.accent}
                  logoUrl={bonusState.coinLogoUrl}
                  prefix="+"
                  size="sm"
                  suffix={bonusState.coinName}
                />
              </View>
            </View>
            <View style={styles.discountDetailsRow}>
              <Text style={styles.discountDetailsLabel}>Статус</Text>
              <Text style={styles.discountDetailsValue}>Не применяется</Text>
            </View>
            <Text style={styles.bonusDetailsNote}>
              На вашем уровне недоступно одновременно списывать и начислять бонусы.
            </Text>
          </View>
        </BottomSheet>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  addressText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  benefitCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minHeight: 23,
    minWidth: 23,
    paddingHorizontal: 7,
  },
  benefitCountText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  benefitIconBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 2,
  },
  benefitIconImage: {
    height: '100%',
    width: '100%',
  },
  benefitIconImageInactive: {
    opacity: 0.38,
  },
  benefitIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  benefitIconButtonActive: {
    backgroundColor: '#fff3ea',
    borderColor: '#ffd3b6',
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 2,
  },
  benefitIconRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  benefitIconItem: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  benefitIconLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    textAlign: 'center',
    width: '100%',
  },
  benefitIconLabelOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    minHeight: 22,
    paddingHorizontal: 3,
    paddingVertical: 1,
    position: 'absolute',
    right: 0,
    shadowColor: '#ffffff',
    shadowOffset: { height: -4, width: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 5,
    zIndex: 2,
  },
  benefitLabel: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 38,
  },
  benefitRowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  benefitsDivider: {
    backgroundColor: theme.colors.border,
    height: 1,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  benefitsCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    shadowColor: theme.colors.text,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  bonusActionAmountGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
  },
  bonusAmount: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  bonusAmountIcon: {
    flexShrink: 0,
  },
  bonusAmountSuffix: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  bonusAmountSuffixLarge: {
    fontSize: 18,
  },
  bonusAmountSuffixSmall: {
    fontSize: 11,
  },
  bonusAmountText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  bonusAmountTextLarge: {
    fontSize: 26,
  },
  bonusAmountTextSmall: {
    fontSize: 12,
  },
  bonusAmountTextEmphasis: {
    fontSize: 14,
  },
  bonusActionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    elevation: 3,
    flex: 1,
    justifyContent: 'center',
    height: 36,
    minWidth: 0,
    paddingHorizontal: 6,
    shadowColor: '#141d30',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  bonusActionButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 2,
  },
  accentGradientSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  accentGradientSurfaceRounded: {
    borderRadius: 12,
  },
  bonusActionButtonDisabled: {
    opacity: 0.55,
  },
  bonusActionColumn: {
    alignItems: 'stretch',
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  bonusActionLabel: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
    width: '100%',
  },
  bonusActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  bonusAvailable: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 'auto',
  },
  bonusAvailableLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  bonusCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    marginTop: theme.spacing.lg,
    padding: 10,
    shadowColor: theme.colors.text,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  bonusHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  bonusInfoLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  bonusBalanceCapsule: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    elevation: 3,
    height: 36,
    justifyContent: 'center',
    minWidth: 72,
    shadowColor: '#141d30',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    width: '82%',
  },
  bonusInfoPanel: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-evenly',
    minWidth: 0,
  },
  bonusInfoRow: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  bonusJoinButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 2,
  },
  bonusJoinButtonText: {
    color: theme.colors.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  bonusJoinCopy: {
    gap: 4,
  },
  bonusJoinPercents: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  bonusJoinPercentText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  bonusJoinReward: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  bonusJoinRewardNote: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  bonusJoinStats: {
    gap: 6,
  },
  bonusJoinText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  bonusJoinTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  bonusDetailsNote: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  bonusLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  clearButtonConfirm: {
    paddingHorizontal: theme.spacing.md,
    width: 'auto',
  },
  clearConfirmText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  checkoutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    elevation: 5,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 50,
    marginTop: theme.spacing.md,
    shadowColor: '#141d30',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  checkoutButtonDisabled: {
    opacity: 0.45,
  },
  checkoutButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  floatingCheckoutWrap: {
    alignItems: 'center',
    left: theme.spacing.lg,
    position: 'absolute',
    right: theme.spacing.lg,
    zIndex: 4,
  },
  floatingCheckoutButton: {
    marginTop: 0,
    maxWidth: 254,
    width: '100%',
  },
  comboImage: {
    height: '100%',
    width: '100%',
  },
  comboImageCell: {
    backgroundColor: theme.colors.mutedBackground,
    height: '50%',
    overflow: 'hidden',
    width: '50%',
  },
  comboImageGrid: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 70,
    overflow: 'hidden',
    width: 70,
  },
  content: {
    paddingBottom: theme.sizes.tabBarHeight + theme.spacing.xl,
  },
  contentWithHeader: {
    paddingTop: CART_HEADER_FULL_HEIGHT,
  },
  contentWithHeaderWithoutProgress: {
    paddingTop: CART_HEADER_WITHOUT_PROGRESS_HEIGHT,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: theme.spacing.sm,
  },
  itemBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    position: 'relative',
  },
  itemBadgeRail: {
    flex: 1,
    minWidth: 0,
  },
  itemBadgeRailContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 4,
  },
  itemTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  itemDetail: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  itemDetails: {
    marginTop: theme.spacing.xs,
  },
  itemImage: {
    height: '100%',
    width: '100%',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    flex: 1,
    justifyContent: 'center',
  },
  itemImageWrap: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 70,
    overflow: 'hidden',
    width: 70,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemOldPrice: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 9,
    minHeight: 9,
    textDecorationLine: 'line-through',
  },
  itemOldPriceHidden: {
    opacity: 0,
  },
  itemPrice: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  quantityPrice: {
    fontSize: 16,
    lineHeight: 16,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    paddingRight: 0,
  },
  itemUnavailable: {
    opacity: 0.55,
  },
  itemUnavailableText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  itemsList: {
    gap: theme.spacing.md,
  },
  itemsSection: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.text,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  deliveryMetaIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    elevation: 3,
    height: 28,
    justifyContent: 'center',
    shadowColor: '#141d30',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    width: 28,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metaSide: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  metaText: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  metaWrap: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  metaClip: {
    overflow: 'hidden',
  },
  modeCard: {
    backgroundColor: theme.colors.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 3,
    left: 0,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  priceRow: {
    gap: 1,
  },
  promoApplyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    height: 47,
    justifyContent: 'center',
    minWidth: 116,
    paddingHorizontal: theme.spacing.md,
  },
  promoApplyButtonDisabled: {
    backgroundColor: '#f5f5f5',
  },
  promoApplyButtonCurrent: {
    backgroundColor: '#fff1e8',
  },
  promoApplyText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  promoApplyTextDisabled: {
    color: theme.colors.muted,
  },
  promoApplyTextCurrent: {
    color: theme.colors.accent,
  },
  promoErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: theme.spacing.xs,
  },
  promoInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    height: 47,
    padding: 0,
  },
  promoInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  promoBlock: {
    gap: theme.spacing.xs,
  },
  promoInputSurface: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    height: 47,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  priceGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: theme.spacing.sm,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  progressLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.sm,
  },
  progressLabelFree: {
    color: theme.colors.primaryText,
  },
  progressSurface: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  quantityPriceCenter: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'space-between',
    minWidth: 86,
    paddingHorizontal: 5,
  },
  quantityStepper: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: 154,
    height: 32,
  },
  qtyText: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 9,
    textAlign: 'center',
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  summaryBonusBlocked: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
  },
  summaryBonusRow: {
    alignItems: 'center',
  },
  summaryCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    gap: 10,
    marginTop: theme.spacing.lg,
    padding: 18,
    shadowColor: theme.colors.text,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 3,
  },
  summaryDiscountValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  summaryDivider: {
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderTopWidth: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  summaryLabel: {
    color: theme.colors.muted,
    fontSize: 15,
  },
  summaryLabelWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  summaryInfoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  summaryNote: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  summaryTotalLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  summaryTotalValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  discountDetailsBonusValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  discountDetailsLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 15,
  },
  discountDetailsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  discountDetailsSheet: {
    gap: theme.spacing.md,
  },
  discountDetailsValue: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  toggle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    padding: 3,
  },
  toggleClip: {
    overflow: 'hidden',
  },
  toggleButton: {
    borderRadius: theme.radius.pill,
    minWidth: 120,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  toggleText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  toggleTextActive: {
    color: theme.colors.primaryText,
  },
});
