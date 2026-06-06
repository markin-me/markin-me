import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import {
  clearCartLines,
  formatCartIngredientLine,
  formatCartOptionLine,
  formatCartVariantLine,
  readCartLines,
  removeCartLine,
  updateCartLineQuantity,
  type CartLine,
} from '../../features/cart';
import {
  readFulfillmentSelection,
  saveFulfillmentSelection,
  type FulfillmentMode,
  type FulfillmentSelection,
} from '../../features/checkout';
import {
  fetchCustomerAddresses,
  fetchPublicOrderConfig,
  fetchTenantStores,
  readCachedCustomerPassport,
  resolvePublicAddress,
  type CustomerAddress,
  type PublicOrderConfig,
  type TenantStore,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { AppText as Text } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';

type CartNavigation = NativeStackNavigationProp<RootStackParamList>;
type DeliveryMeta = {
  cost: number | null;
  etaMinutes: number | null;
  freeFrom: number | null;
  hoursText: string;
};
type DeliveryProgressState = {
  free: boolean;
  label: string;
  value: number;
};

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function formatAddressLine(address: CustomerAddress | null) {
  if (!address) return '';
  const normalized = String(address.address_normalized_display || '').trim();
  if (normalized) return normalized;
  return [address.city, address.street, address.house, address.apartment ? `кв. ${address.apartment}` : '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function getLocalDayIndex(timezone: unknown) {
  const offset = Number(timezone);
  if (!Number.isFinite(offset)) return new Date().getDay();
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + offset * 60 * 60 * 1000).getDay();
}

function formatHoursRange(hours: Array<Record<string, unknown>> | undefined, timezone?: unknown) {
  if (!Array.isArray(hours) || !hours.length) return '';
  const today = getLocalDayIndex(timezone);
  const row = hours.find((item) => Number(item.day_of_week || 0) === today);
  if (!row || row.is_closed === true || row.is_closed === 1) return '';
  const opens = String(row.opens_at || '').slice(0, 5);
  const closes = String(row.closes_at || '').slice(0, 5);
  return opens && closes ? `${opens} - ${closes}` : '';
}

function formatStoreHours(store: TenantStore | null) {
  return formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : [], store?.timezone);
}

function getConfigHours(config: PublicOrderConfig | null, key: string) {
  const value = config?.[key];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function getConfigNumber(config: PublicOrderConfig | null, key: string) {
  const value = Number(config?.[key]);
  return Number.isFinite(value) ? value : null;
}

function findDeliveryStore(stores: TenantStore[], address: CustomerAddress | null) {
  const candidateIds = [
    Number(address?.delivery_store_id || 0),
    Number(address?.store_id || 0),
  ].filter((id) => Number.isFinite(id) && id > 0);
  for (const id of candidateIds) {
    const store = stores.find((item) => Number(item.id || 0) === id);
    if (store) return store;
  }
  const city = String(address?.city || '').trim().toLowerCase();
  if (!city) return stores[0] || null;
  const cityStores = stores.filter((store) => String(store.city || '').trim().toLowerCase() === city);
  return cityStores[0] || stores[0] || null;
}

function formatDeliveryHours(config: PublicOrderConfig | null, store: TenantStore | null) {
  const storeDeliveryHours = Array.isArray(store?.delivery_hours) ? store.delivery_hours : [];
  const range = formatHoursRange(storeDeliveryHours, store?.timezone)
    || formatHoursRange(getConfigHours(config, 'storeDeliveryHours'), config?.storeTimezone)
    || formatHoursRange(Array.isArray(store?.storeHours) ? store.storeHours : [], store?.timezone)
    || formatHoursRange(getConfigHours(config, 'storeHours'), config?.storeTimezone);
  return range ? `Доставка с ${range}` : '';
}

function formatEta(minutes: number | null) {
  if (minutes != null && minutes > 0) return `За ${Math.round(minutes)} минут`;
  return 'За 40-80 минут';
}

function buildDeliveryProgress(subtotal: number, meta: DeliveryMeta | null): DeliveryProgressState | null {
  if (!meta) return null;
  const freeFrom = Number(meta.freeFrom || 0);
  const cost = Number(meta.cost || 0);
  if (!(freeFrom > 0)) {
    return {
      free: cost <= 0,
      label: cost > 0 ? `Доставка ${formatPrice(cost)}` : 'Бесплатная доставка',
      value: cost > 0 ? 0 : 100,
    };
  }
  const value = Math.max(0, Math.min(100, subtotal / freeFrom * 100));
  if (value >= 100) {
    return { free: true, label: 'Бесплатная доставка', value: 100 };
  }
  const left = Math.max(0, Math.ceil(freeFrom - subtotal));
  return {
    free: false,
    label: `${cost > 0 ? `Доставка ${formatPrice(cost)}. ` : ''}Еще ${formatPrice(left)}`,
    value,
  };
}

function findSelectedAddress(addresses: CustomerAddress[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.addressId);
  if (selectedId) {
    const selected = addresses.find((address) => toPositiveId(address.id) === selectedId);
    if (selected) return selected;
  }
  return addresses.find((address) => address.is_default === true || address.is_default === 1 || address.is_default === '1')
    || addresses[0]
    || null;
}

function findSelectedStore(stores: TenantStore[], selection: FulfillmentSelection) {
  const selectedId = toPositiveId(selection.pickupStoreId);
  if (selectedId) {
    const selected = stores.find((store) => toPositiveId(store.id) === selectedId);
    if (selected) return selected;
  }
  const city = String(selection.pickupCity || '').trim();
  const cityStores = city
    ? stores.filter((store) => String(store.city || '').trim() === city)
    : stores;
  return cityStores[0] || stores[0] || null;
}

function getLineTotal(line: CartLine) {
  return Math.max(0, Number(line.unitPrice || 0)) * Math.max(1, Number(line.quantity || 1));
}

function getLineOldTotal(line: CartLine) {
  const oldUnit = Number(line.oldUnitPrice || 0);
  return oldUnit > line.unitPrice ? oldUnit * Math.max(1, Number(line.quantity || 1)) : 0;
}

function getDiscountPercent(total: number, oldTotal: number) {
  if (!(oldTotal > total) || !(oldTotal > 0)) return 0;
  return Math.round((1 - total / oldTotal) * 100);
}

function getCartLineTitle(line: CartLine) {
  const variantLine = formatCartVariantLine(line.variant);
  return [variantLine, line.title].filter(Boolean).join(' ').trim() || line.title;
}

function getCartLineDetails(line: CartLine) {
  if (line.type === 'combo' && line.comboSelections?.length) {
    return line.comboSelections.flatMap((selection) => {
      const ingredients = Array.isArray(selection.ingredients)
        ? selection.ingredients.map(formatCartIngredientLine).filter(Boolean)
        : [];
      return [`1 x ${selection.productName}`, ...ingredients];
    });
  }
  if (line.type === 'combo' && line.detailLines?.length) return line.detailLines;
  const structuredLines = [
    ...(Array.isArray(line.ingredients) ? line.ingredients.map(formatCartIngredientLine) : []),
    ...(Array.isArray(line.options) ? line.options.map(formatCartOptionLine) : []),
  ].filter(Boolean);
  return structuredLines.length ? structuredLines : line.detailLines || [];
}

export function CartPage() {
  const navigation = useNavigation<CartNavigation>();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [stores, setStores] = useState<TenantStore[]>([]);
  const [orderConfig, setOrderConfig] = useState<PublicOrderConfig | null>(null);
  const [selection, setSelection] = useState<FulfillmentSelection>({
    addressId: null,
    mode: 'delivery',
    pickupCity: null,
    pickupStoreId: null,
  });
  const [deliveryMeta, setDeliveryMeta] = useState<DeliveryMeta | null>(null);
  const [lastDeliveryProgress, setLastDeliveryProgress] = useState<DeliveryProgressState | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [clearConfirm, setClearConfirm] = useState(false);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + getLineTotal(line), 0), [lines]);
  const selectedAddress = useMemo(() => findSelectedAddress(addresses, selection), [addresses, selection]);
  const selectedStore = useMemo(() => findSelectedStore(stores, selection), [selection, stores]);
  const selectedDeliveryStore = useMemo(() => findDeliveryStore(stores, selectedAddress), [selectedAddress, stores]);
  const isDelivery = selection.mode === 'delivery';
  const visibleDeliveryProgress = isDelivery ? buildDeliveryProgress(subtotal, deliveryMeta) || lastDeliveryProgress : null;

  const loadCart = useCallback(async () => {
    setLoading(true);
    const [nextLines, nextSelection, passport, nextStores, nextOrderConfig] = await Promise.all([
      readCartLines(),
      readFulfillmentSelection(),
      readCachedCustomerPassport(),
      fetchTenantStores().catch(() => []),
      fetchPublicOrderConfig().catch(() => null),
    ]);
    const nextAddresses = passport?.token
      ? await fetchCustomerAddresses(passport.token).catch(() => passport.addresses || [])
      : passport?.addresses || [];

    setLines(nextLines);
    setSelection(nextSelection);
    setAddresses(nextAddresses);
    setStores(nextStores);
    setOrderConfig(nextOrderConfig);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCart();
    }, [loadCart]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function resolveDelivery() {
        if (!isDelivery || !selectedAddress) {
          return;
        }
        const resolved = await resolvePublicAddress({
          address_context_locality: selectedAddress.address_context_locality || null,
          address_normalized_display: selectedAddress.address_normalized_display || formatAddressLine(selectedAddress),
          address_ref: selectedAddress.address_ref || null,
          city: selectedAddress.city || null,
          house: selectedAddress.house || null,
          lat: selectedAddress.lat || null,
          lng: selectedAddress.lng || null,
          selected_object_type: selectedAddress.selected_object_type || null,
          street: selectedAddress.street || null,
          subtotal,
        }).catch(() => null);
        if (cancelled) return;
        const nextMeta: DeliveryMeta = {
          cost: resolved?.delivery_cost != null ? Number(resolved.delivery_cost) : getConfigNumber(orderConfig, 'delivery_cost'),
          etaMinutes: Number((resolved as Record<string, unknown> | null)?.eta_minutes ?? orderConfig?.eta_minutes ?? NaN),
          freeFrom: resolved?.free_delivery_from != null ? Number(resolved.free_delivery_from) : getConfigNumber(orderConfig, 'free_delivery_from'),
          hoursText: formatDeliveryHours(orderConfig, selectedDeliveryStore),
        };
        if (!Number.isFinite(Number(nextMeta.etaMinutes))) nextMeta.etaMinutes = null;
        setDeliveryMeta(nextMeta);
        const nextProgress = buildDeliveryProgress(subtotal, nextMeta);
        if (nextProgress) setLastDeliveryProgress(nextProgress);
      }
      void resolveDelivery();
      return () => {
        cancelled = true;
      };
    }, [isDelivery, orderConfig, selectedAddress, selectedDeliveryStore, subtotal]),
  );

  const changeMode = useCallback(async (mode: FulfillmentMode) => {
    const pickupStoreId = mode === 'pickup'
      ? selection.pickupStoreId || toPositiveId(selectedStore?.id)
      : null;
    const addressId = mode === 'delivery'
      ? selection.addressId || toPositiveId(selectedAddress?.id)
      : null;
    const nextSelection = await saveFulfillmentSelection({
      ...selection,
      addressId,
      mode,
      pickupStoreId,
    });
    setSelection(nextSelection);
  }, [selectedAddress?.id, selectedStore?.id, selection]);

  const changeQuantity = useCallback(async (line: CartLine, delta: number) => {
    const nextLines = await updateCartLineQuantity(line.id, line.quantity + delta);
    setLines(nextLines);
  }, []);

  const removeLine = useCallback(async (line: CartLine) => {
    const nextLines = await removeCartLine(line.id);
    setLines(nextLines);
  }, []);

  const clearCart = useCallback(async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    const nextLines = await clearCartLines();
    setLines(nextLines);
    setClearConfirm(false);
  }, [clearConfirm]);

  useEffect(() => {
    if (!clearConfirm) return undefined;
    const timer = setTimeout(() => setClearConfirm(false), 6500);
    return () => clearTimeout(timer);
  }, [clearConfirm]);

  const openAddresses = useCallback(async () => {
    await saveFulfillmentSelection(selection);
    navigation.navigate(routes.addresses);
  }, [navigation, selection]);

  const openLine = useCallback((line: CartLine) => {
    if (line.type === 'combo') {
      navigation.navigate(routes.combo, { cartLineId: line.id, comboId: line.sourceId });
      return;
    }
    navigation.navigate(routes.product, { cartLineId: line.id, productId: line.sourceId });
  }, [navigation]);

  const renderLine = (line: CartLine) => {
    const total = getLineTotal(line);
    const oldTotal = getLineOldTotal(line);
    const discountPercent = getDiscountPercent(total, oldTotal);
    const title = getCartLineTitle(line);
    const detailLines = getCartLineDetails(line);
    const comboPhotos = line.type === 'combo' && Array.isArray(line.photoUrls)
      ? line.photoUrls.filter(Boolean).slice(0, 4)
      : [];
    return (
      <Pressable key={line.id} onPress={() => openLine(line)} style={[styles.itemCard, line.isUnavailable ? styles.itemUnavailable : null]}>
        {comboPhotos.length ? (
          <View style={styles.comboImageGrid}>
            {[0, 1, 2, 3].map((index) => {
              const uri = comboPhotos[index];
              return (
                <View key={index} style={styles.comboImageCell}>
                  {uri ? <Image resizeMode="cover" source={{ uri }} style={styles.comboImage} /> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.itemImageWrap}>
            {line.photoUrl ? (
            <Image resizeMode="cover" source={{ uri: line.photoUrl }} style={styles.itemImage} />
            ) : (
            <View style={styles.itemImagePlaceholder}>
              <Ionicons name={line.type === 'combo' ? 'grid-outline' : 'restaurant-outline'} color={theme.colors.accent} size={26} />
            </View>
            )}
          </View>
        )}
        <View style={styles.itemMain}>
          <Text numberOfLines={2} style={styles.itemTitle}>{line.quantity} x {title}</Text>
          {detailLines.length ? (
            <View style={styles.itemDetails}>
              {detailLines.map((detail, index) => {
                const prefix = detail.trim().startsWith('1 x ') ? '' : '• ';
                return (
                  <Text key={`${index}:${detail}`} numberOfLines={1} style={styles.itemDetail}>{prefix}{detail}</Text>
                );
              })}
            </View>
          ) : null}
          <View style={styles.itemBottom}>
            <View style={styles.priceGroup}>
              <View style={styles.priceRow}>
                <Text style={styles.itemPrice}>{formatPrice(total)}</Text>
                {oldTotal > total ? <Text style={styles.itemOldPrice}>{formatPrice(oldTotal)}</Text> : null}
              </View>
              {discountPercent > 0 ? (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>-{discountPercent}%</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.qtyPill}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  return line.quantity <= 1 ? removeLine(line) : changeQuantity(line, -1);
                }}
                style={styles.qtyButton}
              >
                <Ionicons name="remove" color={theme.colors.text} size={16} />
              </Pressable>
              <Text style={styles.qtyText}>{line.quantity}</Text>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  return changeQuantity(line, 1);
                }}
                style={styles.qtyButton}
              >
                <Ionicons name="add" color={theme.colors.text} size={16} />
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.modeCard}>
              <View style={styles.toggle}>
                {(['delivery', 'pickup'] as FulfillmentMode[]).map((mode) => {
                  const active = selection.mode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => changeMode(mode)}
                      style={[styles.toggleButton, active && styles.toggleButtonActive]}
                    >
                      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                        {mode === 'delivery' ? 'Доставка' : 'Самовывоз'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={openAddresses} style={styles.addressRow}>
                <Ionicons name={isDelivery ? 'location' : 'storefront'} color={theme.colors.accent} size={21} />
                <Text numberOfLines={1} style={styles.addressText}>
                  {isDelivery
                    ? formatAddressLine(selectedAddress) || 'Укажите адрес'
                    : String(selectedStore?.address || selectedStore?.name || 'Выберите точку самовывоза')}
                </Text>
                <Ionicons name="chevron-forward" color={theme.colors.text} size={20} />
              </Pressable>

              <View style={styles.metaWrap}>
                <View style={styles.metaRow}>
                  <Ionicons name={isDelivery ? 'car' : 'bag-handle'} color={theme.colors.accent} size={16} />
                  <Text style={styles.metaText}>
                    {isDelivery ? formatEta(deliveryMeta?.etaMinutes ?? null) : 'Самовывоз из выбранной точки'}
                  </Text>
                  {isDelivery && deliveryMeta?.freeFrom ? (
                    <Text style={styles.metaSide}>Бесплатно от {formatPrice(deliveryMeta.freeFrom)}</Text>
                  ) : isDelivery && deliveryMeta?.cost != null ? (
                    <Text style={styles.metaSide}>Доставка {formatPrice(deliveryMeta.cost)}</Text>
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="time" color={theme.colors.accent} size={16} />
                  <Text style={styles.metaText}>
                    {isDelivery
                      ? deliveryMeta?.hoursText || 'Время доставки уточняется'
                      : formatStoreHours(selectedStore) || 'Время работы уточняется'}
                  </Text>
                </View>
              </View>

              {visibleDeliveryProgress ? (
                <View style={styles.progressSurface}>
                  <View style={[styles.progressFill, { width: `${visibleDeliveryProgress.value}%` }]} />
                  <Text style={[styles.progressLabel, visibleDeliveryProgress.free && styles.progressLabelFree]}>
                    {visibleDeliveryProgress.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.itemsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Товары</Text>
                {lines.length ? (
                  <Pressable onPress={clearCart} style={[styles.clearButton, clearConfirm && styles.clearButtonConfirm]}>
                    {clearConfirm ? (
                      <Text numberOfLines={1} style={styles.clearConfirmText}>Очистить корзину?</Text>
                    ) : (
                      <Ionicons name="trash-outline" color={theme.colors.text} size={20} />
                    )}
                  </Pressable>
                ) : null}
              </View>
              {lines.length ? (
                <View style={styles.itemsList}>
                  {lines.map(renderLine)}
                </View>
              ) : (
                <View style={styles.emptyCart}>
                  <Ionicons name="cart-outline" color={theme.colors.muted} size={34} />
                  <Text style={styles.emptyTitle}>Корзина пуста</Text>
                  <Text style={styles.emptyText}>Добавьте товары из каталога</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  addressText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  clearButtonConfirm: {
    paddingHorizontal: theme.spacing.md,
    width: 'auto',
  },
  clearConfirmText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  comboImage: {
    height: '100%',
    width: '100%',
  },
  comboImageCell: {
    backgroundColor: theme.colors.mutedBackground,
    height: '50%',
    overflow: 'hidden',
    width: '50%',
  },
  comboImageGrid: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 70,
    overflow: 'hidden',
    width: 70,
  },
  content: {
    paddingBottom: theme.sizes.tabBarHeight + theme.spacing.xl,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: theme.spacing.sm,
  },
  itemBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  itemDetail: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  itemDetails: {
    marginTop: theme.spacing.xs,
  },
  itemImage: {
    height: '100%',
    width: '100%',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    flex: 1,
    justifyContent: 'center',
  },
  itemImageWrap: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 70,
    overflow: 'hidden',
    width: 70,
  },
  itemMain: {
    flex: 1,
  },
  itemOldPrice: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'line-through',
  },
  itemPrice: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  itemUnavailable: {
    opacity: 0.55,
  },
  itemsList: {
    gap: theme.spacing.md,
  },
  itemsSection: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.text,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metaSide: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  metaText: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  metaWrap: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  modeCard: {
    backgroundColor: theme.colors.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  priceRow: {
    gap: 1,
  },
  priceGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: theme.spacing.sm,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  progressLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.sm,
  },
  progressLabelFree: {
    color: theme.colors.accent,
  },
  progressSurface: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  qtyButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 30,
  },
  qtyPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: 28,
  },
  qtyText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  discountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 10,
  },
  discountText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  toggle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    padding: 3,
  },
  toggleButton: {
    borderRadius: theme.radius.pill,
    minWidth: 120,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  toggleText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  toggleTextActive: {
    color: theme.colors.primaryText,
  },
});
