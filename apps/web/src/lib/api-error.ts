import { ApiError } from '@/lib/api';

/** Texto para toasts: si el API manda detalles de validación se muestran; si no, el mensaje. */
export function apiErrorDescription(error: unknown, fallback = 'Intentá nuevamente'): string {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    const messages = error.details
      .map((d) => (d && typeof d === 'object' && 'message' in d ? String(d.message) : ''))
      .filter(Boolean);
    if (messages.length > 0) return messages.join('. ');
  }
  return error instanceof Error ? error.message : fallback;
}
