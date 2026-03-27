// apps/api/src/modules/orders/order.repository.ts

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
  OrderStatus
} from './order.types.js';
import type { User } from '../users/user.types.js';

/**
 * Generate order number (PREFIX-YYYYMMDD-NNNNNN)
 * VLP = customer web order, ADM = admin/owner created order
 * Counter is yearly (resets each year). Example: VLP-20260311-000001
 */
export async function generateOrderNumber(prefix: 'VLP' | 'ADM'): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const year = dateStr.slice(0, 4);

  // Global yearly counter across all prefixes (VLP + ADM)
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM orders WHERE EXTRACT(YEAR FROM created_at) = $1',
    [year]
  );

  const count = parseInt(result.rows[0].count, 10);
  const sequence = (count + 1).toString().padStart(6, '0');

  return `${prefix}-${dateStr}-${sequence}`;
}

/**
 * Find orders with filters and pagination
 */
export async function findOrders(
  filters: OrderFilters
): Promise<{ orders: Order[]; total: number }> {
  const {
    user_id,
    status,
    from_date,
    to_date,
    order_number,
    search,
    page = 1,
    limit = 20,
    includeItems = false
  } = filters;

  const offset = (page - 1) * limit;
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

  if (from_date) {
    conditions.push(`o.created_at >= $${paramIndex}`);
    params.push(from_date);
    paramIndex++;
  }

  if (to_date) {
    conditions.push(`o.created_at <= $${paramIndex}`);
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

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM orders o ${countJoin} WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get orders with user info (and optionally embedded items)
  let ordersRows: Order[];

  if (includeItems) {
    const result = await query<Order>(
      `SELECT o.*,
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
              END as shipping_address,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', oi.id,
                    'product_id', oi.product_id,
                    'product_name', p.name,
                    'product_sku', p.sku,
                    'quantity', oi.quantity,
                    'unit_price', oi.unit_price,
                    'subtotal', oi.subtotal
                  ) ORDER BY oi.created_at
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'
              ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE ${whereClause}
       GROUP BY o.id, u.id, u.first_name, u.last_name, u.email, u.phone
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    ordersRows = result.rows;
  } else {
    const result = await query<Order>(
      `SELECT o.*,
              CASE WHEN u.id IS NOT NULL THEN
                json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone)
              END as user
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    ordersRows = result.rows;
  }

  return {
    orders: ordersRows,
    total
  };
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
 * Find order with full details
 */
export async function findOrderWithDetails(id: string): Promise<OrderWithDetails | null> {
  const order = await findOrderById(id);
  if (!order) return null;

  // Get items, user, and status history in parallel
  const [itemsResult, userResult, historyResult] = await Promise.all([
    query(
      `SELECT
        oi.*,
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
    )
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
    shipping_address
  };
}

/**
 * Create order with items
 */
export async function createOrder(
  userId: string,
  data: CreateOrderInput,
  subtotal: number,
  shippingCost: number,
  total: number
): Promise<Order> {
  return transaction(async (client) => {
    // Generate order number
    const orderNumber = await generateOrderNumber('VLP');

    // Create order
    const orderResult = await client.query<Order>(
      `INSERT INTO orders (
        order_number, user_id, status, subtotal, shipping_cost, total,
        shipping_address_id, shipping_carrier_id, payment_method, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        data.payment_method,
        data.notes || null
      ]
    );

    const order = orderResult.rows[0];

    // Create order items
    for (const item of data.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemWithPrice = item as any; // Items are enriched in domain layer with unit_price and subtotal
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          itemWithPrice.product_id,
          itemWithPrice.quantity,
          itemWithPrice.unit_price,
          itemWithPrice.subtotal
        ]
      );
    }

    // Create initial status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [order.id, 'pending_payment', 'Orden creada', userId]
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
  unit_price: number;
  price_list_id: string;
  cost_price_snapshot: number;
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
    const orderNumber = await generateOrderNumber('ADM');

    const orderResult = await client.query<Order>(
      `INSERT INTO orders (
        order_number, user_id, status, subtotal, shipping_cost, total,
        shipping_address_id,
        shipping_street, shipping_street_number, shipping_floor, shipping_apartment,
        shipping_city, shipping_province, shipping_postcode,
        payment_method, customer_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      const itemSubtotal = Math.trunc(item.unit_price * item.real_quantity * 100) / 100;
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

interface UpdateAdminOrderData {
  items: EnrichedAdminOrderItem[];
  shipping_street: string;
  shipping_street_number: string;
  shipping_floor?: string | null;
  shipping_apartment?: string | null;
  shipping_city: string;
  shipping_province: string;
  shipping_postcode: string;
  shipping_address_id: string;
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
      const itemSubtotal = Math.trunc(item.unit_price * item.real_quantity * 100) / 100;
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

    // Recalculate totals using real_quantity
    const subtotal =
      Math.trunc(
        data.items.reduce((sum, item) => sum + item.unit_price * item.real_quantity, 0) * 100
      ) / 100;

    // Update the order record
    const updatedResult = await client.query<Order>(
      `UPDATE orders
       SET subtotal = $1, total = $1,
           shipping_address_id = $2,
           shipping_street = $3, shipping_street_number = $4,
           shipping_floor = $5, shipping_apartment = $6,
           shipping_city = $7, shipping_province = $8, shipping_postcode = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        subtotal,
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
      [orderId, 'processing', 'Pedido editado por administrador', adminId]
    );

    return updatedResult.rows[0] ?? null;
  });
}
