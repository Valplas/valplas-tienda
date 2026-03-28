/**
 * Cart Drawer Component
 * Slide-out sheet showing cart items
 */

'use client';

import Link from 'next/link';
import { useCartStore } from '@/stores/cart-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CartItem } from './cart-item';
import { CartSummary } from './cart-summary';
import { EmptyCart } from './empty-cart';

export function CartDrawer() {
  const { isOpen, toggleCart, items, itemCount, subtotal } = useCartStore();

  return (
    <Sheet open={isOpen} onOpenChange={toggleCart}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Carrito {itemCount > 0 && `(${itemCount})`}</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyCart />
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <ScrollArea className="flex-1 px-6">
              <div className="py-4">
                {items.map((item) => (
                  <CartItem key={item.productId} item={item} />
                ))}
              </div>
            </ScrollArea>

            {/* Footer with Summary and Actions */}
            <SheetFooter className="px-6 py-4 border-t flex-col gap-4">
              <CartSummary subtotal={subtotal} />

              <div className="flex flex-col gap-2 w-full">
                <Button asChild size="lg" className="w-full">
                  <Link href="/checkout" onClick={() => toggleCart()}>
                    Ir al checkout
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link href="/carrito" onClick={() => toggleCart()}>
                    Ver carrito completo
                  </Link>
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
