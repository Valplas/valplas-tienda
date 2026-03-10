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
 * Generate order number (VLP-YYYYMMDD-NNNN)
 */
export async function generateOrderNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Get count of orders today
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM orders
     WHERE order_number LIKE $1`,
    [`VLP-${dateStr}-%`]
  );

  const count = parseInt(result.rows[0].count, 10);
  const sequence = (count + 1).toString().padStart(4, '0');

  return `VLP-${dateStr}-${sequence}`;
}

/**
 * Find orders with filters and pagination
 */
export async function findOrders(
  filters: OrderFilters
): Promise<{ orders: Order[]; total: number }> {
  const { user_id, status, from_date, to_date, order_number, page = 1, limit = 20 } = filters;

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

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM orders o WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get orders with user info
  const ordersResult = await query<Order>(
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

  return {
    orders: ordersResult.rows,
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
        id: order.id,
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
    const orderNumber = await generateOrderNumber();

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
export async function createAdminOrder(
  adminId: string,
  data: CreateAdminOrderInput & {
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
    const orderNumber = await generateOrderNumber();

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
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.quantity,
          item.unit_price,
          item.unit_price * item.quantity
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
  items: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
  }>;
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
  data: UpdateAdminOrderData
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

    // Load current items to calculate stock deltas
    const currentItemsResult = await client.query<{ product_id: string; quantity: number }>(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );

    // Build old and new quantity maps (product_id → total qty)
    const oldMap = new Map<string, number>();
    for (const item of currentItemsResult.rows) {
      oldMap.set(item.product_id, (oldMap.get(item.product_id) ?? 0) + item.quantity);
    }
    const newMap = new Map<string, number>();
    for (const item of data.items) {
      newMap.set(item.product_id, (newMap.get(item.product_id) ?? 0) + item.quantity);
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
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_sku, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.quantity,
          item.unit_price,
          Math.round(item.unit_price * item.quantity * 100) / 100
        ]
      );
    }

    // Recalculate totals
    const subtotal =
      Math.round(data.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) * 100) /
      100;

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

    return updatedResult.rows[0] ?? null;
  });
}
