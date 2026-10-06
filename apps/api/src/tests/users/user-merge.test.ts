// apps/api/src/tests/users/user-merge.test.ts
//
// Merge de cuentas contra la DB real: la cuenta legacy (historial del CRM) absorbe la
// cuenta creada con Google.

import { describe, it, expect } from 'vitest';
import * as mergeDomain from '../../modules/users/user-merge.domain.js';
import * as authRepository from '../../modules/auth/auth.repository.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createTestUser,
  createGoogleUser,
  createLegacyUser,
  createRawAddress,
  createRawOrder,
  uniqueSuffix
} from '../helpers.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000000';

describe('mergeUsers', () => {
  it('legacy absorbe Google: mueve órdenes, direcciones e historial y toma su identidad', async () => {
    const legacy = await createLegacyUser({ firstName: 'Maria' });
    const google = await createGoogleUser({ firstName: 'María', lastName: 'Gómez' });
    await createRawAddress(legacy.id, {
      street: 'Bermejo',
      streetNumber: '450',
      city: 'Moreno',
      isDefault: true
    });
    await createRawAddress(google.id, {
      street: 'Bermejo',
      streetNumber: '450',
      city: 'Moreno',
      isDefault: true
    });
    await createRawOrder(legacy.id);
    const googleOrder = await createRawOrder(google.id);
    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'delivered', $2)`,
      [googleOrder, google.id]
    );
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 day')`,
      [google.id, `vitest-${uniqueSuffix()}`]
    );

    const result = await mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID);

    expect(result.moved).toEqual({ orders: 1, addresses: 1, status_history: 1 });

    const target = await query(
      'SELECT email, google_id, password_hash, username, deleted_at FROM users WHERE id = $1',
      [legacy.id]
    );
    expect(target.rows[0]).toMatchObject({
      email: google.email,
      google_id: google.googleId,
      password_hash: null,
      username: null,
      deleted_at: null
    });

    const source = await query(
      'SELECT email, google_id, is_active, merged_into_id, deleted_at FROM users WHERE id = $1',
      [google.id]
    );
    expect(source.rows[0]).toMatchObject({
      email: null,
      google_id: null,
      is_active: false,
      merged_into_id: legacy.id
    });
    expect(source.rows[0].deleted_at).not.toBeNull();

    const orders = await query('SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1', [
      legacy.id
    ]);
    expect(orders.rows[0].n).toBe(2);

    const defaults = await query(
      'SELECT COUNT(*)::int AS n FROM user_addresses WHERE user_id = $1 AND is_default = true',
      [legacy.id]
    );
    expect(defaults.rows[0].n).toBe(1);

    const tokens = await query('SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1', [
      google.id
    ]);
    expect(tokens.rows[0].n).toBe(0);

    const byGoogle = await authRepository.findUserByGoogleId(google.googleId);
    expect(byGoogle?.id).toBe(legacy.id);
  });

  it('rechaza fusionar una cuenta consigo misma (400 SAME_USER)', async () => {
    const legacy = await createLegacyUser();
    await expect(mergeDomain.mergeUsers(legacy.id, legacy.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'SAME_USER',
      statusCode: 400
    });
  });

  it('rechaza cuentas que no son de clientes (400 MERGE_ROLE_NOT_ALLOWED)', async () => {
    const legacy = await createLegacyUser();
    const other = await createLegacyUser();
    await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [other.id]);
    await expect(mergeDomain.mergeUsers(legacy.id, other.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'MERGE_ROLE_NOT_ALLOWED',
      statusCode: 400
    });
  });

  it('un segundo merge de la misma source devuelve 404 sin tocar datos', async () => {
    const legacy = await createLegacyUser();
    const google = await createGoogleUser();
    await mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID);

    await expect(mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404
    });
  });

  it('con dos google_id distintos devuelve 409 y no modifica ninguna cuenta', async () => {
    const a = await createGoogleUser();
    const b = await createGoogleUser();
    await expect(mergeDomain.mergeUsers(a.id, b.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'GOOGLE_ID_CONFLICT',
      statusCode: 409
    });
    const rows = await query(
      'SELECT COUNT(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [[a.id, b.id]]
    );
    expect(rows.rows[0].n).toBe(2);
  });

  it('rellena el password del target desde la source solo si el target no tiene (COALESCE)', async () => {
    const target = await createTestUser();
    const source = await createTestUser();
    await query('UPDATE users SET password_hash = NULL WHERE id = $1', [target.id]);
    const before = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [source.id]
    );
    const sourceHash = before.rows[0].password_hash;
    expect(sourceHash).toBeTruthy();

    await mergeDomain.mergeUsers(target.id, source.id, ADMIN_ID);

    const after = await query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [target.id]
    );
    expect(after.rows[0].password_hash).not.toBeNull();
    expect(after.rows[0].password_hash).toBe(sourceHash);
  });
});

describe('previewMerge', () => {
  it('informa identidad resultante, descartados y conteos sin modificar datos', async () => {
    const legacy = await createLegacyUser({ email: `legacy-${uniqueSuffix()}@vitest.local` });
    const google = await createGoogleUser();
    await createRawOrder(google.id);
    await createRawAddress(google.id, { street: 'Bermejo', streetNumber: '450', city: 'Moreno' });

    const preview = await mergeDomain.previewMerge(legacy.id, google.id);

    expect(preview.target.id).toBe(legacy.id);
    expect(preview.source).toMatchObject({
      id: google.id,
      orders_count: 1,
      addresses_count: 1,
      has_google: true
    });
    expect(preview.result).toMatchObject({
      email: legacy.email,
      has_google: true,
      has_password: false
    });
    expect(preview.discarded).toEqual([{ field: 'email', value: google.email }]);
    expect(JSON.stringify(preview)).not.toContain('password_hash');

    const still = await query('SELECT deleted_at FROM users WHERE id = $1', [google.id]);
    expect(still.rows[0].deleted_at).toBeNull();
  });
});
