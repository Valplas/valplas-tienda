/**
 * Fake Order Service - Pedidos mock
 * Simula operaciones de pedidos con localStorage
 */

import { ApiResponse } from '@/lib/api';
import {
  Order,
  OrderStatus,
  OrderItem,
  Address,
  PaginatedResponse,
  PaginationParams
} from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit, setItem } from '../utils/local-storage';
import { MOCK_ORDERS, MOCK_USERS } from '../data';
import { fake_getProductById } from './fake-product.service';

const STORAGE_KEY = 'orders';

/**
 * Inicializa pedidos en localStorage
 */
function initOrders(): Order[] {
  return getOrInit(STORAGE_KEY, MOCK_ORDERS);
}

/**
 * Guarda pedidos en localStorage
 */
function saveOrders(orders: Order[]): void {
  setItem(STORAGE_KEY, orders);
}

/**
 * Genera número de orden: VLP-YYYYMMDD-NNNN
 */
function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const orders = initOrders();
  const todayOrders = orders.filter((o) => o.orderNumber.includes(`${year}${month}${day}`));
  const nextNumber = String(todayOrders.length + 1).padStart(4, '0');

  return `VLP-${year}${month}${day}-${nextNumber}`;
}

/**
 * Paginar resultados
 */
function paginate<T>(items: T[], params: PaginationParams): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const start = (page - 1) * limit;
  const end = start + limit;

  const paginatedItems = items.slice(start, end);
  const total = items.length;
  const totalPages = Math.ceil(total / limit);

  return {
    data: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages
    }
  };
}

/**
 * Crear pedido
 */
export async function fake_createOrder(orderData: {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
  shippingAddress: Address;
  shippingCarrier: string;
  shippingCost: number;
  paymentMethod: string;
}): Promise<ApiResponse<Order>> {
  return fakeFetch(async () => {
    const orders = initOrders();

    // Calcular items con precios
    const orderItems: OrderItem[] = [];
    let subtotal = 0;

    for (const item of orderData.items) {
      const productResponse = await fake_getProductById(item.productId);
      if (!productResponse.success || !productResponse.data) {
        return {
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: `Producto ${item.productId} no encontrado`
          }
        };
      }

      const product = productResponse.data;

      // Verificar stock disponible
      if (item.quantity > product.availableStock) {
        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Stock insuficiente para ${product.name}`,
            details: {
              productId: product.id,
              available: product.availableStock,
              requested: item.quantity
            }
          }
        };
      }

      const itemSubtotal = product.finalPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice: product.finalPrice,
        subtotal: itemSubtotal
      });
    }

    const total = subtotal + orderData.shippingCost;

    // Crear orden
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      orderNumber: generateOrderNumber(),
      userId: orderData.userId,
      status: OrderStatus.PENDING,
      items: orderItems,
      subtotal,
      shippingCost: orderData.shippingCost,
      total,
      shippingAddress: orderData.shippingAddress,
      shippingCarrier: orderData.shippingCarrier,
      paymentMethod: orderData.paymentMethod,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: MOCK_USERS.find((u) => u.id === orderData.userId)
    };

    orders.push(newOrder);
    saveOrders(orders);

    return {
      success: true,
      data: newOrder
    };
  });
}

/**
 * Obtener pedidos de un usuario
 */
export async function fake_getUserOrders(
  userId: string,
  pagination: PaginationParams = {}
): Promise<ApiResponse<Order[]>> {
  return fakeFetch(() => {
    const orders = initOrders();
    const userOrders = orders
      .filter((o) => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Más recientes primero

    const paginated = paginate(userOrders, pagination);

    return {
      success: true,
      data: paginated.data,
      pagination: paginated.pagination
    };
  });
}

/**
 * Obtener todos los pedidos (admin)
 */
export async function fake_getAllOrders(
  filters: { status?: OrderStatus } = {},
  pagination: PaginationParams = {}
): Promise<ApiResponse<Order[]>> {
  return fakeFetch(() => {
    let orders = initOrders();

    // Filtrar por estado si se especifica
    if (filters.status) {
      orders = orders.filter((o) => o.status === filters.status);
    }

    // Ordenar por fecha (más recientes primero)
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paginated = paginate(orders, pagination);

    return {
      success: true,
      data: paginated.data,
      pagination: paginated.pagination
    };
  });
}

/**
 * Obtener pedido por ID
 */
export async function fake_getOrderById(id: string): Promise<ApiResponse<Order>> {
  return fakeFetch(() => {
    const orders = initOrders();
    const order = orders.find((o) => o.id === id);

    if (!order) {
      return {
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Pedido no encontrado'
        }
      };
    }

    return {
      success: true,
      data: order
    };
  });
}

/**
 * Obtener pedido por número de orden
 */
export async function fake_getOrderByNumber(orderNumber: string): Promise<ApiResponse<Order>> {
  return fakeFetch(() => {
    const orders = initOrders();
    const order = orders.find((o) => o.orderNumber === orderNumber);

    if (!order) {
      return {
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Pedido no encontrado'
        }
      };
    }

    return {
      success: true,
      data: order
    };
  });
}

/**
 * Actualizar estado de pedido (admin)
 */
export async function fake_updateOrderStatus(
  id: string,
  status: OrderStatus,
  trackingNumber?: string
): Promise<ApiResponse<Order>> {
  return fakeFetch(() => {
    const orders = initOrders();
    const index = orders.findIndex((o) => o.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Pedido no encontrado'
        }
      };
    }

    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...orders[index],
      status,
      updatedAt: now
    };

    // Actualizar timestamps según estado
    if (status === OrderStatus.SHIPPED && !updatedOrder.shippedAt) {
      updatedOrder.shippedAt = now;
      if (trackingNumber) {
        updatedOrder.trackingNumber = trackingNumber;
      }
    } else if (status === OrderStatus.DELIVERED && !updatedOrder.deliveredAt) {
      updatedOrder.deliveredAt = now;
    } else if (status === OrderStatus.CANCELLED && !updatedOrder.cancelledAt) {
      updatedOrder.cancelledAt = now;
    }

    orders[index] = updatedOrder;
    saveOrders(orders);

    return {
      success: true,
      data: updatedOrder
    };
  });
}

/**
 * Cancelar pedido
 */
export async function fake_cancelOrder(id: string): Promise<ApiResponse<Order>> {
  return fake_updateOrderStatus(id, OrderStatus.CANCELLED);
}

/**
 * Simular pago aprobado (webhook Mercado Pago)
 */
export async function fake_approvePayment(
  orderId: string,
  paymentId: string
): Promise<ApiResponse<Order>> {
  return fakeFetch(() => {
    const orders = initOrders();
    const index = orders.findIndex((o) => o.id === orderId);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Pedido no encontrado'
        }
      };
    }

    const updatedOrder: Order = {
      ...orders[index],
      status: OrderStatus.PROCESSING,
      paymentId,
      paymentStatus: 'approved',
      updatedAt: new Date().toISOString()
    };

    orders[index] = updatedOrder;
    saveOrders(orders);

    return {
      success: true,
      data: updatedOrder
    };
  });
}
