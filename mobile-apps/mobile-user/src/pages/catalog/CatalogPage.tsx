import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  memo,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore } from 'react';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainTabParamList, RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import type { CatalogCategory, CatalogCombo, CatalogProduct, CatalogProductPassport, MobileCatalogSnapshot, UnitConversion } from '../../entities/product';
import { addCartLine, makeCartLineId, readCartLines, updateCartLineQuantity, type CartIngredient, type CartLine, type CartLineDraft, type CartOptionItem, type CartVariant } from '../../features/cart';
import {
  readFulfillmentSelection,
  saveFulfillmentSelection,
  type FulfillmentMode,
  type FulfillmentSelection,
} from '../../features/checkout';
import { calculateCartStockLimit, getStockProductIdsForLines, useProductStock } from '../../features/stock';
import {
  apiConfig,
  buildCustomerAddressCacheKey,
  ensureCustomerAddressDeliveryQuote,
  fetchCatalogComboDetails,
  fetchCatalogByCategories,
  fetchCatalogCategories,
  fetchMobileCatalogIndex,
  fetchCustomerAddresses,
  fetchPublicOrderConfig,
  fetchTenantStores,
  ensureMobileCatalogProductPassport,
  getCatalogProductPassport,
  getMemoryCatalogComboDetails,
  isFreshDeliveryQuoteForAddress,
  isSameCachedValue,
  readCachedCatalogComboDetails,
  readCachedCustomerAddresses,
  readCachedCustomerPassport,
  readCachedCatalogCategory,
  readCachedMobileCatalogIndex,
  readCachedMobileCatalogSnapshot,
  readCachedPublicOrderConfig,
  readCachedTenantStores,
  resolveAssetUrl,
  saveCatalogCategory,
  saveMobileCatalogIndex,
  saveMobileCatalogSnapshot,
  type MobileCatalogIndex,
  type CustomerAddress,
  type CustomerPassport,
  type PublicOrderConfig,
  type TenantStore,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { calculateBuyXGetYLineTotals, getBuyXGetYBadgeText as getBuyXGetYBadgeTextFromRule } from '../../shared/lib/buyXGetY';
import { formatPrice } from '../../shared/lib/formatPrice';
import {
  getProductAvailabilityState,
  getUnitConversionFactor,
  extractStockRowsFromAvailabilityPayload,
  isAvailableValue,
  isProductStockAvailable,
  extractStockRowsFromCatalogPassports,
  stockLevelFromProduct,
  type ProductAvailabilityState,
  type ProductStockLevel,
} from '../../shared/lib/productStock';
import { Screen } from '../../shared/ui/Screen';
import {
  buildCatalogItemLayouts,
  buildCatalogListItems,
  type CatalogCardItem,
  type CatalogCategoryCount,
  type CatalogItemLayout,
  type CatalogListItem,
} from './catalogLayout';

import { AppText as Text, ProductBadge } from '../../shared/ui';
type CatalogNavigation = NativeStackNavigationProp<RootStackParamList>;
type CatalogRoute = RouteProp<MainTabParamList, 'home'>;

type CatalogState = {
  categories: CatalogCategory[];
  productsByCategory: Map<number, CatalogProduct[]>;
  combosByCategory: Map<number, CatalogCombo[]>;
  productPassports: Map<number, CatalogProductPassport>;
};

type CategoryLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
type CategoryLoadStateMap = Record<string, CategoryLoadStatus>;
type CategoryDataCache = {
  combosByCategory: Map<number, CatalogCombo[]>;
  productPassports: Map<number, CatalogProductPassport>;
  productsByCategory: Map<number, CatalogProduct[]>;
};

type NumberValueStore = {
  getSnapshot: () => number | null;
  set: (value: number | null) => void;
  subscribe: (listener: () => void) => () => void;
};

type ComboRotationCoordinator = {
  beginTick: (rotationKey: number) => void;
  getStartSnapshot: () => number | null;
  markPending: (cardKey: string, rotationKey: number) => void;
  markReady: (cardKey: string, rotationKey: number) => void;
  subscribeStart: (listener: () => void) => () => void;
  unregister: (cardKey: string) => void;
};

type ProductRuntimeStore = {
  emit: (productIds: number[]) => void;
  getSnapshot: (productId: number) => number;
  subscribe: (productId: number, listener: () => void) => () => void;
};

type ProductCardViewModel = {
  availability: ProductAvailabilityState;
  canIncrease: boolean;
  defaultLines: string[];
  discountText: string;
  hasQuantity: boolean;
  image: string;
  mediaPillText: string;
  oldPrice: number;
  price: number;
  promoBadgeText: string;
  title: string;
  totalOldPrice: number;
  totalPrice: number;
};

const emptyCatalogState: CatalogState = {
  categories: [],
  combosByCategory: new Map(),
  productPassports: new Map(),
  productsByCategory: new Map(),
};

const comboGridOrder = [0, 2, 3, 1];
const comboSlideDirections = ['up', 'right', 'left', 'down'] as const;
const comboRotationFirstDelayMs = 3000;
const comboRotationIntervalMs = 4500;
const comboRotationStepDurationMs = 760;
const comboRotationPrepareDelayMs = 180;
const comboRotationBarrierTimeoutMs = 1200;
const comboRotationCompleteDelayMs = comboRotationStepDurationMs * 2 + 240;
const catalogCardTapSlop = { bottom: 10, left: 10, right: 10, top: 10 };
const catalogCategoryMaxConcurrentLoads = 2;
const catalogCategorySkeletonRows = 6;
const catalogInitialRenderCards = 16;

type ComboSlideDirection = typeof comboSlideDirections[number];
type ComboSlidePhase = 'idle' | 'ready' | 'leaving' | 'entering';
type ComboImageLayer = 'front' | 'back';
type ComboLayerState = {
  index: number;
  url: string;
};
type ComboRotationCommand = {
  key: number;
  nextIndexes: number[];
  nextUrls: string[];
  pendingCellIndexes: number[];
  startKey: number;
};

type CatalogDeliveryMode = FulfillmentMode;

const CATALOG_DELIVERY_HEADER_HEIGHT = 132;
const CATALOG_CATEGORIES_HEIGHT = theme.sizes.categoryChipHeight + theme.spacing.sm + theme.spacing.md;
const CATALOG_SUBCATEGORIES_HEIGHT = theme.sizes.categoryChipHeight + theme.spacing.md;
const CATALOG_CATEGORY_SCROLL_GAP = theme.spacing.sm;
const CATALOG_REFRESH_TRIGGER_DISTANCE = 110;
const CATALOG_REFRESH_PROGRESS_OFFSET = 96;
const CATALOG_FOCUS_RESUME_DELAY_MS = 280;
const CATALOG_PROGRAMMATIC_SCROLL_RESET_MS = 420;
const CATALOG_SCROLL_RETARGET_THRESHOLD = 32;
const isAndroid = Platform.OS === 'android';

function createNumberValueStore(initialValue: number | null = null): NumberValueStore {
  let value = initialValue;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    set(nextValue) {
      if (value === nextValue) return;
      value = nextValue;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createComboRotationCoordinator(): ComboRotationCoordinator {
  let currentRotationKey = 0;
  let isMinPrepareElapsed = false;
  let minPrepareTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let startSnapshot: number | null = null;
  const listeners = new Set<() => void>();
  const pendingCards = new Set<string>();
  const readyCards = new Set<string>();

  const notify = (value: number) => {
    startSnapshot = value;
    listeners.forEach((listener) => listener());
  };

  const clearTimers = () => {
    if (minPrepareTimer) {
      clearTimeout(minPrepareTimer);
      minPrepareTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  const resetTick = () => {
    clearTimers();
    currentRotationKey = 0;
    isMinPrepareElapsed = false;
    pendingCards.clear();
    readyCards.clear();
  };

  const finishTick = (value: number) => {
    notify(value);
    resetTick();
  };

  const tryStart = () => {
    if (!currentRotationKey || !isMinPrepareElapsed || !pendingCards.size) return;
    if (readyCards.size !== pendingCards.size) return;
    finishTick(currentRotationKey);
  };

  return {
    beginTick(rotationKey) {
      if (currentRotationKey) notify(-currentRotationKey);
      resetTick();
      currentRotationKey = rotationKey;
      minPrepareTimer = setTimeout(() => {
        if (currentRotationKey !== rotationKey) return;
        isMinPrepareElapsed = true;
        tryStart();
      }, comboRotationPrepareDelayMs);
      timeoutTimer = setTimeout(() => {
        if (currentRotationKey !== rotationKey) return;
        finishTick(-rotationKey);
      }, comboRotationBarrierTimeoutMs);
    },
    getStartSnapshot: () => startSnapshot,
    markPending(cardKey, rotationKey) {
      if (!cardKey || !rotationKey || currentRotationKey !== rotationKey) return;
      pendingCards.add(cardKey);
    },
    markReady(cardKey, rotationKey) {
      if (!cardKey || !rotationKey || currentRotationKey !== rotationKey) return;
      if (!pendingCards.has(cardKey)) return;
      readyCards.add(cardKey);
      tryStart();
    },
    subscribeStart(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unregister(cardKey) {
      if (!cardKey || !pendingCards.delete(cardKey)) return;
      readyCards.delete(cardKey);
      tryStart();
    },
  };
}

function createProductRuntimeStore(): ProductRuntimeStore {
  const listenersByProductId = new Map<number, Set<() => void>>();
  const versionsByProductId = new Map<number, number>();
  return {
    emit(productIds) {
      normalizeCatalogProductIds(productIds).forEach((productId) => {
        versionsByProductId.set(productId, (versionsByProductId.get(productId) || 0) + 1);
        listenersByProductId.get(productId)?.forEach((listener) => listener());
      });
    },
    getSnapshot(productId) {
      return versionsByProductId.get(Number(productId || 0)) || 0;
    },
    subscribe(productId, listener) {
      const id = Number(productId || 0);
      if (!Number.isFinite(id) || id <= 0) return () => undefined;
      const listeners = listenersByProductId.get(id) || new Set<() => void>();
      listeners.add(listener);
      listenersByProductId.set(id, listeners);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) listenersByProductId.delete(id);
      };
    },
  };
}

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeCatalogText(value: unknown) {
  return String(value || '').trim();
}

function isDefaultAddress(address: CustomerAddress) {
  return address.is_default === true || address.is_default === 1 || address.is_default === '1';
}

function formatAddressLine(address: CustomerAddress | null | undefined) {
  if (!address) return '';
  const normalized = normalizeCatalogText(address.address_normalized_display);
  if (normalized) return normalized;
  return [address.city, address.street, address.house]
    .map((item) => normalizeCatalogText(item))
    .filter(Boolean)
    .join(', ');
}

function formatHoursRange(hours: Array<Record<string, unknown>>) {
  if (!Array.isArray(hours) || !hours.length) return '';
  const now = new Date();
  const today = now.getDay() === 0 ? 7 : now.getDay();
  const row = hours.find((item) => Number(item.day_of_week || 0) === today);
  if (!row || row.is_closed === true || row.is_closed === 1) return '';
  const opens = normalizeCatalogText(row.opens_at).slice(0, 5);
  const closes = normalizeCatalogText(row.closes_at).slice(0, 5);
  if (opens && closes) return `с ${opens} до ${closes}`;
  return '';
}

function getConfigHours(config: PublicOrderConfig | null, key: string) {
  const value = config?.[key];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function findSelectedAddress(addresses: CustomerAddress[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.addressId);
  if (selectedId) {
    const selected = addresses.find((address) => toPositiveId(address.id) === selectedId);
    if (selected) return selected;
  }
  return addresses.find(isDefaultAddress) || addresses[0] || null;
}

function findSelectedStore(stores: TenantStore[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.pickupStoreId);
  if (selectedId) {
    const selected = stores.find((store) => toPositiveId(store.id) === selectedId);
    if (selected) return selected;
  }
  const city = normalizeCatalogText(selection.pickupCity);
  const cityStores = city ? stores.filter((store) => normalizeCatalogText(store.city) === city) : stores;
  return cityStores[0] || stores[0] || null;
}

function resolveCatalogFulfillmentSelection(
  selection: FulfillmentSelection,
  addresses: CustomerAddress[],
  stores: TenantStore[],
): FulfillmentSelection {
  const mode: CatalogDeliveryMode = selection.mode === 'pickup' ? 'pickup' : 'delivery';
  const defaultAddressId = toPositiveId(addresses.find(isDefaultAddress)?.id) || toPositiveId(addresses[0]?.id);
  const selectedAddressId = mode === 'delivery'
    ? (selection.addressId && addresses.some((address) => toPositiveId(address.id) === selection.addressId)
      ? selection.addressId
      : defaultAddressId)
    : null;
  const pickupCity = normalizeCatalogText(selection.pickupCity) || normalizeCatalogText(stores[0]?.city) || null;
  const cityStores = pickupCity ? stores.filter((store) => normalizeCatalogText(store.city) === pickupCity) : stores;
  const selectedPickupStoreId = mode === 'pickup'
    ? (selection.pickupStoreId && cityStores.some((store) => toPositiveId(store.id) === selection.pickupStoreId)
      ? selection.pickupStoreId
      : toPositiveId(cityStores[0]?.id) || toPositiveId(stores[0]?.id))
    : null;

  return {
    addressId: selectedAddressId,
    mode,
    pickupCity,
    pickupStoreId: selectedPickupStoreId,
  };
}

function formatDeliveryHours(config: PublicOrderConfig | null, store: TenantStore | null) {
  const storeDeliveryHours = Array.isArray(store?.delivery_hours) ? store.delivery_hours : [];
  const range = formatHoursRange(storeDeliveryHours)
    || formatHoursRange(getConfigHours(config, 'storeDeliveryHours'))
    || formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : [])
    || formatHoursRange(getConfigHours(config, 'storeHours'));
  return range;
}

function formatPickupHours(store: TenantStore | null) {
  const range = formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : []);
  return range;
}

function mapSnapshotRecordToCategoryMap<T>(record: Record<string, T[]> | undefined, categories: CatalogCategory[]) {
  const result = new Map<number, T[]>();
  categories.forEach((category) => {
    const id = Number(category.id);
    if (Number.isFinite(id) && id > 0) result.set(id, Array.isArray(record?.[String(id)]) ? record[String(id)] : []);
  });
  return result;
}

function getCatalogStateFromSnapshot(snapshot: MobileCatalogSnapshot): CatalogState {
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const productPassports = new Map<number, CatalogProductPassport>();
  Object.entries(snapshot.productPassports || {}).forEach(([key, passport]) => {
    const id = Number(key || passport?.product?.id || 0);
    if (Number.isFinite(id) && id > 0 && passport) productPassports.set(id, passport);
  });
  return {
    categories,
    combosByCategory: mapSnapshotRecordToCategoryMap<CatalogCombo>(snapshot.combosByCategory, categories),
    productPassports,
    productsByCategory: mapSnapshotRecordToCategoryMap<CatalogProduct>(snapshot.productsByCategory, categories),
  };
}

function getCatalogIndexFromSnapshot(snapshot: MobileCatalogSnapshot): MobileCatalogIndex {
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const categoryCounts: Record<string, CatalogCategoryCount> = {};
  categories.forEach((category) => {
    const categoryId = Number(category.id || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return;
    const products = Array.isArray(snapshot.productsByCategory?.[String(categoryId)])
      ? snapshot.productsByCategory[String(categoryId)]
      : [];
    const combos = Array.isArray(snapshot.combosByCategory?.[String(categoryId)])
      ? snapshot.combosByCategory[String(categoryId)]
      : [];
    categoryCounts[String(categoryId)] = {
      combo_count: combos.length,
      product_count: products.length,
      total_count: products.length + combos.length,
    };
  });

  return {
    categories,
    categoryCounts,
    generated_at: snapshot.generated_at,
    store_id: snapshot.store_id,
    tenant_id: snapshot.tenant_id,
    version: snapshot.version,
  };
}

function getCatalogStateFromCategoryBatch(
  categories: CatalogCategory[],
  productsByCategory: Map<number, CatalogProduct[]>,
  combosByCategory: Map<number, CatalogCombo[]>,
  productPassports: Map<number, CatalogProductPassport>,
): CatalogState {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const nextProductsByCategory = new Map<number, CatalogProduct[]>();
  const nextCombosByCategory = new Map<number, CatalogCombo[]>();

  safeCategories.forEach((category) => {
    const categoryId = Number(category.id || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return;
    nextProductsByCategory.set(categoryId, productsByCategory.get(categoryId) || []);
    nextCombosByCategory.set(categoryId, combosByCategory.get(categoryId) || []);
  });

  return {
    categories: safeCategories,
    combosByCategory: nextCombosByCategory,
    productPassports: new Map(productPassports),
    productsByCategory: nextProductsByCategory,
  };
}

function getEmptyCategoryDataCache(): CategoryDataCache {
  return {
    combosByCategory: new Map(),
    productPassports: new Map(),
    productsByCategory: new Map(),
  };
}

function buildCatalogStateFromCache(
  categories: CatalogCategory[],
  cache: CategoryDataCache,
  loadStates: CategoryLoadStateMap,
): CatalogState {
  const productsByCategory = new Map<number, CatalogProduct[]>();
  const combosByCategory = new Map<number, CatalogCombo[]>();
  const productPassports = new Map<number, CatalogProductPassport>();

  categories.forEach((category) => {
    const categoryId = Number(category.id || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return;
    if (loadStates[String(categoryId)] !== 'loaded') return;
    const products = cache.productsByCategory.get(categoryId) || [];
    productsByCategory.set(categoryId, products);
    combosByCategory.set(categoryId, cache.combosByCategory.get(categoryId) || []);
    products.forEach((product) => {
      const productId = Number(product.id || 0);
      const passport = cache.productPassports.get(productId);
      if (Number.isFinite(productId) && productId > 0 && passport) productPassports.set(productId, passport);
    });
  });

  return getCatalogStateFromCategoryBatch(
    categories,
    productsByCategory,
    combosByCategory,
    productPassports,
  );
}

function cacheCatalogState(cache: CategoryDataCache, catalog: CatalogState) {
  catalog.productsByCategory.forEach((products, categoryId) => {
    cache.productsByCategory.set(categoryId, Array.isArray(products) ? products : []);
  });
  catalog.combosByCategory.forEach((combos, categoryId) => {
    cache.combosByCategory.set(categoryId, Array.isArray(combos) ? combos : []);
  });
  catalog.productPassports.forEach((passport, productId) => {
    if (passport) cache.productPassports.set(productId, passport);
  });
}

function cacheCategoryProducts(cache: CategoryDataCache, categoryId: number, products: CatalogProduct[], combos: CatalogCombo[]) {
  cache.productsByCategory.set(categoryId, products);
  cache.combosByCategory.set(categoryId, combos);
  products.forEach((product) => {
    const productId = Number(product.id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return;
    if (cache.productPassports.has(productId)) return;
    cache.productPassports.set(productId, {
      product,
      updated_at: (product as CatalogProduct & { updated_at?: string | null; updatedAt?: string | null }).updated_at
        || (product as CatalogProduct & { updatedAt?: string | null }).updatedAt
        || null,
    });
  });
}

function hasCachedCategoryData(cache: CategoryDataCache, categoryId: number) {
  return cache.productsByCategory.has(categoryId) || cache.combosByCategory.has(categoryId);
}

function mapCategoryMapToSnapshotRecord<T>(map: Map<number, T[]>, categories: CatalogCategory[]) {
  const record: Record<string, T[]> = {};
  categories.forEach((category) => {
    const categoryId = Number(category.id || 0);
    if (Number.isFinite(categoryId) && categoryId > 0) record[String(categoryId)] = map.get(categoryId) || [];
  });
  return record;
}

function mapPassportsToSnapshotRecord(passports: Map<number, CatalogProductPassport>) {
  const record: Record<string, CatalogProductPassport> = {};
  passports.forEach((passport, productId) => {
    const id = Number(productId || passport?.product?.id || 0);
    if (Number.isFinite(id) && id > 0 && passport) record[String(id)] = passport;
  });
  return record;
}

function getSnapshotFromCatalogState(catalog: CatalogState): MobileCatalogSnapshot {
  const tenantId = Number(apiConfig.tenantId || 0);
  const storeId = Number(apiConfig.storeId || 0);
  return {
    categories: catalog.categories,
    combosByCategory: mapCategoryMapToSnapshotRecord(catalog.combosByCategory, catalog.categories),
    generated_at: new Date().toISOString(),
    productPassports: mapPassportsToSnapshotRecord(catalog.productPassports),
    productsByCategory: mapCategoryMapToSnapshotRecord(catalog.productsByCategory, catalog.categories),
    store_id: Number.isFinite(storeId) && storeId > 0 ? storeId : undefined,
    tenant_id: Number.isFinite(tenantId) && tenantId > 0 ? tenantId : undefined,
    version: `batch:${Date.now()}`,
  };
}

function isCatalogStateEmpty(catalog: CatalogState) {
  const hasCategory = catalog.categories.some((category) => {
    const id = Number(category.id || 0);
    return Number.isFinite(id) && id > 0;
  });
  if (!hasCategory) return true;

  for (const products of catalog.productsByCategory.values()) {
    if (Array.isArray(products) && products.length) return false;
  }
  for (const combos of catalog.combosByCategory.values()) {
    if (Array.isArray(combos) && combos.length) return false;
  }
  return true;
}

function isMobileCatalogSnapshotUsable(snapshot: MobileCatalogSnapshot | null) {
  return Boolean(snapshot && !isCatalogStateEmpty(getCatalogStateFromSnapshot(snapshot)));
}

function normalizeCatalogProductIds(productIds: number[]) {
  return Array.from(new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((id) => Number(id || 0))
      .filter((id) => Number.isFinite(id) && id > 0),
  )).sort((left, right) => left - right);
}

function mergeCatalogItemsById<T extends { id: number }>(lists: T[][]) {
  const items = new Map<number, T>();
  lists.forEach((list) => {
    list.forEach((item) => {
      const id = Number(item.id || 0);
      if (Number.isFinite(id) && id > 0 && !items.has(id)) items.set(id, item);
    });
  });
  return Array.from(items.values());
}

function collectInitialCatalogProductIds(catalog: CatalogState, limit = 16) {
  const ids: number[] = [];
  catalog.categories.some((category) => {
    const categoryId = Number(category.id || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return false;
    const products = catalog.productsByCategory.get(categoryId) || [];
    products.some((product) => {
      const productId = Number(product.id || 0);
      if (Number.isFinite(productId) && productId > 0) ids.push(productId);
      return ids.length >= limit;
    });
    return ids.length >= limit;
  });
  return normalizeCatalogProductIds(ids);
}

function collectCatalogProductIds(catalog: CatalogState) {
  const ids: number[] = [];
  catalog.productsByCategory.forEach((products) => {
    products.forEach((product) => {
      const productId = Number(product.id || 0);
      if (Number.isFinite(productId) && productId > 0) ids.push(productId);
    });
  });
  return normalizeCatalogProductIds(ids);
}

function getCatalogStateProduct(catalog: CatalogState, productId: number) {
  const id = Number(productId || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  for (const products of catalog.productsByCategory.values()) {
    const product = products.find((item) => Number(item.id || 0) === id);
    if (product) return product;
  }
  return catalog.productPassports.get(id)?.product || null;
}

function collectInitialCatalogComboIds(catalog: CatalogState, limit = 2) {
  const ids: number[] = [];
  catalog.categories.some((category) => {
    const categoryId = Number(category.id || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return false;
    const combos = catalog.combosByCategory.get(categoryId) || [];
    combos.some((combo) => {
      const comboId = Number(combo.id || 0);
      if (Number.isFinite(comboId) && comboId > 0) ids.push(comboId);
      return ids.length >= limit;
    });
    return ids.length >= limit;
  });
  return normalizeCatalogProductIds(ids);
}

function collectCartAvailabilityProductIds(lines: CartLine[], stockLevels: Map<number, ProductStockLevel>) {
  const ids = new Set<number>();
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    if (line.type === 'product') {
      const productId = Number(line.sourceId || 0);
      if (Number.isFinite(productId) && productId > 0) ids.add(productId);
    }
  });
  getStockProductIdsForLines(lines, stockLevels).forEach((productId) => ids.add(productId));
  return normalizeCatalogProductIds(Array.from(ids));
}

function collectStockRowsFromCatalog(catalog: CatalogState, unitConversions: UnitConversion[]) {
  const rows: ProductStockLevel[] = [];
  catalog.productsByCategory.forEach((products) => {
    products.forEach((product) => {
      const row = stockLevelFromProduct(product);
      if (row) rows.push(row);
    });
  });
  return [
    ...rows,
    ...extractStockRowsFromCatalogPassports(catalog.productPassports, unitConversions),
  ];
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

function applyCatalogAvailability(catalog: CatalogState, data: Record<string, unknown>) {
  let changed = false;
  const patchProduct = (product: CatalogProduct): CatalogProduct => {
    const patch = normalizeAvailabilityPatch(data[String(product.id)]);
    if (!patch) return product;
    const sameMode = !Object.prototype.hasOwnProperty.call(patch, 'fulfillment_mode') || product.fulfillment_mode === patch.fulfillment_mode;
    if (sameMode && product.is_available === patch.is_available && product.stock_qty === patch.stock_qty) return product;
    changed = true;
    return { ...product, ...patch };
  };
  const productsByCategory = new Map<number, CatalogProduct[]>();
  catalog.productsByCategory.forEach((products, categoryId) => {
    productsByCategory.set(categoryId, products.map(patchProduct));
  });
  const productPassports = new Map<number, CatalogProductPassport>();
  catalog.productPassports.forEach((passport, productId) => {
    const product = passport.product ? patchProduct(passport.product) : passport.product;
    productPassports.set(productId, product && product !== passport.product ? { ...passport, product } : passport);
  });
  return changed ? { ...catalog, productPassports, productsByCategory } : catalog;
}

function applySnapshotAvailability(snapshot: MobileCatalogSnapshot, data: Record<string, unknown>) {
  let changed = false;
  const patchProduct = (product: CatalogProduct): CatalogProduct => {
    const patch = normalizeAvailabilityPatch(data[String(product.id)]);
    if (!patch) return product;
    const sameMode = !Object.prototype.hasOwnProperty.call(patch, 'fulfillment_mode') || product.fulfillment_mode === patch.fulfillment_mode;
    if (sameMode && product.is_available === patch.is_available && product.stock_qty === patch.stock_qty) return product;
    changed = true;
    return { ...product, ...patch };
  };
  const productsByCategory = Object.fromEntries(
    Object.entries(snapshot.productsByCategory || {}).map(([categoryId, products]) => [
      categoryId,
      (Array.isArray(products) ? products : []).map(patchProduct),
    ]),
  );
  const productPassports = Object.fromEntries(
    Object.entries(snapshot.productPassports || {}).map(([productId, passport]) => {
      const product = passport?.product ? patchProduct(passport.product) : passport?.product;
      return [productId, product && product !== passport.product ? { ...passport, product } : passport];
    }),
  );
  return changed ? { ...snapshot, productPassports, productsByCategory } : snapshot;
}

function getProductPrice(product: CatalogProduct) {
  const display = Number(product.display_price ?? product.discounted_price ?? product.price ?? 0);
  return Number.isFinite(display) ? display : 0;
}

function getOldPrice(product: CatalogProduct) {
  const old = Number(product.old_price ?? product.original_price ?? 0);
  return Number.isFinite(old) ? old : 0;
}

function roundPrice(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function getDiscountedPrice(price: number, discount: CatalogProduct['discount']) {
  const value = Number(discount?.discount_value || 0);
  if (!(value > 0)) return price;
  if (discount?.discount_type === 'percent') return roundPrice(price * (1 - Math.min(100, value) / 100));
  return roundPrice(Math.max(0, price - value));
}

function getDiscountText(product: CatalogProduct, currentPrice = getProductPrice(product), originalPrice = getOldPrice(product)) {
  const discount = product.discount;
  const value = Number(discount?.discount_value || 0);
  if (discount?.discount_type === 'percent' && value > 0) return `-${Math.round(value)}%`;

  if (originalPrice > currentPrice && currentPrice >= 0) {
    return `-${Math.round(((originalPrice - currentPrice) / originalPrice) * 100)}%`;
  }

  return '';
}

function getBuyXGetYBadgeText(product: CatalogProduct) {
  return getBuyXGetYBadgeTextFromRule(product.buy_x_get_y_badge);
}

function getProductImage(product: CatalogProduct) {
  const photo = product.photos?.[0] || '';
  return resolveAssetUrl(photo);
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asPlainArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function trimText(value: unknown) {
  return String(value || '').trim();
}

function positiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getPassportVariant(passport: CatalogProductPassport | null): CartVariant | null {
  const config = asPlainRecord(passport?.defaultConfig);
  const groupId = positiveId(config.variant_group_id);
  const valueIndex = config.variant_value_index == null ? null : Number(config.variant_value_index);
  const label = trimText(config.variant_label || passport?.product.default_variant?.variant_label);
  if (!label && !groupId) return null;

  const variantGroup = asPlainRecord(asPlainArray(passport?.variants)[0]);
  return {
    groupId,
    groupTitle: trimText(variantGroup.title || variantGroup.title_label),
    label,
    unit: trimText(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title),
    unitId: positiveId(variantGroup.unit_id),
    valueIndex: Number.isFinite(valueIndex) ? valueIndex : null,
  };
}

function getIngredientStockQuantity(source: Record<string, unknown>, quantity: number, unitConversions: UnitConversion[]) {
  const explicitStockQuantity = Number(source.stock_quantity ?? source.stockQuantity);
  if (Number.isFinite(explicitStockQuantity) && explicitStockQuantity > 0) return explicitStockQuantity;

  const factor = getUnitConversionFactor(
    unitConversions,
    source.unit_id ?? source.unitId ?? source.ingredient_unit_id ?? source.ingredientUnitId,
    source.ingredient_base_unit_id ?? source.ingredientBaseUnitId ?? source.base_unit_id ?? source.baseUnitId ?? source.stock_unit_id ?? source.stockUnitId,
  );
  return factor == null ? quantity : quantity * factor;
}

function getPassportIngredients(passport: CatalogProductPassport | null, unitConversions: UnitConversion[]): CartIngredient[] {
  const config = asPlainRecord(passport?.defaultConfig);
  const configuredIngredients = asPlainArray(config.ingredients);
  const sourceIngredients = configuredIngredients.length ? configuredIngredients : asPlainArray(passport?.ingredients);
  return sourceIngredients
    .map((item): CartIngredient | null => {
      const source = asPlainRecord(item);
      const quantity = Number(source.quantity ?? source.qty ?? source.default_qty ?? source.quantity_default ?? 0);
      const name = trimText(source.name || source.ingredient_name);
      if (!(quantity > 0) || !name) return null;
      return {
        id: positiveId(source.ingredient_id || source.id),
        name,
        quantity,
        stockQuantity: getIngredientStockQuantity(source, quantity, unitConversions),
        unit: trimText(source.unit || source.unit_label || source.unit_short_title || source.unit_title || source.unit_code),
        unitId: positiveId(source.unit_id || source.ingredient_unit_id),
      };
    })
    .filter((item): item is CartIngredient => !!item);
}

function getPassportOptions(passport: CatalogProductPassport | null): CartOptionItem[] {
  const config = asPlainRecord(passport?.defaultConfig);
  return asPlainArray(config.option_items)
    .map((item): CartOptionItem | null => {
      const source = asPlainRecord(item);
      const name = trimText(source.title || source.name);
      if (!name) return null;
      const variantLabel = trimText(source.variant_label);
      return {
        id: positiveId(source.id),
        name,
        quantity: Math.max(1, Number(source.qty ?? source.quantity ?? 1)),
        targetProductId: positiveId(source.target_product_id || source.product_id),
        unitPrice: Math.max(0, Number(source.price || 0)),
        variant: variantLabel ? {
          groupId: positiveId(source.variant_group_id),
          groupTitle: trimText(source.variant_group_title || source.group_title),
          label: variantLabel,
          unit: trimText(source.variant_unit || source.unit),
          unitId: positiveId(source.unit_id),
          valueIndex: source.variant_value_index == null ? null : Number(source.variant_value_index),
        } : null,
      };
    })
    .filter((item): item is CartOptionItem => !!item);
}

function getDefaultOptionTotal(passport: CatalogProductPassport | null) {
  const config = asPlainRecord(passport?.defaultConfig);
  return asPlainArray(config.option_items).reduce<number>((sum, item) => {
    const source = asPlainRecord(item);
    const quantity = Math.max(1, Number(source.qty ?? source.quantity ?? 1));
    const price = Math.max(0, Number(source.price || 0));
    return sum + (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(price) ? price : 0);
  }, 0);
}

function getCatalogLinePricing(product: CatalogProduct, passport: CatalogProductPassport | null) {
  const config = asPlainRecord(passport?.defaultConfig);
  const fallbackPrice = getProductPrice(product);
  const overridePrice = Number(config.unit_price_override);
  const configuredPrice = Number(config.unit_price ?? config.variant_unit_price);
  const optionTotal = getDefaultOptionTotal(passport);
  const ingredientDiff = Number(config.ingredient_price_diff || 0);
  const beforeDiscountRaw = Number(config.unit_price_before_discount ?? config.base_unit_price ?? config.variant_unit_price);
  const beforeDiscount = Number.isFinite(beforeDiscountRaw) && beforeDiscountRaw > 0
    ? beforeDiscountRaw + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0)
    : fallbackPrice + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0);
  const configFinal = Number.isFinite(overridePrice) && overridePrice > 0
    ? overridePrice
    : Number.isFinite(configuredPrice) && configuredPrice > 0
      ? configuredPrice + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0)
      : getDiscountedPrice(beforeDiscount, product.discount);
  const unitPrice = roundPrice(configFinal);
  const oldFromProduct = getOldPrice(product);
  const baseProductPrice = Number(product.price || 0);
  const variantUnitPrice = Number.isFinite(configuredPrice) && configuredPrice > 0
    ? configuredPrice
    : Math.max(0, beforeDiscount - optionTotal - (Number.isFinite(ingredientDiff) ? ingredientDiff : 0));
  const scaledOldFromProduct = oldFromProduct > 0 && variantUnitPrice > 0 && baseProductPrice > 0
    ? roundPrice(oldFromProduct * (variantUnitPrice / baseProductPrice))
    : oldFromProduct;
  const oldUnitPrice = Math.max(
    beforeDiscount > unitPrice ? beforeDiscount : 0,
    scaledOldFromProduct > variantUnitPrice
      ? scaledOldFromProduct + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0)
      : 0,
  );
  return {
    oldUnitPrice: roundPrice(oldUnitPrice),
    unitPrice,
  };
}

function buildProductQuantitiesFromCart(lines: CartLine[]) {
  return lines.reduce<Record<number, number>>((result, line) => {
    if (line.type !== 'product') return result;
    const productId = Number(line.sourceId || 0);
    if (!Number.isFinite(productId) || productId <= 0) return result;
    result[productId] = (result[productId] || 0) + Math.max(1, Number(line.quantity || 1));
    return result;
  }, {});
}

function buildCatalogProductCartLine(product: CatalogProduct, passport: CatalogProductPassport | null, stockLevels: Map<number, ProductStockLevel>, unitConversions: UnitConversion[]) {
  const { oldUnitPrice, unitPrice } = getCatalogLinePricing(product, passport);
  const variant = getPassportVariant(passport);
  const ingredients = getPassportIngredients(passport, unitConversions);
  const options = getPassportOptions(passport);
  const line = {
    buyXGetYBadge: passport?.product?.buy_x_get_y_badge || product.buy_x_get_y_badge || null,
    detailLines: getProductDefaultLines(product),
    ingredients,
    isUnavailable: !isProductStockAvailable(product, stockLevels),
    oldUnitPrice: oldUnitPrice > unitPrice ? oldUnitPrice : 0,
    options,
    photoUrl: getProductImage(product),
    quantity: 1,
    sourceId: Number(product.id),
    title: trimText(product.name) || 'Товар',
    type: 'product' as const,
    unitPrice,
    variant,
  } as CartLineDraft;
  return {
    ...line,
    id: makeCartLineId(line),
  };
}

function getReadyCatalogPassport(productId: number, catalogPassports: Map<number, CatalogProductPassport>) {
  return getCatalogProductPassport(productId) || catalogPassports.get(productId) || null;
}

function getComboImages(combo: CatalogCombo) {
  const single = resolveAssetUrl(combo.image_thumb || combo.image_url || '');
  if (single) return [single];

  const thumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
  const photos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];

  return comboGridOrder.map((index) => resolveAssetUrl(thumbs[index] || photos[index] || '')).filter(Boolean);
}

function normalizeComboCellPhotos(combo: CatalogCombo, visualIndex: number) {
  const sourceIndex = comboGridOrder[visualIndex] ?? visualIndex;
  const thumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
  const photos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
  const photoSets = Array.isArray(combo.grid_photo_sets) ? combo.grid_photo_sets : [];
  const base = thumbs[sourceIndex] || photos[sourceIndex] || '';
  const alternatives = Array.isArray(photoSets[sourceIndex]) ? photoSets[sourceIndex] : [];
  const urls = [base, ...alternatives]
    .map((url) => resolveAssetUrl(url))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

function getComboImageSets(combo: CatalogCombo) {
  return [0, 1, 2, 3].map((index) => normalizeComboCellPhotos(combo, index));
}

function getComboAnimationImageUrls(combo: CatalogCombo) {
  return Array.from(new Set(getComboImageSets(combo).flat().filter(Boolean)));
}

function getCategoryLoadStatus(loadStates: CategoryLoadStateMap, categoryId: number) {
  return loadStates[String(categoryId)] || 'idle';
}

function getComboSlideOffset(direction: ComboSlideDirection, width: number, height: number) {
  const safeWidth = width || 120;
  const safeHeight = height || 120;
  if (direction === 'right') return { x: safeWidth, y: 0 };
  if (direction === 'down') return { x: 0, y: safeHeight };
  if (direction === 'left') return { x: -safeWidth, y: 0 };
  return { x: 0, y: -safeHeight };
}

function waitAnimationFrame(callback: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

function isProductConfigurable(product: CatalogProduct) {
  const blocksConfig = product.blocks_config && typeof product.blocks_config === 'object' ? product.blocks_config : null;
  return Boolean(
    blocksConfig?.variants ||
      blocksConfig?.options ||
      blocksConfig?.ingredients ||
      (Array.isArray(product.variants) && product.variants.length > 0) ||
      (Array.isArray(product.options) && product.options.length > 0) ||
      (Array.isArray(product.ingredients) && product.ingredients.length > 0),
  );
}

function getProductTitle(product: CatalogProduct) {
  const variantLabel = String(product.default_variant?.variant_label || '').trim();
  return [variantLabel, product.name].filter(Boolean).join(' ');
}

function getProductDefaultLines(product: CatalogProduct) {
  const defaultLines = Array.isArray(product.catalog_default_lines) ? product.catalog_default_lines : [];
  if (defaultLines.length > 0) {
    return defaultLines.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 2);
  }

  return String(product.description_short || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function getProductMediaPillText(product: CatalogProduct, availableForAdd: boolean, quantity: number, hasKnownStock = true) {
  if (!hasKnownStock) return isProductConfigurable(product) ? 'Настроить ›' : '';
  if (!availableForAdd) return quantity > 0 ? 'Больше нет' : 'Раскупили';
  return isProductConfigurable(product) ? 'Настроить ›' : '';
}

function QuantityOverlayText({ quantity }: { quantity: number }) {
  const previousQuantity = useRef(quantity);
  const animatedValue = useRef(new Animated.Value(1)).current;
  const direction = quantity >= previousQuantity.current ? 1 : -1;

  useEffect(() => {
    previousQuantity.current = quantity;
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [animatedValue, quantity]);

  return (
    <Animated.Text
      allowFontScaling={false}
      style={[
        styles.quantityOverlayText,
        {
          opacity: animatedValue,
          transform: [
            {
              translateX: animatedValue.interpolate({
                inputRange: [0, 1],
                outputRange: [18 * direction, 0],
              }),
            },
          ],
        },
      ]}
    >
      {quantity}
    </Animated.Text>
  );
}

function CatalogSkeletonCard() {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <View style={styles.skeletonMedia} />
      <View style={styles.cardBody}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonLineShort} />
        <View style={styles.cardFooter}>
          <View style={styles.skeletonPrice} />
          <View style={styles.skeletonButton} />
        </View>
      </View>
    </View>
  );
}

function ProductCard({
  buildViewModel,
  onDecreaseProduct,
  onIncreaseProduct,
  onPressProduct,
  product,
  runtimeStore,
}: {
  buildViewModel: (product: CatalogProduct) => ProductCardViewModel | null;
  onDecreaseProduct: (productId: number) => void;
  onIncreaseProduct: (product: CatalogProduct) => void;
  onPressProduct: (productId: number, image: string) => void;
  product: CatalogProduct;
  runtimeStore: ProductRuntimeStore;
}) {
  const productId = Number(product.id || 0);
  useSyncExternalStore(
    (listener) => runtimeStore.subscribe(productId, listener),
    () => runtimeStore.getSnapshot(productId),
    () => runtimeStore.getSnapshot(productId),
  );
  const viewModel = buildViewModel(product);
  if (!viewModel) return null;
  const {
    availability,
    canIncrease,
    defaultLines,
    discountText,
    hasQuantity,
    image,
    mediaPillText,
    oldPrice,
    price,
    promoBadgeText,
    title,
    totalOldPrice,
    totalPrice,
  } = viewModel;
  const quantity = availability.cartQty;

  const handleDecrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onDecreaseProduct(productId);
  };

  const handleIncrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (canIncrease) onIncreaseProduct(product);
  };

  return (
    <Pressable style={[styles.card, !canIncrease && !hasQuantity && availability.hasKnownStock && styles.cardDisabled]} onPress={() => onPressProduct(productId, image)}>
      <View style={styles.media}>
        {image && Platform.OS === 'web' ? (
          <Image resizeMode="contain" source={{ uri: image }} style={styles.image} />
        ) : image ? (
          <ExpoImage
            cachePolicy="memory-disk"
            contentFit="contain"
            source={{ uri: image }}
            style={styles.image}
          />
        ) : <View style={styles.imagePlaceholder} />}
        {hasQuantity ? (
          <View style={styles.quantityOverlay}>
            <QuantityOverlayText quantity={quantity} />
          </View>
        ) : null}
        {promoBadgeText ? <ProductBadge style={styles.promoBadge} text={promoBadgeText} tone="promo" /> : null}
        {discountText ? <ProductBadge style={[styles.discountBadge, promoBadgeText ? styles.discountBadgeWithPromo : null]} text={discountText} tone="discount" /> : null}
        {mediaPillText ? (
          <Text style={[styles.mediaPill, !canIncrease && styles.mediaPillDisabled]}>{mediaPillText}</Text>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {title}
        </Text>
        <View style={styles.cardDescription}>
          {defaultLines.map((line, index) => (
            <Text key={`${line}-${index}`} numberOfLines={1} style={styles.cardDescriptionLine}>
              • {line}
            </Text>
          ))}
        </View>
        <View style={styles.cardFooter}>
          {hasQuantity ? (
            <View key="qty" style={styles.qtyPill}>
              <View style={styles.unitPriceWrap}>
                <Text style={styles.unitPriceText}>{formatPrice(price)}</Text>
              </View>
              <Pressable hitSlop={catalogCardTapSlop} style={styles.qtyPillButton} onPress={handleDecrease}>
                <Ionicons name={availability.cartQty > 1 ? 'remove' : 'trash'} color={theme.colors.primaryText} size={14} />
              </Pressable>
              <View style={[styles.qtyPillCenter, totalOldPrice > totalPrice ? styles.qtyPillCenterWithOld : null]}>
                {totalOldPrice > totalPrice ? <Text style={styles.oldPrice}>{formatPrice(totalOldPrice)}</Text> : null}
                <Text numberOfLines={1} style={[styles.price, styles.qtyPrice]}>
                  {formatPrice(totalPrice)}
                </Text>
              </View>
              <Pressable
                disabled={!canIncrease}
                hitSlop={catalogCardTapSlop}
                style={[styles.qtyPillButton, !canIncrease && styles.qtyPillButtonDisabled]}
                onPress={handleIncrease}
              >
                <Ionicons name="add" color={canIncrease ? theme.colors.primaryText : theme.colors.muted} size={16} />
              </Pressable>
            </View>
          ) : (
            <View key="idle" style={styles.idleFooter}>
              <View style={styles.priceStack}>
                {oldPrice > price ? <Text style={styles.oldPrice}>{formatPrice(oldPrice)}</Text> : null}
                <Text numberOfLines={1} style={styles.price}>{formatPrice(price)}</Text>
              </View>
              <Pressable
                disabled={!canIncrease}
                hitSlop={catalogCardTapSlop}
                style={[styles.plusButton, !canIncrease && styles.plusButtonDisabled]}
                onPress={handleIncrease}
              >
                <Ionicons name="add" color={canIncrease ? theme.colors.primaryText : theme.colors.muted} size={18} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function AnimatedComboGridCell({
  direction,
  onPrepared,
  nextIndex,
  nextUrl,
  photos,
  prepareKey,
  startKey,
}: {
  direction: ComboSlideDirection;
  onPrepared: (prepareKey: number) => void;
  nextIndex: number | null;
  nextUrl: string;
  photos: string[];
  prepareKey: number;
  startKey: number;
}) {
  const leaveAnimation = useRef(new Animated.Value(0)).current;
  const enterAnimation = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);
  const loadedPrepareKeyRef = useRef(0);
  const pendingPrepareKeyRef = useRef(0);
  const startedKeyRef = useRef(0);
  const [slideState, setSlideState] = useState<{
    activeLayer: ComboImageLayer;
    back: ComboLayerState | null;
    front: ComboLayerState | null;
    incomingLayer: ComboImageLayer | null;
    phase: ComboSlidePhase;
  }>({
    activeLayer: 'front',
    back: null,
    front: { index: 0, url: photos[0] || '' },
    incomingLayer: null,
    phase: 'idle',
  });
  const [size, setSize] = useState({ height: 0, width: 0 });
  const activeLayerState = slideState[slideState.activeLayer];
  const activeIndex = activeLayerState?.index || 0;
  const currentUrl = activeLayerState?.url || photos[0] || '';
  const offset = getComboSlideOffset(direction, size.width, size.height);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      leaveAnimation.stopAnimation();
      enterAnimation.stopAnimation();
    };
  }, [enterAnimation, leaveAnimation]);

  useEffect(() => {
    loadedPrepareKeyRef.current = 0;
    pendingPrepareKeyRef.current = 0;
    startedKeyRef.current = 0;
    setSlideState({
      activeLayer: 'front',
      back: null,
      front: { index: 0, url: photos[0] || '' },
      incomingLayer: null,
      phase: 'idle',
    });
    leaveAnimation.setValue(0);
    enterAnimation.setValue(1);
  }, [enterAnimation, leaveAnimation, photos]);

  useEffect(() => {
    if (!prepareKey) {
      if (pendingPrepareKeyRef.current) {
        pendingPrepareKeyRef.current = 0;
        loadedPrepareKeyRef.current = 0;
        setSlideState((current) => {
          if (current.phase !== 'ready' || !current.incomingLayer) return current;
          return {
            ...current,
            [current.incomingLayer]: null,
            incomingLayer: null,
            phase: 'idle',
          };
        });
      }
      return;
    }
    if (!nextUrl || nextIndex == null || photos.length < 2) return;
    if (nextIndex === activeIndex) return;

    pendingPrepareKeyRef.current = prepareKey;
    loadedPrepareKeyRef.current = 0;
    startedKeyRef.current = 0;
    leaveAnimation.stopAnimation();
    enterAnimation.stopAnimation();
    leaveAnimation.setValue(0);
    enterAnimation.setValue(0);
    const incomingLayer: ComboImageLayer = slideState.activeLayer === 'front' ? 'back' : 'front';
    setSlideState((current) => ({
      ...current,
      [incomingLayer]: { index: nextIndex, url: nextUrl },
      incomingLayer,
      phase: 'ready',
    }));
  }, [activeIndex, enterAnimation, leaveAnimation, nextIndex, nextUrl, photos.length, prepareKey, slideState.activeLayer]);

  useEffect(() => {
    if (!startKey || startedKeyRef.current === startKey) return;
    if (startKey !== pendingPrepareKeyRef.current) return;
    if (!slideState.incomingLayer || slideState.phase !== 'ready') return;
    if (!nextUrl || nextIndex == null || photos.length < 2) return;

    startedKeyRef.current = startKey;
    const incomingLayer = slideState.incomingLayer;
    setSlideState((current) => ({ ...current, phase: 'leaving' }));
    waitAnimationFrame(() => {
      if (!mountedRef.current) return;
      leaveAnimation.setValue(0);
      Animated.timing(leaveAnimation, {
        duration: comboRotationStepDurationMs,
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!mountedRef.current || !finished) return;

        setSlideState((current) => ({ ...current, phase: 'entering' }));
        waitAnimationFrame(() => {
          if (!mountedRef.current) return;
          enterAnimation.setValue(0);
          Animated.timing(enterAnimation, {
            duration: comboRotationStepDurationMs,
            easing: Easing.bezier(0.22, 0.61, 0.36, 1),
            toValue: 1,
            useNativeDriver: true,
          }).start(() => {
            if (!mountedRef.current) return;
            pendingPrepareKeyRef.current = 0;
            loadedPrepareKeyRef.current = 0;
            leaveAnimation.setValue(0);
            enterAnimation.setValue(1);
            setSlideState((current) => ({
              ...current,
              activeLayer: incomingLayer,
              incomingLayer: null,
              phase: 'idle',
            }));
          });
        });
      });
    });
  }, [enterAnimation, leaveAnimation, nextIndex, nextUrl, photos.length, slideState.incomingLayer, slideState.phase, startKey]);

  const handleLayerLoad = useCallback((layer: ComboImageLayer) => {
    const key = pendingPrepareKeyRef.current;
    if (!key || loadedPrepareKeyRef.current === key) return;
    if (slideState.phase !== 'ready' || slideState.incomingLayer !== layer) return;
    loadedPrepareKeyRef.current = key;
    onPrepared(key);
  }, [onPrepared, slideState.incomingLayer, slideState.phase]);

  if (!currentUrl) return null;

  const getLayerStyle = (layer: ComboImageLayer) => {
    const isActive = layer === slideState.activeLayer;
    const isIncoming = layer === slideState.incomingLayer;
    const isActiveResting = isActive && (slideState.phase === 'idle' || slideState.phase === 'ready');
    const isLeaving = isActive && slideState.phase === 'leaving';
    const isEntering = isIncoming && slideState.phase === 'entering';
    const opacity = isLeaving
      ? 1
      : isEntering
        ? enterAnimation
        : isActiveResting
          ? 1
          : 0;
    const translateX = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.x],
      })
      : isEntering
        ? enterAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [offset.x, 0],
        })
        : isActiveResting
          ? 0
          : offset.x;
    const translateY = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.y],
      })
      : isEntering
        ? enterAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [offset.y, 0],
        })
        : isActiveResting
          ? 0
          : offset.y;

    return {
      opacity,
      transform: [
        { translateX },
        { translateY },
      ],
    };
  };

  return (
    <View
      style={styles.comboCellInner}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        if (height !== size.height || width !== size.width) setSize({ height, width });
      }}
    >
      {slideState.front?.url ? (
        <Animated.Image
          resizeMode="cover"
          source={{ uri: slideState.front.url }}
          style={[styles.comboImage, getLayerStyle('front')]}
          onLoad={() => handleLayerLoad('front')}
        />
      ) : null}
      {slideState.back?.url ? (
        <Animated.Image
          resizeMode="cover"
          source={{ uri: slideState.back.url }}
          style={[styles.comboImage, getLayerStyle('back')]}
          onLoad={() => handleLayerLoad('back')}
        />
      ) : null}
    </View>
  );
}

function ComboCard({
  cardKey,
  combo,
  onPress,
  rotationCoordinator,
  rotationStore,
}: {
  cardKey: string;
  combo: CatalogCombo;
  onPress: () => void;
  rotationCoordinator: ComboRotationCoordinator;
  rotationStore: NumberValueStore;
}) {
  const images = getComboImages(combo);
  const imageSets = useMemo(() => getComboImageSets(combo), [combo]);
  const comboImageIndexesRef = useRef([0, 0, 0, 0]);
  const loadedRotationCellIndexesRef = useRef(new Set<number>());
  const rotationCommandRef = useRef<ComboRotationCommand | null>(null);
  const rotationCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotationRunningRef = useRef(false);
  const rotationKey = useSyncExternalStore(
    rotationStore.subscribe,
    rotationStore.getSnapshot,
    rotationStore.getSnapshot,
  ) || 0;
  const rotationStartSignal = useSyncExternalStore(
    rotationCoordinator.subscribeStart,
    rotationCoordinator.getStartSnapshot,
    rotationCoordinator.getStartSnapshot,
  ) || 0;
  const rotationKeyRef = useRef(Number(rotationKey || 0));
  const lastHandledRotationKeyRef = useRef(rotationKey);
  const [comboImageIndexes, setComboImageIndexes] = useState([0, 0, 0, 0]);
  const [rotationCommand, setRotationCommand] = useState<ComboRotationCommand | null>(null);
  const discountPercent = Number(combo.discount_percent || 0);
  const minPrice = Number(combo.min_price || 0);
  const available = isAvailableValue(combo.is_available);

  const clearComboRotationTimers = useCallback(() => {
    if (rotationCompleteTimer.current) {
      clearTimeout(rotationCompleteTimer.current);
      rotationCompleteTimer.current = null;
    }
  }, []);

  const resetPreparedRotation = useCallback(() => {
    clearComboRotationTimers();
    rotationCoordinator.unregister(cardKey);
    loadedRotationCellIndexesRef.current = new Set();
    rotationCommandRef.current = null;
    rotationRunningRef.current = false;
    setRotationCommand(null);
  }, [cardKey, clearComboRotationTimers, rotationCoordinator]);

  const startPreparedRotation = useCallback((commandKey: number) => {
    const command = rotationCommandRef.current;
    if (!command || command.key !== commandKey || command.startKey) return;
    const isReady = command.pendingCellIndexes.every((index) => loadedRotationCellIndexesRef.current.has(index));
    if (!isReady) return;

    const startedCommand = {
      ...command,
      startKey: command.key,
    };
    rotationCommandRef.current = startedCommand;
    comboImageIndexesRef.current = command.nextIndexes;
    setComboImageIndexes(command.nextIndexes);
    setRotationCommand(startedCommand);
    rotationCompleteTimer.current = setTimeout(() => {
      if (rotationCommandRef.current?.key !== commandKey) return;
      rotationCommandRef.current = null;
      rotationRunningRef.current = false;
      loadedRotationCellIndexesRef.current = new Set();
      setRotationCommand(null);
    }, comboRotationCompleteDelayMs);
  }, []);

  const handleComboCellPrepared = useCallback((cellIndex: number, commandKey: number) => {
    const command = rotationCommandRef.current;
    if (!command || command.key !== commandKey || command.startKey) return;
    if (!command.pendingCellIndexes.includes(cellIndex)) return;
    loadedRotationCellIndexesRef.current.add(cellIndex);
    if (command.pendingCellIndexes.every((index) => loadedRotationCellIndexesRef.current.has(index))) {
      rotationCoordinator.markReady(cardKey, commandKey);
    }
  }, [cardKey, rotationCoordinator]);

  useEffect(() => {
    rotationKeyRef.current = Number(rotationKey || 0);
  }, [rotationKey]);

  useEffect(() => {
    const initialIndexes = [0, 0, 0, 0];
    comboImageIndexesRef.current = initialIndexes;
    setComboImageIndexes(initialIndexes);
    lastHandledRotationKeyRef.current = rotationKeyRef.current;
    resetPreparedRotation();
  }, [imageSets, resetPreparedRotation]);

  useEffect(() => () => {
    clearComboRotationTimers();
    rotationCoordinator.unregister(cardKey);
  }, [cardKey, clearComboRotationTimers, rotationCoordinator]);

  useEffect(() => {
    const nextRotationKey = Number(rotationKey || 0);
    if (nextRotationKey <= 0 || nextRotationKey === lastHandledRotationKeyRef.current) return;
    lastHandledRotationKeyRef.current = nextRotationKey;
    if (rotationRunningRef.current) return;
    if (!imageSets.some((photos) => photos.length > 1)) return undefined;

    const currentIndexes = comboImageIndexesRef.current;
    const nextIndexes = imageSets.map((photos, index) => {
      if (photos.length < 2) return currentIndexes[index] || 0;
      let nextIndex = Math.floor(Math.random() * photos.length);
      if (nextIndex === currentIndexes[index]) nextIndex = (nextIndex + 1) % photos.length;
      return nextIndex;
    });
    const nextUrls = imageSets.map((photos, index) => photos[nextIndexes[index]] || '');
    const pendingCellIndexes = nextUrls
      .map((url, index) => (
        url && imageSets[index]?.length > 1 && nextIndexes[index] !== (currentIndexes[index] || 0)
          ? index
          : null
      ))
      .filter((index): index is number => index !== null);
    if (!pendingCellIndexes.length) return undefined;

    resetPreparedRotation();
    rotationRunningRef.current = true;
    loadedRotationCellIndexesRef.current = new Set();
    const command: ComboRotationCommand = {
      key: nextRotationKey,
      nextIndexes,
      nextUrls,
      pendingCellIndexes,
      startKey: 0,
    };
    rotationCommandRef.current = command;
    rotationCoordinator.markPending(cardKey, nextRotationKey);
    setRotationCommand(command);
    Array.from(new Set(pendingCellIndexes.map((index) => nextUrls[index]).filter(Boolean))).forEach((url) => {
      void Image.prefetch(url).catch(() => false);
    });
    return undefined;
  }, [cardKey, imageSets, resetPreparedRotation, rotationCoordinator, rotationKey]);

  useEffect(() => {
    const signal = Number(rotationStartSignal || 0);
    if (!signal) return;
    const command = rotationCommandRef.current;
    if (!command || Math.abs(signal) !== command.key) return;
    if (signal < 0) {
      resetPreparedRotation();
      return;
    }
    startPreparedRotation(signal);
  }, [resetPreparedRotation, rotationStartSignal, startPreparedRotation]);

  return (
    <Pressable style={[styles.card, !available && styles.cardDisabled]} onPress={onPress}>
      <View style={styles.media}>
        {images.length === 1 ? (
          <Image resizeMode="contain" source={{ uri: images[0] }} style={styles.image} />
        ) : (
          <View style={styles.comboGrid}>
            {[0, 1, 2, 3].map((index) => (
              <View key={index} style={styles.comboCell}>
                <AnimatedComboGridCell
                  direction={comboSlideDirections[index]}
                  onPrepared={(commandKey) => handleComboCellPrepared(index, commandKey)}
                  nextIndex={rotationCommand?.nextIndexes[index] ?? comboImageIndexes[index] ?? null}
                  nextUrl={rotationCommand?.nextUrls[index] || ''}
                  photos={imageSets[index]}
                  prepareKey={rotationCommand?.key || 0}
                  startKey={rotationCommand?.startKey || 0}
                />
              </View>
            ))}
          </View>
        )}
        {discountPercent > 0 ? <Text style={styles.discountBadge}>-{Math.round(discountPercent)}%</Text> : null}
        <Text style={styles.mediaPill}>Собрать комбо ›</Text>
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {combo.title}
        </Text>
        <View style={styles.cardDescription}>
          {combo.description ? (
            <Text numberOfLines={1} style={styles.cardDescriptionLine}>
              {combo.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={styles.price}>от {formatPrice(minPrice)}</Text>
          <View style={styles.plusButton}>
            <Ionicons name="chevron-forward" color={theme.colors.primaryText} size={16} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const MemoProductCard = memo(ProductCard, (previous, next) => (
  previous.product === next.product
    && previous.runtimeStore === next.runtimeStore
    && previous.buildViewModel === next.buildViewModel
    && previous.onDecreaseProduct === next.onDecreaseProduct
    && previous.onIncreaseProduct === next.onIncreaseProduct
    && previous.onPressProduct === next.onPressProduct
));

const MemoComboCard = memo(ComboCard, (previous, next) => (
  previous.cardKey === next.cardKey
    && previous.combo === next.combo
    && previous.rotationCoordinator === next.rotationCoordinator
    && previous.rotationStore === next.rotationStore
));

type CategoryChipsBarHandle = {
  setActiveCategory: (categoryId: number | null, options?: { animated?: boolean; force?: boolean; scroll?: boolean }) => void;
  scrollToCategory: (categoryId: number, options?: { animated?: boolean; force?: boolean }) => void;
};

type CategoryChipsBarProps = {
  activeCategoryStore: NumberValueStore;
  categories: CatalogCategory[];
  isChipInteractingRef: { current: boolean };
  onEndInteractionSoon: () => void;
  onMarkInteraction: () => void;
  onOpenCategories: () => void;
  onPressCategory: (categoryId: number) => void;
};

type CategoryChipProps = {
  activeCategoryStore: NumberValueStore;
  category: CatalogCategory;
  onMeasureCategory: (categoryId: number, offsetX: number) => void;
  onPressCategory: (categoryId: number) => void;
};

const MemoCategoryChip = memo(function CategoryChip({
  activeCategoryStore,
  category,
  onMeasureCategory,
  onPressCategory,
}: CategoryChipProps) {
  const categoryId = Number(category.id);
  const activeCategoryId = useSyncExternalStore(
    activeCategoryStore.subscribe,
    activeCategoryStore.getSnapshot,
    activeCategoryStore.getSnapshot,
  );
  const isActive = categoryId === activeCategoryId;
  return (
    <Pressable
      hitSlop={{ bottom: 8, left: 4, right: 4, top: 8 }}
      style={[styles.chip, isActive && styles.chipActive]}
      onPress={() => onPressCategory(categoryId)}
      onLayout={(event) => {
        onMeasureCategory(categoryId, event.nativeEvent.layout.x);
      }}
    >
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{category.title}</Text>
    </Pressable>
  );
}, (previous, next) => (
  previous.activeCategoryStore === next.activeCategoryStore
    && previous.category === next.category
    && previous.onMeasureCategory === next.onMeasureCategory
    && previous.onPressCategory === next.onPressCategory
));

const CategoryChipsBar = memo(forwardRef<CategoryChipsBarHandle, CategoryChipsBarProps>(function CategoryChipsBar({
  activeCategoryStore,
  categories,
  isChipInteractingRef,
  onEndInteractionSoon,
  onMarkInteraction,
  onOpenCategories,
  onPressCategory,
}, ref) {
  const scrollRef = useRef<ScrollView>(null);
  const chipOffsets = useRef(new Map<number, number>());
  const pendingChipScroll = useRef<{ categoryId: number; options: { animated?: boolean; force?: boolean } } | null>(null);
  const measureCategory = useCallback((categoryId: number, offsetX: number) => {
    chipOffsets.current.set(categoryId, offsetX);
    const pending = pendingChipScroll.current;
    if (pending?.categoryId !== categoryId) return;
    if (!pending.options.force && isChipInteractingRef.current) return;
    pendingChipScroll.current = null;
    scrollRef.current?.scrollTo({
      animated: pending.options.animated !== false,
      x: Math.max(0, offsetX - theme.spacing.sm),
    });
  }, [isChipInteractingRef]);

  const scrollToCategory = useCallback((categoryId: number, options: { animated?: boolean; force?: boolean } = {}) => {
    if (!options.force && isChipInteractingRef.current) return;
    const offsetX = chipOffsets.current.get(categoryId);
    if (offsetX == null) {
      pendingChipScroll.current = { categoryId, options };
      return;
    }
    pendingChipScroll.current = null;
    scrollRef.current?.scrollTo({
      animated: options.animated !== false,
      x: Math.max(0, offsetX - theme.spacing.sm),
    });
  }, [isChipInteractingRef]);

  useImperativeHandle(ref, () => ({
    setActiveCategory(categoryId, options = {}) {
      if (categoryId != null && options.scroll) {
        scrollToCategory(categoryId, options);
      }
    },
    scrollToCategory,
  }), [scrollToCategory]);

  return (
    <>
      <Pressable
        style={styles.categoriesButton}
        onPress={onOpenCategories}
      >
        <Ionicons name="list-outline" color={theme.colors.text} size={20} />
      </Pressable>
      <ScrollView
        ref={scrollRef}
        directionalLockEnabled
        horizontal
        keyboardShouldPersistTaps="always"
        onScrollBeginDrag={onMarkInteraction}
        onScrollEndDrag={onEndInteractionSoon}
        onMomentumScrollEnd={onEndInteractionSoon}
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroller}
        contentContainerStyle={styles.chipsScrollerContent}
      >
        {categories.map((category) => {
          return (
            <MemoCategoryChip
              key={category.id}
              activeCategoryStore={activeCategoryStore}
              category={category}
              onMeasureCategory={measureCategory}
              onPressCategory={onPressCategory}
            />
          );
        })}
      </ScrollView>
    </>
  );
}));

export function CatalogPage() {
  const navigation = useNavigation<CatalogNavigation>();
  const route = useRoute<CatalogRoute>();
  const handledCategorySelectionNonceRef = useRef<number | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<CatalogListItem>>(null);
  const categoryChipsBarRef = useRef<CategoryChipsBarHandle>(null);
  const comboRotationCoordinatorRef = useRef<ComboRotationCoordinator>(createComboRotationCoordinator());
  const comboRotationStoreRef = useRef<NumberValueStore>(createNumberValueStore(0));
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipInteractionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleWarmupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogFocusCartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogFocusFulfillmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveryQuoteRequestKeyRef = useRef<string | null>(null);
  const passportWarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availabilityWarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboDetailsWarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passportWarmQueue = useRef<number[]>([]);
  const availabilityWarmQueue = useRef(new Set<number>());
  const comboDetailsWarmQueue = useRef<number[]>([]);
  const passportWarmRequestedIds = useRef(new Set<number>());
  const comboDetailsWarmRequestedIds = useRef(new Set<number>());
  const isPassportWarmRunning = useRef(false);
  const isComboDetailsWarmRunning = useRef(false);
  const isCatalogScrollingRef = useRef(false);
  const catalogScrollOffsetY = useRef(0);
  const catalogViewportHeight = useRef(0);
  const visibleCatalogScanOffsetY = useRef(Number.NEGATIVE_INFINITY);
  const refreshPullDistanceRef = useRef(0);
  const refreshPullArmedRef = useRef(false);
  const visibleCatalogRowsKey = useRef('');
  const pendingVisibleProductIds = useRef<number[]>([]);
  const pendingVisibleComboIds = useRef<number[]>([]);
  const isStockAvailabilitySyncRunning = useRef(false);
  const stockAvailabilitySyncKey = useRef('');
  const availabilityBootstrapStartedRef = useRef(false);
  const programmaticCategoryId = useRef<number | null>(null);
  const programmaticScrollRequestId = useRef(0);
  const activeCategoryIdRef = useRef<number | null>(null);
  const pinnedSubcategoryCategoryIdRef = useRef<number | null>(null);
  const activeCategoryStoreRef = useRef<NumberValueStore>(createNumberValueStore(null));
  const productRuntimeStoreRef = useRef<ProductRuntimeStore>(createProductRuntimeStore());
  const categoryHeaderLayoutsRef = useRef<Array<{ categoryId: number; offset: number }>>([]);
  const categoryIndexByIdRef = useRef(new Map<number, number>());
  const categoryContentScrollOffsetByIdRef = useRef(new Map<number, number>());
  const categoryDataCacheRef = useRef<CategoryDataCache>(getEmptyCategoryDataCache());
  const categoryNetworkLoadedRef = useRef(new Set<number>());
  const categoryLoadRequestsRef = useRef(new Map<number, Promise<void>>());
  const catalogImagePrefetchUrlsRef = useRef(new Set<string>());
  const fullCatalogWarmVersionRef = useRef('');
  const subcategoryRequestIdByCategoryRef = useRef(new Map<number, number>());
  const subcategoryScrollOffsetByCategoryRef = useRef(new Map<number, number>());
  const subcategoryScrollViewsRef = useRef(new Map<number, {
    inline: ScrollView | null;
    pinned: ScrollView | null;
  }>());
  const categoryNetworkActiveCountRef = useRef(0);
  const categoryNetworkQueueRef = useRef<Array<() => void>>([]);
  const categoryLoadStateRef = useRef<CategoryLoadStateMap>({});
  const catalogVersionRef = useRef('');
  const catalogSnapshotRef = useRef<MobileCatalogSnapshot | null>(null);
  const isChipInteractingRef = useRef(false);
  const { mergeStockRows, refreshMany, stockLevels, unitConversions } = useProductStock();
  const catalogRef = useRef<CatalogState>(emptyCatalogState);
  const cartLinesRef = useRef<CartLine[]>([]);
  const productQuantitiesRef = useRef<Record<number, number>>({});
  const stockLevelsRef = useRef(stockLevels);
  const unitConversionsRef = useRef(unitConversions);
  const flushPendingAvailabilityRef = useRef<() => void>(() => undefined);
  const scheduleProductPassportWarmRef = useRef<(productIds: number[]) => void>(() => undefined);
  const scheduleCatalogAvailabilityRefreshRef = useRef<(productIds: number[], delay?: number) => void>(() => undefined);
  const scheduleComboDetailsWarmRef = useRef<(comboIds: number[]) => void>(() => undefined);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalogState);
  const [activeSubcategoryByCategory, setActiveSubcategoryByCategory] = useState<Record<string, number>>({});
  const [pinnedSubcategoryCategoryId, setPinnedSubcategoryCategoryId] = useState<number | null>(null);
  const [subcategoryErrorByCategory, setSubcategoryErrorByCategory] = useState<Record<string, string>>({});
  const [subcategoryCatalogByCategory, setSubcategoryCatalogByCategory] = useState(new Map<number, {
    combos: CatalogCombo[];
    products: CatalogProduct[];
  }>());
  const [catalogIndex, setCatalogIndex] = useState<MobileCatalogIndex | null>(null);
  const [categoryLoadStates, setCategoryLoadStates] = useState<CategoryLoadStateMap>({});
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [productQuantities, setProductQuantities] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [passportReadyVersion, setPassportReadyVersion] = useState(0);
  const [catalogPassport, setCatalogPassport] = useState<CustomerPassport | null>(null);
  const [fulfillmentSelection, setFulfillmentSelection] = useState<FulfillmentSelection>({
    addressId: null,
    mode: 'delivery',
    pickupCity: null,
    pickupStoreId: null,
  });
  const [catalogAddresses, setCatalogAddresses] = useState<CustomerAddress[]>([]);
  const [catalogStores, setCatalogStores] = useState<TenantStore[]>([]);
  const [catalogOrderConfig, setCatalogOrderConfig] = useState<PublicOrderConfig | null>(null);
  const catalogFulfillmentLoadedRef = useRef(false);

  useEffect(() => {
    setActiveSubcategoryByCategory({});
    pinnedSubcategoryCategoryIdRef.current = null;
    setPinnedSubcategoryCategoryId(null);
    setSubcategoryErrorByCategory({});
    setSubcategoryCatalogByCategory(new Map());
    subcategoryRequestIdByCategoryRef.current.clear();
    subcategoryScrollOffsetByCategoryRef.current.clear();
    subcategoryScrollViewsRef.current.clear();
  }, [catalogIndex?.version]);

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    cartLinesRef.current = cartLines;
  }, [cartLines]);

  useEffect(() => {
    const previous = productQuantitiesRef.current;
    productQuantitiesRef.current = productQuantities;
    const changedIds = new Set<number>();
    Object.keys(previous).forEach((key) => {
      const id = Number(key);
      if ((previous[id] || 0) !== (productQuantities[id] || 0)) changedIds.add(id);
    });
    Object.keys(productQuantities).forEach((key) => {
      const id = Number(key);
      if ((previous[id] || 0) !== (productQuantities[id] || 0)) changedIds.add(id);
    });
    productRuntimeStoreRef.current.emit(Array.from(changedIds));
  }, [productQuantities]);

  useEffect(() => {
    stockLevelsRef.current = stockLevels;
  }, [stockLevels]);

  useEffect(() => {
    unitConversionsRef.current = unitConversions;
    productRuntimeStoreRef.current.emit(collectCatalogProductIds(catalogRef.current));
  }, [unitConversions]);

  useEffect(() => () => {
    if (visibleWarmupTimer.current) clearTimeout(visibleWarmupTimer.current);
    if (chipInteractionTimer.current) clearTimeout(chipInteractionTimer.current);
    if (catalogFocusCartTimer.current) clearTimeout(catalogFocusCartTimer.current);
    if (catalogFocusFulfillmentTimer.current) clearTimeout(catalogFocusFulfillmentTimer.current);
  }, []);

  const mergeCatalogPassports = useCallback((passports: Map<number, CatalogProductPassport>) => {
    if (!passports.size) return;
    setCatalog((current) => {
      let changed = false;
      const productPassports = new Map(current.productPassports);
      passports.forEach((passport, productId) => {
        if (productPassports.get(productId) === passport) return;
        productPassports.set(productId, passport);
        changed = true;
      });
      return changed ? { ...current, productPassports } : current;
    });
  }, []);

  const visibleCategories = useMemo(
    () => catalog.categories.filter((category) => Number(category.id) > 0),
    [catalog.categories],
  );
  const displayCatalog = useMemo(() => {
    const sourceCatalog = !subcategoryCatalogByCategory.size ? catalog : (() => {
      const productsByCategory = new Map(catalog.productsByCategory);
      const combosByCategory = new Map(catalog.combosByCategory);
      subcategoryCatalogByCategory.forEach((view, categoryId) => {
        productsByCategory.set(categoryId, view.products);
        combosByCategory.set(categoryId, view.combos);
      });
      return { ...catalog, combosByCategory, productsByCategory };
    })();
    const combosByCategory = new Map(sourceCatalog.combosByCategory);
    combosByCategory.forEach((combos, categoryId) => {
      combosByCategory.set(categoryId, combos.filter((combo) => isAvailableValue(combo.is_available)));
    });
    return { ...sourceCatalog, combosByCategory };
  }, [catalog, subcategoryCatalogByCategory]);
  const catalogStructureKey = useMemo(
    () => visibleCategories.map((category) => {
      const categoryId = Number(category.id || 0);
      const products = displayCatalog.productsByCategory.get(categoryId) || [];
      const combos = displayCatalog.combosByCategory.get(categoryId) || [];
      const firstProductId = Number(products[0]?.id || 0);
      const lastProductId = Number(products[products.length - 1]?.id || 0);
      const firstComboId = Number(combos[0]?.id || 0);
      const lastComboId = Number(combos[combos.length - 1]?.id || 0);
      return `${categoryId}:${category.title}:${products.length}:${firstProductId}:${lastProductId}:${combos.length}:${firstComboId}:${lastComboId}`;
    }).join('|'),
    [displayCatalog.combosByCategory, displayCatalog.productsByCategory, visibleCategories],
  );
  const categoryLoadStateKey = useMemo(
    () => visibleCategories.map((category) => {
      const categoryId = Number(category.id || 0);
      return `${categoryId}:${getCategoryLoadStatus(categoryLoadStates, categoryId)}`;
    }).join('|'),
    [categoryLoadStates, visibleCategories],
  );
  const categoryCounts = catalogIndex?.categoryCounts || {};
  const categoryCountKey = useMemo(
    () => visibleCategories.map((category) => {
      const categoryId = Number(category.id || 0);
      const count = categoryCounts[String(categoryId)];
      return `${categoryId}:${Number(count?.product_count || 0)}:${Number(count?.combo_count || 0)}:${Number(count?.total_count || 0)}`;
    }).join('|'),
    [categoryCounts, visibleCategories],
  );
  const { categoryIndexById, items: catalogItems } = useMemo(
    () => buildCatalogListItems({
      catalog: displayCatalog,
      categories: visibleCategories,
      categoryCounts,
      fallbackSkeletonRows: catalogCategorySkeletonRows,
      loadStates: categoryLoadStates,
    }),
    [catalogStructureKey, categoryCountKey, categoryLoadStateKey, displayCatalog],
  );
  const catalogItemLayouts = useMemo(
    () => buildCatalogItemLayouts({
      categoriesHeight: CATALOG_CATEGORIES_HEIGHT,
      deliveryHeight: CATALOG_DELIVERY_HEADER_HEIGHT,
      items: catalogItems,
      screenWidth,
      subcategoriesHeight: CATALOG_SUBCATEGORIES_HEIGHT,
    }),
    [catalogItems, screenWidth],
  );
  const subcategoryLayoutByCategory = useMemo(() => {
    const layouts = new Map<number, CatalogItemLayout>();
    catalogItems.forEach((item, index) => {
      if (item.type !== 'subcategories') return;
      const layout = catalogItemLayouts[index];
      if (layout) layouts.set(item.categoryId, layout);
    });
    return layouts;
  }, [catalogItemLayouts, catalogItems]);
  const categoryContentScrollOffsetById = useMemo(() => {
    const offsets = new Map<number, number>();
    categoryIndexById.forEach((headerIndex, categoryId) => {
      let contentIndex = headerIndex + 1;
      let stickyRowsHeight = CATALOG_CATEGORIES_HEIGHT;
      if (catalogItems[contentIndex]?.type === 'subcategories') {
        contentIndex += 1;
        stickyRowsHeight += CATALOG_SUBCATEGORIES_HEIGHT;
      }
      const contentLayout = catalogItemLayouts[contentIndex];
      if (contentLayout) offsets.set(
        categoryId,
        Math.max(0, contentLayout.offset - stickyRowsHeight - CATALOG_CATEGORY_SCROLL_GAP),
      );
    });
    return offsets;
  }, [catalogItemLayouts, catalogItems, categoryIndexById]);
  categoryIndexByIdRef.current = categoryIndexById;
  categoryContentScrollOffsetByIdRef.current = categoryContentScrollOffsetById;
  useEffect(() => {
    const categoryId = programmaticCategoryId.current;
    if (categoryId == null) return;
    const targetOffset = categoryContentScrollOffsetByIdRef.current.get(categoryId);
    if (targetOffset == null) return;
    if (Math.abs(catalogScrollOffsetY.current - targetOffset) <= CATALOG_SCROLL_RETARGET_THRESHOLD) return;
    const frame = requestAnimationFrame(() => {
      if (programmaticCategoryId.current !== categoryId) return;
      listRef.current?.scrollToOffset({ animated: false, offset: targetOffset });
    });
    return () => cancelAnimationFrame(frame);
  }, [categoryContentScrollOffsetById]);
  useEffect(() => {
    visibleCatalogRowsKey.current = '';
  }, [catalogItems]);
  useEffect(() => {
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    const runComboRotationTick = () => {
      const rotationKey = Date.now();
      comboRotationCoordinatorRef.current.beginTick(rotationKey);
      comboRotationStoreRef.current.set(rotationKey);
    };
    const firstTimer = setTimeout(() => {
      runComboRotationTick();
      intervalTimer = setInterval(runComboRotationTick, comboRotationIntervalMs);
    }, comboRotationFirstDelayMs);

    return () => {
      clearTimeout(firstTimer);
      if (intervalTimer) clearInterval(intervalTimer);
    };
  }, []);
  const buildProductCardViewModel = useCallback((product: CatalogProduct): ProductCardViewModel | null => {
    const productId = Number(product.id);
    if (!Number.isFinite(productId) || productId <= 0) return null;
    const passport = getReadyCatalogPassport(productId, catalogRef.current.productPassports);
    const catalogProduct = getCatalogStateProduct(catalogRef.current, productId) || product;
    const currentProduct = passport?.product || catalogProduct;
    const quantity = productQuantitiesRef.current[productId] || 0;
    const currentStockLevels = stockLevelsRef.current;
    const currentUnitConversions = unitConversionsRef.current;
    const currentCartLines = cartLinesRef.current;
    const pricing = passport
      ? getCatalogLinePricing(currentProduct, passport)
      : { oldUnitPrice: getOldPrice(currentProduct), unitPrice: getProductPrice(currentProduct) };
    const price = pricing.unitPrice;
    const oldPrice = pricing.oldUnitPrice;
    const availability = getProductAvailabilityState(currentProduct, currentStockLevels, quantity);
    const nextLine = passport ? buildCatalogProductCartLine(currentProduct, passport, currentStockLevels, currentUnitConversions) : null;
    const canIncreaseOverride = nextLine
      ? calculateCartStockLimit([...currentCartLines, nextLine], currentStockLevels, nextLine.id).canAdd
      : undefined;
    const canIncrease = canIncreaseOverride ?? availability.availableForAdd;
    const totals = calculateBuyXGetYLineTotals({
      badge: currentProduct.buy_x_get_y_badge,
      oldUnitPrice: oldPrice > price ? oldPrice : 0,
      quantity: Math.max(availability.cartQty, 1),
      unitPrice: price,
    });
    return {
      availability,
      canIncrease,
      defaultLines: getProductDefaultLines(currentProduct),
      discountText: getDiscountText(currentProduct, price, oldPrice),
      hasQuantity: availability.cartQty > 0,
      image: getProductImage(catalogProduct),
      mediaPillText: getProductMediaPillText(currentProduct, canIncrease, availability.cartQty, availability.hasKnownStock),
      oldPrice,
      price,
      promoBadgeText: getBuyXGetYBadgeText(currentProduct),
      title: getProductTitle(currentProduct),
      totalOldPrice: totals.oldTotal,
      totalPrice: totals.total,
    };
  }, []);
  const categoryHeaderLayouts = useMemo(
    () => visibleCategories
      .map((category) => {
        const categoryId = Number(category.id);
        const index = categoryIndexById.get(categoryId);
        const layout = index != null ? catalogItemLayouts[index] : null;
        return layout && Number.isFinite(categoryId) && categoryId > 0
          ? { categoryId, offset: layout.offset }
          : null;
      })
      .filter((item): item is { categoryId: number; offset: number } => item !== null),
    [catalogItemLayouts, categoryIndexById, visibleCategories],
  );
  useEffect(() => {
    categoryHeaderLayoutsRef.current = categoryHeaderLayouts;
  }, [categoryHeaderLayouts]);

  const selectedCatalogAddress = useMemo(
    () => findSelectedAddress(catalogAddresses, fulfillmentSelection),
    [catalogAddresses, fulfillmentSelection],
  );
  const selectedCatalogStore = useMemo(
    () => findSelectedStore(catalogStores, fulfillmentSelection),
    [catalogStores, fulfillmentSelection],
  );
  const catalogDeliveryHours = useMemo(
    () => formatDeliveryHours(catalogOrderConfig, selectedCatalogStore),
    [catalogOrderConfig, selectedCatalogStore],
  );
  const catalogPickupHours = useMemo(
    () => formatPickupHours(selectedCatalogStore),
    [selectedCatalogStore],
  );
  const isCatalogDeliveryMode = fulfillmentSelection.mode !== 'pickup';
  const catalogAddressLabel = isCatalogDeliveryMode
    ? formatAddressLine(selectedCatalogAddress) || 'Укажите адрес'
    : normalizeCatalogText(selectedCatalogStore?.address || selectedCatalogStore?.name) || 'Выберите точку самовывоза';

  const warmActiveCategory = useCallback((categoryId: number) => {
    if (isCatalogScrollingRef.current) return;
    const productIds = (catalogRef.current.productsByCategory.get(categoryId) || [])
      .slice(0, 12)
      .map((product) => Number(product.id || 0));
    scheduleProductPassportWarmRef.current(productIds.slice(0, 8));
  }, []);

  const setActiveCategory = useCallback((
    categoryId: number | null,
    options: { animated?: boolean; force?: boolean; scrollChips?: boolean; warmup?: boolean } = {},
  ) => {
    if (activeCategoryIdRef.current === categoryId) {
      if (categoryId != null && options.scrollChips) {
        categoryChipsBarRef.current?.scrollToCategory(categoryId, options);
      }
      return;
    }

    activeCategoryIdRef.current = categoryId;
    activeCategoryStoreRef.current.set(categoryId);
    categoryChipsBarRef.current?.setActiveCategory(categoryId, {
      animated: options.animated,
      force: options.force,
      scroll: options.scrollChips,
    });

    if (categoryId != null && options.warmup) warmActiveCategory(categoryId);
  }, [warmActiveCategory]);

  const applyCategoryLoadStates = useCallback((patch: CategoryLoadStateMap) => {
    const next = { ...categoryLoadStateRef.current, ...patch };
    categoryLoadStateRef.current = next;
    setCategoryLoadStates(next);
  }, []);

  const prefetchCatalogProductImages = useCallback((products: CatalogProduct[]) => {
    if (Platform.OS === 'web') return;
    const urls = Array.from(new Set(products.map(getProductImage).filter(Boolean)))
      .filter((url) => !catalogImagePrefetchUrlsRef.current.has(url));
    if (!urls.length) return;
    urls.forEach((url) => catalogImagePrefetchUrlsRef.current.add(url));
    void ExpoImage.prefetch(urls, 'disk');
  }, []);

  const applyCatalogFromCache = useCallback((categories: CatalogCategory[], preferredCategoryId?: number | null) => {
    const safeCategories = Array.isArray(categories) ? categories : [];
    const nextCatalog = buildCatalogStateFromCache(
      safeCategories,
      categoryDataCacheRef.current,
      categoryLoadStateRef.current,
    );
    catalogRef.current = nextCatalog;
    setCatalog(nextCatalog);
    prefetchCatalogProductImages(Array.from(nextCatalog.productsByCategory.values()).flat());
    mergeStockRows(collectStockRowsFromCatalog(nextCatalog, unitConversions));

    const currentActiveId = Number(activeCategoryIdRef.current || 0);
    const nextActiveCategoryId = safeCategories.some((category) => Number(category.id || 0) === currentActiveId)
      ? currentActiveId
      : Number(preferredCategoryId || safeCategories[0]?.id || 0);
    setActiveCategory(
      Number.isFinite(nextActiveCategoryId) && nextActiveCategoryId > 0 ? nextActiveCategoryId : null,
      { force: true },
    );
    return nextCatalog;
  }, [mergeStockRows, prefetchCatalogProductImages, setActiveCategory, unitConversions]);

  const applyLoadedCategory = useCallback((categoryId: number, products: CatalogProduct[], combos: CatalogCombo[]) => {
    cacheCategoryProducts(categoryDataCacheRef.current, categoryId, products, combos);
    prefetchCatalogProductImages(products);
    applyCategoryLoadStates({ [String(categoryId)]: 'loaded' });
    setCatalog((current) => {
      const nextCatalog = buildCatalogStateFromCache(
        current.categories,
        categoryDataCacheRef.current,
        categoryLoadStateRef.current,
      );
      catalogRef.current = nextCatalog;
      return nextCatalog;
    });
    const categoryPassportMap = new Map<number, CatalogProductPassport>();
    products.forEach((product) => {
      const productId = Number(product.id || 0);
      const passport = categoryDataCacheRef.current.productPassports.get(productId);
      if (Number.isFinite(productId) && productId > 0 && passport) categoryPassportMap.set(productId, passport);
    });
    mergeStockRows([
      ...products.map(stockLevelFromProduct).filter((row): row is ProductStockLevel => !!row),
      ...extractStockRowsFromCatalogPassports(categoryPassportMap, unitConversions),
    ]);
    productRuntimeStoreRef.current.emit(products.map((product) => Number(product.id || 0)));
  }, [applyCategoryLoadStates, mergeStockRows, prefetchCatalogProductImages, unitConversions]);

  const startQueuedCategoryNetworkLoads = useCallback(() => {
    while (
      categoryNetworkActiveCountRef.current < catalogCategoryMaxConcurrentLoads
      && categoryNetworkQueueRef.current.length
    ) {
      const run = categoryNetworkQueueRef.current.shift();
      if (run) run();
    }
  }, []);

  const enqueueCategoryNetworkLoad = useCallback((id: number, force: boolean) => {
    const pending = categoryLoadRequestsRef.current.get(id);
    if (pending) return pending;

    applyCategoryLoadStates({ [String(id)]: 'loading' });
    const request = new Promise<void>((resolve) => {
      const run = () => {
        categoryNetworkActiveCountRef.current += 1;
        void (async () => {
          try {
            if (!force && getCategoryLoadStatus(categoryLoadStateRef.current, id) === 'loaded') return;
            const category = catalogRef.current.categories.find((item) => Number(item.id) === id);
            const childIds = Array.isArray(category?.children)
              ? category.children.map((child) => Number(child.id)).filter((childId) => childId > 0)
              : [];
            const categoryIds = [id, ...childIds];
            const batch = await fetchCatalogByCategories(categoryIds);
            categoryIds.forEach((categoryId) => categoryNetworkLoadedRef.current.add(categoryId));
            categoryIds.forEach((categoryId) => {
              cacheCategoryProducts(
                categoryDataCacheRef.current,
                categoryId,
                batch.productsByCategory.get(categoryId) || [],
                batch.combosByCategory.get(categoryId) || [],
              );
            });
            const products = mergeCatalogItemsById(categoryIds.map((categoryId) => batch.productsByCategory.get(categoryId) || []));
            const combos = mergeCatalogItemsById(categoryIds.map((categoryId) => batch.combosByCategory.get(categoryId) || []));
            const catalogVersion = catalogVersionRef.current;
            if (catalogVersion) {
              void Promise.all(categoryIds.map((categoryId) => saveCatalogCategory(catalogVersion, categoryId, {
                combosByCategory: new Map([[
                  categoryId,
                  categoryId === id ? combos : (batch.combosByCategory.get(categoryId) || []),
                ]]),
                productsByCategory: new Map([[
                  categoryId,
                  categoryId === id ? products : (batch.productsByCategory.get(categoryId) || []),
                ]]),
              }))).catch(() => null);
            }
            applyLoadedCategory(id, products, combos);
          } catch {
            applyCategoryLoadStates({ [String(id)]: 'error' });
          } finally {
            categoryLoadRequestsRef.current.delete(id);
            categoryNetworkActiveCountRef.current = Math.max(0, categoryNetworkActiveCountRef.current - 1);
            resolve();
            startQueuedCategoryNetworkLoads();
          }
        })();
      };

      categoryNetworkQueueRef.current.push(run);
      startQueuedCategoryNetworkLoads();
    });

    categoryLoadRequestsRef.current.set(id, request);
    return request;
  }, [applyCategoryLoadStates, applyLoadedCategory, startQueuedCategoryNetworkLoads]);

  const ensureCategoryLoaded = useCallback(async (categoryId: number, options: { force?: boolean } = {}) => {
    const id = Number(categoryId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const currentStatus = getCategoryLoadStatus(categoryLoadStateRef.current, id);
    if (!options.force && currentStatus === 'loaded') return;

    if (!options.force && hasCachedCategoryData(categoryDataCacheRef.current, id)) {
      applyLoadedCategory(
        id,
        categoryDataCacheRef.current.productsByCategory.get(id) || [],
        categoryDataCacheRef.current.combosByCategory.get(id) || [],
      );
      return;
    }

    const catalogVersion = catalogVersionRef.current;
    if (!options.force && catalogVersion) {
      const cachedCategory = await readCachedCatalogCategory(catalogVersion, id);
      if (cachedCategory) {
        applyLoadedCategory(
          id,
          cachedCategory.productsByCategory.get(id) || [],
          cachedCategory.combosByCategory.get(id) || [],
        );
        return;
      }
    }

    return enqueueCategoryNetworkLoad(id, Boolean(options.force));
  }, [applyLoadedCategory, enqueueCategoryNetworkLoad]);

  const warmFullCatalog = useCallback((index: MobileCatalogIndex) => {
    const version = String(index.version || '').trim();
    if (!version || fullCatalogWarmVersionRef.current === version) return;
    fullCatalogWarmVersionRef.current = version;
    const categoryIds = index.categories
      .map((category) => Number(category.id || 0))
      .filter((categoryId) => Number.isFinite(categoryId) && categoryId > 0);
    void Promise.all(categoryIds.map((categoryId) => ensureCategoryLoaded(categoryId, { force: true })));
  }, [ensureCategoryLoaded]);

  const syncCatalogAvailabilityIds = useCallback(async (productIds: number[], force = false) => {
    const ids = normalizeCatalogProductIds(productIds);
    if (!ids.length) return;
    const syncKey = ids.join(',');
    if (!force && stockAvailabilitySyncKey.current === syncKey) return;
    if (isStockAvailabilitySyncRunning.current) {
      ids.forEach((productId) => availabilityWarmQueue.current.add(productId));
      return;
    }
    isStockAvailabilitySyncRunning.current = true;
    try {
      const result = await refreshMany(ids).catch(() => null);
      const availability = result?.payload || null;
      if (!availability) return;
      const data = availability.data && typeof availability.data === 'object'
        ? availability.data as Record<string, unknown>
        : {};
      mergeStockRows(extractStockRowsFromAvailabilityPayload(availability));
      productRuntimeStoreRef.current.emit(ids);
      setCatalog((current) => {
        const nextCatalog = applyCatalogAvailability(current, data);
        if (nextCatalog !== current) catalogRef.current = nextCatalog;
        return nextCatalog;
      });
      const cachedSnapshot = catalogSnapshotRef.current;
      if (cachedSnapshot) {
        const nextSnapshot = applySnapshotAvailability(cachedSnapshot, data);
        if (nextSnapshot !== cachedSnapshot) {
          catalogSnapshotRef.current = nextSnapshot;
          void saveMobileCatalogSnapshot(nextSnapshot).catch(() => null);
        }
      }
      stockAvailabilitySyncKey.current = syncKey;
    } finally {
      isStockAvailabilitySyncRunning.current = false;
      if (availabilityWarmQueue.current.size && !availabilityWarmTimer.current) {
        availabilityWarmTimer.current = setTimeout(() => {
          flushPendingAvailabilityRef.current();
        }, 140);
      }
    }
  }, [mergeStockRows, refreshMany]);

  const flushPendingAvailability = useCallback(() => {
    availabilityWarmTimer.current = null;
    if (isCatalogScrollingRef.current) {
      availabilityWarmTimer.current = setTimeout(() => {
        flushPendingAvailabilityRef.current();
      }, 450);
      return;
    }
    const productIds = normalizeCatalogProductIds(Array.from(availabilityWarmQueue.current));
    availabilityWarmQueue.current.clear();
    if (!productIds.length) return;
    void syncCatalogAvailabilityIds(productIds);
  }, [syncCatalogAvailabilityIds]);

  useEffect(() => {
    flushPendingAvailabilityRef.current = flushPendingAvailability;
  }, [flushPendingAvailability]);

  const scheduleCatalogAvailabilityRefresh = useCallback((productIds: number[], delay = 180) => {
    const ids = normalizeCatalogProductIds([
      ...productIds,
      ...collectCartAvailabilityProductIds(cartLinesRef.current, stockLevelsRef.current),
    ]);
    ids.forEach((productId) => availabilityWarmQueue.current.add(productId));
    if (!availabilityWarmQueue.current.size || availabilityWarmTimer.current) return;
    availabilityWarmTimer.current = setTimeout(() => {
      flushPendingAvailabilityRef.current();
    }, delay);
  }, []);

  useEffect(() => {
    scheduleCatalogAvailabilityRefreshRef.current = scheduleCatalogAvailabilityRefresh;
  }, [scheduleCatalogAvailabilityRefresh]);

  const loadCatalog = useCallback(async (options: { preserveContent?: boolean; syncAvailability?: boolean; refreshFromServer?: boolean } = {}) => {
    const preserveContent = Boolean(options.preserveContent);
    const shouldSyncAvailability = Boolean(options.syncAvailability);
    const shouldRefreshFromServer = Boolean(options.refreshFromServer);
    let availabilityScheduledForLoad = false;
    if (!preserveContent) {
      setErrorText('');
      setIsLoading(true);
    }

    const scheduleCatalogPostPaintWarmup = (nextCatalog: CatalogState) => {
      const initialProductIds = collectInitialCatalogProductIds(nextCatalog);
      const loadedCatalogProductIds = collectCatalogProductIds(nextCatalog);
      const initialComboIds = collectInitialCatalogComboIds(nextCatalog);
      setTimeout(() => {
        if (
          !availabilityScheduledForLoad
          && (!availabilityBootstrapStartedRef.current || shouldSyncAvailability)
        ) {
          availabilityScheduledForLoad = true;
          availabilityBootstrapStartedRef.current = true;
          if (shouldSyncAvailability) stockAvailabilitySyncKey.current = '';
          scheduleCatalogAvailabilityRefreshRef.current(loadedCatalogProductIds, 180);
        }
        scheduleProductPassportWarmRef.current(initialProductIds.slice(0, 8));
        scheduleComboDetailsWarmRef.current(initialComboIds);
      }, 80);
    };

    let hasRenderedCatalog = false;

    try {
      if (shouldRefreshFromServer) {
        categoryDataCacheRef.current = getEmptyCategoryDataCache();
        categoryNetworkLoadedRef.current.clear();
        catalogImagePrefetchUrlsRef.current.clear();
        fullCatalogWarmVersionRef.current = '';
        categoryLoadStateRef.current = {};
        setCategoryLoadStates({});
      }

      const cachedIndex = shouldRefreshFromServer ? null : await readCachedMobileCatalogIndex().catch(() => null);
      if (cachedIndex?.categories?.length) {
        catalogVersionRef.current = cachedIndex.version;
        setCatalogIndex(cachedIndex);
        applyCatalogFromCache(cachedIndex.categories, Number(activeCategoryIdRef.current || cachedIndex.categories[0]?.id || 0));
        hasRenderedCatalog = true;
        setIsLoading(false);
      }

      const cachedSnapshot = await readCachedMobileCatalogSnapshot().catch(() => null);
      catalogSnapshotRef.current = cachedSnapshot;
      const cachedCatalog = isMobileCatalogSnapshotUsable(cachedSnapshot)
        ? getCatalogStateFromSnapshot(cachedSnapshot as MobileCatalogSnapshot)
        : null;
      if (cachedCatalog) {
        const snapshotIndex = getCatalogIndexFromSnapshot(cachedSnapshot as MobileCatalogSnapshot);
        if (!cachedIndex || cachedIndex.version !== snapshotIndex.version) {
          catalogVersionRef.current = snapshotIndex.version;
          setCatalogIndex(snapshotIndex);
          void saveMobileCatalogIndex(snapshotIndex).catch(() => null);
        }
        categoryDataCacheRef.current = getEmptyCategoryDataCache();
        cacheCatalogState(categoryDataCacheRef.current, cachedCatalog);
        const preferredCategoryId = Number(activeCategoryIdRef.current || cachedCatalog.categories[0]?.id || 0);
        if (Number.isFinite(preferredCategoryId) && preferredCategoryId > 0) {
          categoryLoadStateRef.current = { [String(preferredCategoryId)]: 'loaded' };
          setCategoryLoadStates(categoryLoadStateRef.current);
        }
        const partialCatalog = applyCatalogFromCache(cachedCatalog.categories, preferredCategoryId);
        scheduleCatalogPostPaintWarmup(partialCatalog);
        hasRenderedCatalog = true;
        setIsLoading(false);
      }

      {
        const freshIndex = await fetchMobileCatalogIndex().catch(async () => {
          if (hasRenderedCatalog) return null;
          const categories = await fetchCatalogCategories();
          return {
            categories,
            categoryCounts: {},
            generated_at: new Date().toISOString(),
            store_id: Number(apiConfig.storeId || 0) || undefined,
            tenant_id: Number(apiConfig.tenantId || 0) || undefined,
            version: `categories:${Date.now()}`,
          } as MobileCatalogIndex;
        });
        if (freshIndex && Array.isArray(freshIndex.categories) && freshIndex.categories.length) {
          catalogVersionRef.current = freshIndex.version;
          setCatalogIndex(freshIndex);
          if (shouldRefreshFromServer) {
            categoryDataCacheRef.current = getEmptyCategoryDataCache();
            categoryLoadStateRef.current = {};
            setCategoryLoadStates({});
          }
          applyCatalogFromCache(freshIndex.categories, Number(activeCategoryIdRef.current || freshIndex.categories[0]?.id || 0));
          hasRenderedCatalog = true;
          setIsLoading(false);

          const categoryToLoad = Number(activeCategoryIdRef.current || freshIndex.categories[0]?.id || 0);
          if (Number.isFinite(categoryToLoad) && categoryToLoad > 0) {
            const category = freshIndex.categories.find((item) => Number(item.id) === categoryToLoad);
            const hasUncachedChild = Array.isArray(category?.children)
              && category.children.some((child) => {
                const childId = Number(child.id || 0);
                return childId > 0 && !hasCachedCategoryData(categoryDataCacheRef.current, childId);
              });
            await ensureCategoryLoaded(categoryToLoad, { force: shouldRefreshFromServer || hasUncachedChild });
            scheduleCatalogPostPaintWarmup(catalogRef.current);
          }
          warmFullCatalog(freshIndex);
        } else if (!hasRenderedCatalog && !preserveContent) {
          setCatalog(emptyCatalogState);
        }
      }
    } catch (error) {
      if (!hasRenderedCatalog && !preserveContent) {
        setCatalog(emptyCatalogState);
        setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить каталог');
      }
    } finally {
      if (!preserveContent) setIsLoading(false);
    }
  }, [applyCatalogFromCache, ensureCategoryLoaded, warmFullCatalog]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadCatalogFulfillmentState = useCallback(async (refreshFromServer = false) => {
    try {
      const cachedPassport = await readCachedCustomerPassport();
      const storedSelection = await readFulfillmentSelection().catch(() => ({
        addressId: null,
        mode: 'delivery' as FulfillmentMode,
        pickupCity: null,
        pickupStoreId: null,
      }));
      const [cachedStores, cachedOrderConfig] = await Promise.all([
        readCachedTenantStores(),
        readCachedPublicOrderConfig(),
      ]);
      const cachedAddresses = cachedPassport?.token
        ? await readCachedCustomerAddresses(cachedPassport.token)
        : cachedPassport?.addresses || [];
      const nextStores = cachedStores || [];
      const nextOrderConfig = cachedOrderConfig || null;
      const nextSelection = resolveCatalogFulfillmentSelection(storedSelection, cachedAddresses, nextStores);

      setCatalogPassport(cachedPassport);
      setCatalogStores(nextStores);
      setCatalogOrderConfig(nextOrderConfig);
      setCatalogAddresses(cachedAddresses);
      setFulfillmentSelection(nextSelection);

      if (!refreshFromServer) return;

      const token = String(cachedPassport?.token || '').trim();
      const [freshStores, freshOrderConfig, freshAddresses] = await Promise.all([
        fetchTenantStores().catch(() => nextStores),
        fetchPublicOrderConfig().catch(() => nextOrderConfig),
        token ? fetchCustomerAddresses(token).catch(() => cachedAddresses) : Promise.resolve(cachedAddresses),
      ]);
      if (!isSameCachedValue(freshStores, nextStores)) setCatalogStores(freshStores);
      if (!isSameCachedValue(freshOrderConfig, nextOrderConfig)) setCatalogOrderConfig(freshOrderConfig);
      if (token) {
        setCatalogPassport({
          ...(cachedPassport as CustomerPassport),
          addresses: freshAddresses,
          updatedAt: new Date().toISOString(),
        });
      }
      if (!isSameCachedValue(freshAddresses, cachedAddresses)) {
        setCatalogAddresses(freshAddresses);
        setFulfillmentSelection(resolveCatalogFulfillmentSelection(storedSelection, freshAddresses, freshStores));
      } else if (!isSameCachedValue(freshStores, nextStores)) {
        setFulfillmentSelection(resolveCatalogFulfillmentSelection(storedSelection, cachedAddresses, freshStores));
      }
    } catch {
      return;
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        loadCatalog({ preserveContent: true, syncAvailability: true, refreshFromServer: true }),
        loadCatalogFulfillmentState(true),
        readCartLines().then((nextLines) => {
          setCartLines(nextLines);
          setProductQuantities(buildProductQuantitiesFromCart(nextLines));
        }).catch(() => {
          setCartLines([]);
          setProductQuantities({});
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCatalog, loadCatalogFulfillmentState, refreshing]);

  const refreshCatalogFromPull = useCallback(() => {
    if (!isAndroid && !refreshPullArmedRef.current) {
      refreshPullDistanceRef.current = 0;
      refreshPullArmedRef.current = false;
      return;
    }
    refreshPullDistanceRef.current = 0;
    refreshPullArmedRef.current = false;
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void loadCatalogFulfillmentState(false).finally(() => {
      catalogFulfillmentLoadedRef.current = true;
    });
  }, [loadCatalogFulfillmentState]);

  useFocusEffect(
    useCallback(() => {
      if (!catalogFulfillmentLoadedRef.current) return;
      let isActive = true;
      if (catalogFocusFulfillmentTimer.current) clearTimeout(catalogFocusFulfillmentTimer.current);
      catalogFocusFulfillmentTimer.current = setTimeout(() => {
        catalogFocusFulfillmentTimer.current = null;
        if (isActive) void loadCatalogFulfillmentState(false).catch(() => null);
      }, CATALOG_FOCUS_RESUME_DELAY_MS);
      return () => {
        isActive = false;
        if (catalogFocusFulfillmentTimer.current) {
          clearTimeout(catalogFocusFulfillmentTimer.current);
          catalogFocusFulfillmentTimer.current = null;
        }
      };
    }, [loadCatalogFulfillmentState]),
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (catalogFocusCartTimer.current) clearTimeout(catalogFocusCartTimer.current);
      catalogFocusCartTimer.current = setTimeout(() => {
        catalogFocusCartTimer.current = null;
        readCartLines().then((cartLines) => {
          if (isActive) {
            setCartLines(cartLines);
            setProductQuantities(buildProductQuantitiesFromCart(cartLines));
          }
        }).catch(() => {
          if (isActive) {
            setCartLines([]);
            setProductQuantities({});
          }
        });
      }, CATALOG_FOCUS_RESUME_DELAY_MS);
      return () => {
        isActive = false;
        if (catalogFocusCartTimer.current) {
          clearTimeout(catalogFocusCartTimer.current);
          catalogFocusCartTimer.current = null;
        }
      };
    }, []),
  );

  useEffect(() => {
    const token = String(catalogPassport?.token || '').trim();
    if (!token || !isCatalogDeliveryMode || !selectedCatalogAddress) {
      deliveryQuoteRequestKeyRef.current = null;
      return undefined;
    }
    const addressCacheKey = buildCustomerAddressCacheKey(selectedCatalogAddress);
    if (isFreshDeliveryQuoteForAddress(selectedCatalogAddress)) {
      if (deliveryQuoteRequestKeyRef.current === addressCacheKey) deliveryQuoteRequestKeyRef.current = null;
      return undefined;
    }
    if (deliveryQuoteRequestKeyRef.current === addressCacheKey) return undefined;
    deliveryQuoteRequestKeyRef.current = addressCacheKey;
    let cancelled = false;
    void ensureCustomerAddressDeliveryQuote(token, selectedCatalogAddress)
      .then((quotedAddress) => {
        if (cancelled || !quotedAddress) return;
        setCatalogAddresses((current) => current.map((address) => (
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
  }, [catalogPassport?.token, isCatalogDeliveryMode, selectedCatalogAddress]);

  useEffect(() => () => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    if (passportWarmTimer.current) clearTimeout(passportWarmTimer.current);
    if (availabilityWarmTimer.current) clearTimeout(availabilityWarmTimer.current);
    if (comboDetailsWarmTimer.current) clearTimeout(comboDetailsWarmTimer.current);
  }, []);

  const runPassportWarmQueue = useCallback(async () => {
    if (isPassportWarmRunning.current || isCatalogScrollingRef.current) return;
    isPassportWarmRunning.current = true;
    const passportMap = new Map<number, CatalogProductPassport>();
    try {
      while (passportWarmQueue.current.length && !isCatalogScrollingRef.current) {
        const batch = passportWarmQueue.current.splice(0, 4);
        const passports = await Promise.all(batch.map((productId) => ensureMobileCatalogProductPassport(productId).catch(() => null)));
        passports.forEach((passport) => {
          const productId = Number(passport?.product?.id || 0);
          if (Number.isFinite(productId) && productId > 0 && passport) passportMap.set(productId, passport);
        });
      }
      if (passportMap.size) {
        mergeCatalogPassports(passportMap);
        const passportRows = extractStockRowsFromCatalogPassports(passportMap, unitConversions);
        if (passportRows.length) mergeStockRows(passportRows);
        setPassportReadyVersion((version) => version + 1);
        productRuntimeStoreRef.current.emit(Array.from(passportMap.keys()));
      }
    } finally {
      isPassportWarmRunning.current = false;
    }
  }, [mergeCatalogPassports, mergeStockRows, unitConversions]);

  const scheduleProductPassportWarm = useCallback((productIds: number[]) => {
    productIds.forEach((productId) => {
      if (!Number.isFinite(productId) || productId <= 0 || passportWarmRequestedIds.current.has(productId)) return;
      passportWarmRequestedIds.current.add(productId);
      passportWarmQueue.current.push(productId);
    });
    if (!passportWarmQueue.current.length || passportWarmTimer.current || isCatalogScrollingRef.current) return;
    passportWarmTimer.current = setTimeout(() => {
      passportWarmTimer.current = null;
      if (isCatalogScrollingRef.current) return;
      void runPassportWarmQueue();
    }, 120);
  }, [runPassportWarmQueue]);

  useEffect(() => {
    scheduleProductPassportWarmRef.current = scheduleProductPassportWarm;
  }, [scheduleProductPassportWarm]);

  const runComboDetailsWarmQueue = useCallback(async () => {
    if (isComboDetailsWarmRunning.current || isCatalogScrollingRef.current) return;
    isComboDetailsWarmRunning.current = true;
    try {
      const batch = comboDetailsWarmQueue.current.splice(0, 2);
      for (const comboId of batch) {
        const cached = getMemoryCatalogComboDetails(comboId) || await readCachedCatalogComboDetails(comboId).catch(() => null);
        if (!cached) await fetchCatalogComboDetails(comboId).catch(() => null);
      }
    } finally {
      isComboDetailsWarmRunning.current = false;
      if (comboDetailsWarmQueue.current.length && !isCatalogScrollingRef.current && !comboDetailsWarmTimer.current) {
        comboDetailsWarmTimer.current = setTimeout(() => {
          comboDetailsWarmTimer.current = null;
          void runComboDetailsWarmQueue();
        }, 500);
      }
    }
  }, []);

  const scheduleComboDetailsWarm = useCallback((comboIds: number[]) => {
    normalizeCatalogProductIds(comboIds).slice(0, 2).forEach((comboId) => {
      if (comboDetailsWarmRequestedIds.current.has(comboId)) return;
      comboDetailsWarmRequestedIds.current.add(comboId);
      comboDetailsWarmQueue.current.push(comboId);
    });
    if (!comboDetailsWarmQueue.current.length || comboDetailsWarmTimer.current || isCatalogScrollingRef.current) return;
    comboDetailsWarmTimer.current = setTimeout(() => {
      comboDetailsWarmTimer.current = null;
      if (!isCatalogScrollingRef.current) void runComboDetailsWarmQueue();
    }, 500);
  }, [runComboDetailsWarmQueue]);

  useEffect(() => {
    scheduleComboDetailsWarmRef.current = scheduleComboDetailsWarm;
  }, [scheduleComboDetailsWarm]);

  const flushVisibleWarmups = useCallback(() => {
    visibleWarmupTimer.current = null;
    if (isCatalogScrollingRef.current) {
      visibleWarmupTimer.current = setTimeout(() => {
        flushVisibleWarmups();
      }, 260);
      return;
    }
    const productIds = pendingVisibleProductIds.current;
    const comboIds = pendingVisibleComboIds.current;
    pendingVisibleProductIds.current = [];
    pendingVisibleComboIds.current = [];
    scheduleProductPassportWarmRef.current(productIds);
    scheduleComboDetailsWarmRef.current(comboIds);
  }, []);

  const scheduleVisibleWarmups = useCallback((productIds: number[], comboIds: number[]) => {
    pendingVisibleProductIds.current = productIds;
    pendingVisibleComboIds.current = comboIds;
    if (visibleWarmupTimer.current) return;
    visibleWarmupTimer.current = setTimeout(() => {
      flushVisibleWarmups();
    }, isCatalogScrollingRef.current ? 260 : 120);
  }, [flushVisibleWarmups]);

  const updateVisibleCatalogRows = useCallback((offsetY = catalogScrollOffsetY.current, viewportHeight = catalogViewportHeight.current) => {
    if (!viewportHeight) return;
    visibleCatalogScanOffsetY.current = offsetY;
    const top = Math.max(0, offsetY - viewportHeight * 0.5);
    const bottom = offsetY + viewportHeight * 1.15;
    const categoryIdsToLoad = new Set<number>();
    const comboIds: number[] = [];
    const productIds: number[] = [];

    let low = 0;
    let high = catalogItemLayouts.length - 1;
    let firstVisibleIndex = catalogItemLayouts.length;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const layout = catalogItemLayouts[middle];
      if (layout && layout.offset + layout.length >= top) {
        firstVisibleIndex = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }

    for (let index = firstVisibleIndex; index < catalogItems.length; index += 1) {
      const item = catalogItems[index];
      const layout = catalogItemLayouts[index];
      if (!layout) continue;
      if (layout.offset > bottom) break;
      if (item.type === 'header' || item.type === 'skeleton') {
        if (getCategoryLoadStatus(categoryLoadStateRef.current, item.categoryId) === 'idle') {
          categoryIdsToLoad.add(item.categoryId);
        }
        continue;
      }
      if (item.type !== 'row') continue;
      item.cards.forEach((card) => {
        if (card.type === 'combo') {
          comboIds.push(Number(card.combo.id || 0));
          return;
        }
        productIds.push(Number(card.product.id || 0));
      });
    }

    categoryIdsToLoad.forEach((categoryId) => {
      void ensureCategoryLoaded(categoryId);
    });

    const key = [
      normalizeCatalogProductIds(productIds).join(','),
      normalizeCatalogProductIds(comboIds).join(','),
    ].join('|');
    if (visibleCatalogRowsKey.current === key) return;
    visibleCatalogRowsKey.current = key;
    scheduleVisibleWarmups(normalizeCatalogProductIds(productIds), normalizeCatalogProductIds(comboIds));
  }, [catalogItemLayouts, catalogItems, ensureCategoryLoaded, scheduleVisibleWarmups]);

  const updateActiveCategoryFromScroll = useCallback((offsetY = catalogScrollOffsetY.current) => {
    if (programmaticCategoryId.current != null) return;
    const layouts = categoryHeaderLayoutsRef.current;
    if (!layouts.length) return;

    const activationOffset = offsetY + CATALOG_CATEGORIES_HEIGHT + theme.spacing.lg + 1;
    let low = 0;
    let high = layouts.length - 1;
    let activeIndex = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (layouts[middle].offset <= activationOffset) {
        activeIndex = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const nextCategoryId = layouts[activeIndex]?.categoryId ?? null;
    if (nextCategoryId == null) return;
    if (activeCategoryIdRef.current === nextCategoryId) return;
    setActiveCategory(nextCategoryId, { force: true, scrollChips: true });
  }, [setActiveCategory]);

  const updatePinnedSubcategoryFromScroll = useCallback((offsetY = catalogScrollOffsetY.current) => {
    const activationOffset = offsetY + CATALOG_CATEGORIES_HEIGHT + 1;
    const layouts = categoryHeaderLayoutsRef.current;
    let categoryId: number | null = null;

    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      if (layouts[index].offset <= activationOffset) {
        categoryId = layouts[index].categoryId;
        break;
      }
    }

    const subcategoryLayout = categoryId == null ? null : subcategoryLayoutByCategory.get(categoryId);
    const nextPinnedCategoryId = subcategoryLayout && subcategoryLayout.offset <= activationOffset
      ? categoryId
      : null;
    if (pinnedSubcategoryCategoryIdRef.current === nextPinnedCategoryId) return;
    pinnedSubcategoryCategoryIdRef.current = nextPinnedCategoryId;
    setPinnedSubcategoryCategoryId(nextPinnedCategoryId);
  }, [subcategoryLayoutByCategory]);

  useEffect(() => {
    updatePinnedSubcategoryFromScroll();
  }, [catalogItemLayouts, updatePinnedSubcategoryFromScroll]);

  const markChipInteraction = useCallback(() => {
    if (chipInteractionTimer.current) clearTimeout(chipInteractionTimer.current);
    isChipInteractingRef.current = true;
    chipInteractionTimer.current = setTimeout(() => {
      isChipInteractingRef.current = false;
    }, 360);
  }, []);

  const endChipInteractionSoon = useCallback(() => {
    if (chipInteractionTimer.current) clearTimeout(chipInteractionTimer.current);
    chipInteractionTimer.current = setTimeout(() => {
      isChipInteractingRef.current = false;
    }, 160);
  }, []);

  const scrollToCategoryId = useCallback((categoryId: number) => {
    const scrollRequestId = programmaticScrollRequestId.current + 1;
    programmaticScrollRequestId.current = scrollRequestId;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    if (chipInteractionTimer.current) clearTimeout(chipInteractionTimer.current);
    isChipInteractingRef.current = false;
    programmaticCategoryId.current = categoryId;
    setActiveCategory(categoryId, {
      animated: true,
      force: true,
      scrollChips: true,
      warmup: true,
    });
    const index = categoryIndexByIdRef.current.get(categoryId);
    if (index != null) {
      const targetOffset = categoryContentScrollOffsetByIdRef.current.get(categoryId);
      listRef.current?.scrollToOffset({
        animated: !isAndroid,
        offset: targetOffset ?? 0,
      });
    }
    void ensureCategoryLoaded(categoryId).then(() => {
      requestAnimationFrame(() => {
        if (programmaticScrollRequestId.current !== scrollRequestId) return;
        if (programmaticCategoryId.current !== categoryId) return;
        const nextIndex = categoryIndexByIdRef.current.get(categoryId);
        if (nextIndex != null) {
          const nextOffset = categoryContentScrollOffsetByIdRef.current.get(categoryId) ?? 0;
          if (Math.abs(catalogScrollOffsetY.current - nextOffset) > CATALOG_SCROLL_RETARGET_THRESHOLD) {
            listRef.current?.scrollToOffset({
              animated: false,
              offset: nextOffset,
            });
          }
        }
      });
    }).catch(() => null).finally(() => {
      if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
      programmaticScrollTimer.current = setTimeout(() => {
        if (programmaticScrollRequestId.current === scrollRequestId) {
          programmaticCategoryId.current = null;
          updatePinnedSubcategoryFromScroll();
        }
      }, CATALOG_PROGRAMMATIC_SCROLL_RESET_MS);
    });
  }, [ensureCategoryLoaded, setActiveCategory, updatePinnedSubcategoryFromScroll]);

  const pressCategoryChip = useCallback((categoryId: number) => {
    isChipInteractingRef.current = false;
    subcategoryRequestIdByCategoryRef.current.set(
      categoryId,
      Number(subcategoryRequestIdByCategoryRef.current.get(categoryId) || 0) + 1,
    );
    setActiveSubcategoryByCategory((current) => ({ ...current, [String(categoryId)]: 0 }));
    setSubcategoryErrorByCategory((current) => ({ ...current, [String(categoryId)]: '' }));
    setSubcategoryCatalogByCategory((current) => {
      if (!current.has(categoryId)) return current;
      const next = new Map(current);
      next.delete(categoryId);
      return next;
    });
    scrollToCategoryId(categoryId);
  }, [scrollToCategoryId]);

  const openCategories = useCallback(() => {
    navigation.navigate(routes.categories, {
      activeCategoryId: activeCategoryIdRef.current,
      categories: visibleCategories,
    });
  }, [navigation, visibleCategories]);

  const scrollToFilteredCategory = useCallback((categoryId: number) => {
    const targetOffset = categoryContentScrollOffsetById.get(categoryId);
    if (targetOffset == null) return;
    const scrollRequestId = programmaticScrollRequestId.current + 1;
    programmaticScrollRequestId.current = scrollRequestId;
    programmaticCategoryId.current = categoryId;
    setActiveCategory(categoryId, { force: true, scrollChips: true });
    listRef.current?.scrollToOffset({
      animated: !isAndroid,
      offset: targetOffset,
    });
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      if (programmaticScrollRequestId.current !== scrollRequestId) return;
      programmaticCategoryId.current = null;
      updatePinnedSubcategoryFromScroll();
    }, CATALOG_PROGRAMMATIC_SCROLL_RESET_MS);
  }, [categoryContentScrollOffsetById, setActiveCategory, updatePinnedSubcategoryFromScroll]);

  const selectCatalogSubcategory = useCallback(async (categoryId: number, subcategoryId: number) => {
    const category = visibleCategories.find((item) => Number(item.id) === categoryId);
    if (!category) return;
    const previousSubcategoryId = Number(activeSubcategoryByCategory[String(categoryId)] || 0);
    const previousCatalogView = subcategoryCatalogByCategory.get(categoryId) || null;
    const requestId = Number(subcategoryRequestIdByCategoryRef.current.get(categoryId) || 0) + 1;
    subcategoryRequestIdByCategoryRef.current.set(categoryId, requestId);
    setActiveCategory(categoryId, { force: true, scrollChips: true });
    setSubcategoryErrorByCategory((current) => ({ ...current, [String(categoryId)]: '' }));
    if (subcategoryId === 0) {
      setActiveSubcategoryByCategory((current) => ({ ...current, [String(categoryId)]: 0 }));
      setSubcategoryCatalogByCategory((current) => {
        const next = new Map(current);
        next.delete(categoryId);
        return next;
      });
      requestAnimationFrame(() => scrollToFilteredCategory(categoryId));
      return;
    }
    setActiveSubcategoryByCategory((current) => ({ ...current, [String(categoryId)]: subcategoryId }));

    try {
      let products = categoryDataCacheRef.current.productsByCategory.get(subcategoryId);
      let combos = categoryDataCacheRef.current.combosByCategory.get(subcategoryId);
      const catalogVersion = catalogVersionRef.current;
      if (!products || !combos) {
        const cached = catalogVersion
          ? await readCachedCatalogCategory(catalogVersion, subcategoryId)
          : null;
        if (cached) {
          products = cached.productsByCategory.get(subcategoryId) || [];
          combos = cached.combosByCategory.get(subcategoryId) || [];
          cacheCategoryProducts(categoryDataCacheRef.current, subcategoryId, products, combos);
        }
      }
      if (!products || !combos) {
        const batch = await fetchCatalogByCategories([subcategoryId]);
        products = batch.productsByCategory.get(subcategoryId) || [];
        combos = batch.combosByCategory.get(subcategoryId) || [];
        cacheCategoryProducts(categoryDataCacheRef.current, subcategoryId, products, combos);
        if (catalogVersion) {
          void saveCatalogCategory(catalogVersion, subcategoryId, batch).catch(() => null);
        }
      }
      if (subcategoryRequestIdByCategoryRef.current.get(categoryId) !== requestId) return;
      setSubcategoryCatalogByCategory((current) => {
        const next = new Map(current);
        next.set(categoryId, { combos, products });
        return next;
      });
      requestAnimationFrame(() => scrollToFilteredCategory(categoryId));
    } catch (error) {
      if (subcategoryRequestIdByCategoryRef.current.get(categoryId) !== requestId) return;
      setActiveSubcategoryByCategory((current) => ({
        ...current,
        [String(categoryId)]: previousSubcategoryId,
      }));
      setSubcategoryCatalogByCategory((current) => {
        const next = new Map(current);
        if (previousCatalogView) next.set(categoryId, previousCatalogView);
        else next.delete(categoryId);
        return next;
      });
      setSubcategoryErrorByCategory((current) => ({
        ...current,
        [String(categoryId)]: error instanceof Error ? error.message : 'Не удалось загрузить подкатегорию',
      }));
    }
  }, [activeSubcategoryByCategory, scrollToFilteredCategory, setActiveCategory, subcategoryCatalogByCategory, visibleCategories]);

  const changeCatalogMode = useCallback(async (mode: CatalogDeliveryMode) => {
    const nextSelection = resolveCatalogFulfillmentSelection({
      ...fulfillmentSelection,
      mode,
    }, catalogAddresses, catalogStores);
    setFulfillmentSelection(nextSelection);
    const savedSelection = await saveFulfillmentSelection(nextSelection).catch(() => nextSelection);
    if (savedSelection !== nextSelection) setFulfillmentSelection(savedSelection);
  }, [catalogAddresses, catalogStores, fulfillmentSelection]);

  const openCatalogAddresses = useCallback(async () => {
    await saveFulfillmentSelection(fulfillmentSelection).catch(() => fulfillmentSelection);
    navigation.navigate(routes.addresses);
  }, [fulfillmentSelection, navigation]);

  useFocusEffect(
    useCallback(() => {
      const selectedCategoryId = Number(route.params?.selectedCategoryId || 0);
      const selectionNonce = Number(route.params?.categorySelectionNonce || 0);
      if (!Number.isFinite(selectedCategoryId) || selectedCategoryId <= 0) return undefined;
      if (!Number.isFinite(selectionNonce) || selectionNonce <= 0) return undefined;
      if (handledCategorySelectionNonceRef.current === selectionNonce) return undefined;
      if (!visibleCategories.some((category) => Number(category.id) === selectedCategoryId)) return undefined;

      const frame = requestAnimationFrame(() => {
        if (handledCategorySelectionNonceRef.current === selectionNonce) return;
        handledCategorySelectionNonceRef.current = selectionNonce;
        pressCategoryChip(selectedCategoryId);
      });
      return () => cancelAnimationFrame(frame);
    }, [pressCategoryChip, route.params?.categorySelectionNonce, route.params?.selectedCategoryId, visibleCategories]),
  );

  const markCatalogScrolling = useCallback(() => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    if (passportWarmTimer.current) {
      clearTimeout(passportWarmTimer.current);
      passportWarmTimer.current = null;
    }
    if (availabilityWarmTimer.current) {
      clearTimeout(availabilityWarmTimer.current);
      availabilityWarmTimer.current = null;
    }
    if (comboDetailsWarmTimer.current) {
      clearTimeout(comboDetailsWarmTimer.current);
      comboDetailsWarmTimer.current = null;
    }
    isCatalogScrollingRef.current = true;
  }, []);

  const scheduleCatalogScrollIdle = useCallback(() => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => {
      isCatalogScrollingRef.current = false;
      updateActiveCategoryFromScroll();
      updatePinnedSubcategoryFromScroll();
      updateVisibleCatalogRows();
      if (visibleWarmupTimer.current) {
        clearTimeout(visibleWarmupTimer.current);
        flushVisibleWarmups();
      }
      if (passportWarmQueue.current.length && !passportWarmTimer.current) {
        passportWarmTimer.current = setTimeout(() => {
          passportWarmTimer.current = null;
          if (!isCatalogScrollingRef.current) void runPassportWarmQueue();
        }, 40);
      }
      if (availabilityWarmQueue.current.size && !availabilityWarmTimer.current) {
        availabilityWarmTimer.current = setTimeout(() => {
          flushPendingAvailabilityRef.current();
        }, 60);
      }
      if (comboDetailsWarmQueue.current.length && !comboDetailsWarmTimer.current) {
        comboDetailsWarmTimer.current = setTimeout(() => {
          comboDetailsWarmTimer.current = null;
          if (!isCatalogScrollingRef.current) void runComboDetailsWarmQueue();
        }, 180);
      }
      if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
      programmaticCategoryId.current = null;
    }, 180);
  }, [flushVisibleWarmups, runComboDetailsWarmQueue, runPassportWarmQueue, updateActiveCategoryFromScroll, updatePinnedSubcategoryFromScroll, updateVisibleCatalogRows]);

  const handleCatalogScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawOffsetY = Number(event.nativeEvent.contentOffset.y || 0);
    const pullDistance = Math.max(0, -rawOffsetY);
    refreshPullDistanceRef.current = pullDistance;
    refreshPullArmedRef.current = pullDistance >= CATALOG_REFRESH_TRIGGER_DISTANCE;

    const offsetY = Math.max(0, rawOffsetY);
    const viewportHeight = Math.max(0, Number(event.nativeEvent.layoutMeasurement.height || 0));
    catalogScrollOffsetY.current = offsetY;
    if (viewportHeight) catalogViewportHeight.current = viewportHeight;
    updateActiveCategoryFromScroll(offsetY);
    updatePinnedSubcategoryFromScroll(offsetY);
    const visibleScanDistance = Math.max(160, viewportHeight * 0.3);
    if (Math.abs(offsetY - visibleCatalogScanOffsetY.current) >= visibleScanDistance) {
      updateVisibleCatalogRows(offsetY, viewportHeight || catalogViewportHeight.current);
    }
  }, [updateActiveCategoryFromScroll, updatePinnedSubcategoryFromScroll, updateVisibleCatalogRows]);

  const handleCatalogScrollBeginDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Number(event.nativeEvent.contentOffset.y || 0);
    programmaticScrollRequestId.current += 1;
    if (programmaticScrollTimer.current) {
      clearTimeout(programmaticScrollTimer.current);
      programmaticScrollTimer.current = null;
    }
    programmaticCategoryId.current = null;
    if (offsetY <= 0) {
      refreshPullDistanceRef.current = 0;
      refreshPullArmedRef.current = false;
    }
    markCatalogScrolling();
  }, [markCatalogScrolling]);

  const increaseProductQuantity = useCallback(async (product: CatalogProduct) => {
    const productId = Number(product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    const currentProduct = getCatalogStateProduct(catalogRef.current, productId) || product;
    const currentStockLevels = stockLevelsRef.current;
    const currentUnitConversions = unitConversionsRef.current;
    if (!getProductAvailabilityState(currentProduct, currentStockLevels, productQuantitiesRef.current[productId] || 0).availableForAdd) return;
    const passport = getReadyCatalogPassport(productId, catalogRef.current.productPassports) || getCatalogProductPassport(productId);
    if (!passport) {
      void ensureMobileCatalogProductPassport(productId);
      return;
    }
    const passportRows = extractStockRowsFromCatalogPassports(new Map([[productId, passport]]), currentUnitConversions);
    const stockLevelsWithPassport = passportRows.length ? mergeStockRows(passportRows) : currentStockLevels;
    const nextLine = buildCatalogProductCartLine(currentProduct, passport || null, stockLevelsWithPassport, currentUnitConversions);
    const currentLines = await readCartLines();
    const draftLines = [...currentLines, nextLine];
    const localStockLimit = calculateCartStockLimit(draftLines, stockLevelsWithPassport, nextLine.id);
    if (!localStockLimit.canAdd) return;
    const nextLines = await addCartLine(nextLine);
    setCartLines(nextLines);
    setProductQuantities(buildProductQuantitiesFromCart(nextLines));
  }, [mergeStockRows]);

  const decreaseProductQuantity = useCallback(async (productId: number) => {
    const lines = await readCartLines();
    const line = [...lines].reverse().find((item) => item.type === 'product' && Number(item.sourceId) === productId);
    if (!line) {
      setCartLines(lines);
      setProductQuantities(buildProductQuantitiesFromCart(lines));
      return;
    }
    const nextLines = await updateCartLineQuantity(line.id, line.quantity - 1);
    setCartLines(nextLines);
    setProductQuantities(buildProductQuantitiesFromCart(nextLines));
  }, []);

  const openProduct = useCallback((productId: number, productImage: string) => {
    navigation.navigate('product', { productId, productImage: productImage || undefined });
  }, [navigation]);

  const handleDecreaseProduct = useCallback((productId: number) => {
    void decreaseProductQuantity(productId);
  }, [decreaseProductQuantity]);

  const handleIncreaseProduct = useCallback((product: CatalogProduct) => {
    void increaseProductQuantity(product);
  }, [increaseProductQuantity]);

  const renderCatalogCard = useCallback((card: CatalogCardItem) => {
    if (card.type === 'product') {
      return (
        <MemoProductCard
          key={card.cardKey}
          buildViewModel={buildProductCardViewModel}
          onDecreaseProduct={handleDecreaseProduct}
          onIncreaseProduct={handleIncreaseProduct}
          onPressProduct={openProduct}
          product={card.product}
          runtimeStore={productRuntimeStoreRef.current}
        />
      );
    }

    return (
      <MemoComboCard
        key={card.cardKey}
        cardKey={card.cardKey}
        combo={card.combo}
        onPress={() => navigation.navigate('combo', { comboId: Number(card.combo.id), openNonce: Date.now() })}
        rotationCoordinator={comboRotationCoordinatorRef.current}
        rotationStore={comboRotationStoreRef.current}
      />
    );
  }, [
    buildProductCardViewModel,
    handleDecreaseProduct,
    handleIncreaseProduct,
    navigation,
    openProduct,
  ]);

  const registerSubcategoryScrollView = useCallback((
    categoryId: number,
    variant: 'inline' | 'pinned',
    node: ScrollView | null,
  ) => {
    const current = subcategoryScrollViewsRef.current.get(categoryId) || { inline: null, pinned: null };
    current[variant] = node;
    if (!node && !current.inline && !current.pinned) {
      subcategoryScrollViewsRef.current.delete(categoryId);
      return;
    }
    subcategoryScrollViewsRef.current.set(categoryId, current);
    const savedOffset = Number(subcategoryScrollOffsetByCategoryRef.current.get(categoryId) || 0);
    if (node && savedOffset > 0) {
      requestAnimationFrame(() => node.scrollTo({ animated: false, x: savedOffset }));
    }
  }, []);

  const syncSubcategoryScroll = useCallback((
    categoryId: number,
    source: 'inline' | 'pinned',
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = Math.max(0, Number(event.nativeEvent.contentOffset.x || 0));
    subcategoryScrollOffsetByCategoryRef.current.set(categoryId, offsetX);
    const target = subcategoryScrollViewsRef.current.get(categoryId)?.[source === 'inline' ? 'pinned' : 'inline'];
    target?.scrollTo({ animated: false, x: offsetX });
  }, []);

  const renderSubcategoryRow = useCallback((
    categoryId: number,
    children: CatalogCategory[],
    variant: 'inline' | 'pinned',
  ) => {
    const activeSubcategoryId = Number(activeSubcategoryByCategory[String(categoryId)] || 0);
    const subcategoryError = subcategoryErrorByCategory[String(categoryId)] || '';
    return (
      <View style={styles.subcategoriesWrap}>
        <ScrollView
          ref={(node) => registerSubcategoryScrollView(categoryId, variant, node)}
          horizontal
          keyboardShouldPersistTaps="always"
          onMomentumScrollEnd={(event) => syncSubcategoryScroll(categoryId, variant, event)}
          onScrollEndDrag={(event) => syncSubcategoryScroll(categoryId, variant, event)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subcategoriesContent}
        >
          <Pressable
            onPress={() => void selectCatalogSubcategory(categoryId, 0)}
            style={[styles.subcategoryChip, activeSubcategoryId === 0 && styles.subcategoryChipActive]}
          >
            <Text style={[styles.subcategoryChipText, activeSubcategoryId === 0 && styles.subcategoryChipTextActive]}>Все</Text>
          </Pressable>
          {children.map((subcategory) => {
            const subcategoryId = Number(subcategory.id);
            const isActive = activeSubcategoryId === subcategoryId;
            return (
              <Pressable
                key={subcategory.id}
                onPress={() => void selectCatalogSubcategory(categoryId, subcategoryId)}
                style={[styles.subcategoryChip, isActive && styles.subcategoryChipActive]}
              >
                <Text style={[styles.subcategoryChipText, isActive && styles.subcategoryChipTextActive]}>{subcategory.title}</Text>
              </Pressable>
            );
          })}
          {subcategoryError ? <Text style={styles.subcategoryError}>{subcategoryError}</Text> : null}
        </ScrollView>
      </View>
    );
  }, [activeSubcategoryByCategory, registerSubcategoryScrollView, selectCatalogSubcategory, subcategoryErrorByCategory, syncSubcategoryScroll]);

  const pinnedSubcategory = useMemo(() => {
    if (pinnedSubcategoryCategoryId == null) return null;
    const category = visibleCategories.find((item) => Number(item.id) === pinnedSubcategoryCategoryId);
    const children = Array.isArray(category?.children)
      ? category.children.filter((child) => Number(child.id) > 0)
      : [];
    return children.length ? { categoryId: pinnedSubcategoryCategoryId, children } : null;
  }, [pinnedSubcategoryCategoryId, visibleCategories]);

  const renderCatalogItem = useCallback(({ item }: { item: CatalogListItem }) => {
    if (item.type === 'delivery') {
      return (
        <View style={styles.deliverySurface}>
          <View style={styles.deliverySurfaceInner}>
            <View style={styles.deliveryModesRow}>
              <Pressable
                onPress={() => void changeCatalogMode('delivery')}
                style={[styles.deliveryModeButton, styles.deliveryModeButtonLeft, isCatalogDeliveryMode && styles.deliveryModeButtonActive]}
              >
                <View style={[styles.deliveryModeIcon, isCatalogDeliveryMode && styles.deliveryModeIconActive]}>
                  <FontAwesome5 name="truck" color={isCatalogDeliveryMode ? theme.colors.primaryText : theme.colors.accent} size={16} />
                </View>
                <View style={styles.deliveryModeTextWrap}>
                  <Text style={[styles.deliveryModeTitle, isCatalogDeliveryMode && styles.deliveryModeTitleActive]}>Доставка</Text>
                  <Text numberOfLines={1} style={[styles.deliveryModeSubtitle, isCatalogDeliveryMode && styles.deliveryModeSubtitleActive]}>
                    Доставляем
                  </Text>
                  <Text numberOfLines={1} style={[styles.deliveryModeSubtitle, isCatalogDeliveryMode && styles.deliveryModeSubtitleActive]}>
                    {catalogDeliveryHours || 'Время уточняется'}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void changeCatalogMode('pickup')}
                style={[styles.deliveryModeButton, !isCatalogDeliveryMode && styles.deliveryModeButtonActive]}
              >
                <View style={[styles.deliveryModeIcon, !isCatalogDeliveryMode && styles.deliveryModeIconActive]}>
                  <Ionicons name="storefront" color={!isCatalogDeliveryMode ? theme.colors.primaryText : theme.colors.accent} size={18} />
                </View>
                <View style={styles.deliveryModeTextWrap}>
                  <Text style={[styles.deliveryModeTitle, !isCatalogDeliveryMode && styles.deliveryModeTitleActive]}>Самовывоз</Text>
                  <Text numberOfLines={1} style={[styles.deliveryModeSubtitle, !isCatalogDeliveryMode && styles.deliveryModeSubtitleActive]}>
                    Время работы
                  </Text>
                  <Text numberOfLines={1} style={[styles.deliveryModeSubtitle, !isCatalogDeliveryMode && styles.deliveryModeSubtitleActive]}>
                    {catalogPickupHours || 'Время уточняется'}
                  </Text>
                </View>
              </Pressable>
            </View>
            <Pressable onPress={() => void openCatalogAddresses()} style={styles.deliveryAddressRow}>
              <Ionicons name={isCatalogDeliveryMode ? 'location' : 'storefront'} color={theme.colors.accent} size={20} />
              <Text numberOfLines={1} style={styles.deliveryAddressText}>{catalogAddressLabel}</Text>
              <Ionicons name="chevron-forward" color={theme.colors.text} size={20} />
            </Pressable>
          </View>
        </View>
      );
    }

    if (item.type === 'categories') {
      return (
        <View style={styles.chipsWrap}>
          <CategoryChipsBar
            ref={categoryChipsBarRef}
            activeCategoryStore={activeCategoryStoreRef.current}
            categories={visibleCategories}
            isChipInteractingRef={isChipInteractingRef}
            onEndInteractionSoon={endChipInteractionSoon}
            onMarkInteraction={markChipInteraction}
            onOpenCategories={openCategories}
            onPressCategory={pressCategoryChip}
          />
        </View>
      );
    }

    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === 'empty') {
      return (
        <Text style={styles.emptySection}>
          {item.state === 'error'
            ? 'Не удалось загрузить категорию'
            : 'В этой категории пока нет товаров'}
        </Text>
      );
    }

    if (item.type === 'subcategories') {
      if (pinnedSubcategoryCategoryId === item.categoryId) {
        return <View style={styles.subcategoriesPlaceholder} />;
      }
      return renderSubcategoryRow(item.categoryId, item.children, 'inline');
    }

    if (item.type === 'skeleton') {
      return (
        <View style={styles.grid}>
          <CatalogSkeletonCard />
          <CatalogSkeletonCard />
        </View>
      );
    }

    return (
      <View style={styles.grid}>
        {item.cards.map(renderCatalogCard)}
      </View>
    );
  }, [
    catalogAddressLabel,
    catalogDeliveryHours,
    catalogPickupHours,
    changeCatalogMode,
    isCatalogDeliveryMode,
    openCatalogAddresses,
    openCategories,
    pinnedSubcategoryCategoryId,
    pressCategoryChip,
    renderCatalogCard,
    endChipInteractionSoon,
    markChipInteraction,
    renderSubcategoryRow,
    visibleCategories,
  ]);

  const getCatalogItemLayout = useCallback((_data: ArrayLike<CatalogListItem> | null | undefined, index: number) => {
    const layout = catalogItemLayouts[index];
    return layout || { index, length: 0, offset: 0 };
  }, [catalogItemLayouts]);

  return (
    <Screen edges={['top']}>
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.stateText}>Загружаем каталог</Text>
        </View>
      ) : errorText ? (
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Каталог не загрузился</Text>
          <Text style={styles.stateText}>{errorText}</Text>
          <Text style={styles.debugText}>API: {apiConfig.baseUrl}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadCatalog()}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={catalogItems}
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          getItemLayout={getCatalogItemLayout}
          initialNumToRender={8}
          keyExtractor={(item) => item.itemKey}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={6}
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            if (height > 0) {
              catalogViewportHeight.current = height;
              updateVisibleCatalogRows(catalogScrollOffsetY.current, height);
            }
          }}
          onMomentumScrollBegin={markCatalogScrolling}
          onMomentumScrollEnd={scheduleCatalogScrollIdle}
          onScroll={handleCatalogScroll}
          onScrollBeginDrag={handleCatalogScrollBeginDrag}
          onScrollEndDrag={scheduleCatalogScrollIdle}
          onScrollToIndexFailed={(info) => {
            const layout = catalogItemLayouts[info.index];
            listRef.current?.scrollToOffset({
              animated: true,
              offset: Math.max(0, layout?.offset ?? info.averageItemLength * info.index),
            });
          }}
          refreshControl={(
            <RefreshControl
              progressViewOffset={CATALOG_REFRESH_PROGRESS_OFFSET}
              refreshing={refreshing}
              tintColor={theme.colors.accent}
              onRefresh={refreshCatalogFromPull}
            />
          )}
          removeClippedSubviews={false}
          renderItem={renderCatalogItem}
          scrollEventThrottle={16}
          stickyHeaderIndices={[1]}
          updateCellsBatchingPeriod={16}
          windowSize={7}
        />
      )}
      {!isLoading && !errorText && pinnedSubcategory ? (
        <View pointerEvents="box-none" style={styles.pinnedSubcategories}>
          {renderSubcategoryRow(pinnedSubcategory.categoryId, pinnedSubcategory.children, 'pinned')}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 0.56,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    elevation: 1,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    width: '48%',
  },
  cardBody: {
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: 6,
  },
  cardDescription: {
    height: 31,
    marginTop: theme.spacing.xs,
  },
  cardDescriptionLine: {
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  cardDisabled: {
    opacity: 0.68,
  },
  cardFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    minHeight: 40,
    width: '100%',
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    height: 36,
  },
  categoriesButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: theme.sizes.categoryChipHeight,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    width: theme.sizes.categoryChipHeight,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: theme.sizes.categoryChipHeight,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextActive: {
    color: theme.colors.primaryText,
  },
  chipsScroller: {
    flex: 1,
  },
  chipsScrollerContent: {
    alignItems: 'center',
    paddingRight: theme.spacing.lg,
  },
  chipsWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: isAndroid ? 0 : 4,
    flexDirection: 'row',
    height: CATALOG_CATEGORIES_HEIGHT,
    marginHorizontal: -theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    shadowColor: '#111827',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: isAndroid ? 0 : 0.06,
    shadowRadius: 10,
    zIndex: 20,
  },
  deliveryAddressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: theme.spacing.sm,
  },
  deliveryAddressText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: theme.spacing.sm,
  },
  deliveryModeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 74,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  deliveryModeButtonActive: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.accent,
  },
  deliveryModeButtonLeft: {
    marginRight: theme.spacing.sm,
  },
  deliveryModeIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  deliveryModeIconActive: {
    backgroundColor: theme.colors.accent,
  },
  deliveryModeSubtitle: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  deliveryModeSubtitleActive: {
    color: theme.colors.text,
  },
  deliveryModeTextWrap: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  deliveryModeTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  deliveryModeTitleActive: {
    color: theme.colors.text,
  },
  deliveryModesRow: {
    flexDirection: 'row',
  },
  comboCell: {
    backgroundColor: theme.colors.card,
    height: '50%',
    overflow: 'hidden',
    width: '50%',
  },
  comboCellInner: {
    flex: 1,
    overflow: 'hidden',
  },
  comboGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: '100%',
    width: '100%',
  },
  comboImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  content: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  contentInner: {
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 0,
  },
  deliverySurface: {
    backgroundColor: theme.colors.surface,
    height: CATALOG_DELIVERY_HEADER_HEIGHT,
    marginHorizontal: -theme.spacing.lg,
    paddingBottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  deliverySurfaceInner: {
    height: CATALOG_DELIVERY_HEADER_HEIGHT - theme.spacing.md,
    justifyContent: 'center',
  },
  debugText: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  discountBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  discountBadgeWithPromo: {
    right: 48,
  },
  quantityOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  quantityOverlayText: {
    color: theme.colors.primaryText,
    fontSize: 36,
    fontWeight: '900',
  },
  emptySection: {
    color: theme.colors.muted,
    fontSize: 14,
    marginBottom: theme.spacing.xl,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerCaption: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: theme.spacing.xs,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    height: '100%',
    width: '100%',
  },
  idleFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  media: {
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    bottom: 10,
    color: theme.colors.text,
    elevation: 3,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 10,
    shadowColor: '#111827',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  mediaPillDisabled: {
    color: theme.colors.muted,
  },
  oldPrice: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    minHeight: 12,
    textDecorationLine: 'line-through',
  },
  plusButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  plusButtonDisabled: {
    backgroundColor: theme.colors.muted,
  },
  promoBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  price: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  qtyPrice: {
    fontSize: 16,
    lineHeight: 16,
  },
  priceStack: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  qtyPill: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%',
  },
  qtyPillButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  qtyPillButtonDisabled: {
    backgroundColor: theme.colors.surface,
  },
  qtyPillCenter: {
    alignItems: 'center',
    flex: 1,
    height: 32,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  qtyPillCenterWithOld: {
    justifyContent: 'space-between',
  },
  unitPriceText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  unitPriceWrap: {
    left: 0,
    position: 'absolute',
    top: -13,
    width: 32,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  retryButtonText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    backgroundColor: theme.colors.mutedBackground,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    zIndex: 2,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  pinnedSubcategories: {
    elevation: 12,
    left: theme.spacing.lg,
    position: 'absolute',
    right: theme.spacing.lg,
    top: CATALOG_CATEGORIES_HEIGHT,
    zIndex: 19,
  },
  subcategoriesContent: {
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingRight: theme.spacing.lg,
  },
  subcategoriesPlaceholder: {
    height: CATALOG_SUBCATEGORIES_HEIGHT,
  },
  subcategoriesWrap: {
    backgroundColor: 'transparent',
    height: CATALOG_SUBCATEGORIES_HEIGHT,
    justifyContent: 'center',
  },
  subcategoryChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: theme.sizes.categoryChipHeight,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    paddingHorizontal: 14,
  },
  subcategoryChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  subcategoryChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  subcategoryChipTextActive: {
    color: theme.colors.primaryText,
  },
  subcategoryError: {
    alignSelf: 'center',
    color: theme.colors.danger,
    fontSize: 12,
    marginLeft: theme.spacing.xs,
  },
  skeletonButton: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    height: 32,
    width: 32,
  },
  skeletonCard: {
    backgroundColor: theme.colors.card,
  },
  skeletonLine: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 14,
    marginTop: 2,
    width: '88%',
  },
  skeletonLineShort: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 12,
    marginTop: 10,
    width: '64%',
  },
  skeletonMedia: {
    aspectRatio: 1,
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 14,
  },
  skeletonPrice: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 20,
    width: 72,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
