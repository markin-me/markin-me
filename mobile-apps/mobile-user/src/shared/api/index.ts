import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CatalogCategory,
  CatalogCombo,
  CatalogComboDetails,
  CatalogProduct,
  CatalogProductPassport,
  MobileCatalogSnapshot,
} from '../../entities/product';
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

export type CustomerProfile = {
  id: number;
  name?: string | null;
  phone?: string | null;
  birthday?: string | null;
  photo?: string | null;
  total_orders?: number | null;
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
  delivery_zone_name?: string | null;
  free_delivery_from?: number | null;
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
const memoryComboDetails = new Map<number, CatalogComboDetails>();
let memoryCustomerPassport: CustomerPassport | null = null;
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
const comboDetailsLoadRequests = new Map<number, Promise<CatalogComboDetails>>();

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

function getComboDetailsStorageKey(comboId: number) {
  return `mobile_combo_details_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}_c${comboId}`;
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
    addresses: Array.isArray(source.addresses) ? source.addresses : [],
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

function normalizeTenantStores(value: unknown): TenantStore[] | null {
  return Array.isArray(value) ? value : null;
}

function normalizeCustomerAddresses(value: unknown): CustomerAddress[] | null {
  return Array.isArray(value) ? value : null;
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

export function getMemoryCatalogComboDetails(comboId: number) {
  const id = Number(comboId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryComboDetails.get(id) || null;
}

export function getCatalogProductPassport(productId: number): CatalogProductPassport | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryCatalogSnapshot?.productPassports?.[String(id)] || null;
}

export function getCatalogSnapshotProduct(productId: number): CatalogProduct | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
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
    if (snapshot) memoryCatalogSnapshot = snapshot;
    return snapshot;
  } catch {
    return null;
  }
}

export async function saveMobileCatalogSnapshot(snapshot: MobileCatalogSnapshot) {
  const normalized = normalizeMobileCatalogSnapshot(snapshot);
  if (!normalized) return null;
  memoryCatalogSnapshot = normalized;
  await AsyncStorage.setItem(getMobileSnapshotStorageKey(), JSON.stringify(normalized));
  return normalized;
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
  return normalized;
}

export async function clearCustomerPassport() {
  memoryCustomerPassport = null;
  await AsyncStorage.removeItem(getCustomerPassportStorageKey());
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
  memoryCustomerAddresses.set(key, normalized);
  await saveCachedJson(key, normalized);
  if (memoryCustomerPassport?.token === safeToken) {
    await saveCustomerPassport({
      ...memoryCustomerPassport,
      addresses: normalized,
      updatedAt: new Date().toISOString(),
    });
  }
  return normalized;
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

async function mergeMobileCatalogPassports(snapshot: MobileCatalogSnapshot, productIds: number[]) {
  const response = await requestApi<Record<string, CatalogProductPassport>>('/api/public/products/batch/passports', {
    body: JSON.stringify({ ids: productIds }),
    method: 'POST',
  });
  const data = response.data || {};
  const nextSnapshot: MobileCatalogSnapshot = {
    ...snapshot,
    productPassports: {
      ...(snapshot.productPassports || {}),
      ...data,
    },
  };
  await saveMobileCatalogSnapshot(nextSnapshot);
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
  if (existing && Array.isArray(existing.ingredients) && Array.isArray(existing.optionGroups)) return existing;

  try {
    const nextSnapshot = await mergeMobileCatalogPassports(baseSnapshot, [id]);
    return nextSnapshot.productPassports?.[String(id)] || existing || null;
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
  await saveMobileCatalogSnapshot(normalized);
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
