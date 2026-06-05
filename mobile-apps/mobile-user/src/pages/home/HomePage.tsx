import {
  StyleSheet,
  View,
} from 'react-native';

import { ProductList } from '../../widgets/product-list';
import { AppHeader } from '../../widgets/app-header';
import { BottomTabs } from '../../widgets/bottom-tabs';
import { Screen } from '../../shared/ui/Screen';
import { theme } from '../../shared/config/theme';

import { AppText as Text } from '../../shared/ui';
export function HomePage() {
  return (
    <Screen>
      <AppHeader title="Витрина" />
      <View style={styles.content}>
        <Text style={styles.title}>Mobile user app</Text>
        <Text style={styles.caption}>Каркас витрины готов к наполнению.</Text>
        <ProductList />
      </View>
      <BottomTabs />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  caption: {
    marginTop: 8,
    color: theme.colors.muted,
    fontSize: 16,
  },
});
