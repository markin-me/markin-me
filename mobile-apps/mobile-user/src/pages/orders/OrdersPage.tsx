import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchCustomerOrders,
  isSameCachedValue,
  readCachedCustomerOrders,
  readCachedCustomerPassport,
  resolveAssetUrl,
  type CustomerOrder,
  type CustomerOrderItem,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { routes, type RootStackParamList } from '../../app/navigation/routes';
import { Screen } from '../../shared/ui/Screen';
import { AppText as Text } from '../../shared/ui';

const PAGE_SIZE = 10;
const SWIPE_REVEAL_WIDTH = 68;
const MAX_ORDER_PHOTOS = 8;

function formatOrderDate(value: unknown) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  const safeNumber = Number.isFinite(number) ? Math.max(0, number) : 0;
  return `${safeNumber.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

function formatOrderAddress(order: CustomerOrder) {
  const street = String(order.delivery_address_street || order.address_street || '').trim();
  const house = String(order.delivery_address_house || order.address_house || '').trim();
  const apartment = String(order.delivery_address_apartment || order.address_apartment || '').trim();
  if (street || house) {
    const line = [street, house].filter(Boolean).join(' ');
    return apartment ? `${line}, кв ${apartment}` : line;
  }
  const fullAddress = String(order.address || order.delivery_address || '').trim();
  if (!fullAddress) return '';
  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1, 3).join(', ') : fullAddress;
}

function collectOrderPhotos(items: CustomerOrderItem[] | undefined, maxPhotos = MAX_ORDER_PHOTOS) {
  const result: string[] = [];
  const seen = new Set<string>();
  const pushPhoto = (value: unknown) => {
    const src = resolveAssetUrl(String(value || '').trim());
    if (!src || seen.has(src) || result.length >= maxPhotos) return;
    seen.add(src);
    result.push(src);
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (result.length >= maxPhotos) return;
    const comboItems = Array.isArray(item?.combo_items) ? item.combo_items : [];
    if (comboItems.length) {
      comboItems.forEach((comboItem) => {
        pushPhoto(comboItem?.product_photo || comboItem?.photo || '');
      });
      (Array.isArray(item?.photos) ? item.photos : []).forEach(pushPhoto);
      return;
    }
    const photos = Array.isArray(item?.photos) ? item.photos : [];
    if (photos.length) {
      pushPhoto(photos[0]);
      return;
    }
    pushPhoto(item?.product_photo || item?.photo || '');
  });

  return result;
}

function getOrderTotal(order: CustomerOrder) {
  return order.total_price ?? order.total ?? order.total_amount ?? 0;
}

function getOrderSignature(order: CustomerOrder) {
  const id = Number(order.id || 0);
  const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
  return `${id}:${order.updated_at || order.created_at || ''}:${order.status_id || ''}:${order.status_title || ''}:${getOrderTotal(order)}:${itemsCount}`;
}

function mergeOrders(previous: CustomerOrder[], next: CustomerOrder[]) {
  const map = new Map<number, CustomerOrder>();
  previous.forEach((order) => {
    const id = Number(order.id || 0);
    if (id > 0) map.set(id, order);
  });
  next.forEach((order) => {
    const id = Number(order.id || 0);
    if (id > 0) map.set(id, order);
  });
  return Array.from(map.values());
}

function OrderCard({
  onOpen,
  onRepeat,
  order,
}: {
  onOpen: (order: CustomerOrder) => void;
  onRepeat: (order: CustomerOrder) => void;
  order: CustomerOrder;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const photos = useMemo(() => collectOrderPhotos(order.items), [order]);
  const address = formatOrderAddress(order);
  const canSwipe = Array.isArray(order.items) && order.items.length > 0;

  const closeSwipe = useCallback(() => {
    currentX.current = 0;
    Animated.timing(translateX, {
      duration: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const openSwipe = useCallback(() => {
    currentX.current = SWIPE_REVEAL_WIDTH;
    Animated.timing(translateX, {
      duration: 220,
      toValue: SWIPE_REVEAL_WIDTH,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => canSwipe && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => {
      if (!canSwipe) return;
      const nextX = Math.max(0, Math.min(SWIPE_REVEAL_WIDTH + 16, currentX.current + gesture.dx));
      translateX.setValue(nextX);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!canSwipe) return;
      const nextX = Math.max(0, Math.min(SWIPE_REVEAL_WIDTH + 16, currentX.current + gesture.dx));
      if (nextX > SWIPE_REVEAL_WIDTH * 0.45) {
        openSwipe();
      } else {
        closeSwipe();
      }
    },
    onPanResponderTerminate: closeSwipe,
  }), [canSwipe, closeSwipe, openSwipe, translateX]);

  const handleOpen = () => {
    if (currentX.current > 0) {
      closeSwipe();
      return;
    }
    onOpen(order);
  };

  const handleRepeat = () => {
    closeSwipe();
    onRepeat(order);
  };

  return (
    <View style={styles.swipeContainer}>
      {canSwipe ? (
        <Pressable onPress={handleRepeat} style={styles.repeatAction}>
          <Ionicons name="refresh" color={theme.colors.muted} size={22} />
        </Pressable>
      ) : null}
      <Animated.View
        style={[styles.swipeContent, { transform: [{ translateX }] }]}
        {...(canSwipe ? panResponder.panHandlers : {})}
      >
        <Pressable onPress={handleOpen} style={styles.orderCard}>
          <View style={styles.orderHead}>
            <Text style={styles.orderTitle}>Заказ #{order.id || ''}</Text>
            <Text style={styles.orderDate}>{formatOrderDate(order.created_at)}</Text>
          </View>

          <View style={[styles.orderAddress, !address ? styles.orderAddressEmpty : null]}>
            <Ionicons name="location" color={theme.colors.muted} size={13} />
            <Text numberOfLines={1} style={styles.orderAddressText}>{address || ' '}</Text>
          </View>

          {photos.length ? (
            <View style={styles.photosRow}>
              {photos.map((src, index) => (
                <View key={`${src}-${index}`} style={styles.photoWrap}>
                  <Image source={{ uri: src }} style={styles.photo} />
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.orderActions}>
            <View style={[styles.orderPill, styles.statusPill]}>
              <Text numberOfLines={1} style={styles.statusText}>{order.status_title || '—'}</Text>
            </View>
            <View style={[styles.orderPill, styles.pricePill]}>
              <Text numberOfLines={1} style={styles.priceText}>{formatMoney(getOrderTotal(order))}</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function OrdersPage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [token, setToken] = useState('');
  const [activeOrders, setActiveOrders] = useState<CustomerOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<CustomerOrder[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeOffset, setActiveOffset] = useState(0);
  const [activeHasMore, setActiveHasMore] = useState(false);
  const [completedOffset, setCompletedOffset] = useState(0);
  const [completedHasMore, setCompletedHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMoreActive, setLoadingMoreActive] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const updateSummary = useCallback((summary: Record<string, unknown>) => {
    const nextActiveCount = Number(summary.active_count ?? summary.activeCount);
    const nextCompletedCount = Number(summary.completed_count ?? summary.completedCount);
    if (Number.isFinite(nextActiveCount)) setActiveCount(Math.max(0, Math.trunc(nextActiveCount)));
    if (Number.isFinite(nextCompletedCount)) setCompletedCount(Math.max(0, Math.trunc(nextCompletedCount)));
  }, []);

  const loadOrders = useCallback(async (nextToken: string, options: { reset: boolean }) => {
    if (!nextToken) return;
    if (options.reset) {
      setErrorText('');
    }
    try {
      const [cachedActivePayload, cachedCompletedPayload] = options.reset
        ? await Promise.all([
          readCachedCustomerOrders(nextToken, 0),
          readCachedCustomerOrders(nextToken, 1),
        ])
        : [null, null];
      if (cachedActivePayload || cachedCompletedPayload) {
        const activePayload = cachedActivePayload || { data: [], paging: { has_more: false }, summary: {} };
        const completedPayload = cachedCompletedPayload || { data: [], paging: { has_more: false }, summary: {} };
        setActiveOrders(activePayload.data);
        setCompletedOrders(completedPayload.data);
        setActiveOffset(activePayload.data.length);
        setActiveHasMore(Boolean(activePayload.paging.has_more));
        setCompletedOffset(completedPayload.data.length);
        setCompletedHasMore(Boolean(completedPayload.paging.has_more));
        updateSummary(activePayload.summary);
        updateSummary(completedPayload.summary);
        if (!Object.keys(activePayload.summary || {}).length) setActiveCount(activePayload.data.length);
        if (!Object.keys(completedPayload.summary || {}).length) setCompletedCount(completedPayload.data.length);
        setLoading(false);
        setRefreshing(false);
      }
      const [activePayload, completedPayload] = await Promise.all([
        fetchCustomerOrders(nextToken, { limit: PAGE_SIZE, offset: 0, statusIsFinal: 0 }),
        fetchCustomerOrders(nextToken, { limit: PAGE_SIZE, offset: 0, statusIsFinal: 1 }),
      ]);
      if (!isSameCachedValue(activePayload.data, cachedActivePayload?.data || [])) setActiveOrders(activePayload.data);
      if (!isSameCachedValue(completedPayload.data, cachedCompletedPayload?.data || [])) setCompletedOrders(completedPayload.data);
      setActiveOffset(activePayload.data.length);
      setActiveHasMore(Boolean(activePayload.paging.has_more));
      setCompletedOffset(completedPayload.data.length);
      setCompletedHasMore(Boolean(completedPayload.paging.has_more));
      updateSummary(activePayload.summary);
      updateSummary(completedPayload.summary);
      if (!Object.keys(activePayload.summary || {}).length) setActiveCount(activePayload.data.length);
      if (!Object.keys(completedPayload.summary || {}).length) setCompletedCount(completedPayload.data.length);
    } catch {
      setErrorText('Не удалось загрузить заказы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [updateSummary]);

  useEffect(() => {
    let isActive = true;
    void readCachedCustomerPassport().then((passport) => {
      if (!isActive) return;
      const nextToken = String(passport?.token || '').trim();
      setToken(nextToken);
      if (nextToken) {
        void loadOrders(nextToken, { reset: true });
      } else {
        setLoading(false);
      }
    });
    return () => {
      isActive = false;
    };
  }, [loadOrders]);

  const refreshOrders = useCallback(() => {
    if (!token) return;
    setRefreshing(true);
    void loadOrders(token, { reset: true });
  }, [loadOrders, token]);

  const loadMoreCompleted = useCallback(async () => {
    if (!token || loadingMore || !completedHasMore) return;
    setLoadingMore(true);
    try {
      const payload = await fetchCustomerOrders(token, { limit: PAGE_SIZE, offset: completedOffset, statusIsFinal: 1 });
      setCompletedOrders((value) => mergeOrders(value, payload.data));
      setCompletedOffset((value) => value + payload.data.length);
      setCompletedHasMore(Boolean(payload.paging.has_more));
      updateSummary(payload.summary);
    } catch {
      setCompletedHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [completedHasMore, completedOffset, loadingMore, token, updateSummary]);

  const loadMoreActive = useCallback(async () => {
    if (!token || loadingMoreActive || !activeHasMore) return;
    setLoadingMoreActive(true);
    try {
      const payload = await fetchCustomerOrders(token, { limit: PAGE_SIZE, offset: activeOffset, statusIsFinal: 0 });
      setActiveOrders((value) => mergeOrders(value, payload.data));
      setActiveOffset((value) => value + payload.data.length);
      setActiveHasMore(Boolean(payload.paging.has_more));
      updateSummary(payload.summary);
    } catch {
      setActiveHasMore(false);
    } finally {
      setLoadingMoreActive(false);
    }
  }, [activeHasMore, activeOffset, loadingMoreActive, token, updateSummary]);

  const openOrder = useCallback((order: CustomerOrder) => {
    const orderId = Number(order.id || 0);
    if (!(orderId > 0)) return;
    navigation.navigate(routes.orderDetails, { orderId });
  }, [navigation]);

  const repeatOrder = useCallback((_order: CustomerOrder) => {
    Alert.alert('Повтор заказа', 'Повтор заказа будет доступен после подключения корзины.');
  }, []);

  const header = (
    <View>
      <Text style={styles.screenTitle}>Мои заказы</Text>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <OrdersSectionHeader count={activeCount} title="Действующие" />
      {activeOrders.length ? (
        <View style={styles.sectionList}>
          {activeOrders.map((order) => (
            <OrderCard key={`${order.id || ''}-${getOrderSignature(order)}`} onOpen={openOrder} onRepeat={repeatOrder} order={order} />
          ))}
          {activeHasMore ? (
            <Pressable disabled={loadingMoreActive} onPress={loadMoreActive} style={styles.moreButton}>
              {loadingMoreActive ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : (
                <Text style={styles.moreButtonText}>Показать еще</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyText}>Действующих заказов пока нет.</Text>
      )}
      <OrdersSectionHeader count={completedCount} title="Завершенные" />
    </View>
  );

  if (loading) {
    return (
      <Screen edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!token) {
    return (
      <Screen edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.screenTitle}>Мои заказы</Text>
          <Text style={styles.emptyText}>Войдите в профиль, чтобы посмотреть заказы.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        data={completedOrders}
        keyExtractor={(item) => `${item.id || ''}-${getOrderSignature(item)}`}
        ListEmptyComponent={<Text style={styles.emptyText}>Завершенных заказов пока нет.</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.accent} style={styles.footerLoader} /> : null}
        ListHeaderComponent={header}
        onEndReached={loadMoreCompleted}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.accent} onRefresh={refreshOrders} />}
        renderItem={({ item }) => <OrderCard onOpen={openOrder} onRepeat={repeatOrder} order={item} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

function OrdersSectionHeader({ count, title }: { count: number; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>({count})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 2,
    paddingVertical: theme.spacing.sm,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: theme.spacing.sm,
  },
  footerLoader: {
    paddingVertical: theme.spacing.md,
  },
  moreButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  moreButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  orderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  orderAddress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 15,
  },
  orderAddressEmpty: {
    opacity: 0,
  },
  orderAddressText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  orderCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 30,
    borderWidth: 1,
    gap: 6,
    minHeight: 136,
    overflow: 'hidden',
    padding: theme.spacing.md,
    shadowColor: '#141d30',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
  },
  orderDate: {
    color: theme.colors.muted,
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 15,
  },
  orderHead: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  orderPill: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
    shadowColor: '#141d30',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  orderTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photosRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 2,
  },
  photoWrap: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    overflow: 'hidden',
    width: 48,
  },
  pricePill: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
  },
  priceText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  repeatAction: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: SWIPE_REVEAL_WIDTH,
    zIndex: 1,
  },
  screenTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 2,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  sectionList: {
    gap: theme.spacing.md,
  },
  sectionCount: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  statusPill: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  swipeContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
  },
  swipeContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    position: 'relative',
    zIndex: 2,
  },
});
