// apps/api/src/tests/users/user-merge-suggestions.test.ts
//
// Las sugerencias cruzan cuentas nuevas con legacy por dirección (calle + número normalizados).
// Cada test usa una calle única para no mezclarse con datos reales.

import { describe, it, expect } from 'vitest';
import * as mergeDomain from '../../modules/users/user-merge.domain.js';
import * as userDomain from '../../modules/users/user.domain.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createGoogleUser,
  createLegacyUser,
  createRawAddress,
  createRawOrder,
  createTestUser,
  lettersSuffix
} from '../helpers.js';

async function suggestionsFor(legacyId: string) {
  const { suggestions } = await mergeDomain.getMergeSuggestions(1, 100);
  return suggestions.filter((s) => s.legacy_user.id === legacyId);
}

describe('getMergeSuggestions', () => {
  it('Alta con dirección + nombre en común; Media con dirección sola', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Maria' });
    await createRawAddress(legacy.id, { street, streetNumber: '450', city: 'Moreno' });
    const sameName = await createGoogleUser({ firstName: 'María Laura', lastName: 'Gómez' });
    await createRawAddress(sameName.id, {
      street: `Av. ${street}`,
      streetNumber: '450',
      city: 'Moreno'
    });
    const otherName = await createGoogleUser({ firstName: 'Pedro', lastName: 'Ruiz' });
    await createRawAddress(otherName.id, { street, streetNumber: '450', city: 'Moreno' });

    const mine = await suggestionsFor(legacy.id);

    expect(mine.find((s) => s.user.id === sameName.id)?.confidence).toBe('high');
    expect(mine.find((s) => s.user.id === otherName.id)?.confidence).toBe('medium');
  });

  it('matchea contra la dirección en texto libre de las órdenes del CRM (ciudad ignorada)', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Carlos' });
    await createRawOrder(legacy.id, `${street} 1234 piso 2`);
    const google = await createGoogleUser({ firstName: 'Carlos' });
    await createRawAddress(google.id, { street, streetNumber: '1234', city: 'Merlo' });

    const mine = await suggestionsFor(legacy.id);
    expect(mine.map((s) => s.user.id)).toContain(google.id);
  });

  it('no sugiere si la ciudad conocida difiere, ni direcciones legacy s/n', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Ana' });
    await createRawAddress(legacy.id, { street, streetNumber: '10', city: 'Moreno' });
    await createRawAddress(legacy.id, {
      street: `${street} Sur`,
      streetNumber: 's/n',
      city: 'Moreno'
    });
    const otherCity = await createGoogleUser({ firstName: 'Ana' });
    await createRawAddress(otherCity.id, { street, streetNumber: '10', city: 'Lanús' });
    const noNumber = await createGoogleUser({ firstName: 'Ana' });
    await createRawAddress(noNumber.id, {
      street: `${street} Sur`,
      streetNumber: 'S/N',
      city: 'Moreno'
    });

    expect(await suggestionsFor(legacy.id)).toEqual([]);
  });

  it('excluye legacy ya usadas en la web y pares descartados', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const used = await createLegacyUser({ firstName: 'Luis' });
    await createRawAddress(used.id, { street, streetNumber: '77', city: 'Moreno' });
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [used.id]);
    const dismissed = await createLegacyUser({ firstName: 'Luis' });
    await createRawAddress(dismissed.id, { street, streetNumber: '77', city: 'Moreno' });
    const google = await createGoogleUser({ firstName: 'Luis' });
    await createRawAddress(google.id, { street, streetNumber: '77', city: 'Moreno' });
    const admin = await createTestUser();

    expect(await suggestionsFor(dismissed.id)).toHaveLength(1);
    await mergeDomain.dismissSuggestion(google.id, dismissed.id, admin.id);

    expect(await suggestionsFor(used.id)).toEqual([]);
    expect(await suggestionsFor(dismissed.id)).toEqual([]);
  });
});

describe('getAllUsers — contact_status=missing', () => {
  it('lista legacy sin email real ni teléfono, primero las de compra más reciente', async () => {
    const name = `Vitestcontact${lettersSuffix()}`;
    const withOrder = await createLegacyUser({ firstName: name });
    await createRawOrder(withOrder.id);
    const withoutOrder = await createLegacyUser({ firstName: name });
    const withPhone = await createLegacyUser({ firstName: name, phone: '+5491100000000' });

    const { users } = await userDomain.getAllUsers({
      contact_status: 'missing',
      search: name,
      page: 1,
      limit: 10
    });

    expect(users.map((u) => u.id)).toEqual([withOrder.id, withoutOrder.id]);
    expect(users.map((u) => u.id)).not.toContain(withPhone.id);
  });
});
