import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { routes, type ChatTabParamList } from '../../app/navigation/routes';
import { useChatUnread } from '../../features/chat';
import { theme } from '../../shared/config/theme';
import { AppText as Text } from '../../shared/ui';
import { Screen } from '../../shared/ui/Screen';

export function ChatMessagesPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabParamList>>();
  const { chatUnread, promoUnread } = useChatUnread();

  const openSupportChat = useCallback(() => {
    navigation.navigate(routes.supportChat);
  }, [navigation]);

  return (
    <View style={styles.container}>
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Text style={styles.title}>Сообщения</Text>

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
