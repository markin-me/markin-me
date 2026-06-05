import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';

import { theme } from '../config/theme';

type ScreenProps = PropsWithChildren<{
  edges?: Edge[];
}>;

const defaultEdges: Edge[] = ['top', 'bottom'];

export function Screen({ children, edges = defaultEdges }: ScreenProps) {
  return <SafeAreaView edges={edges} style={styles.root}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
