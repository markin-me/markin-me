import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  fetchAdminClient,
  fetchAdminClientOrders,
  fetchAdminOrder,
  formatChatDay,
  getMessagePreview,
  getOrderCardTitle,
  getSummaryName,
  getSummaryPhone,
  shouldShowDay,
  useAdminChat,
  type ChatMessage,
  type ChatOrderCard,
} from '../../features/chat';
import { type AdminSession } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, BottomSheet, Screen } from '../../shared/ui';
import { ChatActionSheet } from './components/ChatActionSheet';
import { ChatAttachmentPreview, type ChatPickedImage } from './components/ChatAttachmentPreview';
import { ChatClientList } from './components/ChatClientList';
import { ChatComposer } from './components/ChatComposer';
import { ChatImageViewer } from './components/ChatImageViewer';
import { ChatMessageBubble } from './components/ChatMessageBubble';

type ChatPageProps = {
  onLogout: () => void;
  onOpenExpenseDocuments: () => void;
  session: AdminSession;
};

export function ChatPage({ onLogout, onOpenExpenseDocuments, session }: ChatPageProps) {
  const chat = useAdminChat(session.token);
  const scrollRef = useRef<ScrollView | null>(null);
  const [query, setQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [reactionsExpanded, setReactionsExpanded] = useState(false);
  const [pickedImages, setPickedImages] = useState<ChatPickedImage[]>([]);
  const [caption, setCaption] = useState('');
  const [imageViewerUri, setImageViewerUri] = useState('');
  const [showList, setShowList] = useState(true);
  const [detailsTitle, setDetailsTitle] = useState('');
  const [detailsRows, setDetailsRows] = useState<Record<string, unknown> | null>(null);

  const activeName = chat.activeClient ? getSummaryName(chat.activeClient) : 'Чат не выбран';
  const activePhone = chat.activeClient ? getSummaryPhone(chat.activeClient) : '';
  const selectionMode = chat.selectedIds.length > 0;
  const selectedMessages = useMemo(
    () => chat.messages.filter((message) => chat.selectedIds.includes(message.id)),
    [chat.messages, chat.selectedIds],
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const selectClient = (client: Parameters<typeof chat.selectClient>[0]) => {
    chat.selectClient(client);
    setShowList(false);
    scrollToBottom();
  };

  const pickImages = async () => {
    if (!chat.activeClientId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.86,
    });
    if (result.canceled) return;
    const images = (result.assets || []).map((asset, index) => ({
      name: asset.fileName || `admin-chat-image-${Date.now()}-${index}.jpg`,
      type: asset.mimeType || 'image/jpeg',
      uri: asset.uri,
    }));
    setPickedImages(images);
    setCaption('');
  };

  const sendPickedImages = async () => {
    const images = pickedImages.slice();
    setPickedImages([]);
    setCaption('');
    await chat.uploadAndSendImages(images, caption.trim());
    scrollToBottom();
  };

  const closeActionSheet = () => {
    setActionMessage(null);
    setReactionsExpanded(false);
  };

  const copySelected = async () => {
    const text = selectedMessages.map((message) => getMessagePreview(message)).filter(Boolean).join('\n');
    if (text) await Clipboard.setStringAsync(text);
    chat.setSelectedIds([]);
  };

  const openClientDetails = async () => {
    if (!chat.activeClientId) return;
    setDetailsTitle('Клиент');
    setDetailsRows({ loading: true });
    const [client, orders] = await Promise.all([
      fetchAdminClient(session.token, chat.activeClientId).catch((err) => ({ error: String(err instanceof Error ? err.message : err) })),
      fetchAdminClientOrders(session.token, chat.activeClientId).catch(() => []),
    ]);
    setDetailsRows({ ...client, orders_count: Array.isArray(orders) ? orders.length : 0 });
  };

  const openOrder = async (card: ChatOrderCard) => {
    const orderId = Number(card.id || card.order_id || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    setDetailsTitle(getOrderCardTitle(card));
    setDetailsRows({ loading: true });
    const order = await fetchAdminOrder(session.token, orderId).catch((err) => ({ error: String(err instanceof Error ? err.message : err) }));
    setDetailsRows(order);
  };

  const renderThread = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.threadRoot}>
      <View style={styles.threadHeader}>
        <Pressable onPress={() => setShowList(true)} style={styles.headerIcon}>
          <Ionicons color="#6b7280" name="arrow-back" size={22} />
        </Pressable>
        <Pressable onPress={openClientDetails} style={styles.headerTitle}>
          <Text numberOfLines={1} style={styles.headerName}>{activeName}</Text>
          {activePhone ? <Text numberOfLines={1} style={styles.headerPhone}>{activePhone}</Text> : null}
        </Pressable>
        <Pressable onPress={chat.refreshThread} style={styles.headerIcon}>
          <Ionicons color="#6b7280" name="refresh" size={21} />
        </Pressable>
      </View>
      <View style={styles.messagesHost}>
        <ScrollView
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
          ref={scrollRef}
          refreshControl={<RefreshControl onRefresh={chat.refreshThread} refreshing={chat.loadingThread} />}
        >
          {chat.hasMore ? (
            <Pressable onPress={chat.loadMore} style={styles.loadMore}>
              <Text style={styles.loadMoreText}>Загрузить старые сообщения</Text>
            </Pressable>
          ) : null}
          {chat.loadingThread && !chat.messages.length ? (
            <View style={styles.emptyThread}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null}
          {chat.messages.map((message, index) => {
            const previous = index > 0 ? chat.messages[index - 1] : null;
            return (
              <View key={message.id}>
                {shouldShowDay(previous, message) ? (
                  <View style={styles.day}>
                    <Text style={styles.dayText}>{formatChatDay(message.createdAt)}</Text>
                  </View>
                ) : null}
                <ChatMessageBubble
                  message={message}
                  onLongPress={(next) => setActionMessage(next)}
                  onOpenImage={setImageViewerUri}
                  onOpenOrder={openOrder}
                  onPress={(next) => selectionMode ? chat.toggleSelected(next) : undefined}
                  selected={chat.selectedIds.includes(message.id)}
                  selectionMode={selectionMode}
                />
              </View>
            );
          })}
          {chat.typing?.active ? (
            <Text style={styles.typing}>Клиент печатает...</Text>
          ) : null}
        </ScrollView>
      </View>
      {chat.error ? (
        <Pressable onPress={() => chat.setError('')} style={styles.errorBar}>
          <Text numberOfLines={2} style={styles.errorText}>{chat.error}</Text>
        </Pressable>
      ) : null}
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Pressable onPress={() => chat.setSelectedIds([])} style={styles.selectionIcon}>
            <Ionicons color="#6b7280" name="close" size={22} />
          </Pressable>
          <Text style={styles.selectionText}>Выбрано {chat.selectedIds.length}</Text>
          <Pressable onPress={copySelected} style={styles.selectionIcon}>
            <Ionicons color="#6b7280" name="copy-outline" size={21} />
          </Pressable>
          <Pressable onPress={chat.deleteSelected} style={styles.selectionIcon}>
            <Ionicons color="#ef4444" name="trash-outline" size={21} />
          </Pressable>
        </View>
      ) : (
        <ChatComposer
          editing={chat.editing}
          onAttach={pickImages}
          onCancelEdit={() => chat.setEditing(null)}
          onCancelReply={() => chat.setReplyTo(null)}
          onChangeTyping={chat.sendTyping}
          onSaveEdit={chat.saveEdit}
          onSend={async (text) => {
            await chat.sendMessage(text);
            scrollToBottom();
          }}
          replyTo={chat.replyTo}
        />
      )}
    </KeyboardAvoidingView>
  );

  return (
    <Screen edges={['top']}>
      <View style={styles.appHeader}>
        <View style={styles.appHeaderTitle}>
          <Text style={styles.appTitle}>Чаты</Text>
          <Text numberOfLines={1} style={styles.appSubtitle}>{String(session.tenant?.name || session.user?.email || '')}</Text>
        </View>
        <Pressable onPress={onOpenExpenseDocuments} style={styles.logout}>
          <Ionicons color="#6b7280" name="receipt-outline" size={22} />
        </Pressable>
        <Pressable onPress={onLogout} style={styles.logout}>
          <Ionicons color="#6b7280" name="log-out-outline" size={22} />
        </Pressable>
      </View>
      {showList || !chat.activeClient ? (
        <ChatClientList
          activeId={chat.activeClientId}
          clients={chat.clients}
          loading={chat.loadingClients}
          onRefresh={chat.refreshClients}
          onSelect={selectClient}
          query={query}
          setQuery={setQuery}
        />
      ) : renderThread()}

      <ChatActionSheet
        canEdit={!!actionMessage && chat.canEdit(actionMessage)}
        expanded={reactionsExpanded}
        onClose={closeActionSheet}
        onCopy={async () => {
          if (actionMessage) await Clipboard.setStringAsync(getMessagePreview(actionMessage));
          closeActionSheet();
        }}
        onDelete={() => {
          if (actionMessage) void chat.removeMessage(actionMessage);
          closeActionSheet();
        }}
        onEdit={() => {
          if (actionMessage) chat.setEditing(actionMessage);
          closeActionSheet();
        }}
        onReact={(reaction) => {
          if (actionMessage) void chat.reactToMessage(actionMessage, reaction);
          closeActionSheet();
        }}
        onReply={() => {
          if (actionMessage) chat.setReplyFromMessage(actionMessage);
          closeActionSheet();
        }}
        onSelect={() => {
          if (actionMessage) chat.toggleSelected(actionMessage);
          closeActionSheet();
        }}
        setExpanded={setReactionsExpanded}
        visible={!!actionMessage}
      />
      <ChatAttachmentPreview
        caption={caption}
        images={pickedImages}
        onCancel={() => {
          setPickedImages([]);
          setCaption('');
        }}
        onChangeCaption={setCaption}
        onSend={sendPickedImages}
        visible={pickedImages.length > 0}
      />
      <ChatImageViewer onClose={() => setImageViewerUri('')} uri={imageViewerUri} />
      <BottomSheet onClose={() => setDetailsRows(null)} title={detailsTitle} visible={!!detailsRows}>
        <DetailsRows rows={detailsRows || {}} />
      </BottomSheet>
    </Screen>
  );
}

function DetailsRows({ rows }: { rows: Record<string, unknown> }) {
  return (
    <View style={styles.details}>
      {Object.entries(rows).slice(0, 24).map(([key, value]) => (
        <View key={key} style={styles.detailRow}>
          <Text style={styles.detailKey}>{key}</Text>
          <Text style={styles.detailValue}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  appHeader: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  appHeaderTitle: {
    flex: 1,
    minWidth: 0,
  },
  appSubtitle: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  appTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  day: {
    alignSelf: 'center',
    backgroundColor: 'rgba(112,150,95,0.78)',
    borderRadius: 999,
    marginBottom: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  detailKey: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  detailRow: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 8,
  },
  detailValue: {
    color: theme.colors.text,
    fontSize: 14,
  },
  details: {
    gap: 2,
  },
  emptyThread: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  errorBar: {
    backgroundColor: '#fef2f2',
    borderTopColor: '#fecaca',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  headerPhone: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  loadMore: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: 14,
  },
  loadMoreText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '800',
  },
  logout: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  messagesHost: {
    backgroundColor: '#f0f3eb',
    flex: 1,
  },
  selectionBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    margin: 12,
    minHeight: 58,
    paddingHorizontal: 10,
  },
  selectionIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  selectionText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  thread: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  threadHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: 8,
  },
  threadRoot: {
    backgroundColor: '#f0f3eb',
    flex: 1,
  },
  typing: {
    color: '#73777f',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
