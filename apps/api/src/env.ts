/**
 * Configuración centralizada de variables de entorno
 *
 * Este archivo valida y exporta todas las variables de entorno necesarias
 * para la aplicación. Falla rápidamente si alguna variable requerida falta.
 */

import dotenv from 'dotenv';
import { requireEnv, getEnv, getEnvNumber, getEnvBoolean } from '@/shared/utils/require-env.js';

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
  // Secreto compartido con la web (misma variable en Vercel) para pedirle que
  // revalide su cache al cambiar banners/logo. Vacío = no se revalida on-demand
  // y los cambios se ven al vencer el TTL del fetch en la web.
  REVALIDATE_SECRET: getEnv('REVALIDATE_SECRET', ''),
  // URLs permitidas para CORS (separadas por comas)
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim()),

  // Base de datos
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DIRECT_URL: getEnv('DIRECT_URL'),
  // TLS de la conexión a Postgres. Por defecto valida el certificado (seguro).
  // Si el proveedor usa una CA no incluida en el sistema, cargá el cert en DATABASE_CA_CERT;
  // como último recurso (no recomendado en prod) poné DATABASE_SSL_REJECT_UNAUTHORIZED=false.
  DATABASE_SSL_REJECT_UNAUTHORIZED: getEnvBoolean('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  DATABASE_CA_CERT: getEnv('DATABASE_CA_CERT'),
  // Loguea cada query SQL con su texto completo. Opt-in explícito: en Railway
  // el volumen supera el rate limit de logs (500/seg), nunca dejar activo ahí.
  DEBUG_SQL: getEnvBoolean('DEBUG_SQL', false),

  // Supabase (SERVICE_KEY y URL obligatorias: Storage de imágenes de producto)
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY', ''), // No usada en MVP (frontend no se conecta directamente)
  SUPABASE_SERVICE_KEY: requireEnv('SUPABASE_SERVICE_KEY'),

  // Autenticación
  JWT_SECRET: requireEnv('JWT_SECRET'),
  // Secreto separado para firmar/verificar refresh tokens (defensa en profundidad).
  // Si no se define, cae a JWT_SECRET por compatibilidad. Al establecer un valor distinto
  // se invalidan los refresh tokens previos (los usuarios deben reloguear). Ver OBS-15.
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET') || requireEnv('JWT_SECRET'),
  // Secreto para firmar (HMAC) los tokens CSRF. Si no se define, cae a JWT_SECRET;
  // definirlo aparte es defensa en profundidad. Cambiarlo invalida los tokens CSRF
  // emitidos (el front pide uno nuevo solo, sin desloguear).
  CSRF_SECRET: getEnv('CSRF_SECRET') || requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  // Fuerza cookies de sesión a SameSite=None; Secure para deploys cross-site (frontend y API
  // en dominios distintos, ej: Vercel + Railway) sin depender de NODE_ENV=production.
  // Activar (true) solo en deploys HTTPS. En local (http) dejar false.
  COOKIE_CROSS_SITE: getEnvBoolean('COOKIE_CROSS_SITE', false),

  // Google OAuth
  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: getEnv(
    'GOOGLE_CALLBACK_URL',
    'http://localhost:3001/api/auth/google/callback'
  ),
  // Emails (separados por coma) que al entrar con Google acceden a LA cuenta owner existente
  OWNER_GOOGLE_EMAILS: getEnv('OWNER_GOOGLE_EMAILS', '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),

  // Mercado Pago
  MP_ACCESS_TOKEN: requireEnv('MP_ACCESS_TOKEN'),
  MP_WEBHOOK_SECRET: requireEnv('MP_WEBHOOK_SECRET'),
  MP_CLIENT_ID: getEnv('MP_CLIENT_ID', ''),
  MP_CLIENT_SECRET: getEnv('MP_CLIENT_SECRET', ''),
  // State secreto para CSRF protection en el OAuth callback (elegís vos el valor)
  MP_OAUTH_STATE: getEnv('MP_OAUTH_STATE', ''),

  // Bot de WhatsApp (canal externo, ver docs/BOT_API.md)
  // API keys aceptadas en el header X-Api-Key, separadas por coma (2 durante una rotación).
  // Vacío = /api/bot responde 503 BOT_API_DISABLED.
  BOT_API_KEYS: getEnv('BOT_API_KEYS', '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
  // Vuelta del comprador al terminar el pago en MP (ej: https://wa.me/5491122334455).
  // Vacío = página de resultado del checkout web.
  BOT_PAYMENT_RETURN_URL: getEnv('BOT_PAYMENT_RETURN_URL', ''),
  // Webhook saliente con los cambios de estado de las órdenes WSP. Vacío = no se envía nada
  // (los eventos quedan encolados en outbound_webhook_events).
  BOT_WEBHOOK_URL: getEnv('BOT_WEBHOOK_URL', ''),
  // Secreto para firmar (HMAC-SHA256) el webhook saliente. Compartido con el bot.
  BOT_WEBHOOK_SECRET: getEnv('BOT_WEBHOOK_SECRET', ''),

  // Andreani (envíos). ANDREANI_MODE: disabled | mock | qa | prod. disabled = integración apagada;
  // mock = simulador local (rechazado en producción); qa/prod = API real (exigen credenciales).
  ANDREANI_MODE: getEnv('ANDREANI_MODE', 'disabled'),
  // Override opcional de la URL base (default según modo).
  ANDREANI_BASE_URL: getEnv('ANDREANI_BASE_URL', ''),
  ANDREANI_USERNAME: getEnv('ANDREANI_USERNAME', ''),
  ANDREANI_PASSWORD: getEnv('ANDREANI_PASSWORD', ''),
  ANDREANI_CLIENT_CODE: getEnv('ANDREANI_CLIENT_CODE', ''),
  ANDREANI_CONTRACT_HOME: getEnv('ANDREANI_CONTRACT_HOME', ''),
  ANDREANI_CONTRACT_BRANCH: getEnv('ANDREANI_CONTRACT_BRANCH', ''),
  // Opcional: multi-bulto o más de 50 kg.
  ANDREANI_CONTRACT_B2B: getEnv('ANDREANI_CONTRACT_B2B', ''),
  ANDREANI_ORIGIN_BRANCH_ID: getEnv('ANDREANI_ORIGIN_BRANCH_ID', ''),
  ANDREANI_SENDER_NAME: getEnv('ANDREANI_SENDER_NAME', ''),
  ANDREANI_SENDER_EMAIL: getEnv('ANDREANI_SENDER_EMAIL', ''),
  ANDREANI_SENDER_PHONE: getEnv('ANDREANI_SENDER_PHONE', ''),
  ANDREANI_SENDER_DOC_TYPE: getEnv('ANDREANI_SENDER_DOC_TYPE', ''),
  ANDREANI_SENDER_DOC_NUMBER: getEnv('ANDREANI_SENDER_DOC_NUMBER', ''),
  ANDREANI_DEFAULT_ITEM_WEIGHT_KG: getEnvNumber('ANDREANI_DEFAULT_ITEM_WEIGHT_KG', 0.5),
  ANDREANI_DEFAULT_ITEM_VOLUME_CM3: getEnvNumber('ANDREANI_DEFAULT_ITEM_VOLUME_CM3', 1000),
  ANDREANI_AUTO_CREATE_SHIPMENT: getEnvBoolean('ANDREANI_AUTO_CREATE_SHIPMENT', false),
  ANDREANI_POLL_CRON: getEnv('ANDREANI_POLL_CRON', '*/15 * * * *'),
  // Link público de tracking; placeholder {tracking}. Vacío = sin link público.
  ANDREANI_TRACKING_URL_TEMPLATE: getEnv('ANDREANI_TRACKING_URL_TEMPLATE', ''),
  // Credenciales Basic del webhook PUSH de Andreani. Vacío = webhook apagado.
  ANDREANI_PUSH_USERNAME: getEnv('ANDREANI_PUSH_USERNAME', ''),
  ANDREANI_PUSH_PASSWORD: getEnv('ANDREANI_PUSH_PASSWORD', ''),
  // Modo mock: segundos entre estados simulados.
  ANDREANI_MOCK_STEP_SECONDS: getEnvNumber('ANDREANI_MOCK_STEP_SECONDS', 60)
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
