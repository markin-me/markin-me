import {
  useCallback,
  useMemo,
  useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { readCachedCustomerPassport, type CustomerPassport } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
function formatPercent(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '0';
}

function formatMoney(value: unknown) {
  const number = Math.max(0, Number(value || 0));
  return Number.isFinite(number) ? `${number.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : '0 ₽';
}

function getFavoriteRange(level: Record<string, unknown> | null) {
  const min = Number(level?.favorite_categories_min_bonus_percent || 0);
  const max = Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || 0);
  if (!(max > 0)) return 'Не настроено';
  return min > 0 && min !== max ? `${min}-${max}%` : `${max}%`;
}

function getCurrentLevel(passport: CustomerPassport | null) {
  const config = passport?.bonusConfig || null;
  const account = config?.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const levelId = Number(account?.level_id || account?.bonus_level_id || 0);
  return levels.find((level) => Number(level?.id || 0) === levelId) || levels[0] || null;
}

function getOrderBonusRanges(level: Record<string, unknown> | null) {
  return (Array.isArray(level?.order_bonus_ranges) ? level.order_bonus_ranges : [])
    .map((row) => {
      const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      return {
        amount: Math.max(0, Number(source.amount || 0)),
        percent: Math.max(0, Number(source.percent || 0)),
      };
    })
    .filter((row) => row.amount > 0 && row.percent > 0)
    .sort((a, b) => a.amount - b.amount);
}

function getOrderBonusRangeSummary(level: Record<string, unknown> | null) {
  const rows = getOrderBonusRanges(level);
  if (!rows.length) return 'Не настроено';
  const first = rows[0];
  const percents = rows.map((row) => row.percent);
  const minPercent = Math.min(...percents);
  const maxPercent = Math.max(...percents);
  const percentText = minPercent === maxPercent
    ? `+${formatPercent(minPercent)}%`
    : `от ${formatPercent(minPercent)}% до ${formatPercent(maxPercent)}%`;
  return `от ${formatMoney(first.amount)} и выше / ${percentText}`;
}

function getOrderBonusRangeDetails(level: Record<string, unknown> | null) {
  const rows = getOrderBonusRanges(level);
  return rows.map((row, index) => {
    const next = rows[index + 1] || null;
    const amountText = next
      ? `от ${formatMoney(row.amount)} до ${formatMoney(Math.max(row.amount, next.amount - 1))}`
      : `от ${formatMoney(row.amount)} и более`;
    return `${index + 1}. ${amountText} / +${formatPercent(row.percent)}%`;
  });
}

export function BonusCashbackPage() {
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [showRangeDetails, setShowRangeDetails] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void readCachedCustomerPassport().then((cached) => {
        if (isActive) setPassport(cached);
      });
      return () => {
        isActive = false;
      };
    }, []),
  );

  const level = useMemo(() => getCurrentLevel(passport), [passport]);
  const settings = passport?.bonusConfig?.settings && typeof passport.bonusConfig.settings === 'object' ? passport.bonusConfig.settings : {};
  const coinName = String(settings.bonus_coin_name || 'Бонусы');
  const favoriteLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
  const favoriteText = favoriteLimit > 0 ? `${favoriteLimit} кат. / +${getFavoriteRange(level)}` : 'Не настроено';
  const rangeDetails = useMemo(() => getOrderBonusRangeDetails(level), [level]);
  const rangeSummary = useMemo(() => getOrderBonusRangeSummary(level), [level]);

  return (
    <Screen>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.topMetrics}>
          <View style={[styles.metricCard, styles.topMetricCard]}>
            <Text style={styles.metricLabel}>Кэшбек, %</Text>
            <Text style={styles.metricValue}>{formatPercent(level?.cashback_percent)}%</Text>
          </View>
          <View style={[styles.metricCard, styles.topMetricCard]}>
            <Text style={styles.metricLabel}>Списание, %</Text>
            <Text style={styles.metricValue}>{formatPercent(level?.redeem_percent)}%</Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Доп % за рефералов</Text>
          <Text style={styles.metricValue}>+{formatPercent(level?.referral_bonus_percent)}%</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Любимые категории</Text>
          <Text style={styles.metricValueSmall}>{favoriteText}</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Text style={styles.metricLabel}>{coinName} за сумму заказа</Text>
            {rangeDetails.length ? (
              <Pressable style={styles.infoButton} onPress={() => setShowRangeDetails((value) => !value)}>
                <Text style={styles.infoButtonText}>i</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.metricValueSmall}>{rangeSummary}</Text>
          {showRangeDetails && rangeDetails.length ? (
            <View style={styles.popover}>
              {rangeDetails.map((row) => (
                <Text key={row} style={styles.popoverText}>{row}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
  },
  metricCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: theme.spacing.sm,
  },
  metricValueSmall: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: theme.spacing.sm,
  },
  infoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  infoButtonText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  popover: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 14,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
  },
  popoverText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  topMetricCard: {
    flex: 1,
    marginBottom: 0,
  },
  topMetrics: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
});
