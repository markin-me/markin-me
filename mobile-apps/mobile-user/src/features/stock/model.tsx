import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  fetchUnitConversions,
  fetchProductsBatchAvailability,
  getMemoryMobileCatalogSnapshot,
  getMemoryUnitConversions,
  readCachedUnitConversions,
  readCachedFullProductPassports,
  readCachedMobileCatalogSnapshot,
} from '../../shared/api';
import { apiConfig } from '../../shared/api/config';
import type { UnitConversion } from '../../entities/product';
import {
  extractStockRowsFromFullPassports,
  extractStockRowsFromAvailabilityPayload,
  extractStockRowsFromMobileSnapshot,
  mergeStockLevels,
  type ProductStockLevel,
} from '../../shared/lib/productStock';

type RefreshStockResult = {
  payload: Awaited<ReturnType<typeof fetchProductsBatchAvailability>> | null;
  stockLevels: Map<number, ProductStockLevel>;
};

type StockContextValue = {
  hydrateFromCache: () => Promise<void>;
  loading: boolean;
  mergeStockRows: (rows: unknown[]) => Map<number, ProductStockLevel>;
  refreshMany: (ids: number[]) => Promise<RefreshStockResult>;
  refreshOne: (id: number) => Promise<ProductStockLevel | null>;
  stockLevels: Map<number, ProductStockLevel>;
  unitConversions: UnitConversion[];
  updatedAt: number;
};

const STOCK_CACHE_KEY = `mobile-user-stock-levels:v1:t${apiConfig.tenantId || 0}:s${apiConfig.storeId || 0}`;
const AVAILABILITY_CHUNK_SIZE = 500;

const StockContext = createContext<StockContextValue | null>(null);

function normalizeIds(ids: number[]) {
  return Array.from(new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => Number(id || 0))
      .filter((id) => Number.isFinite(id) && id > 0),
  ));
}

function chunkIds(ids: number[]) {
  return chunkIdsBySize(ids, AVAILABILITY_CHUNK_SIZE);
}

function chunkIdsBySize(ids: number[], size: number) {
  const chunks: number[][] = [];
  const safeSize = Math.max(1, Math.floor(Number(size || 1)));
  for (let index = 0; index < ids.length; index += safeSize) {
    chunks.push(ids.slice(index, index + safeSize));
  }
  return chunks;
}

function addProductId(ids: Set<number>, rawId: unknown) {
  const id = Number(rawId || 0);
  if (Number.isFinite(id) && id > 0) ids.add(id);
}

function addIngredientProductIds(ids: Set<number>, rawIngredients: unknown) {
  if (!Array.isArray(rawIngredients)) return;
  rawIngredients.forEach((rawIngredient) => {
    const ingredient = rawIngredient && typeof rawIngredient === 'object'
      ? rawIngredient as Record<string, unknown>
      : null;
    if (!ingredient) return;
    addProductId(
      ids,
      ingredient.ingredient_id ?? ingredient.ingredientId ?? ingredient.product_id ?? ingredient.productId ?? ingredient.id,
    );
  });
}

function collectSnapshotProductIds(snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>>) {
  const ids = new Set<number>();
  Object.values(snapshot?.productsByCategory || {}).forEach((products) => {
    products.forEach((product) => {
      addProductId(ids, product?.id);
      addIngredientProductIds(ids, product?.ingredients);
    });
  });
  Object.values(snapshot?.productPassports || {}).forEach((passport) => {
    addProductId(ids, passport?.product?.id);
    addIngredientProductIds(ids, passport?.ingredients);
    addIngredientProductIds(ids, passport?.defaultConfig?.ingredients);
  });
  return Array.from(ids);
}

function serializeStockLevels(stockLevels: Map<number, ProductStockLevel>) {
  return Array.from(stockLevels.values());
}

function normalizeComparableLevel(level: ProductStockLevel | undefined) {
  if (!level) return null;
  return JSON.stringify({
    canFulfill: level.canFulfill ?? null,
    isAvailable: level.isAvailable ?? null,
    isUnlimited: level.isUnlimited ?? null,
    maxQty: level.maxQty ?? null,
    productId: level.productId,
    qty: level.qty ?? null,
    remainingQty: level.remainingQty ?? null,
    requirements: Array.isArray(level.requirements) ? level.requirements : [],
    sourcePriority: level.sourcePriority ?? null,
  });
}

function areStockLevelsEqual(prev: Map<number, ProductStockLevel>, next: Map<number, ProductStockLevel>) {
  if (prev.size !== next.size) return false;
  for (const [productId, nextLevel] of next) {
    if (normalizeComparableLevel(prev.get(productId)) !== normalizeComparableLevel(nextLevel)) return false;
  }
  return true;
}

export function StockProvider({ children }: { children: ReactNode }) {
  const [stockLevels, setStockLevels] = useState<Map<number, ProductStockLevel>>(() => new Map());
  const [unitConversions, setUnitConversions] = useState<UnitConversion[]>(() => getMemoryUnitConversions());
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const stockLevelsRef = useRef(stockLevels);
  const hydratingRef = useRef<Promise<void> | null>(null);
  const refreshRequestsRef = useRef<Map<string, Promise<RefreshStockResult>>>(new Map());

  useEffect(() => {
    stockLevelsRef.current = stockLevels;
  }, [stockLevels]);

  const persistStockLevels = useCallback((levels: Map<number, ProductStockLevel>) => {
    AsyncStorage.setItem(STOCK_CACHE_KEY, JSON.stringify({
      rows: serializeStockLevels(levels),
      updatedAt: Date.now(),
    })).catch(() => {});
  }, []);

  const mergeStockRows = useCallback((rows: unknown[]) => {
    const nextLevels = mergeStockLevels(new Map(stockLevelsRef.current), Array.isArray(rows) ? rows : []);
    if (areStockLevelsEqual(stockLevelsRef.current, nextLevels)) return stockLevelsRef.current;
    stockLevelsRef.current = nextLevels;
    setStockLevels(nextLevels);
    setUpdatedAt(Date.now());
    persistStockLevels(nextLevels);
    return nextLevels;
  }, [persistStockLevels]);

  const refreshMany = useCallback(async (ids: number[]): Promise<RefreshStockResult> => {
    const productIds = normalizeIds(ids);
    if (!productIds.length) {
      return { payload: null, stockLevels: stockLevelsRef.current };
    }
    const requestKey = productIds.slice().sort((a, b) => a - b).join(',');
    const pending = refreshRequestsRef.current.get(requestKey);
    if (pending) return pending;

    const request = (async () => {
      setLoading(true);
      const data: Record<string, Record<string, unknown>> = {};
      const stockRows: Array<Record<string, unknown>> = [];
      let nextLevels = stockLevelsRef.current;
      for (const chunk of chunkIds(productIds)) {
        const chunkPayload = await fetchProductsBatchAvailability(chunk);
        const chunkRows = extractStockRowsFromAvailabilityPayload(chunkPayload)
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
          .map((row) => ({ ...row, sourcePriority: 5 }));
        if (chunkPayload?.data && typeof chunkPayload.data === 'object') {
          Object.assign(data, chunkPayload.data);
        }
        stockRows.push(...chunkRows);
        nextLevels = mergeStockLevels(new Map(nextLevels), chunkRows);
      }
      if (!areStockLevelsEqual(stockLevelsRef.current, nextLevels)) {
        stockLevelsRef.current = nextLevels;
        setStockLevels(nextLevels);
        setUpdatedAt(Date.now());
        persistStockLevels(nextLevels);
      }
      return { payload: { data, stock_levels: stockRows }, stockLevels: stockLevelsRef.current };
    })();

    refreshRequestsRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      refreshRequestsRef.current.delete(requestKey);
      setLoading(false);
    }
  }, [persistStockLevels]);

  const refreshOne = useCallback(async (id: number) => {
    const result = await refreshMany([id]);
    return result.stockLevels.get(Number(id || 0)) || null;
  }, [refreshMany]);

  const hydrateFromCache = useCallback(async () => {
    if (hydratingRef.current) return hydratingRef.current;
    hydratingRef.current = (async () => {
      setLoading(true);
      try {
        const raw = await AsyncStorage.getItem(STOCK_CACHE_KEY).catch(() => null);
        const parsed = raw ? JSON.parse(raw) as { rows?: unknown[]; updatedAt?: number } : null;
        if (parsed?.rows?.length) {
          const cachedLevels = mergeStockLevels(new Map(), parsed.rows);
          stockLevelsRef.current = cachedLevels;
          setStockLevels(cachedLevels);
          setUpdatedAt(Number(parsed.updatedAt || 0));
        }

        const conversions = await readCachedUnitConversions();
        setUnitConversions(conversions);

        const cachedFullPassports = await readCachedFullProductPassports();
        const cachedFullPassportRows = extractStockRowsFromFullPassports(cachedFullPassports);
        if (cachedFullPassportRows.length) {
          const cachedLevels = mergeStockLevels(new Map(stockLevelsRef.current), cachedFullPassportRows);
          if (!areStockLevelsEqual(stockLevelsRef.current, cachedLevels)) {
            stockLevelsRef.current = cachedLevels;
            setStockLevels(cachedLevels);
            setUpdatedAt(Date.now());
            persistStockLevels(cachedLevels);
          }
        }

        const snapshot = getMemoryMobileCatalogSnapshot() || await readCachedMobileCatalogSnapshot();
        const snapshotRows = extractStockRowsFromMobileSnapshot(snapshot, conversions);
        if (snapshotRows.length) {
          const snapshotLevels = mergeStockLevels(new Map(stockLevelsRef.current), snapshotRows);
          if (!areStockLevelsEqual(stockLevelsRef.current, snapshotLevels)) {
            stockLevelsRef.current = snapshotLevels;
            setStockLevels(snapshotLevels);
            setUpdatedAt(Date.now());
            persistStockLevels(snapshotLevels);
          }
        }

        if (!conversions.length) {
          void fetchUnitConversions()
            .then((freshConversions) => {
              if (!freshConversions.length) return;
              setUnitConversions(freshConversions);
              const freshSnapshotRows = extractStockRowsFromMobileSnapshot(getMemoryMobileCatalogSnapshot(), freshConversions);
              if (!freshSnapshotRows.length) return;
              const freshSnapshotLevels = mergeStockLevels(new Map(stockLevelsRef.current), freshSnapshotRows);
              if (areStockLevelsEqual(stockLevelsRef.current, freshSnapshotLevels)) return;
              stockLevelsRef.current = freshSnapshotLevels;
              setStockLevels(freshSnapshotLevels);
              setUpdatedAt(Date.now());
              persistStockLevels(freshSnapshotLevels);
            })
            .catch(() => null);
        }
      } catch {
        // UI must stay usable if cache hydration fails; explicit refreshes still surface API errors.
      } finally {
        setLoading(false);
        hydratingRef.current = null;
      }
    })();
    return hydratingRef.current;
  }, [persistStockLevels]);

  useEffect(() => {
    hydrateFromCache();
  }, [hydrateFromCache]);

  const value = useMemo<StockContextValue>(() => ({
    hydrateFromCache,
    loading,
    mergeStockRows,
    refreshMany,
    refreshOne,
    stockLevels,
    unitConversions,
    updatedAt,
  }), [hydrateFromCache, loading, mergeStockRows, refreshMany, refreshOne, stockLevels, unitConversions, updatedAt]);

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useProductStock() {
  const value = useContext(StockContext);
  if (!value) throw new Error('useProductStock must be used inside StockProvider');
  return value;
}
