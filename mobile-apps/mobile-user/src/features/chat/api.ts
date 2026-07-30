import EventSource from 'react-native-sse';

import { apiConfig, readCachedCustomerPassport } from '../../shared/api';
import type {
  ChatActor,
  ChatAttachment,
  ChatClientSummary,
  ChatMessage,
  ChatSettings,
  ChatThreadDiff,
  ChatThreadMeta,
  ChatThreadPage,
  ChatUnreadSnapshot,
  ChatWaitResult,
  ImportantMessage,
} from './types';
import { saveLastChatSettings } from './storage';

let chatSettingsRequest: Promise<ChatSettings> | null = null;

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  total?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
};

export type ChatPushSubscription = {
  endpoint: string;
  p256dh?: string;
  auth?: string;
};

type ChatRequestOptions = RequestInit & {
  actor?: ChatActor;
  customerToken?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

function buildUrl(path: string, query?: ChatRequestOptions['query'], actor: ChatActor = 'in') {
  const base = apiConfig.baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  url.searchParams.set('tenant_id', String(apiConfig.tenantId));
  url.searchParams.set('store_id', String(apiConfig.storeId));
  url.searchParams.set('chat_actor', actor);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || typeof value === 'undefined' || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function buildHeaders(options: ChatRequestOptions) {
  const headers = new Headers(options.headers || undefined);
  headers.set('x-tenant-id', String(apiConfig.tenantId));
  headers.set('x-store-id', String(apiConfig.storeId));
  headers.set('x-chat-actor', options.actor || 'in');
  if (options.customerToken) headers.set('x-customer-token', options.customerToken);
  return headers;
}

function buildHeaderRecord(options: ChatRequestOptions) {
  const headers = buildHeaders(options);
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function requestData<T>(path: string, options: ChatRequestOptions = {}): Promise<T> {
  const actor = options.actor || 'in';
  const headers = buildHeaders(options);
  const hasBody = typeof options.body !== 'undefined';
  if (hasBody && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(buildUrl(path, options.query, actor), {
    ...options,
    headers,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) as ApiEnvelope<T> : {};
  if (!response.ok || json.ok === false) {
    throw new Error(String(json.error || `HTTP_${response.status}`));
  }
  return (Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json) as T;
}

export function resolveChatAssetUrl(url?: string | null) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^file:\/\//i.test(raw)) return raw;
  return `${apiConfig.baseUrl.replace(/\/+$/, '')}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export function fetchChatSettings() {
  if (chatSettingsRequest) return chatSettingsRequest;
  chatSettingsRequest = requestData<ChatSettings & { settings?: ChatSettings }>('/api/public/tenant/chat-settings', { actor: 'in' })
    .then((payload) => payload && typeof payload.settings === 'object' && payload.settings
      ? payload.settings
      : payload
    )
    .then((settings) => {
      saveLastChatSettings(settings || null);
      return settings;
    })
    .finally(() => {
      chatSettingsRequest = null;
    });
  return chatSettingsRequest;
}

export function fetchImportantMessages() {
  return readCachedCustomerPassport().catch(() => null).then((passport) => requestData<ImportantMessage[]>('/api/public/important-messages', {
    actor: 'in',
    customerToken: String(passport?.token || ''),
    query: { limit: 100 },
  }));
}

export function fetchImportantMessagesRevision() {
  return readCachedCustomerPassport().catch(() => null).then((passport) => requestData<{
    count?: number;
    revision?: string;
  }>('/api/public/important-messages/revision', {
    actor: 'in',
    customerToken: String(passport?.token || ''),
  }));
}

export function claimImportantMessagePromo(messageId: number) {
  return readCachedCustomerPassport().catch(() => null).then((passport) => requestData<{
    promo_code?: string;
    promo_code_id?: number | null;
    promo_claimed?: boolean;
  }>(`/api/public/important-messages/${encodeURIComponent(String(messageId))}/claim-promo`, {
    actor: 'in',
    customerToken: String(passport?.token || ''),
    method: 'POST',
    body: JSON.stringify({}),
  }));
}

export function fetchOrdersByPhone(phone: string) {
  return requestData<Record<string, unknown>[]>('/api/public/orders/by-phone', {
    actor: 'in',
    query: { phone, limit: 200 },
  });
}

export function fetchThread(clientId: string, params: {
  actor: ChatActor;
  customerToken?: string;
  beforeId?: number | null;
  limit?: number;
}) {
  return requestData<ChatThreadPage>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}`, {
    actor: params.actor,
    customerToken: params.customerToken,
    query: {
      client_id: clientId,
      before_id: params.beforeId || undefined,
      limit: params.limit || 40,
    },
  });
}

export function fetchThreadDiff(clientId: string, params: {
  actor: ChatActor;
  customerToken?: string;
  since: string;
}) {
  return requestData<ChatThreadDiff>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/diff`, {
    actor: params.actor,
    customerToken: params.customerToken,
    query: {
      client_id: clientId,
      since: params.since,
    },
  });
}

export function waitThread(clientId: string, params: {
  actor: ChatActor;
  customerToken?: string;
  since?: string;
  typingSince?: string;
  timeoutMs?: number;
}) {
  return requestData<ChatWaitResult>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/wait`, {
    actor: params.actor,
    customerToken: params.customerToken,
    query: {
      client_id: clientId,
      since: params.since || '',
      typing_since: params.typingSince || '',
      timeout_ms: params.timeoutMs || 20000,
    },
  });
}

export function openThreadStream(clientId: string, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return new EventSource<'thread'>(buildUrl(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/stream`, {
    client_id: clientId,
  }, params.actor), {
    headers: buildHeaderRecord({ actor: params.actor, customerToken: params.customerToken }),
    pollingInterval: 5000,
    timeout: 0,
  });
}

export function createMessage(clientId: string, message: ChatMessage, params: {
  actor: ChatActor;
  customerToken?: string;
  meta?: ChatThreadMeta;
}) {
  return requestData<{ message: ChatMessage; updated_at?: string }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: JSON.stringify({ message, meta: params.meta || {} }),
    query: { client_id: clientId },
  });
}

export function patchMessage(clientId: string, messageId: string, patch: Partial<ChatMessage> & { hidden?: boolean }, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ message: ChatMessage; updated_at?: string }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/${encodeURIComponent(messageId)}`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'PATCH',
    body: JSON.stringify({ patch }),
    query: { client_id: clientId },
  });
}

export function deleteMessage(clientId: string, messageId: string, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ deleted?: boolean }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/${encodeURIComponent(messageId)}`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'DELETE',
    query: { client_id: clientId },
  });
}

export function markMessagesRead(clientId: string, messageIds: string[], params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ changed?: boolean; updated_at?: string }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/read`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: JSON.stringify({ message_ids: messageIds }),
    query: { client_id: clientId },
  });
}

export function setTyping(clientId: string, active: boolean, params: {
  actor: ChatActor;
  customerToken?: string;
  text?: string;
}) {
  return requestData<{ peer_typing?: unknown }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/typing`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: JSON.stringify({ active, typing: active, text: params.text || '' }),
    query: { client_id: clientId },
  });
}

export function patchThreadMeta(clientId: string, meta: ChatThreadMeta, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ meta?: ChatThreadMeta; updated_at?: string }>(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/meta`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'PATCH',
    body: JSON.stringify({ meta }),
    query: { client_id: clientId },
  });
}

export function mergeThreads(fromClientId: string, toClientId: string, actor: ChatActor = 'in') {
  return requestData<{ merged?: boolean; updated_at?: string }>('/api/chat-temp/thread/merge', {
    actor,
    method: 'POST',
    body: JSON.stringify({ from_client_id: fromClientId, to_client_id: toClientId }),
  });
}

export async function uploadChatImage(clientId: string, file: { uri: string; name: string; type: string }, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  const form = new FormData();
  form.append('client_id', clientId);
  form.append('file', file as unknown as Blob);
  return requestData<{ attachment: ChatAttachment }>('/api/chat-temp/attachment', {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: form,
    query: { client_id: clientId },
  });
}

export function fetchUnread(params: {
  actor: ChatActor;
  customerToken?: string;
  clientId?: string;
}) {
  return requestData<ChatUnreadSnapshot>('/api/chat-temp/unread', {
    actor: params.actor,
    customerToken: params.customerToken,
    query: { client_id: params.clientId || undefined },
  });
}

export function waitUnread(params: {
  actor: ChatActor;
  customerToken?: string;
  clientId?: string;
  total?: number;
  revision?: number;
  timeoutMs?: number;
}) {
  return requestData<ChatUnreadSnapshot>('/api/chat-temp/unread/wait', {
    actor: params.actor,
    customerToken: params.customerToken,
    query: {
      client_id: params.clientId || undefined,
      total: params.total ?? 0,
      since_revision: params.revision ?? 0,
      timeout_ms: params.timeoutMs || 20000,
    },
  });
}

export function openUnreadStream(params: {
  actor: ChatActor;
  customerToken?: string;
  clientId?: string;
}) {
  return new EventSource<'unread'>(buildUrl('/api/chat-temp/unread/stream', {
    client_id: params.clientId || undefined,
  }, params.actor), {
    headers: buildHeaderRecord({
      actor: params.actor,
      customerToken: params.customerToken,
    }),
    pollingInterval: 5000,
    timeout: 0,
  });
}

export function subscribeChatPush(clientId: string, subscription: ChatPushSubscription, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ client_id?: number; actor?: ChatActor; enabled?: boolean }>(`/api/chat-temp/push/subscribe`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: JSON.stringify({
      client_id: clientId,
      subscription,
    }),
    query: { client_id: clientId },
  });
}

export function unsubscribeChatPush(clientId: string, subscription: ChatPushSubscription, params: {
  actor: ChatActor;
  customerToken?: string;
}) {
  return requestData<{ unsubscribed?: boolean }>(`/api/chat-temp/push/unsubscribe`, {
    actor: params.actor,
    customerToken: params.customerToken,
    method: 'POST',
    body: JSON.stringify({
      client_id: clientId,
      subscription,
    }),
    query: { client_id: clientId },
  });
}

export function fetchChatClients(params: {
  actor: ChatActor;
  limit?: number;
  offset?: number;
}) {
  return requestData<ChatClientSummary[]>('/api/chat-temp/clients', {
    actor: params.actor,
    query: { limit: params.limit || 30, offset: params.offset || 0 },
  });
}
