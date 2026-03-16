'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Auth Provider - Inicializa sesión al cargar la app y re-verifica al volver a la tab.
 * Esto garantiza que sesiones expiradas se detecten aunque el usuario no haya
 * hecho ninguna llamada a la API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        initialize();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [initialize]);

  return <>{children}</>;
}
