/**
 * Account Layout
 * Layout para páginas protegidas de cuenta de usuario
 */

'use client';

import React from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { Loader2 } from 'lucide-react';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useRequireAuth();

  // Mostrar loader mientras verifica autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Si llegó aquí, está autenticado
  return <>{children}</>;
}
