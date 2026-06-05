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
  profileSettings: 'profileSettings',
  bonusProgram: 'bonusProgram',
  bonusTransactions: 'bonusTransactions',
  bonusCashback: 'bonusCashback',
  bonusFavoriteCategories: 'bonusFavoriteCategories',
  bonusLevels: 'bonusLevels',
  bonusReferrals: 'bonusReferrals',
  orders: 'orders',
  orderDetails: 'orderDetails',
  addresses: 'addresses',
  addressForm: 'addressForm',
  citySelect: 'citySelect',
} as const;

export type AppRouteName = keyof typeof routes;

export type RootStackParamList = {
  main: NavigatorScreenParams<MainTabParamList> | undefined;
  product: { productId: number; comboId?: number; comboBlockIndex?: number; comboProductIndex?: number };
  combo: { comboId: number; openNonce?: number };
  comboReplace: { comboId: number; blockIndex: number; blockTitle?: string };
  categories: { categories: CatalogCategory[]; activeCategoryId?: number | null };
  profileSettings: undefined;
  bonusProgram: undefined;
  bonusTransactions: undefined;
  bonusCashback: undefined;
  bonusFavoriteCategories: undefined;
  bonusLevels: undefined;
  bonusReferrals: undefined;
  orders: undefined;
  orderDetails: { orderId: number };
  addresses: { selectedCity?: string } | undefined;
  addressForm: { addressId?: number; selectedCity?: string } | undefined;
  citySelect: { addressId?: number; returnTo: 'addresses' | 'addressForm'; selectedCity?: string };
};

export type MainTabParamList = {
  home: { selectedCategoryId?: number } | undefined;
  cart: undefined;
  chat: undefined;
  profile: undefined;
};
