import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CatalogCategory,
  CatalogCombo,
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

let memoryCatalogSnapshot: MobileCatalogSnapshot | null = null;

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

export function getMemoryMobileCatalogSnapshot() {
  return memoryCatalogSnapshot;
}

export function getCatalogProductPassport(productId: number): CatalogProductPassport | null {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return memoryCatalogSnapshot?.productPassports?.[String(id)] || null;
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
}

export async function fetchMobileCatalogSnapshot() {
  const snapshot = await requestJson<MobileCatalogSnapshot>('/api/public/mobile/catalog-snapshot');
  const normalized = normalizeMobileCatalogSnapshot(snapshot);
  if (!normalized) throw new Error('BAD_MOBILE_SNAPSHOT');
  await saveMobileCatalogSnapshot(normalized);
  return normalized;
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
