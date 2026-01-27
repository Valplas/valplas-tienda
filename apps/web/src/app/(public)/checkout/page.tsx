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
  // TODO: Get auth state from session/cookies
  // For MVP, we'll pass mock data
  const isAuthenticated = false; // Will be replaced with actual auth check
  const userId = undefined;
  const savedAddresses: never[] = [];

  return (
    <CheckoutPage
      isAuthenticated={isAuthenticated}
      userId={userId}
      savedAddresses={savedAddresses}
    />
  );
}
