import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  NavigationContainer,
  createNavigationContainerRef,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Platform,
  StyleSheet,
  StatusBar as NativeStatusBar,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatTabParamList, MainTabParamList, RootStackParamList } from './navigation/routes';
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
import { ChatPage, ChatTabNavigator } from '../pages/chat';
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

function getAndroidApiVersion() {
  const version = Number(Platform.Version);
  if (Number.isFinite(version)) return version;
  const parsed = parseInt(String(Platform.Version || ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const SUPPORT_CHAT_ANDROID_V33_TRANSITION = Platform.OS === 'android' && getAndroidApiVersion() >= 33;
const SUPPORT_CHAT_TRANSITION_MS = Platform.select({
  android: SUPPORT_CHAT_ANDROID_V33_TRANSITION ? 450 : 200,
  ios: 500,
  default: 450,
});
const SUPPORT_CHAT_CARD_OFFSET_RATIO = Platform.OS === 'android'
  ? (SUPPORT_CHAT_ANDROID_V33_TRANSITION ? 0.1 : 0)
  : 1;
const SUPPORT_CHAT_UNDERLAY_OFFSET_RATIO = Platform.OS === 'android'
  ? (SUPPORT_CHAT_ANDROID_V33_TRANSITION ? 0.1 : 0)
  : 0.3;
const SUPPORT_CHAT_CARD_CLOSED_SCALE = Platform.OS === 'android' && !SUPPORT_CHAT_ANDROID_V33_TRANSITION ? 0.85 : 1;
const SUPPORT_CHAT_UNDERLAY_OPEN_SCALE = Platform.OS === 'android' && !SUPPORT_CHAT_ANDROID_V33_TRANSITION ? 1.15 : 1;
const SUPPORT_CHAT_CARD_OPACITY_INPUT_RANGE = Platform.OS === 'android'
  ? (SUPPORT_CHAT_ANDROID_V33_TRANSITION ? [0, 50 / 450, 133 / 450, 1] : [0, 0.5, 1])
  : [0, 1];
const SUPPORT_CHAT_CARD_OPACITY_OUTPUT_RANGE = Platform.OS === 'android'
  ? (SUPPORT_CHAT_ANDROID_V33_TRANSITION ? [0, 0, 1, 1] : [0, 0, 1])
  : [1, 1];
const SUPPORT_CHAT_UNDERLAY_OPACITY_INPUT_RANGE = Platform.OS === 'android' && !SUPPORT_CHAT_ANDROID_V33_TRANSITION
  ? [0, 0.5, 1]
  : [0, 1];
const SUPPORT_CHAT_UNDERLAY_OPACITY_OUTPUT_RANGE = Platform.OS === 'android' && !SUPPORT_CHAT_ANDROID_V33_TRANSITION
  ? [1, 1, 0.4]
  : [1, 1];
const supportChatTransitionEasing = Platform.OS === 'android'
  ? (SUPPORT_CHAT_ANDROID_V33_TRANSITION ? Easing.bezier(0.05, 0.7, 0.1, 1) : Easing.inOut(Easing.ease))
  : Easing.out(Easing.cubic);

type PushTarget =
  | { screen: 'importantMessages'; importantMessageId?: number }
  | { screen: 'supportChat' };

function getImportantMessagePushId(data: Record<string, unknown>) {
  const value = data.important_message_id
    ?? data.importantMessageId
    ?? data.promo_message_id
    ?? data.promoMessageId;
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
}

function isChatOrPromoNotificationData(data: Record<string, unknown>) {
  const type = String(data.type || data.kind || data.route || data.target || '').toLowerCase();
  const url = String(data.url || '').toLowerCase();
  return type.includes('chat')
    || type.includes('important')
    || type.includes('promo')
    || type.includes('message_center')
    || url.includes('chat')
    || url.includes('important')
    || url.includes('promo')
    || data.open_chat === true
    || data.open_important_messages === true
    || data.open_promo_messages === true;
}

async function clearUnreadAppIconIndicator() {
  await Notifications.setBadgeCountAsync(0).catch(() => null);
  const notifications = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(notifications
    .filter((notification) => {
      const data = notification.request.content.data;
      return data && typeof data === 'object' && isChatOrPromoNotificationData(data as Record<string, unknown>);
    })
    .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => null)));
}

function getChatStackParams(target: PushTarget): MainTabParamList['chat'] {
  const chatRoutes: Array<{ name: keyof ChatTabParamList; params?: ChatTabParamList[keyof ChatTabParamList] }> = [
    { name: 'chatHome' },
  ];

  if (target.screen === 'importantMessages') {
    chatRoutes.push({ name: routes.importantMessages });
    const importantMessageId = Number(target.importantMessageId || 0);
    if (importantMessageId > 0) {
      chatRoutes.push({
        name: routes.importantMessageDetails,
        params: { itemId: importantMessageId },
      });
    }
  }

  return {
    state: {
      index: chatRoutes.length - 1,
      routes: chatRoutes,
    },
  } as MainTabParamList['chat'];
}

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

function ChatPushUnreadBridge({
  children,
  onNotificationPress,
}: {
  children: ReactNode;
  onNotificationPress: (data: Record<string, unknown>) => void;
}) {
  const { refreshUnread } = useChatUnread();
  const handleNotificationReceived = useCallback((data: Record<string, unknown>) => {
    if (isChatOrPromoNotificationData(data)) refreshUnread();
  }, [refreshUnread]);

  return (
    <ChatPushProvider
      onNotificationPress={onNotificationPress}
      onNotificationReceived={handleNotificationReceived}
    >
      {children}
    </ChatPushProvider>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { totalUnread } = useChatUnread();
  const previousTotalUnreadRef = useRef(totalUnread);
  const supportChatTranslateProgress = useRef(new Animated.Value(0)).current;
  const supportChatAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const supportChatAnimationFrameRef = useRef<number | null>(null);
  const supportChatDeactivateFrameRef = useRef<number | null>(null);
  const supportChatAnimationRunRef = useRef(0);
  const supportChatOpenRef = useRef(false);
  const [supportChatVisible, setSupportChatVisible] = useState(false);
  const [supportChatActive, setSupportChatActive] = useState(false);
  const [supportChatInteractive, setSupportChatInteractive] = useState(false);
  const bottomInset = Math.max(0, insets.bottom);
  const baseTabBarStyle = {
    borderTopColor: theme.colors.border,
    height: theme.sizes.tabBarHeight + bottomInset,
    paddingBottom: 8 + bottomInset,
    paddingTop: 2,
  };

  useEffect(() => {
    const previousTotalUnread = previousTotalUnreadRef.current;
    previousTotalUnreadRef.current = totalUnread;
    if (Platform.OS === 'web' || totalUnread > 0 || previousTotalUnread <= 0) return;
    void clearUnreadAppIconIndicator();
  }, [totalUnread]);

  const supportChatCardOffset = Math.max(0, windowWidth * SUPPORT_CHAT_CARD_OFFSET_RATIO);
  const supportChatUnderlayOffset = Math.max(0, windowWidth * SUPPORT_CHAT_UNDERLAY_OFFSET_RATIO);
  const supportChatUnderlayAnimatedStyle = useMemo(() => ({
    opacity: supportChatTranslateProgress.interpolate({
      inputRange: SUPPORT_CHAT_UNDERLAY_OPACITY_INPUT_RANGE,
      outputRange: SUPPORT_CHAT_UNDERLAY_OPACITY_OUTPUT_RANGE,
    }),
    transform: [
      {
        translateX: supportChatTranslateProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -supportChatUnderlayOffset],
        }),
      },
      {
        scale: supportChatTranslateProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, SUPPORT_CHAT_UNDERLAY_OPEN_SCALE],
        }),
      },
    ],
  }), [supportChatTranslateProgress, supportChatUnderlayOffset]);
  const supportChatOverlayCardAnimatedStyle = useMemo(() => ({
    opacity: supportChatTranslateProgress.interpolate({
      inputRange: SUPPORT_CHAT_CARD_OPACITY_INPUT_RANGE,
      outputRange: SUPPORT_CHAT_CARD_OPACITY_OUTPUT_RANGE,
    }),
    transform: [
      {
        translateX: supportChatTranslateProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [supportChatCardOffset, 0],
        }),
      },
      {
        scale: supportChatTranslateProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [SUPPORT_CHAT_CARD_CLOSED_SCALE, 1],
        }),
      },
    ],
  }), [supportChatCardOffset, supportChatTranslateProgress]);

  const stopSupportChatAnimation = useCallback(() => {
    if (supportChatAnimationFrameRef.current != null) {
      cancelAnimationFrame(supportChatAnimationFrameRef.current);
      supportChatAnimationFrameRef.current = null;
    }
    if (supportChatDeactivateFrameRef.current != null) {
      cancelAnimationFrame(supportChatDeactivateFrameRef.current);
      supportChatDeactivateFrameRef.current = null;
    }
    supportChatAnimationRef.current?.stop();
    supportChatAnimationRef.current = null;
    supportChatTranslateProgress.stopAnimation();
  }, [supportChatTranslateProgress]);

  const openSupportChat = useCallback(() => {
    if (supportChatOpenRef.current) return;
    supportChatOpenRef.current = true;
    supportChatAnimationRunRef.current += 1;
    const runId = supportChatAnimationRunRef.current;
    setSupportChatVisible(true);
    setSupportChatActive(true);
    setSupportChatInteractive(true);
    stopSupportChatAnimation();
    supportChatAnimationFrameRef.current = requestAnimationFrame(() => {
      supportChatAnimationFrameRef.current = null;
      if (supportChatAnimationRunRef.current !== runId || !supportChatOpenRef.current) return;
      const animation = Animated.timing(supportChatTranslateProgress, {
        duration: SUPPORT_CHAT_TRANSITION_MS,
        easing: supportChatTransitionEasing,
        toValue: 1,
        useNativeDriver: true,
      });
      supportChatAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (supportChatAnimationRef.current === animation) supportChatAnimationRef.current = null;
        if (!finished || supportChatAnimationRunRef.current !== runId || !supportChatOpenRef.current) return;
        setSupportChatActive(true);
      });
    });
  }, [
    stopSupportChatAnimation,
    supportChatTranslateProgress,
  ]);

  const closeSupportChat = useCallback(() => {
    if (!supportChatOpenRef.current && !supportChatVisible) return;
    supportChatOpenRef.current = false;
    supportChatAnimationRunRef.current += 1;
    const runId = supportChatAnimationRunRef.current;
    setSupportChatInteractive(false);
    setSupportChatVisible(false);
    requestAnimationFrame(() => Keyboard.dismiss());
    stopSupportChatAnimation();
    const animation = Animated.timing(supportChatTranslateProgress, {
      duration: SUPPORT_CHAT_TRANSITION_MS,
      easing: supportChatTransitionEasing,
      toValue: 0,
      useNativeDriver: true,
    });
    supportChatAnimationRef.current = animation;
    animation.start(() => {
      if (supportChatAnimationRef.current === animation) supportChatAnimationRef.current = null;
      if (supportChatAnimationRunRef.current === runId && !supportChatOpenRef.current) {
        supportChatDeactivateFrameRef.current = requestAnimationFrame(() => {
          supportChatDeactivateFrameRef.current = null;
          if (supportChatAnimationRunRef.current === runId && !supportChatOpenRef.current) {
            setSupportChatActive(false);
          }
        });
      }
    });
  }, [
    stopSupportChatAnimation,
    supportChatTranslateProgress,
    supportChatVisible,
  ]);

  useEffect(() => {
    if (!supportChatVisible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSupportChat();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [closeSupportChat, supportChatVisible]);

  useEffect(() => () => {
    stopSupportChatAnimation();
  }, [stopSupportChatAnimation]);

  return (
    <View style={styles.mainTabsRoot}>
    <Animated.View style={[styles.mainTabsContent, supportChatUnderlayAnimatedStyle]}>
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
          options={({ route }) => {
            const nestedRouteName = getFocusedRouteNameFromRoute(route);
            const hideTabBar = nestedRouteName === routes.importantMessages
              || nestedRouteName === routes.importantMessageDetails;
            return {
              tabBarIcon: ({ color, size }) => (
                <View style={styles.tabIconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
                  {totalUnread > 0 ? <View style={styles.tabUnreadDot} /> : null}
                </View>
              ),
              tabBarLabel: 'Сообщения',
              tabBarStyle: hideTabBar
                ? {
                  display: 'none',
                }
                : baseTabBarStyle,
              title: 'Сообщения',
            };
          }}
        >
          {() => <ChatTabNavigator onOpenSupportChat={openSupportChat} />}
        </Tab.Screen>
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
    </Animated.View>
    <Animated.View
      accessibilityElementsHidden={!supportChatInteractive}
      importantForAccessibility={supportChatInteractive ? 'auto' : 'no-hide-descendants'}
      pointerEvents={supportChatInteractive ? 'auto' : 'none'}
      style={[
        styles.supportChatOverlay,
        supportChatVisible ? styles.supportChatOverlayVisible : styles.supportChatOverlayHidden,
      ]}
    >
      <Animated.View style={[styles.supportChatOverlayCard, supportChatOverlayCardAnimatedStyle]}>
        <ChatPage active={supportChatActive} onBack={closeSupportChat} />
      </Animated.View>
    </Animated.View>
  </View>
  );
}

export function AppRoot() {
  const pendingPushRouteRef = useRef<PushTarget | null>(null);

  useEffect(() => {
    NativeStatusBar.setTranslucent(false);
    NativeStatusBar.setBackgroundColor(theme.colors.background);
    NativeStatusBar.setBarStyle('dark-content');
  }, []);

  const navigateToPushTarget = useCallback((target: PushTarget) => {
    if (!navigationRef.isReady()) {
      pendingPushRouteRef.current = target;
      return;
    }
    if (target.screen === 'supportChat') {
      navigationRef.navigate(routes.supportChat);
      return;
    }
    navigationRef.navigate('main', {
      screen: routes.chat,
      params: getChatStackParams(target),
    });
  }, []);

  const handlePushNotificationPress = useCallback((data: Record<string, unknown>) => {
    const type = String(data.type || data.kind || data.route || data.target || '').toLowerCase();
    const url = String(data.url || '').toLowerCase();
    if (
      type.includes('important')
      || type.includes('promo')
      || type.includes('company')
      || type.includes('message_center')
      || url.includes('important')
      || url.includes('promo')
      || data.open_important_messages === true
      || data.open_promo_messages === true
    ) {
      navigateToPushTarget({
        screen: 'importantMessages',
        importantMessageId: getImportantMessagePushId(data),
      });
      return;
    }
    if (type === 'chat_message' || data.open_chat === true || url.includes('chat')) {
      navigateToPushTarget({ screen: 'supportChat' });
    }
  }, [navigateToPushTarget]);

  const handleNavigationReady = useCallback(() => {
    const target = pendingPushRouteRef.current;
    if (!target) return;
    pendingPushRouteRef.current = null;
    navigateToPushTarget(target);
  }, [navigateToPushTarget]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
      <StockProvider>
        <BootPreloadGate>
        <ChatUnreadProvider>
        <ChatPushUnreadBridge onNotificationPress={handlePushNotificationPress}>
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
        <Stack.Screen name={routes.supportChat} component={ChatPage} options={{ animation: 'none', headerShown: false }} />
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
        </ChatPushUnreadBridge>
        </ChatUnreadProvider>
        </BootPreloadGate>
      </StockProvider>
      </KeyboardProvider>
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
  mainTabsRoot: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mainTabsContent: {
    flex: 1,
  },
  supportChatOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  supportChatOverlayCard: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  supportChatOverlayHidden: {
    opacity: 0,
    zIndex: -1,
  },
  supportChatOverlayVisible: {
    zIndex: 50,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabUnreadDot: {
    backgroundColor: '#ef4444',
    borderColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: -4,
    top: -3,
    width: 12,
  },
});
