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
  // El estado de auth vive en el store del cliente (useAuthStore).
  return <CheckoutPage savedAddresses={[]} />;
}
