/**
 * Auth Store - Zustand
 * Manages authentication state and user session
 */

import { create } from 'zustand';
import { User, LoginCredentials, RegisterData, AuthSession } from '@/types';
import { ApiResponse } from '@/lib/api';
import {
  fake_login,
  fake_logout,
  fake_register,
  fake_getCurrentSession
} from '@/lib/mock/services';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<ApiResponse<AuthSession>>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<ApiResponse<AuthSession>>;
  setUser: (user: User | null) => void;
  initialize: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  // State
  user: null,
  isAuthenticated: false,
  isLoading: true,

  // Actions
  login: async (credentials) => {
    set({ isLoading: true });

    try {
      const response = await fake_login(credentials);

      if (response.success && response.data) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }

      return response;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });

    try {
      await fake_logout();
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
      const response = await fake_register(data);

      if (response.success && response.data) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }

      return response;
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
      const response = await fake_getCurrentSession();

      if (response.success && response.data) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false
        });
      }
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  }
}));
