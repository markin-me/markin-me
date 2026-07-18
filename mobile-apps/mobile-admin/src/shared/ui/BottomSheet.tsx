import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { theme } from '../config/theme';
import { AppText as Text } from './AppText';

type BottomSheetProps = {
  children: ReactNode;
  onClose: () => void;
  title?: string;
  visible: boolean;
};

export function BottomSheet({ children, onClose, title, visible }: BottomSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.host}>
        <Pressable onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.45)',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 5,
    marginTop: theme.spacing.md,
    width: 46,
  },
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
});
