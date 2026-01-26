/**
 * Empty Cart Component
 * Shown when cart has no items
 */

'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShoppingCart className="w-10 h-10 text-muted-foreground" />
      </div>

      <h3 className="text-lg font-semibold mb-2">Tu carrito está vacío</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Explorá nuestro catálogo y agregá productos para comenzar tu compra
      </p>

      <Button asChild>
        <Link href="/productos">Ver productos</Link>
      </Button>
    </div>
  );
}
