// apps/api/src/modules/users/user-merge.repository.ts

import type { PoolClient } from 'pg';
import { query } from '../../infrastructure/database/client.js';
import type { MergeCandidate, MergeResolution } from './user-merge.types.js';

/** FKs a users que maneja el merge. El test de guard falla si aparece una nueva. */
export const MERGE_HANDLED_FOREIGN_KEYS = [
  'order_status_history.changed_by',
  'orders.user_id',
  'refresh_tokens.user_id',
  'user_addresses.user_id',
  'user_merge_dismissals.dismissed_by',
  'user_merge_dismissals.legacy_user_id',
  'user_merge_dismissals.user_id',
  'users.merged_into_id'
] as const;

// Nunca seleccionar password_hash: solo si existe
const CANDIDATE_COLUMNS = `
  id, email, username, phone, google_id, first_name, last_name, role, is_legacy,
  last_login_at, email_verified, (password_hash IS NOT NULL) AS has_password, created_at
`;

export async function findMergeCandidates(
  ids: string[],
  client?: PoolClient,
  forUpdate = false
): Promise<MergeCandidate[]> {
  const sql = `SELECT ${CANDIDATE_COLUMNS} FROM users
               WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
               ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`;
  const result = client
    ? await client.query<MergeCandidate>(sql, [ids])
    : await query<MergeCandidate>(sql, [ids]);
  return result.rows;
}

export async function countMovableRows(
  userId: string
): Promise<{ orders: number; addresses: number }> {
  const result = await query<{ orders: number; addresses: number }>(
    `SELECT (SELECT COUNT(*)::int FROM orders WHERE user_id = $1) AS orders,
            (SELECT COUNT(*)::int FROM user_addresses
              WHERE user_id = $1 AND deleted_at IS NULL) AS addresses`,
    [userId]
  );
  return result.rows[0];
}

/**
 * Aplica un merge dentro de una transacción ya abierta (filas lockeadas por el caller).
 */
export async function applyMerge(
  client: PoolClient,
  targetId: string,
  sourceId: string,
  resolution: MergeResolution
): Promise<{ orders: number; addresses: number; status_history: number }> {
  // 1. Liberar los UNIQUE de la source antes de pasarle sus valores al target
  await client.query(
    `UPDATE users
     SET email = NULL, username = NULL, google_id = NULL, phone = NULL,
         is_active = false, deleted_at = NOW(), merged_into_id = $1, merged_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [targetId, sourceId]
  );

  // 2. Identidad resuelta en el target. password_hash se copia en SQL, nunca pasa por JS.
  const { identity } = resolution;
  await client.query(
    `UPDATE users
     SET email = $1, username = $2, phone = $3, google_id = $4, email_verified = $5,
         last_login_at = $6,
         password_hash = CASE
           WHEN $7::boolean THEN (SELECT password_hash FROM users WHERE id = $8)
           ELSE COALESCE(password_hash, (SELECT password_hash FROM users WHERE id = $8))
         END,
         updated_at = NOW()
     WHERE id = $9`,
    [
      identity.email,
      identity.username,
      identity.phone,
      identity.google_id,
      identity.email_verified,
      identity.last_login_at,
      resolution.take_source_password,
      sourceId,
      targetId
    ]
  );

  // 3. Direcciones: si el target ya tiene default, las de la source dejan de serlo
  await client.query(
    `UPDATE user_addresses SET is_default = false
     WHERE user_id = $1 AND is_default = true
       AND EXISTS (SELECT 1 FROM user_addresses
                   WHERE user_id = $2 AND is_default = true AND deleted_at IS NULL)`,
    [sourceId, targetId]
  );
  const addresses = await client.query(
    'UPDATE user_addresses SET user_id = $1, updated_at = NOW() WHERE user_id = $2',
    [targetId, sourceId]
  );

  // 4. Órdenes e historial (los triggers de stock solo reaccionan a cambios de status)
  const orders = await client.query(
    'UPDATE orders SET user_id = $1, updated_at = NOW() WHERE user_id = $2',
    [targetId, sourceId]
  );
  const history = await client.query(
    'UPDATE order_status_history SET changed_by = $1 WHERE changed_by = $2',
    [targetId, sourceId]
  );

  // 5. Merges previos que apuntaban a la source pasan a apuntar al target
  await client.query('UPDATE users SET merged_into_id = $1 WHERE merged_into_id = $2', [
    targetId,
    sourceId
  ]);

  // 6. La sesión de la source muere: al reentrar con Google cae en el target por google_id
  await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [sourceId]);
  await client.query(
    'DELETE FROM user_merge_dismissals WHERE user_id = $1 OR legacy_user_id = $1',
    [sourceId]
  );

  return {
    orders: orders.rowCount ?? 0,
    addresses: addresses.rowCount ?? 0,
    status_history: history.rowCount ?? 0
  };
}
