import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText as Text } from '../../../shared/ui';

type ChatHeaderProps = {
  onClose: () => void;
  subtitle?: string;
  title: string;
};

export function ChatHeader({ onClose, subtitle, title }: ChatHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
          <Ionicons color="#6b7280" name="close" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    elevation: 4,
    height: 45,
    justifyContent: 'center',
    minHeight: 45,
    paddingHorizontal: 12,
    shadowColor: '#0f172a',
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  root: {
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 20,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  titleWrap: {
    minWidth: 0,
    paddingHorizontal: 52,
  },
});
