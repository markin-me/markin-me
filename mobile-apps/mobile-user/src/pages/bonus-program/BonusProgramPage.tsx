import {
  useCallback,
  useMemo,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect,
  useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  joinBonusProgram,
  readCachedCustomerPassport,
  refreshCustomerPassport,
  resolveAssetUrl,
  type BonusFavoriteCategories,
  type CustomerPassport,
} from '../../shared/api';
import { routes, type RootStackParamList } from '../../app/navigation/routes';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
function formatBonusNumber(value: unknown, digits = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatBonusPercent(value: unknown, digits = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? formatBonusNumber(Math.max(0, number), digits) : '0';
}

function getBonusProgressPercent(progress: Record<string, unknown> | null) {
  if (!progress) return 48;
  const pairs: Array<[unknown, unknown]> = [
    [progress.amount_current, progress.amount_target],
    [progress.orders_current, progress.orders_target],
    [progress.referrals_current, progress.referrals_target],
    [progress.bonus_accrued_current, progress.bonus_accrued_target],
    [progress.bonus_redeemed_current, progress.bonus_redeemed_target],
  ];
  const values = pairs
    .map(([current, target]) => {
      const targetNumber = Number(target || 0);
      if (!(targetNumber > 0)) return null;
      return Math.max(0, Math.min(100, Number(current || 0) / targetNumber * 100));
    })
    .filter((value): value is number => value !== null);
  if (!values.length) return 48;
  return Math.max(0, Math.min(100, Math.min(...values)));
}

function getSelectedFavoriteCategories(favorites: BonusFavoriteCategories | null) {
  const selectedIds = Array.isArray(favorites?.selected_ids)
    ? favorites.selected_ids.map((id) => Number(id || 0)).filter((id) => id > 0)
    : [];
  const categories = Array.isArray(favorites?.categories) ? favorites.categories : [];
  return selectedIds
    .map((id) => categories.find((item) => Number(item?.id || 0) === id))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function getBonusProgramSummary(passport: CustomerPassport | null) {
  const config = passport?.bonusConfig || null;
  if (!config) return null;
  const account = config.account && typeof config.account === 'object' ? config.account : null;
  const settings = config.settings && typeof config.settings === 'object' ? config.settings : {};
  const levels = Array.isArray(config.levels) ? config.levels : [];
  const levelId = Number(account?.level_id ?? account?.bonus_level_id ?? 0);
  const level = levels.find((item) => Number(item.id || 0) === levelId) || levels[0] || null;
  const progress = level?.progress && typeof level.progress === 'object' ? level.progress as Record<string, unknown> : null;
  const favorites = passport?.bonusFavoriteCategories || null;
  const favoriteMin = Number(level?.favorite_categories_min_bonus_percent || 0);
  const favoriteMax = Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || favorites?.bonus_percent || 0);
  const favoriteLabel = favoriteMax > 0
    ? favoriteMin > 0 && favoriteMin !== favoriteMax ? `${favoriteMin}-${favoriteMax}%` : `${favoriteMax}%`
    : '';
  const favoriteCategoryLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || favorites?.limit || 0)));
  return {
    balance: Number(account?.balance ?? account?.bonus_balance ?? account?.amount ?? 0),
    cashbackPercent: Number(level?.cashback_percent || 0),
    coinLogo: resolveAssetUrl(String(settings.bonus_coin_logo || '')),
    coinName: String(settings.bonus_coin_name || 'Бонусы'),
    favoriteCategoryLimit,
    favoriteLabel,
    isJoined: Boolean(account?.joined_at) && Number(account?.id || 0) > 0,
    levelTitle: String(level?.title || 'Уровень'),
    progressPercent: getBonusProgressPercent(progress),
    selectedFavoriteCategories: getSelectedFavoriteCategories(favorites),
  };
}

export function BonusProgramPage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [joining, setJoining] = useState(false);
  const [errorText, setErrorText] = useState('');

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

  const summary = useMemo(() => getBonusProgramSummary(passport), [passport]);
  const customer = passport?.customer || null;
  const photo = resolveAssetUrl(customer?.photo || '');

  const handleJoin = async () => {
    if (!passport?.token || joining) return;
    setJoining(true);
    setErrorText('');
    try {
      await joinBonusProgram(passport.token);
      const fresh = await refreshCustomerPassport(passport.token, passport.customer);
      setPassport(fresh);
    } catch {
      setErrorText('Не удалось присоединиться к бонусной программе');
    } finally {
      setJoining(false);
    }
  };

  if (!summary) {
    return (
      <Screen>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Бонусная программа</Text>
          <Text style={styles.emptyText}>Данные бонусной программы пока не загружены.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.navigate(routes.bonusLevels)} style={styles.levelCard}>
          <View style={styles.avatar}>
            {photo ? <Image source={{ uri: photo }} style={styles.avatarImage} /> : <Ionicons name="person" color={theme.colors.muted} size={24} />}
          </View>
          <View style={styles.levelMain}>
            <Text style={styles.levelTitle}>
              {customer?.name || 'Клиент'} · <Text style={styles.levelName}>{summary.levelTitle}</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${summary.progressPercent}%` }]} />
            </View>
          </View>
        </Pressable>

        {!summary.isJoined ? (
          <Pressable onPress={handleJoin} disabled={joining} style={[styles.joinButton, joining ? styles.joinButtonDisabled : null]}>
            <Text style={styles.joinButtonText}>{joining ? 'Подключаем...' : 'Присоединиться'}</Text>
          </Pressable>
        ) : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <Pressable onPress={() => navigation.navigate(routes.bonusTransactions)} style={styles.balanceCard}>
          <View>
            <Text style={styles.cardLabel}>{summary.coinName}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{formatBonusNumber(summary.balance)}</Text>
              {summary.coinLogo ? <Image source={{ uri: summary.coinLogo }} style={styles.coinLogo} /> : null}
            </View>
          </View>
          <Text style={styles.cardAction}>Начисления &gt;</Text>
        </Pressable>

        <View style={styles.metricsRow}>
          <Pressable
            onPress={() => navigation.navigate(routes.bonusCashback)}
            style={[styles.metricCard, summary.favoriteCategoryLimit > 0 ? null : styles.metricCardFull]}
          >
            <Text style={styles.cardLabel}>Кэшбек</Text>
            <View style={styles.metricValueRow}>
              <Ionicons name="refresh" color={theme.colors.accent} size={22} />
              <Text style={styles.metricValue}>{formatBonusPercent(summary.cashbackPercent)}%</Text>
            </View>
          </Pressable>

          {summary.favoriteCategoryLimit > 0 ? (
            <Pressable onPress={() => navigation.navigate(routes.bonusFavoriteCategories)} style={[styles.metricCard, styles.categoryCard]}>
              <Text style={styles.cardLabel}>
                {summary.favoriteCategoryLimit} категорий · {summary.favoriteLabel}
              </Text>
              {summary.selectedFavoriteCategories.length > 0 ? (
                <View style={styles.categoryIcons}>
                  {summary.selectedFavoriteCategories.slice(0, 3).map((category) => {
                    const icon = resolveAssetUrl(String(category.icon || ''));
                    const id = String(category.id || category.title || icon);
                    return (
                      <View key={id} style={styles.categoryThumb}>
                        {icon ? <Image source={{ uri: icon }} style={styles.categoryImage} /> : <Ionicons name="pricetag" color={theme.colors.text} size={14} />}
                      </View>
                    );
                  })}
                </View>
              ) : summary.isJoined ? (
                <Text style={styles.chooseText}>Выбрать</Text>
              ) : (
                <View style={styles.categoryLimitRow}>
                  <View style={styles.categoryLimitIcon}>
                    <View style={styles.categoryDot} />
                    <View style={styles.categoryDot} />
                    <View style={styles.categoryDot} />
                    <View style={styles.categoryDot} />
                  </View>
                  <Text style={styles.categoryLimitText}>{summary.favoriteCategoryLimit}</Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  balanceCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  balanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  balanceValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  cardAction: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  cardLabel: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  categoryCard: {
    flex: 1.65,
  },
  categoryDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: 2,
    height: 6,
    width: 6,
  },
  categoryIcons: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    paddingLeft: 8,
  },
  categoryImage: {
    height: '100%',
    width: '100%',
  },
  categoryLimitIcon: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    height: 15,
    width: 15,
  },
  categoryLimitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  categoryLimitText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  categoryThumb: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.card,
    borderRadius: 11,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    marginLeft: -8,
    overflow: 'hidden',
    width: 34,
  },
  chooseText: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '900',
    marginTop: theme.spacing.md,
  },
  coinLogo: {
    height: 28,
    marginLeft: theme.spacing.sm,
    width: 28,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  joinButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 52,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  levelCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  levelMain: {
    flex: 1,
  },
  levelName: {
    fontWeight: '600',
    opacity: 0.8,
  },
  levelTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  metricCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    flex: 1,
    minHeight: 106,
    padding: theme.spacing.md,
  },
  metricCardFull: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  metricValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
});
