import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '../../../shared/ui';

type ChatTypingIndicatorProps = {
  label?: string;
  visible: boolean;
};

export function ChatTypingIndicator({ label = 'Оператор печатает', visible }: ChatTypingIndicatorProps) {
  if (!visible) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotMuted]} />
        <View style={[styles.dot, styles.dotWeak]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#8f8f95',
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  dotMuted: {
    opacity: 0.72,
  },
  dotWeak: {
    opacity: 0.42,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    marginLeft: 4,
  },
  root: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    minHeight: 24,
    paddingHorizontal: 14,
  },
  text: {
    color: '#73777f',
    fontSize: 13,
    fontWeight: '500',
  },
});
