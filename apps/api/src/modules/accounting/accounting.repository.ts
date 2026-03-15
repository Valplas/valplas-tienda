import { query } from '../../infrastructure/database/client.js';
import type { DailySummary, ProductDailySale, PriceListSale } from './accounting.types.js';

interface RawSaleRow {
  product_id: string;
  product_name: string;
  product_sku: string;
  cost_price: number;
  available_stock: number;
  price_list_id: string | null;
  price_list_name: string | null;
  margin_percentage: number | null;
  quantity_sold: number;
  ganancia: number;
}

export async function getDailySummary(date: string): Promise<DailySummary> {
  const sql = `
    SELECT
      p.id                                                   AS product_id,
      p.name                                                 AS product_name,
      p.sku                                                  AS product_sku,
      COALESCE(p.cost_price, 0)                              AS cost_price,
      (p.stock - p.reserved_stock)                           AS available_stock,
      pl.id                                                  AS price_list_id,
      pl.name                                                AS price_list_name,
      pl.margin                                              AS margin_percentage,
      SUM(oi.quantity)                                       AS quantity_sold,
      SUM(
        COALESCE(
          oi.revenue,
          (oi.unit_price - COALESCE(p.cost_price, 0)) * oi.quantity
        )
      )                                                      AS ganancia
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products    p  ON oi.product_id = p.id
    LEFT JOIN price_lists pl ON oi.price_list_id = pl.id
    WHERE
      DATE(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = $1
      AND o.status IN ('payment_confirmed','processing','ready_to_ship','shipped','delivered')
    GROUP BY
      p.id, p.name, p.sku, p.cost_price, p.stock, p.reserved_stock,
      pl.id, pl.name, pl.margin
    ORDER BY p.name ASC, pl.name ASC NULLS LAST
  `;

  const result = await query<RawSaleRow>(sql, [date]);
  const rows = result.rows;

  // Group flat rows by product_id into nested structure
  const productMap = new Map<string, ProductDailySale>();

  for (const row of rows) {
    if (!productMap.has(row.product_id)) {
      productMap.set(row.product_id, {
        product_id: row.product_id,
        product_name: row.product_name,
        product_sku: row.product_sku,
        cost_price: Number(row.cost_price),
        available_stock: Number(row.available_stock),
        total_quantity: 0,
        total_ganancia: 0,
        price_list_sales: []
      });
    }

    const product = productMap.get(row.product_id)!;
    const quantity = Number(row.quantity_sold);
    const ganancia = Number(row.ganancia);

    product.total_quantity += quantity;
    product.total_ganancia += ganancia;

    const priceListSale: PriceListSale = {
      price_list_id: row.price_list_id,
      price_list_name: row.price_list_name,
      margin_percentage: row.margin_percentage !== null ? Number(row.margin_percentage) : null,
      quantity_sold: quantity,
      ganancia
    };

    product.price_list_sales.push(priceListSale);
  }

  const products = Array.from(productMap.values());

  const total_ganancia = products.reduce((sum, p) => sum + p.total_ganancia, 0);

  return {
    date,
    total_ganancia,
    products
  };
}
