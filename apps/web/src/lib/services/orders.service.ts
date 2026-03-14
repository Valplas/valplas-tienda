// apps/web/src/lib/services/orders.service.ts

import { get, post, patch } from '../api';
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
  | 'refunded'
  | 'shipped'
  | 'failed';

export interface OrderShippingAddress {
  id: string;
  alias: string;
  street: string;
  street_number: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
}

export interface OrderUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

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
  notes: string | null;
  shipping_address?: OrderShippingAddress;
  shipping_carrier?: {
    id: string;
    name: string;
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
  user?: OrderUser;
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

// ─── Admin ────────────────────────────────────────────────────────────────────

// Valid status transitions (mirrors backend VALID_STATUS_TRANSITIONS)
const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
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

export function getValidNextStatuses(currentStatus: string): string[] {
  return ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export async function getAdminOrders(params?: {
  page?: number;
  limit?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.from_date) query.set('from_date', params.from_date);
  if (params?.to_date) query.set('to_date', params.to_date);
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const res = await get<Order[]>(`/orders/admin/all${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) return { orders: [], total: 0, totalPages: 0 };
  return {
    orders: res.data,
    total: res.pagination?.total ?? res.data.length,
    totalPages: res.pagination?.totalPages ?? 1
  };
}

// NOTE: Same endpoint as getOrderById but used from admin context.
// In the future, admin may need a separate admin-scoped endpoint.
export async function getAdminOrderById(id: string): Promise<Order> {
  const res = await get<Order>(`/orders/${id}`);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Pedido no encontrado');
  return res.data;
}

export async function updateOrderStatus(id: string, status: string): Promise<Order> {
  const res = await patch<Order>(`/orders/${id}/status`, { status });
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar estado');
  return res.data;
}

export interface AdminCreateOrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export async function adminCreateOrder(data: {
  user_id: string;
  shipping_address_id?: string;
  items: Array<AdminCreateOrderItem & { price_list_id?: string }>;
  notes?: string;
  payment_method?: string;
}): Promise<Order> {
  const res = await post<Order>('/orders/admin/create', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear pedido');
  return res.data;
}

export interface AdminUpdateOrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export async function adminUpdateOrder(
  id: string,
  data: {
    shipping_address_id: string;
    items: AdminUpdateOrderItem[];
  }
): Promise<Order> {
  const res = await patch<Order>(`/orders/admin/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar pedido');
  return res.data;
}
