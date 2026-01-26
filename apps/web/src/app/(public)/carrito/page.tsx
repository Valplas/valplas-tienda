/**
 * Cart Page
 * /carrito
 */

import { Metadata } from 'next';
import { CartPage } from '@/components/cart/cart-page';

export const metadata: Metadata = {
  title: 'Carrito de compras',
  description: 'Revisa los productos en tu carrito antes de finalizar la compra'
};

export default function CarritoPage() {
  return <CartPage />;
}
