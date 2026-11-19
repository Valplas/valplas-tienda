import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../env.js';
import { AppError } from './error.middleware.js';

export const BOT_API_KEY_HEADER = 'x-api-key';

/**
 * Compara contra todas las keys sin cortar en la primera coincidencia, con timingSafeEqual
 * sobre los bytes crudos. timingSafeEqual exige buffers del mismo largo: si la key tiene otro
 * largo se compara contra un buffer de relleno del largo de lo recibido, así el tiempo depende
 * solo del input del cliente y no filtra el largo ni el prefijo de la key.
 * (Sin hash: CodeQL marca SHA-256 sobre secretos como js/insufficient-password-hash.)
 */
function matchesAnyKey(provided: string, keys: readonly string[]): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  let matched = false;
  for (const key of keys) {
    const keyBuffer = Buffer.from(key, 'utf8');
    const sameLength = keyBuffer.length === providedBuffer.length;
    const candidate = sameLength ? keyBuffer : Buffer.alloc(providedBuffer.length);
    if (timingSafeEqual(providedBuffer, candidate) && sameLength) matched = true;
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
