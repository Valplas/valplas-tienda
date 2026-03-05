/**
 * Migrate: OrderProducts → order_items
 * - Joins with Products to get product_name and product_sku (required snapshot fields)
 * - UnitaryPrice * 100 → unit_price (centavos)
 * - CostPrice * 100 → cost_price_snapshot (centavos)
 * - subtotal is auto-calculated by DB trigger
 * - revenue is GENERATED column (from migration 017)
 * Idempotent: deletes existing items per order before re-inserting
 */
import { source, target, closeAll } from './db.ts';

const rows = await source.query(`
  SELECT
    op."OrderID", op."ProductID", op."Quantity",
    op."UnitaryPrice", op."CostPrice", op."ListPriceID",
    p."Name" as "ProductName", p."Code" as "ProductCode"
  FROM "OrderProducts" op
  INNER JOIN "Orders" o ON op."OrderID" = o."OrderID"
  LEFT JOIN "Products" p ON op."ProductID" = p."ProductID"
  WHERE o."IsDeleted" = false
  ORDER BY op."OrderID"
`);

console.log(`📝 Migrating ${rows.rows.length} order items...`);

// Valid IDs in target
const [validOrders, validProducts, validPriceLists] = await Promise.all([
  target
    .query<{ id: string }>('SELECT id FROM orders')
    .then((r) => new Set(r.rows.map((x) => x.id))),
  target
    .query<{ id: string }>('SELECT id FROM products')
    .then((r) => new Set(r.rows.map((x) => x.id))),
  target
    .query<{ id: string }>('SELECT id FROM price_lists')
    .then((r) => new Set(r.rows.map((x) => x.id)))
]);

// Group by order
const byOrder = new Map<string, typeof rows.rows>();
for (const row of rows.rows) {
  if (!byOrder.has(row.OrderID)) byOrder.set(row.OrderID, []);
  byOrder.get(row.OrderID)!.push(row);
}

let inserted = 0;
let skippedOrders = 0;
let errors = 0;

for (const [orderId, items] of byOrder) {
  if (!validOrders.has(orderId)) {
    skippedOrders++;
    continue;
  }

  // Delete existing items for this order (idempotent re-run)
  await target.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

  for (const row of items) {
    if (!validProducts.has(row.ProductID)) continue;

    try {
      const unitPrice = Math.round(parseFloat(row.UnitaryPrice) * 100);
      const costSnapshot = Math.round(parseFloat(row.CostPrice) * 100);
      const priceListId =
        row.ListPriceID && validPriceLists.has(row.ListPriceID) ? row.ListPriceID : null;

      // Snapshot fields
      const productName = (row.ProductName || 'Producto sin nombre').substring(0, 255);
      const productSku =
        row.ProductCode != null
          ? String(row.ProductCode).padStart(6, '0')
          : 'AUTO-' + row.ProductID.replace(/-/g, '').substring(0, 8).toUpperCase();

      await target.query(
        `INSERT INTO order_items (
          order_id, product_id,
          product_name, product_sku,
          quantity, unit_price,
          cost_price_snapshot, price_list_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          orderId,
          row.ProductID,
          productName,
          productSku,
          row.Quantity,
          unitPrice,
          costSnapshot,
          priceListId
        ]
      );
      inserted++;
    } catch (e) {
      console.error(`  ❌ ${orderId}/${row.ProductID}: ${(e as Error).message}`);
      errors++;
    }
  }
}

console.log(
  `\n✅ Order items: ${inserted} inserted, ${skippedOrders} orders skipped (not in target), ${errors} errors`
);
await closeAll();
