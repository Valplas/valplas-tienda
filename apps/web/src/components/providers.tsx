/**
 * Providers Component
 * Wraps the app with necessary providers and global components
 */

'use client';

import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { CartDrawer } from './cart/cart-drawer';
import { FloatingCartButton } from './cart/floating-cart-button';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const { loadFromStorage } = useCartStore();
  const { initialize } = useAuthStore();

  // Load cart and initialize auth on mount
  useEffect(() => {
    loadFromStorage();
    initialize();
  }, [loadFromStorage, initialize]);

  return (
    <>
      {children}
      <CartDrawer />
      <FloatingCartButton />
      <Toaster position="top-center" richColors />
    </>
  );
}
