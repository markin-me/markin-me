import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  formatChatTime,
  getReaction,
  isOutgoing,
  type ChatMessage,
  type ChatOrderCard,
} from '../../../features/chat';
import { resolveAssetUrl } from '../../../shared/api';
import { AppText as Text } from '../../../shared/ui';
import { ChatOrderCards } from './ChatOrderCards';

type ChatMessageBubbleProps = {
  message: ChatMessage;
  onLongPress: (message: ChatMessage) => void;
  onOpenImage: (uri: string) => void;
  onOpenOrder: (card: ChatOrderCard) => void;
  onPress: (message: ChatMessage) => void;
  selected?: boolean;
  selectionMode?: boolean;
};

export function ChatMessageBubble({ message, onLongPress, onOpenImage, onOpenOrder, onPress, selected, selectionMode }: ChatMessageBubbleProps) {
  const outgoing = isOutgoing(message);
  const imageUri = resolveAssetUrl(message.attachment?.url || message.attachment?.dataUrl || '');
  const reaction = getReaction(message);
  const orderCards = Array.isArray(message.orderCards) ? message.orderCards : [];
  const hasOrderCards = orderCards.length > 0;

  return (
    <Pressable
      onLongPress={() => onLongPress(message)}
      onPress={() => onPress(message)}
      style={[styles.row, outgoing ? styles.rowOut : styles.rowIn, selectionMode && styles.rowSelection]}
    >
      {selectionMode ? (
        <View style={[styles.badge, selected && styles.badgeActive]}>
          {selected ? <Ionicons color="#fff" name="checkmark" size={14} /> : null}
        </View>
      ) : null}
      <View style={[styles.bubble, outgoing ? styles.out : styles.in, hasOrderCards && styles.bubbleOrderCard, selected && styles.selected]}>
        {message.replyTo ? (
          <View style={[styles.reply, outgoing && styles.replyOut]}>
            <Text numberOfLines={1} style={[styles.replyName, outgoing && styles.replyNameOut]}>{message.replyTo.sender || 'Ответ'}</Text>
            <Text numberOfLines={1} style={[styles.replyText, outgoing && styles.replyTextOut]}>{message.replyTo.text}</Text>
          </View>
        ) : null}
        {imageUri ? (
          <Pressable onPress={() => onOpenImage(imageUri)}>
            <Image source={{ uri: imageUri }} style={styles.image} />
          </Pressable>
        ) : null}
        {message.text ? <Text selectable style={[styles.text, outgoing && styles.textOut, hasOrderCards && styles.textWithCards]}>{message.text}</Text> : null}
        {hasOrderCards ? <ChatOrderCards cards={orderCards} onOpen={onOpenOrder} /> : null}
        <View style={hasOrderCards ? styles.metaInline : styles.meta}>
          {message.editedAt ? <Text style={[styles.time, outgoing && styles.timeOut]}>изм.</Text> : null}
          <Text style={[styles.time, outgoing && styles.timeOut]}>{formatChatTime(message.createdAt)}</Text>
          {outgoing ? <Ionicons color={message.deliveryStatus === 'read' || message.read ? '#38bdf8' : '#94a3b8'} name={message.deliveryStatus === 'delivered' || message.deliveryStatus === 'read' || message.read ? 'checkmark-done' : 'checkmark'} size={15} /> : null}
        </View>
      </View>
      {reaction ? <Text style={[styles.reaction, outgoing ? styles.reactionOut : styles.reactionIn]}>{reaction}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: '#fff',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 8,
    height: 22,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    width: 22,
  },
  badgeActive: {
    backgroundColor: '#22c55e',
  },
  bubble: {
    borderRadius: 18,
    maxWidth: '86%',
    minHeight: 38,
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    position: 'relative',
  },
  bubbleOrderCard: {
    maxWidth: '92%',
    paddingBottom: 8,
  },
  image: {
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    height: 214,
    marginBottom: 4,
    width: 214,
  },
  in: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 0,
  },
  meta: {
    alignItems: 'center',
    bottom: 6,
    flexDirection: 'row',
    gap: 3,
    position: 'absolute',
    right: 9,
  },
  metaInline: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
  },
  out: {
    backgroundColor: '#5f6167',
    borderBottomRightRadius: 0,
  },
  reaction: {
    bottom: 0,
    fontSize: 23,
    position: 'absolute',
  },
  reactionIn: {
    left: '88%',
  },
  reactionOut: {
    right: '88%',
  },
  reply: {
    backgroundColor: 'rgba(124,107,255,0.12)',
    borderLeftColor: '#7c6bff',
    borderLeftWidth: 3,
    borderRadius: 10,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  replyName: {
    color: '#7c6bff',
    fontSize: 13,
    fontWeight: '800',
  },
  replyNameOut: {
    color: '#dcfce7',
  },
  replyOut: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderLeftColor: '#86efac',
  },
  replyText: {
    color: '#111827',
    fontSize: 13,
  },
  replyTextOut: {
    color: 'rgba(255,255,255,0.96)',
  },
  row: {
    marginVertical: 4,
    position: 'relative',
  },
  rowIn: {
    alignItems: 'flex-start',
  },
  rowOut: {
    alignItems: 'flex-end',
  },
  rowSelection: {
    paddingLeft: 30,
  },
  selected: {
    borderColor: 'rgba(34,197,94,0.32)',
    borderWidth: 2,
  },
  text: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 22,
    paddingRight: 72,
  },
  textOut: {
    color: '#fff',
  },
  textWithCards: {
    paddingRight: 0,
  },
  time: {
    color: '#a5a5ab',
    fontSize: 12,
  },
  timeOut: {
    color: 'rgba(255,255,255,0.75)',
  },
});
