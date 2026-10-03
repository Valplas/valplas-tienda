import { query } from '../../infrastructure/database/client.js';
import type {
  DashboardStats,
  DashboardLowStockProduct,
  DashboardRecentOrder
} from './dashboard.types.js';

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const LOW_STOCK_THRESHOLD = 10;
const LOW_STOCK_LIMIT = 5;
const RECENT_ORDERS_LIMIT = 10;

// Pedidos operativos sin terminar
const PENDING_STATUSES = ['pending_payment', 'payment_confirmed', 'processing', 'ready_to_ship'];
// Pedidos con pago confirmado: los únicos que suman a ventas
const REVENUE_STATUSES = [
  'payment_confirmed',
  'processing',
  'ready_to_ship',
  'shipped',
  'delivered'
];

const ACTIVE_PRODUCT_CONDITION = 'p.is_active = true AND p.deleted_at IS NULL';

export async function getDashboardStats(): Promise<DashboardStats> {
  // Recursos independientes → Promise.all permitido
  const [ordersResult, productsResult, lowStockResult, recentResult] = await Promise.all([
    query<{ total_orders: string; pending_orders: string; month_revenue: string }>(
      `SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE status = ANY($1::order_status[])) AS pending_orders,
        COALESCE(SUM(total) FILTER (
          WHERE status = ANY($2::order_status[])
            AND created_at >= date_trunc('month', NOW() AT TIME ZONE $3) AT TIME ZONE $3
        ), 0) AS month_revenue
      FROM orders`,
      [PENDING_STATUSES, REVENUE_STATUSES, TIMEZONE]
    ),
    query<{ active_products: string; low_stock_count: string }>(
      `SELECT
        COUNT(*) AS active_products,
        COUNT(*) FILTER (WHERE (p.stock - p.reserved_stock) < $1) AS low_stock_count
      FROM products p
      WHERE ${ACTIVE_PRODUCT_CONDITION}`,
      [LOW_STOCK_THRESHOLD]
    ),
    query<DashboardLowStockProduct>(
      `SELECT p.id, p.name, p.sku, (p.stock - p.reserved_stock) AS available_stock
      FROM products p
      WHERE ${ACTIVE_PRODUCT_CONDITION}
        AND (p.stock - p.reserved_stock) < $1
      ORDER BY available_stock ASC, p.name ASC
      LIMIT $2`,
      [LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT]
    ),
    query<DashboardRecentOrder>(
      `SELECT
        o.id,
        o.order_number,
        o.status,
        o.total,
        o.created_at,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE json_build_object('first_name', u.first_name, 'last_name', u.last_name)
        END AS user
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT $1`,
      [RECENT_ORDERS_LIMIT]
    )
  ]);

  const orders = ordersResult.rows[0];
  const products = productsResult.rows[0];

  return {
    active_products: Number(products?.active_products ?? 0),
    total_orders: Number(orders?.total_orders ?? 0),
    pending_orders: Number(orders?.pending_orders ?? 0),
    month_revenue: Number(orders?.month_revenue ?? 0),
    low_stock_threshold: LOW_STOCK_THRESHOLD,
    low_stock_count: Number(products?.low_stock_count ?? 0),
    low_stock_products: lowStockResult.rows.map((row) => ({
      ...row,
      available_stock: Number(row.available_stock)
    })),
    recent_orders: recentResult.rows.map((row) => ({ ...row, total: Number(row.total) }))
  };
}
