// apps/api/src/modules/users/user-merge.repository.ts

import type { PoolClient } from 'pg';
import { query } from '../../infrastructure/database/client.js';
import type { MergeCandidate, MergeResolution, MergeSuggestion } from './user-merge.types.js';

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

// Cuentas nuevas (no legacy) con dirección, cruzadas con legacy nunca usadas en la web por
// calle + número normalizados. La ciudad se compara solo si ambas son conocidas: las órdenes
// del CRM tienen la ciudad fija en 'Buenos Aires' (migrate-orders.ts), así que cuentan como
// desconocida. Alta = además comparten una palabra del nombre de 3+ letras.
const SUGGESTIONS_SQL = `
  WITH new_addresses AS (
    SELECT a.user_id, a.street, a.street_number, a.city,
           normalize_street(a.street) AS street_n,
           regexp_replace(a.street_number, '\\D', '', 'g') AS number_n,
           normalize_street(a.city) AS city_n
    FROM user_addresses a
    JOIN users u ON u.id = a.user_id
    WHERE u.role = 'customer' AND u.is_legacy = false AND u.deleted_at IS NULL
      AND a.deleted_at IS NULL AND a.is_active = true
  ),
  legacy_users AS (
    SELECT id FROM users
    WHERE role = 'customer' AND is_legacy = true
      AND deleted_at IS NULL AND last_login_at IS NULL
  ),
  legacy_addresses AS (
    SELECT a.user_id,
           normalize_street(a.street) AS street_n,
           regexp_replace(a.street_number, '\\D', '', 'g') AS number_n,
           normalize_street(a.city) AS city_n
    FROM user_addresses a
    JOIN legacy_users l ON l.id = a.user_id
    WHERE a.deleted_at IS NULL
    UNION
    SELECT o.user_id, normalize_street(m[1]), m[2], ''
    FROM orders o
    JOIN legacy_users l ON l.id = o.user_id
    CROSS JOIN LATERAL regexp_match(o.shipping_street, '^([^0-9]+)\\s(\\d+)') AS m
  ),
  pairs AS (
    SELECT DISTINCT ON (n.user_id, la.user_id)
           n.user_id, la.user_id AS legacy_user_id, n.street, n.street_number, n.city
    FROM new_addresses n
    JOIN legacy_addresses la
      ON la.street_n = n.street_n
     AND la.number_n = n.number_n
     AND n.street_n <> ''
     AND n.number_n <> ''
     AND (n.city_n IN ('', 'sin especificar')
          OR la.city_n IN ('', 'sin especificar')
          OR la.city_n = n.city_n)
    WHERE NOT EXISTS (
      SELECT 1 FROM user_merge_dismissals d
      WHERE d.user_id = n.user_id AND d.legacy_user_id = la.user_id
    )
    ORDER BY n.user_id, la.user_id
  ),
  scored AS (
    SELECT
      json_build_object(
        'id', nu.id, 'first_name', nu.first_name, 'last_name', nu.last_name,
        'email', nu.email, 'has_google', nu.google_id IS NOT NULL, 'created_at', nu.created_at
      ) AS "user",
      json_build_object(
        'id', lu.id, 'first_name', lu.first_name, 'last_name', lu.last_name,
        'email', lu.email, 'phone', lu.phone,
        'orders_count', (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = lu.id)
      ) AS legacy_user,
      CASE WHEN EXISTS (
        SELECT 1
        FROM regexp_split_to_table(
               unaccent(lower(nu.first_name || ' ' || coalesce(nu.last_name, ''))), '\\s+') AS t1(w)
        JOIN regexp_split_to_table(
               unaccent(lower(lu.first_name || ' ' || coalesce(lu.last_name, ''))), '\\s+') AS t2(w)
          ON t1.w = t2.w
        WHERE length(t1.w) >= 3
      ) THEN 'high' ELSE 'medium' END AS confidence,
      json_build_object('street', p.street, 'street_number', p.street_number, 'city', p.city)
        AS matched_address,
      nu.created_at AS new_created_at,
      lu.id AS legacy_id
    FROM pairs p
    JOIN users nu ON nu.id = p.user_id
    JOIN users lu ON lu.id = p.legacy_user_id
  )
  SELECT "user", legacy_user, confidence, matched_address, COUNT(*) OVER()::int AS total
  FROM scored
  ORDER BY (confidence = 'high') DESC, new_created_at DESC, legacy_id
  LIMIT $1 OFFSET $2
`;

export async function findMergeSuggestions(
  page: number,
  limit: number
): Promise<{ suggestions: MergeSuggestion[]; total: number }> {
  const result = await query<MergeSuggestion & { total: number }>(SUGGESTIONS_SQL, [
    limit,
    (page - 1) * limit
  ]);
  return {
    suggestions: result.rows.map(({ total: _total, ...suggestion }) => suggestion),
    total: result.rows[0]?.total ?? 0
  };
}

export async function insertDismissal(
  userId: string,
  legacyUserId: string,
  adminId: string
): Promise<void> {
  await query(
    `INSERT INTO user_merge_dismissals (user_id, legacy_user_id, dismissed_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, legacy_user_id) DO NOTHING`,
    [userId, legacyUserId, adminId]
  );
}
