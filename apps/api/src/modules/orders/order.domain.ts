// apps/api/src/modules/orders/order.domain.ts

import * as orderRepository from './order.repository.js';
import { createOrderPreference } from '../../infrastructure/external/mercadopago.js';
import * as addressRepository from '../addresses/address.repository.js';
import * as shippingRepository from '../shipping/shipping.repository.js';
import { findProductById, findProductsByIds } from '../products/product.repository.js';
import { getTiersForCartItems } from '../cart/cart.repository.js';
import { calculatePrice } from '../price-lists/price-list.service.js';
import { getTierByProductAndPriceList } from '../products/price-tiers/price-tier.service.js';
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
    user_id: userId,
    // La vista "Mis pedidos" del cliente renderiza la cantidad de items de
    // cada orden — sin esto el front recibe orders sin `items` y explota.
    includeItems: true
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
): Promise<{ order: OrderWithDetails; paymentUrl?: string }> {
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

  // Validate items and calculate totals.
  // Batch lookup (WHERE id = ANY) en lugar de un query por ítem para evitar N+1.
  let subtotal = 0;
  const itemsWithPrices = [];

  const products = await findProductsByIds(data.items.map((i) => i.product_id));
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Tiers (precio de lista por bulto) para los ítems que traen price_list_id.
  // Batch en un solo query para evitar N+1. Sin tier => unidad suelta.
  const tierMap = await getTiersForCartItems(
    data.items
      .filter((i) => i.price_list_id)
      .map((i) => ({ productId: i.product_id, priceListId: i.price_list_id as string }))
  );

  for (const item of data.items) {
    const product = productMap.get(item.product_id);

    if (!product) {
      throw new Error(`Producto ${item.product_id} no encontrado`);
    }

    if (!product.isActive) {
      throw new Error(`Producto ${product.name} no está disponible`);
    }

    // Semántica de bultos: quantity = bultos; bundleSize = unidades por bulto.
    const tier = item.price_list_id
      ? tierMap.get(`${item.product_id}:${item.price_list_id}`)
      : undefined;
    const bundleSize = tier?.minQuantity ?? 1;
    const unitPrice = tier?.unitPrice ?? product.basePrice;
    const realQuantity = item.quantity * bundleSize; // unidades reales (para stock)
    const pricePerBundle = Math.trunc(unitPrice * bundleSize * 100) / 100;
    const itemSubtotal = Math.trunc(pricePerBundle * item.quantity * 100) / 100;

    // El stock se controla en unidades reales, no en bultos.
    const availableStock = product.stock - product.reservedStock;
    if (availableStock < realQuantity) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${availableStock}, solicitado: ${realQuantity}`
      );
    }

    subtotal += itemSubtotal;

    itemsWithPrices.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity, // bultos
      real_quantity: realQuantity, // unidades
      bundle_size_snapshot: bundleSize,
      unit_price: pricePerBundle, // precio por bulto (trigger: subtotal = quantity × unit_price)
      subtotal: itemSubtotal,
      price_list_id: item.price_list_id
    });
  }

  // Get shipping cost — mismas zonas/tarifas que la cotización pública
  const zones = await shippingRepository.findZonesByPostcode(address.postcode);
  if (zones.length === 0) {
    throw new Error('No hay envíos disponibles para este código postal');
  }

  const rates = await shippingRepository.findRatesByZonesAndAmount(
    zones.map((z) => z.id),
    subtotal
  );
  const selectedRate = rates.find((r) => r.carrier_id === data.shipping_carrier_id);

  if (!selectedRate) {
    throw new Error('Tarifa de envío no encontrada para este transportista');
  }

  // max_amount = umbral de envío gratis (igual que en la cotización)
  const isFreeShipping = selectedRate.max_amount != null && subtotal >= selectedRate.max_amount;
  const shippingCost = isFreeShipping ? 0 : selectedRate.price;
  const total = subtotal + shippingCost;

  // Create order — snapshot de envío desde la dirección validada (columnas NOT NULL)
  const order = await orderRepository.createOrder(
    userId,
    {
      ...data,
      items: itemsWithPrices
    },
    subtotal,
    shippingCost,
    total,
    {
      shipping_street: address.street,
      shipping_street_number: address.street_number,
      shipping_floor: address.floor ?? null,
      shipping_apartment: address.apartment ?? null,
      shipping_city: address.city,
      shipping_province: address.province,
      shipping_postcode: address.postcode,
      carrier_name: carrier.name
    }
  );

  // Return with details
  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);

  if (!orderWithDetails) {
    throw new Error('Error al crear orden');
  }

  let paymentUrl: string | undefined;
  if (data.payment_method === 'mercadopago') {
    paymentUrl = await createOrderPreference({
      orderNumber: orderWithDetails.order_number,
      shippingCost,
      items: orderWithDetails.items.map((item) => ({
        id: item.product_id,
        title: item.product_name,
        description: item.product_sku,
        quantity: item.quantity,
        unit_price: item.unit_price
      })),
      payer: orderWithDetails.user?.email
        ? {
            email: orderWithDetails.user.email,
            name: orderWithDetails.user.first_name ?? undefined,
            surname: orderWithDetails.user.last_name ?? undefined,
            phone: orderWithDetails.user.phone ?? undefined,
            identification: data.payer_identification,
            address: {
              zip_code: orderWithDetails.shipping_postcode,
              street_name: orderWithDetails.shipping_street,
              street_number: orderWithDetails.shipping_street_number
            }
          }
        : undefined
    });
  }

  return { order: orderWithDetails, paymentUrl };
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
  // Validate address if provided
  let addressSnapshot = {
    shipping_street: '',
    shipping_street_number: '',
    shipping_floor: null as string | null,
    shipping_apartment: null as string | null,
    shipping_city: '',
    shipping_province: '',
    shipping_postcode: ''
  };

  if (data.shipping_address_id) {
    const address = await addressRepository.findAddressById(data.shipping_address_id);
    if (!address || address.user_id !== data.user_id || !address.is_active) {
      throw new Error('Dirección de envío inválida');
    }
    addressSnapshot = {
      shipping_street: address.street,
      shipping_street_number: address.street_number,
      shipping_floor: address.floor ?? null,
      shipping_apartment: address.apartment ?? null,
      shipping_city: address.city,
      shipping_province: address.province,
      shipping_postcode: address.postcode
    };
  }

  // Validate items, calculate prices server-side, and build totals
  let subtotal = 0;
  const validatedItems = [];

  for (const item of data.items) {
    const product = await findProductById(item.product_id);
    if (!product || !product.isActive) {
      throw new Error(`Producto ${item.product_id} no encontrado o inactivo`);
    }

    const availableStock = product.stock - product.reservedStock;

    // Admin orders bypass tier requirement — default bundle size to 1 if no tier exists
    let bundleSizeSnapshot = 1;
    try {
      const tier = await getTierByProductAndPriceList(item.product_id, item.price_list_id);
      bundleSizeSnapshot = tier.minQuantity;
    } catch {
      // No tier configured for this product+price list, treat as unit sale
    }
    const realQuantity = item.quantity * bundleSizeSnapshot;

    if (availableStock < realQuantity) {
      throw new Error(
        `Stock insuficiente para ${product.name}. Disponible: ${availableStock}, requerido: ${realQuantity}`
      );
    }

    const { unitPrice, costPrice } = await calculatePrice(item.price_list_id, item.product_id);

    subtotal += Math.trunc(unitPrice * realQuantity * 100) / 100;
    validatedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      bundle_size_snapshot: bundleSizeSnapshot,
      real_quantity: realQuantity,
      unit_price: unitPrice,
      price_list_id: item.price_list_id,
      cost_price_snapshot: costPrice
    });
  }

  subtotal = Math.trunc(subtotal * 100) / 100;

  const order = await orderRepository.createAdminOrder(adminId, {
    ...data,
    ...addressSnapshot,
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

  // Filter out items with quantity = 0, validate and calculate prices server-side
  const activeItems = data.items.filter((i) => i.quantity > 0);
  if (activeItems.length === 0) {
    throw new Error('El pedido debe tener al menos un producto con cantidad mayor a 0');
  }

  const enrichedItems = [];
  for (const item of activeItems) {
    const product = await findProductById(item.product_id);
    if (!product || !product.isActive) {
      throw new Error(`Producto ${item.product_id} no encontrado o inactivo`);
    }
    // Admin orders bypass tier requirement — default bundle size to 1 if no tier exists
    let bundleSizeSnapshot = 1;
    try {
      const tier = await getTierByProductAndPriceList(item.product_id, item.price_list_id);
      bundleSizeSnapshot = tier.minQuantity;
    } catch {
      // No tier configured for this product+price list, treat as unit sale
    }
    const realQuantity = item.quantity * bundleSizeSnapshot;
    const { unitPrice, costPrice } = await calculatePrice(item.price_list_id, item.product_id);
    enrichedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      bundle_size_snapshot: bundleSizeSnapshot,
      real_quantity: realQuantity,
      unit_price: unitPrice,
      price_list_id: item.price_list_id,
      cost_price_snapshot: costPrice
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
