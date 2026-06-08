import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StatusBar as NativeStatusBar } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainTabParamList, RootStackParamList } from './navigation/routes';
import { routes } from './navigation/routes';
import { StockProvider } from '../features/stock';
import { AddressFormPage } from '../pages/address-form';
import { AddressesPage } from '../pages/addresses';
import { CartPage } from '../pages/cart';
import { CheckoutPage } from '../pages/checkout';
import { BonusProgramPage } from '../pages/bonus-program';
import { BonusCashbackPage } from '../pages/bonus-cashback';
import { BonusFavoriteCategoriesPage } from '../pages/bonus-favorite-categories';
import { BonusLevelsPage } from '../pages/bonus-levels';
import { BonusReferralsPage } from '../pages/bonus-referrals';
import { BonusTransactionsPage } from '../pages/bonus-transactions';
import { BenefitsPage } from '../pages/benefits';
import { CatalogPage } from '../pages/catalog';
import { CategoriesPage } from '../pages/categories';
import { ChatPage } from '../pages/chat';
import { CitySelectPage } from '../pages/city-select';
import { ComboPage } from '../pages/combo';
import { ComboReplacePage } from '../pages/combo-replace';
import { DiscountsPage } from '../pages/discounts';
import { GiftsPage } from '../pages/gifts';
import { OrderDetailsPage } from '../pages/order-details';
import { OrdersPage } from '../pages/orders';
import { ProductPage } from '../pages/product';
import { ProfilePage } from '../pages/profile';
import { ProfileSettingsPage } from '../pages/profile-settings';
import { PromocodesPage } from '../pages/promocodes';
import { TasksPage } from '../pages/tasks';
import { getCartLineStockProductIds, readCartLines } from '../features/cart';
import { readCachedCustomerPassport, refreshCustomerPassport, warmFullProductPassports } from '../shared/api';
import { theme } from '../shared/config/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const BACKGROUND_TAB_WARMUP_DELAY_MS = 1500;

function collectCartWarmupProductIds(lines: Awaited<ReturnType<typeof readCartLines>>) {
  return Array.from(new Set(lines.flatMap((line) => getCartLineStockProductIds(line))));
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(0, insets.bottom);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginTop: 0,
        },
        tabBarStyle: {
          borderTopColor: theme.colors.border,
          height: theme.sizes.tabBarHeight + bottomInset,
          paddingBottom: 8 + bottomInset,
          paddingTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 0,
        },
      }}
    >
      <Tab.Screen
        name={routes.home}
        component={CatalogPage}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
          tabBarLabel: 'Каталог',
          title: 'Каталог',
        }}
      />
      <Tab.Screen
        name={routes.cart}
        component={CartPage}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />,
          tabBarLabel: 'Корзина',
          title: 'Корзина',
        }}
      />
      <Tab.Screen
        name={routes.chat}
        component={ChatPage}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />,
          tabBarLabel: 'Чат',
          title: 'Чат',
        }}
      />
      <Tab.Screen
        name={routes.profile}
        component={ProfilePage}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
          tabBarLabel: 'Профиль',
          title: 'Профиль',
        }}
      />
    </Tab.Navigator>
  );
}

export function AppRoot() {
  useEffect(() => {
    NativeStatusBar.setTranslucent(false);
    NativeStatusBar.setBackgroundColor(theme.colors.background);
    NativeStatusBar.setBarStyle('dark-content');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const [cartLines, passport] = await Promise.all([
          readCartLines().catch(() => []),
          readCachedCustomerPassport().catch(() => null),
        ]);
        if (cancelled) return;

        const cartProductIds = collectCartWarmupProductIds(cartLines);
        if (cartProductIds.length) {
          void warmFullProductPassports(cartProductIds).catch(() => null);
        }
        if (passport?.token) {
          void refreshCustomerPassport(passport.token, passport.customer).catch(() => null);
        }
      })().catch(() => null);
    }, BACKGROUND_TAB_WARMUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StockProvider>
        <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name={routes.product} component={ProductPage} options={{ title: 'Товар' }} />
        <Stack.Screen name={routes.categories} component={CategoriesPage} options={{ title: 'Категории' }} />
        <Stack.Screen name={routes.combo} component={ComboPage} options={{ title: 'Комбо' }} />
        <Stack.Screen name={routes.bonusProgram} component={BonusProgramPage} options={{ title: 'Бонусная программа' }} />
        <Stack.Screen name={routes.bonusTransactions} component={BonusTransactionsPage} options={{ title: 'Начисления' }} />
        <Stack.Screen name={routes.bonusCashback} component={BonusCashbackPage} options={{ title: 'Кэшбек' }} />
        <Stack.Screen name={routes.bonusFavoriteCategories} component={BonusFavoriteCategoriesPage} options={{ title: 'Выбрать категории' }} />
        <Stack.Screen name={routes.bonusLevels} component={BonusLevelsPage} options={{ title: 'Уровни' }} />
        <Stack.Screen name={routes.bonusReferrals} component={BonusReferralsPage} options={{ title: 'Рефералы' }} />
        <Stack.Screen name={routes.benefits} component={BenefitsPage} options={{ title: 'Выгоды' }} />
        <Stack.Screen name={routes.discounts} component={DiscountsPage} options={{ title: 'Скидки' }} />
        <Stack.Screen name={routes.gifts} component={GiftsPage} options={{ title: 'Подарки' }} />
        <Stack.Screen name={routes.promocodes} component={PromocodesPage} options={{ title: 'Промокоды' }} />
        <Stack.Screen name={routes.tasks} component={TasksPage} options={{ title: 'Задания' }} />
        <Stack.Screen name={routes.orders} component={OrdersPage} options={{ title: 'Мои заказы' }} />
        <Stack.Screen name={routes.orderDetails} component={OrderDetailsPage} options={{ headerShown: false }} />
        <Stack.Screen name={routes.checkout} component={CheckoutPage} options={{ title: 'Оформление заказа' }} />
        <Stack.Screen name={routes.addresses} component={AddressesPage} options={{ title: 'Мои адреса' }} />
        <Stack.Screen name={routes.addressForm} component={AddressFormPage} options={{ title: 'Адрес' }} />
        <Stack.Screen name={routes.citySelect} component={CitySelectPage} options={{ title: 'Город' }} />
        <Stack.Screen name={routes.profileSettings} component={ProfileSettingsPage} options={{ title: 'Настройки профиля' }} />
        <Stack.Screen
          name={routes.comboReplace}
          component={ComboReplacePage}
          options={({ route }) => ({ title: route.params.blockTitle || 'Замена' })}
        />
      </Stack.Navigator>
      <StatusBar backgroundColor={theme.colors.background} style="dark" translucent={false} />
        </NavigationContainer>
      </StockProvider>
    </SafeAreaProvider>
  );
}
