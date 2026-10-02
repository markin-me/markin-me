import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchCustomerOrders,
  getCustomerOrderStatusTitle,
  isSameCachedValue,
  readCachedCustomerOrders,
  readCachedCustomerPassport,
  resolveAssetUrl,
  subscribeCustomerPassport,
  waitForPublicChanges,
  type CustomerOrder,
  type CustomerOrderItem,
  type CustomerOrdersPayload,
} from '../../shared/api';
import { openOrderEventsStream } from '../../features/chat/api';
import { theme } from '../../shared/config/theme';
import { routes, type RootStackParamList } from '../../app/navigation/routes';
import { Screen } from '../../shared/ui/Screen';
import { AppText as Text } from '../../shared/ui';

const PAGE_SIZE = 10;
const MAX_ORDER_PHOTOS = 40;

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  const safeNumber = Number.isFinite(number) ? Math.max(0, number) : 0;
  return `${safeNumber.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

function formatOrderAddress(order: CustomerOrder) {
  if (String(order.method_code || '').toLowerCase() !== 'delivery') {
    return String(order.pickup_store_address || '').trim();
  }
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

function OrderCard({ onOpen, order }: {
  onOpen: (order: CustomerOrder) => void;
  order: CustomerOrder;
}) {
  const photos = useMemo(() => collectOrderPhotos(order.items), [order.items]);
  const address = formatOrderAddress(order);
  const methodCode = String(order.method_code || '').toLowerCase();
  const delivery = methodCode === 'delivery';
  const method = ({ delivery: 'Доставка', pickup: 'Самовывоз', dine_in: 'В зале', takeaway: 'С собой' } as Record<string, string>)[methodCode] || String(order.method_title || '');
  const timeCode = String(order.time_option_code || '').toLowerCase();
  const timeLabel = ({ asap: 'Быстрее', urgent: 'Быстрее', at_time: 'Ко времени', on_date: 'На дату' } as Record<string, string>)[timeCode] || String(order.time_option_title || '');
  // Scheduled time is a store-local wall time, without a device timezone conversion.
  const scheduled = String(order.scheduled_at || '');
  const date = scheduled.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const time = scheduled.match(/(?:[ T]|^)(\d{2}:\d{2})/);
  const timing = [timeLabel, date && timeCode === 'on_date' ? `${date[3]}.${date[2]}` : '', time && ['at_time', 'on_date'].includes(timeCode) ? time[1] : ''].filter(Boolean).join(' · ');
  const rawStatus = String(order.status_code || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const stages: Record<string, string> = {
    new: 'accepted', accepted: 'accepted', cooking: 'cooking', preparing: 'cooking',
    ready: 'packed', packed: 'packed', on_the_way: 'courier', in_transit: 'courier',
    courier: 'courier', delivery: 'courier', delivering: 'courier', delivered: 'completed',
    received: 'completed', completed: 'completed', done: 'completed', delivery_done: 'completed',
    canceled: 'cancelled', cancelled: 'cancelled',
  };
  let stage = stages[rawStatus] || rawStatus;
  if (delivery && stage === 'packed') stage = 'cooking';
  if (!delivery && stage === 'courier') stage = 'packed';
  const cancelled = stage === 'cancelled';
  const final = cancelled || stage === 'completed' || Number(order.status_is_final) === 1;
  const route: { code: string; title: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
    { code: 'accepted', title: 'Принят', icon: 'checkmark' },
    { code: 'cooking', title: 'Готовится', icon: 'flame' },
    { code: delivery ? 'courier' : 'packed', title: delivery ? 'В пути' : 'Собран', icon: delivery ? 'car' : 'cube' },
    { code: 'completed', title: delivery ? 'Доставлен' : methodCode === 'dine_in' ? 'Выполнен' : 'Получен', icon: 'checkmark' },
  ];
  const stageIndex = route.findIndex((step) => step.code === stage);
  const statusLabel = cancelled ? 'Отменён' : route[stageIndex]?.title || getCustomerOrderStatusTitle(order);
  return (
    <Pressable onPress={() => onOpen(order)} style={styles.orderCard}>
      <Text style={styles.orderTitle}>#{String(order.order_number || order.public_number || order.id || '')} · {method}{timing ? ` · ${timing}` : ''}</Text>
      {address ? <View style={styles.orderAddress}>
        <Ionicons name="location" color={theme.colors.muted} size={13} />
        <Text style={styles.orderAddressText}>{address}</Text>
      </View> : null}
      {photos.length ? <ScrollView style={styles.photosScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
        {photos.map((src, index) => <View key={`${src}-${index}`} style={styles.photoWrap}>
          <Image source={{ uri: src }} style={styles.photo} />
        </View>)}
      </ScrollView> : null}
      {!final ? <View style={styles.progressRoute} accessibilityLabel={statusLabel}>
        {route.map((step, index) => <View key={step.code} style={styles.progressStep}>
          {index > 0 ? <View style={[styles.progressLine, styles.progressLineLeft]} /> : null}
          {index < route.length - 1 ? <View style={[styles.progressLine, styles.progressLineRight]} /> : null}
          <View style={[styles.progressNode, index === stageIndex && styles.progressNodeCurrent, index < stageIndex && styles.progressNodeCompleted]}>
            <Ionicons name={index < stageIndex ? 'checkmark' : step.icon} size={17} color={index === stageIndex ? theme.colors.primaryText : theme.colors.muted} />
          </View>
        </View>)}
      </View> : null}
      <View style={styles.orderActions}>
        {final ? <View style={styles.finalStatus}>
          <Ionicons name={cancelled ? 'close-circle' : 'checkmark-circle'} size={19} color={cancelled ? theme.colors.danger : '#16a34a'} />
          <Text style={[styles.statusText, { color: cancelled ? theme.colors.danger : '#16a34a' }]}>{statusLabel}</Text>
        </View> : null}
        <View style={[styles.orderPill, styles.pricePill]}><Text style={styles.priceText}>{formatMoney(getOrderTotal(order))}</Text></View>
      </View>
    </Pressable>
  );
}

export function OrdersPage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
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
  const changesCursorRef = useRef(0);

  const updateSummary = useCallback((summary: Record<string, unknown>) => {
    const nextActiveCount = Number(summary.active_count ?? summary.activeCount);
    const nextCompletedCount = Number(summary.completed_count ?? summary.completedCount);
    if (Number.isFinite(nextActiveCount)) setActiveCount(Math.max(0, Math.trunc(nextActiveCount)));
    if (Number.isFinite(nextCompletedCount)) setCompletedCount(Math.max(0, Math.trunc(nextCompletedCount)));
  }, []);

  const applyCachedOrders = useCallback((
    activePayload: CustomerOrdersPayload | null,
    completedPayload: CustomerOrdersPayload | null,
  ) => {
    const nextActive = activePayload || { data: [], paging: { has_more: false }, summary: {} };
    const nextCompleted = completedPayload || { data: [], paging: { has_more: false }, summary: {} };
    setActiveOrders((value) => (
      isSameCachedValue(value, nextActive.data) ? value : nextActive.data
    ));
    setCompletedOrders((value) => (
      isSameCachedValue(value, nextCompleted.data) ? value : nextCompleted.data
    ));
    setActiveOffset(nextActive.data.length);
    setActiveHasMore(Boolean(nextActive.paging.has_more));
    setCompletedOffset(nextCompleted.data.length);
    setCompletedHasMore(Boolean(nextCompleted.paging.has_more));

    const summary = { ...nextActive.summary, ...nextCompleted.summary };
    updateSummary(summary);
    const nextActiveCount = Number(summary.active_count ?? summary.activeCount);
    const nextCompletedCount = Number(summary.completed_count ?? summary.completedCount);
    if (!Number.isFinite(nextActiveCount)) setActiveCount(nextActive.data.length);
    if (!Number.isFinite(nextCompletedCount)) setCompletedCount(nextCompleted.data.length);
  }, [updateSummary]);

  const loadOrders = useCallback(async (nextToken: string, options: { reset: boolean; preferCache?: boolean }) => {
    if (!nextToken || tokenRef.current !== nextToken) return;
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
        if (tokenRef.current !== nextToken) return;
        applyCachedOrders(cachedActivePayload, cachedCompletedPayload);
        setLoading(false);
        setRefreshing(false);
      }
      if (options.preferCache && cachedActivePayload && cachedCompletedPayload) return;
      let networkFailed = false;
      await Promise.all([
        fetchCustomerOrders(nextToken, { limit: PAGE_SIZE, offset: 0, statusIsFinal: 0 }).catch(() => {
          networkFailed = true;
        }),
        fetchCustomerOrders(nextToken, { limit: PAGE_SIZE, offset: 0, statusIsFinal: 1 }).catch(() => {
          networkFailed = true;
        }),
      ]);
      const [nextActivePayload, nextCompletedPayload] = await Promise.all([
        readCachedCustomerOrders(nextToken, 0),
        readCachedCustomerOrders(nextToken, 1),
      ]);
      if (tokenRef.current !== nextToken) return;
      applyCachedOrders(nextActivePayload, nextCompletedPayload);
      if (networkFailed) setErrorText('Не удалось загрузить заказы');
    } catch {
      if (tokenRef.current === nextToken) setErrorText('Не удалось загрузить заказы');
    } finally {
      if (tokenRef.current === nextToken) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyCachedOrders]);

  useEffect(() => {
    let isActive = true;
    const syncPassport = () => void readCachedCustomerPassport().then((passport) => {
      if (!isActive) return;
      const nextToken = String(passport?.token || '').trim();
      tokenRef.current = nextToken;
      setToken(nextToken);
      if (nextToken) {
        void loadOrders(nextToken, { reset: true, preferCache: true });
      } else {
        applyCachedOrders(null, null);
        setLoading(false);
      }
    });
    syncPassport();
    const unsubscribe = subscribeCustomerPassport(syncPassport);
    return () => {
      isActive = false;
      tokenRef.current = '';
      unsubscribe();
    };
  }, [applyCachedOrders, loadOrders]);

  useFocusEffect(useCallback(() => {
    if (!token) return undefined;
    let isActive = true;
    void Promise.all([
      readCachedCustomerOrders(token, 0),
      readCachedCustomerOrders(token, 1),
    ]).then(([activePayload, completedPayload]) => {
      if (isActive && (activePayload || completedPayload)) {
        applyCachedOrders(activePayload, completedPayload);
      }
      if (isActive && (!activePayload || !completedPayload)) void loadOrders(token, { reset: true, preferCache: true });
    });
    return () => {
      isActive = false;
    };
  }, [applyCachedOrders, loadOrders, token]));

  useEffect(() => {
    if (!token || !activeOrders.length) return undefined;
    let cancelled = false;
    const listenWithLongPollFallback = async () => {
      while (!cancelled && tokenRef.current === token) {
        try {
          const result = await waitForPublicChanges({ since: changesCursorRef.current, timeoutMs: 20000 });
          if (cancelled || tokenRef.current !== token) return;
          if (result.cursor > changesCursorRef.current) changesCursorRef.current = result.cursor;
          if (result.changed) await loadOrders(token, { reset: false });
        } catch {
          if (!cancelled) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };
    const source = openOrderEventsStream(token);
    source.addEventListener('order.updated', () => {
      if (!cancelled) void loadOrders(token, { reset: false });
    });
    source.addEventListener('error', () => {
      source.close();
      if (!cancelled) void listenWithLongPollFallback();
    });
    return () => {
      cancelled = true;
      source.close();
    };
  }, [activeOrders.length, loadOrders, token]);

  const refreshOrders = useCallback(() => {
    if (!token) return;
    setRefreshing(true);
    void loadOrders(token, { reset: true });
  }, [loadOrders, token]);

  const loadMoreCompleted = useCallback(async () => {
    if (!token || loadingMore || !completedHasMore) return;
    setLoadingMore(true);
    try {
      await fetchCustomerOrders(token, { limit: PAGE_SIZE, offset: completedOffset, statusIsFinal: 1 });
      const [activePayload, completedPayload] = await Promise.all([
        readCachedCustomerOrders(token, 0),
        readCachedCustomerOrders(token, 1),
      ]);
      applyCachedOrders(activePayload, completedPayload);
      setErrorText('');
    } catch {
      setErrorText('Не удалось загрузить заказы');
    } finally {
      setLoadingMore(false);
    }
  }, [applyCachedOrders, completedHasMore, completedOffset, loadingMore, token]);

  const loadMoreActive = useCallback(async () => {
    if (!token || loadingMoreActive || !activeHasMore) return;
    setLoadingMoreActive(true);
    try {
      await fetchCustomerOrders(token, { limit: PAGE_SIZE, offset: activeOffset, statusIsFinal: 0 });
      const [activePayload, completedPayload] = await Promise.all([
        readCachedCustomerOrders(token, 0),
        readCachedCustomerOrders(token, 1),
      ]);
      applyCachedOrders(activePayload, completedPayload);
      setErrorText('');
    } catch {
      setErrorText('Не удалось загрузить заказы');
    } finally {
      setLoadingMoreActive(false);
    }
  }, [activeHasMore, activeOffset, applyCachedOrders, loadingMoreActive, token]);

  const openOrder = useCallback((order: CustomerOrder) => {
    const orderId = Number(order.id || 0);
    if (!(orderId > 0)) return;
    navigation.navigate(routes.orderDetails, { orderId });
  }, [navigation]);

  const header = (
    <View>
      <Text style={styles.screenTitle}>Мои заказы</Text>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <OrdersSectionHeader count={activeCount} title="Действующие" />
      {activeOrders.length ? (
        <View style={styles.sectionList}>
          {activeOrders.map((order) => (
            <OrderCard key={String(order.id || '')} onOpen={openOrder} order={order} />
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
        keyExtractor={(item) => String(item.id || '')}
        ListEmptyComponent={<Text style={styles.emptyText}>Завершенных заказов пока нет.</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.accent} style={styles.footerLoader} /> : null}
        ListHeaderComponent={header}
        onEndReached={loadMoreCompleted}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.accent} onRefresh={refreshOrders} />}
        renderItem={({ item }) => <OrderCard onOpen={openOrder} order={item} />}
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
  progressRoute: { flexDirection: 'row', marginVertical: 8 },
  progressStep: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressLine: { position: 'absolute', top: 16, height: 2, backgroundColor: theme.colors.border, width: '50%' },
  progressLineLeft: { left: 0 },
  progressLineRight: { right: 0 },
  progressNode: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' },
  progressNodeCurrent: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  progressNodeCompleted: { opacity: 0.5 },
  finalStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: 0,
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
    marginBottom: theme.spacing.md,
    shadowColor: '#141d30',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
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
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photosScroll: { flexGrow: 0, height: 48 },
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

  screenTitle: {
    paddingHorizontal: theme.spacing.lg,
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

  statusText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },


});
