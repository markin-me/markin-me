import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BottomSheet, AppText as Text } from '../../../shared/ui';
import { CHAT_EXTRA_REACTIONS, CHAT_QUICK_REACTIONS } from '../../../features/chat';

type ChatActionSheetProps = {
  canEdit: boolean;
  expanded: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReact: (reaction: string) => void;
  onReply: () => void;
  onSelect: () => void;
  setExpanded: (value: boolean) => void;
  visible: boolean;
};

export function ChatActionSheet({ canEdit, expanded, onClose, onCopy, onDelete, onEdit, onReact, onReply, onSelect, setExpanded, visible }: ChatActionSheetProps) {
  const reactions = expanded ? [...CHAT_QUICK_REACTIONS, ...CHAT_EXTRA_REACTIONS] : CHAT_QUICK_REACTIONS;

  return (
    <BottomSheet onClose={onClose} visible={visible}>
      <View style={styles.reactions}>
        {reactions.map((reaction) => (
          <Pressable key={reaction} onPress={() => onReact(reaction)} style={styles.reaction}>
            <Text style={styles.reactionText}>{reaction}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setExpanded(!expanded)} style={styles.reaction}>
          <Text style={styles.more}>{expanded ? '⌃' : '⌄'}</Text>
        </Pressable>
      </View>
      <Action icon="return-up-back" label="Ответить" onPress={onReply} />
      <Action icon="copy-outline" label="Скопировать" onPress={onCopy} />
      {canEdit ? <Action icon="create-outline" label="Изменить" onPress={onEdit} /> : null}
      <Action danger icon="trash-outline" label="Удалить" onPress={onDelete} />
      <View style={styles.divider} />
      <Action icon="checkmark-circle-outline" label="Выбрать" onPress={onSelect} />
    </BottomSheet>
  );
}

function Action({ danger, icon, label, onPress }: { danger?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Ionicons color={danger ? '#ef4444' : '#111827'} name={icon} size={22} />
      <Text style={[styles.actionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 46,
  },
  actionText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  danger: {
    color: '#ef4444',
  },
  divider: {
    backgroundColor: '#e5e7eb',
    height: 1,
    marginVertical: 6,
  },
  more: {
    color: '#6b7280',
    fontSize: 22,
    fontWeight: '800',
  },
  reaction: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  reactionText: {
    fontSize: 22,
    lineHeight: 26,
  },
  reactions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    marginBottom: 8,
  },
});
