/**
 * Create a single "General" category (placeholder since Business field is deprecated).
 * Saves category id to category-id.json for use by migrate-products.
 */
import { target, closeAll } from './db.ts';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const res = await target.query(
  `INSERT INTO categories (name, slug, is_active)
   VALUES ('General', 'general', true)
   ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
   RETURNING id`
);

const categoryId = res.rows[0].id;
console.log(`✅ Category "General" → ${categoryId}`);

const mapPath = join(__dirname, '../category-id.json');
writeFileSync(mapPath, JSON.stringify({ general: categoryId }));

await closeAll();
