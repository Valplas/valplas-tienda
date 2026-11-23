// apps/api/src/modules/bot/bot.domain.ts
//
// Canal de venta WhatsApp: orquesta los servicios existentes (catálogo, usuarios, direcciones,
// envíos, órdenes y Mercado Pago). No reimplementa reglas de negocio: precio, stock y envío
// salen de las mismas funciones que usa el checkout web.

import { AppError } from '../../shared/middleware/error.middleware.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { logger } from '../../infrastructure/logger/index.js';
import { env } from '../../env.js';
import {
  PAYMENT_EXPIRATION_HOURS,
  type PreferenceBackUrls
} from '../../infrastructure/external/mercadopago.js';
import * as catalogRepository from '../catalog/catalog.repository.js';
import * as catalogStateRepository from '../catalog/catalog-state.repository.js';
import * as categoryService from '../categories/category.service.js';
import * as userRepository from '../users/user.repository.js';
import * as addressRepository from '../addresses/address.repository.js';
import * as addressDomain from '../addresses/address.domain.js';
import * as orderRepository from '../orders/order.repository.js';
import * as orderDomain from '../orders/order.domain.js';
import { priceOrderItems, pricingProblemToError } from '../orders/order-pricing.js';
import { expandBotItems } from './bot-units.js';
import { createPaymentLinkForOrder } from '../orders/order-payment.js';
import { getShippingQuote } from '../shipping/shipping.domain.js';
import type { Order, OrderWithDetails } from '../orders/order.types.js';
import type { User } from '../users/user.types.js';
import {
  toBotAddress,
  toBotCategory,
  toBotCustomer,
  toBotOrder,
  toBotOrderSummary,
  toBotProduct,
  toBotQuoteLine,
  type BotQuoteLine,
  toBotShippingOption
} from './bot.mappers.js';
import type {
  CatalogProductsQuery,
  CreateBotOrderInput,
  CreateCustomerAddressInput,
  FindOrCreateCustomerInput,
  OrderActionInput,
  PaginationQuery,
  QuoteInput
} from './bot.validators.js';

const BOT_CHANNEL = 'whatsapp' as const;

// ============= CATÁLOGO =============

/** Versión del catálogo: el bot re-descarga solo cuando catalogVersion cambia. */
export async function getCatalogStatus() {
  const status = await catalogStateRepository.getCatalogStatus();
  return {
    catalogVersion: status.version,
    catalogUpdatedAt: status.updated_at,
    storeInfoUpdatedAt: status.store_info_updated_at
  };
}

export async function listCategories() {
  const tree = await categoryService.listCategories();
  return tree.map(toBotCategory);
}

/** Productos activos y con stock (mismo filtro que el catálogo web). */
export async function searchProducts(filters: CatalogProductsQuery) {
  const { products, total } = await catalogRepository.findPublicProducts(filters);
  return { products: products.map(toBotProduct), total };
}

export async function getProduct(id: string) {
  const [product] = await catalogRepository.findPublicProductsByIds([id]);
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }
  return toBotProduct(product);
}

// ============= CLIENTES =============

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) {
    throw new AppError('INVALID_PHONE', 'Teléfono inválido', 400);
  }
  return phone;
}

/**
 * Cliente activo para un teléfono, comparando por phone_match_key (mismo número nacional, en
 * cualquier formato). Si hay varias cuentas (duplicado pendiente de merge) gana la de teléfono idéntico, después
 * la de orden más reciente; las demás aparecen en las sugerencias de merge del admin.
 */
async function findActiveCustomerByPhone(phone: string): Promise<User | null> {
  const customers = (await userRepository.findUsersByPhoneKey(phone)).filter(
    (user) => user.role === 'customer'
  );
  if (customers.length === 0) return null;

  const active = customers.find((user) => user.is_active);
  if (!active) {
    throw new AppError('CUSTOMER_INACTIVE', 'La cuenta del cliente está desactivada', 403);
  }
  return active;
}

export async function findCustomerByPhone(rawPhone: string) {
  const customer = await findActiveCustomerByPhone(requirePhone(rawPhone));
  if (!customer) {
    throw new AppError('CUSTOMER_NOT_FOUND', 'No hay un cliente con ese teléfono', 404);
  }
  return toBotCustomer(customer);
}

function isUniqueViolation(error: unknown, column: 'phone' | 'email'): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23505' && (pgError.constraint ?? '').includes(column);
}

/**
 * Busca el cliente por teléfono y, si no existe, lo crea (signup_channel = 'whatsapp').
 * Nunca pisa datos de un cliente existente.
 */
export async function findOrCreateCustomer(input: FindOrCreateCustomerInput) {
  const phone = requirePhone(input.phone);

  const existing = await findActiveCustomerByPhone(phone);
  if (existing) {
    return { customer: toBotCustomer(existing), created: false };
  }

  if (input.email) {
    const emailOwner = await userRepository.findUserByEmail(input.email);
    if (emailOwner) {
      throw new AppError('EMAIL_IN_USE', 'El email ya pertenece a otra cuenta', 409);
    }
  }

  try {
    const customer = await userRepository.createChannelCustomer({
      phone,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      signup_channel: BOT_CHANNEL
    });
    logger.info(`[bot] Cliente creado desde WhatsApp: ${customer.id}`);
    return { customer: toBotCustomer(customer), created: true };
  } catch (error) {
    if (isUniqueViolation(error, 'phone')) {
      // Dos mensajes simultáneos del mismo número: el otro request ya lo creó
      const created = await findActiveCustomerByPhone(phone);
      if (created) return { customer: toBotCustomer(created), created: false };
      // El número exacto es de una cuenta que no es cliente (staff)
      throw new AppError('PHONE_IN_USE', 'El teléfono ya pertenece a otra cuenta', 409);
    }
    if (isUniqueViolation(error, 'email')) {
      throw new AppError('EMAIL_IN_USE', 'El email ya pertenece a otra cuenta', 409);
    }
    throw error;
  }
}

/** Cliente existente, no borrado (ni absorbido por un merge) y activo. */
async function requireCustomer(customerId: string): Promise<User> {
  const user = await userRepository.findUserById(customerId);
  if (!user || user.role !== 'customer') {
    throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado', 404);
  }
  if (!user.is_active) {
    throw new AppError('CUSTOMER_INACTIVE', 'La cuenta del cliente está desactivada', 403);
  }
  return user;
}

export async function getCustomerAddresses(customerId: string, pagination: PaginationQuery) {
  await requireCustomer(customerId);
  const { addresses, total } = await addressDomain.getUserAddresses(customerId, {
    is_active: true,
    page: pagination.page,
    limit: pagination.limit
  });
  return { addresses: addresses.map(toBotAddress), total };
}

export async function addCustomerAddress(customerId: string, data: CreateCustomerAddressInput) {
  await requireCustomer(customerId);
  const address = await addressDomain.createAddress(customerId, data);
  return toBotAddress(address);
}

export async function getCustomerOrders(customerId: string, pagination: PaginationQuery) {
  await requireCustomer(customerId);
  const { orders, total } = await orderRepository.findOrders({
    user_id: customerId,
    page: pagination.page,
    limit: pagination.limit
  });
  // El bot siempre pagina con page: el total viene calculado (null solo en modo cursor)
  return { orders: orders.map(toBotOrderSummary), total: total ?? orders.length };
}

// ============= COTIZACIÓN =============

/**
 * Líneas cotizadas con nombre y texto de la presentación, indexadas por posición en los ítems
 * enviados a pricing. Una sola consulta batch de productos (sin N+1).
 */
async function buildQuoteLines(
  lines: Awaited<ReturnType<typeof priceOrderItems>>['lines']
): Promise<Map<number, BotQuoteLine>> {
  const productIds = [...new Set(lines.map((line) => line.product_id))];
  const products = await catalogRepository.findPublicProductsByIds(productIds);
  const tierByKey = new Map(
    products.flatMap((product) =>
      product.tiers.map((tier) => [`${product.id}:${tier.price_list_id}`, tier] as const)
    )
  );
  return new Map(
    lines.map((line) => [
      line.item_index,
      toBotQuoteLine(line, tierByKey.get(`${line.product_id}:${line.price_list_id}`))
    ])
  );
}

/**
 * Precio, stock y opciones de envío de un carrito, sin crear nada. Usa las mismas funciones
 * que el checkout, así el total cotizado es el que se cobra (salvo cambios de precio/stock
 * entre la cotización y la orden).
 */
export async function quote(input: QuoteInput) {
  let postcode = input.postcode ?? null;

  if (input.shipping_address_id) {
    await requireCustomer(input.customer_id as string);
    const address = await addressRepository.findAddressById(input.shipping_address_id);
    if (!address || address.user_id !== input.customer_id || !address.is_active) {
      throw new AppError('INVALID_SHIPPING_ADDRESS', 'Dirección de envío inválida', 400);
    }
    postcode = address.postcode;
  }

  const expanded = await expandBotItems(input.items);
  const pricing = await priceOrderItems(expanded.pricingItems, { requireTier: true });
  const { lines, subtotal } = pricing;
  const problems = [...expanded.problems, ...pricing.problems];
  const quoteLines = await buildQuoteLines(lines);

  let shipping = null;
  if (postcode) {
    try {
      const options = await getShippingQuote({ postcode, cart_total: subtotal });
      shipping = {
        postcode,
        options: options.map((option) => toBotShippingOption(option, subtotal)),
        error: null
      };
    } catch (error) {
      // Sin cobertura no es un error del request: el bot muestra los precios y avisa del envío
      shipping = {
        postcode,
        options: [],
        error: {
          code: error instanceof AppError ? error.code : 'SHIPPING_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'No hay envíos disponibles'
        }
      };
    }
  }

  // Una entrada por ítem recibido. Los ítems `units` repetidos de un producto se planifican
  // juntos: el desglose completo va al primero y los demás apuntan a él con merged_into.
  const requested = expanded.requestedGroups.map((group) => {
    const breakdown = group.lineIndexes
      .map((pricingIndex) => quoteLines.get(pricingIndex))
      .filter((line): line is BotQuoteLine => line !== undefined);
    return {
      product_id: group.product_id,
      units: group.units,
      subtotal: Math.round(breakdown.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100,
      breakdown,
      ...(group.merged_into !== undefined ? { merged_into: group.merged_into } : {})
    };
  });

  return {
    items: [...quoteLines.values()],
    requested,
    problems,
    subtotal,
    orderable: problems.length === 0 && lines.length > 0,
    shipping
  };
}

// ============= ÓRDENES Y PAGO =============

function botBackUrls(): PreferenceBackUrls | undefined {
  const url = env.BOT_PAYMENT_RETURN_URL;
  return url ? { success: url, failure: url, pending: url } : undefined;
}

/** El link nunca vence después de la cancelación automática de la orden (created_at + 24h + 1h). */
function paymentLinkExpiry(order: Order): Date {
  return new Date(new Date(order.created_at).getTime() + PAYMENT_EXPIRATION_HOURS * 3600 * 1000);
}

function isPayable(order: Order): boolean {
  return order.status === 'pending_payment' && order.payment_method === 'mercadopago';
}

/** El SDK de MP rechaza con objetos planos ({ message, error, status, cause }), no con Error. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Link de pago o null si MP falla (la orden ya existe: el bot reintenta con payment-link). */
async function tryCreatePaymentLink(order: OrderWithDetails): Promise<string | null> {
  const expiresAt = paymentLinkExpiry(order);
  if (!isPayable(order) || expiresAt.getTime() <= Date.now()) return null;
  try {
    return await createPaymentLinkForOrder(order, { backUrls: botBackUrls(), expiresAt });
  } catch (error) {
    logger.error(
      `[bot] No se pudo crear el link de pago de ${order.order_number}: ${describeError(error)}`
    );
    return null;
  }
}

async function loadOrderDetails(orderId: string): Promise<OrderWithDetails> {
  const order = await orderRepository.findOrderWithDetails(orderId);
  if (!order) {
    throw new AppError('ORDER_OPERATION_FAILED', 'Error al obtener la orden', 500);
  }
  return order;
}

/** Repetición de un POST /orders con la misma idempotency_key: devuelve la orden original. */
async function replayOrder(existing: Order, customerId: string) {
  if (existing.user_id !== customerId) {
    throw new AppError(
      'IDEMPOTENCY_KEY_CONFLICT',
      'La idempotency_key ya se usó para otro cliente',
      409
    );
  }
  const order = await loadOrderDetails(existing.id);
  return {
    order: toBotOrder(order),
    payment_url: await tryCreatePaymentLink(order),
    created: false
  };
}

export async function createOrder(input: CreateBotOrderInput) {
  const existing = await orderRepository.findOrderByClientReference(input.idempotency_key);
  if (existing) return replayOrder(existing, input.customer_id);

  await requireCustomer(input.customer_id);

  // Misma expansión que /quote: lo cobrado es lo cotizado
  const expanded = await expandBotItems(input.items);
  if (expanded.problems.length > 0) {
    throw pricingProblemToError(expanded.problems[0]);
  }

  let created: OrderWithDetails;
  try {
    const result = await orderDomain.createOrder(
      input.customer_id,
      {
        shipping_address_id: input.shipping_address_id,
        shipping_carrier_id: input.shipping_carrier_id,
        payment_method: 'mercadopago',
        notes: input.notes,
        items: expanded.pricingItems
      },
      {
        channel: BOT_CHANNEL,
        clientReference: input.idempotency_key,
        deferPaymentLink: true,
        requireTier: true
      }
    );
    created = result.order;
  } catch (error) {
    if (orderRepository.isClientReferenceConflict(error)) {
      // Dos reintentos simultáneos: el otro request ganó el índice único
      const winner = await orderRepository.findOrderByClientReference(input.idempotency_key);
      if (winner) return replayOrder(winner, input.customer_id);
    }
    throw error;
  }

  logger.info(`[bot] Orden ${created.order_number} creada para el cliente ${input.customer_id}`);
  return {
    order: toBotOrder(created),
    payment_url: await tryCreatePaymentLink(created),
    created: true
  };
}

/** Orden del cliente indicado. 404 si no existe o es de otro cliente (no se filtra cuál). */
async function requireOwnedOrder(orderNumber: string, customerId: string): Promise<Order> {
  const order = await orderRepository.findOrderByNumber(orderNumber);
  if (!order || order.user_id !== customerId) {
    throw new AppError('ORDER_NOT_FOUND', 'Orden no encontrada', 404);
  }
  return order;
}

export async function getOrder(orderNumber: string, customerId: string) {
  const order = await requireOwnedOrder(orderNumber, customerId);
  return toBotOrder(await loadOrderDetails(order.id));
}

export async function regeneratePaymentLink(orderNumber: string, input: OrderActionInput) {
  const order = await requireOwnedOrder(orderNumber, input.customer_id);
  if (!isPayable(order)) {
    throw new AppError(
      'ORDER_NOT_PAYABLE',
      `La orden no admite pago con Mercado Pago (estado: ${order.status})`,
      409
    );
  }

  const expiresAt = paymentLinkExpiry(order);
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      'ORDER_PAYMENT_EXPIRED',
      'El plazo de pago de la orden venció; se cancelará automáticamente',
      409
    );
  }

  const details = await loadOrderDetails(order.id);
  try {
    const paymentUrl = await createPaymentLinkForOrder(details, {
      backUrls: botBackUrls(),
      expiresAt
    });
    return { order_number: order.order_number, payment_url: paymentUrl, expires_at: expiresAt };
  } catch (error) {
    logger.error(
      `[bot] Error regenerando el link de pago de ${order.order_number}: ${describeError(error)}`
    );
    throw new AppError(
      'PAYMENT_PROVIDER_ERROR',
      'Mercado Pago no respondió. Intentá de nuevo en unos minutos.',
      502
    );
  }
}

/** Cancela una orden impaga. Las pagas las gestiona el admin (reembolso). */
export async function cancelOrder(orderNumber: string, input: OrderActionInput) {
  const order = await requireOwnedOrder(orderNumber, input.customer_id);
  if (order.status !== 'pending_payment') {
    throw new AppError(
      'ORDER_NOT_CANCELLABLE',
      `Solo se pueden cancelar órdenes pendientes de pago (estado: ${order.status})`,
      409
    );
  }

  const notes = input.reason
    ? `Cancelada por el cliente desde WhatsApp: ${input.reason}`
    : 'Cancelada por el cliente desde WhatsApp';
  // La transición a cancelled libera el stock reservado (trigger de DB)
  await orderDomain.cancelOrder(order.id, notes, input.customer_id);
  return toBotOrder(await loadOrderDetails(order.id));
}
