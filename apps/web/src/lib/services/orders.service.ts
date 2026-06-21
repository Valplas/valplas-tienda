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
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
}

export interface OrderUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  paymentMethod: string;
  paymentId: string | null;
  notes: string | null;
  shippingAddress?: OrderShippingAddress;
  shippingCarrier?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  user?: OrderUser;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  shippingAddressId: string;
  carrierId: string;
  paymentMethod: 'mercadopago';
  notes?: string;
  items: Array<{ productId: string; quantity: number }>;
  payerIdentification?: { type: string; number: string };
}

export interface CreateOrderResponse {
  order: Order;
  paymentUrl?: string; // URL de Mercado Pago para pagar
}

/**
 * Crear una orden desde el carrito actual
 */
export async function createOrder(
  request: CreateOrderRequest
): Promise<ApiResponse<CreateOrderResponse>> {
  return post<CreateOrderResponse>('/orders', {
    shipping_address_id: request.shippingAddressId,
    shipping_carrier_id: request.carrierId,
    payment_method: request.paymentMethod,
    notes: request.notes,
    items: request.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity
    })),
    payer_identification: request.payerIdentification
  });
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
 * Obtener orden por orderNumber
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
  fromDate?: string;
  toDate?: string;
  search?: string;
  includeItems?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.fromDate) query.set('from_date', params.fromDate);
  if (params?.toDate) query.set('to_date', params.toDate);
  if (params?.search) query.set('search', params.search);
  if (params?.includeItems) query.set('include_items', 'true');

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
  productId: string;
  priceListId: string;
  quantity: number;
}

export async function adminCreateOrder(data: {
  userId: string;
  shippingAddressId?: string;
  items: AdminCreateOrderItem[];
  notes?: string;
  paymentMethod?: string;
}): Promise<Order> {
  const res = await post<Order>('/orders/admin/create', {
    user_id: data.userId,
    shipping_address_id: data.shippingAddressId,
    items: data.items.map((item) => ({
      product_id: item.productId,
      price_list_id: item.priceListId,
      quantity: item.quantity
    })),
    notes: data.notes,
    payment_method: data.paymentMethod
  });
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear pedido');
  return res.data;
}

export interface AdminUpdateOrderItem {
  productId: string;
  priceListId: string;
  quantity: number;
}

export async function adminUpdateOrder(
  id: string,
  data: {
    shippingAddressId: string;
    items: AdminUpdateOrderItem[];
  }
): Promise<Order> {
  const res = await patch<Order>(`/orders/admin/${id}`, {
    shipping_address_id: data.shippingAddressId,
    items: data.items.map((item) => ({
      product_id: item.productId,
      price_list_id: item.priceListId,
      quantity: item.quantity
    }))
  });
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar pedido');
  return res.data;
}
