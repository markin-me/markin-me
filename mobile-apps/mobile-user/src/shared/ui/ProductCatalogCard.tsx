import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import { theme } from '../config/theme';
import { formatPrice } from '../lib/formatPrice';
import { AppText as Text } from './AppText';
import { ProductBadge } from './ProductBadge';
import { ProductQuantityButton } from './ProductQuantityButton';

type ProductCatalogCardProps = {
  canPressAction?: boolean;
  descriptionLines?: string[];
  discountBadgeText?: string;
  imageUrl?: string;
  mediaPillText?: string;
  oldPrice?: number;
  onPress?: () => void;
  onPressAction?: () => void;
  price?: number;
  promoBadgeText?: string;
  title: string;
};

export function ProductCatalogCard({
  canPressAction = true,
  descriptionLines = [],
  discountBadgeText = '',
  imageUrl = '',
  mediaPillText = '',
  oldPrice = 0,
  onPress,
  onPressAction,
  price = 0,
  promoBadgeText = '',
  title,
}: ProductCatalogCardProps) {
  const normalizedPrice = Number(price || 0);
  const normalizedOldPrice = Number(oldPrice || 0);
  const hasOldPrice = normalizedOldPrice > normalizedPrice && normalizedPrice >= 0;
  const safeLines = descriptionLines.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 2);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.media}>
        {imageUrl && Platform.OS === 'web' ? (
          <Image resizeMode="contain" source={{ uri: imageUrl }} style={styles.image} />
        ) : imageUrl ? (
          <ExpoImage
            cachePolicy="memory-disk"
            contentFit="contain"
            source={{ uri: imageUrl }}
            style={styles.image}
          />
        ) : (
          <View style={styles.imagePlaceholder} />
        )}
        {promoBadgeText ? <ProductBadge style={styles.promoBadge} text={promoBadgeText} tone="promo" /> : null}
        {discountBadgeText ? <ProductBadge style={[styles.discountBadge, promoBadgeText ? styles.discountBadgeWithPromo : null]} text={discountBadgeText} tone="discount" /> : null}
        {mediaPillText ? <Text style={styles.mediaPill}>{mediaPillText}</Text> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>{title}</Text>
        <View style={styles.description}>
          {safeLines.map((line, index) => (
            <Text key={`${line}-${index}`} numberOfLines={1} style={styles.descriptionLine}>
              • {line}
            </Text>
          ))}
        </View>
        <View style={styles.footer}>
          <View style={styles.priceStack}>
            {hasOldPrice ? <Text style={styles.oldPrice}>{formatPrice(normalizedOldPrice)}</Text> : null}
            <Text numberOfLines={1} style={styles.price}>{formatPrice(normalizedPrice)}</Text>
          </View>
          {canPressAction ? (
            <ProductQuantityButton
              onPress={(event) => {
                event.stopPropagation();
                if (onPressAction) onPressAction();
                else if (onPress) onPress();
              }}
            >
              <Ionicons name="add" color={theme.colors.primaryText} size={18} />
            </ProductQuantityButton>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: 6,
  },
  card: {
    aspectRatio: 0.56,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    elevation: 1,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    width: '48%',
  },
  description: {
    height: 31,
    marginTop: theme.spacing.xs,
  },
  descriptionLine: {
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  discountBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
  },
  discountBadgeWithPromo: {
    right: 48,
  },
  footer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    minHeight: 40,
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    height: '100%',
    width: '100%',
  },
  media: {
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    bottom: 10,
    color: theme.colors.text,
    elevation: 3,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 10,
    shadowColor: '#111827',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  oldPrice: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    minHeight: 12,
    textDecorationLine: 'line-through',
  },
  price: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  priceStack: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  promoBadge: {
    position: 'absolute',
    right: 7,
    top: 7,
  },
  title: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    height: 36,
    lineHeight: 16,
  },
});
