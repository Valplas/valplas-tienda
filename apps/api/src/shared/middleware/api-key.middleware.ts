import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../env.js';
import { AppError } from './error.middleware.js';

export const BOT_API_KEY_HEADER = 'x-api-key';

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Compara contra todas las keys sin cortar en la primera coincidencia. timingSafeEqual sobre
 * los SHA-256 (32 bytes ambos) evita filtrar por timing el largo o el prefijo de la key.
 */
function matchesAnyKey(provided: string, keys: readonly string[]): boolean {
  const providedHash = sha256(provided);
  let matched = false;
  for (const key of keys) {
    if (timingSafeEqual(providedHash, sha256(key))) matched = true;
  }
  return matched;
}

/**
 * Auth server-to-server de canales externos (bot de WhatsApp) por header X-Api-Key.
 * Varias keys válidas a la vez permiten rotar sin downtime: se agrega la nueva, el bot la
 * adopta y después se saca la vieja. El router que lo usa no lee cookies de sesión, por eso
 * sus rutas pueden quedar exentas de CSRF.
 */
export function createBotApiKeyMiddleware(
  getKeys: () => readonly string[] = () => env.BOT_API_KEYS
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const keys = getKeys();
    if (keys.length === 0) {
      next(new AppError('BOT_API_DISABLED', 'La API del bot no está habilitada', 503));
      return;
    }

    const provided = req.headers[BOT_API_KEY_HEADER];
    if (typeof provided !== 'string' || provided.length === 0 || !matchesAnyKey(provided, keys)) {
      next(new AppError('INVALID_API_KEY', 'API key inválida o ausente', 401));
      return;
    }

    next();
  };
}

export const requireBotApiKey = createBotApiKeyMiddleware();
