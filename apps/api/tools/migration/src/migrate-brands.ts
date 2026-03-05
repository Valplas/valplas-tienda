/**
 * Migrate: Products.Manufacturer → brands
 * Normalizes casing/whitespace, deduplicates.
 * Idempotent: ON CONFLICT (slug) DO NOTHING
 * Exports a JSON file with name → id mapping used by migrate-products.
 */
import { source, target, closeAll } from './db.ts';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import slugifyLib from 'slugify';

const slugify = (s: string) => slugifyLib(s, { lower: true, strict: true, locale: 'es' });

const __dirname = dirname(fileURLToPath(import.meta.url));

const rows = await source.query<{ Manufacturer: string | null }>(`
  SELECT DISTINCT TRIM("Manufacturer") as "Manufacturer"
  FROM "Products"
  WHERE "Manufacturer" IS NOT NULL AND TRIM("Manufacturer") != ''
`);

// Deduplicate case-insensitively (e.g. "Uproll" and "Uproll ")
const seen = new Map<string, string>(); // slug → canonical name
for (const row of rows.rows) {
  const name = row.Manufacturer!.trim();
  const slug = slugify(name);
  if (!seen.has(slug)) seen.set(slug, name);
}

console.log(`🏭 Migrating ${seen.size} brands...`);

const mapping: Record<string, string> = {}; // normalized-name → uuid

for (const [slug, name] of seen) {
  const res = await target.query(
    `INSERT INTO brands (name, slug, is_active)
     VALUES ($1, $2, true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, slug]
  );
  mapping[name.toLowerCase()] = res.rows[0].id;
  console.log(`  ✓ ${name} → ${res.rows[0].id}`);
}

// Save mapping for use by migrate-products
const mapPath = join(__dirname, '../brand-mapping.json');
writeFileSync(mapPath, JSON.stringify(mapping, null, 2));
console.log('\n✅ Brand mapping saved to brand-mapping.json');

await closeAll();
