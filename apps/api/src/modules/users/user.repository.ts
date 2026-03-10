// apps/api/src/modules/users/user.repository.ts

import { query } from '../../infrastructure/database/client.js';
import type {
  User,
  UserWithStats,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserRole,
  UserStats
} from './user.types.js';

/**
 * Find users with filters and pagination
 */
export async function findUsers(filters: UserFilters): Promise<{ users: User[]; total: number }> {
  const { role, is_active, email_verified, search, page = 1, limit = 20 } = filters;

  const offset = (page - 1) * limit;
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

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get users
  const usersResult = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    users: usersResult.rows,
    total
  };
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
      (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND deleted_at IS NULL) as total_orders,
      (SELECT COUNT(*) FROM user_addresses WHERE user_id = u.id AND deleted_at IS NULL) as total_addresses,
      (SELECT MAX(created_at) FROM orders WHERE user_id = u.id AND deleted_at IS NULL) as last_order_date
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result.rows[0] || null) as any;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );

  return result.rows[0] || null;
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
 */
export async function createUser(data: CreateUserInput, passwordHash: string): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (
      email, username, password_hash, phone, first_name, last_name, role, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, email, username, phone, first_name, last_name, role,
              is_active, email_verified, phone_verified, created_at, updated_at, deleted_at`,
    [
      data.email,
      data.username,
      passwordHash,
      data.phone || null,
      data.first_name,
      data.last_name,
      data.role,
      data.is_active ?? true
    ]
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
