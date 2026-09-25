import { useCallback, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { routes, type ChatTabParamList, type RootStackParamList } from '../../app/navigation/routes';
import { fetchChatSettings, preloadUserChatThread, useChatUnread } from '../../features/chat';
import { isChatEnabled, isImportantMessagesEnabled } from '../../features/chat/helpers';
import { readLastChatSettingsSync } from '../../features/chat/storage';
import type { ChatSettings } from '../../features/chat/types';
import { theme } from '../../shared/config/theme';
import { AppText as Text } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';

type ChatMessagesNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type ChatMessagesPageProps = {
  onOpenSupportChat?: () => void;
};

export function ChatMessagesPage({ onOpenSupportChat }: ChatMessagesPageProps = {}) {
  const navigation = useNavigation<ChatMessagesNavigationProp>();
  const { chatUnread, promoUnread, refreshPromoUnread } = useChatUnread();
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(() => readLastChatSettingsSync());
  const preloadingChatRef = useRef(false);
  const preloadTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importantMessagesEnabled = isImportantMessagesEnabled(chatSettings);
  const supportChatEnabled = isChatEnabled(chatSettings);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const refreshSettings = () => {
      void fetchChatSettings()
        .then((nextSettings) => {
          if (!cancelled) setChatSettings(nextSettings);
        })
        .catch(() => undefined);
    };
    refreshSettings();
    return () => {
      cancelled = true;
    };
  }, []));

  const cancelPendingChatPreload = useCallback(() => {
    if (preloadTimerRef.current != null) {
      clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
    }
    preloadTaskRef.current?.cancel();
    preloadTaskRef.current = null;
  }, []);

  const openSupportChat = useCallback(() => {
    cancelPendingChatPreload();
    if (onOpenSupportChat) {
      onOpenSupportChat();
      return;
    }
    navigation.navigate(routes.supportChat);
  }, [cancelPendingChatPreload, navigation, onOpenSupportChat]);

  const compareMessagesState = useCallback(() => {
    refreshPromoUnread();
    cancelPendingChatPreload();
    preloadTimerRef.current = setTimeout(() => {
      preloadTimerRef.current = null;
      if (preloadingChatRef.current) return;
      preloadingChatRef.current = true;
      preloadTaskRef.current = InteractionManager.runAfterInteractions(() => {
        preloadTaskRef.current = null;
        void preloadUserChatThread()
          .catch(() => undefined)
          .finally(() => {
            preloadingChatRef.current = false;
          });
      });
    }, 1800);
    return cancelPendingChatPreload;
  }, [cancelPendingChatPreload, refreshPromoUnread]);

  useFocusEffect(useCallback(() => {
    const cancelPreload = compareMessagesState();
    const timer = setInterval(refreshPromoUnread, 15000);
    return () => {
      cancelPreload();
      clearInterval(timer);
    };
  }, [compareMessagesState, refreshPromoUnread]));

  return (
    <View style={styles.container}>
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Text style={styles.title}>Сообщения</Text>

        {importantMessagesEnabled ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate(routes.importantMessages)}
          style={styles.card}
        >
          <View style={styles.cardIcon}>
            <Ionicons color={theme.colors.accent} name="notifications-outline" size={22} />
            {promoUnread > 0 ? <View style={styles.unreadDot} /> : null}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Важные сообщения от компании</Text>
          </View>
          <Ionicons color="#9ca3af" name="chevron-forward" size={20} />
        </Pressable>
        ) : null}

        {supportChatEnabled ? (
        <Pressable
          accessibilityRole="button"
          onPress={openSupportChat}
          style={styles.card}
        >
          <View style={styles.cardIcon}>
            <Ionicons color={theme.colors.accent} name="chatbubble-ellipses-outline" size={22} />
            {chatUnread > 0 ? <View style={styles.unreadDot} /> : null}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Чат поддержки</Text>
          </View>
          <Ionicons color="#9ca3af" name="chevron-forward" size={20} />
        </Pressable>
        ) : null}
      </View>
    </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.mutedBackground,
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(229,231,235,0.95)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  unreadDot: {
    backgroundColor: '#ef4444',
    borderColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
  },
});
