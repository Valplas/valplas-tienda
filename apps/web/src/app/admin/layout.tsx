'use client';

/**
 * Admin Layout
 * Layout with sidebar for admin panel
 */

import * as React from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminSidebar, AdminSidebarMobile } from '@/components/admin/admin-sidebar';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';

export default function AdminLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  // Guard central del área admin: mientras se resuelve la sesión no se muestra el
  // chrome (evita ver el panel a medias con una sesión muerta); useRequireAuth
  // redirige a /login si no hay sesión, o a / si el rol no tiene permisos.
  const { user, isLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <AdminSidebar />

      {/* Mobile Sidebar */}
      <AdminSidebarMobile open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col">
        <AdminHeader onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
