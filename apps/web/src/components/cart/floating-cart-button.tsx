/**
 * Floating Cart Button Component
 * FAB (Floating Action Button) with cart badge
 * Hidden on /carrito and /checkout pages
 */

'use client';

import { ShoppingCart } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCartStore } from '@/stores/cart-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function FloatingCartButton() {
  const pathname = usePathname();
  const { itemCount, toggleCart } = useCartStore();

  // Hide on cart and checkout pages
  const shouldHide = pathname === '/carrito' || pathname === '/checkout';

  if (shouldHide || itemCount === 0) {
    return null;
  }

  return (
    <Button
      size="icon"
      onClick={toggleCart}
      className={cn(
        'fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg',
        'hover:scale-110 transition-transform'
      )}
      aria-label="Abrir carrito"
    >
      <div className="relative">
        <ShoppingCart className="h-6 w-6" />
        {itemCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-bold"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </Badge>
        )}
      </div>
    </Button>
  );
}
