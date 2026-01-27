/**
 * Toast Notification Types
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // ms, undefined = no auto-dismiss
  createdAt: number;
}

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
}
