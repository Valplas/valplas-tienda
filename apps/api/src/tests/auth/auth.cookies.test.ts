import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import ms, { type StringValue } from 'ms';
import { env } from '../../env.js';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies
} from '../../modules/auth/auth.cookies.js';

const crossSite = env.IS_PRODUCTION || env.COOKIE_CROSS_SITE;
const base = { httpOnly: true, secure: crossSite, sameSite: crossSite ? 'none' : 'lax', path: '/' };

describe('auth.cookies', () => {
  it('setAuthCookies usa los maxAge de la config JWT y las mismas flags en ambas cookies', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    setAuthCookies(res as unknown as Response, 'access', 'refresh');

    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE_NAME, 'access', {
      ...base,
      maxAge: ms(env.JWT_EXPIRES_IN as StringValue)
    });
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, 'refresh', {
      ...base,
      maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as StringValue)
    });
  });

  it('clearAuthCookies limpia ambas cookies con las mismas flags y sin maxAge', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    clearAuthCookies(res as unknown as Response);
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE_NAME, base);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, base);
  });
});
