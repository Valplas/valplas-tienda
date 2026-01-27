/**
 * Toast Store - Zustand
 * Manages toast notifications
 */

import { create } from 'zustand';
import { ToastMessage, ToastOptions, ToastType } from '@/types/toast.types';

interface ToastState {
  toasts: ToastMessage[];
}

interface ToastActions {
  show: (message: string, options?: ToastOptions) => string;
  hide: (id: string) => void;
  hideAll: () => void;
}

type ToastStore = ToastState & ToastActions;

let toastIdCounter = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  // State
  toasts: [],

  // Actions
  show: (message, options = {}) => {
    const id = `toast-${++toastIdCounter}`;
    const type: ToastType = options.type || 'info';
    const duration = options.duration !== undefined ? options.duration : 5000;

    const toast: ToastMessage = {
      id,
      message,
      type,
      duration,
      createdAt: Date.now()
    };

    set((state) => ({
      toasts: [...state.toasts, toast]
    }));

    // Auto-dismiss if duration is set
    if (duration && duration > 0) {
      setTimeout(() => {
        get().hide(id);
      }, duration);
    }

    return id;
  },

  hide: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },

  hideAll: () => {
    set({ toasts: [] });
  }
}));

/**
 * Convenience helpers
 */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().show(message, { type: 'success', duration }),

  error: (message: string, duration?: number) =>
    useToastStore.getState().show(message, { type: 'error', duration }),

  warning: (message: string, duration?: number) =>
    useToastStore.getState().show(message, { type: 'warning', duration }),

  info: (message: string, duration?: number) =>
    useToastStore.getState().show(message, { type: 'info', duration })
};
