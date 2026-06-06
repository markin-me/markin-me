import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchCustomerBenefits,
  isSameCachedValue,
  readCachedCustomerBenefits,
  readCachedCustomerPassport,
  type CustomerBenefitCard,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

const PROMO_DISABLED_REASON = 'Промокод не подходит к текущему заказу.';

function asText(value: unknown) {
  return String(value || '').trim();
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

function isVisiblePromo(item: CustomerBenefitCard) {
  const usageLimit = Number(item.usage_limit || 0);
  const usageCount = Number(item.usage_count || 0);
  return usageLimit <= 0 || usageCount < usageLimit;
}

function PromocodeCard({ item }: { item: CustomerBenefitCard }) {
  const code = asText(item.code) || '—';
  const title = asText(item.title) || 'Уникальная скидка по промокоду';
  const badgeText = formatPromoBadge(item);
  const disabledReason = asText(item.disabled_reason_text) || PROMO_DISABLED_REASON;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{title}</Text>
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
        <Pressable disabled style={styles.applyButton}>
          <Text style={styles.applyButtonText}>Применить</Text>
        </Pressable>
      </View>

      <Text style={styles.disabledReason}>{disabledReason}</Text>
    </View>
  );
}

export function PromocodesPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const loadPromocodes = useCallback(async () => {
    setErrorText('');
    try {
      const passport = await readCachedCustomerPassport();
      if (!passport?.token) {
        setItems([]);
        setErrorText('Войдите в профиль, чтобы увидеть промокоды.');
        setLoading(false);
        return;
      }
      const cachedBenefits = await readCachedCustomerBenefits(passport.token);
      const cachedItems = (Array.isArray(cachedBenefits?.promo_codes) ? cachedBenefits.promo_codes : []).filter(isVisiblePromo);
      if (cachedBenefits) {
        setItems(cachedItems);
        setLoading(false);
      }
      const benefits = await fetchCustomerBenefits(passport.token);
      const freshItems = (Array.isArray(benefits.promo_codes) ? benefits.promo_codes : []).filter(isVisiblePromo);
      if (!isSameCachedValue(freshItems, cachedItems)) setItems(freshItems);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить промокоды.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPromocodes();
  }, [loadPromocodes]);

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
            <Text style={styles.stateText}>У вас пока нет доступных промокодов</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.list}>
            {items.map((item, index) => (
              <PromocodeCard key={`${item.id || item.code || index}`} item={item} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: '#f2f3f5',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 118,
    paddingHorizontal: 16,
  },
  applyButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '900',
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
    minHeight: 26,
    paddingHorizontal: 10,
    justifyContent: 'center',
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
