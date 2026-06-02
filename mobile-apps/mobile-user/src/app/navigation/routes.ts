import type { NavigatorScreenParams } from '@react-navigation/native';

import type { CatalogCategory } from '../../entities/product';

export const routes = {
  home: 'home',
  product: 'product',
  combo: 'combo',
  comboReplace: 'comboReplace',
  categories: 'categories',
  cart: 'cart',
  chat: 'chat',
  profile: 'profile',
} as const;

export type AppRouteName = keyof typeof routes;

export type RootStackParamList = {
  main: NavigatorScreenParams<MainTabParamList> | undefined;
  product: { productId: number; comboId?: number; comboBlockIndex?: number; comboProductIndex?: number };
  combo: { comboId: number; openNonce?: number };
  comboReplace: { comboId: number; blockIndex: number; blockTitle?: string };
  categories: { categories: CatalogCategory[]; activeCategoryId?: number | null };
};

export type MainTabParamList = {
  home: { selectedCategoryId?: number } | undefined;
  cart: undefined;
  chat: undefined;
  profile: undefined;
};
