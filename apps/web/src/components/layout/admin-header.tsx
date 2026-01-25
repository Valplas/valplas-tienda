'use client';

/**
 * AdminHeader Component
 * Header for admin panel
 */

import Link from 'next/link';
import { Home, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserMenu } from './user-menu';

export function AdminHeader() {
  // TODO: Replace with actual notification count from store/API
  const notificationCount = 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Left: Logo/Home link */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-primary">Valplas</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Ir a la tienda
            </Link>
          </Button>
        </div>

        {/* Right: Notifications + User Menu */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full p-0 text-xs"
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </Badge>
            )}
            <span className="sr-only">Notificaciones</span>
          </Button>

          {/* User Menu */}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
