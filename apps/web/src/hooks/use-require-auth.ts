/**
 * useRequireAuth Hook
 * Verifica autenticación del lado del cliente y redirige si no está autenticado
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface UseRequireAuthOptions {
  redirectTo?: string;
  requireRole?: 'owner' | 'admin' | 'driver' | 'customer';
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { redirectTo = '/login', requireRole } = options;
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    // Esperar a que termine de cargar
    if (isLoading) return;

    // Si no está autenticado, redirigir a login
    if (!isAuthenticated) {
      const currentPath = window.location.pathname;
      router.push(`${redirectTo}?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Si requiere un rol específico, verificar
    if (requireRole && user?.role !== requireRole) {
      // Si no tiene el rol requerido, redirigir a cuenta
      router.push('/cuenta');
    }
  }, [isAuthenticated, isLoading, user, requireRole, redirectTo, router]);

  return {
    isAuthenticated,
    isLoading,
    user
  };
}
