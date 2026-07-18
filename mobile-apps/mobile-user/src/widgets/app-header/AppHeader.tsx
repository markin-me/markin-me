import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../shared/config/theme';

import { AppText as Text } from '../../shared/ui';
type AppHeaderProps = {
  backgroundColor?: string;
  onBack?: () => void;
  onClose?: () => void;
  showBack?: boolean;
  showClose?: boolean;
  title: string;
};

export function AppHeader({ backgroundColor, onBack, onClose, showBack = false, showClose = false, title }: AppHeaderProps) {
  return (
    <View style={[styles.root, backgroundColor ? { backgroundColor } : null]}>
      {showBack && onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Ionicons color={theme.colors.text} name="arrow-back" size={22} />
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <Text style={styles.title}>{title}</Text>
      {showClose && onClose ? (
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <Ionicons color="#6b7280" name="close" size={22} />
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: 'transparent',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerSpacer: {
    width: 36,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -18 }],
    width: 36,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
});
