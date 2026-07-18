import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ChatMessage, ChatReply } from '../../../features/chat';
import { theme } from '../../../shared/config/theme';
import { AppText as Text } from '../../../shared/ui';

const CHAT_COMPOSER_VERTICAL_MARGIN = 10;

type ChatComposerProps = {
  editing?: ChatMessage | null;
  focusToken?: number;
  onAttach: () => void;
  onBaseHeight?: (height: number) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onChangeTyping: (text: string) => void;
  onSaveEdit: (text: string) => void;
  onSend: (text: string) => void;
  replyTo?: ChatReply | null;
};

export function ChatComposer({
  editing,
  focusToken = 0,
  onAttach,
  onBaseHeight,
  onCancelEdit,
  onCancelReply,
  onChangeTyping,
  onSaveEdit,
  onSend,
  replyTo,
}: ChatComposerProps) {
  const inputRef = useRef<TextInput | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    setText(editing?.text || '');
  }, [editing]);

  useEffect(() => {
    if (!focusToken) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusToken]);

  const canSend = text.trim().length > 0;

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (editing) onSaveEdit(value);
    else onSend(value);
    setText('');
  };

  return (
    <View style={styles.root}>
      {replyTo || editing ? (
        <View style={styles.reply}>
          <View style={styles.replyBar} />
          <View style={styles.replyContent}>
            <Text numberOfLines={1} style={styles.replyName}>{editing ? 'Редактирование' : replyTo?.sender || 'Ответ'}</Text>
            <Text numberOfLines={1} style={styles.replyText}>{editing ? editing.text : replyTo?.text}</Text>
          </View>
          <Pressable onPress={editing ? onCancelEdit : onCancelReply} style={styles.replyClose}>
            <Ionicons color="#6b7280" name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      <View
        onLayout={(event) => {
          const height = Math.ceil(event.nativeEvent.layout.height || 0);
          if (height > 0) onBaseHeight?.(height + CHAT_COMPOSER_VERTICAL_MARGIN * 2);
        }}
        style={styles.controls}
      >
        <Pressable accessibilityRole="button" onPress={onAttach} style={styles.iconButton}>
          <Ionicons color="#6b7280" name="attach" size={24} />
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            allowFontScaling={false}
            ref={inputRef}
            multiline
            onChangeText={(next) => {
              setText(next);
              onChangeTyping(next);
            }}
            placeholder="Введите сообщение"
            placeholderTextColor="#8f8f95"
            style={styles.input}
            value={text}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSend}
          onPress={submit}
          style={styles.sendButton}
        >
          <Ionicons color="#ffffff" name={editing ? 'checkmark' : 'paper-plane'} size={20} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(255,255,255,0.93)',
    borderRadius: 999,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  input: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 166,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  inputWrap: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(255,255,255,0.93)',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    maxHeight: 168,
    minHeight: 48,
    overflow: 'hidden',
  },
  reply: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.87)',
    borderColor: 'rgba(229,231,235,0.94)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  replyBar: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    width: 3,
  },
  replyClose: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  replyContent: {
    flex: 1,
    minWidth: 0,
  },
  replyName: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  replyText: {
    color: '#111827',
    fontSize: 13,
  },
  root: {
    gap: 8,
    marginHorizontal: 10,
    marginVertical: CHAT_COMPOSER_VERTICAL_MARGIN,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#f68b2c',
    borderRadius: 999,
    elevation: 6,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#f57c1f',
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: 48,
  },
});
