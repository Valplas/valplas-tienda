// apps/api/src/modules/auth/oauth-state.store.ts
//
// State store de Passport sin sesiones: el nonce viaja a Google como `state` y queda en una
// cookie HttpOnly junto con el redirect pedido. En el callback se comparan (protección CSRF del
// login) y se recupera el redirect. SameSite=Lax alcanza: ida y vuelta son navegaciones top-level.

import type { CookieOptions, Request } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { USE_CROSS_SITE_COOKIES } from './auth.cookies.js';
import { sanitizeRedirect } from './oauth-redirect.js';

export const OAUTH_STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

interface StoredState {
  nonce: string;
  redirect: string | null;
}

export interface OAuthStateInfo {
  redirect: string | null;
}

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  info?: OAuthStateInfo | { message: 'oauth_state' }
) => void;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: USE_CROSS_SITE_COOKIES,
    sameSite: 'lax',
    path: '/api/auth/google'
  };
}

function parseStoredState(raw: unknown): StoredState | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return typeof parsed.nonce === 'string'
      ? { nonce: parsed.nonce, redirect: sanitizeRedirect(parsed.redirect) }
      : null;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Passport elige la firma por aridad: store(req, meta, cb) y verify(req, state, meta, cb).
export class CookieStateStore {
  store(req: Request, metaOrCallback: unknown, callback?: StoreCallback): void {
    const cb = callback ?? (metaOrCallback as StoreCallback);
    const nonce = randomBytes(24).toString('base64url');
    const value: StoredState = { nonce, redirect: sanitizeRedirect(req.query.redirect) };
    req.res?.cookie(OAUTH_STATE_COOKIE, JSON.stringify(value), {
      ...cookieOptions(),
      maxAge: STATE_TTL_MS
    });
    cb(null, nonce);
  }

  verify(
    req: Request,
    providedState: string,
    metaOrCallback: unknown,
    callback?: VerifyCallback
  ): void {
    const cb = callback ?? (metaOrCallback as VerifyCallback);
    const stored = parseStoredState(req.cookies?.[OAUTH_STATE_COOKIE]);
    req.res?.clearCookie(OAUTH_STATE_COOKIE, cookieOptions());

    if (!stored || typeof providedState !== 'string' || !safeEqual(stored.nonce, providedState)) {
      cb(null, false, { message: 'oauth_state' });
      return;
    }
    cb(null, true, { redirect: stored.redirect });
  }
}
