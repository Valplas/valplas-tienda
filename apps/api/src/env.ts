/**
 * Configuración centralizada de variables de entorno
 *
 * Este archivo valida y exporta todas las variables de entorno necesarias
 * para la aplicación. Falla rápidamente si alguna variable requerida falta.
 */

import dotenv from 'dotenv';
import { requireEnv, getEnv, getEnvNumber } from '@/shared/utils/require-env.js';

// Cargar variables de entorno
dotenv.config();

/**
 * Tipo de ambiente
 */
export type NodeEnv = 'development' | 'production' | 'test';

/**
 * Variables de entorno de la aplicación
 */
export const env = {
  // Ambiente
  NODE_ENV: getEnv('NODE_ENV', 'development') as NodeEnv,
  IS_DEVELOPMENT: getEnv('NODE_ENV', 'development') === 'development',
  IS_PRODUCTION: getEnv('NODE_ENV') === 'production',
  IS_TEST: getEnv('NODE_ENV') === 'test',

  // Servidor
  PORT: getEnvNumber('PORT', 3001),
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),

  // Base de datos
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DIRECT_URL: getEnv('DIRECT_URL'),

  // Supabase
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_KEY: requireEnv('SUPABASE_SERVICE_KEY'),

  // Autenticación
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d')
} as const;

/**
 * Valida que todas las variables de entorno requeridas estén presentes
 * @throws Error si alguna variable requerida falta
 */
export function validateEnv(): void {
  // Las validaciones ya se hacen en requireEnv al importar este módulo
  // Esta función es útil para llamar explícitamente durante la inicialización
  console.log('✅ Variables de entorno validadas correctamente');
}

// Exportar tipos para usar en otros módulos
export type Env = typeof env;
