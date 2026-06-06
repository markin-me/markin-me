import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchCustomerBenefits,
  readCachedCustomerPassport,
  resolveAssetUrl,
  type CustomerBenefitCard,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

function asText(value: unknown) {
  return String(value || '').trim();
}

function getGiftTitle(item: CustomerBenefitCard) {
  const products = Array.isArray(item.products) ? item.products : [];
  const firstProduct = products[0] && typeof products[0] === 'object' ? products[0] as Record<string, unknown> : null;
  return asText(firstProduct?.title) || asText(item.title) || 'Подарок';
}

function getGiftPhoto(item: CustomerBenefitCard) {
  const products = Array.isArray(item.products) ? item.products : [];
  const firstProduct = products[0] && typeof products[0] === 'object' ? products[0] as Record<string, unknown> : null;
  const preview = item.reward_preview && typeof item.reward_preview === 'object' ? item.reward_preview as Record<string, unknown> : null;
  return resolveAssetUrl(asText(item.photo_url || firstProduct?.photo_url || preview?.photo_url));
}

function GiftCard({ item }: { item: CustomerBenefitCard }) {
  const title = getGiftTitle(item);
  const photoUrl = getGiftPhoto(item);
  const actionText = asText(item.action_mode).toLowerCase() === 'claim_unique_promo' ? 'Забрать' : 'Получить';

  return (
    <View style={styles.card}>
      <View style={styles.media}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.image} />
        ) : (
          <Ionicons name="ticket" color={theme.colors.accent} size={42} />
        )}
      </View>
      <Text numberOfLines={2} style={styles.title}>{title}</Text>
      <Pressable disabled style={styles.actionButton}>
        <Text style={styles.actionButtonText}>{actionText}</Text>
      </Pressable>
    </View>
  );
}

export function GiftsPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const loadGifts = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      const passport = await readCachedCustomerPassport();
      if (!passport?.token) {
        setItems([]);
        setErrorText('Войдите в профиль, чтобы увидеть подарки.');
        return;
      }
      const benefits = await fetchCustomerBenefits(passport.token);
      setItems(Array.isArray(benefits.gifts) ? benefits.gifts : []);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить подарки.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGifts();
  }, [loadGifts]);

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
            <Text style={styles.stateText}>Здесь появятся доступные подарки.</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.grid}>
            {items.map((item, index) => (
              <GiftCard key={`${item.id || item.title || index}`} item={item} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    opacity: 0.55,
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    width: 148,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  media: {
    alignItems: 'center',
    backgroundColor: '#fff1e8',
    borderColor: '#ffb27f',
    borderRadius: 14,
    borderWidth: 1,
    height: 146,
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
    width: '100%',
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
  title: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
    marginBottom: 12,
    minHeight: 36,
  },
});
