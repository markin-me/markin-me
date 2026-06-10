import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../app/navigation/routes';
import {
  isSameCachedValue,
  readCachedCustomerPassport,
  resolveAssetUrl,
  type CustomerBenefitCard,
  type CustomerBenefits,
} from '../../shared/api';
import { ensureCheckoutBenefitsState, readCheckoutBenefitsState } from '../../features/checkout';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

type BenefitsPageProps = NativeStackScreenProps<RootStackParamList, 'benefits'>;
type BenefitSectionKey = RootStackParamList['benefits']['initialSection'];

const sectionMeta: Record<BenefitSectionKey, { empty: string; title: string }> = {
  discounts: {
    empty: 'У вас пока нет активных скидок',
    title: 'Скидки',
  },
  gifts: {
    empty: 'Здесь появятся доступные подарки.',
    title: 'Подарки',
  },
  promocodes: {
    empty: 'У вас пока нет доступных промокодов',
    title: 'Промокоды',
  },
  tasks: {
    empty: 'Здесь появится прогресс заданий.',
    title: 'Задания',
  },
};

const sections: BenefitSectionKey[] = ['promocodes', 'discounts', 'gifts', 'tasks'];

const emptyBenefits: CustomerBenefits = {
  completed: [],
  discounts: [],
  gifts: [],
  progress: [],
  promo_codes: [],
};

function asText(value: unknown) {
  return String(value || '').trim();
}

function formatDate(value: unknown) {
  const text = asText(value);
  if (!text) return '';
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

function getSectionItems(data: CustomerBenefits, section: BenefitSectionKey) {
  if (section === 'promocodes') {
    return (Array.isArray(data.promo_codes) ? data.promo_codes : []).filter((item) => (
      Number(item?.usage_limit || 0) <= 0 || Number(item?.usage_count || 0) < Number(item?.usage_limit || 0)
    ));
  }
  if (section === 'discounts') return Array.isArray(data.discounts) ? data.discounts : [];
  if (section === 'gifts') return Array.isArray(data.gifts) ? data.gifts : [];
  return Array.isArray(data.progress) ? data.progress : [];
}

function getItemTitle(item: CustomerBenefitCard, section: BenefitSectionKey) {
  const fallbackTitle: Record<BenefitSectionKey, string> = {
    discounts: 'Скидка',
    gifts: 'Подарок',
    promocodes: 'Промокод',
    tasks: 'Задание',
  };
  return asText(item.title) || fallbackTitle[section];
}

function BenefitDetails({ item }: { item: CustomerBenefitCard }) {
  const details = [
    asText(item.apply_scope_text),
    formatDate(item.expires_at) ? `До ${formatDate(item.expires_at)}` : '',
    Number(item.usage_limit || 0) > 0 ? `Лимит: ${Number(item.usage_limit || 0)}` : '',
    Number(item.usage_count || 0) > 0 ? `Использовано: ${Number(item.usage_count || 0)}` : '',
    asText(item.disabled_reason_text),
  ].filter(Boolean);

  if (!details.length) return null;

  return (
    <View style={styles.details}>
      {details.map((detail) => (
        <Text key={detail} style={styles.detailText}>{detail}</Text>
      ))}
    </View>
  );
}

function BenefitBadge({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function BenefitCard({
  copiedCode,
  item,
  onCopyCode,
  section,
}: {
  copiedCode: string;
  item: CustomerBenefitCard;
  onCopyCode: (code: string) => void;
  section: BenefitSectionKey;
}) {
  const code = asText(item.code);
  const photoUrl = resolveAssetUrl(asText(item.photo_url));
  const description = asText(item.description);
  const statusText = asText(item.status_text);
  const progressText = asText(item.progress_text || item.progress_display_value);
  const isCopied = Boolean(code) && copiedCode === code;
  const isGift = section === 'gifts';
  const isTask = section === 'tasks';

  return (
    <View style={[styles.card, isGift && styles.giftCard]}>
      <View style={styles.cardHead}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={isGift ? styles.giftImage : styles.cardImage} /> : null}
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{getItemTitle(item, section)}</Text>
          {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
        </View>
        <BenefitBadge text={asText(item.badge_text)} />
      </View>

      {code ? (
        <View style={styles.codeRow}>
          <Text numberOfLines={1} style={styles.codeText}>{code}</Text>
          {item.is_copyable !== false ? (
            <Pressable onPress={() => onCopyCode(code)} style={styles.copyButton}>
              <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} color={theme.colors.primaryText} size={16} />
              <Text style={styles.copyButtonText}>{isCopied ? 'Скопировано' : 'Копировать'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {description ? <Text style={styles.description}>{description}</Text> : null}
      {isTask && progressText ? <Text style={styles.progressText}>{progressText}</Text> : null}
      <BenefitDetails item={item} />
    </View>
  );
}

export function BenefitsPage({ route }: BenefitsPageProps) {
  const initialSection = route.params.initialSection;
  const [activeSection, setActiveSection] = useState<BenefitSectionKey>(initialSection);
  const [benefits, setBenefits] = useState<CustomerBenefits>(emptyBenefits);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const loadBenefits = useCallback(async () => {
    setErrorText('');
    try {
      const passport = await readCachedCustomerPassport();
      if (!passport?.token) {
        setBenefits(emptyBenefits);
        setErrorText('Войдите в профиль, чтобы увидеть выгоды.');
        setLoading(false);
        return;
      }
      const cachedState = await readCheckoutBenefitsState().catch(() => null);
      const cachedBenefits = cachedState?.sourceBenefits || emptyBenefits;
      const hasCachedBenefits = !!(cachedState?.preview || cachedState?.sourceBenefits);
      if (hasCachedBenefits) {
        setBenefits(cachedBenefits);
        setLoading(false);
      }

      const freshState = await ensureCheckoutBenefitsState().catch((error) => {
        if (!hasCachedBenefits) throw error;
        return null;
      });
      const nextBenefits = freshState?.sourceBenefits || cachedBenefits;
      if (!isSameCachedValue(nextBenefits, cachedBenefits)) setBenefits(nextBenefits);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить выгоды.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBenefits();
  }, [loadBenefits]);

  useEffect(() => {
    if (!copiedCode) return undefined;
    const timer = setTimeout(() => setCopiedCode(''), 1400);
    return () => clearTimeout(timer);
  }, [copiedCode]);

  const items = useMemo(() => getSectionItems(benefits, activeSection), [activeSection, benefits]);

  const copyCode = useCallback(async (code: string) => {
    const normalized = asText(code);
    if (!normalized) return;
    await Clipboard.setStringAsync(normalized);
    setCopiedCode(normalized);
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{sectionMeta[activeSection].title}</Text>

        <ScrollView
          contentContainerStyle={styles.tabsContent}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
        >
          {sections.map((section) => {
            const active = section === activeSection;
            return (
              <Pressable
                key={section}
                onPress={() => setActiveSection(section)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{sectionMeta[section].title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.stateText}>Загрузка…</Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {!isLoading && !errorText && !items.length ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{sectionMeta[activeSection].empty}</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          activeSection === 'gifts' ? (
            <ScrollView
              contentContainerStyle={styles.giftsList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {items.map((item, index) => (
                <BenefitCard
                  key={`${item.id || item.title || activeSection}-${index}`}
                  copiedCode={copiedCode}
                  item={item}
                  onCopyCode={copyCode}
                  section={activeSection}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.list}>
              {items.map((item, index) => (
                <BenefitCard
                  key={`${item.id || item.title || activeSection}-${index}`}
                  copiedCode={copiedCode}
                  item={item}
                  onCopyCode={copyCode}
                  section={activeSection}
                />
              ))}
            </View>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  cardHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  cardImage: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.sm,
    height: 42,
    width: 42,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  cardTitleWrap: {
    flex: 1,
    gap: 2,
  },
  codeRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  codeText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  copyButtonText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  description: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  details: {
    gap: 3,
  },
  detailText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  giftCard: {
    width: 260,
  },
  giftImage: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.md,
    height: 54,
    width: 54,
  },
  giftsList: {
    gap: theme.spacing.md,
    paddingRight: theme.spacing.lg,
  },
  list: {
    gap: theme.spacing.md,
  },
  progressText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
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
  statusText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  tab: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  tabs: {
    marginBottom: theme.spacing.lg,
  },
  tabsContent: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
  },
  tabText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  tabTextActive: {
    color: theme.colors.primaryText,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: theme.spacing.md,
  },
});
