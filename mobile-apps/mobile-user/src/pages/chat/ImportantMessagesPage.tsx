import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatTabParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { useChatUnread } from '../../features/chat';
import { fetchImportantMessages, resolveChatAssetUrl } from '../../features/chat/api';
import { getUnreadImportantMessageIds } from '../../features/chat/storage';
import type { ImportantMessage } from '../../features/chat/types';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { AppHeader } from '../../widgets/app-header';

function isPromoRouteActive(navigation: NativeStackNavigationProp<ChatTabParamList>) {
  const state = navigation.getState();
  const routeName = state.routes[state.index]?.name;
  return routeName === routes.importantMessages || routeName === routes.importantMessageDetails;
}

export function ImportantMessagesPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabParamList>>();
  const insets = useSafeAreaInsets();
  const { syncPromoUnreadFromItems } = useChatUnread();
  const [items, setItems] = useState<ImportantMessage[]>([]);
  const [unreadItemIds, setUnreadItemIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextItems = await fetchImportantMessages();
      const normalizedItems = Array.isArray(nextItems) ? nextItems : [];
      const nextUnreadIds = await getUnreadImportantMessageIds(normalizedItems);
      setItems(normalizedItems);
      setUnreadItemIds(new Set(nextUnreadIds));
      void syncPromoUnreadFromItems(normalizedItems);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [syncPromoUnreadFromItems]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(useCallback(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: hideTabBarStyle });
    if (items.length) {
      void getUnreadImportantMessageIds(items).then((ids) => setUnreadItemIds(new Set(ids)));
    }
    return () => {
      requestAnimationFrame(() => {
        if (isPromoRouteActive(navigation)) return;
        parent?.setOptions({ tabBarStyle: baseTabBarStyle });
      });
    };
  }, [baseTabBarStyle, hideTabBarStyle, items, navigation]));

  return (
    <Screen edges={['top']}>
      <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="PROMO сообщения" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} tintColor={theme.colors.accent} onRefresh={load} />}
      >
        {error ? (
          <View style={styles.stateCard}>
            <Ionicons color={theme.colors.muted} name="cloud-offline-outline" size={28} />
            <Text style={styles.stateTitle}>Не удалось загрузить сообщения</Text>
          </View>
        ) : null}

        {!error && !loading && !items.length ? (
          <View style={styles.stateCard}>
            <Ionicons color={theme.colors.muted} name="notifications-outline" size={30} />
            <Text style={styles.stateTitle}>Пока нет PROMO сообщений</Text>
            <Text style={styles.stateText}>Новости, скидки и посты от компании появятся здесь в формате для телефона.</Text>
          </View>
        ) : null}

        {items.map((item) => {
          const imageUrl = resolveChatAssetUrl(item.image_url || '');
          const promoCode = String(item.promo_code || '').trim();
          const isUnread = unreadItemIds.has(String(item.id));
          return (
            <View key={String(item.id)} style={styles.card}>
              {isUnread ? <View style={styles.unreadDot} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate(routes.importantMessageDetails, { item })}
                style={({ pressed }) => [styles.previewPressable, pressed ? styles.cardPressed : null]}
              >
                <View style={styles.previewRow}>
                  <View style={styles.previewSide}>
                    <View style={styles.mediaFrame}>
                      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <View style={styles.mediaFallback}><Ionicons color={theme.colors.muted} name="image-outline" size={26} /></View>}
                    </View>
                    {promoCode ? (
                      <View style={styles.promoPill}>
                        <Text style={styles.promoLabel}>Промокод</Text>
                        <Text numberOfLines={1} style={styles.promoCode}>{promoCode}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text numberOfLines={2} style={styles.title}>
                        {item.title}
                      </Text>
                    </View>
                    <Text numberOfLines={8} style={styles.body}>
                      {item.body}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 24,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 248,
    overflow: 'hidden',
    position: 'relative',
  },
  previewPressable: {
    flex: 1,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.82,
  },
  previewRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 12,
    minHeight: 248,
    padding: 12,
  },
  previewSide: {
    flexShrink: 0,
    gap: 8,
    width: 112,
  },
  mediaFrame: {
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    position: 'relative',
    width: 112,
  },
  mediaFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  promoCode: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  promoLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  promoPill: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  typePill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dateText: {
    color: theme.colors.muted,
    fontSize: 12,
    marginLeft: 'auto',
  },
  title: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    flex: 1,
  },
  unreadDot: {
    backgroundColor: '#ef4444',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    position: 'absolute',
    right: 10,
    top: 10,
    width: 14,
    zIndex: 2,
  },
  body: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 0,
  },
});
