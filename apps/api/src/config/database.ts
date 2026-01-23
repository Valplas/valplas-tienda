import { env } from '@/env.js';

export const databaseConfig = {
  url: env.DATABASE_URL,
  directUrl: env.DIRECT_URL,
  poolConfig: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  }
};

export const supabaseConfig = {
  url: env.SUPABASE_URL,
  anonKey: env.SUPABASE_ANON_KEY,
  serviceKey: env.SUPABASE_SERVICE_KEY
};
