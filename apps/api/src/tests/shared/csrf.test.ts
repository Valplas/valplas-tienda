// apps/api/src/tests/shared/csrf.test.ts
//
// CSRF (signed double-submit): todo request que modifica algo necesita el
// token de GET /api/auth/csrf-token en el header x-csrf-token, junto con la
// cookie que se emitió con él y para la misma sesión. El webhook de Mercado
// Pago (server-to-server, sin cookies) queda exento.

import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  csrfProtection,
  issueCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
} from '../../shared/middleware/csrf.middleware.js';
import { REFRESH_TOKEN_COOKIE_NAME } from '../../modules/auth/auth.cookies.js';
import { AppError } from '../../shared/middleware/error.middleware.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/banners',
    headers: {},
    cookies: {},
    ...overrides
  } as unknown as Request;
}

function buildRes(): Response & { cookies: Record<string, string> } {
  const cookies: Record<string, string> = {};
  return {
    cookies,
    cookie: vi.fn((name: string, value: string) => {
      cookies[name] = value;
    })
  } as unknown as Response & { cookies: Record<string, string> };
}

/** Emite un token para la sesión dada y devuelve token + cookie resultante. */
function issue(sessionRefreshToken?: string) {
  const cookies = sessionRefreshToken ? { [REFRESH_TOKEN_COOKIE_NAME]: sessionRefreshToken } : {};
  const res = buildRes();
  const token = issueCsrfToken(buildReq({ method: 'GET', cookies }), res);
  return { token, csrfCookie: res.cookies[CSRF_COOKIE_NAME] };
}

function run(req: Request): unknown {
  const next = vi.fn() as unknown as NextFunction;
  csrfProtection(req, buildRes(), next);
  return vi.mocked(next).mock.calls[0]?.[0];
}

describe('csrfProtection', () => {
  it('deja pasar GET sin token', () => {
    expect(run(buildReq({ method: 'GET' }))).toBeUndefined();
  });

  it('rechaza un POST sin token con 403 CSRF_INVALID', () => {
    const error = run(buildReq());

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'CSRF_INVALID', statusCode: 403 });
  });

  it('acepta un POST con el token y la cookie de la misma sesión', () => {
    const { token, csrfCookie } = issue('refresh-A');

    const error = run(
      buildReq({
        headers: { [CSRF_HEADER_NAME]: token },
        cookies: { [CSRF_COOKIE_NAME]: csrfCookie, [REFRESH_TOKEN_COOKIE_NAME]: 'refresh-A' }
      })
    );

    expect(error).toBeUndefined();
  });

  it('acepta un POST anónimo (carrito, login) con token de sesión anónima', () => {
    const { token, csrfCookie } = issue();

    const error = run(
      buildReq({
        path: '/api/auth/login',
        headers: { [CSRF_HEADER_NAME]: token },
        cookies: { [CSRF_COOKIE_NAME]: csrfCookie }
      })
    );

    expect(error).toBeUndefined();
  });

  it('rechaza un token emitido para otra sesión (refresh token rotado)', () => {
    const { token, csrfCookie } = issue('refresh-A');

    const error = run(
      buildReq({
        headers: { [CSRF_HEADER_NAME]: token },
        cookies: { [CSRF_COOKIE_NAME]: csrfCookie, [REFRESH_TOKEN_COOKIE_NAME]: 'refresh-B' }
      })
    );

    expect(error).toMatchObject({ code: 'CSRF_INVALID' });
  });

  it('rechaza el token sin su cookie (un sitio ajeno no puede mandarla con el token)', () => {
    const { token } = issue('refresh-A');

    const error = run(
      buildReq({
        headers: { [CSRF_HEADER_NAME]: token },
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: 'refresh-A' }
      })
    );

    expect(error).toMatchObject({ code: 'CSRF_INVALID' });
  });

  it('deja pasar el webhook de Mercado Pago sin token', () => {
    expect(run(buildReq({ path: '/api/payments/webhook' }))).toBeUndefined();
  });
});
