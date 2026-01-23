import dotenv from 'dotenv';

dotenv.config();

export const databaseConfig = {
  url: process.env.DATABASE_URL!,
  directUrl: process.env.DIRECT_URL,
  poolConfig: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  }
};

export const supabaseConfig = {
  url: process.env.SUPABASE_URL!,
  anonKey: process.env.SUPABASE_ANON_KEY!,
  serviceKey: process.env.SUPABASE_SERVICE_KEY!
};
