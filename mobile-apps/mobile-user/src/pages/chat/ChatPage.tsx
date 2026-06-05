import {
  StyleSheet,
  View,
} from 'react-native';

import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
export function ChatPage() {
  return (
    <Screen edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Чат</Text>
        <Text style={styles.caption}>Чат с компанией появится здесь.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: theme.colors.muted,
    fontSize: 15,
    marginTop: theme.spacing.sm,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
});
