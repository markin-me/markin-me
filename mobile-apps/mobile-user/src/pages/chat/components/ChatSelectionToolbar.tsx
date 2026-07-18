import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText as Text } from '../../../shared/ui';

type ChatSelectionToolbarProps = {
  count: number;
  onClear: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

export function ChatSelectionToolbar({ count, onClear, onCopy, onDelete }: ChatSelectionToolbarProps) {
  const hasSelection = count > 0;

  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" onPress={onClear} style={styles.close}>
        <Ionicons color="#6b7280" name="close" size={22} />
      </Pressable>
      <Text numberOfLines={1} style={styles.count}>Выбрано {count}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!hasSelection}
          onPress={onCopy}
          style={[styles.action, !hasSelection && styles.actionDisabled]}
        >
          <Ionicons color="#6b7280" name="copy-outline" size={21} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!hasSelection}
          onPress={onDelete}
          style={[styles.action, !hasSelection && styles.actionDisabled]}
        >
          <Ionicons color="#ef4444" name="trash-outline" size={21} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  actionDisabled: {
    opacity: 0.34,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  close: {
    alignItems: 'center',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  count: {
    color: '#111827',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  root: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(229,231,235,0.95)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 14,
    marginVertical: 12,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
