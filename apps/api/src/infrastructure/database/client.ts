import pg from 'pg';
import { env } from '@/env.js';

const { Pool } = pg;

/**
 * Pool de conexiones a PostgreSQL
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.IS_PRODUCTION
    ? {
        rejectUnauthorized: false
      }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en pool de PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Helper para ejecutar queries
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (env.IS_DEVELOPMENT) {
      console.log('📊 Query ejecutada:', {
        text,
        duration: `${duration}ms`,
        rows: result.rowCount
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Error en query:', { text, error });
    throw error;
  }
}

/**
 * Helper para transacciones
 */
export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
