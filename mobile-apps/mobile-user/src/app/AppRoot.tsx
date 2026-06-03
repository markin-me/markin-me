import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import type { MainTabParamList, RootStackParamList } from './navigation/routes';
import { routes } from './navigation/routes';
import { AddressFormPage } from '../pages/address-form';
import { AddressesPage } from '../pages/addresses';
import { CartPage } from '../pages/cart';
import { BonusProgramPage } from '../pages/bonus-program';
import { BonusCashbackPage } from '../pages/bonus-cashback';
import { BonusFavoriteCategoriesPage } from '../pages/bonus-favorite-categories';
import { BonusLevelsPage } from '../pages/bonus-levels';
import { BonusReferralsPage } from '../pages/bonus-referrals';
import { BonusTransactionsPage } from '../pages/bonus-transactions';
import { CatalogPage } from '../pages/catalog';
import { CategoriesPage } from '../pages/categories';
import { ChatPage } from '../pages/chat';
import { ComboPage } from '../pages/combo';
import { ComboReplacePage } from '../pages/combo-replace';
import { ProductPage } from '../pages/product';
import { ProfilePage } from '../pages/profile';
import { ProfileSettingsPage } from '../pages/profile-settings';
import { theme } from '../shared/config/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
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
          height: theme.sizes.tabBarHeight,
          paddingBottom: 8,
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
  return (
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
        <Stack.Screen name={routes.addresses} component={AddressesPage} options={{ title: 'Мои адреса' }} />
        <Stack.Screen name={routes.addressForm} component={AddressFormPage} options={{ title: 'Адрес' }} />
        <Stack.Screen name={routes.profileSettings} component={ProfileSettingsPage} options={{ title: 'Настройки профиля' }} />
        <Stack.Screen
          name={routes.comboReplace}
          component={ComboReplacePage}
          options={({ route }) => ({ title: route.params.blockTitle || 'Замена' })}
        />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
