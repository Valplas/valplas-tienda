/**
 * Fake Auth Service - Autenticación mock
 * Simula autenticación con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { User, LoginCredentials, RegisterData, AuthSession, UserRole } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit, setItem, getItem, removeItem } from '../utils/local-storage';
import { setCookie, deleteCookie } from '../utils/cookie';
import { MOCK_USERS, MOCK_CREDENTIALS } from '../data';

const STORAGE_KEY_USERS = 'users';
const STORAGE_KEY_SESSION = 'session';
const COOKIE_SESSION_NAME = 'mock_session';

/**
 * Inicializa usuarios en localStorage si no existen
 */
function initUsers(): User[] {
  return getOrInit(STORAGE_KEY_USERS, MOCK_USERS);
}

/**
 * Genera un token fake (en producción sería JWT real)
 */
function generateToken(user: User): string {
  return `fake_token_${user.id}_${Date.now()}`;
}

/**
 * Login - Verifica credenciales y genera sesión
 */
export async function fake_login(credentials: LoginCredentials): Promise<ApiResponse<AuthSession>> {
  return fakeFetch(() => {
    const users = initUsers();
    const { identifier, password } = credentials;

    // Buscar usuario por email o username
    const user = users.find(
      (u) =>
        (u.email === identifier || u.username === identifier) &&
        u.isActive &&
        MOCK_CREDENTIALS[identifier] === password
    );

    if (!user) {
      return {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email/usuario o contraseña incorrectos'
        }
      };
    }

    // Generar sesión
    const session: AuthSession = {
      user,
      accessToken: generateToken(user),
      refreshToken: `refresh_${generateToken(user)}`
    };

    // Guardar sesión en localStorage
    setItem(STORAGE_KEY_SESSION, session);

    // También guardar en cookie para que middleware SSR pueda leer
    setCookie(COOKIE_SESSION_NAME, JSON.stringify(session), 7);

    return {
      success: true,
      data: session
    };
  });
}

/**
 * Register - Crea nuevo usuario
 */
export async function fake_register(data: RegisterData): Promise<ApiResponse<AuthSession>> {
  return fakeFetch(() => {
    const users = initUsers();

    // Verificar email duplicado
    if (users.some((u) => u.email === data.email)) {
      return {
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'El email ya está registrado'
        }
      };
    }

    // Verificar username duplicado
    if (users.some((u) => u.username === data.username)) {
      return {
        success: false,
        error: {
          code: 'USERNAME_EXISTS',
          message: 'El nombre de usuario ya está en uso'
        }
      };
    }

    // Crear nuevo usuario
    const newUser: User = {
      id: `user-${Date.now()}`,
      email: data.email,
      username: data.username,
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.CUSTOMER,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Guardar usuario
    users.push(newUser);
    setItem(STORAGE_KEY_USERS, users);

    // Guardar credential (en producción sería hash)
    MOCK_CREDENTIALS[data.email] = data.password;
    MOCK_CREDENTIALS[data.username] = data.password;

    // Generar sesión
    const session: AuthSession = {
      user: newUser,
      accessToken: generateToken(newUser),
      refreshToken: `refresh_${generateToken(newUser)}`
    };

    setItem(STORAGE_KEY_SESSION, session);

    // También guardar en cookie para que middleware SSR pueda leer
    setCookie(COOKIE_SESSION_NAME, JSON.stringify(session), 7);

    return {
      success: true,
      data: session
    };
  });
}

/**
 * Logout - Elimina sesión
 */
export async function fake_logout(): Promise<ApiResponse<void>> {
  return fakeFetch(() => {
    removeItem(STORAGE_KEY_SESSION);
    deleteCookie(COOKIE_SESSION_NAME);
    return {
      success: true
    };
  });
}

/**
 * Get current session
 */
export async function fake_getCurrentSession(): Promise<ApiResponse<AuthSession>> {
  return fakeFetch(() => {
    const session = getItem<AuthSession>(STORAGE_KEY_SESSION);

    if (!session) {
      return {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No hay sesión activa'
        }
      };
    }

    return {
      success: true,
      data: session
    };
  });
}

/**
 * Refresh token (simulado)
 */
export async function fake_refreshToken(): Promise<ApiResponse<AuthSession>> {
  return fakeFetch(() => {
    const session = getItem<AuthSession>(STORAGE_KEY_SESSION);

    if (!session) {
      return {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No hay sesión activa'
        }
      };
    }

    // Generar nuevos tokens
    const newSession: AuthSession = {
      ...session,
      accessToken: generateToken(session.user),
      refreshToken: `refresh_${generateToken(session.user)}`
    };

    setItem(STORAGE_KEY_SESSION, newSession);

    // También actualizar cookie
    setCookie(COOKIE_SESSION_NAME, JSON.stringify(newSession), 7);

    return {
      success: true,
      data: newSession
    };
  });
}
