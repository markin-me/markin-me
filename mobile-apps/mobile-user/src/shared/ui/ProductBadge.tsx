import { useId } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { theme } from '../config/theme';
import { AppText } from './AppText';

type ProductBadgeTone = 'discount' | 'promo';

export function ProductBadge({ style, text, tone = 'promo' }: {
  style?: StyleProp<ViewStyle>;
  text: string;
  tone?: ProductBadgeTone;
}) {
  const gradientId = `productBadgeGradient${useId().replace(/:/g, '')}`;
  if (!text) return null;
  return (
    <View style={[styles.badge, style]}>
      <View style={styles.surface}>
        <Svg
          height="100%"
          pointerEvents="none"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFillObject}
          viewBox="0 0 100 28"
          width="100%"
        >
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
              <Stop offset="0%" stopColor={theme.colors.accent} />
              <Stop offset="100%" stopColor="#ffb15a" />
            </SvgLinearGradient>
          </Defs>
          <Rect fill={`url(#${gradientId})`} height="28" width="100" />
        </Svg>
        <AppText style={[styles.text, tone === 'discount' ? styles.discountText : styles.promoText]}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    elevation: 4,
    justifyContent: 'center',
    shadowColor: '#141d30',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
  },
  surface: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    color: theme.colors.primaryText,
    fontSize: 11,
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
