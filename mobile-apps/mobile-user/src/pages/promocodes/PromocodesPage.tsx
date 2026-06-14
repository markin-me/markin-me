import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  applyCheckoutPromoCardSelection,
  clearCheckoutPromoSelection,
  ensureCheckoutBenefitsState,
  readCheckoutBenefitsState,
  type CheckoutBenefitsState,
  type CheckoutBenefitsSelection,
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

function normalizePromoCode(value: unknown) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function formatPromoBadge(item: CustomerBenefitCard) {
  const direct = asText(item.badge_text);
  if (direct) return direct;

  const value = Number(item.discount_value ?? item.amount ?? 0);
  if (!(value > 0)) return '';

  const type = asText(item.discount_type).toLowerCase();
  if (type === 'percent') return `-${Math.round(value)}%`;
  return `-${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function getPromoSource(item: CustomerBenefitCard): 'promo_code' | 'reward_promo' {
  return asText(item.source).toLowerCase() === 'reward_promo' ? 'reward_promo' : 'promo_code';
}

function getPromoKey(item: CustomerBenefitCard) {
  const source = getPromoSource(item);
  if (source === 'reward_promo') {
    const rewardId = Number(item.reward_id || item.id || 0);
    return rewardId > 0 ? `${source}:${rewardId}` : '';
  }
  const code = normalizePromoCode(item.code);
  return code ? `${source}:${code}` : '';
}

function getSelectionPromoKey(selection: CheckoutBenefitsSelection) {
  if (selection.promoSource === 'reward_promo') {
    return selection.promoRewardId ? `reward_promo:${selection.promoRewardId}` : '';
  }
  return selection.promoCode ? `promo_code:${normalizePromoCode(selection.promoCode)}` : '';
}

function getPromoReason(item: CustomerBenefitCard) {
  return asText(item.disabled_reason_text || item.disabled_reason)
    || asText(item.progress_text)
    || asText(item.status_text)
    || asText(item.apply_scope_text)
    || '';
}

function isVisiblePromo(item: CustomerBenefitCard) {
  const usageLimit = Number(item.usage_limit || 0);
  const usageCount = Number(item.usage_count || 0);
  return usageLimit <= 0 || usageCount < usageLimit;
}

function PromocodeCard({
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
  const code = normalizePromoCode(item.code) || '—';
  const title = asText(item.title) || 'Промокод';
  const badgeText = formatPromoBadge(item);
  const reasonText = getPromoReason(item);
  const disabled = isApplying || (!isSelected && (item.is_applicable === false || !getPromoKey(item)));

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <View style={styles.cardTop}>
        <Text numberOfLines={2} style={styles.cardTitle}>{title}</Text>
        <View style={styles.badges}>
          {badgeText ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{badgeText}</Text>
            </View>
          ) : null}
          <View style={styles.linkBadge}>
            <Ionicons name="link" color={theme.colors.primaryText} size={15} />
          </View>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.codeText}>{code}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => onToggle(item)}
          style={[styles.applyButton, disabled && styles.applyButtonDisabled, isSelected && styles.applyButtonSelected]}
        >
          <Text style={[styles.applyButtonText, disabled && styles.applyButtonTextDisabled, isSelected && styles.applyButtonTextSelected]}>
            {isSelected ? 'Выбрано' : 'Применить'}
          </Text>
        </Pressable>
      </View>

      {reasonText ? (
        <Text style={[styles.disabledReason, item.is_applicable !== false && styles.availableReason]}>{reasonText}</Text>
      ) : null}
    </View>
  );
}

export function PromocodesPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [activePromoKey, setActivePromoKey] = useState('');
  const [applyingPromoKey, setApplyingPromoKey] = useState('');

  const setStateFromBenefits = useCallback((state: CheckoutBenefitsState) => {
    const nextItems = Array.isArray(state.preview?.promo_codes)
      ? state.preview.promo_codes
      : Array.isArray(state.sourceBenefits?.promo_codes)
        ? state.sourceBenefits.promo_codes
        : [];
    setItems(nextItems);
    setActivePromoKey(getSelectionPromoKey(state.currentSelection));
  }, []);

  const loadPromocodes = useCallback(async () => {
    const passport = await readCachedCustomerPassport();
    if (!passport?.token) {
      setItems([]);
      setErrorText('Войдите в профиль, чтобы увидеть промокоды.');
      setLoading(false);
      return;
    }

    setErrorText('');
    try {
      const cachedState = await readCheckoutBenefitsState();
      setStateFromBenefits(cachedState);
      if (
        (Array.isArray(cachedState.preview?.promo_codes) && cachedState.preview.promo_codes.length)
        || (Array.isArray(cachedState.sourceBenefits?.promo_codes) && cachedState.sourceBenefits.promo_codes.length)
      ) {
        setLoading(false);
      }

      const freshState = await ensureCheckoutBenefitsState();
      setStateFromBenefits(freshState);
    } catch (error) {
      setErrorText(getBenefitsPageErrorText(error, 'Не удалось загрузить промокоды.'));
    } finally {
      setLoading(false);
    }
  }, [setStateFromBenefits]);

  useFocusEffect(
    useCallback(() => {
      void loadPromocodes();
    }, [loadPromocodes]),
  );

  const togglePromo = useCallback(async (item: CustomerBenefitCard) => {
    const promoKey = getPromoKey(item);
    if (!promoKey || applyingPromoKey) return;

    setApplyingPromoKey(promoKey);
    setErrorText('');
    try {
      const state = promoKey === activePromoKey
        ? await clearCheckoutPromoSelection()
        : await applyCheckoutPromoCardSelection(item);
      setStateFromBenefits(state);
    } catch (error) {
      setErrorText(getBenefitsPageErrorText(error, 'Не удалось применить промокод.'));
    } finally {
      setApplyingPromoKey('');
    }
  }, [activePromoKey, applyingPromoKey, setStateFromBenefits]);

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
            <Text style={styles.stateText}>У вас пока нет доступных промокодов.</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.list}>
            {items.map((item, index) => {
              const promoKey = getPromoKey(item);
              const isSelected = promoKey === activePromoKey || item.is_selected === true;
              return (
                <PromocodeCard
                  isApplying={applyingPromoKey === promoKey}
                  isSelected={isSelected}
                  key={`${item.id || item.code || index}`}
                  item={item}
                  onToggle={togglePromo}
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
    backgroundColor: '#f2f3f5',
  },
  applyButtonSelected: {
    backgroundColor: '#fff1e8',
  },
  applyButtonText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  applyButtonTextDisabled: {
    color: '#4b5563',
  },
  applyButtonTextSelected: {
    color: theme.colors.accent,
  },
  availableReason: {
    color: '#15803d',
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
  codeText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
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
});
