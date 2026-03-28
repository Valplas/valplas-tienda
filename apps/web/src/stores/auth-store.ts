/**
 * Auth Store - Zustand
 * Manages authentication state and user session
 */

import { create } from 'zustand';
import { User, LoginCredentials, RegisterData, UserRole } from '@/types';
import { login, logout, register, getCurrentUser } from '@/services';
import type { User as ServiceUser } from '@/services';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  setUser: (user: User | null) => void;
  initialize: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

/**
 * Convierte el User del servicio al User del frontend
 */
function mapServiceUserToFrontendUser(serviceUser: ServiceUser): User {
  // Map role string to UserRole enum
  const roleMap: Record<string, UserRole> = {
    owner: UserRole.OWNER,
    admin: UserRole.ADMIN,
    driver: UserRole.DRIVER,
    customer: UserRole.CUSTOMER
  };

  return {
    id: serviceUser.id,
    email: serviceUser.email,
    username: serviceUser.username || '',
    phone: serviceUser.phone || '',
    firstName: serviceUser.firstName,
    lastName: serviceUser.lastName,
    role: roleMap[serviceUser.role] || UserRole.CUSTOMER,
    isActive: serviceUser.isActive,
    createdAt: serviceUser.createdAt,
    updatedAt: serviceUser.updatedAt
  };
}

export const useAuthStore = create<AuthStore>((set) => ({
  // State
  user: null,
  isAuthenticated: false,
  isLoading: true,

  // Actions
  login: async (credentials) => {
    set({ isLoading: true });

    try {
      // Adaptar LoginCredentials a LoginData
      const authResponse = await login({
        emailOrUsername: credentials.identifier,
        password: credentials.password
      });

      const user = mapServiceUserToFrontendUser(authResponse.user);

      set({
        user,
        isAuthenticated: true,
        isLoading: false
      });

      // Retornar la sesión con el usuario para que el caller pueda acceder al rol
      return { user };
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });

    try {
      await logout();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true });

    try {
      // Adaptar RegisterData del frontend al servicio
      const authResponse = await register({
        email: data.email,
        username: data.username,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone
      });

      const user = mapServiceUserToFrontendUser(authResponse.user);

      set({
        user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false
    });
  },

  initialize: async () => {
    set({ isLoading: true });

    try {
      const serviceUser = await getCurrentUser();
      const user = mapServiceUserToFrontendUser(serviceUser);

      set({
        user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  }
}));
