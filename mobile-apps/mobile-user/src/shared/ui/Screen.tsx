import type { PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { theme } from '../config/theme';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.root}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
