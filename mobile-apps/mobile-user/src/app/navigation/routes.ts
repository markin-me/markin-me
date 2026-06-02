import type { NavigatorScreenParams } from '@react-navigation/native';

import type { CatalogCategory } from '../../entities/product';

export const routes = {
  home: 'home',
  product: 'product',
  categories: 'categories',
  cart: 'cart',
  chat: 'chat',
  profile: 'profile',
} as const;

export type AppRouteName = keyof typeof routes;

export type RootStackParamList = {
  main: NavigatorScreenParams<MainTabParamList> | undefined;
  product: { productId: number };
  categories: { categories: CatalogCategory[]; activeCategoryId?: number | null };
};

export type MainTabParamList = {
  home: { selectedCategoryId?: number } | undefined;
  cart: undefined;
  chat: undefined;
  profile: undefined;
};
