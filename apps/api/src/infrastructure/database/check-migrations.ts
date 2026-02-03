// apps/api/src/infrastructure/database/check-migrations.ts

import { query, pool } from './client.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function checkMigrations() {
  try {
    // Get executed migrations
    const result = await query(
      'SELECT filename, executed_at FROM schema_migrations ORDER BY filename'
    );

    console.log('✅ Migraciones ejecutadas:');
    console.log('================================');
    result.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.filename} (${new Date(row.executed_at).toLocaleString()})`);
    });

    // Get migration files
    const files = await readdir(MIGRATIONS_DIR);
    const migrationFiles = files.filter((f) => f.endsWith('.sql')).sort();

    console.log('\n📁 Archivos de migración disponibles:');
    console.log('================================');
    migrationFiles.forEach((file) => {
      const executed = result.rows.some((row: any) => row.filename === file);
      console.log(`  ${executed ? '✓' : '⏳'} ${file}`);
    });

    const pending = migrationFiles.filter((f) => !result.rows.some((row: any) => row.filename === f));

    console.log('\n📊 Resumen:');
    console.log('================================');
    console.log(`  Ejecutadas: ${result.rows.length}`);
    console.log(`  Pendientes: ${pending.length}`);

    if (pending.length > 0) {
      console.log('\n⏳ Migraciones pendientes:');
      pending.forEach((f) => console.log(`  - ${f}`));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkMigrations();
