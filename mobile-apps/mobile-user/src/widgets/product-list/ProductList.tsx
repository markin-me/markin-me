import {
  StyleSheet,
  View,
} from 'react-native';

import { theme } from '../../shared/config/theme';

import { AppText as Text } from '../../shared/ui';
export function ProductList() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Товары появятся здесь</Text>
      <Text style={styles.caption}>Следующий шаг - подключить реальный каталог из API.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 24,
    padding: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  caption: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: 6,
  },
});
