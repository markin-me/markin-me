import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatTabParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { useChatUnread } from '../../features/chat';
import { fetchImportantMessages, resolveChatAssetUrl } from '../../features/chat/api';
import type { ImportantMessage } from '../../features/chat/types';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { AppHeader } from '../../widgets/app-header';

type DetailsRoute = RouteProp<ChatTabParamList, typeof routes.importantMessageDetails>;

function isPromoRouteActive(navigation: NativeStackNavigationProp<ChatTabParamList>) {
  const state = navigation.getState();
  const routeName = state.routes[state.index]?.name;
  return routeName === routes.importantMessages || routeName === routes.importantMessageDetails;
}

export function ImportantMessageDetailsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabParamList>>();
  const route = useRoute<DetailsRoute>();
  const insets = useSafeAreaInsets();
  const { markPromoRead } = useChatUnread();
  const routeItem = route.params?.item || null;
  const routeItemId = Number(route.params?.itemId || routeItem?.id || 0);
  const [loadedItem, setLoadedItem] = useState<ImportantMessage | null>(routeItem);
  const [loading, setLoading] = useState(!routeItem && routeItemId > 0);
  const [error, setError] = useState('');
  const item = loadedItem;
  const imageUrl = item ? resolveChatAssetUrl(item.image_url || '') : '';
  const promoCode = item ? String(item.promo_code || '').trim() : '';
  const linkUrl = item ? String(item.link_url || '').trim() : '';
  const scrollY = useRef(new Animated.Value(0)).current;
  const imageTranslateY = useMemo(() => Animated.multiply(scrollY, 4 / 5), [scrollY]);
  const baseTabBarStyle = useMemo(() => {
    const bottomInset = Math.max(0, insets.bottom);
    return {
      borderTopColor: theme.colors.border,
      height: theme.sizes.tabBarHeight + bottomInset,
      paddingBottom: 8 + bottomInset,
      paddingTop: 2,
    };
  }, [insets.bottom]);
  const hideTabBarStyle = useMemo(() => ({ display: 'none' as const }), []);

  useEffect(() => {
    if (item) void markPromoRead(item);
  }, [item, markPromoRead]);

  useEffect(() => {
    let cancelled = false;
    if (routeItem) {
      setLoadedItem(routeItem);
      setLoading(false);
      setError('');
      return () => {
        cancelled = true;
      };
    }
    if (!(routeItemId > 0)) {
      setLoadedItem(null);
      setLoading(false);
      setError('NOT_FOUND');
      return () => {
        cancelled = true;
      };
    }
    setLoadedItem(null);
    setLoading(true);
    setError('');
    void fetchImportantMessages()
      .then((items) => {
        if (cancelled) return;
        const nextItem = Array.isArray(items)
          ? items.find((entry) => Number(entry?.id || 0) === routeItemId) || null
          : null;
        setLoadedItem(nextItem);
        setError(nextItem ? '' : 'NOT_FOUND');
      })
      .catch(() => {
        if (!cancelled) setError('LOAD_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeItem, routeItemId]);

  const openLink = useCallback(() => {
    if (!linkUrl) return;
    void Linking.openURL(linkUrl).catch(() => null);
  }, [linkUrl]);

  useFocusEffect(useCallback(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: hideTabBarStyle });
    return () => {
      requestAnimationFrame(() => {
        if (isPromoRouteActive(navigation)) return;
        parent?.setOptions({ tabBarStyle: baseTabBarStyle });
      });
    };
  }, [baseTabBarStyle, hideTabBarStyle, navigation]));

  if (!item) {
    return (
      <Screen edges={['top']}>
        <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="" />
        <View style={styles.stateScreen}>
          <Ionicons color={theme.colors.muted} name={loading ? 'hourglass-outline' : 'alert-circle-outline'} size={34} />
          <Text style={styles.stateTitle}>
            {loading ? 'Загружаем сообщение' : error === 'LOAD_FAILED' ? 'Не удалось загрузить сообщение' : 'Сообщение не найдено'}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="" />
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroFrame}>
          {imageUrl ? (
            <Animated.Image
              resizeMode="cover"
              source={{ uri: imageUrl }}
              style={[styles.heroImage, { transform: [{ translateY: imageTranslateY }] }]}
            />
          ) : (
            <View style={styles.heroFallback}>
              <Ionicons color={theme.colors.muted} name="image-outline" size={44} />
            </View>
          )}
        </View>

        <View style={styles.sheet}>
          <Text style={styles.title}>{item.title}</Text>

          {promoCode ? (
            <View style={styles.promoPill}>
              <Text style={styles.promoLabel}>Промокод</Text>
              <Text style={styles.promoCode}>{promoCode}</Text>
            </View>
          ) : null}

          <Text style={styles.body}>{item.body}</Text>

          {linkUrl ? (
            <Pressable accessibilityRole="button" onPress={openLink} style={styles.linkButton}>
              <Text style={styles.linkText}>Открыть</Text>
              <Ionicons color="#ffffff" name="arrow-forward" size={18} />
            </Pressable>
          ) : null}
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#3f3f46',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 24,
  },
  content: {
    backgroundColor: '#f3f4f6',
    flexGrow: 1,
    paddingBottom: 28,
  },
  heroFallback: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  heroFrame: {
    aspectRatio: 2 / 3,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
    width: '100%',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  linkButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  linkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  promoCode: {
    color: '#3f3f46',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  promoLabel: {
    color: '#71717a',
    fontSize: 14,
  },
  promoPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#e5e7eb',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    minHeight: 58,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    minHeight: 280,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 26,
  },
  stateScreen: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    color: '#27272a',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
  },
});
