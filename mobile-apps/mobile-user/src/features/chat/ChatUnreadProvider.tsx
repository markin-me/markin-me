import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchImportantMessages, fetchUnread, openUnreadStream, waitUnread } from './api';
import {
  countUnreadImportantMessages,
  markImportantMessageRead,
  resolveUserChatProfile,
} from './storage';
import type { ImportantMessage } from './types';
import { subscribeCustomerPassport } from '../../shared/api';

type ChatUnreadContextValue = {
  chatUnread: number;
  markPromoRead: (item: ImportantMessage | number) => Promise<void>;
  promoUnread: number;
  refreshUnread: () => void;
  syncPromoUnreadFromItems: (items: ImportantMessage[]) => Promise<void>;
  totalUnread: number;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  chatUnread: 0,
  markPromoRead: async () => undefined,
  promoUnread: 0,
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
    let cancelled = false;
    const refreshPromoUnread = () => {
      void fetchImportantMessages()
        .then((items) => countUnreadImportantMessages(Array.isArray(items) ? items : []))
        .then((count) => {
          if (!cancelled && !stoppedRef.current) setPromoUnread(count);
        })
        .catch(() => undefined);
    };
    refreshPromoUnread();
    const timer = setInterval(refreshPromoUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [promoReloadKey]);

  const markPromoRead = useMemo(() => async (item: ImportantMessage | number) => {
    await markImportantMessageRead(item);
    setPromoReloadKey((key) => key + 1);
  }, []);

  const refreshUnread = useCallback(() => {
    setReloadKey((key) => key + 1);
    setPromoReloadKey((key) => key + 1);
  }, []);

  const value = useMemo(() => ({
    chatUnread,
    markPromoRead,
    promoUnread,
    refreshUnread,
    syncPromoUnreadFromItems,
    totalUnread,
  }), [chatUnread, markPromoRead, promoUnread, refreshUnread, syncPromoUnreadFromItems, totalUnread]);

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
