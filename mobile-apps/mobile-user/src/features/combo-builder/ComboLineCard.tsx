import {
  Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { CatalogComboBlockProduct } from '../../entities/product';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import type { ComboConfiguredProduct } from './model';
import {
  getComboProductImage,
  getComboProductLines,
  getComboProductOldPrice,
  getComboProductPrice,
  getComboProductTitle,
} from './model';

import { AppText as Text } from '../../shared/ui';
export function ComboLineCard({
  config,
  onGearPress,
  product,
  selected,
  showGear = true,
  showReplace = true,
  showSelectedCheck = true,
  onPress,
}: {
  config?: ComboConfiguredProduct | null;
  onGearPress?: () => void;
  product: CatalogComboBlockProduct | null;
  selected?: boolean;
  showGear?: boolean;
  showReplace?: boolean;
  showSelectedCheck?: boolean;
  onPress?: () => void;
}) {
  const image = getComboProductImage(product, config);
  const lines = getComboProductLines(product, config);
  const price = getComboProductPrice(product, config);
  const oldPrice = getComboProductOldPrice(product, config);
  const preview = product?.preview;
  const previewRecord = preview && typeof preview === 'object' ? preview as Record<string, unknown> : {};
  const optionGroups = previewRecord.optionGroups;
  const configurable = Boolean(
    preview?.hasConfigurable ||
      (Array.isArray(preview?.ingredients) && preview.ingredients.length > 0) ||
      (Array.isArray(preview?.variants) && preview.variants.length > 0) ||
      (Array.isArray(optionGroups) && optionGroups.length > 0),
  );

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.comboLineCard, selected && styles.comboLineCardSelected]}
    >
      <View style={styles.comboLineImageWrap}>
        {image ? (
          Platform.OS === 'web' ? (
            <Image resizeMode="contain" source={{ uri: image }} style={styles.comboLineImage} />
          ) : (
            <ExpoImage cachePolicy="memory-disk" contentFit="contain" source={{ uri: image }} style={styles.comboLineImage} />
          )
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
      <View style={styles.comboLineBody}>
        <Text numberOfLines={2} style={styles.comboLineTitle}>{getComboProductTitle(product, config)}</Text>
        <View style={styles.comboLineMeta}>
          {lines.map((line, index) => (
            <Text key={`${line}-${index}`} numberOfLines={1} style={styles.comboLineMetaText}>• {line}</Text>
          ))}
        </View>
        <View style={styles.comboLineFooter}>
          <View style={styles.comboLinePrices}>
            {oldPrice > price ? <Text style={styles.comboLineOldPrice}>{formatPrice(oldPrice)}</Text> : null}
            <Text style={styles.comboLinePrice}>{formatPrice(price)}</Text>
          </View>
          {showReplace && onPress ? (
            <View style={styles.comboReplaceButton}>
              <Text style={styles.comboReplaceText}>Заменить</Text>
            </View>
          ) : null}
        </View>
      </View>
      {showGear && configurable ? (
        <Pressable
          disabled={!onGearPress}
          onPress={(event) => {
            event.stopPropagation();
            onGearPress?.();
          }}
          style={styles.comboLineGear}
        >
          <Ionicons name="settings-outline" color={theme.colors.accent} size={18} />
        </Pressable>
      ) : null}
      {selected && showSelectedCheck ? (
        <View style={styles.comboLineCheck}>
          <Ionicons name="checkmark" color={theme.colors.primaryText} size={18} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  comboLineBody: {
    flex: 1,
    minWidth: 0,
  },
  comboLineCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
    minHeight: 112,
    padding: theme.spacing.md,
  },
  comboLineCardSelected: {
    borderColor: theme.colors.accent,
  },
  comboLineCheck: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  comboLineFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  comboLineGear: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  comboLineImage: {
    height: '100%',
    width: '100%',
  },
  comboLineImageWrap: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 72,
    overflow: 'hidden',
    width: 72,
  },
  comboLineMeta: {
    marginTop: theme.spacing.xs,
    minHeight: 28,
  },
  comboLineMetaText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  comboLineOldPrice: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginRight: theme.spacing.xs,
    textDecorationLine: 'line-through',
  },
  comboLinePrice: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  comboLinePrices: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  comboLineTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  comboReplaceButton: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  comboReplaceText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  placeholder: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
});
