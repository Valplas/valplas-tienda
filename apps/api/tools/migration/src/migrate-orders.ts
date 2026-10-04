/**
 * Migrate: Orders → orders
 * - OrderStatus (int) → order_status enum via ORDER_STATUS_MAP. Verified in prod: only
 *   value present is 0 (2405 orders), mapped to 'delivered'. Unmapped values are skipped
 *   with a warning instead of silently defaulting — re-run inspect query if this fails.
 * - Prices in pesos ARS (NUMERIC(12,2), no conversion needed)
 * - Address split: full text → shipping_street, defaults for required fields
 * - order_number format: VLP-YYYYMMDD-{OrderNumber}
 * Idempotent: ON CONFLICT (id) DO UPDATE
 */
import { source, target, closeAll } from './db.ts';

// OrderStatus (CRM int) → order_status enum (target). Confirmed via:
// SELECT "OrderStatus", COUNT(*) FROM "Orders" WHERE "IsDeleted"=false GROUP BY 1;
// → only 0 present (2405 rows). Add new entries here if the CRM ever emits other values.
const ORDER_STATUS_MAP: Record<number, string> = {
  0: 'delivered'
};

const rows = await source.query(`
  SELECT o."OrderID", o."ClientID", o."OrderNumber",
         o."OrderStatus", o."OrderDate", o."RealDeliveryDate",
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
let skippedNoStatus = 0;
let errors = 0;

for (const row of rows.rows) {
  if (!validClients.has(row.ClientID)) {
    console.warn(`  ⚠️  Order ${row.OrderNumber}: ClientID ${row.ClientID} not found, skipping`);
    skipped++;
    continue;
  }

  const status = ORDER_STATUS_MAP[row.OrderStatus];
  if (!status) {
    console.warn(
      `  ⚠️  Order ${row.OrderNumber}: unmapped OrderStatus ${row.OrderStatus}, skipping. Add it to ORDER_STATUS_MAP.`
    );
    skippedNoStatus++;
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

    // delivered_at only makes sense if the order actually reached 'delivered'.
    // Source column is NOT NULL but legacy rows without a real delivery use a
    // Postgres 'infinity'/'-infinity' sentinel, which JS Date can't represent
    // (produces an Invalid Date) — guard and fall back to null.
    const realDeliveryDate = row.RealDeliveryDate ? new Date(row.RealDeliveryDate) : null;
    const deliveredAt =
      status === 'delivered' && realDeliveryDate && !isNaN(realDeliveryDate.getTime())
        ? realDeliveryDate.toISOString()
        : null;
    const cancelledAt = status === 'cancelled' ? new Date(row.OrderDate).toISOString() : null;

    const res = await target.query(
      `INSERT INTO orders (
        id, user_id, order_number, status,
        subtotal, shipping_cost, total,
        shipping_street, shipping_street_number,
        shipping_city, shipping_province, shipping_postcode,
        payment_method, delivered_at, cancelled_at,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'S/N','Buenos Aires','Buenos Aires','0000','cash',$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        total = EXCLUDED.total,
        shipping_street = EXCLUDED.shipping_street,
        delivered_at = EXCLUDED.delivered_at,
        cancelled_at = EXCLUDED.cancelled_at
      RETURNING (xmax = 0) as inserted`,
      [
        row.OrderID,
        row.ClientID,
        orderNumber,
        status,
        subtotal,
        shippingCost,
        total,
        address,
        deliveredAt,
        cancelledAt,
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
  `\n✅ Orders: ${inserted} inserted, ${updated} updated, ${skipped} skipped (client not found), ` +
    `${skippedNoStatus} skipped (unmapped status), ${errors} errors`
);
await closeAll();
