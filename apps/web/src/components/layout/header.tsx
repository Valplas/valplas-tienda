'use client';

/**
 * Header Component
 * Main header for public pages with search, cart, and user menu
 */

import Link from 'next/link';
import { ShoppingCart, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from './search-bar';
import { UserMenu } from './user-menu';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';
import { useState } from 'react';
import { MobileNav } from './mobile-nav';

export function Header() {
  const itemCount = useCartStore((state) => state.itemCount);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-primary">Valplas</span>
            </Link>

            {/* Desktop Search Bar */}
            <div className="hidden flex-1 md:block md:max-w-md lg:max-w-lg">
              <SearchBar />
            </div>

            {/* Right side: Cart + User Menu */}
            <div className="flex items-center gap-2">
              {/* Cart */}
              <Button variant="ghost" size="icon" className="relative" asChild>
                <Link href="/carrito" aria-label="Ver carrito">
                  <ShoppingCart className="h-5 w-5" />
                  {itemCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full p-0 text-xs"
                    >
                      {itemCount > 99 ? '99+' : itemCount}
                    </Badge>
                  )}
                </Link>
              </Button>

              {/* User Menu */}
              {isAuthenticated ? (
                <UserMenu />
              ) : (
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link href="/login">Ingresar</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Search Bar */}
          <div className="pb-3 md:hidden">
            <SearchBar />
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </>
  );
}
