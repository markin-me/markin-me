import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOutgoing, type ChatActor, type ChatMessage, type ChatSettings } from '../../../features/chat';
import { AppText as Text } from '../../../shared/ui';
import { ChatMessageBubble, type ChatMessageBubbleLayout } from './ChatMessageBubble';
import { ChatQuickReactions } from './ChatQuickReactions';

type ChatActionSheetProps = {
  actor: ChatActor;
  canEdit: boolean;
  canDeleteForPeer: boolean;
  confirmOnly?: boolean;
  confirmText?: string;
  confirmTitle?: string;
  confirmPeerLabel?: string;
  message: ChatMessage | null;
  onClose: () => void;
  onCopy: () => void;
  onDelete: (options?: { deleteForPeer?: boolean }) => void;
  onEdit: () => void;
  onReact: (reaction: string) => void;
  onReply: () => void;
  onSelect: () => void;
  reactionsExpanded: boolean;
  setReactionsExpanded: (value: boolean) => void;
  settings?: ChatSettings | null;
  targetLayout?: ChatMessageBubbleLayout | null;
  visible: boolean;
};

const CONTEXT_SIDE_PADDING = 16;
const CONTEXT_TOP_GAP = 20;
const CONTEXT_BOTTOM_GAP = 20;
const CONTEXT_MENU_GAP = 12;
const CONTEXT_MENU_WIDTH = 246;
const CONTEXT_BACKDROP_MS = 260;
const CONTEXT_CLONE_MS = 340;
const CONTEXT_MENU_DELAY_MS = 0;
const CONTEXT_MENU_MS = 240;
const CONTEXT_REACTIONS_EXPANDED_EXTRA_HEIGHT = 28;
const CONTEXT_MENU_HEIGHT = {
  canEdit: 307,
  default: 261,
};

export function ChatActionSheet({
  actor,
  canEdit,
  canDeleteForPeer,
  confirmOnly,
  confirmText,
  confirmTitle,
  confirmPeerLabel,
  message,
  onClose,
  onCopy,
  onDelete: confirmDelete,
  onEdit,
  onReact,
  onReply,
  onSelect,
  reactionsExpanded,
  setReactionsExpanded,
  settings,
  targetLayout,
  visible,
}: ChatActionSheetProps) {
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const backdropProgress = useRef(new Animated.Value(0)).current;
  const cloneProgress = useRef(new Animated.Value(0)).current;
  const menuProgress = useRef(new Animated.Value(0)).current;
  const confirmProgress = useRef(new Animated.Value(0)).current;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteForPeer, setDeleteForPeer] = useState(false);
  const [backdropBlurReady, setBackdropBlurReady] = useState(false);

  const onDelete = () => {
    setDeleteForPeer(canDeleteForPeer);
    setConfirmDeleteOpen(true);
  };

  useEffect(() => {
    if (!visible) {
      backdropProgress.setValue(0);
      cloneProgress.setValue(0);
      menuProgress.setValue(0);
      confirmProgress.setValue(0);
      setConfirmDeleteOpen(false);
      setDeleteForPeer(false);
      setBackdropBlurReady(false);
      return;
    }

    setConfirmDeleteOpen(!!confirmOnly);
    setDeleteForPeer(!!confirmOnly && canDeleteForPeer);
    setBackdropBlurReady(false);
    const blurTimer = setTimeout(() => setBackdropBlurReady(true), 80);
    backdropProgress.setValue(0);
    cloneProgress.setValue(0);
    menuProgress.setValue(0);
    confirmProgress.setValue(0);
    Animated.parallel([
      Animated.timing(backdropProgress, {
        duration: CONTEXT_BACKDROP_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(cloneProgress, {
        duration: CONTEXT_CLONE_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(CONTEXT_MENU_DELAY_MS),
        Animated.timing(menuProgress, {
          duration: CONTEXT_MENU_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    return () => clearTimeout(blurTimer);
  }, [backdropProgress, canDeleteForPeer, cloneProgress, confirmOnly, confirmProgress, menuProgress, message?.id, visible]);

  useEffect(() => {
    if (!confirmDeleteOpen) {
      confirmProgress.setValue(0);
      return;
    }
    confirmProgress.setValue(0);
    Animated.timing(confirmProgress, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [confirmDeleteOpen, confirmProgress]);

  const layout = useMemo(() => {
    const viewportWidth = Math.max(1, windowSize.width);
    const viewportHeight = Math.max(1, windowSize.height);
    const sidePadding = CONTEXT_SIDE_PADDING;
    const topPadding = Math.max(CONTEXT_TOP_GAP, insets.top + 12);
    const bottomPadding = Math.max(CONTEXT_BOTTOM_GAP, insets.bottom + 20);
    const menuWidth = Math.min(CONTEXT_MENU_WIDTH, Math.max(1, viewportWidth - sidePadding * 2));
    const resolvedMenuHeight =
      (canEdit ? CONTEXT_MENU_HEIGHT.canEdit : CONTEXT_MENU_HEIGHT.default)
      + (reactionsExpanded ? CONTEXT_REACTIONS_EXPANDED_EXTRA_HEIGHT : 0);

    if (!targetLayout) {
      return {
        bubbleHeight: 0,
        bubbleLeft: sidePadding,
        bubbleTop: topPadding,
        bubbleWidth: Math.min(300, Math.max(1, viewportWidth - sidePadding * 2)),
        menuLeft: Math.round((viewportWidth - menuWidth) / 2),
        menuTop: topPadding + 72,
        menuWidth,
        originTranslateX: 0,
        originTranslateY: 0,
      };
    }

    const bubbleWidth = Math.min(Math.max(1, targetLayout.width), Math.max(1, viewportWidth - sidePadding * 2));
    const bubbleHeight = Math.max(1, targetLayout.height);
    const bubbleLeft = Math.round(targetLayout.x);
    const minBubbleTop = topPadding;
    const maxBubbleTop = Math.max(minBubbleTop, viewportHeight - bottomPadding - bubbleHeight);
    const maxBubbleTopForMenu = Math.max(
      minBubbleTop,
      viewportHeight - bottomPadding - resolvedMenuHeight - CONTEXT_MENU_GAP - bubbleHeight,
    );
    const targetBubbleTop = Math.round(targetLayout.y);
    const menuFitsBelow = targetBubbleTop + bubbleHeight + CONTEXT_MENU_GAP + resolvedMenuHeight <= viewportHeight - bottomPadding;
    const bubbleTop = menuFitsBelow
      ? clamp(targetBubbleTop, minBubbleTop, maxBubbleTop)
      : clamp(
        targetBubbleTop,
        minBubbleTop,
        Math.min(maxBubbleTop, maxBubbleTopForMenu),
      );
    const outgoing = message ? isOutgoing(message, actor) : false;
    const desiredMenuLeft = outgoing ? bubbleLeft + bubbleWidth - menuWidth : bubbleLeft;
    const menuLeft = clamp(Math.round(desiredMenuLeft), sidePadding, Math.max(sidePadding, viewportWidth - menuWidth - sidePadding));
    const menuTop = clamp(
      Math.round(bubbleTop + bubbleHeight + CONTEXT_MENU_GAP),
      topPadding,
      Math.max(topPadding, viewportHeight - bottomPadding - resolvedMenuHeight),
    );

    return {
      bubbleHeight,
      bubbleLeft,
      bubbleTop,
      bubbleWidth,
      menuLeft,
      menuTop,
      menuWidth,
      originTranslateX: 0,
      originTranslateY: Math.round(targetLayout.y - bubbleTop),
    };
  }, [actor, canEdit, insets.bottom, insets.top, message, reactionsExpanded, targetLayout, windowSize.height, windowSize.width]);

  const backdropOpacity = backdropProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const cloneTranslateX = cloneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [layout.originTranslateX, 0],
  });
  const cloneTranslateY = cloneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [layout.originTranslateY, 0],
  });
  const confirmCardTranslateY = confirmProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const menuTranslateY = menuProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const menuScale = menuProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const confirmCardScale = confirmProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  });

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.host}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: confirmDeleteOpen ? 0 : backdropOpacity }]}>
          {backdropBlurReady ? (
            <BlurView
              blurReductionFactor={2}
              experimentalBlurMethod="dimezisBlurView"
              intensity={34}
              style={styles.backdropBlur}
              tint="dark"
            />
          ) : null}
          <View style={styles.backdropDim} />
        </Animated.View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdropPressable} />

        {message && targetLayout && !confirmDeleteOpen ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cloneHost,
              {
                left: layout.bubbleLeft,
                top: layout.bubbleTop,
                transform: [{ translateX: cloneTranslateX }, { translateY: cloneTranslateY }],
                width: layout.bubbleWidth,
              },
            ]}
          >
            <ChatMessageBubble
              actor={actor}
              contextClone
              message={message}
              onLongPress={() => undefined}
              onOpenImage={() => undefined}
              onOpenOrder={() => undefined}
              settings={settings}
            />
          </Animated.View>
        ) : null}

        {!confirmDeleteOpen ? (
        <Animated.View
          style={[
            styles.menu,
            {
              left: layout.menuLeft,
              top: layout.menuTop,
              transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
              width: layout.menuWidth,
            },
          ]}
        >
          <View style={styles.reactions}>
            <ChatQuickReactions
              expanded={reactionsExpanded}
              onReact={onReact}
              onToggleExpanded={() => setReactionsExpanded(!reactionsExpanded)}
            />
          </View>
          <Action icon="return-up-back" label="Ответить" onPress={onReply} />
          <Action icon="copy-outline" label="Скопировать" onPress={onCopy} />
          {canEdit ? <Action icon="create-outline" label="Изменить" onPress={onEdit} /> : null}
          <Action danger icon="trash-outline" label="Удалить" onPress={onDelete} />
          <View style={styles.divider} />
          <Action icon="checkmark-circle-outline" label="Выбрать" onPress={onSelect} />
        </Animated.View>
        ) : null}

        {confirmDeleteOpen ? (
          <Animated.View pointerEvents="auto" style={[styles.deleteConfirmOverlay, { opacity: confirmProgress }]}>
            <BlurView
              blurReductionFactor={3}
              experimentalBlurMethod="dimezisBlurView"
              intensity={12}
              style={styles.deleteConfirmBlur}
              tint="dark"
            />
            <View style={styles.deleteConfirmDim} />
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.deleteConfirmPressable} />
            <Animated.View
              style={[
                styles.deleteConfirmCard,
                {
                  transform: [
                    { translateY: confirmCardTranslateY },
                    { scale: confirmCardScale },
                  ],
                },
              ]}
            >
              <Text style={styles.confirmTitle}>{confirmTitle || '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435'}</Text>
              <Text style={styles.confirmText}>{confirmText || '\u0412\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435?'}</Text>
              {canDeleteForPeer ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: deleteForPeer }}
                  onPress={() => setDeleteForPeer((current) => !current)}
                  style={styles.confirmCheck}
                >
                  <View style={[styles.confirmCheckbox, deleteForPeer && styles.confirmCheckboxActive]}>
                    {deleteForPeer ? <Ionicons color="#fff" name="checkmark" size={14} /> : null}
                  </View>
                  <Text style={styles.confirmCheckText}>{confirmPeerLabel || '\u0422\u0430\u043a\u0436\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0443 \u0441\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a\u0430'}</Text>
                </Pressable>
              ) : null}
              <View style={styles.confirmActions}>
                <Pressable accessibilityRole="button" onPress={onClose} style={[styles.confirmButton, styles.confirmCancel]}>
                  <Text style={styles.confirmCancelText}>{'\u041e\u0422\u041c\u0415\u041d\u0410'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => confirmDelete({ deleteForPeer: canDeleteForPeer && deleteForPeer })}
                  style={[styles.confirmButton, styles.confirmDanger]}
                >
                  <Text style={styles.confirmDangerText}>{'\u0423\u0414\u0410\u041b\u0418\u0422\u042c'}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function Action({ danger, icon, label, onPress }: { danger?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Ionicons color={danger ? '#dc2626' : '#111827'} name={icon} size={22} />
      <Text style={[styles.actionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  actionText: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 19,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  cloneHost: {
    position: 'absolute',
    zIndex: 2,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderColor: 'rgba(229,231,235,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmCancel: {
    backgroundColor: '#f3f4f6',
  },
  confirmCancelText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.26,
    lineHeight: 13,
  },
  confirmCheck: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  confirmCheckbox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#fed7aa',
    borderRadius: 6,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  confirmCheckboxActive: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  confirmCheckText: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 19,
  },
  confirmDanger: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  confirmDangerText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.26,
    lineHeight: 13,
  },
  confirmText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
    marginTop: 10,
  },
  confirmTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 20,
  },
  deleteConfirmBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  deleteConfirmCard: {
    backgroundColor: '#fff',
    borderColor: 'rgba(229,231,235,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 16,
    maxWidth: 360,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 16,
    shadowColor: '#0f172a',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 42,
    width: '100%',
    zIndex: 2,
  },
  deleteConfirmDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.36)',
  },
  deleteConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    zIndex: 20,
  },
  deleteConfirmPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  danger: {
    color: '#dc2626',
  },
  divider: {
    backgroundColor: 'rgba(229,231,235,0.88)',
    height: 1,
    marginHorizontal: 4,
    marginVertical: 8,
  },
  host: {
    flex: 1,
  },
  menu: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: 'rgba(229,231,235,0.92)',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 12,
    gap: 2,
    paddingBottom: 12,
    paddingHorizontal: 10,
    paddingTop: 10,
    position: 'absolute',
    shadowColor: '#0f172a',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 34,
    zIndex: 3,
  },
  reactions: {
    alignItems: 'center',
    marginBottom: 8,
  },
});
