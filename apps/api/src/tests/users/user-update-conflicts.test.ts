// apps/api/src/tests/users/user-update-conflicts.test.ts
//
// El admin completa a mano email/teléfono de clientes legacy. Si el dato ya pertenece a otra
// cuenta (ej: la que el cliente creó con Google), el guardado devuelve 409 con la cuenta en
// conflicto para ofrecer el merge — no un 500 por violación de UNIQUE.

import { describe, it, expect } from 'vitest';
import * as userDomain from '../../modules/users/user.domain.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { createGoogleUser, createLegacyUser, uniqueSuffix } from '../helpers.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000000';

describe('updateUser — conflictos de email/teléfono', () => {
  it('devuelve 409 EMAIL_IN_USE con la cuenta en conflicto, sin importar mayúsculas', async () => {
    const legacy = await createLegacyUser();
    const google = await createGoogleUser({ firstName: 'María', lastName: 'Gómez' });

    const err = await userDomain
      .updateUser(legacy.id, { email: google.email.toUpperCase() }, ADMIN_ID, 'admin')
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      statusCode: 409,
      code: 'EMAIL_IN_USE',
      details: { conflict_user_id: google.id, conflict_user_name: 'María Gómez' }
    });
  });

  it('normaliza el teléfono y detecta conflicto aunque venga en formato local', async () => {
    const local = `4${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    const owner = await createLegacyUser({ phone: normalizePhone(`11${local}`) });
    const legacy = await createLegacyUser();

    const err = await userDomain
      .updateUser(
        legacy.id,
        { phone: `11 ${local.slice(0, 4)}-${local.slice(4)}` },
        ADMIN_ID,
        'admin'
      )
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      statusCode: 409,
      code: 'PHONE_IN_USE',
      details: { conflict_user_id: owner.id }
    });
  });

  it('rechaza un teléfono inválido con 400 INVALID_PHONE', async () => {
    const legacy = await createLegacyUser();
    const err = await userDomain
      .updateUser(legacy.id, { phone: '1234567890123' }, ADMIN_ID, 'admin')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 400, code: 'INVALID_PHONE' });
  });

  it('guarda el email en minúsculas y el teléfono en E.164', async () => {
    const legacy = await createLegacyUser();
    const email = `Mixed-${uniqueSuffix()}@VITEST.local`;
    const local = `4${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

    const updated = await userDomain.updateUser(
      legacy.id,
      { email, phone: `11 ${local}` },
      ADMIN_ID,
      'admin'
    );

    expect(updated.email).toBe(email.toLowerCase());
    expect(updated.phone).toBe(`+5411${local}`);
  });
});
