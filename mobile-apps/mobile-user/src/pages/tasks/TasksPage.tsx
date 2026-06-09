import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ensureCheckoutBenefitsState, readCheckoutBenefitsState, type CheckoutBenefitsState } from '../../features/checkout';
import { readCachedCustomerPassport, type CustomerBenefitCard } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

function asText(value: unknown) {
  return String(value || '').trim();
}

function getRewardKind(item: CustomerBenefitCard) {
  const preview = item.reward_preview && typeof item.reward_preview === 'object' ? item.reward_preview as Record<string, unknown> : null;
  return asText(preview?.kind || preview?.icon_kind || item.reward_kind).toLowerCase();
}

function getRewardIcon(kind: string) {
  if (kind === 'promo_code') return 'ticket';
  if (kind === 'discount') return 'pricetag';
  return 'gift';
}

function getProgressRatio(item: CustomerBenefitCard) {
  const ratio = Number(item.progress_ratio || 0);
  if (Number.isFinite(ratio) && ratio > 0) return Math.max(0, Math.min(1, ratio));
  const current = Number(item.progress_display_value ?? item.progress_value ?? 0);
  const target = Number(item.threshold_value || 0);
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1, current / target));
}

function getProgressVisual(item: CustomerBenefitCard) {
  return item.progress_visual && typeof item.progress_visual === 'object'
    ? item.progress_visual as Record<string, unknown>
    : null;
}

function getProgressMode(item: CustomerBenefitCard) {
  const visual = getProgressVisual(item);
  return asText(visual?.mode || item.progress_basis).toLowerCase();
}

function getProgressSlots(item: CustomerBenefitCard) {
  const visual = getProgressVisual(item);
  return Array.isArray(visual?.slots) ? visual.slots : [];
}

function formatProgressText(item: CustomerBenefitCard) {
  const text = asText(item.progress_text);
  if (text) return text;
  const current = Number(item.progress_display_value ?? item.progress_value ?? 0);
  const target = Number(item.threshold_value || 0);
  if (!(target > 0)) return '';
  return `${current} / ${target}`;
}

function TaskProgressVisual({ item }: { item: CustomerBenefitCard }) {
  const mode = getProgressMode(item);
  const slots = getProgressSlots(item);
  const ratio = getProgressRatio(item);
  const progressText = formatProgressText(item);

  if (mode === 'orders' && slots.length) {
    return (
      <View style={styles.slotsWrap}>
        {slots.map((rawSlot, index) => {
          const slot = rawSlot && typeof rawSlot === 'object' ? rawSlot as Record<string, unknown> : {};
          const filled = slot.is_filled === true;
          return (
            <View key={`${slot.index || index}`} style={[styles.orderSlot, filled && styles.orderSlotFilled]}>
              <Ionicons name="receipt" color={filled ? theme.colors.primaryText : theme.colors.accent} size={18} />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      {progressText ? <Text style={styles.progressText}>{progressText}</Text> : null}
    </View>
  );
}

function TaskCard({ item }: { item: CustomerBenefitCard }) {
  const title = asText(item.title) || 'Накопление';
  const rewardKind = getRewardKind(item);
  const canClaim = item.is_claimable === true;

  return (
    <View style={styles.card}>
      <View style={styles.rewardPane}>
        <View style={styles.rewardBox}>
          <Ionicons name={getRewardIcon(rewardKind)} color={theme.colors.accent} size={44} />
          {Number(item.pending_reward_count || 0) > 0 ? (
            <View style={styles.rewardCount}>
              <Text style={styles.rewardCountText}>{Number(item.pending_reward_count || 0)}</Text>
            </View>
          ) : null}
        </View>
        <Pressable disabled style={[styles.claimButton, !canClaim && styles.claimButtonDisabled]}>
          <Text style={styles.claimButtonText}>Забрать</Text>
        </Pressable>
      </View>

      <View style={styles.taskMain}>
        <Text style={styles.taskTitle}>{title}</Text>
        <TaskProgressVisual item={item} />
      </View>
    </View>
  );
}

export function TasksPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const setStateFromBenefits = useCallback((state: CheckoutBenefitsState) => {
    const nextItems = Array.isArray(state.preview?.progress)
      ? state.preview.progress
      : Array.isArray(state.sourceBenefits?.progress)
        ? state.sourceBenefits.progress
        : [];
    setItems(nextItems);
  }, []);

  const loadTasks = useCallback(async () => {
    const passport = await readCachedCustomerPassport();
    if (!passport?.token) {
      setItems([]);
      setErrorText('Войдите в профиль, чтобы увидеть задания.');
      setLoading(false);
      return;
    }

    setErrorText('');
    try {
      const cachedState = await readCheckoutBenefitsState();
      setStateFromBenefits(cachedState);
      if (
        (Array.isArray(cachedState.preview?.progress) && cachedState.preview.progress.length)
        || (Array.isArray(cachedState.sourceBenefits?.progress) && cachedState.sourceBenefits.progress.length)
      ) {
        setLoading(false);
      }

      const freshState = await ensureCheckoutBenefitsState();
      setStateFromBenefits(freshState);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить задания.');
    } finally {
      setLoading(false);
    }
  }, [setStateFromBenefits]);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
    }, [loadTasks]),
  );

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
            <Text style={styles.stateText}>Здесь появится прогресс заданий.</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.list}>
            {items.map((item, index) => (
              <TaskCard key={`${item.id || item.title || index}`} item={item} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  claimButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  claimButtonDisabled: {
    opacity: 0.55,
  },
  claimButtonText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
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
  list: {
    gap: 12,
  },
  orderSlot: {
    alignItems: 'center',
    backgroundColor: '#fff1e8',
    borderColor: '#ffb27f',
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  orderSlotFilled: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  progressText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#eef0f3',
    borderRadius: theme.radius.pill,
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
  progressWrap: {
    gap: 6,
    marginTop: 14,
  },
  rewardBox: {
    alignItems: 'center',
    backgroundColor: '#fff1e8',
    borderColor: theme.colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  rewardCount: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    bottom: 8,
    minWidth: 28,
    paddingHorizontal: 6,
    position: 'absolute',
  },
  rewardCountText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  rewardPane: {
    alignItems: 'center',
    gap: 8,
    width: 80,
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
  slotsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  taskMain: {
    flex: 1,
  },
  taskTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
});
