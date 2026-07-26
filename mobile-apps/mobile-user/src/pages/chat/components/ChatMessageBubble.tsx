import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Pressable, StyleSheet, Text as NativeText, type GestureResponderEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  formatChatTime,
  getEmojiOnlySize,
  getIncomingMessageAuthor,
  getMessageReactionItems,
  isEmojiOnly,
  isOutgoing,
  resolveChatAssetUrl,
  type ChatActor,
  type ChatMessage,
  type ChatOrderCard,
  type ChatSettings,
} from '../../../features/chat';
import { AppText as Text } from '../../../shared/ui';
import { ChatOrderCards } from './ChatOrderCards';

export type ChatMessageBubbleLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type RenderedReactionItem = {
  actor: ChatActor;
  phase: 'leave' | 'pop' | 'stable';
  reaction: string;
  renderKey: string;
};

type ReactionItem = {
  actor: ChatActor;
  reaction: string;
};

type ChatMessageBubbleProps = {
  actor: ChatActor;
  contextClone?: boolean;
  contextHidden?: boolean;
  message: ChatMessage;
  onLongPress: (message: ChatMessage, layout?: ChatMessageBubbleLayout) => void;
  onDoublePress?: (message: ChatMessage) => void;
  onOpenImage: (uri: string) => void;
  onOpenOrder?: (card: ChatOrderCard) => void;
  onPress?: (message: ChatMessage) => void;
  onReact?: (message: ChatMessage, reaction: string) => void;
  onSwipeReply?: (message: ChatMessage) => void;
  settings?: ChatSettings | null;
  selected?: boolean;
  selectionMode?: boolean;
};

const CHAT_SWIPE_CAPTURE_PX = 6;
const CHAT_SWIPE_REPLY_TRIGGER_PX = 36;
const CHAT_SWIPE_MAX_SHIFT_PX = 64;
const CHAT_REACTION_POP_MS = 260;
const CHAT_REACTION_LEAVE_MS = 150;
const CHAT_SELECTION_ANIMATION_MS = 90;
const CHAT_LONG_PRESS_DELAY_MS = 280;
const CHAT_ATTACHMENT_OPEN_DELAY_MS = 330;

function ChatMessageBubbleComponent({
  actor,
  contextClone,
  contextHidden,
  message,
  onLongPress,
  onDoublePress,
  onOpenImage,
  onOpenOrder,
  onPress,
  onReact,
  onSwipeReply,
  settings,
  selected,
  selectionMode,
}: ChatMessageBubbleProps) {
  const outgoing = isOutgoing(message, actor);
  const imageUri = resolveChatAssetUrl(message.attachment?.url || message.attachment?.dataUrl || '');
  const text = String(message.text || '');
  const timeLabel = formatChatTime(message.createdAt);
  const metaLabel = message.editedAt ? `${timeLabel} \u00b7 \u0438\u0437\u043c.` : timeLabel;
  const emojiOnly = !!text && !message.attachment && isEmojiOnly(text);
  const orderCards = Array.isArray(message.orderCards) ? message.orderCards : [];
  const hasOrderCards = orderCards.length > 0;
  const author = getIncomingMessageAuthor(message, actor, settings || null);
  const translateX = useRef(new Animated.Value(0)).current;
  const bubbleRef = useRef<View | null>(null);
  const bubbleLayoutRef = useRef<ChatMessageBubbleLayout | null>(null);
  const bubbleSizeRef = useRef<{ height: number; width: number } | null>(null);
  const swipeReplyTriggeredRef = useRef(false);
  const previousReactionItemsRef = useRef<Array<{ actor: ChatActor; reaction: string }> | null>(null);
  const reactionLeaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const reactionLeaveSeqRef = useRef(0);
  const attachmentOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentLongPressBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localReaction, setLocalReaction] = useState<string | null>(null);
  const [visualSelected, setVisualSelected] = useState(!!selected);
  const clearAttachmentOpenTimer = useCallback(() => {
    if (attachmentOpenTimerRef.current == null) return;
    clearTimeout(attachmentOpenTimerRef.current);
    attachmentOpenTimerRef.current = null;
  }, []);
  const effectiveReactions = useMemo(() => {
    if (localReaction == null) return message.reactions;
    return {
      ...(message.reactions || {}),
      [actor]: localReaction,
    };
  }, [actor, localReaction, message.reactions]);
  const effectiveMessage = useMemo(() => {
    if (localReaction == null) return message;
    return {
      ...message,
      reactions: effectiveReactions,
      reaction: String(effectiveReactions?.[message.direction] || ''),
    };
  }, [effectiveReactions, localReaction, message]);
  const effectiveReactionItems = useMemo<ReactionItem[]>(
    () => getMessageReactionItems(effectiveMessage) as ReactionItem[],
    [effectiveMessage],
  );
  const effectiveReactionSignature = useMemo(
    () => effectiveReactionItems.map((item) => getReactionItemKey(item.actor, item.reaction)).join('|'),
    [effectiveReactionItems],
  );
  const [renderedReactionItems, setRenderedReactionItems] = useState<RenderedReactionItem[]>(() =>
    effectiveReactionItems.map((item) => ({
      actor: item.actor,
      phase: 'stable',
      reaction: item.reaction,
      renderKey: getReactionItemKey(item.actor, item.reaction),
    })),
  );

  useEffect(() => {
    translateX.setValue(0);
  }, [message.id, translateX]);

  useEffect(() => {
    setVisualSelected(!!selected);
  }, [selected]);

  useEffect(() => {
    previousReactionItemsRef.current = null;
    setLocalReaction(null);
    const serverReactionItems = getMessageReactionItems(message) as ReactionItem[];
    setRenderedReactionItems(serverReactionItems.map((item) => ({
      actor: item.actor,
      phase: 'stable',
      reaction: item.reaction,
      renderKey: getReactionItemKey(item.actor, item.reaction),
    })));
  }, [message.id]);

  useEffect(() => {
    if (localReaction == null) return;
    const serverReaction = String(message.reactions?.[actor] || '');
    if (serverReaction === localReaction) setLocalReaction(null);
  }, [actor, localReaction, message.reactions]);

  useEffect(() => () => {
    clearAttachmentOpenTimer();
    if (attachmentLongPressBlockTimerRef.current != null) {
      clearTimeout(attachmentLongPressBlockTimerRef.current);
      attachmentLongPressBlockTimerRef.current = null;
    }
    Object.values(reactionLeaveTimersRef.current).forEach((timer) => clearTimeout(timer));
    reactionLeaveTimersRef.current = {};
  }, [clearAttachmentOpenTimer]);

  useEffect(() => {
    const nextItems = effectiveReactionItems.map((item) => ({
      actor: item.actor,
      reaction: item.reaction,
      key: getReactionItemKey(item.actor, item.reaction),
    }));
    const previousItems = previousReactionItemsRef.current;

    if (!previousItems || contextClone) {
      previousReactionItemsRef.current = effectiveReactionItems.map((item) => ({ actor: item.actor, reaction: item.reaction }));
      setRenderedReactionItems(nextItems.map((item) => ({
        actor: item.actor,
        phase: 'stable',
        reaction: item.reaction,
        renderKey: item.key,
      })));
      return;
    }

    const nextKeys = new Set(nextItems.map((item) => item.key));
    const previousKeys = new Set(previousItems.map((item) => getReactionItemKey(item.actor, item.reaction)));
    const removingOwnReaction = localReaction === '';
    const leavingItems = previousItems
      .map((item) => ({ actor: item.actor, reaction: item.reaction, key: getReactionItemKey(item.actor, item.reaction) }))
      .filter((item) => !nextKeys.has(item.key))
      .filter((item) => !(removingOwnReaction && item.actor === actor))
      .map((item) => ({
        actor: item.actor,
        phase: 'leave' as const,
        reaction: item.reaction,
        renderKey: `leave-${item.key}-${reactionLeaveSeqRef.current += 1}`,
      }));
    const currentItems = nextItems.map((item) => ({
      actor: item.actor,
      phase: previousKeys.has(item.key) ? 'stable' as const : 'pop' as const,
      reaction: item.reaction,
      renderKey: item.key,
    }));

    setRenderedReactionItems([...currentItems, ...leavingItems]);
    previousReactionItemsRef.current = effectiveReactionItems.map((item) => ({ actor: item.actor, reaction: item.reaction }));

    leavingItems.forEach((item) => {
      const timer = setTimeout(() => {
        delete reactionLeaveTimersRef.current[item.renderKey];
        setRenderedReactionItems((current) => current.filter((rendered) => rendered.renderKey !== item.renderKey));
      }, CHAT_REACTION_LEAVE_MS + 24);
      reactionLeaveTimersRef.current[item.renderKey] = timer;
    });
  }, [actor, contextClone, effectiveReactionItems, effectiveReactionSignature, localReaction]);

  const resetSwipe = useCallback(() => {
    Animated.spring(translateX, {
      bounciness: 0,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const handleSwipeMove = useCallback((dx: number) => {
    if (swipeReplyTriggeredRef.current) return;
    translateX.setValue(Math.max(-CHAT_SWIPE_MAX_SHIFT_PX, Math.min(0, dx)));
    if (dx <= -CHAT_SWIPE_REPLY_TRIGGER_PX) {
      swipeReplyTriggeredRef.current = true;
      resetSwipe();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onSwipeReply?.(message);
    }
  }, [message, onSwipeReply, resetSwipe, translateX]);

  const handleSwipeRelease = useCallback((dx: number, vx: number) => {
    const shouldReply = !swipeReplyTriggeredRef.current && (dx <= -CHAT_SWIPE_REPLY_TRIGGER_PX || vx <= -0.85);
    resetSwipe();
    if (shouldReply) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onSwipeReply?.(message);
    }
    swipeReplyTriggeredRef.current = false;
  }, [message, onSwipeReply, resetSwipe]);

  const handleSwipeTerminate = useCallback(() => {
    swipeReplyTriggeredRef.current = false;
    resetSwipe();
  }, [resetSwipe]);

  const measureBubble = useCallback(() => {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        bubbleLayoutRef.current = { height, width, x, y };
      }
    });
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) =>
      !selectionMode &&
      gesture.dx < -CHAT_SWIPE_CAPTURE_PX &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !selectionMode &&
      gesture.dx < -CHAT_SWIPE_CAPTURE_PX &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => handleSwipeMove(gesture.dx),
    onPanResponderRelease: (_, gesture) => handleSwipeRelease(gesture.dx, gesture.vx),
    onPanResponderTerminate: handleSwipeTerminate,
    onPanResponderTerminationRequest: () => true,
  }), [handleSwipeMove, handleSwipeRelease, handleSwipeTerminate, selectionMode]);

  const getLongPressLayout = useCallback((event?: GestureResponderEvent) => {
    const size = bubbleSizeRef.current;
    const measured = bubbleLayoutRef.current;
    if (!event || !size) return null;
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const eventLayout = {
      height: size.height,
      width: size.width,
      x: pageX - locationX,
      y: pageY - locationY,
    };
    if (measured) {
      return {
        height: measured.height,
        width: measured.width,
        x: measured.x,
        y: Math.min(measured.y, eventLayout.y),
      };
    }
    return {
      height: eventLayout.height,
      width: eventLayout.width,
      x: eventLayout.x,
      y: eventLayout.y,
    };
  }, []);

  const handleLongPress = useCallback((event?: GestureResponderEvent) => {
    if (contextClone) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    const cachedLayout = getLongPressLayout(event);
    if (cachedLayout) {
      onLongPress(message, cachedLayout);
      measureBubble();
      return;
    }

    onLongPress(message);
    measureBubble();
  }, [contextClone, getLongPressLayout, measureBubble, message, onLongPress]);

  const handleSelectionPress = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation();
    setVisualSelected((current) => !current);
    onPress?.(message);
  }, [message, onPress]);

  const handleAttachmentLongPress = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation();
    clearAttachmentOpenTimer();
    handleLongPress(event);
    if (attachmentLongPressBlockTimerRef.current != null) clearTimeout(attachmentLongPressBlockTimerRef.current);
    attachmentLongPressBlockTimerRef.current = setTimeout(() => {
      attachmentLongPressBlockTimerRef.current = null;
    }, CHAT_ATTACHMENT_OPEN_DELAY_MS);
  }, [clearAttachmentOpenTimer, handleLongPress]);

  const handleAttachmentPress = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation();
    if (contextClone) return;
    if (attachmentLongPressBlockTimerRef.current != null) {
      clearTimeout(attachmentLongPressBlockTimerRef.current);
      attachmentLongPressBlockTimerRef.current = null;
      return;
    }
    if (selectionMode) {
      handleSelectionPress(event);
      return;
    }
    if (attachmentOpenTimerRef.current != null) {
      clearAttachmentOpenTimer();
      onDoublePress?.(message);
      return;
    }
    attachmentOpenTimerRef.current = setTimeout(() => {
      attachmentOpenTimerRef.current = null;
      if (imageUri) onOpenImage(imageUri);
    }, CHAT_ATTACHMENT_OPEN_DELAY_MS);
  }, [clearAttachmentOpenTimer, contextClone, handleSelectionPress, imageUri, message, onDoublePress, onOpenImage, selectionMode]);

  const displayedSelected = selectionMode ? visualSelected : !!selected;

  return (
    <View
      style={[
        styles.row,
        outgoing ? styles.rowOutgoing : styles.rowIncoming,
        selectionMode && styles.rowSelectionMode,
        contextClone && styles.rowContextClone,
        contextHidden && styles.rowContextHidden,
      ]}
    >
      {selectionMode ? (
        <SelectionBadge
          onPress={handleSelectionPress}
          selected={displayedSelected}
        />
      ) : null}
      <Animated.View
        style={[
          styles.bubbleWrap,
          contextClone && styles.bubbleWrapContextClone,
          !contextClone && { transform: [{ translateX }] },
        ]}
        {...(contextClone ? {} : panResponder.panHandlers)}
      >
        <Pressable
          accessibilityRole="button"
          delayLongPress={CHAT_LONG_PRESS_DELAY_MS}
          disabled={contextClone}
          onLongPress={handleLongPress}
          onPressIn={measureBubble}
          onPress={() => {
            if (contextClone) return;
            if (selectionMode) {
              handleSelectionPress();
              return;
            }
            onPress?.(message);
          }}
          style={[styles.bubblePressable, contextClone && styles.bubblePressableContextClone]}
        >
          <View
            ref={bubbleRef}
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              if (width > 0 && height > 0) {
                bubbleSizeRef.current = { height, width };
              }
            }}
            style={[
              styles.bubble,
              outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
              emojiOnly && styles.bubbleEmojiOnly,
              hasOrderCards && styles.bubbleOrderCard,
              imageUri && !text && styles.bubbleAttachmentOnly,
              contextClone && styles.bubbleContextClone,
            ]}
          >
            {author ? (
              <Text numberOfLines={1} style={[styles.author, imageUri && !text && styles.authorAttachmentOnly]}>
                {author}
              </Text>
            ) : null}

            {message.replyTo ? (
              <View style={[styles.reply, outgoing && styles.replyOutgoing]}>
                <Text numberOfLines={1} style={[styles.replyName, outgoing && styles.replyNameOutgoing]}>
                  {message.replyTo.sender || 'Ответ'}
                </Text>
                <Text numberOfLines={1} style={[styles.replyText, outgoing && styles.replyTextOutgoing]}>
                  {message.replyTo.text}
                </Text>
              </View>
            ) : null}

            {imageUri ? (
              <Pressable
                delayLongPress={CHAT_LONG_PRESS_DELAY_MS}
                disabled={contextClone}
                onLongPress={handleAttachmentLongPress}
                onPress={handleAttachmentPress}
                onPressIn={measureBubble}
                style={styles.attachment}
              >
                <Image source={{ uri: imageUri }} style={styles.image} />
              </Pressable>
            ) : null}

            {text ? (
              <Text
                style={[
                  styles.text,
                  outgoing && styles.textOutgoing,
                  message.editedAt && styles.textEdited,
                  outgoing && message.editedAt && styles.textOutgoingEdited,
                  hasOrderCards && styles.textWithCards,
                  emojiOnly && [styles.emojiText, { fontSize: getEmojiOnlySize(text), lineHeight: getEmojiOnlySize(text) + 4 }],
                ]}
              >
                {text}
              </Text>
            ) : null}
            {emojiOnly ? <View style={styles.emojiMetaSpacer} /> : null}

            {hasOrderCards ? (
              <ChatOrderCards cards={orderCards} onOpen={onOpenOrder} />
            ) : null}

            {emojiOnly ? (
              <View style={[styles.emojiMeta, outgoing ? styles.emojiMetaOutgoing : styles.emojiMetaIncoming]}>
                <Text style={styles.emojiMetaTime}>{metaLabel}</Text>
                {outgoing ? <StatusIcon light status={message.deliveryStatus || (message.read ? 'read' : 'sent')} /> : null}
              </View>
            ) : (
              <View style={hasOrderCards ? styles.metaInline : styles.meta}>
                <Text style={[styles.time, outgoing && styles.timeOutgoing]}>{metaLabel}</Text>
                {outgoing ? <StatusIcon status={message.deliveryStatus || (message.read ? 'read' : 'sent')} /> : null}
              </View>
            )}

            {renderedReactionItems.length ? (
              <View style={[styles.reactions, outgoing ? styles.reactionsOutgoing : styles.reactionsIncoming]}>
                {renderedReactionItems.map((item, index) => {
                  const canReact = !!onReact && item.actor === actor && item.phase !== 'leave';
                  const stackedStyle = index > 0 && (outgoing ? styles.reactionPillOutgoingStack : styles.reactionPillIncomingStack);

                  return (
                    <AnimatedReactionPill
                      canReact={canReact}
                      key={item.renderKey}
                      onReact={(event) => {
                        event.stopPropagation();
                        setLocalReaction((current) => {
                          const activeReaction = current ?? String(message.reactions?.[actor] || '');
                          return activeReaction === item.reaction ? '' : item.reaction;
                        });
                        onReact?.(message, item.reaction);
                      }}
                      phase={item.phase}
                      reaction={item.reaction}
                      style={stackedStyle}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleComponent, areChatMessageBubblePropsEqual);

function areChatMessageBubblePropsEqual(prev: ChatMessageBubbleProps, next: ChatMessageBubbleProps) {
  return prev.actor === next.actor
    && prev.contextClone === next.contextClone
    && prev.contextHidden === next.contextHidden
    && prev.message === next.message
    && prev.onDoublePress === next.onDoublePress
    && prev.onLongPress === next.onLongPress
    && prev.onOpenImage === next.onOpenImage
    && prev.onOpenOrder === next.onOpenOrder
    && prev.onPress === next.onPress
    && prev.onReact === next.onReact
    && prev.onSwipeReply === next.onSwipeReply
    && prev.selected === next.selected
    && prev.selectionMode === next.selectionMode
    && prev.settings === next.settings;
}

function getReactionItemKey(actor: ChatActor, reaction: string) {
  return `${actor}:${String(reaction || '').normalize('NFC')}`;
}

function SelectionBadge({
  onPress,
  selected,
}: {
  onPress: (event: GestureResponderEvent) => void;
  selected: boolean;
}) {
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      duration: CHAT_SELECTION_ANIMATION_MS,
      easing: selected ? Easing.out(Easing.cubic) : Easing.linear,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [progress, selected]);

  const activeStyle = {
    opacity: progress,
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [0.56, 1.12, 1],
        }),
      },
    ],
  };
  const checkStyle = {
    opacity: progress,
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4, 1],
        }),
      },
    ],
  };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      hitSlop={10}
      onPress={onPress}
      style={styles.selectBadge}
    >
      <Animated.View style={[styles.selectBadgeActiveLayer, activeStyle]} />
      <Animated.View style={[styles.selectBadgeCheck, checkStyle]}>
        <Ionicons color="#fff" name="checkmark" size={14} />
      </Animated.View>
    </Pressable>
  );
}

function AnimatedReactionPill({
  canReact,
  onReact,
  phase,
  reaction,
  style,
}: {
  canReact: boolean;
  onReact: (event: GestureResponderEvent) => void;
  phase: RenderedReactionItem['phase'];
  reaction: string;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(phase === 'pop' ? 0 : 1)).current;

  useEffect(() => {
    if (phase === 'pop') {
      progress.setValue(0);
      Animated.timing(progress, {
        duration: CHAT_REACTION_POP_MS,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (phase === 'leave') {
      progress.setValue(1);
      Animated.timing(progress, {
        duration: CHAT_REACTION_LEAVE_MS,
        easing: Easing.bezier(0.42, 0, 0.2, 1),
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  }, [phase, progress]);

  const animatedStyle = phase === 'leave' ? {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-3, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1],
        }),
      },
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['10deg', '0deg'],
        }),
      },
    ],
  } : {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [5, -1, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [0.84, 1.08, 1],
        }),
      },
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['-3deg', '0deg'],
        }),
      },
    ],
  };

  return (
    <Animated.View pointerEvents={phase === 'leave' ? 'none' : 'auto'} style={[styles.reactionPill, style, animatedStyle]}>
      {canReact ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPressIn={onReact} style={styles.reactionPressable}>
          <NativeText style={styles.reactionText}>{reaction}</NativeText>
        </Pressable>
      ) : (
        <NativeText style={styles.reactionText}>{reaction}</NativeText>
      )}
    </Animated.View>
  );
}

function StatusIcon({ light, status }: { light?: boolean; status?: string }) {
  const read = status === 'read';
  const delivered = read || status === 'delivered';
  return (
    <View style={styles.statusIcon}>
      <Ionicons
        color={light ? 'rgba(255,255,255,0.82)' : read ? '#38bdf8' : '#94a3b8'}
        name={delivered ? 'checkmark-done' : 'checkmark'}
        size={15}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  attachment: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  author: {
    color: '#8f8f95',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 3,
  },
  authorAttachmentOnly: {
    marginBottom: 6,
  },
  bubble: {
    borderRadius: 18,
    maxWidth: '86%',
    minHeight: 38,
    paddingBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    position: 'relative',
  },
  bubbleAttachmentOnly: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  bubbleContextClone: {
    elevation: 8,
    maxWidth: '100%',
    shadowColor: '#0f172a',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 42,
    width: '100%',
  },
  bubbleEmojiOnly: {
    backgroundColor: 'transparent',
    minHeight: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  bubbleIncoming: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 0,
  },
  bubbleOutgoing: {
    backgroundColor: '#5f6167',
    borderBottomRightRadius: 0,
  },
  bubbleOrderCard: {
    maxWidth: '92%',
    paddingBottom: 8,
  },
  bubblePressable: {
    alignSelf: 'flex-start',
  },
  bubblePressableContextClone: {
    alignSelf: 'stretch',
    width: '100%',
  },
  bubbleWrap: {
    position: 'relative',
  },
  bubbleWrapContextClone: {
    width: '100%',
  },
  emojiText: {
    paddingRight: 0,
    textAlign: 'center',
  },
  emojiMetaSpacer: {
    height: 8,
  },
  emojiMeta: {
    alignItems: 'center',
    backgroundColor: 'rgba(112,150,95,0.9)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 2,
    minHeight: 30,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  emojiMetaIncoming: {
    alignSelf: 'flex-start',
  },
  emojiMetaOutgoing: {
    alignSelf: 'flex-end',
  },
  emojiMetaTime: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
  },
  image: {
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    height: 214,
    width: 214,
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
  reactionPill: {
    alignItems: 'center',
    elevation: 8,
    justifyContent: 'center',
    minHeight: 26,
    minWidth: 26,
    position: 'relative',
    zIndex: 20,
  },
  reactionPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
    minWidth: 26,
  },
  reactionPillIncomingStack: {
    marginLeft: -9,
  },
  reactionPillOutgoingStack: {
    marginRight: -9,
  },
  reactions: {
    alignItems: 'center',
    bottom: 6,
    elevation: 8,
    flexDirection: 'row',
    gap: 0,
    position: 'absolute',
    zIndex: 20,
  },
  reactionsIncoming: {
    right: -32,
  },
  reactionsOutgoing: {
    flexDirection: 'row-reverse',
    left: -32,
  },
  reactionText: {
    color: '#111827',
    fontSize: 23,
    includeFontPadding: false,
    lineHeight: 27,
    opacity: 1,
    textShadowColor: 'rgba(0,0,0,0.16)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 0.5,
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
  replyNameOutgoing: {
    color: '#ffffff',
  },
  replyOutgoing: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderLeftColor: 'rgba(255,255,255,0.82)',
  },
  replyText: {
    color: '#111827',
    fontSize: 13,
  },
  replyTextOutgoing: {
    color: 'rgba(255,255,255,0.92)',
  },
  row: {
    marginVertical: 4,
    position: 'relative',
  },
  rowContextClone: {
    alignItems: 'stretch',
    marginVertical: 0,
    width: '100%',
  },
  rowContextHidden: {
    opacity: 0,
  },
  rowIncoming: {
    alignItems: 'flex-start',
  },
  rowOutgoing: {
    alignItems: 'flex-end',
  },
  rowSelectionMode: {
    paddingLeft: 30,
  },
  selectBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 8,
    height: 22,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    width: 22,
    zIndex: 3,
  },
  selectBadgeActiveLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#22c55e',
    borderRadius: 999,
  },
  selectBadgeCheck: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  statusIcon: {
    height: 16,
    justifyContent: 'center',
    width: 18,
  },
  text: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 22,
    paddingRight: 46,
  },
  textEdited: {
    paddingRight: 78,
  },
  textOutgoing: {
    color: '#ffffff',
    paddingRight: 52,
  },
  textOutgoingEdited: {
    paddingRight: 120,
  },
  textWithCards: {
    paddingRight: 0,
  },
  time: {
    color: '#a5a5ab',
    fontSize: 12,
  },
  timeOutgoing: {
    color: 'rgba(255,255,255,0.75)',
  },
});
