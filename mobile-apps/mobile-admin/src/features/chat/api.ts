import EventSource from 'react-native-sse';

import { adminApi, apiConfig } from '../../shared/api';
import type { ChatActor, ChatAttachment, ChatClientSummary, ChatMessage, ChatThreadPage, ChatWaitResult } from './types';

type ApiEnvelope<T> = {
  data?: T;
  has_more?: boolean;
  limit?: number;
  offset?: number;
  ok?: boolean;
  total?: number;
};

function buildQuery(query: Record<string, string | number | boolean | null | undefined>, actor: ChatActor = 'out') {
  const params = new URLSearchParams();
  params.set('tenant_id', String(apiConfig.tenantId));
  params.set('store_id', String(apiConfig.storeId));
  params.set('chat_actor', actor);
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || typeof value === 'undefined' || value === '') return;
    params.set(key, String(value));
  });
  return params.toString();
}

function buildStreamUrl(path: string, query: Record<string, string | number | boolean | null | undefined> = {}) {
  const base = apiConfig.baseUrl.replace(/\/+$/, '');
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path.startsWith('/') ? path : `/${path}`}${sep}${buildQuery(query)}`;
}

function buildStreamHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'x-chat-actor': 'out',
    'x-store-id': String(apiConfig.storeId),
    'x-tenant-id': String(apiConfig.tenantId),
  };
}

async function chatApi<T>(token: string, path: string, init: RequestInit = {}, query: Record<string, string | number | boolean | null | undefined> = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const headers = new Headers(init.headers || undefined);
  headers.set('x-chat-actor', 'out');
  const result = await adminApi<ApiEnvelope<T> | T>(token, `${path}${sep}${buildQuery(query)}`, { ...init, headers });
  return (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')
    ? (result as ApiEnvelope<T>).data
    : result) as T;
}

export function fetchChatClients(token: string, limit = 30, offset = 0) {
  return chatApi<ChatClientSummary[]>(token, '/api/chat-temp/clients', {}, { limit, offset });
}

export function waitChatSummaries(token: string, sinceRevision: number) {
  return chatApi<{ changed?: boolean; revision?: number; timeout?: boolean }>(token, '/api/chat-temp/summaries/wait', {}, {
    since_revision: sinceRevision,
    timeout_ms: 20000,
  });
}

export function openChatSummariesStream(token: string) {
  return new EventSource<'summaries'>(buildStreamUrl('/api/chat-temp/summaries/stream'), {
    headers: buildStreamHeaders(token),
    pollingInterval: 5000,
    timeout: 0,
  });
}

export function fetchThread(token: string, clientId: string, beforeId?: number | null) {
  return chatApi<ChatThreadPage>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}`, {}, {
    client_id: clientId,
    before_id: beforeId || undefined,
    limit: 40,
  });
}

export function waitThread(token: string, clientId: string, since?: string, typingSince?: string) {
  return chatApi<ChatWaitResult>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/wait`, {}, {
    client_id: clientId,
    since: since || '',
    typing_since: typingSince || '',
    timeout_ms: 20000,
  });
}

export function openThreadStream(token: string, clientId: string) {
  return new EventSource<'thread'>(buildStreamUrl(`/api/chat-temp/thread/${encodeURIComponent(clientId)}/stream`, {
    client_id: clientId,
  }), {
    headers: buildStreamHeaders(token),
    pollingInterval: 5000,
    timeout: 0,
  });
}

export function createMessage(token: string, clientId: string, message: ChatMessage) {
  return chatApi<{ message: ChatMessage; updated_at?: string }>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }, { client_id: clientId });
}

export function patchMessage(token: string, clientId: string, messageId: string, patch: Partial<ChatMessage>) {
  return chatApi<{ message: ChatMessage; updated_at?: string }>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ patch }),
  }, { client_id: clientId });
}

export function deleteMessage(token: string, clientId: string, messageId: string) {
  return chatApi<{ deleted?: boolean }>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  }, { client_id: clientId });
}

export function markMessagesRead(token: string, clientId: string, ids: string[]) {
  return chatApi<{ changed?: boolean }>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/messages/read`, {
    method: 'POST',
    body: JSON.stringify({ message_ids: ids }),
  }, { client_id: clientId });
}

export function setTyping(token: string, clientId: string, active: boolean, text?: string) {
  return chatApi<{ peer_typing?: unknown }>(token, `/api/chat-temp/thread/${encodeURIComponent(clientId)}/typing`, {
    method: 'POST',
    body: JSON.stringify({ active, typing: active, text: text || '' }),
  }, { client_id: clientId });
}

export async function uploadChatImage(token: string, clientId: string, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append('client_id', clientId);
  form.append('file', file as unknown as Blob);
  return chatApi<{ attachment: ChatAttachment }>(token, '/api/chat-temp/attachment', {
    method: 'POST',
    body: form,
  }, { client_id: clientId });
}

export function fetchAdminClient(token: string, clientId: string) {
  return adminApi<Record<string, unknown>>(token, `/api/admin/clients/${encodeURIComponent(clientId)}`);
}

export function fetchAdminClientOrders(token: string, clientId: string) {
  return adminApi<Record<string, unknown>[]>(token, `/api/admin/clients/${encodeURIComponent(clientId)}/orders`);
}

export function fetchAdminOrder(token: string, orderId: number) {
  return adminApi<Record<string, unknown>>(token, `/api/admin/orders/${encodeURIComponent(String(orderId))}`);
}
