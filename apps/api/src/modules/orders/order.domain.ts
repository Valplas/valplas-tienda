// apps/api/src/modules/orders/order.domain.ts

import * as orderRepository from './order.repository.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { getCarrierShippingCost } from '../shipping/shipping-cost.js';
import {
  priceOrderItems,
  pricingProblemToError,
  type OrderPricingOptions
} from './order-pricing.js';
import { createPaymentLinkForOrder } from './order-payment.js';
import type { CreateOrderChannelOptions } from './order.repository.js';
import * as addressRepository from '../addresses/address.repository.js';
import * as shippingRepository from '../shipping/shipping.repository.js';
import { findProductsByIds } from '../products/product.repository.js';
import { getTiersForCartItems } from '../cart/cart.repository.js';
import { findPriceListsByIds } from '../price-lists/price-list.repository.js';
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
    throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new AppError('ORDER_FORBIDDEN', 'No tienes permiso para ver esta orden', 403);
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
    throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  }

  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);

  if (!orderWithDetails) {
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al obtener detalles de la orden', 500);
  }

  // Check ownership unless admin
  if (!isAdmin && orderWithDetails.user_id !== userId) {
    throw new AppError('ORDER_FORBIDDEN', 'No tienes permiso para ver esta orden', 403);
  }

  return orderWithDetails;
}

export interface CreateOrderOptions extends CreateOrderChannelOptions, OrderPricingOptions {
  /**
   * No crear el link de MP dentro de createOrder: el llamador lo crea después con
   * createPaymentLinkForOrder y decide qué hacer si MP falla (el bot devuelve la orden igual
   * y reintenta el link; el checkout web propaga el error).
   */
  deferPaymentLink?: boolean;
}

/**
 * Create order from cart or items
 */
export async function createOrder(
  userId: string,
  data: CreateOrderInput,
  options: CreateOrderOptions = {}
): Promise<{ order: OrderWithDetails; paymentUrl?: string }> {
  // Validate address belongs to user and is active
  const address = await addressRepository.findAddressById(data.shipping_address_id);
  if (!address || address.user_id !== userId || !address.is_active) {
    throw new AppError('INVALID_SHIPPING_ADDRESS', 'Dirección de envío inválida', 400);
  }

  // Validate shipping carrier exists and is active
  const carrier = await shippingRepository.findCarrierById(data.shipping_carrier_id);
  if (!carrier || !carrier.is_active) {
    throw new AppError('INVALID_CARRIER', 'Transportista inválido', 400);
  }

  // Validate items and calculate totals (batch, sin N+1). El primer problema corta el pedido.
  const { lines, subtotal, problems } = await priceOrderItems(data.items, {
    requireTier: options.requireTier
  });
  if (problems.length > 0) {
    throw pricingProblemToError(problems[0]);
  }
  const itemsWithPrices = lines.map(({ available_stock: _availableStock, ...line }) => line);

  // Get shipping cost — mismas zonas/tarifas que la cotización pública
  const shippingCost = await getCarrierShippingCost(
    address.postcode,
    data.shipping_carrier_id,
    subtotal
  );
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
    },
    { channel: options.channel, clientReference: options.clientReference }
  );

  // Return with details
  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);

  if (!orderWithDetails) {
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al crear orden', 500);
  }

  let paymentUrl: string | undefined;
  if (data.payment_method === 'mercadopago' && !options.deferPaymentLink) {
    paymentUrl = await createPaymentLinkForOrder(orderWithDetails, {
      payerIdentification: data.payer_identification
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
    throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new AppError('ORDER_FORBIDDEN', 'No tienes permiso para modificar esta orden', 403);
  }

  // Validate status transition
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status];
  if (!validTransitions.includes(data.status)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `Transición de estado inválida: ${order.status} -> ${data.status}. ` +
        `Estados válidos: ${validTransitions.join(', ')}`,
      400
    );
  }

  // Update status
  const updated = await orderRepository.updateOrderStatus(orderId, data, userId);

  if (!updated) {
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al actualizar estado de la orden', 500);
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
    throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  }

  // Check ownership unless admin
  if (!isAdmin && order.user_id !== userId) {
    throw new AppError('ORDER_FORBIDDEN', 'No tienes permiso para cancelar esta orden', 403);
  }

  // Check if cancellation is allowed
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status];
  if (!validTransitions.includes('cancelled')) {
    throw new AppError(
      'ORDER_NOT_CANCELLABLE',
      `No se puede cancelar una orden en estado: ${order.status}`,
      400
    );
  }

  // Cancel order
  const cancelled = await orderRepository.cancelOrder(orderId, notes, userId);

  if (!cancelled) {
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al cancelar orden', 500);
  }

  return cancelled;
}

/**
 * Producto, tamaño de bulto y precio unitario de cada ítem de un pedido admin, resueltos con
 * 3 queries en total (productos, listas de precio y tiers) en vez de 4 por ítem. Sin tier activo
 * para (producto, lista) el pedido admin vende por unidad (bulto = 1). El precio unitario usa la
 * misma fórmula que price-list.service.calculatePrice: costo × (1 + margen/100), truncado.
 */
async function resolveAdminItemPricing(
  items: Array<{ product_id: string; price_list_id: string }>
) {
  const [products, priceLists, tierMap] = await Promise.all([
    findProductsByIds([...new Set(items.map((i) => i.product_id))]),
    findPriceListsByIds([...new Set(items.map((i) => i.price_list_id))]),
    getTiersForCartItems(
      items.map((i) => ({ productId: i.product_id, priceListId: i.price_list_id }))
    )
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const priceListMap = new Map(priceLists.map((pl) => [pl.id, pl]));

  return items.map((item) => {
    const product = productMap.get(item.product_id);
    if (!product || !product.isActive) {
      throw new AppError(
        'PRODUCT_NOT_FOUND',
        `Producto ${item.product_id} no encontrado o inactivo`,
        400
      );
    }
    const priceList = priceListMap.get(item.price_list_id);
    if (!priceList) {
      throw new AppError('PRICE_LIST_NOT_FOUND', 'Lista de precios no encontrada', 404);
    }

    const bundleSize = tierMap.get(`${item.product_id}:${item.price_list_id}`)?.minQuantity ?? 1;
    const costPrice = Number(product.costPrice);
    const unitPrice = Math.trunc(costPrice * (1 + Number(priceList.margin) / 100) * 100) / 100;

    return { product, bundleSize, unitPrice, costPrice };
  });
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
      throw new AppError('INVALID_SHIPPING_ADDRESS', 'Dirección de envío inválida', 400);
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

  // Precios, bultos y producto de TODOS los ítems en 3 queries (antes: 4 por ítem)
  const pricing = await resolveAdminItemPricing(data.items);

  for (const [index, item] of data.items.entries()) {
    const { product, bundleSize: bundleSizeSnapshot, unitPrice, costPrice } = pricing[index];

    const availableStock = product.stock - product.reservedStock;
    const realQuantity = item.quantity * bundleSizeSnapshot;

    if (availableStock < realQuantity) {
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `Stock insuficiente para ${product.name}. Disponible: ${availableStock}, requerido: ${realQuantity}`,
        409
      );
    }

    // unit_price / cost_price_snapshot se guardan POR BULTO (igual que el checkout web):
    // el trigger de subtotal y la columna revenue multiplican por quantity (bultos).
    const pricePerBundle = Math.round(unitPrice * bundleSizeSnapshot * 100) / 100;
    const costPerBundle = Math.round(costPrice * bundleSizeSnapshot * 100) / 100;

    subtotal += Math.round(pricePerBundle * item.quantity * 100) / 100;
    validatedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      bundle_size_snapshot: bundleSizeSnapshot,
      real_quantity: realQuantity,
      unit_price: pricePerBundle,
      price_list_id: item.price_list_id,
      cost_price_snapshot: costPerBundle
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;

  const order = await orderRepository.createAdminOrder(adminId, {
    ...data,
    ...addressSnapshot,
    items: validatedItems,
    subtotal,
    total: subtotal
  });

  const orderWithDetails = await orderRepository.findOrderWithDetails(order.id);
  if (!orderWithDetails) {
    throw new AppError(
      'ORDER_OPERATION_FAILED',
      'Error al obtener detalles de la orden creada',
      500
    );
  }

  return orderWithDetails;
}

type OrderAddressSnapshot = Pick<
  Order,
  | 'shipping_address_id'
  | 'shipping_street'
  | 'shipping_street_number'
  | 'shipping_floor'
  | 'shipping_apartment'
  | 'shipping_city'
  | 'shipping_province'
  | 'shipping_postcode'
>;

const SNAPSHOT_FIELDS = [
  'shipping_street',
  'shipping_street_number',
  'shipping_floor',
  'shipping_apartment',
  'shipping_city',
  'shipping_province',
  'shipping_postcode'
] as const;

function sameShippingSnapshot(a: OrderAddressSnapshot, b: OrderAddressSnapshot): boolean {
  return SNAPSHOT_FIELDS.every((field) => (a[field] ?? '') === (b[field] ?? ''));
}

const formatArs = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatOrderAddress(
  a: Pick<
    Order,
    'shipping_street' | 'shipping_street_number' | 'shipping_city' | 'shipping_postcode'
  >
): string {
  if (!a.shipping_street) return 'sin dirección';
  return `${a.shipping_street} ${a.shipping_street_number}, ${a.shipping_city} (${a.shipping_postcode})`;
}

/** Nota de auditoría de una edición admin: qué cambió en la dirección y en el envío. */
export function buildAdminEditNote(params: {
  previousAddress: string;
  newAddress: string | null;
  carrierName: string | null;
  currentShippingCost: number;
  newShippingCost: number | null;
}): string {
  const parts = ['Pedido editado por administrador'];
  if (params.newAddress) {
    parts.push(`Dirección: ${params.previousAddress} → ${params.newAddress}`);
    if (params.newShippingCost !== null) {
      const diff = Math.round((params.newShippingCost - params.currentShippingCost) * 100) / 100;
      const diffText =
        diff > 0
          ? `diferencia a cobrar al cliente: ${formatArs(diff)}`
          : diff < 0
            ? `diferencia a favor del cliente: ${formatArs(-diff)}`
            : 'sin diferencia';
      parts.push(
        `Envío${params.carrierName ? ` (${params.carrierName})` : ''}: ${formatArs(params.currentShippingCost)} → ${formatArs(params.newShippingCost)} (${diffText})`
      );
    } else if (params.carrierName) {
      parts.push(`Envío: se mantiene el costo de ${formatArs(params.currentShippingCost)}`);
    }
  }
  return parts.join('. ');
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
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  if (order.status !== 'processing') {
    throw new AppError(
      'ORDER_NOT_EDITABLE',
      'Solo se pueden editar órdenes en estado "En proceso"',
      400
    );
  }

  // Validate address belongs to the order's user and is active. Sin chequeo de zona: los
  // pedidos del admin pueden ir a direcciones sin cobertura (el front avisa).
  const address = data.shipping_address_id
    ? await addressRepository.findAddressById(data.shipping_address_id)
    : null;
  if (
    data.shipping_address_id &&
    (!address || address.user_id !== order.user_id || !address.is_active)
  ) {
    throw new AppError('INVALID_SHIPPING_ADDRESS', 'Dirección de envío inválida', 400);
  }

  // Sin dirección nueva se conserva el snapshot actual de la orden
  const snapshot: OrderAddressSnapshot = address
    ? {
        shipping_address_id: address.id,
        shipping_street: address.street,
        shipping_street_number: address.street_number,
        shipping_floor: address.floor ?? null,
        shipping_apartment: address.apartment ?? null,
        shipping_city: address.city,
        shipping_province: address.province,
        shipping_postcode: address.postcode
      }
    : {
        shipping_address_id: order.shipping_address_id,
        shipping_street: order.shipping_street,
        shipping_street_number: order.shipping_street_number,
        shipping_floor: order.shipping_floor,
        shipping_apartment: order.shipping_apartment,
        shipping_city: order.shipping_city,
        shipping_province: order.shipping_province,
        shipping_postcode: order.shipping_postcode
      };

  // Cambio real: otra dirección, o la misma con datos corregidos desde el backoffice
  const addressChanged =
    address !== null &&
    (address.id !== order.shipping_address_id || !sameShippingSnapshot(snapshot, order));

  // Carrier externo (ej: Andreani): el envío ya está generado con esa dirección
  const carrier = order.shipping_carrier_id
    ? await shippingRepository.findCarrierById(order.shipping_carrier_id)
    : null;
  if (addressChanged && carrier?.is_external) {
    throw new AppError(
      'SHIPPING_ADDRESS_LOCKED',
      `El envío de este pedido lo gestiona ${carrier.name}: la dirección no se puede modificar`,
      400
    );
  }

  // Filter out items with quantity = 0, validate and calculate prices server-side
  const activeItems = data.items.filter((i) => i.quantity > 0);
  if (activeItems.length === 0) {
    throw new AppError(
      'EMPTY_ORDER',
      'El pedido debe tener al menos un producto con cantidad mayor a 0',
      400
    );
  }

  const enrichedItems = [];
  // Precios, bultos y producto de TODOS los ítems en 3 queries (antes: 4 por ítem)
  const pricing = await resolveAdminItemPricing(activeItems);
  for (const [index, item] of activeItems.entries()) {
    const { product, bundleSize: bundleSizeSnapshot, unitPrice, costPrice } = pricing[index];
    const realQuantity = item.quantity * bundleSizeSnapshot;
    // Precio y costo POR BULTO, igual que en createAdminOrder y en el checkout web
    enrichedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      bundle_size_snapshot: bundleSizeSnapshot,
      real_quantity: realQuantity,
      unit_price: Math.round(unitPrice * bundleSizeSnapshot * 100) / 100,
      price_list_id: item.price_list_id,
      cost_price_snapshot: Math.round(costPrice * bundleSizeSnapshot * 100) / 100
    });
  }

  // Costo de envío: se mantiene el cobrado salvo que el admin elija recotizar para la nueva dirección
  const currentShippingCost = Number(order.shipping_cost);
  let newShippingCost: number | null = null;
  if (data.shipping_cost_mode === 'recalculate') {
    if (!carrier || !address || !addressChanged) {
      throw new AppError(
        'SHIPPING_COST_NOT_RECALCULABLE',
        'Solo se puede recalcular el envío al cambiar la dirección de un pedido con transportista',
        400
      );
    }
    newShippingCost = await getCarrierShippingCost(
      address.postcode,
      carrier.id,
      orderRepository.calculateAdminOrderSubtotal(enrichedItems)
    );
  }

  const updated = await orderRepository.updateAdminOrder(
    orderId,
    {
      items: enrichedItems,
      ...snapshot,
      shipping_cost: newShippingCost,
      history_note: buildAdminEditNote({
        previousAddress: formatOrderAddress(order),
        newAddress: addressChanged ? formatOrderAddress(snapshot) : null,
        carrierName: carrier?.name ?? null,
        currentShippingCost,
        newShippingCost
      })
    },
    adminId
  );

  if (!updated) throw new AppError('ORDER_OPERATION_FAILED', 'Error al actualizar pedido', 500);

  const orderWithDetails = await orderRepository.findOrderWithDetails(orderId);
  if (!orderWithDetails)
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al obtener pedido actualizado', 500);
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
