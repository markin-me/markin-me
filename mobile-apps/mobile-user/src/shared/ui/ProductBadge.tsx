import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet } from 'react-native';

import { theme } from '../config/theme';
import { AppText } from './AppText';

type ProductBadgeTone = 'discount' | 'promo';

export function ProductBadge({ style, text, tone = 'promo' }: {
  style?: StyleProp<TextStyle>;
  text: string;
  tone?: ProductBadgeTone;
}) {
  if (!text) return null;
  return (
    <AppText style={[styles.badge, tone === 'discount' ? styles.discountText : styles.promoText, style]}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    color: theme.colors.primaryText,
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  discountText: {
    fontWeight: '800',
  },
  promoText: {
    fontWeight: '900',
  },
});
