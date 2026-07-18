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
  publicId?: string;
  public_id?: string;
  statusTitle?: string;
  status_title?: string;
  totalPrice?: number;
  total_price?: number;
  createdAt?: string;
  created_at?: string;
  photos?: string[];
};

export type ChatMessage = {
  id: string;
  direction: ChatDirection;
  text: string;
  createdAt: string;
  editedAt?: string;
  read?: boolean;
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

export type ChatTypingState = {
  active?: boolean;
  text?: string;
  updated_at?: string;
};

export type ChatClientSummary = {
  client_id?: number;
  id?: number;
  name?: string;
  phone?: string;
  meta?: Record<string, unknown>;
  last_message?: ChatMessage | null;
  lastMessage?: ChatMessage | null;
  last_text?: string;
  lastText?: string;
  updated_at?: string;
  unread_total?: number;
  unread_count?: number;
  typing?: ChatTypingState | null;
};

export type ChatThreadPage = {
  client_id?: number;
  updated_at?: string;
  meta?: Record<string, unknown>;
  messages?: ChatMessage[];
  page?: {
    next_before_id?: number | null;
    has_more?: boolean;
  };
  typing?: ChatTypingState | null;
};

export type ChatWaitResult = {
  changed?: boolean;
  message_changed?: boolean;
  typing_changed?: boolean;
  updated_at?: string;
  typing?: ChatTypingState | null;
  timeout?: boolean;
  read_message_ids?: string[];
  read_at?: string;
};
