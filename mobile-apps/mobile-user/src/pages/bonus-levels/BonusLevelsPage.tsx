import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { readCachedCustomerPassport, resolveAssetUrl, type CustomerPassport } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

type BonusLevel = Record<string, unknown>;
const BONUS_LEVEL_CARD_WIDTH = 300;
const LEVEL_CARD_GAP = 12;

function normalizeHexColor(value: unknown, fallback: string) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function hexToRgba(value: unknown, opacity: unknown, fallback: string) {
  const hex = normalizeHexColor(value, fallback).replace('#', '');
  const alpha = Math.max(0, Math.min(100, Number(opacity ?? 90))) / 100;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatNumber(value: unknown, digits = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatMoney(value: unknown) {
  return `${formatNumber(Math.max(0, Math.floor(Number(value || 0))))} ₽`;
}

function formatPercent(value: unknown) {
  return `${formatNumber(value, 1)}%`;
}

function formatPeriod(value: unknown, unit: unknown) {
  const count = Math.max(0, Math.floor(Number(value || 0)));
  const normalizedUnit = String(unit || '').trim();
  if (normalizedUnit === 'immediate') return 'Сразу';
  if (normalizedUnit === 'forever') return 'Бессрочно';
  if (!count) return 'Сразу';
  if (normalizedUnit === 'hours') return `${count} ч`;
  if (normalizedUnit === 'days') return `${count} дн.`;
  if (normalizedUnit === 'months') return `${count} мес.`;
  return String(count);
}

function getBonusRanges(level: BonusLevel | null) {
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

function getBonusRangeSummary(level: BonusLevel | null) {
  const rows = getBonusRanges(level);
  if (!rows.length) return 'Не настроено';
  const first = rows[0];
  const percents = rows.map((row) => row.percent);
  const minPercent = Math.min(...percents);
  const maxPercent = Math.max(...percents);
  const percentText = Math.abs(minPercent - maxPercent) < 0.0001
    ? `+${formatPercent(minPercent)}`
    : `от ${formatPercent(minPercent)} до ${formatPercent(maxPercent)}`;
  return `от ${formatMoney(first.amount)} и выше / ${percentText}`;
}

function getBonusRangeDetails(level: BonusLevel | null) {
  const rows = getBonusRanges(level);
  return rows.map((row, index) => {
    const next = rows[index + 1] || null;
    const amountText = next
      ? `от ${formatMoney(row.amount)} до ${formatMoney(Math.max(row.amount, next.amount - 1))}`
      : `от ${formatMoney(row.amount)} и более`;
    return `${index + 1}. ${amountText} / +${formatPercent(row.percent)}`;
  });
}

function getConditionRows(level: BonusLevel | null) {
  const progress = level?.progress && typeof level.progress === 'object' ? level.progress as Record<string, unknown> : {};
  const rows = [
    { current: progress.amount_current, icon: '₽', target: progress.amount_target || level?.requirement_amount, title: 'Сумма заказов' },
    { current: progress.orders_current, icon: '•', target: progress.orders_target || level?.requirement_orders, title: 'Количество заказов' },
    { current: progress.referrals_current, icon: '+', target: progress.referrals_target || level?.requirement_referrals, title: 'Рефералы' },
    { current: progress.bonus_accrued_current, icon: '+', target: progress.bonus_accrued_target || level?.requirement_bonus_accrued, title: 'Накопить бонусов' },
    { current: progress.bonus_redeemed_current, icon: '-', target: progress.bonus_redeemed_target || level?.requirement_bonus_redeemed, title: 'Потратить бонусов' },
  ];
  return rows
    .map((row) => ({ ...row, currentNumber: Math.max(0, Number(row.current || 0)), targetNumber: Math.max(0, Number(row.target || 0)) }))
    .filter((row) => row.targetNumber > 0);
}

function getConditionProgress(level: BonusLevel | null) {
  const rows = getConditionRows(level);
  const progress = level?.progress && typeof level.progress === 'object' ? level.progress as Record<string, unknown> : {};
  const matchCount = Math.min(rows.length, Math.max(1, Math.floor(Number(progress.match_count || level?.requirement_match_count || 1))));
  if (!rows.length || !(matchCount > 0)) return 100;
  const ratios = rows
    .map((row) => row.currentNumber / row.targetNumber)
    .sort((a, b) => b - a)
    .slice(0, matchCount);
  const total = ratios.reduce((sum, value) => sum + Math.max(0, Math.min(1, value)), 0);
  return Math.max(0, Math.min(100, total / matchCount * 100));
}

function getNextLevel(levels: BonusLevel[], currentLevelId: number) {
  const currentIndex = levels.findIndex((level) => Number(level?.id || 0) === currentLevelId);
  if (currentIndex < 0) return levels[1] || null;
  return levels[currentIndex + 1] || null;
}

function getProgramLogo(settings: Record<string, unknown>, level: BonusLevel | null) {
  const isPaid = String(level?.access_type || '') === 'paid';
  return resolveAssetUrl(String(
    isPaid
      ? settings.bonus_program_logo_paid || settings.bonus_program_logo || ''
      : settings.bonus_program_logo_base || settings.bonus_program_logo || '',
  ));
}

function getProgramName(settings: Record<string, unknown>, level: BonusLevel | null) {
  const isPaid = String(level?.access_type || '') === 'paid';
  return String(
    isPaid
      ? settings.bonus_program_name_paid || settings.bonus_program_name || ''
      : settings.bonus_program_name_base || settings.bonus_program_name || 'Бонусная программа',
  );
}

function getCompareDelta(value: unknown, baseValue: unknown, suffix = '%') {
  const current = Number(value || 0);
  const base = Number(baseValue || 0);
  const diff = current - base;
  if (Math.abs(diff) < 0.0001) return '';
  const sign = diff > 0 ? '+' : '-';
  const abs = Math.abs(diff);
  return suffix === '%' ? `${sign}${formatPercent(abs)}` : `${sign}${formatNumber(abs)}`;
}

export function BonusLevelsPage() {
  const levelsScrollRef = useRef<ScrollView | null>(null);
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState(0);
  const [showRangesInfo, setShowRangesInfo] = useState(false);

  const levels = useMemo(() => Array.isArray(passport?.bonusConfig?.levels) ? passport.bonusConfig.levels : [], [passport]);
  const account = passport?.bonusConfig?.account && typeof passport.bonusConfig.account === 'object' ? passport.bonusConfig.account : null;
  const settings = passport?.bonusConfig?.settings && typeof passport.bonusConfig.settings === 'object' ? passport.bonusConfig.settings : {};
  const currentLevelId = Number(account?.level_id || 0);
  const currentLevel = levels.find((level) => Number(level?.id || 0) === currentLevelId) || levels[0] || null;
  const nextLevel = getNextLevel(levels, Number(currentLevel?.id || currentLevelId || 0));
  const selectedLevel = levels.find((level) => Number(level?.id || 0) === (selectedLevelId || currentLevelId)) || currentLevel;
  const conditionLevel = Number(selectedLevel?.id || 0) === Number(currentLevel?.id || 0) ? nextLevel : Number(selectedLevel?.id || 0) === Number(nextLevel?.id || 0) ? selectedLevel : null;
  const conditionRows = getConditionRows(conditionLevel);
  const matchCount = Math.min(conditionRows.length, Math.max(1, Math.floor(Number((conditionLevel?.progress as Record<string, unknown> | undefined)?.match_count || conditionLevel?.requirement_match_count || 1))));
  const favoriteLimit = Math.max(0, Math.floor(Number(selectedLevel?.favorite_categories_limit || 0)));
  const coinLogo = resolveAssetUrl(String(settings.bonus_coin_logo || ''));
  const balance = Number(account?.balance || 0);
  const rangeDetails = getBonusRangeDetails(selectedLevel);
  const baseLevel = currentLevel && Number(selectedLevel?.id || 0) !== Number(currentLevel?.id || 0) ? currentLevel : null;

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void readCachedCustomerPassport().then((cached) => {
        if (!isActive) return;
        const initialLevelId = Number(cached?.bonusConfig?.account?.level_id || 0);
        setPassport(cached);
        setSelectedLevelId(initialLevelId);
      });
      return () => {
        isActive = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!(currentLevelId > 0) || !levels.length) return;
    const currentIndex = levels.findIndex((level) => Number(level?.id || 0) === currentLevelId);
    if (currentIndex < 0) return;
    const timer = setTimeout(() => {
      levelsScrollRef.current?.scrollTo({
        animated: true,
        x: currentIndex * (BONUS_LEVEL_CARD_WIDTH + LEVEL_CARD_GAP),
        y: 0,
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [currentLevelId, levels]);

  return (
    <Screen>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <ScrollView ref={levelsScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelsRow}>
          {levels.map((level) => {
            const id = Number(level?.id || 0);
            const active = id === Number(selectedLevel?.id || 0);
            const current = id === currentLevelId;
            const mainColor = normalizeHexColor(level?.main_color || level?.design_color, '#60a5fa');
            const baseColor = normalizeHexColor(level?.base_color, '#0f4a91');
            const contentColor = normalizeHexColor(level?.content_color, '#ffffff');
            const titleColor = normalizeHexColor(level?.title_color, '#111827');
            const titleBackground = level?.title_background_enabled === false
              ? 'transparent'
              : hexToRgba(level?.title_background_color, level?.title_background_opacity, '#ffffff');
            const logo = getProgramLogo(settings, level);
            return (
              <Pressable key={String(id)} onPress={() => { setSelectedLevelId(id); setShowRangesInfo(false); }} style={[styles.bonusCard, { backgroundColor: baseColor }, active ? styles.bonusCardActive : null]}>
                <View style={[styles.bonusMain, { backgroundColor: mainColor }]}>
                  <View style={[styles.bonusTitleBadge, { backgroundColor: titleBackground }]}>
                    {logo ? <Image source={{ uri: logo }} style={styles.bonusProgramLogo} /> : null}
                    <View style={styles.bonusTitleText}>
                      <Text style={[styles.bonusProgramName, { color: titleColor }]}>{getProgramName(settings, level)}</Text>
                      <Text style={[styles.bonusLevelName, { color: titleColor }]}>{String(level?.title || 'Уровень')}</Text>
                    </View>
                    <Text style={[styles.bonusChevron, { color: titleColor }]}>›</Text>
                  </View>
                  <Text style={[styles.bonusLabel, { color: contentColor }]}>{String(settings.bonus_coin_name || 'Бонусы')}</Text>
                  <View style={styles.bonusBalanceRow}>
                    <Text style={[styles.bonusBalance, { color: contentColor }]}>{formatNumber(balance)}</Text>
                    {coinLogo ? <Image source={{ uri: coinLogo }} style={styles.coinLogo} /> : null}
                  </View>
                  {current ? <Text style={[styles.currentBadge, { color: contentColor }]}>Текущий</Text> : null}
                </View>
                <View style={styles.bonusSub}>
                  <View style={styles.bonusFooterSide}>
                    <Ionicons name="refresh-circle" color={contentColor} size={22} />
                    <Text style={[styles.bonusFooterValue, { color: contentColor }]}>{formatPercent(level?.cashback_percent)}</Text>
                  </View>
                  <View style={styles.bonusFooterSide}>
                    <View style={styles.categoryIcon}>
                      <View style={styles.categoryDot} />
                      <View style={styles.categoryDot} />
                      <View style={styles.categoryDot} />
                      <View style={styles.categoryDot} />
                    </View>
                    <Text style={[styles.bonusFooterValue, { color: contentColor }]}>{Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)))}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {conditionLevel ? (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>До нового уровня</Text>
            <Text style={styles.sectionSubtitle}>Выполните {matchCount} из {conditionRows.length} условий:</Text>
            {conditionRows.map((row) => {
              const ratio = Math.max(0, Math.min(100, row.currentNumber / row.targetNumber * 100));
              return (
                <View key={row.title} style={styles.conditionRow}>
                  <View style={styles.conditionIcon}><Text style={styles.conditionIconText}>{row.icon}</Text></View>
                  <View style={styles.conditionMain}>
                    <Text style={styles.conditionTitle}>{row.title}</Text>
                    <Text style={styles.conditionValue}>{formatNumber(row.currentNumber)} / {formatNumber(row.targetNumber)}</Text>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${ratio}%` }]} /></View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.advantagesCard}>
          <Text style={styles.advantagesTitle}>Преимущества</Text>
          <AdvantageRow index={0} label="Кэшбек, %" value={formatPercent(selectedLevel?.cashback_percent)} delta={baseLevel ? getCompareDelta(selectedLevel?.cashback_percent, baseLevel?.cashback_percent) : ''} />
          <AdvantageRow index={1} label="Можно списывать, %" value={formatPercent(selectedLevel?.redeem_percent)} delta={baseLevel ? getCompareDelta(selectedLevel?.redeem_percent, baseLevel?.redeem_percent) : ''} />
          <AdvantageRow index={2} label="Доп % за рефералов" value={formatPercent(selectedLevel?.referral_bonus_percent)} delta={baseLevel ? getCompareDelta(selectedLevel?.referral_bonus_percent, baseLevel?.referral_bonus_percent) : ''} />
          <AdvantageRow index={3} label="Одновременно списывать и начислять" value={settings.allow_redeem_and_accrue ? 'Да' : 'Нет'} />
          <AdvantageRow index={4} label="Станут активны" value={formatPeriod(selectedLevel?.activation_delay_value, selectedLevel?.activation_delay_unit)} />
          <AdvantageRow index={5} label="Время жизни бонусов" value={formatPeriod(selectedLevel?.lifetime_value, selectedLevel?.lifetime_unit)} />
          <AdvantageRow index={6} label="Дополнительные бонусы за сумму заказа" value={getBonusRangeSummary(selectedLevel)} info={rangeDetails.length > 0} onInfoPress={() => setShowRangesInfo((value) => !value)} />
          {showRangesInfo ? (
            <View style={styles.popover}>
              <Text style={styles.popoverTitle}>Пороги начисления</Text>
              {rangeDetails.map((row) => <Text key={row} style={styles.popoverText}>{row}</Text>)}
            </View>
          ) : null}
          <AdvantageRow index={7} label="Доп. бонус за покупку любимых категорий" value={favoriteLimit > 0 ? `Количество категорий: ${favoriteLimit}` : 'Не настроено'} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function AdvantageRow({
  delta = '',
  info = false,
  index,
  label,
  onInfoPress,
  value,
}: {
  delta?: string;
  info?: boolean;
  index: number;
  label: string;
  onInfoPress?: () => void;
  value: string;
}) {
  return (
    <View style={[styles.advantageRow, index % 2 === 1 ? styles.advantageRowMuted : null]}>
      <Text style={styles.advantageLabel}>{label}</Text>
      <View style={styles.advantageValueWrap}>
        <Text style={styles.advantageValue}>{value}</Text>
        {delta ? <Text style={styles.advantageDelta}>{delta}</Text> : null}
        {info ? (
          <Pressable onPress={onInfoPress} style={styles.infoButton}>
            <Text style={styles.infoButtonText}>i</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  advantageDelta: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  advantageLabel: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  advantageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  advantageRowMuted: {
    backgroundColor: theme.colors.surface,
  },
  advantagesCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  advantagesTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  advantageValue: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  advantageValueWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
  },
  bonusBalance: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  bonusBalanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  bonusCard: {
    aspectRatio: 16 / 9,
    borderRadius: 30,
    marginRight: theme.spacing.md,
    overflow: 'hidden',
    width: 300,
  },
  bonusCardActive: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
  },
  bonusChevron: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
    marginLeft: theme.spacing.xs,
  },
  bonusFooterSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  bonusFooterValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  bonusLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 'auto',
  },
  bonusLevelName: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
    opacity: 0.8,
  },
  bonusMain: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flex: 1,
    marginBottom: -6,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: 14,
    paddingTop: 14,
    position: 'relative',
    zIndex: 2,
  },
  bonusProgramLogo: {
    borderRadius: 3,
    height: 34,
    width: 34,
  },
  bonusProgramName: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  bonusSub: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 42,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 1,
  },
  bonusTitleBadge: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    maxWidth: 214,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bonusTitleText: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
  },
  categoryDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: 2,
    height: 5,
    width: 5,
  },
  categoryIcon: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    height: 26,
    padding: 7,
    width: 26,
  },
  coinLogo: {
    height: 26,
    marginLeft: theme.spacing.sm,
    width: 26,
  },
  conditionIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  conditionIconText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '900',
  },
  conditionMain: {
    flex: 1,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  conditionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  conditionValue: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  content: {
    padding: theme.spacing.lg,
  },
  currentBadge: {
    bottom: 12,
    fontSize: 11,
    fontWeight: '900',
    position: 'absolute',
    right: 14,
  },
  infoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  infoButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  levelsRow: {
    paddingRight: theme.spacing.lg,
  },
  popover: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  popoverText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  popoverTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 8,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  sectionSubtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
});
