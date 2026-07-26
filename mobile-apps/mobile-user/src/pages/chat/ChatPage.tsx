import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ImageBackground,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  type KeyboardEvent,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { routes, type ChatTabParamList, type RootStackParamList } from '../../app/navigation/routes';
import {
  formatChatDay,
  formatChatTime,
  getAssistantName,
  getMessagePreview,
  getOperatorName,
  getWelcomeMessage,
  isOutgoing,
  isWhereIsOrderQuestion,
  normalizeChatText,
  nowIso,
  shouldShowDay,
  useChatThread,
  useChatUnread,
  type ChatMessage,
  type ChatOrderCard,
} from '../../features/chat';
import { resolveAssetUrl } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';
import { AppHeader } from '../../widgets/app-header';
import { ChatActionSheet } from './components/ChatActionSheet';
import { ChatAttachmentPreview, type ChatPickedImage } from './components/ChatAttachmentPreview';
import { ChatComposer } from './components/ChatComposer';
import { ChatImageViewer } from './components/ChatImageViewer';
import { ChatMessageBubble, type ChatMessageBubbleLayout } from './components/ChatMessageBubble';
import { ChatQuickQuestions } from './components/ChatQuickQuestions';
import { ChatSelectionToolbar } from './components/ChatSelectionToolbar';
import { ChatTypingIndicator } from './components/ChatTypingIndicator';

const CHAT_HEADER_TITLE = 'Добро пожаловать в чат!';
const CHAT_OPTIONS_PROMPT = 'Чтобы я смог вам помочь, выберите категорию ниже:';

const CHAT_KEYBOARD_GAP = 4;
const CHAT_THREAD_FOOTER_FADE_FALLBACK = 72;
const CHAT_THREAD_FOOTER_FADE_EXTRA = 20;
const CHAT_THREAD_BOTTOM_ZERO_HEIGHT = 12;
const CHAT_THREAD_EDGE_BLUR_OVERSCAN = Platform.OS === 'android' ? 24 : 16;
const CHAT_THREAD_EDGE_BLUR_INTENSITY = Platform.OS === 'android' ? 12 : 10;
const CHAT_THREAD_EDGE_BLUR_REDUCTION = Platform.OS === 'android' ? 2 : 3;
const CHAT_FOOTER_BOTTOM_LIFT = 10;
const CHAT_ANDROID_FOOTER_SAFE_AREA_MAX = 32;
const CHAT_ANDROID_KEYBOARD_FOOTER_SAFE_AREA_MAX = 0;
const CHAT_ANDROID_KEYBOARD_STICKY_OFFSET = CHAT_FOOTER_BOTTOM_LIFT;
const CHAT_THREAD_TOP_BASE_INSET = 14;

type ChatPageProps = {
  active?: boolean;
  onBack?: () => void;
};

type ChatPageNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function isHiddenChatRouteActive(navigation: ChatPageNavigationProp) {
  const state = navigation.getState();
  const routeName = state.routes[state.index]?.name;
  return routeName === routes.supportChat
    || routeName === routes.importantMessages
    || routeName === routes.importantMessageDetails;
}

export function ChatPage({ active = true, onBack }: ChatPageProps = {}) {
  const navigation = useNavigation<ChatPageNavigationProp>();
  const insets = useSafeAreaInsets();
  const { refreshUnread } = useChatUnread();
  const chatStageRef = useRef<View | null>(null);
  const chatStageFrameRef = useRef<{ height: number; y: number } | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;
  const keyboardVisibleRef = useRef(false);
  const scrollDownProgress = useRef(new Animated.Value(0)).current;
  const lastAutoScrollMessageIdRef = useRef('');
  const lastTapRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const nearBottomRef = useRef(true);
  const restoreBottomAfterKeyboardRef = useRef(false);
  const contextHideFrameRef = useRef<number | null>(null);
  const chat = useChatThread({ actor: 'in' });
  const chatRef = useRef(chat);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [actionMessageLayout, setActionMessageLayout] = useState<ChatMessageBubbleLayout | null>(null);
  const [contextHiddenMessageId, setContextHiddenMessageId] = useState('');
  const [selectionDeleteConfirmOpen, setSelectionDeleteConfirmOpen] = useState(false);
  const [reactionsExpanded, setReactionsExpanded] = useState(false);
  const [imageViewerUri, setImageViewerUri] = useState('');
  const [pickedImages, setPickedImages] = useState<ChatPickedImage[]>([]);
  const [caption, setCaption] = useState('');
  const [bodyHeight, setBodyHeight] = useState(0);
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const [footerBaseHeight, setFooterBaseHeight] = useState(0);
  const [footerOverlayHeight, setFooterOverlayHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [wallpaperSize, setWallpaperSize] = useState<{ height: number; width: number } | null>(null);
  const [chatStageHeight, setChatStageHeight] = useState(0);
  const [selectionActive, setSelectionActive] = useState(false);
  const [threadRenderReady, setThreadRenderReady] = useState(false);

  const baseTabBarStyle = useMemo(() => {
    const bottomInset = Math.max(0, insets.bottom);
    return {
      borderTopColor: theme.colors.border,
      height: theme.sizes.tabBarHeight + bottomInset,
      paddingBottom: 8 + bottomInset,
      paddingTop: 2,
    };
  }, [insets.bottom]);
  const hideTabBarStyle = useMemo(() => ({ display: 'none' as const }), []);
  const selectionMode = selectionActive || chat.selectedIds.length > 0;
  const footerBottomInset = CHAT_FOOTER_BOTTOM_LIFT;
  const androidReportedBottomInset = Math.max(0, insets.bottom);
  const footerSafeAreaInset = Platform.OS === 'android'
    ? Math.min(
      androidReportedBottomInset,
      keyboardVisible ? CHAT_ANDROID_KEYBOARD_FOOTER_SAFE_AREA_MAX : CHAT_ANDROID_FOOTER_SAFE_AREA_MAX,
    )
    : 0;
  const footerBlurBottomOffset = 0;
  const operatorName = getOperatorName(chat.settings);
  const assistantName = getAssistantName(chat.settings);
  const typingLabel = useMemo(
    () => buildChatTypingLabel(chat.typing?.text, operatorName, assistantName),
    [assistantName, chat.typing?.text, operatorName],
  );
  const wallpaperUri = useMemo(
    () => resolveAssetUrl('/static/assets/chat-wallpaper-mobile.webp?v=20260320d'),
    [],
  );
  const selectedMessages = useMemo(
    () => chat.messages.filter((message) => chat.selectedIds.includes(message.id)),
    [chat.messages, chat.selectedIds],
  );
  const selectedIdSet = useMemo(() => new Set(chat.selectedIds), [chat.selectedIds]);
  const selectedCanDeleteForPeer = useMemo(
    () => selectedMessages.some((message) => isOutgoing(message, chat.actor)),
    [chat.actor, selectedMessages],
  );
  const selectedDeleteConfirmTitle = selectedMessages.length === 1 ? 'Удалить сообщение' : 'Удалить сообщения';
  const selectedDeleteConfirmText = selectedMessages.length === 1
    ? 'Вы точно хотите удалить выбранное сообщение?'
    : `Вы точно хотите удалить выбранные сообщения (${selectedMessages.length})?`;
  const welcomeMessageText = useMemo(() => normalizeChatText(getWelcomeMessage(chat.settings)).trim(), [chat.settings]);
  const quickQuestionsAnchorIndex = useMemo(() => {
    if (!chat.quickQuestions.length) return -1;
    const welcomeIndex = chat.messages.findIndex((message) =>
      message.direction !== chat.actor && normalizeChatText(message.text).trim() === welcomeMessageText
    );
    return welcomeIndex >= 0 ? welcomeIndex : -2;
  }, [chat.actor, chat.messages, chat.quickQuestions.length, welcomeMessageText]);
  const quickQuestionsFallbackTimeLabel = useMemo(() => {
    const anchorMessage = chat.messages[0];
    return formatChatTime(anchorMessage?.createdAt || nowIso());
  }, [chat.messages]);
  const lastMessage = chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
  const keyboardLayerStyle = useMemo(
    () => ({ transform: [{ translateY: keyboardTranslateY }] }),
    [keyboardTranslateY],
  );
  const chatStageStyle = useMemo(
    () => (active && Platform.OS === 'android' && chatStageHeight > 0 ? { flex: 0, height: chatStageHeight } : null),
    [active, chatStageHeight],
  );
  const threadFooterHeight = useMemo(
    () => Math.max(
      CHAT_THREAD_FOOTER_FADE_FALLBACK,
      footerBaseHeight + footerSafeAreaInset,
      footerOverlayHeight,
    ),
    [footerBaseHeight, footerOverlayHeight, footerSafeAreaInset],
  );
  const threadTopInset = Platform.OS === 'android' && keyboardVisible
    ? CHAT_THREAD_TOP_BASE_INSET
      + CHAT_THREAD_FOOTER_FADE_FALLBACK
      + Math.max(0, androidKeyboardHeight - CHAT_ANDROID_KEYBOARD_STICKY_OFFSET)
    : CHAT_THREAD_TOP_BASE_INSET;
  const threadInsetStyle = useMemo(
    () => ({
      paddingBottom: Math.max(14, threadFooterHeight + 8 + footerBottomInset),
      paddingTop: threadTopInset,
    }),
    [footerBottomInset, threadFooterHeight, threadTopInset],
  );
  const footerMaskHeight = Platform.OS === 'android' && !keyboardVisible && footerSafeAreaInset > 0
    ? threadFooterHeight + CHAT_THREAD_FOOTER_FADE_EXTRA
    : CHAT_THREAD_FOOTER_FADE_FALLBACK;
  const scrollDownStyle = useMemo(
    () => (footerOverlayHeight > 0 ? { bottom: footerOverlayHeight + 16 + footerBottomInset } : null),
    [footerBottomInset, footerOverlayHeight],
  );
  const footerIslandStyle = useMemo(
    () => ({ bottom: footerBottomInset, paddingBottom: footerSafeAreaInset }),
    [footerBottomInset, footerSafeAreaInset],
  );
  const scrollDownAnimatedStyle = useMemo(() => ({
    opacity: scrollDownProgress,
    transform: [
      {
        translateY: scrollDownProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
      {
        scale: scrollDownProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.82, 1],
        }),
      },
    ],
  }), [scrollDownProgress]);

  const scrollToBottom = useCallback((animated = true) => {
    setHasNewMessagesBelow(false);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));
  }, []);

  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  const dismissKeyboardIfOpen = useCallback(() => {
    if (!keyboardVisibleRef.current) return false;
    Keyboard.dismiss();
    return true;
  }, []);

  const handleBack = useCallback(() => {
    if (dismissKeyboardIfOpen()) return;
    if (onBack) {
      onBack();
      return;
    }
    navigation.goBack();
  }, [dismissKeyboardIfOpen, navigation, onBack]);

  const focusComposer = useCallback(() => {
    setComposerFocusToken((token) => token + 1);
  }, []);

  useEffect(() => {
    setThreadRenderReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setThreadRenderReady(true);
    });
    return () => {
      task.cancel();
    };
  }, []);

  useFocusEffect(useCallback(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: hideTabBarStyle });
    return () => {
      requestAnimationFrame(() => {
        if (isHiddenChatRouteActive(navigation)) return;
        parent?.setOptions({ tabBarStyle: baseTabBarStyle });
      });
    };
  }, [baseTabBarStyle, hideTabBarStyle, navigation]));

  useEffect(() => {
    if (!active || Platform.OS !== 'android') return;
    setChatStageHeight(0);
    keyboardTranslateY.stopAnimation();
    keyboardTranslateY.setValue(0);
  }, [active, keyboardTranslateY]);

  const closeActionSheet = () => {
    if (contextHideFrameRef.current != null) {
      cancelAnimationFrame(contextHideFrameRef.current);
      contextHideFrameRef.current = null;
    }
    setContextHiddenMessageId('');
    setActionMessage(null);
    setActionMessageLayout(null);
    setReactionsExpanded(false);
  };

  const closeSelectionDeleteConfirm = () => {
    setSelectionDeleteConfirmOpen(false);
  };

  const closeSelectionMode = useCallback(() => {
    chat.setSelectedIds([]);
    setSelectionActive(false);
  }, [chat]);

  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height || 0);
    setFooterOverlayHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const handleBodyLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height || 0);
    setBodyHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const handleChatStageLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height || 0);
    if (active && nextHeight > 0) {
      setChatStageHeight((current) => Math.max(current, nextHeight));
    }

    requestAnimationFrame(() => {
      chatStageRef.current?.measureInWindow((_, y, __, height) => {
        chatStageFrameRef.current = { height, y };
      });
    });
  }, [active]);

  const handleRootLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height || 0);
    const width = Math.ceil(event.nativeEvent.layout.width || 0);
    if (!height || !width) return;

    setWallpaperSize((current) => {
      if (!current || current.width !== width) return { height, width };
      return height > current.height ? { height, width } : current;
    });
  }, []);

  useEffect(() => {
    const lastMessageId = lastMessage?.id || '';
    if (!lastMessageId || lastAutoScrollMessageIdRef.current === lastMessageId) return;
    lastAutoScrollMessageIdRef.current = lastMessageId;
    if (nearBottomRef.current || (lastMessage && isOutgoing(lastMessage, chat.actor)) || lastMessage?.localPending) {
      setHasNewMessagesBelow(false);
      scrollToBottom(!lastMessage?.localPending);
    } else {
      setHasNewMessagesBelow(true);
    }
  }, [chat.actor, lastMessage, scrollToBottom]);

  useEffect(() => {
    Animated.timing(scrollDownProgress, {
      duration: showScrollDown ? 280 : 240,
      easing: showScrollDown ? Easing.bezier(0.22, 0.61, 0.36, 1) : Easing.bezier(0.4, 0, 0.2, 1),
      toValue: showScrollDown ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [scrollDownProgress, showScrollDown]);

  useEffect(() => {
    if (chat.selectedIds.length > 0) setSelectionActive(true);
  }, [chat.selectedIds.length]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event: KeyboardEvent) => {
      restoreBottomAfterKeyboardRef.current = nearBottomRef.current;
      keyboardVisibleRef.current = true;
      setAndroidKeyboardHeight(Math.max(0, Math.ceil(event.endCoordinates?.height || 0)));
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      const shouldRestoreBottom = restoreBottomAfterKeyboardRef.current || nearBottomRef.current;
      restoreBottomAfterKeyboardRef.current = false;
      keyboardVisibleRef.current = false;
      setAndroidKeyboardHeight(0);
      setKeyboardVisible(false);
      if (shouldRestoreBottom) {
        requestAnimationFrame(() => scrollToBottom(false));
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToBottom]);

  const animateKeyboardFromEvent = useCallback((event: KeyboardEvent, fallbackOffset = 0) => {
    const keyboardTop = Number(event.endCoordinates?.screenY ?? 0);
    const hasKeyboardTop = Number.isFinite(keyboardTop) && keyboardTop > 0;
    const frame = chatStageFrameRef.current;
    const frameOffset = frame && hasKeyboardTop
      ? Math.max(0, frame.y + frame.height - keyboardTop + CHAT_KEYBOARD_GAP)
      : fallbackOffset;
    const nextOffset = frameOffset;
    const duration = Platform.OS === 'android'
      ? Math.max(120, event.duration ?? (nextOffset > 0 ? 190 : 150))
      : Math.max(80, event.duration ?? (nextOffset > 0 ? 240 : 180));

    if (Platform.OS === 'ios') {
      Keyboard.scheduleLayoutAnimation(event);
    }
    if (Platform.OS === 'android') {
      keyboardTranslateY.stopAnimation();
      keyboardTranslateY.setValue(-nextOffset);
      return;
    }
    Animated.timing(keyboardTranslateY, {
      duration,
      easing: getKeyboardEasing(event.easing),
      toValue: -nextOffset,
      useNativeDriver: true,
    }).start();
  }, [keyboardTranslateY]);

  useEffect(() => {
    if (Platform.OS === 'android') return;

    const showEventName = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: KeyboardEvent) => {
      const measureAndAnimate = () => {
        chatStageRef.current?.measureInWindow((_, y, __, height) => {
          chatStageFrameRef.current = { height, y };
          animateKeyboardFromEvent(event);
        });
      };

      const run = () => {
        if (Platform.OS === 'android') {
          requestAnimationFrame(measureAndAnimate);
          return;
        }

        if (chatStageFrameRef.current) {
          animateKeyboardFromEvent(event);
          return;
        }

        measureAndAnimate();
      };

      run();
    };

    const handleKeyboardHide = (event: KeyboardEvent) => {
      animateKeyboardFromEvent(event, 0);
    };

    const showSubscription = Keyboard.addListener(showEventName, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEventName, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [animateKeyboardFromEvent]);

  useEffect(() => () => {
    if (contextHideFrameRef.current != null) {
      cancelAnimationFrame(contextHideFrameRef.current);
      contextHideFrameRef.current = null;
    }
  }, []);

  const handleBubblePress = useCallback((message: ChatMessage) => {
    Keyboard.dismiss();
    if (selectionMode) {
      chatRef.current.toggleSelected(message);
      return;
    }

    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap.id === message.id && now - lastTap.at < 320) {
      void chatRef.current.reactToMessage(message, '❤️');
      lastTapRef.current = { id: '', at: 0 };
      return;
    }
    lastTapRef.current = { id: message.id, at: now };
  }, [selectionMode]);

  const handleBubbleDoublePress = useCallback((message: ChatMessage) => {
    if (selectionMode) return;
    void chatRef.current.reactToMessage(message, '\u2764\uFE0F');
  }, [selectionMode]);

  const handleLongPress = useCallback((message: ChatMessage, layout?: ChatMessageBubbleLayout) => {
    if (contextHideFrameRef.current != null) {
      cancelAnimationFrame(contextHideFrameRef.current);
      contextHideFrameRef.current = null;
    }
    setContextHiddenMessageId('');
    setActionMessage(message);
    setActionMessageLayout(layout || null);
    setReactionsExpanded(false);
    if (layout) {
      contextHideFrameRef.current = requestAnimationFrame(() => {
        contextHideFrameRef.current = requestAnimationFrame(() => {
          contextHideFrameRef.current = null;
          setContextHiddenMessageId(message.id);
        });
      });
    }
    requestAnimationFrame(() => Keyboard.dismiss());
  }, []);

  const copyMessages = async () => {
    const text = selectedMessages.map((message) => getMessagePreview(message)).filter(Boolean).join('\n');
    if (text) await Clipboard.setStringAsync(text);
    closeSelectionMode();
  };

  const copyActionMessage = async () => {
    if (actionMessage) await Clipboard.setStringAsync(getMessagePreview(actionMessage));
    closeActionSheet();
  };

  const pickImages = async () => {
    try {
      Keyboard.dismiss();
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Нет доступа к фото', 'Разрешите доступ к фото, чтобы прикрепить изображение.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        quality: 0.86,
      });
      if (result.canceled) return;

      const assets = result.assets || [];
      const images = assets.map((asset, index) => ({
        name: asset.fileName || `chat-image-${Date.now()}-${index}.jpg`,
        type: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      }));

      if (images.length) {
        setPickedImages(images);
        setCaption('');
      }
    } catch (error) {
      Alert.alert('Не удалось открыть галерею', error instanceof Error ? error.message : 'Попробуйте еще раз.');
    }
  };

  const sendPickedImages = async () => {
    const images = pickedImages.slice();
    setPickedImages([]);
    setCaption('');
    await chat.uploadAndSendImages(images, caption.trim());
    refreshUnread();
    scrollToBottom();
  };

  const handleQuickQuestion = useCallback(async (question: string) => {
    const currentChat = chatRef.current;
    if (isWhereIsOrderQuestion(question)) {
      await currentChat.answerWhereIsOrder();
    } else {
      const sent = await currentChat.sendMessage(question);
      const readMessageId = String(sent?.id || '').trim();
      const answeredByPhone = await currentChat.answerOrdersByPhone(question, { readMessageId });
      if (!answeredByPhone) await currentChat.answerQuickQuestion(question, { readMessageId });
    }
    refreshUnread();
    scrollToBottom();
  }, [refreshUnread, scrollToBottom]);

  const openOrder = useCallback((card: ChatOrderCard) => {
    const orderId = Number(card.id || card.order_id || 0);
    if (Number.isFinite(orderId) && orderId > 0) {
      navigation.navigate(routes.orderDetails, { orderId });
    }
  }, [navigation]);

  const handleReact = useCallback((target: ChatMessage, reaction: string) => {
    if (selectionMode) return;
    void chatRef.current.reactToMessage(target, reaction);
  }, [selectionMode]);

  const handleSwipeReply = useCallback((target: ChatMessage) => {
    if (selectionMode) return;
    chatRef.current.setReplyFromMessage(target);
    focusComposer();
  }, [focusComposer, selectionMode]);

  const renderedMessages = useMemo(() => chat.messages.map((message, index) => {
    const previous = index > 0 ? chat.messages[index - 1] : null;
    return (
      <View key={message.id}>
        {shouldShowDay(previous, message) ? (
          <View style={styles.daySeparator}>
            <Text style={styles.daySeparatorText}>{formatChatDay(message.createdAt)}</Text>
          </View>
        ) : null}

        <ChatMessageBubble
          actor={chat.actor}
          contextHidden={contextHiddenMessageId === message.id}
          message={message}
          onDoublePress={handleBubbleDoublePress}
          onLongPress={handleLongPress}
          onOpenImage={setImageViewerUri}
          onOpenOrder={openOrder}
          onPress={handleBubblePress}
          onReact={handleReact}
          onSwipeReply={handleSwipeReply}
          selected={selectedIdSet.has(message.id)}
          selectionMode={selectionMode}
          settings={chat.settings}
        />
        {index === quickQuestionsAnchorIndex ? (
          <ChatQuickQuestions
            onPress={handleQuickQuestion}
            prompt={CHAT_OPTIONS_PROMPT}
            questions={chat.quickQuestions}
            timeLabel={formatChatTime(message.createdAt)}
            visible={!chat.loading && !selectionMode}
          />
        ) : null}
      </View>
    );
  }), [
    chat.actor,
    chat.loading,
    chat.messages,
    chat.quickQuestions,
    chat.settings,
    contextHiddenMessageId,
    handleBubblePress,
    handleBubbleDoublePress,
    handleLongPress,
    handleQuickQuestion,
    handleReact,
    handleSwipeReply,
    openOrder,
    quickQuestionsAnchorIndex,
    selectedIdSet,
    selectionMode,
  ]);

  if (!chat.chatEnabled) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader backgroundColor="#ffffff" onBack={handleBack} showBack title={CHAT_HEADER_TITLE} />
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Чат сейчас недоступен</Text>
          <Text style={styles.stateText}>Настройки магазина временно отключили виджет чата.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
        <View onLayout={handleRootLayout} style={styles.root}>
          <ChatWallpaper size={wallpaperSize} uri={wallpaperUri} />

        <AppHeader backgroundColor="#ffffff" onBack={handleBack} showBack title={CHAT_HEADER_TITLE} />

        <View onLayout={handleChatStageLayout} ref={chatStageRef} style={[styles.chatStage, chatStageStyle]}>
          <ChatKeyboardLayer keyboardLayerStyle={keyboardLayerStyle}>
          <View onLayout={handleBodyLayout} style={styles.body}>
              <ScrollView
              contentContainerStyle={[styles.thread, threadInsetStyle]}
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
                const isNearBottom = distance <= 160;
                nearBottomRef.current = isNearBottom;
                setShowScrollDown(!isNearBottom);
                if (isNearBottom) setHasNewMessagesBelow(false);
              }}
              ref={scrollRef}
              refreshControl={<RefreshControl onRefresh={chat.refresh} refreshing={false} />}
              scrollEventThrottle={64}
            >
              {chat.hasMore ? (
                <Pressable disabled={chat.loadingMore} onPress={chat.loadMore} style={styles.loadMore}>
                  {chat.loadingMore ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.loadMoreText}>Загрузить старые сообщения</Text>}
                </Pressable>
              ) : null}

              {threadRenderReady && quickQuestionsAnchorIndex === -2 ? (
                <ChatQuickQuestions
                  onPress={handleQuickQuestion}
                  prompt={CHAT_OPTIONS_PROMPT}
                  questions={chat.quickQuestions}
                  timeLabel={quickQuestionsFallbackTimeLabel}
                  visible={!chat.loading && !selectionMode}
                />
              ) : null}

              {threadRenderReady ? renderedMessages : null}

              {chat.loading && !chat.messages.length ? (
                <View style={styles.centerState}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : null}

              <ChatTypingIndicator
                label={typingLabel}
                visible={chat.typing?.active === true}
              />
              </ScrollView>
            <ThreadEdgeBlur edge="bottom" height={footerMaskHeight} bottomOffset={footerBlurBottomOffset} />

            <Animated.View
              pointerEvents={showScrollDown ? 'auto' : 'none'}
              style={[styles.scrollDown, scrollDownStyle, scrollDownAnimatedStyle]}
            >
              <Pressable accessibilityRole="button" onPress={() => scrollToBottom()} style={styles.scrollDownPressable}>
                <Ionicons color="#6b7280" name="chevron-down" size={22} />
                {hasNewMessagesBelow ? <View style={styles.scrollDownBadge} /> : null}
              </Pressable>
            </Animated.View>
          </View>

          {chat.error ? (
            <Pressable onPress={chat.clearError} style={styles.errorBar}>
              <Text numberOfLines={2} style={styles.errorText}>{chat.error}</Text>
            </Pressable>
          ) : null}

          <Animated.View onLayout={handleFooterLayout} style={[styles.footerIsland, footerIslandStyle]}>
            {selectionMode ? (
              <ChatSelectionToolbar
                count={chat.selectedIds.length}
                onClear={closeSelectionMode}
                onCopy={copyMessages}
                onDelete={() => setSelectionDeleteConfirmOpen(true)}
              />
            ) : null}

            {!selectionMode ? (
              <ChatComposer
                editing={chat.editing}
                focusToken={composerFocusToken}
                onBaseHeight={setFooterBaseHeight}
                onCancelEdit={() => chat.setEditing(null)}
                onCancelReply={chat.clearReply}
                onChangeTyping={chat.sendTyping}
                onSaveEdit={chat.saveEdit}
                onSend={async (text) => {
                  const sent = await chat.sendMessage(text);
                  const readMessageId = String(sent?.id || '').trim();
                  const answeredByPhone = await chat.answerOrdersByPhone(text, { readMessageId });
                  if (!answeredByPhone && isWhereIsOrderQuestion(text)) {
                    await chat.answerWhereIsOrder({ readMessageId, sendQuestion: false });
                  } else if (!answeredByPhone) {
                    await chat.answerQuickQuestion(text, { readMessageId });
                  }
                  refreshUnread();
                  scrollToBottom();
                }}
                replyTo={chat.replyTo}
              />
            ) : null}
          </Animated.View>
          </ChatKeyboardLayer>
          <ThreadEdgeBlur edge="top" height={footerMaskHeight} />
        </View>
      </View>

      <ChatActionSheet
        actor={chat.actor}
        canDeleteForPeer={selectionDeleteConfirmOpen ? selectedCanDeleteForPeer : !!actionMessage && isOutgoing(actionMessage, chat.actor)}
        canEdit={!selectionDeleteConfirmOpen && !!actionMessage && isOutgoing(actionMessage, chat.actor)}
        confirmOnly={selectionDeleteConfirmOpen}
        confirmText={selectionDeleteConfirmOpen ? selectedDeleteConfirmText : undefined}
        confirmTitle={selectionDeleteConfirmOpen ? selectedDeleteConfirmTitle : undefined}
        message={selectionDeleteConfirmOpen ? null : actionMessage}
        onClose={selectionDeleteConfirmOpen ? closeSelectionDeleteConfirm : closeActionSheet}
        onCopy={copyActionMessage}
        onDelete={({ deleteForPeer } = {}) => {
          if (selectionDeleteConfirmOpen) {
            void chat.deleteSelected({ deleteForPeer });
            setSelectionActive(false);
            closeSelectionDeleteConfirm();
            return;
          }
          if (actionMessage) void chat.removeMessage(actionMessage, { deleteForPeer });
          closeActionSheet();
        }}
        onEdit={() => {
          if (actionMessage) chat.setEditing(actionMessage);
          closeActionSheet();
        }}
        onReact={(reaction) => {
          if (actionMessage) void chat.reactToMessage(actionMessage, reaction);
          closeActionSheet();
        }}
        onReply={() => {
          if (actionMessage) chat.setReplyFromMessage(actionMessage);
          closeActionSheet();
        }}
        onSelect={() => {
          if (actionMessage) {
            setSelectionActive(true);
            chat.toggleSelected(actionMessage);
          }
          closeActionSheet();
        }}
        reactionsExpanded={reactionsExpanded}
        setReactionsExpanded={setReactionsExpanded}
        settings={chat.settings}
        targetLayout={selectionDeleteConfirmOpen ? null : actionMessageLayout}
        visible={selectionDeleteConfirmOpen || !!actionMessage}
      />

      <ChatAttachmentPreview
        caption={caption}
        images={pickedImages}
        onCancel={() => {
          setPickedImages([]);
          setCaption('');
        }}
        onChangeCaption={setCaption}
        onSend={sendPickedImages}
        visible={pickedImages.length > 0}
      />

      <ChatImageViewer onClose={() => setImageViewerUri('')} uri={imageViewerUri} />
    </Screen>
  );
}

function ChatKeyboardLayer({
  children,
  keyboardLayerStyle,
}: {
  children: ReactNode;
  keyboardLayerStyle: object | null;
}) {
  if (Platform.OS === 'android') {
    return (
      <KeyboardStickyView
        offset={{ closed: 0, opened: CHAT_ANDROID_KEYBOARD_STICKY_OFFSET }}
        style={styles.keyboardLayer}
      >
        {children}
      </KeyboardStickyView>
    );
  }

  return (
    <Animated.View style={[styles.keyboardLayer, keyboardLayerStyle]}>
      {children}
    </Animated.View>
  );
}

const ChatWallpaper = memo(function ChatWallpaper({
  size,
  uri,
}: {
  size: { height: number; width: number } | null;
  uri: string;
}) {
  return (
    <ImageBackground
      imageStyle={styles.wallpaperImage}
      source={{ uri }}
      style={[styles.wallpaper, size || styles.wallpaperFill]}
    >
      <View pointerEvents="none" style={styles.wallpaperTint} />
    </ImageBackground>
  );
});

function ThreadEdgeBlur({
  bottomOffset = 0,
  edge,
  height,
}: {
  bottomOffset?: number;
  edge: 'bottom' | 'top';
  height: number;
}) {
  if (height <= 0) return null;
  const overscan = CHAT_THREAD_EDGE_BLUR_OVERSCAN;
  const gradientId = `chatThread${edge === 'top' ? 'Top' : 'Bottom'}Blur`;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.threadEdgeBlur,
        edge === 'top' ? styles.threadEdgeBlurTop : styles.threadEdgeBlurBottom,
        edge === 'top'
        ? { height: height + overscan, top: -overscan }
        : { height: height + overscan, bottom: bottomOffset - overscan },
      ]}
    >
      <MaskedView
        maskElement={(
          <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.threadEdgeBlurFill}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
                {(edge === 'top'
                  ? [
                    <Stop key="top-0" offset="0" stopColor="#ffffff" stopOpacity="0" />,
                    <Stop key="top-1" offset="0.12" stopColor="#ffffff" stopOpacity="0.15" />,
                    <Stop key="top-2" offset="0.34" stopColor="#ffffff" stopOpacity="0.48" />,
                    <Stop key="top-3" offset="1" stopColor="#ffffff" stopOpacity="1" />,
                  ]
                  : [
                    <Stop key="bottom-0" offset="0" stopColor="#ffffff" stopOpacity="1" />,
                    <Stop key="bottom-1" offset="0.66" stopColor="#ffffff" stopOpacity="0.48" />,
                    <Stop key="bottom-2" offset="0.88" stopColor="#ffffff" stopOpacity="0.15" />,
                    <Stop key="bottom-3" offset="1" stopColor="#ffffff" stopOpacity="0" />,
                  ])}
              </LinearGradient>
            </Defs>
            <Rect fill={`url(#${gradientId})`} height="100%" width="100%" x="0" y="0" />
          </Svg>
        )}
        style={styles.threadEdgeBlurFill}
      >
        <BlurView
          blurReductionFactor={CHAT_THREAD_EDGE_BLUR_REDUCTION}
          experimentalBlurMethod="dimezisBlurView"
          intensity={CHAT_THREAD_EDGE_BLUR_INTENSITY}
          style={styles.threadEdgeBlurFill}
          tint="light"
        />
      </MaskedView>
    </View>
  );
}

function buildChatTypingLabel(rawText: unknown, operatorName: string, assistantName: string) {
  const text = normalizeChatText(rawText, 120).trim();
  const fallbackName = normalizeChatText(operatorName, 80).trim() || '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440';
  const knownNames = [operatorName, assistantName]
    .map((name) => normalizeChatText(name, 80).trim())
    .filter(Boolean);
  const lowerText = text.toLocaleLowerCase('ru-RU');
  const hasName = knownNames.some((name) => lowerText.startsWith(name.toLocaleLowerCase('ru-RU')));
  if (text && hasName) return text;
  return `${fallbackName} ${text || '\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442'}`;
}

function getKeyboardEasing(easing?: KeyboardEvent['easing']) {
  switch (easing) {
    case 'linear':
      return Easing.linear;
    case 'easeIn':
      return Easing.in(Easing.cubic);
    case 'easeOut':
      return Easing.out(Easing.cubic);
    case 'easeInEaseOut':
      return Easing.inOut(Easing.cubic);
    default:
      return Easing.bezier(0.25, 0.1, 0.25, 1);
  }
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    position: 'relative',
  },
  chatStage: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  daySeparator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(112,150,95,0.78)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
    marginTop: 8,
    minHeight: 28,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  daySeparatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  errorBar: {
    backgroundColor: '#fef2f2',
    borderTopColor: '#fecaca',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
  footerIsland: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 12,
  },
  feedMask: {
    flex: 1,
  },
  loadMore: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 34,
    paddingHorizontal: 14,
  },
  loadMoreText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '800',
  },
  keyboardLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  root: {
    backgroundColor: '#f0f3eb',
    flex: 1,
    position: 'relative',
  },
  scrollDown: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 18,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    width: 44,
    zIndex: 10,
  },
  scrollDownPressable: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  scrollDownBadge: {
    backgroundColor: '#ef4444',
    borderColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: 7,
    top: 7,
    width: 12,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  thread: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 14,
    paddingHorizontal: 10,
    paddingTop: 14,
  },
  threadEdgeBlur: {
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    zIndex: 7,
  },
  threadEdgeBlurBottom: {
    bottom: 0,
  },
  threadEdgeBlurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  threadEdgeBlurTop: {
    top: 0,
  },
  wallpaper: {
    backgroundColor: '#f0f3eb',
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 0,
  },
  wallpaperFill: {
    ...StyleSheet.absoluteFillObject,
  },
  wallpaperImage: {
    resizeMode: 'cover',
  },
  wallpaperTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
});
