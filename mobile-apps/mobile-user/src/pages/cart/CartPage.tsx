import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

export function CartPage() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Корзина</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
});
