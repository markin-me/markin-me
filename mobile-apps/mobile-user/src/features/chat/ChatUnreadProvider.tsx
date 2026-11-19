import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchImportantMessages, fetchImportantMessagesRevision, openUnreadStream } from './api';
import {
  countUnreadImportantMessages,
  markImportantMessageRead,
  readChatUnreadCache,
  readImportantMessagesCache,
  resolveUserChatProfile,
  saveChatUnreadCache,
  saveImportantMessagesCache,
} from './storage';
import type { ChatUnreadSnapshot, ImportantMessage } from './types';
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
  const passportRevision = useRef(0);
  const totalUnread = Math.max(0, chatUnread) + Math.max(0, promoUnread);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const identity = passportRevision.current;
    async function loop() {
      const profile = await resolveUserChatProfile().catch(() => null);
      if (cancelled || !profile) return;
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
      const source = await openUnreadStream(params);
      if (cancelled) {
        source.close();
        return;
      }
      stream = source;
      source.addEventListener('unread', event => {
        if (cancelled || identity !== passportRevision.current || !event.data) return;
        const snapshot = JSON.parse(event.data) as ChatUnreadSnapshot;
        const total = Number(snapshot.total ?? snapshot.unread_total ?? 0);
        const revision = Number(snapshot.revision || 0);
        setChatUnread(total);
        setRevision(revision);
        saveChatUnreadCache(params.clientId, total, revision);
      });
      source.addEventListener('error', event => {
        if (cancelled || !('xhrStatus' in event) || ![401, 403].includes(event.xhrStatus)) return;
        source.close();
        setChatUnread(0);
        setRevision(0);
      });
    }
    void loop().catch(error => {
      if (!cancelled) console.warn('CHAT_UNREAD_STREAM_UNAVAILABLE', error);
    });
    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [reloadKey]);

  useEffect(() => subscribeCustomerPassport(() => {
    passportRevision.current += 1;
    setChatUnread(0);
    setRevision(0);
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
