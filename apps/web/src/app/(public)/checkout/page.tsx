/**
 * Checkout Page
 * /checkout
 */

import { Metadata } from 'next';
import { CheckoutPage } from '@/components/checkout/checkout-page';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Finalizá tu compra de forma rápida y segura'
};

export default function CheckoutPageRoute() {
  // Auth y direcciones se resuelven en el cliente (useAuthStore + API).
  return <CheckoutPage />;
}
