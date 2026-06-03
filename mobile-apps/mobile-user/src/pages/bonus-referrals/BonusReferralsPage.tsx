import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  fetchBonusReferrals,
  readCachedCustomerPassport,
  resolveAssetUrl,
  saveCustomerPassport,
  type BonusReferrals,
  type CustomerPassport,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

function formatNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : '0';
}

function formatPercent(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '0';
}

function formatOrders(value: unknown) {
  const count = Math.max(0, Math.floor(Number(value || 0)));
  if (count % 10 === 1 && count % 100 !== 11) return `${count} заказ`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} заказа`;
  return `${count} заказов`;
}

function getSettings(passport: CustomerPassport | null) {
  const settings = passport?.bonusConfig?.settings;
  return settings && typeof settings === 'object' ? settings : {};
}

function getReferralLevels(data: BonusReferrals | null, passport: CustomerPassport | null) {
  const fromData = Array.isArray(data?.levels) ? data.levels : [];
  if (fromData.length) return fromData;
  const fromConfig = Array.isArray(passport?.bonusConfig?.referral_levels) ? passport?.bonusConfig?.referral_levels : [];
  return fromConfig || [];
}

function getReferralExtraPercent(passport: CustomerPassport | null) {
  const config = passport?.bonusConfig || null;
  const account = config?.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const levelId = Number(account?.level_id || account?.bonus_level_id || 0);
  const level = levels.find((item) => Number(item?.id || 0) === levelId) || levels[0] || null;
  return Math.max(0, Number(level?.referral_bonus_percent || 0));
}

function getReferralDepth(referral: Record<string, unknown>) {
  return Math.max(1, Math.floor(Number(referral.level_depth || 1)));
}

export function BonusReferralsPage() {
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [data, setData] = useState<BonusReferrals | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadReferrals() {
        setLoading(true);
        setErrorText('');
        try {
          const cached = await readCachedCustomerPassport();
          if (!isActive) return;
          setPassport(cached);
          setData(cached?.bonusReferrals || null);
          if (!cached?.token) {
            setErrorText('Войдите, чтобы увидеть рефералов');
            return;
          }
          const fresh = await fetchBonusReferrals(cached.token);
          if (!isActive) return;
          setData(fresh);
          await saveCustomerPassport({ ...cached, bonusReferrals: fresh, updatedAt: new Date().toISOString() });
        } catch {
          if (isActive) setErrorText('Не удалось загрузить рефералов');
        } finally {
          if (isActive) setLoading(false);
        }
      }

      void loadReferrals();

      return () => {
        isActive = false;
      };
    }, []),
  );

  const stats = data?.stats && typeof data.stats === 'object' ? data.stats : {};
  const settings = getSettings(passport);
  const levels = useMemo(() => getReferralLevels(data, passport), [data, passport]);
  const referrals = useMemo(() => {
    const rows = Array.isArray(data?.referrals) ? data.referrals : [];
    if (activeFilter === 'all') return rows;
    return rows.filter((row) => getReferralDepth(row) === Number(activeFilter));
  }, [activeFilter, data]);
  const inviteUrl = String(data?.invite_url || '');
  const coinLogo = resolveAssetUrl(String(settings.bonus_coin_logo || ''));
  const extraPercent = getReferralExtraPercent(passport);

  const shareInvite = async () => {
    if (!inviteUrl) return;
    await Share.share({ message: inviteUrl, url: inviteUrl });
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Screen>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.stateText}>Загружаем...</Text> : null}
        {errorText ? <Text style={styles.stateText}>{errorText}</Text> : null}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Бонусы</Text>
            <Text style={styles.statLabel}>Всего</Text>
            <View style={styles.valueRow}>
              <Text style={styles.statValue}>{formatNumber(stats.bonuses_total)}</Text>
              {coinLogo ? <Image source={{ uri: coinLogo }} style={styles.coinLogo} /> : null}
            </View>
            <Text style={styles.statLabel}>В этом месяце</Text>
            <View style={styles.valueRow}>
              <Text style={styles.statValue}>{formatNumber(stats.bonuses_month)}</Text>
              {coinLogo ? <Image source={{ uri: coinLogo }} style={styles.coinLogo} /> : null}
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Рефералы</Text>
            <Text style={styles.statLabel}>Всего</Text>
            <Text style={styles.statValue}>{formatNumber(stats.referrals_total)}</Text>
            <Text style={styles.statLabel}>В этом месяце</Text>
            <Text style={styles.statValue}>{formatNumber(stats.referrals_month)}</Text>
          </View>
        </View>

        {levels.length ? (
          <View style={styles.levelsRow}>
            {levels.map((level) => {
              const source = level && typeof level === 'object' ? level : {};
              const depth = Math.max(1, Math.floor(Number(source.depth || source.invited_count || 0)));
              return (
                <View key={String(source.id || depth)} style={styles.levelCard}>
                  <Text style={styles.levelTitle}>{String(source.title || `${depth}-й уровень`)}</Text>
                  <Text style={styles.levelValue}>
                    {formatPercent(source.percent)}%{extraPercent > 0 ? <Text style={styles.levelExtra}> +{formatPercent(extraPercent)}%</Text> : null}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.inviteCard}>
          <View style={styles.linkRow}>
            <Text numberOfLines={1} style={styles.linkText}>{inviteUrl || 'Ссылка появится после загрузки'}</Text>
            <Pressable onPress={copyInvite} disabled={!inviteUrl} style={styles.copyButton}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} color={theme.colors.text} size={20} />
            </Pressable>
          </View>
          <Pressable onPress={shareInvite} disabled={!inviteUrl} style={[styles.inviteButton, !inviteUrl ? styles.inviteButtonDisabled : null]}>
            <Text style={styles.inviteButtonText}>Пригласить друга</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable onPress={() => setActiveFilter('all')} style={[styles.filterChip, activeFilter === 'all' ? styles.filterChipActive : null]}>
            <Text style={[styles.filterText, activeFilter === 'all' ? styles.filterTextActive : null]}>Все</Text>
          </Pressable>
          {levels.map((level) => {
            const source = level && typeof level === 'object' ? level : {};
            const depth = Math.max(1, Math.floor(Number(source.depth || source.invited_count || 0)));
            return (
              <Pressable key={String(source.id || depth)} onPress={() => setActiveFilter(String(depth))} style={[styles.filterChip, activeFilter === String(depth) ? styles.filterChipActive : null]}>
                <Text style={[styles.filterText, activeFilter === String(depth) ? styles.filterTextActive : null]}>{String(source.title || `${depth}-й уровень`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {referrals.length ? referrals.map((referral) => {
          const depth = getReferralDepth(referral);
          const photo = resolveAssetUrl(String(referral.photo || ''));
          const rewardAmount = Number(referral.reward_amount || 0);
          return (
            <View key={String(referral.id || referral.customer_id)} style={styles.referralRow}>
              <View style={styles.referralAvatar}>
                {photo ? <Image source={{ uri: photo }} style={styles.referralPhoto} /> : (
                  <Ionicons name={depth > 1 ? 'people' : Number(referral.orders_count || 0) > 0 ? 'person-circle' : 'person'} color={theme.colors.text} size={20} />
                )}
              </View>
              <View style={styles.referralMain}>
                <Text style={styles.referralName}>{String(referral.name || 'Клиент')}</Text>
                <Text style={styles.referralMeta}>{formatOrders(referral.orders_count)}</Text>
              </View>
              <View style={styles.referralSide}>
                <Text style={styles.referralLevel}>{String(referral.level_title || `${depth}-й уровень`)}</Text>
                <View style={styles.valueRow}>
                  <Text style={[styles.referralReward, rewardAmount > 0 ? styles.referralRewardPositive : null]}>{rewardAmount > 0 ? '+' : ''}{formatNumber(rewardAmount)}</Text>
                  {coinLogo ? <Image source={{ uri: coinLogo }} style={styles.coinLogoSmall} /> : null}
                </View>
              </View>
            </View>
          );
        }) : !loading && !errorText ? (
          <Text style={styles.stateText}>Рефералов пока нет</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  coinLogo: {
    height: 20,
    width: 20,
  },
  coinLogoSmall: {
    height: 16,
    width: 16,
  },
  content: {
    padding: theme.spacing.lg,
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  filterChip: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
  },
  filterText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  filterTextActive: {
    color: theme.colors.primaryText,
  },
  filters: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  inviteButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 52,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
  },
  inviteButtonDisabled: {
    opacity: 0.5,
  },
  inviteButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  inviteCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
  },
  levelCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    flex: 1,
    padding: theme.spacing.md,
  },
  levelExtra: {
    color: theme.colors.accent,
    fontSize: 12,
  },
  levelTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  levelValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  levelsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  linkRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: 4,
    paddingVertical: 4,
  },
  linkText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  referralAvatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  referralLevel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  referralMain: {
    flex: 1,
  },
  referralMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  referralName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  referralPhoto: {
    height: '100%',
    width: '100%',
  },
  referralReward: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  referralRewardPositive: {
    color: theme.colors.accent,
  },
  referralRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  referralSide: {
    alignItems: 'flex-end',
    minWidth: 96,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  statCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    flex: 1,
    padding: theme.spacing.md,
  },
  statLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: theme.spacing.md,
  },
  statTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: theme.spacing.md,
    textAlign: 'center',
  },
  valueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
});
