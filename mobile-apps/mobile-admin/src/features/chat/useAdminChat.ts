import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createMessage,
  deleteMessage,
  fetchChatClients,
  fetchThread,
  markMessagesRead,
  openChatSummariesStream,
  openThreadStream,
  patchMessage,
  setTyping,
  uploadChatImage,
  waitChatSummaries,
  waitThread,
} from './api';
import {
  buildReplyFromMessage,
  getPeerDirection,
  isOutgoing,
  makeChatMessageId,
  mergeMessages,
  nowIso,
} from './helpers';
import type { ChatClientSummary, ChatMessage, ChatReply, ChatTypingState, ChatWaitResult } from './types';

type ImageFile = {
  name: string;
  type: string;
  uri: string;
};

export function useAdminChat(token: string) {
  const [clients, setClients] = useState<ChatClientSummary[]>([]);
  const [activeClient, setActiveClient] = useState<ChatClientSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [typing, setTypingState] = useState<ChatTypingState | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [typingUpdatedAt, setTypingUpdatedAt] = useState('');
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState('');
  const activeClientId = String(activeClient?.client_id || activeClient?.id || '');
  const stoppedRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedAtRef = useRef('');
  const typingUpdatedAtRef = useRef('');

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const rows = await fetchChatClients(token, 40, 0);
      setClients(rows || []);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoadingClients(false);
    }
  }, [token]);

  const loadThread = useCallback(async (clientId = activeClientId, opts?: { append?: boolean; beforeId?: number | null }) => {
    if (!clientId) return;
    setLoadingThread(!opts?.append);
    try {
      const page = await fetchThread(token, clientId, opts?.beforeId || null);
      const next = Array.isArray(page.messages) ? page.messages : [];
      setMessages((current) => opts?.append ? mergeMessages(next, current) : mergeMessages([], next));
      const nextUpdatedAt = String(page.updated_at || '');
      updatedAtRef.current = nextUpdatedAt;
      setUpdatedAt(nextUpdatedAt);
      setTypingState(page.typing || null);
      const nextTypingUpdatedAt = String(page.typing?.updated_at || '');
      typingUpdatedAtRef.current = nextTypingUpdatedAt;
      setTypingUpdatedAt(nextTypingUpdatedAt);
      setNextBeforeId(page.page?.next_before_id || null);
      setHasMore(page.page?.has_more === true);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoadingThread(false);
    }
  }, [activeClientId, token]);

  const selectClient = useCallback((client: ChatClientSummary) => {
    setActiveClient(client);
    setMessages([]);
    setReplyTo(null);
    setEditing(null);
    setSelectedIds([]);
    void loadThread(String(client.client_id || client.id || ''));
  }, [loadThread]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    stoppedRef.current = false;
    let revision = 0;
    let fallbackStarted = false;
    let source: ReturnType<typeof openChatSummariesStream> | null = null;

    async function runWaitFallback() {
      if (fallbackStarted) return;
      fallbackStarted = true;
      while (!stoppedRef.current) {
        const result = await waitChatSummaries(token, revision).catch(() => null);
        if (stoppedRef.current) return;
        if (result) {
          revision = Number(result.revision || revision);
          if (result.changed) void loadClients();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2400));
        }
      }
    }

    source = openChatSummariesStream(token);
    source.addEventListener('summaries', (event) => {
      if (!event.data) return;
      try {
        const result = JSON.parse(event.data) as { changed?: boolean; revision?: number };
        revision = Number(result.revision || revision);
        if (result.changed) void loadClients();
      } catch {}
    });
    source.addEventListener('error', () => {
      source?.close();
      void runWaitFallback();
    });

    return () => {
      stoppedRef.current = true;
      source?.close();
    };
  }, [loadClients, token]);

  useEffect(() => {
    if (!activeClientId) return;
    let stopped = false;
    let fallbackStarted = false;
    let source: ReturnType<typeof openThreadStream> | null = null;

    const applyThreadSignal = async (result: ChatWaitResult | null) => {
      if (!result || stopped) return;
      if (result.typing) {
        const nextTypingUpdatedAt = String(result.typing.updated_at || '');
        typingUpdatedAtRef.current = nextTypingUpdatedAt;
        setTypingState(result.typing);
        setTypingUpdatedAt(nextTypingUpdatedAt);
      }
      if (Array.isArray(result.read_message_ids) && result.read_message_ids.length) {
        const readAt = String(result.read_at || nowIso());
        setMessages((current) => current.map((message) =>
          result.read_message_ids?.includes(message.id)
            ? { ...message, read: true, deliveryStatus: 'read', readAt }
            : message
        ));
      }
      if (result.changed || result.message_changed) await loadThread(activeClientId);
    };

    async function runWaitFallback() {
      if (fallbackStarted) return;
      fallbackStarted = true;
      while (!stopped) {
        const result = await waitThread(token, activeClientId, updatedAtRef.current, typingUpdatedAtRef.current).catch(() => null);
        if (stopped) return;
        await applyThreadSignal(result);
        if (!result) await new Promise((resolve) => setTimeout(resolve, 2200));
      }
    }

    source = openThreadStream(token, activeClientId);
    source.addEventListener('thread', (event) => {
      if (!event.data) return;
      try {
        void applyThreadSignal(JSON.parse(event.data) as ChatWaitResult);
      } catch {}
    });
    source.addEventListener('error', () => {
      source?.close();
      void runWaitFallback();
    });

    return () => {
      stopped = true;
      source?.close();
    };
  }, [activeClientId, loadThread, token]);

  useEffect(() => {
    if (!activeClientId || !messages.length) return;
    const ids = messages.filter((message) => message.direction === getPeerDirection() && message.read !== true).map((message) => message.id);
    if (!ids.length) return;
    setMessages((current) => current.map((message) => ids.includes(message.id) ? { ...message, read: true, deliveryStatus: 'read' } : message));
    void markMessagesRead(token, activeClientId, ids).catch(() => undefined);
  }, [activeClientId, messages, token]);

  const sendMessage = useCallback(async (text: string, attachment?: ChatMessage['attachment']) => {
    if (!activeClientId) return;
    const body = text.trim();
    if (!body && !attachment) return;
    const message: ChatMessage = {
      id: makeChatMessageId(),
      direction: 'out',
      text: body,
      createdAt: nowIso(),
      deliveryStatus: 'sent',
      read: false,
      replyTo,
      attachment: attachment || null,
      localPending: true,
    };
    setMessages((current) => mergeMessages(current, [message]));
    setReplyTo(null);
    try {
      const saved = await createMessage(token, activeClientId, message);
      setMessages((current) => mergeMessages(current.filter((item) => item.id !== message.id), [saved.message || message]));
      const nextUpdatedAt = String(saved.updated_at || message.createdAt);
      updatedAtRef.current = nextUpdatedAt;
      setUpdatedAt(nextUpdatedAt);
      void loadClients();
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, localPending: false, localFailed: true } : item));
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [activeClientId, loadClients, replyTo, token]);

  const saveEdit = useCallback(async (text: string) => {
    if (!activeClientId || !editing) return;
    const editedAt = nowIso();
    setMessages((current) => current.map((message) => message.id === editing.id ? { ...message, text, editedAt } : message));
    setEditing(null);
    await patchMessage(token, activeClientId, editing.id, { text, editedAt })
      .then((result) => result.message && setMessages((current) => mergeMessages(current.filter((message) => message.id !== editing.id), [result.message])))
      .catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [activeClientId, editing, token]);

  const reactToMessage = useCallback(async (message: ChatMessage, reaction: string) => {
    if (!activeClientId) return;
    const current = message.reactions?.out || '';
    const next = current === reaction ? '' : reaction;
    const reactions = { ...(message.reactions || {}), out: next };
    setMessages((rows) => rows.map((item) => item.id === message.id ? { ...item, reactions, reaction: next || item.reaction || '' } : item));
    await patchMessage(token, activeClientId, message.id, { reactions, reaction: next })
      .then((result) => result.message && setMessages((rows) => mergeMessages(rows.filter((item) => item.id !== message.id), [result.message])))
      .catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [activeClientId, token]);

  const removeMessage = useCallback(async (message: ChatMessage) => {
    if (!activeClientId) return;
    setMessages((current) => current.filter((item) => item.id !== message.id));
    await deleteMessage(token, activeClientId, message.id).catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [activeClientId, token]);

  const sendTyping = useCallback((text: string) => {
    if (!activeClientId) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    void setTyping(token, activeClientId, true, text ? 'печатает' : '').catch(() => undefined);
    typingTimerRef.current = setTimeout(() => {
      void setTyping(token, activeClientId, false).catch(() => undefined);
    }, 2600);
  }, [activeClientId, token]);

  const uploadAndSendImages = useCallback(async (files: ImageFile[], caption: string) => {
    if (!activeClientId) return;
    for (let index = 0; index < files.length; index += 1) {
      const uploaded = await uploadChatImage(token, activeClientId, files[index]);
      await sendMessage(index === 0 ? caption : '', uploaded.attachment);
    }
  }, [activeClientId, sendMessage, token]);

  const deleteSelected = useCallback(async () => {
    const selected = messages.filter((message) => selectedIds.includes(message.id));
    setSelectedIds([]);
    for (const message of selected) await removeMessage(message);
  }, [messages, removeMessage, selectedIds]);

  const toggleSelected = useCallback((message: ChatMessage) => {
    setSelectedIds((current) => current.includes(message.id) ? current.filter((id) => id !== message.id) : [...current, message.id]);
  }, []);

  return {
    activeClient,
    activeClientId,
    clients,
    deleteSelected,
    editing,
    error,
    hasMore,
    loadingClients,
    loadingThread,
    messages,
    reactToMessage,
    refreshClients: loadClients,
    refreshThread: () => loadThread(activeClientId),
    removeMessage,
    replyTo,
    saveEdit,
    selectClient,
    selectedIds,
    sendMessage,
    sendTyping,
    setEditing,
    setError,
    setReplyFromMessage: (message: ChatMessage) => setReplyTo(buildReplyFromMessage(message)),
    setReplyTo,
    setSelectedIds,
    toggleSelected,
    typing,
    uploadAndSendImages,
    loadMore: () => hasMore && nextBeforeId ? loadThread(activeClientId, { append: true, beforeId: nextBeforeId }) : Promise.resolve(),
    canEdit: (message: ChatMessage) => isOutgoing(message),
  };
}
