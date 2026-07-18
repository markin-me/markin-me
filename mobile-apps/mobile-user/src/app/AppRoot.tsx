import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, createNavigationContainerRef, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, StatusBar as NativeStatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainTabParamList, RootStackParamList } from './navigation/routes';
import { routes } from './navigation/routes';
import { StockProvider, useProductStock } from '../features/stock';
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
import { ChatTabNavigator } from '../pages/chat';
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
import { readCartLines } from '../features/cart';
import { ChatPushProvider, ChatUnreadProvider, useChatUnread } from '../features/chat';
import { readFulfillmentSelection } from '../features/checkout';
import {
  readCachedCustomerPassport,
  readCachedMobileCatalogSnapshot,
} from '../shared/api';
import { theme } from '../shared/config/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function BootPreloadGate({ children }: { children: ReactNode }) {
  const { hydrateFromCache } = useProductStock();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function preload() {
      await hydrateFromCache().catch(() => null);

      await Promise.all([
        readCartLines().catch(() => []),
        readCachedCustomerPassport().catch(() => null),
        readFulfillmentSelection().catch(() => null),
        readCachedMobileCatalogSnapshot().catch(() => null),
      ]);
    }

    void preload()
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateFromCache]);

  if (!ready) {
    return (
      <View style={styles.bootPreload}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { totalUnread } = useChatUnread();
  const bottomInset = Math.max(0, insets.bottom);
  const baseTabBarStyle = {
    borderTopColor: theme.colors.border,
    height: theme.sizes.tabBarHeight + bottomInset,
    paddingBottom: 8 + bottomInset,
    paddingTop: 2,
  };

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
        tabBarStyle: baseTabBarStyle,
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
        component={ChatTabNavigator}
        options={({ route }) => {
          const nestedRouteName = getFocusedRouteNameFromRoute(route);
          const hideTabBar = nestedRouteName === routes.importantMessages
            || nestedRouteName === routes.importantMessageDetails
            || nestedRouteName === routes.supportChat;
          return {
            tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: '#22c55e',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: '800',
            },
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />,
            tabBarLabel: 'Сообщения',
            tabBarStyle: hideTabBar
              ? {
                display: 'none',
              }
              : baseTabBarStyle,
            title: 'Сообщения',
          };
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
  const pendingPushRouteRef = useRef<'importantMessages' | 'supportChat' | ''>('');

  useEffect(() => {
    NativeStatusBar.setTranslucent(false);
    NativeStatusBar.setBackgroundColor(theme.colors.background);
    NativeStatusBar.setBarStyle('dark-content');
  }, []);

  const navigateToPushTarget = useCallback((target: 'importantMessages' | 'supportChat') => {
    if (!navigationRef.isReady()) {
      pendingPushRouteRef.current = target;
      return;
    }
    navigationRef.navigate('main', {
      screen: routes.chat,
      params: {
        screen: target === 'importantMessages' ? routes.importantMessages : routes.supportChat,
      },
    });
  }, []);

  const handlePushNotificationPress = useCallback((data: Record<string, unknown>) => {
    const type = String(data.type || data.kind || data.route || data.target || '').toLowerCase();
    const url = String(data.url || '').toLowerCase();
    if (
      type.includes('important')
      || type.includes('company')
      || type.includes('message_center')
      || url.includes('important')
      || data.open_important_messages === true
    ) {
      navigateToPushTarget('importantMessages');
      return;
    }
    if (type === 'chat_message' || data.open_chat === true || url.includes('chat')) {
      navigateToPushTarget('supportChat');
    }
  }, [navigateToPushTarget]);

  const handleNavigationReady = useCallback(() => {
    const target = pendingPushRouteRef.current;
    if (!target) return;
    pendingPushRouteRef.current = '';
    navigateToPushTarget(target);
  }, [navigateToPushTarget]);

  return (
    <SafeAreaProvider>
      <StockProvider>
        <BootPreloadGate>
        <ChatPushProvider onNotificationPress={handlePushNotificationPress}>
        <ChatUnreadProvider>
        <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
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
        </ChatUnreadProvider>
        </ChatPushProvider>
        </BootPreloadGate>
      </StockProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootPreload: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
