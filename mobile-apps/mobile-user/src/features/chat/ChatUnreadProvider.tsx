import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchUnread, openUnreadStream, waitUnread } from './api';
import { resolveUserChatProfile } from './storage';
import { subscribeCustomerPassport } from '../../shared/api';

type ChatUnreadContextValue = {
  refreshUnread: () => void;
  totalUnread: number;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  refreshUnread: () => undefined,
  totalUnread: 0,
});

export function ChatUnreadProvider({ children }: PropsWithChildren) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const stoppedRef = useRef(false);

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
        setTotalUnread(Number(initial.total ?? initial.unread_total ?? 0));
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
            setTotalUnread(currentTotal);
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
          setTotalUnread(currentTotal);
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

  const value = useMemo(() => ({
    refreshUnread: () => setReloadKey((key) => key + 1),
    totalUnread,
  }), [totalUnread]);

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
