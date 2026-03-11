// apps/api/src/modules/orders/order.domain.ts

import * as orderRepository from './order.repository.js';
import * as addressRepository from '../addresses/address.repository.js';
import * as shippingRepository from '../shipping/shipping.repository.js';
import { findProductById } from '../products/product.repository.js';
import { VALID_STATUS_TRANSITIONS } from './order.types.js';
import type {
  Order,
  OrderWithDetails,
  CreateOrderInput,
  CreateAdminOrderInput,
  UpdateAdminOrderInput,
  UpdateOrderStatusInput,
  OrderFilters
} from './order.types.js';

/**
 * Get user's orders
 */
export async function getUserOrders(userId: string, filters: Omit<OrderFilters, 'user_id'>) {
  return orderRepository.findOrders({
    ...filters,
    user_id: userId
  });
}

/**
 * Get all orders (admin only)
 */
export async function getAllOrders(filters: OrderFilters) {
  return orderRepository.findOrders(filters);
}

/**
 * Get order by ID
 */
export async function getOrderById(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<OrderWithDetails> {
  const order = await orderRepository.findOrderWithDetails(id);

  if (!order) {
    throw new Error('Orden no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new Error('No tienes permiso para ver esta orden');
  }

  return order;
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(
  orderNumber: string,
  userId: string,
  isAdmin: boolean = false
): Promise<OrderWithDetails> {
  const order = await orderRepository.findOrderByNumber(orderNumber);

  if (!order) {
    throw new Error('Orden no encontrada');
  }

  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);

  if (!orderWithDetails) {
    throw new Error('Error al obtener detalles de la orden');
  }

  // Check ownership unless admin
  if (!isAdmin && orderWithDetails.user_id !== userId) {
    throw new Error('No tienes permiso para ver esta orden');
  }

  return orderWithDetails;
}

/**
 * Create order from cart or items
 */
export async function createOrder(
  userId: string,
  data: CreateOrderInput
): Promise<OrderWithDetails> {
  // Validate address belongs to user and is active
  const address = await addressRepository.findAddressById(data.shipping_address_id);
  if (!address || address.user_id !== userId || !address.is_active) {
    throw new Error('Dirección de envío inválida');
  }

  // Validate shipping carrier exists and is active
  const carrier = await shippingRepository.findCarrierById(data.shipping_carrier_id);
  if (!carrier || !carrier.is_active) {
    throw new Error('Transportista inválido');
  }

  // Validate items and calculate totals
  let subtotal = 0;
  const itemsWithPrices = [];

  for (const item of data.items) {
    const product = await findProductById(item.product_id);

    if (!product) {
      throw new Error(`Producto ${item.product_id} no encontrado`);
    }

    if (!product.is_active) {
      throw new Error(`Producto ${product.name} no está disponible`);
    }

    // Check stock availability
    const availableStock = product.stock - product.reserved_stock;
    if (availableStock < item.quantity) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}`
      );
    }

    const itemSubtotal = product.base_price * item.quantity;
    subtotal += itemSubtotal;

    itemsWithPrices.push({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: product.base_price,
      subtotal: itemSubtotal
    });
  }

  // Get shipping cost
  const zone = await shippingRepository.findZoneByPostcode(address.postcode);
  if (!zone) {
    throw new Error('No hay envíos disponibles para este código postal');
  }

  const rates = await shippingRepository.findRatesByZoneAndAmount(zone.id, subtotal);
  const selectedRate = rates.find((r) => r.carrier_id === data.shipping_carrier_id);

  if (!selectedRate) {
    throw new Error('Tarifa de envío no encontrada para este transportista');
  }

  const shippingCost = selectedRate.price;
  const total = subtotal + shippingCost;

  // Create order
  const order = await orderRepository.createOrder(
    userId,
    {
      ...data,
      items: itemsWithPrices
    },
    subtotal,
    shippingCost,
    total
  );

  // Return with details
  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);

  if (!orderWithDetails) {
    throw new Error('Error al crear orden');
  }

  return orderWithDetails;
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  data: UpdateOrderStatusInput,
  userId: string,
  isAdmin: boolean = false
): Promise<Order> {
  const order = await orderRepository.findOrderById(orderId);

  if (!order) {
    throw new Error('Orden no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new Error('No tienes permiso para modificar esta orden');
  }

  // Validate status transition
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status];
  if (!validTransitions.includes(data.status)) {
    throw new Error(
      `Transición de estado inválida: ${order.status} -> ${data.status}. ` +
        `Estados válidos: ${validTransitions.join(', ')}`
    );
  }

  // Update status
  const updated = await orderRepository.updateOrderStatus(orderId, data, userId);

  if (!updated) {
    throw new Error('Error al actualizar estado de la orden');
  }

  return updated;
}

/**
 * Cancel order
 */
export async function cancelOrder(
  orderId: string,
  notes: string,
  userId: string,
  isAdmin: boolean = false
): Promise<Order> {
  const order = await orderRepository.findOrderById(orderId);

  if (!order) {
    throw new Error('Orden no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new Error('No tienes permiso para cancelar esta orden');
  }

  // Check if cancellation is allowed
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status];
  if (!validTransitions.includes('cancelled')) {
    throw new Error(`No se puede cancelar una orden en estado: ${order.status}`);
  }

  // Cancel order
  const cancelled = await orderRepository.cancelOrder(orderId, notes, userId);

  if (!cancelled) {
    throw new Error('Error al cancelar orden');
  }

  return cancelled;
}

/**
 * Create order by admin (bypasses shipping validation, uses pre-calculated prices)
 */
export async function createAdminOrder(
  adminId: string,
  data: CreateAdminOrderInput
): Promise<OrderWithDetails> {
  // Validate address belongs to user
  const address = await addressRepository.findAddressById(data.shipping_address_id);
  if (!address || address.user_id !== data.user_id || !address.is_active) {
    throw new Error('Dirección de envío inválida');
  }

  // Validate items and calculate totals
  let subtotal = 0;
  const validatedItems = [];

  for (const item of data.items) {
    const product = await findProductById(item.product_id);
    if (!product || !product.is_active) {
      throw new Error(`Producto ${item.product_id} no encontrado o inactivo`);
    }

    const availableStock = product.stock - product.reserved_stock;
    if (availableStock < item.quantity) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}`
      );
    }

    const itemSubtotal = Math.round(item.unit_price * item.quantity * 100) / 100;
    subtotal += itemSubtotal;
    validatedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;

  const order = await orderRepository.createAdminOrder(adminId, {
    ...data,
    shipping_street: address.street,
    shipping_street_number: address.street_number,
    shipping_floor: address.floor ?? null,
    shipping_apartment: address.apartment ?? null,
    shipping_city: address.city,
    shipping_province: address.province,
    shipping_postcode: address.postcode,
    items: validatedItems,
    subtotal,
    total: subtotal
  });

  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);
  if (!orderWithDetails) {
    throw new Error('Error al obtener detalles de la orden creada');
  }

  return orderWithDetails;
}

/**
 * Update order items and/or address (admin only, processing status only)
 */
export async function updateAdminOrder(
  orderId: string,
  data: UpdateAdminOrderInput,
  adminId: string
): Promise<OrderWithDetails> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) throw new Error('Orden no encontrada');
  if (order.status !== 'processing') {
    throw new Error('Solo se pueden editar órdenes en estado "En proceso"');
  }

  // Validate address belongs to the order's user and is active
  const address = await addressRepository.findAddressById(data.shipping_address_id);
  if (!address || address.user_id !== order.user_id || !address.is_active) {
    throw new Error('Dirección de envío inválida');
  }

  // Validate + enrich items with name/sku from DB
  const enrichedItems = [];
  for (const item of data.items) {
    const product = await findProductById(item.product_id);
    if (!product || !product.is_active) {
      throw new Error(`Producto ${item.product_id} no encontrado o inactivo`);
    }
    enrichedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
  }

  const updated = await orderRepository.updateAdminOrder(
    orderId,
    {
      items: enrichedItems,
      shipping_address_id: data.shipping_address_id,
      shipping_street: address.street,
      shipping_street_number: address.street_number,
      shipping_floor: address.floor ?? null,
      shipping_apartment: address.apartment ?? null,
      shipping_city: address.city,
      shipping_province: address.province,
      shipping_postcode: address.postcode
    },
    adminId
  );

  if (!updated) throw new Error('Error al actualizar pedido');

  const orderWithDetails = await orderRepository.findOrderWithDetails(orderId);
  if (!orderWithDetails) throw new Error('Error al obtener pedido actualizado');
  return orderWithDetails;
}

/**
 * Get order summary statistics
 */
export async function getUserOrderSummary(userId: string): Promise<{
  total_orders: number;
  pending_payment: number;
  processing: number;
  delivered: number;
}> {
  const [total, pending, processing, delivered] = await Promise.all([
    orderRepository.countUserOrders(userId),
    orderRepository.countUserOrders(userId, 'pending_payment'),
    orderRepository.countUserOrders(userId, 'processing'),
    orderRepository.countUserOrders(userId, 'delivered')
  ]);

  return {
    total_orders: total,
    pending_payment: pending,
    processing,
    delivered
  };
}
