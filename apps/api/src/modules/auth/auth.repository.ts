import { query } from '../../infrastructure/database/client.js';
import type { User } from '@valplas/shared/types';
import type { RegisterData } from './auth.types.js';

/**
 * Buscar usuario por email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE email = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Buscar usuario por username
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE username = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [username]
  );

  return result.rows[0] || null;
}

/**
 * Buscar usuario por email O username
 */
export async function findUserByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE (email = $1 OR username = $1)
       AND deleted_at IS NULL
     LIMIT 1`,
    [emailOrUsername]
  );

  return result.rows[0] || null;
}

/**
 * Buscar usuario por ID
 */
export async function findUserById(id: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Buscar usuario por teléfono
 */
export async function findUserByPhone(phone: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE phone = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [phone]
  );

  return result.rows[0] || null;
}

/**
 * Crear nuevo usuario
 */
export async function createUser(data: RegisterData & { passwordHash: string }): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (
      email,
      username,
      phone,
      password_hash,
      first_name,
      last_name,
      role,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.email,
      data.username,
      data.phone || null,
      data.passwordHash,
      data.firstName,
      data.lastName,
      'customer', // Rol por defecto
      true // Activo por defecto
    ]
  );

  return result.rows[0];
}

/**
 * Actualizar último login
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await query(
    `UPDATE users
     SET last_login_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}
