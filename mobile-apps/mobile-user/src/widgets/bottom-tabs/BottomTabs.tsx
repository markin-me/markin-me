import {
  StyleSheet,
  View,
} from 'react-native';

import { theme } from '../../shared/config/theme';

import { AppText as Text } from '../../shared/ui';
const tabs = ['Главная', 'Каталог', 'Корзина', 'Профиль'];

export function BottomTabs() {
  return (
    <View style={styles.root}>
      {tabs.map((tab) => (
        <Text key={tab} style={styles.tab}>
          {tab}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    color: theme.colors.muted,
    fontSize: 13,
  },
});
