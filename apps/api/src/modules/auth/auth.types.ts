import type { User } from '@valplas/shared/types';

/**
 * Payload del JWT (access token)
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Payload del refresh token
 */
export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
}

/**
 * Datos de registro de usuario
 */
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

/**
 * Datos de login
 */
export interface LoginData {
  emailOrUsername: string;
  password: string;
}

/**
 * Respuesta de autenticación exitosa
 */
export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
  refreshToken: string;
}

/**
 * Usuario extendido en Request (después de autenticación)
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

// Extender el tipo Request de Express
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
