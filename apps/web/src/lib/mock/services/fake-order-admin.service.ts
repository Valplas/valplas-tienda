/**
 * Mock Order Admin Service
 * All functions prefixed with fake_ to indicate mock implementation
 */

import { Order, OrderStatus } from '@/types';
import { MOCK_ORDERS } from '../data/orders';

const STORAGE_KEY = 'valplas_orders';

// Valid status transitions
const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: []
};

// Load orders from localStorage or use defaults
function loadOrders(): Order[] {
  if (typeof window === 'undefined') return MOCK_ORDERS;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return MOCK_ORDERS;
    }
  }
  return MOCK_ORDERS;
}

// Save orders to localStorage
function saveOrders(orders: Order[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
}

/**
 * Get all orders with optional filters
 */
export async function fake_getOrders(filters?: {
  status?: OrderStatus;
  search?: string;
  userId?: string;
}): Promise<Order[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  let orders = loadOrders();

  // Filter by status
  if (filters?.status) {
    orders = orders.filter((o) => o.status === filters.status);
  }

  // Filter by search (order number or customer name)
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(search) ||
        o.user?.firstName?.toLowerCase().includes(search) ||
        o.user?.lastName?.toLowerCase().includes(search) ||
        o.user?.email?.toLowerCase().includes(search)
    );
  }

  // Filter by user
  if (filters?.userId) {
    orders = orders.filter((o) => o.userId === filters.userId);
  }

  // Sort by createdAt desc (newest first)
  return orders.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Get order by ID with full details
 */
export async function fake_getOrderById(id: string): Promise<Order | null> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const orders = loadOrders();
  return orders.find((o) => o.id === id) ?? null;
}

/**
 * Update order status
 */
export async function fake_updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  notes?: string
): Promise<Order> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const orders = loadOrders();
  const index = orders.findIndex((o) => o.id === orderId);

  if (index === -1) {
    throw new Error('Pedido no encontrado');
  }

  const order = orders[index];
  const currentStatus = order.status;

  // Validate status transition
  const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  if (!validTransitions.includes(newStatus)) {
    throw new Error(
      `No se puede cambiar de "${getStatusLabel(currentStatus)}" a "${getStatusLabel(newStatus)}"`
    );
  }

  // Update order
  const now = new Date().toISOString();
  const updatedOrder: Order = {
    ...order,
    status: newStatus,
    updatedAt: now
  };

  // Update status-specific timestamps
  if (newStatus === OrderStatus.SHIPPED && !order.shippedAt) {
    updatedOrder.shippedAt = now;
    // Generate tracking number if not exists
    if (!updatedOrder.trackingNumber) {
      const dateStr = now.slice(0, 10).replace(/-/g, '');
      const orderNum = updatedOrder.orderNumber.split('-')[2];
      updatedOrder.trackingNumber = `VLP${dateStr}${orderNum}`;
    }
  }

  if (newStatus === OrderStatus.DELIVERED && !order.deliveredAt) {
    updatedOrder.deliveredAt = now;
  }

  if (newStatus === OrderStatus.CANCELLED && !order.cancelledAt) {
    updatedOrder.cancelledAt = now;
  }

  orders[index] = updatedOrder;
  saveOrders(orders);

  // In a real app, this would create an audit log entry
  console.log('Order status updated:', {
    orderId,
    from: currentStatus,
    to: newStatus,
    notes,
    timestamp: now
  });

  return updatedOrder;
}

/**
 * Get status label in Spanish
 */
function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'Pendiente',
    [OrderStatus.PROCESSING]: 'En proceso',
    [OrderStatus.SHIPPED]: 'Enviado',
    [OrderStatus.DELIVERED]: 'Entregado',
    [OrderStatus.CANCELLED]: 'Cancelado'
  };
  return labels[status];
}

/**
 * Get valid next statuses for an order
 */
export function fake_getValidNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_STATUS_TRANSITIONS[currentStatus];
}
