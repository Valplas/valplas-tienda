/**
 * Tipos compartidos para ordenes
 */

export type OrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'payment_approved'
  | 'preparing'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  total: number;

  // Direccion de envio (snapshot)
  shipping_street: string | null;
  shipping_street_number: string | null;
  shipping_floor: string | null;
  shipping_apartment: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_postcode: string | null;

  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;

  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface CreateOrderInput {
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  shipping_address_id?: string;
  notes?: string;
}
