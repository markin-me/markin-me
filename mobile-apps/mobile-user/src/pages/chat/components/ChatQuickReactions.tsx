import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text as NativeText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CHAT_EXTRA_REACTIONS, CHAT_QUICK_REACTIONS } from '../../../features/chat';

type ChatQuickReactionsProps = {
  expanded?: boolean;
  onReact: (reaction: string) => void;
  onToggleExpanded?: () => void;
};

export function ChatQuickReactions({ expanded, onReact, onToggleExpanded }: ChatQuickReactionsProps) {
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [renderExpanded, setRenderExpanded] = useState(!!expanded);
  const reactions = renderExpanded ? [...CHAT_QUICK_REACTIONS, ...CHAT_EXTRA_REACTIONS] : CHAT_QUICK_REACTIONS;
  const animatedHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [26, 54],
  });
  const extraTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });
  const extraScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  useEffect(() => {
    if (expanded) setRenderExpanded(true);
    progress.stopAnimation(() => {
      Animated.timing(progress, {
        duration: 340,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        toValue: expanded ? 1 : 0,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !expanded) setRenderExpanded(false);
      });
    });
  }, [expanded, progress]);

  return (
    <Animated.View style={[styles.clip, { height: animatedHeight }]}>
      <View style={styles.root}>
        {reactions.map((reaction, index) => {
          const isExtra = index >= CHAT_QUICK_REACTIONS.length;

          return (
            <Animated.View
              key={reaction}
              style={[
                styles.item,
                isExtra && {
                  transform: [{ translateY: extraTranslateY }, { scale: extraScale }],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => onReact(reaction)}
                style={styles.button}
              >
                <NativeText style={styles.reaction}>{reaction}</NativeText>
              </Pressable>
            </Animated.View>
          );
        })}
        {onToggleExpanded ? (
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onToggleExpanded} style={styles.moreButton}>
            <Ionicons color="#6b7280" name={expanded ? 'chevron-up' : 'chevron-down'} size={17} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 6,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  clip: {
    overflow: 'hidden',
    width: 222,
  },
  item: {
    height: 26,
    width: 26,
  },
  moreButton: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    borderColor: 'rgba(229,231,235,0.9)',
    borderRadius: 999,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  reaction: {
    color: '#111827',
    fontSize: 17,
    includeFontPadding: false,
    lineHeight: 21,
    opacity: 1,
  },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    width: 222,
  },
});
