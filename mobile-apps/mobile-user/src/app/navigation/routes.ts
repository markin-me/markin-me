import type { NavigatorScreenParams } from '@react-navigation/native';

import type { CatalogCategory } from '../../entities/product';
import type { ImportantMessage } from '../../features/chat/types';

export const routes = {
  home: 'home',
  product: 'product',
  combo: 'combo',
  comboReplace: 'comboReplace',
  categories: 'categories',
  cart: 'cart',
  checkout: 'checkout',
  chat: 'chat',
  profile: 'profile',
  profileSettings: 'profileSettings',
  bonusProgram: 'bonusProgram',
  bonusTransactions: 'bonusTransactions',
  bonusCashback: 'bonusCashback',
  bonusFavoriteCategories: 'bonusFavoriteCategories',
  bonusLevels: 'bonusLevels',
  bonusReferrals: 'bonusReferrals',
  benefits: 'benefits',
  discounts: 'discounts',
  gifts: 'gifts',
  promocodes: 'promocodes',
  tasks: 'tasks',
  orders: 'orders',
  orderDetails: 'orderDetails',
  addresses: 'addresses',
  addressForm: 'addressForm',
  citySelect: 'citySelect',
  importantMessages: 'importantMessages',
  importantMessageDetails: 'importantMessageDetails',
  supportChat: 'supportChat',
} as const;

export type AppRouteName = keyof typeof routes;

export type RootStackParamList = {
  main: NavigatorScreenParams<MainTabParamList> | undefined;
  product: { cartLineId?: string; productId: number; comboId?: number; comboBlockIndex?: number; comboProductIndex?: number };
  combo: { cartLineId?: string; comboId: number; openNonce?: number };
  comboReplace: { comboId: number; blockIndex: number; blockTitle?: string };
  categories: { categories: CatalogCategory[]; activeCategoryId?: number | null };
  profileSettings: undefined;
  bonusProgram: undefined;
  bonusTransactions: undefined;
  bonusCashback: undefined;
  bonusFavoriteCategories: undefined;
  bonusLevels: undefined;
  bonusReferrals: undefined;
  benefits: { initialSection: 'promocodes' | 'discounts' | 'gifts' | 'tasks' };
  discounts: undefined;
  gifts: undefined;
  promocodes: undefined;
  tasks: undefined;
  orders: undefined;
  orderDetails: { orderId: number };
  checkout: undefined;
  addresses: { selectedCity?: string } | undefined;
  addressForm: { addressId?: number; selectedCity?: string } | undefined;
  citySelect: { addressId?: number; returnTo: 'addresses' | 'addressForm'; selectedCity?: string };
  importantMessages: undefined;
  supportChat: undefined;
};

export type ChatTabParamList = {
  chatHome: undefined;
  importantMessages: undefined;
  importantMessageDetails: { item?: ImportantMessage; itemId?: number };
  supportChat: undefined;
};

export type MainTabParamList = {
  home: { selectedCategoryId?: number } | undefined;
  cart: undefined;
  chat: NavigatorScreenParams<ChatTabParamList> | undefined;
  profile: undefined;
};
