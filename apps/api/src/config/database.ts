import dotenv from 'dotenv';

dotenv.config();

/**
 * Valida que una variable de entorno exista
 * @throws Error si la variable no está definida
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const databaseConfig = {
  url: requireEnv('DATABASE_URL'),
  directUrl: process.env.DIRECT_URL,
  poolConfig: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  }
};

export const supabaseConfig = {
  url: requireEnv('SUPABASE_URL'),
  anonKey: requireEnv('SUPABASE_ANON_KEY'),
  serviceKey: requireEnv('SUPABASE_SERVICE_KEY')
};
