/**
 * Migrate: ListPrices → price_lists
 * Idempotent: ON CONFLICT (id) DO UPDATE
 */
import { source, target, closeAll } from './db.ts';

const rows = await source.query(`
  SELECT "ListPriceID", "Name", "Margin", "Discount", "IsDeleted"
  FROM "ListPrices"
`);

console.log(`📋 Migrating ${rows.rows.length} price lists...`);

let inserted = 0;
let updated = 0;

for (const row of rows.rows) {
  const res = await target.query(
    `INSERT INTO price_lists (id, name, margin, discount, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       margin = EXCLUDED.margin,
       discount = EXCLUDED.discount,
       is_active = EXCLUDED.is_active
     RETURNING (xmax = 0) as inserted`,
    [row.ListPriceID, row.Name, row.Margin, row.Discount, !row.IsDeleted]
  );
  if (res.rows[0].inserted) inserted++;
  else updated++;
}

console.log(`✅ Price lists: ${inserted} inserted, ${updated} updated`);
await closeAll();
