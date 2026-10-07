// apps/api/src/tests/auth/oauth-owner.test.ts
//
// Whitelist OWNER_GOOGLE_EMAILS: esos emails entran a LA cuenta owner existente (compartida).
// Repositorio mockeado para controlar cuántas cuentas owner hay; logger mockeado para verificar
// la traza de auditoría y mantener la salida limpia.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/auth/auth.repository.js', () => ({
  findOwnerAccounts: vi.fn(),
  findUserByGoogleId: vi.fn(),
  findUserByEmail: vi.fn(),
  linkGoogleId: vi.fn(),
  createOAuthUser: vi.fn()
}));

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import * as authRepository from '../../modules/auth/auth.repository.js';
import { logger } from '../../infrastructure/logger/index.js';
import { resolveGoogleUser } from '../../modules/auth/oauth.service.js';

const OWNER = { id: 'owner-1', email: 'dueno@valplas.net', role: 'owner', isActive: true };
const WHITELIST = ['socio@gmail.com'];

function profile(email: string, verified = true) {
  return { id: 'google-socio', emails: [{ value: email }], _json: { email_verified: verified } };
}

describe('resolveGoogleUser — whitelist de owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un email de la whitelist (sin importar mayúsculas) entra a la cuenta owner existente', async () => {
    vi.mocked(authRepository.findOwnerAccounts).mockResolvedValue([OWNER] as never);

    const result = await resolveGoogleUser(profile('Socio@Gmail.com'), WHITELIST);

    expect(result).toEqual({ user: OWNER });
    expect(authRepository.findUserByGoogleId).not.toHaveBeenCalled();
    expect(authRepository.linkGoogleId).not.toHaveBeenCalled();
    expect(authRepository.createOAuthUser).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('socio@gmail.com'));
  });

  it('exige email verificado', async () => {
    const result = await resolveGoogleUser(profile('socio@gmail.com', false), WHITELIST);
    expect(result).toEqual({ error: 'email_unverified' });
    expect(authRepository.findOwnerAccounts).not.toHaveBeenCalled();
  });

  it.each([
    ['ninguna cuenta owner', []],
    ['más de una cuenta owner', [OWNER, { ...OWNER, id: 'owner-2' }]]
  ])('falla cerrado con %s', async (_name, owners) => {
    vi.mocked(authRepository.findOwnerAccounts).mockResolvedValue(owners as never);
    const result = await resolveGoogleUser(profile('socio@gmail.com'), WHITELIST);
    expect(result).toEqual({ error: 'oauth_failed' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('owner inactivo → account_inactive', async () => {
    vi.mocked(authRepository.findOwnerAccounts).mockResolvedValue([
      { ...OWNER, isActive: false }
    ] as never);
    const result = await resolveGoogleUser(profile('socio@gmail.com'), WHITELIST);
    expect(result).toEqual({ error: 'account_inactive' });
  });

  it('un email fuera de la whitelist sigue el flujo normal', async () => {
    const customer = { id: 'c-1', email: 'otro@gmail.com', role: 'customer', isActive: true };
    vi.mocked(authRepository.findUserByGoogleId).mockResolvedValue(customer as never);

    const result = await resolveGoogleUser(profile('otro@gmail.com'), WHITELIST);

    expect(result).toEqual({ user: customer });
    expect(authRepository.findOwnerAccounts).not.toHaveBeenCalled();
  });
});
