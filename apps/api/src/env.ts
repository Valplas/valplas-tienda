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
  API_URL: getEnv('API_URL', `http://localhost:${getEnvNumber('PORT', 3001)}`),
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),
  // URLs permitidas para CORS (separadas por comas)
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim()),

  // Base de datos
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DIRECT_URL: getEnv('DIRECT_URL'),

  // Supabase (solo SERVICE_KEY es obligatoria para Storage)
  SUPABASE_URL: getEnv('SUPABASE_URL', ''),
  SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY', ''), // No usada en MVP (frontend no se conecta directamente)
  SUPABASE_SERVICE_KEY: getEnv('SUPABASE_SERVICE_KEY', ''), // Para Storage en Iteración 2

  // Autenticación
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '30m'),

  // Google OAuth
  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: getEnv(
    'GOOGLE_CALLBACK_URL',
    'http://localhost:3001/api/auth/google/callback'
  ),

  // WhatsApp Bot (Meta Cloud API)
  WHATSAPP_PHONE_NUMBER_ID: getEnv('WHATSAPP_PHONE_NUMBER_ID', ''),
  WHATSAPP_ACCESS_TOKEN: getEnv('WHATSAPP_ACCESS_TOKEN', ''),
  WHATSAPP_APP_SECRET: getEnv('WHATSAPP_APP_SECRET', ''),
  WHATSAPP_VERIFY_TOKEN: getEnv('WHATSAPP_VERIFY_TOKEN', ''),
  ADMIN_WHATSAPP_NUMBER: getEnv('ADMIN_WHATSAPP_NUMBER', ''),

  // Mercado Pago
  MERCADOPAGO_ACCESS_TOKEN: getEnv('MERCADOPAGO_ACCESS_TOKEN', ''),
  MERCADOPAGO_NOTIFICATION_URL: getEnv(
    'MERCADOPAGO_NOTIFICATION_URL',
    'https://api.valplas.net/api/orders/webhook/mp'
  )
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
