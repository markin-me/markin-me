import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { routes } from '../../app/navigation/routes';
import { resolveAssetUrl } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';
import { AppHeader } from '../../widgets/app-header';
import { ChatPage } from './ChatPage';

const CHAT_HEADER_TITLE = 'Добро пожаловать в чат!';

type ChatTabStackParamList = {
  chatHome: undefined;
  [routes.importantMessages]: undefined;
  [routes.supportChat]: undefined;
};

export function ChatMessagesPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const insets = useSafeAreaInsets();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const chatMountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wallpaperUri = useMemo(
    () => resolveAssetUrl('/static/assets/chat-wallpaper-mobile.webp?v=20260320d'),
    [],
  );
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

  useEffect(() => () => {
    if (chatMountTimerRef.current != null) {
      clearTimeout(chatMountTimerRef.current);
      chatMountTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: chatOpen ? hideTabBarStyle : baseTabBarStyle });
    return () => {
      parent?.setOptions({ tabBarStyle: baseTabBarStyle });
    };
  }, [baseTabBarStyle, chatOpen, hideTabBarStyle, navigation]);

  const openSupportChat = useCallback(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hideTabBarStyle });
    setChatOpen(true);
    if (chatMounted) return;
    if (chatMountTimerRef.current != null) clearTimeout(chatMountTimerRef.current);
    chatMountTimerRef.current = setTimeout(() => {
      chatMountTimerRef.current = null;
      setChatMounted(true);
    }, 120);
  }, [chatMounted, hideTabBarStyle, navigation]);

  const closeSupportChat = useCallback(() => {
    if (chatMountTimerRef.current != null) {
      clearTimeout(chatMountTimerRef.current);
      chatMountTimerRef.current = null;
    }
    navigation.getParent()?.setOptions({ tabBarStyle: baseTabBarStyle });
    setChatOpen(false);
  }, [baseTabBarStyle, navigation]);

  return (
    <View style={styles.container}>
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Text style={styles.title}>Сообщения</Text>
        <Text style={styles.subtitle}>Выберите, куда перейти.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate(routes.importantMessages)}
          style={styles.card}
        >
          <View style={styles.cardIcon}>
            <Ionicons color={theme.colors.accent} name="notifications-outline" size={22} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Важные сообщения от компании</Text>
            <Text style={styles.cardText}>Здесь появятся системные сообщения и уведомления.</Text>
          </View>
          <Ionicons color="#9ca3af" name="chevron-forward" size={20} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={openSupportChat}
          style={styles.card}
        >
          <View style={styles.cardIcon}>
            <Ionicons color={theme.colors.accent} name="chatbubble-ellipses-outline" size={22} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Чат поддержки</Text>
            <Text style={styles.cardText}>Переход в текущий чат поддержки.</Text>
          </View>
          <Ionicons color="#9ca3af" name="chevron-forward" size={20} />
        </Pressable>
      </View>
    </Screen>
      {chatMounted || chatOpen ? (
        <View
          pointerEvents={chatOpen ? 'auto' : 'none'}
          style={[styles.chatLayer, chatOpen ? styles.chatLayerVisible : styles.chatLayerHidden]}
        >
          {chatMounted ? (
            <ChatPage active={chatOpen} onBack={closeSupportChat} />
          ) : (
            <ChatOpeningState onBack={closeSupportChat} wallpaperUri={wallpaperUri} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function ChatOpeningState({
  onBack,
  wallpaperUri,
}: {
  onBack: () => void;
  wallpaperUri: string;
}) {
  return (
    <Screen edges={['top']}>
      <View style={styles.openingRoot}>
        <ImageBackground
          imageStyle={styles.openingWallpaperImage}
          source={{ uri: wallpaperUri }}
          style={styles.openingWallpaper}
        >
          <View pointerEvents="none" style={styles.openingWallpaperTint} />
        </ImageBackground>
        <AppHeader backgroundColor="#ffffff" onBack={onBack} showBack title={CHAT_HEADER_TITLE} />
        <View style={styles.openingLoader}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chatLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  chatLayerHidden: {
    opacity: 0,
    zIndex: -1,
  },
  chatLayerVisible: {
    opacity: 1,
    zIndex: 2,
  },
  container: {
    flex: 1,
  },
  openingLoader: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  openingRoot: {
    backgroundColor: '#f0f3eb',
    flex: 1,
    position: 'relative',
  },
  openingWallpaper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f0f3eb',
  },
  openingWallpaperImage: {
    resizeMode: 'cover',
  },
  openingWallpaperTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
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
    width: 40,
  },
  cardText: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
});
