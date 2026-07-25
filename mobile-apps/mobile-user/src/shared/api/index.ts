import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CatalogCategory,
  CatalogCombo,
  CatalogComboDetails,
  CatalogProduct,
  CatalogProductPassport,
  FullProductAvailabilityRequirement,
  FullProductPassport,
  MobileCatalogSnapshot,
  UnitConversion,
} from '../../entities/product';
import { normalizeFullProductPassportMap } from '../../entities/product';
import { apiConfig } from './config';

export { apiConfig } from './config';

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

type BootstrapPayload = {
  categories?: CatalogCategory[];
};

export type CatalogByCategoryPayload = {
  productsByCategory: Map<number, CatalogProduct[]>;
  combosByCategory: Map<number, CatalogCombo[]>;
};

export type CatalogCategoryCount = {
  combo_count: number;
  product_count: number;
  total_count: number;
};

export type MobileCatalogIndex = {
  categories: CatalogCategory[];
  categoryCounts: Record<string, CatalogCategoryCount>;
  generated_at?: string;
  store_id?: number;
  tenant_id?: number;
  version: string;
};

export type CustomerProfile = {
  id: number;
  name?: string | null;
  phone?: string | null;
  birthday?: string | null;
  photo?: string | null;
  total_orders?: number | null;
};

export type DeliveryPriceTier = {
  delivery_cost: number;
  min_order_amount: number;
  sort_order?: number | null;
};

export type DeliveryQuoteCache = {
  address_cache_key: string;
  delivery_cost: number | null;
  delivery_revision?: string | null;
  delivery_store_id: number | null;
  delivery_zone_id: number | null;
  delivery_zone_name: string | null;
  eta_minutes: number | null;
  free_delivery_from: number | null;
  has_settings?: boolean | null;
  min_order_amount: number | null;
  price_tiers: DeliveryPriceTier[];
  resolved_at: string;
  source?: string | null;
};

export type DeliveryQuoteSummary = {
  delivery_cost: number;
  free_delivery_from: number | null;
  matched_tier: DeliveryPriceTier | null;
  min_order_amount: number;
};

export type CustomerAddress = Record<string, unknown> & {
  id?: number;
  city?: string | null;
  street?: string | null;
  house?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  comment?: string | null;
  is_default?: boolean | number | string | null;
  address_ref?: string | null;
  selected_object_type?: string | null;
  resolved_city_source_key?: string | null;
  address_context_locality?: string | null;
  address_normalized_display?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  delivery_zone_id?: number | string | null;
  delivery_store_id?: number | string | null;
  delivery_quote?: DeliveryQuoteCache | null;
};

export type CustomerAddressPayload = {
  city?: string | null;
  street?: string | null;
  house?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  comment?: string | null;
  address_ref?: string | null;
  selected_object_type?: string | null;
  resolved_city_source_key?: string | null;
  address_context_locality?: string | null;
  context_locality?: string | null;
  address_normalized_display?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  delivery_zone_id?: number | string | null;
  delivery_store_id?: number | string | null;
  is_default?: boolean | number | string | null;
};

export type AddressSuggestion = Record<string, unknown> & {
  source_key?: string | null;
  object_type?: string | null;
  selected_object_type?: string | null;
  city_name?: string | null;
  context_locality?: string | null;
  street_name?: string | null;
  house_number?: string | null;
  value?: string | null;
  label?: string | null;
  full_address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

export type ResolvedAddress = CustomerAddressPayload & {
  context_locality?: string | null;
  delivery_cost?: number | null;
  delivery_revision?: string | null;
  delivery_store_id?: number | string | null;
  delivery_zone_id?: number | string | null;
  delivery_zone_name?: string | null;
  eta_minutes?: number | null;
  free_delivery_from?: number | null;
  price_tiers?: DeliveryPriceTier[];
  quote_source?: string | null;
  source?: string | null;
  min_order_amount?: number | null;
};

export type PublicOrderConfig = Record<string, unknown> & {
  storeAddressMapEnabled?: boolean | number | string | null;
};

export type TenantStore = Record<string, unknown> & {
  id?: number;
  name?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  timezone?: string | null;
  is_active?: boolean | number | null;
  isOpen?: boolean | null;
  deliveryIsOpen?: boolean | null;
  storeHours?: Array<Record<string, unknown>>;
  delivery_hours?: Array<Record<string, unknown>>;
};

export type BonusConfig = Record<string, unknown> & {
  account?: Record<string, unknown> | null;
  levels?: Array<Record<string, unknown>>;
  referral_levels?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
};

export type BonusReferrals = Record<string, unknown> & {
  code?: string;
  invite_url?: string;
  levels?: Array<Record<string, unknown>>;
  referrals?: Array<Record<string, unknown>>;
  stats?: Record<string, unknown>;
};

export type BonusFavoriteCategories = Record<string, unknown> & {
  bonus_percent?: number;
  categories?: Array<Record<string, unknown>>;
  enabled?: boolean;
  level_id?: number;
  limit?: number;
  selected_ids?: number[];
};

export type BonusTransaction = Record<string, unknown> & {
  amount?: number;
  balance_after?: number | null;
  created_at?: string | null;
  id?: number;
  level_title?: string;
  reason?: string;
  source?: string;
  type?: string;
};

export type CustomerBenefitCard = Record<string, unknown> & {
  apply_scope_text?: string | null;
  badge_text?: string | null;
  code?: string | null;
  description?: string | null;
  disabled_reason_text?: string | null;
  expires_at?: string | null;
  id?: number | string | null;
  is_claimable?: boolean | null;
  is_copyable?: boolean | null;
  photo_url?: string | null;
  progress_text?: string | null;
  status_text?: string | null;
  title?: string | null;
  usage_count?: number | string | null;
  usage_limit?: number | string | null;
};

export type CustomerBenefits = {
  completed?: CustomerBenefitCard[];
  discounts: CustomerBenefitCard[];
  gifts: CustomerBenefitCard[];
  progress: CustomerBenefitCard[];
  promo_codes: CustomerBenefitCard[];
};

export type CheckoutBenefitDiscountBreakdown = Record<string, unknown> & {
  amount?: number | string | null;
  discount_id?: number | string | null;
  key?: string | null;
  promo_code?: string | null;
  promo_code_id?: number | string | null;
  reward_id?: number | string | null;
  source_kind?: string | null;
  title?: string | null;
};

export type CheckoutBenefitsSummary = Record<string, unknown> & {
  delivery?: number | string | null;
  discount_breakdown?: CheckoutBenefitDiscountBreakdown[];
  discount_total?: number | string | null;
  items_total?: number | string | null;
  subtotal?: number | string | null;
  total?: number | string | null;
};

export type CheckoutBenefitsPreviewData = Record<string, unknown> & {
  client_calculation?: Record<string, unknown> | null;
  completed?: CustomerBenefitCard[];
  details?: Record<string, unknown> | null;
  discounts?: CustomerBenefitCard[];
  gifts?: CustomerBenefitCard[];
  mode?: string | null;
  progress?: CustomerBenefitCard[];
  promo_codes?: CustomerBenefitCard[];
  summary?: CheckoutBenefitsSummary | null;
};

export type CheckoutBenefitsPreviewRequest = Record<string, unknown> & {
  items?: Array<Record<string, unknown>>;
  method_code?: 'delivery' | 'takeaway' | string | null;
  promo_code?: string | null;
  selected_discount_id?: number | string | null;
  selected_discount_source?: string | null;
  selected_promo_reward_id?: number | string | null;
  selected_promo_source?: string | null;
};

export type OrderStockCheckPayload = {
  available: boolean;
  line_requirements?: Array<Record<string, unknown>>;
  lineRequirements?: Array<Record<string, unknown>>;
  shortages?: Array<Record<string, unknown>>;
  stock_levels?: Array<Record<string, unknown>>;
};

export type ProductsBatchAvailabilityPayload = {
  data?: Record<string, Record<string, unknown>>;
  stock_levels?: Array<Record<string, unknown>>;
};

export type CustomerOrderItem = Record<string, unknown> & {
  combo_title?: string | null;
  ingredients?: Array<Record<string, unknown>>;
  ingredients_display?: Array<Record<string, unknown>>;
  line_total?: number | string | null;
  name?: string | null;
  old_line_total?: number | string | null;
  old_price?: number | string | null;
  options?: Array<Record<string, unknown>>;
  combo_items?: Array<Record<string, unknown>>;
  photo?: string | null;
  photos?: string[] | null;
  product_photo?: string | null;
  qty?: number | string | null;
  quantity?: number | string | null;
  selections?: Array<Record<string, unknown>>;
  type?: string | null;
  variant_group_title?: string | null;
  variant_label?: string | null;
  variant_unit?: string | null;
  variants?: Array<Record<string, unknown>>;
};

export type CustomerOrder = Record<string, unknown> & {
  address?: string | null;
  address_apartment?: string | null;
  address_house?: string | null;
  address_street?: string | null;
  created_at?: string | null;
  change_from?: number | string | null;
  comment?: string | null;
  cutlery_qty?: number | string | null;
  delivery_address?: string | null;
  delivery_address_apartment?: string | null;
  delivery_address_house?: string | null;
  delivery_address_street?: string | null;
  delivery_cost?: number | string | null;
  discount_amount?: number | string | null;
  discounts_json?: unknown;
  id?: number;
  items?: CustomerOrderItem[];
  method_title?: string | null;
  payment_title?: string | null;
  promo_code?: string | null;
  scheduled_at?: string | null;
  status_id?: number | string | null;
  status_title?: string | null;
  time_option_title?: string | null;
  total?: number | string | null;
  total_amount?: number | string | null;
  total_price?: number | string | null;
  updated_at?: string | null;
};

export type CustomerOrdersPayload = {
  data: CustomerOrder[];
  paging: {
    has_more: boolean;
  };
  summary: {
    active_count?: number;
    activeCount?: number;
    completed_count?: number;
    completedCount?: number;
  };
};

export type CustomerPassport = {
  token: string;
  customer: CustomerProfile | null;
  addresses: CustomerAddress[];
  bonusConfig: BonusConfig | null;
  bonusFavoriteCategories: BonusFavoriteCategories | null;
  bonusReferrals: BonusReferrals | null;
  updatedAt: string;
};

export type AuthPhoneStatus = {
  exists: boolean;
  has_name: boolean;
  needs_name_input: boolean;
  requires_messenger_login: boolean;
};

type AuthSuccessPayload = {
  token?: string;
  customer?: CustomerProfile | null;
};

let memoryCatalogSnapshot: MobileCatalogSnapshot | null = null;
let memoryCatalogIndex: MobileCatalogIndex | null = null;
const memoryCatalogCategories = new Map<string, CatalogByCategoryPayload>();
let memoryFullProductPassports: Record<string, FullProductPassport> = {};
const memoryComboDetails = new Map<number, CatalogComboDetails>();
let memoryUnitConversions: UnitConversion[] | null = null;
let memoryCustomerPassport: CustomerPassport | null = null;
const customerPassportListeners = new Set<() => void>();
let memoryPublicOrderConfig: PublicOrderConfig | null = null;
let memoryTenantStores: TenantStore[] | null = null;
const memoryBonusReferrals = new Map<string, BonusReferrals>();
const memoryBonusTransactions = new Map<string, BonusTransaction[]>();
const memoryCustomerAddresses = new Map<string, CustomerAddress[]>();
const memoryCustomerBenefits = new Map<string, CustomerBenefits>();
const memoryCustomerDiscounts = new Map<string, CustomerBenefitCard[]>();
const memoryCustomerOrderDetails = new Map<string, CustomerOrder | null>();
const memoryCustomerOrders = new Map<string, CustomerOrdersPayload>();
const passportLoadRequests = new Map<number, Promise<CatalogProductPassport | null>>();
const refreshedCatalogPassportIds = new Set<number>();
const fullPassportLoadRequests = new Map<number, Promise<FullProductPassport | null>>();
const fullPassportBatchLoadRequests = new Map<string, Promise<Record<string, FullProductPassport>>>();
const comboDetailsLoadRequests = new Map<number, Promise<CatalogComboDetails>>();
const DELIVERY_QUOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!apiConfig.baseUrl) return normalizedPath;
  return `${apiConfig.baseUrl.replace(/\/$/, '')}${normalizedPath}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await requestApi<T>(path, init);
  return json.data as T;
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(buildUrl(path), {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-store-id': apiConfig.storeId,
        'x-tenant-id': apiConfig.tenantId,
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });

    const json = (await response.json()) as ApiResponse<T>;
    if (!response.ok || json.ok === false) {
      throw new Error(json.error || `HTTP_${response.status}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function toNumberId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
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

export function isSameCachedValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function toCacheText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDeliveryMoneyValue(value: unknown) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Number(numeric.toFixed(2)));
}

function normalizeDeliveryNumberId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeDeliveryEtaValue(value: unknown) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric));
}

function normalizeDeliveryCoordinateValue(value: unknown) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : null;
}

function normalizeDeliveryPriceTier(value: unknown, index = 0): DeliveryPriceTier | null {
  const source = value && typeof value === 'object' ? value as Partial<DeliveryPriceTier> : null;
  if (!source) return null;
  const minOrderAmount = normalizeDeliveryMoneyValue(source.min_order_amount);
  const deliveryCost = normalizeDeliveryMoneyValue(source.delivery_cost);
  if (minOrderAmount == null || deliveryCost == null) return null;
  return {
    delivery_cost: deliveryCost,
    min_order_amount: minOrderAmount,
    sort_order: source.sort_order != null && Number.isFinite(Number(source.sort_order))
      ? Number(source.sort_order)
      : index,
  };
}

function sortDeliveryPriceTiers(tiers: DeliveryPriceTier[]) {
  return [...tiers].sort((left, right) => {
    if (left.min_order_amount !== right.min_order_amount) return left.min_order_amount - right.min_order_amount;
    if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    }
    return left.delivery_cost - right.delivery_cost;
  });
}

function normalizeDeliveryPriceTiers(value: unknown) {
  const tiers = Array.isArray(value)
    ? value
      .map((tier, index) => normalizeDeliveryPriceTier(tier, index))
      .filter((tier): tier is DeliveryPriceTier => tier !== null)
    : [];
  return sortDeliveryPriceTiers(tiers);
}

function buildLegacyDeliveryPriceTiers(source: Partial<DeliveryQuoteCache> | Record<string, unknown>) {
  const deliveryCost = normalizeDeliveryMoneyValue(source.delivery_cost) ?? 0;
  const minOrderAmount = normalizeDeliveryMoneyValue(source.min_order_amount) ?? 0;
  const freeDeliveryFrom = normalizeDeliveryMoneyValue(source.free_delivery_from);
  const tiers: DeliveryPriceTier[] = [{
    delivery_cost: deliveryCost,
    min_order_amount: minOrderAmount,
    sort_order: 0,
  }];
  if (freeDeliveryFrom != null) {
    tiers.push({
      delivery_cost: 0,
      min_order_amount: freeDeliveryFrom,
      sort_order: 1,
    });
  }
  return sortDeliveryPriceTiers(tiers);
}

export function buildCustomerAddressCacheKey(address: Partial<CustomerAddress> | Partial<CustomerAddressPayload> | null | undefined) {
  const source = address || {};
  const sourceRecord = source as Record<string, unknown>;
  return hashText(stableStringify({
    address_context_locality: toCacheText(source.address_context_locality || sourceRecord.context_locality).toLowerCase(),
    address_normalized_display: toCacheText(source.address_normalized_display).toLowerCase(),
    address_ref: toCacheText(source.address_ref),
    city: toCacheText(source.city).toLowerCase(),
    delivery_store_id: normalizeDeliveryNumberId(source.delivery_store_id),
    delivery_zone_id: normalizeDeliveryNumberId(source.delivery_zone_id),
    house: toCacheText(source.house).toLowerCase(),
    id: normalizeDeliveryNumberId((source as Partial<CustomerAddress>).id),
    lat: normalizeDeliveryCoordinateValue(source.lat),
    lng: normalizeDeliveryCoordinateValue(source.lng),
    resolved_city_source_key: toCacheText(source.resolved_city_source_key),
    selected_object_type: toCacheText(source.selected_object_type),
    street: toCacheText(source.street).toLowerCase(),
  }));
}

function normalizeDeliveryQuoteCache(value: unknown, addressCacheKey: string): DeliveryQuoteCache | null {
  const source = value && typeof value === 'object' ? value as Partial<DeliveryQuoteCache> & Record<string, unknown> : null;
  if (!source) return null;
  const rawResolvedAt = toCacheText(source.resolved_at);
  const resolvedAtTime = rawResolvedAt ? Date.parse(rawResolvedAt) : NaN;
  const resolvedAt = Number.isFinite(resolvedAtTime) ? new Date(resolvedAtTime).toISOString() : new Date().toISOString();
  const deliveryCost = normalizeDeliveryMoneyValue(source.delivery_cost);
  const minOrderAmount = normalizeDeliveryMoneyValue(source.min_order_amount);
  const freeDeliveryFrom = normalizeDeliveryMoneyValue(source.free_delivery_from);
  let priceTiers = normalizeDeliveryPriceTiers(source.price_tiers);
  if (!priceTiers.length) priceTiers = buildLegacyDeliveryPriceTiers({
    delivery_cost: deliveryCost,
    free_delivery_from: freeDeliveryFrom,
    min_order_amount: minOrderAmount,
  });
  return {
    address_cache_key: toCacheText(source.address_cache_key) || addressCacheKey,
    delivery_cost: deliveryCost,
    delivery_revision: toCacheText(source.delivery_revision) || null,
    delivery_store_id: normalizeDeliveryNumberId(source.delivery_store_id),
    delivery_zone_id: normalizeDeliveryNumberId(source.delivery_zone_id),
    delivery_zone_name: toCacheText(source.delivery_zone_name) || null,
    eta_minutes: normalizeDeliveryEtaValue(source.eta_minutes),
    free_delivery_from: freeDeliveryFrom,
    has_settings: source.has_settings == null ? null : Boolean(source.has_settings),
    min_order_amount: minOrderAmount,
    price_tiers: priceTiers,
    resolved_at: resolvedAt,
    source: toCacheText(source.source) || null,
  };
}

export function summarizeDeliveryQuoteForSubtotal(
  quote: Partial<DeliveryQuoteCache> | null | undefined,
  subtotal: number,
): DeliveryQuoteSummary | null {
  if (!quote) return null;
  const amount = Math.max(0, Number(subtotal || 0) || 0);
  const tiers = normalizeDeliveryPriceTiers(quote.price_tiers).length
    ? normalizeDeliveryPriceTiers(quote.price_tiers)
    : buildLegacyDeliveryPriceTiers(quote as Partial<DeliveryQuoteCache>);
  if (!tiers.length) return null;
  const firstTier = tiers[0];
  let matchedTier = firstTier;
  tiers.forEach((tier) => {
    if (amount >= Number(tier.min_order_amount || 0)) matchedTier = tier;
  });
  const freeTier = tiers.find((tier) => Number(tier.delivery_cost || 0) <= 0) || null;
  return {
    delivery_cost: Number(matchedTier?.delivery_cost || 0),
    free_delivery_from: freeTier ? Number(freeTier.min_order_amount || 0) : null,
    matched_tier: matchedTier || null,
    min_order_amount: Number(firstTier?.min_order_amount || 0),
  };
}

export function isFreshDeliveryQuoteForAddress(
  address: Partial<CustomerAddress> | null | undefined,
  ttlMs = DELIVERY_QUOTE_CACHE_TTL_MS,
) {
  if (!address?.delivery_quote) return false;
  const quote = normalizeDeliveryQuoteCache(address.delivery_quote, buildCustomerAddressCacheKey(address));
  if (!quote) return false;
  if (quote.address_cache_key !== buildCustomerAddressCacheKey(address)) return false;
  const resolvedAt = Date.parse(quote.resolved_at);
  if (!Number.isFinite(resolvedAt)) return false;
  return Date.now() - resolvedAt < ttlMs;
}

function mergeCustomerAddressesWithDeliveryQuotes(nextAddresses: CustomerAddress[], previousAddresses: CustomerAddress[]) {
  const previousById = new Map<number, CustomerAddress>();
  const previousByKey = new Map<string, CustomerAddress>();
  previousAddresses.forEach((address) => {
    const id = normalizeDeliveryNumberId(address.id);
    const key = buildCustomerAddressCacheKey(address);
    if (id) previousById.set(id, address);
    if (key) previousByKey.set(key, address);
  });

  return nextAddresses.map((address) => {
    const addressCacheKey = buildCustomerAddressCacheKey(address);
    const ownQuote = normalizeDeliveryQuoteCache(address.delivery_quote, addressCacheKey);
    if (ownQuote?.address_cache_key === addressCacheKey) {
      return { ...address, delivery_quote: ownQuote };
    }

    const previous = previousById.get(normalizeDeliveryNumberId(address.id) || 0) || previousByKey.get(addressCacheKey);
    const previousQuote = normalizeDeliveryQuoteCache(previous?.delivery_quote, addressCacheKey);
    if (previousQuote?.address_cache_key === addressCacheKey) {
      return { ...address, delivery_quote: previousQuote };
    }
    return { ...address, delivery_quote: null };
  });
}

function mapRecordToCategoryMap<T>(record: unknown, ids: number[]) {
  const result = new Map<number, T[]>();
  const source = record && typeof record === 'object' ? (record as Record<string, T[]>) : {};

  ids.forEach((id) => {
    const list = source[String(id)];
    result.set(id, Array.isArray(list) ? list : []);
  });

  return result;
}

function getMobileSnapshotStorageKey() {
  return `mobile_catalog_snapshot_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getMobileCatalogIndexStorageKey() {
  return `mobile_catalog_index_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getMobileCatalogCategoryStorageKey(version: string, categoryId: number) {
  return `mobile_catalog_category_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}_v${hashText(version)}_c${categoryId}`;
}

function getFullProductPassportsStorageKey() {
  return `mobile_full_product_passports_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getComboDetailsStorageKey(comboId: number) {
  return `mobile_combo_details_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}_c${comboId}`;
}

function getUnitConversionsStorageKey() {
  return `mobile_unit_conversions_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getCustomerPassportStorageKey() {
  return `mobile_customer_passport_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getPublicOrderConfigStorageKey() {
  return `mobile_public_order_config_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getTenantStoresStorageKey() {
  return `mobile_tenant_stores_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
}

function getCustomerScopedStorageKey(namespace: string, token: string, suffix = '') {
  return `mobile_${namespace}_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}_u${hashText(String(token || '').trim())}${suffix}`;
}

async function readCachedJson<T>(key: string, normalize: (value: unknown) => T | null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}

async function saveCachedJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}

function normalizeMobileCatalogSnapshot(value: unknown): MobileCatalogSnapshot | null {
  const source = value && typeof value === 'object' ? (value as Partial<MobileCatalogSnapshot>) : null;
  if (!source || !source.version) return null;

  return {
    categories: Array.isArray(source.categories) ? source.categories : [],
    combosByCategory: source.combosByCategory && typeof source.combosByCategory === 'object' ? source.combosByCategory : {},
    generated_at: source.generated_at,
    productPassports: source.productPassports && typeof source.productPassports === 'object' ? source.productPassports : {},
    productsByCategory: source.productsByCategory && typeof source.productsByCategory === 'object' ? source.productsByCategory : {},
    store_id: source.store_id,
    tenant_id: source.tenant_id,
    version: String(source.version),
  };
}

function normalizeCatalogCategoryCount(value: unknown): CatalogCategoryCount {
  const source = value && typeof value === 'object' ? value as Partial<CatalogCategoryCount> : {};
  const productCount = Math.max(0, Math.floor(Number(source.product_count || 0)));
  const comboCount = Math.max(0, Math.floor(Number(source.combo_count || 0)));
  const totalCount = Math.max(0, Math.floor(Number(source.total_count || productCount + comboCount)));
  return {
    combo_count: comboCount,
    product_count: productCount,
    total_count: totalCount,
  };
}

function normalizeMobileCatalogIndex(value: unknown): MobileCatalogIndex | null {
  const source = value && typeof value === 'object' ? (value as Partial<MobileCatalogIndex>) : null;
  if (!source || !source.version) return null;
  const rawCounts = source.categoryCounts && typeof source.categoryCounts === 'object'
    ? source.categoryCounts as Record<string, unknown>
    : {};
  const categoryCounts: Record<string, CatalogCategoryCount> = {};
  Object.entries(rawCounts).forEach(([categoryId, count]) => {
    const id = Number(categoryId || 0);
    if (Number.isFinite(id) && id > 0) categoryCounts[String(id)] = normalizeCatalogCategoryCount(count);
  });

  return {
    categories: Array.isArray(source.categories) ? source.categories : [],
    categoryCounts,
    generated_at: source.generated_at,
    store_id: source.store_id,
    tenant_id: source.tenant_id,
    version: String(source.version),
  };
}

function normalizeCatalogCategoryCache(value: unknown): { combos: CatalogCombo[]; products: CatalogProduct[]; version: string } | null {
  const source = value && typeof value === 'object'
    ? value as { combos?: unknown; products?: unknown; version?: unknown }
    : null;
  const version = String(source?.version || '').trim();
  if (!source || !version) return null;
  return {
    combos: Array.isArray(source.combos) ? source.combos.filter((item): item is CatalogCombo => Boolean(item && typeof item === 'object')) : [],
    products: Array.isArray(source.products) ? source.products.filter((item): item is CatalogProduct => Boolean(item && typeof item === 'object')) : [],
    version,
  };
}

function mergeFullProductPassportsWithSnapshotProducts(
  snapshot: MobileCatalogSnapshot | null,
  passports: Record<string, FullProductPassport>,
) {
  if (!snapshot || !passports || typeof passports !== 'object') {
    return { changed: false, passports };
  }

  let changed = false;
  const nextPassports = { ...passports };
  Object.values(snapshot.productPassports || {}).forEach((passport) => {
    const product = passport?.product;
    const productId = Number(product?.id || 0);
    if (!product || !Number.isFinite(productId) || productId <= 0) return;

    const key = String(productId);
    const current = nextPassports[key];
    if (!current || isSameCachedValue(current.product, product)) return;

    nextPassports[key] = { ...current, product };
    changed = true;
  });

  return {
    changed,
    passports: changed ? normalizeFullProductPassportMap(nextPassports) : passports,
  };
}

function normalizeCatalogComboDetails(value: unknown): CatalogComboDetails | null {
  const source = value && typeof value === 'object' ? (value as Partial<CatalogComboDetails>) : null;
  const id = Number(source?.id || 0);
  if (!source || !Number.isFinite(id) || id <= 0) return null;

  return {
    ...source,
    blocks: Array.isArray(source.blocks) ? source.blocks : [],
    id,
    title: String(source.title || ''),
  };
}

function normalizeCustomer(value: unknown): CustomerProfile | null {
  const source = value && typeof value === 'object' ? value as CustomerProfile : null;
  const id = Number(source?.id || 0);
  if (!source || !Number.isFinite(id) || id <= 0) return null;
  return {
    ...source,
    birthday: source.birthday || null,
    id,
    name: source.name || null,
    phone: source.phone || null,
    photo: source.photo || null,
  };
}

function normalizeCustomerPassport(value: unknown): CustomerPassport | null {
  const source = value && typeof value === 'object' ? value as Partial<CustomerPassport> : null;
  const token = String(source?.token || '').trim();
  if (!source || !token) return null;
  return {
    addresses: normalizeCustomerAddresses(source.addresses) || [],
    bonusConfig: source.bonusConfig && typeof source.bonusConfig === 'object' ? source.bonusConfig : null,
    bonusFavoriteCategories: source.bonusFavoriteCategories && typeof source.bonusFavoriteCategories === 'object' ? source.bonusFavoriteCategories : null,
    bonusReferrals: source.bonusReferrals && typeof source.bonusReferrals === 'object' ? source.bonusReferrals : null,
    customer: normalizeCustomer(source.customer),
    token,
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
}

function normalizePublicOrderConfig(value: unknown): PublicOrderConfig | null {
  return value && typeof value === 'object' ? value as PublicOrderConfig : null;
}

function normalizeUnitConversions(value: unknown): UnitConversion[] | null {
  return Array.isArray(value) ? value.filter((item): item is UnitConversion => Boolean(item && typeof item === 'object')) : null;
}

function normalizeTenantStores(value: unknown): TenantStore[] | null {
  return Array.isArray(value) ? value : null;
}

function normalizeCustomerAddresses(value: unknown): CustomerAddress[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is CustomerAddress => Boolean(item && typeof item === 'object'))
    .map((address) => {
      const addressCacheKey = buildCustomerAddressCacheKey(address);
      return {
        ...address,
        delivery_quote: normalizeDeliveryQuoteCache(address.delivery_quote, addressCacheKey),
      };
    });
}

function normalizeBonusReferrals(value: unknown): BonusReferrals | null {
  return value && typeof value === 'object' ? value as BonusReferrals : null;
}

function normalizeBonusTransactions(value: unknown): BonusTransaction[] | null {
  return Array.isArray(value) ? value : null;
}

function normalizeCustomerBenefitCards(value: unknown): CustomerBenefitCard[] | null {
  return Array.isArray(value) ? value : null;
}

function normalizeCustomerBenefits(value: unknown): CustomerBenefits | null {
  const data = value && typeof value === 'object' ? value as Partial<CustomerBenefits> : null;
  if (!data) return null;
  return {
    completed: Array.isArray(data.completed) ? data.completed : [],
    discounts: Array.isArray(data.discounts) ? data.discounts : [],
    gifts: Array.isArray(data.gifts) ? data.gifts : [],
    progress: Array.isArray(data.progress) ? data.progress : [],
    promo_codes: Array.isArray(data.promo_codes) ? data.promo_codes : [],
  };
}

function normalizeCustomerOrder(value: unknown): CustomerOrder | null {
  return value && typeof value === 'object' ? value as CustomerOrder : null;
}

function normalizeCustomerOrdersPayload(value: unknown): CustomerOrdersPayload | null {
  const source = value && typeof value === 'object' ? value as Partial<CustomerOrdersPayload> : null;
  if (!source) return null;
  return {
    data: Array.isArray(source.data) ? source.data : [],
    paging: source.paging && typeof source.paging === 'object'
      ? { has_more: Boolean(source.paging.has_more) }
      : { has_more: false },
    summary: source.summary && typeof source.summary === 'object' ? source.summary : {},
  };
}

export function getMemoryMobileCatalogSnapshot() {
  return memoryCatalogSnapshot;
}

export function getMemoryCustomerPassport() {
  return memoryCustomerPassport;
}

export function subscribeCustomerPassport(listener: () => void) {
  customerPassportListeners.add(listener);
  return () => {
    customerPassportListeners.delete(listener);
  };
}

function emitCustomerPassportChanged() {
  customerPassportListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export function getMemoryCatalogComboDetails(comboId: number) {
  const id = Number(comboId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryComboDetails.get(id) || null;
}

export function getMemoryUnitConversions() {
  return memoryUnitConversions || [];
}

export function getCatalogProductPassport(productId: number): CatalogProductPassport | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryCatalogSnapshot?.productPassports?.[String(id)] || null;
}

export function getFullProductPassport(productId: number): FullProductPassport | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryFullProductPassports[String(id)] || null;
}

export function getCatalogSnapshotProduct(productId: number): CatalogProduct | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  for (const payload of memoryCatalogCategories.values()) {
    for (const list of payload.productsByCategory.values()) {
      const product = (Array.isArray(list) ? list : []).find((item) => Number(item?.id || 0) === id);
      if (product) return product;
    }
  }
  const lists = Object.values(memoryCatalogSnapshot?.productsByCategory || {});
  for (const list of lists) {
    const product = (Array.isArray(list) ? list : []).find((item) => Number(item?.id || 0) === id);
    if (product) return product;
  }
  return null;
}

export async function readCachedMobileCatalogSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(getMobileSnapshotStorageKey());
    const snapshot = normalizeMobileCatalogSnapshot(raw ? JSON.parse(raw) : null);
    if (snapshot) {
      memoryCatalogSnapshot = snapshot;
      if (Object.keys(memoryFullProductPassports).length) {
        const merged = mergeFullProductPassportsWithSnapshotProducts(snapshot, memoryFullProductPassports);
        if (merged.changed) {
          memoryFullProductPassports = merged.passports;
          await saveCachedJson(getFullProductPassportsStorageKey(), memoryFullProductPassports);
        }
      }
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function readCachedMobileCatalogIndex() {
  const cached = await readCachedJson(getMobileCatalogIndexStorageKey(), normalizeMobileCatalogIndex);
  if (cached) memoryCatalogIndex = cached;
  return cached;
}

export async function saveMobileCatalogIndex(index: MobileCatalogIndex) {
  const normalized = normalizeMobileCatalogIndex(index);
  if (!normalized) return null;
  memoryCatalogIndex = normalized;
  await AsyncStorage.setItem(getMobileCatalogIndexStorageKey(), JSON.stringify(normalized));
  return normalized;
}

function getCatalogCategoryMemoryKey(version: string, categoryId: number) {
  return `${String(version || '').trim()}:${Number(categoryId || 0)}`;
}

export async function readCachedCatalogCategory(version: string, categoryId: number): Promise<CatalogByCategoryPayload | null> {
  const id = toNumberId(categoryId);
  const safeVersion = String(version || '').trim();
  if (!id || !safeVersion) return null;
  const memoryKey = getCatalogCategoryMemoryKey(safeVersion, id);
  const memory = memoryCatalogCategories.get(memoryKey);
  if (memory) return memory;

  const cached = await readCachedJson(getMobileCatalogCategoryStorageKey(safeVersion, id), normalizeCatalogCategoryCache);
  if (!cached || cached.version !== safeVersion) return null;
  const payload = {
    combosByCategory: new Map([[id, cached.combos]]),
    productsByCategory: new Map([[id, cached.products]]),
  };
  memoryCatalogCategories.set(memoryKey, payload);
  return payload;
}

export async function saveCatalogCategory(version: string, categoryId: number, payload: CatalogByCategoryPayload) {
  const id = toNumberId(categoryId);
  const safeVersion = String(version || '').trim();
  if (!id || !safeVersion) return null;
  const products = payload.productsByCategory.get(id) || [];
  const combos = payload.combosByCategory.get(id) || [];
  const memoryPayload = {
    combosByCategory: new Map([[id, combos]]),
    productsByCategory: new Map([[id, products]]),
  };
  memoryCatalogCategories.set(getCatalogCategoryMemoryKey(safeVersion, id), memoryPayload);
  await saveCachedJson(getMobileCatalogCategoryStorageKey(safeVersion, id), {
    combos,
    products,
    version: safeVersion,
  });
  return memoryPayload;
}

export async function saveMobileCatalogSnapshot(snapshot: MobileCatalogSnapshot) {
  const normalized = normalizeMobileCatalogSnapshot(snapshot);
  if (!normalized) return null;
  memoryCatalogSnapshot = normalized;
  if (Object.keys(memoryFullProductPassports).length) {
    const merged = mergeFullProductPassportsWithSnapshotProducts(normalized, memoryFullProductPassports);
    if (merged.changed) {
      memoryFullProductPassports = merged.passports;
      await saveCachedJson(getFullProductPassportsStorageKey(), memoryFullProductPassports);
    }
  }
  await AsyncStorage.setItem(getMobileSnapshotStorageKey(), JSON.stringify(normalized));
  return normalized;
}

export async function readCachedFullProductPassports() {
  let cached = await readCachedJson(getFullProductPassportsStorageKey(), normalizeFullProductPassportMap);
  if (cached && memoryCatalogSnapshot) {
    const merged = mergeFullProductPassportsWithSnapshotProducts(memoryCatalogSnapshot, cached);
    if (merged.changed) {
      cached = merged.passports;
      await saveCachedJson(getFullProductPassportsStorageKey(), cached);
    }
  }
  if (cached) memoryFullProductPassports = { ...memoryFullProductPassports, ...cached };
  return cached || {};
}

export async function saveFullProductPassports(passports: Record<string, FullProductPassport>) {
  const normalized = normalizeFullProductPassportMap(passports);
  memoryFullProductPassports = {
    ...memoryFullProductPassports,
    ...normalized,
  };
  await saveCachedJson(getFullProductPassportsStorageKey(), memoryFullProductPassports);
  return memoryFullProductPassports;
}

export async function readCachedCatalogComboDetails(comboId: number) {
  const id = Number(comboId);
  if (!Number.isFinite(id) || id <= 0) return null;

  try {
    const raw = await AsyncStorage.getItem(getComboDetailsStorageKey(id));
    const combo = normalizeCatalogComboDetails(raw ? JSON.parse(raw) : null);
    if (combo) memoryComboDetails.set(id, combo);
    return combo;
  } catch {
    return null;
  }
}

export async function saveCatalogComboDetails(combo: CatalogComboDetails) {
  const normalized = normalizeCatalogComboDetails(combo);
  if (!normalized) return null;
  memoryComboDetails.set(normalized.id, normalized);
  await AsyncStorage.setItem(getComboDetailsStorageKey(normalized.id), JSON.stringify(normalized));
  return normalized;
}

export async function readCachedUnitConversions() {
  const cached = await readCachedJson(getUnitConversionsStorageKey(), normalizeUnitConversions);
  if (cached) memoryUnitConversions = cached;
  return cached || [];
}

async function saveUnitConversions(conversions: UnitConversion[]) {
  const normalized = normalizeUnitConversions(conversions) || [];
  memoryUnitConversions = normalized;
  await saveCachedJson(getUnitConversionsStorageKey(), normalized);
  return normalized;
}

export async function readCachedCustomerPassport() {
  try {
    const raw = await AsyncStorage.getItem(getCustomerPassportStorageKey());
    const passport = normalizeCustomerPassport(raw ? JSON.parse(raw) : null);
    if (passport) memoryCustomerPassport = passport;
    return passport;
  } catch {
    return null;
  }
}

export async function saveCustomerPassport(passport: CustomerPassport) {
  const normalized = normalizeCustomerPassport(passport);
  if (!normalized) return null;
  memoryCustomerPassport = normalized;
  await AsyncStorage.setItem(getCustomerPassportStorageKey(), JSON.stringify(normalized));
  emitCustomerPassportChanged();
  return normalized;
}

export async function clearCustomerPassport() {
  memoryCustomerPassport = null;
  await AsyncStorage.removeItem(getCustomerPassportStorageKey());
  emitCustomerPassportChanged();
}

export async function readCachedTenantStores() {
  if (memoryTenantStores) return memoryTenantStores;
  const stores = await readCachedJson(getTenantStoresStorageKey(), normalizeTenantStores);
  if (stores) memoryTenantStores = stores;
  return stores;
}

export async function saveTenantStores(stores: TenantStore[]) {
  const normalized = normalizeTenantStores(stores) || [];
  memoryTenantStores = normalized;
  return saveCachedJson(getTenantStoresStorageKey(), normalized);
}

export async function readCachedPublicOrderConfig() {
  if (memoryPublicOrderConfig) return memoryPublicOrderConfig;
  const config = await readCachedJson(getPublicOrderConfigStorageKey(), normalizePublicOrderConfig);
  if (config) memoryPublicOrderConfig = config;
  return config;
}

export async function savePublicOrderConfig(config: PublicOrderConfig | null) {
  const normalized = normalizePublicOrderConfig(config) || null;
  memoryPublicOrderConfig = normalized;
  return saveCachedJson(getPublicOrderConfigStorageKey(), normalized);
}

export async function readCachedCustomerAddresses(token: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return [];
  const key = getCustomerScopedStorageKey('customer_addresses', safeToken);
  const memory = memoryCustomerAddresses.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeCustomerAddresses);
  if (cached) {
    memoryCustomerAddresses.set(key, cached);
    return cached;
  }
  const passport = memoryCustomerPassport || await readCachedCustomerPassport();
  return passport?.token === safeToken ? passport.addresses : [];
}

export async function saveCustomerAddresses(token: string, addresses: CustomerAddress[]) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeCustomerAddresses(addresses) || [];
  if (!safeToken) return normalized;
  const key = getCustomerScopedStorageKey('customer_addresses', safeToken);
  const previous = memoryCustomerAddresses.get(key)
    || (memoryCustomerPassport?.token === safeToken ? normalizeCustomerAddresses(memoryCustomerPassport.addresses) || [] : []);
  const merged = mergeCustomerAddressesWithDeliveryQuotes(normalized, previous);
  memoryCustomerAddresses.set(key, merged);
  await saveCachedJson(key, merged);
  if (memoryCustomerPassport?.token === safeToken) {
    await saveCustomerPassport({
      ...memoryCustomerPassport,
      addresses: merged,
      updatedAt: new Date().toISOString(),
    });
  }
  return merged;
}

export async function readCachedCustomerBenefits(token: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  const key = getCustomerScopedStorageKey('customer_benefits', safeToken);
  const memory = memoryCustomerBenefits.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeCustomerBenefits);
  if (cached) memoryCustomerBenefits.set(key, cached);
  return cached;
}

export async function saveCustomerBenefits(token: string, benefits: CustomerBenefits) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeCustomerBenefits(benefits);
  if (!safeToken || !normalized) return normalized;
  const key = getCustomerScopedStorageKey('customer_benefits', safeToken);
  memoryCustomerBenefits.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function readCachedCustomerDiscounts(token: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return [];
  const key = getCustomerScopedStorageKey('customer_discounts', safeToken);
  const memory = memoryCustomerDiscounts.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeCustomerBenefitCards);
  if (cached) memoryCustomerDiscounts.set(key, cached);
  return cached || [];
}

export async function saveCustomerDiscounts(token: string, discounts: CustomerBenefitCard[]) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeCustomerBenefitCards(discounts) || [];
  if (!safeToken) return normalized;
  const key = getCustomerScopedStorageKey('customer_discounts', safeToken);
  memoryCustomerDiscounts.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function readCachedBonusReferrals(token: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  const key = getCustomerScopedStorageKey('bonus_referrals', safeToken);
  const memory = memoryBonusReferrals.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeBonusReferrals);
  if (cached) memoryBonusReferrals.set(key, cached);
  return cached;
}

export async function saveBonusReferrals(token: string, referrals: BonusReferrals) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeBonusReferrals(referrals);
  if (!safeToken || !normalized) return normalized;
  const key = getCustomerScopedStorageKey('bonus_referrals', safeToken);
  memoryBonusReferrals.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function readCachedBonusTransactions(token: string, type?: string) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return [];
  const key = getCustomerScopedStorageKey('bonus_transactions', safeToken, `_f${hashText(String(type || 'all'))}`);
  const memory = memoryBonusTransactions.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeBonusTransactions);
  if (cached) memoryBonusTransactions.set(key, cached);
  return cached || [];
}

export async function saveBonusTransactions(token: string, transactions: BonusTransaction[], type?: string) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeBonusTransactions(transactions) || [];
  if (!safeToken) return normalized;
  const key = getCustomerScopedStorageKey('bonus_transactions', safeToken, `_f${hashText(String(type || 'all'))}`);
  memoryBonusTransactions.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function readCachedCustomerOrders(token: string, statusIsFinal: 0 | 1) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  const key = getCustomerScopedStorageKey('customer_orders', safeToken, `_s${statusIsFinal}`);
  const memory = memoryCustomerOrders.get(key);
  if (memory) return memory;
  const cached = await readCachedJson(key, normalizeCustomerOrdersPayload);
  if (cached) memoryCustomerOrders.set(key, cached);
  return cached;
}

export async function saveCustomerOrders(token: string, statusIsFinal: 0 | 1, payload: CustomerOrdersPayload) {
  const safeToken = String(token || '').trim();
  const normalized = normalizeCustomerOrdersPayload(payload);
  if (!safeToken || !normalized) return normalized;
  const key = getCustomerScopedStorageKey('customer_orders', safeToken, `_s${statusIsFinal}`);
  memoryCustomerOrders.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function readCachedCustomerOrder(token: string, orderId: number) {
  const safeToken = String(token || '').trim();
  const safeOrderId = Number(orderId || 0);
  if (!safeToken || !(safeOrderId > 0)) return null;
  const key = getCustomerScopedStorageKey('customer_order', safeToken, `_o${safeOrderId}`);
  if (memoryCustomerOrderDetails.has(key)) return memoryCustomerOrderDetails.get(key) || null;
  const cached = await readCachedJson(key, normalizeCustomerOrder);
  if (cached) memoryCustomerOrderDetails.set(key, cached);
  return cached;
}

export async function saveCustomerOrder(token: string, orderId: number, order: CustomerOrder | null) {
  const safeToken = String(token || '').trim();
  const safeOrderId = Number(orderId || 0);
  const normalized = normalizeCustomerOrder(order);
  if (!safeToken || !(safeOrderId > 0)) return normalized;
  const key = getCustomerScopedStorageKey('customer_order', safeToken, `_o${safeOrderId}`);
  memoryCustomerOrderDetails.set(key, normalized);
  await saveCachedJson(key, normalized);
  return normalized;
}

export async function authPhoneStatus(phone: string) {
  const response = await requestApi<AuthPhoneStatus>('/api/public/auth/phone-status', {
    body: JSON.stringify({ phone }),
    headers: { 'x-customer-token': '' },
    method: 'POST',
  });
  return {
    exists: Boolean((response as AuthPhoneStatus).exists),
    has_name: Boolean((response as AuthPhoneStatus).has_name),
    needs_name_input: Boolean((response as AuthPhoneStatus).needs_name_input),
    requires_messenger_login: Boolean((response as AuthPhoneStatus).requires_messenger_login),
  };
}

export async function authLogin(params: { phone: string; birthday: string; name?: string | null }) {
  const response = await requestApi<AuthSuccessPayload>('/api/public/auth/login', {
    body: JSON.stringify(params),
    headers: { 'x-customer-token': '' },
    method: 'POST',
  }) as ApiResponse<AuthSuccessPayload> & AuthSuccessPayload;
  return {
    customer: normalizeCustomer(response.customer),
    token: String(response.token || '').trim(),
  };
}

export async function authMessengerCodeSend(phone: string) {
  await requestApi('/api/public/auth/messenger-code/send', {
    body: JSON.stringify({ phone }),
    headers: { 'x-customer-token': '' },
    method: 'POST',
  });
}

export async function authMessengerCodeVerify(params: { phone: string; code: string; name?: string | null }) {
  const response = await requestApi<AuthSuccessPayload>('/api/public/auth/messenger-code/verify', {
    body: JSON.stringify(params),
    headers: { 'x-customer-token': '' },
    method: 'POST',
  }) as ApiResponse<AuthSuccessPayload> & AuthSuccessPayload;
  return {
    customer: normalizeCustomer(response.customer),
    token: String(response.token || '').trim(),
  };
}

export async function logoutCustomer(token: string) {
  await requestApi('/api/public/auth/logout', {
    body: JSON.stringify({}),
    headers: { 'x-customer-token': token },
    method: 'POST',
  });
}

export async function fetchCustomerMe(token: string) {
  const response = await requestApi<{ customer?: CustomerProfile }>('/api/public/me', {
    headers: { 'x-customer-token': token },
  }) as ApiResponse<{ customer?: CustomerProfile }> & { customer?: CustomerProfile };
  return normalizeCustomer(response.customer || response.data?.customer);
}

export async function fetchCustomerAddresses(token: string) {
  const response = await requestApi<CustomerAddress[]>('/api/public/me/addresses', {
    headers: { 'x-customer-token': token },
  });
  const data = response.data;
  return saveCustomerAddresses(token, Array.isArray(data) ? data : []);
}

export async function fetchCustomerOrders(token: string, params: { limit: number; offset: number; statusIsFinal: 0 | 1 }) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.floor(Number(params.limit || 10)))),
    offset: String(Math.max(0, Math.floor(Number(params.offset || 0)))),
    status_is_final: String(params.statusIsFinal),
  });
  const response = await requestApi<CustomerOrder[]>(`/api/public/me/orders?${query.toString()}`, {
    headers: { 'x-customer-token': token },
  }) as ApiResponse<CustomerOrder[]> & Partial<CustomerOrdersPayload>;
  const payload = {
    data: Array.isArray(response.data) ? response.data : [],
    paging: response.paging && typeof response.paging === 'object'
      ? { has_more: Boolean(response.paging.has_more) }
      : { has_more: Array.isArray(response.data) && response.data.length >= Math.max(1, Math.floor(Number(params.limit || 10))) },
    summary: response.summary && typeof response.summary === 'object' ? response.summary : {},
  };
  if (Number(params.offset || 0) === 0) await saveCustomerOrders(token, params.statusIsFinal, payload);
  return payload;
}

export async function fetchCustomerOrder(token: string, orderId: number) {
  const safeOrderId = Number(orderId || 0);
  if (!(safeOrderId > 0)) throw new Error('BAD_ORDER_ID');
  const response = await requestApi<CustomerOrder>(`/api/public/me/orders/${encodeURIComponent(String(safeOrderId))}`, {
    headers: { 'x-customer-token': token },
  });
  return saveCustomerOrder(token, safeOrderId, response.data && typeof response.data === 'object' ? response.data : null);
}

export async function fetchPublicOrderConfig() {
  const data = await requestJson<PublicOrderConfig>('/api/public/order-config');
  return savePublicOrderConfig(data && typeof data === 'object' ? data : null);
}

export async function fetchUnitConversions() {
  const data = await requestJson<UnitConversion[]>('/api/public/unit-conversions');
  return saveUnitConversions(Array.isArray(data) ? data : []);
}

export async function suggestPublicAddresses(params: {
  city: string;
  query: string;
  selectedSourceKey?: string | null;
  stage?: 'address' | 'house';
}) {
  const query = new URLSearchParams({
    city: params.city,
    q: params.query,
    stage: params.stage || 'address',
  });
  if (params.selectedSourceKey) query.set('selected_source_key', params.selectedSourceKey);
  const response = await requestApi<{ items?: AddressSuggestion[] }>(`/api/public/address-suggest?${query.toString()}`);
  const items = response.data?.items;
  return Array.isArray(items) ? items : [];
}

export async function resolvePublicAddress(payload: CustomerAddressPayload & { subtotal?: number }) {
  const response = await requestApi<ResolvedAddress>('/api/public/address-resolve', {
    body: JSON.stringify(payload),
    method: 'POST',
  });
  return response.data && typeof response.data === 'object' ? response.data : null;
}

function buildDeliveryQuoteAddressPayload(address: Partial<CustomerAddress>): CustomerAddressPayload {
  return {
    address_context_locality: address.address_context_locality || null,
    address_normalized_display: address.address_normalized_display || null,
    address_ref: address.address_ref || null,
    apartment: address.apartment || null,
    city: address.city || null,
    comment: address.comment || null,
    delivery_store_id: address.delivery_store_id || null,
    delivery_zone_id: address.delivery_zone_id || null,
    entrance: address.entrance || null,
    floor: address.floor || null,
    house: address.house || null,
    is_default: address.is_default || null,
    lat: address.lat || null,
    lng: address.lng || null,
    resolved_city_source_key: address.resolved_city_source_key || null,
    selected_object_type: address.selected_object_type || null,
    street: address.street || null,
  };
}

export async function fetchDeliveryQuoteForAddress(
  address: Partial<CustomerAddress>,
  subtotal = 0,
  token?: string | null,
) {
  const safeToken = String(token || '').trim();
  const addressId = normalizeDeliveryNumberId(address.id);
  const body = addressId && safeToken
    ? { delivery_address_id: addressId, subtotal: Math.max(0, Number(subtotal || 0) || 0) }
    : { address: buildDeliveryQuoteAddressPayload(address), subtotal: Math.max(0, Number(subtotal || 0) || 0) };
  const response = await requestApi<DeliveryQuoteCache>('/api/public/delivery-quote', {
    body: JSON.stringify(body),
    headers: safeToken ? { 'x-customer-token': safeToken } : undefined,
    method: 'POST',
  });
  return normalizeDeliveryQuoteCache(response.data, buildCustomerAddressCacheKey(address));
}

export async function ensureCustomerAddressDeliveryQuote(
  token: string,
  address: CustomerAddress | null | undefined,
  subtotal = 0,
) {
  const safeToken = String(token || '').trim();
  if (!safeToken || !address) return address || null;
  if (isFreshDeliveryQuoteForAddress(address)) return address;
  const quote = await fetchDeliveryQuoteForAddress(address, subtotal, safeToken);
  if (!quote) return address;
  const nextAddress: CustomerAddress = {
    ...address,
    delivery_quote: quote,
    delivery_store_id: quote.delivery_store_id ?? address.delivery_store_id ?? null,
    delivery_zone_id: quote.delivery_zone_id ?? address.delivery_zone_id ?? null,
  };
  const cachedAddresses = await readCachedCustomerAddresses(safeToken);
  const addressId = normalizeDeliveryNumberId(address.id);
  const addressCacheKey = buildCustomerAddressCacheKey(address);
  const nextAddresses = cachedAddresses.map((item) => {
    const itemId = normalizeDeliveryNumberId(item.id);
    const sameById = addressId && itemId === addressId;
    const sameByKey = buildCustomerAddressCacheKey(item) === addressCacheKey;
    return sameById || sameByKey ? nextAddress : item;
  });
  await saveCustomerAddresses(safeToken, nextAddresses.length ? nextAddresses : [nextAddress]);
  return nextAddress;
}

export async function createCustomerAddress(token: string, payload: CustomerAddressPayload) {
  await requestApi('/api/public/me/addresses', {
    body: JSON.stringify(payload),
    headers: { 'x-customer-token': token },
    method: 'POST',
  });
}

export async function updateCustomerAddress(token: string, addressId: number, payload: CustomerAddressPayload) {
  const safeAddressId = Number(addressId || 0);
  if (!(safeAddressId > 0)) throw new Error('BAD_ADDRESS_ID');
  await requestApi(`/api/public/me/addresses/${encodeURIComponent(String(safeAddressId))}`, {
    body: JSON.stringify(payload),
    headers: { 'x-customer-token': token },
    method: 'PUT',
  });
}

export async function deleteCustomerAddress(token: string, addressId: number) {
  const safeAddressId = Number(addressId || 0);
  if (!(safeAddressId > 0)) throw new Error('BAD_ADDRESS_ID');
  await requestApi(`/api/public/me/addresses/${encodeURIComponent(String(safeAddressId))}`, {
    headers: { 'x-customer-token': token },
    method: 'DELETE',
  });
}

export async function setDefaultCustomerAddress(token: string, addressId: number) {
  const safeAddressId = Number(addressId || 0);
  if (!(safeAddressId > 0)) throw new Error('BAD_ADDRESS_ID');
  await requestApi(`/api/public/me/addresses/${encodeURIComponent(String(safeAddressId))}/default`, {
    headers: { 'x-customer-token': token },
    method: 'PUT',
  });
}

export async function fetchTenantStores() {
  const response = await requestApi<{ stores?: TenantStore[] }>(`/api/public/tenant/stores?tenant_id=${encodeURIComponent(apiConfig.tenantId)}`) as ApiResponse<{ stores?: TenantStore[] }> & { stores?: TenantStore[] };
  const stores = response.stores || response.data?.stores;
  return saveTenantStores(Array.isArray(stores) ? stores : []);
}

export async function fetchBonusConfig(token: string) {
  const data = await requestJson<BonusConfig>('/api/public/bonus/config', {
    headers: { 'x-customer-token': token },
  });
  return data && typeof data === 'object' ? data : null;
}

export async function fetchBonusReferrals(token: string) {
  const data = await requestJson<BonusReferrals>('/api/public/bonus/referrals', {
    headers: { 'x-customer-token': token },
  });
  return saveBonusReferrals(token, data && typeof data === 'object' ? data : {});
}

function getCurrentBonusLevelId(config: BonusConfig | null) {
  const account = config?.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const accountLevelId = Number(account?.level_id || account?.bonus_level_id || 0);
  if (accountLevelId > 0) return accountLevelId;
  const firstLevelId = Number(levels[0]?.id || 0);
  return firstLevelId > 0 ? firstLevelId : 0;
}

export async function fetchBonusFavoriteCategories(token: string, levelId: number) {
  const safeLevelId = Number(levelId || 0);
  if (!(safeLevelId > 0)) return null;
  const data = await requestJson<BonusFavoriteCategories>(`/api/public/bonus/favorite-categories?level_id=${encodeURIComponent(String(safeLevelId))}`, {
    headers: { 'x-customer-token': token },
  });
  return data && typeof data === 'object' ? data : null;
}

export async function saveBonusFavoriteCategories(token: string, levelId: number, categoryIds: number[]) {
  const safeLevelId = Number(levelId || 0);
  if (!(safeLevelId > 0)) throw new Error('INVALID_LEVEL');
  const response = await requestApi<BonusFavoriteCategories>('/api/public/bonus/favorite-categories', {
    body: JSON.stringify({ category_ids: categoryIds, level_id: safeLevelId }),
    headers: { 'x-customer-token': token },
    method: 'POST',
  });
  return response.data && typeof response.data === 'object' ? response.data : null;
}

export async function fetchBonusTransactions(token: string, type?: string, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  if (Number(limit || 0) > 0) params.set('limit', String(Math.floor(Number(limit))));
  if (Number(offset || 0) > 0) params.set('offset', String(Math.floor(Number(offset))));
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  const data = await requestJson<BonusTransaction[]>(`/api/public/bonus/transactions${suffix}`, {
    headers: { 'x-customer-token': token },
  });
  const list = Array.isArray(data) ? data : [];
  if (Number(offset || 0) <= 0) await saveBonusTransactions(token, list, type);
  return list;
}

export async function fetchCustomerBenefits(token: string): Promise<CustomerBenefits> {
  const response = await requestApi<CustomerBenefits>('/api/public/me/benefits', {
    headers: { 'x-customer-token': token },
  });
  return saveCustomerBenefits(token, normalizeCustomerBenefits(response.data) || {
    completed: [],
    discounts: [],
    gifts: [],
    progress: [],
    promo_codes: [],
  }) as Promise<CustomerBenefits>;
}

export async function fetchCustomerDiscounts(token: string): Promise<CustomerBenefitCard[]> {
  const response = await requestApi<CustomerBenefitCard[]>('/api/public/me/discounts', {
    headers: { 'x-customer-token': token },
  });
  return saveCustomerDiscounts(token, Array.isArray(response.data) ? response.data : []);
}

export async function fetchCheckoutBenefitsPreview(token: string, payload: CheckoutBenefitsPreviewRequest) {
  const safeToken = String(token || '').trim();
  if (!safeToken) throw new Error('UNAUTHORIZED');
  const response = await requestApi<CheckoutBenefitsPreviewData>('/api/public/checkout/benefits/preview', {
    body: JSON.stringify(payload && typeof payload === 'object' ? payload : {}),
    headers: { 'x-customer-token': safeToken },
    method: 'POST',
  });
  return response.data && typeof response.data === 'object' ? response.data : null;
}

export async function attachCheckoutPromo(token: string, code: string) {
  const safeToken = String(token || '').trim();
  const normalizedCode = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!safeToken) throw new Error('UNAUTHORIZED');
  if (!normalizedCode) throw new Error('PROMO_CODE_REQUIRED');
  const response = await requestApi<Record<string, unknown>>('/api/public/checkout/benefits/attach-promo', {
    body: JSON.stringify({ code: normalizedCode }),
    headers: { 'x-customer-token': safeToken },
    method: 'POST',
  });
  return response.data && typeof response.data === 'object' ? response.data : null;
}

export async function checkOrderStock(items: Array<Record<string, unknown>>) {
  const response = await requestApi<OrderStockCheckPayload>('/api/public/orders/stock-check', {
    body: JSON.stringify({ items: Array.isArray(items) ? items : [] }),
    method: 'POST',
  });
  return response.data || { available: true, shortages: [], stock_levels: [] };
}

export async function fetchProductsBatchAvailability(productIds: number[]) {
  const ids = Array.from(new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((id) => Number(id || 0))
      .filter((id) => Number.isFinite(id) && id > 0),
  ));
  if (!ids.length) return { data: {}, stock_levels: [] };
  const response = await requestApi<ProductsBatchAvailabilityPayload>('/api/public/products/batch/availability', {
    body: JSON.stringify({ ids }),
    method: 'POST',
  });
  return response.data || { data: {}, stock_levels: [] };
}

export async function joinBonusProgram(token: string) {
  await requestApi('/api/public/bonus/join', {
    body: JSON.stringify({}),
    headers: { 'x-customer-token': token },
    method: 'POST',
  });
}

export async function refreshCustomerPassport(token: string, seedCustomer?: CustomerProfile | null) {
  const safeToken = String(token || '').trim();
  if (!safeToken) throw new Error('UNAUTHORIZED');

  const [customer, addresses, bonusConfig, bonusReferrals] = await Promise.all([
    fetchCustomerMe(safeToken),
    fetchCustomerAddresses(safeToken).catch(() => []),
    fetchBonusConfig(safeToken).catch(() => null),
    fetchBonusReferrals(safeToken).catch(() => null),
  ]);
  const bonusFavoriteCategories = await fetchBonusFavoriteCategories(safeToken, getCurrentBonusLevelId(bonusConfig)).catch(() => null);
  const passport: CustomerPassport = {
    addresses,
    bonusConfig,
    bonusFavoriteCategories,
    bonusReferrals,
    customer: customer || normalizeCustomer(seedCustomer),
    token: safeToken,
    updatedAt: new Date().toISOString(),
  };
  await saveCustomerPassport(passport);
  return passport;
}

export async function updateCustomerMe(token: string, body: { name?: string; birthday?: string }) {
  await requestApi('/api/public/me', {
    body: JSON.stringify(body),
    headers: { 'x-customer-token': token },
    method: 'PUT',
  });
}

export async function uploadCustomerPhoto(
  token: string,
  image: { uri: string; name?: string | null; type?: string | null },
) {
  const formData = new FormData();
  formData.append('photo', {
    name: image.name || 'profile-photo.jpg',
    type: image.type || 'image/jpeg',
    uri: image.uri,
  } as unknown as Blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(buildUrl('/api/public/me/photo'), {
      body: formData,
      headers: {
        Accept: 'application/json',
        'x-customer-token': token,
        'x-store-id': apiConfig.storeId,
        'x-tenant-id': apiConfig.tenantId,
      },
      method: 'POST',
      signal: controller.signal,
    });
    const json = await response.json() as ApiResponse<{ photoUrl?: string; photo?: string; url?: string; customer?: CustomerProfile }> & {
      customer?: CustomerProfile;
      photo?: string;
      photoUrl?: string;
      url?: string;
    };
    if (!response.ok || json.ok === false) {
      throw new Error(json.error || `HTTP_${response.status}`);
    }
    return String(
      json.photoUrl ||
      json.photo ||
      json.url ||
      json.customer?.photo ||
      json.data?.photoUrl ||
      json.data?.photo ||
      json.data?.url ||
      json.data?.customer?.photo ||
      '',
    ).trim();
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteCustomerPhoto(token: string) {
  await requestApi('/api/public/me/photo', {
    headers: { 'x-customer-token': token },
    method: 'DELETE',
  });
}

function collectSnapshotProductIds(snapshot: MobileCatalogSnapshot) {
  const ids = new Set<number>();
  Object.values(snapshot.productsByCategory || {}).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((product) => {
      const id = Number(product?.id || 0);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    });
  });
  return Array.from(ids).sort((a, b) => a - b);
}

function getIngredientRequirementRows(ingredients: unknown[]): FullProductAvailabilityRequirement[] {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map((item): FullProductAvailabilityRequirement | null => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      const productId = Number(source?.ingredient_id || source?.product_id || source?.id || 0);
      const requiredQty = Number(source?.quantity ?? source?.qty ?? 0);
      if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(requiredQty) || requiredQty <= 0) return null;
      const productName = String(source?.ingredient_name || source?.name || '').trim();
      return {
        product_id: productId,
        productId,
        product_name: productName,
        productName,
        required_qty: requiredQty,
        requiredQty,
      };
    })
    .filter((item): item is FullProductAvailabilityRequirement => !!item);
}

function fullProductPassportFromCatalogPassport(passport: CatalogProductPassport | null | undefined): FullProductPassport | null {
  if (!passport?.product) return null;
  const productId = Number(passport.product.id || 0);
  if (!Number.isFinite(productId) || productId <= 0) return null;
  const stockQty = passport.product.stock_qty == null || passport.product.stock_qty === ''
    ? null
    : Number(passport.product.stock_qty);
  const isAvailable = passport.product.is_available == null
    ? undefined
    : passport.product.is_available === true || passport.product.is_available === 1 || passport.product.is_available === '1';
  return {
    availability: {
      is_available: isAvailable,
      isAvailable,
      product_id: productId,
      productId,
      qty: Number.isFinite(stockQty) ? stockQty : null,
      requirements: getIngredientRequirementRows(passport.ingredients || []),
      stock_qty: Number.isFinite(stockQty) ? stockQty : null,
    },
    benefits: {},
    comboRefs: [],
    defaultConfig: passport.defaultConfig && typeof passport.defaultConfig === 'object' ? passport.defaultConfig : null,
    ingredients: Array.isArray(passport.ingredients) ? passport.ingredients : [],
    nestedIngredients: {},
    nutrition: {},
    optionAssignments: Array.isArray(passport.optionAssignments) ? passport.optionAssignments : [],
    options: Array.isArray(passport.optionGroups) ? passport.optionGroups : [],
    product: passport.product,
    productUnitLinks: [],
    revision: {
      data_version: 'catalog-product-passport-v1',
      revision: passport.updated_at || null,
      updated_at: passport.updated_at || null,
    },
    stock: {},
    texts: {},
    unitConversions: [],
    units: {},
    variants: Array.isArray(passport.variants) ? passport.variants : [],
    visibility: {},
  };
}

export async function fetchFullProductPassports(productIds: number[]) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return {};
  const requestKey = ids.slice().sort((a, b) => a - b).join(',');
  const pending = fullPassportBatchLoadRequests.get(requestKey);
  if (pending) return pending;

  const request = (async () => {
    const response = await requestApi<Record<string, CatalogProductPassport>>('/api/public/products/batch/passports', {
      body: JSON.stringify({ ids }),
      method: 'POST',
    });
    const catalogPassports = response.data || {};
    const data = normalizeFullProductPassportMap(Object.fromEntries(
      Object.entries(catalogPassports).map(([id, passport]) => [id, fullProductPassportFromCatalogPassport(passport)]),
    ));
    await saveFullProductPassports(data);
    return data;
  })();

  fullPassportBatchLoadRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    fullPassportBatchLoadRequests.delete(requestKey);
  }
}

export async function warmFullProductPassports(productIds: number[]) {
  const cached = Object.keys(memoryFullProductPassports).length
    ? memoryFullProductPassports
    : await readCachedFullProductPassports();
  const missingIds = [...new Set((Array.isArray(productIds) ? productIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0 && !cached[String(id)] && !fullPassportLoadRequests.has(id)))];
  const chunks: number[][] = [];
  for (let index = 0; index < missingIds.length; index += 4) {
    chunks.push(missingIds.slice(index, index + 4));
  }

  for (const chunk of chunks) {
    await fetchFullProductPassports(chunk);
  }
  return memoryFullProductPassports;
}

export async function warmFullProductPassportsFromSnapshot(snapshot: MobileCatalogSnapshot) {
  return warmFullProductPassports(collectSnapshotProductIds(snapshot));
}

export async function ensureFullProductPassport(productId: number) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const existing = getFullProductPassport(id);
  if (existing) return existing;

  const pending = fullPassportLoadRequests.get(id);
  if (pending) return pending;

  const request = (async () => {
    const cached = await readCachedFullProductPassports();
    if (cached[String(id)]) return cached[String(id)];

    const loaded = await fetchFullProductPassports([id]);
    return loaded[String(id)] || null;
  })();

  fullPassportLoadRequests.set(id, request);
  try {
    return await request;
  } finally {
    fullPassportLoadRequests.delete(id);
  }
}

async function mergeMobileCatalogPassports(snapshot: MobileCatalogSnapshot, productIds: number[]) {
  const response = await requestApi<Record<string, CatalogProductPassport>>('/api/public/products/batch/passports', {
    body: JSON.stringify({ ids: productIds }),
    method: 'POST',
  });
  const data = response.data || {};
  Object.keys(data).forEach((productId) => {
    const id = Number(productId);
    if (Number.isFinite(id) && id > 0) refreshedCatalogPassportIds.add(id);
  });
  const fullPassports = normalizeFullProductPassportMap(Object.fromEntries(
    Object.entries(data).map(([id, passport]) => [id, fullProductPassportFromCatalogPassport(passport)]),
  ));
  const nextSnapshot: MobileCatalogSnapshot = {
    ...snapshot,
    productPassports: {
      ...(snapshot.productPassports || {}),
      ...data,
    },
  };
  await saveMobileCatalogSnapshot(nextSnapshot);
  if (Object.keys(fullPassports).length) await saveFullProductPassports(fullPassports);
  return nextSnapshot;
}

export async function warmMobileCatalogPassports(snapshot: MobileCatalogSnapshot) {
  const ids = collectSnapshotProductIds(snapshot);
  const missingIds = ids.filter((id) => {
    const passport = snapshot.productPassports?.[String(id)];
    return !passport || !Array.isArray(passport.ingredients) || !Array.isArray(passport.optionGroups);
  });
  const chunks: number[][] = [];
  for (let index = 0; index < missingIds.length; index += 30) {
    chunks.push(missingIds.slice(index, index + 30));
  }

  let currentSnapshot = snapshot;
  for (const chunk of chunks) {
    currentSnapshot = await mergeMobileCatalogPassports(currentSnapshot, chunk);
  }
  return currentSnapshot;
}

export async function ensureMobileCatalogProductPassport(productId: number) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const pending = passportLoadRequests.get(id);
  if (pending) return pending;

  const request = (async () => {
  const baseSnapshot = memoryCatalogSnapshot || await readCachedMobileCatalogSnapshot();
  if (!baseSnapshot) return null;

  const existing = baseSnapshot.productPassports?.[String(id)];
  if (
    refreshedCatalogPassportIds.has(id)
    && existing
    && Array.isArray(existing.ingredients)
    && Array.isArray(existing.optionGroups)
  ) return existing;

  try {
    const nextSnapshot = await mergeMobileCatalogPassports(baseSnapshot, [id]);
    const refreshed = nextSnapshot.productPassports?.[String(id)] || null;
    if (refreshed) refreshedCatalogPassportIds.add(id);
    return refreshed || existing || null;
  } catch {
    return existing || null;
  }
  })();

  passportLoadRequests.set(id, request);
  try {
    return await request;
  } finally {
    passportLoadRequests.delete(id);
  }
}

export async function fetchMobileCatalogSnapshot() {
  const snapshot = await requestJson<MobileCatalogSnapshot>('/api/public/mobile/catalog-snapshot');
  const normalized = normalizeMobileCatalogSnapshot(snapshot);
  if (!normalized) throw new Error('BAD_MOBILE_SNAPSHOT');
  Object.keys(normalized.productPassports || {}).forEach((productId) => {
    const id = Number(productId);
    if (Number.isFinite(id) && id > 0) refreshedCatalogPassportIds.add(id);
  });
  await saveMobileCatalogSnapshot(normalized);
  return normalized;
}

export async function fetchMobileCatalogIndex() {
  const index = await requestJson<MobileCatalogIndex>('/api/public/mobile/catalog-index');
  const normalized = normalizeMobileCatalogIndex(index);
  if (!normalized) throw new Error('BAD_MOBILE_CATALOG_INDEX');
  await saveMobileCatalogIndex(normalized);
  return normalized;
}

export async function fetchCatalogComboDetails(comboId: number) {
  const id = Number(comboId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('BAD_COMBO_ID');

  const pending = comboDetailsLoadRequests.get(id);
  if (pending) return pending;

  const request = (async () => {
  const combo = await requestJson<CatalogComboDetails>(`/api/public/combos/${encodeURIComponent(String(id))}`);
  const normalized = normalizeCatalogComboDetails(combo);
  if (!normalized) throw new Error('BAD_COMBO_DETAILS');
  await saveCatalogComboDetails(normalized);
  return normalized;
  })();

  comboDetailsLoadRequests.set(id, request);
  try {
    return await request;
  } finally {
    comboDetailsLoadRequests.delete(id);
  }
}

export async function warmCatalogComboDetails(comboIds: number[]) {
  const ids = Array.from(new Set(comboIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)));
  for (const id of ids) {
    if (memoryComboDetails.has(id)) continue;
    try {
      await fetchCatalogComboDetails(id);
    } catch {
      // Background warming must not block catalog rendering.
    }
  }
}

export function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!apiConfig.baseUrl) return value;
  return `${apiConfig.baseUrl.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
}

export async function fetchCatalogCategories() {
  const data = await requestJson<BootstrapPayload>('/api/public/shop/bootstrap');
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function fetchCatalogByCategories(categoryIds: number[]): Promise<CatalogByCategoryPayload> {
  const ids = categoryIds.map(toNumberId).filter((id): id is number => id !== null);
  if (!ids.length) {
    return {
      combosByCategory: new Map(),
      productsByCategory: new Map(),
    };
  }

  const response = await requestApi<Record<string, CatalogProduct[]>>('/api/public/products/batch/categories', {
    body: JSON.stringify({ category_ids: ids }),
    method: 'POST',
  });
  const data = response.data || {};
  const combos = (response as ApiResponse<Record<string, CatalogProduct[]>> & {
    combos?: Record<string, CatalogCombo[]>;
  }).combos;

  return {
    combosByCategory: mapRecordToCategoryMap<CatalogCombo>(combos, ids),
    productsByCategory: mapRecordToCategoryMap<CatalogProduct>(data, ids),
  };
}

export async function fetchCatalogProduct(productId: number) {
  return requestJson<CatalogProduct>(`/api/public/products/${encodeURIComponent(String(productId))}`);
}
