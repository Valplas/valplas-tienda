// apps/web/src/lib/services/auth.service.ts

import { post, get } from '../api';

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface LoginData {
  emailOrUsername: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  role: 'owner' | 'admin' | 'driver' | 'customer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  // accessToken ya no viene en el body — es cookie HttpOnly
}

/**
 * Registrar nuevo usuario
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/auth/register', data);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al registrar usuario');
}

/**
 * Login de usuario
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/auth/login', data);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al iniciar sesión');
}

/**
 * Logout de usuario
 */
export async function logout(): Promise<void> {
  await post('/auth/logout');
  // el backend clearCookie — no hay nada que limpiar acá
}

/**
 * Obtener usuario actual
 */
export async function getCurrentUser(): Promise<User> {
  // Silenciar errores porque el 401 es esperado cuando no hay sesión
  const response = await get<User>('/auth/me', { silentErrors: true });

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'No autenticado');
}
