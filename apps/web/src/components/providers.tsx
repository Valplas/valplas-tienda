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

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const { loadFromStorage } = useCartStore();

  // Load cart from localStorage on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <>
      {children}
      <CartDrawer />
      <FloatingCartButton />
      <Toaster position="top-center" richColors />
    </>
  );
}
