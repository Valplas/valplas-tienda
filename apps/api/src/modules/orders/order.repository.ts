// apps/api/src/modules/orders/order.repository.ts

import { query, transaction } from '../../infrastructure/database/client.js';
import type {
  Order,
  OrderItem,
  OrderStatusHistory,
  OrderWithDetails,
  OrderItemWithProduct,
  CreateOrderInput,
  CreateOrderItemInput,
  UpdateOrderStatusInput,
  OrderFilters,
  OrderStatus
} from './order.types.js';

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
  const conditions: string[] = ['o.deleted_at IS NULL'];
  const params: any[] = [];
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

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM orders o WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get orders
  const ordersResult = await query<Order>(
    `SELECT o.* FROM orders o
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
  const result = await query<Order>(
    `SELECT * FROM orders WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Find order by order number
 */
export async function findOrderByNumber(orderNumber: string): Promise<Order | null> {
  const result = await query<Order>(
    `SELECT * FROM orders WHERE order_number = $1 AND deleted_at IS NULL`,
    [orderNumber]
  );

  return result.rows[0] || null;
}

/**
 * Find order with full details
 */
export async function findOrderWithDetails(id: string): Promise<OrderWithDetails | null> {
  const order = await findOrderById(id);
  if (!order) return null;

  // Get items with product details
  const itemsResult = await query<any>(
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
  );

  // Get status history
  const historyResult = await query<OrderStatusHistory>(
    `SELECT * FROM order_status_history
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    [id]
  );

  return {
    ...order,
    items: itemsResult.rows as OrderItemWithProduct[],
    status_history: historyResult.rows
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
      const itemWithPrice = item as any; // Items are enriched in domain layer with unit_price and subtotal
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, itemWithPrice.product_id, itemWithPrice.quantity, itemWithPrice.unit_price, itemWithPrice.subtotal]
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
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  data: UpdateOrderStatusInput,
  changedBy: string
): Promise<Order | null> {
  return transaction(async (client) => {
    // Update order
    const updates: string[] = [`status = $1`, `updated_at = NOW()`];
    const params: any[] = [data.status];
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
       WHERE id = $${paramIndex} AND deleted_at IS NULL
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
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at`,
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
export async function cancelOrder(orderId: string, notes: string, changedBy: string): Promise<Order | null> {
  return updateOrderStatus(orderId, { status: 'cancelled', notes }, changedBy);
}

/**
 * Count user orders
 */
export async function countUserOrders(userId: string, status?: OrderStatus): Promise<number> {
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const params: any[] = [userId];

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
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [orderId, userId]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}
