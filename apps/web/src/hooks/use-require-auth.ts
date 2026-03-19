'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { UserRole } from '@/types';

interface UseRequireAuthOptions {
  redirectTo?: string;
  allowedRoles?: UserRole[];
}

/**
 * Verifica que el usuario esté autenticado y tenga el rol correcto.
 * Redirige si no cumple. Usar en páginas protegidas.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { redirectTo = '/', allowedRoles } = options;
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return; // Esperar hidratación

    if (!isAuthenticated) {
      router.replace(`${redirectTo}?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.replace('/'); // Sin permisos → home
    }
  }, [isAuthenticated, isLoading, user, router, redirectTo, allowedRoles, pathname]);

  return { user, isAuthenticated, isLoading };
}
