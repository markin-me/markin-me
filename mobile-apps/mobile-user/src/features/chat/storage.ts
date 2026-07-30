import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiConfig } from '../../shared/api';
import { readCachedCustomerPassport } from '../../shared/api';
import type { ChatActor, ChatMessage, ChatProfile, ChatSettings, ChatThreadMeta, ChatTypingState, ImportantMessage } from './types';

const GUEST_CLIENT_KEY = `mobile_chat_guest_client_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const LAST_CUSTOMER_CLIENT_KEY = `mobile_chat_last_customer_client_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const PUSH_ENABLED_KEY = `mobile_chat_push_enabled_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const PUSH_TOKEN_KEY = `mobile_chat_push_token_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const CHAT_SETTINGS_CACHE_KEY = `mobile_chat_settings_cache_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const CHAT_UNREAD_CACHE_KEY_PREFIX = `mobile_chat_unread_cache_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const THREAD_CACHE_KEY_PREFIX = `mobile_chat_thread_cache_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const IMPORTANT_MESSAGES_READ_KEY = `mobile_important_messages_read_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const IMPORTANT_MESSAGES_CACHE_KEY_PREFIX = `mobile_important_messages_cache_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;

type ChatThreadCacheSnapshot = {
  actor: ChatActor;
  clientId: string;
  hasMore: boolean;
  messages: ChatMessage[];
  meta?: ChatThreadMeta | null;
  nextBeforeId: number | null;
  savedAt: string;
  typing?: ChatTypingState | null;
  updatedAt: string;
  visibleMessageCount?: number;
};

type ImportantMessageReadMap = Record<string, string>;
type ChatUnreadCacheSnapshot = {
  revision: number;
  savedAt: string;
  total: number;
};
type ImportantMessagesCacheSnapshot = {
  count: number;
  items: ImportantMessage[];
  revision: string;
  savedAt: string;
};

const THREAD_CACHE_MEMORY = new Map<string, ChatThreadCacheSnapshot>();
const CHAT_UNREAD_CACHE_MEMORY = new Map<string, ChatUnreadCacheSnapshot>();
let LAST_CHAT_PROFILE_MEMORY: ChatProfile | null = null;
let LAST_CHAT_SETTINGS_MEMORY: ChatSettings | null = null;
let LAST_CUSTOMER_CLIENT_MEMORY = '';
const IMPORTANT_MESSAGES_CACHE_MEMORY = new Map<string, ImportantMessagesCacheSnapshot>();

function makeGuestId() {
  const base = Date.now().toString().slice(-9);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${base}${random}`.slice(0, 12);
}

export async function readGuestChatClientId() {
  const existing = await readStoredGuestChatClientId();
  if (existing) return existing;
  const next = makeGuestId();
  await AsyncStorage.setItem(GUEST_CLIENT_KEY, next);
  return next;
}

export async function readStoredGuestChatClientId() {
  return String(await AsyncStorage.getItem(GUEST_CLIENT_KEY).catch(() => '') || '').trim();
}

export async function clearGuestChatClientId(clientId?: string) {
  const current = await readStoredGuestChatClientId();
  const safeClientId = String(clientId || '').trim();
  if (!current || (safeClientId && current !== safeClientId)) return;
  await AsyncStorage.removeItem(GUEST_CLIENT_KEY);
}

export async function readLastCustomerChatClientId() {
  const clientId = String(await AsyncStorage.getItem(LAST_CUSTOMER_CLIENT_KEY).catch(() => '') || '').trim();
  if (clientId) LAST_CUSTOMER_CLIENT_MEMORY = clientId;
  return clientId;
}

export async function saveLastCustomerChatClientId(clientId: string) {
  const safe = String(clientId || '').trim();
  if (safe) {
    LAST_CUSTOMER_CLIENT_MEMORY = safe;
    await AsyncStorage.setItem(LAST_CUSTOMER_CLIENT_KEY, safe);
  }
}

export function readLastCustomerChatClientIdSync() {
  return LAST_CUSTOMER_CLIENT_MEMORY;
}

export async function readChatPushEnabled() {
  const raw = String(await AsyncStorage.getItem(PUSH_ENABLED_KEY).catch(() => '') || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export async function saveChatPushEnabled(enabled: boolean) {
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? '1' : '0');
}

export async function readChatPushToken() {
  return String(await AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => '') || '').trim();
}

export async function saveChatPushToken(token: string) {
  const safe = String(token || '').trim();
  if (safe) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, safe);
  } else {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }
}

export async function readCachedChatSettings() {
  if (LAST_CHAT_SETTINGS_MEMORY) return { ...LAST_CHAT_SETTINGS_MEMORY };
  const raw = String(await AsyncStorage.getItem(CHAT_SETTINGS_CACHE_KEY).catch(() => '') || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    LAST_CHAT_SETTINGS_MEMORY = parsed as ChatSettings;
    return { ...LAST_CHAT_SETTINGS_MEMORY };
  } catch {
    return null;
  }
}

function getChatUnreadCacheKey(clientId: string) {
  return `${CHAT_UNREAD_CACHE_KEY_PREFIX}_${String(clientId || '').trim()}`;
}

export async function readChatUnreadCache(clientId: string) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId) return null;
  const key = getChatUnreadCacheKey(safeClientId);
  const memory = CHAT_UNREAD_CACHE_MEMORY.get(key);
  if (memory) return { ...memory };
  const raw = String(await AsyncStorage.getItem(key).catch(() => '') || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatUnreadCacheSnapshot>;
    const total = Math.max(0, Number(parsed?.total || 0));
    const revision = Math.max(0, Number(parsed?.revision || 0));
    if (!Number.isFinite(total) || !Number.isFinite(revision)) return null;
    const snapshot = {
      revision,
      savedAt: String(parsed?.savedAt || ''),
      total,
    };
    CHAT_UNREAD_CACHE_MEMORY.set(key, snapshot);
    return { ...snapshot };
  } catch {
    return null;
  }
}

export function saveChatUnreadCache(clientId: string, total: number, revision: number) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId) return;
  const key = getChatUnreadCacheKey(safeClientId);
  const snapshot: ChatUnreadCacheSnapshot = {
    revision: Math.max(0, Number(revision || 0)),
    savedAt: new Date().toISOString(),
    total: Math.max(0, Number(total || 0)),
  };
  CHAT_UNREAD_CACHE_MEMORY.set(key, snapshot);
  void AsyncStorage.setItem(key, JSON.stringify(snapshot)).catch(() => undefined);
}

function getThreadCacheKey(clientId: string) {
  return `${THREAD_CACHE_KEY_PREFIX}_${String(clientId || '').trim()}`;
}

export async function readChatThreadCache(clientId: string): Promise<ChatThreadCacheSnapshot | null> {
  const key = getThreadCacheKey(clientId);
  if (!key) return null;
  const memory = THREAD_CACHE_MEMORY.get(key);
  if (memory) return memory;
  const raw = String(await AsyncStorage.getItem(key).catch(() => '') || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChatThreadCacheSnapshot;
    if (!parsed || !Array.isArray(parsed.messages) || !String(parsed.clientId || '').trim()) return null;
    THREAD_CACHE_MEMORY.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function readChatThreadCacheSync(clientId: string): ChatThreadCacheSnapshot | null {
  const key = getThreadCacheKey(clientId);
  if (!key) return null;
  return THREAD_CACHE_MEMORY.get(key) || null;
}

export async function saveChatThreadCache(snapshot: Omit<ChatThreadCacheSnapshot, 'savedAt'>) {
  const clientId = String(snapshot.clientId || '').trim();
  if (!clientId) return;
  const key = getThreadCacheKey(clientId);
  const current = THREAD_CACHE_MEMORY.get(key);
  const nextSnapshot: ChatThreadCacheSnapshot = {
    ...snapshot,
    clientId,
    savedAt: new Date().toISOString(),
    visibleMessageCount: snapshot.visibleMessageCount ?? current?.visibleMessageCount,
  };
  THREAD_CACHE_MEMORY.set(key, nextSnapshot);
  await AsyncStorage.setItem(key, JSON.stringify(nextSnapshot));
}

export function readChatThreadVisibleMessageCountSync(clientId: string) {
  const key = getThreadCacheKey(clientId);
  if (!key) return 0;
  const count = Number(THREAD_CACHE_MEMORY.get(key)?.visibleMessageCount || 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

export async function saveChatThreadVisibleMessageCount(clientId: string, count: number) {
  const safeClientId = String(clientId || '').trim();
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!safeClientId || !safeCount) return;
  const key = getThreadCacheKey(safeClientId);
  const current = await readChatThreadCache(safeClientId).catch(() => null);
  if (!current) return;
  const currentCount = Number(current.visibleMessageCount || 0);
  const nextSnapshot: ChatThreadCacheSnapshot = {
    ...current,
    visibleMessageCount: Math.max(safeCount, Number.isFinite(currentCount) ? Math.trunc(currentCount) : 0),
    savedAt: new Date().toISOString(),
  };
  THREAD_CACHE_MEMORY.set(key, nextSnapshot);
  await AsyncStorage.setItem(key, JSON.stringify(nextSnapshot));
}

export async function clearChatThreadCache(clientId: string) {
  const key = getThreadCacheKey(clientId);
  if (!key) return;
  THREAD_CACHE_MEMORY.delete(key);
  await AsyncStorage.removeItem(key);
}

async function getImportantMessagesCacheKey() {
  const passport = await readCachedCustomerPassport().catch(() => null);
  const customerId = Number(passport?.customer?.id || 0);
  if (customerId > 0) return `${IMPORTANT_MESSAGES_CACHE_KEY_PREFIX}_customer_${customerId}`;
  const token = String(passport?.token || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return `${IMPORTANT_MESSAGES_CACHE_KEY_PREFIX}_${token || 'guest'}`;
}

export async function readImportantMessagesCache(): Promise<ImportantMessagesCacheSnapshot | null> {
  const key = await getImportantMessagesCacheKey();
  const memory = IMPORTANT_MESSAGES_CACHE_MEMORY.get(key);
  if (memory) return memory;
  const raw = String(await AsyncStorage.getItem(key).catch(() => '') || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ImportantMessagesCacheSnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    const snapshot: ImportantMessagesCacheSnapshot = {
      count: Math.max(0, Number(parsed.count || parsed.items.length || 0)),
      items: parsed.items,
      revision: String(parsed.revision || ''),
      savedAt: String(parsed.savedAt || ''),
    };
    IMPORTANT_MESSAGES_CACHE_MEMORY.set(key, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export async function saveImportantMessagesCache(snapshot: Omit<ImportantMessagesCacheSnapshot, 'savedAt'>) {
  const key = await getImportantMessagesCacheKey();
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const nextSnapshot: ImportantMessagesCacheSnapshot = {
    count: Math.max(0, Number(snapshot.count || items.length || 0)),
    items,
    revision: String(snapshot.revision || ''),
    savedAt: new Date().toISOString(),
  };
  IMPORTANT_MESSAGES_CACHE_MEMORY.set(key, nextSnapshot);
  await AsyncStorage.setItem(key, JSON.stringify(nextSnapshot));
}

export async function updateImportantMessagesCacheItems(items: ImportantMessage[]) {
  const cached = await readImportantMessagesCache().catch(() => null);
  await saveImportantMessagesCache({
    count: cached?.count ?? (Array.isArray(items) ? items.length : 0),
    items: Array.isArray(items) ? items : [],
    revision: cached?.revision || '',
  });
}

function getImportantMessageId(item: ImportantMessage | number) {
  const id = Number(typeof item === 'number' ? item : item?.id || 0);
  return Number.isFinite(id) && id > 0 ? String(Math.trunc(id)) : '';
}

function getImportantMessageRevision(item: ImportantMessage | number) {
  if (typeof item === 'number') return getImportantMessageId(item);
  return String(item?.published_at || item?.updated_at || item?.id || '').trim();
}

async function readImportantMessagesReadMap(): Promise<ImportantMessageReadMap> {
  const raw = String(await AsyncStorage.getItem(IMPORTANT_MESSAGES_READ_KEY).catch(() => '') || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as ImportantMessageReadMap
      : {};
  } catch {
    return {};
  }
}

async function saveImportantMessagesReadMap(map: ImportantMessageReadMap) {
  await AsyncStorage.setItem(IMPORTANT_MESSAGES_READ_KEY, JSON.stringify(map || {}));
}

export async function countUnreadImportantMessages(items: ImportantMessage[]) {
  const messages = Array.isArray(items) ? items : [];
  if (!messages.length) return 0;
  const readMap = await readImportantMessagesReadMap();
  return messages.reduce((count, item) => {
    const id = getImportantMessageId(item);
    if (!id) return count;
    const revision = getImportantMessageRevision(item);
    return readMap[id] === revision ? count : count + 1;
  }, 0);
}

export async function getUnreadImportantMessageIds(items: ImportantMessage[]) {
  const messages = Array.isArray(items) ? items : [];
  if (!messages.length) return [] as string[];
  const readMap = await readImportantMessagesReadMap();
  return messages
    .filter((item) => {
      const id = getImportantMessageId(item);
      if (!id) return false;
      return readMap[id] !== getImportantMessageRevision(item);
    })
    .map((item) => getImportantMessageId(item))
    .filter(Boolean);
}

export async function markImportantMessageRead(item: ImportantMessage | number) {
  const id = getImportantMessageId(item);
  if (!id) return;
  const readMap = await readImportantMessagesReadMap();
  readMap[id] = getImportantMessageRevision(item) || id;
  await saveImportantMessagesReadMap(readMap);
}

export function readLastChatProfileSync() {
  return LAST_CHAT_PROFILE_MEMORY ? { ...LAST_CHAT_PROFILE_MEMORY } : null;
}

export function saveLastChatProfile(profile: ChatProfile | null) {
  LAST_CHAT_PROFILE_MEMORY = profile ? { ...profile } : null;
}

export function readLastChatSettingsSync() {
  return LAST_CHAT_SETTINGS_MEMORY ? { ...LAST_CHAT_SETTINGS_MEMORY } : null;
}

export function saveLastChatSettings(settings: ChatSettings | null) {
  LAST_CHAT_SETTINGS_MEMORY = settings ? { ...settings } : null;
  if (LAST_CHAT_SETTINGS_MEMORY) {
    void AsyncStorage.setItem(CHAT_SETTINGS_CACHE_KEY, JSON.stringify(LAST_CHAT_SETTINGS_MEMORY)).catch(() => undefined);
  } else {
    void AsyncStorage.removeItem(CHAT_SETTINGS_CACHE_KEY).catch(() => undefined);
  }
}

export async function resolveUserChatProfile(): Promise<ChatProfile> {
  const passport = await readCachedCustomerPassport().catch(() => null);
  const token = String(passport?.token || '').trim();
  const customer = passport?.customer || null;
  const directId = Number(customer?.id || 0);

  if (token && Number.isFinite(directId) && directId > 0) {
    const clientId = String(Math.trunc(directId));
    const profile = {
      clientId,
      customerToken: token,
      name: String(customer?.name || 'Клиент'),
      phone: String(customer?.phone || ''),
      isGuest: false,
    };
    saveLastChatProfile(profile);
    return profile;
  }

  const profile = {
    clientId: await readGuestChatClientId(),
    customerToken: '',
    name: 'Гость',
    phone: '',
    isGuest: true,
  };
  saveLastChatProfile(profile);
  return profile;
}
