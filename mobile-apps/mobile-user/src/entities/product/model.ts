export type Product = {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
};

export type CatalogCategory = {
  id: number;
  code?: string;
  title: string;
  icon?: string | null;
  children?: CatalogCategory[];
  parent_id?: number | null;
  sort_order?: number | null;
};

export type CatalogDiscount = {
  discount_amount?: number;
  discount_type?: string;
  discount_value?: number;
};

export type CatalogBuyXGetYBadge = {
  badge_text?: string | null;
  buy_qty?: number | string | null;
  id?: number | string | null;
  is_stackable?: boolean | number | string | null;
  repeat_mode?: string | null;
  reward_qty?: number | string | null;
  title?: string | null;
};

export type CatalogProduct = {
  id: number;
  name: string;
  description?: string | null;
  description_short?: string | null;
  client_composition?: string | null;
  catalog_default_lines?: string[];
  price: number;
  display_price?: number | null;
  old_price?: number | null;
  original_price?: number | null;
  discounted_price?: number | null;
  nutrition_per_100g?: CatalogNutrition | null;
  nutrition_per_portion?: CatalogNutrition | null;
  nutrition_portion_grams?: number | null;
  photos?: string[];
  photo_thumb?: string | null;
  photo_lqip?: string | null;
  fulfillment_mode?: string | null;
  is_available?: boolean | number | string;
  stock_qty?: number | string | null;
  discount?: CatalogDiscount | null;
  buy_x_get_y_badge?: CatalogBuyXGetYBadge | null;
  category_ids?: number[];
  blocks_config?: {
    variants?: unknown;
    options?: unknown;
    ingredients?: unknown;
  } | null;
  default_variant?: {
    variant_label?: string | null;
  } | null;
  ingredients?: unknown[];
  options?: unknown[];
  variants?: unknown[];
};

export type CatalogNutrition = {
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
};

export type UnitConversion = {
  factor?: number | string | null;
  from_unit_id?: number | string | null;
  id?: number | string | null;
  is_active?: boolean | number | string | null;
  tenant_id?: number | string | null;
  to_unit_id?: number | string | null;
};

export type CatalogProductPassport = {
  product: CatalogProduct;
  ingredients?: unknown[];
  variants?: unknown[];
  optionAssignments?: unknown[];
  optionGroups?: unknown[];
  defaultConfig?: {
    option_item_ids?: number[];
    option_items?: unknown[];
    ingredients?: unknown[];
    ingredient_price_diff?: number;
    variant_group_id?: number | null;
    variant_value_index?: number | null;
    variant_label?: string;
    variant_unit_price?: number;
  } | null;
  updated_at?: string | null;
};

export type CatalogCombo = {
  id: number;
  category_id?: number | null;
  title: string;
  description?: string | null;
  discount_percent?: number | null;
  image_url?: string | null;
  image_thumb?: string | null;
  grid_photos?: string[];
  grid_photos_thumb?: string[];
  grid_photo_sets?: string[][];
  min_price?: number | null;
  is_available?: boolean | number | string;
  block_product_ids?: number[][];
};

export type CatalogComboProductPreview = {
  is_available?: boolean;
  variant_label?: string;
  variant_group_id?: number | null;
  variant_value_index?: number | null;
  variant_group_title?: string;
  variant_unit?: string;
  unit_id?: number | null;
  ingredients_display?: Array<{
    ingredient_id?: number;
    name?: string;
    quantity?: number;
    qty?: number;
    unit_id?: number | null;
    unit?: string;
  }>;
  hasConfigurable?: boolean;
  unit_price_before_discount?: number;
  unit_price_override?: number;
  variants?: unknown[];
  ingredients?: unknown[];
};

export type CatalogComboBlockProduct = {
  product_id: number;
  product_name: string;
  product_description_short?: string | null;
  price?: number | null;
  base_qty?: number | null;
  base_unit_id?: number | null;
  unit_id?: number | null;
  sort_order?: number | null;
  is_default?: boolean | number;
  is_available?: boolean | number | string;
  product_photo?: string | null;
  product_photos_json?: string[] | string | null;
  preview?: CatalogComboProductPreview | null;
};

export type CatalogComboBlock = {
  block_id: number;
  block_title: string;
  min_select?: number | null;
  max_select?: number | null;
  products: CatalogComboBlockProduct[];
};

export type CatalogComboDetails = CatalogCombo & {
  blocks: CatalogComboBlock[];
};

export type MobileCatalogSnapshot = {
  version: string;
  generated_at?: string;
  tenant_id?: number;
  store_id?: number;
  categories: CatalogCategory[];
  productsByCategory: Record<string, CatalogProduct[]>;
  combosByCategory: Record<string, CatalogCombo[]>;
  productPassports: Record<string, CatalogProductPassport>;
};
