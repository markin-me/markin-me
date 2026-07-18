import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createMessage,
  deleteMessage,
  fetchChatSettings,
  fetchOrdersByPhone,
  fetchThread,
  fetchThreadDiff,
  markMessagesRead,
  mergeThreads,
  openThreadStream,
  patchMessage,
  patchThreadMeta,
  setTyping,
  uploadChatImage,
  waitThread,
} from './api';
import {
  buildOrderCardFromCustomerOrder,
  buildReplyFromMessageResolved,
  buildWhereIsOrderText,
  getAssistantName,
  getPeerDirection,
  getQuickQuestionReply,
  getQuickQuestions,
  getWelcomeMessage,
  isChatEnabled,
  isWelcomeEnabled,
  isOutgoing,
  looksLikePhone,
  makeChatMessageId,
  mergeMessages,
  normalizeChatText,
  nowIso,
  todayKey,
} from './helpers';
import {
  clearGuestChatClientId,
  readChatThreadCacheSync,
  readChatThreadCache,
  readLastChatProfileSync,
  readLastChatSettingsSync,
  readStoredGuestChatClientId,
  resolveUserChatProfile,
  saveLastCustomerChatClientId,
  saveChatThreadCache,
} from './storage';
import type {
  ChatActor,
  ChatAttachment,
  ChatMessage,
  ChatProfile,
  ChatReply,
  ChatSettings,
  ChatTypingState,
  ChatWaitResult,
} from './types';
import { fetchCustomerOrders, subscribeCustomerPassport } from '../../shared/api';

type SendOptions = {
  attachment?: ChatAttachment | null;
  orderCards?: ChatMessage['orderCards'];
  replyTo?: ChatReply | null;
};

type LoadThreadOptions = {
  append?: boolean;
  beforeId?: number | null;
  silent?: boolean;
};

type LoadThreadChangesOptions = {
  forceFullOnEmpty?: boolean;
  silent?: boolean;
};

type ImageFile = {
  uri: string;
  name: string;
  type: string;
};

type UseChatThreadOptions = {
  actor: ChatActor;
  clientId?: string;
  customerToken?: string;
  initialProfile?: Partial<ChatProfile>;
  enabled?: boolean;
};

export function useChatThread(options: UseChatThreadOptions) {
  const actor = options.actor;
  const initialProfile = actor === 'in'
    ? readLastChatProfileSync()
    : {
      clientId: String(options.clientId || ''),
      customerToken: String(options.customerToken || ''),
      name: String(options.initialProfile?.name || 'Клиент'),
      phone: String(options.initialProfile?.phone || ''),
      isGuest: false,
    };
  const initialClientId = initialProfile?.clientId || options.clientId || '';
  const initialCache = initialClientId ? readChatThreadCacheSync(initialClientId) : null;
  const [profile, setProfile] = useState<ChatProfile | null>(initialProfile);
  const [settings, setSettings] = useState<ChatSettings | null>(readLastChatSettingsSync());
  const [messages, setMessages] = useState<ChatMessage[]>(initialCache?.messages || []);
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [typing, setTypingState] = useState<ChatTypingState | null>(initialCache?.typing || null);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(initialCache?.nextBeforeId ?? null);
  const [hasMore, setHasMore] = useState(initialCache?.hasMore === true);
  const [loading, setLoading] = useState(!initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bootstrapComplete, setBootstrapComplete] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingActiveRef = useRef(false);
  const lastTypingSentAtRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingReactionsRef = useRef<Record<string, { actor: ChatActor; reaction: string }>>({});
  const profileRef = useRef<ChatProfile | null>(null);
  const clientIdRef = useRef('');
  const typingSignatureRef = useRef('');
  const updatedAtRef = useRef('');
  const typingUpdatedAtRef = useRef('');
  const messagesCountRef = useRef(0);
  const signalPullRef = useRef<Promise<void> | null>(null);
  const signalPullPendingRef = useRef(false);
  const cacheHydratedRef = useRef(Boolean(initialCache));
  const cacheSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientId = profile?.clientId || options.clientId || '';
  const customerToken = options.customerToken ?? profile?.customerToken ?? '';
  const enabled = options.enabled !== false && !!clientId;
  const chatEnabled = settings ? isChatEnabled(settings) : true;

  const requestParams = useMemo(() => ({
    actor,
    customerToken,
  }), [actor, customerToken]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  const applyPendingReactionOverrides = useCallback((items: ChatMessage[]) => {
    const pending = pendingReactionsRef.current;
    if (!items.length || !Object.keys(pending).length) return items;
    return items.map((message) => {
      const override = pending[message.id];
      if (!override) return message;
      const remoteReaction = String(message.reactions?.[override.actor] || '');
      if (remoteReaction === override.reaction) {
        delete pending[message.id];
        return message;
      }
      const reactions = { ...(message.reactions || {}), [override.actor]: override.reaction };
      return {
        ...message,
        reaction: String(reactions[message.direction] || ''),
        reactions,
      };
    });
  }, []);

  const clearPendingReactionIfSynced = useCallback((message?: ChatMessage | null) => {
    if (!message?.id) return;
    const pending = pendingReactionsRef.current[message.id];
    if (!pending) return;
    const syncedReaction = String(message.reactions?.[pending.actor] || '');
    if (syncedReaction === pending.reaction) delete pendingReactionsRef.current[message.id];
  }, []);

  const applyTypingState = useCallback((nextTyping: ChatTypingState | null | undefined) => {
    const active = nextTyping?.active === true;
    const text = String(nextTyping?.text || '');
    const updatedAt = String(nextTyping?.updated_at || '');
    const expiresAt = String(nextTyping?.expires_at || '');
    const signature = `${active ? '1' : '0'}|${text}|${updatedAt}|${expiresAt}`;
    if (typingSignatureRef.current === signature) return;
    typingSignatureRef.current = signature;
    setTypingState(nextTyping || null);
  }, []);

  const resetThreadState = useCallback(() => {
    updatedAtRef.current = '';
    typingUpdatedAtRef.current = '';
    typingSignatureRef.current = '';
    pendingReactionsRef.current = {};
    localTypingActiveRef.current = false;
    lastTypingSentAtRef.current = 0;
    signalPullRef.current = null;
    signalPullPendingRef.current = false;
    setMessages([]);
    setReplyTo(null);
    setEditing(null);
    setTypingState(null);
    setNextBeforeId(null);
    setHasMore(false);
    setSelectedIds([]);
    setLoading(true);
    setLoadingMore(false);
    cacheHydratedRef.current = false;
  }, []);

  const hydrateThreadCache = useCallback(async (targetClientId: string) => {
    const cache = await readChatThreadCache(targetClientId).catch(() => null);
    if (!cache || !mountedRef.current) return false;
    clientIdRef.current = targetClientId;
    updatedAtRef.current = String(cache.updatedAt || '');
    typingUpdatedAtRef.current = String(cache.typing?.updated_at || '');
    applyTypingState(cache.typing || null);
    setMessages(applyPendingReactionOverrides(Array.isArray(cache.messages) ? cache.messages : []));
    setNextBeforeId(Number.isFinite(Number(cache.nextBeforeId)) ? Number(cache.nextBeforeId) : null);
    setHasMore(cache.hasMore === true);
    cacheHydratedRef.current = true;
    return true;
  }, [applyPendingReactionOverrides, applyTypingState]);

  const hydrateThreadCacheSync = useCallback((targetClientId: string) => {
    const cache = readChatThreadCacheSync(targetClientId);
    if (!cache || !mountedRef.current) return false;
    clientIdRef.current = targetClientId;
    updatedAtRef.current = String(cache.updatedAt || '');
    typingUpdatedAtRef.current = String(cache.typing?.updated_at || '');
    applyTypingState(cache.typing || null);
    setMessages(applyPendingReactionOverrides(Array.isArray(cache.messages) ? cache.messages : []));
    setNextBeforeId(Number.isFinite(Number(cache.nextBeforeId)) ? Number(cache.nextBeforeId) : null);
    setHasMore(cache.hasMore === true);
    cacheHydratedRef.current = true;
    return true;
  }, [applyPendingReactionOverrides, applyTypingState]);

  const syncProfile = useCallback(async (resolvedProfile?: ChatProfile | null) => {
    const nextProfile = resolvedProfile || (
      actor === 'in'
        ? await resolveUserChatProfile()
        : {
          clientId: String(options.clientId || ''),
          customerToken: String(options.customerToken || ''),
          name: String(options.initialProfile?.name || 'РљР»РёРµРЅС‚'),
          phone: String(options.initialProfile?.phone || ''),
          isGuest: false,
        }
    );
    if (!nextProfile) return null;

    if (actor === 'in' && !nextProfile.isGuest) {
      const guestId = await readStoredGuestChatClientId();
      if (guestId && guestId !== nextProfile.clientId) {
        await mergeThreads(guestId, nextProfile.clientId, actor);
        await clearGuestChatClientId(guestId);
      }
      await saveLastCustomerChatClientId(nextProfile.clientId).catch(() => undefined);
    }

    if (!mountedRef.current) return nextProfile;

    const previous = profileRef.current;
    const changed = !previous
      || previous.clientId !== nextProfile.clientId
      || previous.customerToken !== nextProfile.customerToken
      || previous.isGuest !== nextProfile.isGuest
      || previous.name !== nextProfile.name
      || previous.phone !== nextProfile.phone;
    const threadChanged = !previous
      || previous.clientId !== nextProfile.clientId
      || previous.customerToken !== nextProfile.customerToken
      || previous.isGuest !== nextProfile.isGuest;

    if (threadChanged) {
      clientIdRef.current = nextProfile.clientId;
      const restored = hydrateThreadCacheSync(nextProfile.clientId);
      if (!restored) {
        resetThreadState();
        await hydrateThreadCache(nextProfile.clientId);
      }
    }
    if (changed) setProfile(nextProfile);
    return nextProfile;
  }, [
    actor,
    options.clientId,
    options.customerToken,
    options.initialProfile?.name,
    options.initialProfile?.phone,
    hydrateThreadCache,
    hydrateThreadCacheSync,
    resetThreadState,
  ]);

  const loadThread = useCallback(async (opts?: LoadThreadOptions) => {
    if (!clientId) return;
    const requestedClientId = clientId;
    const silent = opts?.silent === true;
    if (opts?.append) setLoadingMore(true);
    else if (!silent) setLoading(true);
    setError('');
    try {
      const page = await fetchThread(clientId, {
        ...requestParams,
        beforeId: opts?.beforeId || null,
        limit: 40,
      });
      if (!mountedRef.current || clientIdRef.current !== requestedClientId) return;
      const nextMessages = applyPendingReactionOverrides(Array.isArray(page.messages) ? page.messages : []);
      setMessages((current) => opts?.append ? mergeMessages(nextMessages, current) : mergeMessages([], nextMessages));
      const nextUpdatedAt = String(page.updated_at || '');
      updatedAtRef.current = nextUpdatedAt;
      setNextBeforeId(page.page?.next_before_id || null);
      setHasMore(page.page?.has_more === true);
      if (page.typing) {
        const nextTypingUpdatedAt = String(page.typing.updated_at || '');
        typingUpdatedAtRef.current = nextTypingUpdatedAt;
        applyTypingState(page.typing);
      }
    } catch (err) {
      if (mountedRef.current && clientIdRef.current === requestedClientId) setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (!mountedRef.current || clientIdRef.current !== requestedClientId) return;
      if (opts?.append) setLoadingMore(false);
      else if (!silent) setLoading(false);
    }
  }, [applyPendingReactionOverrides, applyTypingState, clientId, requestParams]);

  const loadThreadChanges = useCallback(async (since: string, opts?: LoadThreadChangesOptions) => {
    if (!clientId || !since) {
      await loadThread({ silent: opts?.silent });
      return;
    }
    const requestedClientId = clientId;
    try {
      const diff = await fetchThreadDiff(clientId, {
        ...requestParams,
        since,
      });
      if (!mountedRef.current || clientIdRef.current !== requestedClientId) return;

      const expectedCount = Number(diff.message_count);
      if (Number.isFinite(expectedCount) && expectedCount >= 0 && expectedCount < messagesCountRef.current) {
        await loadThread({ silent: opts?.silent });
        return;
      }

      const changedMessages = applyPendingReactionOverrides(Array.isArray(diff.messages) ? diff.messages : []);
      const nextUpdatedAt = String(diff.updated_at || '');
      if (!changedMessages.length) {
        if (opts?.forceFullOnEmpty) {
          await loadThread({ silent: opts?.silent });
          return;
        }
        if (nextUpdatedAt) updatedAtRef.current = nextUpdatedAt;
        return;
      }
      if (nextUpdatedAt) updatedAtRef.current = nextUpdatedAt;

      setMessages((current) => {
        const byId = new Map(changedMessages.map((message) => [message.id, message]));
        let changed = false;
        const next = current.map((message) => {
          const patch = byId.get(message.id);
          if (!patch) return message;
          changed = true;
          byId.delete(message.id);
          return { ...message, ...patch, localFailed: false, localPending: false };
        });
        const additions = Array.from(byId.values());
        if (!changed && !additions.length) return current;
        return additions.length ? mergeMessages(next, additions) : next;
      });
    } catch {
      await loadThread({ silent: opts?.silent });
    }
  }, [applyPendingReactionOverrides, clientId, loadThread, requestParams]);

  const markRead = useCallback(async (items: ChatMessage[]) => {
    if (!clientId) return;
    const ids = items
      .filter((message) => message.direction === getPeerDirection(actor) && message.read !== true)
      .map((message) => message.id);
    if (!ids.length) return;
    setMessages((current) => current.map((message) => ids.includes(message.id) ? { ...message, read: true, deliveryStatus: 'read', readAt: message.readAt || nowIso() } : message));
    await markMessagesRead(clientId, ids, requestParams).catch(() => undefined);
  }, [actor, clientId, requestParams]);

  const refresh = useCallback(async () => {
    await loadThread();
  }, [loadThread]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [nextSettings, nextProfile] = await Promise.all([
          fetchChatSettings().catch(() => null),
          actor === 'in'
            ? resolveUserChatProfile()
            : Promise.resolve({
              clientId: String(options.clientId || ''),
              customerToken: String(options.customerToken || ''),
              name: String(options.initialProfile?.name || 'Клиент'),
              phone: String(options.initialProfile?.phone || ''),
              isGuest: false,
            }),
        ]);
        if (cancelled) return;
        setSettings(nextSettings);
        await syncProfile(nextProfile);
      } catch (err) {
        if (!cancelled) setError(String(err instanceof Error ? err.message : err));
      } finally {
        if (!cancelled) {
          setBootstrapComplete(true);
          setLoading(false);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [actor, options.clientId, options.customerToken, options.initialProfile?.name, options.initialProfile?.phone, syncProfile]);

  useEffect(() => {
    if (actor !== 'in') return undefined;
    return subscribeCustomerPassport(() => {
      void syncProfile();
    });
  }, [actor, syncProfile]);

  useEffect(() => {
    if (!bootstrapComplete || !enabled || !isChatEnabled(settings)) return;
    if (cacheHydratedRef.current) return;
    void loadThread({ silent: cacheHydratedRef.current });
  }, [bootstrapComplete, enabled, loadThread, settings]);

  useEffect(() => {
    if (!enabled || !isChatEnabled(settings)) return;
    let stopped = false;
    let fallbackStarted = false;
    let source: ReturnType<typeof openThreadStream> | null = null;

    const applyThreadSignal = async (result: ChatWaitResult) => {
      if (stopped || !mountedRef.current) return;
      if (result.typing) {
        const nextTypingUpdatedAt = String(result.typing.updated_at || '');
        typingUpdatedAtRef.current = nextTypingUpdatedAt;
        applyTypingState(result.typing);
      }
      if (Array.isArray(result.read_message_ids) && result.read_message_ids.length) {
        const readAt = String(result.read_at || nowIso());
        setMessages((current) => current.map((message) =>
          result.read_message_ids?.includes(message.id)
            ? { ...message, read: true, deliveryStatus: 'read', readAt }
            : message
        ));
      }
      const signalUpdatedAt = String(result.updated_at || '');
      const knownUpdatedAt = String(updatedAtRef.current || '');
      if (signalUpdatedAt && !knownUpdatedAt && result.changed !== true) {
        updatedAtRef.current = signalUpdatedAt;
      }
      const shouldReloadThread = (
        result.message_changed === true
        || (result.changed === true && result.typing_changed !== true)
      );
      if (shouldReloadThread) {
        if (signalPullRef.current) {
          signalPullPendingRef.current = true;
          return;
        }
        signalPullRef.current = (async () => {
          let since = knownUpdatedAt;
          do {
            signalPullPendingRef.current = false;
            await loadThreadChanges(since, { forceFullOnEmpty: true, silent: true });
            since = String(updatedAtRef.current || '');
          } while (signalPullPendingRef.current && !stopped && mountedRef.current);
        })().finally(() => {
          signalPullRef.current = null;
        });
        await signalPullRef.current;
      }
    };

    async function runWaitFallback() {
      if (fallbackStarted) return;
      fallbackStarted = true;
      while (!stopped) {
        try {
          const result = await waitThread(clientId, {
            ...requestParams,
            since: updatedAtRef.current,
            typingSince: typingUpdatedAtRef.current,
            timeoutMs: 20000,
          });
          await applyThreadSignal(result);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 2200));
        }
      }
    }

    source = openThreadStream(clientId, requestParams);
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
  }, [applyTypingState, clientId, enabled, loadThreadChanges, requestParams, settings]);

  useEffect(() => {
    if (!messages.length) return;
    void markRead(messages);
  }, [markRead, messages]);

  useEffect(() => {
    if (!enabled || !clientId || loading || !isChatEnabled(settings)) return undefined;
    if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
    cacheSaveTimerRef.current = setTimeout(() => {
      void saveChatThreadCache({
        actor,
        clientId,
        hasMore,
        messages,
        meta: profile ? { name: profile.name, phone: profile.phone } : null,
        nextBeforeId,
        typing,
        updatedAt: updatedAtRef.current || '',
      }).catch(() => undefined);
    }, 350);
    return () => {
      if (!cacheSaveTimerRef.current) return;
      clearTimeout(cacheSaveTimerRef.current);
      cacheSaveTimerRef.current = null;
    };
  }, [actor, clientId, enabled, hasMore, loading, messages, nextBeforeId, profile, settings, typing]);

  const sendMessage = useCallback(async (text: string, sendOptions: SendOptions = {}) => {
    if (!clientId) return null;
    const body = normalizeChatText(text, 5000).trim();
    if (!body && !sendOptions.attachment && !sendOptions.orderCards?.length) return null;
    const createdAt = nowIso();
    const message: ChatMessage = {
      id: makeChatMessageId(actor),
      direction: actor,
      text: body,
      createdAt,
      read: false,
      deliveryStatus: 'sent',
      replyTo: sendOptions.replyTo || replyTo || null,
      attachment: sendOptions.attachment || null,
      orderCards: sendOptions.orderCards || [],
      localPending: true,
    };
    setMessages((current) => mergeMessages(current, [message]));
    setReplyTo(null);
    try {
      const saved = await createMessage(clientId, message, {
        ...requestParams,
        meta: profile ? { name: profile.name, phone: profile.phone } : {},
      });
      const next = saved.message || { ...message, localPending: false };
      setMessages((current) => mergeMessages(current.filter((item) => item.id !== message.id), [next]));
      const nextUpdatedAt = String(saved.updated_at || next.createdAt || createdAt);
      updatedAtRef.current = nextUpdatedAt;
      return next;
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, localPending: false, localFailed: true } : item));
      setError(String(err instanceof Error ? err.message : err));
      return null;
    }
  }, [actor, clientId, profile, replyTo, requestParams]);

  const sendAutoReply = useCallback(async (text: string, sendOptions: SendOptions = {}) => {
    if (!clientId) return null;
    const body = normalizeChatText(text, 5000).trim();
    if (!body && !sendOptions.orderCards?.length) return null;
    const createdAt = nowIso();
    const message: ChatMessage = {
      id: makeChatMessageId('assistant-auto'),
      direction: getPeerDirection(actor),
      text: body,
      createdAt,
      read: true,
      deliveryStatus: 'read',
      replyTo: sendOptions.replyTo || null,
      attachment: sendOptions.attachment || null,
      orderCards: sendOptions.orderCards || [],
      localPending: true,
    };
    setMessages((current) => mergeMessages(current, [message]));
    try {
      const saved = await createMessage(clientId, message, {
        ...requestParams,
        meta: profile ? { name: profile.name, phone: profile.phone } : {},
      });
      const next = saved.message || { ...message, localPending: false };
      setMessages((current) => mergeMessages(current.filter((item) => item.id !== message.id), [next]));
      const nextUpdatedAt = String(saved.updated_at || next.createdAt || createdAt);
      updatedAtRef.current = nextUpdatedAt;
      return next;
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, localPending: false, localFailed: true } : item));
      setError(String(err instanceof Error ? err.message : err));
      return null;
    }
  }, [actor, clientId, profile, requestParams]);

  const answerOrdersByPhone = useCallback(async (phoneText: string) => {
    if (actor !== 'in' || !profile?.isGuest || !looksLikePhone(phoneText)) return false;
    try {
      const orders = await fetchOrdersByPhone(phoneText);
      const cards = (orders || []).map((order) => buildOrderCardFromCustomerOrder(order));
      await sendAutoReply(buildWhereIsOrderText(cards), { orderCards: cards, replyTo: null });
      return true;
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      return false;
    }
  }, [actor, profile?.isGuest, sendAutoReply]);

  const saveEdit = useCallback(async (text: string) => {
    if (!clientId || !editing) return;
    const nextText = normalizeChatText(text, 5000).trim();
    if (!nextText) return;
    const editedAt = nowIso();
    setMessages((current) => current.map((message) => message.id === editing.id ? { ...message, text: nextText, editedAt } : message));
    setEditing(null);
    await patchMessage(clientId, editing.id, { text: nextText, editedAt }, requestParams)
      .then((result) => {
        if (result.message) setMessages((current) => mergeMessages(current.filter((message) => message.id !== editing.id), [result.message]));
      })
      .catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [clientId, editing, requestParams]);

  const reactToMessage = useCallback(async (message: ChatMessage, reaction: string) => {
    if (!clientId) return;
    const currentReaction = message.reactions?.[actor] || '';
    const nextReaction = currentReaction === reaction ? '' : reaction;
    const reactions = { ...(message.reactions || {}), [actor]: nextReaction };
    pendingReactionsRef.current[message.id] = { actor, reaction: nextReaction };
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactions, reaction: String(reactions[item.direction] || '') } : item));
    await patchMessage(clientId, message.id, { reactions, reaction: nextReaction }, requestParams)
      .then((result) => {
        const nextUpdatedAt = String(result.updated_at || '');
        if (nextUpdatedAt) updatedAtRef.current = nextUpdatedAt;
        if (result.message) {
          clearPendingReactionIfSynced(result.message);
          setMessages((current) => current.map((item) => {
            if (item.id !== message.id) return item;
            const serverReactions = result.message?.reactions || reactions;
            const serverReaction = String(serverReactions[item.direction] || result.message?.reaction || '');
            const currentReaction = String(item.reaction || '');
            const sameActorReaction = String(item.reactions?.[actor] || '') === String(serverReactions?.[actor] || '');
            const sameLegacyReaction = currentReaction === serverReaction;
            if (sameActorReaction && sameLegacyReaction) return item;
            return {
              ...item,
              reaction: serverReaction,
              reactions: serverReactions,
              localFailed: false,
              localPending: false,
            };
          }));
        }
      })
      .catch((err) => {
        delete pendingReactionsRef.current[message.id];
        setMessages((current) => current.map((item) => item.id === message.id ? message : item));
        setError(String(err instanceof Error ? err.message : err));
      });
  }, [actor, clearPendingReactionIfSynced, clientId, requestParams]);

  const removeMessage = useCallback(async (message: ChatMessage, options?: { deleteForPeer?: boolean }) => {
    if (!clientId) return;
    setMessages((current) => current.filter((item) => item.id !== message.id));
    const own = isOutgoing(message, actor);
    const shouldDeleteForPeer = actor === 'in' && own && options?.deleteForPeer === true;
    const request = shouldDeleteForPeer || (actor !== 'in' && own)
      ? deleteMessage(clientId, message.id, requestParams)
      : patchMessage(clientId, message.id, { hidden: true }, requestParams);
    await request.catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [actor, clientId, requestParams]);

  const deleteSelected = useCallback(async (options?: { deleteForPeer?: boolean }) => {
    const ids = selectedIds.slice();
    const selected = messages.filter((message) => ids.includes(message.id));
    setSelectedIds([]);
    for (const message of selected) {
      await removeMessage(message, options);
    }
  }, [messages, removeMessage, selectedIds]);

  const toggleSelected = useCallback((message: ChatMessage) => {
    setSelectedIds((current) => current.includes(message.id)
      ? current.filter((id) => id !== message.id)
      : [...current, message.id]
    );
  }, []);

  const sendTyping = useCallback((text: string) => {
    if (!clientId) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    const hasText = text.trim().length > 0;
    if (!hasText) {
      if (localTypingActiveRef.current) {
        localTypingActiveRef.current = false;
        lastTypingSentAtRef.current = 0;
        void setTyping(clientId, false, requestParams).catch(() => undefined);
      }
      return;
    }
    const now = Date.now();
    if (!localTypingActiveRef.current || now - lastTypingSentAtRef.current > 1800) {
      localTypingActiveRef.current = true;
      lastTypingSentAtRef.current = now;
      void setTyping(clientId, true, { ...requestParams, text: 'печатает' }).catch(() => undefined);
    }
    typingTimerRef.current = setTimeout(() => {
      localTypingActiveRef.current = false;
      lastTypingSentAtRef.current = 0;
      void setTyping(clientId, false, requestParams).catch(() => undefined);
    }, 2600);
  }, [clientId, requestParams]);

  const uploadAndSendImages = useCallback(async (files: ImageFile[], caption: string) => {
    if (!clientId) return;
    for (let index = 0; index < files.length; index += 1) {
      const uploaded = await uploadChatImage(clientId, files[index], requestParams);
      await sendMessage(index === 0 ? caption : '', {
        attachment: uploaded.attachment,
        replyTo: index === 0 ? replyTo : null,
      });
    }
    setReplyTo(null);
  }, [clientId, replyTo, requestParams, sendMessage]);

  const ensureDailyWelcome = useCallback(async () => {
    if (!clientId || actor !== 'in' || !isChatEnabled(settings) || !isWelcomeEnabled(settings)) return;
    const welcomeMessage = getWelcomeMessage(settings);
    const existingMetaDay = messages.find((message) => message.direction === 'out' && message.text.includes(welcomeMessage));
    if (existingMetaDay) return;
    const day = todayKey();
    await patchThreadMeta(clientId, { last_welcome_day: day }, requestParams).catch(() => undefined);
    if (!messages.length) await sendAutoReply(welcomeMessage, { replyTo: null });
  }, [actor, clientId, messages.length, requestParams, sendAutoReply, settings]);

  useEffect(() => {
    void ensureDailyWelcome();
  }, [ensureDailyWelcome]);

  const answerWhereIsOrder = useCallback(async () => {
    if (!profile?.customerToken) {
      await sendMessage('Где мой заказ?');
      const operatorName = getAssistantName(settings);
      await sendAutoReply(`Напишите номер телефона, и ${operatorName} проверит заказ.`, { replyTo: null });
      return;
    }
    await sendMessage('Где мой заказ?');
    const payload = await fetchCustomerOrders(profile.customerToken, { limit: 10, offset: 0, statusIsFinal: 0 });
    const cards = (payload.data || []).map((order) => buildOrderCardFromCustomerOrder(order));
    await sendAutoReply(buildWhereIsOrderText(cards), { orderCards: cards, replyTo: null });
  }, [profile?.customerToken, sendAutoReply, sendMessage, settings]);

  const answerQuickQuestion = useCallback(async (question: string) => {
    if (actor !== 'in') return false;
    const answer = getQuickQuestionReply(settings, question);
    if (!answer) return false;
    await sendAutoReply(answer, { replyTo: null });
    return true;
  }, [actor, sendAutoReply, settings]);

  const quickQuestions = useMemo(() => getQuickQuestions(settings), [settings]);

  return {
    actor,
    chatEnabled,
    clientId,
    customerToken,
    editing,
    error,
    hasMore,
    loading,
    loadingMore,
    messages,
    profile,
    quickQuestions,
    replyTo,
    selectedIds,
    settings,
    typing,
    answerQuickQuestion,
    answerWhereIsOrder,
    answerOrdersByPhone,
    clearError: () => setError(''),
    clearReply: () => setReplyTo(null),
    deleteSelected,
    loadMore: () => hasMore && !loadingMore ? loadThread({ append: true, beforeId: nextBeforeId }) : Promise.resolve(),
    reactToMessage,
    refresh,
    removeMessage,
    saveEdit,
    sendMessage,
    sendTyping,
    setEditing,
    setReplyFromMessage: (message: ChatMessage) => setReplyTo(buildReplyFromMessageResolved(message, actor, settings)),
    setReplyTo,
    setSelectedIds,
    toggleSelected,
    uploadAndSendImages,
  };
}
