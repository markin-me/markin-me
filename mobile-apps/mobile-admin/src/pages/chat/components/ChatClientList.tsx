import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  formatChatTime,
  getSummaryClientId,
  getSummaryName,
  getSummaryPhone,
  getSummaryPreview,
  getSummaryUnread,
  type ChatClientSummary,
} from '../../../features/chat';
import { theme } from '../../../shared/config/theme';
import { AppText as Text } from '../../../shared/ui';

type ChatClientListProps = {
  activeId?: string;
  clients: ChatClientSummary[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (client: ChatClientSummary) => void;
  query: string;
  setQuery: (query: string) => void;
};

export function ChatClientList({ activeId, clients, loading, onRefresh, onSelect, query, setQuery }: ChatClientListProps) {
  const normalized = query.trim().toLowerCase();
  const rows = normalized
    ? clients.filter((client) => `${getSummaryName(client)} ${getSummaryPhone(client)} ${getSummaryPreview(client)}`.toLowerCase().includes(normalized))
    : clients;

  return (
    <View style={styles.root}>
      <TextInput
        allowFontScaling={false}
        onChangeText={setQuery}
        placeholder="Поиск по чатам"
        placeholderTextColor="#8f8f95"
        style={styles.search}
        value={query}
      />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={loading} />}
      >
        {loading && !rows.length ? <ActivityIndicator color={theme.colors.accent} /> : null}
        {rows.map((client) => {
          const clientId = getSummaryClientId(client);
          const unread = getSummaryUnread(client);
          return (
            <Pressable
              key={clientId}
              onPress={() => onSelect(client)}
              style={[styles.row, activeId === clientId && styles.rowActive]}
            >
              <View style={styles.rowTop}>
                <Text numberOfLines={1} style={styles.name}>{getSummaryName(client)}</Text>
                <Text style={styles.time}>{formatChatTime(client.updated_at)}</Text>
              </View>
              <View style={styles.rowBottom}>
                <Text numberOfLines={1} style={[styles.preview, client.typing?.active && styles.typing]}>
                  {client.typing?.active ? 'печатает...' : getSummaryPreview(client) || getSummaryPhone(client) || 'Нет сообщений'}
                </Text>
                {unread > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 6,
    padding: 12,
  },
  name: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  preview: {
    color: theme.colors.muted,
    flex: 1,
    fontSize: 13,
  },
  root: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  row: {
    borderRadius: 12,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rowActive: {
    backgroundColor: '#eef2f7',
  },
  rowBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  search: {
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    margin: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  time: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  typing: {
    color: '#22c55e',
    fontWeight: '800',
  },
  unread: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});
