import {
  useCallback,
  useEffect,
  useState } from 'react';
import { FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { fetchBonusTransactions, readCachedCustomerPassport, type BonusTransaction } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
const PAGE_SIZE = 50;

const filters = [
  { label: 'Все', value: 'all' },
  { label: 'Начисления', value: 'accrual' },
  { label: 'Списания', value: 'redeem' },
  { label: 'Сгорания', value: 'expire' },
  { label: 'Рефералы', value: 'referral_accrual' },
];

function getTransactionMeta(type: unknown) {
  const key = String(type || '');
  if (key === 'accrual') return { label: 'Начисление', sign: '+', tone: theme.colors.accent };
  if (key === 'referral_accrual') return { label: 'Рефералы', sign: '+', tone: theme.colors.accent };
  if (key === 'redeem') return { label: 'Списание', sign: '-', tone: '#ef4444' };
  if (key === 'expire') return { label: 'Сгорание', sign: '-', tone: '#ef4444' };
  if (key === 'refund') return { label: 'Возврат', sign: '+', tone: theme.colors.accent };
  if (key === 'level_up') return { label: 'Новый уровень', sign: '', tone: theme.colors.text };
  if (key === 'join') return { label: 'Вступление', sign: '', tone: theme.colors.text };
  return { label: 'Корректировка', sign: '', tone: theme.colors.text };
}

function getTransactionReasonText(item: BonusTransaction, meta: ReturnType<typeof getTransactionMeta>) {
  const raw = String(item.reason || item.source || '').trim();
  const orderMatch = raw.match(/^order:(\d+):([^:]+)$/);
  if (orderMatch) {
    const orderId = orderMatch[1];
    const action = orderMatch[2];
    if (action === 'bonus_accrual') return `Бонусы за заказ #${orderId}`;
    if (action === 'bonus_redeem') return `Списано в заказе #${orderId}`;
    return `Заказ #${orderId}`;
  }

  const referralLevelMatch = raw.match(/^level_percent:[^:]*:(\d+):L(\d+):/);
  if (referralLevelMatch) {
    return `Бонус за заказ реферала ${referralLevelMatch[2]}-го уровня`;
  }
  if (/^first_purchase:/.test(raw)) return 'Бонус за первую покупку друга';
  if (raw === 'level_up' || item.type === 'level_up') return 'Переход на новый уровень';
  if (raw === 'join' || item.type === 'join') return 'Бонус за присоединение к программе';
  if (item.level_title) return String(item.level_title || '').trim();
  return meta.label;
}

function isVisibleBonusTransaction(item: BonusTransaction) {
  const raw = String(item.reason || item.source || '').trim();
  return raw !== 'bonus_reserve' && !/^order:\d+:bonus_reserve$/.test(raw);
}

function formatNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : '0';
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit' }).format(date);
}

export function BonusTransactionsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [transactions, setTransactions] = useState<BonusTransaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadTransactions() {
      setLoading(true);
      setErrorText('');
      setTransactions([]);
      setHasMore(false);
      try {
        const cached = await readCachedCustomerPassport();
        if (!cached?.token) {
          if (isActive) {
            setErrorText('Войдите, чтобы увидеть начисления');
          }
          return;
        }
        const list = await fetchBonusTransactions(cached.token, activeFilter, PAGE_SIZE, 0);
        if (isActive) {
          setTransactions(list.filter(isVisibleBonusTransaction));
          setHasMore(list.length === PAGE_SIZE);
        }
      } catch {
        if (isActive) setErrorText('Не удалось загрузить начисления');
      } finally {
        if (isActive) setLoading(false);
      }
    }

    void loadTransactions();

    return () => {
      isActive = false;
    };
  }, [activeFilter]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || errorText || !hasMore) return;
    setLoadingMore(true);
    try {
      const cached = await readCachedCustomerPassport();
      if (!cached?.token) return;
      const list = await fetchBonusTransactions(cached.token, activeFilter, PAGE_SIZE, transactions.length);
      setTransactions((prev) => prev.concat(list.filter(isVisibleBonusTransaction)));
      setHasMore(list.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilter, errorText, hasMore, loading, loadingMore, transactions.length]);

  const renderTransaction = useCallback(({ item }: { item: BonusTransaction }) => {
    const meta = getTransactionMeta(item.type);
    const amount = Math.abs(Number(item.amount || 0));
    const reason = getTransactionReasonText(item, meta);
    const amountText = amount > 0 ? `${meta.sign}${formatNumber(amount)}` : '0';
    return (
      <View style={styles.transactionCard}>
        <View style={styles.transactionMain}>
          <Text style={styles.transactionTitle}>{meta.label}</Text>
          <Text style={styles.transactionReason} numberOfLines={2}>{reason}</Text>
        </View>
        <View style={styles.transactionSide}>
          <Text style={[styles.transactionAmount, { color: meta.tone }]}>{amountText}</Text>
          <Text style={styles.transactionMeta}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    );
  }, []);

  return (
    <Screen>
      <FlatList
        style={styles.root}
        contentContainerStyle={styles.content}
        data={transactions}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderTransaction}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={(
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {filters.map((filter) => (
                <Pressable
                  key={filter.value}
                  onPress={() => setActiveFilter(filter.value)}
                  style={[styles.chip, filter.value === activeFilter ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, filter.value === activeFilter ? styles.chipTextActive : null]}>{filter.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {loading ? <Text style={styles.stateText}>Загружаем...</Text> : null}
            {errorText ? <Text style={styles.stateText}>{errorText}</Text> : null}
            {!loading && !errorText && !transactions.length ? <Text style={styles.stateText}>Начислений пока нет</Text> : null}
          </>
        )}
        ListFooterComponent={loadingMore ? <Text style={styles.stateText}>Загружаем еще...</Text> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
  },
  chips: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  chipTextActive: {
    color: theme.colors.primaryText,
  },
  content: {
    padding: theme.spacing.lg,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: theme.spacing.lg,
    textAlign: 'center',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  transactionCard: {
    alignItems: 'flex-start',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  transactionMain: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  transactionMeta: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  transactionReason: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  transactionSide: {
    alignItems: 'flex-end',
    minWidth: 86,
  },
  transactionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
});
