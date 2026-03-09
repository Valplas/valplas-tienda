/**
 * Migrate: Products → products
 * - base_price = cost_price = CostPrice (pesos ARS, NUMERIC(12,2))
 * - SKU from Code field (or auto-generated)
 * - slug from Name (unique-ified)
 * - brand_id from brand-mapping.json
 * - category_id = "General" from category-id.json
 * - IsDeleted → deleted_at
 * Idempotent: ON CONFLICT (id) DO UPDATE
 */
import { source, target, closeAll } from './db.ts';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import slugifyLib from 'slugify';

const slugify = (s: string) => slugifyLib(s, { lower: true, strict: true, locale: 'es' });

const __dirname = dirname(fileURLToPath(import.meta.url));

const brandMapping: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, '../brand-mapping.json'), 'utf-8')
);
const { general: categoryId } = JSON.parse(
  readFileSync(join(__dirname, '../category-id.json'), 'utf-8')
);

const rows = await source.query(`
  SELECT "ProductID", "Name", "Description", "Manufacturer",
         "Code", "CostPrice", "Quantity", "IsDeleted"
  FROM "Products"
  ORDER BY "Code" NULLS LAST
`);

console.log(`📦 Migrating ${rows.rows.length} products...`);

// Track slugs for uniqueness
const usedSlugs = new Set<string>();
// Pre-load existing slugs from target
const existing = await target.query<{ slug: string }>(
  'SELECT slug FROM products WHERE deleted_at IS NULL'
);
existing.rows.forEach((r) => usedSlugs.add(r.slug));

let inserted = 0;
let updated = 0;
let errors = 0;

for (const row of rows.rows) {
  try {
    // SKU: use Code if available, else generate from ProductID
    let sku: string;
    if (row.Code != null) {
      sku = String(row.Code).padStart(6, '0');
    } else {
      sku = 'AUTO-' + row.ProductID.replace(/-/g, '').substring(0, 8).toUpperCase();
    }

    // Slug: unique-ified
    const baseName = row.Name || 'sin-nombre';
    let slug = slugify(baseName).substring(0, 200);
    if (!slug) slug = 'producto';
    let candidate = slug;
    let i = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${i++}`;
    }
    usedSlugs.add(candidate);

    // Brand
    const manufacturerKey = row.Manufacturer?.trim().toLowerCase() ?? null;
    const brandId = manufacturerKey ? (brandMapping[manufacturerKey] ?? null) : null;

    // Price in pesos ARS
    const costPrice = parseFloat(row.CostPrice) || 0;

    // Deleted
    const deletedAt = row.IsDeleted ? new Date().toISOString() : null;

    const res = await target.query(
      `INSERT INTO products (
        id, sku, name, slug, description,
        category_id, brand_id,
        base_price, cost_price,
        stock, is_active, deleted_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        brand_id = EXCLUDED.brand_id,
        base_price = EXCLUDED.base_price,
        cost_price = EXCLUDED.cost_price,
        stock = EXCLUDED.stock,
        is_active = EXCLUDED.is_active,
        deleted_at = EXCLUDED.deleted_at
      RETURNING (xmax = 0) as inserted`,
      [
        row.ProductID,
        sku,
        row.Name || 'Sin nombre',
        candidate,
        row.Description || null,
        categoryId,
        brandId,
        costPrice,
        costPrice,
        row.Quantity ?? 0,
        !row.IsDeleted,
        deletedAt
      ]
    );
    if (res.rows[0].inserted) inserted++;
    else updated++;
  } catch (e) {
    console.error(`  ❌ ${row.ProductID} "${row.Name}": ${(e as Error).message}`);
    errors++;
  }
}

console.log(`\n✅ Products: ${inserted} inserted, ${updated} updated, ${errors} errors`);
await closeAll();
