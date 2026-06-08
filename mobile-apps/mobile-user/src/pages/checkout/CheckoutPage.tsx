import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { cartLinesToStockCheckItems, getCartLineStockProductIds, readCartLines, type CartLine } from '../../features/cart';
import {
  readCheckoutCartSummary,
  readFulfillmentSelection,
  type CheckoutCartSummary,
  type FulfillmentSelection,
} from '../../features/checkout';
import { useProductStock } from '../../features/stock';
import {
  fetchPublicOrderConfig,
  checkOrderStock,
  fetchTenantStores,
  readCachedCustomerAddresses,
  readCachedCustomerPassport,
  readCachedPublicOrderConfig,
  readCachedTenantStores,
  type CustomerAddress,
  type PublicOrderConfig,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { AppText as Text, AppTextInput, BottomSheet } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';

type CheckoutOption = Record<string, unknown> & {
  code: string;
  description?: string | null;
  icon?: string | null;
  title: string;
};
type CheckoutSheet = 'cash' | 'at_time' | 'on_date' | null;
type CheckoutDraft = {
  cashChangeAmount: number | null;
  cashChangeMeta: string;
  cashChangeText: string;
  comment: string;
  selectedAtTime: string;
  selectedDateKey: string;
  selectedDateTime: string;
  selectedPaymentCode: string;
  selectedTimeCode: string;
};

let checkoutDraft: CheckoutDraft = {
  cashChangeAmount: null,
  cashChangeMeta: '',
  cashChangeText: '',
  comment: '',
  selectedAtTime: '',
  selectedDateKey: '',
  selectedDateTime: '',
  selectedPaymentCode: '',
  selectedTimeCode: 'asap',
};

function asText(value: unknown) {
  return String(value || '').trim();
}

function asOptions(value: unknown): CheckoutOption[] {
  return Array.isArray(value)
    ? value
      .map((item): CheckoutOption | null => {
        const source = item && typeof item === 'object' ? item as Record<string, unknown> : null;
        const code = asText(source?.code);
        const title = asText(source?.title || code);
        if (!code || !title) return null;
        return {
          ...source,
          code,
          description: asText(source?.description) || null,
          icon: asText(source?.icon) || null,
          title,
        };
      })
      .filter((item): item is CheckoutOption => !!item)
    : [];
}

function getLineTotal(line: CartLine) {
  return Math.max(0, Number(line.unitPrice || 0)) * Math.max(1, Number(line.quantity || 1));
}

function getCartTotal(lines: CartLine[]) {
  return lines
    .filter((line) => line.isUnavailable !== true)
    .reduce((sum, line) => sum + getLineTotal(line), 0);
}

function getPaymentMeta(option: CheckoutOption) {
  const code = option.code.toLowerCase();
  if (code === 'cash') return '';
  if (code === 'card' || code === 'sbp') return 'при получении';
  if (code === 'online') return 'онлайн';
  return option.description || '';
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateShort(date: Date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function findDateByKey(dates: Date[], key: string) {
  return dates.find((date) => getDateKey(date) === key) || dates[0] || new Date();
}

function formatDateChipTitle(date: Date) {
  return `${date.getDate()} ${date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}.`;
}

function formatDateChipMeta(index: number, date: Date) {
  if (index === 0) return 'Завтра';
  return date.toLocaleDateString('ru-RU', { weekday: 'long' });
}

function parseTimeToMinutes(value: unknown) {
  const match = asText(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function buildTimeSlots(option: CheckoutOption | undefined, date: Date | null) {
  const step = Math.max(15, Number(option?.step_minutes || 30) || 30);
  const lead = Math.max(0, Number(option?.lead_minutes || 0) || 0);
  const startMinutes = parseTimeToMinutes(option?.starts_at) ?? 0;
  const endMinutes = parseTimeToMinutes(option?.ends_at) ?? 24 * 60;
  const now = new Date();
  const selectedDate = date || now;
  const sameDay = selectedDate.toDateString() === now.toDateString();
  const minMinutes = sameDay
    ? Math.ceil((now.getHours() * 60 + now.getMinutes() + lead) / step) * step
    : startMinutes;
  const from = Math.max(startMinutes, minMinutes);
  const slots: string[] = [];

  for (let minutes = from; minutes < endMinutes; minutes += step) {
    slots.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
  }
  return slots;
}

function buildSelectableDates() {
  const today = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index + 1);
    return date;
  });
}

function getCashPresets(total: number) {
  const base = [2000, 5000].filter((value) => value > total);
  if (base.length) return base;
  return [Math.ceil((total + 1) / 1000) * 1000];
}

export function CheckoutPage() {
  const initialDates = useMemo(buildSelectableDates, []);
  const { mergeStockRows, refreshMany } = useProductStock();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartSummary, setCartSummary] = useState<CheckoutCartSummary | null>(null);
  const [selection, setSelection] = useState<FulfillmentSelection>({
    addressId: null,
    mode: 'delivery',
    pickupCity: null,
    pickupStoreId: null,
  });
  const [, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderConfig, setOrderConfig] = useState<PublicOrderConfig | null>(null);
  const [selectedTimeCode, setSelectedTimeCode] = useState(checkoutDraft.selectedTimeCode || 'asap');
  const [selectedPaymentCode, setSelectedPaymentCode] = useState(checkoutDraft.selectedPaymentCode);
  const [selectedAtTime, setSelectedAtTime] = useState(checkoutDraft.selectedAtTime);
  const [selectedDate, setSelectedDate] = useState(() => findDateByKey(initialDates, checkoutDraft.selectedDateKey));
  const [selectedDateTime, setSelectedDateTime] = useState(checkoutDraft.selectedDateTime);
  const [cashChangeText, setCashChangeText] = useState(checkoutDraft.cashChangeText);
  const [cashChangeMeta, setCashChangeMeta] = useState(checkoutDraft.cashChangeMeta);
  const [cashChangeAmount, setCashChangeAmount] = useState<number | null>(checkoutDraft.cashChangeAmount);
  const [cashCustomOpen, setCashCustomOpen] = useState(false);
  const [customChange, setCustomChange] = useState('');
  const [comment, setComment] = useState(checkoutDraft.comment);
  const [stockErrorText, setStockErrorText] = useState('');
  const [commentInputHeight, setCommentInputHeight] = useState(48);
  const [activeSheet, setActiveSheet] = useState<CheckoutSheet>(null);
  const [isLoading, setLoading] = useState(true);

  const loadCheckout = useCallback(async () => {
    setLoading(true);
    const passport = await readCachedCustomerPassport();
    const [cartLines, storedSelection, storedSummary, cachedStores, cachedConfig, cachedAddresses] = await Promise.all([
      readCartLines(),
      readFulfillmentSelection(),
      readCheckoutCartSummary(),
      readCachedTenantStores(),
      readCachedPublicOrderConfig(),
      passport?.token ? readCachedCustomerAddresses(passport.token) : Promise.resolve([]),
    ]);

    const activeCartLines = cartLines.filter((line) => line.isUnavailable !== true);
    const affectedProductIds = Array.from(new Set(activeCartLines.flatMap((line) => getCartLineStockProductIds(line))));
    if (affectedProductIds.length) await refreshMany(affectedProductIds).catch(() => null);
    const stockCheck = activeCartLines.length
      ? await checkOrderStock(cartLinesToStockCheckItems(activeCartLines)).catch(() => null)
      : null;
    if (Array.isArray(stockCheck?.stock_levels)) mergeStockRows(stockCheck.stock_levels);
    setLines(stockCheck?.available === false ? [] : activeCartLines);
    setStockErrorText(stockCheck?.available === false ? 'Больше нет' : '');
    setCartSummary(storedSummary);
    setSelection(storedSelection);
    setOrderConfig(cachedConfig || null);
    setAddresses(cachedAddresses);
    setLoading(false);

    const [, freshConfig] = await Promise.all([
      fetchTenantStores().catch(() => cachedStores || []),
      fetchPublicOrderConfig().catch(() => cachedConfig || null),
    ]);
    setOrderConfig(freshConfig || null);
  }, [mergeStockRows, refreshMany]);

  useEffect(() => {
    void loadCheckout();
  }, [loadCheckout]);

  const timeOptions = useMemo(() => {
    const options = asOptions(orderConfig?.timeOptions);
    return options.length ? options : [
      { code: 'asap', title: 'Быстрее' },
      { code: 'at_time', title: 'Ко времени' },
      { code: 'on_date', title: 'На дату' },
    ];
  }, [orderConfig]);
  const paymentOptions = useMemo(() => {
    const options = asOptions(orderConfig?.payments);
    return options.length ? options : [
      { code: 'cash', title: 'Наличные' },
      { code: 'card', title: 'Картой / QR' },
      { code: 'online', title: 'Онлайн' },
    ];
  }, [orderConfig]);
  const timeOptionByCode = useMemo(() => new Map(timeOptions.map((option) => [option.code, option])), [timeOptions]);
  const total = cartSummary?.total ?? getCartTotal(lines);
  const etaMinutes = Number(orderConfig?.deliveryEtaMinutes || 60) || 60;
  const dates = initialDates;
  const atTimeSlots = useMemo(() => buildTimeSlots(timeOptionByCode.get('at_time'), new Date()), [timeOptionByCode]);
  const dateTimeSlots = useMemo(() => buildTimeSlots(timeOptionByCode.get('on_date'), selectedDate), [selectedDate, timeOptionByCode]);

  useEffect(() => {
    if (isLoading) return;

    const hasSelectedTimeOption = timeOptions.some((option) => option.code === selectedTimeCode);
    if (!hasSelectedTimeOption) {
      setSelectedTimeCode('asap');
      setSelectedAtTime('');
      setSelectedDateTime('');
      return;
    }

    if (selectedTimeCode === 'at_time' && (!selectedAtTime || !atTimeSlots.includes(selectedAtTime))) {
      setSelectedTimeCode('asap');
      setSelectedAtTime('');
      return;
    }

    if (selectedTimeCode === 'on_date' && (!selectedDateTime || !dateTimeSlots.includes(selectedDateTime))) {
      setSelectedTimeCode('asap');
      setSelectedDateTime('');
    }
  }, [atTimeSlots, dateTimeSlots, isLoading, selectedAtTime, selectedDateTime, selectedTimeCode, timeOptions]);

  useEffect(() => {
    if (isLoading || !selectedPaymentCode) return;

    const hasSelectedPayment = paymentOptions.some((option) => option.code === selectedPaymentCode);
    const cashChangeInvalid = selectedPaymentCode === 'cash'
      && cashChangeAmount != null
      && !(cashChangeAmount > total);

    if (!hasSelectedPayment || cashChangeInvalid) {
      setSelectedPaymentCode('');
      setCashChangeText('');
      setCashChangeMeta('');
      setCashChangeAmount(null);
      setCashCustomOpen(false);
      setCustomChange('');
    }
  }, [cashChangeAmount, isLoading, paymentOptions, selectedPaymentCode, total]);

  useEffect(() => {
    if (isLoading) return;
    checkoutDraft = {
      cashChangeAmount,
      cashChangeMeta,
      cashChangeText,
      comment,
      selectedAtTime,
      selectedDateKey: getDateKey(selectedDate),
      selectedDateTime,
      selectedPaymentCode,
      selectedTimeCode,
    };
  }, [
    cashChangeAmount,
    cashChangeMeta,
    cashChangeText,
    comment,
    isLoading,
    selectedAtTime,
    selectedDate,
    selectedDateTime,
    selectedPaymentCode,
    selectedTimeCode,
  ]);

  const getTimeCardValue = (option: CheckoutOption) => {
    if (option.code === 'asap') return `${Math.round(etaMinutes)} мин`;
    if (option.code === 'at_time') return selectedAtTime || 'Выбрать время';
    if (option.code === 'on_date') return selectedDateTime ? formatDateShort(selectedDate) : 'Выбрать дату';
    return option.description || '';
  };

  const getTimeCardMeta = (option: CheckoutOption) => {
    if (option.code === 'at_time' && selectedAtTime) return 'Сегодня';
    if (option.code === 'on_date' && selectedDateTime) return selectedDateTime;
    return '';
  };

  const chooseTimeOption = (option: CheckoutOption) => {
    if (option.code === 'at_time') {
      setActiveSheet('at_time');
      return;
    }
    if (option.code === 'on_date') {
      setActiveSheet('on_date');
      return;
    }
    setSelectedTimeCode(option.code);
  };

  const choosePaymentOption = (option: CheckoutOption) => {
    if (option.code.toLowerCase() === 'cash') {
      setActiveSheet('cash');
      return;
    }
    setSelectedPaymentCode(option.code);
  };

  const applyCashChange = (value: string) => {
    setSelectedPaymentCode('cash');
    setCashChangeText(value);
    setCashChangeMeta('');
    setCashChangeAmount(null);
    setCashCustomOpen(false);
    setCustomChange('');
    setActiveSheet(null);
  };

  const applyCashChangeAmount = (amount: number) => {
    setSelectedPaymentCode('cash');
    setCashChangeText(formatPrice(amount));
    setCashChangeMeta(`Сдача ${formatPrice(amount - total)}`);
    setCashChangeAmount(amount);
    setCashCustomOpen(false);
    setCustomChange('');
    setActiveSheet(null);
  };

  const customChangeAmount = Number(customChange.replace(/[^\d]/g, ''));
  const customChangeValid = customChangeAmount > total;
  const applyCustomCashChange = () => {
    const amount = Number(customChange.replace(/[^\d]/g, ''));
    if (!(amount > total)) return;
    applyCashChangeAmount(amount);
  };

  const closeSheet = () => setActiveSheet(null);
  const submitOrder = useCallback(async () => {
    if (!lines.length) return;
    const affectedProductIds = Array.from(new Set(lines.flatMap((line) => getCartLineStockProductIds(line))));
    if (affectedProductIds.length) await refreshMany(affectedProductIds).catch(() => null);
    const stockCheck = await checkOrderStock(cartLinesToStockCheckItems(lines)).catch(() => null);
    if (Array.isArray(stockCheck?.stock_levels)) mergeStockRows(stockCheck.stock_levels);
    if (stockCheck?.available === false) {
      setStockErrorText('Больше нет');
      return;
    }
    setStockErrorText('');
  }, [lines, mergeStockRows, refreshMany]);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.root}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Дата и время получения</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                {timeOptions.map((option) => {
                  const active = option.code === selectedTimeCode;
                  const meta = getTimeCardMeta(option);
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => chooseTimeOption(option)}
                      style={[styles.optionCard, active && styles.optionCardActive]}
                    >
                      <Text style={[styles.optionTitle, active && styles.optionTextActive]}>{option.title}</Text>
                      <Text style={[styles.optionValue, active && styles.optionTextActive]}>{getTimeCardValue(option)}</Text>
                      {meta ? <Text style={[styles.optionMeta, active && styles.optionTextActive]}>{meta}</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Способ оплаты</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                {paymentOptions.map((option) => {
                  const active = option.code === selectedPaymentCode;
                  const meta = option.code === 'cash' && cashChangeText ? cashChangeMeta : getPaymentMeta(option);
                  const title = option.code === 'cash' && cashChangeText ? cashChangeText : option.title;
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => choosePaymentOption(option)}
                      style={[styles.optionCard, active && styles.optionCardActive]}
                    >
                      <Text style={[styles.optionTitle, active && styles.optionTextActive]}>{title}</Text>
                      {meta ? <Text style={[styles.optionMeta, active && styles.optionTextActive]}>{meta}</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.commentSurface}>
              <AppTextInput
                multiline
                onChangeText={setComment}
                onContentSizeChange={(event) => {
                  setCommentInputHeight(Math.max(48, event.nativeEvent.contentSize.height));
                }}
                placeholder="Введите комментарий к заказу"
                placeholderTextColor={theme.colors.muted}
                style={[styles.commentInput, { height: commentInputHeight }]}
                textAlignVertical="top"
                value={comment}
              />
            </View>
            {stockErrorText ? <Text style={styles.stockErrorText}>{stockErrorText}</Text> : null}
          </ScrollView>
        )}
        {!isLoading ? (
          <View style={styles.footer}>
            <Pressable disabled={!lines.length || !!stockErrorText} onPress={submitOrder} style={[styles.orderButton, (!lines.length || !!stockErrorText) && styles.orderButtonDisabled]}>
              <Text style={styles.orderButtonText}>Заказать</Text>
              <Text style={styles.orderButtonText}>· {formatPrice(total)}</Text>
            </Pressable>
          </View>
        ) : null}

        <BottomSheet onClose={closeSheet} title="Сдача" visible={activeSheet === 'cash'}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetHint}>Сумма заказа {formatPrice(total)}</Text>
            <Text style={styles.sheetTitle}>С какой суммы подготовить сдачу?</Text>
            <Pressable onPress={() => applyCashChange('Без сдачи')} style={styles.sheetButton}>
              <Text style={styles.sheetButtonText}>Без сдачи</Text>
            </Pressable>
            {getCashPresets(total).map((value) => (
              <Pressable key={value} onPress={() => applyCashChangeAmount(value)} style={styles.sheetButton}>
                <Text style={styles.sheetButtonText}>{formatPrice(value)}</Text>
              </Pressable>
            ))}
            {cashCustomOpen ? (
              <View style={styles.customChangeRow}>
                <AppTextInput
                  autoFocus
                  keyboardType="number-pad"
                  onChangeText={setCustomChange}
                  placeholder={`Больше ${Math.round(total)}`}
                  placeholderTextColor={theme.colors.muted}
                  style={styles.customChangeInput}
                  value={customChange}
                />
                <Pressable
                  disabled={!customChangeValid}
                  onPress={applyCustomCashChange}
                  style={[styles.customChangeButton, customChangeValid && styles.customChangeButtonActive]}
                >
                  <Text style={styles.customChangeButtonText}>✓</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setCashCustomOpen(true)} style={styles.sheetButton}>
                <Text style={styles.sheetButtonText}>Другая сумма</Text>
              </Pressable>
            )}
          </View>
        </BottomSheet>

        <BottomSheet onClose={closeSheet} title="Ко времени" visible={activeSheet === 'at_time'}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetHint}>Выберите удобный интервал получения</Text>
            <Text style={styles.sheetTitle}>Сегодня</Text>
            {atTimeSlots.length ? atTimeSlots.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => {
                  setSelectedTimeCode('at_time');
                  setSelectedAtTime(slot);
                  setActiveSheet(null);
                }}
                style={[styles.sheetButton, slot === selectedAtTime && styles.sheetButtonActive]}
              >
                <Text style={[styles.sheetButtonText, slot === selectedAtTime && styles.sheetButtonTextActive]}>{slot}</Text>
              </Pressable>
            )) : (
              <Text style={styles.emptyText}>Сейчас доступных интервалов нет</Text>
            )}
          </View>
        </BottomSheet>

        <BottomSheet onClose={closeSheet} title="На дату" visible={activeSheet === 'on_date'}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetHint}>Сначала выберите дату, затем время получения</Text>
            <Text style={styles.sheetTitle}>Дата</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
              {dates.map((date, index) => {
                const active = date.toDateString() === selectedDate.toDateString();
                return (
                  <Pressable
                    key={date.toISOString()}
                    onPress={() => {
                      setSelectedDate(date);
                      setSelectedDateTime('');
                    }}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                  >
                    <Text style={[styles.dateChipTitle, active && styles.optionTextActive]}>{formatDateChipTitle(date)}</Text>
                    <Text style={[styles.dateChipMeta, active && styles.optionTextActive]}>{formatDateChipMeta(index, date)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.sheetTitle}>Время</Text>
            {dateTimeSlots.length ? dateTimeSlots.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => {
                  setSelectedTimeCode('on_date');
                  setSelectedDateTime(slot);
                  setActiveSheet(null);
                }}
                style={[styles.sheetButton, slot === selectedDateTime && styles.sheetButtonActive]}
              >
                <Text style={[styles.sheetButtonText, slot === selectedDateTime && styles.sheetButtonTextActive]}>{slot}</Text>
              </Pressable>
            )) : (
              <Text style={styles.emptyText}>Для этой даты интервалов пока нет</Text>
            )}
          </View>
        </BottomSheet>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  commentInput: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    padding: 0,
    paddingVertical: 14,
  },
  commentSurface: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
  },
  content: {
    gap: theme.spacing.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  customChangeButton: {
    alignItems: 'center',
    backgroundColor: '#fdba74',
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 58,
  },
  customChangeButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  customChangeButtonText: {
    color: theme.colors.primaryText,
    fontSize: 21,
    fontWeight: '900',
  },
  customChangeInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    height: 50,
    padding: 0,
    textAlign: 'center',
  },
  customChangeRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  dateChip: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    marginRight: theme.spacing.sm,
    minWidth: 118,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  dateChipActive: {
    backgroundColor: theme.colors.accent,
  },
  dateChipMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  dateChipTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  dateRow: {
    paddingRight: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: theme.spacing.md,
  },
  footer: {
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    padding: theme.spacing.lg,
  },
  optionCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 90,
    justifyContent: 'center',
    marginRight: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    width: 156,
  },
  optionCardActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  optionMeta: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  optionRow: {
    paddingRight: theme.spacing.lg,
  },
  optionTextActive: {
    color: theme.colors.primaryText,
  },
  optionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  optionValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  orderButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 52,
  },
  orderButtonDisabled: {
    opacity: 0.45,
  },
  orderButtonText: {
    color: theme.colors.primaryText,
    fontSize: 17,
    fontWeight: '900',
  },
  stockErrorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  section: {
    gap: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  sheetButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  sheetButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  sheetButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sheetButtonTextActive: {
    color: theme.colors.primaryText,
  },
  sheetContent: {
    gap: theme.spacing.md,
  },
  sheetHint: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
});
