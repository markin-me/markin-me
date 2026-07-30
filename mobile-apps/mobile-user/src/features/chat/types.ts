export type ChatActor = 'in' | 'out';
export type ChatDirection = 'in' | 'out';

export type ChatReactionMap = Partial<Record<ChatActor, string>>;

export type ChatReply = {
  id: string;
  sender?: string;
  text: string;
};

export type ChatAttachment = {
  kind: 'image';
  name?: string;
  mime?: string;
  dataUrl?: string;
  url?: string;
  width?: number;
  height?: number;
  size?: number;
};

export type ChatOrderCard = Record<string, unknown> & {
  id?: number;
  orderId?: number;
  order_id?: number;
  publicId?: string;
  public_id?: string;
  statusTitle?: string;
  status_title?: string;
  totalPrice?: number;
  total_price?: number;
  createdAt?: string;
  created_at?: string;
  photos?: string[];
  items?: Array<Record<string, unknown>>;
  methodTitle?: string;
  method_title?: string;
  timeOptionTitle?: string;
  time_option_title?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  address?: string;
  cutleryQty?: number;
  cutlery_qty?: number;
  comment?: string;
};

export type ChatMessage = {
  id: string;
  direction: ChatDirection;
  text: string;
  author?: string;
  createdAt: string;
  editedAt?: string;
  read?: boolean;
  pinned?: boolean;
  reaction?: string;
  reactions?: ChatReactionMap;
  replyTo?: ChatReply | null;
  attachment?: ChatAttachment | null;
  orderCards?: ChatOrderCard[];
  deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'read' | string;
  deliveredAt?: string;
  readAt?: string;
  localPending?: boolean;
  localFailed?: boolean;
};

export type ChatThreadMeta = {
  name?: string;
  phone?: string;
  last_welcome_day?: string;
  lastWelcomeDay?: string;
};

export type ChatTypingState = {
  active?: boolean;
  text?: string;
  updated_at?: string;
  expires_at?: string;
};

export type ChatThreadPage = {
  client_id?: number;
  updated_at?: string;
  meta?: ChatThreadMeta;
  messages?: ChatMessage[];
  page?: {
    limit?: number;
    before_id?: number | null;
    next_before_id?: number | null;
    has_more?: boolean;
  };
  typing?: ChatTypingState | null;
};

export type ChatThreadDiff = {
  client_id?: number;
  updated_at?: string;
  message_count?: number;
  messages?: ChatMessage[];
};

export type ChatWaitResult = {
  changed?: boolean;
  message_changed?: boolean;
  typing_changed?: boolean;
  updated_at?: string;
  typing?: ChatTypingState | null;
  timeout?: boolean;
  read_direction?: ChatDirection | '';
  read_message_ids?: string[];
  read_at?: string;
};

export type ChatUnreadSnapshot = {
  changed?: boolean;
  unread_total?: number;
  total?: number;
  unread_chats_total?: number;
  unanswered_total?: number;
  updated_at?: string;
  revision?: number;
  timeout?: boolean;
};

export type ChatClientSummary = {
  client_id?: number;
  id?: number;
  name?: string;
  phone?: string;
  last_message?: ChatMessage | null;
  lastMessage?: ChatMessage | null;
  last_text?: string;
  lastText?: string;
  updated_at?: string;
  unread_total?: number;
  unread_count?: number;
  typing?: ChatTypingState | null;
};

export type ChatSettings = {
  enabled?: boolean;
  is_enabled?: boolean | number | string;
  chat_enabled?: boolean | number | string;
  widget_enabled?: boolean;
  chat_widget_enabled?: boolean | number | string;
  assistant_name?: string;
  assistantName?: string;
  chat_assistant_name?: string;
  assistant_gender?: string;
  assistantGender?: string;
  chat_assistant_gender?: string;
  welcome_message?: string;
  welcomeMessage?: string;
  chat_welcome_message?: string;
  welcome_enabled?: boolean | number | string;
  welcomeEnabled?: boolean | number | string;
  chat_welcome_enabled?: boolean | number | string;
  quick_questions_enabled?: boolean | number | string;
  quickQuestionsEnabled?: boolean | number | string;
  chat_quick_questions_enabled?: boolean | number | string;
  quick_questions?: Array<string | Record<string, unknown>>;
  quickQuestions?: Array<string | Record<string, unknown>>;
  quick_questions_config?: Array<string | Record<string, unknown>> | { items?: Array<string | Record<string, unknown>> };
  quickQuestionsConfig?: Array<string | Record<string, unknown>> | { items?: Array<string | Record<string, unknown>> };
  chat_quick_questions_json?: string | Array<string | Record<string, unknown>> | { items?: Array<string | Record<string, unknown>> };
  operator_name?: string;
  operatorName?: string;
  chat_operator_name?: string;
  site_name?: string;
  name?: string;
  client_push_enabled?: boolean | number | string;
  chat_client_push_enabled?: boolean | number | string;
};

export type ImportantMessage = {
  id: number;
  type: 'news' | 'discount' | 'post' | string;
  title: string;
  body: string;
  image_url?: string;
  link_url?: string;
  promo_code?: string;
  promo_code_mode?: 'none' | 'shared' | 'unique' | string;
  promo_code_masked?: boolean;
  promo_claimable?: boolean;
  promo_claimed?: boolean;
  promo_discount_id?: number | null;
  promo_code_id?: number | null;
  is_pinned?: boolean;
  published_at?: string | null;
  updated_at?: string | null;
};

export type ChatProfile = {
  clientId: string;
  customerToken: string;
  name: string;
  phone: string;
  isGuest: boolean;
};
