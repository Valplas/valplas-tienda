/**
 * Validate migration results - compare counts between source and target.
 */
import { source, target, closeAll } from './db.ts';

console.log('🔍 Validating migration...\n');

const checks = [
  {
    label: 'Price lists',
    srcQ: 'SELECT COUNT(*) FROM "ListPrices"',
    tgtQ: 'SELECT COUNT(*) FROM price_lists'
  },
  {
    label: 'Brands',
    srcQ: 'SELECT COUNT(DISTINCT TRIM("Manufacturer")) FROM "Products" WHERE "Manufacturer" IS NOT NULL AND TRIM("Manufacturer") != \'\'',
    tgtQ: 'SELECT COUNT(*) FROM brands'
  },
  {
    label: 'Products (all)',
    srcQ: 'SELECT COUNT(*) FROM "Products"',
    tgtQ: 'SELECT COUNT(*) FROM products'
  },
  {
    label: 'Products (active)',
    srcQ: 'SELECT COUNT(*) FROM "Products" WHERE "IsDeleted" = false',
    tgtQ: 'SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'
  },
  {
    label: 'Clients (all)',
    srcQ: 'SELECT COUNT(*) FROM "Clients"',
    tgtQ: "SELECT COUNT(*) FROM users WHERE role = 'customer'"
  },
  {
    label: 'Orders (active)',
    srcQ: 'SELECT COUNT(*) FROM "Orders" WHERE "IsDeleted" = false',
    tgtQ: 'SELECT COUNT(*) FROM orders'
  },
  {
    label: 'Order items',
    srcQ: 'SELECT COUNT(*) FROM "OrderProducts" op INNER JOIN "Orders" o ON op."OrderID" = o."OrderID" WHERE o."IsDeleted" = false',
    tgtQ: 'SELECT COUNT(*) FROM order_items'
  }
];

let allOk = true;
for (const { label, srcQ, tgtQ } of checks) {
  const [src, tgt] = await Promise.all([
    source.query<{ count: string }>(srcQ),
    target.query<{ count: string }>(tgtQ)
  ]);
  const srcCount = parseInt(src.rows[0].count);
  const tgtCount = parseInt(tgt.rows[0].count);
  const ok = srcCount <= tgtCount; // target can have more (existing data)
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label.padEnd(20)} source: ${srcCount}, target: ${tgtCount}`);
  if (!ok) allOk = false;
}

console.log(
  allOk ? '\n✅ Migration looks good!' : "\n⚠️  Some counts don't match, review errors above."
);
await closeAll();
