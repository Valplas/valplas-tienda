// apps/api/src/tests/users/user.list.test.ts
//
// findUsers por cursor contra la DB real: recorrido completo sin repetir ni saltear, con nombres
// repetidos y last_name NULL, en ambos órdenes; total solo en la primera página.

import { describe, it, expect } from 'vitest';
import * as userRepository from '../../modules/users/user.repository.js';
import { query } from '../../infrastructure/database/client.js';
import { createLegacyUser, lettersSuffix } from '../helpers.js';

async function walk(filters: Parameters<typeof userRepository.findUsers>[0]) {
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let firstTotal: number | null | undefined;
  do {
    const page = await userRepository.findUsers({ ...filters, limit: 2, cursor });
    expect(page.keyset).toBe(true);
    if (pages === 0) firstTotal = page.total;
    else expect(page.total).toBeNull();
    seen.push(...page.users.map((u) => u.id));
    expect(page.hasMore).toBe(page.nextCursor !== null);
    cursor = page.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < 10);
  return { seen, pages, firstTotal };
}

describe('findUsers por cursor', () => {
  it('orden por nombre: recorre todo con nombres repetidos y apellido NULL', async () => {
    const token = `Zq${lettersSuffix()}`;
    const ids = [
      (await createLegacyUser({ firstName: token, lastName: null })).id,
      (await createLegacyUser({ firstName: token, lastName: null })).id,
      (await createLegacyUser({ firstName: token, lastName: 'Alvarez' })).id,
      (await createLegacyUser({ firstName: token, lastName: 'Benitez' })).id,
      (await createLegacyUser({ firstName: `${token}b`, lastName: 'Cruz' })).id
    ];

    const { seen, pages, firstTotal } = await walk({ search: token, sort: 'first_name' });

    expect(firstTotal).toBe(5);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    // El de nombre más largo ordena al final
    expect(seen[4]).toBe(ids[4]);
  });

  it('orden por fecha de alta: con el mismo created_at desempata por id', async () => {
    const token = `Zq${lettersSuffix()}`;
    const ids = [
      (await createLegacyUser({ firstName: token })).id,
      (await createLegacyUser({ firstName: token })).id,
      (await createLegacyUser({ firstName: token })).id,
      (await createLegacyUser({ firstName: token })).id,
      (await createLegacyUser({ firstName: token })).id
    ];
    await query(
      "UPDATE users SET created_at = '2026-01-15 12:00:00.123456+00' WHERE id = ANY($1)",
      [ids]
    );

    const { seen, firstTotal } = await walk({ search: token, sort: 'created_at' });

    expect(firstTotal).toBe(5);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it('incluye direcciones y no expone la clave interna', async () => {
    const token = `Zq${lettersSuffix()}`;
    await createLegacyUser({ firstName: token });

    const page = await userRepository.findUsers({ search: token, includeAddresses: true });

    expect(page.users).toHaveLength(1);
    expect(page.users[0]).toHaveProperty('addresses', []);
    expect(page.users[0]).not.toHaveProperty('_k');
  });

  it('con page sigue en OFFSET y con contact_status=missing también', async () => {
    const token = `Zq${lettersSuffix()}`;
    await createLegacyUser({ firstName: token });

    const classic = await userRepository.findUsers({ search: token, page: 1 });
    const missing = await userRepository.findUsers({ search: token, contact_status: 'missing' });

    expect(classic.keyset).toBe(false);
    expect(classic.total).toBe(1);
    expect(missing.keyset).toBe(false);
    expect(missing.total).toBe(1);
  });

  it('rechaza un cursor de otro orden con 400', async () => {
    const token = `Zq${lettersSuffix()}`;
    await createLegacyUser({ firstName: token });
    await createLegacyUser({ firstName: token });
    const first = await userRepository.findUsers({ search: token, sort: 'created_at', limit: 1 });

    await expect(
      userRepository.findUsers({
        search: token,
        sort: 'first_name',
        cursor: first.nextCursor ?? 'x'
      })
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR', statusCode: 400 });
  });
});
