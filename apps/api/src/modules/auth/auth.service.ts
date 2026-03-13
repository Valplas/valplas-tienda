import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../env.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import * as authRepository from './auth.repository.js';
import type {
  RegisterData,
  LoginData,
  AuthResponse,
  JwtPayload,
  RefreshTokenPayload
} from './auth.types.js';
const BCRYPT_ROUNDS = 12;

/**
 * Registrar nuevo usuario
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  // Verificar que email no exista
  const existingEmail = await authRepository.findUserByEmail(data.email);
  if (existingEmail) {
    throw new AppError('EMAIL_ALREADY_EXISTS', 'El email ya está registrado', 400);
  }

  // Verificar que username no exista
  const existingUsername = await authRepository.findUserByUsername(data.username);
  if (existingUsername) {
    throw new AppError('USERNAME_ALREADY_EXISTS', 'El username ya está en uso', 400);
  }

  // Si hay teléfono, verificar que no exista
  if (data.phone) {
    const existingPhone = await authRepository.findUserByPhone(data.phone);
    if (existingPhone) {
      throw new AppError('PHONE_ALREADY_EXISTS', 'El teléfono ya está registrado', 400);
    }
  }

  // Hash de la contraseña
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  // Crear usuario
  const user = await authRepository.createUser({
    ...data,
    passwordHash
  });

  // Generar tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id);

  // Remover password_hash del usuario (la DB retorna password_hash en snake_case)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { password_hash: _, ...userWithoutPassword } = user as any;

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: userWithoutPassword as any,
    accessToken,
    refreshToken
  };
}

/**
 * Login de usuario
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  // Buscar usuario por email o username
  const user = await authRepository.findUserByEmailOrUsername(data.emailOrUsername);

  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
  }

  // Verificar que el usuario esté activo
  if (!user.is_active) {
    throw new AppError('USER_INACTIVE', 'Usuario inactivo. Contacta a soporte.', 403);
  }

  // Comparar contraseña (la DB retorna password_hash en snake_case)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userWithPassword = user as any;
  const isPasswordValid = await bcrypt.compare(data.password, userWithPassword.password_hash);

  if (!isPasswordValid) {
    throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
  }

  // Actualizar último login
  await authRepository.updateLastLogin(user.id);

  // Generar tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id);

  // Remover password_hash del usuario
  const { password_hash: _, ...userWithoutPassword } = userWithPassword;

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: userWithoutPassword as any,
    accessToken,
    refreshToken
  };
}

/**
 * Obtener usuario actual por ID
 */
export async function getCurrentUser(userId: string) {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado', 404);
  }

  // Remover password_hash
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { password_hash: _, ...userWithoutPassword } = user as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return userWithoutPassword as any;
}

/**
 * Renovar access token usando refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  try {
    // Verificar refresh token
    const payload = jwt.verify(refreshToken, env.JWT_SECRET) as RefreshTokenPayload;

    // Buscar usuario
    const user = await authRepository.findUserById(payload.userId);

    if (!user || !user.is_active) {
      throw new AppError('INVALID_TOKEN', 'Token inválido', 401);
    }

    // Generar nuevo access token
    return generateAccessToken(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('INVALID_TOKEN', 'Token inválido o expirado', 401);
    }
    throw error;
  }
}

/**
 * Generar access token (JWT)
 */
function generateAccessToken(user: { id: string; email: string | null; role: string }): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    role: user.role as any
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  } as jwt.SignOptions);
}

/**
 * Generar refresh token
 */
function generateRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = {
    userId,
    sessionId: randomUUID()
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN
  } as jwt.SignOptions);
}

/**
 * Verificar y decodificar access token
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED', 'Token expirado', 401);
    }
    throw new AppError('INVALID_TOKEN', 'Token inválido', 401);
  }
}

/**
 * Hash password (utility function for admin user creation)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
