// apps/api/src/modules/users/user.repository.ts

import { query } from '../../infrastructure/database/client.js';
import {
  decodeCursor,
  encodeCursor,
  keysetPredicate,
  sliceKeysetPage,
  tsKey
} from '../../shared/utils/keyset.js';
import type {
  User,
  UserWithStats,
  UserWithAddresses,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserRole,
  UserStats,
  UserPhoneMatch
} from './user.types.js';
import type { SalesChannel } from '../orders/order.types.js';

export interface FindUsersResult {
  users: User[] | UserWithAddresses[];
  /** null en páginas con cursor: el total solo se calcula en la primera página. */
  total: number | null;
  /** La respuesta se pagina por cursor (si no, OFFSET con total). */
  keyset: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Find users with filters and pagination.
 * Sin `page` (y sin contact_status=missing) se pagina por cursor; con `page`, OFFSET.
 */
export async function findUsers(filters: UserFilters): Promise<FindUsersResult> {
  const {
    role,
    is_active,
    email_verified,
    search,
    contact_status,
    page,
    cursor,
    limit = 20,
    sort = 'first_name',
    includeAddresses = false
  } = filters;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(is_active);
    paramIndex++;
  }

  if (email_verified !== undefined) {
    conditions.push(`email_verified = $${paramIndex}`);
    params.push(email_verified);
    paramIndex++;
  }

  if (search) {
    // Strip non-digits to enable fuzzy phone matching across different stored formats
    // e.g. user types "1144" matches +5491144223344, 1144223344, etc.
    const phoneDigits = search.replace(/\D/g, '');
    if (phoneDigits.length >= 3) {
      conditions.push(
        `(email ILIKE $${paramIndex} OR username ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') LIKE $${paramIndex + 1})`
      );
      params.push(`%${search}%`);
      params.push(`%${phoneDigits}%`);
      paramIndex += 2;
    } else {
      conditions.push(
        `(email ILIKE $${paramIndex} OR username ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }
  }

  // Legacy a completar a mano: email placeholder del CRM y sin teléfono
  if (contact_status === 'missing') {
    conditions.push("email LIKE '%@sinmail.local' AND phone IS NULL");
  }

  // Con contact_status=missing se prioriza a quien compró más recientemente
  const lastOrderOrder = (alias: string) =>
    `(SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = ${alias}.id) DESC NULLS LAST`;

  // Cursor (keyset) cuando no llega `page` y el orden es indexable. El orden por último pedido
  // es calculado (no hay índice que lo sirva): sigue con OFFSET.
  const useKeyset = page === undefined && contact_status !== 'missing';
  const pageNumber = page ?? 1;
  const offset = useKeyset ? 0 : (pageNumber - 1) * limit;

  // Todas las columnas del orden con la misma dirección y `id` al final (único): sin eso el
  // orden no es determinista. last_name es nullable → COALESCE para que el row value no sea NULL.
  const keysetFor = (a: string) =>
    sort === 'first_name'
      ? {
          tag: 'first_name_asc',
          direction: 'ASC' as const,
          columns: [`${a}first_name`, `COALESCE(${a}last_name, '')`, `${a}id`],
          // Valor de cada columna tal cual viaja en el cursor
          values: [`${a}first_name`, `COALESCE(${a}last_name, '')`, `${a}id::text`],
          types: ['text', 'text', 'uuid']
        }
      : {
          tag: 'created_desc',
          direction: 'DESC' as const,
          columns: [`${a}created_at`, `${a}id`],
          values: [tsKey(`${a}created_at`), `${a}id::text`],
          types: ['timestamptz', 'uuid']
        };
  const keyset = keysetFor('');
  const orderBy = (a: string) =>
    keysetFor(a)
      .columns.map((c) => `${c} ${keyset.direction}`)
      .join(', ');
  const keyExprs = keyset.values;

  const innerOrder = contact_status === 'missing' ? `${lastOrderOrder('users')}, id` : orderBy('');
  const outerOrder = contact_status === 'missing' ? `${lastOrderOrder('u')}, u.id` : orderBy('u.');

  const whereClause = conditions.join(' AND ');

  // Total: con cursor solo en la primera página (el predicado del cursor no entra en el count)
  let total: number | null = null;
  if (!useKeyset || !cursor) {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE ${whereClause}`,
      params
    );
    total = parseInt(countResult.rows[0].count, 10);
  }

  let pageWhere = whereClause;
  const pageParams = [...params];
  let pageParamIndex = paramIndex;
  if (useKeyset && cursor) {
    const values = decodeCursor(cursor, keyset.tag, keyset.columns.length);
    pageWhere = `${whereClause} AND ${keysetPredicate(
      keyset.columns,
      keyset.direction,
      keyset.types,
      pageParamIndex
    )}`;
    pageParams.push(...values);
    pageParamIndex += values.length;
  }
  const pageLimit = useKeyset ? limit + 1 : limit;

  // Get users
  let usersRows: (User & { _k?: string[] })[] | (UserWithAddresses & { _k?: string[] })[];

  if (includeAddresses) {
    const result = await query<UserWithAddresses & { _k: string[] }>(
      `WITH paged_users AS (
         SELECT id, ARRAY[${keyExprs.join(', ')}] AS k FROM users
         WHERE ${pageWhere}
         ORDER BY ${innerOrder}
         LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}
       )
       SELECT
         pu.k AS _k,
         u.id, u.email, u.username, u.phone, u.first_name, u.last_name, u.role,
         u.is_active, u.email_verified, u.phone_verified, u.created_at, u.updated_at, u.deleted_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', a.id,
               'alias', a.alias,
               'street', a.street,
               'street_number', a.street_number,
               'floor', a.floor,
               'apartment', a.apartment,
               'city', a.city,
               'province', a.province,
               'postcode', a.postcode,
               'is_default', a.is_default,
               'is_active', a.is_active
             ) ORDER BY a.is_default DESC, a.created_at ASC
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'
         ) AS addresses
       FROM users u
       JOIN paged_users pu ON u.id = pu.id
       LEFT JOIN user_addresses a
         ON a.user_id = u.id AND a.deleted_at IS NULL AND a.is_active = true
       GROUP BY pu.k, u.id, u.email, u.username, u.phone, u.first_name, u.last_name, u.role,
                u.is_active, u.email_verified, u.phone_verified, u.created_at, u.updated_at, u.deleted_at
       ORDER BY ${outerOrder}`,
      [...pageParams, pageLimit, offset]
    );
    usersRows = result.rows;
  } else {
    const result = await query<User & { _k: string[] }>(
      `SELECT id, email, username, phone, first_name, last_name, role,
              is_active, email_verified, phone_verified, created_at, updated_at, deleted_at,
              ARRAY[${keyExprs.join(', ')}] AS _k
       FROM users
       WHERE ${pageWhere}
       ORDER BY ${innerOrder}
       LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}`,
      [...pageParams, pageLimit, offset]
    );
    usersRows = result.rows;
  }

  const { rows, hasMore } = useKeyset
    ? sliceKeysetPage(usersRows, limit)
    : { rows: usersRows, hasMore: false };
  const last = rows[rows.length - 1];
  const nextCursor = useKeyset && hasMore && last?._k ? encodeCursor(keyset.tag, last._k) : null;

  // _k es solo para armar el cursor: no se expone en la respuesta
  const users = rows.map(({ _k, ...user }) => {
    void _k;
    return user;
  }) as User[] | UserWithAddresses[];

  return { users, total, keyset: useKeyset, hasMore, nextCursor };
}

/**
 * Find user by ID (without password)
 */
export async function findUserById(id: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Find user by ID with statistics
 */
export async function findUserWithStats(id: string): Promise<UserWithStats | null> {
  const result = await query(
    `SELECT
      u.id, u.email, u.username, u.phone, u.first_name, u.last_name, u.role,
      u.is_active, u.email_verified, u.phone_verified, u.created_at, u.updated_at, u.deleted_at,
      (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as total_orders,
      (SELECT COUNT(*) FROM user_addresses WHERE user_id = u.id AND deleted_at IS NULL) as total_addresses,
      (SELECT MAX(created_at) FROM orders WHERE user_id = u.id) as last_order_date
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result.rows[0] || null) as any;
}

/**
 * Find user by email (case-insensitive)
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Usuarios (no borrados) cuyo teléfono coincide por phone_match_key: mismo número nacional
 * aunque esté guardado distinto (+5491141234567 ≡ +541141234567 ≡ 1141234567).
 * Usa idx_users_phone_match_key.
 * Orden: igualdad exacta primero, después la orden más reciente, después el más antiguo.
 */
export async function findUsersByPhoneKey(phone: string): Promise<UserPhoneMatch[]> {
  const result = await query<UserPhoneMatch>(
    `SELECT u.id, u.email, u.username, u.phone, u.first_name, u.last_name, u.role,
            u.is_active, u.email_verified, u.phone_verified, u.created_at, u.updated_at,
            u.deleted_at,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_at
     FROM users u
     WHERE phone_match_key(u.phone) = phone_match_key($1)
       AND u.deleted_at IS NULL AND u.phone IS NOT NULL
     ORDER BY (u.phone = $1) DESC, last_order_at DESC NULLS LAST, u.created_at ASC`,
    [phone]
  );

  return result.rows;
}

/**
 * Find user by username
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE username = $1 AND deleted_at IS NULL`,
    [username]
  );

  return result.rows[0] || null;
}

/**
 * Create user (admin function - requires password hash from domain)
 * is_admin_created: mientras no inicie sesión, las sugerencias de merge lo tratan como cuenta sin uso
 */
export async function createUser(
  data: CreateUserInput & { username: string },
  passwordHash: string
): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (
      email, username, password_hash, phone, first_name, last_name, role, is_active,
      is_admin_created, signup_channel
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'admin')
    RETURNING id, email, username, phone, first_name, last_name, role,
              is_active, email_verified, phone_verified, created_at, updated_at, deleted_at`,
    [
      data.email || null,
      data.username,
      passwordHash,
      data.phone || null,
      data.first_name,
      data.last_name || null,
      data.role,
      data.is_active ?? true
    ]
  );

  return result.rows[0];
}

/**
 * Alta de un cliente desde un canal externo (bot de WhatsApp). Sin password ni username: no
 * puede iniciar sesión en la web hasta que se vincule (Google por email) o el admin lo complete.
 * is_admin_created = false a propósito: así cuenta como "cuenta nueva" en las sugerencias de
 * merge y se cruza con las cuentas legacy del CRM.
 */
export async function createChannelCustomer(data: {
  phone: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  signup_channel: Exclude<SalesChannel, 'web' | 'admin' | 'legacy'>;
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (
      phone, first_name, last_name, email, role, is_active, is_admin_created, signup_channel
    )
    VALUES ($1, $2, $3, $4, 'customer', true, false, $5)
    RETURNING id, email, username, phone, first_name, last_name, role,
              is_active, email_verified, phone_verified, created_at, updated_at, deleted_at`,
    [data.phone, data.first_name, data.last_name ?? null, data.email ?? null, data.signup_channel]
  );

  return result.rows[0];
}

/**
 * Update user
 */
export async function updateUser(id: string, data: UpdateUserInput): Promise<User | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.email !== undefined) {
    updates.push(`email = $${paramIndex}`);
    params.push(data.email);
    paramIndex++;
  }

  if (data.username !== undefined) {
    updates.push(`username = $${paramIndex}`);
    params.push(data.username);
    paramIndex++;
  }

  if (data.phone !== undefined) {
    updates.push(`phone = $${paramIndex}`);
    params.push(data.phone);
    paramIndex++;
  }

  if (data.first_name !== undefined) {
    updates.push(`first_name = $${paramIndex}`);
    params.push(data.first_name);
    paramIndex++;
  }

  if (data.last_name !== undefined) {
    updates.push(`last_name = $${paramIndex}`);
    params.push(data.last_name);
    paramIndex++;
  }

  if (data.role !== undefined) {
    updates.push(`role = $${paramIndex}`);
    params.push(data.role);
    paramIndex++;
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.is_active);
    paramIndex++;
  }

  if (data.email_verified !== undefined) {
    updates.push(`email_verified = $${paramIndex}`);
    params.push(data.email_verified);
    paramIndex++;
  }

  if (data.phone_verified !== undefined) {
    updates.push(`phone_verified = $${paramIndex}`);
    params.push(data.phone_verified);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = NOW()');
  params.push(id);

  const result = await query<User>(
    `UPDATE users
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING id, email, username, phone, first_name, last_name, role,
               is_active, email_verified, phone_verified, created_at, updated_at, deleted_at`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Update user password
 */
export async function updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
  const result = await query(
    `UPDATE users
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL`,
    [passwordHash, id]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Soft delete user
 */
export async function deleteUser(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE users
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Count users by role
 */
export async function countUsersByRole(): Promise<Record<UserRole, number>> {
  const result = await query<{ role: UserRole; count: string }>(
    `SELECT role, COUNT(*) as count
     FROM users
     WHERE deleted_at IS NULL
     GROUP BY role`,
    []
  );

  const counts: Record<UserRole, number> = {
    owner: 0,
    admin: 0,
    driver: 0,
    customer: 0
  };

  for (const row of result.rows) {
    counts[row.role] = parseInt(row.count, 10);
  }

  return counts;
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<UserStats> {
  const [totalResult, byRole, activeResult, verifiedResult] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL', []),
    countUsersByRole(),
    query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE is_active = true AND deleted_at IS NULL',
      []
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE email_verified = true AND deleted_at IS NULL',
      []
    )
  ]);

  return {
    total_users: parseInt(totalResult.rows[0].count, 10),
    by_role: byRole,
    active_users: parseInt(activeResult.rows[0].count, 10),
    verified_emails: parseInt(verifiedResult.rows[0].count, 10)
  };
}
