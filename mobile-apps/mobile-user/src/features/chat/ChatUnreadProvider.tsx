import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchImportantMessages, fetchImportantMessagesRevision, fetchUnread, openUnreadStream, waitUnread } from './api';
import {
  countUnreadImportantMessages,
  markImportantMessageRead,
  readChatUnreadCache,
  readImportantMessagesCache,
  resolveUserChatProfile,
  saveChatUnreadCache,
  saveImportantMessagesCache,
} from './storage';
import type { ImportantMessage } from './types';
import { subscribeCustomerPassport } from '../../shared/api';

type ChatUnreadContextValue = {
  chatUnread: number;
  markPromoRead: (item: ImportantMessage | number) => Promise<void>;
  promoCacheRevision: number;
  promoUnread: number;
  refreshPromoUnread: () => void;
  refreshUnread: () => void;
  syncPromoUnreadFromItems: (items: ImportantMessage[]) => Promise<void>;
  totalUnread: number;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  chatUnread: 0,
  markPromoRead: async () => undefined,
  promoCacheRevision: 0,
  promoUnread: 0,
  refreshPromoUnread: () => undefined,
  refreshUnread: () => undefined,
  syncPromoUnreadFromItems: async () => undefined,
  totalUnread: 0,
});

export function ChatUnreadProvider({ children }: PropsWithChildren) {
  const [chatUnread, setChatUnread] = useState(0);
  const [promoUnread, setPromoUnread] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [promoReloadKey, setPromoReloadKey] = useState(0);
  const [promoCacheRevision, setPromoCacheRevision] = useState(0);
  const stoppedRef = useRef(false);
  const totalUnread = Math.max(0, chatUnread) + Math.max(0, promoUnread);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let source: ReturnType<typeof openUnreadStream> | null = null;
    async function loop() {
      const profile = await resolveUserChatProfile().catch(() => null);
      const params = {
        actor: 'in' as const,
        clientId: profile?.clientId || '',
        customerToken: profile?.customerToken || '',
      };
      const cachedUnread = params.clientId
        ? await readChatUnreadCache(params.clientId).catch(() => null)
        : null;
      if (cancelled) return;
      if (cachedUnread) {
        setChatUnread(cachedUnread.total);
        setRevision(cachedUnread.revision);
      } else {
        setChatUnread(0);
        setRevision(0);
      }
      const initial = await fetchUnread(params).catch(() => null);
      if (cancelled) return;
      if (initial) {
        const nextTotal = Number(initial.total ?? initial.unread_total ?? 0);
        const nextRevision = Number(initial.revision || 0);
        setChatUnread(nextTotal);
        setRevision(nextRevision);
        saveChatUnreadCache(params.clientId, nextTotal, nextRevision);
      }

      let currentTotal = Number(initial?.total ?? initial?.unread_total ?? cachedUnread?.total ?? 0);
      let currentRevision = Number(initial?.revision ?? cachedUnread?.revision ?? 0);
      let fallbackStarted = false;

      const runWaitFallback = async () => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        while (!cancelled) {
          const next = await waitUnread({
            ...params,
            total: currentTotal,
            revision: currentRevision,
            timeoutMs: 20000,
          }).catch(() => null);
          if (cancelled) return;
          if (next) {
            currentTotal = Number(next.total ?? next.unread_total ?? currentTotal);
            currentRevision = Number(next.revision ?? currentRevision);
            setChatUnread(currentTotal);
            setRevision(currentRevision);
            saveChatUnreadCache(params.clientId, currentTotal, currentRevision);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        }
      };

      source = openUnreadStream(params);
      source.addEventListener('unread', (event) => {
        if (cancelled || !event.data) return;
        try {
          const next = JSON.parse(event.data);
          currentTotal = Number(next.total ?? next.unread_total ?? currentTotal);
          currentRevision = Number(next.revision ?? currentRevision);
          setChatUnread(currentTotal);
          setRevision(currentRevision);
          saveChatUnreadCache(params.clientId, currentTotal, currentRevision);
        } catch {}
      });
      source.addEventListener('error', () => {
        source?.close();
        void runWaitFallback();
      });

      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
      source?.close();
    }
    void loop();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [reloadKey]);

  useEffect(() => subscribeCustomerPassport(() => {
    setReloadKey((key) => key + 1);
  }), []);

  const syncPromoUnreadFromItems = useMemo(() => async (items: ImportantMessage[]) => {
    const count = await countUnreadImportantMessages(items).catch(() => 0);
    if (!stoppedRef.current) setPromoUnread(count);
  }, []);

  useEffect(() => {
    if (promoReloadKey <= 0) return undefined;
    let cancelled = false;
    const refreshPromoUnread = async () => {
      const cached = await readImportantMessagesCache().catch(() => null);
      const revision = await fetchImportantMessagesRevision().catch(() => null);
      const nextRevision = String(revision?.revision || '');
      const nextCount = Math.max(0, Number(revision?.count || 0));
      if (cached && cached.revision === nextRevision && cached.count === nextCount) {
        return countUnreadImportantMessages(cached.items);
      }
      const items = await fetchImportantMessages();
      const normalizedItems = Array.isArray(items) ? items : [];
      await saveImportantMessagesCache({
        count: nextCount || normalizedItems.length,
        items: normalizedItems,
        revision: nextRevision,
      });
      if (!cancelled && !stoppedRef.current) setPromoCacheRevision((key) => key + 1);
      return countUnreadImportantMessages(normalizedItems);
    };
    const refreshPromoUnreadSafely = () => {
      void refreshPromoUnread()
        .then((count) => {
          if (!cancelled && !stoppedRef.current) setPromoUnread(count);
        })
        .catch(() => undefined);
    };
    refreshPromoUnreadSafely();
    return () => {
      cancelled = true;
    };
  }, [promoReloadKey]);

  const markPromoRead = useMemo(() => async (item: ImportantMessage | number) => {
    await markImportantMessageRead(item);
    setPromoReloadKey((key) => key + 1);
  }, []);

  const refreshPromoUnread = useCallback(() => {
    setPromoReloadKey((key) => key + 1);
  }, []);

  const refreshUnread = useCallback(() => {
    setReloadKey((key) => key + 1);
    setPromoReloadKey((key) => key + 1);
  }, []);

  const value = useMemo(() => ({
    chatUnread,
    markPromoRead,
    promoCacheRevision,
    promoUnread,
    refreshPromoUnread,
    refreshUnread,
    syncPromoUnreadFromItems,
    totalUnread,
  }), [chatUnread, markPromoRead, promoCacheRevision, promoUnread, refreshPromoUnread, refreshUnread, syncPromoUnreadFromItems, totalUnread]);

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
