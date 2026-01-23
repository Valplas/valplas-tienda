import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { pool, query } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Tabla para trackear migraciones ejecutadas
 */
async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Obtiene migraciones ya ejecutadas
 */
async function getExecutedMigrations(): Promise<string[]> {
  const result = await query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return result.rows.map((row) => row.filename);
}

/**
 * Marca migracion como ejecutada
 */
async function markMigrationAsExecuted(filename: string) {
  await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
}

/**
 * Ejecuta todas las migraciones pendientes
 */
export async function runMigrations() {
  try {
    console.log('🔄 Iniciando migraciones...');

    // Crear tabla de migraciones si no existe
    await createMigrationsTable();

    // Obtener migraciones ejecutadas
    const executed = await getExecutedMigrations();
    console.log(`✅ Migraciones ejecutadas: ${executed.length}`);

    // Leer archivos de migraciones
    const files = await readdir(MIGRATIONS_DIR);
    const migrationFiles = files.filter((f) => f.endsWith('.sql')).sort();

    // Filtrar pendientes
    const pending = migrationFiles.filter((f) => !executed.includes(f));

    if (pending.length === 0) {
      console.log('✅ No hay migraciones pendientes');
      return;
    }

    console.log(`📋 Migraciones pendientes: ${pending.length}`);

    // Ejecutar cada migracion pendiente
    for (const file of pending) {
      console.log(`▶️  Ejecutando: ${file}`);
      const filepath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filepath, 'utf-8');

      await query(sql);
      await markMigrationAsExecuted(file);

      console.log(`✅ Completada: ${file}`);
    }

    console.log('🎉 Migraciones completadas exitosamente');
  } catch (error) {
    console.error('❌ Error ejecutando migraciones:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
