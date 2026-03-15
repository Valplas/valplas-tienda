/**
 * Migrate: Orders → orders
 * - OrderStatus 0 → 'delivered'
 * - Prices in pesos ARS (NUMERIC(12,2), no conversion needed)
 * - Address split: full text → shipping_street, defaults for required fields
 * - order_number format: VLP-YYYYMMDD-{OrderNumber}
 * Idempotent: ON CONFLICT (id) DO UPDATE
 */
import { source, target, closeAll } from './db.ts';

const rows = await source.query(`
  SELECT o."OrderID", o."ClientID", o."OrderNumber",
         o."OrderStatus", o."OrderDate",
         o."Amount", o."TotalAmount",
         o."Address", o."IsDeleted"
  FROM "Orders" o
  WHERE o."IsDeleted" = false
  ORDER BY o."OrderDate"
`);

console.log(`🛒 Migrating ${rows.rows.length} orders...`);

// Check which ClientIDs exist in target users table
const clientIds = [...new Set(rows.rows.map((r) => r.ClientID))];
const existingUsers = await target.query<{ id: string }>(
  'SELECT id FROM users WHERE id = ANY($1::uuid[])',
  [clientIds]
);
const validClients = new Set(existingUsers.rows.map((r) => r.id));

let inserted = 0;
let updated = 0;
let skipped = 0;
let errors = 0;

for (const row of rows.rows) {
  if (!validClients.has(row.ClientID)) {
    console.warn(`  ⚠️  Order ${row.OrderNumber}: ClientID ${row.ClientID} not found, skipping`);
    skipped++;
    continue;
  }

  try {
    // order_number: VLP-YYYYMMDD-{num}
    const date = new Date(row.OrderDate);
    const ymd =
      date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
    const orderNumber = `VLP-${ymd}-${String(row.OrderNumber).padStart(6, '0')}`;

    // Totals in pesos ARS: Amount → subtotal, TotalAmount → total, shipping_cost derived
    const subtotal = parseFloat(row.Amount || '0') || 0;
    const total = parseFloat(row.TotalAmount || '0') || 0;
    const shippingCost = Math.max(total - subtotal, 0);

    // Shipping address: store full address in street, defaults for required fields
    const address = (row.Address || 'Sin dirección').substring(0, 255);

    const res = await target.query(
      `INSERT INTO orders (
        id, user_id, order_number, status,
        subtotal, shipping_cost, total,
        shipping_street, shipping_street_number,
        shipping_city, shipping_province, shipping_postcode,
        payment_method, delivered_at,
        created_at
      )
      VALUES ($1,$2,$3,'delivered',$4,$5,$6,$7,'S/N','Buenos Aires','Buenos Aires','0000','cash',$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        subtotal = EXCLUDED.subtotal,
        total = EXCLUDED.total,
        shipping_street = EXCLUDED.shipping_street,
        delivered_at = EXCLUDED.delivered_at
      RETURNING (xmax = 0) as inserted`,
      [
        row.OrderID,
        row.ClientID,
        orderNumber,
        subtotal,
        shippingCost,
        total,
        address,
        new Date(row.OrderDate).toISOString(),
        new Date(row.OrderDate).toISOString()
      ]
    );
    if (res.rows[0].inserted) inserted++;
    else updated++;
  } catch (e) {
    console.error(`  ❌ Order ${row.OrderNumber}: ${(e as Error).message}`);
    errors++;
  }
}

console.log(
  `\n✅ Orders: ${inserted} inserted, ${updated} updated, ${skipped} skipped (client not found), ${errors} errors`
);
await closeAll();
