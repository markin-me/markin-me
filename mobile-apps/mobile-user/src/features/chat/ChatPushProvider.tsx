import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { subscribeCustomerPassport } from '../../shared/api';
import { fetchChatSettings, subscribeChatPush, unsubscribeChatPush } from './api';
import { resolveUserChatProfile, readChatPushToken, saveChatPushEnabled, saveChatPushToken } from './storage';

type ChatPushContextValue = {
  enabled: boolean;
  ready: boolean;
  syncing: boolean;
  error: string;
  setEnabled: (next: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
};

type ChatPushRegistration = {
  clientId: string;
  customerToken: string;
  token: string;
};

type ChatPushProviderProps = PropsWithChildren<{
  onNotificationPress?: (data: Record<string, unknown>) => void;
}>;

const ChatPushContext = createContext<ChatPushContextValue | null>(null);

function getExpoProjectId() {
  return String(
    Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || '',
  ).trim();
}

async function resolveExpoPushToken() {
  if (Platform.OS === 'web') return '';
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    throw new Error('PUSH_PERMISSION_DENIED');
  }

  const projectId = getExpoProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  const token = String(tokenResponse.data || '').trim();
  if (!token) throw new Error('PUSH_TOKEN_EMPTY');
  return token;
}

async function syncAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('chat', {
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 220, 120, 220],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    name: 'Chat',
    sound: 'default',
  });
}

function normalizePushEnabledFlag(value: unknown) {
  if (value === false || value === 0) return false;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric !== 0;
  return true;
}

export function ChatPushProvider({ children, onNotificationPress }: ChatPushProviderProps) {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const enabledRef = useRef(false);
  const syncingRef = useRef(false);
  const serverEnabledRef = useRef(true);
  const registrationRef = useRef<ChatPushRegistration | null>(null);
  const handledNotificationResponseRef = useRef('');

  useEffect(() => {
    let mounted = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldShowAlert: true,
      }),
    });
    void syncAndroidChannel();
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) {
        console.log('[chat-push] notification received', {
          title: notification.request.content.title,
          body: notification.request.content.body,
          data: notification.request.content.data,
        });
      }
    });
    const handleNotificationResponse = (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response) return;
      const responseKey = String(response.notification.request.identifier || '');
      if (responseKey && handledNotificationResponseRef.current === responseKey) return;
      handledNotificationResponseRef.current = responseKey;
      const data = response.notification.request.content.data;
      if (__DEV__) {
        console.log('[chat-push] notification response', {
          data,
        });
      }
      if (data && typeof data === 'object') {
        onNotificationPress?.(data as Record<string, unknown>);
      }
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then(handleNotificationResponse)
      .catch(() => null);
    void (async () => {
      if (__DEV__) {
        console.log('[chat-push] bootstrap start');
      }
      const settings = await fetchChatSettings().catch(() => null);
      if (__DEV__) {
        console.log('[chat-push] settings loaded', {
          clientPushEnabled: settings?.client_push_enabled ?? settings?.chat_client_push_enabled,
        });
      }
      serverEnabledRef.current = normalizePushEnabledFlag(
        settings?.client_push_enabled ?? settings?.chat_client_push_enabled
      );
      if (!mounted) return;
      const nextEnabled = serverEnabledRef.current;
      enabledRef.current = nextEnabled;
      setEnabledState(nextEnabled);
      setReady(true);
      if (nextEnabled) {
        void syncRegistration(true);
      }
    })();
    return () => {
      mounted = false;
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [onNotificationPress]);

  const syncRegistration = useCallback(async (nextEnabled: boolean): Promise<boolean> => {
    if (syncingRef.current) return false;
    syncingRef.current = true;
    setSyncing(true);
    setError('');
    try {
      if (nextEnabled && !serverEnabledRef.current) {
        await saveChatPushEnabled(false).catch(() => null);
        setEnabledState(false);
        enabledRef.current = false;
        setError('CHAT_PUSH_DISABLED');
        return false;
      }
      const profile = await resolveUserChatProfile();
      if (__DEV__) {
        console.log('[chat-push] profile resolved', {
          clientId: profile.clientId,
          isGuest: profile.isGuest,
        });
      }
      const currentToken = await readChatPushToken().catch(() => '');
      if (!nextEnabled) {
        if (currentToken) {
          await unsubscribeChatPush(profile.clientId, { endpoint: currentToken }, {
            actor: 'in',
            customerToken: profile.customerToken || '',
          }).catch(() => null);
        }
        registrationRef.current = null;
        await saveChatPushEnabled(false);
        setEnabledState(false);
        enabledRef.current = false;
        return true;
      }

      if (__DEV__) {
        console.log('[chat-push] requesting expo token');
      }
      const token = await resolveExpoPushToken();
      if (!token) throw new Error('PUSH_TOKEN_EMPTY');
      if (__DEV__) {
        console.log('[chat-push] expo token', token);
      }
      const currentRegistration = registrationRef.current;
      if (
        currentRegistration
        && currentRegistration.clientId === profile.clientId
        && currentRegistration.customerToken === (profile.customerToken || '')
        && currentRegistration.token === token
      ) {
        setEnabledState(true);
        enabledRef.current = true;
        return true;
      }
      if (
        currentRegistration
        && currentRegistration.token === token
        && currentRegistration.clientId !== profile.clientId
      ) {
        await unsubscribeChatPush(currentRegistration.clientId, { endpoint: currentRegistration.token }, {
          actor: 'in',
          customerToken: currentRegistration.customerToken,
        }).catch(() => null);
      }
      if (currentToken && currentToken !== token) {
        await unsubscribeChatPush(profile.clientId, { endpoint: currentToken }, {
          actor: 'in',
          customerToken: profile.customerToken || '',
        }).catch(() => null);
      }
      await subscribeChatPush(profile.clientId, { endpoint: token }, {
        actor: 'in',
        customerToken: profile.customerToken || '',
      });
      registrationRef.current = {
        clientId: profile.clientId,
        customerToken: profile.customerToken || '',
        token,
      };
      await saveChatPushToken(token);
      await saveChatPushEnabled(true);
      if (__DEV__) {
        console.log('[chat-push] subscribed', {
          clientId: profile.clientId,
          actor: 'in',
        });
      }
      setEnabledState(true);
      enabledRef.current = true;
      return true;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError || '');
      setError(message);
      if (__DEV__) {
        console.error('[chat-push] sync failed', message);
      }
      if (nextEnabled) {
        await saveChatPushEnabled(false).catch(() => null);
        enabledRef.current = false;
        setEnabledState(false);
      }
      return false;
    } finally {
      if (__DEV__) {
        console.log('[chat-push] sync finished');
      }
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const settings = await fetchChatSettings().catch(() => null);
    serverEnabledRef.current = normalizePushEnabledFlag(
      settings?.client_push_enabled ?? settings?.chat_client_push_enabled
    );
    const currentEnabled = enabledRef.current;
    await syncRegistration(currentEnabled);
  }, [syncRegistration]);

  useEffect(() => {
    const unsubscribe = subscribeCustomerPassport(() => {
      if (!enabledRef.current) return;
      void syncRegistration(true);
    });
    return unsubscribe;
  }, [syncRegistration]);

  const setEnabled = useCallback(async (next: boolean) => {
    return syncRegistration(next);
  }, [syncRegistration]);

  const value = useMemo<ChatPushContextValue>(() => ({
    enabled,
    error,
    ready,
    refresh,
    setEnabled,
    syncing,
  }), [enabled, error, ready, refresh, setEnabled, syncing]);

  return <ChatPushContext.Provider value={value}>{children}</ChatPushContext.Provider>;
}

export function useChatPushNotifications() {
  const context = useContext(ChatPushContext);
  if (!context) {
    throw new Error('useChatPushNotifications must be used within ChatPushProvider');
  }
  return context;
}
