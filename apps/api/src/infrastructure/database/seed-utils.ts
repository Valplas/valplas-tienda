import { randomBytes } from 'crypto';
import { env } from '../../env.js';
import { logger } from '../logger/index.js';

/**
 * Impide ejecutar seeds en producción salvo override explícito.
 * Evita crear cuentas con credenciales conocidas en un entorno productivo.
 * Ver NC-03 (auditoría ISO 27001).
 */
export function assertSeedAllowed(): void {
  if (env.IS_PRODUCTION && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Seeding bloqueado en producción. Definí ALLOW_PRODUCTION_SEED=true solo si es intencional.'
    );
  }
}

/**
 * Resuelve la contraseña de los usuarios sembrados.
 * - Si SEED_PASSWORD está definida (>=12 chars), la usa (entornos de test deterministas).
 * - Si no, genera una aleatoria fuerte y la loguea una sola vez (solo dev).
 * Nunca usa una contraseña por defecto conocida. Ver NC-03.
 */
export function resolveSeedPassword(): string {
  const fromEnv = process.env.SEED_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < 12) {
      throw new Error('SEED_PASSWORD debe tener al menos 12 caracteres.');
    }
    return fromEnv;
  }
  const generated = randomBytes(15).toString('base64').replace(/[+/=]/g, '').slice(0, 20);
  logger.warn(
    `[seed] SEED_PASSWORD no definida. Contraseña generada para los usuarios sembrados: ${generated}`
  );
  return generated;
}
