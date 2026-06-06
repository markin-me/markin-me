import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation,
  useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchCustomerOrder,
  isSameCachedValue,
  readCachedCustomerOrder,
  readCachedCustomerPassport,
  resolveAssetUrl,
  type CustomerOrder,
  type CustomerOrderItem,
} from '../../shared/api';
import { routes, type RootStackParamList } from '../../app/navigation/routes';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { AppText as Text } from '../../shared/ui';

type DiscountBreakdownEntry = {
  amount: number;
  promoCode: string | null;
  title: string;
};

function formatDateTime(value: unknown) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  const safeNumber = Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  return `${safeNumber.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

function roundPrice(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function getItemQuantity(item: CustomerOrderItem) {
  return Math.max(1, Number(item.qty || item.quantity || 1));
}

function getItemTitle(item: CustomerOrderItem) {
  return String(item.name || item.combo_title || 'Товар').trim() || 'Товар';
}

function getItemPhoto(item: CustomerOrderItem) {
  const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
  const selectionPhotos = Array.isArray(item.selections)
    ? item.selections.map((selection) => String(selection?.product_photo || '').trim()).filter(Boolean)
    : [];
  return resolveAssetUrl(selectionPhotos[0] || photos[0] || item.product_photo || item.photo || '');
}

function formatVariantLine(value: unknown, unit?: unknown, groupTitle?: unknown) {
  const text = String(value || '').trim();
  const unitText = String(unit || '').trim();
  const groupText = String(groupTitle || '').trim();
  return [text, unitText, groupText].filter(Boolean).join(' ').trim();
}

function formatDetailRecord(record: Record<string, unknown>) {
  const qty = Number(record.qty ?? record.quantity ?? 0);
  const title = String(record.title || record.name || record.ingredient_name || record.option_name || record.product_name || '').trim();
  const amount = String(record.amount || record.value || '').trim();
  const unit = String(record.unit || record.unit_short_title || record.unitLabel || '').trim();
  const prefix = qty > 0 ? `${qty} ` : '';
  return [prefix ? `${prefix}${unit}`.trim() : '', amount, title].filter(Boolean).join(' ').trim();
}

function getItemDetailLines(item: CustomerOrderItem) {
  if (item.type === 'combo') {
    const selections = Array.isArray(item.selections) ? item.selections : [];
    return selections.flatMap((selection) => {
      const productName = String(selection?.product_name || '').trim();
      const variantLine = formatVariantLine(selection?.variant_label, selection?.variant_unit, selection?.variant_group_title);
      const primaryLine = [variantLine, productName].filter(Boolean).join(' ').trim() || productName;
      const lines = primaryLine ? [`1 x ${primaryLine}`] : [];
      const ingredients = Array.isArray(selection?.ingredients_display) ? selection.ingredients_display : [];
      ingredients.forEach((ingredient) => {
        const line = formatDetailRecord(ingredient);
        if (line) lines.push(line);
      });
      return lines;
    });
  }

  const lines: string[] = [];
  const variants = Array.isArray(item.variants) ? item.variants : [];
  variants.slice(1).forEach((variant) => {
    const line = formatVariantLine(variant?.label || variant?.value, variant?.unit || variant?.unit_short_title || variant?.unitLabel, variant?.group_title);
    if (line) lines.push(line);
  });

  const fallbackVariant = formatVariantLine(item.variant_label, item.variant_unit, item.variant_group_title);
  if (!variants.length && fallbackVariant) lines.push(fallbackVariant);

  const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
  ingredients.forEach((ingredient) => {
    const line = formatDetailRecord(ingredient);
    if (line) lines.push(line);
  });

  const options = Array.isArray(item.options) ? item.options : [];
  options.forEach((option) => {
    if (Number(option?.qty ?? option?.quantity ?? 0) <= 0) return;
    const line = formatDetailRecord(option);
    if (line) lines.push(line);
  });

  return lines;
}

function getItemLineTotal(item: CustomerOrderItem) {
  const lineTotal = Number(item.line_total);
  return Number.isFinite(lineTotal) ? lineTotal : Number(item.price || 0);
}

function getItemOldLineTotal(item: CustomerOrderItem) {
  const discount = item.discount && typeof item.discount === 'object' ? item.discount as Record<string, unknown> : {};
  const discountOriginal = Number(discount.original_line_total || 0);
  if (discountOriginal > 0) return discountOriginal;
  const oldPrice = Number(item.old_price || 0);
  return oldPrice > 0 ? oldPrice * getItemQuantity(item) : Number(item.old_line_total || 0);
}

function sortOrderItems(items: CustomerOrderItem[] | undefined) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ index, item }))
    .sort((left, right) => {
      const leftAuto = Number(left.item?.auto_add || 0) === 1 || getItemTitle(left.item).toLowerCase() === 'приборы';
      const rightAuto = Number(right.item?.auto_add || 0) === 1 || getItemTitle(right.item).toLowerCase() === 'приборы';
      if (leftAuto && !rightAuto) return 1;
      if (!leftAuto && rightAuto) return -1;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function parseDiscounts(order: CustomerOrder) {
  const raw = order.discounts_json;
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDiscountSourceKind(entry: Record<string, unknown>) {
  const raw = String(entry.source_kind ?? entry.sourceKind ?? entry.source ?? entry.kind ?? '').trim().toLowerCase();
  if (raw === 'promo_code' || raw === 'reward_promo') return 'promo_code';
  if (raw === 'reward_discount' || raw === 'discount') return 'discount';
  const key = String(entry.key || '').trim().toLowerCase();
  if (key.startsWith('promo_')) return 'promo_code';
  if (key.startsWith('discount_')) return 'discount';
  return null;
}

function buildDiscountBreakdown(order: CustomerOrder): DiscountBreakdownEntry[] {
  const fallbackPromoCode = String(order.promo_code || '').trim() || null;
  return parseDiscounts(order)
    .map((rawEntry) => {
      const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry as Record<string, unknown> : {};
      const sourceKind = normalizeDiscountSourceKind(entry);
      const promoCode = sourceKind === 'promo_code'
        ? String(entry.promo_code || entry.code || fallbackPromoCode || '').trim() || null
        : null;
      return {
        amount: roundPrice(entry.discount_amount ?? entry.amount ?? 0),
        promoCode,
        title: String(entry.title || entry.name || 'Скидка').trim() || 'Скидка',
      };
    })
    .filter((entry) => entry.amount > 0);
}

function buildSummary(order: CustomerOrder) {
  const orderTotal = roundPrice(order.total_price || order.total || order.total_amount || 0);
  const deliveryCost = roundPrice(order.delivery_cost || 0);
  const storedDiscount = roundPrice(order.discount_amount || 0);
  const breakdown = buildDiscountBreakdown(order);
  const breakdownTotal = roundPrice(breakdown.reduce((sum, entry) => sum + entry.amount, 0));
  const discountAmount = breakdown.length > 0 ? breakdownTotal : storedDiscount;
  const subtotalBeforeDiscounts = roundPrice(Math.max(0, orderTotal - deliveryCost) + discountAmount);
  const changeFrom = Number(order.change_from || 0);
  return {
    breakdown,
    changeAmount: changeFrom > orderTotal ? roundPrice(changeFrom - orderTotal) : 0,
    changeFrom,
    deliveryCost,
    discountAmount,
    orderTotal,
    paymentTitle: String(order.payment_title || '').trim(),
    promoCode: String(order.promo_code || '').trim(),
    subtotalBeforeDiscounts,
  };
}

function formatDiscountTitle(entry: DiscountBreakdownEntry) {
  return entry.promoCode ? `${entry.title} (${entry.promoCode})` : entry.title;
}

function OrderItemCard({ item }: { item: CustomerOrderItem }) {
  const photo = getItemPhoto(item);
  const quantity = getItemQuantity(item);
  const title = getItemTitle(item);
  const details = getItemDetailLines(item);
  const total = getItemLineTotal(item);
  const oldTotal = getItemOldLineTotal(item);
  const showOld = oldTotal > total;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemPhotoWrap}>
        {photo ? <Image source={{ uri: photo }} style={styles.itemPhoto} /> : null}
      </View>
      <View style={styles.itemMain}>
        <Text numberOfLines={2} style={styles.itemTitle}>{quantity} x {title}</Text>
        {details.map((line, index) => (
          <Text key={`${line}-${index}`} numberOfLines={2} style={styles.itemDetail}>• {line}</Text>
        ))}
      </View>
      <View style={styles.itemPriceBox}>
        {showOld ? <Text style={styles.itemOldPrice}>{formatMoney(oldTotal)}</Text> : null}
        <Text style={styles.itemPrice}>{formatMoney(total)}</Text>
      </View>
    </View>
  );
}

export function OrderDetailsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'orderDetails'>>();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [discountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const orderId = Number(route.params.orderId || 0);

  useEffect(() => {
    let isActive = true;
    async function loadOrder() {
      setErrorText('');
      try {
        const passport = await readCachedCustomerPassport();
        const token = String(passport?.token || '').trim();
        if (!token) throw new Error('UNAUTHORIZED');
        const cachedOrder = await readCachedCustomerOrder(token, orderId);
        if (cachedOrder && isActive) {
          setOrder(cachedOrder);
          setLoading(false);
        }
        const nextOrder = await fetchCustomerOrder(token, orderId);
        if (isActive && !isSameCachedValue(nextOrder, cachedOrder)) setOrder(nextOrder);
      } catch {
        if (isActive) setErrorText('Не удалось загрузить детали заказа');
      } finally {
        if (isActive) setLoading(false);
      }
    }
    void loadOrder();
    return () => {
      isActive = false;
    };
  }, [orderId]);

  const items = useMemo(() => sortOrderItems(order?.items), [order?.items]);
  const summary = useMemo(() => (order ? buildSummary(order) : null), [order]);
  const hasDiscountBreakdown = Boolean(summary && summary.breakdown.length > 0);

  const closeDiscountOverlay = useCallback(() => {
    setDiscountOverlayVisible(false);
  }, []);

  const openDiscountOverlay = useCallback(() => {
    if (hasDiscountBreakdown) setDiscountOverlayVisible(true);
  }, [hasDiscountBreakdown]);

  const repeatOrder = useCallback(() => {
    Alert.alert('Повтор заказа', 'Повтор заказа будет доступен после подключения корзины.');
  }, []);

  if (loading) {
    return (
      <Screen edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!order || !summary) {
    return (
      <Screen edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.errorText}>{errorText || 'Заказ не найден'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" color={theme.colors.text} size={22} />
            </Pressable>
            <Text style={styles.headerTitle}>Детали заказа</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.orderHeader}>
            <Text style={styles.orderTitle}>Заказ #{order.id}</Text>
            {order.status_title ? <Text style={styles.statusText}>{order.status_title}</Text> : null}
          </View>

          <View style={styles.infoBlock}>
            <InfoRow label="Дата и время" value={formatDateTime(order.created_at)} />
            {order.method_title ? <InfoRow label="Способ доставки" value={String(order.method_title)} /> : null}
            {order.time_option_title ? <InfoRow label="Время доставки" value={String(order.time_option_title)} /> : null}
            {order.scheduled_at ? <InfoRow label="Запланировано на" value={formatDateTime(order.scheduled_at)} /> : null}
          </View>

          {order.address ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Адрес доставки</Text>
              <Text style={styles.addressText}>{order.address}</Text>
            </View>
          ) : null}

          {items.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Товары</Text>
              {items.map((item, index) => <OrderItemCard key={`${item.id || index}-${index}`} item={item} />)}
            </View>
          ) : null}

          {Number(order.cutlery_qty || 0) > 0 ? (
            <View style={styles.section}>
              <InfoRow label="Приборы" value={`${order.cutlery_qty} шт.`} />
            </View>
          ) : null}

          {order.comment ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Комментарий</Text>
              <Text style={styles.addressText}>{order.comment}</Text>
            </View>
          ) : null}

          <View style={styles.summaryBlock}>
            <Text style={styles.summaryTitle}>Суммы:</Text>
            {summary.paymentTitle ? <InfoRow label="Оплата" value={summary.paymentTitle} /> : null}
            {summary.changeAmount > 0 ? <InfoRow label="Сдача с" value={formatMoney(summary.changeFrom)} /> : null}
            {summary.changeAmount > 0 ? <InfoRow label="Сдача" value={formatMoney(summary.changeAmount)} /> : null}
            {summary.discountAmount > 0 ? <InfoRow label="Сумма товаров" value={formatMoney(summary.subtotalBeforeDiscounts)} /> : null}
            {summary.discountAmount > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.discountLabelWrap}>
                  <Text style={styles.infoLabel}>Скидка</Text>
                  {hasDiscountBreakdown ? (
                    <Pressable onPress={openDiscountOverlay} style={styles.infoButton}>
                      <Ionicons name="information" color={theme.colors.accent} size={12} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.discountValue}>-{formatMoney(summary.discountAmount)}</Text>
              </View>
            ) : null}
            {summary.promoCode ? <InfoRow label="Промокод" value={summary.promoCode} /> : null}
            <InfoRow label="Доставка" value={formatMoney(summary.deliveryCost)} />
            <View style={styles.summaryDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ИТОГО</Text>
              <Text style={styles.totalValue}>{formatMoney(summary.orderTotal)}</Text>
            </View>
            <Text style={styles.thanksText}>Спасибо за заказ!</Text>
          </View>
        </ScrollView>

        <View style={styles.bottomActions}>
          <Pressable onPress={repeatOrder} style={styles.repeatButton}>
            <Ionicons name="refresh" color={theme.colors.text} size={22} />
          </Pressable>
          <Pressable onPress={repeatOrder} style={styles.totalButton}>
            <Text style={styles.totalButtonText}>{formatMoney(summary.orderTotal)}</Text>
          </Pressable>
        </View>

        {discountOverlayVisible && summary.breakdown.length ? (
          <Pressable onPress={closeDiscountOverlay} style={styles.overlayBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.discountOverlay}>
              {summary.breakdown.map((entry, index) => (
                <View key={`${entry.title}-${index}`} style={styles.discountBreakdownRow}>
                  <Text numberOfLines={2} style={styles.discountBreakdownLabel}>{formatDiscountTitle(entry)}</Text>
                  <Text style={styles.discountBreakdownValue}>-{formatMoney(entry.amount)}</Text>
                </View>
              ))}
            </Pressable>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  addressText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  bottomActions: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: theme.spacing.md,
    left: 0,
    padding: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 110,
  },
  discountBreakdownLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  discountBreakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  discountBreakdownValue: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  discountLabelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  discountOverlay: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 6,
    left: theme.spacing.lg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
    right: theme.spacing.lg,
    top: 430,
  },
  discountValue: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
  },
  headerSpacer: {
    width: 42,
  },
  headerTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  infoBlock: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  infoButton: {
    alignItems: 'center',
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  infoLabel: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  infoValue: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  itemCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    shadowColor: '#141d30',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  itemDetail: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  itemMain: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemOldPrice: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  itemPhoto: {
    height: '100%',
    width: '100%',
  },
  itemPhotoWrap: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 72,
    overflow: 'hidden',
    width: 72,
  },
  itemPrice: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  itemPriceBox: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  orderHeader: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
  },
  orderTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  overlayBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 50,
  },
  repeatButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  section: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  statusText: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    color: theme.colors.muted,
    fontSize: 14,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  summaryBlock: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  summaryDivider: {
    backgroundColor: theme.colors.border,
    height: 1,
    marginVertical: theme.spacing.xs,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  thanksText: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  totalButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  totalButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  totalLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalValue: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '900',
  },
});
