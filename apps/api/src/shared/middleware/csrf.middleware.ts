// apps/api/src/shared/middleware/csrf.middleware.ts
//
// Protección CSRF con "signed double-submit cookie" (csrf-csrf). La sesión vive
// en cookies HttpOnly con SameSite=None en producción (frontend y API en sitios
// distintos), así que el browser las manda en cualquier request cross-site:
// cada request que modifica algo tiene que traer además el header x-csrf-token.
//
// El front (otro sitio) no puede leer cookies de la API, así que el token se
// pide a GET /api/auth/csrf-token y viaja en el body; CORS impide que un sitio
// ajeno lea esa respuesta. La cookie guarda el HMAC del token, firmado con
// CSRF_SECRET y atado a la sesión (refresh token): un token emitido para otra
// sesión no sirve.

import type { NextFunction, Request, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { env } from '../../env.js';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  USE_CROSS_SITE_COOKIES
} from '../../modules/auth/auth.cookies.js';
import { AppError } from './error.middleware.js';

export const CSRF_HEADER_NAME = 'x-csrf-token';

// El prefijo __Host- (no se puede setear desde subdominios) exige Secure, que
// solo hay con HTTPS: en local (http) va sin prefijo.
export const CSRF_COOKIE_NAME = USE_CROSS_SITE_COOKIES
  ? '__Host-valplas.x-csrf-token'
  : 'valplas.x-csrf-token';

// Requests server-to-server sin cookies de sesión ni token (webhook de Mercado Pago)
const CSRF_EXEMPT_PATHS = new Set(['/api/payments/webhook']);

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  // Anónimo = '' (carrito, login, registro). Al loguearse o rotar el refresh
  // token cambia la sesión y el token anterior deja de valer: el front pide otro.
  getSessionIdentifier: (req) => req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? '',
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    secure: USE_CROSS_SITE_COOKIES,
    sameSite: USE_CROSS_SITE_COOKIES ? 'none' : 'lax',
    path: '/'
  },
  getCsrfTokenFromRequest: (req) => {
    const header = req.headers[CSRF_HEADER_NAME];
    return typeof header === 'string' ? header : undefined;
  },
  skipCsrfProtection: (req) => CSRF_EXEMPT_PATHS.has(req.path)
});

/**
 * Exige un token CSRF válido en todo request que no sea GET/HEAD/OPTIONS.
 * Montar a nivel app, después de cookieParser.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  doubleCsrfProtection(req, res, (error?: unknown) => {
    if (error) {
      next(
        new AppError(
          'CSRF_INVALID',
          'La sesión de seguridad venció. Recargá la página e intentá de nuevo.',
          403
        )
      );
      return;
    }
    next();
  });
}

/** Emite (o reutiliza) el token CSRF de la sesión actual y setea su cookie. */
export function issueCsrfToken(req: Request, res: Response): string {
  return generateCsrfToken(req, res);
}
