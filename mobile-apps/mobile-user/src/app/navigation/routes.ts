export const routes = {
  home: 'home',
  catalog: 'catalog',
  product: 'product',
  cart: 'cart',
  orders: 'orders',
  profile: 'profile',
} as const;

export type AppRouteName = keyof typeof routes;
