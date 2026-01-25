'use client';

/**
 * Admin Layout
 * Layout with sidebar for admin panel
 */

import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/layout/admin-header';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

export default function AdminLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        {isDesktop ? (
          <AdminSidebar />
        ) : (
          /* Mobile Sidebar (Sheet) */
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="fixed left-4 top-20 z-40 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Abrir menú de administración</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <AdminSidebar />
            </SheetContent>
          </Sheet>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
