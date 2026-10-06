import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { CookieStateStore, OAUTH_STATE_COOKIE } from '../../modules/auth/oauth-state.store.js';

const META = { authorizationURL: '', tokenURL: '', clientID: '', callbackURL: '' };

function fakeRequest(query: Record<string, unknown> = {}, cookies: Record<string, string> = {}) {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const req = { query, cookies, res } as unknown as Request;
  return { req, res };
}

function storeState(redirect?: string): { state: string; cookie: string } {
  const { req, res } = fakeRequest(redirect === undefined ? {} : { redirect });
  let state = '';
  new CookieStateStore().store(req, META, (_err, s) => {
    state = s as string;
  });
  return { state, cookie: res.cookie.mock.calls[0][1] as string };
}

describe('CookieStateStore', () => {
  it('store guarda nonce + redirect en una cookie HttpOnly y usa el nonce como state', () => {
    const { req, res } = fakeRequest({ redirect: '/checkout' });
    let state: string | undefined;
    new CookieStateStore().store(req, META, (_err, s) => {
      state = s as string;
    });

    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth/google',
        maxAge: 600000
      })
    );
    expect(JSON.parse(res.cookie.mock.calls[0][1])).toEqual({
      nonce: state,
      redirect: '/checkout'
    });
  });

  it('store descarta un redirect inseguro', () => {
    const { cookie } = storeState('//evil.com');
    expect(JSON.parse(cookie).redirect).toBeNull();
  });

  it('verify con el nonce correcto devuelve el redirect y borra la cookie', () => {
    const { state, cookie } = storeState('/checkout');
    const { req, res } = fakeRequest({}, { [OAUTH_STATE_COOKIE]: cookie });
    const cb = vi.fn();
    new CookieStateStore().verify(req, state, META, cb);
    expect(cb).toHaveBeenCalledWith(null, true, { redirect: '/checkout' });
    expect(res.clearCookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.objectContaining({ path: '/api/auth/google' })
    );
  });

  it.each([
    ['nonce distinto', (c: string) => ({ [OAUTH_STATE_COOKIE]: c }), 'otro-nonce'],
    ['sin cookie', () => ({}), 'cualquiera'],
    ['cookie corrupta', () => ({ [OAUTH_STATE_COOKIE]: '{no-json' }), 'cualquiera']
  ])('verify falla con %s', (_name, cookies, provided) => {
    const { cookie } = storeState('/checkout');
    const { req } = fakeRequest({}, cookies(cookie));
    const cb = vi.fn();
    new CookieStateStore().verify(req, provided, META, cb);
    expect(cb).toHaveBeenCalledWith(null, false, { message: 'oauth_state' });
  });

  it('mantiene la aridad que Passport usa para despachar store/verify', () => {
    expect(CookieStateStore.prototype.store.length).toBe(3);
    expect(CookieStateStore.prototype.verify.length).toBe(4);
  });
});
