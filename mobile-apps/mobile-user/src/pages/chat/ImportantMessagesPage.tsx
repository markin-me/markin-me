import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { ChatTabParamList, MainTabParamList, RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { useChatUnread } from '../../features/chat';
import { claimImportantMessagePromo, fetchImportantMessages, fetchImportantMessagesRevision, resolveChatAssetUrl } from '../../features/chat/api';
import { getImportantMessageActionType } from '../../features/chat/helpers';
import {
  getUnreadImportantMessageIds,
  readImportantMessagesCache,
  saveImportantMessagesCache,
  updateImportantMessagesCacheItems,
} from '../../features/chat/storage';
import type { ImportantMessage } from '../../features/chat/types';
import { refreshCheckoutBenefitsState } from '../../features/checkout';
import { getMemoryCustomerPassport, readCachedCustomerPassport, subscribeCustomerPassport } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { AppHeader } from '../../widgets/app-header';

type MainNavigationProp = BottomTabNavigationProp<MainTabParamList>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ImportantMessagesPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabParamList>>();
  const { promoCacheRevision, syncPromoUnreadFromItems } = useChatUnread();
  const pendingClaimItemRef = useRef<ImportantMessage | null>(null);
  const claimingItemIdsRef = useRef(new Set<string>());
  const [items, setItems] = useState<ImportantMessage[]>([]);
  const [unreadItemIds, setUnreadItemIds] = useState<Set<string>>(() => new Set());
  const [claimingIds, setClaimingIds] = useState<Set<string>>(() => new Set());
  const [customerToken, setCustomerToken] = useState(() => String(getMemoryCustomerPassport()?.token || '').trim());
  const [loading, setLoading] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [error, setError] = useState('');
  const mainNavigation = navigation.getParent<MainNavigationProp>();
  const rootNavigation = mainNavigation?.getParent<RootNavigationProp>();

  const applyItems = useCallback(async (nextItems: ImportantMessage[]) => {
    const normalizedItems = Array.isArray(nextItems) ? nextItems : [];
    const nextUnreadIds = await getUnreadImportantMessageIds(normalizedItems);
    setItems(normalizedItems);
    setUnreadItemIds(new Set(nextUnreadIds));
    void syncPromoUnreadFromItems(normalizedItems);
  }, [syncPromoUnreadFromItems]);

  const refreshCustomerToken = useCallback(async () => {
    const passport = await readCachedCustomerPassport().catch(() => null);
    const nextToken = String(passport?.token || '').trim();
    setCustomerToken(nextToken);
    return nextToken;
  }, []);

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    const force = options.force === true;
    const cached = await readImportantMessagesCache().catch(() => null);
    if (cached) {
      await applyItems(cached.items);
    }
    setCacheChecked(true);
    setLoading(force || !cached);
    setError('');
    try {
      const revision = await fetchImportantMessagesRevision();
      const nextRevision = String(revision?.revision || '');
      const nextCount = Math.max(0, Number(revision?.count || 0));
      if (!force && cached && cached.revision === nextRevision && cached.count === nextCount) {
        return;
      }
      const nextItems = await fetchImportantMessages();
      const normalizedItems = Array.isArray(nextItems) ? nextItems : [];
      await saveImportantMessagesCache({
        count: nextCount || normalizedItems.length,
        items: normalizedItems,
        revision: nextRevision,
      });
      await applyItems(normalizedItems);
    } catch (nextError) {
      if (!cached) setError(nextError instanceof Error ? nextError.message : 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [applyItems]);

  const claimPromo = useCallback(async (item: ImportantMessage) => {
    const itemId = Number(item.id || 0);
    if (!(itemId > 0) || item.promo_claimable === false) return;
    const key = String(itemId);
    if (claimingItemIdsRef.current.has(key)) return;
    claimingItemIdsRef.current.add(key);
    setClaimingIds((prev) => new Set(prev).add(key));
    try {
      const token = await refreshCustomerToken();
      if (!token) {
        pendingClaimItemRef.current = item;
        mainNavigation?.navigate(routes.profile);
        return;
      }
      const result = await claimImportantMessagePromo(itemId);
      const nextCode = String(result?.promo_code || '').trim();
      void refreshCheckoutBenefitsState().catch(() => null);
      setItems((prev) => {
        const nextItems = prev.map((entry) => (
        Number(entry.id || 0) === itemId
          ? {
              ...entry,
              promo_code: nextCode || entry.promo_code,
              promo_code_id: result?.promo_code_id ?? entry.promo_code_id,
              promo_code_masked: false,
              promo_claimed: true,
            }
          : entry
        ));
        void updateImportantMessagesCacheItems(nextItems).catch(() => null);
        return nextItems;
      });
    } catch (claimError) {
      if (claimError instanceof Error && claimError.message === 'UNAUTHORIZED') {
        pendingClaimItemRef.current = item;
        setCustomerToken('');
        mainNavigation?.navigate(routes.profile);
      } else {
        setItems((prev) => prev.map((entry) => (
          Number(entry.id || 0) === itemId ? { ...entry, promo_claimable: false } : entry
        )));
      }
    } finally {
      claimingItemIdsRef.current.delete(key);
      setClaimingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [mainNavigation, refreshCustomerToken]);

  const openProduct = useCallback((productId: number) => {
    if (!(productId > 0)) return;
    rootNavigation?.navigate(routes.product, { productId });
  }, [rootNavigation]);

  useEffect(() => {
    void refreshCustomerToken();
    return subscribeCustomerPassport(() => {
      void refreshCustomerToken().then((token) => {
        const pendingItem = pendingClaimItemRef.current;
        if (!token || !pendingItem) return;
        pendingClaimItemRef.current = null;
        void claimPromo(pendingItem);
      });
    });
  }, [claimPromo, refreshCustomerToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!promoCacheRevision) return undefined;
    let cancelled = false;
    void readImportantMessagesCache()
      .then((cached) => {
        if (!cancelled && cached) void applyItems(cached.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [applyItems, promoCacheRevision]);

  useFocusEffect(useCallback(() => {
    void refreshCustomerToken();
    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, refreshCustomerToken]));

  useFocusEffect(useCallback(() => {
    if (items.length) {
      void getUnreadImportantMessageIds(items).then((ids) => setUnreadItemIds(new Set(ids)));
    }
  }, [items]));

  return (
    <Screen edges={['top']}>
      <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="PROMO сообщения" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} tintColor={theme.colors.accent} onRefresh={() => load({ force: true })} />}
      >
        {error ? (
          <View style={styles.stateCard}>
            <Ionicons color={theme.colors.muted} name="cloud-offline-outline" size={28} />
            <Text style={styles.stateTitle}>Не удалось загрузить сообщения</Text>
          </View>
        ) : null}

        {!error && cacheChecked && !loading && !items.length ? (
          <View style={styles.stateCard}>
            <Ionicons color={theme.colors.muted} name="notifications-outline" size={30} />
            <Text style={styles.stateTitle}>Пока нет PROMO сообщений</Text>
            <Text style={styles.stateText}>Новости, скидки и посты от компании появятся здесь в формате для телефона.</Text>
          </View>
        ) : null}

        {items.map((item) => {
          const imageUrl = resolveChatAssetUrl(item.image_url || '');
          const actionType = getImportantMessageActionType(item);
          const productId = actionType === 'product' ? Number(item.product_id || 0) : 0;
          const hasPromo = actionType === 'promo_code'
            && (item.promo_claimable === true || !!String(item.promo_code || '').trim() || item.promo_code_masked === true);
          const promoCode = item.promo_code_masked ? '*****' : String(item.promo_code || '').trim();
          const isClaiming = claimingIds.has(String(item.id));
          const claimText = item.promo_claimed ? 'Забрано' : isClaiming ? '...' : item.promo_claimable === false ? 'Закончились' : 'Забрать';
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
                    {hasPromo ? (
                      <View style={styles.promoSlot}>
                        <View style={styles.promoSlotContent}>
                          <View style={styles.promoPill}>
                            <Text style={styles.promoLabel}>Промокод</Text>
                            <Text numberOfLines={1} style={styles.promoCode}>{promoCode}</Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            disabled={isClaiming || item.promo_claimed === true || item.promo_claimable === false}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              void claimPromo(item);
                            }}
                            style={({ pressed }) => [
                              styles.claimButton,
                              (pressed && !isClaiming) ? styles.cardPressed : null,
                              (item.promo_claimed === true || item.promo_claimable === false) ? styles.claimButtonDisabled : null,
                            ]}
                          >
                            <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={styles.claimText}>{claimText}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : productId > 0 ? (
                      <View style={styles.promoSlot}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={(event) => {
                            event.stopPropagation?.();
                            openProduct(productId);
                          }}
                          style={({ pressed }) => [styles.claimButton, pressed ? styles.cardPressed : null]}
                        >
                          <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={styles.claimText}>Заказать</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text numberOfLines={2} style={styles.title}>
                        {item.title}
                      </Text>
                    </View>
                    <Text numberOfLines={10} style={styles.body}>
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
    height: 278,
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
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  previewSide: {
    flexShrink: 0,
    gap: 0,
    width: 122,
  },
  mediaFrame: {
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    position: 'relative',
    width: 122,
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
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
  promoLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
  promoPill: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 1,
    height: 29,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  promoSlot: {
    justifyContent: 'flex-end',
    marginTop: 10,
    minHeight: 61,
  },
  promoSlotContent: {
    gap: 5,
  },
  claimButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    height: 27,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  claimButtonDisabled: {
    backgroundColor: 'rgba(229,231,235,0.88)',
  },
  claimText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    height: 44,
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
    height: 200,
    lineHeight: 20,
    marginTop: 0,
  },
});
