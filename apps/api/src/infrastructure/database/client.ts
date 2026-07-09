import pg from 'pg';
import { env } from '@/env.js';

const { Pool, types } = pg;

// Parse NUMERIC (OID 1700) as float — pg returns NUMERIC as string by default
types.setTypeParser(1700, parseFloat);

/**
 * Configuración TLS de la conexión.
 * En producción se valida el certificado por defecto (evita MITM en el tramo app↔DB).
 * Se puede aportar la CA del proveedor vía DATABASE_CA_CERT, o desactivar la validación
 * con DATABASE_SSL_REJECT_UNAUTHORIZED=false como escape de emergencia.
 */
const sslConfig = env.IS_PRODUCTION
  ? {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
      ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {})
    }
  : false;

/**
 * Pool de conexiones a PostgreSQL
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslConfig,
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
