import type { CatalogCategory, CatalogCombo, CatalogProduct } from '../../entities/product';
import { theme } from '../../shared/config/theme';

export type CatalogCardItem =
  | { cardKey: string; categoryId: number; product: CatalogProduct; type: 'product' }
  | { cardKey: string; categoryId: number; combo: CatalogCombo; type: 'combo' };

export type CatalogCategoryCount = {
  combo_count: number;
  product_count: number;
  total_count: number;
};

export type CatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type CatalogListItem =
  | { itemKey: string; type: 'delivery' }
  | { itemKey: string; type: 'categories' }
  | { categoryId: number; itemKey: string; title: string; type: 'header' }
  | { categoryId: number; children: CatalogCategory[]; itemKey: string; type: 'subcategories' }
  | { cards: CatalogCardItem[]; categoryId: number; itemKey: string; rowIndex: number; type: 'row' }
  | { categoryId: number; itemKey: string; state?: 'empty' | 'error'; type: 'empty' }
  | { categoryId: number; itemKey: string; rowIndex: number; type: 'skeleton' };

export type CatalogItemLayout = {
  index: number;
  length: number;
  offset: number;
};

export type CatalogLayoutState = {
  combosByCategory: Map<number, CatalogCombo[]>;
  productsByCategory: Map<number, CatalogProduct[]>;
};

export type BuildCatalogListItemsOptions = {
  categories: CatalogCategory[];
  categoryCounts: Record<string, CatalogCategoryCount>;
  catalog: CatalogLayoutState;
  fallbackSkeletonRows: number;
  loadStates: Record<string, CatalogLoadStatus>;
};

export type BuildCatalogItemLayoutsOptions = {
  categoriesHeight: number;
  deliveryHeight: number;
  items: CatalogListItem[];
  screenWidth: number;
  subcategoriesHeight: number;
};

function getCategoryLoadStatus(loadStates: Record<string, CatalogLoadStatus>, categoryId: number) {
  return loadStates[String(categoryId)] || 'idle';
}

function getExpectedRowCount(
  categoryId: number,
  categoryCounts: Record<string, CatalogCategoryCount>,
  fallbackSkeletonRows: number,
) {
  const count = categoryCounts[String(categoryId)];
  const totalCount = Math.max(0, Number(count?.total_count || 0));
  if (totalCount > 0) return Math.ceil(totalCount / 2);
  return Math.max(1, fallbackSkeletonRows);
}

export function buildCatalogListItems({
  categories,
  categoryCounts,
  catalog,
  fallbackSkeletonRows,
  loadStates,
}: BuildCatalogListItemsOptions) {
  const items: CatalogListItem[] = [
    { itemKey: 'delivery', type: 'delivery' },
    { itemKey: 'categories', type: 'categories' },
  ];
  const categoryIndexById = new Map<number, number>();

  categories.forEach((category) => {
    const categoryId = Number(category.id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return;

    categoryIndexById.set(categoryId, items.length);
    items.push({
      categoryId,
      itemKey: `category-${categoryId}-header`,
      title: category.title,
      type: 'header',
    });

    const children = Array.isArray(category.children)
      ? category.children.filter((child) => Number(child.id) > 0)
      : [];
    if (children.length) {
      items.push({
        categoryId,
        children,
        itemKey: `category-${categoryId}-subcategories`,
        type: 'subcategories',
      });
    }

    const loadStatus = getCategoryLoadStatus(loadStates, categoryId);
    const products = catalog.productsByCategory.get(categoryId) || [];
    const combos = catalog.combosByCategory.get(categoryId) || [];
    const cards: CatalogCardItem[] = [
      ...products.map((product) => ({
        cardKey: `product-${categoryId}-${product.id}`,
        categoryId,
        product,
        type: 'product' as const,
      })),
      ...combos.map((combo) => ({
        cardKey: `combo-${categoryId}-${combo.id}`,
        categoryId,
        combo,
        type: 'combo' as const,
      })),
    ];

    if (!cards.length) {
      if (loadStatus === 'loaded' || loadStatus === 'error') {
        items.push({
          categoryId,
          itemKey: `category-${categoryId}-empty`,
          state: loadStatus === 'error' ? 'error' : 'empty',
          type: 'empty',
        });
        return;
      }

      const rowCount = getExpectedRowCount(categoryId, categoryCounts, fallbackSkeletonRows);
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        items.push({
          categoryId,
          itemKey: `category-${categoryId}-row-${rowIndex}`,
          rowIndex,
          type: 'skeleton',
        });
      }
      return;
    }

    const loadedRowCount = Math.ceil(cards.length / 2);
    for (let rowIndex = 0; rowIndex < loadedRowCount; rowIndex += 1) {
      const cardIndex = rowIndex * 2;
      items.push({
        cards: cards.slice(cardIndex, cardIndex + 2),
        categoryId,
        itemKey: `category-${categoryId}-row-${rowIndex}`,
        rowIndex,
        type: 'row',
      });
    }
  });

  return { categoryIndexById, items };
}

export function buildCatalogItemLayouts({
  categoriesHeight,
  deliveryHeight,
  items,
  screenWidth,
  subcategoriesHeight,
}: BuildCatalogItemLayoutsOptions) {
  const contentWidth = Math.max(0, screenWidth - theme.spacing.lg * 2);
  const cardWidth = contentWidth * 0.48;
  const rowLength = Math.ceil(cardWidth / 0.56 + theme.spacing.md);
  const headerLength = 44;
  const emptyLength = 38;
  const layouts: CatalogItemLayout[] = [];
  let offset = 0;

  items.forEach((item, index) => {
    const length = item.type === 'row' || item.type === 'skeleton'
      ? rowLength
      : item.type === 'header'
        ? headerLength
        : item.type === 'subcategories'
          ? subcategoriesHeight
          : item.type === 'delivery'
            ? deliveryHeight
            : item.type === 'categories'
              ? categoriesHeight
              : emptyLength;
    layouts[index] = { index, length, offset };
    offset += length;
  });

  return layouts;
}
