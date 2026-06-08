import {
  useCallback,
  useEffect,
  useMemo,
  useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { theme } from '../config/theme';

import { AppText as Text } from './AppText';
type BottomSheetProps = {
  children: ReactNode;
  onClose: () => void;
  title?: string;
  visible: boolean;
};

export function BottomSheet({ children, onClose, title, visible }: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(420)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);

  useEffect(() => {
    if (!visible) return;

    translateY.setValue(420);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY, visible]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 190,
        easing: Easing.in(Easing.cubic),
        toValue: 420,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdropOpacity, onClose, translateY]);

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      bounciness: 0,
      speed: 18,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const handleDragMove = useCallback((dy: number) => {
    if (dy > 0) translateY.setValue(dy);
  }, [translateY]);

  const handleDragRelease = useCallback((dy: number, vy: number) => {
    if (dy > 88 || vy > 0.85) {
      closeSheet();
      return;
    }

    resetPosition();
  }, [closeSheet, resetPosition]);

  const headerPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dy > 4 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => handleDragMove(gesture.dy),
      onPanResponderRelease: (_, gesture) => handleDragRelease(gesture.dy, gesture.vy),
      onPanResponderTerminate: resetPosition,
    }),
    [handleDragMove, handleDragRelease, resetPosition],
  );

  const contentPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        scrollY.current <= 0 &&
        gesture.dy > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => handleDragMove(gesture.dy),
      onPanResponderRelease: (_, gesture) => handleDragRelease(gesture.dy, gesture.vy),
      onPanResponderTerminate: resetPosition,
    }),
    [handleDragMove, handleDragRelease, resetPosition],
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={closeSheet}
      transparent
      visible={visible}
    >
      <View style={styles.host}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdropPressable} onPress={closeSheet} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View {...headerPanResponder.panHandlers}>
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>
            {title ? (
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
              </View>
            ) : null}
          </View>
          <ScrollView
            alwaysBounceVertical={false}
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            {...contentPanResponder.panHandlers}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  backdropPressable: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  grabber: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 5,
    width: 46,
  },
  grabberWrap: {
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
  },
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
});
