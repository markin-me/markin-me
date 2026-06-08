import type { CatalogProduct, CatalogProductPassport } from './model';

export type FullProductAvailabilityRequirement = {
  product_id?: number | null;
  productId?: number | null;
  product_name?: string | null;
  productName?: string | null;
  required_qty?: number | null;
  requiredQty?: number | null;
  available_qty?: number | null;
  availableQty?: number | null;
  remaining_qty?: number | null;
  remainingQty?: number | null;
  is_unlimited?: boolean | null;
  isUnlimited?: boolean | null;
  can_fulfill?: boolean | null;
  canFulfill?: boolean | null;
  error?: string | null;
};

export type FullProductAvailability = {
  product_id?: number | null;
  productId?: number | null;
  stock_qty?: number | null;
  qty?: number | null;
  is_available?: boolean | null;
  isAvailable?: boolean | null;
  is_unlimited?: boolean | null;
  isUnlimited?: boolean | null;
  max_qty?: number | null;
  maxQty?: number | null;
  remaining_qty?: number | null;
  remainingQty?: number | null;
  requirements: FullProductAvailabilityRequirement[];
  error?: string | null;
} & Record<string, unknown>;

export type FullProductPassport = {
  product: CatalogProduct & Record<string, unknown>;
  units: Record<string, unknown>;
  unitConversions: unknown[];
  productUnitLinks: unknown[];
  stock: Record<string, unknown>;
  availability: FullProductAvailability;
  ingredients: unknown[];
  nestedIngredients: Record<string, unknown[]>;
  variants: unknown[];
  options: unknown[];
  optionAssignments?: unknown[];
  defaultConfig?: Record<string, unknown> | null;
  comboRefs: unknown[];
  benefits: Record<string, unknown>;
  texts: Record<string, unknown>;
  visibility: Record<string, unknown>;
  nutrition: Record<string, unknown>;
  revision: {
    updated_at?: string | null;
    revision?: string | null;
    data_version?: string | null;
  } & Record<string, unknown>;
};

export type FullProductPassportsPayload = {
  data: Record<string, FullProductPassport>;
  versions?: Record<string, string | null>;
};

function normalizeFullProductAvailability(value: unknown): FullProductAvailability {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...source,
    requirements: Array.isArray(source.requirements)
      ? source.requirements.filter((item): item is FullProductAvailabilityRequirement => Boolean(item && typeof item === 'object'))
      : [],
  };
}

export function normalizeFullProductPassport(value: unknown): FullProductPassport | null {
  const source = value && typeof value === 'object' ? value as Partial<FullProductPassport> : null;
  const product = source?.product && typeof source.product === 'object'
    ? source.product as CatalogProduct & Record<string, unknown>
    : null;
  const id = Number(product?.id || 0);
  if (!source || !product || !Number.isFinite(id) || id <= 0) return null;

  return {
    product,
    units: source.units && typeof source.units === 'object' ? source.units : {},
    unitConversions: Array.isArray(source.unitConversions) ? source.unitConversions : [],
    productUnitLinks: Array.isArray(source.productUnitLinks) ? source.productUnitLinks : [],
    stock: source.stock && typeof source.stock === 'object' ? source.stock : {},
    availability: normalizeFullProductAvailability(source.availability),
    ingredients: Array.isArray(source.ingredients) ? source.ingredients : [],
    nestedIngredients: source.nestedIngredients && typeof source.nestedIngredients === 'object' ? source.nestedIngredients : {},
    variants: Array.isArray(source.variants) ? source.variants : [],
    options: Array.isArray(source.options) ? source.options : [],
    optionAssignments: Array.isArray(source.optionAssignments) ? source.optionAssignments : [],
    defaultConfig: source.defaultConfig && typeof source.defaultConfig === 'object' ? source.defaultConfig : null,
    comboRefs: Array.isArray(source.comboRefs) ? source.comboRefs : [],
    benefits: source.benefits && typeof source.benefits === 'object' ? source.benefits : {},
    texts: source.texts && typeof source.texts === 'object' ? source.texts : {},
    visibility: source.visibility && typeof source.visibility === 'object' ? source.visibility : {},
    nutrition: source.nutrition && typeof source.nutrition === 'object' ? source.nutrition : {},
    revision: source.revision && typeof source.revision === 'object' ? source.revision : {},
  };
}

export function normalizeFullProductPassportMap(value: unknown): Record<string, FullProductPassport> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: Record<string, FullProductPassport> = {};

  Object.entries(source).forEach(([key, entry]) => {
    const passport = normalizeFullProductPassport(entry);
    if (!passport) return;
    const id = Number(passport.product.id || key);
    if (Number.isFinite(id) && id > 0) result[String(id)] = passport;
  });

  return result;
}

export function catalogPassportFromFullProductPassport(passport: FullProductPassport | null | undefined): CatalogProductPassport | null {
  if (!passport?.product) return null;
  return {
    product: passport.product,
    ingredients: passport.ingredients,
    variants: passport.variants,
    optionAssignments: Array.isArray(passport.optionAssignments) ? passport.optionAssignments : [],
    optionGroups: passport.options,
    defaultConfig: passport.defaultConfig && typeof passport.defaultConfig === 'object'
      ? {
        ingredient_price_diff: Number(passport.defaultConfig.ingredient_price_diff || 0),
        ingredients: Array.isArray(passport.defaultConfig.ingredients) ? passport.defaultConfig.ingredients : [],
        option_item_ids: Array.isArray(passport.defaultConfig.option_item_ids) ? passport.defaultConfig.option_item_ids as number[] : [],
        option_items: Array.isArray(passport.defaultConfig.option_items) ? passport.defaultConfig.option_items : [],
        variant_group_id: passport.defaultConfig.variant_group_id == null ? null : Number(passport.defaultConfig.variant_group_id),
        variant_label: String(passport.defaultConfig.variant_label || ''),
        variant_unit_price: Number(passport.defaultConfig.variant_unit_price || 0),
        variant_value_index: passport.defaultConfig.variant_value_index == null ? null : Number(passport.defaultConfig.variant_value_index),
      }
      : null,
    updated_at: passport.revision?.updated_at || passport.revision?.revision || null,
  };
}
