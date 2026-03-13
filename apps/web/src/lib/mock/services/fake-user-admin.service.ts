/**
 * Mock User Admin Service
 * Handles user management for owner role
 */

import { ApiResponse } from '@/lib/api';
import { User, UserRole } from '@/types';
import { MOCK_USERS } from '../data';
import { CreateUserFormData, UpdateUserFormData } from '@/lib/validations/user-admin';

const STORAGE_KEY = 'valplas_mock_users';

// ============================================================================
// HELPERS
// ============================================================================

function getUsersFromStorage(): User[] {
  if (typeof window === 'undefined') return MOCK_USERS;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : MOCK_USERS;
}

function saveUsersToStorage(users: User[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

// ============================================================================
// USER CRUD
// ============================================================================

export interface UserFilters {
  role?: UserRole;
  search?: string;
}

export async function fake_getUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    let users = getUsersFromStorage();

    // Filter by role
    if (filters?.role) {
      users = users.filter((u) => u.role === filters.role);
    }

    // Filter by search (name, email, phone)
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.first_name.toLowerCase().includes(search) ||
          u.last_name.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.phone.toLowerCase().includes(search) ||
          u.username.toLowerCase().includes(search)
      );
    }

    return {
      success: true,
      data: users
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Error al cargar usuarios'
      }
    };
  }
}

export async function fake_getUserById(id: string): Promise<ApiResponse<User>> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const users = getUsersFromStorage();
    const user = users.find((u) => u.id === id);

    if (!user) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      };
    }

    return {
      success: true,
      data: user
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Error al cargar usuario'
      }
    };
  }
}

export async function fake_createUser(data: CreateUserFormData): Promise<ApiResponse<User>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const users = getUsersFromStorage();

    // Check email uniqueness
    if (users.some((u) => u.email === data.email)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'El email ya está en uso'
        }
      };
    }

    // Check username uniqueness if provided
    if (data.username && users.some((u) => u.username === data.username)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_USERNAME',
          message: 'El nombre de usuario ya está en uso'
        }
      };
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      email: data.email ?? '',
      username: data.username || '',
      phone: data.phone || '',
      first_name: data.first_name,
      last_name: data.last_name ?? '',
      role: data.role,
      is_active: data.is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    users.push(newUser);
    saveUsersToStorage(users);

    // In real backend, password would be hashed
    // For MVP mock, we just acknowledge it

    return {
      success: true,
      data: newUser
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Error al crear usuario'
      }
    };
  }
}

export async function fake_updateUser(
  id: string,
  data: UpdateUserFormData
): Promise<ApiResponse<User>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const users = getUsersFromStorage();
    const index = users.findIndex((u) => u.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      };
    }

    // Check email uniqueness (exclude current user)
    if (users.some((u) => u.email === data.email && u.id !== id)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'El email ya está en uso'
        }
      };
    }

    // Check username uniqueness if provided (exclude current user)
    if (data.username && users.some((u) => u.username === data.username && u.id !== id)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_USERNAME',
          message: 'El nombre de usuario ya está en uso'
        }
      };
    }

    users[index] = {
      ...users[index],
      email: data.email ?? '',
      username: data.username || '',
      phone: data.phone || '',
      first_name: data.first_name,
      last_name: data.last_name ?? '',
      role: data.role,
      is_active: data.is_active,
      updated_at: new Date().toISOString()
    };

    saveUsersToStorage(users);

    // In real backend, password would be updated if provided
    // For MVP mock, we just acknowledge it

    return {
      success: true,
      data: users[index]
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Error al actualizar usuario'
      }
    };
  }
}

export async function fake_deleteUser(
  id: string,
  currentUserId: string
): Promise<ApiResponse<void>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // Prevent self-delete
    if (id === currentUserId) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'No podés eliminar tu propia cuenta'
        }
      };
    }

    const users = getUsersFromStorage();
    const filtered = users.filter((u) => u.id !== id);
    saveUsersToStorage(filtered);

    return {
      success: true,
      data: undefined
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Error al eliminar usuario'
      }
    };
  }
}
