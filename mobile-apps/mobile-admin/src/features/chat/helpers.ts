import type { ChatActor, ChatClientSummary, ChatMessage, ChatOrderCard } from './types';

export const CHAT_ACTOR: ChatActor = 'out';
export const CHAT_QUICK_REACTIONS = ['🥰', '👍', '🔥', '❤️', '👎', '👏', '😃'];
export const CHAT_EXTRA_REACTIONS = ['😢', '😕', '😞', '😟', '🙁', '😮'];

export function nowIso() {
  return new Date().toISOString();
}

export function makeChatMessageId(prefix = 'out') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isOutgoing(message: ChatMessage) {
  return message.direction === 'out';
}

export function getPeerDirection() {
  return 'in' as const;
}

export function mergeMessages(previous: ChatMessage[], next: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  previous.forEach((message) => message?.id && map.set(message.id, message));
  next.forEach((message) => message?.id && map.set(message.id, { ...map.get(message.id), ...message, localPending: false, localFailed: false }));
  return Array.from(map.values()).sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));
}

export function getMessagePreview(message?: ChatMessage | null) {
  if (!message) return '';
  const text = String(message.text || '').trim();
  if (text) return text;
  if (message.attachment?.kind === 'image') return 'Фото';
  if (message.orderCards?.length) return 'Заказ';
  return '';
}

export function getSummaryClientId(summary: ChatClientSummary) {
  return String(summary.client_id || summary.id || '').trim();
}

export function getSummaryName(summary: ChatClientSummary) {
  const meta = summary.meta || {};
  return String(summary.name || meta.name || `Клиент ${getSummaryClientId(summary)}`);
}

export function getSummaryPhone(summary: ChatClientSummary) {
  const meta = summary.meta || {};
  return String(summary.phone || meta.phone || '');
}

export function getSummaryPreview(summary: ChatClientSummary) {
  return String(summary.last_text || summary.lastText || getMessagePreview(summary.last_message || summary.lastMessage) || '');
}

export function getSummaryUnread(summary: ChatClientSummary) {
  return Number(summary.unread_total ?? summary.unread_count ?? 0);
}

export function formatChatTime(value?: string) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatChatDay(value?: string) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function shouldShowDay(previous: ChatMessage | null, current: ChatMessage) {
  const prev = previous ? new Date(previous.createdAt || '') : null;
  const next = new Date(current.createdAt || '');
  if (Number.isNaN(next.getTime())) return false;
  if (!prev || Number.isNaN(prev.getTime())) return true;
  return prev.toDateString() !== next.toDateString();
}

export function getReaction(message: ChatMessage) {
  return String(message.reactions?.out || message.reaction || '');
}

export function buildReplyFromMessage(message: ChatMessage) {
  return {
    id: message.id,
    sender: isOutgoing(message) ? 'Вы' : 'Клиент',
    text: getMessagePreview(message) || 'Сообщение',
  };
}

export function getOrderCardTitle(card: ChatOrderCard) {
  return String(card.publicId || card.public_id || (card.id ? `#${card.id}` : 'Заказ'));
}

export function getOrderCardStatus(card: ChatOrderCard) {
  return String(card.statusTitle || card.status_title || card.status || card.statusText || card.status_text || '');
}

export function getOrderCardTotal(card: ChatOrderCard) {
  const value = Number(card.totalPrice ?? card.total_price ?? card.total ?? card.amount ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${Math.round(value).toLocaleString('ru-RU')} \u20bd`;
}

export function getOrderCardMeta(card: ChatOrderCard) {
  const created = formatOrderCardDate(card.createdAt || card.created_at);
  const address = String(
    card.address ||
    card.address_line ||
    card.deliveryAddress ||
    card.delivery_address ||
    card.pickupPoint ||
    card.pickup_point ||
    '',
  ).trim();
  return [created, address].filter(Boolean).join(' / ');
}

export function getOrderCardPhotos(card: ChatOrderCard) {
  const direct = Array.isArray(card.photos) ? card.photos : [];
  const items = Array.isArray(card.items) ? card.items as Record<string, unknown>[] : [];
  const itemPhotos = items.map((item) => String(item.photo || item.image || item.photo_url || item.image_url || '').trim());
  const photos = [...direct.map((photo) => String(photo || '').trim()), ...itemPhotos].filter(Boolean);
  return Array.from(new Set(photos)).slice(0, 3);
}

function formatOrderCardDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
