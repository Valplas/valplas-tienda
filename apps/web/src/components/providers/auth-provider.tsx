'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Auth Provider - Inicializa sesión al cargar la app
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    // Inicializar sesión desde localStorage/cookies al montar
    initialize();
  }, [initialize]);

  return <>{children}</>;
}
