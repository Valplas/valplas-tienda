import { query } from '../../infrastructure/database/client.js';
import type { User } from '@valplas/shared/types';
import type { RegisterData } from './auth.types.js';

// Columnas públicas del usuario. NUNCA incluir password_hash aquí: cualquier consumidor del
// repositorio recibiría el hash. Para autenticación usar USER_COLUMNS_WITH_PASSWORD y los
// métodos *ForAuth. Ver NC-06 (auditoría ISO 27001) y la regla "Never Expose passwordHash".
const USER_COLUMNS = `
  id, email, username, phone,
  first_name AS "firstName", last_name AS "lastName",
  role, is_active AS "isActive",
  email_verified AS "emailVerified", phone_verified AS "phoneVerified",
  google_id AS "googleId",
  last_login_at AS "lastLoginAt", created_at AS "createdAt", updated_at AS "updatedAt"
`;

// Solo para el dominio de autenticación (login). Incluye password_hash.
const USER_COLUMNS_WITH_PASSWORD = `${USER_COLUMNS}, password_hash`;

/**
 * Buscar usuario por email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT ${USER_COLUMNS} FROM users
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
    `SELECT ${USER_COLUMNS} FROM users
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
    `SELECT ${USER_COLUMNS} FROM users
     WHERE (email = $1 OR username = $1)
       AND deleted_at IS NULL
     LIMIT 1`,
    [emailOrUsername]
  );

  return result.rows[0] || null;
}

/**
 * Buscar usuario por email O username INCLUYENDO password_hash.
 * Uso EXCLUSIVO del dominio de autenticación (login). Ningún otro módulo debe llamarlo.
 * Ver NC-06.
 */
export async function findUserByEmailOrUsernameForAuth(
  emailOrUsername: string
): Promise<(User & { password_hash: string }) | null> {
  const result = await query<User & { password_hash: string }>(
    `SELECT ${USER_COLUMNS_WITH_PASSWORD} FROM users
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
    `SELECT ${USER_COLUMNS} FROM users
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
    `SELECT ${USER_COLUMNS} FROM users
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
    RETURNING ${USER_COLUMNS}`,
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

/**
 * Buscar usuario por Google ID
 */
export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE google_id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [googleId]
  );
  return result.rows[0] ?? null;
}

/**
 * Vincular Google ID a usuario existente
 */
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await query('UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2', [
    googleId,
    userId
  ]);
}

/**
 * Crear usuario via Google OAuth (sin password ni username)
 */
export async function createOAuthUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  googleId: string;
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, first_name, last_name, google_id, role, is_active)
     VALUES ($1, $2, $3, $4, 'customer', true)
     RETURNING ${USER_COLUMNS}`,
    [data.email, data.firstName, data.lastName, data.googleId]
  );
  return result.rows[0];
}
