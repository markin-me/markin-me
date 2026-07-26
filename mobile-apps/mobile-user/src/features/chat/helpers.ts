import type { ChatActor, ChatMessage, ChatOrderCard, ChatSettings } from './types';

export const CHAT_ACTOR_IN: ChatActor = 'in';
export const CHAT_ACTOR_OUT: ChatActor = 'out';

export const CHAT_QUICK_REACTIONS = ['\u{1F642}', '\u{1F622}', '\u2764\uFE0F', '\u{1F44D}', '\u{1F44E}', '\u{1F525}', '\u{1F621}'];
export const CHAT_EXTRA_REACTIONS = ['\u{1F97A}', '\u{1F615}', '\u{1F61E}', '\u{1F61F}', '\u{1F641}', '\u{1F62E}'];
export const CHAT_DEFAULT_QUICK_QUESTIONS = [
  'Где мой заказ?',
  'Вопрос по качеству товара',
  'Вопрос по комплектации заказа',
  'Другой вопрос',
];

const CHAT_QUICK_ORDER_ID = 'order';
const CHAT_QUICK_QUESTIONS_MAX = 6;
const CHAT_QUICK_ORDER_QUESTION = '\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?';
const HOT_QUESTION_ORDER_STATUS_UNKNOWN = '\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f';
const HOT_QUESTION_ORDER_CARD_PHOTOS_MAX = 4;
const HOT_QUESTION_PHONE_PATTERN = /(?:\+?\d[\d\s\-()]{8,}\d)/g;
const DEFAULT_CHAT_ASSISTANT_NAME = '\u041d\u044f\u043c-\u041d\u044f\u043c';
const DEFAULT_CHAT_WELCOME_MESSAGE =
  '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
  '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
  '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
  '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
  '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
const DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE =
  '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u0446\u0430 \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
  '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
  '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
  '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
  '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
const CHAT_QUICK_DEFAULT_ANSWER_BY_KEY: Record<string, string> = {
  '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430':
    '\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. ' +
    '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, ' +
    '\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.',
  '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430':
    '\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, ' +
    '\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.',
  '\u0434\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441':
    '\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.',
};

type ChatQuickQuestionConfig = {
  id: string;
  type: string;
  question: string;
  answer: string;
  enabled: boolean;
};

export function nowIso() {
  return new Date().toISOString();
}

export function makeChatMessageId(prefix = 'm') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeChatText(value: unknown, limit = 5000) {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, limit);
}

export function isOutgoing(message: ChatMessage, actor: ChatActor) {
  return actor === 'in' ? message.direction === 'in' : message.direction === 'out';
}

export function getPeerDirection(actor: ChatActor) {
  return actor === 'in' ? 'out' : 'in';
}

export function getMessageReaction(message: ChatMessage, actor: ChatActor) {
  return String(message.reactions?.[actor] || message.reaction || '');
}

export function getMessageReactionItems(message: ChatMessage) {
  const reactions = message.reactions && typeof message.reactions === 'object' ? message.reactions : {};
  const outReaction = String(reactions.out || '').trim();
  const inReaction = String(reactions.in || '').trim();
  if (!outReaction && !inReaction) {
    const legacy = String(message.reaction || '').trim();
    if (!legacy) return [] as Array<{ actor: ChatActor; reaction: string }>;
    return [{ actor: message.direction === 'out' ? 'out' : 'in', reaction: legacy }];
  }
  const items: Array<{ actor: ChatActor; reaction: string }> = [];
  if (outReaction) items.push({ actor: 'out', reaction: outReaction });
  if (inReaction) items.push({ actor: 'in', reaction: inReaction });
  return items;
}

export function mergeMessages(previous: ChatMessage[], next: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  previous.forEach((message) => {
    if (message?.id) map.set(message.id, message);
  });
  next.forEach((message) => {
    if (!message?.id) return;
    map.set(message.id, { ...map.get(message.id), ...message, localPending: false, localFailed: false });
  });
  return Array.from(map.values()).sort((a, b) => {
    const at = Date.parse(a.createdAt || '') || 0;
    const bt = Date.parse(b.createdAt || '') || 0;
    return at - bt;
  });
}

export function getMessagePreview(message?: ChatMessage | null) {
  if (!message) return '';
  const text = normalizeChatText(message.text, 120).trim();
  if (text) return text;
  if (message.attachment?.kind === 'image') return 'Фото';
  if (Array.isArray(message.orderCards) && message.orderCards.length) return 'Заказ';
  return '';
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

export function isEmojiOnly(text: string) {
  const value = text.trim();
  if (!value) return false;
  const withoutEmoji = value.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]/gu, '');
  return withoutEmoji.length === 0;
}

export function getEmojiOnlySize(text: string) {
  const count = Array.from(text.trim()).filter((part) => part.trim()).length;
  if (count <= 2) return 76;
  if (count <= 4) return 62;
  return 52;
}

export function isChatEnabled(settings: ChatSettings | null) {
  if (!settings) return true;
  const value = firstSettingValue(settings, ['enabled', 'is_enabled', 'widget_enabled', 'chat_widget_enabled', 'chat_enabled']);
  return normalizeEnabledFlag(value, true);
}

export function getAssistantName(settings: ChatSettings | null) {
  return firstSettingText(settings, ['assistant_name', 'assistantName', 'chat_assistant_name', 'chatAssistantName']) || DEFAULT_CHAT_ASSISTANT_NAME;
}

export function getOperatorName(settings: ChatSettings | null) {
  return firstSettingText(settings, [
    'operator_name',
    'operatorName',
    'chat_operator_name',
    'chatOperatorName',
    'site_name',
    'siteName',
    'name',
  ]) || '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440';
}

export function getWelcomeMessage(settings: ChatSettings | null) {
  const explicit = firstSettingText(settings, ['welcome_message', 'welcomeMessage', 'chat_welcome_message', 'chatWelcomeMessage']);
  if (explicit) return explicit;
  return getDefaultWelcomeMessageByGender(firstSettingValue(settings, [
    'assistant_gender',
    'assistantGender',
    'chat_assistant_gender',
    'chatAssistantGender',
  ]));
}

export function isWelcomeEnabled(settings: ChatSettings | null) {
  if (!settings) return true;
  const value = firstSettingValue(settings, ['welcome_enabled', 'welcomeEnabled', 'chat_welcome_enabled', 'chatWelcomeEnabled']);
  return normalizeEnabledFlag(value, true);
}

export function getQuickQuestions(settings: ChatSettings | null) {
  if (!isQuickQuestionsEnabled(settings)) return [];
  return getQuickQuestionConfigList(settings)
    .filter((item) => item.enabled !== false)
    .map((item) => normalizeQuickQuestionText(item.question))
    .filter(Boolean)
    .slice(0, CHAT_QUICK_QUESTIONS_MAX);
}

export function isQuickQuestionsEnabled(settings: ChatSettings | null) {
  if (!settings) return true;
  const value = firstSettingValue(settings, [
    'quick_questions_enabled',
    'quickQuestionsEnabled',
    'chat_quick_questions_enabled',
    'chatQuickQuestionsEnabled',
  ]);
  return normalizeEnabledFlag(value, true);
}

export function isOrderQuickQuestionEnabled(settings: ChatSettings | null) {
  if (!isQuickQuestionsEnabled(settings)) return false;
  return getQuickQuestionConfigList(settings).some((item) => {
    if (!item || item.enabled === false) return false;
    const id = String(item.id || '').toLowerCase();
    const type = String(item.type || '').toLowerCase();
    return id === CHAT_QUICK_ORDER_ID || type === CHAT_QUICK_ORDER_ID;
  });
}

export function getQuickQuestionReply(settings: ChatSettings | null, question: string) {
  if (!isQuickQuestionsEnabled(settings)) return '';
  const normalized = normalizeQuickQuestionKey(question);
  if (!normalized) return '';
  const matched = getQuickQuestionConfigList(settings).find((item) => {
    if (!item || item.enabled === false) return false;
    const id = String(item.id || '').toLowerCase();
    const type = String(item.type || '').toLowerCase();
    if (id === CHAT_QUICK_ORDER_ID || type === CHAT_QUICK_ORDER_ID) return false;
    const key = normalizeQuickQuestionKey(item.question);
    return !!key && (normalized === key || normalized.includes(key));
  });
  return matched ? normalizeQuickQuestionAnswer(matched.answer) : '';
}

export function isWhereIsOrderQuestion(question: string) {
  const normalized = normalizeQuickQuestionKey(question);
  return normalized.includes('\u0433\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437')
    || normalized.includes('\u0433\u0434\u0435 \u0437\u0430\u043a\u0430\u0437');
}

export function getIncomingMessageAuthor(message: ChatMessage, actor: ChatActor, settings: ChatSettings | null) {
  if (isOutgoing(message, actor)) return '';
  const explicit = String(message.author || '').trim();
  if (explicit) return explicit;
  if (actor !== 'in') return '';
  return isAssistantMessageId(message.id) ? getAssistantName(settings) : getOperatorName(settings);
}

function firstSettingValue(settings: ChatSettings | null, keys: string[]) {
  const source = settings as Record<string, unknown> | null;
  if (!source) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function firstSettingText(settings: ChatSettings | null, keys: string[]) {
  const value = firstSettingValue(settings, keys);
  return String(value ?? '').trim();
}

function normalizeEnabledFlag(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric !== 0 : fallback;
}

function normalizeAssistantGender(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'f' || normalized === 'female' || normalized === '\u0436') return 'f';
  return 'm';
}

function getDefaultWelcomeMessageByGender(value: unknown) {
  return normalizeAssistantGender(value) === 'f'
    ? DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE
    : DEFAULT_CHAT_WELCOME_MESSAGE;
}

function getGenderedAssistantText(settings: ChatSettings | null, maleText: string, femaleText: string) {
  return normalizeAssistantGender(firstSettingValue(settings, [
    'assistant_gender',
    'assistantGender',
    'chat_assistant_gender',
    'chatAssistantGender',
  ])) === 'f' ? femaleText : maleText;
}

function normalizeQuickQuestionText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function normalizeQuickQuestionAnswer(value: unknown) {
  return String(value ?? '').replace(/\s+\n/g, '\n').trim().slice(0, 1200);
}

function normalizeQuickQuestionKey(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[!?.,;:()[\]{}"'`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuickQuestionId(value: unknown, index: number) {
  const source = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 48);
  if (source && source !== CHAT_QUICK_ORDER_ID) return source;
  return `custom-${index + 1}`;
}

function isAssistantMessageId(messageId: string) {
  const id = String(messageId || '').trim();
  if (!id) return false;
  if (id.startsWith('auto_')) return true;
  if (id.startsWith('assistant-auto-')) return true;
  if (id.startsWith('assistant-auto_')) return true;
  if (/^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
  if (/^daily-welcome-options-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
  return false;
}

function getDefaultQuickQuestionAnswer(question: string) {
  return String(CHAT_QUICK_DEFAULT_ANSWER_BY_KEY[normalizeQuickQuestionKey(question)] || '');
}

function getQuickQuestionConfigList(settings: ChatSettings | null): ChatQuickQuestionConfig[] {
  const raw = firstSettingValue(settings, [
    'quick_questions_config',
    'quickQuestionsConfig',
    'quick_questions',
    'quickQuestions',
    'chat_quick_questions_json',
    'chatQuickQuestionsJson',
  ]);
  let parsed: unknown[] = [];

  if (Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const json = JSON.parse(trimmed) as unknown;
        parsed = Array.isArray(json) ? json : [];
      } catch {
        parsed = [];
      }
    }
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)) {
    parsed = (raw as { items: unknown[] }).items;
  }

  if (!parsed.length) return cloneDefaultQuickQuestionItems();

  const maxCustomItems = Math.max(0, CHAT_QUICK_QUESTIONS_MAX - 1);
  const customCandidates: Array<{ id: string; question: string; answer: string; enabled: boolean }> = [];
  let orderEnabled: boolean = true;
  let orderDefined = false;

  parsed.forEach((item, index) => {
    if (customCandidates.length >= maxCustomItems) return;

    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      const question = normalizeQuickQuestionText(item);
      if (!question) return;
      if (index === 0 && isWhereIsOrderQuestion(question)) {
        orderDefined = true;
        orderEnabled = true;
        return;
      }
      customCandidates.push({
        id: '',
        question,
        answer: getDefaultQuickQuestionAnswer(question),
        enabled: true,
      });
      return;
    }

    if (!item || typeof item !== 'object') return;
    const source = item as Record<string, unknown>;
    const question = normalizeQuickQuestionText(source.question ?? source.label ?? source.title ?? source.text ?? '');
    const rawId = String(source.id ?? source.key ?? source.code ?? '').trim();
    const rawType = String(source.type ?? '').trim().toLowerCase();
    const isOrder = rawId === CHAT_QUICK_ORDER_ID
      || rawType === CHAT_QUICK_ORDER_ID
      || normalizeEnabledFlag(source.is_order, false)
      || (index === 0 && isWhereIsOrderQuestion(question));

    if (isOrder) {
      orderDefined = true;
      orderEnabled = normalizeEnabledFlag(source.enabled ?? source.is_enabled ?? source.active, true);
      return;
    }

    if (!question) return;
    const hasExplicitAnswer = Object.prototype.hasOwnProperty.call(source, 'answer')
      || Object.prototype.hasOwnProperty.call(source, 'reply')
      || Object.prototype.hasOwnProperty.call(source, 'response')
      || Object.prototype.hasOwnProperty.call(source, 'message');
    const explicitAnswer = normalizeQuickQuestionAnswer(source.answer ?? source.reply ?? source.response ?? source.message ?? '');
    customCandidates.push({
      id: rawId,
      question,
      answer: explicitAnswer || (hasExplicitAnswer ? '' : getDefaultQuickQuestionAnswer(question)),
      enabled: normalizeEnabledFlag(source.enabled ?? source.is_enabled ?? source.active, true),
    });
  });

  const usedIds = new Set([CHAT_QUICK_ORDER_ID]);
  const customItems = customCandidates.slice(0, maxCustomItems).map((item, index) => {
    let id = normalizeQuickQuestionId(item.id, index);
    if (usedIds.has(id)) {
      let seq = index + 1;
      while (usedIds.has(`custom-${seq}`)) seq += 1;
      id = `custom-${seq}`;
    }
    usedIds.add(id);
    return {
      id,
      type: 'custom',
      question: normalizeQuickQuestionText(item.question),
      answer: normalizeQuickQuestionAnswer(item.answer),
      enabled: item.enabled !== false,
    };
  });

  return [
    {
      id: CHAT_QUICK_ORDER_ID,
      type: 'order',
      question: CHAT_QUICK_ORDER_QUESTION,
      answer: '',
      enabled: orderDefined ? orderEnabled : true,
    },
    ...customItems,
  ];
}

function cloneDefaultQuickQuestionItems(): ChatQuickQuestionConfig[] {
  return [
    {
      id: CHAT_QUICK_ORDER_ID,
      type: 'order',
      question: CHAT_QUICK_ORDER_QUESTION,
      answer: '',
      enabled: true,
    },
    ...CHAT_DEFAULT_QUICK_QUESTIONS.slice(1).map((question, index) => ({
      id: normalizeQuickQuestionId('', index),
      type: 'custom',
      question,
      answer: getDefaultQuickQuestionAnswer(question),
      enabled: true,
    })),
  ];
}

export function buildReplyFromMessageResolved(message: ChatMessage, actor: ChatActor, settings: ChatSettings | null) {
  return {
    id: message.id,
    sender: isOutgoing(message, actor) ? '\u0412\u044b' : getIncomingMessageAuthor(message, actor, settings) || '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440',
    text: getMessagePreview(message) || 'РЎРѕРѕР±С‰РµРЅРёРµ',
  };
}

export function buildReplyFromMessage(message: ChatMessage, actor: ChatActor) {
  return {
    id: message.id,
    sender: isOutgoing(message, actor) ? 'Вы' : 'Оператор',
    text: getMessagePreview(message) || 'Сообщение',
  };
}

export function buildOrderCardFromCustomerOrder(order: Record<string, unknown>): ChatOrderCard {
  const id = Number(order.id || order.order_id || 0);
  const items = Array.isArray(order.items)
    ? order.items as Record<string, unknown>[]
    : (Array.isArray(order.orderItems) ? order.orderItems as Record<string, unknown>[] : []);
  const itemPhotos = collectOrderCardPreviewPhotos(items, HOT_QUESTION_ORDER_CARD_PHOTOS_MAX);
  const directPhotos = Array.isArray(order.photos)
    ? order.photos
      .map((photo) => String(photo || '').trim())
      .filter(Boolean)
      .slice(0, HOT_QUESTION_ORDER_CARD_PHOTOS_MAX)
    : [];
  return {
    id,
    publicId: String(order.public_id || order.publicId || ''),
    statusTitle: String(order.status_title || order.statusTitle || HOT_QUESTION_ORDER_STATUS_UNKNOWN).trim() || HOT_QUESTION_ORDER_STATUS_UNKNOWN,
    totalPrice: Number(order.total_price ?? order.totalPrice ?? order.total ?? 0),
    createdAt: String(order.created_at || order.createdAt || ''),
    photos: itemPhotos.length ? itemPhotos : directPhotos,
    items,
    methodTitle: String(order.method_title || order.methodTitle || ''),
    timeOptionTitle: String(order.time_option_title || order.timeOptionTitle || ''),
    scheduledAt: String(order.scheduled_at || order.scheduledAt || ''),
    address: String(order.address || ''),
    cutleryQty: Number(order.cutlery_qty ?? order.cutleryQty ?? 0),
    comment: String(order.comment || ''),
  };
}

export function buildWhereIsOrderGuestReply() {
  return '\u041d\u0435 \u043c\u043e\u0433\u0443 \u043d\u0430\u0439\u0442\u0438 \u0432\u0430\u0441 \u0432 \u0431\u0430\u0437\u0435. ' +
    '\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 ' +
    '\u0432\u0430\u0448 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430.';
}

export function buildWhereIsOrderText(cards: ChatOrderCard[], settings: ChatSettings | null = null) {
  if (!cards.length) {
    return getGenderedAssistantText(
      settings,
      '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b: \u0441\u0435\u0439\u0447\u0430\u0441 \u0443 \u0432\u0430\u0441 \u043d\u0435\u0442 ' +
        '\u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432.',
      '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b\u0430: \u0441\u0435\u0439\u0447\u0430\u0441 \u0443 \u0432\u0430\u0441 \u043d\u0435\u0442 ' +
        '\u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432.',
    );
  }
  return getGenderedAssistantText(
    settings,
    '\u041d\u0430\u0448\u0435\u043b \u0432\u0430\u0448\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u044b.',
    '\u041d\u0430\u0448\u043b\u0430 \u0432\u0430\u0448\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u044b.',
  );
}

export function normalizePhoneForOrderLookup(value: unknown) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  if (digits.length > 11) {
    const tail11 = digits.slice(-11);
    if (/^[78]\d{10}$/.test(tail11)) return `7${tail11.slice(1)}`;
    const tail10 = digits.slice(-10);
    if (/^\d{10}$/.test(tail10)) return `7${tail10}`;
  }
  return digits.length >= 10 ? digits : '';
}

export function extractPhoneCandidateFromChatText(value: unknown) {
  const source = String(value || '');
  if (!source) return '';
  const matches = source.match(HOT_QUESTION_PHONE_PATTERN) || [];
  for (const match of matches) {
    const normalized = normalizePhoneForOrderLookup(match);
    if (normalized) return normalized;
  }
  return normalizePhoneForOrderLookup(source);
}

export function looksLikePhone(value: string) {
  return !!extractPhoneCandidateFromChatText(value);
}

export function getOrderCardTitle(card: ChatOrderCard) {
  const id = Number(card.id || card.orderId || card.order_id || 0);
  if (Number.isFinite(id) && id > 0) return `#${Math.trunc(id)}`;
  const publicId = String(card.publicId || card.public_id || '').trim();
  if (publicId) return publicId.startsWith('#') ? publicId : `#${publicId}`;
  return '\u0417\u0430\u043a\u0430\u0437';
}

export function getOrderCardStatus(card: ChatOrderCard) {
  return String(card.statusTitle || card.status_title || card.status || card.statusText || card.status_text || '');
}

export function getOrderCardTotal(card: ChatOrderCard) {
  const value = Number(card.totalPrice ?? card.total_price ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${Math.round(value).toLocaleString('ru-RU')} \u20BD`;
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
  const itemPhotos = collectOrderCardPreviewPhotos(items, HOT_QUESTION_ORDER_CARD_PHOTOS_MAX);
  const photos = [...direct.map((photo) => String(photo || '').trim()), ...itemPhotos].filter(Boolean);
  return Array.from(new Set(photos)).slice(0, 3);
}

function collectOrderCardPreviewPhotos(items: Record<string, unknown>[], maxPhotos: number) {
  const result: string[] = [];
  const limit = Math.max(1, Math.min(8, Number(maxPhotos || HOT_QUESTION_ORDER_CARD_PHOTOS_MAX)));

  const pushPhoto = (rawPhoto: unknown) => {
    if (result.length >= limit) return;
    const src = String(rawPhoto || '').trim();
    if (!src) return;
    result.push(src);
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (result.length >= limit) return;
    const source = item && typeof item === 'object' ? item : {};
    const photos = Array.isArray(source.photos) ? source.photos : [];
    if (photos.length) {
      pushPhoto(photos[0]);
      return;
    }
    pushPhoto(source.photo || source.product_photo || '');
  });

  return result;
}

function formatOrderCardDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
