'use client';

/**
 * Admin Layout
 * Layout with sidebar for admin panel
 */

import * as React from 'react';
import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminSidebar, AdminSidebarMobile } from '@/components/admin/admin-sidebar';

export default function AdminLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
