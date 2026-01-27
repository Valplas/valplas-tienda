'use client';

/**
 * Account Layout
 * Layout with sidebar for customer account area
 */

import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { AccountSidebar } from '@/components/layout/account-sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

export default function AccountLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        {isDesktop ? (
          <AccountSidebar />
        ) : (
          /* Mobile Sidebar (Sheet) */
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="fixed left-4 top-20 z-40 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Abrir menú</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <AccountSidebar />
            </SheetContent>
          </Sheet>
        )}

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
