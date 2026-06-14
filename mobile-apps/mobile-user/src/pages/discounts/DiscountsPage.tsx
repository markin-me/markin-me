import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  applyCheckoutDiscountSelection,
  clearCheckoutDiscountSelection,
  ensureCheckoutBenefitsState,
  readCheckoutBenefitsState,
} from '../../features/checkout';
import { readCachedCustomerPassport, type CustomerBenefitCard } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

function asText(value: unknown) {
  return String(value || '').trim();
}

function getBenefitsPageErrorText(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  if (/SQLITE_FULL|database or disk is full|code\s*13/i.test(message)) {
    return 'Не удалось сохранить выбор. Локальное хранилище приложения переполнено.';
  }
  return message || fallback;
}

function formatDiscountBadge(item: CustomerBenefitCard) {
  const direct = asText(item.badge_text);
  if (direct) return direct;

  const value = Number(item.discount_value ?? item.amount ?? 0);
  if (!(value > 0)) return '';

  const type = asText(item.discount_type).toLowerCase();
  if (type === 'percent') return `-${Math.round(value)}%`;
  return `-${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function getDiscountSource(item: CustomerBenefitCard): 'discount' | 'reward_discount' {
  return asText(item.source).toLowerCase() === 'reward_discount' ? 'reward_discount' : 'discount';
}

function getDiscountSelectionId(item: CustomerBenefitCard) {
  const source = getDiscountSource(item);
  const id = Number(source === 'reward_discount' ? item.reward_id || item.id : item.id);
  return id > 0 ? id : null;
}

function getDiscountTitle(item: CustomerBenefitCard) {
  return asText(item.title) || 'Скидка';
}

function getDiscountReason(item: CustomerBenefitCard) {
  return asText(item.disabled_reason_text || item.disabled_reason)
    || asText(item.status_text)
    || asText(item.apply_scope_text)
    || 'Скидка недоступна';
}

function DiscountCard({
  isApplying,
  isSelected,
  item,
  onToggle,
}: {
  isApplying: boolean;
  isSelected: boolean;
  item: CustomerBenefitCard;
  onToggle: (item: CustomerBenefitCard) => void;
}) {
  const title = getDiscountTitle(item);
  const badgeText = formatDiscountBadge(item) || 'Скидка';
  const reason = getDiscountReason(item);
  const disabled = isApplying || !getDiscountSelectionId(item) || item.is_applicable === false;

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <View style={styles.cardTop}>
        <Text numberOfLines={2} style={styles.cardTitle}>{title}</Text>
        <View style={styles.badges}>
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{badgeText}</Text>
          </View>
          <View style={styles.linkBadge}>
            <Ionicons name="link" color={theme.colors.primaryText} size={15} />
          </View>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.valueText}>{badgeText}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => onToggle(item)}
          style={[styles.applyButton, disabled && styles.applyButtonDisabled, isSelected && styles.applyButtonSelected]}
        >
          <Text style={[styles.applyButtonText, isSelected && styles.applyButtonTextSelected]}>
            {isSelected ? 'Выбрано' : 'Применить'}
          </Text>
        </Pressable>
      </View>

      {item.is_applicable === false || asText(item.disabled_reason_code) ? (
        <Text style={styles.disabledReason}>{reason}</Text>
      ) : null}
    </View>
  );
}

export function DiscountsPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [activeDiscountId, setActiveDiscountId] = useState<number | null>(null);
  const [activeDiscountSource, setActiveDiscountSource] = useState<'discount' | 'reward_discount' | null>(null);
  const [applyingDiscountId, setApplyingDiscountId] = useState<number | null>(null);

  const syncDiscounts = useCallback(async () => {
    const passport = await readCachedCustomerPassport();
    if (!passport?.token) {
      setItems([]);
      setErrorText('Войдите в профиль, чтобы увидеть скидки.');
      setLoading(false);
      return;
    }

    setErrorText('');
    try {
      const cachedState = await readCheckoutBenefitsState();
      const cachedItems = Array.isArray(cachedState.preview?.discounts)
        ? cachedState.preview.discounts
        : Array.isArray(cachedState.sourceBenefits?.discounts)
          ? cachedState.sourceBenefits.discounts
          : [];
      setItems(cachedItems);
      setActiveDiscountId(cachedState.currentSelection.discountId);
      setActiveDiscountSource(cachedState.currentSelection.discountSource);
      if (cachedItems.length || cachedState.preview || cachedState.sourceBenefits?.discounts?.length) {
        setLoading(false);
      }

      const freshState = await ensureCheckoutBenefitsState();
      const freshItems = Array.isArray(freshState.preview?.discounts)
        ? freshState.preview.discounts
        : Array.isArray(freshState.sourceBenefits?.discounts)
          ? freshState.sourceBenefits.discounts
          : [];
      setItems(freshItems);
      setActiveDiscountId(freshState.currentSelection.discountId);
      setActiveDiscountSource(freshState.currentSelection.discountSource);
    } catch (error) {
      setErrorText(getBenefitsPageErrorText(error, 'Не удалось загрузить скидки.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void syncDiscounts();
    }, [syncDiscounts]),
  );

  const toggleDiscount = useCallback(async (item: CustomerBenefitCard) => {
    const discountId = getDiscountSelectionId(item);
    const discountSource = getDiscountSource(item);
    if (!discountId || applyingDiscountId) return;

    setApplyingDiscountId(discountId);
    setErrorText('');
    try {
      const isSelected = activeDiscountId === discountId && activeDiscountSource === discountSource;
      const state = isSelected
        ? await clearCheckoutDiscountSelection()
        : await applyCheckoutDiscountSelection(item);
      const nextItems = Array.isArray(state.preview?.discounts)
        ? state.preview.discounts
        : Array.isArray(state.sourceBenefits?.discounts)
          ? state.sourceBenefits.discounts
          : items;
      setItems(nextItems);
      setActiveDiscountId(state.currentSelection.discountId);
      setActiveDiscountSource(state.currentSelection.discountSource);
    } catch (error) {
      setErrorText(getBenefitsPageErrorText(error, 'Не удалось применить скидку.'));
    } finally {
      setApplyingDiscountId(null);
    }
  }, [activeDiscountId, activeDiscountSource, applyingDiscountId, items]);

  const countText = useMemo(() => String(items.length), [items.length]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{countText}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.stateText}>Загрузка…</Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {!isLoading && !errorText && !items.length ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>У вас пока нет доступных скидок.</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.list}>
            {items.map((item, index) => {
              const discountId = getDiscountSelectionId(item);
              const discountSource = getDiscountSource(item);
              const isSelected = activeDiscountId === discountId && activeDiscountSource === discountSource;
              return (
                <DiscountCard
                  isApplying={applyingDiscountId === discountId}
                  isSelected={isSelected}
                  key={`${item.id || item.title || index}`}
                  item={item}
                  onToggle={toggleDiscount}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 118,
    paddingHorizontal: 16,
  },
  applyButtonDisabled: {
    opacity: 0.55,
  },
  applyButtonSelected: {
    backgroundColor: '#fff1e8',
  },
  applyButtonText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  applyButtonTextSelected: {
    color: theme.colors.accent,
  },
  badges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: '#fffaf6',
  },
  cardTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  cardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  content: {
    backgroundColor: '#f3f4f6',
    flexGrow: 1,
    padding: 12,
    paddingBottom: theme.spacing.xl,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#eef0f3',
    borderColor: '#d8dde3',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 8,
  },
  countText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledReason: {
    color: '#667085',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 10,
  },
  discountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 10,
  },
  discountBadgeText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  linkBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  list: {
    gap: 10,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  valueText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
