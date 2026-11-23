import querystring from 'node:querystring';
import type { RequestHandler } from 'express';

/** Rutas cuyo body no se debe alterar (firmas HMAC sobre el payload). */
export const TRIM_EXCLUDED_PATHS = ['/api/payments/webhook', '/api/webhooks/'];

const isPasswordKey = (key: string): boolean => /password/i.test(key);

/**
 * Recorta recursivamente todos los strings de objetos y arrays.
 * Las claves para las que `isSkippedKey` devuelve true conservan su valor intacto.
 */
export function trimDeep(value: unknown, isSkippedKey?: (key: string) => boolean): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => trimDeep(item, isSkippedKey));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // defineProperty: una clave `__proto__` queda como propiedad propia, no cambia el prototipo
      Object.defineProperty(result, key, {
        value: isSkippedKey?.(key) ? item : trimDeep(item, isSkippedKey),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return result;
  }
  return value;
}

/** Recorta req.body (salvo claves password y webhooks). */
export const trimStrings: RequestHandler = (req, _res, next) => {
  const path = req.originalUrl.split('?')[0];
  const excluded = TRIM_EXCLUDED_PATHS.some((prefix) => path.startsWith(prefix));
  if (!excluded && req.body !== undefined) {
    req.body = trimDeep(req.body, isPasswordKey);
  }
  next();
};

/**
 * Query parser para `app.set('query parser', ...)`. En Express 5 `req.query` se
 * re-parsea en cada acceso, por lo que el trim debe hacerse en el parser.
 * Equivale al parser "simple" por defecto (node:querystring) más trim.
 */
export function trimmedQueryParser(str: string): Record<string, unknown> {
  return trimDeep({ ...querystring.parse(str) }, isPasswordKey) as Record<string, unknown>;
}
