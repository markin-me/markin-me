import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchImportantMessages, fetchImportantMessagesRevision, fetchUnread, openUnreadStream, waitUnread } from './api';
import {
  countUnreadImportantMessages,
  markImportantMessageRead,
  readImportantMessagesCache,
  resolveUserChatProfile,
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
    let source: ReturnType<typeof openUnreadStream> | null = null;
    async function loop() {
      const profile = await resolveUserChatProfile().catch(() => null);
      const params = {
        actor: 'in' as const,
        clientId: profile?.clientId || '',
        customerToken: profile?.customerToken || '',
      };
      const initial = await fetchUnread(params).catch(() => null);
      if (stoppedRef.current) return;
      if (initial) {
        setChatUnread(Number(initial.total ?? initial.unread_total ?? 0));
        setRevision(Number(initial.revision || 0));
      }

      let currentTotal = Number(initial?.total ?? initial?.unread_total ?? 0);
      let currentRevision = Number(initial?.revision || 0);
      let fallbackStarted = false;

      const runWaitFallback = async () => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        while (!stoppedRef.current) {
          const next = await waitUnread({
            ...params,
            total: currentTotal,
            revision: currentRevision,
            timeoutMs: 20000,
          }).catch(() => null);
          if (stoppedRef.current) return;
          if (next) {
            currentTotal = Number(next.total ?? next.unread_total ?? currentTotal);
            currentRevision = Number(next.revision ?? currentRevision);
            setChatUnread(currentTotal);
            setRevision(currentRevision);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        }
      };

      source = openUnreadStream(params);
      source.addEventListener('unread', (event) => {
        if (stoppedRef.current || !event.data) return;
        try {
          const next = JSON.parse(event.data);
          currentTotal = Number(next.total ?? next.unread_total ?? currentTotal);
          currentRevision = Number(next.revision ?? currentRevision);
          setChatUnread(currentTotal);
          setRevision(currentRevision);
        } catch {}
      });
      source.addEventListener('error', () => {
        source?.close();
        void runWaitFallback();
      });

      while (!stoppedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
      source?.close();
    }
    void loop();
    return () => {
      stoppedRef.current = true;
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
