import { describe, it, expect } from 'vitest';
import { resolveMergedIdentity } from '../../modules/users/user-merge.identity.js';
import type { MergeCandidate } from '../../modules/users/user-merge.types.js';

function candidate(overrides: Partial<MergeCandidate>): MergeCandidate {
  return {
    id: 'id',
    email: null,
    username: null,
    phone: null,
    google_id: null,
    first_name: 'X',
    last_name: null,
    role: 'customer',
    is_legacy: false,
    last_login_at: null,
    email_verified: false,
    has_password: false,
    created_at: new Date('2026-01-01'),
    ...overrides
  };
}

const unusedLegacy = candidate({
  id: 't',
  email: 'migrado.1234abcd@sinmail.local',
  username: 'maria',
  is_legacy: true,
  has_password: true
});

const google = candidate({
  id: 's',
  email: 'maria@gmail.com',
  google_id: 'g-1',
  email_verified: true,
  last_login_at: new Date('2026-10-01')
});

describe('resolveMergedIdentity', () => {
  it('legacy sin uso ↔ Google: toma credenciales e identidad de la cuenta Google', () => {
    const r = resolveMergedIdentity(unusedLegacy, google);
    expect(r.password_strategy).toBe('source');
    expect(r.identity).toEqual({
      email: 'maria@gmail.com',
      username: null,
      phone: null,
      google_id: 'g-1',
      email_verified: true,
      last_login_at: new Date('2026-10-01'),
      has_password: false
    });
    expect(r.discarded).toEqual([]);
  });

  it('legacy con email real cargado por el admin: conserva ese email y descarta el de Google', () => {
    const target = { ...unusedLegacy, email: 'maria.perez@hotmail.com' };
    const r = resolveMergedIdentity(target, google);
    expect(r.identity.email).toBe('maria.perez@hotmail.com');
    expect(r.identity.email_verified).toBe(false);
    expect(r.identity.google_id).toBe('g-1');
    expect(r.discarded).toEqual([{ field: 'email', value: 'maria@gmail.com' }]);
  });

  it('dos cuentas reales: gana el target y se rellenan los nulos', () => {
    const target = candidate({
      id: 't',
      email: 'a@x.com',
      username: 'a',
      has_password: true,
      last_login_at: new Date('2026-09-01')
    });
    const source = candidate({
      id: 's',
      email: 'b@x.com',
      username: 'b',
      phone: '+5491122334455',
      has_password: true,
      last_login_at: new Date('2026-10-02')
    });
    const r = resolveMergedIdentity(target, source);
    expect(r.password_strategy).toBe('target_or_source');
    expect(r.identity).toMatchObject({
      email: 'a@x.com',
      username: 'a',
      phone: '+5491122334455',
      last_login_at: new Date('2026-10-02'),
      has_password: true
    });
    expect(r.discarded).toEqual([
      { field: 'email', value: 'b@x.com' },
      { field: 'username', value: 'b' }
    ]);
  });

  it('dos legacy con placeholder: conserva el placeholder del target sin descartar', () => {
    const source = { ...unusedLegacy, id: 's', email: 'migrado.9999@sinmail.local' };
    const r = resolveMergedIdentity(unusedLegacy, source);
    expect(r.identity.email).toBe('migrado.1234abcd@sinmail.local');
    expect(r.discarded).toEqual([]);
  });

  it('lanza 409 GOOGLE_ID_CONFLICT si ambas tienen Google distinto', () => {
    const target = candidate({ id: 't', google_id: 'g-1' });
    const source = candidate({ id: 's', google_id: 'g-2' });
    expect(() => resolveMergedIdentity(target, source)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_ID_CONFLICT', statusCode: 409 })
    );
  });

  it('target real sin contraseña (Google) ↔ source con contraseña: la hereda vía COALESCE', () => {
    const target = candidate({
      id: 't',
      email: 'a@x.com',
      google_id: 'g-1',
      last_login_at: new Date('2026-09-01')
    });
    const source = candidate({
      id: 's',
      email: 'a2@x.com',
      username: 'a2',
      has_password: true
    });
    const r = resolveMergedIdentity(target, source);
    expect(r.password_strategy).toBe('target_or_source');
    expect(r.identity.has_password).toBe(true);
    expect(r.identity.username).toBe('a2');
    expect(r.identity.google_id).toBe('g-1');
  });

  it('target Google sin credenciales ↔ source legacy sin uso: nunca hereda password ni username', () => {
    const target = candidate({
      id: 't',
      email: 'maria@gmail.com',
      google_id: 'g-1',
      email_verified: true,
      last_login_at: new Date('2026-10-01')
    });
    const r = resolveMergedIdentity(target, { ...unusedLegacy, id: 's' });
    expect(r.password_strategy).toBe('target');
    expect(r.identity.has_password).toBe(false);
    expect(r.identity.username).toBeNull();
  });
});
