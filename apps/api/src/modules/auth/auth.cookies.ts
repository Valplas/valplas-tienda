// apps/api/src/modules/auth/auth.cookies.ts
//
// Cookies de sesión compartidas por el login con password y el login con Google.

import type { CookieOptions, Response } from 'express';
import ms, { type StringValue } from 'ms';
import { env } from '../../env.js';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';

// Cookies cross-site (frontend y API en dominios distintos, ej: Vercel + Railway) requieren
// SameSite=None; Secure, o el browser no las manda en los fetch a la API. Se activa en
// producción o explícitamente con COOKIE_CROSS_SITE=true — necesario en deploys HTTPS que
// corren con NODE_ENV=development (el deploy dev usa esa var para otra lógica).
export const USE_CROSS_SITE_COOKIES = env.IS_PRODUCTION || env.COOKIE_CROSS_SITE;

// maxAge derivado de la config de JWT para que la cookie no expire antes que el token.
const REFRESH_TOKEN_MAX_AGE = ms(env.JWT_REFRESH_EXPIRES_IN as StringValue);
const ACCESS_TOKEN_MAX_AGE = ms(env.JWT_EXPIRES_IN as StringValue);

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: USE_CROSS_SITE_COOKIES, // Secure obligatorio cuando SameSite=None
    sameSite: USE_CROSS_SITE_COOKIES ? 'none' : 'lax',
    path: '/'
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    ...baseOptions(),
    maxAge: ACCESS_TOKEN_MAX_AGE
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_MAX_AGE
  });
}

/** clearCookie no acepta maxAge: mismas flags que al setear, sin maxAge. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, baseOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, baseOptions());
}
