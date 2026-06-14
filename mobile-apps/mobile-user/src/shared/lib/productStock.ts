import type { CatalogCombo, CatalogProduct, CatalogProductPassport, FullProductPassport, MobileCatalogSnapshot, UnitConversion } from '../../entities/product';

export type ProductStockLevel = {
  canFulfill?: boolean;
  isAvailable?: boolean;
  isUnlimited?: boolean;
  maxQty?: number | null;
  productId: number;
  productName?: string;
  qty?: number | null;
  remainingQty?: number | null;
  requirements?: ProductStockRequirement[];
  requiredQty?: number | null;
  sourcePriority?: number;
  updatedAt?: number;
};

export type ProductStockRequirement = {
  availableQty?: number | null;
  isUnlimited?: boolean;
  productId: number;
  productName?: string;
  remainingQty?: number | null;
  requiredQty?: number | null;
};

export type ProductAvailabilityState = {
  availableForAdd: boolean;
  cartQty: number;
  hasKnownStock: boolean;
  stockAvailable: boolean;
  stockQty: number | null;
};

export type VariantUnitPriceResult = {
  missingConversion: boolean;
  quantityInBase: number | null;
  unitPrice: number;
};

function normalizeStockQty(rawQty: unknown) {
  if (rawQty === undefined) return undefined;
  if (rawQty === null || rawQty === '') return null;
  const value = Number(rawQty);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value * 1000) / 1000);
}

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toPositiveQty(value: unknown) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function toStockBool(value: unknown, fallback?: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const number = Number(value);
  if (Number.isFinite(number)) return number !== 0;
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  if (text === 'true' || text === 'yes' || text === 'on') return true;
  if (text === 'false' || text === 'no' || text === 'off') return false;
  return fallback;
}

function getProductId(value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const id = Number(row.productId || row.product_id || row.id || row.product_id_num || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeRequirements(rawRequirements: unknown): ProductStockRequirement[] | undefined {
  if (!Array.isArray(rawRequirements)) return undefined;
  const requirements: ProductStockRequirement[] = [];
  rawRequirements.forEach((rawRequirement) => {
    const row = rawRequirement && typeof rawRequirement === 'object' ? rawRequirement as Record<string, unknown> : null;
    const productId = getProductId(row);
    if (!row || !productId) return;
    const availableQty = normalizeStockQty(
      row.availableQty !== undefined ? row.availableQty : row.available_qty,
    );
    const remainingQty = normalizeStockQty(
      row.remainingQty !== undefined ? row.remainingQty : row.remaining_qty,
    );
    const requiredQty = normalizeStockQty(
      row.requiredQty !== undefined ? row.requiredQty : row.required_qty,
    );
    const productName = row.productName !== undefined ? row.productName : row.product_name;
    requirements.push({
      availableQty: availableQty === undefined ? undefined : availableQty,
      isUnlimited: toStockBool(row.isUnlimited !== undefined ? row.isUnlimited : row.is_unlimited, availableQty === null),
      productId,
      productName: productName == null ? undefined : String(productName || '').trim(),
      remainingQty: remainingQty === undefined ? undefined : remainingQty,
      requiredQty: requiredQty === undefined ? undefined : requiredQty,
    });
  });
  return requirements;
}

export function getProductStockQty(product: Pick<CatalogProduct, 'stock_qty'> | null | undefined) {
  const qty = normalizeStockQty(product?.stock_qty);
  return qty === undefined ? null : qty;
}

function hasExplicitProductStockQty(product: Pick<CatalogProduct, 'stock_qty'> | null | undefined) {
  return !!product && Object.prototype.hasOwnProperty.call(product, 'stock_qty');
}

export function isStockFulfillmentMode(product: Pick<CatalogProduct, 'fulfillment_mode'> | null | undefined) {
  return String(product?.fulfillment_mode || '').trim() !== 'made_to_order';
}

export function getStockLevelEntry(stockLevels: Map<number, ProductStockLevel>, productId: unknown) {
  const id = Number(productId || 0);
  return Number.isFinite(id) && id > 0 ? stockLevels.get(id) || null : null;
}

export function stockLevelFromProduct(product: CatalogProduct | null | undefined): ProductStockLevel | null {
  const id = Number(product?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  const row: Record<string, unknown> = { productId: id, sourcePriority: 1 };
  if (Object.prototype.hasOwnProperty.call(product, 'stock_qty')) row.qty = product?.stock_qty;
  if (product?.is_available !== undefined && product?.is_available !== null) row.isAvailable = product.is_available;
  if (product?.name != null) row.productName = product.name;
  return upsertStockLevelRow(new Map(), row).get(id) || null;
}

export function upsertStockLevelRow(stockLevels: Map<number, ProductStockLevel>, rawRow: unknown): Map<number, ProductStockLevel> {
  const row = rawRow && typeof rawRow === 'object' ? rawRow as Record<string, unknown> : null;
  const productId = getProductId(row);
  if (!row || !productId) return stockLevels;

  const nextLevels = new Map(stockLevels);
  const prev = nextLevels.get(productId) || { productId };
  const incomingSourcePriority = Number(row.sourcePriority ?? row.source_priority ?? 2);
  const prevSourcePriority = Number(prev.sourcePriority ?? 0);
  if (Number.isFinite(incomingSourcePriority) && incomingSourcePriority < prevSourcePriority) return stockLevels;
  const next: ProductStockLevel = { ...prev, productId };
  if (Number.isFinite(incomingSourcePriority)) next.sourcePriority = incomingSourcePriority;

  const qtyRaw = Object.prototype.hasOwnProperty.call(row, 'qty')
    ? row.qty
    : Object.prototype.hasOwnProperty.call(row, 'availableQty')
      ? row.availableQty
      : Object.prototype.hasOwnProperty.call(row, 'available_qty')
        ? row.available_qty
        : Object.prototype.hasOwnProperty.call(row, 'stock_qty')
          ? row.stock_qty
          : undefined;
  const qty = normalizeStockQty(qtyRaw);
  const hasQty = qty !== undefined;
  if (hasQty) {
    next.qty = qty;
    next.isUnlimited = qty === null;
  }

  const maxQty = normalizeStockQty(row.maxQty !== undefined ? row.maxQty : row.max_qty);
  if (maxQty !== undefined) next.maxQty = maxQty;

  const requiredQty = normalizeStockQty(row.requiredQty !== undefined ? row.requiredQty : row.required_qty);
  if (requiredQty !== undefined) next.requiredQty = requiredQty;

  const remainingQty = normalizeStockQty(row.remainingQty !== undefined ? row.remainingQty : row.remaining_qty);
  if (remainingQty !== undefined) next.remainingQty = remainingQty;

  const explicitUnlimited = toStockBool(row.isUnlimited !== undefined ? row.isUnlimited : row.is_unlimited, undefined);
  if (explicitUnlimited !== undefined) next.isUnlimited = explicitUnlimited;

  const explicitAvailable = toStockBool(
    row.isAvailable !== undefined ? row.isAvailable : row.is_available !== undefined ? row.is_available : row.available,
    undefined,
  );
  if (explicitAvailable !== undefined) {
    next.isAvailable = explicitAvailable;
    if (explicitAvailable === false) {
      next.canFulfill = false;
      next.isUnlimited = false;
    }
  } else if (hasQty && qty === null) {
    next.isUnlimited = true;
    next.isAvailable = true;
    next.canFulfill = true;
  } else if (hasQty) {
    next.isAvailable = Number(qty || 0) > 0;
  }

  const explicitCanFulfill = toStockBool(row.canFulfill !== undefined ? row.canFulfill : row.can_fulfill, undefined);
  if (explicitCanFulfill !== undefined) {
    next.canFulfill = explicitCanFulfill;
  } else if (requiredQty !== undefined && hasQty && qty !== null) {
    next.canFulfill = Number(qty || 0) + 1e-9 >= Number(requiredQty || 0);
  } else if (hasQty && qty === null && next.isAvailable !== false) {
    next.canFulfill = true;
  }

  const productName = row.productName !== undefined ? row.productName : row.product_name;
  if (productName != null) next.productName = String(productName || '').trim();

  const requirements = normalizeRequirements(row.requirements);
  if (requirements !== undefined) next.requirements = requirements;

  next.updatedAt = Date.now();
  nextLevels.set(productId, next);
  return nextLevels;
}

export function mergeStockLevels(stockLevels: Map<number, ProductStockLevel>, rows: unknown[]): Map<number, ProductStockLevel> {
  return (Array.isArray(rows) ? rows : []).reduce(
    (levels: Map<number, ProductStockLevel>, row) => upsertStockLevelRow(levels, row),
    stockLevels,
  );
}

export function extractStockRowsFromAvailabilityPayload(payload: unknown) {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (Array.isArray(source.stock_levels)) return source.stock_levels;
  if (Array.isArray(source.stockLevels)) return source.stockLevels;
  const data = source.data && typeof source.data === 'object' ? source.data as Record<string, unknown> : {};
  return Object.values(data);
}

export function getUnitConversionFactor(unitConversions: UnitConversion[], fromUnitId: unknown, toUnitId: unknown) {
  const from = Number(fromUnitId || 0);
  const to = Number(toUnitId || 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return null;
  if (from === to) return 1;

  const list = Array.isArray(unitConversions) ? unitConversions : [];
  const direct = list.find((item) => Number(item.from_unit_id || 0) === from && Number(item.to_unit_id || 0) === to);
  const directFactor = Number(direct?.factor);
  if (Number.isFinite(directFactor) && directFactor > 0) return directFactor;

  const inverse = list.find((item) => Number(item.from_unit_id || 0) === to && Number(item.to_unit_id || 0) === from);
  const inverseFactor = Number(inverse?.factor);
  if (Number.isFinite(inverseFactor) && inverseFactor > 0) return 1 / inverseFactor;
  return null;
}

export function parseVariantValueNumber(value: unknown) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function roundStockQty(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function getTierDiscountPercent(discountTiers: unknown, selectedIndex: number) {
  const tiers = Array.isArray(discountTiers) ? discountTiers : [];
  const tier = tiers.find((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return Number(row.sort_order) === selectedIndex;
  });
  const row = tier && typeof tier === 'object' ? tier as Record<string, unknown> : {};
  const discountPercent = Number(row.discount_percent || 0);
  return Number.isFinite(discountPercent) ? discountPercent : 0;
}

export function calculateVariantUnitPrice({
  basePrice,
  baseQty,
  baseUnitId,
  discountTiers,
  selectedIndex,
  unitConversions,
  variantUnitId,
  variantValue,
}: {
  basePrice: unknown;
  baseQty: unknown;
  baseUnitId: unknown;
  discountTiers?: unknown;
  selectedIndex: unknown;
  unitConversions: UnitConversion[];
  variantUnitId: unknown;
  variantValue: unknown;
}): VariantUnitPriceResult {
  const price = Number(basePrice || 0);
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const safeBaseQty = toPositiveQty(baseQty) || 1;
  const index = Number(selectedIndex);
  const numericValue = parseVariantValueNumber(variantValue);
  if (!Number.isFinite(index) || !Number.isFinite(numericValue) || numericValue <= 0) {
    return { missingConversion: false, quantityInBase: null, unitPrice: roundMoney(safePrice) };
  }

  const fromUnitId = Number(variantUnitId || 0);
  const toUnitId = Number(baseUnitId || 0);
  const needsConversion = Number.isFinite(fromUnitId) && Number.isFinite(toUnitId) && fromUnitId > 0 && toUnitId > 0 && fromUnitId !== toUnitId;
  const factor = needsConversion ? getUnitConversionFactor(unitConversions, fromUnitId, toUnitId) : 1;
  if (needsConversion && factor == null) {
    return { missingConversion: true, quantityInBase: null, unitPrice: roundMoney(safePrice) };
  }

  const quantityInBase = numericValue * Number(factor || 1);
  if (!Number.isFinite(quantityInBase) || quantityInBase <= 0) {
    return { missingConversion: false, quantityInBase: null, unitPrice: roundMoney(safePrice) };
  }

  let unitPrice = safePrice * (quantityInBase / safeBaseQty);
  const discountPercent = getTierDiscountPercent(discountTiers, index);
  if (discountPercent !== 0) unitPrice *= 1 - discountPercent / 100;

  return {
    missingConversion: false,
    quantityInBase: roundStockQty(quantityInBase),
    unitPrice: roundMoney(unitPrice),
  };
}

function getIngredientRequiredQtyInBase(row: Record<string, unknown>, unitConversions: UnitConversion[]) {
  const quantity = toPositiveQty(row.quantity ?? row.qty ?? row.default_qty ?? row.quantity_default);
  if (!(quantity > 0)) return 0;

  const fromUnitId = row.unit_id ?? row.unitId ?? row.ingredient_unit_id ?? row.ingredientUnitId;
  const toUnitId = row.ingredient_base_unit_id ?? row.ingredientBaseUnitId ?? row.base_unit_id ?? row.baseUnitId ?? row.stock_unit_id ?? row.stockUnitId;
  const factor = getUnitConversionFactor(unitConversions, fromUnitId, toUnitId);
  return factor == null ? quantity : Math.round(quantity * factor * 1000) / 1000;
}

function getPassportIngredientRequirements(passport: CatalogProductPassport, unitConversions: UnitConversion[]) {
  const configured = Array.isArray(passport.defaultConfig?.ingredients) ? passport.defaultConfig?.ingredients : [];
  const sourceIngredients = configured.length ? configured : (Array.isArray(passport.ingredients) ? passport.ingredients : []);
  return sourceIngredients
    .map((item): ProductStockRequirement | null => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      if (!row) return null;
      const productId = toPositiveId(row.ingredient_id ?? row.product_id ?? row.productId ?? row.id);
      const requiredQty = getIngredientRequiredQtyInBase(row, unitConversions);
      if (!productId || !(requiredQty > 0)) return null;
      const productName = String(row.ingredient_name || row.name || '').trim();
      return {
        productId,
        productName,
        requiredQty,
      };
    })
    .filter((item): item is ProductStockRequirement => !!item);
}

export function extractStockRowsFromCatalogPassports(
  passports: Record<string, CatalogProductPassport> | Map<number, CatalogProductPassport> | null | undefined,
  unitConversions: UnitConversion[] = [],
) {
  const rows: Record<string, unknown>[] = [];
  const entries = passports instanceof Map
    ? Array.from(passports.entries()).map(([id, passport]) => [String(id), passport] as const)
    : Object.entries(passports || {});

  entries.forEach(([, passport]) => {
    if (!passport?.product) return;
    const productRow = stockLevelFromProduct(passport.product);
    if (productRow) rows.push({ ...productRow, sourcePriority: 1 });
    const requirements = getPassportIngredientRequirements(passport, unitConversions);
    if (requirements.length) {
      rows.push({
        is_available: passport.product.is_available,
        product_id: passport.product.id,
        productId: passport.product.id,
        product_name: passport.product.name,
        productName: passport.product.name,
        qty: passport.product.stock_qty,
        requirements,
        sourcePriority: 2,
        stock_qty: passport.product.stock_qty,
      });
    }
  });

  return rows;
}

export function extractStockRowsFromMobileSnapshot(snapshot: MobileCatalogSnapshot | null | undefined, unitConversions: UnitConversion[] = []) {
  const rows: Record<string, unknown>[] = [];
  Object.values(snapshot?.productsByCategory || {}).forEach((products) => {
    (Array.isArray(products) ? products : []).forEach((product) => {
      const row = stockLevelFromProduct(product);
      if (row) rows.push({ ...row, sourcePriority: 1 });
    });
  });
  rows.push(...extractStockRowsFromCatalogPassports(snapshot?.productPassports || {}, unitConversions));
  return rows;
}

export function extractStockRowsFromFullPassports(passports: Record<string, FullProductPassport> | null | undefined): Record<string, unknown>[] {
  return Object.values(passports || {})
    .map((passport): Record<string, unknown> | null => {
      const productId = Number(passport?.product?.id || passport?.availability?.productId || passport?.availability?.product_id || 0);
      if (!Number.isFinite(productId) || productId <= 0) return null;
      const availability = passport.availability && typeof passport.availability === 'object' ? passport.availability : null;
      if (!availability) return null;
      return {
        ...availability,
        productId,
        product_id: productId,
        productName: passport.product?.name,
        product_name: passport.product?.name,
        sourcePriority: 4,
      };
    })
    .filter((row): row is Record<string, unknown> => !!row);
}

export function isAvailableValue(value: CatalogProduct['is_available'] | CatalogCombo['is_available']) {
  const text = String(value ?? '').trim().toLowerCase();
  return value === true || value === 1 || value === '1'
    || text === 'true' || text === 'yes' || text === 'on' || value == null;
}

function getExplicitAvailability(value: CatalogProduct['is_available'] | CatalogCombo['is_available']) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (value === true || value === 1 || value === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
  if (value === false || value === 0 || value === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return null;
}

export function isProductStockAvailable(product: CatalogProduct | null | undefined, stockLevels: Map<number, ProductStockLevel>) {
  if (!product) return false;
  const explicitAvailability = getExplicitAvailability(product.is_available);
  const entry = getStockLevelEntry(stockLevels, product.id);
  const stockAvailability = entry
    ? (
      entry.isAvailable !== undefined && entry.isAvailable !== null
        ? entry.isAvailable === true
        : (entry.qty === undefined || entry.qty === null ? true : Number(entry.qty) > 0)
    )
    : null;

  if (explicitAvailability === false || stockAvailability === false || entry?.canFulfill === false) return false;
  if (explicitAvailability === true) return true;
  if (stockAvailability !== null) return stockAvailability;

  const stockQty = getProductStockQty(product);
  if (hasExplicitProductStockQty(product) && stockQty !== null) return stockQty > 0;
  return true;
}

export function getAvailableStock(
  productId: unknown,
  stockLevels: Map<number, ProductStockLevel>,
  cartQty: number,
  product?: Pick<CatalogProduct, 'stock_qty'> | null,
) {
  const entry = getStockLevelEntry(stockLevels, productId);
  if (!entry) {
    if (!hasExplicitProductStockQty(product)) return Infinity;
    const fallbackQty = getProductStockQty(product);
    if (fallbackQty === null) return Infinity;
    return Math.max(0, Math.floor(Number(fallbackQty || 0)) - Math.max(0, Math.floor(Number(cartQty || 0))));
  }
  if (entry.isAvailable === false || entry.canFulfill === false) return 0;
  if (entry.maxQty !== undefined && entry.maxQty !== null) {
    return Math.max(0, Math.floor(Number(entry.maxQty || 0)) - Math.max(0, Math.floor(Number(cartQty || 0))));
  }
  if (entry.qty === null || entry.qty === undefined || entry.isUnlimited === true) return Infinity;
  const stockQty = Number(entry.qty);
  if (!Number.isFinite(stockQty)) return Infinity;
  return Math.max(0, Math.floor(stockQty) - Math.max(0, Math.floor(Number(cartQty || 0))));
}

export function getProductAvailabilityState(
  product: CatalogProduct,
  stockLevels: Map<number, ProductStockLevel>,
  quantity: number,
): ProductAvailabilityState {
  const cartQty = Math.max(0, Math.floor(Number(quantity || 0)));
  const hasKnownStock = Boolean(getStockLevelEntry(stockLevels, product.id))
    || Object.prototype.hasOwnProperty.call(product, 'is_available')
    || Object.prototype.hasOwnProperty.call(product, 'stock_qty');
  const stockAvailable = isProductStockAvailable(product, stockLevels);
  const remaining = getAvailableStock(product.id, stockLevels, cartQty, product);
  const stockQty = Number.isFinite(remaining) ? cartQty + remaining : getProductStockQty(product);
  const plusBlockedByLimit = stockAvailable && Number.isFinite(remaining) && remaining <= 0;
  return {
    availableForAdd: stockAvailable && !plusBlockedByLimit,
    cartQty,
    hasKnownStock,
    stockAvailable,
    stockQty: stockQty == null ? null : Number(stockQty),
  };
}
