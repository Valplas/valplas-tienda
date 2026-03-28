/**
 * Cart Page Component
 * Full cart view for /carrito page
 */

'use client';

import Link from 'next/link';
import { useCartStore } from '@/stores/cart-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CartItem } from './cart-item';
import { CartSummary } from './cart-summary';
import { EmptyCart } from './empty-cart';
import { ArrowLeft } from 'lucide-react';

export function CartPage() {
  const { items, itemCount, subtotal, clearCart } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="container max-w-4xl py-8">
        <EmptyCart />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      {/* Back button */}
      <Button asChild variant="ghost" className="mb-4">
        <Link href="/productos">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Seguir comprando
        </Link>
      </Button>

      <h1 className="text-2xl font-bold mb-6">
        Carrito de compras {itemCount > 0 && `(${itemCount} productos)`}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Productos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y px-6">
                {items.map((item) => (
                  <CartItem key={item.productId} item={item} />
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('¿Estás seguro que querés vaciar el carrito?')) {
                    clearCart();
                  }
                }}
              >
                Vaciar carrito
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <CartSummary subtotal={subtotal} />
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button asChild size="lg" className="w-full">
                <Link href="/checkout">Continuar con la compra</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href="/productos">Seguir comprando</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
