import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiConfig } from '../../shared/api';
import { readCachedCustomerPassport } from '../../shared/api';
import type { ChatActor, ChatMessage, ChatProfile, ChatSettings, ChatThreadMeta, ChatTypingState, ImportantMessage } from './types';

const GUEST_CLIENT_KEY = `mobile_chat_guest_client_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const LAST_CUSTOMER_CLIENT_KEY = `mobile_chat_last_customer_client_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const PUSH_ENABLED_KEY = `mobile_chat_push_enabled_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const PUSH_TOKEN_KEY = `mobile_chat_push_token_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const THREAD_CACHE_KEY_PREFIX = `mobile_chat_thread_cache_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;
const IMPORTANT_MESSAGES_READ_KEY = `mobile_important_messages_read_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;

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
};

type ImportantMessageReadMap = Record<string, string>;

const THREAD_CACHE_MEMORY = new Map<string, ChatThreadCacheSnapshot>();
let LAST_CHAT_PROFILE_MEMORY: ChatProfile | null = null;
let LAST_CHAT_SETTINGS_MEMORY: ChatSettings | null = null;

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
  return String(await AsyncStorage.getItem(LAST_CUSTOMER_CLIENT_KEY).catch(() => '') || '').trim();
}

export async function saveLastCustomerChatClientId(clientId: string) {
  const safe = String(clientId || '').trim();
  if (safe) await AsyncStorage.setItem(LAST_CUSTOMER_CLIENT_KEY, safe);
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
  const nextSnapshot: ChatThreadCacheSnapshot = {
    ...snapshot,
    clientId,
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
