// apps/api/src/tests/auth/oauth.service.test.ts

import { describe, it, expect } from 'vitest';
import { resolveGoogleUser, toOAuthErrorCode } from '../../modules/auth/oauth.service.js';
import { query } from '../../infrastructure/database/client.js';
import { createGoogleUser, createLegacyUser, createTestUser, uniqueSuffix } from '../helpers.js';

function profile(o: { id?: string; email?: string | null; verified?: boolean } = {}) {
  const email = o.email === undefined ? `oauth-${uniqueSuffix()}@vitest.local` : o.email;
  return {
    id: o.id ?? `vitest-google-${uniqueSuffix()}`,
    displayName: 'Vitest Google',
    emails: email ? [{ value: email }] : [],
    name: { givenName: 'Vitest', familyName: 'Google' },
    _json: { email_verified: o.verified ?? true }
  };
}

describe('resolveGoogleUser', () => {
  it('crea una cuenta nueva con el email en minúsculas', async () => {
    const email = `New-${uniqueSuffix()}@VITEST.local`;
    const p = profile({ email });
    const result = await resolveGoogleUser(p);

    if (!('user' in result)) throw new Error(`esperaba usuario, llegó ${result.error}`);
    expect(result.user.email).toBe(email.toLowerCase());
    const row = await query('SELECT google_id, email_verified FROM users WHERE id = $1', [
      result.user.id
    ]);
    expect(row.rows[0]).toEqual({ google_id: p.id, email_verified: true });
  });

  it('rechaza email no verificado si no hay cuenta vinculada, sin crear nada', async () => {
    const email = `unverified-${uniqueSuffix()}@vitest.local`;
    const result = await resolveGoogleUser(profile({ email, verified: false }));

    expect(result).toEqual({ error: 'email_unverified' });
    const rows = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(rows.rowCount).toBe(0);
  });

  it('vincula por email (case-insensitive) una legacy sin uso y anula su password placeholder', async () => {
    const legacy = await createLegacyUser({ email: `legacy-${uniqueSuffix()}@vitest.local` });
    const p = profile({ email: legacy.email.toUpperCase() });

    const result = await resolveGoogleUser(p);

    expect('user' in result && result.user.id).toBe(legacy.id);
    const row = await query(
      'SELECT google_id, password_hash, email_verified FROM users WHERE id = $1',
      [legacy.id]
    );
    expect(row.rows[0]).toEqual({ google_id: p.id, password_hash: null, email_verified: true });
  });

  it('no anula la contraseña de una cuenta que no es legacy', async () => {
    const user = await createTestUser();
    await resolveGoogleUser(profile({ email: user.email }));
    const row = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].password_hash).not.toBeNull();
  });

  it('devuelve account_inactive para una cuenta desactivada', async () => {
    const google = await createGoogleUser();
    await query('UPDATE users SET is_active = false WHERE id = $1', [google.id]);
    const result = await resolveGoogleUser(profile({ id: google.googleId, email: google.email }));
    expect(result).toEqual({ error: 'account_inactive' });
  });

  it('devuelve oauth_failed si Google no manda email', async () => {
    expect(await resolveGoogleUser(profile({ email: null }))).toEqual({ error: 'oauth_failed' });
  });
});

describe('toOAuthErrorCode', () => {
  it('acepta códigos conocidos y cae en oauth_failed para el resto', () => {
    expect(toOAuthErrorCode('oauth_state')).toBe('oauth_state');
    expect(toOAuthErrorCode('otra cosa')).toBe('oauth_failed');
    expect(toOAuthErrorCode(undefined)).toBe('oauth_failed');
  });
});
