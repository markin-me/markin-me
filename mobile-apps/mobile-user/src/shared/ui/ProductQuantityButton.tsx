import { useId, type ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { theme } from '../config/theme';

export function ProductQuantityButton({
  children,
  disabled = false,
  hitSlop,
  onPress,
  size = 'default',
  style,
}: {
  children: ReactNode;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  onPress?: PressableProps['onPress'];
  size?: 'compact' | 'default';
  style?: StyleProp<ViewStyle>;
}) {
  const gradientId = `productQuantityButtonGradient${useId().replace(/:/g, '')}`;
  const content = (
    <>
      <Svg
        height="100%"
        pointerEvents="none"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFillObject}
        viewBox="0 0 32 32"
        width="100%"
      >
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor={theme.colors.accent} />
            <Stop offset="100%" stopColor="#ffb15a" />
          </SvgLinearGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="32" rx="8" ry="8" width="32" />
      </Svg>
      {children}
    </>
  );

  if (!onPress) {
    return <View style={[styles.button, size === 'compact' && styles.compact, disabled && styles.disabled, style]}>{content}</View>;
  }

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={[styles.button, size === 'compact' && styles.compact, disabled && styles.disabled, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    elevation: 5,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    shadowColor: '#141d30',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    width: 32,
  },
  disabled: {
    opacity: 0.35,
  },
  compact: {
    height: 24,
    width: 24,
  },
});
