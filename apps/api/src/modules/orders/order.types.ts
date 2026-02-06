// apps/api/src/modules/orders/order.types.ts

import type { UserAddress } from '../addresses/address.types.js';
import type { ShippingCarrier } from '../shipping/shipping.types.js';
import type { User } from '../users/user.types.js';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_confirmed'
  | 'processing'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  shipping_cost: number;
  total: number;
  shipping_address_id: string;
  shipping_carrier_id: string;
  payment_method: string;
  payment_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: Date;
  updated_at: Date;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  changed_by: string | null;
  created_at: Date;
}

export interface OrderWithDetails extends Order {
  items: OrderItemWithProduct[];
  status_history: OrderStatusHistory[];
  shipping_address?: UserAddress;
  shipping_carrier?: ShippingCarrier;
  user?: Omit<User, 'passwordHash'>;
}

export interface OrderItemWithProduct extends OrderItem {
  product_name: string;
  product_sku: string;
  product_image?: string;
}

export interface CreateOrderInput {
  shipping_address_id: string;
  shipping_carrier_id: string;
  payment_method: string;
  notes?: string;
  items: CreateOrderItemInput[];
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  notes?: string;
  payment_id?: string;
}

export interface OrderFilters {
  user_id?: string;
  status?: OrderStatus;
  from_date?: string;
  to_date?: string;
  order_number?: string;
  page?: number;
  limit?: number;
}

export interface OrderSummary {
  subtotal: number;
  shipping_cost: number;
  total: number;
  items_count: number;
}

// Valid status transitions
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['payment_confirmed', 'cancelled', 'failed'],
  payment_confirmed: ['processing', 'refunded', 'cancelled'],
  processing: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
  failed: []
};

// Status labels in Spanish
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente de pago',
  payment_confirmed: 'Pago confirmado',
  processing: 'Procesando',
  ready_to_ship: 'Listo para enviar',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Fallido'
};
