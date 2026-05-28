export type OrderStatus = 'new' | 'paid' | 'processing' | 'completed' | 'cancelled';

export type Order = {
  id: string;
  status: OrderStatus;
  total: number;
};
