// apps/api/src/modules/orders/order.repository.ts

import type { PoolClient } from 'pg';
import { query, transaction } from '../../infrastructure/database/client.js';
import type {
  Order,
  OrderItem,
  OrderStatusHistory,
  OrderWithDetails,
  OrderItemWithProduct,
  CreateOrderInput,
  CreateAdminOrderInput,
  UpdateOrderStatusInput,
  OrderFilters,
  OrderStatus,
  OrderChannel
} from './order.types.js';
import type { User } from '../users/user.types.js';
import { fromBoundSql, toBoundSql } from '../../shared/utils/date-range.js';
import {
  decodeCursor,
  encodeCursor,
  keysetPredicate,
  sliceKeysetPage,
  tsKey
} from '../../shared/utils/keyset.js';

/**
 * Prefijo del order_number por canal: solo para lectura humana. Los reportes filtran por
 * orders.sales_channel (migración 049), no por el prefijo.
 */
export const ORDER_NUMBER_PREFIX: Record<OrderChannel, string> = {
  web: 'VLP',
  admin: 'ADM',
  whatsapp: 'WSP'
};

const AR_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Fecha YYYYMMDD en hora argentina (con toISOString, después de las 21h ART salía la de mañana). */
export function orderNumberDate(now: Date = new Date()): string {
  return AR_DATE_FORMAT.format(now).replace(/-/g, '');
}

/**
 * Generate order number (PREFIX-YYYYMMDD-NNNNNN)
 * VLP = customer web order, ADM = admin/owner created order, WSP = bot de WhatsApp
 * Counter is yearly (resets each year). Example: VLP-20260311-000001
 */
export async function generateOrderNumber(
  channel: OrderChannel,
  client: PoolClient
): Promise<string> {
  const dateStr = orderNumberDate();
  const year = parseInt(dateStr.slice(0, 4), 10);

  // Contador atómico anual (compartido entre todos los prefijos). El
  // INSERT ... ON CONFLICT DO UPDATE serializa las inserciones concurrentes y
  // devuelve un valor único, evitando el race del COUNT(*) que generaba
  // order_number duplicados (ver migración 035).
  const result = await client.query<{ last_value: number }>(
    `INSERT INTO order_number_counters (year, last_value)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = order_number_counters.last_value + 1
     RETURNING last_value`,
    [year]
  );

  const sequence = result.rows[0].last_value.toString().padStart(6, '0');

  return `${ORDER_NUMBER_PREFIX[channel]}-${dateStr}-${sequence}`;
}

/**
 * Find orders with filters and pagination
 */
export interface FindOrdersResult {
  orders: Order[];
  /** null en páginas con cursor: el total solo se calcula en la primera página. */
  total: number | null;
  /** Solo modo cursor: hay otra página después de esta. */
  hasMore: boolean;
  /** Solo modo cursor: cursor de la página siguiente (null si no hay más). */
  nextCursor: string | null;
}

const ORDERS_SORT_TAG = 'created_desc';

export async function findOrders(filters: OrderFilters): Promise<FindOrdersResult> {
  const {
    user_id,
    status,
    from_date,
    to_date,
    order_number,
    search,
    page,
    cursor,
    limit = 20,
    includeItems = false
  } = filters;

  // Sin `page` se pagina por cursor (keyset); con `page` queda el OFFSET de siempre
  // (pickers, impresión del día y clientes que saltan a una página).
  const useKeyset = page === undefined;
  const offset = useKeyset ? 0 : (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (user_id) {
    conditions.push(`o.user_id = $${paramIndex}`);
    params.push(user_id);
    paramIndex++;
  }

  if (status) {
    conditions.push(`o.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  // Rango semiabierto en hora de Argentina para `YYYY-MM-DD`; el índice por created_at sirve de acceso
  if (from_date) {
    conditions.push(fromBoundSql('o.created_at', from_date, `$${paramIndex}`));
    params.push(from_date);
    paramIndex++;
  }

  if (to_date) {
    conditions.push(toBoundSql('o.created_at', to_date, `$${paramIndex}`));
    params.push(to_date);
    paramIndex++;
  }

  if (order_number) {
    conditions.push(`o.order_number ILIKE $${paramIndex}`);
    params.push(`%${order_number}%`);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(o.order_number ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  // Need the users join in the count query when search is active (references u.first_name etc.)
  const countJoin = search ? 'LEFT JOIN users u ON o.user_id = u.id' : '';

  // Total: siempre con OFFSET; con cursor solo en la primera página (sin cursor), sobre los
  // mismos filtros pero sin el predicado del cursor, que cambia en cada página.
  let total: number | null = null;
  if (!useKeyset || !cursor) {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM orders o ${countJoin} WHERE ${whereClause}`,
      params
    );
    total = parseInt(countResult.rows[0].count, 10);
  }

  // Predicado del cursor: (created_at, id) < último visto. Va al final: no entra en el count.
  let pageWhere = whereClause;
  const pageParams = [...params];
  let pageParamIndex = paramIndex;
  if (useKeyset && cursor) {
    const [createdAt, id] = decodeCursor(cursor, ORDERS_SORT_TAG, 2);
    pageWhere = `${whereClause} AND ${keysetPredicate(
      ['o.created_at', 'o.id'],
      'DESC',
      ['timestamptz', 'uuid'],
      pageParamIndex
    )}`;
    pageParams.push(createdAt, id);
    pageParamIndex += 2;
  }
  // Con cursor se pide una fila de más para saber si hay otra página
  const pageLimit = useKeyset ? limit + 1 : limit;

  // Paginar primero (solo ids) y recién después traer usuario e items: antes el GROUP BY + json_agg
  // se calculaba para TODOS los pedidos que matcheaban y luego se descartaban con LIMIT/OFFSET.
  // `o.id DESC` desempata: sin él el orden no es determinista y las páginas pueden repetir filas.
  const itemsSelect = includeItems ? ', it.items' : '';
  const itemsJoin = includeItems
    ? `LEFT JOIN LATERAL (
         SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', oi.id,
                      'product_id', oi.product_id,
                      'product_name', oi.product_name,
                      'product_sku', oi.product_sku,
                      'quantity', oi.quantity,
                      'unit_price', oi.unit_price,
                      'subtotal', oi.subtotal
                    ) ORDER BY oi.created_at
                  ),
                  '[]'
                ) AS items
         FROM order_items oi
         WHERE oi.order_id = o.id
       ) it ON true`
    : '';

  const result = await query<Order & { _k0: string }>(
    `WITH paged AS (
       SELECT o.id, ${tsKey('o.created_at')} AS k0
       FROM orders o ${countJoin}
       WHERE ${pageWhere}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}
     )
     SELECT o.*, paged.k0 AS _k0,
            CASE WHEN u.id IS NOT NULL THEN
              json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone)
            END as user,
            CASE WHEN o.shipping_street IS NOT NULL THEN
              json_build_object(
                'id', COALESCE(o.shipping_address_id, o.id),
                'alias', 'Dirección de entrega',
                'street', o.shipping_street,
                'street_number', o.shipping_street_number,
                'floor', o.shipping_floor,
                'apartment', o.shipping_apartment,
                'city', o.shipping_city,
                'province', o.shipping_province,
                'postcode', o.shipping_postcode
              )
            END as shipping_address${itemsSelect}
     FROM paged
     JOIN orders o ON o.id = paged.id
     LEFT JOIN users u ON u.id = o.user_id
     ${itemsJoin}
     ORDER BY o.created_at DESC, o.id DESC`,
    [...pageParams, pageLimit, offset]
  );

  const { rows, hasMore } = useKeyset
    ? sliceKeysetPage(result.rows, limit)
    : { rows: result.rows, hasMore: false };

  const last = rows[rows.length - 1];
  const nextCursor =
    useKeyset && hasMore && last ? encodeCursor(ORDERS_SORT_TAG, [last._k0, last.id]) : null;

  // _k0 es solo para armar el cursor: no se expone en la respuesta
  const orders = rows.map(({ _k0, ...order }) => {
    void _k0;
    return order as Order;
  });

  return { orders, total, hasMore, nextCursor };
}

/**
 * Find order by ID
 */
export async function findOrderById(id: string): Promise<Order | null> {
  const result = await query<Order>('SELECT * FROM orders WHERE id = $1', [id]);

  return result.rows[0] || null;
}

/**
 * Find order by order number
 */
export async function findOrderByNumber(orderNumber: string): Promise<Order | null> {
  const result = await query<Order>('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);

  return result.rows[0] || null;
}

/**
 * Orden creada con una clave de idempotencia de un canal externo (índice único parcial).
 */
export async function findOrderByClientReference(clientReference: string): Promise<Order | null> {
  const result = await query<Order>('SELECT * FROM orders WHERE client_reference = $1', [
    clientReference
  ]);

  return result.rows[0] || null;
}

/** Violación del índice único de client_reference (dos requests concurrentes con la misma clave). */
export function isClientReferenceConflict(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23505' && pgError?.constraint === 'idx_orders_client_reference';
}

/**
 * Órdenes de MercadoPago pendientes de pago cuya preferencia ya expiró.
 * Solo MP: las órdenes con otros medios de pago no se auto-cancelan.
 */
export async function findStalePendingPaymentOrders(olderThanHours: number): Promise<Order[]> {
  const result = await query<Order>(
    `SELECT * FROM orders
     WHERE status = 'pending_payment'
       AND payment_method = 'mercadopago'
       AND created_at < NOW() - make_interval(hours => $1)`,
    [olderThanHours]
  );

  return result.rows;
}

/**
 * Find order with full details
 */
export async function findOrderWithDetails(id: string): Promise<OrderWithDetails | null> {
  const order = await findOrderById(id);
  if (!order) return null;

  // Get items, user, status history and carrier in parallel
  const [itemsResult, userResult, historyResult, carrierResult] = await Promise.all([
    // Columnas explícitas: cost_price_snapshot y revenue (margen) nunca
    // salen en el detalle — esta query la ven también los clientes.
    query(
      `SELECT
        oi.id, oi.order_id, oi.product_id, oi.product_image_url,
        oi.quantity, oi.bundle_size_snapshot, oi.real_quantity,
        oi.unit_price, oi.subtotal, oi.price_list_id,
        oi.created_at, oi.updated_at,
        p.name as product_name,
        p.sku as product_sku,
        (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) as product_image
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at`,
      [id]
    ),
    query<Omit<User, 'passwordHash'>>(
      `SELECT id, email, username, phone, first_name, last_name, role,
              is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
       FROM users
       WHERE id = $1`,
      [order.user_id]
    ),
    query<OrderStatusHistory>(
      `SELECT * FROM order_status_history
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [id]
    ),
    // Carrier externo: la dirección de entrega del pedido no se puede modificar
    order.shipping_carrier_id
      ? query<{ is_external: boolean }>('SELECT is_external FROM shipping_carriers WHERE id = $1', [
          order.shipping_carrier_id
        ])
      : null
  ]);

  // Build shipping_address object from denormalized columns
  const shipping_address = order.shipping_street
    ? {
        id: order.shipping_address_id ?? order.id,
        user_id: order.user_id,
        alias: 'Dirección de entrega',
        street: order.shipping_street,
        street_number: order.shipping_street_number,
        floor: order.shipping_floor ?? null,
        apartment: order.shipping_apartment ?? null,
        city: order.shipping_city,
        province: order.shipping_province,
        postcode: order.shipping_postcode,
        latitude: null,
        longitude: null,
        place_id: null,
        notes: null,
        is_default: false,
        is_active: true,
        created_at: order.created_at,
        updated_at: order.updated_at,
        deleted_at: null
      }
    : undefined;

  return {
    ...order,
    items: itemsResult.rows as OrderItemWithProduct[],
    status_history: historyResult.rows,
    user: userResult.rows[0] ?? undefined,
    shipping_address,
    shipping_carrier_is_external: carrierResult?.rows[0]?.is_external ?? false
  };
}

/**
 * Create order with items
 */
/**
 * Snapshot desnormalizado de envío que se persiste en la orden (columnas NOT NULL
 * en la tabla orders). Se arma en el dominio a partir de la dirección validada.
 */
export interface OrderShippingSnapshot {
  shipping_street: string;
  shipping_street_number: string;
  shipping_floor: string | null;
  shipping_apartment: string | null;
  shipping_city: string;
  shipping_province: string;
  shipping_postcode: string;
  carrier_name: string;
}

export interface CreateOrderChannelOptions {
  /** Canal de venta: define el prefijo del número y orders.sales_channel. Default 'web'. */
  channel?: Exclude<OrderChannel, 'admin'>;
  /** Clave de idempotencia de un canal externo (único en la tabla). */
  clientReference?: string | null;
}

const ORDER_CREATED_NOTE: Record<Exclude<OrderChannel, 'admin'>, string> = {
  web: 'Orden creada',
  whatsapp: 'Orden creada (WhatsApp)'
};

export async function createOrder(
  userId: string,
  data: CreateOrderInput,
  subtotal: number,
  shippingCost: number,
  total: number,
  snapshot: OrderShippingSnapshot,
  options: CreateOrderChannelOptions = {}
): Promise<Order> {
  const channel = options.channel ?? 'web';

  return transaction(async (client) => {
    // Generate order number
    const orderNumber = await generateOrderNumber(channel, client);

    // Create order — incluye el snapshot de envío (columnas NOT NULL) y usa
    // customer_notes (la tabla orders no tiene columna `notes`).
    const orderResult = await client.query<Order>(
      `INSERT INTO orders (
        order_number, user_id, status, subtotal, shipping_cost, total,
        shipping_address_id, shipping_carrier_id,
        shipping_street, shipping_street_number, shipping_floor, shipping_apartment,
        shipping_city, shipping_province, shipping_postcode,
        carrier_name, payment_method, customer_notes, sales_channel, client_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        orderNumber,
        userId,
        'pending_payment',
        subtotal,
        shippingCost,
        total,
        data.shipping_address_id,
        data.shipping_carrier_id,
        snapshot.shipping_street,
        snapshot.shipping_street_number,
        snapshot.shipping_floor,
        snapshot.shipping_apartment,
        snapshot.shipping_city,
        snapshot.shipping_province,
        snapshot.shipping_postcode,
        snapshot.carrier_name,
        data.payment_method,
        data.notes || null,
        channel,
        options.clientReference ?? null
      ]
    );

    const order = orderResult.rows[0];

    // Create order items — enriquecidos en el dominio con snapshot de producto,
    // precio por bulto y cantidades (bultos vs unidades reales).
    for (const item of data.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const it = item as any;
      await client.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, product_sku,
          quantity, real_quantity, bundle_size_snapshot,
          unit_price, subtotal, price_list_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          order.id,
          it.product_id,
          it.product_name,
          it.product_sku,
          it.quantity,
          it.real_quantity,
          it.bundle_size_snapshot,
          it.unit_price,
          it.subtotal,
          it.price_list_id ?? null
        ]
      );
    }

    // Create initial status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [order.id, 'pending_payment', ORDER_CREATED_NOTE[channel], userId]
    );

    return order;
  });
}

/**
 * Create order by admin with pre-calculated prices
 */
interface EnrichedAdminOrderItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number; // bundles
  bundle_size_snapshot: number;
  real_quantity: number; // quantity × bundle_size_snapshot
  /** Precio por bulto (unitPrice × bundle_size_snapshot), igual que en el checkout web */
  unit_price: number;
  price_list_id: string;
  /** Costo por bulto (cost_price × bundle_size_snapshot): revenue = (unit_price - cost) × quantity */
  cost_price_snapshot: number;
}

/** Subtotal de una línea: precio por bulto × bultos, redondeado a centavos (sin ruido de float). */
function adminItemSubtotal(item: Pick<EnrichedAdminOrderItem, 'unit_price' | 'quantity'>): number {
  return Math.round(item.unit_price * item.quantity * 100) / 100;
}

export async function createAdminOrder(
  adminId: string,
  data: Omit<CreateAdminOrderInput, 'items'> & {
    items: EnrichedAdminOrderItem[];
    shipping_street: string;
    shipping_street_number: string;
    shipping_floor?: string | null;
    shipping_apartment?: string | null;
    shipping_city: string;
    shipping_province: string;
    shipping_postcode: string;
    subtotal: number;
    total: number;
  }
): Promise<Order> {
  return transaction(async (client) => {
    const orderNumber = await generateOrderNumber('admin', client);

    const orderResult = await client.query<Order>(
      `INSERT INTO orders (
        order_number, user_id, status, subtotal, shipping_cost, total,
        shipping_address_id,
        shipping_street, shipping_street_number, shipping_floor, shipping_apartment,
        shipping_city, shipping_province, shipping_postcode,
        payment_method, customer_notes, sales_channel
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'admin')
      RETURNING *`,
      [
        orderNumber,
        data.user_id,
        'processing',
        data.subtotal,
        0,
        data.total,
        data.shipping_address_id,
        data.shipping_street,
        data.shipping_street_number,
        data.shipping_floor ?? null,
        data.shipping_apartment ?? null,
        data.shipping_city,
        data.shipping_province,
        data.shipping_postcode,
        data.payment_method ?? 'manual',
        data.notes ?? null
      ]
    );

    const order = orderResult.rows[0];

    for (const item of data.items) {
      const itemSubtotal = adminItemSubtotal(item);
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_sku, quantity, bundle_size_snapshot, real_quantity, unit_price, subtotal, price_list_id, cost_price_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          order.id,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.quantity,
          item.bundle_size_snapshot,
          item.real_quantity,
          item.unit_price,
          itemSubtotal,
          item.price_list_id ?? null,
          item.cost_price_snapshot ?? null
        ]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [order.id, 'processing', 'Orden creada por administrador', adminId]
    );

    return order;
  });
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  data: UpdateOrderStatusInput,
  changedBy: string
): Promise<Order | null> {
  return transaction(async (client) => {
    // Update order
    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const params: unknown[] = [data.status];
    let paramIndex = 2;

    if (data.payment_id !== undefined) {
      updates.push(`payment_id = $${paramIndex}`);
      params.push(data.payment_id);
      paramIndex++;
    }

    params.push(orderId);

    const orderResult = await client.query<Order>(
      `UPDATE orders
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    const order = orderResult.rows[0];
    if (!order) return null;

    // Add to status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [orderId, data.status, data.notes || null, changedBy]
    );

    return order;
  });
}

/**
 * Get order items
 */
export async function findOrderItems(orderId: string): Promise<OrderItem[]> {
  const result = await query<OrderItem>(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
    [orderId]
  );

  return result.rows;
}

/**
 * Get order status history
 */
export async function findOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
  const result = await query<OrderStatusHistory>(
    `SELECT * FROM order_status_history
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    [orderId]
  );

  return result.rows;
}

/**
 * Cancel order
 */
export async function cancelOrder(
  orderId: string,
  notes: string,
  changedBy: string
): Promise<Order | null> {
  return updateOrderStatus(orderId, { status: 'cancelled', notes }, changedBy);
}

/**
 * Count user orders
 */
export async function countUserOrders(userId: string, status?: OrderStatus): Promise<number> {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (status) {
    conditions.push('status = $2');
    params.push(status);
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM orders WHERE ${conditions.join(' AND ')}`,
    params
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if order belongs to user
 */
export async function isOrderOwnedByUser(orderId: string, userId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM orders
     WHERE id = $1 AND user_id = $2`,
    [orderId, userId]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/** Subtotal de un pedido admin: precio unitario × unidades reales, truncado a centavos. */
export function calculateAdminOrderSubtotal(
  items: Pick<EnrichedAdminOrderItem, 'unit_price' | 'quantity'>[]
): number {
  // Suma de subtotales por línea, igual que lo que persiste el trigger (quantity × unit_price)
  return Math.round(items.reduce((sum, item) => sum + adminItemSubtotal(item) * 100, 0)) / 100;
}

interface UpdateAdminOrderData {
  items: EnrichedAdminOrderItem[];
  shipping_street: string;
  shipping_street_number: string;
  shipping_floor?: string | null;
  shipping_apartment?: string | null;
  shipping_city: string;
  shipping_province: string;
  shipping_postcode: string;
  shipping_address_id: string | null;
  /** null = se mantiene el costo de envío actual de la orden */
  shipping_cost: number | null;
  /** Detalle para order_status_history */
  history_note: string;
}

export async function updateAdminOrder(
  orderId: string,
  data: UpdateAdminOrderData,
  adminId: string
): Promise<Order | null> {
  return transaction(async (client) => {
    // Disable stock trigger — we handle stock manually in this function
    await client.query("SET LOCAL app.skip_stock_trigger = 'true'");

    // Lock the order row and verify status
    const orderResult = await client.query<Order>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [
      orderId
    ]);
    const order = orderResult.rows[0];
    if (!order || order.status !== 'processing') return null;

    // Load current items to calculate stock deltas (use real_quantity for actual units)
    const currentItemsResult = await client.query<{ product_id: string; real_quantity: number }>(
      'SELECT product_id, real_quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );

    // Build old and new quantity maps (product_id → total real units)
    const oldMap = new Map<string, number>();
    for (const item of currentItemsResult.rows) {
      oldMap.set(item.product_id, (oldMap.get(item.product_id) ?? 0) + item.real_quantity);
    }
    const newMap = new Map<string, number>();
    for (const item of data.items) {
      newMap.set(item.product_id, (newMap.get(item.product_id) ?? 0) + item.real_quantity);
    }

    // Apply stock deltas for every product involved
    const allProductIds = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const productId of allProductIds) {
      const oldQty = oldMap.get(productId) ?? 0;
      const newQty = newMap.get(productId) ?? 0;
      const delta = newQty - oldQty;

      if (delta === 0) continue;

      if (delta > 0) {
        // Need additional stock — check availability first
        const stockResult = await client.query<{ available: number }>(
          'SELECT (stock - reserved_stock) AS available FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        const available = stockResult.rows[0]?.available ?? 0;
        if (available < delta) {
          throw new Error(
            `Stock insuficiente para producto ${productId}. Disponible: ${available}, necesario: ${delta}`
          );
        }
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [
          delta,
          productId
        ]);
      } else {
        // Release stock back (delta is negative)
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
          -delta,
          productId
        ]);
      }
    }

    // Replace order items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    for (const item of data.items) {
      const itemSubtotal = adminItemSubtotal(item);
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_sku, quantity, bundle_size_snapshot, real_quantity, unit_price, subtotal, price_list_id, cost_price_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.quantity,
          item.bundle_size_snapshot,
          item.real_quantity,
          item.unit_price,
          itemSubtotal,
          item.price_list_id ?? null,
          item.cost_price_snapshot ?? null
        ]
      );
    }

    // Recalculate totals using real_quantity. El total incluye el envío (cobrado o recotizado)
    const subtotal = calculateAdminOrderSubtotal(data.items);
    const shippingCost = data.shipping_cost ?? Number(order.shipping_cost);
    const total = Math.round((subtotal + shippingCost) * 100) / 100;

    // Update the order record
    const updatedResult = await client.query<Order>(
      `UPDATE orders
       SET subtotal = $1, shipping_cost = $2, total = $3,
           shipping_address_id = $4,
           shipping_street = $5, shipping_street_number = $6,
           shipping_floor = $7, shipping_apartment = $8,
           shipping_city = $9, shipping_province = $10, shipping_postcode = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        subtotal,
        shippingCost,
        total,
        data.shipping_address_id,
        data.shipping_street,
        data.shipping_street_number,
        data.shipping_floor ?? null,
        data.shipping_apartment ?? null,
        data.shipping_city,
        data.shipping_province,
        data.shipping_postcode,
        orderId
      ]
    );

    // Record the edit in status history for audit trail
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [orderId, 'processing', data.history_note, adminId]
    );

    return updatedResult.rows[0] ?? null;
  });
}
