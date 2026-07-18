import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../../shared/config/theme';
import { AppText as Text } from '../../../shared/ui';
import type { ChatMessage, ChatReply } from '../../../features/chat';

type ChatComposerProps = {
  editing?: ChatMessage | null;
  onAttach: () => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onChangeTyping: (text: string) => void;
  onSaveEdit: (text: string) => void;
  onSend: (text: string) => void;
  replyTo?: ChatReply | null;
};

export function ChatComposer({ editing, onAttach, onCancelEdit, onCancelReply, onChangeTyping, onSaveEdit, onSend, replyTo }: ChatComposerProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(editing?.text || '');
  }, [editing]);

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
      <Pressable onPress={onAttach} style={styles.iconButton}>
        <Ionicons color="#6b7280" name="attach" size={24} />
      </Pressable>
      <TextInput
        allowFontScaling={false}
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
      <Pressable disabled={!text.trim()} onPress={submit} style={[styles.send, !text.trim() && styles.sendDisabled]}>
        <Ionicons color="#fff" name={editing ? 'checkmark' : 'paper-plane'} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  input: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 166,
    minHeight: 46,
    paddingVertical: 12,
  },
  reply: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(229,231,235,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexBasis: '100%',
    gap: 8,
    minHeight: 44,
    padding: 8,
  },
  replyBar: {
    alignSelf: 'stretch',
    backgroundColor: '#6366f1',
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
    color: '#4f46e5',
    fontSize: 13,
    fontWeight: '800',
  },
  replyText: {
    color: '#111827',
    fontSize: 13,
  },
  root: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    margin: 12,
    minHeight: 58,
    padding: 8,
  },
  send: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  sendDisabled: {
    opacity: 0.44,
  },
});
