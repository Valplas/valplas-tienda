// apps/api/src/infrastructure/database/run-pending.ts

import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { query, pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function runPendingMigrations() {
  try {
    const migrations = [
      '013_create_shipping_carriers_rates.sql',
      '014_create_order_status_history.sql'
    ];

    for (const file of migrations) {
      process.stdout.write(`Ejecutando ${file}... `);

      const filepath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filepath, 'utf-8');

      await query(sql);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);

      process.stdout.write('✅\n');
    }

    process.stdout.write('\n🎉 Migraciones completadas\n');
  } catch (error) {
    process.stdout.write('❌\n');
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

runPendingMigrations();
