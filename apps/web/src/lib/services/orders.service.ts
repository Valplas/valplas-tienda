// apps/web/src/lib/services/orders.service.ts

import { get, post } from '../api';
import type { ApiResponse } from '../api';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_confirmed'
  | 'processing'
  | 'ready_to_ship'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'payment_failed'
  | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  shipping_cost: number;
  total: number;
  payment_method: string;
  payment_id: string | null;
  shipping_address: {
    street: string;
    street_number: string;
    floor: string | null;
    apartment: string | null;
    city: string;
    province: string;
    postcode: string;
  };
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  shipping_address_id: string;
  shipping_zone_id: string;
  carrier_id: string;
  payment_method: 'mercadopago';
  notes?: string;
}

export interface CreateOrderResponse {
  order: Order;
  payment_url?: string; // URL de Mercado Pago para pagar
}

/**
 * Crear una orden desde el carrito actual
 */
export async function createOrder(
  request: CreateOrderRequest
): Promise<ApiResponse<CreateOrderResponse>> {
  return post<CreateOrderResponse>('/orders', request);
}

/**
 * Obtener todas las órdenes del usuario actual
 */
export async function getUserOrders(): Promise<ApiResponse<Order[]>> {
  return get<Order[]>('/orders/me');
}

/**
 * Obtener orden por ID
 */
export async function getOrderById(id: string): Promise<Order> {
  const response = await get<Order>(`/orders/${id}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener orden');
}

/**
 * Obtener orden por order_number
 */
export async function getOrderByNumber(orderNumber: string): Promise<Order> {
  const response = await get<Order>(`/orders/number/${orderNumber}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener orden');
}
